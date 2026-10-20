# Specentra AMS | Agentic Audit Workspace for CA Firms

Client-wise audit documentation and **Agentic Risk Assessment**, with a native
React interface and CA-controlled approval. Select a client engagement and open
the **Risk Assessment** tab. Both the firm team and assigned client logins can
work on the engagement's saved assessment.

## Agentic Risk Assessment

The integrated Risk Assessment Agent follows a **knowledge-base-first** approach:
it retrieves risks and controls from the firm's knowledge base and uses the
configured LLM to supplement gaps. An auditor reviews and edits the results before
approval writes a working paper to **Section 2000 - Audit Planning**.

| Step | Agent Workspace |
| --- | --- |
| 1. Engagement | Selected client and financial year, legal status, industry, products/services, and auditor risk considerations |
| 2. Financials | Upload Excel or Word financial statements and inspect parsed financial inputs |
| 3. Materiality | Review turnover, total assets and PBT; choose a benchmark, percentage, final figure and justification |
| 4. Thresholds | Confirm rounded materiality, performance materiality (PM) and clearly trivial misstatement (CTM) |
| 5. MCOTABD | Confirm material accounts, add accounts and set transaction counts for transaction verification thresholds (TVT) |
| 6. Risk Engine | Run KB matching and LLM gap-filling; inspect source labels and execution history |
| 7. CA Gate Review | Edit assertions, risks, grouped controls and substantive procedures; approve and export the RCM |

```mermaid
flowchart LR
    A[Select Client Engagement] --> B[Financial Statements]
    B --> C[Materiality and Thresholds]
    C --> D[Confirm MCOTABDs]
    D --> E[Risk Assessment Agent]
    K[Firm Knowledge Base] --> E
    L[LLM Supplements Gaps] --> E
    E --> R[CA Gate Review]
    R --> P[Section 2000 Working Paper]
    R --> J[RCM JSON Export]
```

- Drafts persist separately for each engagement and can be resumed after reload.
- Existing engagement assignments control client access. Revision checks prevent
  one user's save from silently overwriting another user's changes.
- Managers, partners and administrators can approve. EQCR reviewers have read-only
  access to agent inputs. Engagement and section locks also apply.
- Admin **Settings > Risk Assessment Agent** shows the provider, model, connection
  status and knowledge-base details, and accepts replacement KB workbooks.
- The supplied workbook contains **2,377 knowledge-base rows**. Runtime KB uploads
  are stored separately from that original workbook.
- The original **19 runtime files, prompts and workbook remain unchanged**.
  SHA-256 checks verify source preservation. The original Streamlit application is
  retained; the CA-Firm UI calls its engine through a separate API/process bridge.

See [Agent Setup and Integration Details](docs/RISK_ASSESSMENT_INTEGRATION.md)
for configuration, original parser behavior, persistence and verification.

## Other Application Features

- Engagement creation, financial-year organisation, assignments and roll-forward.
- Structured audit files: 1000 Preconditions, 2000 Planning, 3000 Communications,
  4000 Execution, 5000 Reporting and Miscellaneous.
- Working-paper uploads, replacement versions, metadata, review notes, sign-offs,
  bulk submission, search and soft deletion.
- Rule-based review quality checks for missing sign-offs, stale files, open notes,
  evidence links and other documentation gaps.
- Final audit file assembly, ZIP archives, engagement locking and change history.
- Client request lists with ownership, due dates, comments and document uploads.
- Typed e-signature requests and approval records.
- Admin controls for ONLYOFFICE and Collabora document editing providers.
- Purple/lavender and navy visual theme, persistent light/dark mode and mobile
  navigation.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | React 19, Vite 8, Zustand, React Router, Lucide |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | MySQL 8 |
| Agent | Original Python Risk Assessment Agent, openpyxl, python-docx, structlog, tenacity |
| LLM Providers | NVIDIA Nemotron, Anthropic or OpenAI, configured on the server |
| Authentication | JWT bearer tokens and role/engagement access checks |
| Storage | Server filesystem under `FILE_STORAGE_PATH`, plus database draft state |

## Run Locally

Use **Python 3.12** for the pinned backend dependencies, **Node.js 20.19+ or
22.12+**, and **MySQL 8**. The commands below use Windows PowerShell.

### 1. Get the Code and Prepare MySQL

