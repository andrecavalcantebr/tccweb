/**
 * FILE: main.js — Entry point do Web App.
 * DESC: routing of URL to the right view (html) and handling initial setup
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

/**
 * Web App entry points. Both delegate to the same router: the login form posts
 * (see below) and everything else navigates by URL.
 */
function doGet(e) {
  return _route_(e);
}

/**
 * The login form is a POST so that the name and the e-mail typed on it do not
 * end up in the address bar — and, worse, in the browser history, where they
 * outlive the session. It buys nothing against replay: refreshing the answer to
 * a POST offers to resend it, and the user confirming that is exactly the case
 * the one-time nonce below already handles.
 */
function doPost(e) {
  return _route_(e);
}

/**
 * Main Function: Web App advanced router
 */
function _route_(e) {
  // 0. Nobody gets in without a Google account behind them. The deployment is
  //    published as "anyone with a Google account", so this should be
  //    unreachable — which is exactly why it is here: the app must not depend
  //    on a deployment setting for an authorization decision, and a deployment
  //    created before that setting was chosen keeps its own. See
  //    _requireGoogleIdentity_ in ServiceAuth.js for what an empty key cost.
  if (!_getIdentityKey_()) {
    return renderError('Conta Google necessária', NO_GOOGLE_IDENTITY_MSG);
  }

  const page = e.parameter.page || 'login';
  const userEmail = Session.getActiveUser().getEmail();

  // 1. Initial Setup Verification (see setup.md) — registry and proposal
  // template are independent requirements; the view shows only what's missing.
  if (!isSystemSetup()) {
    if (!_isAppOwner_()) return renderSetupPending();
    return _renderSetupView_(userEmail, true);
  }

  // 1.5: The same screen, reached on purpose after the system is running.
  //
  // Without this route the configuration screen was a one-way door: it shows
  // only while isSystemSetup() is false, and that goes true the moment the
  // registry and the proposal template exist. Everything configured later —
  // the Ata and the Folha de Aprovação templates of Phase 4 — had nowhere to
  // be typed, and replacing a template meant editing a Script Property by hand
  // in the Apps Script editor.
  //
  // Owner-only, same as the bootstrap path: this screen points the system at
  // Drive folders and documents, which is exactly what the 07/Ago incident was
  // about (see _isAppOwner_).
  if (page === 'setup') {
    if (!_isAppOwner_()) return renderSetupPending();
    return _renderSetupView_(userEmail, false);
  }

  const auth = new AuthService();

  // 2. At least one term must exist. Terms coexist (see ServiceSetup), so this
  //    is about there being none at all — which is still bootstrap.
  if (auth.getActiveSemesters().length === 0) {
    // A tela de setup é do dono do app. Sem esta guarda, qualquer usuário que
    // chegasse antes do Responsável criava um período letivo — e, quando criar
    // ainda desativava o anterior, isso derrubava o período real.
    if (!_isAppOwner_()) return renderSetupPending();
    if (page !== 'semester_setup') {
      return renderView('semester_setup', { userEmail: userEmail });
    }
  }

  // 2.5: Route for strict login form submission avoiding cross-origin iframe security
  if (page === 'validate_login' || page === 'validate_enrollment') {
    // The form data arrives in the POST body (see doPost above), but the
    // browser still offers to resend it on an F5, which replays an identical
    // request. The one-time nonce is what tells a real submission apart from a
    // replay: without it, every refresh would renew the session and the idle
    // timeout could never be reached.
    if (_consumeLoginNonce_(e.parameter.nonce)) {
      // Session.getActiveUser().getEmail() only resolves for accounts in the
      // same Workspace domain as the script (ufam.edu.br) — see login.md. When
      // it resolves, Google has already proved who this is and nothing else is
      // asked. When it does not, the typed e-mail is an unverified claim, and
      // only the password on the Teachers table can back it up.
      const googleVerified = !!userEmail;
      const effectiveEmail = userEmail || e.parameter.email || '';
      const name = e.parameter.name || effectiveEmail.split('@')[0];
      const options = { googleVerified: googleVerified, password: e.parameter.password || '' };

      const result = (page === 'validate_enrollment')
        ? auth.processEnrollment(effectiveEmail, name, {
            code:      e.parameter.code,
            name:      e.parameter.name,
            studentId: e.parameter.studentId,
            phone:     e.parameter.phone
          }, options)
        : auth.processLogin(effectiveEmail, name, options);

      if (!result.success) {
        // Being unknown to the system is not a denial: a student on their first
        // access is SUPPOSED to be unknown, and the way in is the term code.
        // Sending them to an error page would leave them with nothing to do.
        if (result.needsEnrollment) {
          return renderEnrollment(effectiveEmail, name, result.msg);
        }
        return renderError('Acesso Negado', result.msg);
      }
    }
    // Either a fresh login just succeeded, or this is a replay: both continue
    // through the authenticated route below, where the timeout is enforced.
  }

  // 2.6: The student asked for the enrolment form — from the login screen, or
  //      from the invitation link the Responsável handed out, which carries the
  //      term code so nobody has to copy six characters by hand.
  if (page === 'enrollment') {
    return renderEnrollment(userEmail, e.parameter.name || '', '', e.parameter.code || '');
  }

  // 2.7: Convite de professor. Não passa pela sessão: quem abre isto ainda não
  //      é ninguém para o sistema — a linha existe, mas inativa, e é este
  //      formulário que a completa e a ativa.
  if (page === 'teacher_signup') {
    return renderTeacherSignup(e.parameter.token || '', userEmail, '');
  }

  if (page === 'validate_teacher_signup') {
    // Sem o nonce isto é um replay (F5 na resposta do POST). O token já foi
    // consumido pelo primeiro envio, então reprocessar só produziria um erro
    // confuso; devolver o formulário deixa a tela coerente.
    if (!_consumeLoginNonce_(e.parameter.nonce)) {
      return renderTeacherSignup(e.parameter.token || '', userEmail, '');
    }
    try {
      new PeopleService().completeSignup(e.parameter.token, {
        name:        e.parameter.name,
        titulacao:   e.parameter.titulacao,
        instituicao: e.parameter.instituicao,
        phone:       e.parameter.phone
      }, userEmail);
      return renderView('teacher_signup', { done: true, userEmail: userEmail });
    } catch (err) {
      return renderTeacherSignup(e.parameter.token || '', userEmail, err.message);
    }
  }

  // 2.8: Verificação de documento. Fica atrás do login Google (qualquer conta),
  //      e não aberta a anônimo, porque abrir esta rota exigiria abrir a
  //      implantação inteira — e quem verifica uma ata quase sempre tem conta
  //      Google. Ver roadmap.md, "Assinatura digital da Ata".
  if (page === 'verify') {
    return renderView('verify', {
      userEmail: userEmail,
      presetKey: String(e.parameter.key || '').trim().toUpperCase()
    });
  }

  // 2.9: Link de assinatura mandado a um membro da banca. Leva direto à ata
  //      certa, em vez de a pessoa ter de achá-la numa lista — e o convidado de
  //      outra instituição pode não ter nenhuma outra razão para navegar aqui.
  if (page === 'sign') {
    return renderSignMinutes(e.parameter.token || '');
  }

  // 3. Authenticated route (any page other than the login screen). Uses
  //    getValidCurrentSession so the idle timeout is enforced on every page
  //    entry — getCurrentProfile() deliberately ignores it, because a
  //    google.script.run command must not fail in the middle of the work.
  if (page !== 'login') {
    const session = auth.getValidCurrentSession(true);
    if (!session) {
      // Expired, or never logged in: back to the login screen
      return renderLogin(userEmail);
    }

    // 3.1: Role switch. Applied here, on the way in, and NOT by a
    // google.script.run command: the app runs inside an iframe sandboxed with
    // allow-top-navigation-by-user-activation, and Chrome's transient
    // activation expires a few seconds after the click. Redirecting from the
    // callback of a slow call therefore got silently blocked — the page just
    // sat there with the busy cursor on. Navigating straight to this URL keeps
    // the redirect inside the user gesture, and costs one request instead of
    // two.
    //
    // It must come AFTER the check above, never before: the browser stays on
    // this URL once the switch is done, so every later F5 replays it, and
    // switchRole writes LastActivity (and even recreates a missing session
    // row). Applied first, it renewed the session before anyone asked whether
    // it had expired — the idle timeout could never be reached, and an expired
    // session came back to life without the login screen. Same replay trap the
    // nonce closes for validate_login above.
    //
    // A replay of a still-valid session simply re-applies the same role, which
    // is harmless — hence no nonce here.
    if (page === 'switch_role') {
      const switched = switchRole(e.parameter.role);
      if (!switched.success) {
        return renderError('Troca de Papel', switched.msg);
      }
      session.role = e.parameter.role; // the row just read is now stale
    }

    // 3.2: Term switch — same reasoning and same trap as the role switch above.
    // The role is recomputed for the target term by switchSemester, so the
    // dashboard is re-read from the session instead of patched here.
    if (page === 'switch_semester') {
      const switched = switchSemester(e.parameter.semester);
      if (!switched.success) {
        return renderError('Troca de Período', switched.msg);
      }
      return _renderDashboard_(new AuthService(), null);
    }

    return _renderDashboard_(auth, session);
  }

  // 4. Root URL — skip login if a non-expired session still exists
  const validSession = auth.getValidCurrentSession(true);
  if (validSession) {
    return _renderDashboard_(auth, validSession);
  }

  return renderLogin(userEmail);
}

