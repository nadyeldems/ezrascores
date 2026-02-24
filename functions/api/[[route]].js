function ttlForPath(path) {
  const p = path.toLowerCase();
  if (p.includes("livescore")) return 15;
  if (p.includes("eventsday") || p.includes("eventsnext") || p.includes("eventspast")) return 60;
  if (p.includes("lookuptable") || p.includes("lookup_all_teams") || p.includes("search_all_teams") || p.includes("lookupleague")) {
    return 300;
  }
  return 120;
}

function upstreamUrl(version, key, pathWithQuery) {
  if (version === "v1") {
    return `https://www.thesportsdb.com/api/v1/json/${key}/${pathWithQuery}`;
  }
  if (version === "v2") {
    return `https://www.thesportsdb.com/api/v2/json/${key}/${pathWithQuery}`;
  }
  return "";
}

const TABLE_LEAGUE_IDS = ["4328", "4329"];
const TABLE_REFRESH_LIVE_MS = 60 * 1000;
const TABLE_REFRESH_IDLE_MS = 15 * 60 * 1000;

function tableDataCacheKey(origin, leagueId) {
  return new Request(`${origin}/api/internal/tables/${leagueId}`);
}

function tableMetaCacheKey(origin) {
  return new Request(`${origin}/api/internal/tables/_meta`);
}

async function fetchSportsDb(version, key, pathWithQuery) {
  const upstream = upstreamUrl(version, key, pathWithQuery);
  if (!upstream) throw new Error("Invalid API version");
  const upstreamRes = await fetch(upstream, {
    headers: version === "v2" ? { "X-API-KEY": key } : undefined,
  });
  if (!upstreamRes.ok) {
    const body = await upstreamRes.text();
    throw new Error(body || `Upstream error (${upstreamRes.status})`);
  }
  return upstreamRes.json();
}

function firstArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

async function hasLiveGamesNow(key) {
  for (const leagueId of TABLE_LEAGUE_IDS) {
    try {
      const data = await fetchSportsDb("v2", key, `livescore/${leagueId}`);
      const events = firstArray(data);
      if (events.length) return true;
    } catch {
      // Ignore and continue with next endpoint/league.
    }
  }
  return false;
}

async function readTableMeta(cache, origin) {
  const cached = await cache.match(tableMetaCacheKey(origin));
  if (!cached) return null;
  try {
    return await cached.json();
  } catch {
    return null;
  }
}

async function refreshTablesServerSide(cache, origin, key) {
  const liveNow = await hasLiveGamesNow(key);
  const refreshEveryMs = liveNow ? TABLE_REFRESH_LIVE_MS : TABLE_REFRESH_IDLE_MS;
  const now = Date.now();

  const results = await Promise.all(
    TABLE_LEAGUE_IDS.map(async (leagueId) => {
      const payload = await fetchSportsDb("v1", key, `lookuptable.php?l=${leagueId}`);
      const response = new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=30, s-maxage=30",
          "X-EZRA-Cache": "MISS",
          "X-EZRA-Tables-Source": "SERVER",
          "X-EZRA-Tables-Live": liveNow ? "1" : "0",
          "X-EZRA-Tables-Refresh-Ms": String(refreshEveryMs),
          "X-EZRA-Tables-Updated-At": new Date(now).toISOString(),
        },
      });
      await cache.put(tableDataCacheKey(origin, leagueId), response.clone());
      return [leagueId, response];
    })
  );

  const tables = new Map(results);
  const meta = {
    updatedAt: now,
    nextRefreshAt: now + refreshEveryMs,
    refreshEveryMs,
    liveNow,
  };
  await cache.put(
    tableMetaCacheKey(origin),
    new Response(JSON.stringify(meta), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    })
  );
  return { tables, meta };
}

async function handleEzraTablesRoute(context, key) {
  const { request } = context;
  const cache = caches.default;
  const url = new URL(request.url);
  const leagueId = (url.searchParams.get("l") || "").trim();
  if (!TABLE_LEAGUE_IDS.includes(leagueId)) {
    return Response.json({ error: "Invalid or missing league id" }, { status: 400 });
  }

  const origin = `${url.protocol}//${url.host}`;
  const dataKey = tableDataCacheKey(origin, leagueId);
  const [cachedData, meta] = await Promise.all([cache.match(dataKey), readTableMeta(cache, origin)]);
  const now = Date.now();

  if (cachedData && meta && now < Number(meta.nextRefreshAt || 0)) {
    const headers = new Headers(cachedData.headers);
    headers.set("X-EZRA-Cache", "HIT");
    headers.set("X-EZRA-Tables-Source", "SERVER");
    headers.set("X-EZRA-Tables-Live", meta.liveNow ? "1" : "0");
    headers.set("X-EZRA-Tables-Refresh-Ms", String(meta.refreshEveryMs || TABLE_REFRESH_IDLE_MS));
    headers.set("X-EZRA-Tables-Updated-At", new Date(meta.updatedAt || now).toISOString());
    return new Response(cachedData.body, { status: cachedData.status, headers });
  }

  try {
    const refreshed = await refreshTablesServerSide(cache, origin, key);
    const nextResponse = refreshed.tables.get(leagueId);
    if (!nextResponse) {
      return Response.json({ error: "Unable to resolve table response" }, { status: 500 });
    }
    return nextResponse;
  } catch (err) {
    if (cachedData) {
      const headers = new Headers(cachedData.headers);
      headers.set("X-EZRA-Cache", "STALE");
      headers.set("X-EZRA-Tables-Source", "SERVER");
      return new Response(cachedData.body, { status: cachedData.status, headers });
    }
    return Response.json({ error: "Unable to refresh table data", detail: String(err?.message || err) }, { status: 502 });
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Expecting: /api/{version}/{...path}
  const parts = url.pathname.replace(/^\/+/, "").split("/");
  if (parts.length < 3 || parts[0] !== "api") {
    return Response.json({ error: "Invalid API route" }, { status: 400 });
  }

  const version = parts[1];
  const upstreamPath = parts.slice(2).join("/");
  if (!upstreamPath) {
    return Response.json({ error: "Missing upstream path" }, { status: 400 });
  }

  const key = env.SPORTSDB_KEY || "074910";

  if (version === "v1" && upstreamPath.toLowerCase() === "ezra/tables") {
    return handleEzraTablesRoute(context, key);
  }

  const upstream = upstreamUrl(version, key, `${upstreamPath}${url.search}`);
  if (!upstream) {
    return Response.json({ error: "Invalid API version" }, { status: 400 });
  }

  const cacheKey = new Request(request.url, request);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-EZRA-Cache", "HIT");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstreamRes = await fetch(upstream, {
    headers: version === "v2" ? { "X-API-KEY": key } : undefined,
  });

  if (!upstreamRes.ok) {
    const body = await upstreamRes.text();
    return new Response(body || `Upstream error (${upstreamRes.status})`, {
      status: upstreamRes.status,
      headers: {
        "Content-Type": upstreamRes.headers.get("Content-Type") || "text/plain",
      },
    });
  }

  const ttl = ttlForPath(upstreamPath);
  const headers = new Headers(upstreamRes.headers);
  headers.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl}`);
  headers.set("X-EZRA-Cache", "MISS");

  const response = new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
