const API_PROXY_BASE = "/api";
const POLL_LIVE_MS = 20000;
const POLL_MATCHDAY_MS = 60000;
const POLL_IDLE_MS = 300000;
const LIVE_PROBE_MATCHDAY_MS = 60000;
const LIVE_PROBE_IDLE_MS = 600000;
const STATIC_REFRESH_MS = 1800000;

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
  uiTheme: localStorage.getItem("ezra_ui_theme") || "classic",
  playerPopEnabled: localStorage.getItem("ezra_player_pop_enabled") === "1",
  playerPopScope: localStorage.getItem("ezra_player_pop_scope") === "favorite" ? "favorite" : "any",
  teamPlayersCache: {},
  playerQuiz: {
    poolKey: "",
    pool: [],
    solved: new Set(),
    activePlayer: null,
    correctCount: 0,
    allCorrect: false,
    isLocked: false,
  },
  squadByTeamId: {},
  dreamTeam: (() => {
    try {
      const raw = localStorage.getItem("ezra_dream_team");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })(),
  maxDreamTeamPlayers: 18,
  dreamTeamOpen: false,
  squadOpen: false,
  favoriteTeam: null,
  gameDayCountdownTimer: null,
  lastCountdownTarget: null,
  liveScoreSnapshot: new Map(),
  goalFlashes: new Map(),
  refreshInFlight: false,
  favoriteGoalAnimationToken: "",
  favoriteGoalAnimationTimer: null,
  refreshTimer: null,
  lastLiveProbeAt: 0,
  lastStaticRefreshAt: 0,
  pollMode: "idle",
  settingsOpen: false,
  playerPop: {
    rafId: null,
    running: false,
    loading: false,
    x: 0,
    y: 0,
    vx: 150,
    vy: 124,
    size: 94,
    lastTs: 0,
    player: null,
  },
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
  favoriteGoalCinematic: document.getElementById("favorite-goal-cinematic"),
  favoriteGoalTeam: document.getElementById("favorite-goal-team"),
  favoriteGoalScore: document.getElementById("favorite-goal-score"),
  favoritePicker: document.getElementById("favorite-picker"),
  favoritePickerBtn: document.getElementById("favorite-picker-btn"),
  favoritePickerMenu: document.getElementById("favorite-picker-menu"),
  favoritePickerLogo: document.getElementById("favorite-picker-logo"),
  favoritePickerText: document.getElementById("favorite-picker-text"),
  debugGoalBtn: document.getElementById("debug-goal-btn"),
  themeButtons: [...document.querySelectorAll(".theme-btn")],
  settingsMenu: document.getElementById("settings-menu"),
  settingsToggleBtn: document.getElementById("settings-toggle-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  playerDvdToggleMain: document.getElementById("player-dvd-toggle-main"),
  playerPopScoreBadge: document.getElementById("player-pop-score-badge"),
  playerSourceButtons: [...document.querySelectorAll(".player-source-btn")],
  dreamTeamToggleBtn: document.getElementById("dream-team-toggle-btn"),
  dreamTeamCount: document.getElementById("dream-team-count"),
  dreamTeamHint: document.getElementById("dream-team-hint"),
  dreamTeamPanel: document.getElementById("dream-team-panel"),
  dreamTeamList: document.getElementById("dream-team-list"),
  dreamTeamDownloadBtn: document.getElementById("dream-team-download-btn"),
  dreamTeamCloseBtn: document.getElementById("dream-team-close-btn"),
  squadPanel: document.getElementById("squad-panel"),
  squadTitle: document.getElementById("squad-title"),
  squadToggleBtn: document.getElementById("squad-toggle-btn"),
  squadBody: document.getElementById("squad-body"),
  squadList: document.getElementById("squad-list"),
  playerDvdLayer: document.getElementById("player-dvd-layer"),
  playerDvdAvatar: document.getElementById("player-dvd-avatar"),
  playerDvdImage: document.getElementById("player-dvd-image"),
  playerDvdName: document.getElementById("player-dvd-name"),
  playerQuizCard: document.getElementById("player-quiz-card"),
  playerQuizOptions: document.getElementById("player-quiz-options"),
  playerQuizFeedback: document.getElementById("player-quiz-feedback"),
};

function clearGameDayCountdownTimer() {
  if (state.gameDayCountdownTimer) {
    clearInterval(state.gameDayCountdownTimer);
    state.gameDayCountdownTimer = null;
  }
}

function setThemeButtonState() {
  el.themeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === state.uiTheme);
  });
}

function applyUiTheme(theme) {
  const safeTheme = theme === "club" ? "club" : "classic";
  state.uiTheme = safeTheme;
  document.body.setAttribute("data-theme", safeTheme);
  localStorage.setItem("ezra_ui_theme", safeTheme);
  setThemeButtonState();
  if (safeTheme !== "club") {
    clearClubThemeColors();
  } else {
    applyClubThemeFromFavoriteTeam();
  }
}

function setPlayerPopButtonState() {
  if (!el.playerDvdToggleMain) return;
  el.playerDvdToggleMain.classList.toggle("active", state.playerPopEnabled);
  el.playerDvdToggleMain.setAttribute("aria-pressed", String(state.playerPopEnabled));
}

function setPlayerSourceButtonState() {
  el.playerSourceButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.playerSource === state.playerPopScope);
  });
}

function setPlayerPopScope(scope) {
  const safeScope = scope === "favorite" ? "favorite" : "any";
  state.playerPopScope = safeScope;
  localStorage.setItem("ezra_player_pop_scope", safeScope);
  setPlayerSourceButtonState();
}

function setSettingsMenuOpen(open) {
  state.settingsOpen = Boolean(open);
  if (!el.settingsPanel || !el.settingsToggleBtn) return;
  el.settingsPanel.classList.toggle("hidden", !state.settingsOpen);
  el.settingsToggleBtn.setAttribute("aria-expanded", String(state.settingsOpen));
}

