/**
 * FILE: ServicePeople.js — People of the process: teachers and students.
 * DESC: Replaces the Google Classroom roster as the source of who exists and
 *       who is who. Teachers live in the registry (they cross terms), students
 *       in the term spreadsheet. Also holds the credential of whoever Google
 *       cannot identify. See roadmap.md, "Saída do Google Classroom".
 * AUTH: Andre Cavalcante
 * DATE: August, 2026
 * LICENCE: GPL-v3
 */

/**
 * Rows already read in THIS execution. Apps Script resets globals between
 * executions, so this never outlives one request — it replaces the 5-minute
 * CacheService roster cache with something both cheaper and always fresh: the
 * old cache traded a Classroom round trip for up to 5 minutes of staleness
 * (a teacher added to the class stayed invisible that long), and reading a
 * local sheet is cheap enough that the trade is no longer worth making.
 */
var _peopleCache = {};

function _clearPeopleCache_() {
  _peopleCache = {};
}

/** Sheet values come back as booleans or as the strings the user typed. */
function _isTrueCell_(value) {
  if (value === true) return true;
  const s = String(value || '').trim().toUpperCase();
  return s === 'TRUE' || s === 'VERDADEIRO' || s === 'SIM' || s === 'X';
}

function _normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Salted SHA-256, hex encoded.
 *
 * Apps Script offers no key-derivation function (no bcrypt/scrypt/PBKDF2), so
 * this is a plain digest and a fast one — it does not pretend otherwise. What
 * keeps it honest is that these passwords are never chosen by a person: they
 * are generated here, with ~60 bits of entropy, so there is no dictionary to
 * run. The salt (a UUID per person) is what stops one leaked table from being
 * attacked in a single pass.
 */
function _hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + '|' + String(password),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * Draws `length` characters from `alphabet` with a cryptographic source.
 *
 * Math.random() was what stood here, and the entropy argument written above
 * _hashPassword_ only holds for a real random source: Math.random() is a plain
 * PRNG, so its next output follows from its previous ones. That is fatal for
 * the external member's password, which is their ONLY authentication factor.
 *
 * Utilities.getUuid() is Java's UUID.randomUUID() underneath — 122 bits from a
 * cryptographically strong generator. Hashing a pair of them spreads that
 * entropy over 32 uniform bytes, which is cheaper than asking for one UUID per
 * character.
 *
 * Shared by the password and the term enrolment code, and written to be shared
 * once more: the Ata's ValidationKey and SIGNATURE_SECRET_KEY (Fatia C) need
 * exactly this and must not grow a second implementation.
 */
function _randomToken_(alphabet, length) {
  const out = [];
  // 256 is not a multiple of the alphabet size, so a plain `byte % size` would
  // make the first (256 % size) characters likelier than the rest. Bytes at or
  // above this limit are discarded instead of folded in.
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;

  while (out.length < length) {
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid(),
      Utilities.Charset.UTF_8
    );
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      const b = bytes[i] & 0xFF;
      if (b < limit) out.push(alphabet.charAt(b % alphabet.length));
    }
  }
  return out.join('');
}

/** Alphabet without look-alikes: the password is read off a screen or e-mail. */
var _PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function _generatePassword_(length) {
  return _randomToken_(_PASSWORD_ALPHABET, length || 10);
}

/** A fresh enrolment code for a term (see ENROLLMENT_CODE_* in utils.js). */
function generateEnrollmentCode_() {
  return _randomToken_(ENROLLMENT_CODE_ALPHABET, ENROLLMENT_CODE_LENGTH);
}

/**
 * How many wrong passwords one Google account may try before it has to wait,
 * and for how long. Counted per SIGNED-IN ACCOUNT and never per e-mail: a
 * counter keyed by the typed address would let anyone lock a real external
 * member out of their own defence by spamming it. Making the attacker burn
 * Google accounts instead is only possible because the identity gate now
 * guarantees there is one — see _requireGoogleIdentity_.
 */
var PASSWORD_MAX_ATTEMPTS = 8;
var PASSWORD_LOCKOUT_SECONDS = 900;

function _passwordThrottleKey_() {
  return 'pwtry_' + String(_getIdentityKey_()).replace(/[^A-Za-z0-9@._-]/g, '');
}

/** Conferido no máximo uma vez por execução. */
var _teacherColumnsChecked = false;

/**
 * Acrescenta ao cabeçalho da aba Teachers as colunas que o código espera e a
 * planilha ainda não tem.
 *
 * Um registro criado por uma versão anterior não tem InviteToken nem
 * InviteSentAt, e o SheetDao só grava colunas que existam no cabeçalho — o
 * convite seria salvo pela metade, sem erro nenhum, e o link nunca encontraria
 * a linha. Acrescentar uma célula de cabeçalho é operação não destrutiva: não
 * apaga dado nem esconde perda, ao contrário de recriar uma aba (é por isso que
 * _ensureSessionsTab_ existe só para as sessões).
 */
