/**
 * FILE: ServiceDashboard.js
 * DESC: Data aggregation layer for dashboard views. Merges the people tables
 *       and the term's Sheets-based records into a single payload for each
 *       dashboard role.
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

/**
 * Shapes a Committees record for the client (members parsed out of JSON),
 * or returns null when the committee has not been assembled yet.
 * getStatusBadgeClass/getStatusPhase live in utils.js — the status is a
 * single TccStatus for the whole lifecycle.
 */
function _buildCommitteePayload_(record) {
  if (!record) return null;
  return {
    committeeId:     record[DB_COLS_COMMITTEE.COMMITTEE_ID],
    finalTitle:      record[DB_COLS_COMMITTEE.FINAL_TITLE],
    // Back to the "YYYY-MM-DDTHH:mm" string the datetime-local input needs
    defenseDatetime: formatDatetimeInput(record[DB_COLS_COMMITTEE.DEFENSE_DATETIME]),
    defenseMode:     record[DB_COLS_COMMITTEE.DEFENSE_MODE],
    members:         _parseJsonArray_(record[DB_COLS_COMMITTEE.MEMBERS_DATA])
  };
}

/**
 * Shapes a Defenses record for the client. Devolve null quando a Ata ainda não
 * foi gerada — que é o estado de todo TCC antes da Fase 4.
 */
function _buildDefensePayload_(record, members) {
  if (!record) return null;

  const grades = _parseJsonArray_(record[DB_COLS_DEFENSE.MEMBERS_GRADES]);
  const gradeOf = {};
  grades.forEach(g => { gradeOf[_normalizeEmail_(g.email)] = g; });

  // A lista sai da BANCA e não das notas: é a banca que define quem são os
  // membros, e uma nota órfã (membro trocado depois) não deve virar linha.
  const rows = (members || []).map(m => {
    const g = gradeOf[_normalizeEmail_(m.email)] || {};
    return {
      email:      _normalizeEmail_(m.email),
      nome:       m.nome,
      titulo:     m.titulo,
      inst:       m.inst,
      nota:       (g.nota === null || g.nota === undefined) ? '' : g.nota,
      assinadoEm: g.assinadoEm || '',
      isPresidente: !!m.isPresidente
    };
  });

  return {
    defenseId:      record[DB_COLS_DEFENSE.DEFENSE_ID],
    membros:        rows,
    observacoes:    record[DB_COLS_DEFENSE.BANK_OBSERVATIONS] || '',
    parecer:        record[DB_COLS_DEFENSE.APPROVAL_STATUS] || '',
    media:          record[DB_COLS_DEFENSE.FINAL_GRADE],
    advisorSignedAt:   record[DB_COLS_DEFENSE.ADVISOR_SIGNED_AT] || '',
    studentAgreedAt:   record[DB_COLS_DEFENSE.STUDENT_AGREEMENT_AT] || '',
    validationKey:     record[DB_COLS_DEFENSE.VALIDATION_KEY] || '',
    minutesPdfId:      record[DB_COLS_DEFENSE.MINUTES_PDF_ID] || '',
    approvalSheetPdfId: record[DB_COLS_DEFENSE.APPROVAL_SHEET_PDF_ID] || '',
    finalWorkFileId:   record[DB_COLS_DEFENSE.FINAL_WORK_FILE_ID] || '',
    riuReceiptUrl:     record[DB_COLS_DEFENSE.RIU_RECEIPT_URL] || '',
    pendentes:      rows.filter(r => !r.assinadoEm).length
  };
}

/** Builds grade rows without exposing the evaluator to the student. */
function _buildStudentDefensePayload_(record, members) {
  const payload = _buildDefensePayload_(record, members);
  if (!payload) return null;
  // Sort by grade so row numbers do not reveal the committee roster order.
  const grades = payload.membros.map(member => member.nota)
    .sort((a, b) => a === '' ? (b === '' ? 0 : 1) : b === '' ? -1 : Number(a) - Number(b));
  payload.membros = grades.map((grade, index) => ({
    nome: 'Membro ' + (index + 1),
    nota: grade
  }));
  payload.anonymousGrades = true;
  return payload;
}

