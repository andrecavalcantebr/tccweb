/**
 * FILE: ServiceSetup.js
 * DESC: Initial configuration system
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

/**
 * Both setup screens are bootstrap: they run before there is a registry, a
 * semester or a people table to check anyone against. That used to mean no
 * check at all — any authenticated user reaching the app before the Responsável
 * could point the system at their own Drive folder, or create a semester (which
 * also deactivates the real one, since startSemester turns off the previous).
 * That is exactly what happened in the 07/Ago test.
 *
 * There is one thing to check without knowing anything: the Web App is deployed
 * as USER_DEPLOYING, so Session.getEffectiveUser() is always the account that
 * published it and owns the Drive files. The setup belongs to that account.
 *
 * Accounts outside the script's Workspace domain get '' from getActiveUser(),
 * so they never match — deny by default, which is the wanted behaviour here.
 */
function _isAppOwner_() {
  const owner  = Session.getEffectiveUser().getEmail();
  const caller = Session.getActiveUser().getEmail();
  return !!caller && caller === owner;
}

function _assertIsAppOwner_() {
  const caller = Session.getActiveUser().getEmail();
  if (!_isAppOwner_()) {
    throw new Error(
      'A configuração do sistema só pode ser feita pela conta que publicou o ' +
      'aplicativo. Entre com essa conta e tente de novo.'
    );
  }
  return caller;
}

/**
 * Who may create or close a term: the app owner (who bootstraps the system and
 * is the only check available when no term exists yet) or the Responsável of a
 * term already running. That second path is what makes the handover work — the
 * professor who receives the role can open the next term without the owner.
 */
function _assertCanManageSemesters_() {
  const caller = Session.getActiveUser().getEmail();
  if (_isAppOwner_()) return caller;

  const auth = new AuthService();
  const isIncharge = caller && auth.getActiveSemesters().some(
    sem => _normalizeEmail_(sem[DB_COLS_SEMESTER.INCHARGE_EMAIL]) === _normalizeEmail_(caller)
  );
  if (!isIncharge) {
    throw new Error(
      'Apenas o Responsável por um período letivo em andamento (ou a conta que ' +
      'publicou o aplicativo) pode criar ou encerrar períodos letivos.'
    );
  }
  return caller;
}

class SetupService {
  constructor() {
    this.props = PropertiesService.getScriptProperties();
  }

