/**
 * FILE: ServiceDefense.js
 * DESC: Fases 4 e 5 do fluxo — Ata da Defesa, assinaturas, os dois PDFs e o
 *       encerramento (RIU, nota final). Também o encerramento sem banca dos
 *       fluxos alternativos. O status vive em Proposals.Status, como em todas
 *       as outras fases; esta aba guarda só os dados da defesa.
 * AUTH: Andre Cavalcante
 * DATE: August, 2026
 * LICENCE: GPL-v3
 */

// ==========================================
// ASSINATURA
// ==========================================

/**
 * O segredo do servidor, criado na primeira vez que alguém assina.
 *
 * Gerado e não configurado à mão de propósito: uma chave que o Responsável
 * digita é uma chave que ele escolhe, e o valor inteiro do mecanismo está em ela
 * ser imprevisível. Fica em Script Properties, que o cliente nunca lê.
 *
 * Trocá-la invalida toda assinatura já emitida — é por isso que ela nasce uma
 * vez e nunca é regravada.
 */
function _signatureSecret_() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('SIGNATURE_SECRET_KEY');
  if (!key) {
    key = _randomToken_(INVITE_TOKEN_ALPHABET, 64);
    props.setProperty('SIGNATURE_SECRET_KEY', key);
  }
  return key;
}

function _toHex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * O CONTEÚDO CANÔNICO da ata: o texto exato que as assinaturas cobrem.
 *
 * Precisa ser montado de um jeito só, aqui, e reusado na verificação — se a
 * página de conferência montar diferente, todo HMAC legítimo falha. Daí duas
 * disciplinas: os membros vão ordenados por e-mail (a ordem da tela não pode
 * mudar o texto assinado) e nada de derivado entra (média e assinaturas saem do
 * conteúdo, não fazem parte dele).
 *
 * O que ele cobre é o que um adulterador teria interesse em mudar: quem era o
 * aluno, qual era o trabalho, quem era a banca, que notas cada um deu e qual foi
 * o parecer.
 */
function _canonicalMinutes_(proposal, committee, defense) {
  const members = _parseJsonArray_(committee[DB_COLS_COMMITTEE.MEMBERS_DATA]);
  const grades  = _parseJsonArray_(defense[DB_COLS_DEFENSE.MEMBERS_GRADES]);
  const gradeOf = {};
  grades.forEach(g => { gradeOf[_normalizeEmail_(g.email)] = g.nota; });

  return JSON.stringify({
    aluno:     _normalizeEmail_(proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL]),
    matricula: String(proposal[DB_COLS_PROPOSAL.STUDENT_ID] || ''),
    titulo:    String(committee[DB_COLS_COMMITTEE.FINAL_TITLE] || ''),
    defesa:    formatDatetimeInput(committee[DB_COLS_COMMITTEE.DEFENSE_DATETIME]),
    modo:      String(committee[DB_COLS_COMMITTEE.DEFENSE_MODE] || ''),
    parecer:   String(defense[DB_COLS_DEFENSE.APPROVAL_STATUS] || ''),
    banca: members
      .map(m => ({
        email: _normalizeEmail_(m.email),
        nome:  String(m.nome || ''),
        nota:  (gradeOf[_normalizeEmail_(m.email)] === undefined)
          ? null : Number(gradeOf[_normalizeEmail_(m.email)])
      }))
      .sort((a, b) => a.email.localeCompare(b.email))
  });
}

/** SHA-256 do conteúdo canônico — o que a assinatura de cada um carimba. */
function _minutesHash_(proposal, committee, defense) {
  return _toHex_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    _canonicalMinutes_(proposal, committee, defense),
    Utilities.Charset.UTF_8
  ));
}

/**
 * A assinatura de uma pessoa sobre um conteúdo, num instante.
 *
 * `email | hash | timestamp` — os três, porque tirar qualquer um deles deixaria
 * a assinatura reutilizável: sem o e-mail ela serve para outro signatário, sem o
 * hash serve para outra ata, sem o timestamp serve de novo depois de uma
 * alteração e um recuo.
 */
function _signMinutes_(email, hash, timestamp) {
  return _toHex_(Utilities.computeHmacSha256Signature(
    _normalizeEmail_(email) + '|' + hash + '|' + timestamp,
    _signatureSecret_()
  ));
}

// ==========================================
// SERVIÇO
// ==========================================

class DefenseService {
  constructor(semesterId, folderId) {
    if (!semesterId) throw new Error("Semester ID is required for DefenseService");
    this.semesterId = semesterId;
    this.folderId = folderId;
  }

  _dao()          { return getSheetManager_(this.semesterId, DB_SHEETS.DEFENSES,   DB_COLS_DEFENSE.DEFENSE_ID); }
  _proposalDao()  { return getSheetManager_(this.semesterId, DB_SHEETS.PROPOSALS,  DB_COLS_PROPOSAL.PROPOSAL_ID); }
  _committeeDao() { return getSheetManager_(this.semesterId, DB_SHEETS.COMMITTEES, DB_COLS_COMMITTEE.COMMITTEE_ID); }
  _log()          { return new EventLogService(this.semesterId); }

  /**
   * Tudo o que uma ação da Fase 4 precisa, numa leitura só: a proposta (dona do
   * status), a banca (dona dos membros), a ata (dona das notas) e o estado.
   */
  _context(proposalId) {
    const proposal = this._proposalDao().getById(proposalId);
    if (!proposal) throw new Error('Proposta não encontrada.');

    const committee = this._committeeDao().getAll().find(
      row => row[DB_COLS_COMMITTEE.PROPOSAL_ID] === proposalId
    ) || null;

    const defense = committee
      ? (this._dao().getAll().find(
          row => row[DB_COLS_DEFENSE.COMMITTEE_ID] === committee[DB_COLS_COMMITTEE.COMMITTEE_ID]
        ) || null)
      : null;

    return {
      proposal:  proposal,
      committee: committee,
      defense:   defense,
      members:   committee ? _parseJsonArray_(committee[DB_COLS_COMMITTEE.MEMBERS_DATA]) : [],
      state:     TccStateFactory.create(proposal[DB_COLS_PROPOSAL.STATUS])
    };
  }