function _ensureTeacherColumns_(registryId) {
  if (_teacherColumnsChecked) return;
  _teacherColumnsChecked = true;
  if (!registryId || typeof registryId !== 'string' || !registryId.trim()) {
    console.error('_ensureTeacherColumns_ chamado sem registryId válido.');
    return;
  }
  try {
    const sheet = _openSpreadsheetOnce_(registryId).getSheetByName(DB_SHEETS.TEACHERS);
    if (!sheet) return;

    const lastCol = sheet.getLastColumn();
    const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    const missing = Object.values(DB_COLS_TEACHER).filter(c => headers.indexOf(c) === -1);
    if (!missing.length) return;

    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    SpreadsheetApp.flush();
    invalidateSheetCache_(registryId, DB_SHEETS.TEACHERS);
    console.log('Colunas acrescentadas em %s: %s', DB_SHEETS.TEACHERS, missing.join(', '));
  } catch(e) {
    console.error('_ensureTeacherColumns_ error: %s', e.message);
  }
}

class PeopleService {
  constructor() {
    this.props = PropertiesService.getScriptProperties();
  }

  _registryId() {
    return this.props.getProperty('REGISTRY_SHEET_ID');
  }

  _teacherDao() {
    const registryId = this._registryId();
    if (!registryId) return null;
    _ensureTeacherColumns_(registryId);
    return getSheetManager_(registryId, DB_SHEETS.TEACHERS, DB_COLS_TEACHER.EMAIL);
  }

  _studentDao(semesterSheetId) {
    if (!semesterSheetId) return null;
    return getSheetManager_(semesterSheetId, DB_SHEETS.STUDENTS, DB_COLS_STUDENT.STUDENT_ID);
  }

  // ---------------------------------------------------------------- teachers

  /** Every teacher row, active or not. */
  getTeachers() {
    if (_peopleCache.teachers) return _peopleCache.teachers;
    const dao = this._teacherDao();
    _peopleCache.teachers = dao ? dao.getAll() : [];
    return _peopleCache.teachers;
  }

  getActiveTeachers() {
    return this.getTeachers().filter(t => _isTrueCell_(t[DB_COLS_TEACHER.IS_ACTIVE]));
  }

  getTeacher(email) {
    const key = _normalizeEmail_(email);
    return this.getTeachers().find(t => _normalizeEmail_(t[DB_COLS_TEACHER.EMAIL]) === key) || null;
  }

  /**
   * Creates or updates a teacher. Only the Incharge reaches this (checked by
   * the caller), and a password is generated only for an external — someone
   * Google cannot identify. An ufam.edu.br account is authenticated by Google
   * itself, and storing a password for it would trade a strong authentication
   * for a weaker one of our own making.
   *
   * @returns {{ record: object, password: string }} password is '' unless one
   *          was just generated — it is shown once to the Incharge and mailed.
   */
  saveTeacher(data) {
    const dao = this._teacherDao();
    if (!dao) throw new Error('Sistema não configurado.');

    const email = _normalizeEmail_(data.email);
    if (!email) throw new Error('E-mail do professor é obrigatório.');
    if (!String(data.name || '').trim()) throw new Error('Nome do professor é obrigatório.');

    const existing = this.getTeacher(email);
    const record = existing || {};
    record[DB_COLS_TEACHER.EMAIL]       = email;
    record[DB_COLS_TEACHER.NAME]        = String(data.name).trim();
    record[DB_COLS_TEACHER.TITULACAO]   = String(data.titulacao || '').trim();
    record[DB_COLS_TEACHER.INSTITUICAO] = String(data.instituicao || '').trim();
    record[DB_COLS_TEACHER.PHONE]       = String(data.phone || '').trim();
    // Deduzido do domínio, NUNCA recebido do formulário. Era uma caixinha
    // marcada à mão, e errar nela em qualquer direção estragava o cadastro:
    // esquecer de marcar num convidado de fora criava uma conta que jamais
    // conseguiria entrar (o Google não resolve o e-mail dele e não havia senha
    // gerada para conferir); marcar num professor da casa lhe dava uma senha
    // inútil e, desde a separação de "quem entra" e "quem orienta", tirava dele
    // o direito de orientar. O critério é objetivo — ou o e-mail é do domínio
    // da instituição, ou não é.
    const isExternal = !_isInstitutionalEmail_(email);
    record[DB_COLS_TEACHER.IS_EXTERNAL] = isExternal;
    record[DB_COLS_TEACHER.IS_ACTIVE]   = (data.isActive === undefined) ? true : !!data.isActive;
    if (!record[DB_COLS_TEACHER.CREATED_AT]) {
      record[DB_COLS_TEACHER.CREATED_AT] = new Date().toISOString();
    }

    let password = '';
    if (isExternal && !record[DB_COLS_TEACHER.PASSWORD_HASH]) {
      password = _generatePassword_();
      const salt = Utilities.getUuid();
      record[DB_COLS_TEACHER.PASSWORD_SALT] = salt;
      record[DB_COLS_TEACHER.PASSWORD_HASH] = _hashPassword_(password, salt);
    }

    dao.upsert(email, record);
    _clearPeopleCache_();
    // No cadastro novo, sempre — é o convite. Numa edição posterior, não:
    // corrigir um telefone não é motivo para escrever de novo para a pessoa.
    if (!existing || password) this._mailInvitation(record, password);
    return { record: record, password: password };
  }

