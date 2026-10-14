/**
 * FILE: diagnostics.js — Diagnostic tools (development only)
 * DESC: Functions run by hand from the Apps Script editor (Executar > ...)
 *       to inspect the live configuration when something fails in the cloud.
 *       See the contract below before adding anything here.
 * AUTH: Andre Cavalcante
 * DATE: August, 2026
 * LICENCE: GPL-v3
 *
 * ── CONTRACT ────────────────────────────────────────────────────────
 *
 * 1. DEVELOPMENT ONLY. Nothing in production code may depend on this file:
 *    it is meant to be deleted whole before the system goes live (see the
 *    reminder in checkpoint.md).
 *
 * 2. THE EXECUTION LOG IS THE ONLY OUTPUT CHANNEL. A diagnostic function
 *    writes with console.log and returns nothing — never to the client,
 *    never to a sheet, never by e-mail.
 *
 *    This is a security rule, not a style preference: in Apps Script EVERY
 *    global function is callable from the browser through
 *    google.script.run, whether or not it was meant to be exposed. The
 *    functions here therefore already are reachable by any authenticated
 *    user. Since they only write to the server-side log and return
 *    undefined, nothing leaks. A diagnostic that returned, say, the student
 *    roster or a list of file IDs would hand that data to whoever called
 *    it — including a student.
 *
 * 3. Diagnostics may READ anything and must not WRITE anything. Reproducing
 *    a problem must never change the data being investigated.
 *
 * 4. Anything that CHANGES state (forceReauth revokes the script's own
 *    authorization) checks _isAppOwner_() first. Renaming it with a trailing
 *    "_" would hide it from the browser, but also from the editor's Run menu,
 *    which is the only reason it exists. Called from the web by anyone else,
 *    it took the whole app down until the owner re-authorized it.
 */

/**
 * Invalida o token OAuth atual em cache para forçar a reautenticação
 * no Google Apps Script. Ao rodar esta função uma vez no editor, o token
 * antigo é descartado. Em seguida, ao rodar diagnoseAllPermissions,
 * o Google abrirá a tela modal de autorização pedindo todos os escopos declarados.
 */
function forceReauth() {
  if (!_isAppOwner_()) {
    console.error('forceReauth recusado: só a conta que publicou o app pode executá-lo.');
    return;
  }
  console.log('Invalidando token OAuth em cache...');
  ScriptApp.invalidateAuth();
  console.log('Token invalidado com sucesso. Execute agora diagnoseAllPermissions para autorizar todos os escopos.');
}

/**
 * Prints who the system knows: registered teachers and the students enrolled in
 * the current term. Replaced diagnoseClassroom() when the roster left — the
 * question it answers is the same ("why does the panel say there is nobody?"),
 * only the answer now lives in two local tables instead of an API call.
 */
function diagnosePeople() {
  const auth = new AuthService();
  const semester = auth.getCurrentSemester();
  if (!semester) {
    console.log('Nenhum período letivo ativo no registro.');
    return;
  }

  console.log('Período letivo: %s', semester[DB_COLS_SEMESTER.SEMESTER]);
  console.log('E-mail do Responsável gravado: %s', semester[DB_COLS_SEMESTER.INCHARGE_EMAIL]);
  console.log('Código de matrícula: "%s"', semester[DB_COLS_SEMESTER.ENROLLMENT_CODE]);
  console.log('Usuário da execução: "%s"', Session.getActiveUser().getEmail());

  try {
    const teachers = getRegisteredTeachers_();
    console.log('Professores ativos (%s): %s', teachers.length, JSON.stringify(teachers));
  } catch (e) {
    console.log('ERRO ao listar professores: %s', e.message);
  }

  try {
    const students = getSemesterStudents_(semester[DB_COLS_SEMESTER.SHEET_ID]);
    console.log('Alunos matriculados (%s): %s', students.length, JSON.stringify(students));
  } catch (e) {
    console.log('ERRO ao listar alunos: %s', e.message);
  }
}

/**
 * Checks access to the proposal template. Touches DriveApp and DocumentApp:
 * running it from the editor triggers the OAuth consent dialog for the
 * 'documents' and 'drive' scopes.
 */
function diagnoseTemplateAccess() {
  const templateId = PropertiesService.getScriptProperties().getProperty('PROPOSAL_TEMPLATE_DOC_ID');
  console.log('PROPOSAL_TEMPLATE_DOC_ID: "%s"', templateId);
  if (!templateId) {
    console.log('Template da proposta não configurado no Setup Inicial.');
    return;
  }

  try {
    const file = DriveApp.getFileById(templateId);
    console.log('DriveApp OK — arquivo: "%s"', file.getName());
  } catch (e) {
    console.log('ERRO no DriveApp: %s', e.message);
    return;
  }

  try {
    const doc = DocumentApp.openById(templateId);
    console.log('DocumentApp OK — documento: "%s"', doc.getName());
    console.log('Escopo "documents" concedido: o fluxo da proposta deve funcionar.');
  } catch (e) {
    console.log('ERRO no DocumentApp: %s', e.message);
  }
}

/**
 * Checks access to MailApp and reads the remaining daily quota.
 * Running this from the Apps Script editor triggers OAuth consent for the
 * 'script.send_mail' scope before Web App executions encounter it.
 */
function diagnoseMailAccess() {
  console.log('Verificando MailApp...');
  try {
    const quota = MailApp.getRemainingDailyQuota();
    console.log('MailApp OK — Cota de envio diária restante: %s e-mails.', quota);
    console.log('Escopo "script.send_mail" concedido: convites e notificações devem funcionar.');
  } catch (e) {
    console.log('ERRO no MailApp: %s', e.message);
  }
}

