/**
 * FILE: utils.js — utilities functions
 * DESC: Utilities functions for the TCC Web App
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

/** Enum for Database Sheet Names */
var DB_SHEETS = Object.freeze({
  SEMESTERS: 'Semesters',
  ACTIVE_SESSIONS: 'Active_Sessions',
  // People. Teachers live in the REGISTRY (they cross terms — registered once,
  // inherited by every following term); students live in the TERM spreadsheet
  // (high turnover, one enrolment per term). See roadmap.md, "Saída do Google
  // Classroom".
  TEACHERS: 'Teachers',
  STUDENTS: 'Students',
  PROPOSALS: 'Proposals',
  COMMITTEES: 'Committees',
  DEFENSES: 'Defenses',
  EVENTS: 'Events'
});

/** Enum for Columns in 'Semesters' Sheet */
var DB_COLS_SEMESTER = Object.freeze({
  SEMESTER: 'Semester',
  FOLDER_ID: 'FolderId',
  // Code the student types on first access to enrol in this term. Replaces the
  // Google Classroom invitation code, and is the one gesture of the old flow
  // worth keeping: without it the Incharge would type 40 rows per term.
  ENROLLMENT_CODE: 'EnrollmentCode',
  SHEET_ID: 'SheetId',
  INCHARGE_EMAIL: 'InchargeEmail',
  STATUS: 'Status',
  // Quando o período foi criado e encerrado NO SISTEMA — carimbos de auditoria.
  START_DATE: 'StartDate',
  END_DATE: 'EndDate',
  // Início e fim das aulas, do calendário acadêmico. Quase nunca coincidem com
  // os dois acima: o período é preparado antes das aulas e encerrado depois.
  CLASSES_START: 'ClassesStart',
  CLASSES_END: 'ClassesEnd'
});

/**
 * Enum for Columns in 'Teachers' Sheet (registry — crosses terms).
 *
 * Only the Incharge writes here: a self-registration that could grant ADVISOR
 * would be the privilege escalation already refused in 10/Aug — a student would
 * name an accomplice, who would then be able to approve the proposal.
 *
 * TITULACAO and INSTITUICAO exist because the Ata and the Folha de Aprovação
 * print them (specs.md, "DOCUMENTOS EM PDF"), and no Classroom roster ever had
 * them.
 */
var DB_COLS_TEACHER = Object.freeze({
  EMAIL: 'Email',
  NAME: 'Name',
  TITULACAO: 'Titulacao',
  INSTITUICAO: 'Instituicao',
  PHONE: 'Phone',
  // True for whoever Google cannot identify (external committee member, and in
  // v3 the internship supervisor) — the only people who get a password.
  IS_EXTERNAL: 'IsExternal',
  PASSWORD_HASH: 'PasswordHash',
  PASSWORD_SALT: 'PasswordSalt',
  // Convite pendente: o Responsável digitou o e-mail, a pessoa ainda não
  // completou o cadastro. O token é de uso único e morre ao ser usado.
  INVITE_TOKEN: 'InviteToken',
  INVITE_SENT_AT: 'InviteSentAt',
  IS_ACTIVE: 'IsActive',
  CREATED_AT: 'CreatedAt'
});

/**
 * Validade do convite de professor, em dias.
 *
 * Existe porque um link que concede papel não pode valer para sempre: um
 * e-mail esquecido numa caixa de entrada por um ano é uma credencial esquecida
 * lá. Expirou, o Responsável convida de novo — o gesto custa um clique.
 */
var TEACHER_INVITE_TTL_DAYS = 14;

/** Alfabeto do token de convite: viaja em URL, ninguém digita à mão. */
var INVITE_TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
var INVITE_TOKEN_LENGTH = 32;

/** Enum for Columns in 'Students' Sheet (one per term spreadsheet) */
var DB_COLS_STUDENT = Object.freeze({
  STUDENT_ID: 'StudentId',   // matrícula UFAM, PK
  NAME: 'Name',
  EMAIL: 'Email',
  PHONE: 'Phone',
  ENROLLED_AT: 'EnrolledAt'
});

/**
 * Alphabet of the term enrolment code.
 *
 * Missing on purpose: I, O, 0, 1. The code is read off a screen (or a printed
 * Plano de Ensino) and typed by hand, and those four are the pairs that get
 * mistyped — a wrong character here is a student who cannot enrol and has no
 * way to tell why.
 */
var ENROLLMENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var ENROLLMENT_CODE_LENGTH = 6;

