/**
 * FILE: ServiceReport.js
 * DESC: Consolidado do período — um CSV com uma linha por aluno matriculado e
 *       os totais no fim, para o Responsável. As regras de cada coluna estão em
 *       docs/features/dashboard-incharge.md, "Consolidado do período".
 * AUTH: Andre Cavalcante
 * DATE: October, 2026
 * LICENCE: GPL-v3
 */

/**
 * O fluxo principal em ordem. A posição de um status aqui responde "já passou
 * por X?" — submeter a proposta, ter a banca homologada, ter a defesa
 * homologada — sem consultar o log. Os dois desfechos alternativos ficam de
 * fora de propósito: podem acontecer em qualquer ponto, então não dizem nada
 * sobre o que veio antes, e para eles a resposta vem do log (_reportReached_).
 * Função, e não var de topo, porque TccStatus mora em outro arquivo e a ordem
 * de carga dos arquivos do Apps Script não é garantida.
 */
function _reportFlow_() {
  return [
    TccStatus.NO_PROPOSAL, TccStatus.PROPOSAL_DRAFT, TccStatus.PROPOSAL_SUBMITTED,
    TccStatus.PROPOSAL_RETURNED, TccStatus.PROPOSAL_APPROVED, TccStatus.IN_DEVELOPMENT,
    TccStatus.TCC_CONCLUDED, TccStatus.COMMITTEE_SUBMITTED, TccStatus.COMMITTEE_HOMOLOGATED,
    TccStatus.MINUTES_CREATED, TccStatus.MINUTES_IN_SIGNATURES, TccStatus.MINUTES_SIGNED,
    TccStatus.DEFENSE_HOMOLOGATED, TccStatus.FINAL_WORK_SUBMITTED, TccStatus.FINISHED
  ];
}

var REPORT_PHASE_LABELS = ['Proposta', 'Desenvolvimento', 'Banca', 'Defesa', 'Encerramento'];

var ReportOutcome = Object.freeze({
  APPROVED: 'Aprovado',
  CREDIT: 'Aproveitamento',
  REJECTED: 'Reprovado por nota',
  DROPPED: 'Desistência'
});

/** O evento de sistema que um passo do fluxo deixa no log: quem agiu → para quem. */
function _isStep_(event, role, toRole) {
  return event.type === EventType.SYSTEM && event.role === role && event.toRole === toRole;
}

/**
 * Até onde o TCC chegou.
 *
 * Pelo status, quando ele está no fluxo principal. Nos desfechos alternativos
 * o status apagou o caminho, e quem lembra é o log: cada passo grava quem agiu
 * e para quem foi, e os dois pares abaixo só aparecem naqueles passos (ver a
 * tabela de direções em data-structure.md, aba Events).
 */
function _reportReached_(status, events, hasMinutes) {
  const flow = _reportFlow_();
  const rank = flow.indexOf(status);
  if (rank !== -1) {
    return {
      submitted:   rank >= flow.indexOf(TccStatus.PROPOSAL_SUBMITTED),
      homologated: rank >= flow.indexOf(TccStatus.COMMITTEE_HOMOLOGATED),
      defenseHomologated: rank >= flow.indexOf(TccStatus.DEFENSE_HOMOLOGATED)
    };
  }
  // Aluno → Orientador é submeter (ou reenviar, ou concluir — que vem depois de
  // submeter). Responsável → Orientador é só a homologação da banca.
  const submitted = events.some(e => _isStep_(e, UserRole.STUDENT, UserRole.ADVISOR));
  const homologated = hasMinutes ||
    events.some(e => _isStep_(e, UserRole.INCHARGE, UserRole.ADVISOR));
  return { submitted: submitted, homologated: homologated, defenseHomologated: false };
}

/**
 * Uma linha do consolidado, a partir dos registros crus do período.
 *
 * Pura: não lê planilha nenhuma, para poder ser testada sem o Apps Script.
 *
 * @param {object} student    { studentId, name, email }
 * @param {object|null} proposal  linha de Proposals
 * @param {object|null} committee linha de Committees
 * @param {object|null} defense   linha de Defenses (a da banca, ou a do aproveitamento)
 * @param {Array} events      log da proposta, como EventLogService.getAllGrouped
 */
