/**
 * FILE: ServiceAuth.js
 * DESC: Authentication/Authorization logic and session caching
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

/**
 * Resolves a stable per-user identity key for the Active_Sessions lookup.
 * Session.getActiveUser().getEmail() only resolves for accounts in the same
 * Workspace domain as the script; for any other Google account it returns
 * ''. Session.getTemporaryActiveUserKey() is always available (stable per
 * user per script, verified by Google) and covers that gap with no
 * client<->server plumbing needed.
 */
function _getIdentityKey_() {
  return Session.getActiveUser().getEmail() || Session.getTemporaryActiveUserKey();
}

/**
 * The identity key, refusing anyone the platform did not authenticate.
 *
 * Both sources above are empty for a visitor with no Google account behind
 * them, and an empty key is not merely useless — it is dangerous. The session
 * row is keyed by it, and SheetDao.getById compares loosely, so '' == '' made
 * every anonymous visitor land on the SAME session row: the first one to log
 * in as an external member handed their session to the next stranger who
 * opened the URL.
 *
 * The gate is deliberately about AUTHENTICATION, not about identity. Which
 * Google account it is does not matter and is never checked here — an external
 * committee member may sign in with any personal account and then prove who
 * they are with the credential in Teachers (AuthService.processLogin). What
 * this refuses is the visitor who is nobody at all.
 */
function _requireGoogleIdentity_() {
  const key = _getIdentityKey_();
  if (!key) throw new Error(NO_GOOGLE_IDENTITY_MSG);
  return key;
}

/**
 * Whether an identity Google could NOT resolve may enrol as a student by
 * typing its own e-mail. Off unless the Script Property TEST_LOGIN_ENABLED is
 * exactly 'true'.
 *
 * In production the answer is no, and that is the whole point of the login
 * restriction: a typed e-mail is an unverified claim. But the student role can
 * only be exercised by someone enrolled, and enrolling requires an e-mail — so
 * with the door strictly shut, testing the student flow needs a second real
 * ufam.edu.br account, which a developer does not necessarily have.
 *
 * The switch buys that back without reopening the hole: even when on, the
 * enrolment refuses any e-mail that already belongs to a registered teacher,
 * so the worst it can produce is a fake student, never a fake advisor. Leave it
 * unset on the production deployment.
 */
function _unverifiedLoginAllowed_() {
  return PropertiesService.getScriptProperties()
    .getProperty('TEST_LOGIN_ENABLED') === 'true';
}

/** Checked at most once per execution — the tab is missing only on old installs. */
var _sessionsTabChecked = false;

/**
 * Creates the Active_Sessions tab in the registry if it is not there.
 *
 * The tab is created when the registry is created, but a registry created by
 * an earlier version does not have it: sessions used to live in the term
 * spreadsheet, and moving them here was what allowed terms to coexist. Without
 * this, such an install answers every single request — including the login —
 * with "Sheet (Tab) not found: Active_Sessions" and there is no way in from the
 * app at all.
 *
 * Self-healing is safe precisely for this table and not for the others: a
 * session row is throwaway state, so an empty tab costs at most one new login.
 * Recreating a Proposals or Events tab, by contrast, would quietly hide data
 * loss, which is why nothing similar exists for them.
 */
function _ensureSessionsTab_(registryId) {
  if (_sessionsTabChecked) return;
  _sessionsTabChecked = true;
  if (!registryId || typeof registryId !== 'string' || !registryId.trim()) {
    console.error('_ensureSessionsTab_ chamado sem registryId válido.');
    return;
  }
  try {
    const ss = _openSpreadsheetOnce_(registryId);
    if (ss.getSheetByName(DB_SHEETS.ACTIVE_SESSIONS)) return;

    const tab = ss.insertSheet(DB_SHEETS.ACTIVE_SESSIONS);
    const cols = Object.values(DB_COLS_SESSION);
    tab.getRange(1, 1, 1, cols.length).setValues([cols]);
    console.log('Aba %s criada no registro (instalação anterior à mudança).',
                DB_SHEETS.ACTIVE_SESSIONS);
  } catch (e) {
    // Não é fatal aqui: quem chamou vai falhar com a mensagem original, que é
    // mais informativa do que um erro de criação de aba.
    console.error('Falha ao garantir a aba de sessões: %s', e.message);
  }
}

// Validated snapshots contain no credentials and are scoped to the Google
// identity AND registry. ScriptCache is shared, so identity is part of the key.
var _authInstances = Object.create(null);

function _authCacheKey_(registryId, identityKey) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify([registryId, identityKey]), Utilities.Charset.UTF_8);
  return 'auth:v1:' + digest.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

/** Server-only: discard this identity's validation, including live instances. */
function invalidateCurrentUserAuth_() {
  const identityKey = _requireGoogleIdentity_();
  const registryId = PropertiesService.getScriptProperties().getProperty('REGISTRY_SHEET_ID');
  _invalidateAuthIdentity_(registryId, identityKey);
  if (registryId) invalidateSheetCache_(registryId, DB_SHEETS.ACTIVE_SESSIONS);
  // An explicit refresh must also discard request-local roster/term snapshots.
  Object.keys(_sheetReadCache).forEach(key => {
    _sheetReadCache[key].rows = undefined;
  });
  _clearPeopleCache_();
}

