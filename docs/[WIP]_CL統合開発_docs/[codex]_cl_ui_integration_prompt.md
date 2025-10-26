# CL × UI Integration Prompt

## Overview

- Purpose: Equip the coding agent with a precise, review-ready brief to connect the React UI, Hono API, and FAM core so that imported data drives forecast calculations rendered in the grid.
- Source: Derived from the CLI analysis on UI/API/CL gaps, interface V2 requirements, and DDL 1014 schema updates.
- Scope: Focus on the minimum end-to-end path where import_df → FAM → API → DataGrid works, while keeping room to extend per reference specs.

## Prompt Template

```text
[Context]
- UI (`GridPage.tsx`) still renders `generateDummyFinancialData`, so no server-calculated results surface yet.
- API (Hono) currently exposes CRUD for accounts/imports/rules but lacks `/api/v1/calculations` async endpoints or any FAM invocation.
- Core logic (`FAM.importActuals`/`getTable`) keeps reduced `Account` metadata and assumes FY starts at 2000, preventing DDL v1014 attributes (`ga_code`, `ga_type`, `periods.display_order`, etc.) from reaching the UI.
- Latest docs (`docs/[codex]_interface_specification_V2.md`, `docs/[codex]_[report]_cl_ui_integration_recon.md`, `docs/[最新版]_DDL_1014.sql`) mandate unpivoting FAM matrices into the V2 JSON schema and delivering results via POST/Status/Result async workflow.

[Goal]
1. Minimal best case: data imported into `import_df` (plus accounts/rules) feeds the FAM engine, produces forecast tables, and the React DataGrid renders those results.
2. Deliver the `/api/v1/calculations` trio (POST create job, GET status, GET result) wired to FAM with V2-compliant transformation.
3. Update the UI to trigger calculations, poll job status, and replace dummy grid data with live payloads (retaining fallback only when API is unreachable).

[Constraints]
- Favor the shortest, highest-confidence path; keep diffs minimal and justify any scope tradeoffs.
- Stay faithful to reference specs—obtain approval before pruning requirements for expediency.
- Preserve existing CRUD flows (accounts, rules, imports); integrate rather than rewrite.
- Work within React 18 + TS 4.9 front end, Node 20 + TS 5.x + Hono backend, PostgreSQL via `pg`, and the Jest + Testing Library + Playwright toolchain.

[Principles & Golden Rules]
- TDD Discipline (t_wada / Kent Beck): Red → Green → Refactor. Never extend the loop without a failing test in sight. If stuck, step back to tests and re-derive the expectation from requirements.
- Golden Rule: When progress stalls, pause and perform **(a)** goal re-evaluation, **(b)** failure surface breakdown (UI/API/CL/DB), **(c)** root-cause hypothesis, then resume with a scoped fix.
- Explicitly log checkpoints after each major milestone (API stub, FAM bridge, UI wiring) before proceeding.

[Workflow]
0. Review reference stack: interface spec V2, recon report, DDL 1014, and relevant code modules (`server/src/fam/fam.ts`, `server/api/*`, `src/pages/GridPage.tsx`, hooks).
1. Design the calculation orchestrator contract (types, payload) and stub endpoints returning mock data for fast UI integration.
2. Build server-side data loaders: join `user_accounts` ↔ `global_accounts`, fetch `import_df`, `calculation_rules`, `periods`, resolve GAID → accountId, and feed FAM.
3. Extend FAM/table helpers so `getTable` exposes imported metadata and handles actual period labels.
4. Implement unpivot + V2 packaging, persist job results (in-memory or DB/Redis placeholder per spec), and wire async job lifecycle.
5. Update UI hooks/pages to launch calculations, poll status, hydrate the DataGrid from V2 payload, and retain dummy fallback guarded by feature flag or API health.
6. Run targeted tests and linting; capture fixtures that cover GA metadata and period ordering.

[Checklist]
- ☐ API endpoints: POST `/api/v1/calculations`, GET `/api/v1/calculations/status/:jobId`, GET `/api/v1/calculations/results/:jobId`.
- ☐ Transformation helpers: DB → FAM inputs, FAM matrix → V2 `financialData` records.
- ☐ FAM enhancements: account metadata retention, period label handling, configurable start year.
- ☐ UI changes: trigger button, polling hook/state, grid renderer consuming V2 dataset, graceful fallback + loading/error states.
- ☐ Tests: unit (transformers, FAM changes), integration (calculation flow), UI (polling/render), plus lint + format checks.
- ☐ Documentation: update inline comments or docs describing the async flow and data contracts.

[Verification]
- Run `npm --prefix server test`, `npm test`, `npm run lint`, and targeted Playwright scenario if feasible.
- Verify with sample fixtures that `import_df` values propagate to the DataGrid with correct `periods.display_order` sorting and GA metadata.
- Ensure fallbacks engage only when the calculation API is unavailable, and UI status messaging matches job states.

[Reference Stack]
- docs/[codex]_interface_specification_V2.md
- docs/[codex]_[report]_cl_ui_integration_recon.md
- docs/[最新版]_DDL_1014.sql
- server/doc_dev_log/integration_analysis_report_20251009.md
- server/src/fam/fam.ts, server/src/model/types.ts, server/src/index.ts
- src/pages/GridPage.tsx, src/pages/FinancialStatementPreview.tsx, src/hooks/useFinancialAccounts.ts, src/hooks/useUserAccounts.ts

[Exit Criteria]
- Successful API response delivers V2 payload derived from FAM calculations based on live DB data.
- React DataGrid displays those values without relying on `generateDummyFinancialData`.
- All required checks/tests pass, and no regression is observed in existing CRUD features.
```
