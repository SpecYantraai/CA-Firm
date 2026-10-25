/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Bold, Italic, Underline, List, ListOrdered, Undo2, Redo2, Save, RefreshCw, Maximize2, Minimize2, LockKeyhole, Table2, Rows3, Columns3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { wpApi } from '../../api';
import { getErrorMessage } from '../../utils';
import SpreadsheetEditor from './SpreadsheetEditor';
import './native-office.css';

const SourceIdentity = Extension.create({
  name: 'sourceIdentity',
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading', 'table', 'tableRow', 'tableCell', 'tableHeader'], attributes: {
      sourceId: { default: null, parseHTML: element => element.getAttribute('data-source-id'), renderHTML: attrs => attrs.sourceId ? { 'data-source-id': attrs.sourceId } : {} },
    } }];
  },
});

const PreservedBlock = Node.create({
  name: 'preservedBlock', group: 'block', atom: true, selectable: false,
  addAttributes() { return { sourceId: { default: null }, label: { default: 'Embedded content' }, text: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-preserved-block]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-preserved-block': '', contenteditable: 'false', class: 'office-preserved-block' }),
      ['strong', {}, `${node.attrs.label} (preserved)`], ['div', {}, node.attrs.text]];
  },
});

function Tool({ label, active = false, disabled = false, onClick, children }) {
  return <button type="button" className={`office-tool ${active ? 'is-active' : ''}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>{children}</button>;
}

function WordEditor({ document, editable, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false, code: false, codeBlock: false, horizontalRule: false, trailingNode: false }), TableKit.configure({ table: { resizable: false } }), SourceIdentity, PreservedBlock],
    content: document, editable, shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'office-word-page', 'aria-label': 'Document content', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  useEffect(() => { editor?.setEditable(editable, false); }, [editor, editable]);
  if (!editor) return null;
  const action = command => () => command(editor.chain().focus()).run();
  return <>
    <div className="office-format-toolbar" role="toolbar" aria-label="Document formatting">
      <select aria-label="Paragraph style" disabled={!editable} value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : '0'} onChange={e => e.target.value === '0' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: Number(e.target.value) }).run()}>
        <option value="0">Normal text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option>
      </select>
      <Tool label="Bold" active={editor.isActive('bold')} disabled={!editable} onClick={action(chain => chain.toggleBold())}><Bold size={16}/></Tool>
      <Tool label="Italic" active={editor.isActive('italic')} disabled={!editable} onClick={action(chain => chain.toggleItalic())}><Italic size={16}/></Tool>
      <Tool label="Underline" active={editor.isActive('underline')} disabled={!editable} onClick={action(chain => chain.toggleUnderline())}><Underline size={16}/></Tool>
      <span className="office-divider"/>
      <Tool label="Bullet list" active={editor.isActive('bulletList')} disabled={!editable} onClick={action(chain => chain.toggleBulletList())}><List size={16}/></Tool>
      <Tool label="Numbered list" active={editor.isActive('orderedList')} disabled={!editable} onClick={action(chain => chain.toggleOrderedList())}><ListOrdered size={16}/></Tool>
      <Tool label="Insert table" disabled={!editable} onClick={action(chain => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: false }))}><Table2 size={16}/></Tool>
      {editor.isActive('table') && <><Tool label="Add row below" disabled={!editable} onClick={action(chain => chain.addRowAfter())}><Rows3 size={16}/></Tool><Tool label="Add column after" disabled={!editable} onClick={action(chain => chain.addColumnAfter())}><Columns3 size={16}/></Tool></>}
      <span className="office-divider"/>
      <Tool label="Undo" disabled={!editable || !editor.can().undo()} onClick={action(chain => chain.undo())}><Undo2 size={16}/></Tool>
      <Tool label="Redo" disabled={!editable || !editor.can().redo()} onClick={action(chain => chain.redo())}><Redo2 size={16}/></Tool>
    </div>
    <div className="office-word-scroll"><EditorContent editor={editor}/></div>
  </>;
}

export default function NativeOfficeEditor({ wp, onSaved, onDirtyChange }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reload, setReload] = useState(0);
  const changes = useRef(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setDirty(false); changes.current = null;
    wpApi.nativeEditor(wp.wp_id).then(res => { if (active) setView(res.data); }).catch(err => { if (active) setError(getErrorMessage(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [wp.wp_id, wp.current_version, reload]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async () => {
    if (!dirty || !view?.editable || saving) return;
    setSaving(true); setError('');
    try {
      const payload = view.format === 'docx' ? { document: changes.current } : { edits: changes.current };
      const response = await wpApi.saveNativeEditor(wp.wp_id, { version: view.version, ...payload });
      setDirty(false); changes.current = null;
      toast.success(response.data.message);
      onSaved(response.data.data);
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  const update = value => { changes.current = value; setDirty(true); };
  const reset = () => { if (!dirty || window.confirm('Discard unsaved document changes?')) setReload(value => value + 1); };
  return <section className={`native-office ${expanded ? 'native-office-expanded' : ''}`} aria-label={`${wp.filename} built-in editor`}>
    <div className="office-command-bar">
      <div className="office-save-status" role="status">{expanded && <strong>{wp.filename}</strong>}{view && !view.editable && <LockKeyhole size={14}/>}<span>{loading ? 'Opening document...' : dirty ? 'Unsaved changes' : view && !view.editable ? 'Read only' : `Version ${wp.current_version}`}</span></div>
      <div className="office-command-actions"><Tool label="Reload document" disabled={loading || saving} onClick={reset}><RefreshCw size={15}/></Tool><Tool label={expanded ? 'Exit full screen' : 'Expand editor'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</Tool><button type="button" className="btn btn-primary btn-sm" disabled={!dirty || saving || !view?.editable} onClick={save}><Save size={14}/>{saving ? 'Saving...' : 'Save version'}</button></div>
    </div>
    {error && <div className="office-error" role="alert">{error}</div>}
    {!loading && view && (view.format === 'docx' ? <WordEditor key={`${wp.wp_id}-${view.version}-${reload}`} document={view.document} editable={view.editable && !saving} onChange={update}/> : <SpreadsheetEditor key={`${wp.wp_id}-${view.version}-${reload}`} workbook={view.workbook} editable={view.editable && !saving} onChange={update}/>)}
  </section>;
}
