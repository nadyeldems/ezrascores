function isAllowedImageHost(hostname) {
  const host = (hostname || "").toLowerCase();
  return (
    host === "www.thesportsdb.com" ||
    host === "thesportsdb.com" ||
    host.endsWith(".thesportsdb.com")
  );
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const reqUrl = new URL(request.url);
  const rawTarget = reqUrl.searchParams.get("url") || "";
  if (!rawTarget) {
    return Response.json({ error: "Missing image url" }, { status: 400 });
  }

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return Response.json({ error: "Invalid image url" }, { status: 400 });
  }

  if (!["https:", "http:"].includes(target.protocol)) {
    return Response.json({ error: "Unsupported protocol" }, { status: 400 });
  }
  if (!isAllowedImageHost(target.hostname)) {
    return Response.json({ error: "Host not allowed" }, { status: 403 });
  }

  const cacheKey = new Request(reqUrl.toString(), request);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-EZRA-Cache", "HIT");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstream = await fetch(target.toString());
  if (!upstream.ok) {
    return new Response(`Upstream image error (${upstream.status})`, { status: upstream.status });
  }

  const contentType = upstream.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return new Response("Unsupported content type", { status: 415 });
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  headers.set("X-EZRA-Cache", "MISS");

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers,
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
