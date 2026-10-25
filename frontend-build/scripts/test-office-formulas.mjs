import assert from 'node:assert/strict';
import { cellPosition, columnName, createFormulaView } from '../src/components/wps/spreadsheet-formulas.js';

const workbook = { sheets: [
  { name: 'Main', n_rows: 50, n_cols: 12, cells: {
    A1: { raw: 10 }, A2: { raw: 20 }, A3: { raw: '=SUM(A1:A2)' }, A4: { raw: '=A3+A3' },
    A5: { raw: '=1/0' }, A6: { raw: '=A6' }, A7: { raw: '00123' }, A8: { raw: '=SUM(B1:B250)' },
    A9: { raw: '=WEBSERVICE("https://example.invalid")' },
  } },
  { name: 'Other sheet', n_rows: 50, n_cols: 12, cells: { A1: { raw: '=Main!A4' } } },
] };
const initial = createFormulaView(workbook, {});
assert.equal(initial.display('Main', 'A3'), '30');
assert.equal(initial.display('Main', 'A4'), '60');
assert.equal(initial.display('Other sheet', 'A1'), '60');
assert.equal(initial.display('Main', 'A5'), '#DIV/0!');
assert.match(initial.display('Main', 'A6'), /^#/);
assert.equal(initial.display('Main', 'A7'), '00123');
assert.match(initial.display('Main', 'A9'), /^#/);
const edited = createFormulaView(workbook, { Main: { A1: '35', B250: '100' } });
assert.equal(edited.display('Main', 'A3'), '55');
assert.equal(edited.display('Other sheet', 'A1'), '110');
assert.equal(edited.display('Main', 'A8'), '100');
assert.deepEqual(cellPosition('XFD1048576'), { row: 1048576, col: 16384 });
assert.equal(cellPosition('XFE1'), null);
assert.equal(cellPosition('A0'), null);
assert.equal(columnName(16384), 'XFD');
console.log('Office formula tests passed.');