  /**
   * Turns a teacher on or off. Nothing is deleted: the person may be named in a
   * committee of a past term, and a missing row would leave that record
   * pointing at nobody.
   */
  setTeacherActive(email, isActive) {
    const dao = this._teacherDao();
    const record = this.getTeacher(email);
    if (!dao || !record) throw new Error('Professor não encontrado.');

    const patch = {};
    patch[DB_COLS_TEACHER.IS_ACTIVE] = !!isActive;
    dao.update(_normalizeEmail_(record[DB_COLS_TEACHER.EMAIL]), patch);
    _clearPeopleCache_();
    return record;
  }

  /**
   * Convida um professor: o Responsável digita o e-mail, o sistema cria a linha
   * pendente e manda o link para a pessoa completar o próprio cadastro.
   *
   * Por que a linha nasce AQUI e não quando o professor responde: criar a linha
   * é o ato de autorização, e ele é do Responsável. É o que separa este convite
   * de um cadastro aberto — que seria a escalada de privilégio recusada em
   * 10/Ago, já que aluno também tem e-mail institucional e se cadastraria como
   * professor para aprovar a própria proposta. Aqui ninguém entra sem que o
   * Responsável tenha digitado o endereço antes.
   *
   * Nasce INATIVA: quem completa o cadastro é a pessoa, e até lá não há nome
   * para sair na Ata. A ativação é o último passo de completeSignup.
   */
  inviteTeacher(email, name, known) {
    const dao = this._teacherDao();
    if (!dao) throw new Error('Sistema não configurado.');

    const key = _normalizeEmail_(email);
    if (!key) throw new Error('Informe o e-mail do professor(a).');

    const existing = this.getTeacher(key);
    if (existing && _isTrueCell_(existing[DB_COLS_TEACHER.IS_ACTIVE])) {
      throw new Error('Este e-mail já está cadastrado e ativo. Use "Reenviar convite" ' +
                      'se a pessoa perdeu o acesso.');
    }

    const record = existing || {};
    record[DB_COLS_TEACHER.EMAIL] = key;
    if (name) record[DB_COLS_TEACHER.NAME] = String(name).trim();
    // O que já se sabe da pessoa vai junto — no convite vindo da banca isso é o
    // formulário que o Orientador acabou de preencher. A pessoa confirma e
    // completa, em vez de digitar do zero o que o sistema já tinha.
    if (known) {
      ['titulacao', 'instituicao', 'phone'].forEach(f => {
        const col = { titulacao: DB_COLS_TEACHER.TITULACAO,
                      instituicao: DB_COLS_TEACHER.INSTITUICAO,
                      phone: DB_COLS_TEACHER.PHONE }[f];
        const value = String(known[f] || '').trim();
        if (value && !record[col]) record[col] = value;
      });
    }
    const isExternal = !_isInstitutionalEmail_(key);
    record[DB_COLS_TEACHER.IS_EXTERNAL] = isExternal;
    record[DB_COLS_TEACHER.IS_ACTIVE] = false;
    record[DB_COLS_TEACHER.INVITE_TOKEN] = _randomToken_(INVITE_TOKEN_ALPHABET, INVITE_TOKEN_LENGTH);
    record[DB_COLS_TEACHER.INVITE_SENT_AT] = new Date().toISOString();
    if (!record[DB_COLS_TEACHER.CREATED_AT]) {
      record[DB_COLS_TEACHER.CREATED_AT] = new Date().toISOString();
    }

    // O externo precisa da senha para entrar depois de completar o cadastro: o
    // Google não resolve o e-mail dele, então o token do convite abre a tela
    // uma vez e nada mais. O da casa entra pela conta institucional.
    let password = '';
    if (isExternal && !record[DB_COLS_TEACHER.PASSWORD_HASH]) {
      password = _generatePassword_();
      const salt = Utilities.getUuid();
      record[DB_COLS_TEACHER.PASSWORD_SALT] = salt;
      record[DB_COLS_TEACHER.PASSWORD_HASH] = _hashPassword_(password, salt);
    }

    dao.upsert(key, record);
    _clearPeopleCache_();
    this._mailInvitation(record, password, record[DB_COLS_TEACHER.INVITE_TOKEN]);
    return { record: record, password: password };
  }