  /**
   * Completes whichever part of the initial setup is still missing:
   * the master registry sheet (folderId) and/or the proposal template
   * document (templateDocId). Both are independent — calling this again
   * to supply only the missing one (e.g. after this template feature was
   * added to an already-configured system) does not recreate the registry.
   */
  initializeSystem(data) {
    try {
      _assertIsAppOwner_();
      const input = data || {};
      const folderId0 = input.folderId;
      const hasRegistry = !!this.props.getProperty('REGISTRY_SHEET_ID');
      let folderId = folderId0;

      if (!hasRegistry) {
        if (!folderId) throw new Error("ID da pasta do Drive é obrigatório.");

        // Aceita a URL inteira da pasta, colada do navegador — é o que se faz
        // naturalmente, e o erro que vinha de volta (getFolderById on object
        // DriveApp) não dizia nada sobre o formato esperado.
        folderId = _normalizeDocId_(folderId);

        const folder = DriveApp.getFolderById(folderId);
        if (!folder) throw new Error("Pasta não encontrada ou sem permissão.");

        // Create new Spreadsheet
        const ss = SpreadsheetApp.create('TCC_WebApp_Registry');

        // Move to the designated folder
        const file = DriveApp.getFileById(ss.getId());
        file.moveTo(folder);

        // Create Semesters tab using constant
        let tab = ss.getSheetByName(DB_SHEETS.SEMESTERS);
        if (!tab) {
          tab = ss.insertSheet(DB_SHEETS.SEMESTERS);
        }

        // Sessions live here, not in the term spreadsheets: more than one term
        // can be active at a time, and the session is what says which one the
        // user is on (see AuthService._sessionDao).
        const sessionsTab = ss.insertSheet(DB_SHEETS.ACTIVE_SESSIONS);
        const sessionCols = Object.values(DB_COLS_SESSION);
        sessionsTab.getRange(1, 1, 1, sessionCols.length).setValues([sessionCols]);

        // Teachers live here too, and for the stronger reason: a teacher is
        // registered once and carries the Advisor role into every term that
        // follows. Putting them in the term spreadsheet would mean retyping the
        // whole faculty every semester — the exact chore the Classroom was
        // supposed to spare and never did.
        const teachersTab = ss.insertSheet(DB_SHEETS.TEACHERS);
        const teacherCols = Object.values(DB_COLS_TEACHER);
        teachersTab.getRange(1, 1, 1, teacherCols.length).setValues([teacherCols]);

        // Remove generic standard Sheet1
        const sheet1 = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
        if (sheet1) ss.deleteSheet(sheet1);

        // Setup Headers from constants. Taken from the enum instead of a fixed
        // A1:H1 range, so adding or removing a column never leaves the header
        // row and the enum disagreeing.
        const semesterCols = Object.values(DB_COLS_SEMESTER);
        tab.getRange(1, 1, 1, semesterCols.length).setValues([semesterCols]);

        this.props.setProperty('REGISTRY_SHEET_ID', ss.getId());
        this.props.setProperty('DATA_DIR_ID', folderId);
      }

      // The proposal template is the only one the bootstrap demands, because it
      // is the only one Phase 1 needs. The other two are read by the Defense
      // phase and are accepted here whenever the Responsável has them ready —
      // see _requireTemplate_ below for why they are not in isSystemSetup().
      if (!this.props.getProperty('PROPOSAL_TEMPLATE_DOC_ID') && !input.templateDocId) {
        throw new Error("Documento modelo da proposta é obrigatório.");
      }

      const saved = [];
      [
        ['PROPOSAL_TEMPLATE_DOC_ID',       input.templateDocId,         'modelo da proposta'],
        ['ATA_TEMPLATE_DOC_ID',            input.ataTemplateDocId,      'modelo da Ata da Defesa'],
        ['APPROVAL_SHEET_TEMPLATE_DOC_ID', input.approvalTemplateDocId, 'modelo da Folha de Aprovação']
      ].forEach(entry => {
        const key = entry[0], value = entry[1], label = entry[2];
        // An empty field means "leave what is there". This screen is reachable
        // again (?page=setup), so it has to be able to show three configured
        // templates and change only the one being replaced.
        if (!String(value || '').trim()) return;

        const normalizedId = _normalizeDocId_(value);
        try {
          DriveApp.getFileById(normalizedId); // throws if not found/no access
        } catch(err) {
          throw new Error(`Não consegui abrir o ${label}. Confira se o link ou ` +
                          `ID está certo e se o documento foi compartilhado com ` +
                          `esta conta.`);
        }
        this.props.setProperty(key, normalizedId);
        saved.push(label);
      });

      return {
        success: true,
        msg: saved.length
          ? 'Configuração salva: ' + saved.join(', ') + '.'
          : 'Nada a alterar.'
      };
    } catch(e) {
      console.error(e);
      return { success: false, msg: e.message };
    }
  }

