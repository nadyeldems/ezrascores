# EZRASCORES Release Process

## Objective
Ship reliable updates quickly with clear notes for users and a complete audit trail for teammates.

## Cadence Recommendation
- Product updates: deploy continuously as fixes/features are ready.
- User-facing release notes: publish daily if changes shipped that day, otherwise weekly summary.
- App Store listing description: update only when positioning/features materially change.
- App Store "What's New": update every release.

## Release Workflow
1. Build release scope
- Decide which changes are user-facing.
- Tag each item as `Added`, `Improved`, or `Fixed`.

2. QA gate
- Validate top flows:
  - app load
  - fixtures/tables
  - favourite team switch
  - account login/reset
  - mini-league
  - pop quiz/dream team
- Validate on mobile and desktop.

3. Update release docs
- Update `/docs/release/CHANGELOG.md` under `Unreleased`.
- On ship, move `Unreleased` into date-stamped section.

4. Update store content
- Update App Store "What's New" using max 4-6 bullets.
- If feature positioning changed, update `/docs/product/APP_STORE_LISTING.md`.

5. Deploy
- Push to `main`.
- Confirm Cloudflare Pages deployment and function health.

6. Post-release checks
- Confirm no spike in 5xx errors.
- Check account route success rate.
- Check fixtures/tables endpoint latency and error rate.

## Daily Summary Pattern (recommended)
Use this when changes were shipped in the day:

- Today in EZRASCORES
  - Added:
  - Improved:
  - Fixed:
  - Known issue (if any):

## Release Severity Labels (Internal)
- `P0`: broken core journeys (login, fixtures, tables, team select)
- `P1`: degraded but usable
- `P2`: visual/copy polish

## Definition of Done
A release is done only when:
- Changelog updated
- Store release notes drafted
- Deploy confirmed healthy
- No untriaged P0/P1 regressions
