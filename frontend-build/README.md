# Specentra AMS Frontend

React 19 and Vite 8 UI for the CA-Firm audit workspace, including the integrated
**Agentic Risk Assessment** workflow for firm users and assigned client logins.

## Agent Workspace

Select an engagement and open **Risk Assessment Agent**. The seven steps cover engagement
context, financial uploads, materiality, thresholds, MCOTABD confirmation, the risk
engine and editable CA gate review. Approved RCMs are written to Section 2000 and
can be exported as JSON. The admin **AI Agent Configuration** page manages the
provider, model, endpoint, encrypted API key, timeout and knowledge base.

The frontend replaces Streamlit widgets while the original Python agent remains
unchanged. See the [main project README](../README.md) and
[agent integration notes](../docs/RISK_ASSESSMENT_INTEGRATION.md).

## Development

Use Node.js 20.19+ or 22.12+. From this directory:

```powershell
npm.cmd ci
npm.cmd run dev
```

The API defaults to `http://localhost:8000/api/v1`. Set `VITE_API_URL` in a local
`.env` file to change it. The backend must allow the Vite origin in
`ALLOWED_ORIGINS`. Configure LLM credentials on the backend, never in frontend
environment variables.

## Checks and Build

```powershell
npm.cmd run lint
npm.cmd run build
```

Production output is generated in `dist/`. The UI includes persistent light/dark
mode, the Specentra purple/lavender palette and responsive navigation.