  /**
   * Generates a new Semester Spreadsheet, Links to the Registry and Creates tables
   */
  startSemester(semesterData) {
    try {
      const registryId = this.props.getProperty('REGISTRY_SHEET_ID');
      const folderId = this.props.getProperty('DATA_DIR_ID');
      if (!registryId || !folderId) throw new Error("Sistema base não configurado.");

      const caller = _assertCanManageSemesters_();

      // The typed value names the folder AND is the primary key of the registry
      // row, so a stray space would silently break both
      const semesterName = String(semesterData.semesterName || '').trim();
      if (!semesterName) throw new Error("Informe o período letivo.");

      // Handing the role over to another professor is just recording a
      // different e-mail here: the Incharge check is against InchargeEmail
      // (ServiceAuth._rolesInSemester), not against who created the term.
      //
      // There is nothing left to validate it against, and that is deliberate:
      // the old check ("is this account a teacher of the Classroom course?")
      // went away with the course. Requiring the Incharge to be in the Teachers
      // table first would put the very first term of a fresh install in a
      // deadlock — nobody can register a teacher before there is a term to be
      // Incharge of. The role is granted by this row and audited by the log.
      const classes = _validateClassDates_(semesterData.classesStart, semesterData.classesEnd);
      const inchargeEmail = _normalizeEmail_(semesterData.inchargeEmail) || _normalizeEmail_(caller);
      const inchargeName = String(semesterData.inchargeName || '').trim();

      const rootFolder = DriveApp.getFolderById(folderId);

      // 0. Each academic term gets its own folder inside the project root
      //    folder, named after the term itself ("2026.1"), so the term's
      //    spreadsheet and every student's proposal Doc stay together instead
      //    of piling up next to the registry and the templates.
      const existingFolders = rootFolder.getFoldersByName(semesterName);
      const folder = existingFolders.hasNext()
        ? existingFolders.next()          // reuse it when re-running the setup
        : rootFolder.createFolder(semesterName);

      // 1. Terms coexist: creating one does NOT close the others. The next
      //    term is prepared while the current one is still running, and a term
      //    may stretch past the start of the next. Closing is an explicit act
      //    (endSemester).
      //    The name is the primary key of the registry, so a repeat would make
      //    every lookup ambiguous — refuse it instead of writing a second row.
      const regDao = getSheetManager_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER.SEMESTER);
      const clash = regDao.getAll().find(
        sem => String(sem[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, '') === semesterName
      );
      if (clash) {
        throw new Error(`O período letivo ${semesterName} já existe no registro.`);
      }

      // 2. Create the child Spreadsheet for the specific semester
      // Named after the semester alone, matching the folder that holds it
      const ss = SpreadsheetApp.create(semesterName);
      // Align the sheet with the script time zone (appsscript.json): dates are
      // written as real Date values, and a mismatch here would shift the
      // wall-clock time read back for the date inputs (see utils.js helpers).
      ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
      DriveApp.getFileById(ss.getId()).moveTo(folder);

      // 3. Mount Database Structure inside the new Sheet
      const tabsToCreate = [
        // Active_Sessions is NOT here: it lives in the registry, because terms
        // overlap and the session is what tells which one the user is on.
        // Teachers is not here either, for the opposite reason: a teacher is
        // registered once and crosses every term (see roadmap.md).
        { name: DB_SHEETS.STUDENTS,        headers: Object.values(DB_COLS_STUDENT) },
        { name: DB_SHEETS.PROPOSALS,       headers: Object.values(DB_COLS_PROPOSAL) },
        { name: DB_SHEETS.COMMITTEES,      headers: Object.values(DB_COLS_COMMITTEE) },
        { name: DB_SHEETS.DEFENSES,        headers: Object.values(DB_COLS_DEFENSE) },
        { name: DB_SHEETS.EVENTS,          headers: Object.values(DB_COLS_EVENT) }
      ];

      tabsToCreate.forEach(t => {
         let sheet = ss.insertSheet(t.name);
         sheet.getRange(1, 1, 1, t.headers.length).setValues([t.headers]);
      });
      
      const sh1 = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
      if (sh1) ss.deleteSheet(sh1);

      // 4. Register the new semester into Registry
      const newSem = {};
      newSem[DB_COLS_SEMESTER.SEMESTER] = "'" + semesterName; // Prefixo ' para forçar formato texto na planilha
      newSem[DB_COLS_SEMESTER.FOLDER_ID] = folder.getId(); // the term's own folder (see step 0)
      // What the student types on first access to enrol in this term
      newSem[DB_COLS_SEMESTER.ENROLLMENT_CODE] = generateEnrollmentCode_();
      newSem[DB_COLS_SEMESTER.SHEET_ID] = ss.getId();
      newSem[DB_COLS_SEMESTER.INCHARGE_EMAIL] = inchargeEmail;
      newSem[DB_COLS_SEMESTER.STATUS] = SemesterStatus.ACTIVE;
      newSem[DB_COLS_SEMESTER.START_DATE] = new Date().toISOString();
      newSem[DB_COLS_SEMESTER.END_DATE] = "";
      newSem[DB_COLS_SEMESTER.CLASSES_START] = classes.start;
      newSem[DB_COLS_SEMESTER.CLASSES_END] = classes.end;

      ensureColumns_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER);
      regDao.insert(newSem);

      // O Responsável É também Orientador — duas checagens independentes em
      // _rolesInSemester, e a segunda procura em Teachers. Cadastrar aqui é o
      // que faz a frase valer desde o primeiro período: exigir o contrário
      // (que ele já fosse professor cadastrado) travaria o bootstrap, porque
      // ninguém cadastra professor antes de existir período.
      //
      // Não derruba a criação do período se falhar: o período existe, e o
      // Responsável pode se cadastrar pelo próprio painel.
      let inchargeWarning = '';
      try {
        new PeopleService().ensureTeacher(inchargeEmail, inchargeName);
      } catch(e) {
        console.error('startSemester: falha ao cadastrar o Responsável em Teachers:', e);
        inchargeWarning = ' Atenção: não consegui cadastrar ' + inchargeEmail +
                          ' como professor(a) — faça isso em "Professores", ' +
                          'senão a visão de Orientador não fica disponível.';
      }

      return { success: true, msg: "Semestre letivo ativado com sucesso." + inchargeWarning };
    } catch(e) {
      console.error(e);
      return { success: false, msg: e.message };
    }
  }
}