/**
 * Índices da Fase 4 para um período: banca por proposta e ata por banca.
 *
 * Lidos de uma vez por painel. O painel do Responsável tem uma linha por aluno,
 * e buscar a ata de cada um custaria uma varredura da aba inteira por linha.
 */
function _defenseIndex_(sheetId) {
  const committees = getSheetManager_(sheetId, DB_SHEETS.COMMITTEES, DB_COLS_COMMITTEE.COMMITTEE_ID).getAll();
  const defenses   = getSheetManager_(sheetId, DB_SHEETS.DEFENSES,   DB_COLS_DEFENSE.DEFENSE_ID).getAll();

  const byProposal = {};
  const defenseByCommittee = {};
  defenses.forEach(d => { defenseByCommittee[d[DB_COLS_DEFENSE.COMMITTEE_ID]] = d; });

  committees.forEach(c => {
    const id = c[DB_COLS_COMMITTEE.COMMITTEE_ID];
    byProposal[c[DB_COLS_COMMITTEE.PROPOSAL_ID]] = {
      committee: c,
      members:   _parseJsonArray_(c[DB_COLS_COMMITTEE.MEMBERS_DATA]),
      defense:   defenseByCommittee[id] || null
    };
  });
  return byProposal;
}

/**
 * O cadastro do próprio Orientador: preenche o "Meus Dados" e a linha do
 * presidente na formação da banca.
 *
 * Uma fonte só para os dois. Antes o painel mandava apenas nome e e-mail, e o
 * formulário da banca nascia com titulação e instituição em branco mesmo
 * estando gravadas em Teachers — o Orientador redigitava a cada banca dados
 * que o sistema já tinha, e cada redigitação era uma chance de a Ata sair
 * diferente do cadastro.
 *
 * Quem é membro de banca sem ser professor cadastrado não tem linha em
 * Teachers; aí sobra o nome da sessão, que é o que getPersonName_ devolve.
 */
function _advisorProfile_(email, sheetId, sessionName) {
  const teacher = new PeopleService().getTeacher(email);
  return {
    name:        getPersonName_(email, sheetId, sessionName),
    email:       email,
    titulacao:   teacher ? String(teacher[DB_COLS_TEACHER.TITULACAO]   || '') : '',
    instituicao: teacher ? String(teacher[DB_COLS_TEACHER.INSTITUICAO] || '') : '',
    phone:       teacher ? String(teacher[DB_COLS_TEACHER.PHONE]       || '') : '',
    // Sem linha em Teachers não há o que editar: o painel esconde o "Meus
    // Dados" em vez de oferecer um formulário que o servidor vai recusar.
    isRegistered: !!teacher
  };
}

/** Latest entry a person wrote, for the quick indicator on the master table */
function _lastComment_(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === EventType.COMMENT) return events[i];
  }
  return null;
}

/**
 * Dashboard payload for a role, rebuilt right after a command has written.
 *
 * Commands return this so the panel renders from the SAME execution that wrote
 * the data. Reloading in a second execution used to show the state before the
 * action (the Advisor submitted the committee and the screen came back as if
 * nothing had happened; an F5 seconds later showed it right): a write is only
 * guaranteed to be visible to the execution that made it, and reading it back
 * from the next one races with the propagation of the change. It also halves
 * the round trips of every action.
 *
 * Returns null for an unknown role, in which case the client falls back to
 * loading the dashboard on its own.
 */
function _dashboardPayloadForRole_(role) {
  switch (role) {
    case UserRole.STUDENT:  return getStudentDashboardData();
    case UserRole.ADVISOR:  return getAdvisorDashboardData();
    case UserRole.INCHARGE: return getInchargeDashboardData();
    default: return null;
  }
}

/**
 * Builds the complete dataset for the Incharge (Responsável) dashboard.
 * Merges the term's Students table with the Proposals table.
 *
 * @returns {{ success: boolean, semester: string, metrics: object, rows: object[] }}
 */
