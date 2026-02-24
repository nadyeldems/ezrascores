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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function validateCredentials(name, pin) {
  const cleanName = normalizeName(name);
  const cleanPin = String(pin || "").trim();
  if (cleanName.length < 2 || cleanName.length > 32) {
    return { ok: false, message: "Name must be 2-32 characters." };
  }
  if (cleanPin.length < 4 || cleanPin.length > 24) {
    return { ok: false, message: "PIN must be 4-24 characters." };
  }
  return { ok: true, cleanName, cleanPin };
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

const ACCOUNT_SESSION_MS = 1000 * 60 * 60 * 24 * 30;

let accountSchemaReady = false;
async function ensureAccountSchema(db) {
  if (accountSchemaReady) return;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ezra_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ezra_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES ezra_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ezra_sessions_user_id ON ezra_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ezra_sessions_expires_at ON ezra_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS ezra_profile_states (
      user_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES ezra_users(id)
    );
  `);
  accountSchemaReady = true;
}

async function createSession(db, userId) {
  const token = randomHex(24);
  const now = Date.now();
  const expiresAt = now + ACCOUNT_SESSION_MS;
  await db
    .prepare("INSERT INTO ezra_sessions (token, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(token, userId, new Date(now).toISOString(), expiresAt)
    .run();
  return token;
}

async function getSessionWithUser(db, token) {
  if (!token) return null;
  const row = await db
    .prepare(`
      SELECT s.token, s.expires_at, u.id AS user_id, u.name
      FROM ezra_sessions s
      JOIN ezra_users u ON u.id = s.user_id
      WHERE s.token = ?1
      LIMIT 1
    `)
    .bind(token)
    .first();
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    await db.prepare("DELETE FROM ezra_sessions WHERE token = ?1").bind(token).run();
    return null;
  }
  return row;
}

async function accountAuth(db, request) {
  const token = getBearerToken(request);
  const session = await getSessionWithUser(db, token);
  return { token, session };
}

async function handleAccountRegister(db, request) {
  const body = await parseJson(request);
  const valid = validateCredentials(body?.name, body?.pin);
  if (!valid.ok) return json({ error: valid.message }, 400);

  const nameKey = valid.cleanName.toLowerCase();
  const existing = await db.prepare("SELECT id FROM ezra_users WHERE name_key = ?1 LIMIT 1").bind(nameKey).first();
  if (existing) return json({ error: "Name already exists. Please choose another." }, 409);

  const userId = randomHex(12);
  const salt = randomHex(10);
  const pinHash = await sha256Hex(`${salt}:${valid.cleanPin}`);
  const nowIso = new Date().toISOString();

  try {
    await db
      .prepare(`
        INSERT INTO ezra_users (id, name, name_key, pin_salt, pin_hash, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `)
      .bind(userId, valid.cleanName, nameKey, salt, pinHash, nowIso, nowIso)
      .run();
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("unique")) {
      return json({ error: "Name already exists. Please choose another." }, 409);
    }
    throw err;
  }

  await db
    .prepare("INSERT OR REPLACE INTO ezra_profile_states (user_id, state_json, updated_at) VALUES (?1, ?2, ?3)")
    .bind(userId, "{}", nowIso)
    .run();

  const token = await createSession(db, userId);
  return json({ token, user: { id: userId, name: valid.cleanName } }, 200);
}

async function handleAccountLogin(db, request) {
  const body = await parseJson(request);
  const valid = validateCredentials(body?.name, body?.pin);
  if (!valid.ok) return json({ error: "Invalid login details." }, 400);

  const nameKey = valid.cleanName.toLowerCase();
  const row = await db
    .prepare("SELECT id, name, pin_salt, pin_hash FROM ezra_users WHERE name_key = ?1 LIMIT 1")
    .bind(nameKey)
    .first();
  if (!row) return json({ error: "Account not found." }, 404);

  const checkHash = await sha256Hex(`${row.pin_salt}:${valid.cleanPin}`);
  if (checkHash !== row.pin_hash) return json({ error: "Invalid PIN." }, 401);

  const token = await createSession(db, row.id);
  return json({ token, user: { id: row.id, name: row.name } }, 200);
}

async function handleAccountMe(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  return json({ user: { id: session.user_id, name: session.name } }, 200);
}

async function handleAccountLogout(db, request) {
  const token = getBearerToken(request);
  if (token) {
    await db.prepare("DELETE FROM ezra_sessions WHERE token = ?1").bind(token).run();
  }
  return json({ ok: true }, 200);
}

function sanitizeStateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const next = {
    favoriteTeamId: String(input.favoriteTeamId || ""),
    uiTheme: input.uiTheme === "club" ? "club" : "classic",
    motionLevel: ["minimal", "standard", "arcade"].includes(input.motionLevel) ? input.motionLevel : "standard",
    playerPopEnabled: Boolean(input.playerPopEnabled),
    playerPopScope: input.playerPopScope === "favorite" ? "favorite" : "any",
    dreamTeam: input.dreamTeam && typeof input.dreamTeam === "object" ? input.dreamTeam : null,
    playerQuiz: input.playerQuiz && typeof input.playerQuiz === "object" ? input.playerQuiz : null,
    missions: input.missions && typeof input.missions === "object" ? input.missions : null,
    storyCards: input.storyCards && typeof input.storyCards === "object" ? input.storyCards : null,
    familyLeague: input.familyLeague && typeof input.familyLeague === "object" ? input.familyLeague : null,
    updatedAt: new Date().toISOString(),
  };
  return next;
}

async function handleAccountGetState(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const row = await db
    .prepare("SELECT state_json, updated_at FROM ezra_profile_states WHERE user_id = ?1 LIMIT 1")
    .bind(session.user_id)
    .first();
  const parsed = row?.state_json ? JSON.parse(row.state_json) : {};
  return json({ state: parsed, updatedAt: row?.updated_at || null }, 200);
}

async function handleAccountPutState(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const rawState = body?.state && typeof body.state === "object" ? body.state : body;
  const safeState = sanitizeStateInput(rawState);
  const nowIso = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO ezra_profile_states (user_id, state_json, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
    `)
    .bind(session.user_id, JSON.stringify(safeState), nowIso)
    .run();
  return json({ ok: true, updatedAt: nowIso }, 200);
}

async function handleEzraAccountRoute(context, accountPath) {
  const { request, env } = context;
  const db = env.EZRA_DB;
  if (!db) {
    return json({ error: "Account storage not configured. Add D1 binding EZRA_DB." }, 503);
  }

  await ensureAccountSchema(db);
  const route = String(accountPath || "").toLowerCase();

  try {
    if (route === "register" && request.method === "POST") {
      return handleAccountRegister(db, request);
    }
    if (route === "login" && request.method === "POST") {
      return handleAccountLogin(db, request);
    }
    if (route === "me" && request.method === "GET") {
      return handleAccountMe(db, request);
    }
    if (route === "logout" && request.method === "POST") {
      return handleAccountLogout(db, request);
    }
    if (route === "state" && (request.method === "PUT" || request.method === "PATCH")) {
      return handleAccountPutState(db, request);
    }
    if (route === "state" && request.method === "GET") {
      return handleAccountGetState(db, request);
    }

    return json({ error: "Unsupported account route or method" }, 405);
  } catch (err) {
    return json(
      {
        error: "Account route failed",
        detail: String(err?.message || err),
      },
      500
    );
  }
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

  const lowerPath = upstreamPath.toLowerCase();
  if (version === "v1" && lowerPath.startsWith("ezra/account")) {
    const accountPath = upstreamPath.slice("ezra/account".length).replace(/^\/+/, "");
    return handleEzraAccountRoute(context, accountPath);
  }

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const key = env.SPORTSDB_KEY || "074910";

  if (version === "v1" && lowerPath === "ezra/tables") {
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