/**
 * Closes a term: it stops being offered in the term selector and nobody logs
 * into it any more. The data stays in place — the term spreadsheet, the Docs
 * and the log are the record of what happened.
 */
function cmdEndSemester(semesterName) {
  try {
    _assertFreshSession_();
    const caller = _assertCanManageSemesters_();
    const auth = new AuthService();
    const target = auth.getSemesterByName(semesterName);
    if (!target) throw new Error('Período letivo não encontrado entre os ativos.');

    // The owner can close any term; a Responsável closes only their own.
    if (!_isAppOwner_() &&
        _normalizeEmail_(target[DB_COLS_SEMESTER.INCHARGE_EMAIL]) !== _normalizeEmail_(caller)) {
      throw new Error('Você não é o Responsável por este período letivo.');
    }

    const registryId = PropertiesService.getScriptProperties().getProperty('REGISTRY_SHEET_ID');
    const regDao = getSheetManager_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER.SEMESTER);
    const patch = {};
    patch[DB_COLS_SEMESTER.STATUS] = SemesterStatus.INACTIVE;
    patch[DB_COLS_SEMESTER.END_DATE] = new Date().toISOString();
    regDao.update(target[DB_COLS_SEMESTER.SEMESTER], patch);

    return { success: true, msg: `Período letivo ${semesterName} encerrado.` };
  } catch(e) {
    console.error('cmdEndSemester error:', e);
    return { success: false, msg: e.message };
  }
}

/**
 * Início e fim das aulas, já no formato da célula.
 *
 * Gravadas como TEXTO "yyyy-MM-dd" (com o ' na frente, como o nome do período),
 * e não como data do Sheets: a planilha de registro não tem o fuso alinhado ao
 * do script, como a do período tem, e o contexto que carrega a linha do período
 * passa pelo CacheService em JSON — uma data viraria um instante UTC e voltaria
 * um dia antes em Manaus. Vazio é aceito: o período pode ser criado antes de o
 * calendário sair, e as datas se completam depois no painel.
 */
function _validateClassDates_(start, end) {
  const norm = value => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Data inválida: ' + text);
    return text;
  };
  const s = norm(start);
  const e = norm(end);
  if (s && e && s > e) throw new Error('O fim das aulas é anterior ao início.');
  return { start: s ? "'" + s : '', end: e ? "'" + e : '' };
}

/**
 * Corrige as datas de aula de um período — o caminho para os períodos criados
 * antes de as datas existirem, e para o calendário que sai depois da criação.
 * Mesma autorização de encerrar: o dono do app, ou o Responsável do período.
 */