function getInchargeDashboardData() {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.touchCurrentSession(); // keeps the idle timeout counting from the last interaction

    if (ctx.role !== UserRole.INCHARGE) {
      return { success: false, msg: 'Acesso restrito ao Responsável pela disciplina.' };
    }
    if (!ctx.sheetId) return { success: false, msg: semesterUnavailableMessage(ctx) };

    const sheetId    = ctx.sheetId;
    const semesterName = ctx.semester[DB_COLS_SEMESTER.SEMESTER];

    // Students enrolled in this term (Students tab of the term spreadsheet)
    const students = getSemesterStudents_(sheetId);

    // Get all proposals indexed by student email
    const proposalDao = getSheetManager_(sheetId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID);
    const proposals   = proposalDao.getAll();
    // Indexed by NORMALIZED e-mail on both sides: the address in Proposals was
    // typed on a form, the one in Students on another, and a row that differs
    // only in case used to show the student as having no proposal at all.
    const proposalByStudent = {};
    proposals.forEach(p => {
      proposalByStudent[_normalizeEmail_(p[DB_COLS_PROPOSAL.STUDENT_EMAIL])] = p;
    });

    // Registered teachers indexed by e-mail, so the master table can show the
    // advisor's name instead of the raw e-mail the student typed.
    //
    // The three-valued advisorInRoster of the Classroom era is gone with it:
    // there is no external system to be unavailable, so "not registered" is now
    // a fact, never a guess. The table reads the same local sheet the
    // authorization does.
    const teacherByEmail = {};
    getRegisteredTeachers_().forEach(t => { teacherByEmail[String(t.email).toLowerCase()] = t.name; });

    // Banca e Ata indexadas por proposta, para os painéis inline
    const phase4 = _defenseIndex_(sheetId);

    // Activity log of every proposal, read once for the whole table
    const eventsByProposal = new EventLogService(sheetId).getAllGrouped();

    // Build unified rows (one per student enrolled in the term)
    const rows = students.map(student => {
      const p = proposalByStudent[_normalizeEmail_(student.email)] || null;
      const status = p ? p[DB_COLS_PROPOSAL.STATUS] : TccStatus.NO_PROPOSAL;
      const state  = TccStateFactory.create(status);
      const proposalId = p ? p[DB_COLS_PROPOSAL.PROPOSAL_ID] : null;
      const events = (proposalId && eventsByProposal[proposalId]) || [];
      const advisorEmail = p ? p[DB_COLS_PROPOSAL.ADVISOR_EMAIL] : '';
      return {
        studentEmail:  student.email,
        studentName:   student.name,
        advisorEmail:  advisorEmail || '—',
        // Registered name, falling back to the e-mail when the advisor is not a
        // registered teacher (a typo by the student, for instance)
        advisorName:   advisorEmail
          ? (teacherByEmail[String(advisorEmail).toLowerCase()] || advisorEmail)
          : '—',
        // A pendência que só o Responsável pode resolver: o orientador indicado
        // pelo aluno não está cadastrado como professor, então não consegue nem
        // entrar no sistema. Agora ele resolve na hora, no próprio painel.
        advisorRegistered: !advisorEmail
          ? null
          : !!teacherByEmail[String(advisorEmail).toLowerCase()],
        proposalId:    proposalId,
        docId:         p ? p[DB_COLS_PROPOSAL.DOC_ID]         : '',
        // The TCC file itself, sent by the student to close Development
        workFileId:    p ? p[DB_COLS_PROPOSAL.WORK_FILE_ID]   : '',
        title:         p ? p[DB_COLS_PROPOSAL.TITLE]          : '—',
        status:        status,
        badgeClass:    getStatusBadgeClass(status),
        phaseIndex:    getStatusPhase(status),
        committee:     proposalId && phase4[proposalId]
          ? _buildCommitteePayload_(phase4[proposalId].committee) : null,
        defense:       proposalId && phase4[proposalId]
          ? _buildDefensePayload_(phase4[proposalId].defense, phase4[proposalId].members) : null,
        permissions: {
          canHomologate:          state.canHomologate(UserRole.INCHARGE),
          canHomologateCommittee: state.canHomologateCommittee(UserRole.INCHARGE),
          canHomologateDefense:   state.canHomologateDefense(UserRole.INCHARGE),
          canFinalize:            state.canFinalize(UserRole.INCHARGE),
          // Disponível em quase todo status: encerrar por aproveitamento ou
          // desistência não espera fase nenhuma.
          canCloseWithoutDefense: state.canCloseWithoutDefense(UserRole.INCHARGE)
        },
        events:        events,
        // Quick indicator next to the badge: the latest thing a person wrote.
        // System entries are left out on purpose — they repeat the status the
        // badge already shows. The whole log is one click away, in "Detalhes".
        lastNote:      _lastComment_(events)
      };
    });

    // Compute metrics
    const metrics = {
      totalStudents:               students.length,
      awaitingProposalHomologation: rows.filter(r => r.permissions.canHomologate).length,
      awaitingCommitteeHomologation: rows.filter(r => r.permissions.canHomologateCommittee).length,
      awaitingDefenseHomologation:  rows.filter(r => r.permissions.canHomologateDefense).length,
      awaitingFinalization:         rows.filter(r => r.permissions.canFinalize).length,
      finalized:                    rows.filter(r => r.status === TccStatus.FINISHED ||
                                                     r.status === TccStatus.FINISHED_BY_CREDIT).length,
      noProposal:                   rows.filter(r => r.status === TccStatus.NO_PROPOSAL).length
    };

    return JSON.parse(JSON.stringify({
      success: true,
      semester: semesterName,
      metrics: metrics,
      rows: rows,
      // The term code the student types on first access, and the faculty the
      // Incharge maintains. Both travel with the panel because both are managed
      // from it — and because an advisor "não cadastrado" in the table above is
      // fixed right here, without leaving the screen.
      enrollmentCode: ctx.enrollmentCode || '',
      // A guia Período Letivo mostra e corrige as datas de aula, e cita as de
      // criação e encerramento no sistema, que são outra coisa.
      semesterInfo: {
        classesStart: formatDateInput(ctx.semester[DB_COLS_SEMESTER.CLASSES_START]),
        classesEnd:   formatDateInput(ctx.semester[DB_COLS_SEMESTER.CLASSES_END]),
        createdAt:    _isoTimestamp_(ctx.semester[DB_COLS_SEMESTER.START_DATE]),
        endedAt:      _isoTimestamp_(ctx.semester[DB_COLS_SEMESTER.END_DATE])
      },
      teachers: getTeacherRegistry(),
      // O painel mostra, enquanto o Responsável digita o e-mail, se aquela
      // pessoa vai entrar pelo Google ou por senha. Quem decide continua sendo
      // o servidor (_isInstitutionalEmail_); isto é só para a tela poder dizer
      // antes, em vez de o cadastro surpreender depois.
      institutionalDomain: _institutionalDomain_()
    }));
  } catch(e) {
    console.error('getInchargeDashboardData error:', e);
    return { success: false, msg: 'Erro ao carregar dados do painel: ' + e.message };
  }
}