  /**
   * Garante que um e-mail exista em `Teachers`, ativo — usado para o
   * Responsável de um período recém-criado.
   *
   * O Responsável **é** também Orientador: são duas checagens independentes em
   * `_rolesInSemester` (uma bate com `InchargeEmail`, a outra procura em
   * `Teachers`), e no primeiro período de uma instalação nova a segunda falhava.
   * `startSemester` não pode exigir que ele já seja professor cadastrado — isso
   * travaria o bootstrap, porque ninguém cadastra professor antes de existir
   * período —, então o caminho é o inverso: criar o período cadastra.
   *
   * Nasce ATIVO e sem token, ao contrário de `inviteTeacher`: quem chega aqui
   * já foi decidido por quem podia decidir (o dono, ou o Responsável que passou
   * a bola), e precisa trabalhar imediatamente — não dá para depender de ele
   * abrir um e-mail antes de poder abrir o próprio painel.
   */
  ensureTeacher(email, name) {
    const dao = this._teacherDao();
    if (!dao) throw new Error('Sistema não configurado.');

    const key = _normalizeEmail_(email);
    if (!key) throw new Error('E-mail é obrigatório.');

    const existing = this.getTeacher(key);
    if (existing && _isTrueCell_(existing[DB_COLS_TEACHER.IS_ACTIVE])) {
      return { record: existing, created: false };
    }

    const record = existing || {};
    record[DB_COLS_TEACHER.EMAIL] = key;
    // Um nome já gravado não é sobrescrito por um palpite tirado do e-mail.
    if (!record[DB_COLS_TEACHER.NAME]) {
      record[DB_COLS_TEACHER.NAME] = String(name || '').trim() || key.split('@')[0];
    }
    record[DB_COLS_TEACHER.IS_EXTERNAL] = !_isInstitutionalEmail_(key);
    record[DB_COLS_TEACHER.IS_ACTIVE] = true;
    record[DB_COLS_TEACHER.INVITE_TOKEN] = '';
    if (!record[DB_COLS_TEACHER.CREATED_AT]) {
      record[DB_COLS_TEACHER.CREATED_AT] = new Date().toISOString();
    }

    dao.upsert(key, record);
    _clearPeopleCache_();
    return { record: record, created: !existing };
  }

  /**
   * Põe no sistema os membros de banca que ainda não estão nele.
   *
   * Esta é, na prática, **a porta de entrada mais movimentada de professores**:
   * o Orientador monta a banca digitando nomes e e-mails, e boa parte dessas
   * pessoas nunca esteve no `Teachers`. Sem isso, a banca era homologada com
   * membros que o sistema não conhece, e na fase de Defesa eles não teriam como
   * assinar a Ata — que é exatamente o beco sem saída que motivou antecipar a
   * saída do Classroom.
   *
   * Os dados vêm do próprio formulário da banca (nome, titulação, instituição,
   * telefone), então o convidado recebe um cadastro já preenchido e o link só
   * confirma e completa.
   *
   * Nunca lança: perder a homologação porque um e-mail não saiu seria pior do
   * que um convite a reenviar — mesmo contrato do log e das notificações. O que
   * falhou volta na resposta, para o painel poder dizer.
   *
   * @returns {{ invited: string[], failed: string[] }}
   */
  inviteCommitteeMembers(members) {
    const invited = [];
    const failed = [];

    (members || []).forEach(m => {
      const key = _normalizeEmail_(m && m.email);
      if (!key) return;
      try {
        const existing = this.getTeacher(key);
        // Já ativo: não há o que convidar. Já convidado e pendente: idem — o
        // token dele continua valendo, e reconvidar só o invalidaria.
        if (existing && (_isTrueCell_(existing[DB_COLS_TEACHER.IS_ACTIVE]) ||
                         String(existing[DB_COLS_TEACHER.INVITE_TOKEN] || '').trim())) {
          return;
        }
        this.inviteTeacher(key, m.nome, {
          titulacao:   m.titulo,
          instituicao: m.inst,
          phone:       m.telefone
        });
        invited.push(key);
      } catch(e) {
        console.error('inviteCommitteeMembers: falha para %s: %s', key, e.message);
        failed.push(key);
      }
    });

    return { invited: invited, failed: failed };
  }

  /** A linha de um convite pendente, ou null se o token não vale mais. */
  getTeacherByInviteToken(token) {
    const key = String(token || '').trim();
    if (!key) return null;

    const record = this.getTeachers().find(
      t => String(t[DB_COLS_TEACHER.INVITE_TOKEN] || '').trim() === key
    );
    if (!record) return null;

    const sentAt = new Date(record[DB_COLS_TEACHER.INVITE_SENT_AT]).getTime();
    const days = (Date.now() - sentAt) / 86400000;
    if (!sentAt || days > TEACHER_INVITE_TTL_DAYS) return null;

    return record;
  }

