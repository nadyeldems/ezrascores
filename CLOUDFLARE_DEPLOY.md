# Cloudflare Deployment Notes

## API proxy
This app now calls TheSportsDB through Cloudflare Pages Functions at:
- `/api/v1/*`
- `/api/v2/*`

The proxy file is:
- `functions/api/[[route]].js`

It adds edge caching with short TTL for live data and longer TTL for table/team metadata.

## Required environment variable
Set this in your Cloudflare project:
- `SPORTSDB_KEY=074910`

You can rotate the key later without changing client code.

## Server-side table scheduler (Cron Worker)
Tables are now served from `/api/v1/ezra/tables?l=...` and refreshed server-side:
- every 1 minute when live games are detected
- every 15 minutes when no live games are detected

To keep this warm even when nobody is visiting the site, deploy the cron worker in `cron/`.

### 1) First-time login (local)
```bash
npx wrangler login
```

### 2) Deploy cron worker
```bash
cd cron
npx wrangler deploy
```

### 3) Optional: set production URL if you use a custom domain
```bash
npx wrangler secret put PAGES_BASE_URL
```
Enter something like:
`https://ezrascores.pages.dev`
or your custom production URL.

### 4) Verify cron trigger
```bash
npx wrangler triggers list
```

### 5) Manual test
```bash
curl https://ezrascores-table-cron.<your-subdomain>.workers.dev
```
You should see JSON with `results` for league `4328` and `4329`.