/**
 * Builds the complete dataset for the Student (Aluno) dashboard: the
 * student's own proposal/TCC record (if any), its current status, the
 * permissions the state machine grants a STUDENT in that status, and the
 * advisor's display name (resolved from the Teachers table, since the
 * Proposals sheet only stores the advisor's e-mail/phone).
 *
 * @returns {{ success: boolean, semester: string, status: string,
 *             badgeClass: string, data: object, permissions: object }}
 */
function getStudentDashboardData() {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.touchCurrentSession(); // keeps the idle timeout counting from the last interaction
    if (!ctx.sheetId) return { success: false, msg: semesterUnavailableMessage(ctx) };

    const sheetId   = ctx.sheetId;
    const semesterName = ctx.semester[DB_COLS_SEMESTER.SEMESTER];
    const email = ctx.email;

    const proposalDao = getSheetManager_(sheetId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID);
    const record = proposalDao.getAll().find(
      row => _normalizeEmail_(row[DB_COLS_PROPOSAL.STUDENT_EMAIL]) === _normalizeEmail_(email)
    ) || null;

    if (!record) {
      const emptyState = TccStateFactory.create(TccStatus.NO_PROPOSAL);
      return JSON.parse(JSON.stringify({
        success: true,
        semester: semesterName,
        status: TccStatus.NO_PROPOSAL,
        badgeClass: getStatusBadgeClass(TccStatus.NO_PROPOSAL),
        phaseIndex: getStatusPhase(TccStatus.NO_PROPOSAL),
        data: {
          studentEmail: email
        },
        committee: null,
        events: [],
        permissions: {
          canEdit:     emptyState.canEdit(UserRole.STUDENT),
          canSubmit:   emptyState.canSubmit(UserRole.STUDENT),
          canConclude: emptyState.canConclude(UserRole.STUDENT)
        }
      }));
    }

    const status = record[DB_COLS_PROPOSAL.STATUS];
    const state  = TccStateFactory.create(status);

    const advisorEmail = record[DB_COLS_PROPOSAL.ADVISOR_EMAIL];
    let advisorName = advisorEmail || '—';
    // Two states now, not three: registered (submitting is allowed) or not
    // (blocked until the Responsável adds the row). The old third value —
    // "unknown, the roster could not be read" — existed only because the answer
    // came from Google Classroom over the network; a local sheet either has the
    // row or does not.
    let advisorRegistered = null;
    if (advisorEmail) {
      const teacher = getRegisteredTeachers_()
        .find(t => String(t.email).toLowerCase() === String(advisorEmail).toLowerCase());
      advisorRegistered = !!teacher;
      if (teacher) advisorName = teacher.name;
    }

    const phase4 = _defenseIndex_(sheetId)[record[DB_COLS_PROPOSAL.PROPOSAL_ID]] || null;

    return JSON.parse(JSON.stringify({
      success: true,
      semester: semesterName,
      status: status,
      badgeClass: getStatusBadgeClass(status),
      phaseIndex: getStatusPhase(status),
      // Single source for the upload ceiling: utils.js. The client shows it in
      // the label and refuses oversized files before spending minutes encoding
      // them, but the server checks again — see ProposalService._storeWorkFile.
      workMaxMb: WORK_MAX_UPLOAD_MB,
      data: Object.assign({}, record, {
        advisorName: advisorName,
        advisorRegistered: advisorRegistered,
        // Sheet hands dates back as Date objects — the date input needs "YYYY-MM-DD"
        DefensePrediction: formatDateInput(record[DB_COLS_PROPOSAL.DEFENSE_PREDICTION])
      }),
      events: new EventLogService(sheetId).getByProposal(record[DB_COLS_PROPOSAL.PROPOSAL_ID]),
      // Read-only for the student: the committee is assembled by the advisor
      committee: phase4 ? _buildCommitteePayload_(phase4.committee) : null,
      defense:   phase4 ? _buildStudentDefensePayload_(phase4.defense, phase4.members) : null,
      permissions: {
        canEdit:     state.canEdit(UserRole.STUDENT),
        canSubmit:   state.canSubmit(UserRole.STUDENT),
        canConclude: state.canConclude(UserRole.STUDENT),
        // O de acordo é a última assinatura: a máquina de estados diz que é do
        // Aluno, e a contagem de pendentes diz se já chegou a vez dele.
        canAgree:    state.canAgree(UserRole.STUDENT) &&
                     !!phase4 && !!phase4.defense &&
                     _buildDefensePayload_(phase4.defense, phase4.members).pendentes === 0,
        canSubmitFinalWork: state.canSubmitFinalWork(UserRole.STUDENT)
      }
    }));
  } catch(e) {
    console.error('getStudentDashboardData error:', e);
    return { success: false, msg: 'Erro ao carregar dados do painel: ' + e.message };
  }
}