function buildReportRow_(student, proposal, committee, defense, events) {
  const status = proposal ? proposal[DB_COLS_PROPOSAL.STATUS] : TccStatus.NO_PROPOSAL;
  const log = events || [];
  const fromCommittee = !!(defense && committee &&
    defense[DB_COLS_DEFENSE.COMMITTEE_ID] === committee[DB_COLS_COMMITTEE.COMMITTEE_ID]);
  const reached = _reportReached_(status, log, fromCommittee);

  // Notas, média e parecer só contam depois que o Orientador assina a Ata: até
  // lá são rascunho, salvo e corrigido quantas vezes ele quiser.
  const closedMinutes = fromCommittee && !!defense[DB_COLS_DEFENSE.ADVISOR_SIGNED_AT];
  const verdict = closedMinutes ? String(defense[DB_COLS_DEFENSE.APPROVAL_STATUS] || '') : '';

  const grades = closedMinutes ? _parseJsonArray_(defense[DB_COLS_DEFENSE.MEMBERS_GRADES]) : [];
  const notas = [];
  for (let i = 0; i < COMMITTEE_MAX_MEMBERS; i++) {
    const g = grades[i];
    notas.push(g && g.nota !== null && g.nota !== undefined && g.nota !== '' ? Number(g.nota) : '');
  }

  const byCredit = status === TccStatus.FINISHED_BY_CREDIT;
  const rawGrade = defense ? defense[DB_COLS_DEFENSE.FINAL_GRADE] : '';
  const media = ((byCredit || closedMinutes) && rawGrade !== '' && rawGrade !== null &&
                 rawGrade !== undefined) ? Number(rawGrade) : '';

  // Data da banca: nenhuma sem proposta submetida; a prevista (da proposta) até
  // a homologação; a marcada na banca a partir dela.
  let defenseDate = '';
  let defenseDateType = '';
  if (reached.submitted) {
    const real = committee ? committee[DB_COLS_COMMITTEE.DEFENSE_DATETIME] : '';
    const predicted = proposal ? proposal[DB_COLS_PROPOSAL.DEFENSE_PREDICTION] : '';
    if (reached.homologated && real) {
      defenseDate = real; defenseDateType = 'Real';
    } else if (predicted) {
      defenseDate = predicted; defenseDateType = 'Prevista';
    }
  }

  // Entrega final = o comprovante do RIU. Registros anteriores à coluna
  // RiuSubmittedAt caem no evento "TCC Final Submetido" (Aluno → Responsável),
  // que é quando o comprovante completou a entrega.
  let finalDelivery = '';
  if (fromCommittee && defense[DB_COLS_DEFENSE.RIU_RECEIPT_URL]) {
    finalDelivery = defense[DB_COLS_DEFENSE.RIU_SUBMITTED_AT] || '';
    if (!finalDelivery) {
      const step = log.filter(e => _isStep_(e, UserRole.STUDENT, UserRole.INCHARGE)).pop();
      finalDelivery = step ? step.timestamp : '';
    }
  }

  // Desfecho. A reprovação vem do PARECER, não do status: o fluxo ainda não tem
  // estado terminal de reprovação, e o reprovado segue até "TCC Finalizado"
  // (ou foi encerrado à mão como "Não Finalizado").
  let finished = '';
  let outcome = '';
  const rejected = verdict === VerdictStatus.REJECTED;
  if (byCredit) {
    finished = 'Sim'; outcome = ReportOutcome.CREDIT;
  } else if (rejected && (reached.defenseHomologated || status === TccStatus.NOT_FINISHED)) {
    finished = 'Não'; outcome = ReportOutcome.REJECTED;
  } else if (status === TccStatus.NOT_FINISHED) {
    finished = 'Não'; outcome = ReportOutcome.DROPPED;
  } else if (status === TccStatus.FINISHED) {
    finished = 'Sim'; outcome = ReportOutcome.APPROVED;
  }

  return {
    matricula:      student.studentId,
    nome:           student.name,
    fase:           REPORT_PHASE_LABELS[getStatusPhase(status)] || '',
    status:         status,
    entregouProjeto: reached.submitted ? 'Sim' : 'Não',
    tituloProjeto:  reached.submitted && proposal ? String(proposal[DB_COLS_PROPOSAL.TITLE] || '') : '',
    tituloFinal:    committee ? String(committee[DB_COLS_COMMITTEE.FINAL_TITLE] || '') : '',
    bancaFormada:   !reached.submitted ? '' : (reached.homologated ? 'Sim' : 'Não'),
    dataBanca:      defenseDate,
    tipoDataBanca:  defenseDateType,
    resultado:      verdict,
    notas:          notas,
    media:          media,
    entregaFinal:   finalDelivery,
    finalizou:      finished,
    motivo:         outcome
  };
}

