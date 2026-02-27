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

const UPSTREAM_TIMEOUT_MS = 12000;
const UPSTREAM_RETRIES = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryUpstream(status) {
  return status === 429 || status >= 500;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpstreamWithRetry(url, options = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= UPSTREAM_RETRIES; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (!shouldRetryUpstream(res.status) || attempt >= UPSTREAM_RETRIES) {
        return res;
      }
    } catch (err) {
      lastErr = err;
      if (attempt >= UPSTREAM_RETRIES) throw err;
    }
    await sleep(220 * (attempt + 1));
  }
  if (lastErr) throw lastErr;
  throw new Error("Upstream fetch failed");
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateEmail(email) {
  const clean = normalizeEmail(email);
  if (!clean) return { ok: true, clean: "" };
  if (clean.length > 254) {
    return { ok: false, message: "Email address is too long." };
  }
  const simple = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!simple.test(clean)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  return { ok: true, clean };
}

function normalizeTeamToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
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
        email TEXT,
        email_key TEXT,
        email_verified_at TEXT,
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
    `
      CREATE TABLE IF NOT EXISTS ezra_event_results_cache (
        event_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        home_score INTEGER,
        away_score INTEGER,
        is_final INTEGER NOT NULL DEFAULT 0,
        kickoff_at TEXT,
        fetched_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_event_results_expires_at ON ezra_event_results_cache(expires_at)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_fixtures_cache (
        event_id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL,
        date_event TEXT NOT NULL,
        str_time TEXT,
        status_text TEXT,
        payload_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_fixtures_league_date ON ezra_fixtures_cache(league_id, date_event)`,
    `CREATE INDEX IF NOT EXISTS idx_ezra_fixtures_updated_at ON ezra_fixtures_cache(updated_at)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_fixture_ingest_state (
        key TEXT PRIMARY KEY,
        value_text TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_user_progress (
        user_id TEXT PRIMARY KEY,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        last_quest_date TEXT,
        combo_count INTEGER NOT NULL DEFAULT 0,
        best_combo INTEGER NOT NULL DEFAULT 0,
        combo_updated_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_user_team_mastery (
        user_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        team_name TEXT NOT NULL,
        pred_count INTEGER NOT NULL DEFAULT 0,
        result_correct INTEGER NOT NULL DEFAULT 0,
        exact_correct INTEGER NOT NULL DEFAULT 0,
        points_earned INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, team_id),
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_league_seasons (
        league_code TEXT NOT NULL,
        season_id TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        PRIMARY KEY (league_code, season_id),
        FOREIGN KEY (league_code) REFERENCES ezra_leagues(code)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_league_season_points (
        league_code TEXT NOT NULL,
        season_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (league_code, season_id, user_id),
        FOREIGN KEY (league_code, season_id) REFERENCES ezra_league_seasons(league_code, season_id),
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_league_season_titles (
        league_code TEXT NOT NULL,
        season_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        awarded_at TEXT NOT NULL,
        PRIMARY KEY (league_code, season_id),
        FOREIGN KEY (league_code, season_id) REFERENCES ezra_league_seasons(league_code, season_id),
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_titles_user_id ON ezra_league_season_titles(user_id)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_achievements (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT,
        created_at TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_user_achievements (
        user_id TEXT NOT NULL,
        achievement_code TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        PRIMARY KEY (user_id, achievement_code),
        FOREIGN KEY (user_id) REFERENCES ezra_users(id),
        FOREIGN KEY (achievement_code) REFERENCES ezra_achievements(code)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_points_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT,
        user_id TEXT NOT NULL,
        league_code TEXT,
        type TEXT NOT NULL,
        points INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_points_ledger_user_id ON ezra_points_ledger(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ezra_points_ledger_league_code ON ezra_points_ledger(league_code)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_user_preferences (
        user_id TEXT PRIMARY KEY,
        kids_mode INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_auth_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email_key TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_auth_codes_user ON ezra_auth_codes(user_id, purpose, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_ezra_auth_codes_email ON ezra_auth_codes(email_key, purpose, expires_at)`,
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
  try {
    await db.prepare("ALTER TABLE ezra_users ADD COLUMN email TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  try {
    await db.prepare("ALTER TABLE ezra_users ADD COLUMN email_key TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  try {
    await db.prepare("ALTER TABLE ezra_users ADD COLUMN email_verified_at TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_ezra_users_email_key ON ezra_users(email_key)").run();
  accountSchemaReady = true;
}

function randomNumericCode(len = 6) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => String(n % 10)).join("");
}