function _invalidateAuthIdentity_(registryId, identityKey) {
  if (!registryId || !identityKey) return;
  const key = _authCacheKey_(registryId, identityKey);
  try {
    CacheService.getScriptCache().remove(key + ':generation');
    CacheService.getScriptCache().remove(key);
  }
  catch (e) { console.error('Auth cache removal failed:', e); }
  if (_authInstances[key]) _authInstances[key]._resetValidation();
}

/** Server-only: roster/term edits invalidate every identity's authorization. */
function invalidateAllUserAuth_() {
  Object.keys(_sheetReadCache).forEach(key => {
    const sheetName = JSON.parse(key)[1];
    if ([DB_SHEETS.TEACHERS, DB_SHEETS.STUDENTS, DB_SHEETS.SEMESTERS,
        DB_SHEETS.ACTIVE_SESSIONS].includes(sheetName)) _sheetReadCache[key].rows = undefined;
  });
  _clearPeopleCache_();
  const revision = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('AUTH_CACHE_REVISION', revision);
  Object.keys(_authInstances).forEach(key => {
    const auth = _authInstances[key];
    auth._resetValidation();
    auth._authRevision = revision;
  });
}

// Called after DAO writes, including partial failures. Activity timestamps do
// not change permissions; _touch updates the cached session without extending
// the validation deadline. No domain records are cached across requests.
function _invalidateAuthForSheet_(spreadsheetId, sheetName, id, patch) {
  if (sheetName === DB_SHEETS.ACTIVE_SESSIONS) {
    if (Object.keys(patch).some(key => key !== DB_COLS_SESSION.LAST_ACTIVITY)) {
      _invalidateAuthIdentity_(spreadsheetId, id);
    }
  } else if ([DB_SHEETS.TEACHERS, DB_SHEETS.STUDENTS, DB_SHEETS.SEMESTERS].includes(sheetName)) {
    _clearPeopleCache_();
    invalidateAllUserAuth_();
  }
}

class AuthService {
  constructor() {
    this.props = PropertiesService.getScriptProperties();
    const identityKey = _getIdentityKey_();
    const registryId = this.getRegistrySheetId();
    this._authRevision = this.props.getProperty('AUTH_CACHE_REVISION') || '';
    if (!identityKey || !registryId) return;
    this._authKey = _authCacheKey_(registryId, identityKey);
    const existing = _authInstances[this._authKey];
    if (existing && existing._authRevision === this._authRevision) {
      existing._ensureFreshValidation();
      return existing;
    }
    _authInstances[this._authKey] = this;
    this._ensureCacheGeneration();
    try {
      const raw = CacheService.getScriptCache().get(this._authKey);
      const saved = raw ? JSON.parse(raw, (key, value) =>
        value && value.__authDate ? new Date(value.__authDate) : value) : null;
      if (!saved || !this._authGeneration || saved.generation !== this._authGeneration ||
          saved.revision !== this._authRevision ||
          !Number.isFinite(saved.validUntil) || saved.validUntil <= Date.now()) return;
      this._validatedUntil = saved.validUntil;
      this._sessionRow = saved.session;
      this._context = saved.context;
      this._profile = { email: saved.context.email, name: saved.context.name, role: saved.context.role };
      this._activeSemesters = saved.activeSemesters;
      this._rolesMemo = saved.rolesMemo;
      this._currentSemester = this._activeSemesters.find(sem =>
        String(sem[DB_COLS_SEMESTER.SEMESTER]) ===
        String(saved.context.semester[DB_COLS_SEMESTER.SEMESTER])) || null;
      this._context.semester = this._currentSemester;
    } catch (e) {
      this._resetValidation();
      console.error('Auth cache read failed; using Sheets:', e);
    }
  }

  _resetValidation() {
    ['_validatedUntil', '_sessionRow', '_context', '_profile', '_activeSemesters',
      '_rolesMemo', '_currentSemester', '_userSemesters', '_userSemestersFor',
      '_selectable', '_selectableFor', '_authReadFailed', '_authGeneration'].forEach(key => { delete this[key]; });
  }

  _ensureCacheGeneration() {
    if (!this._authKey || this._authGeneration) return;
    try {
      const cache = CacheService.getScriptCache();
      const key = this._authKey + ':generation';
      this._authGeneration = cache.get(key);
      if (!this._authGeneration) {
        this._authGeneration = Utilities.getUuid();
        cache.put(key, this._authGeneration, SESSION_TIMEOUT_MINUTES * 60);
      }
    } catch (e) { console.error('Auth cache generation unavailable:', e); }
  }

  _ensureFreshValidation() {
    if (this._validatedUntil && this._validatedUntil <= Date.now()) this._resetValidation();
    this._ensureCacheGeneration();
  }

