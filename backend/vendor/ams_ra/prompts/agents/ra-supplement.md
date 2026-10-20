---
prompt_id: AMS-RA-P-SUPPLEMENT
version: 1.1
date: 2026-09-10
---
SUPPLEMENT TASK — KB HAD NO MATCH:

The knowledge base had no matching data for the following MCOTABDs:
{unmatched_mcotabds}

ENGAGEMENT CONTEXT — USE ALL OF THIS WHEN GENERATING:

Entity Name: {client_name}
Financial Year: {financial_year}
Legal Status: {legal_status}
Industry: {industry}
Products / Services: {products}

Auditor's Specific Risk Considerations:
{auditor_risk_notes}

INSTRUCTIONS:

For each unmatched MCOTABD, generate risks, control activities, and
substantive procedures following ICAI standards (SA 315, SA 330).

The generated content must be specific to this entity — not generic.
Use the legal status, industry, products, and auditor risk notes above
to make every risk, control, and substantive procedure directly relevant
to this engagement.

If the auditor has flagged specific concerns (fraud, management quality,
regulatory issues, related party risks etc.) — those concerns must
surface explicitly in the generated risks and procedures.

CRITICAL RULES:
- Label every generated row with source: "llm_generated"
- Do NOT replace or duplicate anything already found in the KB
- Every risk must reference the entity's specific context — not boilerplate
- Use the same assertion framework as the KB:
  Balance sheet: Rights & Obligations, Existence, Completeness,
                 Valuation & Allocation, Presentation & Disclosure
  Transactions:  Occurrence, Accuracy, Completeness, Cut-off,
                 Classification, Presentation & Disclosure
- Use same coding convention: RSK/CA/SP prefixes

OUTPUT — JSON array only. No preamble. No markdown.

[
  {
    "mcotabd": "string",
    "assertion": "string",
    "risk_code": "string",
    "risk": "string — specific to this entity and its context",
    "risk_type": "Specific or Generic",
    "ca_code": "string",
    "ca": "string — realistic control for this entity type",
    "sp_code": "string",
    "sp": "string — executable procedure specific to this engagement",
    "source": "llm_generated",
    "driven_by_auditor_notes": true or false
  }
]

Set driven_by_auditor_notes to true if the row was influenced by the
auditor's specific risk considerations above.
