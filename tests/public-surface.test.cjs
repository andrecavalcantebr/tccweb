/**
 * FILE: public-surface.test.cjs — what the browser can call on the server.
 * DESC: Fails when a global function becomes reachable by google.script.run
 *       without anyone deciding that it should.
 * AUTH: Andre Cavalcante
 * DATE: October, 2026
 * LICENCE: GPL-v3
 *
 * Apps Script hides from google.script.run ONLY the functions whose name ENDS
 * with "_". A leading underscore hides nothing: until Oct/2026 seventy-one
 * "_helpers" were public, among them the one returning SIGNATURE_SECRET_KEY,
 * and any Google account could call them from the browser console, with no
 * session at all, running as the owner of the deployment.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

/**
 * Every function the browser may call. Adding a name here is a security
 * decision: the function must resolve the caller itself (AuthService
 * getContext / assertActiveSession, or an owner check) and must not trust any
 * id, e-mail or role that comes in its arguments.
 */
const PUBLIC = new Set([
  // Web App entry points
  'doGet', 'doPost',
  // Commands — each checks session and role on its own
  'cmdAddComment', 'cmdApproveProposal', 'cmdCloseTcc', 'cmdConcludeTcc',
  'cmdCreateMinutes', 'cmdCreateSemester', 'cmdEndSemester', 'cmdFinalizeTcc',
  'cmdGenerateDefenseDocument', 'cmdHomologateCommittee', 'cmdHomologateDefense',
  'cmdHomologateProposal', 'cmdInviteTeacher', 'cmdRegenerateEnrollmentCode',
  'cmdResendInvitation', 'cmdResetTeacherPassword', 'cmdReturnProposal',
  'cmdSaveDraft', 'cmdSaveMinutes', 'cmdSaveTeacher', 'cmdSetTeacherActive',
  'cmdSignMinutes', 'cmdSignMinutesAsAdvisor', 'cmdStudentAgreement',
  'cmdSubmitCommittee', 'cmdSubmitFinalWork', 'cmdSubmitProposal',
  'cmdUpdateMyProfile', 'cmdUpdateSemesterDates',
  'processSemesterSetup', 'processSystemSetup',
  'switchRole', 'switchSemester',
  // Reads — each checks session and role on its own
  'getAdvisorDashboardData', 'getInchargeDashboardData', 'getStudentDashboardData',
  'getSemesterReport', 'getTeacherRegistry', 'lookupAdvisorName', 'verifyDefenseKey',
  // Pages: return HtmlOutput, which google.script.run cannot even serialize
  'include', 'renderEnrollment', 'renderError', 'renderLogin', 'renderSetupPending',
  'renderSignMinutes', 'renderTeacherSignup', 'renderView',
  // Pure helpers: no I/O, nothing to leak
  'formatDateInput', 'formatDatetimeInput', 'getPublicAppUrl', 'getStatusBadgeClass',
  'getStatusPhase', 'isSystemSetup', 'parseDateInput', 'semesterUnavailableMessage',
  'withAccountChooser',
  // Editor-only diagnostics: log-only, and forceReauth checks _isAppOwner_
  'diagnoseAllPermissions', 'diagnoseIdentity', 'diagnoseMailAccess',
  'diagnosePeople', 'diagnoseTemplateAccess', 'forceReauth'
]);

function globalFunctions() {
  const out = [];
  fs.readdirSync(SRC).filter(f => f.endsWith('.js')).forEach(file => {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    const re = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    let m;
    while ((m = re.exec(text))) out.push({ name: m[1], file });
  });
  return out;
}

test('nenhuma função global começa com "_" sem terminar com "_"', () => {
  const leaking = globalFunctions()
    .filter(f => f.name.startsWith('_') && !f.name.endsWith('_'))
    .map(f => `${f.file}: ${f.name}`);
  assert.deepEqual(leaking, [],
    'O "_" no INÍCIO não esconde a função do google.script.run. Use "_" no fim.');
});

test('toda função pública foi aprovada explicitamente', () => {
  const unexpected = globalFunctions()
    .filter(f => !f.name.endsWith('_') && !PUBLIC.has(f.name))
    .map(f => `${f.file}: ${f.name}`);
  assert.deepEqual(unexpected, [],
    'Função nova chamável pelo navegador. Termine o nome com "_", ou acrescente-a ' +
    'a PUBLIC depois de conferir que ela mesma valida sessão e papel.');
});