```powershell
git clone https://github.com/pmbhatiya97/CA-Firm.git
cd CA-Firm
```

Run [database_setup.sql](database_setup.sql) in MySQL Workbench to create the
database and application user. Set a password for your installation and use the
same credentials in the next step.

### 2. Configure and Start the Backend

```powershell
cd backend
python -m venv .venv
Copy-Item .env.example .env
```

Edit `backend/.env` with your database credentials, application secret and agent
configuration:

```dotenv
DATABASE_URL=mysql+pymysql://specentra:YOUR_URL_ENCODED_PASSWORD@localhost:3306/specentra
SECRET_KEY=replace-with-a-long-random-secret
FILE_STORAGE_PATH=./uploads
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

LLM_PROVIDER=nvidia
NVIDIA_API_KEY=your-provider-key
LLM_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
```

Use `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or `LLM_PROVIDER=openai`
with `OPENAI_API_KEY`, and choose a model for that provider. The agent uses the
configured external provider for supplementary risk generation. Credentials are
server-side and are not included in Git or returned to the browser.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

`requirements.txt` includes `requirements-agent.txt`. Install with the **same
Python interpreter that runs the backend**. Tables, including agent draft
storage, are created by normal backend startup.

### 3. Start the Frontend

Open a second terminal at the repository root:

```powershell
cd frontend-build
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite, normally [http://localhost:5173](http://localhost:5173).
If Vite chooses another port, include that origin in `ALLOWED_ORIGINS` and restart
the backend. The frontend defaults to `http://localhost:8000/api/v1`; set
`VITE_API_URL` in `frontend-build/.env` when using another API address.

API documentation: [http://localhost:8000/api/docs](http://localhost:8000/api/docs).

### 4. Open the Agent

Sign in, select an engagement, then open **Risk Assessment**. In Admin Settings,
check that the knowledge base is loaded and the provider key is configured.
Complete the seven-step workflow and have a firm manager, partner or administrator
approve the gate review.

| Seeded Role | Email | Initial Password |
| --- | --- | --- |
| Admin | admin@specentra.com | Admin@123 |
| Partner | partner@specentra.com | Partner@123 |

Change seeded passwords and application secrets before deployment. Assign client
logins to the engagements they should access.

## Project Layout

```text
backend/
  main.py                           FastAPI startup and database setup
  requirements-agent.txt            Native agent dependencies
  agent_bridge/worker.py            Isolated transport to the original engine
  agent_bridge/source-sha256.json    Original agent integrity manifest
  vendor/ams_ra/                    Unmodified supplied agent and knowledge base
  app/api/v1/endpoints/risk_agent.py Engagement-scoped agent API
  app/services/risk_agent.py        Draft storage, process calls and run handling
  tests/test_risk_agent.py          Agent integration and integrity tests
frontend-build/
  src/components/agents/           Native agent workspace and admin controls
  src/pages/EngagementDetailPage.jsx Client engagement tabs
docs/
  RISK_ASSESSMENT_INTEGRATION.md     Detailed integration and setup notes
```

## Verification

```powershell
# From frontend-build
npm.cmd run lint
npm.cmd run build

# From backend, using the backend virtual environment
.\.venv\Scripts\python.exe -m pip install httpx
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_risk_agent.py -v
```

The backend suite checks source integrity, calculation/parser parity, engagement
access, conflicting revisions, upload validation, locks, review edits and approved
working-paper/export persistence. Its engine test uses a substitute LLM and does
not call external providers. Desktop/mobile UI workflows have also been checked
with sample API responses. A live LLM run requires a valid configured provider key.

## Deployment and Current Boundaries

Build the frontend and serve `frontend-build/dist` with your web server. Run the
backend with persistent MySQL and filesystem storage. A backend Dockerfile is
included; configure environment variables/secrets and a persistent upload volume.
Local `.env` files, private imported configuration, test dependencies and uploaded
audit documents are excluded from source control and Docker build context.

The original agent's parsing rules, financial layout assumptions, units and
calculation behavior are intentionally preserved; see the integration notes.
The client request list currently sits within the authenticated app, reminder
actions are recorded rather than emailed, and typed signatures are not a certified
digital-signature service. Office editing requires a reachable editor server.
Retention configuration and archive export are available; automatic retention
enforcement and a compliance certification are not claimed by this repository.