  /**
   * Confere que quem age é o Orientador designado NESTA proposta.
   *
   * Papel não basta: todo professor entra como Orientador, e sem esta checagem
   * qualquer um deles lançaria nota na ata de qualquer aluno.
   */
  _assertAdvisor(ctx, email) {
    if (_normalizeEmail_(ctx.proposal[DB_COLS_PROPOSAL.ADVISOR_EMAIL]) !== _normalizeEmail_(email)) {
      throw new Error('Apenas o Orientador designado nesta proposta pode executar esta ação.');
    }
  }

  /** O membro da banca correspondente a um e-mail, ou null. */
  _memberOf(ctx, email) {
    const key = _normalizeEmail_(email);
    return ctx.members.find(m => _normalizeEmail_(m.email) === key) || null;
  }

  _isAdvisorEmail(ctx, email) {
    return _normalizeEmail_(ctx.proposal[DB_COLS_PROPOSAL.ADVISOR_EMAIL]) === _normalizeEmail_(email);
  }

  /** Os membros que não são o Orientador — os que assinam depois dele. */
  _otherMembers(ctx) {
    return ctx.members.filter(m => !this._isAdvisorEmail(ctx, m.email));
  }

  _grades(ctx) {
    return ctx.defense ? _parseJsonArray_(ctx.defense[DB_COLS_DEFENSE.MEMBERS_GRADES]) : [];
  }

  _signedEmails(ctx) {
    return this._grades(ctx)
      .filter(g => g.assinadoEm)
      .map(g => _normalizeEmail_(g.email));
  }

  // ------------------------------------------------------------ Fase 4

