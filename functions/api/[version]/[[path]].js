function ttlForPath(path) {
  const p = path.toLowerCase();
  if (p.includes("livescore")) return 20;
  if (p.includes("eventsday") || p.includes("eventsnext") || p.includes("eventspast")) return 60;
  if (p.includes("lookuptable") || p.includes("lookup_all_teams") || p.includes("search_all_teams") || p.includes("lookupleague")) {
    return 300;
  }
  return 120;
}

function upstreamUrl(version, key, path) {
  if (version === "v1") {
    return `https://www.thesportsdb.com/api/v1/json/${key}/${path}`;
  }
  if (version === "v2") {
    return `https://www.thesportsdb.com/api/v2/json/${key}/${path}`;
  }
  return "";
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const requestUrl = new URL(request.url);

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const version = params.version;
  const rawPath = typeof params.path === "string" ? params.path : "";
  const path = rawPath.replace(/^\/+/, "");

  if (!version || !path) {
    return Response.json({ error: "Invalid API route" }, { status: 400 });
  }

  const key = env.SPORTSDB_KEY || "074910";
  const upstream = upstreamUrl(version, key, `${path}${requestUrl.search}`);
  if (!upstream) {
    return Response.json({ error: "Invalid API version" }, { status: 400 });
  }

  const cacheKey = new Request(request.url, request);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-Esra-Cache", "HIT");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstreamRes = await fetch(upstream, {
    headers: version === "v2" ? { "X-API-KEY": key } : undefined,
  });

  if (!upstreamRes.ok) {
    const body = await upstreamRes.text();
    return new Response(body || `Upstream error (${upstreamRes.status})`, {
      status: upstreamRes.status,
      headers: { "Content-Type": upstreamRes.headers.get("Content-Type") || "text/plain" },
    });
  }

  const ttl = ttlForPath(path);
  const headers = new Headers(upstreamRes.headers);
  headers.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl}`);
  headers.set("X-Esra-Cache", "MISS");

  const response = new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
