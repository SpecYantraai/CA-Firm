import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowDown, ArrowUp, Undo2, Redo2 } from 'lucide-react';
import { cellPosition, columnName, createFormulaView } from './spreadsheet-formulas';

const PAGE_ROWS = 50;
const PAGE_COLS = 12;

export default function SpreadsheetEditor({ workbook, editable, onChange }) {
  const [sheetIndex, setSheetIndex] = useState(Math.max(0, workbook.sheets.findIndex(sheet => !sheet.hidden)));
  const [overrides, setOverrides] = useState({});
  const [selection, setSelection] = useState('A1');
  const [editing, setEditing] = useState('');
  const [goTo, setGoTo] = useState('A1');
  const [offset, setOffset] = useState({ row: 1, col: 1 });
  const [error, setError] = useState('');
  const [history, setHistory] = useState({ past: [], future: [] });
  const sheet = workbook.sheets[sheetIndex];
  const formula = useMemo(() => createFormulaView(workbook, overrides), [workbook, overrides]);
  const merged = useMemo(() => sheet.merged.map(range => range.split(':').map(cellPosition)), [sheet]);
  const protectedRanges = useMemo(() => (sheet.protected_ranges || []).map(range => range.split(':').map(cellPosition)), [sheet]);
  const mergedChild = address => {
    const pos = cellPosition(address);
    return merged.some(([start, end = start]) => start && end && pos.row >= start.row && pos.row <= end.row && pos.col >= start.col && pos.col <= end.col && (pos.row !== start.row || pos.col !== start.col));
  };
  const canEdit = address => {
    const position = cellPosition(address);
    const arrayCell = protectedRanges.some(([start, end = start]) => start && end && position.row >= start.row && position.row <= end.row && position.col >= start.col && position.col <= end.col);
    return editable && !arrayCell && !mergedChild(address) && (sheet.cells[address]?.editable ?? !sheet.protected);
  };
  const commit = next => { setOverrides(next); onChange(next); };
  const edit = changes => {
    if (!editable) return;
    const cells = { ...(overrides[sheet.name] || {}) };
    for (const [address, value] of Object.entries(changes)) {
      if (!canEdit(address)) { setError(`Cell ${address} is protected or merged.`); return; }
      const original = String(sheet.cells[address]?.raw ?? '');
      if (value === original) delete cells[address]; else cells[address] = value;
    }
    setHistory(current => ({ past: [...current.past, overrides].slice(-100), future: [] }));
    const next = { ...overrides, [sheet.name]: cells };
    if (!Object.keys(cells).length) delete next[sheet.name];
    setError(''); commit(next);
  };
  const undo = () => {
    if (!history.past.length) return;
    setHistory({ past: history.past.slice(0, -1), future: [...history.future, overrides] }); commit(history.past.at(-1));
  };
  const redo = () => {
    if (!history.future.length) return;
    setHistory({ past: [...history.past, overrides], future: history.future.slice(0, -1) }); commit(history.future.at(-1));
  };
  const move = (row, col) => {
    if (row < 1 || row > 1048576 || col < 1 || col > 16384) return;
    const address = `${columnName(col)}${row}`;
    setSelection(address); setGoTo(address);
    setOffset(current => ({ row: row < current.row || row >= current.row + PAGE_ROWS ? row : current.row, col: col < current.col || col >= current.col + PAGE_COLS ? col : current.col }));
    requestAnimationFrame(() => document.querySelector(`[data-office-cell="${address}"]`)?.focus());
  };
  const paste = (event, address) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(row => row.split('\t'));
    if (rows.reduce((count, row) => count + row.length, 0) > 10000) { setError('Paste is limited to 10,000 cells.'); return; }
    const origin = cellPosition(address);
    const changes = {};
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      if (origin.row + r > 1048576 || origin.col + c > 16384) { setError('Paste exceeds the worksheet limits.'); return; }
      changes[`${columnName(origin.col + c)}${origin.row + r}`] = rows[r][c];
    }
    edit(changes);
  };
  if (!sheet) return <div className="office-error">No worksheets found.</div>;
  const rows = Array.from({ length: Math.min(PAGE_ROWS, 1048577 - offset.row) }, (_, index) => offset.row + index);
  const columns = Array.from({ length: Math.min(PAGE_COLS, 16385 - offset.col) }, (_, index) => offset.col + index);
  return <>
    <div className="office-sheet-tabs" role="tablist" aria-label="Worksheets">{workbook.sheets.map((item, index) => !item.hidden && <button key={item.name} type="button" role="tab" aria-selected={index === sheetIndex} onClick={() => { setSheetIndex(index); setOffset({ row: 1, col: 1 }); setSelection('A1'); setGoTo('A1'); }}>{item.name}</button>)}</div>
    <div className="office-formula-bar">
      <form onSubmit={event => { event.preventDefault(); const pos = cellPosition(goTo); if (pos) move(pos.row, pos.col); else setError('Enter a valid cell address.'); }}><input aria-label="Go to cell" value={goTo} onChange={event => setGoTo(event.target.value.toUpperCase())}/></form>
      <span className="office-formula-symbol">fx</span><input aria-label="Cell formula or value" value={String(formula.raw(sheet.name, selection))} disabled={!canEdit(selection)} onChange={event => edit({ [selection]: event.target.value })}/>
      <button className="office-tool" title="Undo cell edit" aria-label="Undo cell edit" disabled={!editable || !history.past.length} onClick={undo}><Undo2 size={15}/></button><button className="office-tool" title="Redo cell edit" aria-label="Redo cell edit" disabled={!editable || !history.future.length} onClick={redo}><Redo2 size={15}/></button>
    </div>
    {error && <div className="office-error" role="alert">{error}</div>}
    <div className="office-grid-scroll"><table className="office-grid" aria-label={`${sheet.name} worksheet`}><thead><tr><th className="office-row-number"/>{columns.map(col => <th key={col} scope="col">{columnName(col)}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row}><th scope="row" className="office-row-number">{row}</th>{columns.map(col => {
      const address = `${columnName(col)}${row}`;
      const cell = sheet.cells[address];
      const raw = String(formula.raw(sheet.name, address));
      const background = cell?.background?.length === 8 && cell.background.slice(2) !== '000000' ? `#${cell.background.slice(2)}` : undefined;
      const rgb = background ? [1, 3, 5].map(start => parseInt(background.slice(start, start + 2), 16)) : null;
      const foreground = rgb ? (rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 140 ? '#20242c' : '#ffffff') : undefined;
      return <td key={address} className={`${selection === address ? 'is-selected' : ''} ${overrides[sheet.name]?.[address] !== undefined ? 'is-modified' : ''}`} style={{ backgroundColor: background }}><input data-office-cell={address} aria-label={`${sheet.name}!${address}`} readOnly={!canEdit(address)} value={editing === address ? raw : formula.display(sheet.name, address)} title={raw} style={{ fontWeight: cell?.bold ? 700 : undefined, fontStyle: cell?.italic ? 'italic' : undefined, color: foreground }} onFocus={() => { setSelection(address); setGoTo(address); setEditing(address); }} onBlur={() => setEditing('')} onChange={event => edit({ [address]: event.target.value })} onPaste={event => paste(event, address)} onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
        else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); move(row + (event.key === 'Enter' ? (event.shiftKey ? -1 : 1) : 0), col + (event.key === 'Tab' ? (event.shiftKey ? -1 : 1) : 0)); }
      }}/></td>;
    })}</tr>)}</tbody></table></div>
    <div className="office-grid-navigation"><div><button className="office-tool" title="Previous rows" aria-label="Previous rows" disabled={offset.row === 1} onClick={() => setOffset(value => ({ ...value, row: Math.max(1, value.row - PAGE_ROWS) }))}><ArrowUp size={14}/></button><span>Rows {rows[0]}-{rows.at(-1)}</span><button className="office-tool" title="Next rows" aria-label="Next rows" disabled={offset.row + PAGE_ROWS > 1048576} onClick={() => setOffset(value => ({ ...value, row: value.row + PAGE_ROWS }))}><ArrowDown size={14}/></button></div><div><button className="office-tool" title="Previous columns" aria-label="Previous columns" disabled={offset.col === 1} onClick={() => setOffset(value => ({ ...value, col: Math.max(1, value.col - PAGE_COLS) }))}><ArrowLeft size={14}/></button><span>{columnName(columns[0])}-{columnName(columns.at(-1))}</span><button className="office-tool" title="Next columns" aria-label="Next columns" disabled={offset.col + PAGE_COLS > 16384} onClick={() => setOffset(value => ({ ...value, col: value.col + PAGE_COLS }))}><ArrowRight size={14}/></button></div></div>
  </>;
}