  /**
   * Abre a Ata. A defesa em si acontece fora do sistema; o que se cria aqui é o
   * documento que a registra, com a chave de validação que vai impressa nos dois
   * PDFs e permite conferi-los depois.
   */
  createMinutes(userRole, email, proposalId) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canCreateMinutes(userRole)) {
      throw new Error('A Ata só pode ser gerada pelo Orientador, depois de a banca ser homologada.');
    }
    this._assertAdvisor(ctx, email);
    if (!ctx.committee) throw new Error('Banca não encontrada para esta proposta.');
    if (ctx.defense) throw new Error('A Ata desta defesa já foi gerada.');

    const record = {};
    record[DB_COLS_DEFENSE.DEFENSE_ID]     = Utilities.getUuid();
    record[DB_COLS_DEFENSE.COMMITTEE_ID]   = ctx.committee[DB_COLS_COMMITTEE.COMMITTEE_ID];
    // Uma linha por membro, já com a nota vazia: a tela desenha a partir daqui,
    // e assim a ordem e a composição da banca ficam congeladas no momento em
    // que a Ata nasce.
    record[DB_COLS_DEFENSE.MEMBERS_GRADES] = JSON.stringify(
      ctx.members.map(m => ({
        email: _normalizeEmail_(m.email),
        nome: m.nome,
        nota: null,
        assinadoEm: '',
        assinatura: ''
      }))
    );
    record[DB_COLS_DEFENSE.BANK_OBSERVATIONS] = '';
    record[DB_COLS_DEFENSE.FINAL_GRADE]       = '';
    record[DB_COLS_DEFENSE.APPROVAL_STATUS]   = '';
    record[DB_COLS_DEFENSE.SIGNATURE_TOKENS]  = '{}';
    // Curta e legível: sai impressa e alguém vai digitá-la para conferir.
    record[DB_COLS_DEFENSE.VALIDATION_KEY]    = _randomToken_(ENROLLMENT_CODE_ALPHABET, 10);

    this._dao().insert(record);
    this._advance(ctx, TccStatus.MINUTES_CREATED);
    this._log().logTransition(
      proposalId, TccStatus.MINUTES_CREATED, userRole, email,
      'Ata da defesa gerada pelo Orientador.', UserRole.ADVISOR
    );
    return { success: true };
  }

  /**
   * Salva notas, observações e parecer sem fechar nada. Existe separado da
   * assinatura porque lançar nota é trabalho e assinar é decisão: o Orientador
   * pode salvar no meio da defesa e conferir depois.
   */
  saveMinutes(userRole, email, proposalId, data) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canRecordVerdict(userRole)) {
      throw new Error('A Ata só pode ser preenchida enquanto estiver aberta, pelo Orientador.');
    }
    this._assertAdvisor(ctx, email);
    if (!ctx.defense) throw new Error('Ata não encontrada.');

    const patch = this._buildVerdict(ctx, data);
    this._dao().update(ctx.defense[DB_COLS_DEFENSE.DEFENSE_ID], patch);
    return { success: true };
  }

  /**
   * Valida e monta as colunas do parecer. Compartilhado entre salvar e assinar,
   * porque assinar precisa gravar exatamente o que vai carimbar.
   */
  _buildVerdict(ctx, data) {
    const input = data || {};
    const notas = input.notas || {};
    const grades = this._grades(ctx).map(g => {
      const raw = notas[g.email];
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        return Object.assign({}, g, { nota: null });
      }
      const nota = Number(String(raw).replace(',', '.'));
      if (isNaN(nota) || nota < 0 || nota > 10) {
        throw new Error(`Nota inválida para ${g.nome}: use um número de 0 a 10.`);
      }
      // Duas casas: a média é dividida por 3 a 5, e guardar o valor cheio faria
      // a planilha e o PDF mostrarem números diferentes do que foi assinado.
      return Object.assign({}, g, { nota: Math.round(nota * 100) / 100 });
    });

    const verdict = String(input.parecer || '').trim();
    if (verdict && Object.values(VerdictStatus).indexOf(verdict) === -1) {
      throw new Error('Parecer inválido.');
    }

    const lancadas = grades.filter(g => g.nota !== null);
    const media = lancadas.length
      ? Math.round((lancadas.reduce((sum, g) => sum + g.nota, 0) / lancadas.length) * 100) / 100
      : '';

    const patch = {};
    patch[DB_COLS_DEFENSE.MEMBERS_GRADES]    = JSON.stringify(grades);
    patch[DB_COLS_DEFENSE.BANK_OBSERVATIONS] = String(input.observacoes || '').trim();
    patch[DB_COLS_DEFENSE.FINAL_GRADE]       = media;
    patch[DB_COLS_DEFENSE.APPROVAL_STATUS]   = verdict;
    return patch;
  }

  /**
   * O Orientador fecha o lançamento assinando, e isso abre as assinaturas dos
   * demais. A partir daqui as notas não mudam mais: elas estão dentro do que
   * cada assinatura carimba.
   */
  signAsAdvisor(userRole, email, proposalId, data) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canRecordVerdict(userRole)) {
      throw new Error('A Ata já foi fechada pelo Orientador.');
    }
    this._assertAdvisor(ctx, email);
    if (!ctx.defense) throw new Error('Ata não encontrada.');

    const patch = this._buildVerdict(ctx, data);
    const grades = JSON.parse(patch[DB_COLS_DEFENSE.MEMBERS_GRADES]);

    if (grades.some(g => g.nota === null)) {
      throw new Error('Lance a nota de todos os membros da banca antes de assinar.');
    }
    if (!patch[DB_COLS_DEFENSE.APPROVAL_STATUS]) {
      throw new Error('Informe o parecer da banca antes de assinar.');
    }

    // O conteúdo canônico é montado sobre o registro JÁ ATUALIZADO: assinar o
    // que estava gravado antes carimbaria notas velhas.
    const updated = Object.assign({}, ctx.defense, patch);
    const hash = _minutesHash_(ctx.proposal, ctx.committee, updated);
    const now = new Date().toISOString();

    const advisorEmail = _normalizeEmail_(ctx.proposal[DB_COLS_PROPOSAL.ADVISOR_EMAIL]);
    patch[DB_COLS_DEFENSE.MEMBERS_GRADES] = JSON.stringify(grades.map(g =>
      _normalizeEmail_(g.email) === advisorEmail
        ? Object.assign({}, g, { assinadoEm: now, assinatura: _signMinutes_(g.email, hash, now) })
        : g
    ));
    patch[DB_COLS_DEFENSE.ADVISOR_SIGNED_AT] = now;

    // Um token por membro que ainda vai assinar: o link do e-mail leva direto à
    // ata certa, em vez de a pessoa ter de achá-la numa lista.
    const tokens = {};
    this._otherMembers(ctx).forEach(m => {
      tokens[_normalizeEmail_(m.email)] = _randomToken_(INVITE_TOKEN_ALPHABET, INVITE_TOKEN_LENGTH);
    });
    patch[DB_COLS_DEFENSE.SIGNATURE_TOKENS] = JSON.stringify(tokens);

    this._dao().update(ctx.defense[DB_COLS_DEFENSE.DEFENSE_ID], patch);
    this._advance(ctx, TccStatus.MINUTES_IN_SIGNATURES);

    this._notifyPendingSigners(ctx, tokens);
    this._log().logTransition(
      proposalId, TccStatus.MINUTES_IN_SIGNATURES, userRole, email,
      'Ata assinada pelo Orientador. Aguardando as assinaturas da banca.', UserRole.ADVISOR
    );
    return { success: true };
  }

  _notifyPendingSigners(ctx, tokens) {
    // The deployment URL on purpose, never getPublicAppUrl(): this link carries
    // a token in the query string, and the friendly URL on the Faculty site
    // drops parameters. One-shot links clicked on the spot can afford to be ugly.
    let url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch(e) { url = ''; }

    this._otherMembers(ctx).forEach(m => {
      const token = tokens[_normalizeEmail_(m.email)];
      const rawLink = (url && token) ? (url + '?page=sign&token=' + encodeURIComponent(token)) : url;
      const link = withAccountChooser(rawLink);
      NotificationService.mailTo([m.email], 'Ata aguardando a sua assinatura', [
        String(m.nome || '') + ',',
        '',
        'A Ata da defesa abaixo está aguardando a sua assinatura como membro da banca.',
        '',
        'Aluno: ' + getPersonName_(ctx.proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL], this.semesterId, ''),
        'Trabalho: ' + String(ctx.committee[DB_COLS_COMMITTEE.FINAL_TITLE] || ''),
        '',
        link ? ('Assine aqui: ' + link) : ''
      ].filter(l => l !== ''));
    });
  }

  /**
   * Um membro da banca assina.
   *
   * A autorização aqui é por PERTENCIMENTO, não por papel: quem assina está em
   * MembersData. Um professor que não orienta este aluno, e um convidado de
   * outra instituição que não orienta ninguém, entram os dois com papel de
   * Orientador — o papel não distingue, a lista distingue.
   */
  signAsMember(userRole, email, proposalId) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canSignMinutes(userRole)) {
      throw new Error('Esta Ata não está em fase de assinaturas.');
    }
    if (!ctx.defense) throw new Error('Ata não encontrada.');

    const member = this._memberOf(ctx, email);
    if (!member) throw new Error('Você não é membro da banca desta defesa.');
    if (this._isAdvisorEmail(ctx, email)) {
      throw new Error('O Orientador já assinou ao fechar a Ata.');
    }
    if (this._signedEmails(ctx).indexOf(_normalizeEmail_(email)) !== -1) {
      throw new Error('Você já assinou esta Ata.');
    }

    const hash = _minutesHash_(ctx.proposal, ctx.committee, ctx.defense);
    const now = new Date().toISOString();
    const key = _normalizeEmail_(email);

    const grades = this._grades(ctx).map(g =>
      _normalizeEmail_(g.email) === key
        ? Object.assign({}, g, { assinadoEm: now, assinatura: _signMinutes_(key, hash, now) })
        : g
    );

    // O token é de uso único: gasto na assinatura, ele deixa de abrir a tela.
    const tokens = JSON.parse(ctx.defense[DB_COLS_DEFENSE.SIGNATURE_TOKENS] || '{}');
    delete tokens[key];

    const patch = {};
    patch[DB_COLS_DEFENSE.MEMBERS_GRADES]   = JSON.stringify(grades);
    patch[DB_COLS_DEFENSE.SIGNATURE_TOKENS] = JSON.stringify(tokens);
    this._dao().update(ctx.defense[DB_COLS_DEFENSE.DEFENSE_ID], patch);

    const faltam = this._otherMembers(ctx).length - (this._signedEmails(ctx).length + 1);
    this._log().logAction(
      proposalId, TccStatus.MINUTES_IN_SIGNATURES, userRole, email,
      `Ata assinada por ${member.nome}.` +
        (faltam > 0 ? ` Faltam ${faltam} assinatura(s).`
                    : ' Todas as assinaturas da banca foram colhidas.'),
      '', faltam > 0 ? '' : UserRole.STUDENT
    );
    return { success: true };
  }

  /**
   * O "de acordo" do aluno — a última assinatura da Ata.
   *
   * Ela vale ao mesmo tempo para a Ata e para a Folha de Aprovação: é o mesmo
   * consentimento, e pedi-lo duas vezes não acrescentaria nada.
   */
  studentAgreement(userRole, email, proposalId) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canAgree(userRole)) {
      throw new Error('O de acordo só é possível enquanto a Ata está em assinaturas.');
    }
    if (!ctx.defense) throw new Error('Ata não encontrada.');
    if (_normalizeEmail_(ctx.proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL]) !== _normalizeEmail_(email)) {
      throw new Error('Você só pode dar o de acordo na sua própria Ata.');
    }

    const pendentes = this._otherMembers(ctx).length - this._signedEmails(ctx).length + 1;
    if (pendentes > 0) {
      throw new Error(`Ainda faltam ${pendentes} assinatura(s) da banca. ` +
                      `O seu de acordo é o último.`);
    }

    const hash = _minutesHash_(ctx.proposal, ctx.committee, ctx.defense);
    const now = new Date().toISOString();

    const patch = {};
    patch[DB_COLS_DEFENSE.STUDENT_AGREEMENT]    = _signMinutes_(email, hash, now);
    patch[DB_COLS_DEFENSE.STUDENT_AGREEMENT_AT] = now;
    this._dao().update(ctx.defense[DB_COLS_DEFENSE.DEFENSE_ID], patch);

    this._advance(ctx, TccStatus.MINUTES_SIGNED);
    this._log().logTransition(
      proposalId, TccStatus.MINUTES_SIGNED, userRole, email,
      'Aluno deu o de acordo. Ata completamente assinada.', UserRole.INCHARGE
    );
    return { success: true };
  }

  /** O Responsável fecha a fase de Defesa e abre a revisão. */
  homologateDefense(userRole, email, proposalId) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canHomologateDefense(userRole)) {
      throw new Error('Apenas o Responsável homologa uma defesa com a Ata já assinada.');
    }
    this._advance(ctx, TccStatus.DEFENSE_HOMOLOGATED);
    this._log().logTransition(
      proposalId, TccStatus.DEFENSE_HOMOLOGATED, userRole, email,
      'Defesa homologada pelo Responsável. Início da revisão e entrega final.',
      UserRole.STUDENT
    );
    return { success: true };
  }

  // ------------------------------------------------------------ Fase 5

  /**
   * O aluno entrega a versão final e o comprovante do RIU.
   *
   * O PDF vai para uma coluna PRÓPRIA, e não sobre Proposals.WorkFileId: aquele
   * é o arquivo que a banca julgou, e sobrescrevê-lo apagaria a versão avaliada.
   */
  submitFinalWork(userRole, email, proposalId, data) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canSubmitFinalWork(userRole)) {
      throw new Error('A entrega final só é possível depois da homologação da defesa.');
    }
    if (!ctx.defense) throw new Error('Ata não encontrada.');
    if (_normalizeEmail_(ctx.proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL]) !== _normalizeEmail_(email)) {
      throw new Error('Você só pode entregar o seu próprio trabalho.');
    }

    const input = data || {};
    const patch = {};

    if (input.file && input.file.bytes) {
      const name = getPersonName_(email, this.semesterId, email);
      patch[DB_COLS_DEFENSE.FINAL_WORK_FILE_ID] =
        _storePdf_(this.folderId, input.file, `TCC final - ${name}.pdf`);
    }
    const riuUrl = String(input.riuUrl || '').trim();
    if (riuUrl) {
      patch[DB_COLS_DEFENSE.RIU_RECEIPT_URL] = riuUrl;
      // A data só muda quando o comprovante muda: reenviar o mesmo link junto
      // com um PDF corrigido não é uma nova entrega do RIU.
      if (riuUrl !== String(ctx.defense[DB_COLS_DEFENSE.RIU_RECEIPT_URL] || '')) {
        ensureColumns_(this.semesterId, DB_SHEETS.DEFENSES, DB_COLS_DEFENSE);
        patch[DB_COLS_DEFENSE.RIU_SUBMITTED_AT] = new Date().toISOString();
      }
    }
    if (!Object.keys(patch).length) {
      throw new Error('Envie o PDF final, o comprovante do RIU, ou os dois.');
    }

    this._dao().update(ctx.defense[DB_COLS_DEFENSE.DEFENSE_ID], patch);

    // Só avança quando as DUAS entregas existirem: o Responsável fecha a nota
    // olhando um conjunto completo, e um status que dissesse "submetido" com
    // metade faltando o faria conferir na mão.
    const merged = Object.assign({}, ctx.defense, patch);
    const completo = merged[DB_COLS_DEFENSE.FINAL_WORK_FILE_ID] &&
                     merged[DB_COLS_DEFENSE.RIU_RECEIPT_URL];

    if (completo && ctx.proposal[DB_COLS_PROPOSAL.STATUS] !== TccStatus.FINAL_WORK_SUBMITTED) {
      this._advance(ctx, TccStatus.FINAL_WORK_SUBMITTED);
      this._log().logTransition(
        proposalId, TccStatus.FINAL_WORK_SUBMITTED, userRole, email,
        'Versão final e comprovante do RIU entregues.', UserRole.INCHARGE
      );
    }
    return { success: true, complete: !!completo };
  }

  /** O Responsável lança a nota e fecha o TCC. */
  finalize(userRole, email, proposalId) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canFinalize(userRole)) {
      throw new Error('Só é possível finalizar depois da entrega final do aluno.');
    }
    const media = ctx.defense ? ctx.defense[DB_COLS_DEFENSE.FINAL_GRADE] : '';
    this._advance(ctx, TccStatus.FINISHED);
    this._log().logTransition(
      proposalId, TccStatus.FINISHED, userRole, email,
      `TCC finalizado pelo Responsável. Média final: ${media}.`, UserRole.STUDENT
    );
    return { success: true };
  }

  // ------------------------------------------------- Fluxos alternativos

  /**
   * Encerra o TCC sem banca: aproveitamento de estudos ou desistência.
   *
   * Disponível em qualquer status não terminal, porque é isso que o caso pede —
   * um aluno desiste quando desiste, e um aproveitamento pode chegar antes da
   * primeira proposta. O parecer é obrigatório e vai para o log com o e-mail de
   * quem encerrou: é lá que a auditoria vai procurar quando o NDE fechar o
   * procedimento e a regra real chegar.
   */
  closeWithoutDefense(userRole, email, proposalId, data) {
    const ctx = this._context(proposalId);
    if (!ctx.state.canCloseWithoutDefense(userRole)) {
      throw new Error('Este TCC já está encerrado.');
    }

    const input = data || {};
    const parecer = String(input.parecer || '').trim();
    if (!parecer) throw new Error('Escreva o parecer do encerramento.');

    const byCredit = input.outcome === 'aproveitamento';
    const status = byCredit ? TccStatus.FINISHED_BY_CREDIT : TccStatus.NOT_FINISHED;

    if (byCredit) {
      // O campo vazio precisa ser barrado ANTES da conversão: Number('') é 0,
      // não NaN, então "esqueci de digitar" viraria "nota zero" — e zero é uma
      // nota perfeitamente válida, que ninguém questionaria depois.
      const raw = String(input.nota === undefined || input.nota === null ? '' : input.nota).trim();
      const nota = raw === '' ? NaN : Number(raw.replace(',', '.'));
      if (isNaN(nota) || nota < 0 || nota > 10) {
        throw new Error('Informe a nota do aproveitamento (0 a 10).');
      }
      // Não há Ata, então a nota mora onde a média moraria — é o número que o
      // Responsável vai transferir para o e-campus.
      this._upsertGradeOnly(ctx, Math.round(nota * 100) / 100);
    }

    this._advance(ctx, status);
    this._log().logAction(
      proposalId, status, userRole, email,
      byCredit ? 'TCC finalizado por aproveitamento de estudos.'
               : 'TCC encerrado sem finalização.',
      parecer, UserRole.STUDENT
    );
    return { success: true };
  }

  /** Guarda a nota do aproveitamento numa linha de Defenses sem banca. */
  _upsertGradeOnly(ctx, nota) {
    const dao = this._dao();
    if (ctx.defense) {
      const patch = {};
      patch[DB_COLS_DEFENSE.FINAL_GRADE] = nota;
      dao.update(ctx.defense[DB_COLS_DEFENSE.DEFENSE_ID], patch);
      return;
    }
    ensureColumns_(this.semesterId, DB_SHEETS.DEFENSES, DB_COLS_DEFENSE);
    const record = {};
    record[DB_COLS_DEFENSE.DEFENSE_ID]   = Utilities.getUuid();
    record[DB_COLS_DEFENSE.COMMITTEE_ID] = '';
    record[DB_COLS_DEFENSE.PROPOSAL_ID]  = ctx.proposal[DB_COLS_PROPOSAL.PROPOSAL_ID];
    record[DB_COLS_DEFENSE.FINAL_GRADE]  = nota;
    record[DB_COLS_DEFENSE.APPROVAL_STATUS] = VerdictStatus.APPROVED;
    dao.insert(record);
  }

  // ---------------------------------------------------------- auxiliares

  /** Move o status único, que vive na proposta. */
  _advance(ctx, status) {
    ctx.proposal[DB_COLS_PROPOSAL.STATUS] = status;
    ctx.proposal[DB_COLS_PROPOSAL.UPDATED_AT] = new Date().toISOString();
    this._proposalDao().update(ctx.proposal[DB_COLS_PROPOSAL.PROPOSAL_ID], ctx.proposal);
  }
}