/**
 * As Atas em que `email` é membro da banca e ainda não assinou.
 *
 * Percorre o índice da Fase 4 já lido pelo painel, então não custa leitura
 * nova. O Orientador da proposta é filtrado fora: a assinatura dele acontece ao
 * fechar a Ata, não aqui.
 */
function _pendingSignaturesFor_(email, phase4, studentByEmail, proposalById) {
  const key = _normalizeEmail_(email);
  const out = [];

  Object.keys(phase4).forEach(proposalId => {
    const ph = phase4[proposalId];
    if (!ph.defense) return;
    if (!ph.defense[DB_COLS_DEFENSE.ADVISOR_SIGNED_AT]) return; // ainda não abriu
    if (ph.defense[DB_COLS_DEFENSE.STUDENT_AGREEMENT_AT]) return; // já encerrada

    const member = ph.members.find(m => _normalizeEmail_(m.email) === key);
    if (!member || member.isPresidente) return;

    const grade = _parseJsonArray_(ph.defense[DB_COLS_DEFENSE.MEMBERS_GRADES])
      .find(g => _normalizeEmail_(g.email) === key);
    if (grade && grade.assinadoEm) return; // já assinou

    const proposal = proposalById[proposalId];
    const student = proposal
      ? studentByEmail[_normalizeEmail_(proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL])]
      : null;

    out.push({
      proposalId:  proposalId,
      studentName: student ? student.name : '',
      title:       ph.committee[DB_COLS_COMMITTEE.FINAL_TITLE],
      defenseDatetime: formatDatetimeInput(ph.committee[DB_COLS_COMMITTEE.DEFENSE_DATETIME]),
      defense:     _buildDefensePayload_(ph.defense, ph.members)
    });
  });

  return out;
}