/**
 * Prints who the app thinks is calling and what stage of the setup it is in.
 * Written when the deployed app answered "Sistema em configuração" to the
 * owner's own browser: that screen is deliberately mute about what is missing,
 * so there is no way to tell from the outside whether the properties are gone,
 * no term exists, or the caller simply was not recognized as the owner.
 *
 * Run from the editor and it reports the owner's own view; the interesting run
 * is the one triggered from the browser session under test.
 */
function diagnoseIdentity() {
  const active    = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();

  console.log('Usuário ativo (quem navega): "%s"', active);
  console.log('Usuário efetivo (quem publicou): "%s"', effective);
  console.log('Reconhecido como dono do app: %s', !!active && active === effective);

  if (!active) {
    console.log(
      'Ativo vazio: a conta do navegador está fora do domínio do script ' +
      '(só contas @ufam.edu.br resolvem). Nenhuma conta nessa situação passa ' +
      'na verificação de dono.'
    );
  }

  const props = PropertiesService.getScriptProperties();
  console.log('REGISTRY_SHEET_ID: "%s"', props.getProperty('REGISTRY_SHEET_ID'));
  console.log('PROPOSAL_TEMPLATE_DOC_ID: "%s"', props.getProperty('PROPOSAL_TEMPLATE_DOC_ID'));
  console.log('isSystemSetup(): %s', isSystemSetup());

  if (!isSystemSetup()) {
    console.log('Setup incompleto: o dono veria a tela de Setup Inicial.');
    return;
  }

  try {
    const active_ = new AuthService().getActiveSemesters();
    console.log('Períodos ativos (%s): %s', active_.length, JSON.stringify(
      active_.map(s => String(s[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, ''))
    ));
  } catch (e) {
    console.log('ERRO ao ler os períodos: %s', e.message);
  }
}

/**
 * Touches every external service used by the Web App (SpreadsheetApp, DriveApp,
 * DocumentApp, MailApp, Session, PropertiesService, Utilities) in a single run.
 *
 * Running this function from the Apps Script editor (Executar > diagnoseAllPermissions)
 * triggers the OAuth consent dialog for ALL declared scopes at once, avoiding repeated
 * authorization prompts whenever code touching a different service is exercised.
 */
function diagnoseAllPermissions() {
  console.log('=== DIAGNÓSTICO COMPLETO DE PERMISSÕES E SERVIÇOS ===');

  // 1. Session / Identity
  try {
    const active = Session.getActiveUser().getEmail();
    const effective = Session.getEffectiveUser().getEmail();
    console.log('1. Session OK — Ativo: "%s", Efetivo: "%s"', active, effective);
  } catch (e) {
    console.log('1. Session ERRO: %s', e.message);
  }

  // 2. Script Properties
  let props;
  try {
    props = PropertiesService.getScriptProperties();
    const regId = props.getProperty('REGISTRY_SHEET_ID');
    console.log('2. Script Properties OK — REGISTRY_SHEET_ID: "%s"', regId || '(não definido)');
  } catch (e) {
    console.log('2. Script Properties ERRO: %s', e.message);
  }

  // 3. SpreadsheetApp
  try {
    const regId = props ? props.getProperty('REGISTRY_SHEET_ID') : null;
    if (regId) {
      const ss = SpreadsheetApp.openById(regId);
      console.log('3. SpreadsheetApp OK — Planilha Registro: "%s" (%s abas)', ss.getName(), ss.getSheets().length);
    } else {
      console.log('3. SpreadsheetApp AVISO: REGISTRY_SHEET_ID não configurado.');
    }
  } catch (e) {
    console.log('3. SpreadsheetApp ERRO: %s', e.message);
  }

  // 4. DriveApp
  try {
    const dataDirId = props ? props.getProperty('DATA_DIR_ID') : null;
    if (dataDirId) {
      const folder = DriveApp.getFolderById(dataDirId);
      console.log('4. DriveApp OK — Pasta Data: "%s"', folder.getName());
    } else {
      const rootFolder = DriveApp.getRootFolder();
      console.log('4. DriveApp OK — Pasta raiz acessada: "%s"', rootFolder.getName());
    }
  } catch (e) {
    console.log('4. DriveApp ERRO: %s', e.message);
  }

  // 5. DocumentApp
  try {
    const templateId = props ? props.getProperty('PROPOSAL_TEMPLATE_DOC_ID') : null;
    if (templateId) {
      const doc = DocumentApp.openById(templateId);
      console.log('5. DocumentApp OK — Template Proposta: "%s"', doc.getName());
    } else {
      console.log('5. DocumentApp AVISO: PROPOSAL_TEMPLATE_DOC_ID não configurado.');
    }
  } catch (e) {
    console.log('5. DocumentApp ERRO: %s', e.message);
  }

  // 6. MailApp
  try {
    const quota = MailApp.getRemainingDailyQuota();
    console.log('6. MailApp OK — Cota diária restante: %s e-mails', quota);
  } catch (e) {
    console.log('6. MailApp ERRO: %s', e.message);
  }

  // 7. Utilities (Crypto HMAC)
  try {
    const sig = Utilities.computeHmacSha256Signature('test', 'secret');
    console.log('7. Utilities HMAC OK — Assinatura de teste gerada (%s bytes)', sig.length);
  } catch (e) {
    console.log('7. Utilities HMAC ERRO: %s', e.message);
  }

  console.log('=== FIM DO DIAGNÓSTICO ===');
}
