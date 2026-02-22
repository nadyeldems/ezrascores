const API_PROXY_BASE = "/api";
const LIVE_REFRESH_MS = 25000;

const LEAGUES = {
  EPL: { id: "4328", name: "English Premier League" },
  CHAMP: { id: "4329", name: "English League Championship" },
};

const state = {
  selectedLeague: "ALL",
  selectedDate: "",
  selectedDateFixtures: { EPL: [], CHAMP: [] },
  fixtures: {
    today: { EPL: [], CHAMP: [] },
    live: { EPL: [], CHAMP: [] },
    previous: { EPL: [], CHAMP: [] },
    next: { EPL: [], CHAMP: [] },
  },
  tables: { EPL: [], CHAMP: [] },
  leagueBadges: { EPL: "", CHAMP: "" },
  teamBadgeMap: {},
  teamsByLeague: { EPL: [], CHAMP: [] },
  favoriteTeamId: localStorage.getItem("esra_favorite_team") || "",
  favoriteTeam: null,
  gameDayCountdownTimer: null,
  lastCountdownTarget: null,
  liveScoreSnapshot: new Map(),
  goalFlashes: new Map(),
  refreshInFlight: false,
  lastRefresh: null,
};

const el = {
  gameDayMessage: document.getElementById("game-day-message"),
  favoriteBanner: document.getElementById("favorite-banner"),
  fixturesList: document.getElementById("fixtures-list"),
  fixturesTitle: document.getElementById("fixtures-title"),
  datePicker: document.getElementById("date-picker"),
  datePrevBtn: document.getElementById("date-prev-btn"),
  dateNextBtn: document.getElementById("date-next-btn"),
  dateQuickButtons: [...document.querySelectorAll(".date-quick-btn")],
  tablesWrap: document.getElementById("tables-wrap"),
  lastRefreshed: document.getElementById("last-refreshed"),
  leagueButtons: [...document.querySelectorAll(".league-btn")],
  fixtureTemplate: document.getElementById("fixture-template"),
  tableTemplate: document.getElementById("table-template"),
  favoriteEmpty: document.getElementById("favorite-empty"),
  favoriteContent: document.getElementById("favorite-content"),
  favoriteLogo: document.getElementById("favorite-logo"),
  favoriteName: document.getElementById("favorite-name"),
  favoriteLeague: document.getElementById("favorite-league"),
  favoriteStatus: document.getElementById("favorite-status"),
  favoriteFixtureLine: document.getElementById("favorite-fixture-line"),
  favoriteFixtureDetail: document.getElementById("favorite-fixture-detail"),
  favoriteLiveStrip: document.getElementById("favorite-live-strip"),
  favoritePicker: document.getElementById("favorite-picker"),
  favoritePickerBtn: document.getElementById("favorite-picker-btn"),
  favoritePickerMenu: document.getElementById("favorite-picker-menu"),
  favoritePickerLogo: document.getElementById("favorite-picker-logo"),
  favoritePickerText: document.getElementById("favorite-picker-text"),
  debugGoalBtn: document.getElementById("debug-goal-btn"),
};

function clearGameDayCountdownTimer() {
  if (state.gameDayCountdownTimer) {
    clearInterval(state.gameDayCountdownTimer);
    state.gameDayCountdownTimer = null;
  }
}

function setGameDayMessage(text, mode = "neutral") {
  if (!el.gameDayMessage) return;
  el.gameDayMessage.textContent = text;
  el.gameDayMessage.classList.remove("neutral", "countdown", "gameday");
  el.gameDayMessage.classList.add(mode);
}