/** Enum for Columns in 'Active_Sessions' Sheet */
var DB_COLS_SESSION = Object.freeze({
  SESSION_ID: 'SessionId',
  EMAIL: 'Email',
  NAME: 'Name',
  ROLE: 'Role',
  SEMESTER: 'Semester',
  LAST_ACTIVITY: 'LastActivity'
});

/** Enum for User Roles (Reflects DB constraints) */
var UserRole = Object.freeze({
  STUDENT: 'Aluno',
  ADVISOR: 'Orientador',
  INCHARGE: 'Responsável',
  ERROR: 'Error'
});

/** Enum for Semester Status */
var SemesterStatus = Object.freeze({
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo'
});

/**
 * Enum for the single TCC lifecycle Status.
 *
 * There is exactly ONE status per student, stored in Proposals.Status, and it
 * advances through every phase of the flow (Proposta → Desenvolvimento →
 * Banca → Defesa → Encerramento). The Committees and Defenses sheets hold
 * only their own data — they carry no status of their own.
 */
var TccStatus = Object.freeze({
  // Phase 1 — Proposta
  NO_PROPOSAL: 'Sem Proposta',
  PROPOSAL_DRAFT: 'Proposta Em Elaboração',
  PROPOSAL_SUBMITTED: 'Proposta Submetida',
  PROPOSAL_RETURNED: 'Proposta Retornada Para Ajustes',
  PROPOSAL_APPROVED: 'Proposta Aprovada',
  // Phase 2 — Desenvolvimento
  IN_DEVELOPMENT: 'Em Desenvolvimento',
  TCC_CONCLUDED: 'TCC Concluído',
  // Phase 3 — Banca
  COMMITTEE_SUBMITTED: 'Banca Submetida',
  COMMITTEE_HOMOLOGATED: 'Banca Homologada',
  // Phase 4 — Defesa
  MINUTES_CREATED: 'Ata Gerada',
  MINUTES_IN_SIGNATURES: 'Ata Em Assinaturas',
  MINUTES_SIGNED: 'Ata Assinada',
  // Phase 5 — Encerramento
  // O aluno é o último a assinar (o "de acordo" dele fecha MINUTES_SIGNED), mas
  // quem encerra a fase é o Responsável: um ícone no painel dele homologa a
  // defesa e abre a revisão. A mesma assinatura do aluno vale para a Ata e para
  // a Folha de Aprovação — ver specs.md, fase 4.
  DEFENSE_HOMOLOGATED: 'Defesa Homologada',
  FINAL_WORK_SUBMITTED: 'TCC Final Submetido',
  FINISHED: 'TCC Finalizado',
  // Terminal states of the alternative flows (see specs.md)
  FINISHED_BY_CREDIT: 'TCC Finalizado por Aproveitamento',
  NOT_FINISHED: 'Não Finalizado'
});

/** Flow phases, matching the steps rendered by ui_comp_flow_steps.html */
var TccPhase = Object.freeze({
  PROPOSAL: 0,
  DEVELOPMENT: 1,
  COMMITTEE: 2,
  DEFENSE: 3,
  CLOSING: 4
});

/**
 * Single source of truth for how each status is presented: which flow phase
 * it belongs to and which badge class renders it. Used by the server
 * (ServiceDashboard payloads) so no view has to duplicate this mapping.
 */
var TCC_STATUS_META = Object.freeze({
  [TccStatus.NO_PROPOSAL]:           { phase: TccPhase.PROPOSAL,    badge: 'badge-neutral' },
  [TccStatus.PROPOSAL_DRAFT]:        { phase: TccPhase.PROPOSAL,    badge: 'badge-draft' },
  [TccStatus.PROPOSAL_SUBMITTED]:    { phase: TccPhase.PROPOSAL,    badge: 'badge-waiting' },
  [TccStatus.PROPOSAL_RETURNED]:     { phase: TccPhase.PROPOSAL,    badge: 'badge-returned' },
  [TccStatus.PROPOSAL_APPROVED]:     { phase: TccPhase.PROPOSAL,    badge: 'badge-approved' },
  [TccStatus.IN_DEVELOPMENT]:        { phase: TccPhase.DEVELOPMENT, badge: 'badge-homologated' },
  // Development is over and the only action left belongs to the Committee
  // phase (the Advisor forming it), so the flow bar moves on — otherwise the
  // bar says "Desenvolvimento" while the panel says "monte a banca".
  [TccStatus.TCC_CONCLUDED]:         { phase: TccPhase.COMMITTEE,   badge: 'badge-approved' },
  [TccStatus.COMMITTEE_SUBMITTED]:   { phase: TccPhase.COMMITTEE,   badge: 'badge-waiting' },
  [TccStatus.COMMITTEE_HOMOLOGATED]: { phase: TccPhase.COMMITTEE,   badge: 'badge-homologated' },
  [TccStatus.MINUTES_CREATED]:       { phase: TccPhase.DEFENSE,     badge: 'badge-draft' },
  [TccStatus.MINUTES_IN_SIGNATURES]: { phase: TccPhase.DEFENSE,     badge: 'badge-waiting' },
  [TccStatus.MINUTES_SIGNED]:        { phase: TccPhase.DEFENSE,     badge: 'badge-approved' },
  [TccStatus.DEFENSE_HOMOLOGATED]:   { phase: TccPhase.CLOSING,     badge: 'badge-homologated' },
  [TccStatus.FINAL_WORK_SUBMITTED]:  { phase: TccPhase.CLOSING,     badge: 'badge-waiting' },
  [TccStatus.FINISHED]:              { phase: TccPhase.CLOSING,     badge: 'badge-finished' },
  [TccStatus.FINISHED_BY_CREDIT]:    { phase: TccPhase.CLOSING,     badge: 'badge-finished' },
  [TccStatus.NOT_FINISHED]:          { phase: TccPhase.CLOSING,     badge: 'badge-neutral' }
});

