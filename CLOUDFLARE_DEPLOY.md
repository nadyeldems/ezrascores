# Cloudflare Deployment Notes

## API proxy
This app now calls TheSportsDB through Cloudflare Pages Functions at:
- `/api/v1/*`
- `/api/v2/*`

The proxy file is:
- `functions/api/[version]/[[path]].js`

It adds edge caching with short TTL for live data and longer TTL for table/team metadata.

## Required environment variable
Set this in your Cloudflare project:
- `SPORTSDB_KEY=074910`

You can rotate the key later without changing client code.
