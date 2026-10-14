/**
 * FILE: DaoSheets.js — crud for Google Sheets
 * DESC: CRUD for Google Sheets with dynamic header mapping
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

/**
 * Spreadsheets already opened in THIS execution, shared by every DAO that
 * points at the same file. Apps Script resets globals between executions, so
 * this never outlives a single request — it only stops the same file from
 * being reopened once per DAO instance (a request touches the registry and
 * the term spreadsheet several times each).
 */
var _openSpreadsheets = {};

// Shared by tab, including DAOs created with different primary keys.
var _sheetReadCache = Object.create(null);

function _sheetCacheKey_(spreadsheetId, sheetName) {
  return JSON.stringify([spreadsheetId.trim(), sheetName]);
}

function invalidateSheetCache_(spreadsheetId, sheetName) {
  const state = _sheetReadCache[_sheetCacheKey_(spreadsheetId, sheetName)];
  if (state) {
    state.rows = undefined;
    state.headerMapping = undefined;
  }
}

// Do not expose mutable cached Dates to service code.
function _copySheetCell_(value) {
  return value instanceof Date ? new Date(value.getTime()) : value;
}

function _openSpreadsheetOnce_(spreadsheetId) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string' || !spreadsheetId.trim()) {
    var stack = (new Error()).stack || 'no stack';
    console.error('ERRO CRÍTICO em _openSpreadsheetOnce_: spreadsheetId inválido ou não informado. Valor: ' + JSON.stringify(spreadsheetId) + '\nStack: ' + stack);
    throw new Error('ID de planilha inválido ou não informado: ' + JSON.stringify(spreadsheetId));
  }
  var cleanId = spreadsheetId.trim();
  if (!_openSpreadsheets[cleanId]) {
    try {
      _openSpreadsheets[cleanId] = SpreadsheetApp.openById(cleanId);
    } catch (e) {
      console.error('ERRO ao abrir planilha com ID "' + cleanId + '": ' + e.message + '\nStack: ' + (e.stack || (new Error()).stack));
      throw e;
    }
  }
  return _openSpreadsheets[cleanId];
}

/**
 * Compares a stored cell value with the one about to be written, to skip
 * redundant writes. Dates come back from the sheet as Date objects, which are
 * never equal by reference even when they represent the same instant.
 */
function _isSameCellValue_(stored, incoming) {
  if (stored instanceof Date && incoming instanceof Date) {
    return stored.getTime() === incoming.getTime();
  }
  if (stored instanceof Date || incoming instanceof Date) return false;
  return String(stored) === String(incoming);
}

/**
 * Whether a primary key is usable at all.
 *
 * Rows are matched with a loose comparison (a numeric matrícula typed as text
 * must still find its row), and loose comparison is exactly what turns an empty
 * key into a wildcard: '' == '' matches the first record whose key cell is
 * blank. That is how an unauthenticated visitor used to land on somebody else's
 * session row — see _requireGoogleIdentity_ in ServiceAuth.js. Refusing the
 * empty key here closes the same door one layer lower down, for every table.
 */
function _isUsableKey_(id) {
  return id !== null && id !== undefined && String(id) !== '';
}

/**
 * Factory function to handle Data Access Object (DAO) for a specific sheet.
 * Extracts the first row (headers) to dynamically map JSON object keys to Google Sheet columns.
 * 
 * @param {string} spreadsheetId - The ID of the Google Sheets file
 * @param {string} sheetName - The exact name of the tab (e.g., 'Active_Sessions')
 * @param {string} primaryKey - The primary key column name (e.g., 'Session_Id')
 * @returns {object} CRUD functions
 */
/**
 * O valor como deve ir para a célula: texto que o Sheets leria como fórmula
 * ganha o apóstrofo na frente e fica texto.
 *
 * setValues e appendRow interpretam qualquer string que comece com "=" como
 * fórmula, e "+", "-" e "@" vão pelo mesmo caminho. Quase tudo que se grava
 * aqui foi digitado por alguém: um título "=JOIN(";";Students!A2:E99)" trazia
 * a turma inteira para o painel do aluno, e um telefone "+55 92 ..." virava
 * #ERROR!. O apóstrofo não aparece na leitura — getValues devolve o texto
 * original — então nada do lado de quem lê precisa mudar. Mesma regra do CSV
 * do consolidado (_csvText_, ServiceReport.js).
 */