  /**
   * O professor completa o próprio cadastro pelo link do convite.
   *
   * `googleEmail` é a conta com que ele está logado, e é conferida contra o
   * e-mail convidado quando o convite é de conta institucional: sem isso, um
   * link encaminhado (ou lido por engano) deixaria outra pessoa assumir o
   * cadastro. Para o externo à UFAM não há o que conferir — o Google não
   * resolve o e-mail dele —, e ali quem prova identidade é a senha, na hora de
   * entrar.
   */
  completeSignup(token, data, googleEmail) {
    const dao = this._teacherDao();
    if (!dao) throw new Error('Sistema não configurado.');

    const record = this.getTeacherByInviteToken(token);
    if (!record) {
      throw new Error('Convite inválido ou expirado. Peça um novo ao professor ' +
                      'responsável pela disciplina.');
    }

    const invited = _normalizeEmail_(record[DB_COLS_TEACHER.EMAIL]);
    if (_isInstitutionalEmail_(invited) && _normalizeEmail_(googleEmail) !== invited) {
      throw new Error(
        `Este convite é de ${invited}. Entre no navegador com essa conta Google ` +
        `e abra o link de novo.`
      );
    }

    const name = String((data && data.name) || '').trim();
    if (!name) throw new Error('Informe o seu nome completo.');

    record[DB_COLS_TEACHER.NAME]        = name;
    record[DB_COLS_TEACHER.TITULACAO]   = String((data && data.titulacao) || '').trim();
    record[DB_COLS_TEACHER.INSTITUICAO] = String((data && data.instituicao) || '').trim();
    record[DB_COLS_TEACHER.PHONE]       = String((data && data.phone) || '').trim();
    // Só agora a pessoa passa a existir para o resto do sistema.
    record[DB_COLS_TEACHER.IS_ACTIVE]   = true;
    // Uso único: o token morre aqui.
    record[DB_COLS_TEACHER.INVITE_TOKEN] = '';

    dao.update(invited, record);
    _clearPeopleCache_();
    return record;
  }

  /**
   * O professor mantém os próprios dados, depois de já estar cadastrado.
   *
   * Mesmos campos de completeSignup, e pelo mesmo motivo: nome, titulação e
   * instituição saem na Ata e na Folha de Aprovação, e quem sabe como devem
   * aparecer é o dono deles. Até aqui esses dados só podiam ser escritos uma
   * vez, pelo link do convite — quem entrou por outra porta (ensureTeacher, ao
   * ser indicado Responsável de um período) ficava com o nome fabricado a
   * partir do e-mail e sem lugar nenhum para corrigi-lo.
   *
   * NÃO cria linha, e não é por economia: `email` vem da sessão, e exigir que a
   * linha já exista e esteja ativa é o que impede este método de virar
   * auto-cadastro de professor — a escalada de privilégio recusada em 10/Ago
   * (rationale 2.3) pela porta dos fundos, já que aluno também tem e-mail
   * institucional.
   *
   * O e-mail fica de fora da lista de propósito: é a chave da linha, a
   * identidade conferida no login e o que liga esta pessoa à presidência da
   * banca e à assinatura da Ata. Trocá-lo aqui seria assumir outro cadastro.
   */
  updateOwnProfile(email, data) {
    const dao = this._teacherDao();
    if (!dao) throw new Error('Sistema não configurado.');

    const key = _normalizeEmail_(email);
    const record = key ? this.getTeacher(key) : null;
    if (!record || !_isTrueCell_(record[DB_COLS_TEACHER.IS_ACTIVE])) {
      throw new Error('Você não está cadastrado(a) como professor(a) neste período.');
    }

    const name = String((data && data.name) || '').trim();
    if (!name) throw new Error('Informe o seu nome completo.');

    // Patch com as quatro colunas que a pessoa possui — IsActive, IsExternal,
    // PasswordHash e InviteToken não estão aqui, e é isso que separa "editar os
    // meus dados" de "me cadastrar".
    const patch = {};
    patch[DB_COLS_TEACHER.NAME]        = name;
    patch[DB_COLS_TEACHER.TITULACAO]   = String((data && data.titulacao) || '').trim();
    patch[DB_COLS_TEACHER.INSTITUICAO] = String((data && data.instituicao) || '').trim();
    patch[DB_COLS_TEACHER.PHONE]       = String((data && data.phone) || '').trim();

    dao.update(_normalizeEmail_(record[DB_COLS_TEACHER.EMAIL]), patch);
    _clearPeopleCache_();
    return Object.assign({}, record, patch);
  }