  _saveValidatedCache() {
    if (!this._authKey || !this._context || !this._context.semester ||
        this._context.role === UserRole.ERROR || this._authReadFailed || !this._sessionRow) return;
    const activity = new Date(this._sessionRow[DB_COLS_SESSION.LAST_ACTIVITY]).getTime();
    if (!Number.isFinite(activity) || Date.now() - activity >= SESSION_TIMEOUT_MINUTES * 60000) return;
    // A cache hit or session touch never slides the authorization deadline.
    if (!this._validatedUntil) this._validatedUntil = Date.now() + SESSION_TIMEOUT_MINUTES * 60000;
    const validUntil = Math.min(this._validatedUntil, activity + SESSION_TIMEOUT_MINUTES * 60000);
    const ttl = Math.floor((validUntil - Date.now()) / 1000);
    if (ttl <= 0) return;
    try {
      // Do not publish a snapshot if a concurrent roster edit invalidated it.
      if ((this.props.getProperty('AUTH_CACHE_REVISION') || '') !== this._authRevision) return;
      const cache = CacheService.getScriptCache();
      // In-flight requests cannot republish a snapshot invalidated by a role
      // switch or explicit refresh. Eviction of this token also fails closed.
      if (!this._authGeneration || cache.get(this._authKey + ':generation') !== this._authGeneration) return;
      const snapshot = {
        generation: this._authGeneration,
        revision: this._authRevision, validUntil: validUntil,
        session: this._sessionRow, context: this._context,
        activeSemesters: this._activeSemesters, rolesMemo: this._rolesMemo || {}
      };
      cache.put(this._authKey, JSON.stringify(snapshot, function(key, value) {
        return this[key] instanceof Date ? { __authDate: this[key].toISOString() } : value;
      }), ttl);
    } catch (e) { console.error('Auth cache write failed; using Sheets:', e); }
  }

  /**
   * Retrieves the current registry sheet ID
   */
  getRegistrySheetId() {
    return this.props.getProperty('REGISTRY_SHEET_ID');
  }

  /**
   * Sessions live in the REGISTRY, not in a term spreadsheet.
   *
   * More than one term can be active at a time (a term is prepared before the
   * previous one ends), so "which term is this user in?" is answered by the
   * session row — and looking that row up inside a term spreadsheet would be
   * circular. It is also the truer place: a session is about the person, not
   * about the term. The Semester column records which term they are viewing.
   */
  _sessionDao() {
    const registryId = this.getRegistrySheetId();
    if (!registryId) return null;
    _ensureSessionsTab_(registryId);
    return getSheetManager_(registryId, DB_SHEETS.ACTIVE_SESSIONS, DB_COLS_SESSION.SESSION_ID);
  }