function _cellSafe_(value) {
  return (typeof value === 'string' && /^[=+\-@]/.test(value)) ? "'" + value : value;
}

class SheetDao {
  /**
   * Data Access Object (DAO) for a specific sheet.
   * @param {string} spreadsheetId - ID of the Google Sheets file
   * @param {string} sheetName - Target Tab name (e.g. 'Active_Sessions')
   * @param {string} primaryKey - The primary key column name
   */
  constructor(spreadsheetId, sheetName, primaryKey) {
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;
    this.primaryKey = primaryKey;
    const key = _sheetCacheKey_(spreadsheetId, sheetName);
    this._cache = _sheetReadCache[key] || (_sheetReadCache[key] = {});
  }

  // Internal helper: get sheet object (shared by tab in this execution)
  _getSheet() {
    if (this._cache.sheet) return this._cache.sheet;
    if (!this.spreadsheetId) throw new Error("Spreadsheet ID is missing.");

    const ss = _openSpreadsheetOnce_(this.spreadsheetId);
    const sheet = ss.getSheetByName(this.sheetName);
    if (!sheet) throw new Error(`Sheet (Tab) not found: ${this.sheetName}`);

    this._cache.sheet = sheet;
    return sheet;
  }

  // Internal helper: map columns to array indexes (read once per tab)
  _getHeaderMapping(sheet) {
    if (this._cache.headerMapping) return this._cache.headerMapping;

    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return { map: {}, lastCol: 0 }; // empty sheet: don't memoize

    // Read only the first row
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const map = {};

    headers.forEach((headerName, index) => {
      if (headerName) map[headerName] = index;
    });

    this._cache.headerMapping = { map, lastCol };
    return this._cache.headerMapping;
  }

  // Internal helper: convert a row array into a JSON object
  _rowToObject(row, map) {
    const obj = {};
    for (const key in map) {
      obj[key] = _copySheetCell_(row[map[key]]);
    }
    return obj;
  }

  // One data read per tab until a write invalidates it. Keep raw rows private.
  _readRows() {
    if (this._cache.rows !== undefined) return this._cache.rows;
    const sheet = this._getSheet();
    const lastRow = sheet.getLastRow();
    const { lastCol } = this._getHeaderMapping(sheet);
    this._cache.rows = lastRow > 1 && lastCol > 0
      ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    return this._cache.rows;
  }

  _findRowIndex(id) {
    const rows = this._readRows();
    if (!rows.length) return -1;
    const { map } = this._getHeaderMapping(this._getSheet());
    const pkIndex = map[this.primaryKey];
    if (pkIndex === undefined) throw new Error(`PK col [${this.primaryKey}] missing in ${this.sheetName}`);
    // Preserve numeric/text key compatibility and first-match semantics.
    return rows.findIndex(row => row[pkIndex] == id);
  }

  getAll() {
    const rows = this._readRows();
    const { map } = this._getHeaderMapping(this._getSheet());
    return rows.map(row => this._rowToObject(row, map));
  }

  getById(id) {
    if (!_isUsableKey_(id)) return null;
    const index = this._findRowIndex(id);
    if (index < 0) return null;
    const { map } = this._getHeaderMapping(this._getSheet());
    return this._rowToObject(this._cache.rows[index], map);
  }

  _afterWrite(id, patch) {
    // Re-read after writes: Sheets may coerce values or recalculate formulas.
    this._cache.rows = undefined;
    if (typeof _invalidateAuthForSheet_ === 'function') {
      _invalidateAuthForSheet_(this.spreadsheetId, this.sheetName, id, patch);
    }
  }