  /** New password for an external member who lost theirs. */
  resetTeacherPassword(email) {
    const dao = this._teacherDao();
    const record = this.getTeacher(email);
    if (!dao || !record) throw new Error('Professor não encontrado.');
    if (!_isTrueCell_(record[DB_COLS_TEACHER.IS_EXTERNAL])) {
      throw new Error('Contas institucionais entram pelo Google, sem senha.');
    }

    const password = _generatePassword_();
    const salt = Utilities.getUuid();
    record[DB_COLS_TEACHER.PASSWORD_SALT] = salt;
    record[DB_COLS_TEACHER.PASSWORD_HASH] = _hashPassword_(password, salt);
    dao.update(_normalizeEmail_(email), record);
    _clearPeopleCache_();
    this._mailInvitation(record, password);
    return password;
  }

  /**
   * Mails the invitation: the link, and the password when there is one.
   *
   * Sent to EVERY teacher the Responsável registers, not only to the ones who
   * get a credential. Until now it went out only when a password was generated,
   * so a professor of the house was registered and received nothing at all —
   * no notice that they had been given access, and no address to go to. The
   * link is the part everyone needs; the password is the part only a guest
   * from outside needs.
   *
   * Deliberately NOT gated by NOTIFICATIONS_ENABLED: that switch exists to keep
   * debugging from spamming people about flow steps, and silencing this one
   * would leave the person with no way in. Best effort — the Responsável also
   * sees the password once on screen, which is what makes a mail failure
   * recoverable instead of fatal.
   *
   * @param {string} password '' when the person signs in with Google, or when
   *        this is a resend (only the hash is stored, so a password already
   *        sent cannot be shown again — only replaced).
   */
  _mailInvitation(record, password, inviteToken) {
    try {
      // The deployment URL on purpose, never getPublicAppUrl(): this link carries
      // a token in the query string, and the friendly URL on the Faculty site
      // drops parameters. One-shot links clicked on the spot can afford to be ugly.
      let url = '';
      try { url = ScriptApp.getService().getUrl() || ''; } catch(e) { url = ''; }

      const isExternal = _isTrueCell_(record[DB_COLS_TEACHER.IS_EXTERNAL]);
      const token = String(inviteToken || '').trim();
      const rawLink = (url && token)
        ? (url + '?page=teacher_signup&token=' + encodeURIComponent(token))
        : url;
      const link = withAccountChooser(rawLink);

      const lines = [
        String(record[DB_COLS_TEACHER.NAME] || '') + ',',
        '',
        'Você foi cadastrado(a) no TCC-WebApp da FEEC/UFAM pelo professor',
        'responsável pela disciplina de Projeto Final de Curso.',
        ''
      ];

      if (token) {
        lines.push(
          'Para concluir, abra o link abaixo e complete o seu cadastro (nome,',
          'titulação, instituição e telefone). O link vale por ' +
            TEACHER_INVITE_TTL_DAYS + ' dias e serve uma vez só.',
          '',
          link,
          ''
        );
      } else if (url) {
        lines.push('Endereço do sistema: ' + url, '');
      }

      if (isExternal) {
        lines.push(
          'Seu e-mail não é uma conta institucional da UFAM, então o acesso é',
          'feito com a senha abaixo. Antes dela, o sistema pede que você esteja',
          'logado numa conta Google qualquer — pode ser um Gmail pessoal, e não',
          'precisa ter relação com o e-mail deste cadastro.',
          '',
          'E-mail: ' + record[DB_COLS_TEACHER.EMAIL]
        );
        if (password) {
          lines.push('Senha: ' + password, '',
                     'Guarde esta senha: ela não pode ser mostrada de novo, só',
                     'substituída. Se precisar de outra, peça ao Responsável.');
        } else {
          lines.push('Senha: a que você recebeu no e-mail do seu cadastro.', '',
                     'Perdeu? Peça uma nova ao professor responsável — a senha',
                     'antiga não pode ser recuperada, só substituída.');
        }
      } else {
        lines.push(
          'Entre com a sua conta institucional @' + _institutionalDomain_() + '.',
          'Não há senha a guardar: quem identifica você é o próprio Google,',
          'bastando estar logado no navegador com essa conta.'
        );
        if (token) {
          lines.push('',
            'O link acima só funciona nessa conta — se abrir logado em outra, o',
            'sistema recusa e explica o que fazer.');
        }
      }

      lines.push('', '— Mensagem automática do TCC-WebApp (FEEC/UFAM).');

      MailApp.sendEmail({
        to: record[DB_COLS_TEACHER.EMAIL],
        name: 'TCC-WebApp (FEEC/UFAM)',
        subject: token
          ? '[TCC-WebApp] Convite: complete o seu cadastro'
          : '[TCC-WebApp] Acesso ao sistema de TCC da FEEC/UFAM',
        body: lines.filter(line => line !== undefined).join('\n')
      });
    } catch(e) {
      console.error('PeopleService._mailInvitation error:', e);
    }
  }