function cmdUpdateSemesterDates(semesterName, data) {
  try {
    _assertFreshSession_();
    const caller = _assertCanManageSemesters_();
    const target = new AuthService().getSemesterByName(semesterName);
    if (!target) throw new Error('Período letivo não encontrado entre os ativos.');
    if (!_isAppOwner_() &&
        _normalizeEmail_(target[DB_COLS_SEMESTER.INCHARGE_EMAIL]) !== _normalizeEmail_(caller)) {
      throw new Error('Você não é o Responsável por este período letivo.');
    }

    const input = data || {};
    const classes = _validateClassDates_(input.classesStart, input.classesEnd);
    const registryId = PropertiesService.getScriptProperties().getProperty('REGISTRY_SHEET_ID');
    ensureColumns_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER);
    const patch = {};
    patch[DB_COLS_SEMESTER.CLASSES_START] = classes.start;
    patch[DB_COLS_SEMESTER.CLASSES_END]   = classes.end;
    getSheetManager_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER.SEMESTER)
      .update(target[DB_COLS_SEMESTER.SEMESTER], patch);

    return { success: true, msg: `Datas do período ${semesterName} salvas.` };
  } catch(e) {
    console.error('cmdUpdateSemesterDates error:', e);
    return { success: false, msg: e.message };
  }
}

/** Creates a term from inside the app (Incharge panel), not from the setup screen. */
function cmdCreateSemester(data) {
  try {
    _assertFreshSession_();
  } catch(e) {
    return { success: false, msg: e.message };
  }
  return new SetupService().startSemester(data);
}

/**
 * Public function exposed to client-side google.script.run.
 *
 * Takes an object rather than a positional list: the screen went from two
 * fields to four (the Ata and the Folha de Aprovação joined it), and a fifth
 * would have meant another argument nobody could read at the call site.
 * Authorization is _assertIsAppOwner_, inside initializeSystem.
 */
function processSystemSetup(data) {
  const service = new SetupService();
  return service.initializeSystem(data);
}

/**
 * The Drive id of a document template, refusing to go on without it.
 *
 * Phase 4 templates are fetched HERE and not checked at bootstrap, on purpose.
 * Putting them in isSystemSetup() would lock an install that only wants to run
 * Phases 1–3 behind a screen demanding the model of an Ata it will not generate
 * for months — and, worse, would do it to installs that are already running,
 * since that screen is what the app shows instead of everything else.
 *
 * So the requirement lands at the moment it is real: whoever asks to generate
 * the Ata gets told what to configure, and everyone else never hears about it.
 *
 * @param {string} key   Script Property name
 * @param {string} label how to name it to the user
 */
function _requireTemplate_(key, label) {
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) {
    throw new Error(
      `O ${label} ainda não foi configurado. O Responsável cria o documento no ` +
      `Drive e informa o link em Configuração do Sistema (?page=setup), na ` +
      `conta que publicou o aplicativo.`
    );
  }
  return id;
}

/** Template of the Ata da Defesa (Fase 4a). */
function getAtaTemplateId_() {
  return _requireTemplate_('ATA_TEMPLATE_DOC_ID', 'modelo da Ata da Defesa');
}

/** Template of the Folha de Aprovação (Fase 4b). */
function getApprovalSheetTemplateId_() {
  return _requireTemplate_('APPROVAL_SHEET_TEMPLATE_DOC_ID', 'modelo da Folha de Aprovação');
}

/**
 * Command endpoint for initializing a semester
 */
function processSemesterSetup(data) {
  const service = new SetupService();
  return service.startSemester(data);
}

// ==========================================
// PEOPLE MANAGEMENT (Incharge) — teachers and the term enrolment code
// ==========================================

/**
 * Who may register people: the Responsável of the term being viewed, or the
 * app owner (the only check available while the first term is being set up).
 *
 * Registering a teacher is what grants the Advisor role, so this is an
 * authorization boundary and not a convenience — see roadmap.md for why
 * self-registration was refused for teachers.
 */
function _assertCanManagePeople_() {
  if (_isAppOwner_()) return Session.getActiveUser().getEmail();

  const ctx = new AuthService().getContext();
  if (ctx.role !== UserRole.INCHARGE) {
    throw new Error('Apenas o Responsável pelo período letivo pode cadastrar pessoas.');
  }
  return ctx.email;
}

/**
 * The idle-timeout check for the write commands below.
 *
 * Kept OUT of _assertCanManagePeople_ on purpose: that one also guards
 * getTeacherRegistry, which is a read feeding the Incharge panel. Putting the
 * timeout there made an idle panel come back with an empty faculty list
 * instead of an error — the worst of both, since the screen looked fine and
 * the data was simply gone.
 */