/** Badge CSS class for a lifecycle status (unknown status → neutral) */
function getStatusBadgeClass(status) {
  const meta = TCC_STATUS_META[status];
  return meta ? meta.badge : 'badge-neutral';
}

/** Flow-steps index (0-based) for a lifecycle status (unknown status → first) */
function getStatusPhase(status) {
  const meta = TCC_STATUS_META[status];
  return meta ? meta.phase : TccPhase.PROPOSAL;
}

/** Enum for Approval Verdicts */
var VerdictStatus = Object.freeze({
  APPROVED: 'Aprovado',
  APPROVED_WITH_RESTRICTIONS: 'Aprovado com Restrições',
  REJECTED: 'Reprovado'
});

/** Enum for Defense Modes */
var DefenseMode = Object.freeze({
  IN_PERSON: 'Presencial',
  REMOTE: 'Remoto',
  HYBRID: 'Híbrido'
});

/**
 * Session idle timeout, in minutes (specs.md: re-entry after this long asks
 * for the login data again). Enforced server-side only: the client copy that
 * used to mirror it (SessionManager) was never read by anything.
 */
var SESSION_TIMEOUT_MINUTES = 5;

/**
 * Shown to whoever reaches the app without a Google account behind them.
 *
 * The deployment is published as "anyone WITH a Google account", so the
 * platform should never let such a request through — but a deployment setting
 * is not where an authorization decision belongs, and an existing deployment
 * keeps whatever was chosen in the UI when it was created, regardless of what
 * appsscript.json says today. See _requireGoogleIdentity_ in ServiceAuth.js.
 *
 * The account does NOT have to be an institutional one: an external committee
 * member signs in with any Google account and then proves who they are with
 * the e-mail and password registered in Teachers. The Google sign-in is only
 * what makes the visitor a someone instead of an anonymous browser.
 */
var SESSION_EXPIRED_MSG =
  'Sua sessão expirou por inatividade. Recarregue a página (F5) para entrar ' +
  'de novo — o que você já tinha salvo continua salvo.';

var NO_GOOGLE_IDENTITY_MSG =
  'Entre com uma conta Google para usar o sistema. Qualquer conta serve — ' +
  'ela não precisa ser @ufam.edu.br, e não precisa ser o e-mail do seu ' +
  'cadastro: membros externos entram com a conta Google que tiverem e, na ' +
  'tela seguinte, informam o e-mail e a senha recebidos por e-mail.';

/** Committee size limits (specs.md: 3 to 5 members, advisor included) */
var COMMITTEE_MIN_MEMBERS = 3;
var COMMITTEE_MAX_MEMBERS = 5;

/**
 * The institutional e-mail domain — the one Google resolves for this script.
 *
 * Deduced from the account that published the Web App instead of written down:
 * the deploy runs as USER_DEPLOYING, so the effective user IS an account of the
 * institution, and the set of addresses Session.getActiveUser() can resolve is
 * exactly that account's Workspace domain. A constant would be one more thing
 * to remember to change if this is ever deployed by another faculty.
 */
function _institutionalDomain_() {
  try {
    const owner = String(Session.getEffectiveUser().getEmail() || '');
    const at = owner.lastIndexOf('@');
    if (at !== -1) return owner.substring(at + 1).toLowerCase();
  } catch(e) {
    console.error('_institutionalDomain_ error: %s', e.message);
  }
  return 'ufam.edu.br';
}