/** Os totais do rodapé, na ordem em que saem. */
function reportTotals_(rows) {
  const count = fn => rows.filter(fn).length;
  const lines = [['Matriculados', rows.length]];

  REPORT_PHASE_LABELS.forEach(label => {
    lines.push(['Em andamento — ' + label, count(r => !r.finalizou && r.fase === label)]);
  });
  lines.push(['Encerrados', count(r => !!r.finalizou)]);
  lines.push(['Entregaram projeto', count(r => r.entregouProjeto === 'Sim')]);
  lines.push(['Bancas formadas', count(r => r.bancaFormada === 'Sim')]);
  Object.values(ReportOutcome).forEach(outcome => {
    lines.push(['Encerrados — ' + outcome, count(r => r.motivo === outcome)]);
  });

  // Só os aprovados pela banca: a nota do aproveitamento não é nota de banca,
  // e misturá-la deslocaria a média que se quer medir.
  const grades = rows.filter(r => r.motivo === ReportOutcome.APPROVED && r.media !== '')
    .map(r => r.media);
  const avg = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : '';
  lines.push(['Média dos aprovados pela banca', avg === '' ? '' : Math.round(avg * 100) / 100]);
  lines.push(['Menor média dos aprovados', grades.length ? Math.min.apply(null, grades) : '']);
  lines.push(['Maior média dos aprovados', grades.length ? Math.max.apply(null, grades) : '']);
  return lines;
}

// ------------------------------------------------------------------ CSV

/**
 * Texto sempre entre aspas, com a aspa interna dobrada (RFC 4180): ';' e quebra
 * de linha num título deixam de quebrar a tabela. O ' na frente de = + - @
 * impede o Excel de executar a célula como fórmula.
 */