function normalizeHexColor(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  const hex = withHash.replace(/[^#a-fA-F0-9]/g, "");
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return "";
}

function hexToRgb(hex) {
  const clean = normalizeHexColor(hex);
  if (!clean) return null;
  const n = parseInt(clean.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => clampChannel(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function blendHex(hexA, hexB, ratio = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a && !b) return "#FF9A1F";
  if (!a) return rgbToHex(b);
  if (!b) return rgbToHex(a);
  const r = a.r + (b.r - a.r) * ratio;
  const g = a.g + (b.g - a.g) * ratio;
  const bb = a.b + (b.b - a.b) * ratio;
  return rgbToHex({ r, g, b: bb });
}

function tintHex(hex, amount = 0.2) {
  return blendHex(hex, "#FFFFFF", amount);
}

function shadeHex(hex, amount = 0.25) {
  return blendHex(hex, "#000000", amount);
}

function clearClubThemeColors() {
  const keys = [
    "--club-primary",
    "--club-secondary",
    "--club-bg",
    "--club-panel",
    "--club-line",
    "--club-line-soft",
    "--club-text",
    "--club-text-soft",
  ];
  keys.forEach((key) => document.body.style.removeProperty(key));
}

function applyClubThemeFromTeam(team) {
  if (!team) return;
  const c1 = normalizeHexColor(team.strColour1);
  const c2 = normalizeHexColor(team.strColour2);
  const c3 = normalizeHexColor(team.strColour3);
  const primary = c1 || c2 || c3 || "#FF9A1F";
  const secondary = c2 || c3 || shadeHex(primary, 0.35);
  const bg = blendHex(shadeHex(primary, 0.78), "#050302", 0.74);
  const panel = blendHex(shadeHex(secondary, 0.72), "#090503", 0.66);
  const line = shadeHex(primary, 0.36);
  const lineSoft = shadeHex(primary, 0.56);
  const text = tintHex(primary, 0.22);
  const textSoft = blendHex(text, secondary, 0.32);

  document.body.style.setProperty("--club-primary", primary);
  document.body.style.setProperty("--club-secondary", secondary);
  document.body.style.setProperty("--club-bg", bg);
  document.body.style.setProperty("--club-panel", panel);
  document.body.style.setProperty("--club-line", line);
  document.body.style.setProperty("--club-line-soft", lineSoft);
  document.body.style.setProperty("--club-text", text);
  document.body.style.setProperty("--club-text-soft", textSoft);
}

function applyClubThemeFromFavoriteTeam() {
  if (state.uiTheme !== "club") return;
  if (!state.favoriteTeam) {
    clearClubThemeColors();
    return;
  }
  applyClubThemeFromTeam(state.favoriteTeam);
}

function stopPlayerPopAnimation() {
  const pop = state.playerPop;
  pop.running = false;
  if (pop.rafId) {
    cancelAnimationFrame(pop.rafId);
    pop.rafId = null;
  }
}

function hidePlayerPopLayer() {
  stopPlayerPopAnimation();
  if (!el.playerDvdLayer) return;
  el.playerDvdLayer.classList.add("hidden");
  el.playerDvdLayer.classList.remove("revealed");
  if (el.playerDvdName) {
    el.playerDvdName.classList.add("hidden");
    el.playerDvdName.classList.remove("prominent");
    el.playerDvdName.style.transform = "";
    el.playerDvdName.textContent = "";
  }
}

function resolvePlayers(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.player)) return payload.player;
  return firstArrayValue(payload);
}

function randomFrom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function fetchPlayersForTeam(team) {
  if (!team) return [];
  const teamName = team.strTeam || "";
  const teamId = team.idTeam || "";
  if (teamId && Array.isArray(state.teamPlayersCache[teamId])) {
    return state.teamPlayersCache[teamId];
  }
  const bySearch = await safeLoad(async () => {
    const data = await apiGetV1(`searchplayers.php?t=${encodeURIComponent(teamName)}`);
    return resolvePlayers(data);
  }, []);
  if (bySearch.length) {
    if (teamId) state.teamPlayersCache[teamId] = bySearch;
    return bySearch;
  }

  const byLookup = await safeLoad(async () => {
    const data = await apiGetV1(`lookup_all_players.php?id=${encodeURIComponent(teamId)}`);
    return resolvePlayers(data);
  }, []);
  if (teamId) state.teamPlayersCache[teamId] = byLookup;
  return byLookup;
}

function selectCutoutPlayer(players) {
  const valid = (players || [])
    .map((p) => ({
      id: p?.idPlayer || "",
      name: p?.strPlayer || "",
      image: p?.strCutout || p?.strRender || p?.strThumb || "",
      nationality: p?.strNationality || "Unknown",
      position: p?.strPosition || "Unknown",
    }))
    .filter((p) => p.name && p.image);
  return randomFrom(valid);
}

function playerKey(player) {
  if (!player) return "";
  if (player.id) return `id:${player.id}`;
  if (player.idPlayer) return `id:${player.idPlayer}`;
  return `n:${(player.name || player.strPlayer || "").toLowerCase()}|${(player.teamId || player.idTeam || "").toString()}`;
}

function normalizeSquadPlayer(raw, team) {
  if (!raw) return null;
  const name = raw.strPlayer || raw.name || "";
  if (!name) return null;
  const numberRaw = raw.strNumber || raw.intSquadNumber || raw.intNumber || "";
  const number = String(numberRaw || "").trim();
  return {
    key: playerKey({ id: raw.idPlayer, name, teamId: team?.idTeam }),
    idPlayer: raw.idPlayer || "",
    name,
    number,
    nationality: raw.strNationality || "Unknown",
    position: raw.strPosition || "Unknown",
    image: raw.strCutout || raw.strRender || raw.strThumb || "",
    teamId: team?.idTeam || "",
    teamName: team?.strTeam || raw.strTeam || "",
    teamBadge: team?.strBadge || state.teamBadgeMap[team?.strTeam || ""] || "",
  };
}

function positionBucket(position) {
  const p = (position || "").toLowerCase();
  if (p.includes("manager") || p.includes("coach") || p.includes("owner") || p.includes("chairman") || p.includes("director")) {
    return "Manager";
  }
  if (p.includes("goalkeeper") || p === "gk" || p.includes("keeper")) return "Goalkeepers";
  if (p.includes("defender") || p.includes("back")) return "Defenders";
  if (p.includes("midfielder") || p.includes("midfield") || p.includes("winger")) return "Midfielders";
  if (p.includes("forward") || p.includes("striker") || p.includes("attacker")) return "Attackers";
  return "Midfielders";
}

function squadRoleOrder(position) {
  const bucket = positionBucket(position);
  const order = {
    Manager: 0,
    Goalkeepers: 1,
    Defenders: 2,
    Midfielders: 3,
    Attackers: 4,
  };
  return order[bucket] ?? 5;
}

function getTeamById(id) {
  if (!id) return null;
  return [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP].find((team) => team.idTeam === id) || null;
}

function getQuizTeams() {
  const allTeams = [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP];
  if (state.playerPopScope !== "favorite") return allTeams;
  const favorite = getTeamById(state.favoriteTeamId) || state.favoriteTeam;
  return favorite ? [favorite] : allTeams;
}

function refreshPlayerPopScoreBadge() {
  if (!el.playerPopScoreBadge) return;
  el.playerPopScoreBadge.textContent = String(state.playerQuiz.correctCount || 0);
  el.playerPopScoreBadge.classList.toggle("all-complete", Boolean(state.playerQuiz.allCorrect));
}

function setQuizLocked(locked) {
  state.playerQuiz.isLocked = Boolean(locked);
  if (!el.playerQuizOptions) return;
  [...el.playerQuizOptions.querySelectorAll("button")].forEach((btn) => {
    btn.disabled = state.playerQuiz.isLocked;
  });
}

function setQuizFeedback(message, mode = "neutral") {
  if (!el.playerQuizFeedback) return;
  el.playerQuizFeedback.textContent = message;
  el.playerQuizFeedback.classList.remove("hidden", "correct", "wrong");
  if (mode === "correct") el.playerQuizFeedback.classList.add("correct");
  if (mode === "wrong") el.playerQuizFeedback.classList.add("wrong");
  if (mode === "neutral") el.playerQuizFeedback.classList.add("neutral");
}

function hideQuizFeedback() {
  if (!el.playerQuizFeedback) return;
  el.playerQuizFeedback.classList.add("hidden");
  el.playerQuizFeedback.textContent = "";
  el.playerQuizFeedback.classList.remove("correct", "wrong", "neutral");
}

function hidePlayerQuizCard() {
  if (el.playerQuizCard) el.playerQuizCard.classList.add("hidden");
  if (el.playerQuizOptions) el.playerQuizOptions.innerHTML = "";
  hideQuizFeedback();
}

function randomChoices(players, count) {
  const list = [...players];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

async function randomLeaguePlayerWithCutout() {
  const teams = getQuizTeams().filter((team) => team?.strTeam);
  if (!teams.length) return null;

  const poolKey = `${state.playerPopScope}:${teams.map((team) => team.idTeam || team.strTeam).join(",")}`;
  if (state.playerQuiz.poolKey !== poolKey) {
    state.playerQuiz.poolKey = poolKey;
    state.playerQuiz.pool = [];
    state.playerQuiz.solved = new Set();
    state.playerQuiz.allCorrect = false;
    state.playerQuiz.correctCount = 0;
    refreshPlayerPopScoreBadge();
  }

  if (!state.playerQuiz.pool.length) {
    const playersByTeam = await Promise.all(
      teams.map(async (team) => {
        const players = await fetchPlayersForTeam(team);
        return players
          .map((raw) => normalizeSquadPlayer(raw, team))
          .filter((player) => player && player.image);
      })
    );
    state.playerQuiz.pool = playersByTeam.flat();
  }

  if (!state.playerQuiz.pool.length) return null;

  const unresolved = state.playerQuiz.pool.filter((player) => !state.playerQuiz.solved.has(player.key));
  if (!unresolved.length) {
    state.playerQuiz.allCorrect = true;
    state.playerQuiz.solved.clear();
    refreshPlayerPopScoreBadge();
  }

  const candidates = state.playerQuiz.pool.filter((player) => !state.playerQuiz.solved.has(player.key));
  return randomFrom(candidates.length ? candidates : state.playerQuiz.pool);
}

function quizOptionsForPlayer(player) {
  if (!player) return [];
  const wrongPool = state.playerQuiz.pool.filter((p) => p.key !== player.key);
  const wrongTwo = randomChoices(wrongPool, 2);
  return randomChoices([player, ...wrongTwo], 3);
}

function renderPlayerQuiz(player) {
  if (!player || !el.playerQuizCard || !el.playerQuizOptions) return;
  const options = quizOptionsForPlayer(player);
  el.playerQuizOptions.innerHTML = "";
  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn player-quiz-option";
    btn.textContent = option.name;
    btn.addEventListener("click", async () => {
      if (state.playerQuiz.isLocked) return;
      const correct = option.key === player.key;
      setQuizLocked(true);
      if (!correct) {
        setQuizFeedback("TRY AGAIN", "wrong");
        setTimeout(() => {
          setQuizLocked(false);
          hideQuizFeedback();
        }, 900);
        return;
      }

      state.playerQuiz.solved.add(player.key);
      state.playerQuiz.correctCount += 1;
      refreshPlayerPopScoreBadge();
      setQuizFeedback("IT'S A GOAL!", "correct");
      setTimeout(async () => {
        hidePlayerQuizCard();
        setQuizLocked(false);
        await showRandomPlayerPop();
      }, 1200);
    });
    el.playerQuizOptions.appendChild(btn);
  });
  hideQuizFeedback();
  setQuizLocked(false);
  el.playerQuizCard.classList.remove("hidden");
}

function saveDreamTeam() {
  localStorage.setItem("ezra_dream_team", JSON.stringify(state.dreamTeam));
}

function isDreamPlayer(playerKeyValue) {
  return state.dreamTeam.some((player) => player.key === playerKeyValue);
}

function renderDreamTeamNavState() {
  if (!el.dreamTeamToggleBtn) return;
  const hasPlayers = state.dreamTeam.length > 0;
  if (el.dreamTeamCount) {
    el.dreamTeamCount.textContent = `${state.dreamTeam.length}/${state.maxDreamTeamPlayers}`;
  }
  el.dreamTeamToggleBtn.classList.toggle("disabled", !hasPlayers);
  el.dreamTeamToggleBtn.classList.toggle("active", state.dreamTeamOpen);
  el.dreamTeamToggleBtn.setAttribute("aria-expanded", String(state.dreamTeamOpen));
  if (!hasPlayers) {
    el.dreamTeamToggleBtn.title = "Choose a favourite team, then star players to start your Dream Team";
  } else {
    el.dreamTeamToggleBtn.title = "View your Dream Team";
  }
}

function sortedByName(list) {
  return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function sortSquadByRole(list) {
  return [...list].sort((a, b) => {
    const roleDelta = squadRoleOrder(a.position) - squadRoleOrder(b.position);
    if (roleDelta !== 0) return roleDelta;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function renderSquadPanel() {
  if (!el.squadPanel || !el.squadList || !el.squadTitle || !el.squadToggleBtn || !el.squadBody) return;
  const favorite = state.favoriteTeam;
  if (!favorite?.idTeam) {
    state.squadOpen = false;
    el.squadPanel.classList.add("hidden");
    el.squadBody.classList.add("hidden");
    el.squadToggleBtn.setAttribute("aria-expanded", "false");
    el.squadToggleBtn.textContent = "Show Squad";
    el.squadList.innerHTML = "";
    return;
  }
  const squad = state.squadByTeamId[favorite.idTeam] || [];
  el.squadPanel.classList.remove("hidden");
  el.squadBody.classList.toggle("hidden", !state.squadOpen);
  el.squadToggleBtn.setAttribute("aria-expanded", String(state.squadOpen));
  el.squadToggleBtn.textContent = state.squadOpen ? "Hide Squad" : "Show Squad";
  el.squadTitle.textContent = `${favorite.strTeam} Squad`;
  el.squadList.innerHTML = "";

  if (!squad.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Squad unavailable right now.";
    el.squadList.appendChild(empty);
    return;
  }

  sortSquadByRole(squad).forEach((player) => {
    const row = document.createElement("div");
    row.className = "squad-row";
    const starOn = isDreamPlayer(player.key);
    const shirtNo = player.number ? player.number : "—";
    row.innerHTML = `
      <div class="squad-main">
        <div class="squad-line">
          <span class="player-no-circle ${player.number ? "" : "missing"}">${shirtNo}</span>
          <img class="player-cutout ${player.image ? "" : "hidden"}" src="${player.image || ""}" alt="${player.name} cutout" />
          <span class="squad-name">${player.name}</span>
        </div>
        <span class="squad-meta">${player.nationality} • ${player.position}</span>
      </div>
      <button class="btn squad-star ${starOn ? "active" : ""}" type="button" aria-label="Toggle Dream Team player">${starOn ? "★" : "☆"}</button>
    `;
    const starBtn = row.querySelector(".squad-star");
    starBtn.addEventListener("click", () => {
      toggleDreamTeamPlayer(player);
    });
    el.squadList.appendChild(row);
  });
}

function groupDreamTeamPlayers() {
  const groups = {
    Manager: [],
    Goalkeepers: [],
    Defenders: [],
    Midfielders: [],
    Attackers: [],
  };
  state.dreamTeam.forEach((player) => {
    const bucket = positionBucket(player.position);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(player);
  });
  return groups;
}

function renderDreamTeamPanel() {
  if (!el.dreamTeamPanel || !el.dreamTeamList) return;
  if (!state.dreamTeamOpen) {
    el.dreamTeamPanel.classList.add("hidden");
    document.body.classList.remove("dream-team-overlay-open");
    return;
  }
  el.dreamTeamPanel.classList.remove("hidden");
  document.body.classList.add("dream-team-overlay-open");
  el.dreamTeamList.innerHTML = "";

  if (!state.dreamTeam.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Start by choosing a favourite team and starring players.";
    el.dreamTeamList.appendChild(empty);
    return;
  }

  const groups = groupDreamTeamPlayers();
  ["Manager", "Goalkeepers", "Defenders", "Midfielders", "Attackers"].forEach((label) => {
    const section = document.createElement("section");
    section.className = "dream-group";
    const title = document.createElement("h4");
    title.textContent = label;
    section.appendChild(title);

    const players = groups[label] || [];
    if (!players.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = label === "Manager" ? "No manager selected." : "No players selected.";
      section.appendChild(empty);
    } else {
      players.forEach((player) => {
        const row = document.createElement("div");
        row.className = "dream-row";
        const shirtNo = player.number ? player.number : "—";
        row.innerHTML = `
          <div class="dream-main">
            <span class="player-no-circle ${player.number ? "" : "missing"}">${shirtNo}</span>
            <img class="player-cutout ${player.image ? "" : "hidden"}" src="${player.image || ""}" alt="${player.name} cutout" />
            <img class="dream-badge ${player.teamBadge ? "" : "hidden"}" src="${player.teamBadge || ""}" alt="${player.teamName} badge" />
            <div class="dream-text">
              <span class="dream-name">${player.name}</span>
              <span class="dream-meta">${player.nationality} • ${player.teamName}</span>
            </div>
          </div>
          <button class="btn dream-remove" type="button" aria-label="Remove from Dream Team">Unstar</button>
        `;
        row.querySelector(".dream-remove").addEventListener("click", () => {
          toggleDreamTeamPlayer(player);
        });
        section.appendChild(row);
      });
    }
    el.dreamTeamList.appendChild(section);
  });
}

function toggleDreamTeamPlayer(player) {
  const index = state.dreamTeam.findIndex((p) => p.key === player.key);
  if (index >= 0) {
    state.dreamTeam.splice(index, 1);
  } else {
    if (state.dreamTeam.length >= state.maxDreamTeamPlayers) {
      if (el.dreamTeamHint) {
        el.dreamTeamHint.textContent = `Dream Team is full (${state.maxDreamTeamPlayers}/${state.maxDreamTeamPlayers}). Unstar a player to add another.`;
        el.dreamTeamHint.classList.remove("hidden");
        setTimeout(() => {
          if (!el.dreamTeamHint) return;
          el.dreamTeamHint.classList.add("hidden");
          el.dreamTeamHint.textContent = "Choose a favourite team, then star players to start your Dream Team.";
        }, 2600);
      }
      return;
    }
    state.dreamTeam.push(player);
  }
  saveDreamTeam();
  renderDreamTeamNavState();
  renderSquadPanel();
  renderDreamTeamPanel();
}

function toggleDreamTeamPanel() {
  if (!state.dreamTeam.length) {
    if (el.dreamTeamHint) {
      el.dreamTeamHint.classList.remove("hidden");
      setTimeout(() => el.dreamTeamHint.classList.add("hidden"), 2400);
    }
    return;
  }
  state.dreamTeamOpen = !state.dreamTeamOpen;
  renderDreamTeamNavState();
  renderDreamTeamPanel();
}

function escapeForCanvas(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function loadCanvasImage(url) {
  const proxyUrl = url ? `/api/image?url=${encodeURIComponent(url)}` : "";
  return new Promise((resolve) => {
    if (!proxyUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback to direct URL in case proxy is unavailable in local/static preview.
      if (!url) {
        resolve(null);
        return;
      }
      const direct = new Image();
      direct.crossOrigin = "anonymous";
      direct.onload = () => resolve(direct);
      direct.onerror = () => resolve(null);
      direct.src = url;
    };
    img.src = proxyUrl;
  });
}

function clipRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPlayerCutout(ctx, img, x, y, size) {
  if (!img) return;
  ctx.save();
  clipRoundedRect(ctx, x, y, size, size, 8);
  ctx.clip();
  ctx.fillStyle = "#120a04";
  ctx.fillRect(x, y, size, size);
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
  ctx.strokeStyle = "#6f4312";
  ctx.lineWidth = 1;
  clipRoundedRect(ctx, x, y, size, size, 8);
  ctx.stroke();
}

function drawBadgeCircle(ctx, img, cx, cy, radius) {
  if (!img) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#120a04";
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.strokeStyle = "#6f4312";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.stroke();
}

async function downloadDreamTeamImage() {
  if (!state.dreamTeam.length) return;
  const groups = groupDreamTeamPlayers();
  const sections = ["Manager", "Goalkeepers", "Defenders", "Midfielders", "Attackers"];
  const rowCount = sections.reduce((sum, key) => sum + Math.max(1, (groups[key] || []).length), 0);
  const width = 1400;
  const height = 260 + rowCount * 58;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#090503";
  ctx.fillRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "rgba(255,153,32,0.16)");
  grad.addColorStop(1, "rgba(12,8,4,0.12)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ff9a1f";
  ctx.font = "72px VT323";
  ctx.fillText("EZRASCORES DREAM TEAM", 60, 90);
  ctx.font = "36px VT323";
  ctx.fillStyle = "#ffbf74";
  ctx.fillText(`Generated ${new Date().toLocaleString("en-GB")}`, 60, 132);

  let y = 192;
  sections.forEach((section) => {
    ctx.fillStyle = "#ffc072";
    ctx.font = "44px VT323";
    ctx.fillText(section, 60, y);
    y += 36;

    const players = groups[section] || [];
    if (!players.length) {
      ctx.fillStyle = "#9e6a2d";
      ctx.font = "32px VT323";
      ctx.fillText(section === "Manager" ? "No manager selected" : "No players selected", 84, y);
      y += 46;
      return;
    }

    players.forEach((player) => {
      ctx.fillStyle = "#f6d5aa";
      ctx.font = "34px VT323";
      ctx.fillText(escapeForCanvas(player.name), 84, y);
      ctx.fillStyle = "#c7883a";
      ctx.font = "29px VT323";
      ctx.fillText(`${escapeForCanvas(player.nationality)} | ${escapeForCanvas(player.teamName)}`, 540, y);
      y += 42;
    });
    y += 6;
  });

  // Draw player cutouts + club badges after text/layout pass.
  y = 192;
  for (const section of sections) {
    y += 36;
    const players = groups[section] || [];
    if (!players.length) {
      y += 46;
      continue;
    }

    for (const player of players) {
      const [playerImg, badgeImg] = await Promise.all([
        loadCanvasImage(player.image),
        loadCanvasImage(player.teamBadge),
      ]);
      const iconY = y - 30;
      drawPlayerCutout(ctx, playerImg, 44, iconY, 28);
      drawBadgeCircle(ctx, badgeImg, 520, iconY + 14, 13);
      y += 42;
    }
    y += 6;
  }

  const link = document.createElement("a");
  link.download = "ezrascores-dream-team.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function placePlayerPopElement() {
  const pop = state.playerPop;
  const maxX = Math.max(0, window.innerWidth - pop.size);
  const maxY = Math.max(0, window.innerHeight - pop.size);
  if (!el.playerDvdAvatar) return;
  el.playerDvdAvatar.style.transform = `translate(${pop.x}px, ${pop.y}px)`;

  if (
    el.playerDvdName &&
    !el.playerDvdName.classList.contains("hidden") &&
    !el.playerDvdName.classList.contains("prominent")
  ) {
    const nameY = Math.min(maxY, pop.y + pop.size + 8);
    el.playerDvdName.style.transform = `translate(${pop.x}px, ${nameY}px)`;
  }
}

function maybeCornerSnap(maxX, maxY) {
  if (Math.random() > 0.1) return;
  const corners = [
    { x: 0, y: 0 },
    { x: maxX, y: 0 },
    { x: 0, y: maxY },
    { x: maxX, y: maxY },
  ];
  const corner = randomFrom(corners);
  if (!corner) return;
  const pop = state.playerPop;
  pop.x = corner.x;
  pop.y = corner.y;
  pop.vx = corner.x === 0 ? Math.abs(pop.vx) : -Math.abs(pop.vx);
  pop.vy = corner.y === 0 ? Math.abs(pop.vy) : -Math.abs(pop.vy);
}

function tickPlayerPop(ts) {
  const pop = state.playerPop;
  if (!pop.running || !state.playerPopEnabled) return;

  if (!pop.lastTs) pop.lastTs = ts;
  const dt = Math.min(40, ts - pop.lastTs);
  pop.lastTs = ts;
  const step = dt / 1000;

  pop.x += pop.vx * step;
  pop.y += pop.vy * step;

  const maxX = Math.max(0, window.innerWidth - pop.size);
  const maxY = Math.max(0, window.innerHeight - pop.size);
  let bounced = false;

  if (pop.x <= 0) {
    pop.x = 0;
    pop.vx = Math.abs(pop.vx);
    bounced = true;
  } else if (pop.x >= maxX) {
    pop.x = maxX;
    pop.vx = -Math.abs(pop.vx);
    bounced = true;
  }

  if (pop.y <= 0) {
    pop.y = 0;
    pop.vy = Math.abs(pop.vy);
    bounced = true;
  } else if (pop.y >= maxY) {
    pop.y = maxY;
    pop.vy = -Math.abs(pop.vy);
    bounced = true;
  }

  if (bounced) {
    maybeCornerSnap(maxX, maxY);
  }

  placePlayerPopElement();
  pop.rafId = requestAnimationFrame(tickPlayerPop);
}

function startPlayerPopAnimation() {
  const pop = state.playerPop;
  pop.running = true;
  pop.lastTs = 0;
  if (pop.rafId) {
    cancelAnimationFrame(pop.rafId);
    pop.rafId = null;
  }
  pop.rafId = requestAnimationFrame(tickPlayerPop);
}

async function showRandomPlayerPop() {
  if (state.playerPop.loading || !state.playerPopEnabled) return;
  if (!el.playerDvdLayer || !el.playerDvdImage || !el.playerDvdAvatar || !el.playerDvdName) return;
  state.playerPop.loading = true;
  try {
    const player = await randomLeaguePlayerWithCutout();
    if (!player || !state.playerPopEnabled) {
      hidePlayerPopLayer();
      return;
    }
    hidePlayerQuizCard();
    const pop = state.playerPop;
    pop.player = player;
    const maxX = Math.max(0, window.innerWidth - pop.size);
    const maxY = Math.max(0, window.innerHeight - pop.size);
    pop.x = Math.random() * maxX;
    pop.y = Math.random() * maxY;
    pop.vx = (Math.random() > 0.5 ? 1 : -1) * (130 + Math.random() * 50);
    pop.vy = (Math.random() > 0.5 ? 1 : -1) * (112 + Math.random() * 48);

    el.playerDvdImage.src = player.image;
    el.playerDvdImage.alt = `${player.name} cutout`;
    el.playerDvdName.textContent = player.name;
    el.playerDvdLayer.classList.remove("hidden");
    el.playerDvdLayer.classList.remove("revealed");
    el.playerDvdName.classList.add("hidden");
    el.playerDvdName.classList.remove("prominent");
    el.playerDvdName.style.transform = "";
    placePlayerPopElement();
    startPlayerPopAnimation();
  } finally {
    state.playerPop.loading = false;
  }
}

function setPlayerPopEnabled(enabled) {
  state.playerPopEnabled = Boolean(enabled);
  localStorage.setItem("ezra_player_pop_enabled", state.playerPopEnabled ? "1" : "0");
  setPlayerPopButtonState();
  if (!state.playerPopEnabled) {
    hidePlayerPopLayer();
    return;
  }
  showRandomPlayerPop();
}

function revealAndDismissPlayerPop() {
  if (!state.playerPopEnabled || !el.playerDvdLayer || !state.playerPop.player) return;
  stopPlayerPopAnimation();
  renderPlayerQuiz(state.playerPop.player);
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

  const favoriteName = state.favoriteTeam?.strTeam || "";
  const favoriteFixture = favoriteName
    ? pool.find(
        (event) =>
          event.strHomeTeam === favoriteName || event.strAwayTeam === favoriteName
      ) || null
    : null;

  const target =
    favoriteFixture ||
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
  safeLoad(() => renderFavorite(), null);
  setTimeout(() => {
    const flash = state.goalFlashes.get(key);
    if (flash && flash.expiresAt <= Date.now()) {
      state.goalFlashes.delete(key);
      renderFixtures();
      safeLoad(() => renderFavorite(), null);
    }
  }, 7100);
}

function clearFavoriteGoalCinematic() {
  if (state.favoriteGoalAnimationTimer) {
    clearTimeout(state.favoriteGoalAnimationTimer);
    state.favoriteGoalAnimationTimer = null;
  }
  state.favoriteGoalAnimationToken = "";
  if (!el.favoriteGoalCinematic) return;
  el.favoriteGoalCinematic.classList.remove("active");
  el.favoriteGoalCinematic.classList.add("hidden");
  if (el.favoriteGoalTeam) el.favoriteGoalTeam.textContent = "";
  if (el.favoriteGoalScore) el.favoriteGoalScore.textContent = "";
}

function maybeTriggerFavoriteGoalCinematic(event) {
  if (!event || !el.favoriteGoalCinematic || !el.favoriteGoalTeam || !el.favoriteGoalScore) return;
  const key = fixtureKey(event);
  if (!key) return;
  const flash = state.goalFlashes.get(key);
  if (!flash || flash.expiresAt <= Date.now()) return;

  const token = `${key}:${flash.expiresAt}`;
  if (state.favoriteGoalAnimationToken === token) return;
  state.favoriteGoalAnimationToken = token;

  if (state.favoriteGoalAnimationTimer) {
    clearTimeout(state.favoriteGoalAnimationTimer);
    state.favoriteGoalAnimationTimer = null;
  }

  el.favoriteGoalTeam.textContent = flash.team || "Goal";
  el.favoriteGoalScore.textContent = flash.score || "";
  el.favoriteGoalCinematic.classList.remove("hidden", "active");
  void el.favoriteGoalCinematic.offsetWidth;
  el.favoriteGoalCinematic.classList.add("active");

  state.favoriteGoalAnimationTimer = setTimeout(() => {
    if (!el.favoriteGoalCinematic) return;
    el.favoriteGoalCinematic.classList.remove("active");
    el.favoriteGoalCinematic.classList.add("hidden");
    state.favoriteGoalAnimationTimer = null;
  }, 7600);
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
    state.favoriteTeam = null;
    applyClubThemeFromFavoriteTeam();
    clearFavoriteGoalCinematic();
    clearGameDayCountdownTimer();
    state.lastCountdownTarget = null;
    setGameDayMessage("Select a favourite team", "neutral");
    setFavoritePickerDisplay(null);
    resetFavoriteTheme();
    renderSquadPanel();
    renderDreamTeamNavState();
    renderDreamTeamPanel();
    el.favoriteEmpty.classList.remove("hidden");
    el.favoriteContent.classList.add("hidden");
    return;
  }

  const team = await safeLoad(() => fetchTeamById(state.favoriteTeamId), null);
  if (!team) {
    state.favoriteTeamId = "";
    state.favoriteTeam = null;
    applyClubThemeFromFavoriteTeam();
    localStorage.removeItem("esra_favorite_team");
    clearFavoriteGoalCinematic();
    clearGameDayCountdownTimer();
    state.lastCountdownTarget = null;
    setGameDayMessage("Select a favourite team", "neutral");
    setFavoritePickerDisplay(null);
    resetFavoriteTheme();
    renderSquadPanel();
    renderDreamTeamNavState();
    renderDreamTeamPanel();
    el.favoriteEmpty.classList.remove("hidden");
    el.favoriteContent.classList.add("hidden");
    return;
  }

  state.favoriteTeam = team;
  applyClubThemeFromFavoriteTeam();
  if (team.idTeam && !state.squadByTeamId[team.idTeam]) {
    const rawPlayers = await safeLoad(() => fetchPlayersForTeam(team), []);
    state.squadByTeamId[team.idTeam] = rawPlayers
      .map((player) => normalizeSquadPlayer(player, team))
      .filter(Boolean);
  }
  renderSquadPanel();
  renderDreamTeamNavState();
  renderDreamTeamPanel();
  const todayIso = toISODate(new Date());
  const lastEvents = await safeLoad(() => fetchTeamLastEvents(team.idTeam), []);
  const liveEvent = findLiveForFavorite(team.strTeam);
  const todayEvent = findTodayEventForFavorite(team.idTeam, team.strTeam);
  const todayEventDetailed = todayEvent?.idEvent ? (await safeLoad(() => fetchEventById(todayEvent.idEvent), null)) || todayEvent : todayEvent;
  const liveEventDetailed = liveEvent?.idEvent ? (await safeLoad(() => fetchEventById(liveEvent.idEvent), null)) || liveEvent : liveEvent;
  const chosenToday = liveEventDetailed || todayEventDetailed;
  const nextEvents = await safeLoad(() => fetchTeamNextEvents(team.idTeam), []);
  const todayUpcomingFromNext = nextEvents.find((event) => event.dateEvent === todayIso) || null;
  const todayPrimaryEvent =
    (chosenToday && chosenToday.dateEvent === todayIso && chosenToday) || todayUpcomingFromNext || null;
  const nextEvent = nextEvents.find((event) => !isSameFixture(event, todayPrimaryEvent || chosenToday)) || null;
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
    maybeTriggerFavoriteGoalCinematic(chosenToday);
    return;
  }

  if (chosenToday && chosenToday.dateEvent === todayIso && chosenTodayState === "final") {
    clearFavoriteGoalCinematic();
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
  clearFavoriteGoalCinematic();
  if (todayPrimaryEvent && todayPrimaryEvent.dateEvent === todayIso) {
    el.favoriteStatus.classList.add("gameday");
  }

  if (todayPrimaryEvent && eventState(todayPrimaryEvent).key === "upcoming") {
    const todaySummary = nextFixtureSummary(team, todayPrimaryEvent);
    el.favoriteFixtureLine.textContent = todaySummary.line;
    el.favoriteFixtureDetail.textContent = todaySummary.detail;
    el.favoriteLiveStrip.classList.remove("ticker-static");
  } else if (lastCompleted) {
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

async function loadCoreData(options = {}) {
  const includeLive = options.includeLive !== false;
  const includeStatic = options.includeStatic !== false;
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
    includeLive ? safeLoad(() => fetchLiveByLeague(LEAGUES.EPL.id), []) : Promise.resolve([]),
    includeLive ? safeLoad(() => fetchLiveByLeague(LEAGUES.CHAMP.id), []) : Promise.resolve([]),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dates.prev), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dates.prev), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dates.next), []),
    safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dates.next), []),
    includeStatic ? safeLoad(() => fetchTable(LEAGUES.EPL.id), []) : Promise.resolve(state.tables.EPL || []),
    includeStatic ? safeLoad(() => fetchTable(LEAGUES.CHAMP.id), []) : Promise.resolve(state.tables.CHAMP || []),
    includeStatic ? safeLoad(() => fetchAllTeams(LEAGUES.EPL.id), []) : Promise.resolve(state.teamsByLeague.EPL || []),
    includeStatic ? safeLoad(() => fetchAllTeams(LEAGUES.CHAMP.id), []) : Promise.resolve(state.teamsByLeague.CHAMP || []),
    includeStatic ? safeLoad(() => fetchLeagueMeta(LEAGUES.EPL.id), null) : Promise.resolve(null),
    includeStatic ? safeLoad(() => fetchLeagueMeta(LEAGUES.CHAMP.id), null) : Promise.resolve(null),
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
  if (includeStatic) {
    state.lastStaticRefreshAt = Date.now();
  }
  if (leagueMetaEpl) {
    state.leagueBadges.EPL = leagueMetaEpl.strBadge || leagueMetaEpl.strLogo || state.leagueBadges.EPL || "";
  }
  if (leagueMetaChamp) {
    state.leagueBadges.CHAMP = leagueMetaChamp.strBadge || leagueMetaChamp.strLogo || state.leagueBadges.CHAMP || "";
  }
  if (includeLive) {
    state.lastLiveProbeAt = Date.now();
  }
  ensureDefaultFavoriteTeam();
}

function renderLastRefreshed() {
  if (!state.lastRefresh) {
    el.lastRefreshed.textContent = "Last refreshed: --";
    return;
  }
  el.lastRefreshed.textContent = `Last refreshed: ${state.lastRefresh.toLocaleString("en-GB")}`;
}

function fixtureKickoffDate(event) {
  if (!event?.dateEvent) return null;
  const rawTime = (event.strTime || "12:00:00").slice(0, 8);
  const dt = new Date(`${event.dateEvent}T${rawTime}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function currentPollContext() {
  const now = new Date();
  const todayIso = toISODate(now);
  const todayPool = [...state.fixtures.today.EPL, ...state.fixtures.today.CHAMP].filter((event) => event?.dateEvent === todayIso);
  const hasTodayFixtures = todayPool.length > 0;
  const hasLive = todayPool.some((event) => eventState(event).key === "live");
  const selectedDateIsToday = state.selectedDate === todayIso;
  const favoriteName = state.favoriteTeam?.strTeam || "";
  const favoriteHasTodayFixture = favoriteName
    ? todayPool.some((event) => event.strHomeTeam === favoriteName || event.strAwayTeam === favoriteName)
    : false;

  const upcomingMinutes = todayPool
    .filter((event) => eventState(event).key === "upcoming")
    .map((event) => {
      const kickoff = fixtureKickoffDate(event);
      if (!kickoff) return null;
      return Math.floor((kickoff.getTime() - now.getTime()) / 60000);
    })
    .filter((mins) => mins !== null && mins >= 0)
    .sort((a, b) => a - b);
  const minutesToNextKickoff = upcomingMinutes.length ? upcomingMinutes[0] : null;

  return {
    hasTodayFixtures,
    hasLive,
    selectedDateIsToday,
    favoriteHasTodayFixture,
    minutesToNextKickoff,
  };
}

function shouldFetchStaticData() {
  if (!state.tables.EPL.length || !state.tables.CHAMP.length) return true;
  if (!state.teamsByLeague.EPL.length || !state.teamsByLeague.CHAMP.length) return true;
  return Date.now() - state.lastStaticRefreshAt >= STATIC_REFRESH_MS;
}

function shouldFetchLiveData(context) {
  const sinceLastLiveProbe = Date.now() - state.lastLiveProbeAt;
  if (context.hasLive) return true;
  if (context.selectedDateIsToday || context.favoriteHasTodayFixture || context.hasTodayFixtures) {
    if (context.minutesToNextKickoff !== null && context.minutesToNextKickoff <= 120) return true;
    return sinceLastLiveProbe >= LIVE_PROBE_MATCHDAY_MS;
  }
  return sinceLastLiveProbe >= LIVE_PROBE_IDLE_MS;
}

function nextPollDelay(context) {
  if (context.hasLive) {
    state.pollMode = "live";
    return POLL_LIVE_MS;
  }
  if (context.hasTodayFixtures || context.favoriteHasTodayFixture) {
    state.pollMode = "matchday";
    return POLL_MATCHDAY_MS;
  }
  state.pollMode = "idle";
  return POLL_IDLE_MS;
}

function scheduleNextRefresh(context) {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
  }
  const delay = nextPollDelay(context);
  state.refreshTimer = setTimeout(() => {
    fullRefresh();
  }, delay);
}

async function fullRefresh() {
  if (state.refreshInFlight) return;
  state.refreshInFlight = true;
  let nextContext = currentPollContext();
  try {
    if (!state.selectedDate) {
      state.selectedDate = toISODate(new Date());
    }
    if (state.favoriteTeamId) {
      localStorage.setItem("esra_favorite_team", state.favoriteTeamId);
    }
    const includeLive = shouldFetchLiveData(nextContext);
    const includeStatic = shouldFetchStaticData();
    await loadCoreData({ includeLive, includeStatic });
    detectGoalFlashes();
    await refreshSelectedDateFixtures();
    buildFavoriteOptions();
    await safeLoad(() => renderFavorite(), null);
    renderFixtures();
    renderTables();
    setLeagueButtonState();
    if (state.playerPopEnabled && el.playerDvdLayer?.classList.contains("hidden")) {
      showRandomPlayerPop();
    }

    state.lastRefresh = new Date();
    renderLastRefreshed();
    nextContext = currentPollContext();
  } catch (err) {
    displayApiError(el.fixturesList, err);
    el.tablesWrap.innerHTML = `<div class="error">Unable to load league tables. ${err.message}</div>`;
  } finally {
    state.refreshInFlight = false;
    scheduleNextRefresh(nextContext);
  }
}

function attachEvents() {
  if (el.settingsToggleBtn) {
    el.settingsToggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setSettingsMenuOpen(!state.settingsOpen);
    });
  }

  el.themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyUiTheme(btn.dataset.theme);
    });
  });

  if (el.playerDvdToggleMain) {
    el.playerDvdToggleMain.addEventListener("click", () => {
      setPlayerPopEnabled(!state.playerPopEnabled);
    });
  }

  el.playerSourceButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      setPlayerPopScope(btn.dataset.playerSource);
      if (state.playerPopEnabled) {
        await showRandomPlayerPop();
      }
    });
  });

  if (el.playerDvdAvatar) {
    el.playerDvdAvatar.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      revealAndDismissPlayerPop();
    });
  }

  if (el.dreamTeamToggleBtn) {
    el.dreamTeamToggleBtn.addEventListener("click", () => {
      toggleDreamTeamPanel();
    });
    el.dreamTeamToggleBtn.addEventListener("mouseenter", () => {
      if (!state.dreamTeam.length && el.dreamTeamHint) {
        el.dreamTeamHint.classList.remove("hidden");
      }
    });
    el.dreamTeamToggleBtn.addEventListener("mouseleave", () => {
      if (el.dreamTeamHint) {
        el.dreamTeamHint.classList.add("hidden");
      }
    });
  }

  if (el.dreamTeamDownloadBtn) {
    el.dreamTeamDownloadBtn.addEventListener("click", () => {
      downloadDreamTeamImage();
    });
  }

  if (el.dreamTeamCloseBtn) {
    el.dreamTeamCloseBtn.addEventListener("click", () => {
      state.dreamTeamOpen = false;
      renderDreamTeamNavState();
      renderDreamTeamPanel();
    });
  }

  if (el.dreamTeamPanel) {
    el.dreamTeamPanel.addEventListener("click", (event) => {
      if (event.target !== el.dreamTeamPanel) return;
      state.dreamTeamOpen = false;
      renderDreamTeamNavState();
      renderDreamTeamPanel();
    });
  }

  if (el.squadToggleBtn) {
    el.squadToggleBtn.addEventListener("click", () => {
      state.squadOpen = !state.squadOpen;
      renderSquadPanel();
    });
  }

  window.addEventListener("resize", () => {
    if (!state.playerPopEnabled || !el.playerDvdLayer || el.playerDvdLayer.classList.contains("hidden")) return;
    const pop = state.playerPop;
    pop.x = Math.max(0, Math.min(pop.x, window.innerWidth - pop.size));
    pop.y = Math.max(0, Math.min(pop.y, window.innerHeight - pop.size));
    placePlayerPopElement();
  });

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
    if (el.settingsMenu && !el.settingsMenu.contains(e.target)) {
      setSettingsMenuOpen(false);
    }
    if (!el.favoritePicker.contains(e.target)) {
      el.favoritePickerMenu.classList.add("hidden");
      el.favoritePickerBtn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.dreamTeamOpen) return;
    state.dreamTeamOpen = false;
    renderDreamTeamNavState();
    renderDreamTeamPanel();
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
applyUiTheme(state.uiTheme);
setPlayerPopScope(state.playerPopScope);
setPlayerPopButtonState();
refreshPlayerPopScoreBadge();
renderDreamTeamNavState();
renderDreamTeamPanel();
setSettingsMenuOpen(false);
if (state.playerPopEnabled) {
  showRandomPlayerPop();
}
fullRefresh();