/**
 * The URL to put in an e-mail — the one people see, copy and keep.
 *
 * ScriptApp.getService().getUrl() answers for the deployment that is running.
 * That is right for navigation inside the app and wrong for a link that
 * outlives the message: it is a script.google.com address tied to ONE
 * deployment, and republishing under a new one silently rots every link
 * already sitting in somebody's inbox. The Script Property PUBLIC_URL holds
 * the address the Faculty publishes instead (feec.ufam.edu.br/tccweb, a Joomla
 * menu item), which points at whichever deployment is in production at the
 * time — so the link in the inbox survives a redeploy.
 *
 * Unset — the normal state in development — falls back to the running
 * deployment, so nothing has to be configured to test.
 *
 * ONLY for links with no query string. The friendly URL is a Joomla page, and
 * neither a menu alias nor com_redirect forwards parameters: a '?page=sign'
 * would arrive stripped. The token links of ServiceDefense and ServicePeople
 * therefore keep pointing straight at the deployment — they are one-shot and
 * clicked on the spot, so nothing is lost by them being ugly. Navigation
 * inside the app stays on the deployment URL for a second reason: the login
 * form POSTs to it, and a redirect turns a POST into a GET and drops the body
 * (see ui_app_login.html).
 */
function getPublicAppUrl() {
  try {
    const configured = String(
      PropertiesService.getScriptProperties().getProperty('PUBLIC_URL') || ''
    ).trim();
    if (configured) return configured.replace(/\/+$/, '');
    return ScriptApp.getService().getUrl() || '';
  } catch(e) {
    console.error('getPublicAppUrl error: %s', e.message);
    return '';
  }
}

/**
 * Faz o clique passar pelo seletor de contas do Google antes do /exec, em vez
 * do redirecionamento automático entre contas — que é o que quebra esses
 * links no celular quando há mais de uma conta Google logada no navegador
 * (o Google mostra o erro genérico "Não foi possível abrir o arquivo" do
 * Drive antes até de chegar no doGet). Sem hd=: quem não é @ufam.edu.br
 * (banca externa) precisa poder escolher a própria conta Google.
 */
function withAccountChooser(url) {
  if (!url) return url;
  return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(url);
}

/**
 * Whether an address belongs to the institution.
 *
 * This is THE criterion that separates the two kinds of person the system did
 * not know yet ("externo ao sistema"): one has an institutional address and is
 * a professor of the house, the other does not and is a guest — see "Quem é
 * quem" in arch.md. It decides who gets a password, and who may be named
 * advisor.
 *
 * What it deliberately does NOT decide: whether the person is a professor at
 * all. Students carry institutional addresses too. That judgement is the
 * Responsável's, and it is made by putting the row in Teachers — see
 * "Toda indicação passa pelo Responsável" in arch.md.
 */
function _isInstitutionalEmail_(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at === -1) return false;
  return String(email).substring(at + 1).trim().toLowerCase() === _institutionalDomain_();
}

/**
 * Extracts the Drive id out of whatever the user pasted.
 *
 * The Setup screen asks for "o link ou o ID", and the honest answer to what
 * people actually do is: they paste the whole address bar. Four shapes reach
 * here, and all four are legitimate:
 *
 *   https://drive.google.com/drive/folders/<id>          pasta
 *   https://docs.google.com/document/d/<id>/edit         Google Doc
 *   https://drive.google.com/file/d/<id>/view            arquivo do Drive
 *   https://drive.google.com/open?id=<id>                link antigo
 *
 * Anything without a slash or a query string is taken as already being an id —
 * which is what the field asks for in the first place.
 *
 * This function was CALLED but never written (ServiceSetup.initializeSystem,
 * fatia B): submitting the setup form died with "_normalizeDocId_ is not
 * defined", the catch turned it into { success:false }, and the screen answered
 * "Falha: _normalizeDocId_ is not defined" — so the initial setup could never be
 * completed at all.
 */
function _normalizeDocId_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // No slash and no query string: it is already an id, not an address
  if (raw.indexOf('/') === -1 && raw.indexOf('?') === -1) return raw;

  const patterns = [
    /\/folders\/([A-Za-z0-9_-]{10,})/,   // .../drive/folders/<id>
    /\/d\/([A-Za-z0-9_-]{10,})/,         // .../document/d/<id>/edit, /file/d/<id>/view
    /[?&]id=([A-Za-z0-9_-]{10,})/        // .../open?id=<id>
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = raw.match(patterns[i]);
    if (m) return m[1];
  }

  // Unrecognized address: hand back the longest id-shaped run rather than the
  // whole URL, so the error the caller raises names something plausible.
  const chunks = raw.split(/[^A-Za-z0-9_-]+/).filter(c => c.length >= 10);
  if (chunks.length) {
    return chunks.sort((a, b) => b.length - a.length)[0];
  }
  return raw;
}

