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
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS ezra_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        pin_salt TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_sessions_user_id ON ezra_sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ezra_sessions_expires_at ON ezra_sessions(expires_at)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_profile_states (
        user_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_user_scores (
        user_id TEXT PRIMARY KEY,
        points INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_leagues (
        code TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_user_id) REFERENCES ezra_users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_league_members (
        league_code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (league_code, user_id),
        FOREIGN KEY (league_code) REFERENCES ezra_leagues(code),
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_league_members_user_id ON ezra_league_members(user_id)`,
  ];
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
  try {
    await db.prepare("ALTER TABLE ezra_leagues ADD COLUMN name TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) {
      throw err;
    }
  }
  accountSchemaReady = true;
}

function randomLeagueCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => chars[n % chars.length]).join("");
}

function normalizeLeagueCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function normalizeLeagueName(name, fallback = "") {
  const clean = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return clean || fallback;
}

function extractPointsFromState(state, userId) {
  if (!state || typeof state !== "object") return 0;
  const personal = Number(state?.familyLeague?.personalPoints);
  if (Number.isFinite(personal) && personal >= 0) return Math.floor(personal);
  const members = state?.familyLeague?.members;
  if (Array.isArray(members)) {
    const memberId = `acct:${String(userId || "")}`;
    const row = members.find((m) => String(m?.id || "") === memberId);
    const pts = Number(row?.points);
    if (Number.isFinite(pts) && pts >= 0) return Math.floor(pts);
  }
  return 0;
}

function numericScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function predictionResultCode(home, away) {
  if (home > away) return "H";
  if (away > home) return "A";
  return "D";
}

function parseStatusText(event) {
  return String(event?.strStatus || event?.strProgress || "")
    .toLowerCase()
    .trim();
}

function isFinalEvent(event) {
  const s = parseStatusText(event);
  return /\b(ft|full time|match finished|finished|aet|after pen|final)\b/.test(s);
}

function eventLikelyFinal(event) {
  if (!event || typeof event !== "object") return false;
  if (isFinalEvent(event)) return true;
  const home = numericScore(event.intHomeScore);
  const away = numericScore(event.intAwayScore);
  if (home === null || away === null) return false;
  const date = String(event.dateEvent || "");
  if (!date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return date < today;
}

function questBonusPointsFromState(state, userId) {
  const byDate = state?.familyLeague?.questBonusByDate;
  if (!byDate || typeof byDate !== "object") return 0;
  const prefix = `acct:${String(userId || "")}:`;
  let count = 0;
  for (const value of Object.values(byDate)) {
    if (!value || typeof value !== "object") continue;
    for (const [key, done] of Object.entries(value)) {
      if (done && key.startsWith(prefix)) count += 1;
    }
  }
  return count * 5;
}

function predictionEntriesForUser(state, userId) {
  const predictions = state?.familyLeague?.predictions;
  if (!predictions || typeof predictions !== "object") return [];
  const memberKey = `acct:${String(userId || "")}`;
  const rows = [];
  for (const record of Object.values(predictions)) {
    if (!record || typeof record !== "object") continue;
    const eventId = String(record.eventId || "").trim();
    if (!eventId) continue;
    const entries = record.entries && typeof record.entries === "object" ? record.entries : {};
    const pick = entries[memberKey] || null;
    if (!pick || typeof pick !== "object") continue;
    const home = numericScore(pick.home);
    const away = numericScore(pick.away);
    if (home === null || away === null) continue;
    rows.push({ eventId, home, away });
  }
  return rows;
}

async function fetchEventResultById(key, eventId, resultCache) {
  const cacheKey = String(eventId || "").trim();
  if (!cacheKey) return { final: false, home: null, away: null };
  if (resultCache.has(cacheKey)) return resultCache.get(cacheKey);
  const fallback = { final: false, home: null, away: null };
  try {
    const data = await fetchSportsDb("v1", key, `lookupevent.php?id=${encodeURIComponent(cacheKey)}`);
    const event = firstArray(data)?.[0] || null;
    const home = numericScore(event?.intHomeScore);
    const away = numericScore(event?.intAwayScore);
    const final = eventLikelyFinal(event) && home !== null && away !== null;
    const result = { final, home, away };
    resultCache.set(cacheKey, result);
    return result;
  } catch {
    resultCache.set(cacheKey, fallback);
    return fallback;
  }
}

async function upsertUserScore(db, userId, points) {
  const safePoints = Math.max(0, Number(points || 0));
  const nowIso = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO ezra_user_scores (user_id, points, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(user_id) DO UPDATE SET points = excluded.points, updated_at = excluded.updated_at
    `)
    .bind(userId, safePoints, nowIso)
    .run();
}

async function ensureDefaultLeagueForUser(db, userId) {
  const existing = await db
    .prepare("SELECT league_code FROM ezra_league_members WHERE user_id = ?1 ORDER BY joined_at ASC LIMIT 1")
    .bind(userId)
    .first();
  if (existing?.league_code) return existing.league_code;
  let code = "";
  for (let i = 0; i < 12; i += 1) {
    const candidate = randomLeagueCode();
    const taken = await db.prepare("SELECT code FROM ezra_leagues WHERE code = ?1 LIMIT 1").bind(candidate).first();
    if (!taken) {
      code = candidate;
      break;
    }
  }
  if (!code) code = randomLeagueCode();
  const nowIso = new Date().toISOString();
  await db
    .prepare("INSERT INTO ezra_leagues (code, owner_user_id, name, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(code, userId, `League ${code}`, nowIso)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO ezra_league_members (league_code, user_id, joined_at) VALUES (?1, ?2, ?3)")
    .bind(code, userId, nowIso)
    .run();
  return code;
}

async function listLeaguesForUser(db, userId) {
  const rows = await db
    .prepare(`
      SELECT l.code, l.owner_user_id, l.name, l.created_at,
             (SELECT COUNT(*) FROM ezra_league_members lm2 WHERE lm2.league_code = l.code) AS member_count
      FROM ezra_league_members lm
      JOIN ezra_leagues l ON l.code = lm.league_code
      WHERE lm.user_id = ?1
      ORDER BY lm.joined_at ASC
    `)
    .bind(userId)
    .all();
  return rows?.results || [];
}

async function leagueStandings(db, code, key) {
  await syncLeagueScoresFromStates(db, code, key);
  const rows = await db
    .prepare(`
      SELECT u.id AS user_id, u.name,
             COALESCE(s.points, 0) AS points
      FROM ezra_league_members lm
      JOIN ezra_users u ON u.id = lm.user_id
      LEFT JOIN ezra_user_scores s ON s.user_id = lm.user_id
      WHERE lm.league_code = ?1
      ORDER BY points DESC, u.name COLLATE NOCASE ASC
    `)
    .bind(code)
    .all();
  return rows?.results || [];
}

async function syncLeagueScoresFromStates(db, code, key) {
  if (!code) return;
  const members = await db
    .prepare("SELECT user_id FROM ezra_league_members WHERE league_code = ?1")
    .bind(code)
    .all();
  const ids = (members?.results || []).map((row) => String(row?.user_id || "")).filter(Boolean);
  if (!ids.length) return;

  const sportsKey = String(key || "074910");
  const resultCache = new Map();
  await Promise.all(
    ids.map(async (userId) => {
      const row = await db
        .prepare("SELECT state_json FROM ezra_profile_states WHERE user_id = ?1 LIMIT 1")
        .bind(userId)
        .first();
      const state = safeParseJsonText(row?.state_json || "{}");
      const predictionRows = predictionEntriesForUser(state, userId);
      let predictionPoints = 0;
      for (const pick of predictionRows) {
        const result = await fetchEventResultById(sportsKey, pick.eventId, resultCache);
        if (!result.final || result.home === null || result.away === null) continue;
        if (pick.home === result.home && pick.away === result.away) {
          predictionPoints += 2;
          continue;
        }
        if (predictionResultCode(pick.home, pick.away) === predictionResultCode(result.home, result.away)) {
          predictionPoints += 1;
        }
      }
      const questBonusPoints = questBonusPointsFromState(state, userId);
      const fallbackPoints = extractPointsFromState(state, userId);
      const total = Math.max(predictionPoints + questBonusPoints, fallbackPoints);
      await upsertUserScore(db, userId, total);
    })
  );
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
  await upsertUserScore(db, userId, 0);
  await ensureDefaultLeagueForUser(db, userId);

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
  await upsertUserScore(db, session.user_id, extractPointsFromState(safeState, session.user_id));
  return json({ ok: true, updatedAt: nowIso }, 200);
}

async function handleLeagueCreate(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  let code = "";
  for (let i = 0; i < 12; i += 1) {
    const candidate = randomLeagueCode();
    const taken = await db.prepare("SELECT code FROM ezra_leagues WHERE code = ?1 LIMIT 1").bind(candidate).first();
    if (!taken) {
      code = candidate;
      break;
    }
  }
  if (!code) code = randomLeagueCode();
  const nowIso = new Date().toISOString();
  const leagueName = normalizeLeagueName(body?.name, `League ${code}`);
  await db
    .prepare("INSERT INTO ezra_leagues (code, owner_user_id, name, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(code, session.user_id, leagueName, nowIso)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO ezra_league_members (league_code, user_id, joined_at) VALUES (?1, ?2, ?3)")
    .bind(code, session.user_id, nowIso)
    .run();
  return json({ ok: true, code, name: leagueName }, 200);
}

async function handleLeagueJoin(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const code = normalizeLeagueCode(body?.code);
  if (!code) return json({ error: "Invalid league code." }, 400);
  const league = await db.prepare("SELECT code FROM ezra_leagues WHERE code = ?1 LIMIT 1").bind(code).first();
  if (!league) return json({ error: "League code not found." }, 404);
  await db
    .prepare("INSERT OR IGNORE INTO ezra_league_members (league_code, user_id, joined_at) VALUES (?1, ?2, ?3)")
    .bind(code, session.user_id, new Date().toISOString())
    .run();
  return json({ ok: true, code }, 200);
}

async function handleLeagueList(db, request, key) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  await ensureDefaultLeagueForUser(db, session.user_id);
  const leagues = await listLeaguesForUser(db, session.user_id);
  const detailed = await Promise.all(
    leagues.map(async (league) => ({
      code: league.code,
      name: normalizeLeagueName(league.name, `League ${league.code}`),
      ownerUserId: league.owner_user_id,
      isOwner: String(league.owner_user_id || "") === String(session.user_id || ""),
      memberCount: Number(league.member_count || 0),
      standings: await leagueStandings(db, league.code, key),
    }))
  );
  return json({ leagues: detailed }, 200);
}