// ==========================================
// DOCUMENTOS EM PDF (Fase 4b)
// ==========================================

/**
 * Substitui, dentro de uma linha-modelo de tabela, os marcadores de um membro.
 * Separado porque os dois templates usam a mesma convenção.
 */
function _fillMemberRow_(row, member) {
  const map = {
    '{{MEMBRO_NOME}}':        member.nome,
    '{{MEMBRO_TITULACAO}}':   member.titulacao,
    '{{MEMBRO_INSTITUICAO}}': member.instituicao,
    '{{MEMBRO_NOTA}}':        member.nota,
    '{{MEMBRO_ASSINATURA}}':  member.assinatura,
    '{{MEMBRO_DATA}}':        member.data
  };
  Object.keys(map).forEach(k => {
    row.replaceText(k.replace(/[{}]/g, '\\$&'), String(map[k] === undefined ? '' : map[k]));
  });
}

/**
 * Expande a lista de membros dentro do documento.
 *
 * A banca tem de 3 a 5 pessoas, então o template traz UMA linha-modelo com os
 * marcadores `{{MEMBRO_*}}`: ela é copiada por membro e depois removida. Sem
 * isso o template teria de fixar cinco linhas e sobrariam linhas vazias nas
 * bancas de três.
 */
function _expandMemberRows_(body, members) {
  const tables = body.getTables();
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t];
    for (let r = 0; r < table.getNumRows(); r++) {
      const row = table.getRow(r);
      if (row.getText().indexOf('{{MEMBRO_NOME}}') === -1) continue;

      members.forEach(m => {
        const copy = row.copy();
        _fillMemberRow_(copy, m);
        table.appendTableRow(copy);
      });
      table.removeRow(r);
      return true;
    }
  }
  return false;
}