function _assertFreshSession_() {
  if (_isAppOwner_()) return; // bootstrap: there may be no session row at all
  new AuthService().assertActiveSession();
}

/**
 * Creates or updates a teacher. When the teacher is external (someone Google
 * cannot identify), a password is generated on the first save and returned
 * ONCE — the panel shows it, and it is also mailed. After that only
 * cmdResetTeacherPassword produces a new one.
 */
function cmdSaveTeacher(data) {
  try {
    _assertFreshSession_();
    _assertCanManagePeople_();
    const result = new PeopleService().saveTeacher(data || {});
    return {
      success: true,
      password: result.password,
      msg: result.password
        ? 'Professor cadastrado. A senha foi enviada por e-mail e aparece uma única vez aqui.'
        : 'Cadastro salvo.'
    };
  } catch(e) {
    console.error('cmdSaveTeacher error:', e);
    return { success: false, msg: e.message };
  }
}

/**
 * Deactivates (or reactivates) a teacher. Nothing is deleted: the person may
 * be named in a committee of a past term, and a missing row would leave those
 * records pointing at nobody.
 */
function cmdSetTeacherActive(email, isActive) {
  try {
    _assertFreshSession_();
    _assertCanManagePeople_();
    // Patches the one column directly instead of going through saveTeacher:
    // that path generates a password for an external who has none, so merely
    // reactivating someone could have mailed them a brand new credential.
    new PeopleService().setTeacherActive(email, !!isActive);
    return { success: true, msg: isActive ? 'Professor reativado.' : 'Professor desativado.' };
  } catch(e) {
    console.error('cmdSetTeacherActive error:', e);
    return { success: false, msg: e.message };
  }
}

/**
 * Convida um professor por e-mail: o Responsável digita só o endereço, e a
 * pessoa completa o próprio cadastro pelo link.
 *
 * Continua sendo o Responsável quem autoriza — criar a linha é o ato de
 * autorização, e é ele quem o faz. O link não é compartilhável: vale para um
 * e-mail só, uma vez só, e (em conta institucional) apenas na própria conta
 * Google. É o que separa isto de um cadastro aberto, que seria a escalada de
 * privilégio recusada em 10/Ago.
 */
function cmdInviteTeacher(data) {
  try {
    _assertFreshSession_();
    _assertCanManagePeople_();
    const input = data || {};
    const result = new PeopleService().inviteTeacher(input.email, input.name);
    return {
      success: true,
      password: result.password,
      msg: result.password
        ? 'Convite enviado. A senha aparece uma única vez aqui e foi junto no e-mail.'
        : 'Convite enviado por e-mail. O cadastro fica pendente até a pessoa completá-lo.'
    };
  } catch(e) {
    console.error('cmdInviteTeacher error:', e);
    return { success: false, msg: e.message };
  }
}

/**
 * Reenvia o convite (link, e como entrar) a quem já está cadastrado.
 *
 * Nunca reexibe a senha: só o hash fica guardado. Para quem perdeu a senha o
 * caminho é cmdResetTeacherPassword, que gera outra — e o convite reenviado diz
 * exatamente isso.
 */
function cmdResendInvitation(email) {
  try {
    _assertFreshSession_();
    _assertCanManagePeople_();
    new PeopleService().resendInvitation(email);
    return { success: true, msg: 'Convite reenviado por e-mail.' };
  } catch(e) {
    console.error('cmdResendInvitation error:', e);
    return { success: false, msg: e.message };
  }
}

/** New password for an external member who lost theirs. */
function cmdResetTeacherPassword(email) {
  try {
    _assertFreshSession_();
    _assertCanManagePeople_();
    const password = new PeopleService().resetTeacherPassword(email);
    return { success: true, password: password, msg: 'Nova senha enviada por e-mail.' };
  } catch(e) {
    console.error('cmdResetTeacherPassword error:', e);
    return { success: false, msg: e.message };
  }
}

/**
 * "Meus Dados": o professor corrige o próprio cadastro.
 *
 * Único comando de Teachers que NÃO passa por _assertCanManagePeople_ — e nem
 * poderia: a autorização aqui não é o papel de Responsável, é ser o dono da
 * linha. O e-mail vem da SESSÃO e nunca do payload; sem isso, quem chamasse a
 * função com o endereço de outra pessoa reescreveria o cadastro dela.
 *
 * updateOwnProfile recusa e-mail sem linha ativa, então isto não abre a porta
 * do auto-cadastro de professor (rationale 2.3).
 */