/**
 * Looks up a teacher of the active course by e-mail, so the Student proposal
 * form can confirm who the advisor is while it is still being filled in —
 * without it, a mistyped e-mail is only noticed after saving.
 *
 * @param {string} email
 * @returns {{ found: boolean, name: string }}
 */
function lookupAdvisorName(email) {
  try {
    const ctx = new AuthService().getContext();
    if (ctx.role === UserRole.ERROR || !email) {
      return { found: false, name: '' };
    }

    const key = _normalizeEmail_(email);
    const teacher = getRegisteredTeachers_()
      .find(t => _normalizeEmail_(t.email) === key);

    if (!teacher) return { found: false, name: '' };

    // Cadastrado, mas externo: não pode orientar (ver getAdvisorEmails_). Dizer
    // isso aqui poupa o aluno de descobrir só na submissão, e de pedir ao
    // Responsável um cadastro que já existe.
    if (teacher.isExternal) {
      return {
        found: false,
        name: teacher.name,
        msg: `${teacher.name} está cadastrado(a) como membro externo, que ` +
             `participa de banca mas não orienta TCC. Informe o e-mail ` +
             `institucional do(a) professor(a) da UFAM que orienta você.`
      };
    }

    return { found: true, name: teacher.name };
  } catch(e) {
    console.error('lookupAdvisorName error:', e);
    return { found: false, name: '' };
  }
}

/**
 * Builds the complete dataset for the Advisor (Orientador) dashboard: only
 * the proposals where the logged-in advisor is the assigned AdvisorEmail
 * (there is no separate "accept advisee" step — the relationship exists as
 * soon as a student names the advisor on their proposal). Each row carries
 * the full proposal record (for the master-detail view) plus the
 * ADVISOR-scoped permissions computed from the same state machine used by
 * the Student dashboard.
 *
 * @returns {{ success: boolean, semester: string, rows: object[] }}
 */