// ==========================================
// DATE HELPERS (HTML date inputs <-> Sheets)
// ==========================================
// Dates are stored in the sheet as real Date values, so the columns stay
// sortable/filterable and can be used in date arithmetic. HTML date inputs,
// however, only ever exchange strings ("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm"),
// so every read/write crosses these two helpers.
//
// Both parse manually instead of relying on new Date(string): a date-only
// string is parsed as UTC by the JS spec, which in America/Manaus (UTC-4)
// shifts the value to the previous day.

/**
 * Converts a date input string into a Date in the script's time zone.
 * Returns '' for empty input and the original value if unrecognized.
 */
function parseDateInput(value) {
  if (!value) return '';
  if (value instanceof Date) return value;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return value;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

/** Formats a stored value as "YYYY-MM-DD" for <input type="date"> */
function formatDateInput(value) {
  return _formatForInput_(value, 'yyyy-MM-dd', 10);
}

/** Formats a stored value as "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> */
function formatDatetimeInput(value) {
  return _formatForInput_(value, "yyyy-MM-dd'T'HH:mm", 16);
}

/**
 * Shared implementation: formats Date values in the script's time zone and
 * truncates values that already come back from the sheet as text.
 */
function _formatForInput_(value, pattern, length) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), pattern);
  }
  return String(value).replace(/^'/, '').substring(0, length);
}

/**
 * Enum for Columns in 'Proposals' Sheet.
 * Rich content (Resumo/Objetivos/Metodologia/Referências) lives in a Google
 * Doc per student (DOC_ID), duplicated from the template configured at
 * PROPOSAL_TEMPLATE_DOC_ID (Script Property) — see ServiceProposal.js.
 */
var DB_COLS_PROPOSAL = Object.freeze({
  PROPOSAL_ID: 'ProposalId',
  STUDENT_ID: 'StudentId',
  STUDENT_EMAIL: 'StudentEmail',
  STUDENT_PHONE: 'StudentPhone',
  ADVISOR_EMAIL: 'AdvisorEmail',
  ADVISOR_PHONE: 'AdvisorPhone',
  TITLE: 'Title',
  DOC_ID: 'DocId',
  DEFENSE_PREDICTION: 'DefensePrediction',
  STATUS: 'Status',
  ITERATIONS: 'Iterations',
  // The TCC itself, uploaded by the student to close the Development phase.
  // Until it existed, "Concluir TCC" was the only transition in the whole flow
  // with no artifact behind it — the phase ended on a claim, and the Advisor
  // went on to assemble a committee for work the system had never seen. The
  // file is stored in the term folder, owned by the app, which is what lets the
  // system share it with the committee on its own (a link pasted from the
  // student's Drive would not be readable by the account running the app).
  WORK_FILE_ID: 'WorkFileId',
  WORK_UPLOADED_AT: 'WorkUploadedAt',
  // NOTES (JSON timeline) removed: the activity log lives in DB_SHEETS.EVENTS
  CREATED_AT: 'CreatedAt',
  UPDATED_AT: 'UpdatedAt'
});

/**
 * Lê uma coluna que guarda um array JSON, tolerando vazio e lixo.
 *
 * Mora aqui, e não no serviço que a usou primeiro, porque três abas guardam
 * lista em JSON — os membros da banca, as notas da ata e os tokens de
 * assinatura — e cada serviço que precisasse dela acabaria com a sua cópia.
 */