async function sendRecoveryEmail(env, email, code) {
  const apiKey = String(env?.RESEND_API_KEY || "").trim();
  const from = String(env?.EZRA_FROM_EMAIL || "").trim();
  if (!apiKey || !from) return { ok: false, configured: false };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "SAVED by the goalie! Here's your reset code",
      text: `Your EZRASCORES reset code is ${code}. It expires in 15 minutes.`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Email delivery failed (${res.status}): ${detail.slice(0, 160)}`);
  }
  return { ok: true, configured: true };
}

async function createRecoveryCode(db, userId, emailKey, purpose = "pin_reset") {
  const id = randomHex(12);
  const code = randomNumericCode(6);
  const codeHash = await sha256Hex(`${id}:${code}`);
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000;
  await db
    .prepare(
      `
      INSERT INTO ezra_auth_codes
        (id, user_id, email_key, purpose, code_hash, expires_at, consumed_at, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)
      `
    )
    .bind(id, userId, emailKey, purpose, codeHash, expiresAt, new Date(now).toISOString())
    .run();
  return { id, code, expiresAt };
}

async function consumeRecoveryCode(db, userId, emailKey, code, purpose = "pin_reset") {
  const now = Date.now();
  const row = await db
    .prepare(
      `
      SELECT id, code_hash, expires_at, consumed_at
      FROM ezra_auth_codes
      WHERE user_id = ?1 AND email_key = ?2 AND purpose = ?3 AND expires_at > ?4
      ORDER BY created_at DESC
      LIMIT 1
      `
    )
    .bind(userId, emailKey, purpose, now)
    .first();
  if (!row) return { ok: false, error: "No valid recovery code found. Request a new code." };
  if (Number(row.consumed_at || 0) > 0) return { ok: false, error: "Recovery code already used. Request a new code." };
  const expected = await sha256Hex(`${row.id}:${String(code || "").trim()}`);
  if (expected !== row.code_hash) return { ok: false, error: "Recovery code is invalid." };
  await db
    .prepare("UPDATE ezra_auth_codes SET consumed_at = ?2 WHERE id = ?1")
    .bind(row.id, now)
    .run();
  return { ok: true };
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

function eventKickoffMs(event, fallbackKickoffIso = "") {
  const date = String(event?.dateEvent || "").trim();
  const time = String(event?.strTime || "12:00:00")
    .trim()
    .slice(0, 8);
  const fromEvent = date ? Date.parse(`${date}T${time}Z`) : Number.NaN;
  if (Number.isFinite(fromEvent)) return fromEvent;
  const fromFallback = fallbackKickoffIso ? Date.parse(String(fallbackKickoffIso)) : Number.NaN;
  return Number.isFinite(fromFallback) ? fromFallback : Number.NaN;
}

function eventLikelyFinal(event, fallbackKickoffIso = "") {
  if (!event || typeof event !== "object") return false;
  if (isFinalEvent(event)) return true;
  const home = numericScore(event.intHomeScore);
  const away = numericScore(event.intAwayScore);
  if (home === null || away === null) return false;
  const date = String(event.dateEvent || "");
  if (!date) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return true;
  if (date > today) return false;
  const kickoffMs = eventKickoffMs(event, fallbackKickoffIso);
  if (!Number.isFinite(kickoffMs)) return false;
  const elapsedMs = Date.now() - kickoffMs;
  return elapsedMs > 150 * 60 * 1000;
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

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoDateMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function currentSevenDaySeasonWindow(now = new Date()) {
  // Weekly season window: resets at Monday 00:01 UTC.
  // During Monday 00:00:00-00:00:59 UTC, keep the previous week active.
  const adjusted = new Date(now.getTime());
  if (adjusted.getUTCDay() === 1 && adjusted.getUTCHours() === 0 && adjusted.getUTCMinutes() < 1) {
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  }
  const weekday = adjusted.getUTCDay(); // 0 Sun ... 1 Mon ... 6 Sat
  const daysSinceMonday = (weekday + 6) % 7;
  const start = new Date(Date.UTC(adjusted.getUTCFullYear(), adjusted.getUTCMonth(), adjusted.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 7);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const startsAt = new Date(startMs).toISOString().slice(0, 10);
  const endsAt = new Date(endMs).toISOString().slice(0, 10);
  return {
    seasonId: `W${startsAt.replace(/-/g, "")}`,
    startsAt,
    endsAt,
  };
}

function inSeasonByKickoff(kickoffIso, season) {
  if (!kickoffIso || !season) return false;
  const ts = parseIsoDateMs(kickoffIso);
  if (!Number.isFinite(ts)) return false;
  const start = parseIsoDateMs(season.startsAt);
  const end = parseIsoDateMs(season.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && ts >= start && ts < end;
}

function leagueIdToCode(value) {
  const v = String(value || "").trim();
  if (v === "4328") return "EPL";
  if (v === "4329") return "CHAMP";
  return "";
}

function normalizeTeamIdToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^fallback:/i.test(raw) ? "" : raw;
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
    rows.push({ eventId, home, away, kickoffIso: String(record.kickoff || "") });
  }
  return rows;
}

function ttlForEventResult(result) {
  if (result?.final) return 30 * 24 * 60 * 60 * 1000;
  if (result?.home !== null && result?.away !== null) return 2 * 60 * 1000;
  return 15 * 60 * 1000;
}

function readResultFromCacheRow(row) {
  if (!row) return null;
  const value = {
    final: Boolean(Number(row.is_final || 0)),
    home: row.home_score === null || row.home_score === undefined ? null : Number(row.home_score),
    away: row.away_score === null || row.away_score === undefined ? null : Number(row.away_score),
    kickoffAt: row.kickoff_at || "",
    fetchedAt: Number(row.fetched_at || 0),
    expiresAt: Number(row.expires_at || 0),
  };
  if (row.payload_json) {
    value.event = safeParseJsonText(row.payload_json);
  }
  return value;
}

async function readCachedEventResult(db, eventId) {
  if (!db) return null;
  const row = await db
    .prepare(
      "SELECT payload_json, home_score, away_score, is_final, kickoff_at, fetched_at, expires_at FROM ezra_event_results_cache WHERE event_id = ?1 LIMIT 1"
    )
    .bind(eventId)
    .first();
  return readResultFromCacheRow(row);
}

async function writeCachedEventResult(db, eventId, event, result) {
  if (!db || !eventId) return;
  const now = Date.now();
  const ttl = ttlForEventResult(result);
  await db
    .prepare(
      `
      INSERT INTO ezra_event_results_cache (event_id, payload_json, home_score, away_score, is_final, kickoff_at, fetched_at, expires_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(event_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        is_final = excluded.is_final,
        kickoff_at = excluded.kickoff_at,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at
    `
    )
    .bind(
      eventId,
      JSON.stringify(event || {}),
      result?.home,
      result?.away,
      result?.final ? 1 : 0,
      result?.kickoffAt || "",
      now,
      now + ttl
    )
    .run();
}

async function fetchEventResultById(key, eventId, resultCache, db, options = {}) {
  const cacheKey = String(eventId || "").trim();
  if (!cacheKey) return { final: false, home: null, away: null };
  if (resultCache.has(cacheKey)) return resultCache.get(cacheKey);
  const fallback = { final: false, home: null, away: null, kickoffAt: options?.kickoffIso || "" };
  const now = Date.now();
  const cached = await readCachedEventResult(db, cacheKey);
  if (cached?.expiresAt && cached.expiresAt > now) {
    resultCache.set(cacheKey, cached);
    return cached;
  }
  try {
    const data = await fetchSportsDb("v1", key, `lookupevent.php?id=${encodeURIComponent(cacheKey)}`);
    const event = firstArray(data)?.[0] || null;
    const home = numericScore(event?.intHomeScore);
    const away = numericScore(event?.intAwayScore);
    const kickoffAt = (event?.dateEvent && event?.strTime)
      ? `${String(event.dateEvent).trim()}T${String(event.strTime || "12:00:00").trim().slice(0, 8)}Z`
      : String(options?.kickoffIso || "");
    const final = eventLikelyFinal(event, options?.kickoffIso || "") && home !== null && away !== null;
    const result = { final, home, away, kickoffAt };
    await writeCachedEventResult(db, cacheKey, event, result);
    resultCache.set(cacheKey, result);
    return result;
  } catch {
    if (cached) {
      resultCache.set(cacheKey, cached);
      return cached;
    }
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

async function upsertUserPreference(db, userId, kidsMode = false) {
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT INTO ezra_user_preferences (user_id, kids_mode, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(user_id) DO UPDATE SET
        kids_mode = excluded.kids_mode,
        updated_at = excluded.updated_at
      `
    )
    .bind(userId, kidsMode ? 1 : 0, nowIso)
    .run();
}

async function getUserPreference(db, userId) {
  const row = await db.prepare("SELECT kids_mode, updated_at FROM ezra_user_preferences WHERE user_id = ?1 LIMIT 1").bind(userId).first();
  return {
    kidsMode: Boolean(Number(row?.kids_mode || 0)),
    updatedAt: row?.updated_at || null,
  };
}

async function ensureLeagueSeason(db, leagueCode, season) {
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT OR IGNORE INTO ezra_league_seasons (league_code, season_id, starts_at, ends_at, status, created_at)
      VALUES (?1, ?2, ?3, ?4, 'active', ?5)
      `
    )
    .bind(leagueCode, season.seasonId, season.startsAt, season.endsAt, nowIso)
    .run();
}

async function upsertLeagueSeasonPoints(db, leagueCode, seasonId, userId, points) {
  const nowIso = new Date().toISOString();
  const safe = Math.max(0, Number(points || 0));
  await db
    .prepare(
      `
      INSERT INTO ezra_league_season_points (league_code, season_id, user_id, points, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(league_code, season_id, user_id) DO UPDATE SET
        points = excluded.points,
        updated_at = excluded.updated_at
      `
    )
    .bind(leagueCode, seasonId, userId, safe, nowIso)
    .run();
}

async function replaceTeamMastery(db, userId, rows) {
  const nowIso = new Date().toISOString();
  await db.prepare("DELETE FROM ezra_user_team_mastery WHERE user_id = ?1").bind(userId).run();
  for (const row of rows || []) {
    await db
      .prepare(
        `
        INSERT INTO ezra_user_team_mastery
          (user_id, team_id, team_name, pred_count, result_correct, exact_correct, points_earned, updated_at)
        VALUES
          (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        `
      )
      .bind(
        userId,
        String(row.teamId || ""),
        String(row.teamName || "Unknown"),
        Math.max(0, Number(row.predCount || 0)),
        Math.max(0, Number(row.resultCorrect || 0)),
        Math.max(0, Number(row.exactCorrect || 0)),
        Math.max(0, Number(row.pointsEarned || 0)),
        nowIso
      )
      .run();
  }
}

async function upsertUserProgress(db, userId, progress) {
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT INTO ezra_user_progress
        (user_id, current_streak, best_streak, last_quest_date, combo_count, best_combo, combo_updated_at, updated_at)
      VALUES
        (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(user_id) DO UPDATE SET
        current_streak = excluded.current_streak,
        best_streak = excluded.best_streak,
        last_quest_date = excluded.last_quest_date,
        combo_count = excluded.combo_count,
        best_combo = excluded.best_combo,
        combo_updated_at = excluded.combo_updated_at,
        updated_at = excluded.updated_at
      `
    )
    .bind(
      userId,
      Math.max(0, Number(progress?.currentStreak || 0)),
      Math.max(0, Number(progress?.bestStreak || 0)),
      String(progress?.lastQuestDate || ""),
      Math.max(0, Number(progress?.comboCount || 0)),
      Math.max(0, Number(progress?.bestCombo || 0)),
      String(progress?.comboUpdatedAt || ""),
      nowIso
    )
    .run();
}

async function ensureAchievementCatalog(db) {
  const nowIso = new Date().toISOString();
  const rows = [
    { code: "streak_3", name: "On Fire", description: "Complete quests 3 days in a row.", icon: "🔥" },
    { code: "streak_7", name: "Unstoppable", description: "Complete quests 7 days in a row.", icon: "🏆" },
    { code: "combo_3", name: "Prediction Combo", description: "Hit 3 correct outcomes in a row.", icon: "⚡" },
    { code: "exact_10", name: "Sniper", description: "Get 10 exact score predictions.", icon: "🎯" },
    { code: "mastery_25", name: "Team Analyst", description: "Make 25 predictions for one club.", icon: "📈" },
    { code: "titles_5", name: "Dynasty", description: "Win 5 mini-league weekly titles.", icon: "👑" },
  ];
  for (const row of rows) {
    await db
      .prepare("INSERT OR IGNORE INTO ezra_achievements (code, name, description, icon, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(row.code, row.name, row.description, row.icon, nowIso)
      .run();
  }
}

async function grantAchievement(db, userId, code) {
  const nowIso = new Date().toISOString();
  await db
    .prepare("INSERT OR IGNORE INTO ezra_user_achievements (user_id, achievement_code, earned_at) VALUES (?1, ?2, ?3)")
    .bind(userId, code, nowIso)
    .run();
}

async function awardSeasonTitleIfEligible(db, leagueCode, seasonId) {
  if (!leagueCode || !seasonId) return null;
  const existing = await db
    .prepare(
      `
      SELECT league_code, season_id, user_id
      FROM ezra_league_season_titles
      WHERE league_code = ?1 AND season_id = ?2
      LIMIT 1
      `
    )
    .bind(leagueCode, seasonId)
    .first();
  if (existing?.user_id) return String(existing.user_id);

  const leader = await db
    .prepare(
      `
      SELECT user_id, points
      FROM ezra_league_season_points
      WHERE league_code = ?1 AND season_id = ?2
      ORDER BY points DESC, user_id ASC
      LIMIT 1
      `
    )
    .bind(leagueCode, seasonId)
    .first();
  const winnerUserId = String(leader?.user_id || "").trim();
  if (!winnerUserId) return null;
  await db
    .prepare(
      `
      INSERT OR IGNORE INTO ezra_league_season_titles (league_code, season_id, user_id, awarded_at)
      VALUES (?1, ?2, ?3, ?4)
      `
    )
    .bind(leagueCode, seasonId, winnerUserId, new Date().toISOString())
    .run();
  return winnerUserId;
}

async function replacePointLedgerForUser(db, userId, leagueCode, entries = []) {
  await db
    .prepare("DELETE FROM ezra_points_ledger WHERE user_id = ?1 AND league_code = ?2 AND (type = 'prediction' OR type = 'quest_bonus')")
    .bind(userId, leagueCode)
    .run();
  for (const row of entries) {
    await db
      .prepare(
        `
        INSERT OR IGNORE INTO ezra_points_ledger
          (event_id, user_id, league_code, type, points, idempotency_key, payload_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        `
      )
      .bind(
        String(row.eventId || ""),
        userId,
        leagueCode,
        String(row.type || "prediction"),
        Math.max(0, Number(row.points || 0)),
        String(row.idempotencyKey || ""),
        JSON.stringify(row.payload || {}),
        String(row.createdAt || new Date().toISOString())
      )
      .run();
  }
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
  const season = currentSevenDaySeasonWindow();
  const rows = await db
    .prepare(`
      SELECT u.id AS user_id, u.name,
             COALESCE(sp.points, 0) AS points,
             COALESCE(s.points, 0) AS lifetime_points,
             (
               SELECT COUNT(*)
               FROM ezra_league_season_titles t
               WHERE t.league_code = lm.league_code
                 AND t.user_id = lm.user_id
             ) AS titles_won
      FROM ezra_league_members lm
      JOIN ezra_users u ON u.id = lm.user_id
      LEFT JOIN ezra_league_season_points sp
        ON sp.user_id = lm.user_id
       AND sp.league_code = lm.league_code
       AND sp.season_id = ?2
      LEFT JOIN ezra_user_scores s ON s.user_id = lm.user_id
      WHERE lm.league_code = ?1
      ORDER BY points DESC, u.name COLLATE NOCASE ASC
    `)
    .bind(code, season.seasonId)
    .all();
  return rows?.results || [];
}

async function leagueStandingsFallback(db, code) {
  const season = currentSevenDaySeasonWindow();
  const rows = await db
    .prepare(`
      SELECT u.id AS user_id, u.name,
             COALESCE(sp.points, 0) AS points,
             COALESCE(s.points, 0) AS lifetime_points,
             (
               SELECT COUNT(*)
               FROM ezra_league_season_titles t
               WHERE t.league_code = lm.league_code
                 AND t.user_id = lm.user_id
             ) AS titles_won
      FROM ezra_league_members lm
      JOIN ezra_users u ON u.id = lm.user_id
      LEFT JOIN ezra_league_season_points sp
        ON sp.user_id = lm.user_id
       AND sp.league_code = lm.league_code
       AND sp.season_id = ?2
      LEFT JOIN ezra_user_scores s ON s.user_id = lm.user_id
      WHERE lm.league_code = ?1
      ORDER BY points DESC, lifetime_points DESC, u.name COLLATE NOCASE ASC
    `)
    .bind(code, season.seasonId)
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
  const season = currentSevenDaySeasonWindow();
  await ensureLeagueSeason(db, code, season);
  await ensureAchievementCatalog(db);

  const safePredictionAward = (basePoints, comboCount) => {
    if (basePoints <= 0) return 0;
    if (comboCount >= 3) return basePoints + 2;
    if (comboCount === 2) return basePoints + 1;
    return basePoints;
  };

  const todayIso = todayIsoUtc();
  const yesterdayIso = addDaysIso(todayIso, -1);

  await Promise.all(
    ids.map(async (userId) => {
      const row = await db
        .prepare("SELECT state_json FROM ezra_profile_states WHERE user_id = ?1 LIMIT 1")
        .bind(userId)
        .first();
      const state = safeParseJsonText(row?.state_json || "{}");
      const predictionRows = predictionEntriesForUser(state, userId);
      const ordered = [...predictionRows].sort((a, b) => String(a.kickoffIso || "").localeCompare(String(b.kickoffIso || "")));
      let predictionPoints = 0;
      let seasonPoints = 0;
      let comboCount = 0;
      let bestCombo = 0;
      let totalExact = 0;
      const mastery = new Map();
      const ledger = [];
      for (const pick of ordered) {
        const result = await fetchEventResultById(sportsKey, pick.eventId, resultCache, db, { kickoffIso: pick.kickoffIso || "" });
        if (!result.final || result.home === null || result.away === null) continue;
        const eventRow = await db
          .prepare("SELECT payload_json, league_id FROM ezra_fixtures_cache WHERE event_id = ?1 LIMIT 1")
          .bind(String(pick.eventId || ""))
          .first();
        const event = safeParseJsonText(eventRow?.payload_json || "{}");
        const leagueCode = leagueIdToCode(eventRow?.league_id);
        const teamId = normalizeTeamIdToken(String(event?.idHomeTeam || "")) || normalizeTeamIdToken(String(event?.idAwayTeam || "")) || "unknown";
        const teamName = String(event?.strHomeTeam || "") || String(event?.strAwayTeam || "") || "Unknown";
        const base =
          pick.home === result.home && pick.away === result.away
            ? 2
            : predictionResultCode(pick.home, pick.away) === predictionResultCode(result.home, result.away)
              ? 1
              : 0;
        if (base > 0) {
          comboCount += 1;
          bestCombo = Math.max(bestCombo, comboCount);
        } else {
          comboCount = 0;
        }
        const awarded = safePredictionAward(base, comboCount);
        predictionPoints += awarded;
        if (inSeasonByKickoff(pick.kickoffIso, season) && (leagueCode === "EPL" || leagueCode === "CHAMP")) {
          seasonPoints += awarded;
        }
        if (base === 2) totalExact += 1;
        const existing = mastery.get(teamId) || {
          teamId,
          teamName,
          predCount: 0,
          resultCorrect: 0,
          exactCorrect: 0,
          pointsEarned: 0,
        };
        existing.predCount += 1;
        if (base > 0) existing.resultCorrect += 1;
        if (base === 2) existing.exactCorrect += 1;
        existing.pointsEarned += awarded;
        mastery.set(teamId, existing);
        ledger.push({
          eventId: pick.eventId,
          type: "prediction",
          points: awarded,
          idempotencyKey: `prediction:${code}:${userId}:${pick.eventId}`,
          createdAt: pick.kickoffIso || new Date().toISOString(),
          payload: { base, comboCount, exact: base === 2 },
        });
      }

      const questBonusPoints = questBonusPointsFromState(state, userId);
      let questSeasonPoints = 0;
      const questMap = state?.familyLeague?.questBonusByDate;
      if (questMap && typeof questMap === "object") {
        const prefix = `acct:${String(userId || "")}:`;
        for (const [dateIso, obj] of Object.entries(questMap)) {
          if (!obj || typeof obj !== "object") continue;
          if (!inSeasonByKickoff(`${dateIso}T00:00:00Z`, season)) continue;
          for (const [k, done] of Object.entries(obj)) {
            if (done && k.startsWith(prefix)) questSeasonPoints += 5;
          }
        }
      }

      const fallbackPoints = extractPointsFromState(state, userId);
      const total = Math.max(predictionPoints + questBonusPoints, fallbackPoints);
      await upsertUserScore(db, userId, total);
      await upsertLeagueSeasonPoints(db, code, season.seasonId, userId, seasonPoints + questSeasonPoints);
      await replaceTeamMastery(db, userId, [...mastery.values()]);

      const questByDate = state?.familyLeague?.questBonusByDate;
      const todayObj = questByDate && typeof questByDate === "object" ? questByDate[todayIso] : null;
      const yesterdayObj = questByDate && typeof questByDate === "object" ? questByDate[yesterdayIso] : null;
      const hasTodayQuest = Boolean(
        todayObj &&
          typeof todayObj === "object" &&
          Object.entries(todayObj).some(([k, done]) => done && String(k || "").startsWith(`acct:${userId}:`))
      );
      const hadYesterdayQuest = Boolean(
        yesterdayObj &&
          typeof yesterdayObj === "object" &&
          Object.entries(yesterdayObj).some(([k, done]) => done && String(k || "").startsWith(`acct:${userId}:`))
      );
      const progressRow = await db
        .prepare("SELECT current_streak, best_streak, last_quest_date FROM ezra_user_progress WHERE user_id = ?1 LIMIT 1")
        .bind(userId)
        .first();
      let currentStreak = Math.max(0, Number(progressRow?.current_streak || 0));
      let bestStreak = Math.max(0, Number(progressRow?.best_streak || 0));
      const lastQuestDate = String(progressRow?.last_quest_date || "");
      if (hasTodayQuest && lastQuestDate !== todayIso) {
        currentStreak = hadYesterdayQuest ? currentStreak + 1 : 1;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else if (!hasTodayQuest && !hadYesterdayQuest && lastQuestDate && lastQuestDate !== todayIso) {
        currentStreak = 0;
      }
      const nextLastQuestDate = hasTodayQuest ? todayIso : lastQuestDate;
      await upsertUserProgress(db, userId, {
        currentStreak,
        bestStreak,
        lastQuestDate: nextLastQuestDate,
        comboCount,
        bestCombo,
        comboUpdatedAt: new Date().toISOString(),
      });

      if (bestStreak >= 3) await grantAchievement(db, userId, "streak_3");
      if (bestStreak >= 7) await grantAchievement(db, userId, "streak_7");
      if (bestCombo >= 3) await grantAchievement(db, userId, "combo_3");
      if (totalExact >= 10) await grantAchievement(db, userId, "exact_10");
      if ([...mastery.values()].some((m) => Number(m.predCount || 0) >= 25)) await grantAchievement(db, userId, "mastery_25");

      if (questBonusPoints > 0) {
        ledger.push({
          eventId: "",
          type: "quest_bonus",
          points: questBonusPoints,
          idempotencyKey: `quest_bonus:${code}:${userId}:${todayIso}`,
          createdAt: new Date().toISOString(),
          payload: { questBonusPoints },
        });
      }
      await replacePointLedgerForUser(db, userId, code, ledger);
    })
  );

  const winnerUserId = await awardSeasonTitleIfEligible(db, code, season.seasonId);
  if (winnerUserId) {
    const titlesRow = await db
      .prepare(
        `
        SELECT COUNT(*) AS c
        FROM ezra_league_season_titles
        WHERE league_code = ?1 AND user_id = ?2
        `
      )
      .bind(code, winnerUserId)
      .first();
    const titlesWon = Math.max(0, Number(titlesRow?.c || 0));
    if (titlesWon >= 5) {
      await grantAchievement(db, winnerUserId, "titles_5");
    }
  }
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
      SELECT s.token, s.expires_at, u.id AS user_id, u.name, u.email, u.email_verified_at
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
  const emailCheck = validateEmail(body?.email);
  if (!emailCheck.ok) return json({ error: emailCheck.message }, 400);

  const nameKey = valid.cleanName.toLowerCase();
  const existing = await db.prepare("SELECT id FROM ezra_users WHERE name_key = ?1 LIMIT 1").bind(nameKey).first();
  if (existing) return json({ error: "Name already exists. Please choose another." }, 409);
  if (emailCheck.clean) {
    const emailTaken = await db.prepare("SELECT id FROM ezra_users WHERE email_key = ?1 LIMIT 1").bind(emailCheck.clean).first();
    if (emailTaken) return json({ error: "Email already in use. Try account recovery or a different email." }, 409);
  }

  const userId = randomHex(12);
  const salt = randomHex(10);
  const pinHash = await sha256Hex(`${salt}:${valid.cleanPin}`);
  const nowIso = new Date().toISOString();

  try {
    await db
      .prepare(`
        INSERT INTO ezra_users (id, name, name_key, email, email_key, email_verified_at, pin_salt, pin_hash, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, ?8, ?9)
      `)
      .bind(userId, valid.cleanName, nameKey, emailCheck.clean || null, emailCheck.clean || null, salt, pinHash, nowIso, nowIso)
      .run();
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("unique")) {
      return json({ error: "Name or email already exists. Please choose another." }, 409);
    }
    throw err;
  }

  await db
    .prepare("INSERT OR REPLACE INTO ezra_profile_states (user_id, state_json, updated_at) VALUES (?1, ?2, ?3)")
    .bind(userId, "{}", nowIso)
    .run();
  await upsertUserScore(db, userId, 0);
  await upsertUserPreference(db, userId, false);
  await ensureDefaultLeagueForUser(db, userId);

  const token = await createSession(db, userId);
  return json(
    {
      token,
      user: {
        id: userId,
        name: valid.cleanName,
        email: emailCheck.clean || "",
        hasRecoveryEmail: Boolean(emailCheck.clean),
      },
    },
    200
  );
}

async function handleAccountLogin(db, request) {
  const body = await parseJson(request);
  const valid = validateCredentials(body?.name, body?.pin);
  if (!valid.ok) return json({ error: "Invalid login details." }, 400);

  const nameKey = valid.cleanName.toLowerCase();
  const row = await db
    .prepare("SELECT id, name, email, pin_salt, pin_hash FROM ezra_users WHERE name_key = ?1 LIMIT 1")
    .bind(nameKey)
    .first();
  if (!row) return json({ error: "Account not found." }, 404);

  const checkHash = await sha256Hex(`${row.pin_salt}:${valid.cleanPin}`);
  if (checkHash !== row.pin_hash) return json({ error: "Invalid PIN." }, 401);

  const token = await createSession(db, row.id);
  return json(
    {
      token,
      user: {
        id: row.id,
        name: row.name,
        email: String(row.email || ""),
        hasRecoveryEmail: Boolean(row.email),
      },
    },
    200
  );
}

async function handleAccountMe(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  return json(
    {
      user: {
        id: session.user_id,
        name: session.name,
        email: String(session.email || ""),
        hasRecoveryEmail: Boolean(session.email),
        emailVerifiedAt: session.email_verified_at || null,
      },
    },
    200
  );
}

async function handleAccountUpdateMe(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const emailCheck = validateEmail(body?.email);
  if (!emailCheck.ok || !emailCheck.clean) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  const emailOwner = await db
    .prepare("SELECT id FROM ezra_users WHERE email_key = ?1 AND id <> ?2 LIMIT 1")
    .bind(emailCheck.clean, session.user_id)
    .first();
  if (emailOwner?.id) {
    return json({ error: "Email already in use by another account." }, 409);
  }
  const nowIso = new Date().toISOString();
  await db
    .prepare("UPDATE ezra_users SET email = ?2, email_key = ?3, updated_at = ?4 WHERE id = ?1")
    .bind(session.user_id, emailCheck.clean, emailCheck.clean, nowIso)
    .run();
  return json(
    {
      ok: true,
      user: {
        id: session.user_id,
        name: session.name,
        email: emailCheck.clean,
        hasRecoveryEmail: true,
        emailVerifiedAt: session.email_verified_at || null,
      },
    },
    200
  );
}

async function handleAccountRecoveryStart(db, request, env) {
  const body = await parseJson(request);
  const cleanName = normalizeName(body?.name);
  const nameKey = cleanName.toLowerCase();
  const emailCheck = validateEmail(body?.email);
  if (!cleanName || !emailCheck.ok || !emailCheck.clean) {
    return json({ error: "Enter your display name and recovery email." }, 400);
  }
  const row = await db
    .prepare("SELECT id, email_key FROM ezra_users WHERE name_key = ?1 LIMIT 1")
    .bind(nameKey)
    .first();
  if (!row || !row.email_key || String(row.email_key) !== emailCheck.clean) {
    return json({ ok: true, sent: true, generic: true }, 200);
  }
  const recovery = await createRecoveryCode(db, String(row.id), emailCheck.clean, "pin_reset");
  let sent = false;
  try {
    const out = await sendRecoveryEmail(env, emailCheck.clean, recovery.code);
    sent = Boolean(out.ok);
  } catch {
    sent = false;
  }
  const isDevReveal = String(env?.EZRA_DEV_AUTH_CODE || "").trim() === "1";
  return json(
    {
      ok: true,
      sent,
      generic: true,
      ...(sent ? {} : { detail: "Email not configured. Set RESEND_API_KEY and EZRA_FROM_EMAIL." }),
      ...(isDevReveal ? { devCode: recovery.code } : {}),
    },
    200
  );
}

async function handleAccountRecoveryComplete(db, request) {
  const body = await parseJson(request);
  const cleanName = normalizeName(body?.name);
  const nameKey = cleanName.toLowerCase();
  const emailCheck = validateEmail(body?.email);
  const valid = validateCredentials(body?.name, body?.newPin);
  if (!cleanName || !emailCheck.ok || !emailCheck.clean) {
    return json({ error: "Enter your display name and recovery email." }, 400);
  }
  if (!valid.ok) return json({ error: valid.message }, 400);
  const code = String(body?.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    return json({ error: "Enter the 6-digit recovery code." }, 400);
  }

  const user = await db
    .prepare("SELECT id, name, email_key FROM ezra_users WHERE name_key = ?1 LIMIT 1")
    .bind(nameKey)
    .first();
  if (!user || !user.email_key || String(user.email_key) !== emailCheck.clean) {
    return json({ error: "Account details do not match." }, 404);
  }
  const verification = await consumeRecoveryCode(db, String(user.id), emailCheck.clean, code, "pin_reset");
  if (!verification.ok) return json({ error: verification.error }, 400);

  const salt = randomHex(10);
  const pinHash = await sha256Hex(`${salt}:${valid.cleanPin}`);
  const nowIso = new Date().toISOString();
  await db
    .prepare("UPDATE ezra_users SET pin_salt = ?2, pin_hash = ?3, updated_at = ?4 WHERE id = ?1")
    .bind(String(user.id), salt, pinHash, nowIso)
    .run();
  const token = await createSession(db, String(user.id));
  return json(
    {
      ok: true,
      token,
      user: {
        id: String(user.id),
        name: String(user.name || cleanName),
        email: emailCheck.clean,
        hasRecoveryEmail: true,
      },
    },
    200
  );
}

async function handleAccountGetPreferences(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const prefs = await getUserPreference(db, session.user_id);
  return json({ preferences: prefs }, 200);
}

async function handleAccountPutPreferences(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const kidsMode = Boolean(body?.kidsMode);
  await upsertUserPreference(db, session.user_id, kidsMode);
  const prefs = await getUserPreference(db, session.user_id);
  return json({ ok: true, preferences: prefs }, 200);
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
  const parsed = safeParseJsonText(row?.state_json || "{}");
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
  const season = currentSevenDaySeasonWindow();
  const detailed = await Promise.all(
    leagues.map(async (league) => {
      let standings = [];
      try {
        standings = await leagueStandings(db, league.code, key);
      } catch {
        standings = await leagueStandingsFallback(db, league.code);
      }
      return {
        code: league.code,
        name: normalizeLeagueName(league.name, `League ${league.code}`),
        ownerUserId: league.owner_user_id,
        isOwner: String(league.owner_user_id || "") === String(session.user_id || ""),
        memberCount: Number(league.member_count || 0),
        season: {
          seasonId: season.seasonId,
          startsAt: season.startsAt,
          endsAt: season.endsAt,
        },
        standings,
      };
    })
  );
  return json({ leagues: detailed }, 200);
}

async function handleChallengeDashboard(db, request, key) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  await ensureAchievementCatalog(db);
  const prefs = await getUserPreference(db, session.user_id);
  const progress = await db
    .prepare(
      `
      SELECT current_streak, best_streak, last_quest_date, combo_count, best_combo, combo_updated_at, updated_at
      FROM ezra_user_progress
      WHERE user_id = ?1
      LIMIT 1
      `
    )
    .bind(session.user_id)
    .first();
  const achievements = await db
    .prepare(
      `
      SELECT a.code, a.name, a.description, a.icon, ua.earned_at
      FROM ezra_user_achievements ua
      JOIN ezra_achievements a ON a.code = ua.achievement_code
      WHERE ua.user_id = ?1
      ORDER BY ua.earned_at DESC
      `
    )
    .bind(session.user_id)
    .all();
  const mastery = await db
    .prepare(
      `
      SELECT team_id, team_name, pred_count, result_correct, exact_correct, points_earned, updated_at
      FROM ezra_user_team_mastery
      WHERE user_id = ?1
      ORDER BY pred_count DESC, points_earned DESC, team_name COLLATE NOCASE ASC
      LIMIT 8
      `
    )
    .bind(session.user_id)
    .all();
  const lifetime = await db
    .prepare("SELECT points FROM ezra_user_scores WHERE user_id = ?1 LIMIT 1")
    .bind(session.user_id)
    .first();

  const leagues = await listLeaguesForUser(db, session.user_id);
  const currentLeagueCode = normalizeLeagueCode(leagues?.[0]?.code || "");
  let season = null;
  let seasonStandings = [];
  if (currentLeagueCode) {
    await syncLeagueScoresFromStates(db, currentLeagueCode, key);
    season = currentSevenDaySeasonWindow();
    await ensureLeagueSeason(db, currentLeagueCode, season);
    const standingsRows = await db
      .prepare(
        `
        SELECT u.id AS user_id, u.name, COALESCE(sp.points, 0) AS points
             ,(
               SELECT COUNT(*)
               FROM ezra_league_season_titles t
               WHERE t.league_code = lm.league_code
                 AND t.user_id = lm.user_id
             ) AS titles_won
        FROM ezra_league_members lm
        JOIN ezra_users u ON u.id = lm.user_id
        LEFT JOIN ezra_league_season_points sp
          ON sp.user_id = lm.user_id
         AND sp.league_code = lm.league_code
         AND sp.season_id = ?2
        WHERE lm.league_code = ?1
        ORDER BY points DESC, u.name COLLATE NOCASE ASC
        `
      )
      .bind(currentLeagueCode, season.seasonId)
      .all();
    seasonStandings = standingsRows?.results || [];
  }

  return json(
    {
      user: { id: session.user_id, name: session.name },
      preferences: prefs,
      progress: {
        currentStreak: Number(progress?.current_streak || 0),
        bestStreak: Number(progress?.best_streak || 0),
        lastQuestDate: progress?.last_quest_date || "",
        comboCount: Number(progress?.combo_count || 0),
        bestCombo: Number(progress?.best_combo || 0),
        updatedAt: progress?.updated_at || null,
      },
      achievements: achievements?.results || [],
      teamMastery: mastery?.results || [],
      lifetimePoints: Math.max(0, Number(lifetime?.points || 0)),
      currentSeason: season
        ? {
            leagueCode: currentLeagueCode,
            seasonId: season.seasonId,
            startsAt: season.startsAt,
            endsAt: season.endsAt,
            standings: seasonStandings,
          }
        : null,
    },
    200
  );
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

async function handleLeagueLeave(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const code = normalizeLeagueCode(body?.code);
  if (!code) return json({ error: "Invalid league code." }, 400);

  const league = await db
    .prepare("SELECT code, owner_user_id FROM ezra_leagues WHERE code = ?1 LIMIT 1")
    .bind(code)
    .first();
  if (!league) return json({ error: "League code not found." }, 404);
  if (String(league.owner_user_id || "") === String(session.user_id || "")) {
    return json({ error: "League owner cannot leave. Delete the league instead." }, 403);
  }

  await db
    .prepare("DELETE FROM ezra_league_members WHERE league_code = ?1 AND user_id = ?2")
    .bind(code, session.user_id)
    .run();

  await ensureDefaultLeagueForUser(db, session.user_id);
  return json({ ok: true, code }, 200);
}

async function handleLeagueDelete(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const code = normalizeLeagueCode(body?.code);
  if (!code) return json({ error: "Invalid league code." }, 400);

  const league = await db
    .prepare("SELECT code, owner_user_id FROM ezra_leagues WHERE code = ?1 LIMIT 1")
    .bind(code)
    .first();
  if (!league) return json({ error: "League code not found." }, 404);
  if (String(league.owner_user_id || "") !== String(session.user_id || "")) {
    return json({ error: "Only league owner can delete this league." }, 403);
  }

  await db.prepare("DELETE FROM ezra_league_season_points WHERE league_code = ?1").bind(code).run();
  await db.prepare("DELETE FROM ezra_league_season_titles WHERE league_code = ?1").bind(code).run();
  await db.prepare("DELETE FROM ezra_points_ledger WHERE league_code = ?1").bind(code).run();
  await db.prepare("DELETE FROM ezra_league_seasons WHERE league_code = ?1").bind(code).run();
  await db.prepare("DELETE FROM ezra_league_members WHERE league_code = ?1").bind(code).run();
  await db.prepare("DELETE FROM ezra_leagues WHERE code = ?1").bind(code).run();

  await ensureDefaultLeagueForUser(db, session.user_id);
  return json({ ok: true, code }, 200);
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

async function handleLeagueMemberView(db, request, key) {
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
  const season = currentSevenDaySeasonWindow();
  await ensureLeagueSeason(db, code, season);
  const targetCurrentWeek = await db
    .prepare(
      `
      SELECT points
      FROM ezra_league_season_points
      WHERE league_code = ?1 AND season_id = ?2 AND user_id = ?3
      LIMIT 1
      `
    )
    .bind(code, season.seasonId, userId)
    .first();
  const targetLifetime = await db
    .prepare("SELECT points FROM ezra_user_scores WHERE user_id = ?1 LIMIT 1")
    .bind(userId)
    .first();
  const viewerCurrentWeek = await db
    .prepare(
      `
      SELECT points
      FROM ezra_league_season_points
      WHERE league_code = ?1 AND season_id = ?2 AND user_id = ?3
      LIMIT 1
      `
    )
    .bind(code, season.seasonId, session.user_id)
    .first();
  const viewerLifetime = await db
    .prepare("SELECT points FROM ezra_user_scores WHERE user_id = ?1 LIMIT 1")
    .bind(session.user_id)
    .first();
  const targetTitles = await db
    .prepare(
      `
      SELECT COUNT(1) AS c
      FROM ezra_league_season_titles
      WHERE league_code = ?1 AND user_id = ?2
      `
    )
    .bind(code, userId)
    .first();
  const viewerTitles = await db
    .prepare(
      `
      SELECT COUNT(1) AS c
      FROM ezra_league_season_titles
      WHERE league_code = ?1 AND user_id = ?2
      `
    )
    .bind(code, session.user_id)
    .first();
  const state = safeParseJsonText(stateRow?.state_json || "{}");
  const memberId = `acct:${userId}`;
  const allPredictions = state?.familyLeague?.predictions && typeof state.familyLeague.predictions === "object" ? state.familyLeague.predictions : {};
  const resultCache = new Map();
  const predictions = (
    await Promise.all(
      Object.values(allPredictions)
        .filter((record) => record && typeof record === "object" && record.entries && typeof record.entries === "object" && record.entries[memberId])
        .map(async (record) => {
          const pick = record.entries[memberId] || {};
          const pickHome = Number.isFinite(Number(pick.home)) ? Number(pick.home) : null;
          const pickAway = Number.isFinite(Number(pick.away)) ? Number(pick.away) : null;
          const eventId = String(record.eventId || "");
          const result = eventId
            ? await fetchEventResultById(String(key || "074910"), eventId, resultCache, db, { kickoffIso: String(record.kickoff || "") })
            : { final: false, home: null, away: null };
          const finalHome = result.final && result.home !== null ? result.home : Number.isFinite(Number(record.finalHome)) ? Number(record.finalHome) : null;
          const finalAway = result.final && result.away !== null ? result.away : Number.isFinite(Number(record.finalAway)) ? Number(record.finalAway) : null;
          const settled = Boolean(record.settled) || Boolean(result.final);
          let awarded = Number.isFinite(Number(pick.awarded)) ? Number(pick.awarded) : 0;
          if (settled && pickHome !== null && pickAway !== null && finalHome !== null && finalAway !== null) {
            if (pickHome === finalHome && pickAway === finalAway) {
              awarded = 2;
            } else if (predictionResultCode(pickHome, pickAway) === predictionResultCode(finalHome, finalAway)) {
              awarded = 1;
            } else {
              awarded = 0;
            }
          }
          return {
            eventId,
            homeTeam: record.homeTeam || "",
            awayTeam: record.awayTeam || "",
            kickoff: record.kickoff || "",
            settled,
            finalHome,
            finalAway,
            pick: {
              home: pickHome,
              away: pickAway,
              awarded,
              scored: settled,
              submittedAt: pick.submittedAt || "",
            },
          };
        })
    )
  ).sort((a, b) => String(b.kickoff || "").localeCompare(String(a.kickoff || "")));

  const dreamTeam = state?.dreamTeam && typeof state.dreamTeam === "object" ? state.dreamTeam : null;
  return json(
    {
      user: { id: userRow.id, name: userRow.name || "User", titlesWon: Math.max(0, Number(targetTitles?.c || 0)) },
      leagueCode: code,
      points: {
        currentWeek: Math.max(0, Number(targetCurrentWeek?.points || 0)),
        total: Math.max(0, Number(targetLifetime?.points || 0)),
      },
      viewerPoints: {
        currentWeek: Math.max(0, Number(viewerCurrentWeek?.points || 0)),
        total: Math.max(0, Number(viewerLifetime?.points || 0)),
      },
      viewerTitlesWon: Math.max(0, Number(viewerTitles?.c || 0)),
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
  const season = currentSevenDaySeasonWindow();
  await ensureLeagueSeason(db, code, season);
  let standings = [];
  try {
    standings = await leagueStandings(db, code, key);
  } catch {
    standings = await leagueStandingsFallback(db, code);
  }
  return json(
    {
      league: {
        code,
        name: normalizeLeagueName(league.name, `League ${code}`),
        ownerUserId: league.owner_user_id || "",
        createdAt: league.created_at || null,
        memberCount: standings.length,
      },
      season: {
        seasonId: season.seasonId,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
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
    if (route === "me" && (request.method === "PATCH" || request.method === "PUT")) {
      return handleAccountUpdateMe(db, request);
    }
    if (route === "preferences" && request.method === "GET") {
      return handleAccountGetPreferences(db, request);
    }
    if (route === "preferences" && (request.method === "PUT" || request.method === "PATCH")) {
      return handleAccountPutPreferences(db, request);
    }
    if (route === "logout" && request.method === "POST") {
      return handleAccountLogout(db, request);
    }
    if (route === "recovery/start" && request.method === "POST") {
      return handleAccountRecoveryStart(db, request, env);
    }
    if (route === "recovery/complete" && request.method === "POST") {
      return handleAccountRecoveryComplete(db, request);
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
    if (route === "league/leave" && request.method === "POST") {
      return handleLeagueLeave(db, request);
    }
    if (route === "league/delete" && request.method === "POST") {
      return handleLeagueDelete(db, request);
    }
    if (route === "league/member" && request.method === "GET") {
      return handleLeagueMemberView(db, request, key);
    }
    if (route === "league/standings" && request.method === "GET") {
      return handlePublicLeagueStandings(db, request, key);
    }
    if (route === "challenges/dashboard" && request.method === "GET") {
      return handleChallengeDashboard(db, request, key);
    }
    if (route === "cron/settle" && (request.method === "POST" || request.method === "GET")) {
      return handleCronSettle(db, request, key, env);
    }
    if (route === "cron/fixtures" && (request.method === "POST" || request.method === "GET")) {
      const incoming = String(request.headers.get("x-ezra-cron-secret") || "").trim();
      const configured = String(env.EZRA_CRON_SECRET || "").trim();
      if (!configured || incoming !== configured) {
        return json({ error: "Unauthorized cron call" }, 401);
      }
      const todayIso = new Date().toISOString().slice(0, 10);
      const chunk = Math.max(1, Math.min(30, Number(env.EZRA_FIXTURE_CRON_CHUNK || 12)));
      let cursor = await getIngestStateNumber(db, "fixtures_backfill_cursor", -FIXTURE_HISTORY_DAYS);
      if (cursor < -FIXTURE_HISTORY_DAYS || cursor > FIXTURE_FUTURE_DAYS) {
        cursor = -FIXTURE_HISTORY_DAYS;
      }

      const results = [];
      const offsets = [];
      for (let i = 0; i < chunk; i += 1) {
        offsets.push(cursor + i);
      }
      for (const leagueId of TABLE_LEAGUE_IDS) {
        let upserts = 0;
        for (const offset of offsets) {
          const targetIso = addDaysIso(todayIso, offset);
          const out = await ingestLeagueFixtureFeeds(db, key, leagueId, targetIso);
          upserts += Number(out.count || 0);
        }
        results.push({ leagueId, upserts, daysProcessed: offsets.length });
      }
      let nextCursor = cursor + chunk;
      if (nextCursor > FIXTURE_FUTURE_DAYS) {
        nextCursor = -FIXTURE_HISTORY_DAYS;
      }
      await setIngestStateNumber(db, "fixtures_backfill_cursor", nextCursor);
      return json({ ok: true, date: todayIso, cursor, nextCursor, chunk, results }, 200);
    }
    if (route === "cron/fixtures/full" && (request.method === "POST" || request.method === "GET")) {
      const incoming = String(request.headers.get("x-ezra-cron-secret") || "").trim();
      const configured = String(env.EZRA_CRON_SECRET || "").trim();
      if (!configured || incoming !== configured) {
        return json({ error: "Unauthorized cron call" }, 401);
      }
      const todayIso = new Date().toISOString().slice(0, 10);
      const seasons = seasonCandidatesForSweep(todayIso);
      const results = [];
      for (const leagueId of TABLE_LEAGUE_IDS) {
        const seasonResults = [];
        let totalUpserts = 0;
        for (const season of seasons) {
          const out = await ingestLeagueSeasonFixtures(db, key, leagueId, season);
          seasonResults.push(out);
          totalUpserts += Number(out.upserts || 0);
        }
        const dayOut = await ingestLeagueFixtureFeeds(db, key, leagueId, todayIso);
        totalUpserts += Number(dayOut.count || 0);
        results.push({
          leagueId,
          seasons: seasonResults,
          dayUpserts: Number(dayOut.count || 0),
          totalUpserts,
        });
      }
      await setIngestStateNumber(db, "fixtures_backfill_cursor", -FIXTURE_HISTORY_DAYS);
      return json({ ok: true, date: todayIso, seasons, results }, 200);
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
const FIXTURE_HISTORY_DAYS = 92;
const FIXTURE_FUTURE_DAYS = 183;
const LIVE_SNAPSHOT_REFRESH_MS = 60 * 1000;
const LIVE_STREAM_POLL_MS = 5000;
const LIVE_STREAM_MAX_MS = 55 * 1000;

function tableDataCacheKey(origin, leagueId) {
  return new Request(`${origin}/api/internal/tables/${leagueId}`);
}

function tableMetaCacheKey(origin) {
  return new Request(`${origin}/api/internal/tables/_meta`);
}

function liveSnapshotCacheKey(origin) {
  return new Request(`${origin}/api/internal/live/_snapshot`);
}

function clubQuizCacheKey(origin, dateIso) {
  return new Request(`${origin}/api/internal/clubquiz/${dateIso}`);
}

function hashTextSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seedText) {
  let x = hashTextSeed(seedText) || 123456789;
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFromPoolDeterministic(pool, count, rng) {
  const list = [...pool];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, Math.max(0, count));
}

async function handleEzraClubQuizRoute(context, key) {
  const { request } = context;
  const url = new URL(request.url);
  const dateIso = normalizeEventDate(url.searchParams.get("d")) || new Date().toISOString().slice(0, 10);
  const origin = `${url.protocol}//${url.host}`;
  const cache = caches.default;
  const cacheKey = clubQuizCacheKey(origin, dateIso);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const leagueIds = TABLE_LEAGUE_IDS;
  const leagueNames = {
    "4328": "English Premier League",
    "4329": "English League Championship",
  };

  const tablePayloads = await Promise.all(
    leagueIds.map((leagueId) => fetchSportsDb("v1", key, `lookuptable.php?l=${encodeURIComponent(leagueId)}`).catch(() => null))
  );
  const baseTeams = [];
  tablePayloads.forEach((payload, idx) => {
    const leagueId = leagueIds[idx];
    firstArray(payload).forEach((row) => {
      const idTeam = String(row?.idTeam || "").trim();
      const strTeam = String(row?.strTeam || "").trim();
      if (!idTeam || !strTeam) return;
      baseTeams.push({
        idTeam,
        strTeam,
        strLeague: leagueNames[leagueId] || "",
        strBadge: String(row?.strTeamBadge || row?.strBadge || "").trim(),
      });
    });
  });
  const uniqueTeams = [];
  const seenTeamIds = new Set();
  for (const team of baseTeams) {
    if (seenTeamIds.has(team.idTeam)) continue;
    seenTeamIds.add(team.idTeam);
    uniqueTeams.push(team);
  }
  if (uniqueTeams.length < 8) {
    return json({ date: dateIso, questions: [], error: "Insufficient team pool for club quiz." }, 200);
  }

  const rng = seededRng(`clubquiz:${dateIso}`);
  const detailCandidates = pickFromPoolDeterministic(uniqueTeams, Math.min(18, uniqueTeams.length), rng);
  const detailPayloads = await Promise.all(
    detailCandidates.map((team) => fetchSportsDb("v1", key, `lookupteam.php?id=${encodeURIComponent(team.idTeam)}`).catch(() => null))
  );
  const detailedTeams = detailPayloads
    .map((payload, idx) => {
      const team = firstArray(payload)?.[0] || {};
      const base = detailCandidates[idx];
      return {
        idTeam: base.idTeam,
        strTeam: String(team?.strTeam || base.strTeam || "").trim(),
        strLeague: String(team?.strLeague || base.strLeague || "").trim(),
        strBadge: String(team?.strBadge || base.strBadge || "").trim(),
        strStadium: String(team?.strStadium || "").trim(),
        strStadiumThumb: String(team?.strStadiumThumb || "").trim(),
      };
    })
    .filter((team) => team.idTeam && team.strTeam);

  const poolByName = detailedTeams.filter((team) => team.strTeam);
  const poolWithBadges = detailedTeams.filter((team) => team.strBadge);
  const poolWithStadiumImage = detailedTeams.filter((team) => team.strStadium && team.strStadiumThumb);
  const poolWithLeague = detailedTeams.filter((team) => team.strLeague);
  const questions = [];

  const makeOptions = (answer, optionsPool, optionLabelFn) => {
    const distractors = pickFromPoolDeterministic(
      optionsPool.filter((item) => optionLabelFn(item) !== answer),
      3,
      rng
    )
      .map(optionLabelFn)
      .filter(Boolean);
    const merged = [answer, ...distractors];
    const shuffled = pickFromPoolDeterministic(merged, merged.length, rng);
    const answerIndex = shuffled.findIndex((x) => x === answer);
    return { options: shuffled, answerIndex };
  };

  if (poolWithBadges.length >= 4) {
    const answer = poolWithBadges[Math.floor(rng() * poolWithBadges.length)];
    const opt = makeOptions(answer.strTeam, poolByName, (team) => team.strTeam);
    if (opt.options.length >= 2 && opt.answerIndex >= 0) {
      questions.push({
        id: `logo:${answer.idTeam}`,
        type: "logo",
        prompt: "Whose club logo is this?",
        imageUrl: answer.strBadge,
        imageAlt: `${answer.strTeam} badge`,
        teamId: answer.idTeam,
        options: opt.options,
        answerIndex: opt.answerIndex,
      });
    }
  }

  if (poolWithStadiumImage.length >= 4) {
    const answer = poolWithStadiumImage[Math.floor(rng() * poolWithStadiumImage.length)];
    const opt = makeOptions(answer.strTeam, poolByName, (team) => team.strTeam);
    if (opt.options.length >= 2 && opt.answerIndex >= 0) {
      questions.push({
        id: `stadium:${answer.idTeam}`,
        type: "stadium",
        prompt: "Whose stadium is this?",
        imageUrl: answer.strStadiumThumb,
        imageAlt: `${answer.strStadium} stadium`,
        teamId: answer.idTeam,
        options: opt.options,
        answerIndex: opt.answerIndex,
      });
    }
  }

  if (poolWithLeague.length >= 4) {
    const answer = poolWithLeague[Math.floor(rng() * poolWithLeague.length)];
    const leagueOptionPool = [
      "English Premier League",
      "English League Championship",
      "Spanish La Liga",
      "Italian Serie A",
    ];
    const answerLeague = answer.strLeague || "English Premier League";
    const leagueDistractors = pickFromPoolDeterministic(
      leagueOptionPool.filter((name) => name !== answerLeague),
      3,
      rng
    );
    const options = pickFromPoolDeterministic([answerLeague, ...leagueDistractors], 4, rng);
    const answerIndex = options.findIndex((x) => x === answerLeague);
    questions.push({
      id: `league:${answer.idTeam}`,
      type: "league",
      prompt: `Which league does ${answer.strTeam} play in?`,
      imageUrl: answer.strBadge || "",
      imageAlt: `${answer.strTeam} badge`,
      teamId: answer.idTeam,
      options,
      answerIndex,
    });
  }

  // Backfill with stadium-name question if one of the above is unavailable.
  if (questions.length < 3) {
    const poolWithStadium = detailedTeams.filter((team) => team.strStadium);
    if (poolWithStadium.length >= 4) {
      const answer = poolWithStadium[Math.floor(rng() * poolWithStadium.length)];
      const options = pickFromPoolDeterministic(
        [answer, ...pickFromPoolDeterministic(poolWithStadium.filter((team) => team.idTeam !== answer.idTeam), 3, rng)],
        4,
        rng
      ).map((team) => team.strStadium);
      const answerIndex = options.findIndex((name) => name === answer.strStadium);
      if (answerIndex >= 0) {
        questions.push({
          id: `stadium-name:${answer.idTeam}`,
          type: "stadium-name",
          prompt: `What is the home stadium of ${answer.strTeam}?`,
          imageUrl: answer.strBadge || "",
          imageAlt: `${answer.strTeam} badge`,
          teamId: answer.idTeam,
          options,
          answerIndex,
        });
      }
    }
  }

  const finalQuestions = pickFromPoolDeterministic(questions, Math.min(3, questions.length), rng).map((q, idx) => ({
    ...q,
    order: idx + 1,
  }));
  const response = json(
    {
      date: dateIso,
      questions: finalQuestions,
      source: "server",
    },
    200,
    { "Cache-Control": "public, max-age=3600, s-maxage=3600" }
  );
  await cache.put(cacheKey, response.clone());
  return response;
}

async function fetchSportsDb(version, key, pathWithQuery) {
  const upstream = upstreamUrl(version, key, pathWithQuery);
  if (!upstream) throw new Error("Invalid API version");
  const upstreamRes = await fetchUpstreamWithRetry(upstream, {
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

function fixtureCacheKey(event) {
  if (event?.idEvent) return String(event.idEvent);
  const date = String(event?.dateEvent || "").trim();
  const home = String(event?.strHomeTeam || "").trim().toLowerCase();
  const away = String(event?.strAwayTeam || "").trim().toLowerCase();
  if (!date || !home || !away) return "";
  return `fallback:${date}:${home}:${away}`;
}

function normalizeEventDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function addDaysIso(baseIso, deltaDays) {
  const dt = new Date(`${baseIso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return dt.toISOString().slice(0, 10);
}

function fixtureDateInWindow(dateIso, todayIso) {
  const minIso = addDaysIso(todayIso, -FIXTURE_HISTORY_DAYS);
  const maxIso = addDaysIso(todayIso, FIXTURE_FUTURE_DAYS);
  return dateIso >= minIso && dateIso <= maxIso;
}

function seasonFromDateIso(dateIso) {
  const iso = normalizeEventDate(dateIso);
  if (!iso) return "";
  const [yearStr, monthStr] = iso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function seasonCandidatesForDate(dayIso, todayIso) {
  const set = new Set();
  const daySeason = seasonFromDateIso(dayIso);
  const todaySeason = seasonFromDateIso(todayIso);
  if (daySeason) set.add(daySeason);
  if (todaySeason) set.add(todaySeason);
  if (daySeason) {
    const [y] = daySeason.split("-").map(Number);
    if (Number.isFinite(y)) {
      set.add(`${y - 1}-${y}`);
      set.add(`${y + 1}-${y + 2}`);
    }
  }
  return [...set].filter(Boolean);
}

function seasonCandidatesForSweep(todayIso) {
  const todaySeason = seasonFromDateIso(todayIso);
  if (!todaySeason) return [];
  const [start] = todaySeason.split("-").map(Number);
  if (!Number.isFinite(start)) return [todaySeason];
  return [`${start - 1}-${start}`, todaySeason, `${start + 1}-${start + 2}`];
}

function normalizeTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, 8);
}

function mergeEventsByKey(events) {
  const map = new Map();
  for (const event of events || []) {
    if (!event || typeof event !== "object") continue;
    const key = fixtureCacheKey(event);
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, ...event } : event);
  }
  return [...map.values()];
}

function sortByDateTime(events) {
  return [...(events || [])].sort((a, b) => {
    const ta = `${normalizeEventDate(a?.dateEvent)}T${normalizeTime(a?.strTime || "00:00:00")}`;
    const tb = `${normalizeEventDate(b?.dateEvent)}T${normalizeTime(b?.strTime || "00:00:00")}`;
    return ta.localeCompare(tb);
  });
}

async function upsertFixtures(db, leagueId, events) {
  if (!db || !Array.isArray(events) || !events.length) return 0;
  const now = Date.now();
  let count = 0;
  for (const raw of events) {
    const event = raw && typeof raw === "object" ? raw : null;
    if (!event) continue;
    const eventId = fixtureCacheKey(event);
    const dateEvent = normalizeEventDate(event.dateEvent);
    if (!eventId || !dateEvent) continue;
    await db
      .prepare(
        `
        INSERT INTO ezra_fixtures_cache (event_id, league_id, date_event, str_time, status_text, payload_json, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(event_id) DO UPDATE SET
          league_id = excluded.league_id,
          date_event = excluded.date_event,
          str_time = excluded.str_time,
          status_text = excluded.status_text,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
        `
      )
      .bind(
        eventId,
        String(leagueId || ""),
        dateEvent,
        normalizeTime(event.strTime),
        String(event.strStatus || event.strProgress || ""),
        JSON.stringify(event),
        now
      )
      .run();
    count += 1;
  }
  return count;
}

async function readFixturesByLeagueDate(db, leagueId, dateIso) {
  const rows = await db
    .prepare(
      `
      SELECT payload_json
      FROM ezra_fixtures_cache
      WHERE league_id = ?1 AND date_event = ?2
      ORDER BY COALESCE(str_time, '') ASC, event_id ASC
      `
    )
    .bind(String(leagueId), String(dateIso))
    .all();
  const list = Array.isArray(rows?.results) ? rows.results : [];
  return list
    .map((row) => safeParseJsonText(row?.payload_json))
    .filter((event) => event && typeof event === "object");
}

async function ingestLeagueFixtureFeeds(db, key, leagueId, dayIso = "") {
  const day = normalizeEventDate(dayIso) || new Date().toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const prevDay = new Date(`${day}T00:00:00Z`);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const nextDay = new Date(`${day}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const prevIso = prevDay.toISOString().slice(0, 10);
  const nextIso = nextDay.toISOString().slice(0, 10);
  const dayDelta = Math.abs((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
  const seasons = seasonCandidatesForDate(day, todayIso);

  const [todayFeed, prevFeed, nextFeed, pastFeed, futureFeed, liveFeed, ...seasonFeeds] = await Promise.all([
    fetchSportsDb("v1", key, `eventsday.php?d=${encodeURIComponent(day)}&l=${encodeURIComponent(leagueId)}`).catch(() => null),
    fetchSportsDb("v1", key, `eventsday.php?d=${encodeURIComponent(prevIso)}&l=${encodeURIComponent(leagueId)}`).catch(() => null),
    fetchSportsDb("v1", key, `eventsday.php?d=${encodeURIComponent(nextIso)}&l=${encodeURIComponent(leagueId)}`).catch(() => null),
    fetchSportsDb("v1", key, `eventspastleague.php?id=${encodeURIComponent(leagueId)}`).catch(() => null),
    fetchSportsDb("v1", key, `eventsnextleague.php?id=${encodeURIComponent(leagueId)}`).catch(() => null),
    fetchSportsDb("v2", key, `livescore/${encodeURIComponent(leagueId)}`).catch(() => null),
    ...(dayDelta > 7
      ? seasons.map((season) =>
          fetchSportsDb("v1", key, `eventsseason.php?id=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(season)}`).catch(() => null)
        )
      : []),
  ]);

  const merged = mergeEventsByKey([
    ...firstArray(todayFeed),
    ...firstArray(prevFeed),
    ...firstArray(nextFeed),
    ...firstArray(pastFeed),
    ...firstArray(futureFeed),
    ...firstArray(liveFeed),
    ...seasonFeeds.flatMap((payload) => firstArray(payload)),
  ]);
  const count = await upsertFixtures(db, leagueId, merged);
  return { count, merged, seasonsUsed: dayDelta > 7 ? seasons : [] };
}

async function ingestLeagueSeasonFixtures(db, key, leagueId, season) {
  const payload = await fetchSportsDb("v1", key, `eventsseason.php?id=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(season)}`);
  const events = mergeEventsByKey(firstArray(payload));
  const upserts = await upsertFixtures(db, leagueId, events);
  return { season, upserts };
}

async function getIngestStateNumber(db, key, fallback = 0) {
  const row = await db
    .prepare("SELECT value_text FROM ezra_fixture_ingest_state WHERE key = ?1 LIMIT 1")
    .bind(String(key))
    .first();
  const n = Number(row?.value_text);
  return Number.isFinite(n) ? n : Number(fallback);
}

async function setIngestStateNumber(db, key, value) {
  const now = Date.now();
  await db
    .prepare(
      `
      INSERT INTO ezra_fixture_ingest_state (key, value_text, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(key) DO UPDATE SET
        value_text = excluded.value_text,
        updated_at = excluded.updated_at
      `
    )
    .bind(String(key), String(Number(value || 0)), now)
    .run();
}

async function handleEzraFixturesRoute(context, key) {
  const { request, env } = context;
  const db = env.EZRA_DB;
  if (!db) {
    return json({ error: "Fixtures cache unavailable. Add D1 binding EZRA_DB." }, 503);
  }
  await ensureAccountSchema(db);
  const url = new URL(request.url);
  const leagueId = String(url.searchParams.get("l") || "").trim();
  const dateIso = normalizeEventDate(url.searchParams.get("d"));
  if (!TABLE_LEAGUE_IDS.includes(leagueId) || !dateIso) {
    return json({ error: "Missing or invalid parameters. Use l=4328|4329 and d=YYYY-MM-DD" }, 400);
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!fixtureDateInWindow(dateIso, todayIso)) {
    const minIso = addDaysIso(todayIso, -FIXTURE_HISTORY_DAYS);
    const maxIso = addDaysIso(todayIso, FIXTURE_FUTURE_DAYS);
    return json(
      {
        events: [],
        leagueId,
        date: dateIso,
        source: "d1",
        window: { min: minIso, max: maxIso },
      },
      200
    );
  }

  let fromCache = await readFixturesByLeagueDate(db, leagueId, dateIso);
  if (!fromCache.length) {
    // Respond fast and warm in the background to avoid request timeouts on user navigation.
    context.waitUntil(
      (async () => {
        try {
          await ingestLeagueFixtureFeeds(db, key, leagueId, dateIso);
          const check = await readFixturesByLeagueDate(db, leagueId, dateIso);
          if (check.length) return;
          const seasons = seasonCandidatesForDate(dateIso, todayIso);
          // Limit expensive season backfill during on-demand request warmup.
          for (const season of seasons.slice(0, 1)) {
            await ingestLeagueSeasonFixtures(db, key, leagueId, season).catch(() => null);
          }
        } catch {
          // Swallow background warm failures.
        }
      })()
    );
    return json(
      {
        events: [],
        leagueId,
        date: dateIso,
        source: "warming",
        warming: true,
        window: {
          min: addDaysIso(todayIso, -FIXTURE_HISTORY_DAYS),
          max: addDaysIso(todayIso, FIXTURE_FUTURE_DAYS),
        },
      },
      200,
      { "Cache-Control": "public, max-age=15, s-maxage=15" }
    );
  }

  return json(
    {
      events: sortByDateTime(fromCache),
      leagueId,
      date: dateIso,
      source: "d1",
      window: {
        min: addDaysIso(todayIso, -FIXTURE_HISTORY_DAYS),
        max: addDaysIso(todayIso, FIXTURE_FUTURE_DAYS),
      },
    },
    200,
    { "Cache-Control": "public, max-age=30, s-maxage=30" }
  );
}

async function handleEzraTeamFormRoute(context, key) {
  const { request, env } = context;
  const db = env.EZRA_DB;
  if (!db) {
    return json({ error: "Fixtures cache unavailable. Add D1 binding EZRA_DB." }, 503);
  }
  await ensureAccountSchema(db);
  const url = new URL(request.url);
  const leagueId = String(url.searchParams.get("leagueId") || "").trim();
  const teamId = String(url.searchParams.get("teamId") || "").trim();
  const teamName = String(url.searchParams.get("teamName") || "").trim();
  const maxGames = Math.max(1, Math.min(10, Number(url.searchParams.get("n") || 5)));
  if (!TABLE_LEAGUE_IDS.includes(leagueId) || (!teamId && !teamName)) {
    return json({ error: "Missing leagueId and teamId/teamName" }, 400);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const minIso = addDaysIso(todayIso, -FIXTURE_HISTORY_DAYS);
  const teamToken = normalizeTeamToken(teamName);
  const readMatched = async () => {
    const rows = await db
      .prepare(
        `
        SELECT payload_json
        FROM ezra_fixtures_cache
        WHERE league_id = ?1
          AND date_event >= ?2
          AND date_event <= ?3
        ORDER BY date_event DESC, COALESCE(str_time, '') DESC
        LIMIT 1400
        `
      )
      .bind(leagueId, minIso, todayIso)
      .all();

    const matched = [];
    const seen = new Set();
    const list = Array.isArray(rows?.results) ? rows.results : [];
    for (const row of list) {
      const event = safeParseJsonText(row?.payload_json);
      if (!event || typeof event !== "object") continue;
      const key = fixtureCacheKey(event);
      if (!key || seen.has(key)) continue;

      const home = numericScore(event.intHomeScore);
      const away = numericScore(event.intAwayScore);
      if (home === null || away === null) continue;

      const homeId = String(event.idHomeTeam || "").trim();
      const awayId = String(event.idAwayTeam || "").trim();
      const byId = teamId && (homeId === teamId || awayId === teamId);
      const byName =
        !byId &&
        teamToken &&
        (normalizeTeamToken(event.strHomeTeam) === teamToken || normalizeTeamToken(event.strAwayTeam) === teamToken);
      if (!byId && !byName) continue;

      seen.add(key);
      const isHome = byId ? homeId === teamId : normalizeTeamToken(event.strHomeTeam) === teamToken;
      const teamScore = isHome ? home : away;
      const oppScore = isHome ? away : home;
      let result = "D";
      if (teamScore > oppScore) result = "W";
      else if (teamScore < oppScore) result = "L";

      matched.push({
        idEvent: String(event.idEvent || ""),
        dateEvent: String(event.dateEvent || ""),
        strTime: String(event.strTime || ""),
        strHomeTeam: String(event.strHomeTeam || ""),
        strAwayTeam: String(event.strAwayTeam || ""),
        intHomeScore: home,
        intAwayScore: away,
        result,
      });
      if (matched.length >= maxGames) break;
    }
    return matched;
  };

  let matched = await readMatched();
  if (matched.length < maxGames) {
    const seasons = seasonCandidatesForSweep(todayIso);
    for (const season of seasons) {
      await ingestLeagueSeasonFixtures(db, key, leagueId, season).catch(() => null);
    }
    await ingestLeagueFixtureFeeds(db, key, leagueId, todayIso).catch(() => null);
    matched = await readMatched();
  }

  return json(
    {
      leagueId,
      teamId,
      teamName,
      results: matched.map((m) => m.result),
      matches: matched,
      source: "d1",
    },
    200,
    { "Cache-Control": "public, max-age=30, s-maxage=30" }
  );
}

async function handleEzraTeamFixturesRoute(context, key) {
  const { request, env } = context;
  const db = env.EZRA_DB;
  if (!db) {
    return json({ error: "Fixtures cache unavailable. Add D1 binding EZRA_DB." }, 503);
  }
  await ensureAccountSchema(db);
  const url = new URL(request.url);
  const leagueId = String(url.searchParams.get("leagueId") || "").trim();
  const teamId = String(url.searchParams.get("teamId") || "").trim();
  const teamName = String(url.searchParams.get("teamName") || "").trim();
  const fromIso = normalizeEventDate(url.searchParams.get("from"));
  const toIso = normalizeEventDate(url.searchParams.get("to"));
  const maxRows = Math.max(1, Math.min(600, Number(url.searchParams.get("limit") || 160)));
  if (!TABLE_LEAGUE_IDS.includes(leagueId) || (!teamId && !teamName) || !fromIso || !toIso) {
    return json({ error: "Missing/invalid params. Use leagueId, teamId/teamName, from, to." }, 400);
  }

  const teamToken = normalizeTeamToken(teamName);
  const readMatches = async () => {
    const rows = await db
      .prepare(
        `
        SELECT payload_json
        FROM ezra_fixtures_cache
        WHERE league_id = ?1
          AND date_event >= ?2
          AND date_event <= ?3
        ORDER BY date_event ASC, COALESCE(str_time, '') ASC
        LIMIT ?4
        `
      )
      .bind(leagueId, fromIso, toIso, maxRows)
      .all();
    const list = Array.isArray(rows?.results) ? rows.results : [];
    const matched = [];
    const seen = new Set();
    for (const row of list) {
      const event = safeParseJsonText(row?.payload_json);
      if (!event || typeof event !== "object") continue;
      const key = fixtureCacheKey(event);
      if (!key || seen.has(key)) continue;
      const homeId = String(event.idHomeTeam || "").trim();
      const awayId = String(event.idAwayTeam || "").trim();
      const byId = teamId && (homeId === teamId || awayId === teamId);
      const byName =
        !byId &&
        teamToken &&
        (normalizeTeamToken(event.strHomeTeam) === teamToken || normalizeTeamToken(event.strAwayTeam) === teamToken);
      if (!byId && !byName) continue;
      seen.add(key);
      matched.push(event);
    }
    return matched;
  };

  let events = await readMatches();
  if (!events.length) {
    await ingestLeagueFixtureFeeds(db, key, leagueId, fromIso).catch(() => null);
    await ingestLeagueFixtureFeeds(db, key, leagueId, toIso).catch(() => null);
    events = await readMatches();
  }

  return json(
    {
      events: sortByDateTime(events),
      leagueId,
      teamId,
      teamName,
      from: fromIso,
      to: toIso,
      source: "d1",
    },
    200,
    { "Cache-Control": "public, max-age=60, s-maxage=60" }
  );
}

function normalizeLeagueId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (TABLE_LEAGUE_IDS.includes(raw)) return raw;
  if (raw.toLowerCase().includes("premier")) return "4328";
  if (raw.toLowerCase().includes("championship")) return "4329";
  return "";
}

async function handleEzraLeagueRoute(context, key) {
  const { request } = context;
  const url = new URL(request.url);
  const leagueId = normalizeLeagueId(url.searchParams.get("id"));
  if (!leagueId) return json({ league: null }, 200);
  const payload = await fetchSportsDb("v1", key, `lookupleague.php?id=${encodeURIComponent(leagueId)}`).catch(() => null);
  const league = firstArray(payload)?.[0] || null;
  return json({ league }, 200, { "Cache-Control": "public, max-age=300, s-maxage=300" });
}

async function handleEzraTeamRoute(context, key) {
  const { request } = context;
  const url = new URL(request.url);
  const teamId = String(url.searchParams.get("id") || "").trim();
  if (!teamId) return json({ team: null }, 200);

  const payload = await fetchSportsDb("v1", key, `lookupteam.php?id=${encodeURIComponent(teamId)}`).catch(() => null);
  const team = firstArray(payload)?.[0] || null;
  return json({ team }, 200, { "Cache-Control": "public, max-age=300, s-maxage=300" });
}

async function handleEzraTeamPlayersRoute(context, key) {
  const { request } = context;
  const url = new URL(request.url);
  const teamId = String(url.searchParams.get("id") || "").trim();
  const teamName = String(url.searchParams.get("name") || "").trim();

  let players = [];
  if (teamId) {
    const byId = await fetchSportsDb("v1", key, `lookup_all_players.php?id=${encodeURIComponent(teamId)}`).catch(() => null);
    players = firstArray(byId);
  }
  if (!players.length && teamName) {
    const byName = await fetchSportsDb("v1", key, `searchplayers.php?t=${encodeURIComponent(teamName)}`).catch(() => null);
    players = firstArray(byName);
  }
  return json({ players }, 200, { "Cache-Control": "public, max-age=180, s-maxage=180" });
}

async function handleEzraPlayerRoute(context, key) {
  const { request } = context;
  const url = new URL(request.url);
  const playerId = String(url.searchParams.get("id") || "").trim();
  if (!playerId) return json({ player: null }, 200);
  const payload = await fetchSportsDb("v1", key, `lookupplayer.php?id=${encodeURIComponent(playerId)}`).catch(() => null);
  const player = firstArray(payload)?.[0] || null;
  return json({ player }, 200, { "Cache-Control": "public, max-age=300, s-maxage=300" });
}

async function findEventInFixturesCache(db, eventId) {
  if (!db || !eventId) return null;
  const row = await db
    .prepare(
      `
      SELECT payload_json
      FROM ezra_fixtures_cache
      WHERE event_id = ?1
      LIMIT 1
      `
    )
    .bind(String(eventId))
    .first();
  return safeParseJsonText(row?.payload_json || "");
}

async function handleEzraEventRoute(context, key) {
  const { request, env } = context;
  const db = env.EZRA_DB;
  const url = new URL(request.url);
  const eventId = String(url.searchParams.get("id") || "").trim();
  if (!eventId) return json({ event: null }, 200);

  if (db) {
    try {
      await ensureAccountSchema(db);
      const fromCache = await findEventInFixturesCache(db, eventId);
      if (fromCache && typeof fromCache === "object") {
        return json({ event: fromCache }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
      }
    } catch {
      // Continue to upstream fallback.
    }
  }

  const payload = await fetchSportsDb("v1", key, `lookupevent.php?id=${encodeURIComponent(eventId)}`).catch(() => null);
  const event = firstArray(payload)?.[0] || null;
  return json({ event }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
}

async function handleEzraEventStatsRoute(context, key) {
  const { request } = context;
  const url = new URL(request.url);
  const eventId = String(url.searchParams.get("id") || "").trim();
  if (!eventId) return json({ eventstats: [] }, 200);
  const payload = await fetchSportsDb("v1", key, `lookupeventstats.php?id=${encodeURIComponent(eventId)}`).catch(() => null);
  const eventstats = firstArray(payload);
  return json({ eventstats }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
}

function canonicalEventHash(event) {
  const parts = [
    String(event?.idEvent || ""),
    String(event?.dateEvent || ""),
    String(event?.strTime || ""),
    String(event?.strHomeTeam || ""),
    String(event?.strAwayTeam || ""),
    String(event?.intHomeScore ?? ""),
    String(event?.intAwayScore ?? ""),
    String(event?.strStatus || ""),
    String(event?.strProgress || ""),
    String(event?.strMinute || ""),
  ];
  return parts.join("|");
}

function eventKey(event) {
  if (event?.idEvent) return `id:${event.idEvent}`;
  return [
    "m",
    String(event?.dateEvent || ""),
    String(event?.strHomeTeam || "").toLowerCase(),
    String(event?.strAwayTeam || "").toLowerCase(),
  ].join("|");
}

function mergeEvents(baseEvents, liveEvents) {
  const byKey = new Map();
  [...(baseEvents || []), ...(liveEvents || [])].forEach((event) => {
    if (!event || typeof event !== "object") return;
    const key = eventKey(event);
    if (!key) return;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...event } : event);
  });
  return [...byKey.values()];
}

function sortEvents(events) {
  return [...(events || [])].sort((a, b) => {
    const ta = `${a?.dateEvent || ""}T${String(a?.strTime || "00:00:00").slice(0, 8)}`;
    const tb = `${b?.dateEvent || ""}T${String(b?.strTime || "00:00:00").slice(0, 8)}`;
    return ta.localeCompare(tb);
  });
}

function toClientEvent(event) {
  if (!event || typeof event !== "object") return null;
  return {
    idEvent: event.idEvent || "",
    dateEvent: event.dateEvent || "",
    strTime: event.strTime || "",
    strHomeTeam: event.strHomeTeam || "",
    strAwayTeam: event.strAwayTeam || "",
    idHomeTeam: event.idHomeTeam || "",
    idAwayTeam: event.idAwayTeam || "",
    intHomeScore: event.intHomeScore ?? null,
    intAwayScore: event.intAwayScore ?? null,
    strStatus: event.strStatus || "",
    strProgress: event.strProgress || "",
    strMinute: event.strMinute || "",
    strVenue: event.strVenue || "",
    strLeague: event.strLeague || "",
    strTimestamp: event.strTimestamp || "",
  };
}

function payloadVersion(payload) {
  const src = JSON.stringify(payload || {});
  let hash = 0;
  for (let i = 0; i < src.length; i += 1) {
    hash = (hash << 5) - hash + src.charCodeAt(i);
    hash |= 0;
  }
  return `v${Math.abs(hash)}`;
}

async function buildLiveSnapshot(key) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const leaguePayload = {};

  for (const leagueId of TABLE_LEAGUE_IDS) {
    const [todayById, liveV2] = await Promise.all([
      fetchSportsDb("v1", key, `eventsday.php?d=${encodeURIComponent(todayIso)}&l=${encodeURIComponent(leagueId)}`).catch(() => null),
      fetchSportsDb("v2", key, `livescore/${leagueId}`).catch(() => null),
    ]);

    const merged = mergeEvents(firstArray(todayById), firstArray(liveV2));
    leaguePayload[leagueId] = sortEvents(merged).map(toClientEvent).filter(Boolean);
  }

  const output = {
    updatedAt: Date.now(),
    todayIso,
    leagues: leaguePayload,
  };
  output.version = payloadVersion(output.leagues);
  return output;
}

function diffLiveSnapshots(prev, next) {
  const changed = {};
  for (const leagueId of TABLE_LEAGUE_IDS) {
    const prevMap = new Map((prev?.leagues?.[leagueId] || []).map((event) => [eventKey(event), canonicalEventHash(event)]));
    const nextEvents = next?.leagues?.[leagueId] || [];
    const leagueChanges = [];
    nextEvents.forEach((event) => {
      const key = eventKey(event);
      const prevHash = prevMap.get(key);
      const nextHash = canonicalEventHash(event);
      if (prevHash !== nextHash) {
        leagueChanges.push(event);
      }
    });
    changed[leagueId] = leagueChanges;
  }
  return changed;
}

async function readLiveSnapshot(cache, origin) {
  const cached = await cache.match(liveSnapshotCacheKey(origin));
  if (!cached) return null;
  try {
    return await cached.json();
  } catch {
    return null;
  }
}

async function ensureLiveSnapshot(cache, origin, key) {
  const cached = await readLiveSnapshot(cache, origin);
  const now = Date.now();
  if (cached && now - Number(cached.updatedAt || 0) < LIVE_SNAPSHOT_REFRESH_MS) {
    return { snapshot: cached, changedByLeague: {}, refreshed: false };
  }

  const next = await buildLiveSnapshot(key);
  const changedByLeague = diffLiveSnapshots(cached || { leagues: {} }, next);
  await cache.put(
    liveSnapshotCacheKey(origin),
    new Response(JSON.stringify(next), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=30, s-maxage=30",
      },
    })
  );
  return { snapshot: next, changedByLeague, refreshed: true };
}

function streamFrame(eventName, data) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function handleEzraLiveStreamRoute(context, key) {
  const { request } = context;
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const cache = caches.default;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let lastVersion = "";
      controller.enqueue(encoder.encode(`retry: 4000\n\n`));
      while (Date.now() - startedAt < LIVE_STREAM_MAX_MS && !request.signal.aborted) {
        try {
          const { snapshot, changedByLeague, refreshed } = await ensureLiveSnapshot(cache, origin, key);
          if (snapshot?.version && snapshot.version !== lastVersion) {
            const isFirst = !lastVersion;
            const payload = {
              full: isFirst,
              refreshed,
              version: snapshot.version,
              updatedAt: snapshot.updatedAt,
              todayIso: snapshot.todayIso,
              leagues: isFirst ? snapshot.leagues : changedByLeague,
            };
            controller.enqueue(encoder.encode(streamFrame("update", payload)));
            lastVersion = snapshot.version;
          }
        } catch (err) {
          controller.enqueue(encoder.encode(streamFrame("error", { message: String(err?.message || err) })));
        }
        await new Promise((resolve) => setTimeout(resolve, LIVE_STREAM_POLL_MS));
      }
      controller.close();
    },
    cancel() {},
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
    },
  });
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

  const settled = await Promise.allSettled(
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

  const tables = new Map();
  settled.forEach((item) => {
    if (item.status !== "fulfilled") return;
    const value = item.value;
    if (!Array.isArray(value) || value.length < 2) return;
    tables.set(value[0], value[1]);
  });

  if (!tables.size) {
    throw new Error("All league table refreshes failed");
  }

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
      const stale = await cache.match(dataKey);
      if (stale) {
        const headers = new Headers(stale.headers);
        headers.set("X-EZRA-Cache", "STALE");
        headers.set("X-EZRA-Tables-Source", "SERVER");
        return new Response(stale.body, { status: stale.status, headers });
      }
      const payload = await fetchSportsDb("v1", key, `lookuptable.php?l=${leagueId}`);
      const direct = new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=30, s-maxage=30",
          "X-EZRA-Cache": "MISS",
          "X-EZRA-Tables-Source": "DIRECT",
        },
      });
      await cache.put(dataKey, direct.clone());
      return direct;
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
  try {
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
    if (version === "v1" && lowerPath === "ezra/fixtures" && request.method === "GET") {
      return handleEzraFixturesRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/teamform" && request.method === "GET") {
      return handleEzraTeamFormRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/teamfixtures" && request.method === "GET") {
      return handleEzraTeamFixturesRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/clubquiz" && request.method === "GET") {
      return handleEzraClubQuizRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/league" && request.method === "GET") {
      return handleEzraLeagueRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/team" && request.method === "GET") {
      return handleEzraTeamRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/teamplayers" && request.method === "GET") {
      return handleEzraTeamPlayersRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/player" && request.method === "GET") {
      return handleEzraPlayerRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/event" && request.method === "GET") {
      return handleEzraEventRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/eventstats" && request.method === "GET") {
      return handleEzraEventStatsRoute(context, key);
    }
    if (version === "v1" && lowerPath === "ezra/live/stream") {
      return handleEzraLiveStreamRoute(context, key);
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

    let upstreamRes;
    try {
      upstreamRes = await fetchUpstreamWithRetry(upstream, {
        headers: version === "v2" ? { "X-API-KEY": key } : undefined,
      });
    } catch (err) {
      return json({ error: "Upstream fetch failed", detail: String(err?.message || err) }, 502, {
        "Cache-Control": "no-store",
      });
    }

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
  } catch (err) {
    return json({ error: "Unhandled API exception", detail: String(err?.message || err) }, 500, {
      "Cache-Control": "no-store",
    });
  }
}