/**
 * Duplica um template, substitui os marcadores e exporta em PDF.
 *
 * Mesmo padrão do documento da proposta, e pelo mesmo motivo: o layout
 * institucional fica sob controle do Responsável, num Doc que ele edita, sem
 * passar por alteração de código. Se a Biblioteca Central mudar a exigência da
 * Folha de Aprovação, muda o template.
 */
function _renderTemplateToPdf_(templateId, folderId, fileName, replacements, members, notice) {
  const folder = DriveApp.getFolderById(folderId);
  const copy = DriveApp.getFileById(templateId).makeCopy('~tmp ' + fileName, folder);

  try {
    const doc = DocumentApp.openById(copy.getId());
    const sections = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(s => s);

    if (members && members.length) _expandMemberRows_(doc.getBody(), members);

    sections.forEach(section => {
      Object.keys(replacements).forEach(key => {
        section.replaceText(`\\{\\{${key}\\}\\}`, String(replacements[key] === undefined ? '' : replacements[key]));
      });
    });

    if (notice) doc.getBody().insertParagraph(0, notice);
    _warnAboutLeftoverPlaceholders_(doc, sections);
    doc.saveAndClose();

    const pdf = folder.createFile(
      DriveApp.getFileById(copy.getId()).getAs('application/pdf').setName(fileName)
    );
    return pdf.getId();
  } finally {
    // A cópia intermediária não interessa a ninguém: o que fica é o PDF. Sem
    // isto, cada emissão deixaria mais um Doc solto na pasta do período.
    try { copy.setTrashed(true); } catch(e) {
      console.error('_renderTemplateToPdf_: falha ao descartar a cópia:', e);
    }
  }
}