function _parseJsonArray_(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

/**
 * Logs any {{PLACEHOLDER}} still present after the substitutions. A mismatch
 * between the template and the code (a typo, a missing accent) leaves the
 * marker visible in the student's document with no error whatsoever, so the
 * warning is the only trace left for whoever maintains the template.
 */
function _warnAboutLeftoverPlaceholders_(doc, sections) {
  try {
    const leftovers = [];
    sections.forEach(section => {
      let found = section.findText('\\{\\{[^}]+\\}\\}');
      while (found) {
        const el = found.getElement().asText().getText();
        const marker = el.substring(found.getStartOffset(), found.getEndOffsetInclusive() + 1);
        if (leftovers.indexOf(marker) === -1) leftovers.push(marker);
        found = section.findText('\\{\\{[^}]+\\}\\}', found);
      }
    });
    if (leftovers.length) {
      console.warn(
        `Marcadores não substituídos no documento "${doc.getName()}": ${leftovers.join(', ')}. ` +
        `Verifique a grafia no template da proposta.`
      );
    }
  } catch(e) {
    // Purely diagnostic: never let it break the document creation
    console.error('_warnAboutLeftoverPlaceholders_ error:', e);
  }
}

/**
 * The ONLY columns a client may write through saveDraft, by role
 * (_proposalEditableColumns_, below).
 *
 * What stood here before was `dao.upsert(id, proposalData)` with the object the
 * browser sent, and SheetDao.update writes every key it recognizes. So a
 * student holding a draft — where canEdit is legitimately true — could call
 * cmdSaveDraft({ ProposalId: '…', Status: 'TCC Finalizado' }) and land anywhere
 * in the flow, skipping the Advisor's approval and the Incharge's homologation
 * in a single request. The state machine was never consulted, because the write
 * path did not go through it.
 *
 * Everything absent from that list is the system's to write: Status only moves
 * through the transition commands below, ProposalId/CreatedAt/Iterations are
 * set once at creation, StudentEmail comes from the session, and DocId /
 * WorkFileId name files this service itself created — a client-supplied id
 * there would point the proposal at somebody else's document.
 *
 * A role missing from the map may write nothing at all: the failure mode of a
 * new state that forgets to declare its columns must be a refusal, never a
 * silent grant.
 */
/*
 * A function and not a top-level constant, deliberately. Apps Script evaluates
 * every file into one global scope in file order, and UserRole/DB_COLS_PROPOSAL
 * live in utils.js — which sorts last. A `var` initialized here would read them
 * before they exist and take the whole project down at load time, not at the
 * call that needed it.
 */
function _proposalEditableColumns_(userRole) {
  const byRole = {
    [UserRole.STUDENT]: [
      DB_COLS_PROPOSAL.TITLE,
      DB_COLS_PROPOSAL.STUDENT_ID,
      DB_COLS_PROPOSAL.STUDENT_PHONE,
      DB_COLS_PROPOSAL.ADVISOR_EMAIL,
      DB_COLS_PROPOSAL.ADVISOR_PHONE,
      DB_COLS_PROPOSAL.DEFENSE_PREDICTION
    ]
  };
  return byRole[userRole] || [];
}

/**
 * Keeps only the columns `userRole` is allowed to write, dropping the rest
 * without comment — a rejected field is a bug or an attack, and neither
 * deserves a message that helps refine the next attempt.
 *
 * E-mails are normalized on the way in. This is the one place the advisor's
 * address enters the system (the student types it), and every comparison
 * downstream — ownership, the advisor's own panel, the committee president —
 * is a string match. "Fulano@ufam.edu.br" got past the registration check,
 * which lowercases, and then never matched the advisor's session e-mail, so
 * the proposal simply never appeared for them.
 */
function _sanitizeProposalInput_(proposalData, userRole) {
  const allowed = _proposalEditableColumns_(userRole);
  const patch = {};

  allowed.forEach(col => {
    if (!proposalData || !proposalData.hasOwnProperty(col)) return;
    const value = proposalData[col];
    patch[col] = (col === DB_COLS_PROPOSAL.ADVISOR_EMAIL)
      ? _normalizeEmail_(value)
      : value;
  });

  // The date input sends "YYYY-MM-DD": store it as a real Date so the column
  // stays sortable and comparable on the sheet (see utils.js date helpers)
  if (patch.hasOwnProperty(DB_COLS_PROPOSAL.DEFENSE_PREDICTION)) {
    patch[DB_COLS_PROPOSAL.DEFENSE_PREDICTION] =
      parseDateInput(patch[DB_COLS_PROPOSAL.DEFENSE_PREDICTION]);
  }

  return patch;
}

/**
 * Grava um PDF enviado pelo navegador na pasta do período e devolve o id.
 *
 * Compartilhado pelo trabalho que fecha o Desenvolvimento e pela versão final
 * da Fase 5. O arquivo é criado PELO APP, e portanto pertence a ele: é isso que
 * permite ao sistema compartilhá-lo com a banca por conta própria, coisa que um
 * link colado do Drive do aluno não permitiria (o deploy roda como
 * USER_DEPLOYING e não teria acesso).
 *
 * @param {string} folderId  pasta do período (Semesters.FolderId)
 * @param {{name, mimeType, bytes}} file  bytes em base64
 * @param {string} fileName  nome final no Drive
 */
function _storePdf_(folderId, file, fileName) {
  if (!folderId) throw new Error('Pasta do período letivo não encontrada.');
  if (!file || !file.bytes) throw new Error('Nenhum arquivo recebido.');
  if (file.mimeType !== 'application/pdf') {
    throw new Error('O arquivo deve ser enviado em PDF.');
  }

  const decoded = Utilities.base64Decode(file.bytes);
  // Reconferido aqui mesmo com o cliente já tendo recusado o arquivo grande: a
  // checagem do cliente é cortesia ao usuário, nunca garantia para o servidor.
  if (decoded.length > WORK_MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`O arquivo excede o limite de ${WORK_MAX_UPLOAD_MB} MB.`);
  }

  const blob = Utilities.newBlob(decoded, file.mimeType, fileName);
  return DriveApp.getFolderById(folderId).createFile(blob).getId();
}

