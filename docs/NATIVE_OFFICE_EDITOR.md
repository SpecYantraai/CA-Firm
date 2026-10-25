# Native Office Editor

The uploaded `assessify-main.zip` supplied the reference workflow: Tiptap rich
text, editable spreadsheet cells, and server-side saves into Office files.
The CA-Firm integration adapts that workflow to authenticated working papers,
existing review locks, version history, and audit events. It does not import
Assessify's candidate/session permissions or assessment field restrictions.

## Setup and Use

- New installations use `builtin` unless `DOCUMENT_EDITOR_URL` selects ONLYOFFICE.
- An existing saved provider is not silently overwritten. Admins can select
  **Built-in DOCX and Excel Editor** in **Admin Settings > Document Editor**.
- Open an uploaded DOCX or XLSX working paper and choose **Preview/Edit**.
- Expand the editor for more space and use **Save version** to persist changes.
- Original agent code and calculations are unchanged.

## Supported Editing

DOCX: body text, headings, bold, italic, underline, lists, line breaks, simple
tables, and adding rows/columns. Tiptap is the MIT-licensed rich-text component.
Word is presented as editable content, not an exact paginated Word layout.

XLSX: sheet tabs, text/numbers/booleans/formulas, multi-cell TSV paste,
undo/redo, a formula bar, row/column navigation, and direct cell navigation.
Leading-zero identifiers and long numeric identifiers remain text; prefix a
value with an apostrophe to force text. `fast-formula-parser` (MIT) provides
formula previews, including cross-sheet references. Unsupported formulas show
an error rather than an invented result. Formula previews are not full Excel
calculation parity; original formulas are retained and Excel recalculates on
open. External workbook links and named ranges are not resolved by the preview.
No formula is evaluated with JavaScript `eval`; external web functions are disabled.

## Preservation and Limits

DOCX saves update the document body in the original ZIP package. Headers,
footers, styles, media, and unrelated parts remain intact. Unchanged paragraphs
retain their original XML. Fields, hyperlinks, drawings, tracked changes,
section-break paragraphs, merged/complex tables, and unsupported blocks are
protected placeholders. Removing a protected block is rejected on save.
Existing complex list indentation is not fully represented by the native editor.

XLSX saves patch edited cells in the original worksheet XML. Unedited styles,
merges, workbook parts, and other embedded assets are retained. Stale formula
caches/calculation chains are removed and recalculation is requested. Sheet
protection and merged-cell restrictions apply. Native editing does not support
legacy `.xls`/`.doc`, macros, encrypted files, or complete Office layout tools.

Safety limits: configured file size, 150 MB uncompressed package size, 10,000 ZIP
entries, 100,000 nonempty/styled workbook cells, 10,000 edited cells per save,
32,767 characters per cell, and 20,000 document XML nodes. Large files can still
use an external editor or download. The spreadsheet viewport is paged, not
silently truncated.

## Authorization and Persistence

`GET /api/v1/wps/{id}/native-editor` returns the current version and editable
content only after engagement access checks. EQCR and locked files are read-only.
`PUT` requires a matching `version` and either `document` (DOCX JSON) or `edits`
(sheet-name to cell-address/value map). It rechecks provider selection,
permissions, engagement/section locks and version, then creates a `FileVersion`
and a `wp.edited` event. Stale saves receive HTTP 409 without overwriting files.

## Agent Defaults

The NVIDIA default model is `nvidia/nemotron-3-ultra-550b-a55b`. API credentials
remain server-side. The locally supplied key is held in the ignored
`backend/.private-agent-import/default-model.env`, excluded from Git and Docker.
For Railway, set `NVIDIA_API_KEY`, `LLM_PROVIDER=nvidia`, and `LLM_MODEL` in the
backend service variables, or configure the encrypted key in the admin portal.
Existing enabled admin configuration overrides defaults. Rotate exposed keys.

## Verification

`backend/tests/test_native_editor.py` covers DOCX/XLSX round trips, package-part
preservation, formatting, lists, headers, tables, formulas, merges, cell
protection, access scope, read-only roles, engagement/section locks, version
creation, and stale saves. Existing risk-agent tests continue verifying all
19 original vendor-file hashes.

References: [Tiptap](https://tiptap.dev/docs/editor/getting-started/overview),
[formula parser](https://github.com/LesterLyu/fast-formula-parser), and the
user-supplied Assessify source archive.