  /**
   * Reenvia o convite. Nunca reexibe a senha — só o hash fica guardado.
   *
   * Cadastro ainda pendente ganha um token NOVO, e não o antigo de novo: se o
   * primeiro e-mail se perdeu, ele pode ter se perdido em qualquer lugar, e o
   * relógio de validade deve recomeçar do reenvio. O token velho morre junto.
   */
  resendInvitation(email) {
    const dao = this._teacherDao();
    const record = this.getTeacher(email);
    if (!dao || !record) throw new Error('Professor não encontrado.');

    let token = '';
    if (!_isTrueCell_(record[DB_COLS_TEACHER.IS_ACTIVE])) {
      token = _randomToken_(INVITE_TOKEN_ALPHABET, INVITE_TOKEN_LENGTH);
      const patch = {};
      patch[DB_COLS_TEACHER.INVITE_TOKEN] = token;
      patch[DB_COLS_TEACHER.INVITE_SENT_AT] = new Date().toISOString();
      dao.update(_normalizeEmail_(record[DB_COLS_TEACHER.EMAIL]), patch);
      _clearPeopleCache_();
      record[DB_COLS_TEACHER.INVITE_TOKEN] = token;
    }

    this._mailInvitation(record, '', token);
    return record;
  }

  /**
   * Checks an e-mail/password pair. Used only when the script could not resolve
   * the account's e-mail — see AuthService.processLogin.
   *
   * Throttled, because this is the one door in the system that a guess can open:
   * an ufam.edu.br account is authenticated by Google itself, but the external
   * member's whole identity rests on these ten characters.
   *
   * @returns {{ ok: boolean, lockedOut: boolean }}
   */
  verifyPassword(email, password) {
    const cache = CacheService.getScriptCache();
    const throttleKey = _passwordThrottleKey_();
    const failures = parseInt(cache.get(throttleKey) || '0', 10);
    if (failures >= PASSWORD_MAX_ATTEMPTS) {
      return { ok: false, lockedOut: true };
    }

    if (this._passwordMatches(email, password)) {
      cache.remove(throttleKey);
      return { ok: true, lockedOut: false };
    }

    // The window restarts on every failure, on purpose: an attacker pacing
    // themselves to let it lapse is throttled to a rate that gets nowhere
    // against 56^10 possibilities.
    cache.put(throttleKey, String(failures + 1), PASSWORD_LOCKOUT_SECONDS);
    return { ok: false, lockedOut: false };
  }

  /** The check itself, with no bookkeeping around it. */
  _passwordMatches(email, password) {
    const record = this.getTeacher(email);
    if (!record) return false;
    if (!_isTrueCell_(record[DB_COLS_TEACHER.IS_ACTIVE])) return false;

    const salt = record[DB_COLS_TEACHER.PASSWORD_SALT];
    const hash = record[DB_COLS_TEACHER.PASSWORD_HASH];
    if (!salt || !hash || !password) return false;
    return _hashPassword_(password, salt) === String(hash);
  }

  // ---------------------------------------------------------------- students

  getStudents(semesterSheetId) {
    const key = 'students_' + semesterSheetId;
    if (_peopleCache[key]) return _peopleCache[key];
    const dao = this._studentDao(semesterSheetId);
    _peopleCache[key] = dao ? dao.getAll() : [];
    return _peopleCache[key];
  }

  getStudentByEmail(semesterSheetId, email) {
    const key = _normalizeEmail_(email);
    return this.getStudents(semesterSheetId)
      .find(s => _normalizeEmail_(s[DB_COLS_STUDENT.EMAIL]) === key) || null;
  }

  /**
   * Enrols a student in a term, from the code they typed on first access.
   *
   * The matrícula is the primary key, so re-enrolling the same person updates
   * their row instead of duplicating it. Enrolling with a matrícula that
   * already belongs to a DIFFERENT e-mail is refused: it would either be a typo
   * or one student claiming another's record, and both end with two people
   * fighting over one row.
   */
  enrollStudent(semesterSheetId, data) {
    const dao = this._studentDao(semesterSheetId);
    if (!dao) throw new Error('Período letivo indisponível.');

    const email = _normalizeEmail_(data.email);
    const studentId = String(data.studentId || '').trim();
    const name = String(data.name || '').trim();
    if (!email) throw new Error('E-mail é obrigatório.');
    if (!name) throw new Error('Informe o seu nome completo.');
    if (!studentId) throw new Error('Informe a sua matrícula.');

    const byId = this.getStudents(semesterSheetId)
      .find(s => String(s[DB_COLS_STUDENT.STUDENT_ID]).trim() === studentId);
    if (byId && _normalizeEmail_(byId[DB_COLS_STUDENT.EMAIL]) !== email) {
      throw new Error('Esta matrícula já está cadastrada com outro e-mail. ' +
                      'Procure o professor responsável pela disciplina.');
    }

    const record = byId || {};
    record[DB_COLS_STUDENT.STUDENT_ID] = studentId;
    record[DB_COLS_STUDENT.NAME]       = name;
    record[DB_COLS_STUDENT.EMAIL]      = email;
    record[DB_COLS_STUDENT.PHONE]      = String(data.phone || '').trim();
    if (!record[DB_COLS_STUDENT.ENROLLED_AT]) {
      record[DB_COLS_STUDENT.ENROLLED_AT] = new Date().toISOString();
    }

    dao.upsert(studentId, record);
    _clearPeopleCache_();
    return record;
  }
}

