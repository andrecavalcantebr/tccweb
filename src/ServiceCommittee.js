/**
 * FILE: ServiceCommittee.js
 * DESC: Command pattern implementation for the Committee (Banca) entity.
 *       Phase 3 of the flow: the Advisor assembles and submits the committee,
 *       the Incharge homologates it. The lifecycle status itself lives in
 *       Proposals.Status (single TccStatus) — see ServiceTccState.js.
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

class CommitteeService {
  constructor(semesterId) {
    if (!semesterId) throw new Error("Semester ID is required for CommitteeService");
    this.semesterId = semesterId;
  }

  _getDao() {
    return getSheetManager_(this.semesterId, DB_SHEETS.COMMITTEES, DB_COLS_COMMITTEE.COMMITTEE_ID);
  }

  _getLog() {
    return new EventLogService(this.semesterId);
  }

  _getProposalDao() {
    return getSheetManager_(this.semesterId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID);
  }

  /**
   * Loads the proposal record (the owner of the lifecycle status) and its
   * current state, asserting the caller may act on it.
   */
  _loadProposal(proposalId, userRole, email) {
    const record = this._getProposalDao().getById(proposalId);
    if (!record) throw new Error("Proposta não encontrada.");

    if (userRole === UserRole.ADVISOR &&
        _normalizeEmail_(record[DB_COLS_PROPOSAL.ADVISOR_EMAIL]) !== _normalizeEmail_(email)) {
      throw new Error("Apenas o orientador designado nesta proposta pode executar esta ação.");
    }
    if (userRole === UserRole.STUDENT) {
      throw new Error("O Aluno não participa da formação da banca.");
    }

    return {
      data: record,
      state: TccStateFactory.create(record[DB_COLS_PROPOSAL.STATUS])
    };
  }

  /** Committee record of a proposal, or null if not assembled yet */
  getByProposal(proposalId) {
    return this._getDao().getAll().find(
      row => row[DB_COLS_COMMITTEE.PROPOSAL_ID] === proposalId
    ) || null;
  }

  /**
   * Validates the committee payload sent by the Advisor against specs.md:
   * 3 to 5 members, exactly one president, and the president must be the
   * advisor assigned to the proposal.
   * Returns the sanitized member list (unknown fields are dropped).
   */
  _validateMembers(members, advisorEmail) {
    if (!Array.isArray(members)) throw new Error("Lista de membros inválida.");
    if (members.length < COMMITTEE_MIN_MEMBERS || members.length > COMMITTEE_MAX_MEMBERS) {
      throw new Error(`A banca deve ter de ${COMMITTEE_MIN_MEMBERS} a ${COMMITTEE_MAX_MEMBERS} membros.`);
    }

    const clean = members.map((m, i) => {
      const nome = String(m.nome || '').trim();
      const email = String(m.email || '').trim();
      if (!nome) throw new Error(`Informe o nome do membro ${i + 1} da banca.`);
      if (!email) throw new Error(`Informe o e-mail do membro ${i + 1} da banca.`);
      return {
        nome: nome,
        titulo: String(m.titulo || '').trim(),
        inst: String(m.inst || '').trim(),
        // Normalized: this list is matched against Teachers to decide who may
        // sign the Ata (Fatia C), and a member typed with a capital would be
        // a person the system cannot find.
        email: _normalizeEmail_(email),
        telefone: String(m.telefone || '').trim(),
        isPresidente: !!m.isPresidente
      };
    });

    const presidents = clean.filter(m => m.isPresidente);
    if (presidents.length !== 1) {
      throw new Error("A banca deve ter exatamente um presidente (o Orientador).");
    }
    if (presidents[0].email !== _normalizeEmail_(advisorEmail)) {
      throw new Error("O presidente da banca deve ser o Orientador do aluno.");
    }

    return clean;
  }

  // ------------------------------------------
  // ACTIONS / COMMANDS
  // ------------------------------------------

  /**
   * Advisor-only action: saves the committee data and submits it to the
   * Incharge. Re-saving while still awaiting homologation just updates the
   * record (the status is already Banca Submetida) — per specs.md there is
   * no "return for adjustments" step on this sub-flow.
   */
  submitCommittee(userRole, email, proposalId, committeeData) {
    const p = this._loadProposal(proposalId, userRole, email);

    if (!p.state.canEditCommittee(userRole)) {
      throw new Error("A banca só pode ser submetida pelo Orientador, após a conclusão do TCC e antes da homologação.");
    }

    const finalTitle = String(committeeData.finalTitle || '').trim();
    if (!finalTitle) throw new Error("Informe o título final do trabalho.");

    const defenseDatetime = String(committeeData.defenseDatetime || '').trim();
    if (!defenseDatetime) throw new Error("Informe a data e a hora da defesa.");

    const mode = String(committeeData.defenseMode || '').trim();
    if (Object.values(DefenseMode).indexOf(mode) === -1) {
      throw new Error("Modo da defesa inválido.");
    }

    const members = this._validateMembers(
      committeeData.members, p.data[DB_COLS_PROPOSAL.ADVISOR_EMAIL]
    );

    const dao = this._getDao();
    const existing = this.getByProposal(proposalId);
    const record = existing || {};
    const id = existing
      ? existing[DB_COLS_COMMITTEE.COMMITTEE_ID]
      : Utilities.getUuid();

    if (!existing) {
      record[DB_COLS_COMMITTEE.COMMITTEE_ID] = id;
      record[DB_COLS_COMMITTEE.PROPOSAL_ID] = proposalId;
      record[DB_COLS_COMMITTEE.CREATED_AT] = new Date().toISOString();
    }
    record[DB_COLS_COMMITTEE.FINAL_TITLE] = finalTitle;
    // Stored as a real Date (see parseDateInput in utils.js), so the column
    // stays sortable and usable for date arithmetic on the sheet
    record[DB_COLS_COMMITTEE.DEFENSE_DATETIME] = parseDateInput(defenseDatetime);
    record[DB_COLS_COMMITTEE.DEFENSE_MODE] = mode;
    record[DB_COLS_COMMITTEE.MEMBERS_COUNT] = members.length;
    record[DB_COLS_COMMITTEE.MEMBERS_DATA] = JSON.stringify(members);
    record[DB_COLS_COMMITTEE.UPDATED_AT] = new Date().toISOString();

    dao.upsert(id, record);

    // Advance the single lifecycle status (no-op when already submitted)
    const wasSubmitted = p.data[DB_COLS_PROPOSAL.STATUS] === TccStatus.COMMITTEE_SUBMITTED;
    if (!wasSubmitted) {
      p.data[DB_COLS_PROPOSAL.STATUS] = TccStatus.COMMITTEE_SUBMITTED;
      p.data[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();
      this._getProposalDao().update(proposalId, p.data);
    }

    // Re-sending a committee that is still awaiting homologation is a
    // correction, not a submission — the log says which one happened.
    this._getLog().logTransition(
      proposalId, TccStatus.COMMITTEE_SUBMITTED, userRole, email,
      wasSubmitted
        ? 'Composição da banca corrigida pelo Orientador.'
        : 'Banca submetida para homologação do Responsável.',
      UserRole.INCHARGE
    );

    return { success: true, id: id };
  }

  /**
   * Incharge-only action: homologates a submitted committee, closing phase 3
   * and opening the Defense phase.
   */
  homologateCommittee(userRole, email, proposalId) {
    const p = this._loadProposal(proposalId, userRole, null);

    if (!p.state.canHomologateCommittee(userRole)) {
      throw new Error("Apenas o Responsável pode homologar uma banca já submetida.");
    }
    if (!this.getByProposal(proposalId)) {
      throw new Error("Banca não encontrada para esta proposta.");
    }

    p.data[DB_COLS_PROPOSAL.STATUS] = TccStatus.COMMITTEE_HOMOLOGATED;
    p.data[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();
    this._getProposalDao().update(proposalId, p.data);

    // Homologar é o momento em que a banca deixa de ser uma proposta do
    // Orientador e vira compromisso: é aqui que os membros que o sistema ainda
    // não conhece recebem convite. Sem isso a banca seria homologada com gente
    // de fora do sistema, e na Defesa eles não teriam como assinar a Ata.
    //
    // Na prática esta é a porta de entrada mais movimentada de professores no
    // sistema — mais do que o cadastro avulso pelo painel.
    const committee = this.getByProposal(proposalId);
    const members = _parseJsonArray_(committee[DB_COLS_COMMITTEE.MEMBERS_DATA]);
    const invites = new PeopleService().inviteCommitteeMembers(members);

    this._getLog().logTransition(
      proposalId, TccStatus.COMMITTEE_HOMOLOGATED, userRole, email,
      'Banca homologada pelo Responsável.' +
        (invites.invited.length
          ? ` Convite enviado a ${invites.invited.length} membro(s) ainda não cadastrado(s).`
          : ''),
      UserRole.ADVISOR
    );

    return {
      success: true,
      invited: invites.invited,
      // O que falhou volta para o painel poder dizer: um convite que não saiu
      // é um membro que não vai conseguir assinar, e isso não pode ficar só no
      // log do servidor.
      failed: invites.failed,
      msg: invites.failed.length
        ? 'Banca homologada, mas não consegui convidar: ' + invites.failed.join(', ') +
          '. Convide manualmente em "Professores".'
        : 'Banca homologada.'
    };
  }
}

// ==========================================
// EXPOSED FRONT-END ENTRY POINTS (google.script.run)
// ==========================================
function _executeCommitteeCommand_(commandName, argsObj) {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.assertActiveSession();
    if (!ctx.sheetId) throw new Error(semesterUnavailableMessage(ctx));
    if (ctx.role === UserRole.ERROR) throw new Error("Acesso não autorizado.");

    const service = new CommitteeService(ctx.sheetId);

    // The refreshed panel travels back with the result — see
    // _dashboardPayloadForRole_ in ServiceDashboard.js for why it is built here
    // and not by a second call from the client.
    const result = _runCommitteeCommand_(service, commandName, ctx, argsObj);
    if (result && result.success) {
      result.dashboard = _dashboardPayloadForRole_(ctx.role);
    }
    return result;
  } catch (err) {
    console.error(`Erro ao executar command ${commandName}`, err);
    return { success: false, msg: err.message };
  }
}

/** Dispatches a single command. Errors bubble up to _executeCommitteeCommand_. */
function _runCommitteeCommand_(service, commandName, ctx, argsObj) {
  const { proposalId, data } = argsObj;

  switch (commandName) {
    case 'SUBMIT':
      return service.submitCommittee(ctx.role, ctx.email, proposalId, data);
    case 'HOMOLOGATE':
      // Homologation is a global act of the Incharge: role check is sufficient
      return service.homologateCommittee(ctx.role, ctx.email, proposalId);
    default:
      throw new Error("Comando de banca inválido.");
  }
}

// Clientside endpoints:
function cmdSubmitCommittee(proposalId, data) { return _executeCommitteeCommand_('SUBMIT', { proposalId, data }); }
function cmdHomologateCommittee(proposalId) { return _executeCommitteeCommand_('HOMOLOGATE', { proposalId }); }
