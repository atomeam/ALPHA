# Alpha — self-improving loop spec

**Phase 0 placeholder.** The canonical spec is in `atomeam/HomeBase-/ALPHA.md` and will be ported here verbatim during Phase 1 (backend cutover).

## TL;DR until then

Observer → Evaluator → Proposer → **Curator (default-deny)** → Applier → Reflector.

- **Curator** enforces 5 base conditions plus cooldown and idempotency: `do-not-repeat`, `citations resolve`, `rollback concrete`, `expected_effect measurable`, `risk gate`.
- **Applier** ships 9 hardening rules: blast-radius cap, cooldown window, canary-first, auto-revert, halt-backoff, quarantine, two-key, idempotency, shadow apply.
- Loop SLAs: Observer 24h, Evaluator immediate, Proposer→Curator sync, Applier on approval, Reflector within 1h.

## Curator denial codes (preview)

`CUR_DO_NOT_REPEAT`, `CUR_BAD_CITATION`, `CUR_NO_ROLLBACK`, `CUR_UNMEASURABLE`, `CUR_NEEDS_OPERATOR`, `CUR_COOLDOWN`, `CUR_NOT_IDEMPOTENT`, `CUR_LOOP_CAP`, `CUR_SHADOW_DRIFT` — plus `CUR_KIND_DISABLED`, `CUR_HIGH_RISK_LOCKED` ported from the PowerShell bridge's policy table.

## Applier halt codes (preview)

`APP_BLAST_CAP`, `APP_CANARY_FAIL`, `APP_AUTOREVERT`, `APP_QUARANTINE`, `APPLY_HALT_DIFF_DRIFT`, `APPLY_HALT_SNAPSHOT_FAIL`.

Full spec moves here in Phase 1 along with the TS implementation under `packages/alpha-core`.