/** Data e hora legíveis, no fuso do script. */
function _formatBr_(value, pattern) {
  if (!value) return '';
  const date = (value instanceof Date) ? value : parseDateInput(value);
  if (!(date instanceof Date) || isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), pattern);
}

// ==========================================
// EXPOSED FRONT-END ENTRY POINTS
// ==========================================

function _executeDefenseCommand_(commandName, argsObj) {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.assertActiveSession();
    if (!ctx.sheetId) throw new Error(semesterUnavailableMessage(ctx));
    if (ctx.role === UserRole.ERROR) throw new Error("Acesso não autorizado.");

    const service = new DefenseService(ctx.sheetId, ctx.folderId);
    const { proposalId, data } = argsObj;
    let result;

    switch (commandName) {
      case 'CREATE':        result = service.createMinutes(ctx.role, ctx.email, proposalId); break;
      case 'SAVE':          result = service.saveMinutes(ctx.role, ctx.email, proposalId, data); break;
      case 'SIGN_ADVISOR':  result = service.signAsAdvisor(ctx.role, ctx.email, proposalId, data); break;
      case 'SIGN_MEMBER':   result = service.signAsMember(ctx.role, ctx.email, proposalId); break;
      case 'AGREE':         result = service.studentAgreement(ctx.role, ctx.email, proposalId); break;
      case 'HOMOLOGATE':    result = service.homologateDefense(ctx.role, ctx.email, proposalId); break;
      case 'FINAL_WORK':    result = service.submitFinalWork(ctx.role, ctx.email, proposalId, data); break;
      case 'FINALIZE':      result = service.finalize(ctx.role, ctx.email, proposalId); break;
      case 'CLOSE':         result = service.closeWithoutDefense(ctx.role, ctx.email, proposalId, data); break;
      default: throw new Error("Comando de defesa inválido.");
    }

    if (result && result.success) result.dashboard = _dashboardPayloadForRole_(ctx.role);
    return result;
  } catch (err) {
    console.error(`Erro ao executar command ${commandName}`, err);
    return { success: false, msg: err.message };
  }
}

function cmdCreateMinutes(proposalId)          { return _executeDefenseCommand_('CREATE', { proposalId }); }
function cmdSaveMinutes(proposalId, data)      { return _executeDefenseCommand_('SAVE', { proposalId, data }); }
function cmdSignMinutesAsAdvisor(proposalId, data) { return _executeDefenseCommand_('SIGN_ADVISOR', { proposalId, data }); }
function cmdSignMinutes(proposalId)            { return _executeDefenseCommand_('SIGN_MEMBER', { proposalId }); }
function cmdStudentAgreement(proposalId)       { return _executeDefenseCommand_('AGREE', { proposalId }); }
function cmdHomologateDefense(proposalId)      { return _executeDefenseCommand_('HOMOLOGATE', { proposalId }); }
function cmdSubmitFinalWork(proposalId, data)  { return _executeDefenseCommand_('FINAL_WORK', { proposalId, data }); }
function cmdFinalizeTcc(proposalId)            { return _executeDefenseCommand_('FINALIZE', { proposalId }); }
function cmdCloseTcc(proposalId, data)         { return _executeDefenseCommand_('CLOSE', { proposalId, data }); }