function daysUntilDate(dateIso) {
  if (!dateIso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function animateCountdownDays(targetDays) {
  clearGameDayCountdownTimer();
  const safeTarget = Math.max(0, Number(targetDays) || 0);
  const start = Math.max(safeTarget + 6, 8);
  let current = start;
  setGameDayMessage(`${current} DAYS UNTIL GAME DAY`, "countdown");
  state.gameDayCountdownTimer = setInterval(() => {
    current -= 1;
    if (current <= safeTarget) {
      setGameDayMessage(`${safeTarget} DAY${safeTarget === 1 ? "" : "S"} UNTIL GAME DAY`, "countdown");
      clearGameDayCountdownTimer();
      return;
    }
    setGameDayMessage(`${current} DAYS UNTIL GAME DAY`, "countdown");
  }, 80);
}

function clampChannel(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function brightenColor(rgb, minLuma = 85) {
  const [r, g, b] = rgb;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma >= minLuma) return [r, g, b];
  const factor = minLuma / Math.max(1, luma);
  return [clampChannel(r * factor), clampChannel(g * factor), clampChannel(b * factor)];
}

function darkenColor(rgb, factor = 0.55) {
  return rgb.map((c) => clampChannel(c * factor));
}

function resetFavoriteTheme() {
  if (!el.favoriteBanner) return;
  el.favoriteBanner.style.removeProperty("--fav-rgb");
  el.favoriteBanner.style.removeProperty("--fav-border");
}

function applyFavoriteTheme(rgb) {
  if (!el.favoriteBanner || !rgb) return;
  const [r, g, b] = brightenColor(rgb);
  const [br, bg, bb] = darkenColor([r, g, b], 0.58);
  el.favoriteBanner.style.setProperty("--fav-rgb", `${r}, ${g}, ${b}`);
  el.favoriteBanner.style.setProperty("--fav-border", `rgb(${br}, ${bg}, ${bb})`);
}

async function dominantColorFromImage(url) {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 40;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const bins = new Map();

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 140) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r < 20 && g < 20 && b < 20) continue;
          const qr = Math.floor(r / 24) * 24;
          const qg = Math.floor(g / 24) * 24;
          const qb = Math.floor(b / 24) * 24;
          const key = `${qr},${qg},${qb}`;
          bins.set(key, (bins.get(key) || 0) + 1);
        }

        if (!bins.size) return resolve(null);
        const [best] = [...bins.entries()].sort((a, b) => b[1] - a[1])[0];
        const rgb = best.split(",").map(Number);
        resolve(rgb.length === 3 ? rgb : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function updateFavoriteThemeFromBadge(badgeUrl) {
  const rgb = await dominantColorFromImage(badgeUrl);
  if (!rgb) {
    resetFavoriteTheme();
    return;
  }
  applyFavoriteTheme(rgb);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return "TBA";
  const full = new Date(`${dateStr}T${timeStr || "12:00:00"}`);
  return full.toLocaleString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateUK(dateIso) {
  if (!dateIso) return "--";
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function safeArray(payload, key = "events") {
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

function firstArrayValue(payload) {
  if (!payload || typeof payload !== "object") return [];
  const key = Object.keys(payload).find((k) => Array.isArray(payload[k]));
  return key ? payload[key] : [];
}

function parseStatusText(event) {
  return (event?.strStatus || event?.strProgress || "").toLowerCase();
}

function hasScore(event) {
  return event?.intHomeScore !== null && event?.intHomeScore !== undefined && event?.intAwayScore !== null && event?.intAwayScore !== undefined;
}

function isLiveEvent(event) {
  const s = parseStatusText(event);
  if (!s) return false;
  if (/\b(ht|1h|2h|live|in play|playing|et|pen)\b/.test(s)) return true;
  return /\d{1,3}\s*'/.test(s);
}

function isFinalEvent(event) {
  const s = parseStatusText(event);
  if (/\b(ft|full time|match finished|finished|aet|after pen|final)\b/.test(s)) return true;
  return false;
}

function eventState(event) {
  const today = toISODate(new Date());
  const date = event?.dateEvent;
  if (isLiveEvent(event)) {
    return { key: "live", label: "live" };
  }
  if (isFinalEvent(event)) {
    return { key: "final", label: "final score" };
  }
  if (hasScore(event) && date && date < today) {
    return { key: "final", label: "final score" };
  }
  if (hasScore(event) && date === today) {
    const kickoffUtc = new Date(`${date}T${event.strTime || "12:00:00"}Z`);
    if (!Number.isNaN(kickoffUtc.getTime())) {
      const elapsedMs = Date.now() - kickoffUtc.getTime();
      if (elapsedMs < 0) return { key: "upcoming", label: "upcoming" };
      if (elapsedMs <= 3 * 60 * 60 * 1000) return { key: "live", label: "live" };
      return { key: "final", label: "final score" };
    }
    return { key: "live", label: "live" };
  }
  return { key: "upcoming", label: "upcoming" };
}

function mergeTodayWithLive(todayEvents, liveEvents) {
  const mergedById = new Map();
  todayEvents.forEach((event) => {
    const key = event.idEvent || `${event.strHomeTeam}|${event.strAwayTeam}|${event.dateEvent}`;
    mergedById.set(key, event);
  });

  liveEvents.forEach((event) => {
    const key = event.idEvent || `${event.strHomeTeam}|${event.strAwayTeam}|${event.dateEvent}`;
    const existing = mergedById.get(key) || {};
    mergedById.set(key, { ...existing, ...event });
  });

  return [...mergedById.values()];
}

function fixtureSort(a, b) {
  const priority = { live: 0, upcoming: 1, final: 2 };
  const pa = priority[eventState(a).key] ?? 9;
  const pb = priority[eventState(b).key] ?? 9;
  if (pa !== pb) return pa - pb;
  const ta = `${a.dateEvent || ""}T${(a.strTime || "00:00:00").slice(0, 8)}`;
  const tb = `${b.dateEvent || ""}T${(b.strTime || "00:00:00").slice(0, 8)}`;
  return ta.localeCompare(tb);
}

function sortEventsForColumn(events, columnMode) {
  const sorted = [...events].sort(fixtureSort);
  if (columnMode === "previous") {
    return sorted;
  }
  return sorted;
}

function formatKickoffTime(event) {
  if (!event?.strTime) return "TBA";
  if (event?.dateEvent) {
    const dt = new Date(`${event.dateEvent}T${event.strTime}`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
  }
  const time = event.strTime.slice(0, 5);
  return time || "TBA";
}

async function apiGetV1(path) {
  const res = await fetch(`${API_PROXY_BASE}/v1/${path}`);
  if (!res.ok) {
    throw new Error(`API call failed (${res.status}) for ${path}`);
  }
  return res.json();
}

async function apiGetV2(path) {
  const res = await fetch(`${API_PROXY_BASE}/v2/${path}`);
  if (!res.ok) {
    throw new Error(`API call failed (${res.status}) for ${path}`);
  }
  return res.json();
}

async function fetchLeagueDayFixtures(leagueId, dateIso) {
  const league = Object.values(LEAGUES).find((l) => l.id === leagueId);
  const leagueName = league?.name || leagueId;

  const tryPaths = [
    `eventsday.php?d=${encodeURIComponent(dateIso)}&l=${encodeURIComponent(leagueId)}`,
    `eventsday.php?d=${encodeURIComponent(dateIso)}&l=${encodeURIComponent(leagueName)}`,
  ];

  for (const path of tryPaths) {
    try {
      const data = await apiGetV1(path);
      const events = safeArray(data);
      if (events.length) return events;
    } catch (err) {
      console.error(err);
    }
  }

  const today = toISODate(new Date());
  const fallbackPath =
    dateIso < today ? `eventspastleague.php?id=${leagueId}` : `eventsnextleague.php?id=${leagueId}`;

  try {
    const data = await apiGetV1(fallbackPath);
    return safeArray(data).filter((e) => e.dateEvent === dateIso);
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function fetchLiveByLeague(leagueId) {
  const league = Object.values(LEAGUES).find((l) => l.id === leagueId);
  const leagueName = league?.name || leagueId;

  const v2Paths = [`livescore/${leagueId}`, `livescore.php?l=${encodeURIComponent(leagueId)}`];
  for (const path of v2Paths) {
    try {
      const data = await apiGetV2(path);
      const events = safeArray(data).length ? safeArray(data) : firstArrayValue(data);
      if (events.length) return events;
    } catch (err) {
      console.error(err);
    }
  }

  const v1Paths = [
    `livescore.php?l=${encodeURIComponent(leagueName)}`,
    `livescore.php?l=${encodeURIComponent(leagueId)}`,
  ];
  for (const path of v1Paths) {
    try {
      const data = await apiGetV1(path);
      const events = safeArray(data).length ? safeArray(data) : firstArrayValue(data);
      if (events.length) return events;
    } catch (err) {
      console.error(err);
    }
  }

  return [];
}

async function fetchTable(leagueId) {
  const data = await apiGetV1(`lookuptable.php?l=${leagueId}`);
  return safeArray(data, "table");
}

async function fetchLeagueMeta(leagueId) {
  const data = await apiGetV1(`lookupleague.php?id=${leagueId}`);
  return Array.isArray(data?.leagues) && data.leagues[0] ? data.leagues[0] : null;
}

async function fetchPastLeagueEvents(leagueId) {
  const data = await apiGetV1(`eventspastleague.php?id=${leagueId}`);
  return safeArray(data);
}

async function fetchAllTeams(leagueId) {
  const league = Object.values(LEAGUES).find((l) => l.id === leagueId);
  const leagueName = league?.name || leagueId;

  const byId = await safeLoad(async () => {
    const data = await apiGetV1(`lookup_all_teams.php?id=${leagueId}`);
    return safeArray(data, "teams");
  }, []);

  if (byId.length) return byId;

  return safeLoad(async () => {
    const data = await apiGetV1(`search_all_teams.php?l=${encodeURIComponent(leagueName)}`);
    return safeArray(data, "teams");
  }, []);
}

async function fetchTeamById(teamId) {
  const data = await apiGetV1(`lookupteam.php?id=${teamId}`);
  return Array.isArray(data?.teams) && data.teams[0] ? data.teams[0] : null;
}

async function fetchTeamNextEvents(teamId) {
  const data = await apiGetV1(`eventsnext.php?id=${teamId}`);
  return safeArray(data);
}

async function fetchTeamLastEvents(teamId) {
  const data = await apiGetV1(`eventslast.php?id=${teamId}`);
  return safeArray(data);
}

async function fetchEventById(eventId) {
  if (!eventId) return null;
  const data = await apiGetV1(`lookupevent.php?id=${eventId}`);
  return Array.isArray(data?.events) && data.events[0] ? data.events[0] : null;
}

function teamLeagueCode(team) {
  if (!team) return "";
  const leagueName = team.strLeague || "";
  if (leagueName.includes("Premier")) return "EPL";
  if (leagueName.includes("Championship")) return "CHAMP";
  return "";
}

function ordinalSuffix(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  const mod10 = x % 10;
  const mod100 = x % 100;
  if (mod10 === 1 && mod100 !== 11) return `${x}st`;
  if (mod10 === 2 && mod100 !== 12) return `${x}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${x}rd`;
  return `${x}th`;
}

function getTeamTablePosition(team) {
  if (!team?.idTeam) return "";
  const leagueCode = teamLeagueCode(team);
  const rows = state.tables[leagueCode] || [];
  const row =
    rows.find((r) => r.idTeam === team.idTeam) ||
    rows.find((r) => (r.strTeam || "").toLowerCase() === (team.strTeam || "").toLowerCase());
  if (!row?.intRank) return "";
  return ordinalSuffix(row.intRank);
}

function setFavoritePickerDisplay(team) {
  if (!team) {
    el.favoritePickerLogo.classList.add("hidden");
    el.favoritePickerLogo.src = "";
    el.favoritePickerText.textContent = "Select favourite team";
    return;
  }
  el.favoritePickerLogo.classList.remove("hidden");
  el.favoritePickerLogo.src = team.strBadge || "";
  el.favoritePickerLogo.alt = `${team.strTeam} badge`;
  el.favoritePickerText.textContent = `${team.strTeam} (${team.strLeague || "League"})`;
}

function ensureDefaultFavoriteTeam() {
  const allTeams = [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP];
  if (!allTeams.length) return;
  const currentExists = allTeams.some((team) => team.idTeam === state.favoriteTeamId);
  if (currentExists) return;
  const hull = allTeams.find((team) => (team.strTeam || "").toLowerCase() === "hull city");
  if (!hull?.idTeam) return;
  state.favoriteTeamId = hull.idTeam;
  state.favoriteTeam = hull;
  localStorage.setItem("esra_favorite_team", state.favoriteTeamId);
}

function renderFixtureList(target, events, mode) {
  target.innerHTML = "";
  const sortedEvents = sortEventsForColumn(events, mode);
  if (!sortedEvents.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = "No fixtures found.";
    target.appendChild(div);
    return;
  }

  sortedEvents.forEach((event) => {
    const node = el.fixtureTemplate.content.firstElementChild.cloneNode(true);
    const stateInfo = eventState(event);
    const key = fixtureKey(event);
    const homeName = event.strHomeTeam || "TBC";
    const awayName = event.strAwayTeam || "TBC";

    const home = event.intHomeScore;
    const away = event.intAwayScore;
    const hasScores = home !== null && home !== undefined && away !== null && away !== undefined;
    const homeScoreText = hasScores ? String(home) : "–";
    const awayScoreText = hasScores ? String(away) : "–";

    const statusEl = node.querySelector(".match-state");
    node.querySelector(".kickoff-time").textContent = formatKickoffTime(event);
    statusEl.textContent = stateInfo.label;
    statusEl.classList.add(stateInfo.key);
    node.querySelector(".home-team").textContent = homeName;
    node.querySelector(".away-team").textContent = awayName;
    const homeBadge = node.querySelector(".home-badge");
    const awayBadge = node.querySelector(".away-badge");
    const homeScoreEl = node.querySelector(".home-score");
    const awayScoreEl = node.querySelector(".away-score");
    const homeInlineScoreEl = node.querySelector(".home-inline-score");
    const awayInlineScoreEl = node.querySelector(".away-inline-score");
    const homeBadgeUrl = state.teamBadgeMap[homeName] || "";
    const awayBadgeUrl = state.teamBadgeMap[awayName] || "";
    homeBadge.src = homeBadgeUrl;
    homeBadge.alt = `${homeName} badge`;
    awayBadge.src = awayBadgeUrl;
    awayBadge.alt = `${awayName} badge`;
    homeScoreEl.textContent = homeScoreText;
    awayScoreEl.textContent = awayScoreText;
    homeInlineScoreEl.textContent = homeScoreText;
    awayInlineScoreEl.textContent = awayScoreText;
    if (!homeBadgeUrl) homeBadge.classList.add("hidden");
    if (!awayBadgeUrl) awayBadge.classList.add("hidden");
    if (hasScores) {
      if (Number(home) > Number(away)) {
        homeScoreEl.classList.add("leading");
        homeInlineScoreEl.classList.add("leading");
      }
      if (Number(away) > Number(home)) {
        awayScoreEl.classList.add("leading");
        awayInlineScoreEl.classList.add("leading");
      }
    }

    const leagueText = event.strLeague || "Unknown competition";
    const venueText = event.strVenue || "Venue TBD";
    const dt = formatDateTime(event.dateEvent, event.strTime);

    node.querySelector(".fixture-details").innerHTML = [
      `League: ${leagueText}`,
      `Kickoff: ${dt}`,
      `Venue: ${venueText}`,
      `Match State: ${stateInfo.label}`,
      event.strStatus ? `API Status: ${event.strStatus}` : "",
    ]
      .filter(Boolean)
      .join("<br>");

    const goalFlash = state.goalFlashes.get(key);
    const goalFlashEl = node.querySelector(".goal-flash");
    if (goalFlash && goalFlash.expiresAt > Date.now() && (stateInfo.key === "live" || goalFlash.force)) {
      goalFlashEl.classList.remove("hidden");
      goalFlashEl.classList.add("active");
      goalFlashEl.querySelector(".goal-team-name").textContent = goalFlash.team;
      goalFlashEl.querySelector(".goal-scoreline").textContent = goalFlash.score;
    } else {
      goalFlashEl.classList.add("hidden");
      goalFlashEl.classList.remove("active");
      goalFlashEl.querySelector(".goal-team-name").textContent = "";
      goalFlashEl.querySelector(".goal-scoreline").textContent = "";
    }

    target.appendChild(node);
  });
}

function renderTables() {
  el.tablesWrap.innerHTML = "";

  ["EPL", "CHAMP"].forEach((key) => {
    if (state.selectedLeague !== "ALL" && state.selectedLeague !== key) return;

    const rows = state.tables[key] || [];
    const card = el.tableTemplate.content.firstElementChild.cloneNode(true);
    const logoEl = card.querySelector(".league-logo");
    card.querySelector("h4").textContent = LEAGUES[key].name;
    if (state.leagueBadges[key]) {
      logoEl.src = state.leagueBadges[key];
      logoEl.alt = `${LEAGUES[key].name} logo`;
    } else {
      logoEl.classList.add("hidden");
    }
    const tbody = card.querySelector("tbody");

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "Table unavailable.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        const cols = [
          row.intRank,
          row.strTeam,
          row.intPlayed,
          row.intWin,
          row.intDraw,
          row.intLoss,
          row.intGoalDifference,
          row.intPoints,
        ];
        cols.forEach((c) => {
          const td = document.createElement("td");
          td.textContent = c ?? "-";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    el.tablesWrap.appendChild(card);
  });
}

function filteredEvents(kind) {
  if (state.selectedLeague === "ALL") {
    return [...state.fixtures[kind].EPL, ...state.fixtures[kind].CHAMP];
  }
  return [...state.fixtures[kind][state.selectedLeague]];
}

function setLeagueButtonState() {
  el.leagueButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.league === state.selectedLeague);
  });
}

function setDateButtonState() {
  const today = new Date();
  el.dateQuickButtons.forEach((btn) => {
    const offset = Number(btn.dataset.offset || 0);
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    btn.classList.toggle("active", toISODate(d) === state.selectedDate);
  });
}

async function refreshSelectedDateFixtures() {
  const now = new Date();
  const prev = new Date(now);
  prev.setDate(now.getDate() - 1);
  const next = new Date(now);
  next.setDate(now.getDate() + 1);

  const prevIso = toISODate(prev);
  const todayIso = toISODate(now);
  const nextIso = toISODate(next);

  if (state.selectedDate === todayIso) {
    state.selectedDateFixtures.EPL = [...state.fixtures.today.EPL];
    state.selectedDateFixtures.CHAMP = [...state.fixtures.today.CHAMP];
    return;
  }

  if (state.selectedDate === prevIso) {
    state.selectedDateFixtures.EPL = [...state.fixtures.previous.EPL];
    state.selectedDateFixtures.CHAMP = [...state.fixtures.previous.CHAMP];
    return;
  }

  if (state.selectedDate === nextIso) {
    state.selectedDateFixtures.EPL = [...state.fixtures.next.EPL];
    state.selectedDateFixtures.CHAMP = [...state.fixtures.next.CHAMP];
    return;
  }

  const [epl, champ] = await Promise.all([
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, state.selectedDate), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, state.selectedDate), []),
  ]);
  state.selectedDateFixtures.EPL = epl.sort(fixtureSort);
  state.selectedDateFixtures.CHAMP = champ.sort(fixtureSort);
}

function selectedDateLabel(dateIso) {
  const todayIso = toISODate(new Date());
  const prev = new Date();
  prev.setDate(prev.getDate() - 1);
  const next = new Date();
  next.setDate(next.getDate() + 1);
  if (dateIso === todayIso) return "Today's Fixtures";
  if (dateIso === toISODate(prev)) return "Yesterday's Fixtures";
  if (dateIso === toISODate(next)) return "Tomorrow's Fixtures";
  return "Fixtures";
}

async function setSelectedDate(dateIso) {
  state.selectedDate = dateIso || toISODate(new Date());
  await refreshSelectedDateFixtures();
  renderFixtures();
}

function renderFixtures() {
  el.fixturesTitle.textContent = `${selectedDateLabel(state.selectedDate)} (${formatDateUK(state.selectedDate)})`;
  const events =
    state.selectedLeague === "ALL"
      ? [...state.selectedDateFixtures.EPL, ...state.selectedDateFixtures.CHAMP]
      : [...state.selectedDateFixtures[state.selectedLeague]];
  renderFixtureList(el.fixturesList, events, "selected");
  if (el.datePicker) {
    el.datePicker.value = state.selectedDate;
  }
  setDateButtonState();
}

function buildFavoriteOptions() {
  const allTeams = [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP];
  const uniqueTeams = Array.from(new Map(allTeams.map((t) => [t.idTeam, t])).values());
  const byName = uniqueTeams.sort((a, b) => (a.strTeam || "").localeCompare(b.strTeam || ""));
  el.favoritePickerMenu.innerHTML = "";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "favorite-option clear-option";
  clearBtn.innerHTML = `
    <span class="option-text">
      <span class="option-team">No pinned team</span>
      <span class="option-league">Use league fixtures only</span>
    </span>
  `;
  clearBtn.addEventListener("click", async () => {
    state.favoriteTeamId = "";
    state.favoriteTeam = null;
    localStorage.removeItem("esra_favorite_team");
    setFavoritePickerDisplay(null);
    el.favoritePickerMenu.classList.add("hidden");
    el.favoritePickerBtn.setAttribute("aria-expanded", "false");
    await renderFavorite();
  });
  el.favoritePickerMenu.appendChild(clearBtn);

  byName.forEach((team) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "favorite-option";
    btn.dataset.teamId = team.idTeam;
    btn.innerHTML = `
      <img class="option-logo ${team.strBadge ? "" : "hidden"}" src="${team.strBadge || ""}" alt="${team.strTeam} badge" />
      <span class="option-text">
        <span class="option-team">${team.strTeam}</span>
        <span class="option-league">${team.strLeague || "League"}</span>
      </span>
    `;
    btn.addEventListener("click", async () => {
      state.favoriteTeamId = team.idTeam;
      state.favoriteTeam = team;
      localStorage.setItem("esra_favorite_team", state.favoriteTeamId);
      setFavoritePickerDisplay(team);
      el.favoritePickerMenu.classList.add("hidden");
      el.favoritePickerBtn.setAttribute("aria-expanded", "false");
      await renderFavorite();
    });
    el.favoritePickerMenu.appendChild(btn);
  });

  const selected = byName.find((t) => t.idTeam === state.favoriteTeamId) || state.favoriteTeam || null;
  if (selected && !byName.find((t) => t.idTeam === selected.idTeam)) {
    state.favoriteTeamId = "";
    state.favoriteTeam = null;
    localStorage.removeItem("esra_favorite_team");
    setFavoritePickerDisplay(null);
    return;
  }
  setFavoritePickerDisplay(selected);
}

function findLiveForFavorite(teamName) {
  const pool = [...state.fixtures.today.EPL, ...state.fixtures.today.CHAMP, ...state.fixtures.live.EPL, ...state.fixtures.live.CHAMP];
  return (
    pool.find((e) => (e.strHomeTeam === teamName || e.strAwayTeam === teamName) && eventState(e).key === "live") || null
  );
}

function findTodayEventForFavorite(teamId, teamName) {
  const todayIso = toISODate(new Date());
  const pool = [...state.fixtures.today.EPL, ...state.fixtures.today.CHAMP];
  return (
    pool.find(
      (e) =>
        e.dateEvent === todayIso &&
        (e.idHomeTeam === teamId || e.idAwayTeam === teamId || e.strHomeTeam === teamName || e.strAwayTeam === teamName)
    ) || null
  );
}

function findLastCompletedEvent(events, todayIso) {
  const completed = events.filter((e) => {
    if (!e?.dateEvent) return false;
    if (e.dateEvent < todayIso) return true;
    if (e.dateEvent === todayIso && eventState(e).key === "final") return true;
    return false;
  });
  if (!completed.length) return null;
  return completed.sort((a, b) => `${b.dateEvent || ""}T${b.strTime || ""}`.localeCompare(`${a.dateEvent || ""}T${a.strTime || ""}`))[0];
}

function findLastCompletedForTeam(events, team, todayIso, excludeEvent) {
  const filtered = (events || []).filter((e) => {
    if (!e?.dateEvent) return false;
    if (excludeEvent && isSameFixture(e, excludeEvent)) return false;
    const isTeamEvent =
      e.idHomeTeam === team.idTeam ||
      e.idAwayTeam === team.idTeam ||
      (e.strHomeTeam || "").toLowerCase() === (team.strTeam || "").toLowerCase() ||
      (e.strAwayTeam || "").toLowerCase() === (team.strTeam || "").toLowerCase();
    if (!isTeamEvent) return false;
    if (e.dateEvent > todayIso) return false;
    return hasScore(e) || eventState(e).key === "final";
  });
  if (!filtered.length) return null;
  return filtered.sort((a, b) => `${b.dateEvent || ""}T${b.strTime || ""}`.localeCompare(`${a.dateEvent || ""}T${a.strTime || ""}`))[0];
}

function scoreLine(event) {
  const hs = event?.intHomeScore ?? "-";
  const as = event?.intAwayScore ?? "-";
  return `${event?.strHomeTeam || "Home"} ${hs} - ${as} ${event?.strAwayTeam || "Away"}`;
}

function isSameFixture(a, b) {
  if (!a || !b) return false;
  if (a.idEvent && b.idEvent) return a.idEvent === b.idEvent;
  const sameDate = (a.dateEvent || "") === (b.dateEvent || "");
  const sameTeams =
    (a.idHomeTeam && b.idHomeTeam && a.idHomeTeam === b.idHomeTeam && a.idAwayTeam === b.idAwayTeam) ||
    ((a.strHomeTeam || "").toLowerCase() === (b.strHomeTeam || "").toLowerCase() &&
      (a.strAwayTeam || "").toLowerCase() === (b.strAwayTeam || "").toLowerCase());
  return sameDate && sameTeams;
}

function fixtureKey(event) {
  if (!event) return "";
  if (event.idEvent) return `id:${event.idEvent}`;
  const home = (event.strHomeTeam || "").toLowerCase().trim();
  const away = (event.strAwayTeam || "").toLowerCase().trim();
  return `m:${event.dateEvent || ""}|${home}|${away}`;
}

function numericScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scorePair(event) {
  const home = numericScore(event?.intHomeScore);
  const away = numericScore(event?.intAwayScore);
  if (home === null || away === null) return null;
  return { home, away };
}

function detectGoalFlashes() {
  const now = Date.now();

  for (const [key, flash] of state.goalFlashes.entries()) {
    if (!flash || flash.expiresAt <= now) {
      state.goalFlashes.delete(key);
    }
  }

  const currentPool = [...state.fixtures.today.EPL, ...state.fixtures.today.CHAMP];
  const nextSnapshot = new Map();

  currentPool.forEach((event) => {
    const key = fixtureKey(event);
    if (!key) return;
    const pair = scorePair(event);
    if (!pair) return;

    nextSnapshot.set(key, pair);
    const prev = state.liveScoreSnapshot.get(key);
    if (!prev) return;

    if (eventState(event).key !== "live") return;

    const homeDelta = pair.home - prev.home;
    const awayDelta = pair.away - prev.away;
    const totalDelta = homeDelta + awayDelta;
    if (totalDelta <= 0) return;

    let team = "Goal Update";
    if (homeDelta > awayDelta) {
      team = event.strHomeTeam || "Home";
    } else if (awayDelta > homeDelta) {
      team = event.strAwayTeam || "Away";
    }

    state.goalFlashes.set(key, {
      team,
      score: `${pair.home} - ${pair.away}`,
      expiresAt: now + 7000,
      force: false,
    });
  });

  state.liveScoreSnapshot = nextSnapshot;
}

function visibleFixturesForCurrentFilter() {
  if (state.selectedLeague === "ALL") {
    return [...state.selectedDateFixtures.EPL, ...state.selectedDateFixtures.CHAMP];
  }
  return [...(state.selectedDateFixtures[state.selectedLeague] || [])];
}

function triggerDebugGoalAnimation() {
  const pool = visibleFixturesForCurrentFilter();
  if (!pool.length) return;

  const target =
    pool.find((event) => eventState(event).key === "live") ||
    pool.find((event) => scorePair(event)) ||
    pool[0];
  if (!target) return;

  const pair = scorePair(target);
  const home = pair?.home ?? 1;
  const away = pair?.away ?? 0;
  const scorerTeam = home >= away ? target.strHomeTeam || "Home Team" : target.strAwayTeam || "Away Team";
  const key = fixtureKey(target);
  if (!key) return;

  state.goalFlashes.set(key, {
    team: scorerTeam,
    score: `${home} - ${away}`,
    expiresAt: Date.now() + 7000,
    force: true,
  });

  renderFixtures();
  setTimeout(() => {
    const flash = state.goalFlashes.get(key);
    if (flash && flash.expiresAt <= Date.now()) {
      state.goalFlashes.delete(key);
      renderFixtures();
    }
  }, 7100);
}

function nextFixtureTickerText(team, nextEvent) {
  if (!nextEvent) return "No upcoming fixture found.";
  const isHome = nextEvent.idHomeTeam === team.idTeam;
  const opponent = isHome ? nextEvent.strAwayTeam : nextEvent.strHomeTeam;
  const where = isHome ? "Home" : "Away";
  return `Next: ${team.strTeam} vs ${opponent}  |  ${where}  |  ${formatDateTime(nextEvent.dateEvent, nextEvent.strTime)}  |  ${nextEvent.strVenue || "Venue TBD"}`;
}

function nextFixtureSummary(team, nextEvent) {
  if (!nextEvent) {
    return {
      line: "No upcoming fixture found",
      detail: "",
    };
  }
  const isHome = nextEvent.idHomeTeam === team.idTeam;
  const opponent = isHome ? nextEvent.strAwayTeam : nextEvent.strHomeTeam;
  const where = isHome ? "Home" : "Away";
  return {
    line: `Next: ${team.strTeam} vs ${opponent}`,
    detail: `${where} | ${formatDateTime(nextEvent.dateEvent, nextEvent.strTime)} | ${nextEvent.strVenue || "Venue TBD"}`,
  };
}

async function renderFavorite() {
  if (!state.favoriteTeamId) {
    clearGameDayCountdownTimer();
    state.lastCountdownTarget = null;
    setGameDayMessage("Select a favourite team", "neutral");
    setFavoritePickerDisplay(null);
    resetFavoriteTheme();
    el.favoriteEmpty.classList.remove("hidden");
    el.favoriteContent.classList.add("hidden");
    return;
  }

  const team = await safeLoad(() => fetchTeamById(state.favoriteTeamId), null);
  if (!team) {
    state.favoriteTeamId = "";
    state.favoriteTeam = null;
    localStorage.removeItem("esra_favorite_team");
    clearGameDayCountdownTimer();
    state.lastCountdownTarget = null;
    setGameDayMessage("Select a favourite team", "neutral");
    setFavoritePickerDisplay(null);
    resetFavoriteTheme();
    el.favoriteEmpty.classList.remove("hidden");
    el.favoriteContent.classList.add("hidden");
    return;
  }

  state.favoriteTeam = team;
  const todayIso = toISODate(new Date());
  const lastEvents = await safeLoad(() => fetchTeamLastEvents(team.idTeam), []);
  const liveEvent = findLiveForFavorite(team.strTeam);
  const todayEvent = findTodayEventForFavorite(team.idTeam, team.strTeam);
  const todayEventDetailed = todayEvent?.idEvent ? (await safeLoad(() => fetchEventById(todayEvent.idEvent), null)) || todayEvent : todayEvent;
  const liveEventDetailed = liveEvent?.idEvent ? (await safeLoad(() => fetchEventById(liveEvent.idEvent), null)) || liveEvent : liveEvent;
  const chosenToday = liveEventDetailed || todayEventDetailed;
  const nextEvents = await safeLoad(() => fetchTeamNextEvents(team.idTeam), []);
  const nextEvent = nextEvents.find((event) => !isSameFixture(event, chosenToday)) || null;
  const hasFixtureToday = Boolean(
    (chosenToday && chosenToday.dateEvent === todayIso) || nextEvents.some((event) => event.dateEvent === todayIso)
  );
  if (hasFixtureToday) {
    clearGameDayCountdownTimer();
    state.lastCountdownTarget = 0;
    setGameDayMessage("IT'S GAME DAY", "gameday");
  } else {
    const daysUntil = daysUntilDate(nextEvent?.dateEvent);
    if (daysUntil === null) {
      clearGameDayCountdownTimer();
      state.lastCountdownTarget = null;
      setGameDayMessage("No game scheduled", "neutral");
    } else if (daysUntil <= 0) {
      clearGameDayCountdownTimer();
      state.lastCountdownTarget = 0;
      setGameDayMessage("IT'S GAME DAY", "gameday");
    } else if (state.lastCountdownTarget !== daysUntil) {
      state.lastCountdownTarget = daysUntil;
      animateCountdownDays(daysUntil);
    } else {
      setGameDayMessage(`${daysUntil} DAY${daysUntil === 1 ? "" : "S"} UNTIL GAME DAY`, "countdown");
    }
  }
  const chosenTodayState = chosenToday ? eventState(chosenToday).key : "";
  let lastCompleted = findLastCompletedForTeam(lastEvents, team, todayIso, chosenToday);
  if (!lastCompleted) {
    const leagueCode = teamLeagueCode(team);
    const leagueId = LEAGUES[leagueCode]?.id;
    if (leagueId) {
      const pastLeague = await safeLoad(() => fetchPastLeagueEvents(leagueId), []);
      lastCompleted = findLastCompletedForTeam(pastLeague, team, todayIso, chosenToday);
    }
  }

  el.favoriteEmpty.classList.add("hidden");
  el.favoriteContent.classList.remove("hidden");

  el.favoriteLogo.src = team.strBadge || "";
  el.favoriteLogo.alt = `${team.strTeam} logo`;
  await updateFavoriteThemeFromBadge(team.strBadge || "");
  el.favoriteName.textContent = team.strTeam || "Team";
  const teamPos = getTeamTablePosition(team);
  el.favoriteLeague.textContent = teamPos ? `${team.strLeague || ""}  •  ${teamPos}` : team.strLeague || "";
  setFavoritePickerDisplay(team);
  el.favoriteStatus.classList.remove("gameday", "live", "final");

  if (chosenToday && chosenToday.dateEvent === todayIso && chosenTodayState === "live") {
    el.favoriteStatus.textContent = "LIVE";
    el.favoriteStatus.classList.add("live");
    el.favoriteFixtureLine.textContent = scoreLine(chosenToday);
    el.favoriteFixtureDetail.textContent = `${chosenToday.strVenue || "Venue TBD"} | ${chosenToday.strLeague || ""}`;
    el.favoriteLiveStrip.classList.remove("hidden");
    el.favoriteLiveStrip.classList.remove("ticker-static");
    el.favoriteLiveStrip.innerHTML = `<span class="ticker-content">${nextFixtureTickerText(team, nextEvent)}</span>`;
    return;
  }

  if (chosenToday && chosenToday.dateEvent === todayIso && chosenTodayState === "final") {
    el.favoriteStatus.textContent = "Final Score";
    el.favoriteStatus.classList.add("final");
    el.favoriteFixtureLine.textContent = scoreLine(chosenToday);
    el.favoriteFixtureDetail.textContent = `Played today | ${chosenToday.strVenue || "Venue TBD"}`;
    el.favoriteLiveStrip.classList.remove("hidden");
    el.favoriteLiveStrip.classList.remove("ticker-static");
    el.favoriteLiveStrip.innerHTML = `<span class="ticker-content">${nextFixtureTickerText(team, nextEvent)}</span>`;
    return;
  }

  el.favoriteStatus.textContent = "Upcoming";
  if (nextEvent && nextEvent.dateEvent === todayIso) {
    el.favoriteStatus.classList.add("gameday");
  }

  if (lastCompleted) {
    el.favoriteFixtureLine.textContent = `Previous: ${scoreLine(lastCompleted)}`;
    el.favoriteFixtureDetail.textContent = `Last played ${formatDateTime(lastCompleted.dateEvent, lastCompleted.strTime)}`;
    el.favoriteLiveStrip.classList.remove("ticker-static");
  } else {
    const upcoming = nextFixtureSummary(team, nextEvent);
    el.favoriteFixtureLine.textContent = upcoming.line;
    el.favoriteFixtureDetail.textContent = upcoming.detail;
    el.favoriteLiveStrip.classList.add("ticker-static");
  }

  el.favoriteLiveStrip.classList.remove("hidden");
  el.favoriteLiveStrip.innerHTML = `<span class="ticker-content">${nextFixtureTickerText(team, nextEvent)}</span>`;
}

function displayApiError(sectionEl, err) {
  sectionEl.innerHTML = "";
  const box = document.createElement("div");
  box.className = "error";
  box.textContent = `Unable to load data right now. ${err.message}`;
  sectionEl.appendChild(box);
}

async function safeLoad(loader, fallback) {
  try {
    return await loader();
  } catch (err) {
    console.error(err);
    return fallback;
  }
}

async function loadCoreData() {
  const now = new Date();
  const prev = new Date(now);
  prev.setDate(now.getDate() - 1);
  const next = new Date(now);
  next.setDate(now.getDate() + 1);

  const dates = {
    prev: toISODate(prev),
    today: toISODate(now),
    next: toISODate(next),
  };

  const [
    todayEpl,
    todayChamp,
    liveEpl,
    liveChamp,
    prevEpl,
    prevChamp,
    nextEpl,
    nextChamp,
    tableEpl,
    tableChamp,
    teamsEpl,
    teamsChamp,
    leagueMetaEpl,
    leagueMetaChamp,
  ] = await Promise.all([
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dates.today), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dates.today), []),
    safeLoad(() => fetchLiveByLeague(LEAGUES.EPL.id), []),
    safeLoad(() => fetchLiveByLeague(LEAGUES.CHAMP.id), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dates.prev), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dates.prev), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dates.next), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dates.next), []),
    safeLoad(() => fetchTable(LEAGUES.EPL.id), []),
    safeLoad(() => fetchTable(LEAGUES.CHAMP.id), []),
    safeLoad(() => fetchAllTeams(LEAGUES.EPL.id), []),
    safeLoad(() => fetchAllTeams(LEAGUES.CHAMP.id), []),
    safeLoad(() => fetchLeagueMeta(LEAGUES.EPL.id), null),
    safeLoad(() => fetchLeagueMeta(LEAGUES.CHAMP.id), null),
  ]);

  state.fixtures.today.EPL = mergeTodayWithLive(todayEpl, liveEpl).sort(fixtureSort);
  state.fixtures.today.CHAMP = mergeTodayWithLive(todayChamp, liveChamp).sort(fixtureSort);
  state.fixtures.live.EPL = liveEpl.sort(fixtureSort);
  state.fixtures.live.CHAMP = liveChamp.sort(fixtureSort);
  state.fixtures.previous.EPL = prevEpl.sort(fixtureSort);
  state.fixtures.previous.CHAMP = prevChamp.sort(fixtureSort);
  state.fixtures.next.EPL = nextEpl.sort(fixtureSort);
  state.fixtures.next.CHAMP = nextChamp.sort(fixtureSort);
  state.tables.EPL = tableEpl;
  state.tables.CHAMP = tableChamp;
  state.teamsByLeague.EPL = teamsEpl;
  state.teamsByLeague.CHAMP = teamsChamp;
  state.teamBadgeMap = {};
  [...teamsEpl, ...teamsChamp].forEach((team) => {
    if (team?.strTeam && team?.strBadge) {
      state.teamBadgeMap[team.strTeam] = team.strBadge;
    }
  });
  state.leagueBadges.EPL = leagueMetaEpl?.strBadge || leagueMetaEpl?.strLogo || "";
  state.leagueBadges.CHAMP = leagueMetaChamp?.strBadge || leagueMetaChamp?.strLogo || "";
  ensureDefaultFavoriteTeam();
}

