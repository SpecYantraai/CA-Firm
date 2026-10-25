import FormulaParser from 'fast-formula-parser';

export function columnName(number) {
  let result = '';
  while (number > 0) { number -= 1; result = String.fromCharCode(65 + number % 26) + result; number = Math.floor(number / 26); }
  return result;
}

export function cellPosition(address) {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/i.exec(address);
  if (!match) return null;
  const col = [...match[1].toUpperCase()].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  const row = Number(match[2]);
  return col <= 16384 && row <= 1048576 ? { col, row } : null;
}

function literal(value) {
  if (typeof value !== 'string') return value ?? null;
  if (value.startsWith("'")) return value.slice(1);
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) && value.replace(/[^0-9]/g, '').length <= 15) return Number(value);
  return value;
}

export function createFormulaView(workbook, overrides) {
  const sheets = new Map(workbook.sheets.map(sheet => [sheet.name, sheet]));
  const cache = new Map();
  const resolving = new Set();
  const extents = new Map(workbook.sheets.map(sheet => {
    const positions = Object.keys(overrides[sheet.name] || {}).map(cellPosition).filter(Boolean);
    return [sheet.name, { row: Math.max(sheet.n_rows, ...positions.map(pos => pos.row)), col: Math.max(sheet.n_cols, ...positions.map(pos => pos.col)) }];
  }));
  let operations = 200000;
  const raw = (name, address) => overrides[name]?.[address] ?? sheets.get(name)?.cells[address]?.raw ?? '';
  const value = (name, address) => {
    const key = `${name}!${address}`;
    if (--operations < 0) throw FormulaParser.FormulaError.VALUE;
    if (!sheets.has(name)) throw FormulaParser.FormulaError.REF;
    if (cache.has(key)) return cache.get(key);
    if (resolving.has(key) || resolving.size > 100) throw FormulaParser.FormulaError.REF;
    const input = raw(name, address);
    if (typeof input !== 'string' || !input.startsWith('=')) { const result = literal(input); cache.set(key, result); return result; }
    if (input.length > 8192) throw FormulaParser.FormulaError.VALUE;
    resolving.add(key);
    try {
      // A parser per formula avoids mutating another evaluation's reference context.
      const parser = new FormulaParser({
        functions: { WEBSERVICE: () => { throw FormulaParser.FormulaError.NA; } },
        onCell: ref => value(ref.sheet || name, `${columnName(ref.col)}${ref.row}`),
        onRange: ref => {
          const target = ref.sheet || name;
          const sheet = sheets.get(target);
          if (!sheet) throw FormulaParser.FormulaError.REF;
          const endRow = Math.min(ref.to.row, extents.get(target).row);
          const endCol = Math.min(ref.to.col, extents.get(target).col);
          if ((endRow - ref.from.row + 1) * (endCol - ref.from.col + 1) > 100000) throw FormulaParser.FormulaError.VALUE;
          const rows = [];
          for (let row = ref.from.row; row <= endRow; row++) {
            const cells = [];
            for (let col = ref.from.col; col <= endCol; col++) cells.push(value(target, `${columnName(col)}${row}`));
            rows.push(cells);
          }
          return rows;
        },
      });
      const result = parser.parse(input.slice(1), { sheet: name, ...cellPosition(address) });
      if (result instanceof Error) throw result;
      cache.set(key, result);
      return result;
    } finally { resolving.delete(key); }
  };
  return { raw, display: (name, address) => {
    try {
      const result = value(name, address);
      if (Array.isArray(result)) return '#SPILL!';
      if (typeof result === 'number' && !Number.isFinite(result)) return '#NUM!';
      return typeof result === 'boolean' ? String(result).toUpperCase() : String(result ?? '');
    } catch (error) { return error.name?.startsWith('#') ? error.name : '#ERROR!'; }
  } };
}