function cmdUpdateMyProfile(data) {
  try {
    _assertFreshSession_();
    const auth = new AuthService();
    const ctx = auth.getContext();
    const record = new PeopleService().updateOwnProfile(ctx.email, data || {});
    // O cabeçalho lê o nome da sessão, não da tabela: sem esta linha a
    // correção só apareceria lá na entrada seguinte.
    auth.updateCurrentSessionName(record[DB_COLS_TEACHER.NAME]);
    return {
      success: true,
      profile: {
        name:        record[DB_COLS_TEACHER.NAME]        || '',
        email:       record[DB_COLS_TEACHER.EMAIL]       || '',
        titulacao:   record[DB_COLS_TEACHER.TITULACAO]   || '',
        instituicao: record[DB_COLS_TEACHER.INSTITUICAO] || '',
        phone:       record[DB_COLS_TEACHER.PHONE]       || ''
      },
      msg: 'Dados atualizados.'
    };
  } catch(e) {
    console.error('cmdUpdateMyProfile error:', e);
    return { success: false, msg: e.message };
  }
}

/**
 * Draws a new enrolment code for a term. Used when the current one leaked
 * beyond the class — the old code stops working the moment this returns, which
 * is the whole point.
 */
function cmdRegenerateEnrollmentCode(semesterName) {
  try {
    _assertFreshSession_();
    const caller = _assertCanManagePeople_();
    const auth = new AuthService();
    const target = auth.getSemesterByName(semesterName);
    if (!target) throw new Error('Período letivo não encontrado entre os ativos.');
    // Ser Responsável no período que se está vendo não dá direito sobre os
    // outros: trocar o código de um período alheio deixa a turma dele sem
    // conseguir se matricular. Mesma regra de cmdEndSemester.
    if (!_isAppOwner_() &&
        _normalizeEmail_(target[DB_COLS_SEMESTER.INCHARGE_EMAIL]) !== _normalizeEmail_(caller)) {
      throw new Error('Você não é o Responsável por este período letivo.');
    }

    const registryId = PropertiesService.getScriptProperties().getProperty('REGISTRY_SHEET_ID');
    const regDao = getSheetManager_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER.SEMESTER);
    const code = generateEnrollmentCode_();
    const patch = {};
    patch[DB_COLS_SEMESTER.ENROLLMENT_CODE] = code;
    regDao.update(target[DB_COLS_SEMESTER.SEMESTER], patch);

    return { success: true, code: code, msg: 'Novo código gerado: ' + code };
  } catch(e) {
    console.error('cmdRegenerateEnrollmentCode error:', e);
    return { success: false, msg: e.message };
  }
}

/** The people the Incharge panel lists: every teacher, active or not. */
function getTeacherRegistry() {
  try {
    _assertCanManagePeople_();
    return new PeopleService().getTeachers().map(t => ({
      email:       t[DB_COLS_TEACHER.EMAIL],
      name:        t[DB_COLS_TEACHER.NAME],
      titulacao:   t[DB_COLS_TEACHER.TITULACAO],
      instituicao: t[DB_COLS_TEACHER.INSTITUICAO],
      phone:       t[DB_COLS_TEACHER.PHONE],
      isExternal:  _isTrueCell_(t[DB_COLS_TEACHER.IS_EXTERNAL]),
      isActive:    _isTrueCell_(t[DB_COLS_TEACHER.IS_ACTIVE]),
      // Convidado e ainda sem responder: a tabela precisa distinguir isso de um
      // professor que o Responsável desativou de propósito — os dois estão
      // inativos, mas um espera ação da pessoa e o outro não espera nada.
      invitePending: !_isTrueCell_(t[DB_COLS_TEACHER.IS_ACTIVE]) &&
                     !!String(t[DB_COLS_TEACHER.INVITE_TOKEN] || '').trim()
    }));
  } catch(e) {
    console.error('getTeacherRegistry error:', e);
    return [];
  }
}
