const DEFAULT_LEAGUES = ["4328", "4329"];

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeBase(url) {
  const fallback = "https://ezrascores.pages.dev";
  const raw = String(url || fallback).trim();
  return raw.replace(/\/+$/, "");
}

async function warmTables(env) {
  const baseUrl = normalizeBase(env.PAGES_BASE_URL);
  const leagues = splitCsv(env.TABLE_LEAGUES).length ? splitCsv(env.TABLE_LEAGUES) : DEFAULT_LEAGUES;
  const timeoutMs = Number(env.TABLE_WARM_TIMEOUT_MS || 15000);

  const results = await Promise.all(
    leagues.map(async (leagueId) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
      const url = `${baseUrl}/api/v1/ezra/tables?l=${encodeURIComponent(leagueId)}`;
      try {
        const res = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: { "User-Agent": "ezrascores-table-cron/1.0" },
        });
        const cache = res.headers.get("X-EZRA-Cache") || "";
        const live = res.headers.get("X-EZRA-Tables-Live") || "";
        const refreshMs = res.headers.get("X-EZRA-Tables-Refresh-Ms") || "";
        return {
          ok: res.ok,
          status: res.status,
          leagueId,
          cache,
          live,
          refreshMs,
          url,
        };
      } catch (err) {
        return {
          ok: false,
          status: 0,
          leagueId,
          error: String(err?.message || err),
          url,
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return {
    ok: results.every((r) => r.ok),
    at: new Date().toISOString(),
    baseUrl,
    results,
  };
}

async function runProtectedCron(env, path) {
  const baseUrl = normalizeBase(env.PAGES_BASE_URL);
  const timeoutMs = Number(env.TABLE_WARM_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "User-Agent": "ezrascores-table-cron/1.0",
        "x-ezra-cron-secret": String(env.EZRA_CRON_SECRET || ""),
      },
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url,
      body: body.slice(0, 400),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      error: String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runJobs(env) {
  const [tables, fixtures, settle] = await Promise.all([
    warmTables(env),
    runProtectedCron(env, "/api/v1/ezra/account/cron/fixtures"),
    runProtectedCron(env, "/api/v1/ezra/account/cron/settle"),
  ]);
  return {
    ok: Boolean(tables.ok && fixtures.ok && settle.ok),
    at: new Date().toISOString(),
    tables,
    fixtures,
    settle,
  };
}

export default {
  async scheduled(event, env, ctx) {
    const payload = await runJobs(env);
    console.log(JSON.stringify({ source: "scheduled", cron: event.cron, ...payload }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    const payload = await runJobs(env);
    return new Response(JSON.stringify(payload, null, 2), {
      status: payload.ok ? 200 : 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  },
};
