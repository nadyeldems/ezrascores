#!/usr/bin/env node
// Smoke test a deployed site (production or a Pages preview):
//   npm run smoke                       -> https://ezrascores.pages.dev
//   npm run smoke -- https://<hash>.ezrascores.pages.dev
// Read-only: it only makes GET requests.

const base = (process.argv[2] || "https://ezrascores.pages.dev").replace(/\/+$/, "");
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const LIVE = /\b(1h|2h|ht|live|in play)\b/i;
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name} — ${err.message}`);
  }
}

async function get(path, type = "json") {
  const res = await fetch(`${base}${path}`, { headers: { "User-Agent": "ezrascores-smoke/1.0" } });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return type === "json" ? res.json() : res.text();
}

await check("home page loads the app", async () => {
  const html = await get("/", "text");
  const v = html.match(/app\.js\?v=([\w-]+)/)?.[1];
  if (!v) throw new Error("no app.js script tag");
  return `build ${v}`;
});
await check("service worker is served", async () => {
  const js = await get("/sw.js", "text");
  if (!js.includes("SW_VERSION")) throw new Error("unexpected sw.js");
});
for (const [id, name, size] of [["4328", "Premier League", 20], ["4329", "Championship", 24], ["4335", "La Liga", 20]]) {
  await check(`${name} table`, async () => {
    const data = await get(`/api/v1/ezra/tables?l=${id}`);
    const rows = data.table || [];
    if (rows.length !== size) throw new Error(`expected ${size} rows, got ${rows.length}`);
    return `${rows[0].strTeam} top on ${rows[0].intPoints} pts`;
  });
  await check(`${name} fixtures today`, async () => {
    const data = await get(`/api/v1/ezra/fixtures?l=${id}&d=${iso(0)}`);
    if (!Array.isArray(data.events)) throw new Error("no events array");
    return `${data.events.length} matches`;
  });
  await check(`${name} has no stuck live matches yesterday`, async () => {
    const data = await get(`/api/v1/ezra/fixtures?l=${id}&d=${iso(-1)}`);
    const stuck = (data.events || []).filter((e) => LIVE.test(`${e.strStatus || ""} ${e.strProgress || ""}`));
    if (stuck.length) throw new Error(stuck.map((e) => `${e.strHomeTeam} v ${e.strAwayTeam} (${e.strStatus})`).join(", "));
  });
}
await check("World Cup hidden between tournaments", async () => {
  const data = await get("/api/v1/ezra/league-visibility");
  if (data.visibility?.WC !== false) throw new Error(JSON.stringify(data.visibility));
});
await check("match alerts config", async () => {
  const data = await get("/api/v1/ezra/push/config");
  return data.enabled ? "enabled" : "not configured (VAPID keys missing)";
});

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
