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
    // v2 uses API key in the X-API-KEY header, not in the URL path.
    return `https://www.thesportsdb.com/api/v2/json/${pathWithQuery}`;
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

const AVATAR_HAIR_STYLES = ["short", "fade", "spike", "curly", "long", "bun", "bald"];
const AVATAR_HEAD_SHAPES = ["round", "oval", "square"];
const AVATAR_NOSE_STYLES = ["button", "straight", "round"];
const AVATAR_MOUTH_STYLES = ["smile", "flat", "open"];
const AVATAR_BROW_STYLES = ["soft", "focused", "cheeky"];
const AVATAR_KIT_STYLES = ["plain", "sleeves", "diamond", "stripes", "hoops", "total90"];
const AVATAR_BOOTS_STYLES = ["classic", "speed", "high"];
const AVATAR_PRESET_FILES = [
  "001-street-striker.svg",
  "002-goal-guardian.svg",
  "003-midfield-maestro.svg",
  "004-captain-comet.svg",
  "005-egg-superstar.svg",
  "006-sideline-sprinter.svg",
  "007-champion-kick.svg",
  "008-sunburst-striker.svg",
  "009-pitch-pro.svg",
  "010-dribble-dynamo.svg",
  "011-corner-ace.svg",
  "012-skyline-shooter.svg",
  "013-playmaker-prime.svg",
  "014-power-forward.svg",
  "015-rainbow-rocket.svg",
  "016-keeper-calm.svg",
  "017-victory-vibe.svg",
  "018-flash-footwork.svg",
  "019-lucky-lefty.svg",
  "020-final-whistle.svg",
];
const AVATAR_STARTER_VARIANTS = AVATAR_PRESET_FILES.slice(0, 3);

function clampHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback;
}

function avatarSeedIndex(seed, modulo) {
  const text = String(seed || "ezra");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return modulo > 0 ? hash % modulo : 0;
}