async function handleLeagueRename(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const code = normalizeLeagueCode(body?.code);
  if (!code) return json({ error: "Invalid league code." }, 400);
  const nextName = normalizeLeagueName(body?.name);
  if (!nextName) return json({ error: "League name required." }, 400);
  const league = await db
    .prepare("SELECT code, owner_user_id FROM ezra_leagues WHERE code = ?1 LIMIT 1")
    .bind(code)
    .first();
  if (!league) return json({ error: "League code not found." }, 404);
  if (String(league.owner_user_id || "") !== String(session.user_id || "")) {
    return json({ error: "Only league owner can rename this league." }, 403);
  }
  await db.prepare("UPDATE ezra_leagues SET name = ?1 WHERE code = ?2").bind(nextName, code).run();
  return json({ ok: true, code, name: nextName }, 200);
}

async function isLeagueMember(db, leagueCode, userId) {
  if (!leagueCode || !userId) return false;
  const row = await db
    .prepare("SELECT 1 AS ok FROM ezra_league_members WHERE league_code = ?1 AND user_id = ?2 LIMIT 1")
    .bind(leagueCode, userId)
    .first();
  return Boolean(row?.ok);
}

function safeParseJsonText(text) {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function handleLeagueMemberView(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const code = normalizeLeagueCode(url.searchParams.get("code"));
  const userId = String(url.searchParams.get("userId") || "").trim();
  if (!code || !userId) return json({ error: "Missing code or userId." }, 400);

  const requesterInLeague = await isLeagueMember(db, code, session.user_id);
  if (!requesterInLeague) return json({ error: "You are not in this league." }, 403);
  const targetInLeague = await isLeagueMember(db, code, userId);
  if (!targetInLeague) return json({ error: "Target user is not in this league." }, 404);

  const userRow = await db.prepare("SELECT id, name FROM ezra_users WHERE id = ?1 LIMIT 1").bind(userId).first();
  if (!userRow) return json({ error: "User not found." }, 404);

  const stateRow = await db
    .prepare("SELECT state_json, updated_at FROM ezra_profile_states WHERE user_id = ?1 LIMIT 1")
    .bind(userId)
    .first();
  const state = safeParseJsonText(stateRow?.state_json || "{}");
  const memberId = `acct:${userId}`;
  const allPredictions = state?.familyLeague?.predictions && typeof state.familyLeague.predictions === "object" ? state.familyLeague.predictions : {};
  const predictions = Object.values(allPredictions)
    .filter((record) => record && typeof record === "object" && record.entries && typeof record.entries === "object" && record.entries[memberId])
    .map((record) => {
      const pick = record.entries[memberId] || {};
      return {
        eventId: record.eventId || "",
        homeTeam: record.homeTeam || "",
        awayTeam: record.awayTeam || "",
        kickoff: record.kickoff || "",
        settled: Boolean(record.settled),
        finalHome: Number.isFinite(Number(record.finalHome)) ? Number(record.finalHome) : null,
        finalAway: Number.isFinite(Number(record.finalAway)) ? Number(record.finalAway) : null,
        pick: {
          home: Number.isFinite(Number(pick.home)) ? Number(pick.home) : null,
          away: Number.isFinite(Number(pick.away)) ? Number(pick.away) : null,
          awarded: Number.isFinite(Number(pick.awarded)) ? Number(pick.awarded) : 0,
          scored: Boolean(pick.scored),
          submittedAt: pick.submittedAt || "",
        },
      };
    })
    .sort((a, b) => String(b.kickoff || "").localeCompare(String(a.kickoff || "")));

  const dreamTeam = state?.dreamTeam && typeof state.dreamTeam === "object" ? state.dreamTeam : null;
  return json(
    {
      user: { id: userRow.id, name: userRow.name || "User" },
      leagueCode: code,
      updatedAt: stateRow?.updated_at || null,
      predictions,
      dreamTeam,
    },
    200
  );
}

async function handlePublicLeagueStandings(db, request, key) {
  const url = new URL(request.url);
  const code = normalizeLeagueCode(url.searchParams.get("code"));
  if (!code) return json({ error: "Invalid league code." }, 400);
  const league = await db
    .prepare("SELECT code, owner_user_id, name, created_at FROM ezra_leagues WHERE code = ?1 LIMIT 1")
    .bind(code)
    .first();
  if (!league) return json({ error: "League code not found." }, 404);
  const standings = await leagueStandings(db, code, key);
  return json(
    {
      league: {
        code,
        name: normalizeLeagueName(league.name, `League ${code}`),
        ownerUserId: league.owner_user_id || "",
        createdAt: league.created_at || null,
        memberCount: standings.length,
      },
      standings,
    },
    200
  );
}

async function handleCronSettle(db, request, key, env) {
  const expected = String(env?.EZRA_CRON_SECRET || "").trim();
  if (!expected) {
    return json({ error: "Cron secret is not configured. Add EZRA_CRON_SECRET." }, 503);
  }
  const url = new URL(request.url);
  const provided =
    String(request.headers.get("x-ezra-cron-secret") || "").trim() ||
    String(url.searchParams.get("secret") || "").trim();
  if (!provided || provided !== expected) {
    return json({ error: "Unauthorized cron trigger." }, 401);
  }
  const rows = await db.prepare("SELECT code FROM ezra_leagues").all();
  const codes = (rows?.results || []).map((row) => normalizeLeagueCode(row?.code)).filter(Boolean);
  for (const code of codes) {
    await syncLeagueScoresFromStates(db, code, key);
  }
  return json(
    {
      ok: true,
      leaguesProcessed: codes.length,
      settledAt: new Date().toISOString(),
    },
    200
  );
}

async function handleEzraAccountRoute(context, accountPath, key) {
  const { request, env } = context;
  const db = env.EZRA_DB;
  if (!db) {
    return json({ error: "Account storage not configured. Add D1 binding EZRA_DB." }, 503);
  }

  try {
    await ensureAccountSchema(db);
    const route = String(accountPath || "").toLowerCase();
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
    if (route === "league/create" && request.method === "POST") {
      return handleLeagueCreate(db, request);
    }
    if (route === "league/join" && request.method === "POST") {
      return handleLeagueJoin(db, request);
    }
    if (route === "league/name" && (request.method === "PUT" || request.method === "PATCH")) {
      return handleLeagueRename(db, request);
    }
    if (route === "league/member" && request.method === "GET") {
      return handleLeagueMemberView(db, request);
    }
    if (route === "league/standings" && request.method === "GET") {
      return handlePublicLeagueStandings(db, request, key);
    }
    if (route === "cron/settle" && (request.method === "POST" || request.method === "GET")) {
      return handleCronSettle(db, request, key, env);
    }
    if (route === "leagues" && request.method === "GET") {
      return handleLeagueList(db, request, key);
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
const TABLE_REFRESH_MATCHDAY_MS = 2 * 60 * 1000;
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

function parseTableStatusText(event) {
  return String(event?.strStatus || event?.strProgress || "")
    .toLowerCase()
    .trim();
}

function isTableLiveStatus(event) {
  const s = parseTableStatusText(event);
  if (!s) return false;
  if (/\b(ht|1h|2h|live|in play|playing|et|pen)\b/.test(s)) return true;
  return /\d{1,3}\s*'/.test(s);
}

function parseEventKickoffMs(event) {
  const date = String(event?.dateEvent || "").trim();
  if (!date) return Number.NaN;
  const time = String(event?.strTime || "12:00:00")
    .trim()
    .slice(0, 8);
  return Date.parse(`${date}T${time}Z`);
}

async function hasMatchdayActivityNow(key) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  for (const leagueId of TABLE_LEAGUE_IDS) {
    const feeds = await Promise.all([
      fetchSportsDb("v1", key, `eventsday.php?d=${encodeURIComponent(todayIso)}&l=${encodeURIComponent(leagueId)}`).catch(() => null),
      fetchSportsDb("v1", key, `eventspastleague.php?id=${encodeURIComponent(leagueId)}`).catch(() => null),
      fetchSportsDb("v1", key, `eventsnextleague.php?id=${encodeURIComponent(leagueId)}`).catch(() => null),
    ]);
    const pool = feeds
      .flatMap((payload) => firstArray(payload))
      .filter((event) => String(event?.dateEvent || "") === todayIso);
    if (!pool.length) continue;
    if (pool.some((event) => isTableLiveStatus(event))) return true;
    const inWindow = pool.some((event) => {
      const kickoffMs = parseEventKickoffMs(event);
      if (!Number.isFinite(kickoffMs)) return false;
      const minutes = (now - kickoffMs) / 60000;
      return minutes >= -45 && minutes <= 180;
    });
    if (inWindow) return true;
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
  const matchdayNow = liveNow ? true : await hasMatchdayActivityNow(key);
  const refreshEveryMs = liveNow
    ? TABLE_REFRESH_LIVE_MS
    : matchdayNow
      ? TABLE_REFRESH_MATCHDAY_MS
      : TABLE_REFRESH_IDLE_MS;
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
          "X-EZRA-Tables-Matchday": matchdayNow ? "1" : "0",
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
    matchdayNow,
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
    headers.set("X-EZRA-Tables-Matchday", meta.matchdayNow ? "1" : "0");
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
  const key = env.SPORTSDB_KEY || "074910";
  if (version === "v1" && lowerPath.startsWith("ezra/account")) {
    const accountPath = upstreamPath.slice("ezra/account".length).replace(/^\/+/, "");
    return handleEzraAccountRoute(context, accountPath, key);
  }

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

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
