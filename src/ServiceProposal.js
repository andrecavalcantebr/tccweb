/**
 * FILE: ServiceProposal.js
 * DESC: Command pattern implementation for the Proposal entity. The lifecycle
 *       state machine it relies on lives in ServiceTccState.js (TccStateFactory),
 *       since it is shared with the Committee phase.
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

// ==========================================
// COMMAND RECEIVER / SERVICE
// ==========================================
class ProposalService {
  constructor(semesterId, folderId) {
    if (!semesterId) throw new Error("Semester ID is required for ProposalService");
    this.semesterId = semesterId;
    this.folderId = folderId;
  }

  // Get sheet manager
  _getDao() {
    return getSheetManager_(this.semesterId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID);
  }

  /**
   * Duplicates the proposal template (Script Property PROPOSAL_TEMPLATE_DOC_ID,
   * configured at system setup) into the semester's Drive folder, replacing
   * the {{TITULO}}, {{NOME_ALUNO}} and {{MATRICULA}} placeholders. The
   * Resumo/Objetivos/Metodologia/Referências sections are edited by the
   * student directly in the resulting Doc.
   */
  _createProposalDoc(studentName, studentId, title) {
    const templateId = PropertiesService.getScriptProperties().getProperty('PROPOSAL_TEMPLATE_DOC_ID');
    if (!templateId) throw new Error("Documento modelo da proposta não configurado. Contate o Responsável.");
    if (!this.folderId) throw new Error("Pasta do período letivo não encontrada.");

    const folder = DriveApp.getFolderById(this.folderId);
    const copy = DriveApp.getFileById(templateId).makeCopy(`Proposta TCC - ${studentName}`, folder);

    try {
      const doc = DocumentApp.openById(copy.getId());
      // Accented and unaccented spellings are both accepted: the template is
      // written by hand in Portuguese, where "TÍTULO" and "MATRÍCULA" carry
      // accents, and a placeholder that does not match is simply left behind
      // in the document without any error.
      const replacements = {
        'TITULO':     title,
        'TÍTULO':     title,
        'NOME_ALUNO': studentName,
        'MATRICULA':  studentId,
        'MATRÍCULA':  studentId
      };
      // Header and footer are separate from the body — a placeholder placed
      // there (institutional letterhead, for instance) would never be reached
      // by body.replaceText alone.
      const sections = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(s => s);
      sections.forEach(section => {
        Object.keys(replacements).forEach(key => {
          section.replaceText(`{{${key}}}`, replacements[key] || '');
        });
      });

      _warnAboutLeftoverPlaceholders_(doc, sections);
      doc.saveAndClose();
    } catch(e) {
      // Discard the copy: the exception aborts saveDraft before the record is
      // written, so keeping it would leave an orphan Doc in the semester
      // folder — one more on every retry, with no proposal pointing to it.
      try {
        copy.setTrashed(true);
      } catch(cleanupErr) {
        console.error('_createProposalDoc: falha ao descartar a cópia órfã:', cleanupErr);
      }
      throw e;
    }

    return copy.getId();
  }

  /**
   * Grants the student edit access and the advisor comment access on the
   * proposal Doc (native Docs review, on top of the activity log).
   * Never blocks saveDraft — sharing failures are logged, not thrown.
   */
  _shareProposalDoc(docId, studentEmail, advisorEmail) {
    try {
      const file = DriveApp.getFileById(docId);
      // Editor do Drive pode, por padrão, compartilhar o arquivo com quem
      // quiser — inclusive com link público. O Doc é do app e o acesso a ele é
      // decidido aqui, não pelo aluno.
      file.setShareableByEditors(false);
      if (studentEmail) file.addEditor(studentEmail);
      if (advisorEmail) file.addCommenter(advisorEmail);
    } catch(e) {
      console.error('_shareProposalDoc error:', e);
    }
  }

  /**
   * Keeps the student's access to the proposal Doc in step with the panel:
   * editor while the proposal is being written, commenter once it is submitted.
   * Without this the form locks but the Doc does not, and the Advisor reviews a
   * document that can still change under them.
   *
   * Sharing failures are logged, never thrown — losing a status transition
   * because of a Drive hiccup would be far worse than a stale permission. The
   * downgrade is also a no-op when student and file owner are the same account
   * (the owner cannot be demoted), which is what happens when the whole flow is
   * tested from the account that published the Web App.
   */
  _setStudentDocAccess(docId, studentEmail, canEdit) {
    if (!docId || !studentEmail) return;
    try {
      const file = DriveApp.getFileById(docId);
      if (canEdit) {
        // Também aqui, e não só na criação: cobre os Docs criados antes de a
        // regra existir, na próxima vez que a proposta volta para edição.
        file.setShareableByEditors(false);
        file.addEditor(studentEmail);
      } else {
        // Remove first: adding a commenter to someone who is already an editor
        // does not downgrade them.
        file.removeEditor(studentEmail);
        file.addCommenter(studentEmail);
      }
    } catch(e) {
      console.error('_setStudentDocAccess error:', e);
    }
  }

  _getLog() {
    return new EventLogService(this.semesterId);
  }

  /**
   * Records a transition on the activity log, plus the comment the actor wrote
   * along with it (when there is one). Both carry the recipient the transition
   * implies — approving hands the proposal to the Incharge, returning hands it
   * back to the Student — so a reader sees who each message was for.
   */
  _logAction(proposalId, status, role, email, systemMessage, comment, toRole) {
    this._getLog().logAction(proposalId, status, role, email, systemMessage, comment, toRole);
  }

  /**
   * Ensures the caller owns the proposal for the given role:
   * - STUDENT must be the proposal's own student
   * - ADVISOR must be the advisor assigned in the proposal
   * - INCHARGE has no ownership restriction
   * Always checks the stored record (DB truth), never client-sent data.
   */
  _assertOwnership(proposalData, userRole, email) {
    // Normalized on both sides: the advisor's address is typed by the STUDENT,
    // so a difference in case is expected and must not decide authorization.
    const who = _normalizeEmail_(email);
    if (userRole === UserRole.STUDENT &&
        _normalizeEmail_(proposalData[DB_COLS_PROPOSAL.STUDENT_EMAIL]) !== who) {
      throw new Error("Você só pode agir sobre a sua própria proposta.");
    }
    if (userRole === UserRole.ADVISOR &&
        _normalizeEmail_(proposalData[DB_COLS_PROPOSAL.ADVISOR_EMAIL]) !== who) {
      throw new Error("Apenas o orientador designado nesta proposta pode executar esta ação.");
    }
  }

  /**
   * Retrieves a proposal from the DB and decorates it with the state logic
   */
  getProposal(proposalId) {
    const dao = this._getDao();
    const data = dao.getById(proposalId);
    if (!data) return null;
    
    return {
      data: data,
      state: TccStateFactory.create(data[DB_COLS_PROPOSAL.STATUS])
    };
  }

  // ------------------------------------------
  // ACTIONS / COMMANDS
  // ------------------------------------------

  saveDraft(userRole, email, name, proposalData) {
    const dao = this._getDao();
    const input = proposalData || {};
    // Everything the client sent that this role may write. Nothing else from
    // `input` reaches the sheet — see _proposalEditableColumns_ above.
    const patch = _sanitizeProposalInput_(input, userRole);

    let id = input[DB_COLS_PROPOSAL.PROPOSAL_ID];
    let record;
    let state;
    let isNew = false;

    if (id) {
      record = dao.getById(id);
      if (!record) throw new Error("Proposta não encontrada.");
      state = TccStateFactory.create(record[DB_COLS_PROPOSAL.STATUS]);
    } else {
      // One proposal per student: adopt the existing record if the student already has one
      const ownerEmail = (userRole === UserRole.STUDENT)
        ? _normalizeEmail_(email)
        : _normalizeEmail_(input[DB_COLS_PROPOSAL.STUDENT_EMAIL]);
      const existing = dao.getAll().find(
        row => _normalizeEmail_(row[DB_COLS_PROPOSAL.STUDENT_EMAIL]) === ownerEmail
      );

      if (existing) {
        id = existing[DB_COLS_PROPOSAL.PROPOSAL_ID];
        record = existing;
        state = TccStateFactory.create(existing[DB_COLS_PROPOSAL.STATUS]);
      } else {
        // New proposal is implicitly Draft
        isNew = true;
        state = new ProposalDraftState();
        id = Utilities.getUuid();
        // Set by the server, never taken from the request: these are the
        // fields that decide where in the flow the proposal sits.
        patch[DB_COLS_PROPOSAL.PROPOSAL_ID] = id;
        patch[DB_COLS_PROPOSAL.STATUS] = TccStatus.PROPOSAL_DRAFT;
        patch[DB_COLS_PROPOSAL.CREATED_AT] = new Date().toISOString();
        patch[DB_COLS_PROPOSAL.ITERATIONS] = 0;
      }
    }

    // Ownership check on the stored record (never on client-sent data)
    if (record) {
      this._assertOwnership(record, userRole, email);
    }

    if (!state.canEdit(userRole)) {
      throw new Error(`Permissão negada. O usuário associado ao perfil ${userRole} não pode editar esta proposta no status atual.`);
    }

    // The owner comes from the session, never from the request
    if (userRole === UserRole.STUDENT) {
      patch[DB_COLS_PROPOSAL.STUDENT_EMAIL] = _normalizeEmail_(email);
    }

    // First save of a brand new proposal: create and share the Google Doc
    // that will hold the rich content (Resumo/Objetivos/Metodologia/Referências).
    if (isNew) {
      // The name printed on the document comes from the Students table, not
      // from what the user typed on the login screen — this is an official
      // document, and the typed name is free text.
      const officialName = getPersonName_(
        patch[DB_COLS_PROPOSAL.STUDENT_EMAIL], this.semesterId, name
      );
      const docId = this._createProposalDoc(
        officialName,
        patch[DB_COLS_PROPOSAL.STUDENT_ID],
        patch[DB_COLS_PROPOSAL.TITLE]
      );
      patch[DB_COLS_PROPOSAL.DOC_ID] = docId;
      this._shareProposalDoc(docId, patch[DB_COLS_PROPOSAL.STUDENT_EMAIL], patch[DB_COLS_PROPOSAL.ADVISOR_EMAIL]);
    }

    patch[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();
    dao.upsert(id, patch);

    // Only the creation is logged, not every draft save: the log records the
    // milestones of the process, and a draft gets saved many times.
    if (isNew) {
      this._getLog().logTransition(
        id, TccStatus.PROPOSAL_DRAFT, userRole, email,
        'Proposta criada (rascunho).', UserRole.ADVISOR
      );
    }

    return { success: true, id: id };
  }

  /**
   * Submits the proposal, saving the form data that comes with the command
   * first (implicit save). Editing a field and clicking Submeter used to
   * discard the edit silently — the student had to remember to click "Salvar
   * Rascunho" before submitting. Doing it here, in one command, also means
   * there is no half-applied state: a failure leaves nothing saved and nothing
   * submitted. When the proposal does not exist yet, saveDraft creates it (and
   * its Google Doc), so the student can fill the form and submit in one click.
   */
  /**
   * Refuses a submission whose advisor is not a registered teacher.
   *
   * Without it the proposal reaches a dead end nobody can open: the advisor role
   * comes from the Teachers table (AuthService._rolesInSemester), so someone
   * outside it cannot even log in — processLogin turns them away — and approving
   * is exclusive to the advisor, with no alternative path. The proposal would
   * sit in "Proposta Submetida" forever.
   *
   * The gate is on SUBMIT and not on saveDraft on purpose: the draft is what
   * creates the Google Doc, and the student needs it to write while the advisor
   * is still being registered.
   *
   * What changed with the Classroom leaving: this used to be a pending state
   * that could last days — the Incharge had to invite the professor to the
   * class, the professor had to accept, and a 5-minute roster cache delayed the
   * release even after that. Now the Incharge adds the row and the next submit
   * goes through. Nothing is derived from an external system any more, so there
   * is also no "lookup failed" branch to guess about.
   */
  _assertAdvisorIsRegistered(advisorEmail, studentEmail) {
    if (!advisorEmail) throw new Error('Informe o e-mail do Orientador.');

    // A professor who is also enrolled as a student in the same term could name
    // themselves: submit as Aluno, switch role in the header, approve as
    // Orientador. Both checks that follow would pass — the address IS in
    // Teachers, and they ARE the assigned advisor — so the only thing standing
    // between them and their own approval is this line.
    if (_normalizeEmail_(advisorEmail) === _normalizeEmail_(studentEmail)) {
      throw new Error('O Orientador não pode ser o próprio aluno. Informe o ' +
                      'e-mail do professor que orienta este trabalho.');
    }

    const key = _normalizeEmail_(advisorEmail);
    if (getAdvisorEmails_().indexOf(key) === -1) {
      // Cadastrado, mas como externo: a mensagem tem de dizer isso, senão o
      // aluno fica pedindo ao Responsável um cadastro que já existe.
      if (getTeacherEmails_().indexOf(key) !== -1) {
        throw new Error(
          `${advisorEmail} está cadastrado(a) como membro externo, e um membro ` +
          `externo participa de banca mas não orienta TCC. Informe o e-mail ` +
          `institucional do(a) professor(a) da UFAM que orienta o seu trabalho.`
        );
      }
      throw new Error(
        `${advisorEmail} ainda não está cadastrado(a) como professor(a) no ` +
        `sistema, e por isso não conseguiria entrar para avaliar a sua ` +
        `proposta. O Responsável pela disciplina vê essa pendência no painel ` +
        `dele e faz o cadastro na hora; feito isso, é só submeter de novo. O ` +
        `rascunho continua salvo.`
      );
    }
  }

  submitProposal(userRole, email, name, proposalId, proposalData) {
    // A proposta tem de existir ANTES de ser submetida. Sem isso, saveDraft a
    // criaria aqui mesmo — com o Doc recém-copiado do template, sem uma linha
    // escrita — e a mandaria ao Orientador; e como submeter rebaixa o aluno a
    // comentarista, ele nem poderia mais escrever no documento até a proposta
    // ser devolvida. O botão do painel já segue o canSubmit da máquina de
    // estados (falso em NoProposalState), e esta guarda é a que vale, porque a
    // checagem do cliente é cortesia.
    if (!proposalId) {
      throw new Error(
        'Salve o rascunho antes de submeter: é ele que cria a proposta e o ' +
        'documento onde você escreve o conteúdo do trabalho.'
      );
    }

    if (proposalData) {
      if (proposalId) proposalData[DB_COLS_PROPOSAL.PROPOSAL_ID] = proposalId;
      // saveDraft enforces canEdit and ownership on the stored record, so an
      // out-of-phase submit is rejected here before anything is written.
      proposalId = this.saveDraft(userRole, email, name, proposalData).id;
    }

    const p = this.getProposal(proposalId);
    if (!p) throw new Error("Proposta não encontrada");

    if (!p.state.canSubmit(userRole)) {
      throw new Error(`O usuário logado não pode submeter esta proposta.`);
    }
    this._assertOwnership(p.data, userRole, email);
    // Checked against the STORED record, after saveDraft: what matters is the
    // advisor the proposal will carry, not what the client claimed.
    this._assertAdvisorIsRegistered(
      p.data[DB_COLS_PROPOSAL.ADVISOR_EMAIL], p.data[DB_COLS_PROPOSAL.STUDENT_EMAIL]
    );

    p.data[DB_COLS_PROPOSAL.STATUS] = TccStatus.PROPOSAL_SUBMITTED;
    p.data[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();

    this._getDao().update(proposalId, p.data);
    // Under review: the Doc follows the form and stops being editable.
    this._setStudentDocAccess(
      p.data[DB_COLS_PROPOSAL.DOC_ID], p.data[DB_COLS_PROPOSAL.STUDENT_EMAIL], false
    );
    // O aluno escreve na linha do tempo (ui_comp_event_log), não num campo do
    // formulário: por isso não há comentário preso a esta ação.
    this._logAction(
      proposalId, TccStatus.PROPOSAL_SUBMITTED, UserRole.STUDENT, email,
      'Proposta submetida para aprovação do Orientador.', '', UserRole.ADVISOR
    );
    return { success: true };
  }

  returnProposal(userRole, email, proposalId, message) {
    const p = this.getProposal(proposalId);
    if (!p) throw new Error("Proposta não encontrada");

    if (!p.state.canReturn(userRole)) {
      throw new Error(`O usuário logado não tem permissão de analista (Orientador) no momento.`);
    }
    this._assertOwnership(p.data, userRole, email);

    p.data[DB_COLS_PROPOSAL.STATUS] = TccStatus.PROPOSAL_RETURNED;
    p.data[DB_COLS_PROPOSAL.ITERATIONS] = (parseInt(p.data[DB_COLS_PROPOSAL.ITERATIONS]) || 0) + 1;
    p.data[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();

    this._getDao().update(proposalId, p.data);
    // Back with the student for adjustments: editing is allowed again.
    this._setStudentDocAccess(
      p.data[DB_COLS_PROPOSAL.DOC_ID], p.data[DB_COLS_PROPOSAL.STUDENT_EMAIL], true
    );
    this._logAction(
      proposalId, TccStatus.PROPOSAL_RETURNED, UserRole.ADVISOR, email,
      `Proposta devolvida para ajustes (correção nº ${p.data[DB_COLS_PROPOSAL.ITERATIONS]}).`,
      message, UserRole.STUDENT
    );
    return { success: true };
  }

  approveProposal(userRole, email, proposalId) {
    const p = this.getProposal(proposalId);
    if (!p) throw new Error("Proposta não encontrada");

    if (!p.state.canApprove(userRole)) {
      throw new Error(`Apenas o Orientador da proposta pode aprovar.`);
    }
    this._assertOwnership(p.data, userRole, email);

    p.data[DB_COLS_PROPOSAL.STATUS] = TccStatus.PROPOSAL_APPROVED;
    p.data[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();

    this._getDao().update(proposalId, p.data);
    this._logAction(
      proposalId, TccStatus.PROPOSAL_APPROVED, UserRole.ADVISOR, email,
      'Proposta aprovada pelo Orientador, encaminhada para homologação.',
      '', UserRole.INCHARGE
    );
    return { success: true };
  }

  homologateProposal(userRole, email, proposalId) {
    const p = this.getProposal(proposalId);
    if (!p) throw new Error("Proposta não encontrada");

    if (!p.state.canHomologate(userRole)) {
      throw new Error(`Apenas o Responsável (Gestor) pode homologar uma proposta que já foi aprovada.`);
    }

    // Per specs.md: homologation moves the student straight into the
    // Development phase — there is no separate resting "Homologada" state.
    p.data[DB_COLS_PROPOSAL.STATUS] = TccStatus.IN_DEVELOPMENT;
    p.data[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();

    this._getDao().update(proposalId, p.data);
    this._logAction(
      proposalId, TccStatus.IN_DEVELOPMENT, UserRole.INCHARGE, email,
      'Proposta homologada. Início da fase de Desenvolvimento.', '', UserRole.STUDENT
    );
    return { success: true };
  }

  /**
   * Stores the TCC file sent by the student in the term folder and returns its
   * Drive id.
   *
   * The file is written by the app, so the app OWNS it — the same structural
   * consequence already recorded for the proposal Doc, and here it is the whole
   * point: an owned file is one the system can share with the committee by
   * itself, when the committee is homologated. A link pasted from the student's
   * own Drive could not be read by the account running the app (the deploy is
   * executeAs: USER_DEPLOYING), so sharing would fall back to the student doing
   * it by hand — an informal step outside the system, which is exactly what
   * this replaces.
   *
   * @param {string} studentName
   * @param {{ name: string, mimeType: string, bytes: string }} file - bytes are base64
   */
  _storeWorkFile(studentName, file) {
    return _storePdf_(this.folderId, file, `TCC - ${studentName}.pdf`);
  }

  /**
   * Gives the student and the advisor read access to the uploaded work.
   *
   * As in _shareProposalDoc, a sharing failure is logged and never thrown:
   * losing the phase transition because of a Drive hiccup would be worse than a
   * permission somebody has to grant by hand. The committee is added later, on
   * homologation, when its members are known.
   */
  _shareWorkFile(fileId, studentEmail, advisorEmail) {
    try {
      const file = DriveApp.getFileById(fileId);
      [studentEmail, advisorEmail].filter(Boolean).forEach(who => {
        try {
          file.addViewer(who);
        } catch (e) {
          console.error(`_shareWorkFile: falha ao compartilhar com ${who}: ${e.message}`);
        }
      });
    } catch (e) {
      console.error(`_shareWorkFile: falha ao abrir o arquivo ${fileId}: ${e.message}`);
    }
  }

  /**
   * Student-only action: closes the Development phase and marks the TCC as
   * concluded, awaiting the Advisor to start Committee formation.
   *
   * The TCC file is required, not optional. It is what turns the end of
   * Development from a declaration into a delivery, and the Advisor assembles
   * the committee — and, right after, the notification goes out to people who
   * need to read the work — on the strength of it.
   */
  concludeTcc(userRole, email, name, proposalId, file) {
    const p = this.getProposal(proposalId);
    if (!p) throw new Error("Proposta não encontrada");

    if (!p.state.canConclude(userRole)) {
      throw new Error(`Só é possível concluir o TCC durante a fase de Desenvolvimento.`);
    }
    this._assertOwnership(p.data, userRole, email);

    // Stored BEFORE the status changes: if the upload fails, the student is
    // still in Development and simply tries again. The other order would leave
    // a TCC concluded with nothing attached, and no action left to fix it.
    const fileId = this._storeWorkFile(name || email, file);

    p.data[DB_COLS_PROPOSAL.WORK_FILE_ID] = fileId;
    p.data[DB_COLS_PROPOSAL.WORK_UPLOADED_AT] = new Date().toISOString();
    p.data[DB_COLS_PROPOSAL.STATUS] = TccStatus.TCC_CONCLUDED;
    p.data[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();

    this._getDao().update(proposalId, p.data);
    this._shareWorkFile(fileId, p.data[DB_COLS_PROPOSAL.STUDENT_EMAIL],
                        p.data[DB_COLS_PROPOSAL.ADVISOR_EMAIL]);
    this._logAction(
      proposalId, TccStatus.TCC_CONCLUDED, UserRole.STUDENT, email,
      'TCC concluído pelo aluno, com o trabalho enviado. Aguardando a formação da banca.',
      '', UserRole.ADVISOR
    );
    return { success: true };
  }
}

// ==========================================
// EXPOSED FRONT-END ENTRY POINTS (google.script.run)
// ==========================================
function _executeProposalCommand_(commandName, argsObj) {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.assertActiveSession();
    if (!ctx.sheetId) throw new Error(semesterUnavailableMessage(ctx));
    if (ctx.role === UserRole.ERROR) throw new Error("Acesso não autorizado.");
    const email = ctx.email;
    const role = ctx.role;

    const service = new ProposalService(ctx.sheetId, ctx.folderId);

    // The refreshed panel travels back with the result — see
    // _dashboardPayloadForRole_ in ServiceDashboard.js for why it is built here
    // and not by a second call from the client.
    const result = _runProposalCommand_(service, commandName, role, email, ctx.name, argsObj);
    if (result && result.success) {
      result.dashboard = _dashboardPayloadForRole_(role);
    }
    return result;
  } catch (err) {
    console.error(`Erro ao executar command ${commandName}`, err);
    return { success: false, msg: err.message };
  }
}

/** Dispatches a single command. Errors bubble up to _executeProposalCommand_. */
function _runProposalCommand_(service, commandName, role, email, name, argsObj) {
  const { proposalId, data, message, file } = argsObj;

  switch (commandName) {
    case 'SAVE_DRAFT':
      return service.saveDraft(role, email, name, data);
    case 'SUBMIT':
      return service.submitProposal(role, email, name, proposalId, data);
    case 'RETURN':
      return service.returnProposal(role, email, proposalId, message);
    case 'APPROVE':
      return service.approveProposal(role, email, proposalId);
    case 'HOMOLOGATE':
      // Homologation is a global act of the Incharge: role check is sufficient
      return service.homologateProposal(role, email, proposalId);
    case 'CONCLUDE_TCC':
      return service.concludeTcc(role, email, name, proposalId, file);
    default:
      throw new Error("Comando de proposta inválido.");
  }
}

// Clientside endpoints:
function cmdSaveDraft(data) { return _executeProposalCommand_('SAVE_DRAFT', { data }); }
// data (form contents) is optional: only the Student panel sends it, for the
// implicit save described in ProposalService.submitProposal.
function cmdSubmitProposal(proposalId, data) { return _executeProposalCommand_('SUBMIT', { proposalId, data }); }
function cmdReturnProposal(proposalId, message) { return _executeProposalCommand_('RETURN', { proposalId, message }); }
function cmdApproveProposal(proposalId) { return _executeProposalCommand_('APPROVE', { proposalId }); }
function cmdHomologateProposal(proposalId) { return _executeProposalCommand_('HOMOLOGATE', { proposalId }); }
// file: { name, mimeType, bytes (base64) } — the TCC itself, required.
function cmdConcludeTcc(proposalId, file) { return _executeProposalCommand_('CONCLUDE_TCC', { proposalId, file }); }
