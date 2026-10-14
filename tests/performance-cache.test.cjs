/**
 * FILE: performance-cache.test.cjs — DAO and authentication cache regressions.
 * DESC: Runs isolated Apps Script executions against shared fake Sheets/cache.
 * AUTH: Andre Cavalcante
 * DATE: September, 2026
 * LICENCE: GPL-v3
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function fixture() {
  let now = Date.parse('2026-09-30T12:00:00Z');
  const tables = new Map();
  const cache = new Map();
  const props = { REGISTRY_SHEET_ID: 'registry' };
  const calls = { reads: 0, cells: 0, writes: 0, flushes: 0, opens: 0 };
  let failCache = false;
  let failWrite = false;
  const copy = value => value instanceof Date ? new Date(value.getTime()) : value;
  const runtime = (identity = 'teacher@ufam.edu.br', temporary = '') => {
    class ClockDate extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
      static [Symbol.hasInstance](value) { return value instanceof Date; }
    }
    const context = vm.createContext({
      Date: ClockDate,
      console: { log() {}, error() {} },
      Session: {
        getActiveUser: () => ({ getEmail: () => identity }),
        getTemporaryActiveUserKey: () => temporary,
        getScriptTimeZone: () => 'America/Manaus'
      },
      PropertiesService: { getScriptProperties: () => ({
        getProperty: key => props[key] || null,
        setProperty: (key, value) => { props[key] = value; }
      }) },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
        computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value).digest()],
        getUuid: () => crypto.randomUUID()
      },
      CacheService: { getScriptCache: () => ({
        get(key) {
          if (failCache) throw new Error('Cache unavailable');
          const entry = cache.get(key);
          return entry && entry.until > now ? entry.value : null;
        },
        put(key, value, ttl) {
          if (failCache) throw new Error('Cache unavailable');
          assert.ok(ttl > 0 && ttl <= 300);
          cache.set(key, { value, until: now + ttl * 1000 });
        },
        remove(key) { cache.delete(key); }
      }) },
      SpreadsheetApp: {
        openById(id) {
          calls.opens++;
          return { getSheetByName(name) {
            const rows = tables.get(id + '/' + name);
            if (!rows) return null;
            return {
              getLastRow: () => rows.length,
              getLastColumn: () => rows[0]?.length || 0,
              getRange(r, c, n = 1, m = 1) { return {
                getValues() {
                  calls.reads++;
                  calls.cells += n * m;
                  return rows.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + m).map(copy));
                },
                setValues(values) {
                  calls.writes++;
                  if (failWrite) throw new Error('Write failed');
                  values.forEach((row, i) => row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = copy(v); }));
                }
              }; },
              appendRow(row) { calls.writes++; rows.push(row.map(copy)); }
            };
          } };
        },
        flush() { calls.flushes++; }
      }
    });
    const run = source => vm.runInContext(source, context);
    for (const file of ['utils.js', 'DaoSheets.js', 'ServicePeople.js', 'ServiceAuth.js',
      'ServiceEventLog.js', 'ServiceDashboard.js', 'ServiceTccState.js']) {
      run(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'));
    }
    return { run, context };
  };
  const initial = runtime();
  function table(id, name, columns, records) {
    const headers = Object.values(columns);
    tables.set(id + '/' + name, [headers, ...records.map(record => headers.map(h => record[h] ?? ''))]);
  }
  const c = initial.context;
  table('registry', 'Semesters', c.DB_COLS_SEMESTER, [{
    Semester: '2026.2', SheetId: 'term', FolderId: 'folder', InchargeEmail: 'teacher@ufam.edu.br',
    Status: c.SemesterStatus.ACTIVE, StartDate: new Date('2026-07-01'), EnrollmentCode: 'CODE'
  }]);
  table('registry', 'Active_Sessions', c.DB_COLS_SESSION, [
    { SessionId: 'teacher@ufam.edu.br', Email: 'teacher@ufam.edu.br', Name: 'Teacher',
      Role: c.UserRole.INCHARGE, Semester: '2026.2', LastActivity: new Date(now).toISOString() },
    { SessionId: 'student@ufam.edu.br', Email: 'student@ufam.edu.br', Name: 'Student',
      Role: c.UserRole.STUDENT, Semester: '2026.2', LastActivity: new Date(now).toISOString() }
  ]);
  table('registry', 'Teachers', c.DB_COLS_TEACHER, [
    { Email: 'teacher@ufam.edu.br', Name: 'Teacher', IsActive: true }
  ]);
  table('term', 'Students', c.DB_COLS_STUDENT, [
    { StudentId: '1', Email: 'student@ufam.edu.br', Name: 'Student' }
  ]);
  for (const [name, columns] of [['Proposals', c.DB_COLS_PROPOSAL], ['Committees', c.DB_COLS_COMMITTEE],
    ['Defenses', c.DB_COLS_DEFENSE], ['Events', c.DB_COLS_EVENT]]) table('term', name, columns, []);
  return { runtime, tables, table, cache, props, calls, advance: ms => { now += ms; },
    failCache: () => { failCache = true; }, failWrite: value => { failWrite = value; } };
}

test('DAO shares reads across instances/keys, returns detached records and Dates', () => {
  const f = fixture();
  f.tables.set('test/Records', [['Id', 'Name', 'When'], ['1', 'Original', new Date('2026-01-01')]]);
  const { run } = f.runtime();
  run("var dao = getSheetManager_('test', 'Records', 'Id'); var record = dao.getById(1); record.Name = 'Changed'; record.When.setFullYear(2000);");
  for (let i = 0; i < 10; i++) assert.equal(run("getSheetManager_('test', 'Records', 'Id').getById('1').Name"), 'Original');
  assert.equal(run("getSheetManager_('test', 'Records', 'Name').getById('Original').When.getUTCFullYear()"), 2026);
  assert.equal(f.calls.reads, 2);
  assert.equal(run("dao.getById('')"), null);
});

test('DAO batches only adjacent changed cells; upsert/no-op/read-after-write stay correct', () => {
  const f = fixture();
  f.tables.set('test/Records', [['Id', 'Name', 'Status', 'Formula', 'Other'], ['2026.2', 'Old', 'Draft', '=1+1', 'Old']]);
  const { run } = f.runtime();
  run("var dao = getSheetManager_('test', 'Records', 'Id'); dao.upsert('2026.2', {Name: 'New', Status: 'Done', Other: 'New'});");
  assert.equal(f.calls.reads, 2);
  assert.equal(f.calls.writes, 2);
  assert.equal(f.calls.flushes, 1);
  assert.equal(f.tables.get('test/Records')[1][3], '=1+1');
  assert.equal(run("getSheetManager_('test', 'Records', 'Id').getById('2026.2').Status"), 'Done');
  run("dao.update('2026.2', {Name: 'New'});");
  assert.equal(f.calls.writes, 2);
  run("var input = {Name: 'Second'}; dao.upsert('2', input);");
  assert.equal(run('input.Id'), undefined);
  assert.equal(run("dao.getById('2').Name"), 'Second');
});

test('DAO discards cached rows after failed writes', () => {
  const f = fixture();
  f.tables.set('test/Records', [['Id', 'Name'], ['1', 'Old']]);
  const { run } = f.runtime();
  run("var dao = getSheetManager_('test', 'Records', 'Id'); dao.getAll();");
  f.failWrite(true);
  assert.throws(() => run("dao.update('1', {Name:'New'})"), /Write failed/);
  f.failWrite(false);
  f.tables.get('test/Records')[1][1] = 'External';
  assert.equal(run("dao.getById('1').Name"), 'External');
});

test('auth cache skips Sheets across executions and shares instances within a request', () => {
  const f = fixture();
  const first = f.runtime();
  assert.equal(first.run('new AuthService().getContext().email'), 'teacher@ufam.edu.br');
  const reads = f.calls.reads;
  const opens = f.calls.opens;
  f.advance(60000);
  const second = f.runtime();
  assert.equal(second.run('new AuthService() === new AuthService()'), true);
  second.run('new AuthService().getContext(); new AuthService().assertActiveSession(); new AuthService().touchCurrentSession();');
  assert.equal(f.calls.reads, reads);
  assert.equal(f.calls.opens, opens);
  assert.equal(second.run('new AuthService().getAvailableSemesters("teacher@ufam.edu.br")[0].isCurrent'), true);
  assert.equal(second.run('new AuthService().getContext().semester.StartDate instanceof Date'), true);
});

test('cache is isolated by identity, temporary Google identity and registry', () => {
  const f = fixture();
  f.runtime().run('new AuthService().getContext()');
  assert.equal(f.runtime('student@ufam.edu.br').run('new AuthService().getContext().email'), 'student@ufam.edu.br');
  assert.throws(() => f.runtime('', 'different-google-key').run('new AuthService().getContext()'));
  assert.throws(() => f.runtime('', '').run('new AuthService().getContext()'));
  f.props.REGISTRY_SHEET_ID = 'different-registry';
  assert.throws(() => f.runtime().run('new AuthService().getContext()'));
});

test('idle timeout is exactly the existing five minutes; refresh cannot revive it', () => {
  const f = fixture();
  f.runtime().run('new AuthService().getContext()');
  f.advance(300000);
  const { run } = f.runtime();
  assert.equal(run('new AuthService().getValidCurrentSession(true)'), null);
  run('new AuthService().touchCurrentSession()');
  assert.equal(f.calls.writes, 0);
  assert.throws(() => run('new AuthService().getContext()'));
});

test('activity persists at the existing interval, without extending validation TTL', () => {
  const f = fixture();
  f.runtime().run('new AuthService().getContext()');
  const deadline = JSON.parse([...f.cache.entries()].find(([key]) => !key.endsWith(':generation'))[1].value).validUntil;
  f.advance(160000);
  f.runtime().run('new AuthService().assertActiveSession()');
  assert.equal(f.calls.writes, 1);
  assert.equal(JSON.parse([...f.cache.entries()].find(([key]) => !key.endsWith(':generation'))[1].value).validUntil, deadline);
  const reads = f.calls.reads;
  f.advance(140001);
  assert.equal(f.runtime().run('new AuthService().getContext().email'), 'teacher@ufam.edu.br');
  assert.ok(f.calls.reads > reads);
});

test('explicit invalidation refreshes the current live instance and future requests', () => {
  const f = fixture();
  const { run } = f.runtime();
  run('var auth = new AuthService(); auth.getContext()');
  const rows = f.tables.get('registry/Active_Sessions');
  rows[1][rows[0].indexOf('Name')] = 'Updated externally';
  run('invalidateCurrentUserAuth_()');
  assert.equal(run('auth.getContext().name'), 'Updated externally');
  assert.equal(f.runtime().run('new AuthService().getContext().name'), 'Updated externally');
});

test('role and semester switches invalidate the cached context', () => {
  const f = fixture();
  const { run, context } = f.runtime();
  run('new AuthService().getContext()');
  assert.equal(run('switchRole(UserRole.ADVISOR).success'), true);
  assert.equal(run('new AuthService().getContext().role'), context.UserRole.ADVISOR);
  assert.equal(f.runtime().run('new AuthService().getContext().role'), context.UserRole.ADVISOR);
  f.table('other-term', 'Students', context.DB_COLS_STUDENT, []);
  run(`getSheetManager_('registry','Semesters','Semester').insert({Semester:'2027.1', SheetId:'other-term', Status:SemesterStatus.ACTIVE});`);
  assert.equal(run("switchSemester('2027.1').success"), true);
  assert.equal(f.runtime().run('new AuthService().getContext().sheetId'), 'other-term');
});

test('roster changes invalidate other users and re-evaluate stored roles', () => {
  const f = fixture();
  f.runtime('student@ufam.edu.br').run('new AuthService().getContext()');
  f.runtime().run("getSheetManager_('term','Students','StudentId').update('1', {Email:'other@ufam.edu.br'})");
  const { run, context } = f.runtime('student@ufam.edu.br');
  assert.equal(run('new AuthService().getContext().role'), context.UserRole.ERROR);
});

test('cache eviction, unavailable cache and invalid activity dates use safe fallbacks', () => {
  const f = fixture();
  f.runtime().run('new AuthService().getContext()');
  f.cache.clear();
  const reads = f.calls.reads;
  assert.equal(f.runtime().run('new AuthService().getContext().email'), 'teacher@ufam.edu.br');
  assert.ok(f.calls.reads > reads);
  f.failCache();
  assert.equal(f.runtime().run('new AuthService().getContext().email'), 'teacher@ufam.edu.br');
  const rows = f.tables.get('registry/Active_Sessions');
  rows[1][rows[0].indexOf('LastActivity')] = 'invalid';
  assert.equal(f.runtime().run('new AuthService().getValidCurrentSession(true)'), null);
});

test('proposal history filters first and remains chronological', () => {
  const f = fixture();
  const { run, context } = f.runtime();
  f.table('term', 'Events', context.DB_COLS_EVENT, [
    { EventId:'1', ProposalId:'p', Message:'Later', Timestamp:'2026-09-30T12:00:00Z' },
    { EventId:'2', ProposalId:'other', Message:'Unrelated', Timestamp:'2026-09-01T12:00:00Z' },
    { EventId:'3', ProposalId:'p', Message:'Earlier', Timestamp:'2026-09-29T12:00:00Z' }
  ]);
  assert.equal(run("JSON.stringify(new EventLogService('term').getByProposal('p').map(e => e.message))"), '["Earlier","Later"]');
});

test('pending signatures reuse proposal/student indexes without accessing Sheets', () => {
  const f = fixture();
  const { run } = f.runtime();
  run(`var phase = {p: {members:[{email:'teacher@ufam.edu.br'}], committee:{FinalTitle:'Title'},
    defense:{AdvisorSignedAt:'2026-09-30',MembersGrades:'[]'}}};
    var students = {'student@ufam.edu.br':{name:'Student'}};
    var proposals = {p:{StudentEmail:'STUDENT@ufam.edu.br'}};`);
  assert.equal(run("_pendingSignaturesFor_('teacher@ufam.edu.br',phase,students,proposals)[0].studentName"), 'Student');
  assert.equal(f.calls.reads, 0);
});


test('an in-flight request cannot republish authorization after a role switch', () => {
  const f = fixture();
  f.runtime().run('new AuthService().getContext()');
  const old = f.runtime();
  old.run('var auth = new AuthService(); auth.getContext()');
  f.advance(160000);
  f.runtime().run('switchRole(UserRole.ADVISOR)');
  old.run('auth.touchCurrentSession()');
  const fresh = f.runtime();
  assert.equal(fresh.run('new AuthService().getContext().role'), fresh.context.UserRole.ADVISOR);
});