function _csvText_(value) {
  const text = String(value === null || value === undefined ? '' : value);
  if (!text) return '';
  const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Número sem aspas e com vírgula decimal, como o Excel em português lê. */
function _csvNumber_(value, decimals) {
  if (value === '' || value === null || value === undefined || isNaN(Number(value))) return '';
  return Number(value).toFixed(decimals).replace('.', ',');
}

/**
 * Data sem aspas, dd/MM/yyyy no fuso do script. Aceita o que as planilhas
 * guardam: Date (datas digitadas em formulário), "yyyy-MM-dd" (datas de aula)
 * e ISO 8601 (carimbos de auditoria).
 */
function _csvDate_(value, pattern) {
  if (!value) return '';
  let date = value;
  if (!(value instanceof Date)) {
    const text = String(value).replace(/^'/, '');
    date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? parseDateInput(text) : new Date(text);
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), pattern || 'dd/MM/yyyy');
}

function _reportHeaders_() {
  return [
  'Matrícula', 'Nome', 'Fase', 'Status', 'Entregou projeto?', 'Título do Projeto',
  'Título Final', 'Banca formada?', 'Data da banca', 'Tipo da data', 'Resultado da banca'
].concat(Array.from({ length: COMMITTEE_MAX_MEMBERS }, (_, i) => 'Nota membro ' + (i + 1)))
 .concat(['Média final', 'Entrega final (RIU)', 'Finalizou?', 'Motivo da finalização']);
}

/**
 * O arquivo inteiro: cabeçalho do período, a tabela e os totais, separados por
 * uma linha em branco. Separador ';' e CRLF, como o Excel em português espera.
 */
function buildReportCsv_(info, rows, totals) {
  const line = cells => cells.join(';');
  const out = [
    line([_csvText_('Consolidado do período'), _csvText_(info.semester)]),
    line([_csvText_('Início das aulas'),        _csvDate_(info.classesStart)]),
    line([_csvText_('Fim das aulas'),           _csvDate_(info.classesEnd)]),
    line([_csvText_('Criado no sistema em'),    _csvDate_(info.createdAt)]),
    line([_csvText_('Encerrado no sistema em'), _csvDate_(info.endedAt)]),
    line([_csvText_('Gerado em'),               _csvDate_(info.generatedAt, 'dd/MM/yyyy HH:mm')]),
    '',
    line(_reportHeaders_().map(_csvText_))
  ];

  rows.forEach(r => {
    out.push(line([
      _csvText_(r.matricula), _csvText_(r.nome), _csvText_(r.fase), _csvText_(r.status),
      _csvText_(r.entregouProjeto), _csvText_(r.tituloProjeto), _csvText_(r.tituloFinal),
      _csvText_(r.bancaFormada), _csvDate_(r.dataBanca), _csvText_(r.tipoDataBanca),
      _csvText_(r.resultado)
    ].concat(r.notas.map(n => _csvNumber_(n, 2)))
     .concat([_csvNumber_(r.media, 2), _csvDate_(r.entregaFinal),
              _csvText_(r.finalizou), _csvText_(r.motivo)])));
  });

  out.push('');
  out.push(line([_csvText_('Totais')]));
  totals.forEach(([label, value], i) => {
    // As três últimas são médias; as demais, contagens.
    const isAverage = i >= totals.length - 3;
    out.push(line([_csvText_(label), _csvNumber_(value, isAverage ? 2 : 0)]));
  });
  return out.join('\r\n') + '\r\n';
}

// ==========================================
// EXPOSED FRONT-END ENTRY POINT (google.script.run)
// ==========================================

/**
 * O consolidado do período corrente, pronto para baixar. Só o Responsável:
 * traz nota e situação de todos os alunos, não só dos orientandos.
 *
 * @returns {{ success: boolean, fileName?: string, csv?: string, msg?: string }}
 */
function getSemesterReport() {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.touchCurrentSession();
    if (ctx.role !== UserRole.INCHARGE) {
      return { success: false, msg: 'Acesso restrito ao Responsável pela disciplina.' };
    }
    if (!ctx.sheetId) return { success: false, msg: semesterUnavailableMessage(ctx) };

    const sheetId = ctx.sheetId;
    const sem = ctx.semester;
    const semesterName = String(sem[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, '');

    const proposalByStudent = {};
    getSheetManager_(sheetId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID).getAll()
      .forEach(p => { proposalByStudent[_normalizeEmail_(p[DB_COLS_PROPOSAL.STUDENT_EMAIL])] = p; });

    const phase4 = _defenseIndex_(sheetId);
    // A linha do aproveitamento não tem banca, então não está no índice acima.
    const creditByProposal = {};
    getSheetManager_(sheetId, DB_SHEETS.DEFENSES, DB_COLS_DEFENSE.DEFENSE_ID).getAll()
      .filter(d => !d[DB_COLS_DEFENSE.COMMITTEE_ID] && d[DB_COLS_DEFENSE.PROPOSAL_ID])
      .forEach(d => { creditByProposal[d[DB_COLS_DEFENSE.PROPOSAL_ID]] = d; });
    const eventsByProposal = new EventLogService(sheetId).getAllGrouped();

    const rows = getSemesterStudents_(sheetId)
      .map(student => {
        const p = proposalByStudent[_normalizeEmail_(student.email)] || null;
        const id = p ? p[DB_COLS_PROPOSAL.PROPOSAL_ID] : null;
        const ph = id ? phase4[id] : null;
        return buildReportRow_(
          student, p,
          ph ? ph.committee : null,
          (ph && ph.defense) || (id && creditByProposal[id]) || null,
          (id && eventsByProposal[id]) || []
        );
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    const now = new Date();
    const csv = buildReportCsv_({
      semester:     semesterName,
      classesStart: sem[DB_COLS_SEMESTER.CLASSES_START],
      classesEnd:   sem[DB_COLS_SEMESTER.CLASSES_END],
      createdAt:    sem[DB_COLS_SEMESTER.START_DATE],
      endedAt:      sem[DB_COLS_SEMESTER.END_DATE],
      generatedAt:  now
    }, rows, reportTotals_(rows));

    const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return {
      success: true,
      fileName: `consolidado-${semesterName}-${stamp}.csv`,
      csv: csv
    };
  } catch(e) {
    console.error('getSemesterReport error:', e);
    return { success: false, msg: 'Erro ao gerar o consolidado: ' + e.message };
  }
}