  /**
   * Insert a new record (Appends to the bottom)
   */
  insert(obj) {
    if (!_isUsableKey_(obj ? obj[this.primaryKey] : null)) {
      throw new Error(`Registro sem chave primária [${this.primaryKey}] em ${this.sheetName}.`);
    }

    const sheet = this._getSheet();
    const { map, lastCol } = this._getHeaderMapping(sheet);

    // A tab with no header row at all cannot take a record: appendRow would be
    // handed an empty array and every field would be dropped without a word.
    if (lastCol === 0) {
      throw new Error(`Aba ${this.sheetName} está sem linha de cabeçalho.`);
    }

    const rowData = new Array(lastCol).fill("");
    for (const key in obj) {
      if (map.hasOwnProperty(key)) {
        rowData[map[key]] = _cellSafe_(obj[key]);
      }
    }
    
    try {
      sheet.appendRow(rowData);
      SpreadsheetApp.flush();
    } finally {
      this._afterWrite(obj[this.primaryKey], obj);
    }
    return obj;
  }

  /**
   * Updates specific columns of an existing record.
   */
  update(id, obj) {
    if (!_isUsableKey_(id)) return false;
    const index = this._findRowIndex(id);
    if (index < 0) return false;
    const sheet = this._getSheet();
    const { map } = this._getHeaderMapping(sheet);
    const currentRow = this._cache.rows[index];
    const changes = Object.keys(obj)
      .filter(key => Object.prototype.hasOwnProperty.call(map, key) &&
        !_isSameCellValue_(currentRow[map[key]], obj[key]))
      .map(key => ({ column: map[key], value: _cellSafe_(obj[key]) }))
      .sort((a, b) => a.column - b.column);
    if (!changes.length) return true;

    // Group only adjacent changed cells. Untouched text keys and formulas
    // must never be rewritten as part of a whole-row update.
    try {
      for (let i = 0; i < changes.length;) {
        const start = changes[i].column;
        const values = [changes[i++].value];
        while (i < changes.length && changes[i].column === start + values.length) {
          values.push(changes[i++].value);
        }
        sheet.getRange(index + 2, start + 1, 1, values.length).setValues([values]);
      }
      SpreadsheetApp.flush();
    } finally {
      // Also invalidate after a partial write or a failed flush.
      this._afterWrite(id, obj);
    }
    return true;
  }

  /**
   * Checks if it exists: If yes, update it. If no, insert it.
   */
  upsert(id, obj) {
    if (!_isUsableKey_(id)) {
      throw new Error(`Chave primária vazia ao gravar em ${this.sheetName}.`);
    }

    if (this.update(id, obj)) return true;
    return this.insert(Object.assign({}, obj, { [this.primaryKey]: id }));
  }
}

/**
 * Acrescenta ao cabeçalho de uma aba as colunas que o código espera e que ela
 * ainda não tem.
 *
 * Planilhas criadas por uma versão anterior não ganham colunas novas sozinhas,
 * e o SheetDao descarta em silêncio o campo sem coluna: o dado seria "salvo" e
 * sumiria. Acrescentar uma célula de cabeçalho não apaga nem move nada.
 * Conferido no máximo uma vez por aba e por execução.
 */
var _columnsChecked = Object.create(null);

function ensureColumns_(spreadsheetId, sheetName, columns) {
  const key = _sheetCacheKey_(spreadsheetId, sheetName);
  if (_columnsChecked[key]) return;
  const sheet = _openSpreadsheetOnce_(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet (Tab) not found: ${sheetName}`);

  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const missing = Object.values(columns).filter(c => headers.indexOf(c) === -1);
  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    SpreadsheetApp.flush();
    invalidateSheetCache_(spreadsheetId, sheetName);
    console.log('Colunas acrescentadas em %s: %s', sheetName, missing.join(', '));
  }
  _columnsChecked[key] = true;
}

function getSheetManager_(spreadsheetId, sheetName, primaryKey) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string' || !spreadsheetId.trim()) {
    var stack = (new Error()).stack || 'no stack';
    console.error('ERRO em getSheetManager_: spreadsheetId inválido para a aba "' + sheetName + '". Valor: ' + JSON.stringify(spreadsheetId) + '\nStack: ' + stack);
    throw new Error('ID da planilha ausente ou inválido ao acessar a aba: ' + sheetName);
  }
  return new SheetDao(spreadsheetId.trim(), sheetName, primaryKey);
}
