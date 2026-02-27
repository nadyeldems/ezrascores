# EZRASCORES Project Handover

## Product Summary
EZRASCORES is a football scores and engagement app focused on Premier League + Championship coverage, favourite-team tracking, mini-leagues, predictions, quests, and kid-friendly interaction.

## Tech Summary
- Frontend: static app (`/index.html`, `/app.js`, `/styles.css`)
- API layer: Cloudflare Pages Functions (`/functions/api/[[route]].js`)
- Data storage: Cloudflare D1 (`EZRA_DB` binding)
- Cron workers:
  - `cron/worker.js` (account/prediction settle cron)
  - `cron` worker deployment via Wrangler
  - `ezrascores-table-cron` (table cache refresh)

## Required Cloudflare Config
Pages project:
- `SPORTSDB_KEY`
- `EZRA_DB` D1 binding
- `EZRA_CRON_SECRET`

Optional auth email:
- `RESEND_API_KEY`
- `EZRA_FROM_EMAIL`
- `EZRA_DEV_AUTH_CODE` (dev only)

Cron workers:
- set `EZRA_CRON_SECRET`
- set `PAGES_BASE_URL` where required
- configure schedule in Worker settings

## Critical User Flows
1. Load app and fetch fixtures/tables
2. Select favourite team and render match centre
3. Sign up / sign in / reset PIN
4. Join/create/share mini-league and submit predictions
5. Complete quests and update points

## Operational Runbook
1. If login fails
- Check account route errors in Pages Functions logs.
- Verify D1 binding and migrations.

2. If fixtures/tables fail
- Check `/api/v1/ezra/fixtures` and `/api/v1/ezra/tables` responses.
- Check TheSportsDB rate limits and fallback behavior.
- Check table cron worker status.

3. If points do not settle
- Check cron settle worker logs.
- Verify `EZRA_CRON_SECRET` matches between caller and API.

## Documentation Map
- Deploy notes: `/CLOUDFLARE_DEPLOY.md`
- App store listing source: `/docs/product/APP_STORE_LISTING.md`
- Changelog: `/docs/release/CHANGELOG.md`
- Release process: `/docs/release/RELEASE_PROCESS.md`

## Handover Checklist
- [ ] Cloudflare env vars verified in production
- [ ] D1 binding present and healthy
- [ ] Cron workers active and succeeding
- [ ] Changelog current
- [ ] App store notes drafted for latest release
- [ ] Known issues list updated
