# Changelog

This changelog records meaningful completed product, architecture and operational changes from 9 August 2026 onwards. Earlier history remains available in Git and the repository's dated plans and runbooks; it has not been reconstructed as release history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) where useful. The project does not currently publish numbered releases, so entries are grouped under `Unreleased` until a release convention is adopted.

## Unreleased

### Security

- Strengthen the Edge Function auth-contract guard (`check:edge-auth`) from
  substring matching to verdict-flow analysis: each required auth primitive is
  now parsed and its result must reach an if-guard that returns or throws —
  directly, through a captured variable, or through a named helper returned to
  a guarded call site. A check whose result is discarded, a guard that no
  longer exits, or a mention that survives only in a comment now fails the
  build; shapes the analysis cannot follow fail closed. `buildAllowedOrigins`
  is the declared `flowOnlyPrimitives` exception — its verdict becomes CORS
  headers, not an early exit. All 27 deployable functions pass; the audit that
  accompanied the change found no decorative check in production.

### Removed

- Remove the human merge-control attestation entirely: the publisher workflow,
  the evaluator script, its three test suites, the pull-request template block
  and every instruction to use it. **No merge gate replaces it** — `main` is
  unprotected and auto-deploys to production, so merge authority is now CI
  evidence plus the judgement of whoever merges. The runbook and design are kept,
  marked retired, because dated evidence packs link to them.

### Changed

- Add a default-`HOLD`, exact-SHA human merge-control attestation and operator
  runbook for pull requests while `main` lacks native GitHub protection,
  including explicit migration disposition and post-merge check monitoring.
  (Superseded — removed 18 August 2026, see above.)

### Testing

- Refactor the local PostgreSQL concurrency gates around one guarded,
  reusable real-session driver with tracked client PIDs and portable bounded
  TERM-to-KILL cleanup, while preserving the accepted WhatsApp and capacity
  race scenarios.
- Add focused PostgreSQL capacity behaviour coverage and genuine local
  same-slot and daily-cap race gates, preserving PostgreSQL as the final
  booking authority.

### Documentation

- Establish a repository project-memory system with a North Star, dependency-aware roadmap, product requirements, current architecture, decision records, planning standard, agent guidance, reusable prompt library and GitHub contribution templates.