function renderLastRefreshed() {
  if (!state.lastRefresh) {
    el.lastRefreshed.textContent = "Last refreshed: --";
    return;
  }
  el.lastRefreshed.textContent = `Last refreshed: ${state.lastRefresh.toLocaleString("en-GB")}`;
}

async function fullRefresh() {
  if (state.refreshInFlight) return;
  state.refreshInFlight = true;
  try {
    if (!state.selectedDate) {
      state.selectedDate = toISODate(new Date());
    }
    if (state.favoriteTeamId) {
      localStorage.setItem("esra_favorite_team", state.favoriteTeamId);
    }
    await loadCoreData();
    detectGoalFlashes();
    await refreshSelectedDateFixtures();
    buildFavoriteOptions();
    await safeLoad(() => renderFavorite(), null);
    renderFixtures();
    renderTables();
    setLeagueButtonState();

    state.lastRefresh = new Date();
    renderLastRefreshed();
  } catch (err) {
    displayApiError(el.fixturesList, err);
    el.tablesWrap.innerHTML = `<div class="error">Unable to load league tables. ${err.message}</div>`;
  } finally {
    state.refreshInFlight = false;
  }
}

function attachEvents() {
  if (el.debugGoalBtn) {
    el.debugGoalBtn.addEventListener("click", () => {
      triggerDebugGoalAnimation();
    });
  }

  el.favoritePickerBtn.addEventListener("click", () => {
    const isOpen = !el.favoritePickerMenu.classList.contains("hidden");
    el.favoritePickerMenu.classList.toggle("hidden", isOpen);
    el.favoritePickerBtn.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!el.favoritePicker.contains(e.target)) {
      el.favoritePickerMenu.classList.add("hidden");
      el.favoritePickerBtn.setAttribute("aria-expanded", "false");
    }
  });

  el.leagueButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedLeague = btn.dataset.league;
      setLeagueButtonState();
      renderFixtures();
      renderTables();
    });
  });

  if (el.datePicker) {
    el.datePicker.addEventListener("change", async (e) => {
      await setSelectedDate(e.target.value || toISODate(new Date()));
    });
  }

  el.dateQuickButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const d = new Date();
      d.setDate(d.getDate() + Number(btn.dataset.offset || 0));
      await setSelectedDate(toISODate(d));
    });
  });

  const shiftSelectedDate = async (delta) => {
    const base = state.selectedDate ? new Date(`${state.selectedDate}T00:00:00`) : new Date();
    base.setDate(base.getDate() + delta);
    await setSelectedDate(toISODate(base));
  };

  if (el.datePrevBtn) {
    el.datePrevBtn.addEventListener("click", async () => {
      await shiftSelectedDate(-1);
    });
  }

  if (el.dateNextBtn) {
    el.dateNextBtn.addEventListener("click", async () => {
      await shiftSelectedDate(1);
    });
  }
}

attachEvents();
fullRefresh();
setInterval(fullRefresh, LIVE_REFRESH_MS);