function normalizeAvatarVariantList(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const key = String(raw || "").trim();
    if (!AVATAR_PRESET_FILES.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function defaultAvatarConfig(seed = "") {
  const primaryPalette = ["#F39A1D", "#E14D2A", "#2B88D8", "#37A060", "#A35BE6", "#DE5C8E"];
  const secondaryPalette = ["#111111", "#1B2233", "#2A1408", "#102A1A", "#1A1032", "#331018"];
  const skinPalette = ["#F2C8A0", "#E0AD80", "#C98B63", "#A76A45", "#7F4D2E"];
  const hairPalette = ["#111111", "#2D1A12", "#5A3A2B", "#A16A43", "#D4C0A0"];
  const eyePalette = ["#1F1F1F", "#4B2A1E", "#1E3A5F", "#0F5A3E"];

  return {
    variant: AVATAR_PRESET_FILES[avatarSeedIndex(`${seed}:variant`, AVATAR_PRESET_FILES.length)],
    hairStyle: AVATAR_HAIR_STYLES[avatarSeedIndex(`${seed}:hair`, AVATAR_HAIR_STYLES.length)],
    headShape: AVATAR_HEAD_SHAPES[avatarSeedIndex(`${seed}:head`, AVATAR_HEAD_SHAPES.length)],
    noseStyle: AVATAR_NOSE_STYLES[avatarSeedIndex(`${seed}:nose`, AVATAR_NOSE_STYLES.length)],
    eyeColor: eyePalette[avatarSeedIndex(`${seed}:eye`, eyePalette.length)],
    mouth: AVATAR_MOUTH_STYLES[avatarSeedIndex(`${seed}:mouth`, AVATAR_MOUTH_STYLES.length)],
    brow: AVATAR_BROW_STYLES[avatarSeedIndex(`${seed}:brow`, AVATAR_BROW_STYLES.length)],
    skinColor: skinPalette[avatarSeedIndex(`${seed}:skin`, skinPalette.length)],
    hairColor: hairPalette[avatarSeedIndex(`${seed}:haircolor`, hairPalette.length)],
    kitColor1: primaryPalette[avatarSeedIndex(`${seed}:kit1`, primaryPalette.length)],
    kitColor2: secondaryPalette[avatarSeedIndex(`${seed}:kit2`, secondaryPalette.length)],
    kitStyle: AVATAR_KIT_STYLES[avatarSeedIndex(`${seed}:kitstyle`, AVATAR_KIT_STYLES.length)],
    bootsStyle: AVATAR_BOOTS_STYLES[avatarSeedIndex(`${seed}:boots`, AVATAR_BOOTS_STYLES.length)],
    bootsColor: secondaryPalette[avatarSeedIndex(`${seed}:bootsColor`, secondaryPalette.length)],
    shortsColor: secondaryPalette[avatarSeedIndex(`${seed}:shortsColor`, secondaryPalette.length)],
    socksColor: primaryPalette[avatarSeedIndex(`${seed}:socksColor`, primaryPalette.length)],
    unlockedVariants: [...AVATAR_STARTER_VARIANTS],
  };
}

function sanitizeAvatarConfig(input, seed = "") {
  const base = defaultAvatarConfig(seed);
  const src = input && typeof input === "object" ? input : {};
  const pick = (value, allow, fallback) => (allow.includes(String(value || "")) ? String(value) : fallback);
  const unlockedRequested = normalizeAvatarVariantList(src.unlockedVariants);
  const unlockedVariants = [...AVATAR_STARTER_VARIANTS];
  unlockedRequested.forEach((variant) => {
    if (unlockedVariants.includes(variant)) return;
    unlockedVariants.push(variant);
  });
  return {
    variant: pick(src.variant, AVATAR_PRESET_FILES, base.variant),
    hairStyle: pick(src.hairStyle, AVATAR_HAIR_STYLES, base.hairStyle),
    headShape: pick(src.headShape, AVATAR_HEAD_SHAPES, base.headShape),
    noseStyle: pick(src.noseStyle, AVATAR_NOSE_STYLES, base.noseStyle),
    eyeColor: clampHexColor(src.eyeColor, base.eyeColor),
    mouth: pick(src.mouth, AVATAR_MOUTH_STYLES, base.mouth),
    brow: pick(src.brow, AVATAR_BROW_STYLES, base.brow),
    skinColor: clampHexColor(src.skinColor, base.skinColor),
    hairColor: clampHexColor(src.hairColor, base.hairColor),
    kitColor1: clampHexColor(src.kitColor1, base.kitColor1),
    kitColor2: clampHexColor(src.kitColor2, base.kitColor2),
    kitStyle: pick(src.kitStyle, AVATAR_KIT_STYLES, base.kitStyle),
    bootsStyle: pick(src.bootsStyle, AVATAR_BOOTS_STYLES, base.bootsStyle),
    bootsColor: clampHexColor(src.bootsColor, base.bootsColor),
    shortsColor: clampHexColor(src.shortsColor, base.shortsColor),
    socksColor: clampHexColor(src.socksColor, base.socksColor),
    unlockedVariants,
  };
}

function parseAvatarConfig(raw, seed = "") {
  if (!raw) return defaultAvatarConfig(seed);
  try {
    const parsed = JSON.parse(String(raw));
    return sanitizeAvatarConfig(parsed, seed);
  } catch {
    return defaultAvatarConfig(seed);
  }
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes) {
  let binary = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const clean = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!clean) return new Uint8Array();
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  const binary = atob(clean + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signInviteToken(payload, secret) {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyInviteToken(token, secret) {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length !== 2) return { ok: false, error: "Invalid token format." };
  const [body, sig] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(sig), new TextEncoder().encode(body));
  if (!valid) return { ok: false, error: "Invalid token signature." };
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid token payload." };
  }
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

const ACCOUNT_SESSION_COOKIE = "ezra_session";

function parseCookies(request) {
  const raw = String(request?.headers?.get("Cookie") || "");
  if (!raw) return {};
  const out = {};
  raw.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx <= 0) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) return;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

function getSessionCookieToken(request) {
  const cookies = parseCookies(request);
  return String(cookies[ACCOUNT_SESSION_COOKIE] || "").trim();
}

function secureCookieAllowed(request) {
  const proto = String(request?.headers?.get("x-forwarded-proto") || "").toLowerCase();
  if (proto) return proto === "https";
  try {
    const url = new URL(request.url);
    return url.protocol === "https:";
  } catch {
    return true;
  }
}

function buildSessionCookie(token, request, maxAgeSeconds = Math.floor(ACCOUNT_SESSION_MS / 1000)) {
  const safeToken = encodeURIComponent(String(token || ""));
  const parts = [
    `${ACCOUNT_SESSION_COOKIE}=${safeToken}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAgeSeconds || 0))}`,
  ];
  if (secureCookieAllowed(request)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function buildClearSessionCookie(request) {
  const parts = [
    `${ACCOUNT_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secureCookieAllowed(request)) {
    parts.push("Secure");
  }
  return parts.join("; ");
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
        avatar_json TEXT,
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
        joined_via_invite INTEGER NOT NULL DEFAULT 0,
        invited_by_user_id TEXT,
        invite_source TEXT,
        invite_referrer_name TEXT,
        PRIMARY KEY (league_code, user_id),
        FOREIGN KEY (league_code) REFERENCES ezra_leagues(code),
        FOREIGN KEY (user_id) REFERENCES ezra_users(id),
        FOREIGN KEY (invited_by_user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_league_members_user_id ON ezra_league_members(user_id)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_league_invites (
        id TEXT PRIMARY KEY,
        league_code TEXT NOT NULL,
        inviter_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        FOREIGN KEY (league_code) REFERENCES ezra_leagues(code),
        FOREIGN KEY (inviter_user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_league_invites_code ON ezra_league_invites(league_code, expires_at)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_league_invite_joins (
        invite_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (invite_id, user_id),
        FOREIGN KEY (invite_id) REFERENCES ezra_league_invites(id),
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_league_invite_joins_user ON ezra_league_invite_joins(user_id)`,
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
      CREATE TABLE IF NOT EXISTS ezra_user_follows (
        follower_user_id TEXT NOT NULL,
        followed_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (follower_user_id, followed_user_id),
        FOREIGN KEY (follower_user_id) REFERENCES ezra_users(id),
        FOREIGN KEY (followed_user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_user_follows_followed ON ezra_user_follows(followed_user_id)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_follow_requests (
        follower_user_id TEXT NOT NULL,
        followed_user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (follower_user_id, followed_user_id),
        FOREIGN KEY (follower_user_id) REFERENCES ezra_users(id),
        FOREIGN KEY (followed_user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_follow_requests_followed ON ezra_follow_requests(followed_user_id, status, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ezra_follow_requests_follower ON ezra_follow_requests(follower_user_id, status, updated_at DESC)`,
    `
      CREATE TABLE IF NOT EXISTS ezra_social_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_code TEXT,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT,
        dedupe_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_ezra_social_events_user ON ezra_social_events(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ezra_social_events_league ON ezra_social_events(league_code, created_at DESC)`,
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
    `
      CREATE TABLE IF NOT EXISTS ezra_app_settings (
        key TEXT PRIMARY KEY,
        value_text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ezra_user_score_floor (
        user_id TEXT PRIMARY KEY,
        min_points INTEGER NOT NULL DEFAULT 0,
        set_at TEXT NOT NULL,
        reason TEXT,
        FOREIGN KEY (user_id) REFERENCES ezra_users(id)
      )
    `,
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
  try {
    await db.prepare("ALTER TABLE ezra_users ADD COLUMN avatar_json TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  try {
    await db.prepare("ALTER TABLE ezra_league_members ADD COLUMN joined_via_invite INTEGER NOT NULL DEFAULT 0").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  try {
    await db.prepare("ALTER TABLE ezra_league_members ADD COLUMN invited_by_user_id TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  try {
    await db.prepare("ALTER TABLE ezra_league_members ADD COLUMN invite_source TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  try {
    await db.prepare("ALTER TABLE ezra_league_members ADD COLUMN invite_referrer_name TEXT").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_ezra_users_email_key ON ezra_users(email_key)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_ezra_league_members_invited_by ON ezra_league_members(invited_by_user_id)").run();
  try {
    await db.prepare("ALTER TABLE ezra_points_ledger ADD COLUMN season_id TEXT NOT NULL DEFAULT ''").run();
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("duplicate column")) throw err;
  }
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

async function sendRecoveryEmailAddedConfirmation(env, email, displayName = "") {
  const apiKey = String(env?.RESEND_API_KEY || "").trim();
  const from = String(env?.EZRA_FROM_EMAIL || "").trim();
  if (!apiKey || !from) return { ok: false, configured: false };
  const who = String(displayName || "there").trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Recovery email added to your EZRASCORES account",
      text: `Hi ${who}, your recovery email was added successfully. You can now use Forgot PIN if needed.`,
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
  const status = String(event?.strStatus || "").trim();
  const progress = String(event?.strProgress || "").trim();
  const minute = String(event?.strMinute || "").trim();
  return [status, progress, minute]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();
}

function isFinalEvent(event) {
  const s = parseStatusText(event);
  return /\b(ft|full time|match finished|finished|aet|after pen|final)\b/.test(s);
}

function isLiveEvent(event) {
  const s = parseStatusText(event);
  if (!s) return false;
  if (/\b(ht|1h|2h|live|in play|playing|et|pen)\b/.test(s)) return true;
  return /\d{1,3}\s*'/.test(s);
}

function eventKickoffMs(event, fallbackKickoffIso = "") {
  const date = String(event?.dateEvent || "").trim();
  const time = normalizeTime(event?.strTime || "");
  const fromEvent = date && time ? Date.parse(`${date}T${time}Z`) : Number.NaN;
  if (Number.isFinite(fromEvent)) return fromEvent;
  const fromFallback = fallbackKickoffIso ? Date.parse(String(fallbackKickoffIso)) : Number.NaN;
  return Number.isFinite(fromFallback) ? fromFallback : Number.NaN;
}

function eventLikelyFinal(event, fallbackKickoffIso = "") {
  if (!event || typeof event !== "object") return false;
  if (isLiveEvent(event)) return false;
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
  // Guard against false finals from partial/stale scores.
  // For same-day fixtures without explicit final status, require a larger buffer.
  return elapsedMs > 210 * 60 * 1000;
}

// Points awarded per quest type. Sync with QUEST_POINTS in app.js.
const QUEST_POINTS = {
  "quest-pop-5": 5,
  "quest-random-player": 3,
  "quest-club-quiz-3": 5,
  "quest-predict-fixture": 8,
};
const QUEST_ALL_DONE_BONUS = 10;
// How many quests must be done for the all-done bonus.
const QUEST_ALL_DONE_COUNT = Object.keys(QUEST_POINTS).length;

// Returns { "YYYY-MM-DD": points, ... } — one entry per date that has unrecorded quest
// completions. Each date is treated independently so that:
//   - quests are attributed to the season containing their completion date (not the cron date)
//   - no cumulative double-counting across days within the same week
//   - idempotency key quest_bonus:{userId}:{date} ensures each date is only ever credited once
function questBonusPointsByDate(state, userId) {
  const byDate = state?.familyLeague?.questBonusByDate;
  if (!byDate || typeof byDate !== "object") return {};
  const prefix = `acct:${String(userId || "")}:`;
  const result = {};
  for (const [date, value] of Object.entries(byDate)) {
    // Skip any key that isn't a valid calendar date — avoids Invalid Date RangeErrors downstream
    // when calling new Date(questDate).toISOString() or currentSevenDaySeasonWindow(new Date(questDate)).
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!value || typeof value !== "object") continue;
    let totalPoints = 0;
    let doneCountForDay = 0;
    for (const [key, done] of Object.entries(value)) {
      if (!done || !key.startsWith(prefix)) continue;
      // key format: acct:{userId}:{questId}
      const questId = key.slice(prefix.length);
      if (questId === "__bonus__") continue; // all-done bonus tracked separately below
      const pts = Number(QUEST_POINTS[questId] ?? 5);
      totalPoints += pts;
      doneCountForDay += 1;
    }
    // All-done bonus (tracked via special key to ensure idempotency)
    const bonusKey = `${prefix}__bonus__`;
    if (doneCountForDay >= QUEST_ALL_DONE_COUNT && value[bonusKey]) {
      totalPoints += QUEST_ALL_DONE_BONUS;
    }
    if (totalPoints > 0) result[date] = totalPoints;
  }
  return result;
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIsoUtc() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
  if (v === "4335") return "LALIGA";
  return "";
}

function normalizeTeamIdToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^fallback:/i.test(raw) ? "" : raw;
}

function predictionEntriesForUser(state, userId, userName = "") {
  const predictions = state?.familyLeague?.predictions;
  if (!predictions || typeof predictions !== "object") return [];
  const userIdText = String(userId || "").trim();
  const userNameText = String(userName || state?.account?.user?.name || "").trim();
  const lowerNameText = userNameText.toLowerCase();
  const candidateKeys = [
    userIdText ? `acct:${userIdText}` : "",
    userIdText,
    userNameText ? `acct:${userNameText}` : "",
    userNameText,
    lowerNameText && lowerNameText !== userNameText ? `acct:${lowerNameText}` : "",
    lowerNameText && lowerNameText !== userNameText ? lowerNameText : "",
  ].filter(Boolean);
  const rows = [];
  for (const record of Object.values(predictions)) {
    if (!record || typeof record !== "object") continue;
    const eventId = String(record.eventId || "").trim();
    if (!eventId) continue;
    const entries = record.entries && typeof record.entries === "object" ? record.entries : {};
    const pick = candidateKeys.map((key) => entries[key]).find((value) => value && typeof value === "object") || null;
    if (!pick || typeof pick !== "object") continue;
    const home = numericScore(pick.home);
    const away = numericScore(pick.away);
    if (home === null || away === null) continue;
    rows.push({ eventId, home, away, kickoffIso: String(record.kickoff || "") });
  }
  return rows;
}

function toEpochMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function canonicalPredictionMemberKey(userId) {
  const id = String(userId || "").trim();
  return id ? `acct:${id}` : "";
}

function buildLegacyPredictionAliasSet(userId, userName = "") {
  const id = String(userId || "").trim();
  const name = String(userName || "").trim();
  const lowerName = name.toLowerCase();
  const out = new Set();
  if (id) {
    out.add(id);
    out.add(`acct:${id}`);
  }
  if (name) {
    out.add(name);
    out.add(`acct:${name}`);
  }
  if (lowerName) {
    out.add(lowerName);
    out.add(`acct:${lowerName}`);
  }
  return out;
}

function normalizePredictionEntriesForUserState(state, userId, userName = "") {
  if (!state || typeof state !== "object") return { changed: false, recordsUpdated: 0 };
  const canonical = canonicalPredictionMemberKey(userId);
  if (!canonical) return { changed: false, recordsUpdated: 0 };
  const predictions = state?.familyLeague?.predictions;
  if (!predictions || typeof predictions !== "object") return { changed: false, recordsUpdated: 0 };

  const aliases = buildLegacyPredictionAliasSet(userId, userName);
  let changed = false;
  let recordsUpdated = 0;

  for (const record of Object.values(predictions)) {
    if (!record || typeof record !== "object") continue;
    const entries = record.entries && typeof record.entries === "object" ? record.entries : {};
    if (!record.entries || typeof record.entries !== "object") {
      record.entries = entries;
    }
    const keys = Object.keys(entries);
    if (!keys.length) continue;

    let canonicalPick = entries[canonical] && typeof entries[canonical] === "object" ? entries[canonical] : null;
    if (!canonicalPick) {
      const candidates = keys
        .filter((key) => aliases.has(String(key || "").trim()))
        .map((key) => ({ key, value: entries[key] }))
        .filter((item) => item.value && typeof item.value === "object");
      if (!candidates.length && keys.length === 1) {
        const only = entries[keys[0]];
        if (only && typeof only === "object") {
          canonicalPick = only;
        }
      } else if (candidates.length) {
        candidates.sort((a, b) => toEpochMs(b.value?.submittedAt) - toEpochMs(a.value?.submittedAt));
        canonicalPick = candidates[0].value;
      }
      if (canonicalPick) {
        entries[canonical] = canonicalPick;
        changed = true;
      }
    }

    if (!entries[canonical] || typeof entries[canonical] !== "object") {
      continue;
    }

    let removedAlias = false;
    for (const key of keys) {
      const cleanKey = String(key || "").trim();
      if (!cleanKey || cleanKey === canonical) continue;
      if (aliases.has(cleanKey)) {
        delete entries[key];
        removedAlias = true;
      }
    }
    if (removedAlias || canonicalPick) {
      recordsUpdated += 1;
    }
  }

  return { changed, recordsUpdated };
}

async function getAppSetting(db, key) {
  if (!db || !key) return "";
  const row = await db
    .prepare("SELECT value_text FROM ezra_app_settings WHERE key = ?1 LIMIT 1")
    .bind(String(key))
    .first();
  return String(row?.value_text || "");
}

async function setAppSetting(db, key, value) {
  if (!db || !key) return;
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT INTO ezra_app_settings (key, value_text, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(key) DO UPDATE SET
        value_text = excluded.value_text,
        updated_at = excluded.updated_at
      `
    )
    .bind(String(key), String(value || ""), nowIso)
    .run();
}

async function runPredictionKeyNormalizerOnce(db) {
  const doneKey = "prediction_key_normalizer_v2_done";
  const runKey = "prediction_key_normalizer_v2_running";
  const existingDone = await getAppSetting(db, doneKey);
  if (existingDone) {
    let parsed = {};
    try {
      parsed = JSON.parse(existingDone);
    } catch {
      parsed = { raw: existingDone };
    }
    return { ok: true, skipped: true, reason: "already_done", meta: parsed };
  }

  const runningRaw = await getAppSetting(db, runKey);
  if (runningRaw) {
    let lock = {};
    try {
      lock = JSON.parse(runningRaw);
    } catch {
      lock = {};
    }
    const lockMs = Number(lock?.ts || 0);
    if (Number.isFinite(lockMs) && Date.now() - lockMs < 10 * 60 * 1000) {
      return { ok: true, skipped: true, reason: "already_running" };
    }
  }
  await setAppSetting(db, runKey, JSON.stringify({ ts: Date.now() }));

  try {
    const rows = await db
      .prepare(
        `
        SELECT ps.user_id, ps.state_json, u.name
        FROM ezra_profile_states ps
        JOIN ezra_users u ON u.id = ps.user_id
        `
      )
      .all();
    const list = rows?.results || [];
    let usersScanned = 0;
    let usersChanged = 0;
    let predictionRecordsUpdated = 0;

    for (const row of list) {
      usersScanned += 1;
      const userId = String(row?.user_id || "").trim();
      if (!userId) continue;
      const userName = String(row?.name || "").trim();
      const state = safeParseJsonText(row?.state_json || "{}");
      const out = normalizePredictionEntriesForUserState(state, userId, userName);
      if (!out.changed) continue;
      usersChanged += 1;
      predictionRecordsUpdated += Number(out.recordsUpdated || 0);
      await db
        .prepare("UPDATE ezra_profile_states SET state_json = ?2, updated_at = ?3 WHERE user_id = ?1")
        .bind(userId, JSON.stringify(state), new Date().toISOString())
        .run();
    }

    const meta = {
      at: new Date().toISOString(),
      usersScanned,
      usersChanged,
      predictionRecordsUpdated,
    };
    await setAppSetting(db, doneKey, JSON.stringify(meta));
    await setAppSetting(db, runKey, "");
    return { ok: true, skipped: false, ...meta };
  } catch (err) {
    await setAppSetting(db, runKey, "");
    throw err;
  }
}

function ttlForEventResult(result) {
  // Keep finals reasonably fresh so corrected post-match scores can still reconcile.
  if (result?.final) return 6 * 60 * 60 * 1000;
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
    const normalizedTime = normalizeTime(event?.strTime || "");
    const kickoffAt = event?.dateEvent && normalizedTime ? `${String(event.dateEvent).trim()}T${normalizedTime}Z` : String(options?.kickoffIso || "");
    const final = eventLikelyFinal(event, options?.kickoffIso || "") && home !== null && away !== null;
    const result = { final, home, away, kickoffAt, event };
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

async function hydrateLiveScoresForEvents(events, key, db) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return list;
  const resultCache = new Map();
  const candidates = list.filter((event) => {
    if (!event || typeof event !== "object") return false;
    if (!String(event.idEvent || "").trim()) return false;
    if (numericScore(event.intHomeScore) !== null && numericScore(event.intAwayScore) !== null) return false;
    return isLiveEvent(event);
  });
  if (!candidates.length) return list;

  // Keep this bounded: only hydrate likely live rows that are missing scores.
  await Promise.allSettled(
    candidates.slice(0, 12).map(async (event) => {
      const normalizedTime = normalizeTime(event?.strTime || "");
      const kickoffIso = event?.dateEvent && normalizedTime ? `${String(event.dateEvent).trim()}T${normalizedTime}Z` : "";
      const result = await fetchEventResultById(key, event.idEvent, resultCache, db, { kickoffIso });
      const scoreHome = numericScore(result?.home);
      const scoreAway = numericScore(result?.away);
      if (scoreHome !== null && scoreAway !== null) {
        event.intHomeScore = scoreHome;
        event.intAwayScore = scoreAway;
      }
      const fullEvent = result?.event && typeof result.event === "object" ? normalizeEventForCache(result.event) : null;
      if (fullEvent) {
        event.strStatus = fullEvent.strStatus || event.strStatus || "";
        event.strProgress = fullEvent.strProgress || event.strProgress || "";
        event.strMinute = fullEvent.strMinute || event.strMinute || "";
        event.strTimestamp = fullEvent.strTimestamp || event.strTimestamp || "";
      }
    })
  );
  return list;
}

async function hydrateEventScoresForDay(events, key, db, dayIso) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return list;
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!dayIso || dayIso > todayIso) return list;
  const resultCache = new Map();
  const candidates = list.filter((event) => {
    if (!event || typeof event !== "object") return false;
    if (!String(event.idEvent || "").trim()) return false;
    return numericScore(event.intHomeScore) === null || numericScore(event.intAwayScore) === null;
  });
  if (!candidates.length) return list;

  await Promise.allSettled(
    candidates.slice(0, 36).map(async (event) => {
      const normalizedTime = normalizeTime(event?.strTime || "");
      const kickoffIso = event?.dateEvent && normalizedTime ? `${String(event.dateEvent).trim()}T${normalizedTime}Z` : "";
      const result = await fetchEventResultById(key, event.idEvent, resultCache, db, { kickoffIso });
      const scoreHome = numericScore(result?.home);
      const scoreAway = numericScore(result?.away);
      if (scoreHome !== null && scoreAway !== null) {
        event.intHomeScore = scoreHome;
        event.intAwayScore = scoreAway;
      }
      const fullEvent = result?.event && typeof result.event === "object" ? normalizeEventForCache(result.event) : null;
      if (fullEvent) {
        event.strStatus = fullEvent.strStatus || event.strStatus || "";
        event.strProgress = fullEvent.strProgress || event.strProgress || "";
        event.strMinute = fullEvent.strMinute || event.strMinute || "";
        event.strTimestamp = fullEvent.strTimestamp || event.strTimestamp || "";
        if (fullEvent.strTime) event.strTime = fullEvent.strTime;
      }
    })
  );
  return list;
}

async function upsertUserScore(db, userId, points) {
  const safePoints = Math.max(0, Number(points || 0));
  const nowIso = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO ezra_user_scores (user_id, points, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(user_id) DO UPDATE SET points = MAX(excluded.points, ezra_user_scores.points), updated_at = excluded.updated_at
    `)
    .bind(userId, safePoints, nowIso)
    .run();
}

async function getUserLifetimePoints(db, userId) {
  const row = await db.prepare("SELECT points FROM ezra_user_scores WHERE user_id = ?1 LIMIT 1").bind(userId).first();
  return Math.max(0, Number(row?.points || 0));
}

async function getUserScoreFloor(db, userId) {
  const row = await db.prepare("SELECT min_points FROM ezra_user_score_floor WHERE user_id = ?1 LIMIT 1").bind(userId).first();
  return Math.max(0, Number(row?.min_points || 0));
}

async function setUserScoreFloor(db, userId, points, reason = "") {
  const safe = Math.max(0, Number(points || 0));
  const nowIso = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO ezra_user_score_floor (user_id, min_points, set_at, reason)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(user_id) DO UPDATE SET
        min_points = MAX(excluded.min_points, ezra_user_score_floor.min_points),
        set_at = excluded.set_at,
        reason = excluded.reason
    `)
    .bind(userId, safe, nowIso, String(reason || ""))
    .run();
  // Also ratchet the live score so it reflects the floor immediately.
  await upsertUserScore(db, userId, safe);
}

async function getLedgerSeasonPoints(db, userId, seasonId) {
  const row = await db
    .prepare("SELECT COALESCE(SUM(points), 0) AS total FROM ezra_points_ledger WHERE user_id = ?1 AND season_id = ?2")
    .bind(userId, String(seasonId || ""))
    .first();
  return Math.max(0, Number(row?.total || 0));
}

async function appendPointsToLedger(db, userId, entries = []) {
  for (const row of entries) {
    await db
      .prepare(`
        INSERT OR IGNORE INTO ezra_points_ledger
          (event_id, user_id, league_code, type, points, idempotency_key, season_id, payload_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      `)
      .bind(
        String(row.eventId || ""),
        userId,
        String(row.fixtureLeagueCode || ""),
        String(row.type || "prediction"),
        Math.max(0, Number(row.points || 0)),
        String(row.idempotencyKey || ""),
        String(row.seasonId || ""),
        JSON.stringify(row.payload || {}),
        String(row.createdAt || new Date().toISOString())
      )
      .run();
  }
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

// Tiered achievement catalog — bronze/silver/gold tiers signalled by suffix _1/_3/_5 etc.
const ACHIEVEMENT_CATALOG = [
  // Streak tiers
  { code: "streak_3",   name: "On Fire",        description: "Complete quests 3 days in a row.",  icon: "🔥", tier: "bronze" },
  { code: "streak_7",   name: "Unstoppable",     description: "Complete quests 7 days in a row.",  icon: "🏆", tier: "silver" },
  { code: "streak_14",  name: "Quest Machine",   description: "Complete quests 14 days in a row.", icon: "💎", tier: "gold" },
  // Combo tiers
  { code: "combo_3",  name: "Hot Streak",        description: "Get 3 correct outcomes in a row.",  icon: "⚡", tier: "bronze" },
  { code: "combo_5",  name: "Prediction Combo",  description: "Get 5 correct outcomes in a row.",  icon: "⚡", tier: "silver" },
  { code: "combo_10", name: "Oracle",            description: "Get 10 correct outcomes in a row.", icon: "🔮", tier: "gold" },
  // Exact score tiers
  { code: "exact_1",  name: "Pinpoint",          description: "Get your first exact score.",       icon: "🎯", tier: "bronze" },
  { code: "exact_5",  name: "Sharp Eye",         description: "Get 5 exact score predictions.",    icon: "🎯", tier: "silver" },
  { code: "exact_10", name: "Sniper",            description: "Get 10 exact score predictions.",   icon: "🎯", tier: "gold" },
  { code: "exact_25", name: "Laser Guided",      description: "Get 25 exact score predictions.",   icon: "💫", tier: "platinum" },
  // Mastery tiers
  { code: "mastery_5",  name: "Club Loyalist",   description: "Make 5 predictions for one club.",  icon: "📈", tier: "bronze" },
  { code: "mastery_25", name: "Team Analyst",    description: "Make 25 predictions for one club.", icon: "📊", tier: "silver" },
  { code: "mastery_50", name: "Scouting Report", description: "Make 50 predictions for one club.", icon: "🔍", tier: "gold" },
  // Title tiers
  { code: "titles_1", name: "Winner",            description: "Win a mini-league weekly title.",   icon: "🥇", tier: "bronze" },
  { code: "titles_3", name: "Champion",          description: "Win 3 mini-league weekly titles.",  icon: "👑", tier: "silver" },
  { code: "titles_5", name: "Dynasty",           description: "Win 5 mini-league weekly titles.",  icon: "👑", tier: "gold" },
  // Referral
  { code: "referral_1", name: "Recruiter",       description: "Successfully refer a friend.",      icon: "🤝", tier: "bronze" },
  { code: "referral_3", name: "Team Builder",    description: "Refer 3 friends to the league.",    icon: "🤝", tier: "silver" },
];

let achievementCatalogReady = false;
async function ensureAchievementCatalog(db) {
  if (achievementCatalogReady) return;
  const nowIso = new Date().toISOString();
  for (const row of ACHIEVEMENT_CATALOG) {
    await db
      .prepare("INSERT OR IGNORE INTO ezra_achievements (code, name, description, icon, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(row.code, row.name, row.description, row.icon, nowIso)
      .run();
  }
  achievementCatalogReady = true;
}

async function grantAchievement(db, userId, code) {
  const nowIso = new Date().toISOString();
  const result = await db
    .prepare("INSERT OR IGNORE INTO ezra_user_achievements (user_id, achievement_code, earned_at) VALUES (?1, ?2, ?3)")
    .bind(userId, code, nowIso)
    .run();
  return Boolean(result?.meta?.changes > 0);
}

// Grant an achievement and — if newly unlocked — emit a social event for the feed.
async function grantAchievementWithEvent(db, userId, code, leagueCode = "", extraPayload = {}) {
  const isNew = await grantAchievement(db, userId, code);
  if (!isNew) return false;
  const catalogEntry = ACHIEVEMENT_CATALOG.find((a) => a.code === code);
  await emitSocialEvent(db, {
    leagueCode,
    userId,
    eventType: "achievement_unlocked",
    dedupeKey: `achievement:${code}:${userId}`,
    payload: {
      code,
      name: catalogEntry?.name || code,
      icon: catalogEntry?.icon || "🏅",
      tier: catalogEntry?.tier || "bronze",
      description: catalogEntry?.description || "",
      ...extraPayload,
    },
  });
  return true;
}

async function emitSocialEvent(db, { leagueCode = "", userId = "", eventType = "", payload = {}, dedupeKey = "" } = {}) {
  const code = normalizeLeagueCode(leagueCode || "");
  const actor = String(userId || "").trim();
  const type = String(eventType || "").trim().slice(0, 64);
  const key = String(dedupeKey || "").trim().slice(0, 160);
  if (!actor || !type || !key) return false;
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT OR IGNORE INTO ezra_social_events
        (league_code, user_id, event_type, payload_json, dedupe_key, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `
    )
    .bind(code || null, actor, type, JSON.stringify(payload || {}), key, nowIso)
    .run();
  return true;
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
  // Legacy wrapper — DO NOT add a DELETE here. The ledger is append-only.
  // Callers should migrate to appendPointsToLedger directly.
  await appendPointsToLedger(db, userId, entries);
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

async function ensureLeagueScoresSettled(db, code, key, options = {}) {
  if (!code) return { settled: false, reason: "no_code" };
  const force = Boolean(options.force);
  const minIntervalMs = Math.max(0, Number(options.minIntervalMs ?? LEAGUE_SETTLE_MIN_INTERVAL_MS));
  const now = Date.now();
  const tsKey = `league_settle_at:${code}`;
  const lockKey = `league_settle_lock:${code}`;

  if (!force) {
    const lastSettledAt = await getIngestStateNumber(db, tsKey, 0);
    if (lastSettledAt > 0 && now - lastSettledAt < minIntervalMs) {
      return { settled: false, reason: "fresh", lastSettledAt };
    }
    const lockUntil = await getIngestStateNumber(db, lockKey, 0);
    if (lockUntil > now) {
      return { settled: false, reason: "locked", lockUntil };
    }
  }

  await setIngestStateNumber(db, lockKey, now + LEAGUE_SETTLE_LOCK_MS);
  try {
    await syncLeagueScoresFromStates(db, code, key);
    await setIngestStateNumber(db, tsKey, now);
    return { settled: true, settledAt: now };
  } finally {
    await setIngestStateNumber(db, lockKey, 0);
  }
}

async function getLeagueSettleStatus(db, code) {
  const tsKey = `league_settle_at:${code}`;
  const lastSettledAt = await getIngestStateNumber(db, tsKey, 0);
  return {
    settled: Number(lastSettledAt) > 0,
    settledAt: Number(lastSettledAt || 0),
    ageMs: Number(lastSettledAt) > 0 ? Math.max(0, Date.now() - Number(lastSettledAt)) : null,
  };
}

async function leagueStandings(db, code, key) {
  await ensureLeagueScoresSettled(db, code, key);
  const season = currentSevenDaySeasonWindow();
  const rows = await db
    .prepare(`
      SELECT u.id AS user_id, u.name, u.avatar_json,
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
  return (rows?.results || []).map((row) => ({
    user_id: row.user_id,
    name: row.name,
    points: Number(row.points || 0),
    lifetime_points: Number(row.lifetime_points || 0),
    titles_won: Number(row.titles_won || 0),
    avatar: parseAvatarConfig(row.avatar_json, row.name || row.user_id),
  }));
}

async function leagueStandingsFallback(db, code) {
  const season = currentSevenDaySeasonWindow();
  const rows = await db
    .prepare(`
      SELECT u.id AS user_id, u.name, u.avatar_json,
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
  return (rows?.results || []).map((row) => ({
    user_id: row.user_id,
    name: row.name,
    points: Number(row.points || 0),
    lifetime_points: Number(row.lifetime_points || 0),
    titles_won: Number(row.titles_won || 0),
    avatar: parseAvatarConfig(row.avatar_json, row.name || row.user_id),
  }));
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
      const userRow = await db.prepare("SELECT name FROM ezra_users WHERE id = ?1 LIMIT 1").bind(userId).first();
      const row = await db
        .prepare("SELECT state_json FROM ezra_profile_states WHERE user_id = ?1 LIMIT 1")
        .bind(userId)
        .first();
      const state = safeParseJsonText(row?.state_json || "{}");
      const predictionRows = predictionEntriesForUser(state, userId, String(userRow?.name || ""));
      const ordered = [...predictionRows].sort((a, b) =>
        String(a.kickoffIso || "").localeCompare(String(b.kickoffIso || ""))
      );

      // Bulk-load all existing idempotency keys (and their point values) for this user.
      // Stored as Map<key, points> so quest entries can be topped-up when the user
      // completes more quests after the first settle of that day. Map.has() is a drop-in
      // replacement for Set.has(), so prediction checks below are unchanged.
      const existingKeyRows = await db
        .prepare("SELECT idempotency_key, points FROM ezra_points_ledger WHERE user_id = ?1")
        .bind(userId)
        .all();
      const recordedKeys = new Map(
        (existingKeyRows?.results || []).map((r) => [
          String(r.idempotency_key || ""),
          Number(r.points || 0),
        ])
      );

      // Combo tracking (ordered by kickoff so streaks are accurate)
      let comboCount = 0;
      let bestCombo = 0;
      let totalExact = 0;
      const mastery = new Map();
      const newLedgerEntries = [];
      let newPointsThisRun = 0;
      // Track every season that receives a new ledger entry this run so we can
      // update season points for all of them, not just the current week.
      const affectedSeasons = new Map([[season.seasonId, season]]);

      for (const pick of ordered) {
        const result = await fetchEventResultById(sportsKey, pick.eventId, resultCache, db, {
          kickoffIso: pick.kickoffIso || "",
        });
        if (!result.final || result.home === null || result.away === null) {
          // Match not yet finished — reset combo streak at unresolved point
          // (don't reset: unresolved picks don't break a streak mid-sequence)
          continue;
        }

        const eventRow = await db
          .prepare("SELECT payload_json, league_id FROM ezra_fixtures_cache WHERE event_id = ?1 LIMIT 1")
          .bind(String(pick.eventId || ""))
          .first();
        const event = safeParseJsonText(eventRow?.payload_json || "{}");
        const fixtureLeagueCode = leagueIdToCode(eventRow?.league_id);
        const teamId =
          normalizeTeamIdToken(String(event?.idHomeTeam || "")) ||
          normalizeTeamIdToken(String(event?.idAwayTeam || "")) ||
          "unknown";
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

        if (base === 2) {
          totalExact += 1;
          await emitSocialEvent(db, {
            leagueCode: code,
            userId,
            eventType: "perfect_scoreline",
            dedupeKey: `perfect:${code}:${userId}:${pick.eventId}`,
            payload: {
              eventId: String(pick.eventId || ""),
              homeTeam: String(event?.strHomeTeam || ""),
              awayTeam: String(event?.strAwayTeam || ""),
              finalHome: result.home,
              finalAway: result.away,
              awarded,
            },
          });
        }

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

        // Only add to ledger if not already recorded (idempotency_key is per-user per-event).
        // Uses the bulk-loaded recordedKeys set (O(1) lookup) instead of a per-entry DB query.
        const idempKey = `prediction:${userId}:${pick.eventId}`;
        if (!recordedKeys.has(idempKey)) {
          // Use the season that contains the match's kickoff date, NOT the current cron season.
          // Without this, a late-settled Saturday match settled on Monday morning would be
          // credited to the new week's season and inflate Monday's mini league standings.
          const matchSeason = pick.kickoffIso
            ? currentSevenDaySeasonWindow(new Date(pick.kickoffIso))
            : season;
          if (!affectedSeasons.has(matchSeason.seasonId)) {
            affectedSeasons.set(matchSeason.seasonId, matchSeason);
          }
          newLedgerEntries.push({
            eventId: pick.eventId,
            type: "prediction",
            points: awarded,
            idempotencyKey: idempKey,
            fixtureLeagueCode,
            seasonId: matchSeason.seasonId,
            createdAt: pick.kickoffIso || new Date().toISOString(),
            payload: { base, comboCount, exact: base === 2 },
          });
          newPointsThisRun += awarded;
        }
      }

      // Quest bonus — one ledger entry per completion date, attributed to the season that
      // contains that date (mirrors the prediction kickoff-based season fix).
      // Each date's idempotency key ensures it can only be written once, even across
      // multiple cron runs or concurrent league settlements.
      const questPointsByDate = questBonusPointsByDate(state, userId);
      for (const [questDate, questPoints] of Object.entries(questPointsByDate)) {
        const questKey = `quest_bonus:${userId}:${questDate}`;
        // Use T12:00:00Z (noon UTC) so that YYYY-MM-DD strings parsed on a Monday
        // (midnight UTC falls in the prior week's 1-minute grace window) are firmly
        // attributed to the correct new week, not the previous one.
        const questSeason = currentSevenDaySeasonWindow(new Date(questDate + "T12:00:00Z"));
        if (!recordedKeys.has(questKey)) {
          // No entry yet — fresh insert.
          if (!affectedSeasons.has(questSeason.seasonId)) {
            affectedSeasons.set(questSeason.seasonId, questSeason);
          }
          newLedgerEntries.push({
            eventId: "",
            type: "quest_bonus",
            points: questPoints,
            idempotencyKey: questKey,
            fixtureLeagueCode: "",
            seasonId: questSeason.seasonId,
            createdAt: new Date(questDate).toISOString(),
            payload: { questDate, questPoints },
          });
          newPointsThisRun += questPoints;
        } else {
          // Entry already exists — top up if the user has completed more quests since the
          // last settle (e.g. 4th quest + all-done bonus completed after first run today).
          const settledPts = recordedKeys.get(questKey) ?? 0;
          if (questPoints > settledPts) {
            const delta = questPoints - settledPts;
            await db
              .prepare(
                "UPDATE ezra_points_ledger SET points = ?1, payload_json = ?2 WHERE idempotency_key = ?3"
              )
              .bind(
                questPoints,
                JSON.stringify({ questDate, questPoints }),
                questKey
              )
              .run();
            if (!affectedSeasons.has(questSeason.seasonId)) {
              affectedSeasons.set(questSeason.seasonId, questSeason);
            }
            newPointsThisRun += delta;
          }
        }
      }

      // Append only new entries — INSERT OR IGNORE, no DELETEs ever.
      await appendPointsToLedger(db, userId, newLedgerEntries);

      // Lifetime score: add new points to existing stored score.
      // The ratchet in upsertUserScore and the floor ensure it never decreases.
      if (newPointsThisRun > 0) {
        const existingScore = await getUserLifetimePoints(db, userId);
        const floor = await getUserScoreFloor(db, userId);
        const newTotal = Math.max(existingScore + newPointsThisRun, floor);
        await upsertUserScore(db, userId, newTotal);
      } else {
        // No new predictions scored this run. Still enforce the floor.
        const floor = await getUserScoreFloor(db, userId);
        if (floor > 0) {
          await upsertUserScore(db, userId, floor);
        }
      }

      // Update season points for every season that received a new ledger entry this run.
      // Normally this is just the current season, but if a late-settled prediction from a
      // prior week was just recorded it will also include that past season's row.
      for (const [, affSeason] of affectedSeasons) {
        await ensureLeagueSeason(db, code, affSeason);
        const affSeasonPoints = await getLedgerSeasonPoints(db, userId, affSeason.seasonId);
        await upsertLeagueSeasonPoints(db, code, affSeason.seasonId, userId, affSeasonPoints);
      }

      // Achievements and mastery (unchanged).
      await replaceTeamMastery(db, userId, [...mastery.values()]);

      const questByDate = state?.familyLeague?.questBonusByDate;
      const todayObj = questByDate && typeof questByDate === "object" ? questByDate[todayIso] : null;
      const yesterdayObj =
        questByDate && typeof questByDate === "object" ? questByDate[yesterdayIso] : null;
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
        .prepare(
          "SELECT current_streak, best_streak, last_quest_date FROM ezra_user_progress WHERE user_id = ?1 LIMIT 1"
        )
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

      // Achievement grants — tiered, with social event emission on first unlock.
      if (bestStreak >= 3)  await grantAchievementWithEvent(db, userId, "streak_3",  code);
      if (bestStreak >= 7)  await grantAchievementWithEvent(db, userId, "streak_7",  code);
      if (bestStreak >= 14) await grantAchievementWithEvent(db, userId, "streak_14", code);
      if (bestCombo >= 3)   await grantAchievementWithEvent(db, userId, "combo_3",   code);
      if (bestCombo >= 5)   await grantAchievementWithEvent(db, userId, "combo_5",   code);
      if (bestCombo >= 10)  await grantAchievementWithEvent(db, userId, "combo_10",  code);
      if (totalExact >= 1)  await grantAchievementWithEvent(db, userId, "exact_1",   code);
      if (totalExact >= 5)  await grantAchievementWithEvent(db, userId, "exact_5",   code);
      if (totalExact >= 10) await grantAchievementWithEvent(db, userId, "exact_10",  code);
      if (totalExact >= 25) await grantAchievementWithEvent(db, userId, "exact_25",  code);
      const masteryValues = [...mastery.values()];
      if (masteryValues.some((m) => Number(m.predCount || 0) >= 5))  await grantAchievementWithEvent(db, userId, "mastery_5",  code);
      if (masteryValues.some((m) => Number(m.predCount || 0) >= 25)) await grantAchievementWithEvent(db, userId, "mastery_25", code);
      if (masteryValues.some((m) => Number(m.predCount || 0) >= 50)) await grantAchievementWithEvent(db, userId, "mastery_50", code);

      // Combo milestone social event (distinct from achievement — fires whenever streak is reached).
      if (bestCombo >= 3) {
        await emitSocialEvent(db, {
          leagueCode: code,
          userId,
          eventType: "combo_milestone",
          dedupeKey: `combo:${code}:${userId}:${bestCombo}`,
          payload: { comboCount: bestCombo },
        });
      }

      // Streak milestone social event.
      if (currentStreak >= 3) {
        await emitSocialEvent(db, {
          leagueCode: code,
          userId,
          eventType: "streak_milestone",
          dedupeKey: `streak:${code}:${userId}:${currentStreak}`,
          payload: { streakDays: currentStreak },
        });
      }

      // Referral reward — grant once when this user's first prediction is settled.
      const referralKey = `referral_bonus:${userId}`;
      const referralAlreadyGranted = await db
        .prepare("SELECT id FROM ezra_points_ledger WHERE idempotency_key = ?1 LIMIT 1")
        .bind(referralKey)
        .first();
      if (!referralAlreadyGranted && newLedgerEntries.length > 0) {
        // Check if this user was invited by someone.
        const inviteRow = await db
          .prepare("SELECT invited_by_user_id FROM ezra_league_members WHERE user_id = ?1 AND invited_by_user_id IS NOT NULL LIMIT 1")
          .bind(userId)
          .first();
        const referrerId = String(inviteRow?.invited_by_user_id || "").trim();
        if (referrerId) {
          // Mark as processed (even if referrer no longer eligible) so we don't check again.
          await db
            .prepare("INSERT OR IGNORE INTO ezra_points_ledger (event_id, user_id, league_code, type, points, idempotency_key, season_id, payload_json, created_at) VALUES ('', ?1, '', 'referral_marker', 0, ?2, '', '{}', ?3)")
            .bind(userId, referralKey, new Date().toISOString())
            .run();
          // Grant referrer bonus.
          const refBonusKey = `referral_reward:${referrerId}:${userId}`;
          const refAlready = await db
            .prepare("SELECT id FROM ezra_points_ledger WHERE idempotency_key = ?1 LIMIT 1")
            .bind(refBonusKey)
            .first();
          if (!refAlready) {
            const refSeason = currentSevenDaySeasonWindow();
            await db
              .prepare("INSERT OR IGNORE INTO ezra_points_ledger (event_id, user_id, league_code, type, points, idempotency_key, season_id, payload_json, created_at) VALUES ('', ?1, ?2, 'referral_reward', 5, ?3, ?4, ?5, ?6)")
              .bind(referrerId, code, refBonusKey, refSeason.seasonId, JSON.stringify({ referredUserId: userId }), new Date().toISOString())
              .run();
            // Update referrer lifetime points.
            const referrerScore = await getUserLifetimePoints(db, referrerId);
            await upsertUserScore(db, referrerId, referrerScore + 5);
            // Emit social event for referrer.
            await emitSocialEvent(db, {
              leagueCode: code,
              userId: referrerId,
              eventType: "referral_reward",
              dedupeKey: `referral:${referrerId}:${userId}`,
              payload: { referredUserId: userId, points: 5 },
            });
            // Check referral achievement.
            const refCount = await db
              .prepare("SELECT COUNT(*) AS c FROM ezra_points_ledger WHERE user_id = ?1 AND type = 'referral_reward'")
              .bind(referrerId)
              .first();
            const refTotal = Math.max(0, Number(refCount?.c || 0));
            if (refTotal >= 1) await grantAchievementWithEvent(db, referrerId, "referral_1", code);
            if (refTotal >= 3) await grantAchievementWithEvent(db, referrerId, "referral_3", code);
          }
        }
      }
    })
  );

  const leaderRow = await db
    .prepare(
      `
      SELECT user_id, points
      FROM ezra_league_season_points
      WHERE league_code = ?1 AND season_id = ?2
      ORDER BY points DESC, user_id ASC
      LIMIT 1
      `
    )
    .bind(code, season.seasonId)
    .first();
  const leaderUserId = String(leaderRow?.user_id || "");
  if (leaderUserId) {
    const prevLeaderKey = `league_leader:${code}:${season.seasonId}`;
    const prevLeader = String((await getAppSetting(db, prevLeaderKey)) || "");
    if (prevLeader && prevLeader !== leaderUserId) {
      await emitSocialEvent(db, {
        leagueCode: code,
        userId: leaderUserId,
        eventType: "climbed_to_1",
        dedupeKey: `leader:${code}:${season.seasonId}:${leaderUserId}`,
        payload: {
          seasonId: season.seasonId,
          points: Math.max(0, Number(leaderRow?.points || 0)),
          previousLeaderUserId: prevLeader,
        },
      });
    }
    await setAppSetting(db, prevLeaderKey, leaderUserId);
  }

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
    // Emit title_won social event.
    await emitSocialEvent(db, {
      leagueCode: code,
      userId: winnerUserId,
      eventType: "title_won",
      dedupeKey: `title:${code}:${season.seasonId}:${winnerUserId}`,
      payload: { seasonId: season.seasonId, titlesWon },
    });
    // Tiered title achievements.
    if (titlesWon >= 1) await grantAchievementWithEvent(db, winnerUserId, "titles_1", code);
    if (titlesWon >= 3) await grantAchievementWithEvent(db, winnerUserId, "titles_3", code);
    if (titlesWon >= 5) await grantAchievementWithEvent(db, winnerUserId, "titles_5", code);
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
  const now = Date.now();
  const row = await db
    .prepare(`
      SELECT s.token, s.expires_at, u.id AS user_id, u.name, u.email, u.email_verified_at, u.avatar_json
      FROM ezra_sessions s
      JOIN ezra_users u ON u.id = s.user_id
      WHERE s.token = ?1
      LIMIT 1
    `)
    .bind(token)
    .first();
  if (!row) return null;
  if (Number(row.expires_at) <= now) {
    await db.prepare("DELETE FROM ezra_sessions WHERE token = ?1").bind(token).run();
    return null;
  }
  const ttl = Number(row.expires_at) - now;
  if (ttl < ACCOUNT_SESSION_MS / 2) {
    const nextExpires = now + ACCOUNT_SESSION_MS;
    await db.prepare("UPDATE ezra_sessions SET expires_at = ?2 WHERE token = ?1").bind(token, nextExpires).run();
    row.expires_at = nextExpires;
  }
  return row;
}

async function accountAuth(db, request) {
  const bearer = getBearerToken(request);
  const cookie = getSessionCookieToken(request);
  if (bearer) {
    const bearerSession = await getSessionWithUser(db, bearer);
    if (bearerSession) return { token: bearer, session: bearerSession };
  }
  if (cookie) {
    const cookieSession = await getSessionWithUser(db, cookie);
    if (cookieSession) return { token: cookie, session: cookieSession };
  }
  // Guard against brief read-after-write lag on distributed reads.
  if (bearer || cookie) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (bearer) {
      const retryBearer = await getSessionWithUser(db, bearer);
      if (retryBearer) return { token: bearer, session: retryBearer };
    }
    if (cookie) {
      const retryCookie = await getSessionWithUser(db, cookie);
      if (retryCookie) return { token: cookie, session: retryCookie };
    }
  }
  return { token: bearer || cookie || "", session: null };
}

const ADMIN_SESSION_MS = 1000 * 60 * 60 * 12;
const LEAGUE_VISIBILITY_KEY = "league_visibility_v1";
const LEAGUE_VISIBILITY_CODES = ["EPL", "CHAMP", "LALIGA"];

function defaultLeagueVisibility() {
  return { EPL: true, CHAMP: true, LALIGA: true };
}

function normalizeLeagueVisibilityMap(value) {
  const base = defaultLeagueVisibility();
  if (!value || typeof value !== "object") return base;
  for (const code of LEAGUE_VISIBILITY_CODES) {
    if (Object.prototype.hasOwnProperty.call(value, code)) {
      base[code] = Boolean(value[code]);
    }
  }
  if (!Object.values(base).some(Boolean)) {
    // Keep at least one visible to avoid a broken client state.
    base.EPL = true;
  }
  return base;
}

async function getLeagueVisibility(db) {
  const row = await db.prepare("SELECT value_text FROM ezra_app_settings WHERE key = ?1 LIMIT 1").bind(LEAGUE_VISIBILITY_KEY).first();
  if (!row?.value_text) return defaultLeagueVisibility();
  let parsed = null;
  try {
    parsed = JSON.parse(String(row.value_text || ""));
  } catch {
    parsed = null;
  }
  return normalizeLeagueVisibilityMap(parsed);
}

async function putLeagueVisibility(db, value) {
  const normalized = normalizeLeagueVisibilityMap(value);
  const nowIso = new Date().toISOString();
  await db
    .prepare("INSERT OR REPLACE INTO ezra_app_settings (key, value_text, updated_at) VALUES (?1, ?2, ?3)")
    .bind(LEAGUE_VISIBILITY_KEY, JSON.stringify(normalized), nowIso)
    .run();
  return normalized;
}

function adminConfig(env) {
  const username = String(env?.EZRA_ADMIN_USERNAME || "").trim().toLowerCase();
  const password = String(env?.EZRA_ADMIN_PASSWORD || "").trim();
  const passwordHash = String(env?.EZRA_ADMIN_PASSWORD_SHA256 || "").trim().toLowerCase();
  const secret = String(env?.EZRA_ADMIN_SECRET || env?.EZRA_CRON_SECRET || "").trim();
  return { username, password, passwordHash, secret };
}

async function signAdminToken(payload, secret) {
  return signInviteToken({ ...payload, t: "admin" }, secret);
}

async function verifyAdminToken(token, secret) {
  const verified = await verifyInviteToken(token, secret);
  if (!verified?.ok) return { ok: false, error: verified?.error || "Invalid token." };
  const payload = verified.payload || {};
  if (String(payload.t || "") !== "admin") return { ok: false, error: "Invalid token type." };
  const exp = Number(payload.exp || 0);
  if (!Number.isFinite(exp) || Date.now() > exp) return { ok: false, error: "Admin session expired." };
  return { ok: true, payload };
}

async function adminAuth(request, env) {
  const cfg = adminConfig(env);
  if (!cfg.username || (!cfg.password && !cfg.passwordHash) || !cfg.secret) {
    return { ok: false, status: 503, error: "Admin auth is not configured." };
  }
  const token = getBearerToken(request);
  if (!token) return { ok: false, status: 401, error: "Missing admin token." };
  const verified = await verifyAdminToken(token, cfg.secret);
  if (!verified.ok) return { ok: false, status: 401, error: verified.error || "Unauthorized." };
  if (String(verified.payload.u || "").trim().toLowerCase() !== cfg.username) {
    return { ok: false, status: 401, error: "Invalid admin user." };
  }
  return { ok: true, username: cfg.username };
}

async function handleAdminLogin(env, request) {
  const cfg = adminConfig(env);
  if (!cfg.username || (!cfg.password && !cfg.passwordHash) || !cfg.secret) {
    return json({ error: "Admin auth is not configured. Set EZRA_ADMIN_USERNAME, EZRA_ADMIN_SECRET, and password env var." }, 503);
  }
  const body = (await parseJson(request)) || {};
  const username = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!username || !password) return json({ error: "Username and password are required." }, 400);
  if (username !== cfg.username) return json({ error: "Invalid credentials." }, 401);
  if (cfg.passwordHash) {
    const hash = await sha256Hex(password);
    if (hash.toLowerCase() !== cfg.passwordHash) return json({ error: "Invalid credentials." }, 401);
  } else if (password !== cfg.password) {
    return json({ error: "Invalid credentials." }, 401);
  }
  const now = Date.now();
  const token = await signAdminToken(
    {
      u: cfg.username,
      iat: now,
      exp: now + ADMIN_SESSION_MS,
    },
    cfg.secret
  );
  return json(
    {
      ok: true,
      token,
      expiresAt: now + ADMIN_SESSION_MS,
      username: cfg.username,
    },
    200
  );
}

async function handleAdminUsersOverview(db, env, request) {
  const auth = await adminAuth(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);

  const url = new URL(request.url);
  const leagueCode = String(url.searchParams.get("league") || "ALL")
    .trim()
    .toUpperCase();
  const leagueIdByCode = {
    EPL: "4328",
    CHAMP: "4329",
    LALIGA: "4335",
  };
  const leagueId = leagueIdByCode[leagueCode] || "";
  const isLeagueFiltered = Boolean(leagueId);

  const baseSql = `
      SELECT
        u.id,
        u.name,
        COALESCE(s.points, 0) AS total_points,
        MAX(
          COALESCE(u.updated_at, ''),
          COALESCE(ps.last_state_at, ''),
          COALESCE(s.updated_at, ''),
          COALESCE(pl.last_points_at, ''),
          COALESCE(ss.last_session_at, '')
        ) AS last_activity_at
      FROM ezra_users u
      LEFT JOIN ezra_user_scores s ON s.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(updated_at) AS last_state_at
        FROM ezra_profile_states
        GROUP BY user_id
      ) ps ON ps.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(created_at) AS last_points_at
        FROM ezra_points_ledger
        GROUP BY user_id
      ) pl ON pl.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(created_at) AS last_session_at
        FROM ezra_sessions
        GROUP BY user_id
      ) ss ON ss.user_id = u.id
  `;

  const filterSql = `
      WHERE EXISTS (
        SELECT 1
        FROM ezra_points_ledger plg
        JOIN ezra_fixtures_cache fx ON fx.event_id = plg.event_id
        WHERE plg.user_id = u.id
          AND plg.type = 'prediction'
          AND fx.league_id = ?1
      )
  `;

  const finalSql = `${baseSql}
      ${isLeagueFiltered ? filterSql : ""}
      ORDER BY last_activity_at DESC, u.name COLLATE NOCASE ASC
      LIMIT 1000
  `;

  const usersQuery = db.prepare(finalSql);
  const users = (isLeagueFiltered ? await usersQuery.bind(leagueId).all() : await usersQuery.all()) || { results: [] };
  const usersCount = Number((users.results || []).length);

  const rows = (users?.results || []).map((row) => ({
    id: String(row?.id || ""),
    username: String(row?.name || ""),
    totalPoints: Math.max(0, Number(row?.total_points || 0)),
    lastActivityAt: String(row?.last_activity_at || ""),
  }));

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const active24h = rows.filter((r) => {
    const ts = Date.parse(r.lastActivityAt || "");
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;

  return json(
    {
      summary: {
        usersCount,
        active24h,
        league: isLeagueFiltered ? leagueCode : "ALL",
      },
      users: rows,
    },
    200,
    { "Cache-Control": "no-store" }
  );
}

// Force-rescore every league: re-runs normalizer then settles all leagues.
// Use this to restore points for all users after a key-migration fix.
async function handleAdminRescoreAll(db, env, request, key) {
  const auth = await adminAuth(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);

  // Reset the v2 normalizer done flag so it re-runs for any users it missed.
  await setAppSetting(db, "prediction_key_normalizer_v2_done", "");
  const normalizer = await runPredictionKeyNormalizerOnce(db);

  // Force settle all leagues regardless of rate-limit / cooldown.
  const rows = await db.prepare("SELECT code FROM ezra_leagues").all();
  const codes = (rows?.results || []).map((r) => normalizeLeagueCode(r?.code)).filter(Boolean);
  const results = [];
  for (const code of codes) {
    const r = await ensureLeagueScoresSettled(db, code, key, { force: true, minIntervalMs: 0 }).catch((err) => ({
      settled: false,
      error: String(err?.message || err),
    }));
    results.push({ code, ...r });
  }
  return json(
    {
      ok: true,
      leaguesProcessed: codes.length,
      leagues: results,
      normalizer,
      settledAt: new Date().toISOString(),
    },
    200
  );
}

async function handleAdminSetScoreFloor(db, env, request) {
  const auth = await adminAuth(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);
  const body = (await parseJson(request)) || {};
  const floors = Array.isArray(body?.floors) ? body.floors : [];
  if (!floors.length) return json({ error: "Provide floors array: [{userId, points, reason}]" }, 400);
  const results = [];
  for (const entry of floors) {
    const userId = String(entry?.userId || "").trim();
    const points = Math.max(0, Number(entry?.points || 0));
    const reason = String(entry?.reason || "admin");
    if (!userId) { results.push({ userId, ok: false, error: "missing userId" }); continue; }
    await setUserScoreFloor(db, userId, points, reason);
    results.push({ userId, ok: true, points });
  }
  return json({ ok: true, results }, 200);
}

// Manually grant points to a user — adds to lifetime total AND current season standings.
async function handleAdminGrantPoints(db, env, request) {
  const auth = await adminAuth(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);
  const body = (await parseJson(request)) || {};
  const userId = String(body?.userId || "").trim();
  const points = Math.floor(Number(body?.points || 0));
  const reason = String(body?.reason || "admin_grant").trim() || "admin_grant";

  if (!userId) return json({ error: "userId is required" }, 400);
  if (!Number.isFinite(points) || points <= 0) {
    return json({ error: "points must be a positive integer greater than 0" }, 400);
  }

  // Verify the user exists.
  const user = await db
    .prepare("SELECT id, name FROM ezra_users WHERE id = ?1 LIMIT 1")
    .bind(userId)
    .first();
  if (!user) return json({ error: `User not found: ${userId}` }, 404);

  const nowIso = new Date().toISOString();
  const idempKey = `admin_grant:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  const season = currentSevenDaySeasonWindow();

  // 1. Append an admin_grant ledger entry so the grant is visible in audit history.
  await db
    .prepare(
      `INSERT OR IGNORE INTO ezra_points_ledger
         (event_id, user_id, league_code, type, points, idempotency_key, season_id, payload_json, created_at)
       VALUES ('', ?1, '', 'admin_grant', ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(userId, points, idempKey, season.seasonId, JSON.stringify({ reason }), nowIso)
    .run();

  // 2. Add to lifetime total. getLedgerSeasonPoints would now include the grant,
  //    but we compute lifetime directly: current + grant, then MAX-ratchet upsert.
  const currentLifetime = await getUserLifetimePoints(db, userId);
  const newLifetime = currentLifetime + points;
  await upsertUserScore(db, userId, newLifetime);

  // 3. Update current-season standings for every league this user belongs to.
  //    getLedgerSeasonPoints sums the full ledger for this season (including the
  //    admin_grant entry just inserted), so the season total is always accurate.
  const leagueRows = await db
    .prepare("SELECT league_code FROM ezra_league_members WHERE user_id = ?1")
    .bind(userId)
    .all();
  const leagueCodes = (leagueRows?.results || [])
    .map((r) => String(r?.league_code || ""))
    .filter(Boolean);

  let seasonPointsAfterGrant = 0;
  for (const leagueCode of leagueCodes) {
    await ensureLeagueSeason(db, leagueCode, season);
    seasonPointsAfterGrant = await getLedgerSeasonPoints(db, userId, season.seasonId);
    await upsertLeagueSeasonPoints(db, leagueCode, season.seasonId, userId, seasonPointsAfterGrant);
  }

  // 4. Raise the score floor to the new lifetime total so a future rescore can
  //    never zero out or reduce below this admin-granted value.
  await setUserScoreFloor(db, userId, newLifetime, `admin_grant: ${reason}`);

  return json(
    {
      ok: true,
      userId,
      username: String(user.name || ""),
      pointsGranted: points,
      reason,
      newLifetimeTotal: newLifetime,
      currentSeasonPoints: seasonPointsAfterGrant,
      seasonId: season.seasonId,
      leaguesUpdated: leagueCodes.length,
    },
    200
  );
}

async function handleAdminLeagueVisibilityGet(db, env, request) {
  const auth = await adminAuth(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);
  const visibility = await getLeagueVisibility(db);
  return json({ visibility }, 200, { "Cache-Control": "no-store" });
}

async function handleAdminLeagueVisibilityPut(db, env, request) {
  const auth = await adminAuth(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);
  const body = (await parseJson(request)) || {};
  const visibility = await putLeagueVisibility(db, body?.visibility);
  return json({ ok: true, visibility }, 200, { "Cache-Control": "no-store" });
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
  const avatar = sanitizeAvatarConfig(body?.avatar, valid.cleanName);
  const avatarJson = JSON.stringify(avatar);
  const salt = randomHex(10);
  const pinHash = await sha256Hex(`${salt}:${valid.cleanPin}`);
  const nowIso = new Date().toISOString();

  try {
    await db
      .prepare(`
        INSERT INTO ezra_users (id, name, name_key, email, email_key, email_verified_at, avatar_json, pin_salt, pin_hash, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, ?8, ?9, ?10)
      `)
      .bind(userId, valid.cleanName, nameKey, emailCheck.clean || null, emailCheck.clean || null, avatarJson, salt, pinHash, nowIso, nowIso)
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
  const lifetimePoints = await getUserLifetimePoints(db, userId);
  return json(
    {
      token,
      user: {
        id: userId,
        name: valid.cleanName,
        email: emailCheck.clean || "",
        hasRecoveryEmail: Boolean(emailCheck.clean),
        avatar,
        lifetimePoints,
      },
    },
    200,
    { "Set-Cookie": buildSessionCookie(token, request) }
  );
}

async function handleAccountLogin(db, request) {
  const body = await parseJson(request);
  const valid = validateCredentials(body?.name, body?.pin);
  if (!valid.ok) return json({ error: "Invalid login details." }, 400);

  const nameKey = valid.cleanName.toLowerCase();
  const row = await db
    .prepare("SELECT id, name, email, avatar_json, pin_salt, pin_hash FROM ezra_users WHERE name_key = ?1 LIMIT 1")
    .bind(nameKey)
    .first();
  if (!row) return json({ error: "Account not found." }, 404);

  const checkHash = await sha256Hex(`${row.pin_salt}:${valid.cleanPin}`);
  if (checkHash !== row.pin_hash) return json({ error: "Invalid PIN." }, 401);

  const token = await createSession(db, row.id);
  const lifetimePoints = await getUserLifetimePoints(db, row.id);
  return json(
    {
      token,
      user: {
        id: row.id,
        name: row.name,
        email: String(row.email || ""),
        hasRecoveryEmail: Boolean(row.email),
        avatar: parseAvatarConfig(row.avatar_json, row.name || row.id),
        lifetimePoints,
      },
    },
    200,
    { "Set-Cookie": buildSessionCookie(token, request) }
  );
}

async function handleAccountMe(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const lifetimePoints = await getUserLifetimePoints(db, session.user_id);
  return json(
    {
      user: {
        id: session.user_id,
        name: session.name,
        email: String(session.email || ""),
        hasRecoveryEmail: Boolean(session.email),
        emailVerifiedAt: session.email_verified_at || null,
        avatar: parseAvatarConfig(session.avatar_json, session.name || session.user_id),
        lifetimePoints,
      },
    },
    200,
    { "Cache-Control": "no-store" }
  );
}

async function handleAccountUpdateMe(db, request, env) {
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
  const avatar =
    body && Object.prototype.hasOwnProperty.call(body, "avatar")
      ? sanitizeAvatarConfig(body?.avatar, session.name || session.user_id)
      : parseAvatarConfig(session.avatar_json, session.name || session.user_id);
  await db
    .prepare("UPDATE ezra_users SET email = ?2, email_key = ?3, avatar_json = ?4, updated_at = ?5 WHERE id = ?1")
    .bind(session.user_id, emailCheck.clean, emailCheck.clean, JSON.stringify(avatar), nowIso)
    .run();
  const previousEmail = normalizeEmail(session.email || "");
  let emailConfirmationSent = false;
  if (emailCheck.clean && emailCheck.clean !== previousEmail) {
    try {
      const out = await sendRecoveryEmailAddedConfirmation(env, emailCheck.clean, session.name || "");
      emailConfirmationSent = Boolean(out?.ok);
    } catch {
      emailConfirmationSent = false;
    }
  }
  const lifetimePoints = await getUserLifetimePoints(db, session.user_id);
  return json(
    {
      ok: true,
      emailConfirmationSent,
      user: {
        id: session.user_id,
        name: session.name,
        email: emailCheck.clean,
        hasRecoveryEmail: true,
        emailVerifiedAt: session.email_verified_at || null,
        avatar,
        lifetimePoints,
      },
    },
    200
  );
}

async function handleAccountGetAvatar(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  return json({ avatar: parseAvatarConfig(session.avatar_json, session.name || session.user_id) }, 200);
}

async function handleAccountPutAvatar(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const avatar = sanitizeAvatarConfig(body?.avatar, session.name || session.user_id);
  const nowIso = new Date().toISOString();
  await db
    .prepare("UPDATE ezra_users SET avatar_json = ?2, updated_at = ?3 WHERE id = ?1")
    .bind(session.user_id, JSON.stringify(avatar), nowIso)
    .run();
  return json({ ok: true, avatar }, 200);
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
    .prepare("SELECT id, name, email_key, avatar_json FROM ezra_users WHERE name_key = ?1 LIMIT 1")
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
  const lifetimePoints = await getUserLifetimePoints(db, String(user.id));
  return json(
    {
      ok: true,
      token,
      user: {
        id: String(user.id),
        name: String(user.name || cleanName),
        email: emailCheck.clean,
        hasRecoveryEmail: true,
        avatar: parseAvatarConfig(user.avatar_json, user.name || user.id),
        lifetimePoints,
      },
    },
    200,
    { "Set-Cookie": buildSessionCookie(token, request) }
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
  const token = getBearerToken(request) || getSessionCookieToken(request);
  if (token) {
    await db.prepare("DELETE FROM ezra_sessions WHERE token = ?1").bind(token).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": buildClearSessionCookie(request) });
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
  const existingMember = await db
    .prepare("SELECT 1 AS ok FROM ezra_league_members WHERE league_code = ?1 AND user_id = ?2 LIMIT 1")
    .bind(code, session.user_id)
    .first();
  const source = String(body?.source || "").trim().slice(0, 32);
  const referrerName = normalizeName(body?.referrerName || "");
  const referrerNameKey = referrerName.toLowerCase();
  let referrerUserId = "";
  if (referrerNameKey) {
    const refUser = await db
      .prepare("SELECT id FROM ezra_users WHERE name_key = ?1 LIMIT 1")
      .bind(referrerNameKey)
      .first();
    const refId = String(refUser?.id || "");
    if (refId && refId !== session.user_id) {
      const refInLeague = await db
        .prepare("SELECT 1 AS ok FROM ezra_league_members WHERE league_code = ?1 AND user_id = ?2 LIMIT 1")
        .bind(code, refId)
        .first();
      if (refInLeague?.ok) {
        referrerUserId = refId;
      }
    }
  }
  if (!existingMember) {
    const nowIso = new Date().toISOString();
    await db
      .prepare(
        `INSERT OR IGNORE INTO ezra_league_members
          (league_code, user_id, joined_at, joined_via_invite, invited_by_user_id, invite_source, invite_referrer_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .bind(
        code,
        session.user_id,
        nowIso,
        referrerUserId ? 1 : 0,
        referrerUserId || null,
        source || null,
        referrerName || null
      )
      .run();
    // Emit new_member social event so the league feed shows the join.
    await emitSocialEvent(db, {
      leagueCode: code,
      userId: session.user_id,
      eventType: "new_member",
      dedupeKey: `new_member:${code}:${session.user_id}`,
      payload: { leagueCode: code, invitedBy: referrerUserId || null },
    });
  }
  return json({ ok: true, code, alreadyMember: Boolean(existingMember), referralTracked: Boolean(referrerUserId) }, 200);
}

async function handleLeagueInviteCreate(db, request, env) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const code = normalizeLeagueCode(body?.code);
  if (!code) return json({ error: "Invalid league code." }, 400);
  const league = await db.prepare("SELECT code, name FROM ezra_leagues WHERE code = ?1 LIMIT 1").bind(code).first();
  if (!league) return json({ error: "League code not found." }, 404);
  const member = await db
    .prepare("SELECT 1 AS ok FROM ezra_league_members WHERE league_code = ?1 AND user_id = ?2 LIMIT 1")
    .bind(code, session.user_id)
    .first();
  if (!member?.ok) return json({ error: "You must be in this league to share invites." }, 403);
  const secret = String(env?.EZRA_INVITE_SECRET || env?.EZRA_CRON_SECRET || "").trim();
  if (!secret) return json({ error: "Invite secret not configured." }, 503);
  const now = Date.now();
  const ttlMs = 1000 * 60 * 60 * 24 * 7;
  const inviteId = randomHex(12);
  await db
    .prepare(
      `INSERT INTO ezra_league_invites (id, league_code, inviter_user_id, created_at, expires_at, status)
       VALUES (?1, ?2, ?3, ?4, ?5, 'active')`
    )
    .bind(inviteId, code, session.user_id, new Date(now).toISOString(), now + ttlMs)
    .run();
  const payload = {
    i: inviteId,
    l: code,
    u: String(session.user_id || ""),
    n: String(session.name || ""),
    iat: now,
    exp: now + ttlMs,
    src: "share",
  };
  const token = await signInviteToken(payload, secret);
  return json(
    {
      ok: true,
      invite: {
        token,
        inviteId,
        leagueCode: code,
        leagueName: normalizeLeagueName(league.name, `League ${code}`),
        referrerName: String(session.name || ""),
        expiresAt: now + ttlMs,
      },
    },
    200
  );
}

async function handleLeagueInviteMeta(db, request, env) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) return json({ error: "Missing invite token." }, 400);
  const secret = String(env?.EZRA_INVITE_SECRET || env?.EZRA_CRON_SECRET || "").trim();
  if (!secret) return json({ error: "Invite secret not configured." }, 503);
  const verified = await verifyInviteToken(token, secret);
  if (!verified.ok) return json({ error: verified.error || "Invalid invite token." }, 400);
  const payload = verified.payload && typeof verified.payload === "object" ? verified.payload : {};
  const inviteId = String(payload.i || "").trim();
  const code = normalizeLeagueCode(payload.l);
  const exp = Number(payload.exp || 0);
  if (!inviteId || !code || !Number.isFinite(exp)) return json({ error: "Invalid invite payload." }, 400);
  if (Date.now() > exp) return json({ error: "Invite has expired." }, 410);
  const invite = await db
    .prepare("SELECT id, league_code, inviter_user_id, expires_at, status FROM ezra_league_invites WHERE id = ?1 LIMIT 1")
    .bind(inviteId)
    .first();
  if (!invite || String(invite.status || "") !== "active" || Number(invite.expires_at || 0) < Date.now()) {
    return json({ error: "Invite is no longer active." }, 410);
  }
  const league = await db.prepare("SELECT code, name FROM ezra_leagues WHERE code = ?1 LIMIT 1").bind(code).first();
  if (!league) return json({ error: "League not found." }, 404);
  return json(
    {
      ok: true,
      invite: {
        token,
        inviteId,
        leagueCode: code,
        leagueName: normalizeLeagueName(league.name, `League ${code}`),
        referrerName: String(payload.n || "").trim(),
        expiresAt: Number(invite.expires_at || exp),
      },
    },
    200
  );
}

async function handleLeagueJoinInvite(db, request, env) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const token = String(body?.token || "").trim();
  if (!token) return json({ error: "Missing invite token." }, 400);
  const secret = String(env?.EZRA_INVITE_SECRET || env?.EZRA_CRON_SECRET || "").trim();
  if (!secret) return json({ error: "Invite secret not configured." }, 503);
  const verified = await verifyInviteToken(token, secret);
  if (!verified.ok) return json({ error: verified.error || "Invalid invite token." }, 400);
  const payload = verified.payload && typeof verified.payload === "object" ? verified.payload : {};
  const inviteId = String(payload.i || "").trim();
  const code = normalizeLeagueCode(payload.l);
  const inviterUserId = String(payload.u || "").trim();
  const referrerName = normalizeName(payload.n || "");
  const source = String(payload.src || "share").trim().slice(0, 32);
  const exp = Number(payload.exp || 0);
  if (!inviteId || !code || !Number.isFinite(exp)) return json({ error: "Invalid invite payload." }, 400);
  if (Date.now() > exp) return json({ error: "Invite has expired." }, 410);
  const invite = await db
    .prepare("SELECT id, league_code, inviter_user_id, expires_at, status FROM ezra_league_invites WHERE id = ?1 LIMIT 1")
    .bind(inviteId)
    .first();
  if (!invite || String(invite.status || "") !== "active" || Number(invite.expires_at || 0) < Date.now()) {
    return json({ error: "Invite is no longer active." }, 410);
  }
  const league = await db.prepare("SELECT code FROM ezra_leagues WHERE code = ?1 LIMIT 1").bind(code).first();
  if (!league) return json({ error: "League code not found." }, 404);
  const alreadyMember = await db
    .prepare("SELECT 1 AS ok FROM ezra_league_members WHERE league_code = ?1 AND user_id = ?2 LIMIT 1")
    .bind(code, session.user_id)
    .first();
  if (!alreadyMember) {
    const nowIso = new Date().toISOString();
    await db
      .prepare(
        `INSERT OR IGNORE INTO ezra_league_members
          (league_code, user_id, joined_at, joined_via_invite, invited_by_user_id, invite_source, invite_referrer_name)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6)`
      )
      .bind(
        code,
        session.user_id,
        nowIso,
        inviterUserId && inviterUserId !== session.user_id ? inviterUserId : null,
        source || null,
        referrerName || null
      )
      .run();
  }
  await db
    .prepare("INSERT OR IGNORE INTO ezra_league_invite_joins (invite_id, user_id, joined_at) VALUES (?1, ?2, ?3)")
    .bind(inviteId, session.user_id, new Date().toISOString())
    .run();
  return json({ ok: true, code, alreadyMember: Boolean(alreadyMember), referralTracked: Boolean(inviterUserId) }, 200);
}

async function buildLeagueDirectoryForUser(db, userId, key) {
  await ensureDefaultLeagueForUser(db, userId);
  const leagues = await listLeaguesForUser(db, userId);
  const season = currentSevenDaySeasonWindow();
  const detailed = await Promise.all(
    leagues.map(async (league) => {
      const code = normalizeLeagueCode(league.code);
      let standings = [];
      try {
        standings = await leagueStandings(db, code, key);
      } catch {
        standings = await leagueStandingsFallback(db, code);
      }
      const settleStatus = code ? await getLeagueSettleStatus(db, code) : { settled: false, settledAt: 0, ageMs: null };
      return {
        code: league.code,
        name: normalizeLeagueName(league.name, `League ${league.code}`),
        ownerUserId: league.owner_user_id,
        isOwner: String(league.owner_user_id || "") === String(userId || ""),
        memberCount: Number(league.member_count || 0),
        season: {
          seasonId: season.seasonId,
          startsAt: season.startsAt,
          endsAt: season.endsAt,
        },
        settleStatus,
        standings,
      };
    })
  );
  return detailed;
}

async function handleLeagueList(db, request, key) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const detailed = await buildLeagueDirectoryForUser(db, session.user_id, key);
  return json({ leagues: detailed }, 200, { "Cache-Control": "no-store" });
}

async function buildChallengeDashboardForUser(db, session, key) {
  // Run catalog seed and all independent per-user reads in parallel to cut round-trips.
  const [, prefs, progress, achievements, mastery, lifetime, leagues] = await Promise.all([
    ensureAchievementCatalog(db),
    getUserPreference(db, session.user_id),
    db
      .prepare(
        `
        SELECT current_streak, best_streak, last_quest_date, combo_count, best_combo, combo_updated_at, updated_at
        FROM ezra_user_progress
        WHERE user_id = ?1
        LIMIT 1
        `
      )
      .bind(session.user_id)
      .first(),
    db
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
      .all(),
    db
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
      .all(),
    db
      .prepare("SELECT points FROM ezra_user_scores WHERE user_id = ?1 LIMIT 1")
      .bind(session.user_id)
      .first(),
    listLeaguesForUser(db, session.user_id),
  ]);
  const currentLeagueCode = normalizeLeagueCode(leagues?.[0]?.code || "");
  let season = null;
  let seasonStandings = [];
  let settleStatus = { settled: false, settledAt: 0, ageMs: null };
  if (currentLeagueCode) {
    season = currentSevenDaySeasonWindow();
    // Run settle-status check and season row creation in parallel.
    [settleStatus] = await Promise.all([
      getLeagueSettleStatus(db, currentLeagueCode),
      ensureLeagueSeason(db, currentLeagueCode, season),
    ]);
    const standingsRows = await db
      .prepare(
        `
        SELECT u.id AS user_id, u.name, u.avatar_json, COALESCE(sp.points, 0) AS points
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
    seasonStandings = (standingsRows?.results || []).map((row) => ({
      user_id: row.user_id,
      name: row.name,
      points: Number(row.points || 0),
      titles_won: Number(row.titles_won || 0),
      avatar: parseAvatarConfig(row.avatar_json, row.name || row.user_id),
    }));
  }

  return {
    user: { id: session.user_id, name: session.name, avatar: parseAvatarConfig(session.avatar_json, session.name || session.user_id) },
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
          settleStatus,
          standings: seasonStandings,
        }
      : null,
  };
}

async function handleChallengeDashboard(db, request, key) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const dashboard = await buildChallengeDashboardForUser(db, session, key);
  return json(dashboard, 200, { "Cache-Control": "no-store" });
}

// Fast single-user score recalculation — called on every bootstrap so the
// lifetime score in ezra_user_scores is always up-to-date after login,
// without depending on the cron or normalization detecting a change.
// Ensures the stored lifetime score is at least the configured floor.
// Called on every login bootstrap — does not recalculate from state (that
// can produce 0 when state is wiped); instead trusts the append-only ledger
// and ratcheted ezra_user_scores written during settlement.
async function recalcUserLifetimeScoreOnly(db, userId) {
  const floor = await getUserScoreFloor(db, userId);
  if (floor > 0) {
    // upsertUserScore uses MAX semantics so this only raises, never lowers.
    await upsertUserScore(db, userId, floor);
  }
}

async function handleAccountBootstrap(context, db, request, key) {
  const { token, session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // Load state first so we can normalise prediction keys inline before scoring.
  const stateRow = await db
    .prepare("SELECT state_json, updated_at FROM ezra_profile_states WHERE user_id = ?1 LIMIT 1")
    .bind(session.user_id)
    .first();
  const userState = safeParseJsonText(stateRow?.state_json || "{}");
  // normalizePredictionEntriesForUserState mutates userState in-place (synchronous).
  // We get the corrected state immediately for the response without any I/O wait.
  const normalizeResult = normalizePredictionEntriesForUserState(userState, session.user_id, String(session.name || ""));
  if (normalizeResult.changed) {
    // Capture the already-normalized JSON for background persistence.
    const normalizedJson = JSON.stringify(userState);
    const normalizeUserId = session.user_id;
    const normalizeNow = new Date().toISOString();
    // The updated_at we read — used for optimistic concurrency in the deferred write below.
    const originalUpdatedAt = stateRow?.updated_at || null;
    // Defer the slow DB write + per-league re-scoring to a background task so the
    // HTTP response is returned immediately with the already-corrected in-memory state.
    context.waitUntil(
      (async () => {
        try {
          // IMPORTANT: only write if the state has not been modified since we read it.
          // A client PUT (e.g. saving a new prediction) may have run between the bootstrap
          // read and this waitUntil firing, and that newer state must not be overwritten.
          const writeResult = await db
            .prepare(
              "UPDATE ezra_profile_states SET state_json = ?2, updated_at = ?3 WHERE user_id = ?1 AND updated_at IS ?4"
            )
            .bind(normalizeUserId, normalizedJson, normalizeNow, originalUpdatedAt)
            .run();
          // If 0 rows were changed the client already wrote a newer state — skip re-scoring
          // as the cron/settle job will pick it up on its next run.
          if (!writeResult?.meta?.changes) return;
          // Re-settle scores for every league this user is in so standings update.
          const leagueMemberRows = await db
            .prepare("SELECT league_code FROM ezra_league_members WHERE user_id = ?1")
            .bind(normalizeUserId)
            .all();
          const userLeagueCodes = (leagueMemberRows?.results || [])
            .map((r) => String(r?.league_code || ""))
            .filter(Boolean);
          for (const leagueCode of userLeagueCodes) {
            await syncLeagueScoresFromStates(db, leagueCode, key).catch(() => {});
          }
        } catch {
          // Background task — swallow errors so they don't surface to the response.
        }
      })()
    );
  }

  // Always enforce the score floor for this user. Fast (2 DB ops) so stays on
  // the critical path to ensure lifetimePoints in the response is never below floor.
  await recalcUserLifetimeScoreOnly(db, session.user_id).catch(() => {});

  const [lifetimePoints, dashboard, leagues] = await Promise.all([
    getUserLifetimePoints(db, session.user_id),
    buildChallengeDashboardForUser(db, session, key),
    buildLeagueDirectoryForUser(db, session.user_id, key),
  ]);
  return json(
    {
      user: {
        id: session.user_id,
        name: session.name,
        email: String(session.email || ""),
        hasRecoveryEmail: Boolean(session.email),
        emailVerifiedAt: session.email_verified_at || null,
        avatar: parseAvatarConfig(session.avatar_json, session.name || session.user_id),
        lifetimePoints,
      },
      token: token || "",
      state: userState,
      stateUpdatedAt: stateRow?.updated_at || null,
      dashboard,
      leagues,
    },
    200,
    { "Cache-Control": "no-store" }
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

  const userRow = await db.prepare("SELECT id, name, avatar_json FROM ezra_users WHERE id = ?1 LIMIT 1").bind(userId).first();
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
  const memberKeys = [
    `acct:${String(userId || "").trim()}`,
    String(userId || "").trim(),
    `acct:${String(userRow?.name || "").trim()}`,
    String(userRow?.name || "").trim(),
  ].filter(Boolean);
  const allPredictions = state?.familyLeague?.predictions && typeof state.familyLeague.predictions === "object" ? state.familyLeague.predictions : {};
  const resultCache = new Map();
  const predictions = (
    await Promise.all(
      Object.values(allPredictions)
        .filter((record) => {
          if (!record || typeof record !== "object") return false;
          if (!record.entries || typeof record.entries !== "object") return false;
          return memberKeys.some((key) => record.entries[key] && typeof record.entries[key] === "object");
        })
        .map(async (record) => {
          const pick = memberKeys.map((key) => record.entries[key]).find((value) => value && typeof value === "object") || {};
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
      user: {
        id: userRow.id,
        name: userRow.name || "User",
        titlesWon: Math.max(0, Number(targetTitles?.c || 0)),
        avatar: parseAvatarConfig(userRow.avatar_json, userRow.name || userRow.id),
      },
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

async function handleSocialFollow(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const followedUserId = String(body?.followedUserId || body?.targetUserId || "").trim();
  if (!followedUserId) return json({ error: "Missing followed user id." }, 400);
  if (followedUserId === String(session.user_id || "")) {
    return json({ error: "You cannot follow yourself." }, 400);
  }
  const target = await db.prepare("SELECT id, name FROM ezra_users WHERE id = ?1 LIMIT 1").bind(followedUserId).first();
  if (!target?.id) return json({ error: "User not found." }, 404);
  const alreadyFollowing = await db
    .prepare(
      `
      SELECT 1
      FROM ezra_user_follows
      WHERE follower_user_id = ?1
        AND followed_user_id = ?2
      LIMIT 1
      `
    )
    .bind(String(session.user_id || ""), followedUserId)
    .first();
  if (alreadyFollowing) {
    return json(
      {
        ok: true,
        status: "accepted",
        followedUserId,
        followedName: target.name || "User",
        message: "Already following.",
      },
      200
    );
  }
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT INTO ezra_follow_requests
        (follower_user_id, followed_user_id, status, created_at, updated_at)
      VALUES (?1, ?2, 'pending', ?3, ?3)
      ON CONFLICT(follower_user_id, followed_user_id) DO UPDATE SET
        status = 'pending',
        updated_at = excluded.updated_at
      `
    )
    .bind(String(session.user_id || ""), followedUserId, nowIso)
    .run();
  return json(
    {
      ok: true,
      status: "pending",
      followedUserId,
      followedName: target.name || "User",
      message: "Follow request sent.",
    },
    200
  );
}

async function handleSocialUnfollow(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const followedUserId = String(body?.followedUserId || body?.targetUserId || "").trim();
  if (!followedUserId) return json({ error: "Missing followed user id." }, 400);
  if (followedUserId === String(session.user_id || "")) {
    return json({ error: "You cannot unfollow yourself." }, 400);
  }
  await db
    .prepare(
      `
      DELETE FROM ezra_user_follows
      WHERE follower_user_id = ?1
        AND followed_user_id = ?2
      `
    )
    .bind(String(session.user_id || ""), followedUserId)
    .run();
  await db
    .prepare(
      `
      DELETE FROM ezra_follow_requests
      WHERE follower_user_id = ?1
        AND followed_user_id = ?2
      `
    )
    .bind(String(session.user_id || ""), followedUserId)
    .run();
  return json({ ok: true, followedUserId }, 200);
}

async function handleSocialFollowRequests(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const me = String(session.user_id || "");
  const incomingRows = await db
    .prepare(
      `
      SELECT fr.follower_user_id AS user_id,
             u.name AS user_name,
             fr.created_at,
             fr.updated_at
      FROM ezra_follow_requests fr
      JOIN ezra_users u ON u.id = fr.follower_user_id
      WHERE fr.followed_user_id = ?1
        AND fr.status = 'pending'
      ORDER BY fr.updated_at DESC, fr.created_at DESC
      LIMIT 50
      `
    )
    .bind(me)
    .all();
  const outgoingRows = await db
    .prepare(
      `
      SELECT fr.followed_user_id AS user_id,
             u.name AS user_name,
             fr.created_at,
             fr.updated_at
      FROM ezra_follow_requests fr
      JOIN ezra_users u ON u.id = fr.followed_user_id
      WHERE fr.follower_user_id = ?1
        AND fr.status = 'pending'
      ORDER BY fr.updated_at DESC, fr.created_at DESC
      LIMIT 50
      `
    )
    .bind(me)
    .all();
  const incoming = (incomingRows?.results || []).map((row) => ({
    userId: String(row?.user_id || ""),
    userName: String(row?.user_name || "User"),
    createdAt: String(row?.created_at || ""),
    updatedAt: String(row?.updated_at || ""),
  }));
  const outgoing = (outgoingRows?.results || []).map((row) => ({
    userId: String(row?.user_id || ""),
    userName: String(row?.user_name || "User"),
    createdAt: String(row?.created_at || ""),
    updatedAt: String(row?.updated_at || ""),
  }));
  return json({ incoming, outgoing }, 200, { "Cache-Control": "no-store" });
}

async function handleSocialFollowRespond(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const body = await parseJson(request);
  const followerUserId = String(body?.followerUserId || "").trim();
  const accept = Boolean(body?.accept);
  if (!followerUserId) return json({ error: "Missing follower user id." }, 400);
  const me = String(session.user_id || "");
  if (followerUserId === me) return json({ error: "Invalid follow response target." }, 400);
  const pending = await db
    .prepare(
      `
      SELECT follower_user_id, followed_user_id
      FROM ezra_follow_requests
      WHERE follower_user_id = ?1
        AND followed_user_id = ?2
        AND status = 'pending'
      LIMIT 1
      `
    )
    .bind(followerUserId, me)
    .first();
  if (!pending) {
    return json({ error: "No pending request found." }, 404);
  }
  const nowIso = new Date().toISOString();
  if (accept) {
    await db
      .prepare(
        `
        INSERT OR IGNORE INTO ezra_user_follows (follower_user_id, followed_user_id, created_at)
        VALUES (?1, ?2, ?3)
        `
      )
      .bind(followerUserId, me, nowIso)
      .run();
    await db
      .prepare(
        `
        UPDATE ezra_follow_requests
        SET status = 'accepted',
            updated_at = ?3
        WHERE follower_user_id = ?1
          AND followed_user_id = ?2
        `
      )
      .bind(followerUserId, me, nowIso)
      .run();
    return json({ ok: true, status: "accepted", followerUserId }, 200);
  }
  await db
    .prepare(
      `
      UPDATE ezra_follow_requests
      SET status = 'declined',
          updated_at = ?3
      WHERE follower_user_id = ?1
        AND followed_user_id = ?2
      `
    )
    .bind(followerUserId, me, nowIso)
    .run();
  return json({ ok: true, status: "declined", followerUserId }, 200);
}

async function handleSocialFeed(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const limit = Math.max(5, Math.min(30, Number(url.searchParams.get("limit") || 12)));
  const scopeRaw = String(url.searchParams.get("scope") || "all").trim().toLowerCase();
  const scope = scopeRaw === "following" || scopeRaw === "league" ? scopeRaw : "all";
  const code = normalizeLeagueCode(url.searchParams.get("code"));
  const userId = String(session.user_id || "");

  const follows = await db
    .prepare("SELECT followed_user_id FROM ezra_user_follows WHERE follower_user_id = ?1")
    .bind(userId)
    .all();
  const followedIds = (follows?.results || []).map((row) => String(row?.followed_user_id || "")).filter(Boolean);
  let targetIds = Array.from(new Set([userId, ...followedIds]));
  if (scope === "following") {
    targetIds = followedIds;
  } else if (scope === "league") {
    const members = code
      ? await db.prepare("SELECT user_id FROM ezra_league_members WHERE league_code = ?1").bind(code).all()
      : { results: [] };
    targetIds = (members?.results || []).map((row) => String(row?.user_id || "")).filter(Boolean);
  }
  if (!targetIds.length) return json({ events: [], followingUserIds: followedIds }, 200);
  const placeholders = targetIds.map((_, i) => `?${i + 1}`).join(", ");
  const bindings = [...targetIds];
  let whereCode = "";
  if (code) {
    whereCode = ` AND se.league_code = ?${bindings.length + 1}`;
    bindings.push(code);
  }
  const rows = await db
    .prepare(
      `
      SELECT se.id, se.league_code, se.user_id, se.event_type, se.payload_json, se.created_at, u.name
      FROM ezra_social_events se
      JOIN ezra_users u ON u.id = se.user_id
      WHERE se.user_id IN (${placeholders}) ${whereCode}
      ORDER BY se.created_at DESC, se.id DESC
      LIMIT ${limit}
      `
    )
    .bind(...bindings)
    .all();

  const events = (rows?.results || []).map((row) => {
    const payload = safeParseJsonText(row?.payload_json || "{}");
    const name = String(row?.name || "Player");
    let message = "New update";
    switch (row.event_type) {
      case "perfect_scoreline": {
        const hs = Number(payload?.finalHome);
        const as = Number(payload?.finalAway);
        const fixture = `${String(payload?.homeTeam || "Home")} ${Number.isFinite(hs) ? hs : "?"}-${Number.isFinite(as) ? as : "?"} ${String(payload?.awayTeam || "Away")}`;
        message = `${name} nailed the exact score • ${fixture}`;
        break;
      }
      case "climbed_to_1":
        message = `${name} climbed to #1 in the league`;
        break;
      case "streak_milestone":
        message = `${name} is on a ${Number(payload?.streakDays || 0)}-day quest streak 🔥`;
        break;
      case "combo_milestone":
        message = `${name} hit a ${Number(payload?.comboCount || 0)}-prediction combo ⚡`;
        break;
      case "achievement_unlocked":
        message = `${name} unlocked ${String(payload?.icon || "🏅")} ${String(payload?.name || "an achievement")}`;
        break;
      case "title_won":
        message = `${name} won the league title! 👑 (${String(payload?.titlesWon || 1)} total)`;
        break;
      case "new_member":
        message = `${name} joined the league`;
        break;
      case "referral_reward":
        message = `${name} earned a referral bonus 🤝`;
        break;
      default:
        message = `${name} made a move`;
    }
    return {
      id: Number(row?.id || 0),
      leagueCode: normalizeLeagueCode(row?.league_code),
      userId: String(row?.user_id || ""),
      userName: name,
      type: String(row?.event_type || ""),
      message,
      payload,
      createdAt: String(row?.created_at || ""),
    };
  });
  return json({ events, followingUserIds: followedIds }, 200, { "Cache-Control": "no-store" });
}

// Prediction market — aggregate league picks per fixture as % breakdown.
async function handleLeaguePredictionMarket(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const code = normalizeLeagueCode(url.searchParams.get("code"));
  if (!code) return json({ error: "Missing league code." }, 400);
  const inLeague = await isLeagueMember(db, code, session.user_id);
  if (!inLeague) return json({ error: "Not in this league." }, 403);

  const members = await db
    .prepare("SELECT user_id FROM ezra_league_members WHERE league_code = ?1")
    .bind(code)
    .all();
  const memberIds = (members?.results || []).map((r) => String(r?.user_id || "")).filter(Boolean);

  // Accumulate pick counts per fixture per outcome.
  const marketMap = new Map(); // eventId → { H: n, D: n, A: n, total: n }
  await Promise.all(
    memberIds.map(async (uid) => {
      const row = await db
        .prepare("SELECT state_json FROM ezra_profile_states WHERE user_id = ?1 LIMIT 1")
        .bind(uid)
        .first();
      const state = safeParseJsonText(row?.state_json || "{}");
      const predictions = state?.familyLeague?.predictions;
      if (!predictions || typeof predictions !== "object") return;
      const memberKeys = [
        `acct:${uid}`,
        uid,
      ];
      for (const record of Object.values(predictions)) {
        if (!record || typeof record !== "object") continue;
        const eventId = String(record.eventId || "").trim();
        if (!eventId) continue;
        const pick = memberKeys.map((k) => record.entries?.[k]).find((v) => v && typeof v === "object");
        if (!pick) continue;
        const h = numericScore(pick.home);
        const a = numericScore(pick.away);
        if (h === null || a === null) continue;
        const outcome = predictionResultCode(h, a);
        if (!marketMap.has(eventId)) marketMap.set(eventId, { H: 0, D: 0, A: 0, total: 0 });
        const entry = marketMap.get(eventId);
        entry[outcome] = (entry[outcome] || 0) + 1;
        entry.total += 1;
      }
    })
  );

  const market = {};
  for (const [eventId, counts] of marketMap.entries()) {
    const t = Math.max(1, counts.total);
    market[eventId] = {
      home: Math.round((counts.H / t) * 100),
      draw: Math.round((counts.D / t) * 100),
      away: Math.round((counts.A / t) * 100),
      total: counts.total,
    };
  }
  return json({ market }, 200, { "Cache-Control": "no-store" });
}

// User search by name — returns up to 20 results with follow status.
async function handleUsersSearch(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  if (!q || q.length < 2) return json({ users: [] }, 200);

  const nameKey = q.toLowerCase().replace(/\s+/g, " ");
  const rows = await db
    .prepare(
      `SELECT id, name, avatar_json
       FROM ezra_users
       WHERE name_key LIKE ?1
       LIMIT 20`
    )
    .bind(`${nameKey}%`)
    .all();
  const results = rows?.results || [];

  // Fetch follow status for each result.
  const me = String(session.user_id || "");
  const followRows = await db
    .prepare("SELECT followed_user_id FROM ezra_user_follows WHERE follower_user_id = ?1")
    .bind(me)
    .all();
  const followingSet = new Set(
    (followRows?.results || []).map((r) => String(r?.followed_user_id || ""))
  );
  const pendingRows = await db
    .prepare("SELECT followed_user_id FROM ezra_follow_requests WHERE follower_user_id = ?1 AND status = 'pending'")
    .bind(me)
    .all();
  const pendingSet = new Set(
    (pendingRows?.results || []).map((r) => String(r?.followed_user_id || ""))
  );

  const users = results
    .filter((row) => String(row?.id || "") !== me) // exclude self
    .map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || ""),
      avatar: parseAvatarConfig(row.avatar_json, row.name || row.id),
      isFollowing: followingSet.has(String(row.id || "")),
      followPending: pendingSet.has(String(row.id || "")),
    }));

  return json({ users }, 200, { "Cache-Control": "no-store" });
}

// Daily featured fixture — same for all users, resets at midnight UTC.
// Shared helper: pick a featured fixture from ezra_fixtures_cache (no TheSportsDB call).
// datesToTry is an array of ISO date strings to attempt in order (e.g. [today, tomorrow]).
async function selectFeaturedFixtureFromCache(db, datesToTry) {
  const leagueIds = ["4328", "4329", "4335"];
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  for (const dateStr of datesToTry) {
    for (const leagueId of shuffle(leagueIds)) {
      const rows = await db
        .prepare(
          `SELECT payload_json FROM ezra_fixtures_cache
           WHERE date_event = ?1 AND league_id = ?2
             AND (LOWER(COALESCE(status_text, '')) NOT LIKE '%match finish%'
               AND LOWER(COALESCE(status_text, '')) NOT LIKE '%full time%')
           ORDER BY str_time ASC LIMIT 10`
        )
        .bind(dateStr, leagueId)
        .all();
      const events = (rows?.results || [])
        .map((r) => { try { return JSON.parse(r.payload_json); } catch { return null; } })
        .filter(Boolean);
      if (!events.length) continue;
      const evt = shuffle(events)[0];
      return {
        eventId: String(evt.idEvent || ""),
        homeTeam: String(evt.strHomeTeam || ""),
        awayTeam: String(evt.strAwayTeam || ""),
        kickoff: evt.dateEvent && evt.strTime ? `${evt.dateEvent}T${normalizeTime(evt.strTime)}Z` : "",
        leagueId,
      };
    }
  }
  return null;
}

// Cron handler: pre-populate today's featured fixture from ezra_fixtures_cache.
// No-op if today's key is already set; tries tomorrow as fallback on days with no matches.
async function handleCronDailyFixture(db) {
  const today = todayIsoUtc();
  const todayKey = `daily_quest_fixture_${today}`;
  const existing = await getAppSetting(db, todayKey);
  if (existing) {
    try {
      JSON.parse(existing);
      return { ok: true, cached: true, date: today };
    } catch { /* corrupt value — fall through to refresh */ }
  }
  const fixture = await selectFeaturedFixtureFromCache(db, [today, tomorrowIsoUtc()]);
  if (fixture) {
    await setAppSetting(db, todayKey, JSON.stringify(fixture));
  }
  return { ok: true, cached: false, date: today, fixture: fixture || null };
}

async function handleDailyFixture(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const today = todayIsoUtc();
  const todayKey = `daily_quest_fixture_${today}`;
  // Return cron-pre-populated value if already set.
  const cached = await getAppSetting(db, todayKey);
  if (cached) {
    try {
      return json({ fixture: JSON.parse(cached) }, 200, { "Cache-Control": "no-store" });
    } catch { /* corrupt value — fall through */ }
  }
  // Fallback: cron hasn't run yet — select from DB cache and store for this request.
  const fixture = await selectFeaturedFixtureFromCache(db, [today, tomorrowIsoUtc()]);
  if (fixture) {
    await setAppSetting(db, todayKey, JSON.stringify(fixture));
  }
  return json({ fixture: fixture || null }, 200, { "Cache-Control": "no-store" });
}

// League season archive — titles won per season.
async function handleLeagueSeasonArchive(db, request) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const code = normalizeLeagueCode(url.searchParams.get("code"));
  if (!code) return json({ error: "Missing league code." }, 400);
  const inLeague = await isLeagueMember(db, code, session.user_id);
  if (!inLeague) return json({ error: "Not in this league." }, 403);

  const rows = await db
    .prepare(
      `SELECT t.season_id, t.user_id, t.awarded_at, u.name,
              COALESCE(sp.points, 0) AS points,
              COALESCE(ls.starts_at, '') AS starts_at,
              COALESCE(ls.ends_at, '') AS ends_at
       FROM ezra_league_season_titles t
       JOIN ezra_users u ON u.id = t.user_id
       LEFT JOIN ezra_league_season_points sp
         ON sp.league_code = t.league_code AND sp.season_id = t.season_id AND sp.user_id = t.user_id
       LEFT JOIN ezra_league_seasons ls
         ON ls.league_code = t.league_code AND ls.season_id = t.season_id
       WHERE t.league_code = ?1
       ORDER BY t.season_id DESC
       LIMIT 20`
    )
    .bind(code)
    .all();

  const seasons = (rows?.results || []).map((row) => ({
    seasonId: String(row.season_id || ""),
    userId: String(row.user_id || ""),
    userName: String(row.name || ""),
    points: Math.max(0, Number(row.points || 0)),
    awardedAt: String(row.awarded_at || ""),
    startsAt: String(row.starts_at || "").slice(0, 10),
    endsAt: String(row.ends_at || "").slice(0, 10),
  }));
  return json({ seasons }, 200, { "Cache-Control": "no-store" });
}

async function handleSocialRivalry(db, request, key) {
  const { session } = await accountAuth(db, request);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const requestedCode = normalizeLeagueCode(url.searchParams.get("code"));
  let code = requestedCode;
  if (!code) {
    const leagues = await listLeaguesForUser(db, session.user_id);
    code = normalizeLeagueCode(leagues?.[0]?.code || "");
  }
  if (!code) return json({ rivalry: null }, 200);
  const season = currentSevenDaySeasonWindow();
  await ensureLeagueSeason(db, code, season);

  const standingsRows = await db
    .prepare(
      `
      SELECT u.id AS user_id, u.name, COALESCE(sp.points, 0) AS points
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
    .bind(code, season.seasonId)
    .all();
  const rows = standingsRows?.results || [];
  const meIdx = rows.findIndex((row) => String(row?.user_id || "") === String(session.user_id || ""));
  if (meIdx < 0) return json({ rivalry: null }, 200);
  const ahead = meIdx > 0 ? rows[meIdx - 1] : null;
  const behind = meIdx < rows.length - 1 ? rows[meIdx + 1] : null;
  const mePoints = Math.max(0, Number(rows[meIdx]?.points || 0));

  const milestones = await db
    .prepare(
      `
      SELECT p.best_streak,
             (SELECT COUNT(*) FROM ezra_league_season_titles t WHERE t.league_code = ?1 AND t.user_id = ?2) AS titles_won,
             (SELECT COALESCE(SUM(exact_correct), 0) FROM ezra_user_team_mastery m WHERE m.user_id = ?2) AS exact_picks
      FROM ezra_user_progress p
      WHERE p.user_id = ?2
      LIMIT 1
      `
    )
    .bind(code, session.user_id)
    .first();

  const rivalry = {
    leagueCode: code,
    me: { points: mePoints, rank: meIdx + 1, name: String(rows[meIdx]?.name || "You") },
    ahead: ahead
      ? {
          userId: String(ahead.user_id || ""),
          name: String(ahead.name || "Player"),
          points: Math.max(0, Number(ahead.points || 0)),
          gap: Math.max(0, Number(ahead.points || 0) - mePoints),
        }
      : null,
    behind: behind
      ? {
          userId: String(behind.user_id || ""),
          name: String(behind.name || "Player"),
          points: Math.max(0, Number(behind.points || 0)),
          gap: Math.max(0, mePoints - Number(behind.points || 0)),
        }
      : null,
    milestones: {
      bestStreak: Math.max(0, Number(milestones?.best_streak || 0)),
      titlesWon: Math.max(0, Number(milestones?.titles_won || 0)),
      exactPicks: Math.max(0, Number(milestones?.exact_picks || 0)),
    },
  };
  return json({ rivalry }, 200, { "Cache-Control": "no-store" });
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
  const settleStatus = await getLeagueSettleStatus(db, code);
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
      settleStatus,
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
  const normalizer = await runPredictionKeyNormalizerOnce(db);
  const rows = await db.prepare("SELECT code FROM ezra_leagues").all();
  const codes = (rows?.results || []).map((row) => normalizeLeagueCode(row?.code)).filter(Boolean);
  for (const code of codes) {
    await ensureLeagueScoresSettled(db, code, key, { force: true, minIntervalMs: 0 });
  }
  return json(
    {
      ok: true,
      leaguesProcessed: codes.length,
      settledAt: new Date().toISOString(),
      predictionKeyNormalizer: normalizer,
    },
    200
  );
}

async function handleCronNormalizePredictions(db, request, env) {
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
  const result = await runPredictionKeyNormalizerOnce(db);
  return json({ ok: true, predictionKeyNormalizer: result, at: new Date().toISOString() }, 200);
}

async function handleEzraAdminRoute(context, adminPath) {
  const { request, env } = context;
  const db = env.EZRA_DB;
  const key = String(env?.SPORTSDB_KEY || "074910");
  if (!db) {
    return json({ error: "Account storage not configured. Add D1 binding EZRA_DB." }, 503);
  }

  try {
    await ensureAccountSchema(db);
    const route = String(adminPath || "").toLowerCase();
    if (route === "login" && request.method === "POST") {
      return handleAdminLogin(env, request);
    }
    if (route === "users" && request.method === "GET") {
      return handleAdminUsersOverview(db, env, request);
    }
    if (route === "rescore-all" && request.method === "POST") {
      return handleAdminRescoreAll(db, env, request, key);
    }
    if (route === "league-visibility" && request.method === "GET") {
      return handleAdminLeagueVisibilityGet(db, env, request);
    }
    if (route === "league-visibility" && (request.method === "PUT" || request.method === "PATCH")) {
      return handleAdminLeagueVisibilityPut(db, env, request);
    }
    if (route === "set-score-floor" && request.method === "POST") {
      return handleAdminSetScoreFloor(db, env, request);
    }
    if (route === "grant-points" && request.method === "POST") {
      return handleAdminGrantPoints(db, env, request);
    }

    return json({ error: "Unsupported admin route or method" }, 405);
  } catch (err) {
    return json(
      {
        error: "Admin route failed",
        detail: String(err?.message || err),
      },
      500
    );
  }
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
    if (route === "bootstrap" && request.method === "GET") {
      return handleAccountBootstrap(context, db, request, key);
    }
    if (route === "me" && (request.method === "PATCH" || request.method === "PUT")) {
      return handleAccountUpdateMe(db, request, env);
    }
    if (route === "avatar" && request.method === "GET") {
      return handleAccountGetAvatar(db, request);
    }
    if (route === "avatar" && (request.method === "PUT" || request.method === "PATCH")) {
      return handleAccountPutAvatar(db, request);
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
    if (route === "league/invite/create" && request.method === "POST") {
      return handleLeagueInviteCreate(db, request, env);
    }
    if (route === "league/invite/meta" && request.method === "GET") {
      return handleLeagueInviteMeta(db, request, env);
    }
    if (route === "league/invite/join" && request.method === "POST") {
      return handleLeagueJoinInvite(db, request, env);
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
    if (route === "follow" && request.method === "POST") {
      return handleSocialFollow(db, request);
    }
    if (route === "unfollow" && request.method === "POST") {
      return handleSocialUnfollow(db, request);
    }
    if (route === "follow/requests" && request.method === "GET") {
      return handleSocialFollowRequests(db, request);
    }
    if (route === "follow/respond" && request.method === "POST") {
      return handleSocialFollowRespond(db, request);
    }
    if (route === "feed" && request.method === "GET") {
      return handleSocialFeed(db, request);
    }
    if (route === "rivalry" && request.method === "GET") {
      return handleSocialRivalry(db, request, key);
    }
    if (route === "league/market" && request.method === "GET") {
      return handleLeaguePredictionMarket(db, request);
    }
    if (route === "league/archive" && request.method === "GET") {
      return handleLeagueSeasonArchive(db, request);
    }
    if (route === "users/search" && request.method === "GET") {
      return handleUsersSearch(db, request);
    }
    if (route === "daily-fixture" && request.method === "GET") {
      return handleDailyFixture(db, request);
    }
    if (route === "league/standings" && request.method === "GET") {
      return handlePublicLeagueStandings(db, request, key);
    }
    if (route === "challenges/dashboard" && request.method === "GET") {
      return handleChallengeDashboard(db, request, key);
    }
    if (route === "cron/settle" && (request.method === "POST" || request.method === "GET")) {
      return await handleCronSettle(db, request, key, env);
    }
    if (route === "cron/normalize-predictions" && (request.method === "POST" || request.method === "GET")) {
      return await handleCronNormalizePredictions(db, request, env);
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
    if (route === "cron/daily-fixture" && (request.method === "POST" || request.method === "GET")) {
      const incoming = String(request.headers.get("x-ezra-cron-secret") || "").trim();
      const configured = String(env.EZRA_CRON_SECRET || "").trim();
      if (!configured || incoming !== configured) {
        return json({ error: "Unauthorized cron call" }, 401);
      }
      return json(await handleCronDailyFixture(db));
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

const TABLE_LEAGUE_IDS = ["4328", "4329", "4335"];
const TABLE_REFRESH_LIVE_MS = 60 * 1000;
const TABLE_REFRESH_MATCHDAY_MS = 2 * 60 * 1000;
const TABLE_REFRESH_IDLE_MS = 15 * 60 * 1000;
const FIXTURE_HISTORY_DAYS = 92;
const FIXTURE_FUTURE_DAYS = 183;
const LEAGUE_SETTLE_MIN_INTERVAL_MS = 60 * 1000;
const LEAGUE_SETTLE_LOCK_MS = 45 * 1000;
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
    "4335": "Spanish La Liga",
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

function firstDefined(event, keys) {
  for (const key of keys) {
    const value = event?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function normalizeEventForCache(rawEvent) {
  const event = rawEvent && typeof rawEvent === "object" ? { ...rawEvent } : {};
  const ts = String(firstDefined(event, ["strTimestamp", "timestamp", "dateTime"]) || "").trim();
  const tsDate = ts ? normalizeEventDate(ts.slice(0, 10)) : "";
  const tsTime = ts && ts.includes("T") ? normalizeTime(ts.split("T")[1] || "") : "";

  const dateEvent = normalizeEventDate(firstDefined(event, ["dateEvent", "strDate", "date"]) || tsDate);
  const strTime = normalizeTime(firstDefined(event, ["strTime", "time"]) || tsTime);

  const homeScore = numericScore(firstDefined(event, ["intHomeScore", "strHomeScore", "intHome", "intScoreHome", "homeScore"]));
  const awayScore = numericScore(firstDefined(event, ["intAwayScore", "strAwayScore", "intAway", "intScoreAway", "awayScore"]));

  return {
    ...event,
    idEvent: String(firstDefined(event, ["idEvent", "eventId", "id"]) || event.idEvent || "").trim(),
    dateEvent: dateEvent || String(event.dateEvent || "").trim(),
    strTime: strTime || String(event.strTime || "").trim(),
    strHomeTeam: String(firstDefined(event, ["strHomeTeam", "strHome", "homeTeam"]) || event.strHomeTeam || "").trim(),
    strAwayTeam: String(firstDefined(event, ["strAwayTeam", "strAway", "awayTeam"]) || event.strAwayTeam || "").trim(),
    idHomeTeam: String(firstDefined(event, ["idHomeTeam", "homeTeamId", "idHome"]) || event.idHomeTeam || "").trim(),
    idAwayTeam: String(firstDefined(event, ["idAwayTeam", "awayTeamId", "idAway"]) || event.idAwayTeam || "").trim(),
    intHomeScore: homeScore,
    intAwayScore: awayScore,
    strStatus: String(firstDefined(event, ["strStatus", "status"]) || event.strStatus || "").trim(),
    strProgress: String(firstDefined(event, ["strProgress", "strMinute", "minute"]) || event.strProgress || "").trim(),
    strLeague: String(firstDefined(event, ["strLeague", "league"]) || event.strLeague || "").trim(),
    strTimestamp: ts || String(event.strTimestamp || "").trim(),
  };
}

function mergeEventsByKey(events) {
  const map = new Map();
  for (const rawEvent of events || []) {
    const event = normalizeEventForCache(rawEvent);
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
    const event = normalizeEventForCache(raw);
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
    return json({ error: "Missing or invalid parameters. Use l=4328|4329|4335 and d=YYYY-MM-DD" }, 400);
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

  let eventsOut = sortByDateTime(fromCache);
  eventsOut = await hydrateEventScoresForDay(eventsOut, key, db, dateIso);
  if (dateIso === todayIso) {
    try {
      const origin = `${url.protocol}//${url.host}`;
      const live = await ensureLiveSnapshot(caches.default, origin, key);
      const liveLeague = Array.isArray(live?.snapshot?.leagues?.[leagueId]) ? live.snapshot.leagues[leagueId] : [];
      if (liveLeague.length) {
        eventsOut = sortByDateTime(mergeEvents(eventsOut, liveLeague).map((event) => normalizeEventForCache(event)));
      }
      eventsOut = await hydrateLiveScoresForEvents(eventsOut, key, db);
    } catch {
      // Keep cached events if live merge fails.
    }
  }

  return json(
    {
      events: eventsOut,
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
  const lowered = raw.toLowerCase();
  if (lowered.includes("premier")) return "4328";
  if (lowered.includes("championship")) return "4329";
  if (lowered.includes("la liga") || lowered.includes("laliga")) return "4335";
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

async function handleEzraLeagueVisibilityRoute(context) {
  const { env } = context;
  const db = env.EZRA_DB;
  if (!db) {
    return json({ visibility: defaultLeagueVisibility() }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
  }
  try {
    await ensureAccountSchema(db);
    const visibility = await getLeagueVisibility(db);
    return json({ visibility }, 200, { "Cache-Control": "public, max-age=30, s-maxage=30" });
  } catch {
    return json({ visibility: defaultLeagueVisibility() }, 200, { "Cache-Control": "public, max-age=30, s-maxage=30" });
  }
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
  const normalized = normalizeEventForCache(event);
  if (normalized?.idEvent) return `id:${normalized.idEvent}`;
  return [
    "m",
    String(normalized?.dateEvent || ""),
    String(normalized?.strHomeTeam || "").toLowerCase(),
    String(normalized?.strAwayTeam || "").toLowerCase(),
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
  const normalized = normalizeEventForCache(event);
  return {
    idEvent: normalized.idEvent || "",
    dateEvent: normalized.dateEvent || "",
    strTime: normalized.strTime || "",
    strHomeTeam: normalized.strHomeTeam || "",
    strAwayTeam: normalized.strAwayTeam || "",
    idHomeTeam: normalized.idHomeTeam || "",
    idAwayTeam: normalized.idAwayTeam || "",
    intHomeScore: normalized.intHomeScore ?? null,
    intAwayScore: normalized.intAwayScore ?? null,
    strStatus: normalized.strStatus || "",
    strProgress: normalized.strProgress || "",
    strMinute: normalized.strMinute || "",
    strVenue: normalized.strVenue || "",
    strLeague: normalized.strLeague || "",
    strTimestamp: normalized.strTimestamp || "",
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
      return await handleEzraAccountRoute(context, accountPath, key);
    }
    if (version === "v1" && lowerPath.startsWith("ezra/admin")) {
      const adminPath = upstreamPath.slice("ezra/admin".length).replace(/^\/+/, "");
      return await handleEzraAdminRoute(context, adminPath);
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
    if (version === "v1" && lowerPath === "ezra/league-visibility" && request.method === "GET") {
      return handleEzraLeagueVisibilityRoute(context);
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