function getAdvisorDashboardData() {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.touchCurrentSession(); // keeps the idle timeout counting from the last interaction
    if (!ctx.sheetId) return { success: false, msg: semesterUnavailableMessage(ctx) };

    const sheetId   = ctx.sheetId;
    const semesterName = ctx.semester[DB_COLS_SEMESTER.SEMESTER];
    const email = ctx.email;
    const students = getSemesterStudents_(sheetId);

    const proposalDao = getSheetManager_(sheetId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID);
    // Normalized: the student types this address, so "Fulano@ufam.edu.br"
    // passed registration (which lowercases) and then matched nothing here —
    // the proposal was submitted and never appeared for its own advisor.
    const proposals = proposalDao.getAll();
    const proposalById = Object.create(null);
    proposals.forEach(p => { proposalById[p[DB_COLS_PROPOSAL.PROPOSAL_ID]] = p; });
    const studentByEmail = Object.create(null);
    students.forEach(student => {
      const key = _normalizeEmail_(student.email);
      if (!studentByEmail[key]) studentByEmail[key] = student;
    });
    const myProposals = proposals.filter(
      row => _normalizeEmail_(row[DB_COLS_PROPOSAL.ADVISOR_EMAIL]) === _normalizeEmail_(email)
    );

    const phase4 = _defenseIndex_(sheetId);
    // One read of the log serves every advisee
    const eventsByProposal = new EventLogService(sheetId).getAllGrouped();

    const rows = myProposals.map(p => {
      const status = p[DB_COLS_PROPOSAL.STATUS];
      const state  = TccStateFactory.create(status);
      const id     = p[DB_COLS_PROPOSAL.PROPOSAL_ID];
      const ph     = phase4[id] || null;
      const student = studentByEmail[_normalizeEmail_(p[DB_COLS_PROPOSAL.STUDENT_EMAIL])];

      return Object.assign({}, p, {
        studentName: student ? student.name : p[DB_COLS_PROPOSAL.STUDENT_EMAIL],
        // Sheet hands dates back as Date objects — the date input needs "YYYY-MM-DD"
        DefensePrediction: formatDateInput(p[DB_COLS_PROPOSAL.DEFENSE_PREDICTION]),
        badgeClass: getStatusBadgeClass(status),
        phaseIndex: getStatusPhase(status),
        events: eventsByProposal[id] || [],
        committee: ph ? _buildCommitteePayload_(ph.committee) : null,
        defense:   ph ? _buildDefensePayload_(ph.defense, ph.members) : null,
        permissions: {
          canApprove: state.canApprove(UserRole.ADVISOR),
          canReturn:  state.canReturn(UserRole.ADVISOR),
          canEditCommittee: state.canEditCommittee(UserRole.ADVISOR),
          canCreateMinutes: state.canCreateMinutes(UserRole.ADVISOR),
          canRecordVerdict: state.canRecordVerdict(UserRole.ADVISOR)
        }
      });
    });

    return JSON.parse(JSON.stringify({
      success: true,
      semester: semesterName,
      // Pre-fills the committee president (always the advisor) AND the "Meus
      // Dados" panel. Vem inteiro da tabela Teachers, nunca da tela de login:
      // é o que entra no registro da banca e, dali, na Ata e na Folha de
      // Aprovação — documentos oficiais.
      //
      // Titulação, instituição e telefone viajam junto porque já estavam
      // cadastrados: pedi-los de novo a cada banca era digitar duas vezes o
      // mesmo dado, com o segundo podendo divergir do primeiro.
      advisor: _advisorProfile_(email, sheetId, ctx.name),
      rows: rows,
      // Atas de OUTROS orientadores em que esta pessoa é membro de banca.
      //
      // Sem esta lista, um professor convidado para uma banca que não é dele —
      // e o convidado externo, que não orienta ninguém — não teria onde assinar:
      // o painel só mostra orientandos, e ele não tem nenhum ali.
      pendingSignatures: _pendingSignaturesFor_(email, phase4, studentByEmail, proposalById),
      // Para a guia "Convite aos Alunos": o código é de leitura aqui, quem
      // regenera é o Responsável (ver cmdRegenerateEnrollmentCode).
      enrollmentCode: ctx.enrollmentCode || ''
    }));
  } catch(e) {
    console.error('getAdvisorDashboardData error:', e);
    return { success: false, msg: 'Erro ao carregar dados do painel: ' + e.message };
  }
}