/**
 * Emite (ou reaproveita) um dos dois PDFs e devolve o id do arquivo.
 *
 * Quem pode: qualquer membro da banca e o Responsável pegam a **Ata** — é o
 * comprovante de participação que cada um leva para a própria instituição. A
 * **Folha de Aprovação** é do aluno, que a anexa ao trabalho, e do Responsável.
 *
 * Encerrado o período, só o Responsável reemite: o período sai dos ativos e
 * ninguém mais entra nele, então na prática é ele quem sobra.
 */
function cmdGenerateDefenseDocument(proposalId, kind) {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.assertActiveSession();
    if (!ctx.sheetId) throw new Error(semesterUnavailableMessage(ctx));

    const service = new DefenseService(ctx.sheetId, ctx.folderId);
    const dctx = service._context(proposalId);
    if (!dctx.defense) throw new Error('Ata não encontrada.');
    if (kind === 'ata-papel') {
      service._assertAdvisor(dctx, ctx.email);
      if (!dctx.state.canRecordVerdict(ctx.role)) {
        throw new Error('A via em papel está disponível antes de o Orientador assinar a Ata.');
      }
      const fileId = _buildDefensePdf_(service, dctx, false, getAtaTemplateId_(), true);
      return { success: true, fileId: fileId };
    }

    if (!dctx.defense[DB_COLS_DEFENSE.STUDENT_AGREEMENT]) {
      throw new Error('Os documentos só podem ser emitidos depois de a Ata estar completamente assinada.');
    }

    const isStudent  = _normalizeEmail_(dctx.proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL]) === _normalizeEmail_(ctx.email);
    const isMember   = !!service._memberOf(dctx, ctx.email);
    const isIncharge = ctx.role === UserRole.INCHARGE;
    const wantsSheet = kind === 'folha';

    const allowed = isIncharge || (wantsSheet ? isStudent : isMember);
    if (!allowed) {
      throw new Error(wantsSheet
        ? 'A Folha de Aprovação é do aluno.'
        : 'A Ata é dos membros da banca.');
    }

    const column = wantsSheet ? DB_COLS_DEFENSE.APPROVAL_SHEET_PDF_ID : DB_COLS_DEFENSE.MINUTES_PDF_ID;
    // Gerado uma vez e reusado: o conteúdo não muda mais depois do de acordo, e
    // reemitir a cada clique encheria a pasta do período de cópias idênticas.
    const existing = dctx.defense[column];
    if (existing) return { success: true, fileId: existing };

    const templateId = wantsSheet ? getApprovalSheetTemplateId_() : getAtaTemplateId_();
    const fileId = _buildDefensePdf_(service, dctx, wantsSheet, templateId);

    const patch = {};
    patch[column] = fileId;
    service._dao().update(dctx.defense[DB_COLS_DEFENSE.DEFENSE_ID], patch);

    return { success: true, fileId: fileId };
  } catch (err) {
    console.error('cmdGenerateDefenseDocument error:', err);
    return { success: false, msg: err.message };
  }
}

/** Monta os marcadores e chama a renderização. */
function _buildDefensePdf_(service, dctx, wantsSheet, templateId, isDraft) {
  const grades = _parseJsonArray_(dctx.defense[DB_COLS_DEFENSE.MEMBERS_GRADES]);
  const gradeOf = {};
  grades.forEach(g => { gradeOf[_normalizeEmail_(g.email)] = g; });

  const members = dctx.members.map(m => {
    const g = gradeOf[_normalizeEmail_(m.email)] || {};
    return {
      nome:        m.nome,
      titulacao:   m.titulo,
      instituicao: m.inst,
      // A Folha de Aprovação não leva nota: ela atesta aprovação, não desempenho.
      nota:        wantsSheet ? '' : (g.nota === null || g.nota === undefined ? '' : g.nota),
      // O "carimbo de auditoria" que substitui a linha em branco: quem assinou,
      // quando, e um prefixo da assinatura que amarra ao conteúdo.
      assinatura:  g.assinatura ? ('assinado digitalmente — ' + String(g.assinatura).substring(0, 16)) : '',
      data:        _formatBr_(g.assinadoEm, 'dd/MM/yyyy HH:mm')
    };
  });

  const studentEmail = dctx.proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL];
  const when = dctx.committee[DB_COLS_COMMITTEE.DEFENSE_DATETIME];

  const replacements = {
    'ALUNO':            getPersonName_(studentEmail, service.semesterId, studentEmail),
    'MATRICULA':        dctx.proposal[DB_COLS_PROPOSAL.STUDENT_ID],
    'MATRÍCULA':        dctx.proposal[DB_COLS_PROPOSAL.STUDENT_ID],
    'TITULO':           dctx.committee[DB_COLS_COMMITTEE.FINAL_TITLE],
    'TÍTULO':           dctx.committee[DB_COLS_COMMITTEE.FINAL_TITLE],
    'DATA_DEFESA':      _formatBr_(when, 'dd/MM/yyyy'),
    'HORA_DEFESA':      _formatBr_(when, 'HH:mm'),
    'MODO':             dctx.committee[DB_COLS_COMMITTEE.DEFENSE_MODE],
    'PARECER':          dctx.defense[DB_COLS_DEFENSE.APPROVAL_STATUS],
    'MEDIA':            dctx.defense[DB_COLS_DEFENSE.FINAL_GRADE],
    'MÉDIA':            dctx.defense[DB_COLS_DEFENSE.FINAL_GRADE],
    'OBSERVACOES':      dctx.defense[DB_COLS_DEFENSE.BANK_OBSERVATIONS],
    'OBSERVAÇÕES':      dctx.defense[DB_COLS_DEFENSE.BANK_OBSERVATIONS],
    'CHAVE_VALIDACAO':  dctx.defense[DB_COLS_DEFENSE.VALIDATION_KEY],
    'CHAVE_VALIDAÇÃO':  dctx.defense[DB_COLS_DEFENSE.VALIDATION_KEY],
    'DE_ACORDO_ALUNO':  dctx.defense[DB_COLS_DEFENSE.STUDENT_AGREEMENT_AT]
      ? ('de acordo em ' + _formatBr_(dctx.defense[DB_COLS_DEFENSE.STUDENT_AGREEMENT_AT], 'dd/MM/yyyy HH:mm'))
      : ''
  };

  if (isDraft) {
    members.forEach(member => {
      member.nota = '________';
      member.assinatura = '';
      member.data = '';
    });
    ['PARECER', 'MEDIA', 'MÉDIA', 'OBSERVACOES', 'OBSERVAÇÕES'].forEach(key => {
      replacements[key] = '________________________';
    });
    ['CHAVE_VALIDACAO', 'CHAVE_VALIDAÇÃO', 'DE_ACORDO_ALUNO'].forEach(key => {
      replacements[key] = '';
    });
  }

  const label = isDraft ? 'Ficha de apoio à defesa'
    : wantsSheet ? 'Folha de Aprovacao' : 'Ata da Defesa';
  const fileName = `${label} - ${replacements['ALUNO']}.pdf`;
  return _renderTemplateToPdf_(templateId, service.folderId, fileName, replacements, members,
    isDraft ? 'FICHA DE APOIO À DEFESA — SEM ASSINATURAS — NÃO SUBSTITUI A ATA OFICIAL' : '');
}