  /**
   * Every term currently marked Ativo. Memoized per instance: a single request
   * asks several times, and each call used to reopen the registry.
   */
  getActiveSemesters() {
    this._ensureFreshValidation();
    if (this._activeSemesters !== undefined) return this._activeSemesters;

    const registryId = this.getRegistrySheetId();
    if (!registryId) {
      this._activeSemesters = [];
      return this._activeSemesters;
    }

    try {
      const dao = getSheetManager_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER.SEMESTER);
      this._activeSemesters = dao.getAll()
        .filter(sem => sem[DB_COLS_SEMESTER.STATUS] === SemesterStatus.ACTIVE);
    } catch(e) {
      this._authReadFailed = true;
      console.error('getActiveSemesters error:', e);
      this._activeSemesters = [];
    }
    return this._activeSemesters;
  }

  /** A term row by name, among the active ones. */
  getSemesterByName(name) {
    const key = String(name || '').replace(/^'/, '');
    return this.getActiveSemesters().find(
      sem => String(sem[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, '') === key
    ) || null;
  }

  /**
   * The active terms this person takes part in — as Incharge, teacher or
   * student. This is what the term selector in the header offers, and what
   * bounds every switch: nobody can pick a term they have no role in.
   */
  getSemestersForUser(email) {
    // Memo keyed by e-mail: one request only ever asks about one identity, but
    // a stale answer for another would be a silent authorization bug.
    if (this._userSemesters && this._userSemestersFor === email) return this._userSemesters;
    this._userSemestersFor = email;
    this._userSemesters = this.getActiveSemesters().filter(sem => {
      try {
        return this._rolesInSemester(email, sem).length > 0;
      } catch(e) {
        // A read failure must not hide every term: the panel itself
        // surfaces the real error when the user gets there.
        this._authReadFailed = true;
        console.error('getSemestersForUser: people lookup failed:', e);
        return _normalizeEmail_(sem[DB_COLS_SEMESTER.INCHARGE_EMAIL]) === _normalizeEmail_(email);
      }
    });
    return this._userSemesters;
  }

  /**
   * The terms a person may actually choose between.
   *
   * A **student does not choose**: they are pinned to the newest term they are
   * enrolled in. Someone who dropped out of a term and enrolled in the next has
   * nothing left to do in the old one, and the two would only invite mistakes —
   * the previous term is closed by the Responsável, with the student marked as
   * not finished. Anyone holding a professor role anywhere keeps the selector,
   * because teaching two terms at once is normal.
   *
   * "Newest" is StartDate, written when the term is created; the term name
   * breaks a tie.
   */
  getSelectableSemesters(email) {
    if (this._selectable && this._selectableFor === email) return this._selectable;
    this._selectableFor = email;

    const mine = this.getSemestersForUser(email);
    const isOnlyStudent = mine.every(sem => {
      const roles = this._rolesInSemester(email, sem);
      return roles.length > 0 && roles.every(r => r === UserRole.STUDENT);
    });

    this._selectable = (isOnlyStudent && mine.length > 1)
      ? [this._newestSemester(mine)]
      : mine;
    return this._selectable;
  }

  _newestSemester(semesters) {
    return semesters.slice().sort((a, b) => {
      const byDate = String(b[DB_COLS_SEMESTER.START_DATE] || '')
        .localeCompare(String(a[DB_COLS_SEMESTER.START_DATE] || ''));
      if (byDate !== 0) return byDate;
      return String(b[DB_COLS_SEMESTER.SEMESTER]).localeCompare(String(a[DB_COLS_SEMESTER.SEMESTER]));
    })[0];
  }

  /**
   * The term the current user is working on: the one recorded in the session,
   * falling back to the first they may choose. Returns null when they take
   * part in none.
   */
  getCurrentSemester() {
    this._ensureFreshValidation();
    if (this._currentSemester !== undefined) return this._currentSemester;

    const profile = this._loadSessionRow();
    const email = profile ? profile[DB_COLS_SESSION.EMAIL] : Session.getActiveUser().getEmail();
    const allowed = email ? this.getSelectableSemesters(email) : [];

    // A stored term that is no longer selectable is ignored — this is what
    // moves a student on when they enroll in a newer term.
    const stored = profile ? this.getSemesterByName(profile[DB_COLS_SESSION.SEMESTER]) : null;
    this._currentSemester = (stored && allowed.indexOf(stored) !== -1)
      ? stored
      : (allowed.length ? allowed[0] : null);
    return this._currentSemester;
  }

  /** Sheet ID of the term the current user is working on. */
  getCurrentSemesterSheetId() {
    const sem = this.getCurrentSemester();
    return sem ? sem[DB_COLS_SEMESTER.SHEET_ID] : null;
  }

  /** Raw session row of the current identity, or null. */
  _loadSessionRow() {
    this._ensureFreshValidation();
    if (this._sessionRow !== undefined) return this._sessionRow;
    try {
      const dao = this._sessionDao();
      this._sessionRow = dao ? (dao.getById(_getIdentityKey_()) || null) : null;
    } catch(e) {
      this._authReadFailed = true;
      console.error('_loadSessionRow error:', e);
      this._sessionRow = null;
    }
    return this._sessionRow;
  }

  /**
   * Validates the login against the people tables and the session cache.
   * `email` is the effective e-mail already resolved by the caller (main.js).
   * The session row itself is keyed by _getIdentityKey_(), not by this e-mail,
   * so every subsequent lookup (from any endpoint, in any later request) stays
   * reliable regardless of domain.
   *
   * Two doors, because the two cases are not alike (see roadmap.md):
   *
   * - **Google identified the account** (`googleVerified`): nothing else is
   *   asked. Google already proved who this is, and holding a password for an
   *   ufam.edu.br account would replace a strong authentication with a weaker
   *   one of our own making.
   * - **Google did not** (any account outside the script's Workspace): the
   *   typed e-mail is an unverified claim, so it only counts when the password
   *   checks out against the Teachers table. This is the hole the old login
   *   left open — it accepted a typed e-mail as identity.
   *
   * @param {object} options { googleVerified: boolean, password: string }
   */
  processLogin(email, name, options) {
    if (!this.getRegistrySheetId()) {
      return { success: false, msg: 'Sistema não configurado.' };
    }

    const opts = options || {};
    if (!opts.googleVerified) {
      const check = new PeopleService().verifyPassword(email, opts.password);
      if (check.lockedOut) {
        return {
          success: false,
          msg: 'Muitas tentativas de senha seguidas. Espere alguns minutos e ' +
               'tente de novo. Se você perdeu a senha, peça uma nova ao ' +
               'professor responsável pela disciplina.'
        };
      }
      if (!check.ok) {
        return {
          success: false,
          msg: 'E-mail ou senha inválidos. Contas @ufam.edu.br entram pelo ' +
               'Google, sem senha — basta estar logado no navegador com ela.'
        };
      }
    }
    return this._startSession(email, name, !!opts.googleVerified);
  }

  /**
   * Opens (or renews) the session of someone whose identity is already settled.
   *
   * Split out of processLogin because the enrolment path settles identity by a
   * different rule — the term code, plus whatever processEnrollment demanded of
   * the account — and must not be sent back through the password check. Calling
   * processLogin from there refused every student who had just enrolled without
   * a password, which is all of them.
   */
  _startSession(email, name, googleVerified) {
    invalidateCurrentUserAuth_();
    const mySemesters = email ? this.getSemestersForUser(email) : [];
    if (mySemesters.length === 0) {
      return {
        success: false,
        needsEnrollment: !!googleVerified,
        msg: 'Este e-mail ainda não participa de nenhum período letivo em ' +
             'andamento. Se você é aluno, use o código do período que o ' +
             'professor responsável divulgou. Se é professor, peça a ele o ' +
             'seu cadastro.'
      };
    }

    try {
      const sessionDao = this._sessionDao();
      // Never opens a session without an authenticated identity to key it by:
      // that row would be shared by every anonymous visitor after this one.
      const identityKey = _requireGoogleIdentity_();
      let session = sessionDao.getById(identityKey);

      // Keep the term the user was on, as long as it is still one of theirs
      const allowed = this.getSelectableSemesters(email);
      const previous = session
        ? this.getSemesterByName(session[DB_COLS_SESSION.SEMESTER])
        : null;
      const semester = (previous && allowed.indexOf(previous) !== -1)
        ? previous
        : allowed[0];
      const roles = this._rolesInSemester(email, semester);

      // O nome do cadastro (Teachers, ou Students do período) vence o digitado
      // no login: o campo do formulário é livre, e sem ele o cabeçalho caía no
      // pedaço do e-mail ("Fredericopinage"). O digitado fica só de reserva,
      // para quem ainda não tem cadastro com nome.
      name = String(
        getPersonName_(email, semester[DB_COLS_SEMESTER.SHEET_ID],
                       String(name || '').trim() || email.split('@')[0])
      ).trim();

      if (session) {
        // Only recompute the cached role when it stopped being valid for this
        // user in this term (e.g. lost access, or the term changed) — a
        // deliberate switch through the header must survive a re-login.
        if (!roles.includes(session[DB_COLS_SESSION.ROLE])) {
          session[DB_COLS_SESSION.ROLE] = this._defaultRole(roles);
        }
        session[DB_COLS_SESSION.EMAIL] = email;
        session[DB_COLS_SESSION.SEMESTER] = semester[DB_COLS_SEMESTER.SEMESTER];
        if (name) session[DB_COLS_SESSION.NAME] = name;
        session[DB_COLS_SESSION.LAST_ACTIVITY] = new Date().toISOString();
        sessionDao.update(identityKey, session);
        return { success: true, role: session[DB_COLS_SESSION.ROLE] };
      }

      const newRole = this._defaultRole(roles);
      const newSession = {};
      newSession[DB_COLS_SESSION.SESSION_ID] = identityKey;
      newSession[DB_COLS_SESSION.EMAIL] = email;
      newSession[DB_COLS_SESSION.NAME] = name || email.split('@')[0];
      newSession[DB_COLS_SESSION.ROLE] = newRole;
      newSession[DB_COLS_SESSION.SEMESTER] = semester[DB_COLS_SEMESTER.SEMESTER];
      newSession[DB_COLS_SESSION.LAST_ACTIVITY] = new Date().toISOString();

      sessionDao.insert(newSession);

      return { success: true, role: newRole };
    } catch(e) {
      console.error('Login process error: ', e);
      // Carries the real cause (e.g. a failed read of the people tables)
      // instead of the misleading "não participa de nenhum período letivo"
      return { success: false, msg: 'Erro ao validar login: ' + e.message };
    }
  }

  /**
   * Every role an e-mail has inside ONE term: Incharge when it matches that
   * term's InchargeEmail (handing the role over to another professor is just
   * writing a different e-mail there), Advisor when the person is a registered
   * teacher, Student when enrolled in THAT term.
   *
   * The two tables sit at different levels on purpose (roadmap.md): a teacher
   * is registered once and carries the role into every term, while enrolment is
   * per term. So the same person can be Incharge in one term and Advisor in
   * another, and a student of 2026.1 is nobody in 2026.2 until they enrol.
   */
  _rolesInSemester(email, semester) {
    if (!email || !semester) return [];

    // Memoized per (e-mail, term) for the lifetime of the instance. A single
    // request resolves the same pair up to 2N+2 times with N active terms —
    // getSemestersForUser walks every term, getSelectableSemesters walks them
    // again to decide whether this is a student-only identity, then processLogin
    // and getAvailableRoles ask once more. The key carries the e-mail because
    // authorization depends on it: a memo shared across identities would be a
    // silent security bug.
    if (!this._rolesMemo) this._rolesMemo = {};
    const key = _normalizeEmail_(email);
    const memoKey = key + ' ' + String(semester[DB_COLS_SEMESTER.SEMESTER]);
    if (this._rolesMemo[memoKey]) return this._rolesMemo[memoKey];

    const roles = [];
    if (_normalizeEmail_(semester[DB_COLS_SEMESTER.INCHARGE_EMAIL]) === key) {
      roles.push(UserRole.INCHARGE);
    }
    if (getTeacherEmails_().includes(key)) {
      roles.push(UserRole.ADVISOR);
    }
    const sheetId = semester[DB_COLS_SEMESTER.SHEET_ID];
    if (sheetId && getStudentEmails_(sheetId).includes(key)) {
      roles.push(UserRole.STUDENT);
    }

    this._rolesMemo[memoKey] = roles;
    return roles;
  }

  /**
   * Enrols the current user in a term from the code they typed, then logs them
   * in. This is the student's own door — the one gesture kept from the
   * Classroom, where joining a class by code spared the Incharge from typing
   * 40 rows a term.
   *
   * A teacher never comes through here: the code grants STUDENT and nothing
   * else. Letting self-registration grant ADVISOR is the privilege escalation
   * refused in 10/Aug — a student would name an accomplice, who could then
   * approve their proposal.
   */
  processEnrollment(email, name, data, options) {
    const opts = options || {};
    try {
      if (!this.getRegistrySheetId()) {
        return { success: false, msg: 'Sistema não configurado.' };
      }

      const key = _normalizeEmail_(email);
      if (!key) return { success: false, msg: 'Informe o seu e-mail.' };

      // An unverified identity may not claim an e-mail that already has a role:
      // enrolling as someone who is a registered teacher would hand out ADVISOR
      // through the student door.
      if (!opts.googleVerified) {
        if (!_unverifiedLoginAllowed_()) {
          return {
            success: false,
            msg: 'Entre com a sua conta @ufam.edu.br para se cadastrar no período.'
          };
        }
        if (getTeacherEmails_().includes(key)) {
          return {
            success: false,
            msg: 'Este e-mail é de um professor cadastrado. Entre com a conta ' +
                 'institucional dele ou com a senha recebida por e-mail.'
          };
        }
      }

      const code = String((data && data.code) || '').trim().toUpperCase();
      if (!code) return { success: false, msg: 'Informe o código do período letivo.' };

      const semester = this.getActiveSemesters().find(
        sem => String(sem[DB_COLS_SEMESTER.ENROLLMENT_CODE] || '').trim().toUpperCase() === code
      );
      if (!semester) {
        return { success: false, msg: 'Código inválido ou de um período já encerrado.' };
      }
      if (!semester[DB_COLS_SEMESTER.SHEET_ID]) {
        return { success: false, msg: semesterUnavailableMessage({ semester: semester }) };
      }

      new PeopleService().enrollStudent(semester[DB_COLS_SEMESTER.SHEET_ID], {
        email:     key,
        name:      data.name,
        studentId: data.studentId,
        phone:     data.phone
      });

      // The roles memo was filled before the row existed, and the session about
      // to be written is decided from it.
      this._rolesMemo = {};
      this._userSemesters = null;
      this._userSemestersFor = null;
      this._selectable = null;
      this._selectableFor = null;

      // Identity is already settled here — by Google, or by the rule above for a
      // test account. Going back through processLogin would demand a password
      // that a student does not have.
      return this._startSession(key, data.name || name, !!opts.googleVerified);
    } catch(e) {
      console.error('processEnrollment error:', e);
      return { success: false, msg: e.message };
    }
  }

  /** Most privileged of the roles, used when no explicit choice is recorded. */
  _defaultRole(roles) {
    if (roles.includes(UserRole.INCHARGE)) return UserRole.INCHARGE;
    if (roles.includes(UserRole.ADVISOR)) return UserRole.ADVISOR;
    return roles[0] || UserRole.ERROR;
  }

  /**
   * Roles available to the current user in the term they are viewing — drives
   * the role dropdown in the header.
   */
  getAvailableRoles(email) {
    const semester = this.getCurrentSemester();
    if (!semester) return [];
    try {
      return this._rolesInSemester(email, semester);
    } catch(e) {
      // This only drives the role-switch dropdown in the header: a failed
      // read must not block rendering the page. The dashboard itself surfaces
      // the real error.
      console.error('getAvailableRoles error:', e);
      return (_normalizeEmail_(semester[DB_COLS_SEMESTER.INCHARGE_EMAIL]) === _normalizeEmail_(email))
        ? [UserRole.INCHARGE] : [];
    }
  }

  /**
   * Terms offered by the term dropdown in the header, as
   * { name, isCurrent } — already stripped of the apostrophe the sheet uses to
   * keep "2026.1" from being read as a number.
   */
  getAvailableSemesters(email) {
    const current = this.getCurrentSemester();
    const currentName = current ? String(current[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, '') : '';
    return this.getSelectableSemesters(email).map(sem => {
      const name = String(sem[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, '');
      return { name: name, isCurrent: name === currentName };
    });
  }

  /**
   * Returns the full session profile { email, name, role } for the current
   * user, resolved via _getIdentityKey_() — reliable across requests
   * regardless of whether the account's e-mail can be resolved by Google.
   * Does NOT check session timeout — use getValidCurrentSession for
   * timeout-aware lookup.
   */
  getCurrentProfile() {
    this._ensureFreshValidation();
    // Memoized per instance: getCurrentRole and getContext both go through it
    if (this._profile) return this._profile;
    this._profile = this._loadCurrentProfile();
    return this._profile;
  }

  _loadCurrentProfile() {
    try {
      const session = this._loadSessionRow();
      if (session) {
        return {
          email: session[DB_COLS_SESSION.EMAIL],
          name:  session[DB_COLS_SESSION.NAME] || '',
          role:  session[DB_COLS_SESSION.ROLE]
        };
      }
      // No session row yet for this identity key: not logged in via processLogin.
      return { email: '', name: '', role: UserRole.ERROR };
    } catch(e) {
      console.error('getCurrentProfile error:', e);
      return { email: '', name: '', role: UserRole.ERROR };
    }
  }

  /** Enforces the existing idle timeout before a command and records activity. */
  assertActiveSession() {
    if (!this.getValidCurrentSession(true)) {
      throw new Error(SESSION_EXPIRED_MSG);
    }
  }

  /** Convenience wrapper: returns only the current user's role string. */
  getCurrentRole() {
    return this.getCurrentProfile().role;
  }

  /**
   * Everything a request needs to know before doing anything: which term is
   * active, where its data lives, and who is asking. Resolved in one shot and
   * memoized, so a handler does not have to call getCurrentSemester(),
   * getCurrentProfile() and getAvailableRoles() separately — each of which
   * used to reopen the registry spreadsheet.
   *
   * @returns {{ semester: object|null, sheetId: string|null,
   *             folderId: string|null, enrollmentCode: string|null,
   *             email: string, name: string, role: string }}
   */
  getContext() {
    this._ensureFreshValidation();
    if (this._context) return this._context;

    // Every google.script.run command resolves "who is asking" here, so this
    // is the one place that covers all of them at once. It THROWS rather than
    // returning an error role: each command entry point already wraps its body
    // in try/catch and answers { success:false, msg }, so the refusal reaches
    // the screen with the message that explains what to do about it.
    _requireGoogleIdentity_();
    if (!this.getValidCurrentSession(false)) throw new Error(SESSION_EXPIRED_MSG);

    const semester = this.getCurrentSemester();
    const profile = this.getCurrentProfile();
    const roles = semester ? this._rolesInSemester(profile.email, semester) : [];
    if (!roles.includes(profile.role)) profile.role = this._defaultRole(roles);

    this._context = {
      semester: semester,
      sheetId:  semester ? semester[DB_COLS_SEMESTER.SHEET_ID]  : null,
      folderId: semester ? semester[DB_COLS_SEMESTER.FOLDER_ID] : null,
      enrollmentCode: semester ? semester[DB_COLS_SEMESTER.ENROLLMENT_CODE] : null,
      email: profile.email,
      name:  profile.name,
      role:  profile.role
    };
    this._saveValidatedCache();
    return this._context;
  }

  /**
   * Marks the current user as active, so working inside the app keeps the
   * session alive. Called by the dashboard data endpoints, which run on every
   * page load and after every action — without this, the idle timeout would
   * count from the login instead of from the last interaction.
   * Never throws: it is a side effect, not the caller's purpose.
   */
  touchCurrentSession() {
    // Never revive an expired session through a dashboard refresh.
    this.getValidCurrentSession(true);
  }

  /**
   * Reescreve o nome guardado na sessão — o que o cabeçalho mostra.
   *
   * Chamado quando a pessoa corrige o próprio cadastro: o nome da sessão é uma
   * cópia feita no login (e, sem nome nenhum, fabricada a partir do e-mail em
   * main.js), então sem isto o cabeçalho continuaria exibindo o nome velho até
   * a próxima entrada, como se a correção não tivesse sido gravada.
   * Não lança: é efeito colateral de outra ação, que já terminou.
   */
  updateCurrentSessionName(name) {
    try {
      const clean = String(name || '').trim();
      if (!clean) return;
      const sessionDao = this._sessionDao();
      if (!sessionDao) return;
      const patch = {};
      patch[DB_COLS_SESSION.NAME] = clean;
      sessionDao.update(_getIdentityKey_(), patch);
      this._sessionRow = undefined;
      this._profile = null;
      this._context = null;
    } catch(e) {
      console.error('updateCurrentSessionName error:', e);
    }
  }

  /**
   * Writes LastActivity only when the stored value is already older than half
   * the timeout. Every write costs a SpreadsheetApp.flush(), and a page load
   * used to trigger two of them (the page entry and the dashboard data call);
   * Frequent interactions avoid repeated writes; expired sessions are never
   * renewed here. This does not extend the authorization cache deadline.
   */
  _touch(sessionDao, identityKey, knownSession) {
    const session = knownSession || this._loadSessionRow();
    if (!session) return;

    const last = new Date(session[DB_COLS_SESSION.LAST_ACTIVITY]).getTime();
    const minutesElapsed = (Date.now() - last) / 60000;
    if (!Number.isFinite(minutesElapsed) || minutesElapsed >= SESSION_TIMEOUT_MINUTES ||
        minutesElapsed < SESSION_TIMEOUT_MINUTES / 2) return;

    const patch = {};
    patch[DB_COLS_SESSION.LAST_ACTIVITY] = new Date().toISOString();
    const dao = sessionDao || this._sessionDao();
    if (dao && dao.update(identityKey, patch)) {
      session[DB_COLS_SESSION.LAST_ACTIVITY] = patch[DB_COLS_SESSION.LAST_ACTIVITY];
      this._sessionRow = session;
      this._saveValidatedCache();
    }
  }

  /**
   * Returns the session profile only while the existing idle timeout is valid.
   * A validated cache hit supplies the row without opening a spreadsheet.
   * @param {boolean} [touch] - Persist activity at the existing throttled interval.
   */
  getValidCurrentSession(touch) {
    try {
      const identityKey = _requireGoogleIdentity_();
      const session = this._loadSessionRow();
      if (!session) return null;
      const minutesElapsed = (Date.now() - new Date(session[DB_COLS_SESSION.LAST_ACTIVITY]).getTime()) / 60000;
      if (!Number.isFinite(minutesElapsed) || minutesElapsed >= SESSION_TIMEOUT_MINUTES) return null;

      // Reuses the row already read, so no extra lookup
      if (touch) this._touch(null, identityKey, session);

      return {
        email: session[DB_COLS_SESSION.EMAIL],
        name:  session[DB_COLS_SESSION.NAME] || '',
        role:  session[DB_COLS_SESSION.ROLE]
      };
    } catch(e) {
      console.error('getValidCurrentSession error:', e);
      return null;
    }
  }
}

/**
 * Switch the role inside the term the user is on. Not a client endpoint (hence
 * no cmd prefix): doGet calls it on the way in, from ?page=switch_role — see
 * the comment there about the redirect being silently blocked when it came
 * from a callback.
 */
function switchRole(newRole) {
  const auth = new AuthService();
  auth.assertActiveSession();
  const ctx = auth.getContext();

  if (!ctx.sheetId) return { success: false, msg: 'Nenhum período letivo ativo.' };
  if (ctx.role === UserRole.ERROR) return { success: false, msg: 'Sessão inválida.' };

  if (!auth.getAvailableRoles(ctx.email).includes(newRole)) {
    return { success: false, msg: 'Você não tem permissão para este papel.' };
  }

  return _updateSession_(auth, ctx, { [DB_COLS_SESSION.ROLE]: newRole });
}

/**
 * Switch the term the user is working on. Terms overlap on purpose (the next
 * one is prepared while the current one runs), so the person picks which one
 * they are looking at — bounded by the terms they actually take part in.
 *
 * The role is recomputed for the new term: someone can be Incharge in one and
 * Advisor in another, and carrying the old role over would show a panel they
 * have no right to there.
 */
function switchSemester(newSemester) {
  const auth = new AuthService();
  auth.assertActiveSession();
  const ctx = auth.getContext();

  if (ctx.role === UserRole.ERROR) return { success: false, msg: 'Sessão inválida.' };

  // Bounded by what the person may choose, not merely by what they take part
  // in: ?page=switch_semester is a guessable URL, and a student pinned to the
  // newest term must not be able to walk back into the one they dropped.
  const target = auth.getSemesterByName(newSemester);
  if (!target || auth.getSelectableSemesters(ctx.email).indexOf(target) === -1) {
    return { success: false, msg: 'Este período letivo não está disponível para você.' };
  }

  const roles = auth._rolesInSemester(ctx.email, target);
  const patch = {};
  patch[DB_COLS_SESSION.SEMESTER] = target[DB_COLS_SEMESTER.SEMESTER];
  patch[DB_COLS_SESSION.ROLE] = roles.includes(ctx.role) ? ctx.role : auth._defaultRole(roles);
  return _updateSession_(auth, ctx, patch);
}

/**
 * Writes a patch on the current session row, self-healing a missing one (e.g.
 * lost on a first login) instead of failing outright — whatever the caller
 * wanted was already validated against the people tables before getting here.
 */
function _updateSession_(auth, ctx, patch) {
  const registryId = auth.getRegistrySheetId();
  if (!registryId) {
    console.error('_updateSession_: REGISTRY_SHEET_ID não configurado.');
    return { success: false, msg: 'Sistema não configurado.' };
  }
  const sessionDao = getSheetManager_(
    registryId, DB_SHEETS.ACTIVE_SESSIONS, DB_COLS_SESSION.SESSION_ID
  );
  const identityKey = _requireGoogleIdentity_();
  const session = sessionDao.getById(identityKey) || {
    [DB_COLS_SESSION.SESSION_ID]: identityKey,
    [DB_COLS_SESSION.EMAIL]: ctx.email,
    [DB_COLS_SESSION.NAME]: ctx.name || ctx.email.split('@')[0],
    [DB_COLS_SESSION.SEMESTER]: ctx.semester ? ctx.semester[DB_COLS_SEMESTER.SEMESTER] : '',
    [DB_COLS_SESSION.ROLE]: ctx.role
  };

  Object.keys(patch).forEach(k => { session[k] = patch[k]; });
  session[DB_COLS_SESSION.LAST_ACTIVITY] = new Date().toISOString();
  sessionDao.upsert(identityKey, session);
  return { success: true };
}
