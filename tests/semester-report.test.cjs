/**
 * FILE: semester-report.test.cjs — regras do consolidado do período.
 * DESC: Roda ServiceReport.js num contexto vm, sem planilha: cada caso monta os
 *       registros crus de um aluno e confere a linha que sai no CSV.
 * AUTH: Andre Cavalcante
 * DATE: October, 2026
 * LICENCE: GPL-v3
 */
process.env.TZ = 'America/Manaus';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const two = n => String(n).padStart(2, '0');
  const context = vm.createContext({
    console,
    Session: { getScriptTimeZone: () => 'America/Manaus' },
    // Só os padrões que o relatório usa, no fuso do processo (TZ acima).
    Utilities: {
      formatDate(d, tz, pattern) {
        return pattern
          .replace('yyyy', d.getFullYear()).replace('MM', two(d.getMonth() + 1))
          .replace('dd', two(d.getDate())).replace('HH', two(d.getHours()))
          .replace('mm', two(d.getMinutes()));
      }
    }
  });
  for (const file of ['utils.js', 'ServiceReport.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  return context;
}

const c = load();
const S = c.TccStatus;
const student = { studentId: '21950001', name: 'Ana', email: 'ana@ufam.edu.br' };
const sys = (role, toRole, timestamp = '2026-09-01T12:00:00.000Z') =>
  ({ type: c.EventType.SYSTEM, role, toRole, timestamp });

function proposal(status, extra = {}) {
  return Object.assign({
    ProposalId: 'p1', StudentEmail: student.email, Title: 'Controle; "robusto"',
    Status: status, DefensePrediction: new Date(2026, 10, 20)
  }, extra);
}
const committee = { CommitteeId: 'c1', ProposalId: 'p1', FinalTitle: 'Controle robusto final',
  DefenseDatetime: new Date(2026, 10, 25, 14, 0) };
function defense(extra = {}) {
  return Object.assign({
    DefenseId: 'd1', CommitteeId: 'c1', AdvisorSignedAt: '2026-11-25T19:00:00.000Z',
    MembersGrades: JSON.stringify([{ email: 'a', nota: 8 }, { email: 'b', nota: 7.5 }, { email: 'c', nota: null }]),
    FinalGrade: 7.75, ApprovalStatus: c.VerdictStatus.APPROVED
  }, extra);
}
const row = (...args) => c.buildReportRow_(student, ...args);

test('sem proposta e rascunho: não entregou, e nada do resto aparece', () => {
  for (const r of [row(null, null, null, []), row(proposal(S.PROPOSAL_DRAFT), null, null, [])]) {
    assert.equal(r.entregouProjeto, 'Não');
    assert.equal(r.tituloProjeto, '');
    assert.equal(r.bancaFormada, '');
    assert.equal(r.dataBanca, '');
    assert.equal(r.tipoDataBanca, '');
    assert.equal(r.finalizou, '');
    assert.equal(r.fase, 'Proposta');
  }
});

test('proposta submetida: título, banca "Não" e data prevista', () => {
  const r = row(proposal(S.PROPOSAL_SUBMITTED), null, null, []);
  assert.equal(r.entregouProjeto, 'Sim');
  assert.equal(r.tituloProjeto, 'Controle; "robusto"');
  assert.equal(r.bancaFormada, 'Não');
  assert.equal(r.tipoDataBanca, 'Prevista');
  assert.equal(r.dataBanca.getDate(), 20);
});

test('banca submetida ainda é "Não", com a data prevista; homologada é "Sim", com a real', () => {
  const sub = row(proposal(S.COMMITTEE_SUBMITTED), committee, null, []);
  assert.equal(sub.bancaFormada, 'Não');
  assert.equal(sub.tipoDataBanca, 'Prevista');
  assert.equal(sub.tituloFinal, 'Controle robusto final');

  const hom = row(proposal(S.COMMITTEE_HOMOLOGATED), committee, null, []);
  assert.equal(hom.bancaFormada, 'Sim');
  assert.equal(hom.tipoDataBanca, 'Real');
  assert.equal(hom.dataBanca.getDate(), 25);
});

test('ata em rascunho (Orientador não assinou) não mostra notas, média nem parecer', () => {
  const r = row(proposal(S.MINUTES_CREATED), committee, defense({ AdvisorSignedAt: '' }), []);
  assert.deepEqual([...r.notas], ['', '', '', '', '']);
  assert.equal(r.media, '');
  assert.equal(r.resultado, '');
});

test('finalizado e aprovado: notas na ordem da banca, média, RIU e desfecho', () => {
  const r = row(proposal(S.FINISHED), committee,
    defense({ RiuReceiptUrl: 'https://riu', RiuSubmittedAt: '2026-12-02T15:00:00.000Z' }), []);
  assert.deepEqual([...r.notas], [8, 7.5, '', '', '']);
  assert.equal(r.media, 7.75);
  assert.equal(r.resultado, 'Aprovado');
  assert.equal(r.entregaFinal, '2026-12-02T15:00:00.000Z');
  assert.equal(r.finalizou, 'Sim');
  assert.equal(r.motivo, 'Aprovado');
});

test('reprovado só encerra depois da homologação da defesa', () => {
  const rejected = defense({ ApprovalStatus: c.VerdictStatus.REJECTED, FinalGrade: 3 });
  const signed = row(proposal(S.MINUTES_SIGNED), committee, rejected, []);
  assert.equal(signed.resultado, 'Reprovado');
  assert.equal(signed.finalizou, '');

  for (const status of [S.DEFENSE_HOMOLOGATED, S.FINISHED, S.NOT_FINISHED]) {
    const r = row(proposal(status), committee, rejected, []);
    assert.equal(r.finalizou, 'Não', status);
    assert.equal(r.motivo, 'Reprovado por nota', status);
  }
});

test('aproveitamento: média é a nota única, sem notas de membro e sem resultado de banca', () => {
  const credit = { DefenseId: 'd9', CommitteeId: '', ProposalId: 'p1', FinalGrade: 9,
    ApprovalStatus: c.VerdictStatus.APPROVED };
  const r = row(proposal(S.FINISHED_BY_CREDIT), null, credit, []);
  assert.equal(r.media, 9);
  assert.deepEqual([...r.notas], ['', '', '', '', '']);
  assert.equal(r.resultado, '');
  assert.equal(r.entregouProjeto, 'Não');
  assert.equal(r.bancaFormada, '');
  assert.equal(r.finalizou, 'Sim');
  assert.equal(r.motivo, 'Aproveitamento');
});

test('não finalizado: o caminho até ali vem do log', () => {
  const U = c.UserRole;
  const early = row(proposal(S.NOT_FINISHED), null, null, []);
  assert.equal(early.entregouProjeto, 'Não');
  assert.equal(early.motivo, 'Desistência');

  const submitted = row(proposal(S.NOT_FINISHED), null, null, [sys(U.STUDENT, U.ADVISOR)]);
  assert.equal(submitted.entregouProjeto, 'Sim');
  assert.equal(submitted.bancaFormada, 'Não');

  const withCommittee = row(proposal(S.NOT_FINISHED), committee, null,
    [sys(U.STUDENT, U.ADVISOR), sys(U.ADVISOR, U.INCHARGE), sys(U.INCHARGE, U.ADVISOR)]);
  assert.equal(withCommittee.bancaFormada, 'Sim');
  assert.equal(withCommittee.tipoDataBanca, 'Real');
  assert.equal(withCommittee.finalizou, 'Não');
});

test('entrega final sem RiuSubmittedAt cai no evento "TCC Final Submetido"', () => {
  const U = c.UserRole;
  const r = row(proposal(S.FINAL_WORK_SUBMITTED), committee, defense({ RiuReceiptUrl: 'https://riu' }),
    [sys(U.STUDENT, U.INCHARGE, '2026-12-03T10:00:00.000Z')]);
  assert.equal(r.entregaFinal, '2026-12-03T10:00:00.000Z');
  assert.equal(row(proposal(S.DEFENSE_HOMOLOGATED), committee, defense(), []).entregaFinal, '');
});

test('CSV: aspas no texto, nada de aspas em número e data, fórmula neutralizada', () => {
  const rows = [
    row(proposal(S.FINISHED), committee, defense({ RiuReceiptUrl: 'x', RiuSubmittedAt: '2026-12-02T15:00:00.000Z' }), []),
    c.buildReportRow_({ studentId: '2', name: '=HYPERLINK("x")', email: 'b' }, null, null, null, [])
  ];
  const csv = c.buildReportCsv_({
    semester: '2026.2', classesStart: '2026-08-10', classesEnd: '2026-12-12',
    createdAt: '2026-07-01T12:00:00.000Z', endedAt: '', generatedAt: new Date(2026, 9, 6, 9, 30)
  }, rows, c.reportTotals_(rows));
  const lines = csv.split('\r\n');

  assert.equal(lines[0], '"Consolidado do período";"2026.2"');
  assert.equal(lines[1], '"Início das aulas";10/08/2026');
  assert.equal(lines[4], '"Encerrado no sistema em";');
  assert.equal(lines[5], '"Gerado em";06/10/2026 09:30');
  assert.ok(lines[7].startsWith('"Matrícula";"Nome";"Fase";"Status";"Entregou projeto?"'));
  assert.ok(lines[8].includes('"Controle; ""robusto"""'));
  assert.ok(lines[8].includes(';25/11/2026;"Real";"Aprovado";8,00;7,50;;;;7,75;02/12/2026;"Sim";"Aprovado"'));
  assert.ok(lines[9].includes('"\'=HYPERLINK(""x"")"'));
  assert.equal(lines[8].split(';').length - 1, lines[7].split(';').length - 1 + 1, 'o ; do título está dentro das aspas');

  const totals = lines.slice(lines.indexOf('"Totais"') + 1);
  assert.ok(totals.includes('"Matriculados";2'));
  assert.ok(totals.includes('"Em andamento — Proposta";1'));
  assert.ok(totals.includes('"Encerrados — Aprovado";1'));
  assert.ok(totals.includes('"Média dos aprovados pela banca";7,75'));
});