/**
 * Resolve o token do link de assinatura: qual ata, e para quem.
 *
 * Devolve null quando o token não existe mais — o que é o caso normal depois de
 * a pessoa assinar, já que o token é de uso único.
 */
function findDefenseBySignatureToken_(sheetId, token) {
  const wanted = String(token || '').trim();
  if (!wanted) return null;

  const service = new DefenseService(sheetId, null);
  const defense = service._dao().getAll().find(row => {
    const tokens = JSON.parse(row[DB_COLS_DEFENSE.SIGNATURE_TOKENS] || '{}');
    return Object.keys(tokens).some(k => tokens[k] === wanted);
  });
  if (!defense) return null;

  const tokens = JSON.parse(defense[DB_COLS_DEFENSE.SIGNATURE_TOKENS] || '{}');
  const email = Object.keys(tokens).find(k => tokens[k] === wanted);

  const committee = service._committeeDao().getById(defense[DB_COLS_DEFENSE.COMMITTEE_ID]);
  if (!committee) return null;

  const proposalId = committee[DB_COLS_COMMITTEE.PROPOSAL_ID];
  const ctx = service._context(proposalId);
  return {
    proposalId: proposalId,
    memberEmail: email,
    studentName: getPersonName_(ctx.proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL], sheetId, ''),
    defense: _buildDefensePayload_(defense, ctx.members)
  };
}

/**
 * Confere um documento pela chave impressa nele.
 *
 * Recomputa o conteúdo canônico e cada HMAC: se alguém editou a planilha depois
 * das assinaturas, o hash muda e todas elas passam a não conferir. É esse o
 * ponto — a assinatura não protege o arquivo, protege o **conteúdo**.
 */
function verifyDefenseKey(key) {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    if (!ctx.sheetId) return { found: false, msg: semesterUnavailableMessage(ctx) };

    const wanted = String(key || '').trim().toUpperCase();
    if (!wanted) return { found: false, msg: 'Informe a chave de validação.' };

    const service = new DefenseService(ctx.sheetId, ctx.folderId);
    const defense = service._dao().getAll().find(
      row => String(row[DB_COLS_DEFENSE.VALIDATION_KEY] || '').trim().toUpperCase() === wanted
    );
    if (!defense) return { found: false, msg: 'Nenhum documento com esta chave.' };

    const committee = service._committeeDao().getById(defense[DB_COLS_DEFENSE.COMMITTEE_ID]);
    const proposal = committee
      ? service._proposalDao().getById(committee[DB_COLS_COMMITTEE.PROPOSAL_ID])
      : null;
    if (!committee || !proposal) return { found: false, msg: 'Registro incompleto para esta chave.' };

    const hash = _minutesHash_(proposal, committee, defense);
    const grades = _parseJsonArray_(defense[DB_COLS_DEFENSE.MEMBERS_GRADES]);

    const signatures = grades.map(g => ({
      nome: g.nome,
      assinadoEm: g.assinadoEm || '',
      confere: !!g.assinadoEm &&
               _signMinutes_(g.email, hash, g.assinadoEm) === String(g.assinatura)
    }));

    const studentAt = defense[DB_COLS_DEFENSE.STUDENT_AGREEMENT_AT];
    const studentOk = !!studentAt &&
      _signMinutes_(proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL], hash, studentAt) ===
        String(defense[DB_COLS_DEFENSE.STUDENT_AGREEMENT]);

    return JSON.parse(JSON.stringify({
      found: true,
      aluno: getPersonName_(proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL], ctx.sheetId, ''),
      titulo: committee[DB_COLS_COMMITTEE.FINAL_TITLE],
      defesa: _formatBr_(committee[DB_COLS_COMMITTEE.DEFENSE_DATETIME], 'dd/MM/yyyy HH:mm'),
      parecer: defense[DB_COLS_DEFENSE.APPROVAL_STATUS],
      media: defense[DB_COLS_DEFENSE.FINAL_GRADE],
      signatures: signatures,
      studentAgreement: { assinadoEm: _formatBr_(studentAt, 'dd/MM/yyyy HH:mm'), confere: studentOk },
      // Íntegro é: todas as assinaturas esperadas existem E todas conferem.
      integro: signatures.length > 0 && signatures.every(s => s.confere) && studentOk
    }));
  } catch (err) {
    console.error('verifyDefenseKey error:', err);
    return { found: false, msg: err.message };
  }
}
