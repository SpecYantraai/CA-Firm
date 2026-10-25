# Risk Assessment Agent Integration

Select an engagement, then open **Risk Assessment Agent**. The firm team and assigned
client login share the assessment saved for that engagement. Other client
engagements remain isolated by the existing assignment checks.

The native screen covers all seven steps in the supplied Streamlit application:
engagement context, Excel/Word uploads, materiality, PM/CTM thresholds, MCOTABD
and transaction counts, the risk engine, and editable CA gate review. It retains
KB/LLM source labels, grouped controls/procedures, run history, and JSON export.
Managers, partners, and administrators can approve. Approval also writes a new
JSON working paper to Section 2000, subject to the existing section/engagement
locks. Each approval creates a separate artifact; resetting a draft does not
delete uploaded files or approved working papers.

## Source Preservation

`backend/vendor/ams_ra/` contains the newer outer project from `ams-ra-poc.zip`.
All 19 supplied runtime source, prompt, configuration-example, and workbook files are
copied byte-for-byte. The older nested project, Python caches, and the archive's
private `.env` are excluded from the vendored runtime and Git. The unused `sample.py` contains a hardcoded API key;
it is kept locally under the ignored `backend/.private-agent-import/` directory
and is not included in the application or Git. `backend/agent_bridge/source-sha256.json` records
SHA-256 checksums taken directly from the ZIP. The integration tests verify them.
The original Streamlit `app.py` remains available unchanged.

`backend/agent_bridge/worker.py` is new transport code. It calls the original
parsers, materiality/threshold/TVT helpers, `RiskAssessmentAgent.run`, and
`LLMClient` in a separate process. Streamlit widgets are replaced by React fields;
the calculations, prompts, knowledge-base matching and LLM behavior are retained.
Runtime knowledge-base uploads use a separate data path; they do not replace the
bundled workbook or edit the agent's Python files.

Existing source behavior is deliberately retained, including Excel-as-lakhs
conversion in the upload step, the original MCOTABD candidate comparison, the
materiality floor, legacy `.xls`/`.doc` parser behavior, and LLM fallback/error
handling. This integration does not silently correct or redesign those rules.

## Setup

Admins can configure the provider, model name, API base URL, API key and timeout
at **Administration > AI Agent Configuration**. This shared configuration applies
to new agent runs immediately. NVIDIA, OpenAI, Anthropic and OpenAI-compatible
endpoints are supported, including self-hosted compatible services.

Keys entered in the portal are encrypted in the existing application settings
table using the backend `SECRET_KEY`; the saved key is never returned to the UI.
Keep that application secret stable, or re-enter saved provider keys after changing
it. Leaving the key field blank preserves the saved key (or uses the server key
when no key is stored). Removing a key explicitly disables that key fallback for
the saved configuration. Turning off **Use this configuration for agents** restores
the server configuration described below.

**Test connection** checks the provider's model-list endpoint without generating
a completion and does not save the form. An endpoint may accept a model even if
it does not include it in that list. Knowledge-base upload and status controls are
on this same admin page. The agent source and prompts remain unchanged; the
bridge supplies the saved connection settings to its existing LLM client.

From `backend`, install the updated requirements in the Python environment used
to start FastAPI:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The main requirements include `requirements-agent.txt`. Streamlit itself is not
needed for the native UI. To run the original standalone application instead,
install `vendor/ams_ra/requirements.txt` and start its `app.py` with Streamlit.

Configure the existing agent provider in `backend/.env` or deployment secrets:

```dotenv
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=your-key
LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

The original `anthropic` and `openai` providers are also supported. Use their
corresponding API key variables and a model for that provider. API keys are never
returned to the browser. For this local import, the original ZIP's `.env` is
preserved unchanged in the Git-ignored `backend/.private-agent-import/` folder.
The worker uses only its LLM-related settings as a fallback; backend `.env` and
process environment variables take precedence. That private file is not shipped
in Git, so configure deployment secrets when installing on another machine.
The AI Agent Configuration page displays provider/model/connection status and supports
uploading the firm's knowledge-base workbook. A knowledge base is bundled, so an
upload is only necessary to replace it with the firm's version.

Keep `FILE_STORAGE_PATH` on persistent storage. Drafts and revisions are stored in
the new `risk_assessment_sessions` table, created by the normal backend startup.
Uploaded documents, replacement knowledge bases and approved outputs are stored
under `FILE_STORAGE_PATH/risk-agent/`. Both roles see the same latest saved draft.
Revision checks reject conflicting writes instead of overwriting another user's
work. Long engine runs execute in a background task with UI polling.

## Verification

Install `httpx` as a development dependency and run:

```powershell
python -m unittest discover -s tests -p "test_*.py"
```

Tests check archive integrity, calculation/parser parity, engagement access,
revision conflicts, upload validation, locks, and approval/export persistence.
The full workflow invokes the original engine with a test LLM substitute. It does
not make external model calls. A live provider run requires a configured API key.