/**
 * Serializes a value as a JavaScript literal safe to drop inside a <script>.
 *
 * JSON is almost a subset of JavaScript, and the gap is exactly what breaks
 * here: a "</script>" inside any string field would close the block early, and
 * U+2028/U+2029 are line terminators to the JS parser but plain characters to
 * JSON. Both come from data the user typed (a proposal title, a comment), so
 * neither is hypothetical.
 */
function _jsonForScript_(value) {
  return JSON.stringify(value === undefined ? null : value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Builds the panel payload to ship inside the page, or null.
 *
 * Never throws: a failure here must not cost the user the page itself. The
 * client falls back to fetching the data on its own, which is the behaviour
 * this optimization replaces — so the worst case is exactly the old speed.
 */
function _initialDashboardPayload_(role) {
  try {
    return _dashboardPayloadForRole_(role);
  } catch (e) {
    console.error(`Falha ao montar o painel inicial para ${role}: ${e.message}`);
    return null;
  }
}

/**
 * Renders the dashboard matching the session's role.
 */
function _renderDashboard_(auth, session) {
  const VIEW_MAP = {
    [UserRole.STUDENT]:  'dashboard_student',
    [UserRole.ADVISOR]:  'dashboard_advisor',
    [UserRole.INCHARGE]: 'dashboard_incharge'
  };
  // After a term switch the caller passes null: the session was just rewritten,
  // so it is read again from a fresh AuthService instead of reusing stale data.
  const current = session || auth.getCurrentProfile();
  const semester = auth.getCurrentSemester();

  // No usable term means there is no panel to draw. Rendering one anyway put
  // the user in front of a dashboard that could only ever fail to load — the
  // shell appeared, the data call answered "sem período letivo", and the screen
  // sat there. The decision belongs here, before the page is chosen: a term
  // with no spreadsheet (SheetId wiped, file trashed) is as unusable as no term
  // at all, and semesterUnavailableMessage tells the two cases apart.
  if (!semester || !semester[DB_COLS_SEMESTER.SHEET_ID]) {
    return renderError('Período letivo indisponível',
                       semesterUnavailableMessage({ semester: semester }));
  }

  return renderView(VIEW_MAP[current.role] || 'error', {
    userEmail: current.email,
    userName: current.name,
    userRole: current.role,
    // Drives the "Configuração do Sistema" button, which only the account that
    // published the app may use. Sent as a flag rather than checked in the
    // browser because the browser has no way to know — and because a button
    // that leads to a refusal is worse than no button: it tells the wrong
    // person that there is something there for them.
    isAppOwner: _isAppOwner_(),
    // The panel data travels inside the page, so opening it costs ONE Apps
    // Script execution instead of two. The second one existed only because the
    // client asked for the data after the HTML had already arrived, and each
    // execution pays the runtime start over again — half the delay measured
    // between the login and the data showing up.
    //
    // The client still keeps its google.script.run path: it is what the
    // "Tentar novamente" button and every action use, and it is the fallback
    // whenever this comes back null (see _initialDashboardPayload_).
    initialPayload: _jsonForScript_(_initialDashboardPayload_(current.role)),
    availableRoles: auth.getAvailableRoles(current.email),
    // Terms overlap, and a person can take part in more than one — as a
    // professor with two classes, or as a student who restarted the TCC in a
    // later term while the previous one is still open.
    availableSemesters: auth.getAvailableSemesters(current.email),
    currentSemester: semester
      ? String(semester[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, '')
      : ''
  });
}

/**
 * The system configuration screen: the Drive folder, and the three document
 * templates. `isBootstrap` tells the view whether the app is still being set
 * up (nothing else works yet) or whether this is a deliberate visit from a
 * running system, which changes the wording and whether there is a way back.
 */
function _renderSetupView_(userEmail, isBootstrap) {
  const props = PropertiesService.getScriptProperties();
  return renderView('initial_setup', {
    userEmail:   userEmail,
    isBootstrap: !!isBootstrap,
    hasRegistry: !!props.getProperty('REGISTRY_SHEET_ID'),
    hasTemplate: !!props.getProperty('PROPOSAL_TEMPLATE_DOC_ID'),
    hasAta:      !!props.getProperty('ATA_TEMPLATE_DOC_ID'),
    hasApproval: !!props.getProperty('APPROVAL_SHEET_TEMPLATE_DOC_ID')
  });
}

/**
 * Shown to anyone who reaches the app while it is still being configured.
 * Deliberately says nothing about what is missing: whoever sees this has no
 * business setting it up.
 */
function renderSetupPending() {
  return renderError(
    'Sistema em configuração',
    'O TCC Web App ainda está sendo configurado pelo Responsável pela ' +
    'disciplina. Tente novamente mais tarde.'
  );
}

/**
 * Renders the login screen carrying a fresh one-time token.
 *
 * `userEmail` doubles as the switch that enforces the login restriction on
 * screen: when Google resolved the account the field is read-only, because
 * accepting a typed e-mail there would let anyone claim any identity. When it
 * did not resolve, the field is editable AND a password is required — see
 * AuthService.processLogin.
 */
function renderLogin(userEmail) {
  return renderView('login', {
    userEmail: userEmail,
    loginNonce: _issueLoginNonce_()
  });
}

/**
 * Renders the student self-enrolment screen (term code + name + matrícula).
 * This is the door that replaced "entrar na turma do Classroom com o código".
 */
function renderEnrollment(userEmail, name, message, presetCode) {
  return renderView('enrollment', {
    userEmail: userEmail,
    displayName: name || '',
    message: message || '',
    // Vem do link de convite. Fica editável de propósito: um código errado na
    // URL tem de poder ser corrigido na tela, em vez de virar um beco sem saída.
    presetCode: String(presetCode || '').trim().toUpperCase(),
    loginNonce: _issueLoginNonce_()
  });
}

/**
 * Desenha a tela de assinatura a partir do token do e-mail.
 *
 * O token diz QUAL ata; quem pode assinar continua sendo decidido pela sessão —
 * o link é conveniência de navegação, não credencial. Um link encaminhado leva
 * outra pessoa a uma tela que recusa a assinatura dela.
 */
function renderSignMinutes(token) {
  const auth = new AuthService();
  const session = auth.getValidCurrentSession(true);
  if (!session) return renderLogin(Session.getActiveUser().getEmail());

  const ctx = auth.getContext();
  if (!ctx.sheetId) {
    return renderError('Período letivo indisponível', semesterUnavailableMessage(ctx));
  }

  const found = findDefenseBySignatureToken_(ctx.sheetId, token);
  if (!found) {
    return renderError(
      'Link de assinatura inválido',
      'Este link não vale mais: ou a assinatura já foi dada, ou a Ata foi ' +
      'encerrada. Entre no sistema — se ainda houver algo a assinar, estará no ' +
      'seu painel, em "Atas aguardando a sua assinatura".'
    );
  }

  if (_normalizeEmail_(found.memberEmail) !== _normalizeEmail_(ctx.email)) {
    return renderError(
      'Assinatura de outra pessoa',
      `Este link é a assinatura de ${found.memberEmail}. Entre com essa conta ` +
      `para assiná-la.`
    );
  }

  return renderView('sign_minutes', {
    userEmail:   ctx.email,
    proposalId:  found.proposalId,
    studentName: found.studentName,
    defenseJson: _jsonForScript_(found.defense)
  });
}

/**
 * Renders the teacher self-completion form behind an invitation link.
 *
 * The two refusals happen HERE, before the form is drawn, and again inside
 * PeopleService.completeSignup — the first so the person learns immediately
 * instead of after typing everything, the second because a check that only
 * happens in the rendering is no check at all.
 */
function renderTeacherSignup(token, userEmail, message) {
  const record = new PeopleService().getTeacherByInviteToken(token);
  if (!record) {
    return renderError(
      'Convite inválido ou expirado',
      'Este link não vale mais: ou já foi usado, ou passou da validade de ' +
      TEACHER_INVITE_TTL_DAYS + ' dias. Peça um novo ao professor responsável ' +
      'pela disciplina.'
    );
  }

  const invited = String(record[DB_COLS_TEACHER.EMAIL] || '');
  const isExternal = _isTrueCell_(record[DB_COLS_TEACHER.IS_EXTERNAL]);

  // Convite de conta institucional só vale na própria conta: sem isto, um link
  // encaminhado deixaria outra pessoa assumir o cadastro — e um aluno tem
  // e-mail do mesmo domínio.
  if (!isExternal && _normalizeEmail_(userEmail) !== _normalizeEmail_(invited)) {
    return renderError(
      'Conta diferente da convidada',
      `Este convite é de ${invited}. Entre no navegador com essa conta Google ` +
      `e abra o link de novo.`
    );
  }

  return renderView('teacher_signup', {
    done: false,
    token: String(token || ''),
    invitedEmail: invited,
    isExternal: isExternal,
    displayName: String(record[DB_COLS_TEACHER.NAME] || ''),
    message: message || '',
    userEmail: userEmail,
    loginNonce: _issueLoginNonce_()
  });
}

/**
 * Issues a one-time token for a login form. Stored server-side (script cache)
 * so a replayed submission — an F5 on the post-login URL — can be told apart
 * from a real one.
 */
function _issueLoginNonce_() {
  const nonce = Utilities.getUuid();
  // TTL comfortably longer than someone takes to fill the form, and far
  // shorter than the cache maximum
  CacheService.getScriptCache().put('login_nonce_' + nonce, '1', 1800);
  return nonce;
}

/**
 * Consumes a login token, returning whether it was valid. A token is only
 * ever accepted once.
 */
function _consumeLoginNonce_(nonce) {
  if (!nonce) return false;
  const cache = CacheService.getScriptCache();
  const key = 'login_nonce_' + String(nonce);
  if (!cache.get(key)) return false;
  cache.remove(key);
  return true;
}

/**
 * Global include, used by any template evaluated outside renderView — the
 * error page, and partials that include other partials. renderView overrides
 * this with a closure that also forwards its arguments; here there is nothing
 * to forward, which is exactly the case of a stylesheet or a script block.
 *
 * Without it, `<?!= include('ui_styles') ?>` in ui_error.html threw
 * "include is not defined", renderError fell into its own catch, and EVERY
 * error screen in the app came out as the bare "Erro Crítico" fallback.
 */
function include(filename) {
  const name = String(filename).replace(/\.html$/, '');
  try {
    return HtmlService.createTemplateFromFile(name).evaluate().getContent();
  } catch (err) {
    console.error(`Falha no include de ${filename}: ${err.message}`);
    return `<!-- Erro do Include: ${filename} -->`;
  }
}

/**
 * Helper to render HTML templates with injected content
 */
function renderView(templateName, args = {}) {
  try {
    const template = HtmlService.createTemplateFromFile(`ui_app_${templateName}`);
    
    // Inject parameters into the main template
    for (let key in args) {
      template[key] = args[key];
    }

    // Modern Include: Evaluating partials with inherited variables
    template.include = function(filename) {
      const name = filename.replace(/\.html$/, '');
      try {
        const partial = HtmlService.createTemplateFromFile(name);
        // Inject same parent arguments into partials (crucial for ui_comp_page_header)
        for (let key in args) {
           partial[key] = args[key];
        }
        return partial.evaluate().getContent();
      } catch (err) {
        console.error(`Falha no include de ${filename}`);
        return `<!-- Erro do Include: ${filename} -->`;
      }
    };

    return _servePage_(template, `TCC Web App - ${templateName}`);
  } catch (err) {
    console.error(`Erro ao renderizar ${templateName}: ${err.message}`);
    return renderError('Erro de Renderização', 'Não foi possível carregar esta página.');
  }
}

/**
 * Friendly error fallback
 */
function renderError(title, message) {
  try {
    const template = HtmlService.createTemplateFromFile('ui_error');
    template.errorMessage = title;
    template.errorDetail = message;
    template.appUrl = ScriptApp.getService().getUrl(); 
    return _servePage_(template, 'TCC Web App - Erro');
  } catch (e) {
    // Último recurso: a própria página de erro não renderizou. Sem include e
    // sem template, mas ainda legível — e agora dizendo o que falhou, porque a
    // versão anterior escondia a causa e fez passar por normal um bug em que
    // NENHUMA tela de erro era renderizada (ver checkpoint.md).
    console.error(`Falha ao renderizar a página de erro: ${e.message}`);
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Roboto,Arial,sans-serif;max-width:400px;margin:40px auto;' +
      'color:#202124;">' +
      `<h2 style="color:#d93025;">⚠️ ${title}</h2><p>${message}</p></div>`
    );
  }
}

/**
 * Validates that both required system-wide properties are set: the registry
 * sheet and the proposal template document.
 */
function isSystemSetup() {
  const props = PropertiesService.getScriptProperties();
  return !!props.getProperty('REGISTRY_SHEET_ID') && !!props.getProperty('PROPOSAL_TEMPLATE_DOC_ID');
}

/**
 * Aux function to wrap HTML in response
 */
function _servePage_(filename, title) {
  return filename.evaluate()
      .setTitle(title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