/**
 * Says why there is no term to work on — the two cases are very different and
 * the single message they shared ("Sem período letivo ativo") sent the reader
 * looking for the wrong thing.
 *
 * A row can be `Ativo` in the registry and still be unusable: the term is only
 * usable when it has a SheetId, and every read and write goes through that
 * spreadsheet. Bootstrap asks "is there any active term?", the panels ask "does
 * my term have a spreadsheet?" — a registry row with an empty SheetId satisfies
 * the first and fails the second, and the app landed on the dashboard reporting
 * the absence of something that was right there.
 *
 * Deliberately a diagnosis and NOT a repair. The same reasoning that gave the
 * sessions tab auto-healing and denied it to Proposals/Events: a missing SheetId
 * may mean the term's spreadsheet was trashed with every student's record in it.
 * Quietly offering "create a new term" would paper over data loss.
 */
function semesterUnavailableMessage(ctx) {
  if (ctx && ctx.semester) {
    const name = String(ctx.semester[DB_COLS_SEMESTER.SEMESTER] || '').replace(/^'/, '');
    return `O período letivo ${name} está no registro, mas sem a planilha de ` +
           `dados (coluna ${DB_COLS_SEMESTER.SHEET_ID}). Nada pode ser lido ou ` +
           `gravado nele. Se a planilha foi apagada, ela precisa ser restaurada ` +
           `da lixeira do Drive — criar um período novo com o mesmo nome é ` +
           `recusado, porque o nome é a chave do registro.`;
  }
  return 'Você não participa de nenhum período letivo em andamento.';
}

/**
 * Upload ceiling for the TCC file, in megabytes.
 *
 * The bytes travel base64-encoded inside the google.script.run request, which
 * inflates them by about a third, so the practical limit is well below any
 * Drive quota. Checked on both sides: the client to fail fast with a useful
 * message, the server because a client check is a courtesy, not a guarantee.
 */
var WORK_MAX_UPLOAD_MB = 20;

/**
 * Enum for Columns in 'Committees' Sheet (Bancas).
 * There is no Status column here: the lifecycle status is the single
 * TccStatus stored in Proposals.Status (see TccStatus above).
 * MEMBERS_DATA is a JSON array of
 * { nome, titulo, inst, email, telefone, isPresidente }.
 */
var DB_COLS_COMMITTEE = Object.freeze({
  COMMITTEE_ID: 'CommitteeId',
  PROPOSAL_ID: 'ProposalId',
  FINAL_TITLE: 'FinalTitle',
  DEFENSE_DATETIME: 'DefenseDatetime',
  DEFENSE_MODE: 'DefenseMode',
  MEMBERS_COUNT: 'MembersCount',
  MEMBERS_DATA: 'MembersData',
  CREATED_AT: 'CreatedAt',
  UPDATED_AT: 'UpdatedAt'
});

/**
 * Enum for Columns in 'Events' Sheet — the TCC activity log.
 *
 * One row per entry, append-only. Replaces the old Proposals.Notes JSON column,
 * which had three ceilings: a cell holds 50k characters; appending meant
 * read-modify-write, so two simultaneous actions lost one of the messages; and,
 * being a column of Proposals, it had nowhere to record anything about the
 * Committee or the Defense.
 *
 * TO_ROLE is the recipient (see ServiceEventLog._recipientFor): filled from the
 * transition for action-bound entries, derived from the status for standalone
 * comments, and empty when there is no one waiting.
 */
var DB_COLS_EVENT = Object.freeze({
  EVENT_ID: 'EventId',
  PROPOSAL_ID: 'ProposalId',
  PHASE: 'Phase',
  TYPE: 'Type',
  ROLE: 'Role',
  EMAIL: 'Email',
  TO_ROLE: 'ToRole',
  MESSAGE: 'Message',
  TIMESTAMP: 'Timestamp'
});

/** Kinds of entry in the activity log */
var EventType = Object.freeze({
  SYSTEM: 'Sistema',
  COMMENT: 'Comentário'
});

/**
 * Who is expected to act in each status — "where the ball is".
 * Used to address a standalone comment: whoever is waiting on the other side.
 */
var TCC_STATUS_RESPONSIBLE = Object.freeze({
  [TccStatus.NO_PROPOSAL]:           UserRole.STUDENT,
  [TccStatus.PROPOSAL_DRAFT]:        UserRole.STUDENT,
  [TccStatus.PROPOSAL_SUBMITTED]:    UserRole.ADVISOR,
  [TccStatus.PROPOSAL_RETURNED]:     UserRole.STUDENT,
  [TccStatus.PROPOSAL_APPROVED]:     UserRole.INCHARGE,
  [TccStatus.IN_DEVELOPMENT]:        UserRole.STUDENT,
  [TccStatus.TCC_CONCLUDED]:         UserRole.ADVISOR,
  [TccStatus.COMMITTEE_SUBMITTED]:   UserRole.INCHARGE,
  [TccStatus.COMMITTEE_HOMOLOGATED]: UserRole.ADVISOR,
  // Fase 4: a bola passa pela banca, volta ao aluno para o "de acordo" e
  // termina no Responsável, que homologa a defesa e abre a revisão.
  [TccStatus.MINUTES_CREATED]:       UserRole.ADVISOR,
  [TccStatus.MINUTES_IN_SIGNATURES]: UserRole.ADVISOR,
  [TccStatus.MINUTES_SIGNED]:        UserRole.INCHARGE,
  // Fase 5: revisão, RIU e entrega final são do aluno; o lançamento da nota
  // fecha tudo e é do Responsável.
  [TccStatus.DEFENSE_HOMOLOGATED]:   UserRole.STUDENT,
  [TccStatus.FINAL_WORK_SUBMITTED]:  UserRole.INCHARGE
});

/**
 * Enum for Columns in 'Defenses' Sheet (Atas de Defesa).
 * No Status column either — same reason as Committees above.
 */
var DB_COLS_DEFENSE = Object.freeze({
  DEFENSE_ID: 'DefenseId',
  COMMITTEE_ID: 'CommitteeId',
  // Só preenchida na linha do aproveitamento, que não tem banca: sem ela a
  // nota ficaria gravada sem dizer de quem é. Toda outra linha chega à
  // proposta pela banca (CommitteeId).
  PROPOSAL_ID: 'ProposalId',
  // Grade AND signature AND signature time, per member — specs.md asks for the
  // three, and they belong to the same person, so they share one JSON array:
  // [{ email, nota, assinadoEm }].
  MEMBERS_GRADES: 'MembersGrades',
  BANK_OBSERVATIONS: 'BankObservations',
  FINAL_GRADE: 'FinalGrade',
  // The Advisor closes the grade entry with their own signature (specs 4.2),
  // which is what opens the minutes for the other members to sign.
  ADVISOR_SIGNED_AT: 'AdvisorSignedAt',
  STUDENT_AGREEMENT: 'StudentAgreement',
  STUDENT_AGREEMENT_AT: 'StudentAgreementAt',
  // One single-use token per member, mailed with the signing link. External
  // members (a guest from another institution) are in no Classroom roster, so
  // the token is their only way in — kept apart from MEMBERS_GRADES on purpose:
  // it is a credential, not part of the academic record.
  SIGNATURE_TOKENS: 'SignatureTokens',
  // Printed on both PDFs so a third party can check the document against the
  // system (specs.md, "Funcionalidades gerais").
  VALIDATION_KEY: 'ValidationKey',
  MINUTES_PDF_ID: 'MinutesPdfId',
  APPROVAL_SHEET_PDF_ID: 'ApprovalSheetPdfId',
  APPROVAL_STATUS: 'ApprovalStatus',
  // Phase 5. Deliberately NOT the same column as Proposals.WorkFileId: this is
  // the version that goes to the RIU, with the approval sheet bound in, and
  // overwriting would erase the very file the committee graded.
  FINAL_WORK_FILE_ID: 'FinalWorkFileId',
  RIU_RECEIPT_URL: 'RiuReceiptUrl',
  // When the RIU receipt arrived — the "entrega final" date of the term report.
  // The FINAL_WORK_SUBMITTED event is not it: that one marks when BOTH files
  // were in, and the receipt may be sent again afterwards.
  RIU_SUBMITTED_AT: 'RiuSubmittedAt'
});