// ==========================================
// GLOBAL ACCESSORS — the interface the rest of the app uses, in place of the
// Classroom roster calls that used to live in DaoClassroom.js.
//
// Every name here ends in "_", and that is not a style choice: Apps Script
// refuses google.script.run on a function whose name ends with an underscore,
// and refuses NOTHING else. Without the suffix these were public endpoints —
// any logged-in student could call getRegisteredTeachers() and get the whole
// faculty with e-mails and phone numbers, or getSemesterStudents(sheetId) and
// get the class roster with everyone's matrícula. They take no authorization
// argument and never did; the suffix is what makes "server-side only" true
// instead of merely intended.
//
// The same rule already governed diagnostics.js (see the contract in its
// header). It just had not been applied here.
//
// What the client is allowed to ask for goes through a guarded endpoint
// instead: getTeacherRegistry (ServiceSetup.js) for the Incharge's faculty
// list, lookupAdvisorName (ServiceDashboard.js) for the one-address check the
// proposal form does while it is being filled in.
// ==========================================

/** [{ email, name, titulacao, instituicao, phone, isExternal }] — active only. */
function getRegisteredTeachers_() {
  return new PeopleService().getActiveTeachers().map(t => ({
    email:       t[DB_COLS_TEACHER.EMAIL],
    name:        t[DB_COLS_TEACHER.NAME],
    titulacao:   t[DB_COLS_TEACHER.TITULACAO],
    instituicao: t[DB_COLS_TEACHER.INSTITUICAO],
    phone:       t[DB_COLS_TEACHER.PHONE],
    isExternal:  _isTrueCell_(t[DB_COLS_TEACHER.IS_EXTERNAL])
  }));
}

/**
 * Quem o sistema conhece — a lista que concede o papel de Orientador na
 * ENTRADA (AuthService._rolesInSemester). Inclui os externos de propósito: sem
 * um papel, _startSession recusaria o login do membro de banca convidado, e ele
 * precisa entrar para assinar a Ata.
 */
function getTeacherEmails_() {
  return getRegisteredTeachers_().map(t => _normalizeEmail_(t.email));
}

/**
 * Quem pode ser NOMEADO orientador de um TCC — os teachers da UFAM, sem os
 * externos.
 *
 * Duas listas e não uma, porque as perguntas são diferentes: "quem entra" e
 * "quem orienta". Um externo à UFAM não recebe papel do fluxo (ver "Quem é
 * quem" em arch.md); ele compõe banca e assina Ata. Enquanto a distinção não
 * existia, o aluno podia digitar o e-mail de um convidado no campo do
 * Orientador e a submissão era aceita — e o convidado passava a poder aprovar
 * a proposta de um TCC da UFAM.
 */
function getAdvisorEmails_() {
  return getRegisteredTeachers_()
    .filter(t => !t.isExternal)
    .map(t => _normalizeEmail_(t.email));
}

/** [{ email, name, studentId, phone }] enrolled in one term. */
function getSemesterStudents_(semesterSheetId) {
  return new PeopleService().getStudents(semesterSheetId).map(s => ({
    email:     s[DB_COLS_STUDENT.EMAIL],
    name:      s[DB_COLS_STUDENT.NAME],
    studentId: s[DB_COLS_STUDENT.STUDENT_ID],
    phone:     s[DB_COLS_STUDENT.PHONE]
  }));
}

function getStudentEmails_(semesterSheetId) {
  return getSemesterStudents_(semesterSheetId).map(s => _normalizeEmail_(s.email));
}

/**
 * The name to print on documents.
 *
 * Replaces getRosterName: the guarantee is the same as before — a name that a
 * person other than the owner of the record put there — except the authority is
 * now the Incharge (for teachers) and the enrolment form checked by the
 * Incharge (for students), instead of the Google profile. The fallback is the
 * display name typed at login, which is free text and only ever used when the
 * person is in no table at all.
 */
function getPersonName_(email, semesterSheetId, fallback) {
  const key = _normalizeEmail_(email);
  if (!key) return fallback || '';

  const people = new PeopleService();
  const teacher = people.getTeacher(key);
  if (teacher && teacher[DB_COLS_TEACHER.NAME]) return teacher[DB_COLS_TEACHER.NAME];

  if (semesterSheetId) {
    const student = people.getStudentByEmail(semesterSheetId, key);
    if (student && student[DB_COLS_STUDENT.NAME]) return student[DB_COLS_STUDENT.NAME];
  }
  return fallback || email;
}
