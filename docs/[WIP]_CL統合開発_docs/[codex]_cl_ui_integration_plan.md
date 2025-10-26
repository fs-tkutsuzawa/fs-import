# CL × UI Integration Implementation Plan

## 1. Context & Target Outcome

- Aligns with `docs/[codex]_cl_ui_integration_prompt.md`: deliver the minimal end-to-end loop where imported financial data flows through FAM and lands in the React DataGrid via the new `/api/v1/calculations` async workflow.
- Hard goal: `import_df` + rules + accounts → FAM compute → API V2 payload → UI grid render. All steps must execute on live code paths (no dummy shortcuts) while keeping diffs minimal and spec-compliant.

## 2. Guiding Principles

- **TDD Discipline:** Follow `docs/[principle]_TDD_constraints.v2.md` — baby steps, run tests frequently, keep all existing suites passing, prioritise extensible designs.
- **Golden Loop:** When blocked, pause and re-evaluate goal → failure surface → root cause → resume with scoped fix.
- **YAGNI & Minimal Diff:** Implement only what the integration needs now; negotiate any scope reductions before cutting corners.

## 3. Phased Workstreams & TDD Hooks

### Phase 0 — Preparation & Fixtures

1. Review latest docs (interface V2, recon report, DDL, integration analysis) and capture open questions in `docs/`.
2. Seed deterministic fixtures for:
   - `user_accounts` × `global_accounts` join covering `ga_code`, `ga_type`, `parent_ga_type`, `is_credit`.
   - `periods` with varied `display_order`, `period_type`, `period_val`.
   - `import_df` snapshots and `calculation_rules` (PARAMETER + BALANCE_AND_CHANGE).
3. TDD entrypoints:
   - Add Jest fixture loader utilities (server) with initial failing tests verifying fixture validity.

### Phase 1 — Calculation Contract & Job Skeleton

1. Define shared types for job payloads (request, status, result) in `server/src/model/calculation.ts`. Start with failing Jest test asserting schema shape.
2. Stub `/api/v1/calculations` POST/GET handlers returning mock data via Hono routes; tests ensure status codes (202/200/404) and JSON layout.
3. Implement in-memory job registry (Map) with lifecycle transitions; test concurrent job handling.

### Phase 2 — Data Acquisition Layer

1. Build repository functions in `server/api` (or `server/src/service`) to fetch:
   - `accountsMaster`: join with global metadata.
   - `periods`: sorted by `display_order`.
   - `import_df`: parse `df_json`.
   - `calculation_rules`: split into rule map + CFIs, resolve GAID→accountId.
2. Write failing Jest tests using Phase 0 fixtures verifying field coverage and GA resolution.

### Phase 3 — FAM Enhancements

1. Extend `FAM.importActuals` to accept actual fiscal year labels (derived from periods) and retain original account metadata (`ga_code`, `parent_ga_type`, etc.).
2. Update `FAM.getTable` output shape so `rows` echo enriched metadata and `columns` respect injected period labels.
3. Add targeted unit tests (existing suite + new cases) covering metadata retention and non-2000 start years.

### Phase 4 — Matrix → V2 Transformation

1. Create transformer in `server/src/service/unpivot.ts` that converts `{ rows, columns, data }` into the V2 `financialData` array.
2. TDD: start with failing tests using fixture matrices, check period joins, null GA handling, and ordering.
3. Integrate transformer into job execution path.

### Phase 5 — Orchestrator Wiring

1. Replace mock job execution with real pipeline:
   - Load data via repositories.
   - Instantiate FAM, import actuals, set rules, set BC, compute (projection years from request).
   - Transform results via Phase 4 helper.
   - Persist outcome in job registry (consider TTL placeholder).
2. Add integration-style Jest test (spins orchestrator with fixtures) to assert final payload matches V2 expectations.

### Phase 6 — UI Integration

1. Introduce calculation hook/module (`src/hooks/useFinancialCalculation.ts`): handles POST, polling status, fetching result; start with React Testing Library test using msw mocks verifying state transitions.
2. Update `GridPage.tsx` (and/or `FinancialStatementPreview.tsx`) to:
   - Trigger calculations via new hook.
   - Render loading/error states tied to job status.
   - Map V2 `financialData` into existing column/row builders; keep dummy fallback behind explicit guard.
3. Ensure UI tests cover: successful fetch populates grid, failure reverts to fallback, polling stops on completion.

### Phase 7 — Verification & Hardening

1. Run full test suite: `npm --prefix server test`, `npm test`, `npm run lint`. Add Playwright smoke (optional) once UI flow stabilises.
2. Review diffs (`git diff`, `git status`) to confirm minimal, intentional changes per TDD constraints.
3. Document known limitations and future enhancements back into `docs/` (e.g., external cache swap-in, advanced job telemetry).

## 4. Sequence & Dependencies

- Phases 0→7 execute sequentially; UI work (Phase 6) depends on server orchestration (Phases 1–5).
- Fixtures from Phase 0 support tests through Phases 2–5.
- Job skeleton (Phase 1) must be in place before plugging data pipeline (Phase 5).

## 5. Risk Mitigation & Decision Gates

- **Metadata Drift:** Verify enriched account/period fields via tests before UI integration to avoid cascading failures.
- **Async Loop Bugs:** Polling hook must have cancellation guards; monitor for infinite loops per golden rule checkpoint.
- **Scope Pressure:** If constraints force deferral (e.g., persistent job store), log TODO with owner and obtain approval before merging temporary shortcuts.

## 6. Exit Criteria Checklist

- [ ] Async calculation endpoints operate end-to-end with fixture data and real DB queries.
- [ ] FAM outputs include requisite metadata; transformer produces V2-compliant payload.
- [ ] UI renders live calculation results and handles job lifecycle gracefully.
- [ ] All tests + lint pass; new tests cover orchestrator, transformers, and UI polling.
- [ ] Documentation updated (prompt + plan + implementation notes) with any remaining caveats.
