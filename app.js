const API_PROXY_BASE = "/api";
const ONE_MINUTE_MS = 60 * 1000;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const RESULTS_HISTORY_DAYS = 92;
const FIXTURES_FUTURE_DAYS = 183;
const POLL_LIVE_MS = ONE_MINUTE_MS;
const POLL_MATCHDAY_MS = THREE_HOURS_MS;
const POLL_IDLE_MS = THREE_HOURS_MS;
const LIVE_PROBE_MATCHDAY_MS = THREE_HOURS_MS;
const LIVE_PROBE_IDLE_MS = THREE_HOURS_MS;
const STATIC_REFRESH_MS = THREE_HOURS_MS;
const API_FETCH_TIMEOUT_MS = 12000;
const API_FETCH_RETRIES = 1;

const LEAGUES = {
  EPL: { id: "4328", name: "English Premier League" },
  CHAMP: { id: "4329", name: "English League Championship" },
};
const inflightApiGets = new Map();
const STORED_FAVORITE_TEAM = localStorage.getItem("esra_favorite_team") || "";
const STORED_PLAYER_SCOPE = localStorage.getItem("ezra_player_pop_scope");
const STORED_ACCOUNT_TOKEN = localStorage.getItem("ezra_account_token") || "";
const DREAM_TEAM_FORMATIONS = {
  "4-3-3": { DEF: 4, MID: 3, FWD: 3 },
  "4-4-2": { DEF: 4, MID: 4, FWD: 2 },
  "3-5-2": { DEF: 3, MID: 5, FWD: 2 },
  "4-2-3-1": { DEF: 4, MID: 5, FWD: 1 },
  "5-3-2": { DEF: 5, MID: 3, FWD: 2 },
};

function dreamRoleFromPosition(position) {
  const p = (position || "").toLowerCase();
  if (p.includes("manager")) return "MGR";
  if (p.includes("coach") || p.includes("owner") || p.includes("chairman") || p.includes("director")) return "COACH";
  if (p.includes("goalkeeper") || p === "gk" || p.includes("keeper")) return "GK";
  if (p.includes("defender") || p.includes("back")) return "DEF";
  if (p.includes("midfielder") || p.includes("midfield") || p.includes("winger")) return "MID";
  if (p.includes("forward") || p.includes("striker") || p.includes("attacker")) return "FWD";
  return "MID";
}

function defaultDreamTeamState() {
  return {
    pool: [],
    staff: { manager: null, coaches: [] },
    formation: "4-3-3",
    startingXI: [],
    bench: [],
  };
}

function parseStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseStoredArray(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function defaultMissionState() {
  return { dailyByDate: {} };
}

function defaultStoryCardState() {
  return { density: "standard", focusTeamIds: [] };
}

function defaultHigherLowerState() {
  return {
    loading: false,
    error: "",
    active: false,
    completed: false,
    total: 10,
    asked: 0,
    correct: 0,
    poolKey: "",
    pool: [],
    usedKeys: [],
    top: null,
    bottom: null,
    feedback: "",
    feedbackMode: "",
  };
}

function defaultFamilyLeagueState() {
  return { leagueCode: "", joinedLeagueCodes: [], currentLeagueIndex: 0, personalPoints: 0, predictions: {}, questBonusByDate: {} };
}

function loadDreamTeamState() {
  const base = defaultDreamTeamState();
  try {
    const raw = localStorage.getItem("ezra_dream_team");
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Backward compatibility for previous flat list.
      const next = defaultDreamTeamState();
      parsed.forEach((player) => {
        if (!player?.key) return;
        const role = dreamRoleFromPosition(player.position);
        if (role === "MGR") {
          if (!next.staff.manager) next.staff.manager = player;
          else next.staff.coaches.push(player);
          return;
        }
        if (role === "COACH") {
          next.staff.coaches.push(player);
          return;
        }
        if (next.pool.length < 18) next.pool.push(player);
      });
      return next;
    }
    if (!parsed || typeof parsed !== "object") return base;
    const pool = Array.isArray(parsed.pool) ? parsed.pool.filter((p) => p?.key).slice(0, 18) : [];
    const manager = parsed.staff?.manager && parsed.staff.manager.key ? parsed.staff.manager : null;
    const coaches = Array.isArray(parsed.staff?.coaches) ? parsed.staff.coaches.filter((p) => p?.key) : [];
    const formation = DREAM_TEAM_FORMATIONS[parsed.formation] ? parsed.formation : "4-3-3";
    const poolKeys = new Set(pool.map((p) => p.key));
    const startingXI = Array.isArray(parsed.startingXI)
      ? parsed.startingXI
          .slice(0, 11)
          .map((key) => (key === null ? null : typeof key === "string" && poolKeys.has(key) ? key : null))
      : [];
    const bench = Array.isArray(parsed.bench)
      ? parsed.bench.filter((key) => typeof key === "string" && poolKeys.has(key) && !startingXI.includes(key))
      : [];
    return {
      pool,
      staff: { manager, coaches },
      formation,
      startingXI,
      bench,
    };
  } catch {
    return base;
  }
}

const state = {
  selectedLeague: "ALL",
  serverTimeOffsetMs: 0,
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
  favoriteTeamId: STORED_FAVORITE_TEAM,
  uiTheme: localStorage.getItem("ezra_ui_theme") || "classic",
  motionLevel: localStorage.getItem("ezra_motion_level") || "standard",
  playerPopEnabled: localStorage.getItem("ezra_player_pop_enabled") === "1",
  playerPopScope: STORED_PLAYER_SCOPE ? (STORED_PLAYER_SCOPE === "favorite" ? "favorite" : "any") : STORED_FAVORITE_TEAM ? "favorite" : "any",
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
  playerProfileCache: {},
  selectedSquadPlayerKey: "",
  dreamTeam: loadDreamTeamState(),
  dreamSwapActiveKey: "",
  dreamManualLayout: false,
  missions: parseStoredJson("ezra_missions", defaultMissionState()),
  storyCards: parseStoredJson("ezra_story_cards", defaultStoryCardState()),
  higherLower: defaultHigherLowerState(),
  familyLeague: parseStoredJson("ezra_family_league", defaultFamilyLeagueState()),
  missionFx: { questId: "", until: 0, timer: null },
  squadGoalFx: { playerKey: "", until: 0, timer: null },
  leagueMemberView: { open: false, loading: false, error: "", data: null, compare: false },
  leagueDirectory: { items: [], loading: false },
  lastLeagueDirectoryAt: 0,
  challengeDashboard: null,
  challengeDashboardAt: 0,
  favoriteDataLoading: false,
  mobileTab: "fixtures",
  account: {
    token: STORED_ACCOUNT_TOKEN,
    user: null,
    syncTimer: null,
    leagueRefreshTimer: null,
    syncing: false,
  },
  maxDreamTeamPlayers: 18,
  dreamTeamOpen: false,
  squadOpen: false,
  favoriteTeam: null,
  favoriteUpcomingEvent: null,
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
  lastTableRefreshAt: 0,
  pollMode: "idle",
  settingsOpen: false,
  accountMenuOpen: false,
  focusedFixtureKey: "",
  openFixtureKey: "",
  eventDetailCache: {},
  fixtureScoreSnapshot: new Map(),
  dateFixturesCache: {},
  selectedDateLoadSeq: 0,
  selectedDateTimer: null,
  liveStream: { es: null, reconnectTimer: null, lastVersion: "", connected: false },
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
  dreamRenderRaf: null,
  dreamRenderReason: "default",
  lastRefresh: null,
};

function hydrateCachedBootstrapData() {
  const cachedEplTeams = parseStoredArray("ezra_cache_teams_epl", []);
  const cachedChampTeams = parseStoredArray("ezra_cache_teams_champ", []);
  const cachedEplTable = parseStoredArray("ezra_cache_table_epl", []);
  const cachedChampTable = parseStoredArray("ezra_cache_table_champ", []);
  const cachedLeagueBadges = parseStoredJson("ezra_cache_league_badges", { EPL: "", CHAMP: "" });

  if (!state.teamsByLeague.EPL.length && cachedEplTeams.length) state.teamsByLeague.EPL = cachedEplTeams;
  if (!state.teamsByLeague.CHAMP.length && cachedChampTeams.length) state.teamsByLeague.CHAMP = cachedChampTeams;
  if (!state.tables.EPL.length && cachedEplTable.length) state.tables.EPL = cachedEplTable;
  if (!state.tables.CHAMP.length && cachedChampTable.length) state.tables.CHAMP = cachedChampTable;
  if (cachedLeagueBadges && typeof cachedLeagueBadges === "object") {
    state.leagueBadges.EPL = cachedLeagueBadges.EPL || state.leagueBadges.EPL || "";
    state.leagueBadges.CHAMP = cachedLeagueBadges.CHAMP || state.leagueBadges.CHAMP || "";
  }

  rebuildTeamBadgeMap();
  ensureDefaultFavoriteTeam();
}

function persistCachedBootstrapData() {
  try {
    localStorage.setItem("ezra_cache_teams_epl", JSON.stringify(state.teamsByLeague.EPL || []));
    localStorage.setItem("ezra_cache_teams_champ", JSON.stringify(state.teamsByLeague.CHAMP || []));
    localStorage.setItem("ezra_cache_table_epl", JSON.stringify(state.tables.EPL || []));
    localStorage.setItem("ezra_cache_table_champ", JSON.stringify(state.tables.CHAMP || []));
    localStorage.setItem("ezra_cache_league_badges", JSON.stringify(state.leagueBadges || { EPL: "", CHAMP: "" }));
  } catch {
    // Ignore localStorage write errors.
  }
}

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
  favoriteForm: document.getElementById("favorite-form"),
  favoriteFormRight: document.getElementById("favorite-form-right"),
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
  accountMenu: document.getElementById("account-menu"),
  accountToggleBtn: document.getElementById("account-toggle-btn"),
  accountPanel: document.getElementById("account-panel"),
  accountAuthSignedOut: document.getElementById("account-auth-signedout"),
  accountAuthSignedIn: document.getElementById("account-auth-signedin"),
  accountNameInput: document.getElementById("account-name-input"),
  accountPinInput: document.getElementById("account-pin-input"),
  accountRegisterBtn: document.getElementById("account-register-btn"),
  accountLoginBtn: document.getElementById("account-login-btn"),
  accountSyncBtn: document.getElementById("account-sync-btn"),
  accountLogoutBtn: document.getElementById("account-logout-btn"),
  accountUserLabel: document.getElementById("account-user-label"),
  accountStatus: document.getElementById("account-status"),
  missionsMeta: document.getElementById("missions-meta"),
  missionsList: document.getElementById("missions-list"),
  storyList: document.getElementById("story-list"),
  higherLowerBody: document.getElementById("higher-lower-body"),
  higherLowerStartBtn: document.getElementById("higher-lower-start-btn"),
  challengeStreak: document.getElementById("challenge-streak"),
  challengeCombo: document.getElementById("challenge-combo"),
  challengeMastery: document.getElementById("challenge-mastery"),
  challengeAchievements: document.getElementById("challenge-achievements"),
  familyPrevLeagueBtn: document.getElementById("family-prev-league-btn"),
  familyNextLeagueBtn: document.getElementById("family-next-league-btn"),
  familyCreateCodeBtn: document.getElementById("family-create-code-btn"),
  familyLeagueNameInput: document.getElementById("family-league-name-input"),
  familyLeagueNameSaveBtn: document.getElementById("family-league-name-save-btn"),
  familyJoinCodeInput: document.getElementById("family-join-code-input"),
  familyJoinCodeBtn: document.getElementById("family-join-code-btn"),
  familyCodeLabel: document.getElementById("family-code-label"),
  familyMembers: document.getElementById("family-members"),
  funZoneBody: document.getElementById("fun-zone-body"),
  mobileTabsPanel: document.getElementById("mobile-tabs-panel"),
  mobileTabButtons: [...document.querySelectorAll(".mobile-tab-btn")],
  motionButtons: [...document.querySelectorAll(".motion-btn")],
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
  leagueMemberPanel: document.getElementById("league-member-panel"),
  leagueMemberTitle: document.getElementById("league-member-title"),
  leagueMemberBody: document.getElementById("league-member-body"),
  leagueMemberCloseBtn: document.getElementById("league-member-close-btn"),
  squadPanel: document.getElementById("squad-panel"),
  squadTitle: document.getElementById("squad-title"),
  squadToggleBtn: document.getElementById("squad-toggle-btn"),
  squadBody: document.getElementById("squad-body"),
  squadList: document.getElementById("squad-list"),
  playerDvdLayer: document.getElementById("player-dvd-layer"),
  playerDvdAvatar: document.getElementById("player-dvd-avatar"),
  playerDvdImage: document.getElementById("player-dvd-image"),
  playerQuizFocus: document.getElementById("player-quiz-focus"),
  playerQuizFocusImage: document.getElementById("player-quiz-focus-image"),
  playerDvdName: document.getElementById("player-dvd-name"),
  playerQuizCard: document.getElementById("player-quiz-card"),
  playerQuizOptions: document.getElementById("player-quiz-options"),
  playerQuizFeedback: document.getElementById("player-quiz-feedback"),
  controlsPanel: document.querySelector(".controls-panel"),
  stickyDateBar: document.getElementById("sticky-date-bar"),
  stickyDateLabel: document.getElementById("sticky-date-label"),
  stickyDatePrev: document.getElementById("sticky-date-prev"),
  stickyDateToday: document.getElementById("sticky-date-today"),
  stickyDateNext: document.getElementById("sticky-date-next"),
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

function setMotionButtonState() {
  el.motionButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.motion === state.motionLevel);
  });
}

function applyMotionSetting(level) {
  const safeLevel = ["minimal", "standard", "arcade"].includes(level) ? level : "standard";
  state.motionLevel = safeLevel;
  document.body.setAttribute("data-motion", safeLevel);
  localStorage.setItem("ezra_motion_level", safeLevel);
  setMotionButtonState();
  scheduleCloudStateSync();
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
  scheduleCloudStateSync();
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
  scheduleCloudStateSync();
}

function setSettingsMenuOpen(open) {
  state.settingsOpen = Boolean(open);
  if (!el.settingsPanel || !el.settingsToggleBtn) return;
  el.settingsPanel.classList.toggle("hidden", !state.settingsOpen);
  el.settingsToggleBtn.setAttribute("aria-expanded", String(state.settingsOpen));
}

function setAccountMenuOpen(open) {
  state.accountMenuOpen = Boolean(open);
  if (!el.accountPanel || !el.accountToggleBtn) return;
  el.accountPanel.classList.toggle("hidden", !state.accountMenuOpen);
  el.accountToggleBtn.setAttribute("aria-expanded", String(state.accountMenuOpen));
}

function accountSignedIn() {
  return Boolean(state.account?.token && state.account?.user?.id);
}

function setAccountStatus(text, isError = false) {
  if (!el.accountStatus) return;
  el.accountStatus.textContent = text;
  el.accountStatus.classList.toggle("error", Boolean(isError));
}

function renderAccountUI() {
  if (!el.accountAuthSignedOut || !el.accountAuthSignedIn || !el.accountUserLabel) return;
  const signedIn = accountSignedIn();
  el.accountAuthSignedOut.classList.toggle("hidden", signedIn);
  el.accountAuthSignedIn.classList.toggle("hidden", !signedIn);
  if (signedIn) {
    el.accountUserLabel.textContent = `Signed in as ${state.account.user.name}`;
  }
  updateFamilyControlsState();
}

function updateFamilyControlsState() {
  const signedIn = accountSignedIn();
  const prevBtn = el.familyPrevLeagueBtn;
  const nextBtn = el.familyNextLeagueBtn;
  const codeBtn = el.familyCreateCodeBtn;
  const nameInput = el.familyLeagueNameInput;
  const nameSaveBtn = el.familyLeagueNameSaveBtn;
  const joinInput = el.familyJoinCodeInput;
  const joinBtn = el.familyJoinCodeBtn;
  if (joinInput) {
    joinInput.disabled = !signedIn;
    joinInput.placeholder = signedIn ? "Enter league code" : "Sign in to join a league";
  }
  if (prevBtn) prevBtn.disabled = !signedIn;
  if (nextBtn) nextBtn.disabled = !signedIn;
  if (codeBtn) codeBtn.disabled = !signedIn;
  if (nameInput) {
    nameInput.disabled = !signedIn;
    nameInput.placeholder = signedIn ? "League name (owner only)" : "Sign in to name your league";
  }
  if (nameSaveBtn) nameSaveBtn.disabled = !signedIn;
  if (joinBtn) joinBtn.disabled = !signedIn;
}

function ensureSignedInUserInFamilyLeague() {
  ensureFamilyLeagueState();
  if (!accountSignedIn()) return false;
  let changed = false;
  const code = String(state.familyLeague.leagueCode || "").trim().toUpperCase();
  if (code && !state.familyLeague.joinedLeagueCodes.includes(code)) {
    state.familyLeague.joinedLeagueCodes.push(code);
    changed = true;
  }
  if (!Number.isFinite(Number(state.familyLeague.personalPoints))) {
    state.familyLeague.personalPoints = 0;
    changed = true;
  }
  if (ensureDailyQuestBonusesForSignedInUser()) {
    changed = true;
  }
  if (changed) {
    persistLocalMetaState();
    scheduleCloudStateSync();
    scheduleLeagueStandingsRefresh();
  }
  return true;
}

function currentFamilyMemberId() {
  if (!accountSignedIn()) return "";
  const id = String(state.account.user?.id || "").trim();
  return id ? `acct:${id}` : "";
}

function persistLocalMetaState() {
  localStorage.setItem("ezra_missions", JSON.stringify(state.missions || defaultMissionState()));
  localStorage.setItem("ezra_story_cards", JSON.stringify(state.storyCards || defaultStoryCardState()));
  localStorage.setItem("ezra_family_league", JSON.stringify(state.familyLeague || defaultFamilyLeagueState()));
}

function ensureMissionState() {
  if (!state.missions || typeof state.missions !== "object") {
    state.missions = defaultMissionState();
  }
  if (!state.missions.dailyByDate || typeof state.missions.dailyByDate !== "object") {
    // Migrate legacy mission schema to daily quest schema.
    const legacy = state.missions.completedByDate && typeof state.missions.completedByDate === "object" ? state.missions.completedByDate : {};
    const migrated = {};
    Object.keys(legacy).forEach((dateKey) => {
      const list = Array.isArray(legacy[dateKey]) ? legacy[dateKey] : [];
      migrated[dateKey] = {
        popCorrect: 0,
        randomTarget: null,
        randomExplored: false,
        completed: [
          list.includes("missions-watch-live") ? "quest-pop-5" : null,
          list.includes("missions-favourite") ? "quest-random-player" : null,
        ].filter(Boolean),
      };
    });
    state.missions = {
      dailyByDate: migrated,
    };
  }
}

function ensureFamilyLeagueState() {
  if (!state.familyLeague || typeof state.familyLeague !== "object") {
    state.familyLeague = defaultFamilyLeagueState();
  }
  if (typeof state.familyLeague.leagueCode !== "string") {
    state.familyLeague.leagueCode = "";
  }
  if (!Array.isArray(state.familyLeague.joinedLeagueCodes)) {
    state.familyLeague.joinedLeagueCodes = state.familyLeague.leagueCode ? [state.familyLeague.leagueCode] : [];
  }
  if (!Number.isInteger(state.familyLeague.currentLeagueIndex)) {
    state.familyLeague.currentLeagueIndex = 0;
  }
  if (!Number.isFinite(Number(state.familyLeague.personalPoints))) {
    // Legacy fallback from previous members structure.
    const legacyMemberId = currentFamilyMemberId();
    const legacy = Array.isArray(state.familyLeague.members)
      ? state.familyLeague.members.find((m) => String(m?.id || "") === legacyMemberId)
      : null;
    state.familyLeague.personalPoints = Math.max(0, Number(legacy?.points || 0));
  }
  if (!state.familyLeague.predictions || typeof state.familyLeague.predictions !== "object") {
    state.familyLeague.predictions = {};
  }
  if (!state.familyLeague.questBonusByDate || typeof state.familyLeague.questBonusByDate !== "object") {
    state.familyLeague.questBonusByDate = {};
  }
  state.familyLeague.personalPoints = Math.max(0, Number(state.familyLeague.personalPoints || 0));
  state.familyLeague.joinedLeagueCodes = state.familyLeague.joinedLeagueCodes
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean);
  if (state.familyLeague.joinedLeagueCodes.length && state.familyLeague.currentLeagueIndex >= state.familyLeague.joinedLeagueCodes.length) {
    state.familyLeague.currentLeagueIndex = 0;
  }
}

function missionDateKey() {
  const now = serverNow();
  // Quests roll over at 00:01 server time, not at midnight.
  if (now.getUTCHours() === 0 && now.getUTCMinutes() < 1) {
    now.setUTCDate(now.getUTCDate() - 1);
  }
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function todayQuestState() {
  ensureMissionState();
  const today = missionDateKey();
  if (!state.missions.dailyByDate[today] || typeof state.missions.dailyByDate[today] !== "object") {
    state.missions.dailyByDate[today] = {
      popCorrect: 0,
      randomTarget: null,
      randomExplored: false,
      completed: [],
    };
  }
  const entry = state.missions.dailyByDate[today];
  if (!Number.isFinite(Number(entry.popCorrect))) entry.popCorrect = 0;
  if (!Array.isArray(entry.completed)) entry.completed = [];
  if (typeof entry.randomExplored !== "boolean") entry.randomExplored = false;
  if (!entry.randomTarget || typeof entry.randomTarget !== "object") entry.randomTarget = null;
  return entry;
}

function isQuestDone(questId) {
  const daily = todayQuestState();
  return daily.completed.includes(questId);
}

function addFamilyPoints(delta) {
  ensureFamilyLeagueState();
  state.familyLeague.personalPoints = Math.max(0, Number(state.familyLeague.personalPoints || 0) + Number(delta || 0));
  return true;
}

function questBonusClaimKeyForUserAndQuest(questId, memberId = currentFamilyMemberId()) {
  return `${memberId}:${questId}`;
}

function ensureDailyQuestBonusesForSignedInUser() {
  ensureMissionState();
  ensureFamilyLeagueState();
  if (!accountSignedIn()) return false;
  const memberId = currentFamilyMemberId();
  if (!memberId) return false;
  const today = missionDateKey();
  const daily = todayQuestState();
  if (!state.familyLeague.questBonusByDate[today] || typeof state.familyLeague.questBonusByDate[today] !== "object") {
    state.familyLeague.questBonusByDate[today] = {};
  }
  let changed = false;
  (daily.completed || []).forEach((questId) => {
    const claimKey = questBonusClaimKeyForUserAndQuest(questId, memberId);
    if (state.familyLeague.questBonusByDate[today][claimKey]) return;
    if (!addFamilyPoints(5)) return;
    state.familyLeague.questBonusByDate[today][claimKey] = true;
    changed = true;
  });
  return changed;
}

function awardQuestBonus(questId) {
  ensureFamilyLeagueState();
  if (!accountSignedIn()) return false;
  const today = missionDateKey();
  if (!state.familyLeague.questBonusByDate[today] || typeof state.familyLeague.questBonusByDate[today] !== "object") {
    state.familyLeague.questBonusByDate[today] = {};
  }
  const key = `${currentFamilyMemberId()}:${questId}`;
  if (state.familyLeague.questBonusByDate[today][key]) return false;
  if (!addFamilyPoints(5)) return false;
  state.familyLeague.questBonusByDate[today][key] = true;
  scheduleLeagueStandingsRefresh();
  return true;
}

function completeQuest(questId) {
  const daily = todayQuestState();
  if (daily.completed.includes(questId)) return false;
  daily.completed.push(questId);
  awardQuestBonus(questId);
  persistLocalMetaState();
  scheduleCloudStateSync();
  // Ensure mini-league standings reflect quest points immediately.
  scheduleLeagueStandingsRefresh(200);
  renderMissionsPanel();
  renderFamilyLeaguePanel();
  return true;
}

function scheduleLeagueStandingsRefresh(delayMs = 1800) {
  if (!accountSignedIn()) return;
  if (state.account.leagueRefreshTimer) {
    clearTimeout(state.account.leagueRefreshTimer);
  }
  state.account.leagueRefreshTimer = setTimeout(async () => {
    state.account.leagueRefreshTimer = null;
    await refreshLeagueDirectory();
    await safeLoad(() => refreshChallengeDashboard(true), null);
    renderFamilyLeaguePanel();
    renderMissionsPanel();
  }, delayMs);
}

function allLeagueTeams() {
  return [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP].filter((team) => team?.idTeam && team?.strTeam);
}

function shuffleList(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

async function pickDailyRandomQuestPlayer(forceNew = false) {
  const daily = todayQuestState();
  if (daily.randomTarget && !forceNew) return daily.randomTarget;
  const teams = shuffleList(allLeagueTeams());
  let chosen = null;
  for (const team of teams.slice(0, 12)) {
    const rawPlayers = await fetchPlayersForTeam(team);
    const withCutout = rawPlayers
      .map((raw) => normalizeSquadPlayer(raw, team))
      .filter((player) => player && player.image);
    if (!withCutout.length) continue;
    const picked = randomFrom(withCutout);
    if (!picked) continue;
    chosen = {
      key: picked.key,
      idPlayer: picked.idPlayer || "",
      teamId: picked.teamId || "",
      teamName: picked.teamName || "",
      name: picked.name,
      image: picked.image,
    };
    break;
  }
  daily.randomTarget = chosen;
  daily.randomExplored = false;
  daily.completed = (daily.completed || []).filter((id) => id !== "quest-random-player");
  persistLocalMetaState();
  scheduleCloudStateSync();
  return chosen;
}

async function startQuestRandomPlayer() {
  const target = await pickDailyRandomQuestPlayer(false);
  if (!target) return;
  renderMissionsPanel();
}

async function startPopQuizQuest() {
  if (!state.playerPopEnabled) {
    setPlayerPopEnabled(true);
  }
  await showRandomPlayerPop(true);
  renderMissionsPanel();
}

function registerPopQuizCorrectAnswer() {
  const daily = todayQuestState();
  daily.popCorrect = Number(daily.popCorrect || 0) + 1;
  if (daily.popCorrect >= 5) {
    completeQuest("quest-pop-5");
  } else {
    persistLocalMetaState();
    scheduleCloudStateSync();
  }
  renderMissionsPanel();
  renderFamilyLeaguePanel();
}

function onSquadPlayerExplored(player) {
  if (!player) return;
  const daily = todayQuestState();
  if (!daily.randomTarget) return;
  const matchById = daily.randomTarget.idPlayer && player.idPlayer && daily.randomTarget.idPlayer === player.idPlayer;
  const matchByKey = daily.randomTarget.key && player.key && daily.randomTarget.key === player.key;
  if (!matchById && !matchByKey) return;
  daily.randomExplored = true;
  if (!isQuestDone("quest-random-player")) {
    triggerSquadGoalFx(player.key);
  }
  completeQuest("quest-random-player");
  renderSquadPanel();
}

function triggerSquadGoalFx(playerKey, durationMs = 4200) {
  state.squadGoalFx.playerKey = String(playerKey || "");
  state.squadGoalFx.until = Date.now() + durationMs;
  if (state.squadGoalFx.timer) {
    clearTimeout(state.squadGoalFx.timer);
  }
  state.squadGoalFx.timer = setTimeout(() => {
    state.squadGoalFx.timer = null;
    if (Date.now() >= Number(state.squadGoalFx.until || 0)) {
      state.squadGoalFx.playerKey = "";
      state.squadGoalFx.until = 0;
    }
    renderSquadPanel();
  }, durationMs + 120);
}

function triggerMissionGoalFx(questId, durationMs = 4200) {
  state.missionFx.questId = String(questId || "");
  state.missionFx.until = Date.now() + durationMs;
  if (state.missionFx.timer) {
    clearTimeout(state.missionFx.timer);
  }
  state.missionFx.timer = setTimeout(() => {
    state.missionFx.timer = null;
    if (Date.now() >= Number(state.missionFx.until || 0)) {
      state.missionFx.questId = "";
      state.missionFx.until = 0;
    }
    renderMissionsPanel();
  }, durationMs + 120);
}

function dailyQuestList() {
  const daily = todayQuestState();
  const target = daily.randomTarget;
  const popCorrect = Math.min(Number(daily.popCorrect || 0), 5);
  const popDone = isQuestDone("quest-pop-5");
  const popStarted = popCorrect > 0;
  const randomDone = isQuestDone("quest-random-player");
  const randomStarted = Boolean(target);
  return [
    {
      id: "quest-pop-5",
      title: "Get 5 Pop Quizzes Correct",
      description: popDone ? "Quest complete. Bonus points awarded." : popStarted ? `${popCorrect}/5 correct today` : "Start the pop quiz and get 5 correct.",
      done: popDone,
      buttonLabel: !popDone && !popStarted ? "Start" : null,
      statusLabel: popDone ? "Complete" : popStarted ? `${popCorrect}/5` : null,
      onClick: async () => {
        await startPopQuizQuest();
      },
    },
    {
      id: "quest-random-player",
      title: "Explore A Random Player",
      description: randomDone
        ? "Quest complete. Bonus points awarded."
        : target
        ? `Find ${target.name} (${target.teamName}) in squad and tap for details`
        : "Start quest to get a random player from any league.",
      done: randomDone,
      buttonLabel: !randomDone && !randomStarted ? "Start Quest" : null,
      statusLabel: randomDone ? "Complete" : randomStarted ? "Target Active" : null,
      onClick: async () => {
        await startQuestRandomPlayer();
        renderMissionsPanel();
      },
    },
  ];
}

function renderMissionsPanel() {
  if (!el.missionsList || !el.missionsMeta) return;
  ensureFamilyLeagueState();
  if (ensureDailyQuestBonusesForSignedInUser()) {
    persistLocalMetaState();
    scheduleCloudStateSync();
    scheduleLeagueStandingsRefresh();
  }
  const quests = dailyQuestList();
  const completedCount = quests.filter((q) => q.done).length;
  const name = state.account.user?.name ? ` (${state.account.user.name})` : "";
  const dash = state.challengeDashboard;
  const streak = Number(dash?.progress?.currentStreak || 0);
  const combo = Number(dash?.progress?.comboCount || 0);
  const seasonPts = Number(dash?.currentSeason?.standings?.find((row) => String(row?.user_id || "") === String(state.account.user?.id || ""))?.points || 0);
  const suffix = accountSignedIn() ? ` • Streak ${streak}d • Combo x${Math.max(1, combo)} • Season ${seasonPts} pts` : "";
  el.missionsMeta.textContent = `Completed ${completedCount}/${quests.length} • Quest bonus +5 pts${name}${suffix}`;
  el.missionsList.innerHTML = "";
  quests.forEach((quest) => {
    const row = document.createElement("div");
    row.className = "mission-row";
    row.dataset.questId = quest.id;
    const statusText = quest.statusLabel || (quest.done ? "Complete" : "");
    row.innerHTML = `
      <div class="mission-text">
        <div class="mission-title">${escapeHtml(quest.title)}</div>
        <div class="mission-sub">${escapeHtml(quest.description)}</div>
      </div>
      ${quest.buttonLabel && !quest.done ? `<button class="btn" type="button">${escapeHtml(quest.buttonLabel)}</button>` : statusText ? `<span class="family-points">${escapeHtml(statusText)}</span>` : ""}
    `;
    const fxActive = state.missionFx.questId === quest.id && Number(state.missionFx.until || 0) > Date.now();
    if (fxActive) {
      row.classList.add("mission-goal-active");
      const fx = document.createElement("div");
      fx.className = "mission-goal-flash active";
      fx.setAttribute("aria-hidden", "true");
      fx.innerHTML = `
        <span class="goal-stage goal-word">GOAL!</span>
        <span class="goal-stage goal-team-name">QUEST COMPLETE</span>
        <span class="goal-stage goal-scoreline">+5 PTS</span>
      `;
      row.appendChild(fx);
    }
    const btn = row.querySelector("button");
    if (btn) {
      btn.disabled = quest.done;
      btn.addEventListener("click", async () => {
        if (quest.onClick) await quest.onClick();
      });
    }
    el.missionsList.appendChild(row);
  });
}

function storyCardData() {
  if (state.favoriteDataLoading) {
    return [
      { title: "Next Up", text: "Loading next fixture..." },
      { title: "Table Pulse", text: "Loading table position..." },
      { title: "Rival Watch", text: "Loading rival context..." },
    ];
  }
  if (!state.favoriteTeam) return [];
  const team = state.favoriteTeam;
  const leagueCode = teamLeagueCode(team);
  const table = state.tables[leagueCode] || [];
  const row =
    table.find((r) => r.idTeam === team.idTeam) ||
    table.find((r) => (r.strTeam || "").toLowerCase() === (team.strTeam || "").toLowerCase()) ||
    null;
  const todayIso = toISODate(new Date());
  const todayPool = [...state.fixtures.today.EPL, ...state.fixtures.today.CHAMP];
  const nextPool = [...state.fixtures.next.EPL, ...state.fixtures.next.CHAMP];
  const teamMatch = (event) => event && (event.strHomeTeam === team.strTeam || event.strAwayTeam === team.strTeam);
  const todayEvent = todayPool.find((e) => teamMatch(e) && e.dateEvent === todayIso) || null;
  const nextEvent =
    nextPool.find((e) => teamMatch(e)) ||
    state.fixtures.today[leagueCode]?.find((e) => teamMatch(e) && e.dateEvent !== todayIso) ||
    state.favoriteUpcomingEvent ||
    null;
  const above = row ? table.find((r) => Number(r.intRank) === Number(row.intRank) - 1) : null;
  const below = row ? table.find((r) => Number(r.intRank) === Number(row.intRank) + 1) : null;
  return [
    {
      title: "Next Up",
      text: todayEvent
        ? `${scoreLine(todayEvent)} • ${eventState(todayEvent).label}`
        : nextEvent
          ? `${team.strTeam} vs ${nextEvent.strHomeTeam === team.strTeam ? nextEvent.strAwayTeam : nextEvent.strHomeTeam} on ${formatDateTime(nextEvent.dateEvent, nextEvent.strTime)}`
          : "No upcoming fixture found.",
    },
    {
      title: "Table Pulse",
      text: row
        ? `${team.strTeam} are ${ordinalSuffix(row.intRank)} with ${row.intPoints || 0} pts (GD ${row.intGoalDifference || 0}).`
        : "League position data unavailable right now.",
    },
    {
      title: "Rival Watch",
      text: row
        ? `${above ? `${above.strTeam} ahead on ${above.intPoints} pts.` : "Top of the table."} ${below ? `${below.strTeam} behind on ${below.intPoints} pts.` : "No team below."}`
        : "Set a favourite team to unlock rival insights.",
    },
  ];
}

function renderStoryCardsPanel() {
  if (!el.storyList) return;
  if (state.favoriteDataLoading) {
    el.storyList.innerHTML = "";
    for (let i = 0; i < 3; i += 1) {
      const item = document.createElement("article");
      item.className = "story-item story-skeleton";
      item.innerHTML = `
        <span class="skeleton-line w-40"></span>
        <span class="skeleton-line w-90"></span>
        <span class="skeleton-line w-65"></span>
      `;
      el.storyList.appendChild(item);
    }
    return;
  }
  const cards = storyCardData();
  el.storyList.innerHTML = "";
  if (!cards.length) {
    el.storyList.innerHTML = `<div class="empty">Choose a favourite team to unlock story cards.</div>`;
    return;
  }
  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "story-item";
    item.innerHTML = `<h5>${escapeHtml(card.title)}</h5><p>${escapeHtml(card.text)}</p>`;
    el.storyList.appendChild(item);
  });
}

async function joinFamilyLeagueCode(code) {
  ensureFamilyLeagueState();
  if (!accountSignedIn()) {
    setAccountStatus("Sign in to join a family league code.", true);
    return;
  }
  const clean = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!clean) return;
  await apiRequest("POST", `${API_PROXY_BASE}/v1/ezra/account/league/join`, { code: clean }, state.account.token);
  state.familyLeague.leagueCode = clean;
  if (!state.familyLeague.joinedLeagueCodes.includes(clean)) {
    state.familyLeague.joinedLeagueCodes.push(clean);
  }
  state.familyLeague.currentLeagueIndex = Math.max(0, state.familyLeague.joinedLeagueCodes.indexOf(clean));
  await refreshLeagueDirectory();
  persistLocalMetaState();
  scheduleCloudStateSync();
  setAccountStatus(`Joined league code ${clean}.`);
}

async function createFamilyLeagueCode() {
  if (!accountSignedIn()) {
    setAccountStatus("Sign in to create a league.", true);
    return;
  }
  const requestedName = String(el.familyLeagueNameInput?.value || "").replace(/\s+/g, " ").trim().slice(0, 48);
  const payload = requestedName ? { name: requestedName } : {};
  const data = await apiRequest("POST", `${API_PROXY_BASE}/v1/ezra/account/league/create`, payload, state.account.token);
  const code = String(data?.code || "").trim().toUpperCase();
  if (!code) return;
  state.familyLeague.leagueCode = code;
  if (!state.familyLeague.joinedLeagueCodes.includes(code)) {
    state.familyLeague.joinedLeagueCodes.push(code);
  }
  state.familyLeague.currentLeagueIndex = Math.max(0, state.familyLeague.joinedLeagueCodes.indexOf(code));
  await refreshLeagueDirectory();
  persistLocalMetaState();
  scheduleCloudStateSync();
  setAccountStatus(`League created: ${code}${data?.name ? ` (${data.name})` : ""}`);
}

async function refreshLeagueDirectory() {
  ensureFamilyLeagueState();
  state.leagueDirectory.loading = true;
  const prevItems = Array.isArray(state.leagueDirectory.items) ? [...state.leagueDirectory.items] : [];
  const prevCodes = Array.isArray(state.familyLeague.joinedLeagueCodes) ? [...state.familyLeague.joinedLeagueCodes] : [];
  const prevCode = String(state.familyLeague.leagueCode || "").toUpperCase();
  const prevIdx = Number.isInteger(state.familyLeague.currentLeagueIndex) ? state.familyLeague.currentLeagueIndex : 0;
  try {
    let nextItems = prevItems;
    let nextCodes = prevCodes;
    let nextCode = prevCode;
    let nextIdx = prevIdx;

    if (accountSignedIn()) {
      const data = await apiRequest("GET", `${API_PROXY_BASE}/v1/ezra/account/leagues`, null, state.account.token);
      const leagues = Array.isArray(data?.leagues) ? data.leagues : [];
      const codes = leagues.map((league) => String(league.code || "").toUpperCase()).filter(Boolean);
      nextItems = leagues;
      if (codes.length) {
        nextCodes = codes;
        const current = nextCode;
        if (!current || !codes.includes(current)) {
          nextCode = codes[0];
        }
        nextIdx = Math.max(0, codes.indexOf(nextCode));
      } else {
        nextCodes = [];
        nextCode = "";
        nextIdx = 0;
      }
    } else {
      const codes = Array.from(
        new Set(
          [nextCode, ...nextCodes]
            .map((code) => String(code || "").trim().toUpperCase())
            .filter(Boolean)
        )
      );
      const leagues = [];
      for (const code of codes) {
        const data = await safeLoad(
          () => apiRequest("GET", `${API_PROXY_BASE}/v1/ezra/account/league/standings?code=${encodeURIComponent(code)}`),
          null
        );
        if (!data?.league) continue;
        leagues.push({
          code: String(data.league.code || code).toUpperCase(),
          name: data.league.name || `League ${code}`,
          ownerUserId: data.league.ownerUserId || "",
          isOwner: false,
          memberCount: Number(data.league.memberCount || 0),
          standings: Array.isArray(data.standings) ? data.standings : [],
        });
      }
      nextItems = leagues;
      if (leagues.length) {
        const discoveredCodes = leagues.map((league) => String(league.code || "").toUpperCase()).filter(Boolean);
        nextCodes = discoveredCodes;
        const current = nextCode;
        if (!current || !discoveredCodes.includes(current)) {
          nextCode = discoveredCodes[0];
        }
        nextIdx = Math.max(0, discoveredCodes.indexOf(nextCode));
      }
    }

    state.leagueDirectory.items = nextItems;
    state.familyLeague.joinedLeagueCodes = nextCodes;
    state.familyLeague.leagueCode = nextCode;
    state.familyLeague.currentLeagueIndex = nextIdx;
    state.lastLeagueDirectoryAt = Date.now();
  } catch (err) {
    state.leagueDirectory.items = prevItems;
    state.familyLeague.joinedLeagueCodes = prevCodes;
    state.familyLeague.leagueCode = prevCode;
    state.familyLeague.currentLeagueIndex = prevIdx;
    setAccountStatus(`League sync issue: ${err.message || "using last known standings."}`, true);
    return false;
  } finally {
    state.leagueDirectory.loading = false;
  }
  return true;
}

function cycleLeague(delta) {
  ensureFamilyLeagueState();
  const codes = state.familyLeague.joinedLeagueCodes || [];
  if (!codes.length) return;
  const currentIdx = Number.isInteger(state.familyLeague.currentLeagueIndex) ? state.familyLeague.currentLeagueIndex : 0;
  const nextIdx = (currentIdx + delta + codes.length) % codes.length;
  state.familyLeague.currentLeagueIndex = nextIdx;
  state.familyLeague.leagueCode = codes[nextIdx];
  persistLocalMetaState();
  renderFamilyLeaguePanel();
}

function currentSelectedLeagueRecord() {
  const code = String(state.familyLeague.leagueCode || "").toUpperCase();
  if (!code) return null;
  return (state.leagueDirectory.items || []).find((league) => String(league.code || "").toUpperCase() === code) || null;
}

function closeLeagueMemberView() {
  state.leagueMemberView.open = false;
  state.leagueMemberView.loading = false;
  state.leagueMemberView.error = "";
  state.leagueMemberView.data = null;
  state.leagueMemberView.compare = false;
  if (el.leagueMemberPanel) {
    el.leagueMemberPanel.classList.add("hidden");
  }
  document.body.classList.remove("league-member-overlay-open");
}

function leagueMemberDreamTeamSummary(dreamTeam) {
  if (!dreamTeam || typeof dreamTeam !== "object") {
    return {
      formation: "--",
      xi: [],
      bench: [],
      manager: null,
      coaches: [],
    };
  }
  const pool = Array.isArray(dreamTeam.pool) ? dreamTeam.pool : [];
  const poolMap = new Map(pool.map((player) => [player?.key, player]).filter(([key]) => Boolean(key)));
  const xiKeys = Array.isArray(dreamTeam.startingXI) ? dreamTeam.startingXI.filter(Boolean) : [];
  const benchKeys = Array.isArray(dreamTeam.bench) ? dreamTeam.bench.filter(Boolean) : [];
  const xi = xiKeys.map((key) => poolMap.get(key)).filter(Boolean);
  const bench = benchKeys.map((key) => poolMap.get(key)).filter(Boolean);
  const manager = dreamTeam.staff?.manager || null;
  const coaches = Array.isArray(dreamTeam.staff?.coaches) ? dreamTeam.staff.coaches : [];
  return {
    formation: dreamTeam.formation || "--",
    poolMap,
    xiKeys,
    benchKeys,
    xi,
    bench,
    manager,
    coaches,
  };
}

function memberDreamSlots(summary, slotCount = 11) {
  const slots = new Array(slotCount).fill(null);
  if (!summary?.xiKeys?.length || !summary?.poolMap) return slots;
  for (let i = 0; i < Math.min(slotCount, summary.xiKeys.length); i += 1) {
    const key = summary.xiKeys[i];
    slots[i] = key ? summary.poolMap.get(key) || null : null;
  }
  return slots;
}

function renderMiniPitchHtml(summary, heading) {
  const rowDefs = visualFormationRows(summary?.formation || "4-3-3");
  const slots = memberDreamSlots(summary, 11);
  let cursor = 0;
  const lanes = rowDefs
    .map((rowDef) => {
      const cells = [];
      for (let i = 0; i < rowDef.count; i += 1) {
        const player = slots[cursor] || null;
        cursor += 1;
        cells.push(
          player
            ? `
              <div class="member-pitch-slot filled" title="${escapeHtml(player.name || "Player")}">
                <span class="member-pitch-avatar-ring">
                  <img class="member-pitch-avatar ${player.image ? "" : "hidden"}" src="${player.image || ""}" alt="${escapeHtml(player.name || "Player")} cutout" />
                  <span class="member-pitch-avatar-fallback ${player.image ? "hidden" : ""}">${escapeHtml((player.name || "?").slice(0, 1))}</span>
                  <img class="member-pitch-badge ${player.teamBadge ? "" : "hidden"}" src="${player.teamBadge || ""}" alt="${escapeHtml(player.teamName || "Club")} badge" />
                </span>
                <span class="member-pitch-name">${escapeHtml(player.name || "Unknown")}</span>
              </div>
            `
            : `<div class="member-pitch-slot"><span class="member-pitch-empty">Empty</span></div>`
        );
      }
      return `<div class="member-pitch-lane" style="grid-template-columns: repeat(${Math.max(1, rowDef.count)}, minmax(0, 1fr));">${cells.join("")}</div>`;
    })
    .join("");

  const benchHtml = (summary?.bench || [])
    .slice(0, 7)
    .map((player) => `<span class="member-bench-pill">${escapeHtml(player.name || "Unknown")}</span>`)
    .join("");

  return `
    <article class="member-team-card">
      <div class="member-team-head">
        <h5>${escapeHtml(heading)}</h5>
        <span class="member-formation-pill">${escapeHtml(summary?.formation || "--")}</span>
      </div>
      <div class="member-pitch-wrap">${lanes}</div>
      <div class="member-bench-wrap">
        <span class="muted">Bench</span>
        <div class="member-bench-list">${benchHtml || '<span class="muted">No bench selected</span>'}</div>
      </div>
      <div class="member-staff-line">
        <span class="muted">Manager:</span>
        <span>${escapeHtml(summary?.manager?.name || "None")}</span>
      </div>
    </article>
  `;
}

function predictionOutcomeLabel(entry) {
  const awarded = Number(entry?.pick?.awarded || 0);
  const settled = Boolean(entry?.settled);
  if (!settled) return { text: "Pending", cls: "pending" };
  if (awarded >= 2) return { text: "Perfect", cls: "perfect" };
  if (awarded === 1) return { text: "Result", cls: "result" };
  return { text: "Miss", cls: "miss" };
}

function predictionJoinKey(item) {
  if (!item || typeof item !== "object") return "";
  const id = String(item.eventId || item.idEvent || "").trim();
  if (id) return `id:${id}`;
  const home = String(item.homeTeam || "").trim().toLowerCase();
  const away = String(item.awayTeam || "").trim().toLowerCase();
  const kickoff = String(item.kickoff || "").trim();
  if (!home || !away || !kickoff) return "";
  return `fx:${home}|${away}|${kickoff}`;
}

function currentUserPredictionsSnapshot() {
  const memberId = currentFamilyMemberId();
  if (!memberId) return [];
  const out = [];
  Object.values(state.familyLeague?.predictions || {}).forEach((record) => {
    if (!record || typeof record !== "object") return;
    const entry = record.entries?.[memberId];
    if (!entry) return;
    out.push({
      eventId: record.eventId || "",
      homeTeam: record.homeTeam || "",
      awayTeam: record.awayTeam || "",
      kickoff: record.kickoff || "",
      settled: Boolean(record.settled),
      finalHome: Number.isFinite(Number(record.finalHome)) ? Number(record.finalHome) : null,
      finalAway: Number.isFinite(Number(record.finalAway)) ? Number(record.finalAway) : null,
      pick: {
        home: Number.isFinite(Number(entry.home)) ? Number(entry.home) : null,
        away: Number.isFinite(Number(entry.away)) ? Number(entry.away) : null,
        awarded: Number.isFinite(Number(entry.awarded)) ? Number(entry.awarded) : 0,
      },
    });
  });
  return out.sort((a, b) => String(b.kickoff || "").localeCompare(String(a.kickoff || "")));
}

function renderPredictionCardsHtml(memberData, compareEnabled) {
  const yourList = currentUserPredictionsSnapshot();
  const yourMap = new Map(
    yourList
      .map((item) => [predictionJoinKey(item), item])
      .filter(([key]) => Boolean(key))
  );

  let merged = [];
  if (compareEnabled) {
    const themRows = (Array.isArray(memberData?.predictions) ? memberData.predictions : []).map((item) => {
      const key = predictionJoinKey(item);
      return {
        eventId: String(item.eventId || ""),
        joinKey: key,
        kickoff: item.kickoff || "",
        homeTeam: item.homeTeam || "",
        awayTeam: item.awayTeam || "",
        them: item,
        you: key ? yourMap.get(key) || null : null,
      };
    });
    const themKeys = new Set(themRows.map((row) => row.joinKey).filter(Boolean));
    const yourExtraRows = yourList
      .filter((item) => {
        const key = predictionJoinKey(item);
        return key && !themKeys.has(key);
      })
      .map((item) => ({
        eventId: String(item.eventId || ""),
        joinKey: predictionJoinKey(item),
        kickoff: item.kickoff || "",
        homeTeam: item.homeTeam || "",
        awayTeam: item.awayTeam || "",
        them: null,
        you: item,
      }));
    merged = [...themRows, ...yourExtraRows].sort((a, b) => String(b.kickoff || "").localeCompare(String(a.kickoff || "")));
  } else {
    merged = (Array.isArray(memberData?.predictions) ? memberData.predictions : []).map((item) => ({
      eventId: String(item.eventId || ""),
      joinKey: predictionJoinKey(item),
      kickoff: item.kickoff || "",
      homeTeam: item.homeTeam || "",
      awayTeam: item.awayTeam || "",
      them: item,
      you: null,
    }));
  }

  if (!merged.length) {
    return `<div class="empty">No saved predictions yet.</div>`;
  }

  return merged
    .slice(0, 36)
    .map((row) => {
      const kickoffText = row.kickoff ? new Date(row.kickoff).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "TBA";
      const finalText =
        Number.isFinite(Number(row.them?.finalHome ?? row.you?.finalHome)) && Number.isFinite(Number(row.them?.finalAway ?? row.you?.finalAway))
          ? `${Number(row.them?.finalHome ?? row.you?.finalHome)}-${Number(row.them?.finalAway ?? row.you?.finalAway)}`
          : "Pending";
      const themOutcome = predictionOutcomeLabel(row.them);
      const youOutcome = predictionOutcomeLabel(row.you);
      const themPick =
        Number.isFinite(Number(row.them?.pick?.home)) && Number.isFinite(Number(row.them?.pick?.away))
          ? `${Number(row.them.pick.home)}-${Number(row.them.pick.away)}`
          : compareEnabled
            ? "No pick"
            : "--";
      const youPick =
        Number.isFinite(Number(row.you?.pick?.home)) && Number.isFinite(Number(row.you?.pick?.away))
          ? `${Number(row.you.pick.home)}-${Number(row.you.pick.away)}`
          : compareEnabled
            ? "No pick"
            : "--";
      return `
        <article class="member-pred-card">
          <header>
            <h5>${escapeHtml(row.homeTeam || "Home")} vs ${escapeHtml(row.awayTeam || "Away")}</h5>
            <span class="muted">${escapeHtml(kickoffText)}</span>
          </header>
          <div class="member-pred-final">Final: <strong>${escapeHtml(finalText)}</strong></div>
          <div class="member-pred-compare ${compareEnabled ? "two" : "one"}">
            <div class="member-pred-side">
              <span class="member-pred-label">Them</span>
              <span class="member-pred-score">${escapeHtml(themPick)}</span>
              <span class="member-pred-outcome ${themOutcome.cls}">${themOutcome.text}</span>
            </div>
            ${
              compareEnabled
                ? `
              <div class="member-pred-side">
                <span class="member-pred-label">You</span>
                <span class="member-pred-score">${escapeHtml(youPick)}</span>
                <span class="member-pred-outcome ${youOutcome.cls}">${youOutcome.text}</span>
              </div>
            `
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderLeagueMemberView() {
  if (!el.leagueMemberPanel || !el.leagueMemberBody || !el.leagueMemberTitle) return;
  const view = state.leagueMemberView;
  if (!view.open) {
    el.leagueMemberPanel.classList.add("hidden");
    document.body.classList.remove("league-member-overlay-open");
    return;
  }
  el.leagueMemberPanel.classList.remove("hidden");
  document.body.classList.add("league-member-overlay-open");

  if (view.loading) {
    el.leagueMemberTitle.textContent = "Loading profile...";
    el.leagueMemberBody.innerHTML = `<div class="empty">Loading member details...</div>`;
    return;
  }
  if (view.error) {
    el.leagueMemberTitle.textContent = "Member profile";
    el.leagueMemberBody.innerHTML = `<div class="error">${escapeHtml(view.error)}</div>`;
    return;
  }
  const data = view.data;
  if (!data) {
    el.leagueMemberTitle.textContent = "Member profile";
    el.leagueMemberBody.innerHTML = `<div class="empty">No member data available.</div>`;
    return;
  }

  const memberName = data?.user?.name || "User";
  const isSelf = String(data?.user?.id || "") === String(state.account.user?.id || "");
  const compareAvailable = !isSelf;
  const compareEnabled = Boolean(state.leagueMemberView.compare && compareAvailable);
  el.leagueMemberTitle.textContent = `${memberName} • Profile`;
  const dream = leagueMemberDreamTeamSummary(data.dreamTeam);
  const myDream = leagueMemberDreamTeamSummary(state.dreamTeam);
  const predictionsHtml = renderPredictionCardsHtml(data, compareEnabled);

  el.leagueMemberBody.innerHTML = `
    <div class="member-compare-sticky">
      <button
        id="member-compare-toggle"
        class="member-compare-toggle-btn ${compareEnabled ? "on" : "off"} ${compareAvailable ? "" : "disabled"}"
        type="button"
        ${compareAvailable ? "" : "disabled"}
        title="${compareAvailable ? "Compare this user against your own picks and Dream Team" : "You are viewing your own profile"}"
      >
        ${compareEnabled ? "Compare: ON" : "Compare: OFF"}
      </button>
    </div>
    <section class="member-view-group">
      <h4>Score Predictions</h4>
      <div class="member-pred-grid">${predictionsHtml}</div>
    </section>
    <section class="member-view-group">
      <h4>Dream Team</h4>
      <div class="member-team-compare ${compareEnabled ? "two" : "one"}">
        ${renderMiniPitchHtml(dream, compareEnabled ? "Them" : `${memberName}`)}
        ${compareEnabled ? renderMiniPitchHtml(myDream, "You") : ""}
      </div>
    </section>
  `;
  const compareToggle = el.leagueMemberBody.querySelector("#member-compare-toggle");
  if (compareToggle) {
    compareToggle.addEventListener("click", () => {
      if (!compareAvailable) return;
      state.leagueMemberView.compare = !state.leagueMemberView.compare;
      renderLeagueMemberView();
    });
  }
}

async function openLeagueMemberView(userId, displayName) {
  const currentLeague = currentSelectedLeagueRecord();
  const code = String(currentLeague?.code || state.familyLeague.leagueCode || "").toUpperCase();
  if (!accountSignedIn() || !code || !userId) return;
  if (state.dreamTeamOpen) {
    state.dreamTeamOpen = false;
    state.dreamSwapActiveKey = "";
    renderDreamTeamNavState();
    requestDreamTeamRender();
  }
  state.leagueMemberView.open = true;
  state.leagueMemberView.loading = true;
  state.leagueMemberView.error = "";
  state.leagueMemberView.compare = false;
  state.leagueMemberView.data = { user: { name: displayName || "User" }, predictions: [], dreamTeam: null };
  renderLeagueMemberView();
  try {
    const query = `?code=${encodeURIComponent(code)}&userId=${encodeURIComponent(userId)}`;
    const payload = await apiRequest("GET", `${API_PROXY_BASE}/v1/ezra/account/league/member${query}`, null, state.account.token);
    state.leagueMemberView.loading = false;
    state.leagueMemberView.data = payload || null;
    renderLeagueMemberView();
  } catch (err) {
    state.leagueMemberView.loading = false;
    state.leagueMemberView.error = err.message || "Unable to load member profile.";
    renderLeagueMemberView();
  }
}

async function updateFamilyLeagueName(nextName) {
  if (!accountSignedIn()) {
    setAccountStatus("Sign in to update league name.", true);
    return;
  }
  const currentLeague = currentSelectedLeagueRecord();
  if (!currentLeague) return;
  if (!currentLeague.isOwner) {
    setAccountStatus("Only league owner can set the league name.", true);
    return;
  }
  const clean = String(nextName || "").replace(/\s+/g, " ").trim().slice(0, 48);
  if (!clean) {
    setAccountStatus("League name cannot be empty.", true);
    return;
  }
  await apiRequest(
    "PUT",
    `${API_PROXY_BASE}/v1/ezra/account/league/name`,
    { code: currentLeague.code, name: clean },
    state.account.token
  );
  await refreshLeagueDirectory();
  renderFamilyLeaguePanel();
  setAccountStatus(`League renamed to ${clean}.`);
}

function renderFamilyLeaguePanel() {
  if (!el.familyMembers || !el.familyCodeLabel) return;
  ensureFamilyLeagueState();
  updateFamilyControlsState();
  if (accountSignedIn()) {
    ensureSignedInUserInFamilyLeague();
  }
  const code = String(state.familyLeague.leagueCode || "").toUpperCase();
  const joinedCount = Array.isArray(state.familyLeague.joinedLeagueCodes) ? state.familyLeague.joinedLeagueCodes.length : 0;
  const currentPos = joinedCount ? state.familyLeague.currentLeagueIndex + 1 : 0;
  const currentLeague = currentSelectedLeagueRecord();
  const leagueName = String(currentLeague?.name || "").trim() || `League ${code || "--"}`;
  const myPointsText = accountSignedIn()
    ? ` • Your points: ${Number(state.familyLeague.personalPoints || 0)}`
    : "";
  el.familyCodeLabel.textContent = `League ${currentPos}/${joinedCount || 1}: ${leagueName} (${code || "--"})${myPointsText}`;
  const isOwner = Boolean(currentLeague?.isOwner);
  if (el.familyLeagueNameInput) {
    el.familyLeagueNameInput.value = leagueName;
    el.familyLeagueNameInput.disabled = !accountSignedIn() || !code || !isOwner;
    el.familyLeagueNameInput.title = isOwner ? "Set league name" : "Only league owner can rename this league";
  }
  if (el.familyLeagueNameSaveBtn) {
    el.familyLeagueNameSaveBtn.disabled = !accountSignedIn() || !code || !isOwner;
    el.familyLeagueNameSaveBtn.title = isOwner ? "Save league name" : "Only league owner can rename this league";
  }
  if (el.familyPrevLeagueBtn) el.familyPrevLeagueBtn.disabled = !accountSignedIn() || joinedCount < 2;
  if (el.familyNextLeagueBtn) el.familyNextLeagueBtn.disabled = !accountSignedIn() || joinedCount < 2;
  el.familyMembers.innerHTML = "";
  const standings = Array.isArray(currentLeague?.standings) ? currentLeague.standings : [];
  if (state.leagueDirectory.loading) {
    el.familyMembers.innerHTML = `<div class="empty">Loading league standings...</div>`;
    return;
  }
  if (!code) {
    el.familyMembers.innerHTML = `<div class="empty">${accountSignedIn() ? "Create or join a league code to start." : "Sign in to create or join a league code."}</div>`;
    return;
  }
  if (!standings.length) {
    el.familyMembers.innerHTML = `<div class="empty">No members found for this league yet.</div>`;
    return;
  }
  standings.forEach((member, index) => {
    const isSignedInMember = String(member.user_id || "") === String(state.account.user?.id || "");
    const row = document.createElement("div");
    row.className = `family-row ${isSignedInMember ? "active" : ""}`;
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.innerHTML = `
      <div class="mission-text">
        <div class="mission-title">#${index + 1} ${escapeHtml(member.name || "User")}</div>
        <div class="mission-sub">Points: ${Number(member.points || 0)}${isSignedInMember ? " • You" : ""} • Tap to view profile</div>
      </div>
      <div class="account-actions">
        <span class="family-points">${Number(member.points || 0)}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      openLeagueMemberView(String(member.user_id || ""), member.name || "User");
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openLeagueMemberView(String(member.user_id || ""), member.name || "User");
    });
    el.familyMembers.appendChild(row);
  });
}

function formatDashboardDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const ACHIEVEMENT_GUIDE = [
  { code: "streak_3", name: "On Fire", description: "Complete quests 3 days in a row.", icon: "🔥" },
  { code: "streak_7", name: "Unstoppable", description: "Complete quests 7 days in a row.", icon: "🏆" },
  { code: "combo_3", name: "Prediction Combo", description: "Hit 3 correct outcomes in a row.", icon: "⚡" },
  { code: "exact_10", name: "Sniper", description: "Get 10 exact score predictions.", icon: "🎯" },
  { code: "mastery_25", name: "Team Analyst", description: "Make 25 predictions for one club.", icon: "📈" },
];

function renderChallengeDashboardPanels() {
  if (!el.challengeStreak || !el.challengeCombo || !el.challengeMastery || !el.challengeAchievements) return;
  const loading = accountSignedIn() && !state.challengeDashboard;
  const dash = state.challengeDashboard || null;
  const progress = dash?.progress || {};
  const achievements = Array.isArray(dash?.achievements) ? dash.achievements : [];
  const mastery = Array.isArray(dash?.teamMastery) ? dash.teamMastery : [];
  const seasonRows = Array.isArray(dash?.currentSeason?.standings) ? dash.currentSeason.standings : [];
  const mySeasonPoints = Number(
    seasonRows.find((row) => String(row?.user_id || "") === String(state.account.user?.id || ""))?.points || 0
  );

  if (!accountSignedIn()) {
    el.challengeStreak.innerHTML = `<p class="muted">Sign in to track your streak and weekly points.</p>`;
    el.challengeCombo.innerHTML = `<p class="muted">Sign in to unlock combo scoring and multipliers.</p>`;
    el.challengeMastery.innerHTML = `<p class="muted">Sign in to track team-by-team prediction performance.</p>`;
    el.challengeAchievements.innerHTML = `<p class="muted">Sign in to unlock and save achievements.</p>`;
    return;
  }

  if (loading) {
    const skeleton = `
      <div class="challenge-skeleton">
        <span class="skeleton-line w-35"></span>
        <span class="skeleton-line w-80"></span>
        <span class="skeleton-line w-60"></span>
      </div>
    `;
    el.challengeStreak.innerHTML = skeleton;
    el.challengeCombo.innerHTML = skeleton;
    el.challengeMastery.innerHTML = skeleton;
    el.challengeAchievements.innerHTML = skeleton;
    return;
  }

  const currentStreak = Number(progress.currentStreak || 0);
  const bestStreak = Number(progress.bestStreak || 0);
  const comboCount = Number(progress.comboCount || 0);
  const bestCombo = Math.max(1, Number(progress.bestCombo || 1));

  el.challengeStreak.innerHTML = `
    <div class="challenge-stat-row">
      <span class="challenge-stat-pill">${currentStreak}d</span>
      <div class="challenge-stat-copy">
        <p class="challenge-stat-title">Current streak</p>
        <p class="challenge-stat-sub">Best ${bestStreak}d • Season ${mySeasonPoints} pts</p>
      </div>
    </div>
    <p class="challenge-footnote">Last quest: ${formatDashboardDate(progress.lastQuestDate)}</p>
  `;

  el.challengeCombo.innerHTML = `
    <div class="challenge-stat-row">
      <span class="challenge-stat-pill">x${Math.max(1, comboCount)}</span>
      <div class="challenge-stat-copy">
        <p class="challenge-stat-title">Current combo</p>
        <p class="challenge-stat-sub">Best x${bestCombo}</p>
      </div>
    </div>
    <p class="challenge-footnote">Combo boosts prediction points on active runs.</p>
  `;

  const topMastery = mastery.slice(0, 4);
  if (!topMastery.length) {
    el.challengeMastery.innerHTML = `<p class="muted">No mastery data yet. Make score predictions to populate this card.</p>`;
  } else {
    el.challengeMastery.innerHTML = `
      <ul class="challenge-list">
        ${topMastery
          .map((row) => {
            const played = Number(row.pred_count || 0);
            const exact = Number(row.exact_correct || 0);
            const result = Number(row.result_correct || 0);
            return `<li><span>${escapeHtml(row.team_name || "Team")}</span><span>${exact}/${result}/${played}</span></li>`;
          })
          .join("")}
      </ul>
      <p class="challenge-footnote">Format: exact/result/played</p>
    `;
  }

  const earnedCodes = new Set(achievements.map((item) => String(item?.code || "")));
  const unlocked = ACHIEVEMENT_GUIDE.filter((item) => earnedCodes.has(item.code));
  const locked = ACHIEVEMENT_GUIDE.filter((item) => !earnedCodes.has(item.code));
  const recent = unlocked.length ? unlocked : [];
  el.challengeAchievements.innerHTML = `
    <p class="challenge-footnote">Unlocked ${unlocked.length}/${ACHIEVEMENT_GUIDE.length}</p>
    <ul class="challenge-achievement-list">
      ${recent
        .map(
          (item) => `
            <li>
              <span class="challenge-achievement-icon">${escapeHtml(item.icon || "★")}</span>
              <span class="challenge-achievement-text">
                <strong>${escapeHtml(item.name || "Achievement")}</strong>
                <small>${escapeHtml(item.description || "")}</small>
              </span>
            </li>
          `
        )
        .join("")}
      ${locked
        .map(
          (item) => `
            <li class="locked">
              <span class="challenge-achievement-icon">${escapeHtml(item.icon || "★")}</span>
              <span class="challenge-achievement-text">
                <strong>${escapeHtml(item.name || "Achievement")} (locked)</strong>
                <small>${escapeHtml(item.description || "")}</small>
              </span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderHigherLowerPanel() {
  if (!el.higherLowerBody || !el.higherLowerStartBtn) return;
  const game = state.higherLower;
  const favorite = getTeamById(state.favoriteTeamId) || state.favoriteTeam;
  const sourceLabel = favorite?.strTeam
    ? `${favorite.strTeam} players`
    : "Premier League + Championship players";
  el.higherLowerStartBtn.disabled = game.loading;
  el.higherLowerStartBtn.textContent = game.active ? "Restart Game" : game.completed ? "Play Again" : "Start 10-Question Game";
  el.higherLowerBody.innerHTML = "";

  if (game.loading) {
    el.higherLowerBody.innerHTML = `
      <div class="challenge-skeleton">
        <span class="skeleton-line w-40"></span>
        <span class="skeleton-line w-75"></span>
        <span class="skeleton-line w-60"></span>
      </div>
    `;
    return;
  }

  if (game.error) {
    el.higherLowerBody.innerHTML = `<div class="empty">${escapeHtml(game.error)}</div>`;
    return;
  }

  if (!game.active && !game.completed) {
    el.higherLowerBody.innerHTML = `<p class="muted">10 questions. Pick whether the bottom player has more or fewer current-season goals than the top player. Source: ${escapeHtml(sourceLabel)}.</p>`;
    return;
  }

  if (game.completed) {
    el.higherLowerBody.innerHTML = `
      <div class="higher-lower-status">
        <span class="family-points">Final Score ${game.correct}/${game.total}</span>
      </div>
      <p class="muted">Great run. Start again for a new random set.</p>
    `;
    return;
  }

  const top = game.top;
  const bottom = game.bottom;
  if (!top || !bottom) {
    el.higherLowerBody.innerHTML = `<div class="empty">Unable to load players for this round.</div>`;
    return;
  }

  el.higherLowerBody.innerHTML = `
    <div class="higher-lower-status">
      <span class="family-points">Q ${Math.min(game.asked + 1, game.total)}/${game.total}</span>
      <span class="family-points">Score ${game.correct}</span>
      ${game.feedback ? `<span class="family-points ${game.feedbackMode === "correct" ? "hl-correct" : "hl-wrong"}">${escapeHtml(game.feedback)}</span>` : ""}
    </div>
    <div class="higher-lower-player top">
      <img class="higher-lower-cutout ${top.image ? "" : "hidden"}" src="${top.image || ""}" alt="${escapeHtml(top.name)} cutout" />
      <div class="higher-lower-meta">
        <strong>${escapeHtml(top.name)}</strong>
        <span>#${escapeHtml(top.number || "—")} • ${top.goals} goals</span>
      </div>
    </div>
    <div class="higher-lower-controls">
      <button class="btn higher-lower-arrow up" type="button" data-hl="up" aria-label="Bottom player has more goals">▲</button>
      <button class="btn higher-lower-arrow down" type="button" data-hl="down" aria-label="Bottom player has fewer goals">▼</button>
    </div>
    <div class="higher-lower-player bottom">
      <img class="higher-lower-cutout ${bottom.image ? "" : "hidden"}" src="${bottom.image || ""}" alt="${escapeHtml(bottom.name)} cutout" />
      <div class="higher-lower-meta">
        <strong>${escapeHtml(bottom.name)}</strong>
        <span>#${escapeHtml(bottom.number || "—")}</span>
      </div>
    </div>
  `;

  [...el.higherLowerBody.querySelectorAll("button[data-hl]")].forEach((btn) => {
    btn.addEventListener("click", () => {
      handleHigherLowerAnswer(btn.dataset.hl === "up" ? "up" : "down");
    });
  });
}

function renderFunZone() {
  if (el.funZoneBody) {
    el.funZoneBody.classList.remove("hidden");
  }
  renderMissionsPanel();
  renderStoryCardsPanel();
  renderFamilyLeaguePanel();
  renderChallengeDashboardPanels();
  renderHigherLowerPanel();
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

function relativeLuminanceFromRgb({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const l1 = relativeLuminanceFromRgb(a);
  const l2 = relativeLuminanceFromRgb(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureTextContrast(foreground, background, minRatio = 4.5) {
  const fg = normalizeHexColor(foreground);
  const bg = normalizeHexColor(background);
  if (!fg || !bg) return fg || background || "#FFE4BE";
  if (contrastRatio(fg, bg) >= minRatio) return fg;

  for (let i = 1; i <= 10; i += 1) {
    const towardWhite = blendHex(fg, "#FFFFFF", i / 10);
    if (contrastRatio(towardWhite, bg) >= minRatio) return towardWhite;
  }

  for (let i = 1; i <= 10; i += 1) {
    const towardBlack = blendHex(fg, "#000000", i / 10);
    if (contrastRatio(towardBlack, bg) >= minRatio) return towardBlack;
  }

  return contrastRatio("#FFF1DA", bg) >= contrastRatio("#101010", bg) ? "#FFF1DA" : "#101010";
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
  const textBase = tintHex(primary, 0.22);
  const text = ensureTextContrast(textBase, panel, 4.8);
  const textSoftBase = blendHex(text, secondary, 0.24);
  const textSoft = ensureTextContrast(textSoftBase, panel, 3.4);

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
  el.playerDvdLayer.classList.remove("quiz-active");
  document.body.classList.remove("player-quiz-open");
  if (el.playerDvdAvatar) {
    el.playerDvdAvatar.classList.remove("quiz-fade");
    el.playerDvdAvatar.classList.remove("hidden");
  }
  if (el.playerQuizFocus) {
    el.playerQuizFocus.classList.add("hidden");
    el.playerQuizFocus.classList.remove("active", "answer-correct", "answer-wrong");
  }
  if (el.playerQuizFocusImage) {
    el.playerQuizFocusImage.src = "";
    el.playerQuizFocusImage.alt = "";
  }
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

async function fetchPlayerProfile(playerId) {
  if (!playerId) return null;
  const data = await apiGetV1(`lookupplayer.php?id=${encodeURIComponent(playerId)}`);
  const rows = firstArrayValue(data);
  return rows?.[0] || null;
}

function selectCutoutPlayer(players) {
  const valid = (players || [])
    .map((p) => ({
      id: p?.idPlayer || "",
      name: p?.strPlayer || "",
      image: p?.strCutout || "",
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
    image: raw.strCutout || "",
    teamId: team?.idTeam || "",
    teamName: team?.strTeam || raw.strTeam || "",
    teamBadge: team?.strBadge || state.teamBadgeMap[team?.strTeam || ""] || "",
  };
}

function extractPlayerGoals(raw = {}) {
  const candidates = [
    raw.intGoals,
    raw.strGoals,
    raw.intSeasonGoals,
    raw.strSeasonGoals,
    raw.intSoccerXMLTotalGoals,
    raw.intSoccerXMLGoals,
    raw.intGoal,
    raw.strGoal,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function normalizeHigherLowerPlayer(raw, team) {
  if (!raw) return null;
  const base = normalizeSquadPlayer(raw, team);
  if (!base || !base.name) return null;
  return {
    ...base,
    image: base.image || raw.strThumb || "",
    goals: extractPlayerGoals(raw),
  };
}

function higherLowerPoolKey() {
  const favorite = getTeamById(state.favoriteTeamId) || state.favoriteTeam;
  if (favorite?.idTeam) return `team:${favorite.idTeam}`;
  return "all-leagues";
}

async function buildHigherLowerPool() {
  const favorite = getTeamById(state.favoriteTeamId) || state.favoriteTeam;
  const teams = favorite ? [favorite] : shuffleList(allLeagueTeams()).slice(0, 6);
  const poolByKey = new Map();
  const hydrateFromTeams = async (teamsToUse) => {
    for (const team of teamsToUse) {
      const rows = await fetchPlayersForTeam(team);
      const normalized = rows
        .map((raw) => normalizeHigherLowerPlayer(raw, team))
        .filter((player) => player && player.name && player.image);
      const unresolved = normalized.filter((player) => player.goals === null && player.idPlayer).slice(0, 8);
      if (unresolved.length) {
        const profiles = await Promise.all(
          unresolved.map((player) => safeLoad(() => fetchPlayerProfile(player.idPlayer), null))
        );
        unresolved.forEach((player, idx) => {
          const goals = extractPlayerGoals(profiles[idx] || {});
          if (goals !== null) player.goals = goals;
        });
      }
      normalized
        .filter((player) => player.goals !== null)
        .forEach((player) => {
          if (!poolByKey.has(player.key)) poolByKey.set(player.key, player);
        });
      if (poolByKey.size >= 36) break;
    }
  };

  await hydrateFromTeams(teams);

  if (poolByKey.size < 2 && favorite) {
    await hydrateFromTeams(shuffleList(allLeagueTeams()).slice(0, 6));
  }

  return shuffleList([...poolByKey.values()]);
}

function pickHigherLowerCandidate(topPlayer, pool, usedKeys = []) {
  const used = new Set((usedKeys || []).filter(Boolean));
  const unused = pool.filter((p) => p && p.key !== topPlayer?.key && !used.has(p.key) && p.goals !== topPlayer?.goals);
  if (unused.length) return randomFrom(unused);
  const fallback = pool.filter((p) => p && p.key !== topPlayer?.key && p.goals !== topPlayer?.goals);
  return randomFrom(fallback);
}

async function startHigherLowerGame(forceRebuild = false) {
  const game = state.higherLower;
  if (game.loading) return;
  game.loading = true;
  game.error = "";
  game.feedback = "";
  game.feedbackMode = "";
  renderHigherLowerPanel();
  try {
    const key = higherLowerPoolKey();
    if (forceRebuild || game.poolKey !== key || !Array.isArray(game.pool) || game.pool.length < 2) {
      const pool = await buildHigherLowerPool();
      game.pool = pool;
      game.poolKey = key;
    }
    if (!Array.isArray(game.pool) || game.pool.length < 2) {
      throw new Error("Not enough player goal data yet. Try again in a moment.");
    }
    game.total = 10;
    game.asked = 0;
    game.correct = 0;
    game.completed = false;
    game.active = true;
    game.top = randomFrom(game.pool);
    game.usedKeys = game.top?.key ? [game.top.key] : [];
    game.bottom = pickHigherLowerCandidate(game.top, game.pool, game.usedKeys);
    if (!game.bottom) {
      throw new Error("Not enough unique player goals available.");
    }
    game.usedKeys.push(game.bottom.key);
  } catch (err) {
    game.active = false;
    game.completed = false;
    game.top = null;
    game.bottom = null;
    game.error = err?.message || "Unable to start Higher or Lower.";
  } finally {
    game.loading = false;
    renderHigherLowerPanel();
  }
}

function handleHigherLowerAnswer(direction) {
  const game = state.higherLower;
  if (!game.active || !game.top || !game.bottom) return;
  const topGoals = Number(game.top.goals || 0);
  const bottomGoals = Number(game.bottom.goals || 0);
  const relation = bottomGoals > topGoals ? "up" : bottomGoals < topGoals ? "down" : "same";
  const correct = relation === direction;
  game.asked += 1;
  if (correct) game.correct += 1;
  game.feedback = correct ? "Correct" : relation === "same" ? "Same goals" : "Wrong";
  game.feedbackMode = correct ? "correct" : "wrong";

  if (game.asked >= game.total) {
    game.active = false;
    game.completed = true;
    renderHigherLowerPanel();
    return;
  }

  const promoted = game.bottom;
  game.top = promoted;
  const nextBottom = pickHigherLowerCandidate(game.top, game.pool, game.usedKeys);
  game.bottom = nextBottom;
  if (nextBottom?.key) game.usedKeys.push(nextBottom.key);
  if (!game.bottom) {
    game.active = false;
    game.completed = true;
    game.error = "Round ended early due to limited unique goal pairs.";
  }
  renderHigherLowerPanel();
}

function formatAgeFromBirthDate(dateBorn) {
  if (!dateBorn) return "";
  const birth = new Date(dateBorn);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age > 0 ? String(age) : "";
}

function compactPlayerSummary(profile) {
  const source = profile?.strDescriptionEN || profile?.strDescriptionFR || profile?.strDescriptionDE || "";
  if (!source) return "";
  const clean = source.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const firstSentence = clean.split(". ").slice(0, 1).join(". ").trim();
  return (firstSentence || clean).slice(0, 220);
}

function positionBucket(position) {
  const role = dreamRoleFromPosition(position);
  if (role === "MGR" || role === "COACH") return "Manager";
  if (role === "GK") return "Goalkeepers";
  if (role === "DEF") return "Defenders";
  if (role === "FWD") return "Attackers";
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
  if (el.playerQuizFocus) {
    el.playerQuizFocus.classList.add("hidden");
    el.playerQuizFocus.classList.remove("active", "answer-correct", "answer-wrong");
  }
  if (el.playerQuizFocusImage) {
    el.playerQuizFocusImage.src = "";
    el.playerQuizFocusImage.alt = "";
  }
  if (el.playerDvdAvatar) {
    el.playerDvdAvatar.classList.remove("quiz-fade");
    el.playerDvdAvatar.classList.remove("hidden");
  }
  if (el.playerDvdLayer) {
    el.playerDvdLayer.classList.remove("quiz-active");
  }
  document.body.classList.remove("player-quiz-open");
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
  if (el.playerDvdLayer) {
    el.playerDvdLayer.classList.add("quiz-active");
  }
  document.body.classList.add("player-quiz-open");
  if (el.playerDvdAvatar) {
    el.playerDvdAvatar.classList.add("quiz-fade");
    setTimeout(() => {
      if (el.playerDvdAvatar) el.playerDvdAvatar.classList.add("hidden");
    }, 240);
  }
  if (el.playerQuizFocus) {
    el.playerQuizFocus.classList.remove("hidden", "answer-correct", "answer-wrong");
    el.playerQuizFocus.classList.add("active");
  }
  if (el.playerQuizFocusImage) {
    el.playerQuizFocusImage.src = player.image || "";
    el.playerQuizFocusImage.alt = `${player.name} cutout`;
  }

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
        if (el.playerQuizFocus) {
          el.playerQuizFocus.classList.remove("answer-correct");
          el.playerQuizFocus.classList.add("answer-wrong");
        }
        setTimeout(() => {
          setQuizLocked(false);
          hideQuizFeedback();
          if (el.playerQuizFocus) {
            el.playerQuizFocus.classList.remove("answer-wrong");
          }
        }, 900);
        return;
      }

      state.playerQuiz.solved.add(player.key);
      state.playerQuiz.correctCount += 1;
      registerPopQuizCorrectAnswer();
      refreshPlayerPopScoreBadge();
      setQuizFeedback("IT'S A GOAL!", "correct");
      if (el.playerQuizFocus) {
        el.playerQuizFocus.classList.remove("answer-wrong");
        el.playerQuizFocus.classList.add("answer-correct");
      }
      setTimeout(async () => {
        hidePlayerQuizCard();
        setQuizLocked(false);
        await showRandomPlayerPop(true);
      }, 1200);
    });
    el.playerQuizOptions.appendChild(btn);
  });
  hideQuizFeedback();
  setQuizLocked(false);
  el.playerQuizCard.classList.remove("hidden");
}

function saveDreamTeam() {
  normalizeDreamSelections();
  localStorage.setItem("ezra_dream_team", JSON.stringify(state.dreamTeam));
  scheduleCloudStateSync();
}

function isDreamPlayer(playerKeyValue) {
  const inPool = state.dreamTeam.pool.some((player) => player.key === playerKeyValue);
  const managerMatch = state.dreamTeam.staff.manager?.key === playerKeyValue;
  const coachMatch = state.dreamTeam.staff.coaches.some((player) => player.key === playerKeyValue);
  return inPool || managerMatch || coachMatch;
}

function dreamHasAnySelection() {
  return Boolean(
    state.dreamTeam.pool.length || state.dreamTeam.staff.manager || state.dreamTeam.staff.coaches.length
  );
}

function dreamPoolByKey() {
  return new Map((state.dreamTeam.pool || []).map((player) => [player.key, player]));
}

function getDreamPlayerByKey(key) {
  return state.dreamTeam.pool.find((player) => player.key === key) || null;
}

function normalizeDreamSelections() {
  const validPool = [];
  const seen = new Set();
  (state.dreamTeam.pool || []).forEach((player) => {
    if (!player?.key || seen.has(player.key)) return;
    const role = dreamRoleFromPosition(player.position);
    if (role === "MGR" || role === "COACH") return;
    seen.add(player.key);
    if (validPool.length < state.maxDreamTeamPlayers) validPool.push(player);
  });
  state.dreamTeam.pool = validPool;

  if (state.dreamTeam.staff.manager && !state.dreamTeam.staff.manager.key) {
    state.dreamTeam.staff.manager = null;
  }
  state.dreamTeam.staff.coaches = (state.dreamTeam.staff.coaches || []).filter((player) => player?.key);

  if (!DREAM_TEAM_FORMATIONS[state.dreamTeam.formation]) {
    state.dreamTeam.formation = "4-3-3";
  }

  const poolMap = dreamPoolByKey();
  const cleanXI = new Array(11).fill(null);
  const seenXI = new Set();
  const sourceXI = Array.isArray(state.dreamTeam.startingXI) ? state.dreamTeam.startingXI : [];
  for (let i = 0; i < Math.min(11, sourceXI.length); i += 1) {
    const key = sourceXI[i];
    if (!key || typeof key !== "string" || seenXI.has(key)) continue;
    const player = poolMap.get(key);
    if (!player) continue;
    const role = dreamRoleFromPosition(player.position);
    if (role === "MGR" || role === "COACH") continue;
    seenXI.add(key);
    cleanXI[i] = key;
  }
  state.dreamTeam.startingXI = cleanXI;
  state.dreamManualLayout = true;

  const xiKeys = new Set(cleanXI.filter(Boolean));
  const cleanBench = [];
  (state.dreamTeam.bench || []).forEach((key) => {
    if (cleanBench.length >= 7 || cleanBench.includes(key) || xiKeys.has(key)) return;
    if (!poolMap.has(key)) return;
    cleanBench.push(key);
  });
  state.dreamTeam.bench = cleanBench;
  if (state.dreamSwapActiveKey && !poolMap.has(state.dreamSwapActiveKey)) {
    state.dreamSwapActiveKey = "";
  }
  if (!state.dreamTeam.startingXI.some(Boolean)) {
    state.dreamManualLayout = true;
  }
}

function autoFillStartingXI() {
  normalizeDreamSelections();
  const candidates = sortSquadByRole(state.dreamTeam.pool).map((player) => player.key);
  const arranged = autoArrangeXIKeys(candidates);
  state.dreamTeam.startingXI = [...arranged, ...new Array(Math.max(0, 11 - arranged.length)).fill(null)];
  const xiSet = new Set(state.dreamTeam.startingXI.filter(Boolean));
  state.dreamTeam.bench = state.dreamTeam.bench.filter((key) => !xiSet.has(key)).slice(0, 7);
  state.dreamManualLayout = true;
}

function setDreamFormation(formation) {
  if (!DREAM_TEAM_FORMATIONS[formation]) return;
  state.dreamTeam.formation = formation;
  state.dreamSwapActiveKey = "";
  normalizeDreamSelections();
  autoFillStartingXI();
}

function preferredEmptyXIIndexForKey(playerKeyValue) {
  const player = getDreamPlayerByKey(playerKeyValue);
  if (!player) return -1;
  const slotRoles = formationSlotRoles(state.dreamTeam.formation);
  const desiredRole = dreamRoleFromPosition(player.position);
  for (let i = 0; i < Math.min(11, slotRoles.length); i += 1) {
    if (slotRoles[i] === desiredRole && !state.dreamTeam.startingXI[i]) return i;
  }
  return state.dreamTeam.startingXI.findIndex((key) => !key);
}

function assignPlayerToXI(playerKeyValue) {
  const player = getDreamPlayerByKey(playerKeyValue);
  if (!player) return false;
  state.dreamTeam.startingXI = state.dreamTeam.startingXI.map((key) => (key === playerKeyValue ? null : key));
  state.dreamTeam.bench = state.dreamTeam.bench.filter((key) => key !== playerKeyValue);
  if (xiFilledCount() >= 11) return false;
  const emptyIndex = preferredEmptyXIIndexForKey(playerKeyValue);
  if (emptyIndex < 0) return false;
  state.dreamTeam.startingXI[emptyIndex] = playerKeyValue;
  state.dreamManualLayout = true;
  return true;
}

function assignPlayerToBench(playerKeyValue) {
  const player = getDreamPlayerByKey(playerKeyValue);
  if (!player) return false;
  state.dreamTeam.startingXI = state.dreamTeam.startingXI.map((key) => (key === playerKeyValue ? null : key));
  state.dreamTeam.bench = state.dreamTeam.bench.filter((key) => key !== playerKeyValue);
  if (state.dreamTeam.bench.length >= 7) return false;
  state.dreamTeam.bench.push(playerKeyValue);
  state.dreamManualLayout = true;
  return true;
}

function unassignDreamPlayer(playerKeyValue) {
  if (state.dreamTeam.startingXI.includes(playerKeyValue)) {
    state.dreamManualLayout = true;
    state.dreamTeam.startingXI = state.dreamTeam.startingXI.map((key) => (key === playerKeyValue ? null : key));
  }
  state.dreamTeam.bench = state.dreamTeam.bench.filter((key) => key !== playerKeyValue);
  if (state.dreamSwapActiveKey === playerKeyValue) {
    state.dreamSwapActiveKey = "";
  }
}

function startingXIPlayersOrdered() {
  return state.dreamTeam.startingXI.map((key) => getDreamPlayerByKey(key)).filter(Boolean);
}

function xiFilledCount() {
  return state.dreamTeam.startingXI.filter(Boolean).length;
}

function startingXIPlayersBySlot(slotCount = 11) {
  const slots = new Array(slotCount).fill(null);
  const list = state.dreamTeam.startingXI || [];
  for (let i = 0; i < Math.min(slotCount, list.length); i += 1) {
    const key = list[i];
    slots[i] = key ? getDreamPlayerByKey(key) : null;
  }
  return slots;
}

function formationSlotRoles(formation = state.dreamTeam.formation) {
  const rows = visualFormationRows(formation);
  const roles = [];
  rows.forEach((row) => {
    for (let i = 0; i < row.count; i += 1) {
      roles.push(row.role);
    }
  });
  return roles.slice(0, 11);
}

function roleFromPlayerKey(key) {
  const player = getDreamPlayerByKey(key);
  return dreamRoleFromPosition(player?.position || "");
}

function autoArrangeXIKeys(keys) {
  const unique = [];
  const seen = new Set();
  (keys || []).forEach((key) => {
    if (!key || seen.has(key)) return;
    const player = getDreamPlayerByKey(key);
    if (!player) return;
    const role = dreamRoleFromPosition(player.position);
    if (role === "MGR" || role === "COACH") return;
    seen.add(key);
    unique.push(key);
  });

  const slotRoles = formationSlotRoles(state.dreamTeam.formation);
  const ordered = [];
  const used = new Set();

  slotRoles.forEach((slotRole) => {
    const next = unique.find((key) => !used.has(key) && roleFromPlayerKey(key) === slotRole);
    if (!next) return;
    used.add(next);
    ordered.push(next);
  });

  unique.forEach((key) => {
    if (ordered.length >= 11 || used.has(key)) return;
    ordered.push(key);
  });

  return ordered.slice(0, 11);
}

function dreamZoneForKey(key) {
  if (!key) return null;
  const xiIndex = state.dreamTeam.startingXI.indexOf(key);
  if (xiIndex >= 0) return { zone: "xi", index: xiIndex };
  const benchIndex = state.dreamTeam.bench.indexOf(key);
  if (benchIndex >= 0) return { zone: "bench", index: benchIndex };
  if (state.dreamTeam.pool.some((player) => player.key === key)) return { zone: "pool", index: -1 };
  return null;
}

function toggleDreamSwapActive(key) {
  state.dreamSwapActiveKey = state.dreamSwapActiveKey === key ? "" : key;
}

function commitDreamSwap(activeKey, targetKey) {
  if (!activeKey || !targetKey || activeKey === targetKey) return false;
  const activeZone = dreamZoneForKey(activeKey);
  const targetZone = dreamZoneForKey(targetKey);
  if (!activeZone || !targetZone) return false;
  if (activeZone.zone === "pool" && targetZone.zone === "pool") return false;

  if (activeZone.zone === "xi") {
    if (targetZone.zone === "xi") {
      state.dreamTeam.startingXI[activeZone.index] = targetKey;
      state.dreamTeam.startingXI[targetZone.index] = activeKey;
      return true;
    }
    if (targetZone.zone === "bench") {
      state.dreamTeam.startingXI[activeZone.index] = targetKey;
      state.dreamTeam.bench[targetZone.index] = activeKey;
      return true;
    }
    state.dreamTeam.startingXI[activeZone.index] = targetKey;
    return true;
  }

  if (activeZone.zone === "bench") {
    if (targetZone.zone === "xi") {
      state.dreamTeam.bench[activeZone.index] = targetKey;
      state.dreamTeam.startingXI[targetZone.index] = activeKey;
      return true;
    }
    if (targetZone.zone === "bench") {
      state.dreamTeam.bench[activeZone.index] = targetKey;
      state.dreamTeam.bench[targetZone.index] = activeKey;
      return true;
    }
    state.dreamTeam.bench[activeZone.index] = targetKey;
    return true;
  }

  if (targetZone.zone === "xi") {
    state.dreamTeam.startingXI[targetZone.index] = activeKey;
    return true;
  }
  if (targetZone.zone === "bench") {
    state.dreamTeam.bench[targetZone.index] = activeKey;
    return true;
  }
  return false;
}

function moveSwapActiveToXI(targetIndex = null) {
  const key = state.dreamSwapActiveKey;
  if (!key) return false;
  const activeZone = dreamZoneForKey(key);
  if (!activeZone) return false;
  if (activeZone.zone === "xi") return false;
  if (xiFilledCount() >= 11) return false;
  if (activeZone.zone === "bench") {
    state.dreamTeam.bench.splice(activeZone.index, 1);
  }
  if (Number.isInteger(targetIndex)) {
    const insertIndex = Math.max(0, Math.min(10, targetIndex));
    while (state.dreamTeam.startingXI.length < 11) {
      state.dreamTeam.startingXI.push(null);
    }
    state.dreamTeam.startingXI[insertIndex] = key;
  } else {
    const firstEmpty = state.dreamTeam.startingXI.findIndex((slot) => !slot);
    if (firstEmpty < 0) return false;
    state.dreamTeam.startingXI[firstEmpty] = key;
  }
  state.dreamManualLayout = true;
  return true;
}

function moveSwapActiveToBench(targetIndex = null) {
  const key = state.dreamSwapActiveKey;
  if (!key) return false;
  const activeZone = dreamZoneForKey(key);
  if (!activeZone) return false;
  if (activeZone.zone === "bench") return false;
  if (state.dreamTeam.bench.length >= 7) return false;
  if (activeZone.zone === "xi") {
    state.dreamTeam.startingXI[activeZone.index] = null;
    state.dreamManualLayout = true;
  }
  const maxIndex = state.dreamTeam.bench.length;
  const insertIndex = Number.isInteger(targetIndex) ? Math.max(0, Math.min(maxIndex, targetIndex)) : maxIndex;
  state.dreamTeam.bench.splice(insertIndex, 0, key);
  return true;
}

function moveSwapActiveToPool() {
  const key = state.dreamSwapActiveKey;
  if (!key) return false;
  const activeZone = dreamZoneForKey(key);
  if (!activeZone) return false;
  if (activeZone.zone === "pool") return false;
  if (activeZone.zone === "xi") {
    state.dreamTeam.startingXI[activeZone.index] = null;
    state.dreamManualLayout = true;
    return true;
  }
  if (activeZone.zone === "bench") {
    state.dreamTeam.bench.splice(activeZone.index, 1);
    return true;
  }
  return false;
}

function handleDreamSwapClick(key) {
  if (!key) return;
  if (!state.dreamSwapActiveKey) {
    toggleDreamSwapActive(key);
    requestDreamTeamRender("player");
    return;
  }
  if (state.dreamSwapActiveKey === key) {
    state.dreamSwapActiveKey = "";
    requestDreamTeamRender("player");
    return;
  }
  const activeZone = dreamZoneForKey(state.dreamSwapActiveKey);
  const targetZone = dreamZoneForKey(key);
  const swapped = commitDreamSwap(state.dreamSwapActiveKey, key);
  state.dreamSwapActiveKey = "";
  if (!swapped) {
    requestDreamTeamRender("player");
    return;
  }
  if (activeZone?.zone === "xi" || targetZone?.zone === "xi") {
    state.dreamManualLayout = true;
  }
  saveDreamTeam();
  renderDreamTeamNavState();
  renderSquadPanel();
  requestDreamTeamRender("player");
}

function renderDreamTeamNavState() {
  if (!el.dreamTeamToggleBtn) return;
  const hasPlayers = dreamHasAnySelection();
  if (el.dreamTeamCount) {
    el.dreamTeamCount.textContent = `${state.dreamTeam.pool.length}/${state.maxDreamTeamPlayers}`;
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
    state.selectedSquadPlayerKey = "";
    el.squadPanel.classList.add("hidden");
    el.squadBody.classList.add("hidden");
    el.squadToggleBtn.setAttribute("aria-expanded", "false");
    el.squadToggleBtn.textContent = "Show Squad";
    el.squadList.innerHTML = "";
    return;
  }
  const squad = state.squadByTeamId[favorite.idTeam] || [];
  if (state.selectedSquadPlayerKey && !squad.some((p) => p.key === state.selectedSquadPlayerKey)) {
    state.selectedSquadPlayerKey = "";
  }
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
    const item = document.createElement("div");
    item.className = `squad-item ${state.selectedSquadPlayerKey === player.key ? "open" : ""}`;
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
        <span class="squad-meta">${nationalityWithFlag(player.nationality)} • ${player.position}</span>
      </div>
      <button class="btn squad-star ${starOn ? "active" : ""}" type="button" aria-label="Toggle Dream Team player">${starOn ? "★" : "☆"}</button>
    `;
    const rowFxActive = state.squadGoalFx.playerKey === player.key && Number(state.squadGoalFx.until || 0) > Date.now();
    if (rowFxActive) {
      const fx = document.createElement("div");
      fx.className = "squad-goal-flash active";
      fx.setAttribute("aria-hidden", "true");
      fx.innerHTML = `
        <span class="goal-stage goal-word">GOAL!</span>
        <span class="goal-stage goal-team-name">QUEST COMPLETE</span>
        <span class="goal-stage goal-scoreline">+5 PTS</span>
      `;
      row.appendChild(fx);
    }
    row.addEventListener("click", async () => {
      const opening = state.selectedSquadPlayerKey !== player.key;
      state.selectedSquadPlayerKey = opening ? player.key : "";
      renderSquadPanel();
      if (opening) {
        onSquadPlayerExplored(player);
        renderMissionsPanel();
        renderFamilyLeaguePanel();
      }
      if (!opening || !player.idPlayer) return;
      const cached = state.playerProfileCache[player.idPlayer];
      if (cached?.loading || cached?.loaded) return;
      state.playerProfileCache[player.idPlayer] = { loading: true };
      renderSquadPanel();
      const profile = await safeLoad(() => fetchPlayerProfile(player.idPlayer), null);
      state.playerProfileCache[player.idPlayer] = { loading: false, loaded: true, profile };
      renderSquadPanel();
    });
    const starBtn = row.querySelector(".squad-star");
    starBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleDreamTeamPlayer(player);
    });
    item.appendChild(row);

    if (state.selectedSquadPlayerKey === player.key) {
      const detail = document.createElement("div");
      detail.className = "squad-detail";
      const cache = player.idPlayer ? state.playerProfileCache[player.idPlayer] : null;
      if (cache?.loading) {
        detail.innerHTML = `<p class="muted">Loading player details...</p>`;
      } else {
        const profile = cache?.profile || null;
        const age = formatAgeFromBirthDate(profile?.dateBorn);
        const ageLine = age ? `${age}` : "--";
        const height = profile?.strHeight || "--";
        const weight = profile?.strWeight || "--";
        const birthplace = profile?.strBirthLocation || "--";
        const foot = profile?.strSide || "--";
        const role = profile?.strPosition || player.position || "--";
        const summary = compactPlayerSummary(profile);
        detail.innerHTML = `
          <div class="squad-detail-grid">
            <div><span class="label">Name</span><span class="value">${player.name}</span></div>
            <div><span class="label">Nationality</span><span class="value">${nationalityWithFlag(profile?.strNationality || player.nationality)}</span></div>
            <div><span class="label">Position</span><span class="value">${role}</span></div>
            <div><span class="label">Age</span><span class="value">${ageLine}</span></div>
            <div><span class="label">Height</span><span class="value">${height}</span></div>
            <div><span class="label">Weight</span><span class="value">${weight}</span></div>
            <div><span class="label">Preferred Foot</span><span class="value">${foot}</span></div>
            <div><span class="label">Birth Place</span><span class="value">${birthplace}</span></div>
          </div>
          ${summary ? `<p class="squad-summary">${summary}</p>` : ""}
        `;
      }
      item.appendChild(detail);
    }

    el.squadList.appendChild(item);
  });
}

function visualFormationRows(formation) {
  switch (formation) {
    case "4-2-3-1":
      return [
        { role: "FWD", label: "Striker", count: 1 },
        { role: "MID", label: "Attacking Midfield", count: 3 },
        { role: "MID", label: "Holding Midfield", count: 2 },
        { role: "DEF", label: "Defence", count: 4 },
        { role: "GK", label: "Goalkeeper", count: 1 },
      ];
    case "4-3-3":
      return [
        { role: "FWD", label: "Attack", count: 3 },
        { role: "MID", label: "Midfield", count: 3 },
        { role: "DEF", label: "Defence", count: 4 },
        { role: "GK", label: "Goalkeeper", count: 1 },
      ];
    case "4-4-2":
      return [
        { role: "FWD", label: "Attack", count: 2 },
        { role: "MID", label: "Midfield", count: 4 },
        { role: "DEF", label: "Defence", count: 4 },
        { role: "GK", label: "Goalkeeper", count: 1 },
      ];
    case "3-5-2":
      return [
        { role: "FWD", label: "Attack", count: 2 },
        { role: "MID", label: "Midfield", count: 5 },
        { role: "DEF", label: "Defence", count: 3 },
        { role: "GK", label: "Goalkeeper", count: 1 },
      ];
    case "5-3-2":
      return [
        { role: "FWD", label: "Attack", count: 2 },
        { role: "MID", label: "Midfield", count: 3 },
        { role: "DEF", label: "Defence", count: 5 },
        { role: "GK", label: "Goalkeeper", count: 1 },
      ];
    default:
      return [
        { role: "FWD", label: "Attack", count: 3 },
        { role: "MID", label: "Midfield", count: 3 },
        { role: "DEF", label: "Defence", count: 4 },
        { role: "GK", label: "Goalkeeper", count: 1 },
      ];
  }
}

function mergeDreamRenderReason(prev, next) {
  const priority = { default: 0, player: 1, open: 2, formation: 3 };
  const a = priority[prev] ?? 0;
  const b = priority[next] ?? 0;
  return b >= a ? next : prev;
}

function requestDreamTeamRender(reason = "default") {
  state.dreamRenderReason = mergeDreamRenderReason(state.dreamRenderReason || "default", reason);
  if (state.dreamRenderRaf) return;
  state.dreamRenderRaf = requestAnimationFrame(() => {
    state.dreamRenderRaf = null;
    const nextReason = state.dreamRenderReason || "default";
    state.dreamRenderReason = "default";
    renderDreamTeamPanel(nextReason);
  });
}

function renderDreamTeamPanel(reason = "default") {
  if (!el.dreamTeamPanel || !el.dreamTeamList) return;
  if (!state.dreamTeamOpen) {
    el.dreamTeamPanel.classList.add("hidden");
    document.body.classList.remove("dream-team-overlay-open");
    return;
  }
  el.dreamTeamPanel.classList.remove("hidden");
  document.body.classList.add("dream-team-overlay-open");
  el.dreamTeamList.innerHTML = "";

  if (!dreamHasAnySelection()) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Start by choosing a favourite team and starring players.";
    el.dreamTeamList.appendChild(empty);
    return;
  }

  normalizeDreamSelections();
  const xiPlayers = startingXIPlayersBySlot(11);
  const activeSwapKey = state.dreamSwapActiveKey;
  const benchPlayers = state.dreamTeam.bench.map((key) => getDreamPlayerByKey(key)).filter(Boolean);
  const inLineup = new Set([...state.dreamTeam.startingXI.filter(Boolean), ...state.dreamTeam.bench]);
  const poolRemaining = sortSquadByRole(state.dreamTeam.pool.filter((player) => !inLineup.has(player.key)));

  const controls = document.createElement("section");
  controls.className = "dream-group dream-controls";
  controls.innerHTML = `
    <div class="dream-controls-row">
      <label for="dream-formation-select">Formation</label>
      <select id="dream-formation-select" class="dream-formation-select">
        ${Object.keys(DREAM_TEAM_FORMATIONS).map((key) => `<option value="${key}" ${key === state.dreamTeam.formation ? "selected" : ""}>${key}</option>`).join("")}
      </select>
      <span class="dream-counter">XI ${xiFilledCount()}/11</span>
      <span class="dream-counter">Bench ${state.dreamTeam.bench.length}/7</span>
      <span class="dream-counter">Pool ${state.dreamTeam.pool.length}/${state.maxDreamTeamPlayers}</span>
    </div>
    <div class="dream-controls-row">
      <span class="muted">Tap one player, then tap another to swap XI, bench, or pool.</span>
    </div>
    <div class="dream-controls-row">
      <button class="btn" type="button" id="dream-auto-xi-btn">Auto Pick XI</button>
      <button class="btn" type="button" id="dream-clear-lineup-btn">Clear XI + Bench</button>
    </div>
  `;
  el.dreamTeamList.appendChild(controls);

  const pitch = document.createElement("section");
  const animClass =
    reason === "formation"
      ? "dream-pitch-formation"
      : reason === "player"
        ? "dream-pitch-player"
        : reason === "open"
          ? "dream-pitch-open"
          : "";
  pitch.className = `dream-group dream-pitch ${animClass}`.trim();
  pitch.innerHTML = `<h4>Starting XI (${state.dreamTeam.formation})</h4>`;
  const rowDefs = visualFormationRows(state.dreamTeam.formation);
  let xiCursor = 0;
  rowDefs.forEach((rowDef, rowIndex) => {
    const lane = document.createElement("div");
    lane.className = `pitch-lane pitch-lane-${rowDef.role.toLowerCase()}`;
    lane.classList.toggle("compact", rowDef.count >= 5);
    lane.style.setProperty("--lane-delay", `${rowIndex * 65}ms`);
    lane.style.gridTemplateColumns = `repeat(${Math.max(1, rowDef.count)}, minmax(0, 1fr))`;
    for (let i = 0; i < rowDef.count; i += 1) {
      const slotIndex = xiCursor;
      const player = xiPlayers[xiCursor] || null;
      xiCursor += 1;
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = `pitch-slot ${player ? "filled" : ""}`;
      slot.style.setProperty("--slot-delay", `${rowIndex * 65 + i * 40}ms`);
      if (player && activeSwapKey === player.key) {
        slot.classList.add("swap-active");
      } else if (player && activeSwapKey && activeSwapKey !== player.key) {
        slot.classList.add("swap-target");
      }
      if (player) {
        slot.innerHTML = `
          <span class="pitch-avatar-ring">
            <img class="pitch-avatar ${player.image ? "" : "hidden"}" src="${player.image || ""}" alt="${player.name} cutout" />
            <span class="pitch-avatar-fallback ${player.image ? "hidden" : ""}">${(player.name || "").slice(0, 1)}</span>
            <img class="pitch-badge ${player.teamBadge ? "" : "hidden"}" src="${player.teamBadge || ""}" alt="${player.teamName} badge" />
          </span>
          <span class="pitch-player-name">${player.name}</span>
        `;
      } else {
        slot.innerHTML = `<span class="pitch-empty">Empty</span>`;
      }
      if (player) {
        slot.title = `${rowDef.label}: ${player.name} (${player.number || "—"})`;
        slot.addEventListener("click", () => {
          handleDreamSwapClick(player.key);
        });
      } else {
        slot.title = `${rowDef.label} slot`;
        if (activeSwapKey && xiFilledCount() < 11) {
          slot.classList.add("swap-target");
          slot.addEventListener("click", () => {
            if (!moveSwapActiveToXI(slotIndex)) return;
            state.dreamSwapActiveKey = "";
            saveDreamTeam();
            renderDreamTeamNavState();
            renderSquadPanel();
            requestDreamTeamRender("player");
          });
        } else {
          slot.disabled = true;
        }
      }
      lane.appendChild(slot);
    }
    pitch.appendChild(lane);
  });
  el.dreamTeamList.appendChild(pitch);

  const benchSection = document.createElement("section");
  benchSection.className = "dream-group";
  const benchTitle = document.createElement("h4");
  benchTitle.textContent = "Substitutes";
  benchSection.appendChild(benchTitle);
  for (let i = 0; i < 7; i += 1) {
    const player = benchPlayers[i] || null;
    const row = document.createElement("div");
    row.className = "dream-row";
    if (player && activeSwapKey === player.key) {
      row.classList.add("swap-active");
    } else if (activeSwapKey) {
      row.classList.add("swap-target");
    }
    if (player) {
      row.innerHTML = `
        <div class="dream-main">
          <span class="player-no-circle ${player.number ? "" : "missing"}">${player.number || "—"}</span>
          <img class="player-cutout ${player.image ? "" : "hidden"}" src="${player.image || ""}" alt="${player.name} cutout" />
          <img class="dream-badge ${player.teamBadge ? "" : "hidden"}" src="${player.teamBadge || ""}" alt="${player.teamName} badge" />
          <div class="dream-text">
            <span class="dream-name">${player.name}</span>
            <span class="dream-meta">${nationalityWithFlag(player.nationality)} • ${player.position || "Unknown"} • ${player.teamName}</span>
          </div>
        </div>
        <button class="btn dream-remove" type="button">Remove</button>
      `;
      row.querySelector(".dream-main")?.addEventListener("click", () => {
        handleDreamSwapClick(player.key);
      });
      row.querySelector(".dream-remove").addEventListener("click", () => {
        state.dreamSwapActiveKey = "";
        unassignDreamPlayer(player.key);
        saveDreamTeam();
        renderDreamTeamNavState();
        renderSquadPanel();
        requestDreamTeamRender("player");
      });
    } else {
      row.innerHTML = `<div class="dream-main"><div class="dream-text"><span class="muted">Empty bench slot ${i + 1}</span></div></div>`;
      if (activeSwapKey) {
        row.addEventListener("click", () => {
          if (!moveSwapActiveToBench(i)) return;
          state.dreamSwapActiveKey = "";
          saveDreamTeam();
          renderDreamTeamNavState();
          renderSquadPanel();
          requestDreamTeamRender("player");
        });
      }
    }
    benchSection.appendChild(row);
  }
  el.dreamTeamList.appendChild(benchSection);

  const poolSection = document.createElement("section");
  poolSection.className = "dream-group pool-group";
  poolSection.innerHTML = "<h4>Player Pool (Tap to Activate / Swap)</h4>";
  const poolHint = document.createElement("p");
  poolHint.className = "muted";
  poolHint.textContent = "Select a player, then tap XI/Bench/Pool targets to move or swap.";
  poolSection.appendChild(poolHint);
  if (activeSwapKey) {
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "btn dream-pool-drop";
    drop.textContent = "Move selected player to Squad Pool";
    drop.addEventListener("click", () => {
      if (!moveSwapActiveToPool()) return;
      state.dreamSwapActiveKey = "";
      saveDreamTeam();
      renderDreamTeamNavState();
      renderSquadPanel();
      requestDreamTeamRender("player");
    });
    poolSection.appendChild(drop);
    const poolSlot = document.createElement("div");
    poolSlot.className = "dream-row swap-target";
    poolSlot.innerHTML = `<div class="dream-main"><div class="dream-text"><span class="muted">Empty squad space (tap to place selected player here)</span></div></div>`;
    poolSlot.addEventListener("click", () => {
      if (!moveSwapActiveToPool()) return;
      state.dreamSwapActiveKey = "";
      saveDreamTeam();
      renderDreamTeamNavState();
      renderSquadPanel();
      requestDreamTeamRender("player");
    });
    poolSection.appendChild(poolSlot);
  }
  if (!state.dreamTeam.pool.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No players selected yet.";
    poolSection.appendChild(empty);
  } else if (!poolRemaining.length) {
    const full = document.createElement("p");
    full.className = "muted";
    full.textContent = "All selected players are currently in XI or on the bench.";
    poolSection.appendChild(full);
  } else {
    poolRemaining.forEach((player) => {
      const row = document.createElement("div");
      row.className = "dream-row";
      if (activeSwapKey === player.key) {
        row.classList.add("swap-active");
      } else if (activeSwapKey) {
        row.classList.add("swap-target");
      }
      row.innerHTML = `
        <div class="dream-main">
          <span class="player-no-circle ${player.number ? "" : "missing"}">${player.number || "—"}</span>
          <img class="player-cutout ${player.image ? "" : "hidden"}" src="${player.image || ""}" alt="${player.name} cutout" />
          <img class="dream-badge ${player.teamBadge ? "" : "hidden"}" src="${player.teamBadge || ""}" alt="${player.teamName} badge" />
          <div class="dream-text">
            <span class="dream-name">${player.name}</span>
            <span class="dream-meta">${nationalityWithFlag(player.nationality)} • ${player.position || "Unknown"} • ${player.teamName}</span>
          </div>
        </div>
        <div class="dream-actions-inline">
          <button class="btn dream-assign-xi" type="button">XI</button>
          <button class="btn dream-assign-bench" type="button">Bench</button>
          <button class="btn dream-remove" type="button">Unstar</button>
        </div>
      `;
      row.querySelector(".dream-main")?.addEventListener("click", () => {
        handleDreamSwapClick(player.key);
      });
      row.querySelector(".dream-assign-xi").addEventListener("click", () => {
        if (!assignPlayerToXI(player.key)) return;
        state.dreamSwapActiveKey = "";
        saveDreamTeam();
        requestDreamTeamRender("player");
      });
      row.querySelector(".dream-assign-bench").addEventListener("click", () => {
        if (!assignPlayerToBench(player.key)) return;
        state.dreamSwapActiveKey = "";
        saveDreamTeam();
        requestDreamTeamRender("player");
      });
      row.querySelector(".dream-remove").addEventListener("click", () => {
        state.dreamSwapActiveKey = "";
        toggleDreamTeamPlayer(player);
      });
      poolSection.appendChild(row);
    });
  }
  el.dreamTeamList.appendChild(poolSection);

  const staffSection = document.createElement("section");
  staffSection.className = "dream-group";
  staffSection.innerHTML = "<h4>Staff</h4>";
  const staffList = [];
  if (state.dreamTeam.staff.manager) {
    staffList.push({ label: "Manager", player: state.dreamTeam.staff.manager });
  }
  state.dreamTeam.staff.coaches.forEach((coach) => {
    staffList.push({ label: "Coach", player: coach });
  });
  if (!staffList.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No manager or coaches selected.";
    staffSection.appendChild(empty);
  } else {
    staffList.forEach((item) => {
      const row = document.createElement("div");
      row.className = "dream-row";
      row.innerHTML = `
        <div class="dream-main">
          <span class="player-no-circle missing">—</span>
          <img class="player-cutout ${item.player.image ? "" : "hidden"}" src="${item.player.image || ""}" alt="${item.player.name} cutout" />
          <img class="dream-badge ${item.player.teamBadge ? "" : "hidden"}" src="${item.player.teamBadge || ""}" alt="${item.player.teamName} badge" />
          <div class="dream-text">
            <span class="dream-name">${item.player.name}</span>
            <span class="dream-meta">${item.label} • ${item.player.teamName}</span>
          </div>
        </div>
        <button class="btn dream-remove" type="button">Unstar</button>
      `;
      row.querySelector(".dream-remove").addEventListener("click", () => {
        toggleDreamTeamPlayer(item.player);
      });
      staffSection.appendChild(row);
    });
  }
  el.dreamTeamList.appendChild(staffSection);

  const formationSelect = controls.querySelector("#dream-formation-select");
  formationSelect?.addEventListener("change", () => {
    setDreamFormation(formationSelect.value);
    saveDreamTeam();
    requestDreamTeamRender("formation");
  });
  controls.querySelector("#dream-auto-xi-btn")?.addEventListener("click", () => {
    state.dreamSwapActiveKey = "";
    autoFillStartingXI();
    saveDreamTeam();
    requestDreamTeamRender("player");
  });
  controls.querySelector("#dream-clear-lineup-btn")?.addEventListener("click", () => {
    state.dreamSwapActiveKey = "";
    state.dreamManualLayout = true;
    state.dreamTeam.startingXI = new Array(11).fill(null);
    state.dreamTeam.bench = [];
    saveDreamTeam();
    requestDreamTeamRender("player");
  });
}

function toggleDreamTeamPlayer(player) {
  const role = dreamRoleFromPosition(player.position);
  const poolIndex = state.dreamTeam.pool.findIndex((p) => p.key === player.key);
  const managerMatch = state.dreamTeam.staff.manager?.key === player.key;
  const coachIndex = state.dreamTeam.staff.coaches.findIndex((p) => p.key === player.key);

  if (poolIndex >= 0) {
    state.dreamTeam.pool.splice(poolIndex, 1);
    unassignDreamPlayer(player.key);
    if (state.dreamSwapActiveKey === player.key) {
      state.dreamSwapActiveKey = "";
    }
  } else if (managerMatch) {
    state.dreamTeam.staff.manager = null;
  } else if (coachIndex >= 0) {
    state.dreamTeam.staff.coaches.splice(coachIndex, 1);
  } else if (role === "MGR") {
    state.dreamTeam.staff.manager = player;
  } else if (role === "COACH") {
    state.dreamTeam.staff.coaches.push(player);
  } else {
    if (state.dreamTeam.pool.length >= state.maxDreamTeamPlayers) {
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
    state.dreamTeam.pool.push(player);
    if (!assignPlayerToXI(player.key) && state.dreamTeam.bench.length < 7) {
      assignPlayerToBench(player.key);
    }
    state.dreamSwapActiveKey = "";
  }
  saveDreamTeam();
  renderDreamTeamNavState();
  renderSquadPanel();
  requestDreamTeamRender("player");
}

function toggleDreamTeamPanel() {
  if (!dreamHasAnySelection()) {
    if (el.dreamTeamHint) {
      el.dreamTeamHint.classList.remove("hidden");
      setTimeout(() => el.dreamTeamHint.classList.add("hidden"), 2400);
    }
    return;
  }
  state.dreamTeamOpen = !state.dreamTeamOpen;
  if (!state.dreamTeamOpen) {
    state.dreamSwapActiveKey = "";
  }
  renderDreamTeamNavState();
  requestDreamTeamRender(state.dreamTeamOpen ? "open" : "default");
}

function escapeForCanvas(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function wrapTextLines(ctx, text, maxWidth, maxLines = 2) {
  const clean = escapeForCanvas(text);
  if (!clean) return [""];
  const words = clean.split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const probe = current ? `${current} ${word}` : word;
    if (ctx.measureText(probe).width <= maxWidth) {
      current = probe;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const trimmed = lines.slice(0, maxLines);
  let last = trimmed[maxLines - 1];
  while (last.length > 3 && ctx.measureText(`${last}...`).width > maxWidth) {
    last = last.slice(0, -1);
  }
  trimmed[maxLines - 1] = `${last}...`;
  return trimmed;
}

function drawCenteredWrappedText(ctx, text, centerX, startY, maxWidth, lineHeight = 26, maxLines = 2) {
  const lines = wrapTextLines(ctx, text, maxWidth, maxLines);
  ctx.textAlign = "center";
  lines.forEach((line, idx) => {
    ctx.fillText(line, centerX, startY + idx * lineHeight);
  });
  ctx.textAlign = "start";
  return lines.length;
}

function drawWrappedText(ctx, text, x, startY, maxWidth, lineHeight = 22, maxLines = 2) {
  const lines = wrapTextLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, startY + idx * lineHeight);
  });
  return lines.length;
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

function drawPlayerCircleCutout(ctx, img, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#120a04";
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  if (img) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
  ctx.strokeStyle = "#b87424";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
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

const COUNTRY_TO_ISO2 = {
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  "united kingdom": "GB",
  ireland: "IE",
  bosnia: "BA",
  "bosnia and herzegovina": "BA",
  "czech republic": "CZ",
  korea: "KR",
  "south korea": "KR",
  usa: "US",
  "united states": "US",
  "ivory coast": "CI",
  "cote d'ivoire": "CI",
};

function countryToIso2(country) {
  const raw = String(country || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  if (/^[A-Za-z]{3}$/.test(raw)) {
    const by3 = {
      ENG: "GB",
      SCO: "GB",
      WAL: "GB",
      NIR: "GB",
      USA: "US",
      KOR: "KR",
      CZE: "CZ",
      BIH: "BA",
      CIV: "CI",
    };
    return by3[raw.toUpperCase()] || "";
  }
  const key = raw.toLowerCase();
  if (COUNTRY_TO_ISO2[key]) return COUNTRY_TO_ISO2[key];
  try {
    const canonical = new Intl.DisplayNames(["en"], { type: "region" });
    for (let code = 65; code <= 90; code += 1) {
      for (let code2 = 65; code2 <= 90; code2 += 1) {
        const iso = String.fromCharCode(code, code2);
        const name = canonical.of(iso);
        if (name && name.toLowerCase() === key) return iso;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function flagFromCountry(country) {
  const iso = countryToIso2(country);
  if (!iso || iso.length !== 2) return "";
  const chars = iso
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  return chars.join("");
}

function nationalityWithFlag(nationality) {
  const label = nationality || "Unknown";
  const flag = flagFromCountry(label);
  return flag ? `${flag} ${label}` : label;
}

async function downloadDreamTeamImage() {
  if (!dreamHasAnySelection()) return;
  normalizeDreamSelections();
  const width = 1080;
  const pitchTop = 190;
  const pitchHeight = 860;
  const listStart = pitchTop + pitchHeight + 70;
  const benchPlayers = state.dreamTeam.bench.map((key) => getDreamPlayerByKey(key)).filter(Boolean);
  const staffPlayers = [state.dreamTeam.staff.manager, ...(state.dreamTeam.staff.coaches || [])].filter(Boolean);
  const estimatedRows = Math.max(1, benchPlayers.length) + Math.max(1, staffPlayers.length);
  const height = Math.max(1420, listStart + 230 + estimatedRows * 108);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = "#090503";
  ctx.fillRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "rgba(255,153,32,0.16)");
  grad.addColorStop(1, "rgba(12,8,4,0.12)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ff9a1f";
  ctx.font = "74px VT323";
  ctx.fillText("EZRASCORES DREAM TEAM", 56, 94);
  ctx.font = "34px VT323";
  ctx.fillStyle = "#ffbf74";
  ctx.fillText(`Formation ${state.dreamTeam.formation} • ${new Date().toLocaleString("en-GB")}`, 56, 136);

  const xiPlayers = startingXIPlayersOrdered();
  const baseRows = visualFormationRows(state.dreamTeam.formation);
  const rowCount = baseRows.length;
  const laneStep = rowCount > 1 ? 640 / (rowCount - 1) : 0;
  const rowDefs = baseRows.map((row, idx) => ({
    role: row.role,
    count: row.count,
    y: Math.round(pitchTop + 115 + idx * laneStep),
  }));
  let xiCursor = 0;

  ctx.strokeStyle = "#6f4312";
  ctx.lineWidth = 2;
  clipRoundedRect(ctx, 42, pitchTop, 996, pitchHeight, 20);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,153,32,0.05)";
  clipRoundedRect(ctx, 42, pitchTop, 996, pitchHeight, 20);
  ctx.fill();

  for (const row of rowDefs) {
    const xStep = 900 / Math.max(1, row.count);
    for (let i = 0; i < row.count; i += 1) {
      const x = 90 + xStep * i + xStep / 2;
      const player = xiPlayers[xiCursor] || null;
      xiCursor += 1;
      ctx.beginPath();
      ctx.arc(x, row.y, 52, 0, Math.PI * 2);
      ctx.closePath();
      ctx.strokeStyle = player ? "#ffb45c" : "#5d3710";
      ctx.stroke();
      if (!player) continue;
      const [playerImg, badgeImg] = await Promise.all([loadCanvasImage(player.image), loadCanvasImage(player.teamBadge)]);
      drawPlayerCircleCutout(ctx, playerImg, x, row.y, 46);
      drawBadgeCircle(ctx, badgeImg, x + 42, row.y + 36, 14);
      ctx.fillStyle = "#ffd9a5";
      ctx.font = "28px VT323";
      const textWidth = Math.max(104, xStep - 20);
      drawCenteredWrappedText(ctx, player.name, x, row.y + 88, textWidth, 24, 2);
    }
  }

  const listX = 58;
  let y = listStart;

  const drawRow = async (title, player, isStaff = false) => {
    ctx.fillStyle = "#ffc072";
    ctx.font = "32px VT323";
    ctx.fillText(title, listX, y);
    y += 40;
    const [playerImg, badgeImg] = await Promise.all([loadCanvasImage(player?.image), loadCanvasImage(player?.teamBadge)]);
    drawPlayerCircleCutout(ctx, playerImg, listX + 30, y - 12, 24);
    drawBadgeCircle(ctx, badgeImg, listX + 52, y + 10, 12);
    ctx.fillStyle = "#f6d5aa";
    ctx.font = "34px VT323";
    const nameLines = drawWrappedText(ctx, player?.name || "—", listX + 72, y, width - listX - 88, 26, 2);
    ctx.fillStyle = "#c7883a";
    ctx.font = "24px VT323";
    const sub = isStaff
      ? escapeForCanvas(player?.teamName || "")
      : `${escapeForCanvas(nationalityWithFlag(player?.nationality || ""))} | ${escapeForCanvas(player?.position || "Unknown")} | ${escapeForCanvas(player?.teamName || "")}`;
    const subStart = y + nameLines * 26 + 4;
    const subLines = drawWrappedText(ctx, sub, listX + 72, subStart, width - listX - 88, 20, 2);
    y = subStart + subLines * 20 + 22;
  };

  ctx.fillStyle = "#ffbf74";
  ctx.font = "46px VT323";
  ctx.fillText("SUBSTITUTES", listX, y);
  y += 56;
  if (!benchPlayers.length) {
    ctx.fillStyle = "#9e6a2d";
    ctx.font = "32px VT323";
    ctx.fillText("No substitutes selected", listX, y);
    y += 44;
  } else {
    for (const player of benchPlayers) {
      await drawRow("SUB", player);
    }
  }

  y += 16;
  ctx.fillStyle = "#ffbf74";
  ctx.font = "46px VT323";
  ctx.fillText("STAFF", listX, y);
  y += 56;
  if (!staffPlayers.length) {
    ctx.fillStyle = "#9e6a2d";
    ctx.font = "32px VT323";
    ctx.fillText("No staff selected", listX, y);
  } else {
    if (state.dreamTeam.staff.manager) await drawRow("MANAGER", state.dreamTeam.staff.manager, true);
    for (const coach of state.dreamTeam.staff.coaches) {
      await drawRow("COACH", coach, true);
    }
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

function ensurePlayerPopContinuity() {
  if (!state.playerPopEnabled || !el.playerDvdLayer || !el.playerDvdAvatar) return;
  const pop = state.playerPop;
  if (el.playerDvdLayer.classList.contains("hidden")) return;
  if (!pop.player) return;
  if (!pop.running) {
    startPlayerPopAnimation();
  }
}

async function showRandomPlayerPop(forceNew = false) {
  if (state.playerPop.loading || !state.playerPopEnabled) return;
  if (!el.playerDvdLayer || !el.playerDvdImage || !el.playerDvdAvatar || !el.playerDvdName) return;
  if (
    !forceNew &&
    state.playerPop.player &&
    !el.playerDvdLayer.classList.contains("hidden") &&
    !el.playerDvdLayer.classList.contains("quiz-active")
  ) {
    ensurePlayerPopContinuity();
    return;
  }
  state.playerPop.loading = true;
  try {
    const player = await randomLeaguePlayerWithCutout();
    if (!player || !state.playerPopEnabled) {
      hidePlayerPopLayer();
      return;
    }
    hidePlayerQuizCard();
    document.body.classList.remove("player-quiz-open");
    el.playerDvdLayer.classList.remove("quiz-active");
    el.playerDvdAvatar.classList.remove("hidden", "quiz-fade");
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
    scheduleCloudStateSync();
    return;
  }
  showRandomPlayerPop();
  scheduleCloudStateSync();
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

function addDaysIso(dateIso, deltaDays) {
  const base = String(dateIso || "").trim();
  if (!base) return toISODate(new Date());
  const dt = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return toISODate(new Date());
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return dt.toISOString().slice(0, 10);
}

function fixtureWindowBounds(baseDate = new Date()) {
  const min = new Date(baseDate);
  min.setDate(min.getDate() - RESULTS_HISTORY_DAYS);
  const max = new Date(baseDate);
  max.setDate(max.getDate() + FIXTURES_FUTURE_DAYS);
  return { minIso: toISODate(min), maxIso: toISODate(max) };
}

function clampDateToFixtureWindow(dateIso) {
  const { minIso, maxIso } = fixtureWindowBounds();
  if (dateIso < minIso) return minIso;
  if (dateIso > maxIso) return maxIso;
  return dateIso;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
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

function liveProgressLabel(event) {
  const raw = String(event?.strStatus || event?.strProgress || "").trim();
  if (!raw) return "LIVE";
  const low = raw.toLowerCase();

  if (/\bht|half time\b/.test(low)) return "HT";
  if (/\b1h|first half\b/.test(low)) return "1H";
  if (/\b2h|second half\b/.test(low)) return "2H";
  if (/\bet|extra time\b/.test(low)) return "ET";
  if (/\bpen|pens|penalties\b/.test(low)) return "PENS";

  const minuteMatch = raw.match(/(\d{1,3}(?:\+\d{1,2})?)\s*'?/);
  if (minuteMatch?.[1]) return `${minuteMatch[1]}'`;
  if (/\blive|in play|playing\b/.test(low)) return "LIVE";
  return "LIVE";
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

function isDeferredEvent(event) {
  const s = parseStatusText(event);
  return /\b(postponed|suspended|abandoned|cancelled|canceled|delay)\b/.test(s);
}

function eventState(event) {
  const today = toISODate(new Date());
  const date = event?.dateEvent;
  if (isLiveEvent(event)) {
    const progress = liveProgressLabel(event);
    const label = progress === "LIVE" ? "live" : `live ${progress}`;
    return { key: "live", label };
  }
  if (isFinalEvent(event)) {
    return { key: "final", label: "final score" };
  }
  if (isDeferredEvent(event)) {
    return { key: "upcoming", label: "upcoming" };
  }
  if (hasScore(event) && date && date < today) {
    return { key: "final", label: "final score" };
  }
  if (hasScore(event) && date === today) {
    const kickoff = fixtureKickoffDate(event);
    if (kickoff && !Number.isNaN(kickoff.getTime())) {
      const elapsedMs = Date.now() - kickoff.getTime();
      if (elapsedMs < 0) return { key: "upcoming", label: "upcoming" };
      if (elapsedMs <= 150 * 60 * 1000) return { key: "live", label: "live" };
      return { key: "final", label: "final score" };
    }
    return { key: "live", label: "live" };
  }
  if (date === today) {
    const kickoff = fixtureKickoffDate(event);
    if (kickoff && !Number.isNaN(kickoff.getTime())) {
      const elapsedMs = Date.now() - kickoff.getTime();
      if (elapsedMs >= 0 && elapsedMs <= 150 * 60 * 1000) {
        return { key: "live", label: "live" };
      }
      if (elapsedMs > 150 * 60 * 1000) {
        return { key: "final", label: "final score" };
      }
    }
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

function serverNow() {
  return new Date(Date.now() + Number(state.serverTimeOffsetMs || 0));
}

function updateServerTimeOffsetFromResponse(res) {
  if (!res?.headers) return;
  const dateHeader = res.headers.get("Date");
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return;
  state.serverTimeOffsetMs = serverMs - Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryResponseStatus(status) {
  return status === 429 || status >= 500;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = API_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= API_FETCH_RETRIES; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (!shouldRetryResponseStatus(res.status) || attempt >= API_FETCH_RETRIES) {
        return res;
      }
    } catch (err) {
      lastErr = err;
      if (attempt >= API_FETCH_RETRIES) {
        throw err;
      }
    }
    await sleep(180 * (attempt + 1));
  }
  if (lastErr) throw lastErr;
  throw new Error("Request failed");
}

async function apiGetJson(version, path) {
  const key = `${version}:${path}`;
  if (inflightApiGets.has(key)) {
    return inflightApiGets.get(key);
  }
  const promise = (async () => {
    const url = `${API_PROXY_BASE}/${version}/${path}`;
    let res;
    try {
      res = await fetchWithRetry(url);
    } catch (err) {
      const isTimeout = String(err?.name || "").toLowerCase() === "aborterror" || String(err?.message || "").includes("timeout");
      throw new Error(isTimeout ? `Request timed out for ${path}` : `Request failed for ${path}`);
    }
    updateServerTimeOffsetFromResponse(res);
    if (!res.ok) {
      throw new Error(`API call failed (${res.status}) for ${path}`);
    }
    return res.json();
  })();
  inflightApiGets.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightApiGets.delete(key);
  }
}

async function apiGetV1(path) {
  return apiGetJson("v1", path);
}

async function apiGetV2(path) {
  return apiGetJson("v2", path);
}

async function apiRequest(method, path, body = null, token = "") {
  const headers = {};
  if (body !== null) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetchWithTimeout(path, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const isTimeout = String(err?.name || "").toLowerCase() === "aborterror" || String(err?.message || "").includes("timeout");
    throw new Error(isTimeout ? "Request timed out. Please try again." : "Network request failed. Please try again.");
  }
  updateServerTimeOffsetFromResponse(res);
  const isJson = (res.headers.get("Content-Type") || "").includes("application/json");
  const payload = isJson ? await res.json() : { error: await res.text() };
  if (!res.ok) {
    const raw = String(payload?.error || "");
    const isHtml = /<!doctype html>|<html/i.test(raw);
    const clean = isHtml
      ? `Cloudflare error ${res.status}. Check Pages Functions logs for the latest exception.`
      : raw.slice(0, 220);
    const detail = payload?.detail ? ` (${String(payload.detail).slice(0, 220)})` : "";
    throw new Error((clean || `Request failed (${res.status})`) + detail);
  }
  return payload;
}

function buildCloudStatePayload() {
  return {
    favoriteTeamId: state.favoriteTeamId || "",
    uiTheme: state.uiTheme,
    motionLevel: state.motionLevel,
    playerPopEnabled: state.playerPopEnabled,
    playerPopScope: state.playerPopScope,
    dreamTeam: state.dreamTeam,
    playerQuiz: {
      correctCount: state.playerQuiz.correctCount || 0,
      allCorrect: Boolean(state.playerQuiz.allCorrect),
    },
    missions: state.missions || defaultMissionState(),
    storyCards: state.storyCards || defaultStoryCardState(),
    familyLeague: state.familyLeague || defaultFamilyLeagueState(),
    savedAt: new Date().toISOString(),
  };
}

function resetAccountScopedLocalState() {
  closeLeagueMemberView();
  state.missions = defaultMissionState();
  state.familyLeague = defaultFamilyLeagueState();
  if (state.account?.leagueRefreshTimer) {
    clearTimeout(state.account.leagueRefreshTimer);
    state.account.leagueRefreshTimer = null;
  }
  persistLocalMetaState();
}

function applyCloudState(cloudState, options = {}) {
  const strict = Boolean(options?.strict);
  if (!cloudState || typeof cloudState !== "object") return;
  if (typeof cloudState.favoriteTeamId === "string") {
    state.favoriteTeamId = cloudState.favoriteTeamId;
    if (state.favoriteTeamId) localStorage.setItem("esra_favorite_team", state.favoriteTeamId);
  }
  if (typeof cloudState.uiTheme === "string") {
    applyUiTheme(cloudState.uiTheme);
  }
  if (typeof cloudState.motionLevel === "string") {
    applyMotionSetting(cloudState.motionLevel);
  }
  if (typeof cloudState.playerPopScope === "string") {
    setPlayerPopScope(cloudState.playerPopScope);
  }
  if (typeof cloudState.playerPopEnabled === "boolean") {
    state.playerPopEnabled = cloudState.playerPopEnabled;
    localStorage.setItem("ezra_player_pop_enabled", state.playerPopEnabled ? "1" : "0");
    setPlayerPopButtonState();
  }
  if (cloudState.dreamTeam && typeof cloudState.dreamTeam === "object") {
    state.dreamTeam = {
      ...defaultDreamTeamState(),
      ...cloudState.dreamTeam,
      staff: {
        manager: cloudState.dreamTeam.staff?.manager || null,
        coaches: Array.isArray(cloudState.dreamTeam.staff?.coaches) ? cloudState.dreamTeam.staff.coaches : [],
      },
      pool: Array.isArray(cloudState.dreamTeam.pool) ? cloudState.dreamTeam.pool : [],
      startingXI: Array.isArray(cloudState.dreamTeam.startingXI) ? cloudState.dreamTeam.startingXI : [],
      bench: Array.isArray(cloudState.dreamTeam.bench) ? cloudState.dreamTeam.bench : [],
    };
    localStorage.setItem("ezra_dream_team", JSON.stringify(state.dreamTeam));
    normalizeDreamSelections();
    renderDreamTeamNavState();
    requestDreamTeamRender("player");
  }
  state.missions = cloudState.missions && typeof cloudState.missions === "object" ? cloudState.missions : strict ? defaultMissionState() : state.missions;
  state.storyCards = cloudState.storyCards && typeof cloudState.storyCards === "object" ? cloudState.storyCards : state.storyCards;
  state.familyLeague =
    cloudState.familyLeague && typeof cloudState.familyLeague === "object"
      ? cloudState.familyLeague
      : strict
        ? defaultFamilyLeagueState()
        : state.familyLeague;
  ensureMissionState();
  ensureFamilyLeagueState();
  persistLocalMetaState();
  renderFunZone();
  refreshVisibleFixturePredictionBadges();
}

async function loadCloudState() {
  if (!state.account.token) return;
  const data = await apiRequest("GET", `${API_PROXY_BASE}/v1/ezra/account/state`, null, state.account.token);
  applyCloudState(data?.state || {}, { strict: true });
}

async function refreshChallengeDashboard(force = false) {
  if (!accountSignedIn()) {
    state.challengeDashboard = null;
    state.challengeDashboardAt = 0;
    renderChallengeDashboardPanels();
    return null;
  }
  if (!force && Date.now() - Number(state.challengeDashboardAt || 0) < 30 * 1000) {
    return state.challengeDashboard;
  }
  const data = await apiRequest("GET", `${API_PROXY_BASE}/v1/ezra/account/challenges/dashboard`, null, state.account.token);
  state.challengeDashboard = data || null;
  state.challengeDashboardAt = Date.now();
  renderChallengeDashboardPanels();
  return state.challengeDashboard;
}

async function syncCloudStateNow() {
  if (!accountSignedIn() || state.account.syncing) return;
  state.account.syncing = true;
  try {
    await apiRequest("PUT", `${API_PROXY_BASE}/v1/ezra/account/state`, { state: buildCloudStatePayload() }, state.account.token);
    setAccountStatus(`Cloud saved ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (err) {
    setAccountStatus(`Sync failed: ${err.message}`, true);
  } finally {
    state.account.syncing = false;
  }
}

function scheduleCloudStateSync(delayMs = 1200) {
  if (!accountSignedIn()) return;
  if (state.account.syncTimer) {
    clearTimeout(state.account.syncTimer);
  }
  state.account.syncTimer = setTimeout(() => {
    state.account.syncTimer = null;
    syncCloudStateNow();
  }, delayMs);
}

async function initAccountSession() {
  renderAccountUI();
  if (!state.account.token) {
    resetAccountScopedLocalState();
    state.challengeDashboard = null;
    state.challengeDashboardAt = 0;
    await safeLoad(() => refreshLeagueDirectory(), null);
    setAccountStatus("Logged out. Existing features still work locally.");
    renderFamilyLeaguePanel();
    return;
  }
  try {
    const me = await apiRequest("GET", `${API_PROXY_BASE}/v1/ezra/account/me`, null, state.account.token);
    state.account.user = me.user || null;
    if (!state.account.user) throw new Error("Session expired");
    resetAccountScopedLocalState();
    await loadCloudState();
    await safeLoad(() => refreshChallengeDashboard(true), null);
    ensureSignedInUserInFamilyLeague();
    await refreshLeagueDirectory();
    persistLocalMetaState();
    renderAccountUI();
    renderFamilyLeaguePanel();
    refreshVisibleFixturePredictionBadges();
    setAccountStatus(`Cloud save active for ${state.account.user.name}.`);
  } catch (err) {
    state.account.token = "";
    state.account.user = null;
    localStorage.removeItem("ezra_account_token");
    renderAccountUI();
    renderFamilyLeaguePanel();
    refreshVisibleFixturePredictionBadges();
    state.challengeDashboard = null;
    state.challengeDashboardAt = 0;
    setAccountStatus(`Logged out. ${err.message}`, true);
  }
}

async function registerAccount() {
  const name = el.accountNameInput?.value || "";
  const pin = el.accountPinInput?.value || "";
  const data = await apiRequest("POST", `${API_PROXY_BASE}/v1/ezra/account/register`, { name, pin });
  state.account.token = data.token || "";
  state.account.user = data.user || null;
  localStorage.setItem("ezra_account_token", state.account.token);
  resetAccountScopedLocalState();
  let partialWarning = false;
  const dash = await safeLoad(() => refreshChallengeDashboard(true), null);
  if (!dash) partialWarning = true;
  ensureSignedInUserInFamilyLeague();
  const leaguesOk = await safeLoad(async () => {
    await refreshLeagueDirectory();
    return true;
  }, false);
  if (!leaguesOk) partialWarning = true;
  persistLocalMetaState();
  const synced = await safeLoad(() => syncCloudStateNow(), null);
  if (synced === null) partialWarning = true;
  renderAccountUI();
  renderFamilyLeaguePanel();
  refreshVisibleFixturePredictionBadges();
  setAccountStatus(
    partialWarning
      ? `Account created for ${state.account.user?.name || "user"}. Some sections are still loading; retry in a moment.`
      : `Account created. Cloud save enabled for ${state.account.user?.name || "user"}.`
  );
}

async function loginAccount() {
  const name = el.accountNameInput?.value || "";
  const pin = el.accountPinInput?.value || "";
  const data = await apiRequest("POST", `${API_PROXY_BASE}/v1/ezra/account/login`, { name, pin });
  state.account.token = data.token || "";
  state.account.user = data.user || null;
  localStorage.setItem("ezra_account_token", state.account.token);
  resetAccountScopedLocalState();
  let partialWarning = false;
  const cloud = await safeLoad(() => loadCloudState(), null);
  if (cloud === null) partialWarning = true;
  const dash = await safeLoad(() => refreshChallengeDashboard(true), null);
  if (!dash) partialWarning = true;
  ensureSignedInUserInFamilyLeague();
  const leaguesOk = await safeLoad(async () => {
    await refreshLeagueDirectory();
    return true;
  }, false);
  if (!leaguesOk) partialWarning = true;
  persistLocalMetaState();
  scheduleCloudStateSync();
  renderAccountUI();
  renderFamilyLeaguePanel();
  refreshVisibleFixturePredictionBadges();
  setAccountStatus(
    partialWarning
      ? `Signed in as ${state.account.user?.name || "user"}. Some sections are still loading; retry in a moment.`
      : `Signed in as ${state.account.user?.name || "user"}.`
  );
}

async function logoutAccount() {
  if (state.account.token) {
    await apiRequest("POST", `${API_PROXY_BASE}/v1/ezra/account/logout`, {}, state.account.token).catch(() => null);
  }
  state.account.token = "";
  state.account.user = null;
  if (state.account.syncTimer) {
    clearTimeout(state.account.syncTimer);
    state.account.syncTimer = null;
  }
  if (state.account.leagueRefreshTimer) {
    clearTimeout(state.account.leagueRefreshTimer);
    state.account.leagueRefreshTimer = null;
  }
  localStorage.removeItem("ezra_account_token");
  resetAccountScopedLocalState();
  state.challengeDashboard = null;
  state.challengeDashboardAt = 0;
  state.leagueDirectory.items = [];
  renderAccountUI();
  renderFamilyLeaguePanel();
  refreshVisibleFixturePredictionBadges();
  setAccountStatus("Logged out. Existing features still work locally.");
}

async function fetchLeagueDayFixtures(leagueId, dateIso) {
  const fromCache = await safeLoad(async () => {
    const payload = await apiGetV1(`ezra/fixtures?l=${encodeURIComponent(leagueId)}&d=${encodeURIComponent(dateIso)}`);
    return safeArray(payload, "events");
  }, null);
  if (Array.isArray(fromCache)) {
    return fromCache;
  }

  const league = Object.values(LEAGUES).find((l) => l.id === leagueId);
  const leagueName = league?.name || leagueId;
  const today = toISODate(new Date());
  const dateQueryPaths = [
    `eventsday.php?d=${encodeURIComponent(dateIso)}&l=${encodeURIComponent(leagueId)}`,
    `eventsday.php?d=${encodeURIComponent(dateIso)}&l=${encodeURIComponent(leagueName)}`,
  ];
  const dateFeeds = await Promise.all(
    dateQueryPaths.map((path) => safeLoad(async () => safeArray(await apiGetV1(path)), []))
  );

  const feedKeys = new Set();
  const base = [];
  dateFeeds.flat().forEach((event) => {
    const key = fixtureKey(event);
    if (!key || feedKeys.has(key)) return;
    feedKeys.add(key);
    base.push(event);
  });

  const sideFeedPaths = [];
  if (dateIso <= today) {
    sideFeedPaths.push(`eventspastleague.php?id=${leagueId}`);
  }
  if (dateIso >= today) {
    sideFeedPaths.push(`eventsnextleague.php?id=${leagueId}`);
  }
  const sideFeeds = await Promise.all(
    sideFeedPaths.map((path) => safeLoad(async () => safeArray(await apiGetV1(path)), []))
  );
  const extras = sideFeeds.flat().filter((event) => event?.dateEvent === dateIso);

  const combined = [...base];
  const byKey = new Map(combined.map((event) => [fixtureKey(event), event]));
  extras.forEach((event) => {
    const key = fixtureKey(event);
    if (!key) return;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...event } : event);
  });

  return [...byKey.values()];
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
  const data = await apiGetV1(`ezra/tables?l=${leagueId}`);
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

async function fetchTeamFormFromCache(team, n = 5) {
  if (!team?.idTeam) return [];
  const leagueCode = teamLeagueCode(team);
  const leagueId = LEAGUES[leagueCode]?.id;
  if (!leagueId) return [];
  const data = await apiGetV1(
    `ezra/teamform?leagueId=${encodeURIComponent(leagueId)}&teamId=${encodeURIComponent(team.idTeam)}&teamName=${encodeURIComponent(team.strTeam || "")}&n=${encodeURIComponent(n)}`
  );
  const values = Array.isArray(data?.results) ? data.results : [];
  return values.filter((value) => value === "W" || value === "D" || value === "L").slice(0, n);
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
  const known = findKnownTeamById(teamId);
  if (known) return known;
  try {
    const data = await apiGetV1(`lookupteam.php?id=${teamId}`);
    if (Array.isArray(data?.teams) && data.teams[0]) return data.teams[0];
  } catch (err) {
    console.error(err);
  }
  if (state.favoriteTeam && String(state.favoriteTeam.idTeam || "") === String(teamId)) {
    return state.favoriteTeam;
  }
  return null;
}

async function fetchTeamNextEvents(teamId) {
  const data = await apiGetV1(`eventsnext.php?id=${teamId}`);
  return safeArray(data);
}

async function fetchTeamWindowFixturesFromCache(team, fromIso, toIso, limit = 240) {
  if (!team) return [];
  const leagueCode = teamLeagueCode(team);
  const leagueId = LEAGUES[leagueCode]?.id;
  if (!leagueId) return [];
  const payload = await apiGetV1(
    `ezra/teamfixtures?leagueId=${encodeURIComponent(leagueId)}&teamId=${encodeURIComponent(team.idTeam || "")}&teamName=${encodeURIComponent(
      team.strTeam || ""
    )}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&limit=${encodeURIComponent(limit)}`
  );
  return safeArray(payload, "events");
}

async function fetchTeamLastEvents(teamId) {
  const base = await safeLoad(async () => {
    const data = await apiGetV1(`eventslast.php?id=${teamId}`);
    return safeArray(data);
  }, []);
  if (base.length >= 5) return base;

  const v2Candidates = [];
  const v2Paths = [`eventslast/${teamId}`, `eventslast.php?id=${teamId}`];
  for (const path of v2Paths) {
    const events = await safeLoad(async () => {
      const payload = await apiGetV2(path);
      return safeArray(payload).length ? safeArray(payload) : firstArrayValue(payload);
    }, []);
    if (events.length) v2Candidates.push(...events);
  }

  return mergeUniqueEvents([...base, ...v2Candidates]);
}

async function fetchEventById(eventId) {
  if (!eventId) return null;
  const data = await apiGetV1(`lookupevent.php?id=${eventId}`);
  return Array.isArray(data?.events) && data.events[0] ? data.events[0] : null;
}

async function fetchEventStats(eventId) {
  if (!eventId) return [];
  const data = await apiGetV1(`lookupeventstats.php?id=${eventId}`);
  return safeArray(data, "eventstats");
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

function findKnownTeamById(teamId) {
  if (!teamId) return null;
  const allTeams = [...(state.teamsByLeague.EPL || []), ...(state.teamsByLeague.CHAMP || [])];
  return allTeams.find((team) => String(team?.idTeam || "") === String(teamId)) || null;
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

function isMobileViewport() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function positionFavoritePickerMenu() {
  if (!el.favoritePickerMenu || !el.favoritePickerBtn) return;
  if (el.favoritePickerMenu.classList.contains("hidden")) return;
  const rect = el.favoritePickerBtn.getBoundingClientRect();
  const viewportPadding = 8;
  const mobile = isMobileViewport();
  const preferredWidth = mobile ? window.innerWidth - viewportPadding * 2 : Math.max(300, Math.min(420, rect.width + 140));
  const maxWidth = Math.max(220, window.innerWidth - viewportPadding * 2);
  const width = Math.max(220, Math.min(preferredWidth, maxWidth));
  const left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding));
  const availableDown = window.innerHeight - rect.bottom - viewportPadding;
  const availableUp = rect.top - viewportPadding;
  const preferUp = availableDown < 240 && availableUp > availableDown;
  const maxHeight = Math.max(180, Math.min(360, (preferUp ? availableUp : availableDown) - 6));
  const top = preferUp ? Math.max(viewportPadding, rect.top - maxHeight - 8) : Math.max(viewportPadding, rect.bottom + 8);

  el.favoritePickerMenu.style.setProperty("--favorite-picker-menu-top", `${Math.round(top)}px`);
  el.favoritePickerMenu.style.setProperty("--favorite-picker-menu-left", `${Math.round(left)}px`);
  el.favoritePickerMenu.style.setProperty("--favorite-picker-menu-width", `${Math.round(width)}px`);
  el.favoritePickerMenu.style.setProperty("--favorite-picker-menu-max-height", `${Math.round(maxHeight)}px`);
}

function closeFavoritePickerMenu() {
  if (!el.favoritePickerMenu || !el.favoritePickerBtn) return;
  el.favoritePickerMenu.classList.add("hidden");
  el.favoritePickerBtn.setAttribute("aria-expanded", "false");
}

function toggleFavoritePickerMenu() {
  if (!el.favoritePickerMenu || !el.favoritePickerBtn) return;
  const isOpen = !el.favoritePickerMenu.classList.contains("hidden");
  if (isOpen) {
    closeFavoritePickerMenu();
    return;
  }
  setSettingsMenuOpen(false);
  setAccountMenuOpen(false);
  el.favoritePickerMenu.classList.remove("hidden");
  el.favoritePickerBtn.setAttribute("aria-expanded", "true");
  positionFavoritePickerMenu();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function predictionResultCode(home, away) {
  if (home > away) return "H";
  if (away > home) return "A";
  return "D";
}

function allKnownEventsById() {
  const all = [
    ...state.fixtures.today.EPL,
    ...state.fixtures.today.CHAMP,
    ...state.fixtures.previous.EPL,
    ...state.fixtures.previous.CHAMP,
    ...state.fixtures.next.EPL,
    ...state.fixtures.next.CHAMP,
    ...state.selectedDateFixtures.EPL,
    ...state.selectedDateFixtures.CHAMP,
  ];
  const map = new Map();
  all.forEach((event) => {
    if (!event?.idEvent) return;
    map.set(event.idEvent, event);
  });
  return map;
}

function ensurePredictionRecord(event) {
  ensureFamilyLeagueState();
  if (!event?.idEvent) return null;
  const eventId = event.idEvent;
  if (!state.familyLeague.predictions[eventId] || typeof state.familyLeague.predictions[eventId] !== "object") {
    state.familyLeague.predictions[eventId] = {
      eventId,
      homeTeam: event.strHomeTeam || "",
      awayTeam: event.strAwayTeam || "",
      kickoff: fixtureKickoffDate(event)?.toISOString() || "",
      settled: false,
      entries: {},
    };
  }
  const record = state.familyLeague.predictions[eventId];
  if (!record.entries || typeof record.entries !== "object") record.entries = {};
  if (typeof record.homeTeam !== "string") record.homeTeam = event.strHomeTeam || "";
  if (typeof record.awayTeam !== "string") record.awayTeam = event.strAwayTeam || "";
  if (typeof record.kickoff !== "string") record.kickoff = fixtureKickoffDate(event)?.toISOString() || "";
  if (typeof record.settled !== "boolean") record.settled = false;
  return record;
}

function canPredictFixture(event, stateInfo) {
  if (!event?.idEvent) return false;
  if (stateInfo?.key !== "upcoming") return false;
  const kickoff = fixtureKickoffDate(event);
  if (!kickoff) return true;
  return kickoff.getTime() > Date.now();
}

function settleFamilyPredictions() {
  ensureFamilyLeagueState();
  if (!accountSignedIn()) return false;
  const currentId = currentFamilyMemberId();
  const eventsById = allKnownEventsById();
  let changed = false;
  Object.values(state.familyLeague.predictions || {}).forEach((record) => {
    if (!record || record.settled || !record.eventId) return;
    const event = eventsById.get(record.eventId);
    if (!event) return;
    const stateInfo = eventState(event);
    const home = numericScore(event.intHomeScore);
    const away = numericScore(event.intAwayScore);
    if (stateInfo.key !== "final" || home === null || away === null) return;
    const finalResult = predictionResultCode(home, away);
    Object.entries(record.entries || {}).forEach(([memberId, pick]) => {
      if (memberId !== currentId || !pick || pick.scored) return;
      const predHome = Number(pick.home);
      const predAway = Number(pick.away);
      if (!Number.isFinite(predHome) || !Number.isFinite(predAway)) return;
      let points = 0;
      if (predHome === home && predAway === away) {
        points = 2;
      } else if (predictionResultCode(predHome, predAway) === finalResult) {
        points = 1;
      }
      if (points > 0) {
        addFamilyPoints(points);
      }
      pick.scored = true;
      pick.awarded = points;
      changed = true;
    });
    record.settled = true;
    record.finalHome = home;
    record.finalAway = away;
    changed = true;
  });
  if (changed) {
    persistLocalMetaState();
    scheduleCloudStateSync();
    scheduleLeagueStandingsRefresh();
  }
  return changed;
}

function currentUserPredictionForEvent(event) {
  if (!event?.idEvent) return null;
  ensureFamilyLeagueState();
  const memberId = currentFamilyMemberId();
  if (!memberId) return null;
  const record = state.familyLeague.predictions?.[event.idEvent];
  const pick = record?.entries?.[memberId];
  if (!pick) return null;
  return { record, pick };
}

function ensureFixtureBadgeContainer(summaryEl) {
  if (!summaryEl) return null;
  let container = summaryEl.querySelector(".fixture-corner-badges");
  if (container) return container;
  container = document.createElement("div");
  container.className = "fixture-corner-badges";
  summaryEl.appendChild(container);
  return container;
}

function renderFixtureBadges(summaryEl, event, { pinned = false } = {}) {
  const container = ensureFixtureBadgeContainer(summaryEl);
  if (!container) return;
  container.innerHTML = "";

  if (pinned) {
    const pinnedEl = document.createElement("span");
    pinnedEl.className = "fixture-ribbon";
    pinnedEl.textContent = "Pinned Team";
    container.appendChild(pinnedEl);
  }

  if (currentUserPredictionForEvent(event)) {
    const predictedEl = document.createElement("span");
    predictedEl.className = "fixture-ribbon fixture-ribbon-predicted";
    predictedEl.textContent = "✓ Predicted";
    container.appendChild(predictedEl);
  }
}

function refreshVisibleFixturePredictionBadges() {
  const nodes = [...(el.fixturesList?.querySelectorAll(".fixture-item") || [])];
  if (!nodes.length) return;
  const eventsByKey = new Map(selectedEventsForCurrentView().map((event) => [fixtureKey(event), event]));
  nodes.forEach((node) => {
    const key = node.dataset.fixtureKey || "";
    const event = eventsByKey.get(key);
    if (!event) return;
    const summaryEl = node.querySelector("summary");
    const favName = state.favoriteTeam?.strTeam || "";
    const homeName = event.strHomeTeam || "TBC";
    const awayName = event.strAwayTeam || "TBC";
    const hasFavorite = Boolean(favName && (homeName === favName || awayName === favName));
    renderFixtureBadges(summaryEl, event, { pinned: hasFavorite });
  });
}

function buildPredictionModule(event, stateInfo) {
  ensureFamilyLeagueState();
  const currentId = currentFamilyMemberId();
  const activeMember = accountSignedIn() ? { id: currentId, name: state.account.user?.name || "You" } : null;
  const record = ensurePredictionRecord(event);
  const memberPick = activeMember && record ? record.entries?.[currentId] : null;
  const canPredict = canPredictFixture(event, stateInfo) && Boolean(activeMember) && Boolean(record && !record.settled);
  const isCompleted = stateInfo?.key === "final";
  const showReadonly = Boolean(memberPick) && (isCompleted || !canPredict);
  if (!canPredict && !showReadonly) {
    return null;
  }

  const wrapper = document.createElement("section");
  wrapper.className = "fixture-predict";
  const homeTeam = event?.strHomeTeam || "Home";
  const awayTeam = event?.strAwayTeam || "Away";
  const kickoff = fixtureKickoffDate(event);
  const lockReason = !event?.idEvent
    ? "Prediction unavailable for this fixture."
    : !activeMember
    ? "Sign in to submit your prediction."
    : stateInfo.key !== "upcoming"
      ? "Predictions close when the match starts."
      : kickoff && kickoff.getTime() <= Date.now()
        ? "Predictions are now locked for this fixture."
        : "";

  if (showReadonly) {
    const awarded = Number(memberPick?.awarded || 0);
    const pointsText = awarded > 0 ? ` • +${awarded} pts` : " • 0 pts";
    wrapper.innerHTML = `
      <div class="predict-head">Your prediction</div>
      <div class="predict-status ${awarded > 0 ? "success" : ""}">
        ${escapeHtml(`${homeTeam} ${memberPick.home} - ${memberPick.away} ${awayTeam}`)}${escapeHtml(pointsText)}
      </div>
    `;
    if (awarded === 2) {
      wrapper.querySelector(".predict-status")?.insertAdjacentHTML("beforeend", ` <span class="predict-success-label">Perfect Scoreline</span>`);
    } else if (awarded === 1) {
      wrapper.querySelector(".predict-status")?.insertAdjacentHTML("beforeend", ` <span class="predict-success-label">Correct Result</span>`);
    }
    return wrapper;
  }

  wrapper.innerHTML = `
    <div class="predict-head">Predict the score?</div>
    <div class="predict-form">
      <div class="predict-score-stack">
        <span class="predict-team-label" title="${escapeHtml(homeTeam)}">Home: ${escapeHtml(homeTeam)}</span>
        <button class="btn predict-step-btn plus" type="button" data-step-target="home" aria-label="Increase home score">+</button>
        <input class="predict-input" inputmode="numeric" pattern="[0-9]*" min="0" max="20" type="number" step="1" placeholder="0" aria-label="Home team score" />
        <button class="btn predict-step-btn minus" type="button" data-step-target="home" aria-label="Decrease home score">-</button>
      </div>
      <span class="predict-score-sep">-</span>
      <div class="predict-score-stack">
        <span class="predict-team-label" title="${escapeHtml(awayTeam)}">Away: ${escapeHtml(awayTeam)}</span>
        <button class="btn predict-step-btn plus" type="button" data-step-target="away" aria-label="Increase away score">+</button>
        <input class="predict-input" inputmode="numeric" pattern="[0-9]*" min="0" max="20" type="number" step="1" placeholder="0" aria-label="Away team score" />
        <button class="btn predict-step-btn minus" type="button" data-step-target="away" aria-label="Decrease away score">-</button>
      </div>
      <button class="btn predict-save-btn" type="button">${memberPick ? "Update Pick" : "Save Pick"}</button>
    </div>
    <div class="predict-status"></div>
  `;
  const inputs = wrapper.querySelectorAll(".predict-input");
  const saveBtn = wrapper.querySelector(".predict-save-btn");
  const status = wrapper.querySelector(".predict-status");
  const homeInput = inputs[0];
  const awayInput = inputs[1];
  const step = (targetInput, delta) => {
    const current = Number(targetInput.value || 0);
    const next = Math.max(0, Math.min(20, Number.isFinite(current) ? current + delta : Math.max(0, delta)));
    targetInput.value = String(next);
    updateDraftStatus();
  };
  const updateDraftStatus = () => {
    if (!status || record?.settled || !activeMember) return;
    const home = Number(homeInput.value);
    const away = Number(awayInput.value);
    if (Number.isInteger(home) && home >= 0 && Number.isInteger(away) && away >= 0) {
      status.classList.remove("success");
      status.textContent = `Ready: ${home}-${away} for ${activeMember.name}`;
    }
  };
  wrapper.querySelectorAll("button[data-step-target='home'].plus").forEach((btn) => btn.addEventListener("click", () => step(homeInput, 1)));
  wrapper.querySelectorAll("button[data-step-target='home'].minus").forEach((btn) => btn.addEventListener("click", () => step(homeInput, -1)));
  wrapper.querySelectorAll("button[data-step-target='away'].plus").forEach((btn) => btn.addEventListener("click", () => step(awayInput, 1)));
  wrapper.querySelectorAll("button[data-step-target='away'].minus").forEach((btn) => btn.addEventListener("click", () => step(awayInput, -1)));
  if (memberPick) {
    homeInput.value = String(memberPick.home);
    awayInput.value = String(memberPick.away);
  }
  if (record?.settled && memberPick) {
    const extra = Number.isFinite(Number(memberPick.awarded)) ? ` • +${Number(memberPick.awarded)} pts` : "";
    status.textContent = `Final: ${record.finalHome}-${record.finalAway}. Your pick: ${memberPick.home}-${memberPick.away}${extra}`;
    if (Number(memberPick.awarded) === 2) {
      status.insertAdjacentHTML("beforeend", ` <span class="predict-success-label">Perfect Scoreline</span>`);
    } else if (Number(memberPick.awarded) === 1) {
      status.insertAdjacentHTML("beforeend", ` <span class="predict-success-label">Correct Result</span>`);
    }
  } else if (memberPick) {
    status.textContent = `Your pick: ${homeTeam} ${memberPick.home}-${memberPick.away} ${awayTeam}${activeMember ? ` (${activeMember.name})` : ""}`;
  } else if (lockReason) {
    status.textContent = lockReason;
  } else if (activeMember) {
    status.textContent = `Saving for ${activeMember.name}`;
  }
  if (!canPredict) {
    saveBtn.disabled = true;
    homeInput.disabled = true;
    awayInput.disabled = true;
    wrapper.querySelectorAll(".predict-step-btn").forEach((btn) => {
      btn.disabled = true;
    });
    return wrapper;
  }
  saveBtn.addEventListener("click", () => {
    const home = Number(homeInput.value);
    const away = Number(awayInput.value);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      status.textContent = "Enter valid whole-number scores.";
      return;
    }
    const freshRecord = ensurePredictionRecord(event);
    freshRecord.entries[currentId] = {
      home,
      away,
      submittedAt: new Date().toISOString(),
      scored: false,
      awarded: 0,
    };
    persistLocalMetaState();
    scheduleCloudStateSync();
    status.textContent = `Saved ✓ ${home}-${away} for ${activeMember.name}`;
    status.classList.add("success");
    refreshVisibleFixturePredictionBadges();
    scheduleLeagueStandingsRefresh(400);
    renderFamilyLeaguePanel();
  });
  homeInput.addEventListener("input", updateDraftStatus);
  awayInput.addEventListener("input", updateDraftStatus);
  return wrapper;
}

function detailRowsFromEvent(event, stateInfo) {
  return [
    { label: "League", value: event.strLeague || "" },
    { label: "Kickoff", value: formatDateTime(event.dateEvent, event.strTime) },
    { label: "Venue", value: event.strVenue || "" },
    { label: "Match State", value: stateInfo.label },
    { label: "Status", value: event.strStatus || "" },
    { label: "Season", value: event.strSeason || "" },
    { label: "Round", value: event.intRound || "" },
    { label: "Referee", value: event.strReferee || "" },
    { label: "Attendance", value: event.intSpectators || "" },
  ].filter((row) => row.value !== "" && row.value !== null && row.value !== undefined);
}

function renderDetailRows(rows) {
  if (!rows.length) return "";
  return `<div class="detail-grid">${rows
    .map((row) => `<div class="detail-row"><span class="detail-label">${escapeHtml(row.label)}</span><span class="detail-value">${escapeHtml(row.value)}</span></div>`)
    .join("")}</div>`;
}

function normalizedStats(stats) {
  if (!Array.isArray(stats)) return [];
  return stats
    .map((row) => ({
      label: row.strStat || row.strType || "",
      home: row.strHome || row.intHome || row.strValue1 || "",
      away: row.strAway || row.intAway || row.strValue2 || "",
    }))
    .filter((row) => row.label && row.home !== "" && row.away !== "");
}

function renderStatsTable(stats) {
  const rows = normalizedStats(stats).slice(0, 8);
  if (!rows.length) return "";
  const body = rows
    .map(
      (row) =>
        `<div class="stat-row"><span class="stat-label">${escapeHtml(row.label)}</span><span class="stat-home">${escapeHtml(row.home)}</span><span class="stat-sep">-</span><span class="stat-away">${escapeHtml(row.away)}</span></div>`
    )
    .join("");
  return `<div class="stats-block"><p class="stats-title">Match Stats</p>${body}</div>`;
}

function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return "";
}

function eventHighlightsUrl(event) {
  if (!event || typeof event !== "object") return "";
  const candidates = [
    event.strVideo,
    event.strVideo1,
    event.strVideo2,
    event.strVideo3,
    event.strHighlights,
    event.strHighlight,
  ];
  for (const candidate of candidates) {
    const url = normalizeHttpUrl(candidate);
    if (url) return url;
  }
  return "";
}

function renderHighlightsBlock(event, stateInfo) {
  if (!event || stateInfo?.key !== "final") return "";
  const url = eventHighlightsUrl(event);
  if (!url) return "";
  return `
    <div class="highlights-block">
      <p class="stats-title">Highlights</p>
      <a class="btn highlights-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Watch Highlights ↗</a>
    </div>
  `;
}

async function getRichEventData(eventId) {
  if (!eventId) return null;
  if (state.eventDetailCache[eventId]) return state.eventDetailCache[eventId];
  const payload = await Promise.all([
    safeLoad(() => fetchEventById(eventId), null),
    safeLoad(() => fetchEventStats(eventId), []),
  ]);
  const rich = {
    event: payload[0],
    stats: payload[1],
  };
  state.eventDetailCache[eventId] = rich;
  return rich;
}

async function hydrateFixtureDetails(detailsEl, event, stateInfo) {
  if (!detailsEl) return;
  const eventId = event?.idEvent || "";
  const baseRows = detailRowsFromEvent(event, stateInfo);
  if (!eventId) {
    detailsEl.innerHTML = `${renderDetailRows(baseRows)}<p class="detail-empty">No extra data available.</p>`;
    return;
  }

  detailsEl.classList.add("loading");
  detailsEl.innerHTML = `${renderDetailRows(baseRows)}<p class="detail-empty">Loading match details...</p>`;
  const rich = await getRichEventData(eventId);
  const core = { ...(event || {}), ...(rich?.event || {}) };
  const resolvedState = eventState(core);
  const rows = detailRowsFromEvent(core, resolvedState);
  const statsHtml = renderStatsTable(rich?.stats);
  const highlightsHtml = renderHighlightsBlock(core, resolvedState);
  const hasExtra = Boolean(statsHtml || highlightsHtml);
  detailsEl.innerHTML = `${renderDetailRows(rows)}${statsHtml}${highlightsHtml}${hasExtra ? "" : '<p class="detail-empty">No extra match data for this fixture.</p>'}`;
  const predictionModule = buildPredictionModule(event, resolvedState);
  if (predictionModule) {
    detailsEl.appendChild(predictionModule);
  }
  detailsEl.classList.remove("loading");
}

function teamFormFromEvents(events, team) {
  const completed = (events || [])
    .filter((e) => {
      const hs = numericScore(e.intHomeScore);
      const as = numericScore(e.intAwayScore);
      if (hs === null || as === null) return false;
      return isTeamMatch(e, team);
    })
    .sort((a, b) => `${b.dateEvent || ""}T${b.strTime || ""}`.localeCompare(`${a.dateEvent || ""}T${a.strTime || ""}`))
    .slice(0, 5)
    .map((e) => {
      const hs = Number(e.intHomeScore);
      const as = Number(e.intAwayScore);
      const teamId = String(team.idTeam || "").trim();
      const isHomeById = teamId && String(e.idHomeTeam || "").trim() === teamId;
      const isHomeByName = normalizeTeamLabel(e.strHomeTeam) === normalizeTeamLabel(team.strTeam);
      const isHome = Boolean(isHomeById || isHomeByName);
      const teamScore = isHome ? hs : as;
      const oppScore = isHome ? as : hs;
      if (teamScore > oppScore) return "W";
      if (teamScore < oppScore) return "L";
      return "D";
    });
  return completed;
}

function mergeUniqueEvents(events) {
  const map = new Map();
  (events || []).forEach((event) => {
    if (!event) return;
    const key = fixtureKey(event) || `${event.dateEvent || ""}|${event.strHomeTeam || ""}|${event.strAwayTeam || ""}`;
    if (!key) return;
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, ...event } : event);
  });
  return [...map.values()];
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
    node.dataset.fixtureKey = key;
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
      const prev = state.fixtureScoreSnapshot.get(key);
      const homeChanged = prev && prev.home !== Number(home);
      const awayChanged = prev && prev.away !== Number(away);
      if (homeChanged) {
        homeScoreEl.classList.add("score-update");
        homeInlineScoreEl.classList.add("score-update");
      }
      if (awayChanged) {
        awayScoreEl.classList.add("score-update");
        awayInlineScoreEl.classList.add("score-update");
      }
      state.fixtureScoreSnapshot.set(key, { home: Number(home), away: Number(away) });
      if (Number(home) > Number(away)) {
        homeScoreEl.classList.add("leading");
        homeInlineScoreEl.classList.add("leading");
      }
      if (Number(away) > Number(home)) {
        awayScoreEl.classList.add("leading");
        awayInlineScoreEl.classList.add("leading");
      }
    }

    const detailsEl = node.querySelector(".fixture-details");
    detailsEl.innerHTML = renderDetailRows(detailRowsFromEvent(event, stateInfo));

    const favName = state.favoriteTeam?.strTeam || "";
    const hasFavorite = Boolean(favName && (homeName === favName || awayName === favName));
    if (hasFavorite) {
      node.classList.add("has-favorite");
    }
    renderFixtureBadges(node.querySelector("summary"), event, { pinned: hasFavorite });

    if (state.focusedFixtureKey) {
      node.classList.toggle("fixture-focus", state.focusedFixtureKey === key);
      node.classList.toggle("fixture-dimmed", state.focusedFixtureKey !== key);
    }

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

    const summaryEl = node.querySelector("summary");
    summaryEl?.addEventListener("click", (ev) => {
      if (!isMobileViewport()) return;
      ev.stopPropagation();
      const isSame = state.focusedFixtureKey === key;
      state.focusedFixtureKey = isSame ? "" : key;
      [...target.querySelectorAll(".fixture-item")].forEach((item) => {
        const itemKey = item.dataset.fixtureKey || "";
        const focused = Boolean(state.focusedFixtureKey && state.focusedFixtureKey === itemKey);
        item.classList.toggle("fixture-focus", focused);
        item.classList.toggle("fixture-dimmed", Boolean(state.focusedFixtureKey) && !focused);
      });
    });

    node.addEventListener("toggle", async () => {
      if (node.open) {
        state.openFixtureKey = key;
        [...target.querySelectorAll(".fixture-item")].forEach((other) => {
          if (other === node) return;
          other.open = false;
        });
        await hydrateFixtureDetails(detailsEl, event, stateInfo);
      } else if (state.openFixtureKey === key) {
        state.openFixtureKey = "";
      }
    });

    if (state.openFixtureKey && state.openFixtureKey === key) {
      node.open = true;
      hydrateFixtureDetails(detailsEl, event, stateInfo);
    }

    target.appendChild(node);
  });
}

function tableBandClass(leagueCode, rank) {
  const r = Number(rank || 0);
  if (!Number.isFinite(r) || r <= 0) return "";
  if (leagueCode === "EPL") {
    if (r <= 4) return "table-band-europe";
    if (r >= 18) return "table-band-relegation";
    return "";
  }
  if (leagueCode === "CHAMP") {
    if (r <= 2) return "table-band-promotion";
    if (r >= 3 && r <= 6) return "table-band-playoff";
    if (r >= 22) return "table-band-relegation";
  }
  return "";
}

function tableBandLegendHtml(leagueCode) {
  if (leagueCode === "EPL") {
    return `<div class="table-band-legend">
      <span class="legend-pill europe">Top 4: Europe</span>
      <span class="legend-pill relegation">Bottom 3: Relegation</span>
    </div>`;
  }
  if (leagueCode === "CHAMP") {
    return `<div class="table-band-legend">
      <span class="legend-pill promotion">Top 2: Promotion</span>
      <span class="legend-pill playoff">3-6: Playoffs</span>
      <span class="legend-pill relegation">Bottom 3: Relegation</span>
    </div>`;
  }
  return "";
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
    card.insertAdjacentHTML("beforeend", tableBandLegendHtml(key));

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
        const bandClass = tableBandClass(key, row.intRank);
        if (bandClass) tr.classList.add(bandClass);
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

function normalizeDateIsoInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return toISODate(new Date());
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return toISODate(new Date());
  return clampDateToFixtureWindow(toISODate(parsed));
}

async function refreshSelectedDateFixtures(dateIso = state.selectedDate, seq = state.selectedDateLoadSeq) {
  const now = new Date();
  const prev = new Date(now);
  prev.setDate(now.getDate() - 1);
  const next = new Date(now);
  next.setDate(now.getDate() + 1);

  const prevIso = toISODate(prev);
  const todayIso = toISODate(now);
  const nextIso = toISODate(next);

  if (dateIso === todayIso) {
    if (seq !== state.selectedDateLoadSeq || dateIso !== state.selectedDate) return false;
    state.selectedDateFixtures.EPL = [...state.fixtures.today.EPL];
    state.selectedDateFixtures.CHAMP = [...state.fixtures.today.CHAMP];
    setDateFixtureCache(dateIso, { EPL: state.selectedDateFixtures.EPL, CHAMP: state.selectedDateFixtures.CHAMP });
    return true;
  }

  if (dateIso === prevIso) {
    if (seq !== state.selectedDateLoadSeq || dateIso !== state.selectedDate) return false;
    state.selectedDateFixtures.EPL = [...state.fixtures.previous.EPL];
    state.selectedDateFixtures.CHAMP = [...state.fixtures.previous.CHAMP];
    setDateFixtureCache(dateIso, { EPL: state.selectedDateFixtures.EPL, CHAMP: state.selectedDateFixtures.CHAMP });
    return true;
  }

  if (dateIso === nextIso) {
    if (seq !== state.selectedDateLoadSeq || dateIso !== state.selectedDate) return false;
    state.selectedDateFixtures.EPL = [...state.fixtures.next.EPL];
    state.selectedDateFixtures.CHAMP = [...state.fixtures.next.CHAMP];
    setDateFixtureCache(dateIso, { EPL: state.selectedDateFixtures.EPL, CHAMP: state.selectedDateFixtures.CHAMP });
    return true;
  }

  const cached = getDateFixtureCache(dateIso);
  let epl = cached?.EPL;
  let champ = cached?.CHAMP;
  const needEpl = state.selectedLeague === "ALL" ? !Array.isArray(epl) : state.selectedLeague === "EPL" && !Array.isArray(epl);
  const needChamp = state.selectedLeague === "ALL" ? !Array.isArray(champ) : state.selectedLeague === "CHAMP" && !Array.isArray(champ);

  const [fetchedEpl, fetchedChamp] = await Promise.all([
    needEpl ? safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dateIso), []) : Promise.resolve(epl || []),
    needChamp ? safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dateIso), []) : Promise.resolve(champ || []),
  ]);

  if (needEpl) epl = fetchedEpl;
  if (needChamp) champ = fetchedChamp;
  setDateFixtureCache(dateIso, { EPL: Array.isArray(epl) ? epl : [], CHAMP: Array.isArray(champ) ? champ : [] });

  const prefetchedCache = getDateFixtureCache(dateIso);
  // Background prefetch for the other league when user is focused on one league.
  if (state.selectedLeague !== "ALL") {
    const otherLeague = state.selectedLeague === "EPL" ? "CHAMP" : "EPL";
    const otherMissing = !Array.isArray(prefetchedCache?.[otherLeague]);
    if (otherMissing) {
      safeLoad(async () => {
        const rows = await fetchLeagueDayFixtures(LEAGUES[otherLeague].id, dateIso);
        setDateFixtureCache(dateIso, { [otherLeague]: rows });
      }, null);
    }
  }

  if (seq !== state.selectedDateLoadSeq || dateIso !== state.selectedDate) return false;
  const resolved = getDateFixtureCache(dateIso);
  state.selectedDateFixtures.EPL = [...(resolved?.EPL || [])].sort(fixtureSort);
  state.selectedDateFixtures.CHAMP = [...(resolved?.CHAMP || [])].sort(fixtureSort);
  return true;
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

function getDateFixtureCache(dateIso) {
  const entry = state.dateFixturesCache?.[dateIso];
  if (!entry || typeof entry !== "object") return null;
  return {
    EPL: Array.isArray(entry.EPL) ? entry.EPL : null,
    CHAMP: Array.isArray(entry.CHAMP) ? entry.CHAMP : null,
    updatedAt: Number(entry.updatedAt || 0),
  };
}

function setDateFixtureCache(dateIso, next = {}) {
  if (!dateIso) return;
  const prev = getDateFixtureCache(dateIso) || { EPL: null, CHAMP: null, updatedAt: 0 };
  state.dateFixturesCache[dateIso] = {
    EPL: Array.isArray(next.EPL) ? [...next.EPL] : prev.EPL,
    CHAMP: Array.isArray(next.CHAMP) ? [...next.CHAMP] : prev.CHAMP,
    updatedAt: Date.now(),
  };
}

async function setSelectedDate(dateIso) {
  const normalized = normalizeDateIsoInput(dateIso);
  state.selectedDate = normalized;
  const seq = ++state.selectedDateLoadSeq;
  const applied = await refreshSelectedDateFixtures(normalized, seq);
  if (!applied) return;
  if (seq !== state.selectedDateLoadSeq || normalized !== state.selectedDate) return;
  renderFixtures();
}

function scheduleSelectedDateChange(dateIso, delayMs = 35) {
  const nextIso = normalizeDateIsoInput(dateIso);
  if (state.selectedDateTimer) {
    clearTimeout(state.selectedDateTimer);
    state.selectedDateTimer = null;
  }
  state.selectedDateTimer = setTimeout(() => {
    state.selectedDateTimer = null;
    setSelectedDate(nextIso);
  }, delayMs);
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
    const bounds = fixtureWindowBounds();
    el.datePicker.min = bounds.minIso;
    el.datePicker.max = bounds.maxIso;
  }
  if (el.stickyDateLabel) {
    const d = state.selectedDate ? new Date(`${state.selectedDate}T00:00:00`) : new Date();
    el.stickyDateLabel.textContent = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  setDateButtonState();
  renderMobileSectionLayout();
}

function selectedEventsForCurrentView() {
  return state.selectedLeague === "ALL"
    ? [...state.selectedDateFixtures.EPL, ...state.selectedDateFixtures.CHAMP]
    : [...state.selectedDateFixtures[state.selectedLeague]];
}

function leagueCodeFromLeagueId(leagueId) {
  if (String(leagueId) === String(LEAGUES.EPL.id)) return "EPL";
  if (String(leagueId) === String(LEAGUES.CHAMP.id)) return "CHAMP";
  return "";
}

function upsertEvents(target, updates) {
  if (!Array.isArray(target) || !Array.isArray(updates) || !updates.length) return target || [];
  const byKey = new Map((target || []).map((event) => [fixtureKey(event), event]));
  updates.forEach((event) => {
    if (!event || typeof event !== "object") return;
    const key = fixtureKey(event);
    if (!key) return;
    const current = byKey.get(key);
    byKey.set(key, current ? { ...current, ...event } : event);
  });
  return [...byKey.values()].sort(fixtureSort);
}

function applyLiveStreamUpdate(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.version && payload.version === state.liveStream.lastVersion) return;
  if (payload.version) state.liveStream.lastVersion = payload.version;

  const leagues = payload.leagues && typeof payload.leagues === "object" ? payload.leagues : {};
  Object.entries(leagues).forEach(([leagueId, events]) => {
    const code = leagueCodeFromLeagueId(leagueId);
    if (!code || !Array.isArray(events) || !events.length) return;
    if (payload.full) {
      state.fixtures.today[code] = events.sort(fixtureSort);
    } else {
      state.fixtures.today[code] = upsertEvents(state.fixtures.today[code], events);
    }
    state.fixtures.live[code] = state.fixtures.today[code].filter((event) => eventState(event).key === "live");
    if (state.selectedDate === toISODate(new Date())) {
      state.selectedDateFixtures[code] = [...state.fixtures.today[code]];
    }
  });

  detectGoalFlashes();
  const currentEvents = selectedEventsForCurrentView();
  const canPatchLive =
    state.selectedDate === toISODate(new Date()) &&
    canPatchFixtureRows(currentEvents) &&
    currentEvents.some((event) => eventState(event).key === "live");

  if (canPatchLive) {
    patchVisibleFixtureRows(currentEvents);
  } else {
    renderFixtures();
  }
  safeLoad(() => renderFavorite(), null);
}

function stopLiveStream() {
  if (state.liveStream.reconnectTimer) {
    clearTimeout(state.liveStream.reconnectTimer);
    state.liveStream.reconnectTimer = null;
  }
  if (state.liveStream.es) {
    state.liveStream.es.close();
    state.liveStream.es = null;
  }
  state.liveStream.connected = false;
}

function startLiveStream() {
  stopLiveStream();
  if (typeof EventSource === "undefined") return;
  const es = new EventSource(`${API_PROXY_BASE}/v1/ezra/live/stream`);
  state.liveStream.es = es;
  es.addEventListener("open", () => {
    state.liveStream.connected = true;
  });
  es.addEventListener("update", (event) => {
    try {
      const payload = JSON.parse(event.data || "{}");
      applyLiveStreamUpdate(payload);
    } catch (err) {
      console.error("Live stream payload parse failed", err);
    }
  });
  es.addEventListener("error", () => {
    state.liveStream.connected = false;
    if (state.liveStream.reconnectTimer) return;
    state.liveStream.reconnectTimer = setTimeout(() => {
      state.liveStream.reconnectTimer = null;
      startLiveStream();
    }, 4000);
  });
}

function setMobileTab(tab) {
  const safe = ["fixtures", "table", "fun"].includes(tab) ? tab : "fixtures";
  state.mobileTab = safe;
  renderMobileSectionLayout();
}

function renderMobileSectionLayout() {
  const mobile = isMobileViewport();
  const controls = el.controlsPanel;
  const fixtures = document.getElementById("fixtures-panel");
  const tables = document.getElementById("table-panel");
  const fun = document.getElementById("fun-zone-panel");
  if (!controls || !fixtures || !tables || !fun) return;

  if (!mobile) {
    el.mobileTabsPanel?.classList.add("hidden");
    controls.classList.remove("hidden");
    fixtures.classList.remove("hidden");
    tables.classList.remove("hidden");
    fun.classList.remove("hidden");
    return;
  }

  el.mobileTabsPanel?.classList.remove("hidden");
  el.mobileTabButtons.forEach((btn) => {
    const active = btn.dataset.mobileTab === state.mobileTab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  controls.classList.toggle("hidden", state.mobileTab === "table");
  fixtures.classList.toggle("hidden", state.mobileTab !== "fixtures");
  tables.classList.toggle("hidden", state.mobileTab !== "table");
  fun.classList.toggle("hidden", state.mobileTab !== "fun");
}

function canPatchFixtureRows(events) {
  if (!Array.isArray(events) || !events.length) return false;
  const nodes = [...(el.fixturesList?.querySelectorAll(".fixture-item") || [])];
  if (!nodes.length || nodes.length !== events.length) return false;
  const keys = new Set(events.map((event) => fixtureKey(event)));
  return nodes.every((node) => keys.has(node.dataset.fixtureKey || ""));
}

function patchVisibleFixtureRows(events) {
  if (!el.fixturesList) return false;
  const byKey = new Map(events.map((event) => [fixtureKey(event), event]));
  const nodes = [...el.fixturesList.querySelectorAll(".fixture-item")];
  if (!nodes.length) return false;

  nodes.forEach((node) => {
    const key = node.dataset.fixtureKey || "";
    const event = byKey.get(key);
    if (!event) return;
    const stateInfo = eventState(event);
    const summaryEl = node.querySelector("summary");
    const statusEl = node.querySelector(".match-state");
    const homeScoreEl = node.querySelector(".home-score");
    const awayScoreEl = node.querySelector(".away-score");
    const homeInlineScoreEl = node.querySelector(".home-inline-score");
    const awayInlineScoreEl = node.querySelector(".away-inline-score");
    const goalFlashEl = node.querySelector(".goal-flash");

    if (statusEl) {
      statusEl.classList.remove("live", "upcoming", "final");
      statusEl.classList.add(stateInfo.key);
      statusEl.textContent = stateInfo.label;
    }
    const favName = state.favoriteTeam?.strTeam || "";
    const homeName = event.strHomeTeam || "TBC";
    const awayName = event.strAwayTeam || "TBC";
    const hasFavorite = Boolean(favName && (homeName === favName || awayName === favName));
    node.classList.toggle("has-favorite", hasFavorite);
    renderFixtureBadges(summaryEl, event, { pinned: hasFavorite });

    const home = event.intHomeScore;
    const away = event.intAwayScore;
    const hasScores = home !== null && home !== undefined && away !== null && away !== undefined;
    const homeText = hasScores ? String(home) : "–";
    const awayText = hasScores ? String(away) : "–";
    [homeScoreEl, awayScoreEl, homeInlineScoreEl, awayInlineScoreEl].forEach((elNode) => {
      elNode?.classList.remove("leading", "score-update");
    });
    if (homeScoreEl) homeScoreEl.textContent = homeText;
    if (awayScoreEl) awayScoreEl.textContent = awayText;
    if (homeInlineScoreEl) homeInlineScoreEl.textContent = homeText;
    if (awayInlineScoreEl) awayInlineScoreEl.textContent = awayText;

    if (hasScores) {
      const prev = state.fixtureScoreSnapshot.get(key);
      const homeChanged = prev && prev.home !== Number(home);
      const awayChanged = prev && prev.away !== Number(away);
      if (homeChanged) {
        homeScoreEl?.classList.add("score-update");
        homeInlineScoreEl?.classList.add("score-update");
      }
      if (awayChanged) {
        awayScoreEl?.classList.add("score-update");
        awayInlineScoreEl?.classList.add("score-update");
      }
      state.fixtureScoreSnapshot.set(key, { home: Number(home), away: Number(away) });
      if (Number(home) > Number(away)) {
        homeScoreEl?.classList.add("leading");
        homeInlineScoreEl?.classList.add("leading");
      }
      if (Number(away) > Number(home)) {
        awayScoreEl?.classList.add("leading");
        awayInlineScoreEl?.classList.add("leading");
      }
    }

    if (goalFlashEl) {
      const goalFlash = state.goalFlashes.get(key);
      if (goalFlash && goalFlash.expiresAt > Date.now() && (stateInfo.key === "live" || goalFlash.force)) {
        goalFlashEl.classList.remove("hidden");
        goalFlashEl.classList.add("active");
        const team = goalFlashEl.querySelector(".goal-team-name");
        const score = goalFlashEl.querySelector(".goal-scoreline");
        if (team) team.textContent = goalFlash.team;
        if (score) score.textContent = goalFlash.score;
      } else {
        goalFlashEl.classList.add("hidden");
        goalFlashEl.classList.remove("active");
      }
    }
  });
  return true;
}

function renderFixtureSkeletons(count = 6) {
  if (!el.fixturesList) return;
  el.fixturesList.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.className = "fixture-skeleton";
    row.innerHTML = `
      <span class="skeleton-line w-20"></span>
      <span class="skeleton-line w-65"></span>
      <span class="skeleton-line w-45"></span>
    `;
    el.fixturesList.appendChild(row);
  }
}

function renderTableSkeletons(count = 2) {
  if (!el.tablesWrap) return;
  el.tablesWrap.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.className = "table-skeleton";
    row.innerHTML = `
      <span class="skeleton-line w-40"></span>
      <span class="skeleton-line w-90"></span>
      <span class="skeleton-line w-90"></span>
      <span class="skeleton-line w-90"></span>
    `;
    el.tablesWrap.appendChild(row);
  }
}

function updateStickyDateBarVisibility() {
  if (!el.stickyDateBar || !el.controlsPanel) return;
  if (!isMobileViewport()) {
    el.stickyDateBar.classList.add("hidden");
    return;
  }
  const rect = el.controlsPanel.getBoundingClientRect();
  const shouldShow = rect.bottom < 70;
  el.stickyDateBar.classList.toggle("hidden", !shouldShow);
}

function initRevealOnScroll() {
  const revealTargets = document.querySelectorAll(".hero-bar, .favorite-banner, .panel, .footer");
  revealTargets.forEach((item, idx) => {
    item.classList.add("reveal-on-scroll");
    item.style.setProperty("--reveal-delay", `${idx * 35}ms`);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
        }
      });
    },
    { threshold: 0.2 }
  );

  revealTargets.forEach((item) => observer.observe(item));
}

function buildFavoriteOptions() {
  if (!el.favoritePickerMenu) return;
  const allTeams = [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP];
  const validTeams = allTeams.filter((t) => t && t.idTeam && t.strTeam);
  const uniqueTeams = Array.from(new Map(validTeams.map((t) => [t.idTeam, t])).values());
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
    if (!localStorage.getItem("ezra_player_pop_scope")) {
      setPlayerPopScope("any");
    }
    closeFavoritePickerMenu();
    await renderFavorite();
    scheduleCloudStateSync();
  });
  el.favoritePickerMenu.appendChild(clearBtn);

  if (!byName.length) {
    const empty = document.createElement("div");
    empty.className = "favorite-option";
    empty.setAttribute("aria-live", "polite");
    empty.innerHTML = `
      <span class="option-text">
        <span class="option-team">No teams available right now</span>
        <span class="option-league">Please try again in a moment</span>
      </span>
    `;
    el.favoritePickerMenu.appendChild(empty);
    setFavoritePickerDisplay(null);
    return;
  }

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
      if (!localStorage.getItem("ezra_player_pop_scope")) {
        setPlayerPopScope("favorite");
      }
      setFavoritePickerDisplay(team);
      closeFavoritePickerMenu();
      await renderFavorite();
      scheduleCloudStateSync();
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

function rebuildTeamBadgeMap() {
  state.teamBadgeMap = {};
  [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP].forEach((team) => {
    if (team?.strTeam && team?.strBadge) {
      state.teamBadgeMap[team.strTeam] = team.strBadge;
    }
  });
}

async function ensureFavoritePickerDataLoaded() {
  if (state.teamsByLeague.EPL.length || state.teamsByLeague.CHAMP.length) return;
  const [teamsEpl, teamsChamp] = await Promise.all([
    safeLoad(() => fetchAllTeams(LEAGUES.EPL.id), []),
    safeLoad(() => fetchAllTeams(LEAGUES.CHAMP.id), []),
  ]);
  state.teamsByLeague.EPL = Array.isArray(teamsEpl) ? teamsEpl : [];
  state.teamsByLeague.CHAMP = Array.isArray(teamsChamp) ? teamsChamp : [];
  rebuildTeamBadgeMap();
  ensureDefaultFavoriteTeam();
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
    if (!isTeamMatch(e, team)) return false;
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

function renderFavoriteFormBadges(form) {
  const values = Array.isArray(form) ? form.slice(0, 5) : [];
  while (values.length < 5) values.push("-");
  return `<span class="form-label">Last 5</span>${values
    .map((r) => {
      if (r === "W") return `<span class="form-pill win">W</span>`;
      if (r === "L") return `<span class="form-pill loss">L</span>`;
      if (r === "D") return `<span class="form-pill draw">D</span>`;
      return `<span class="form-pill neutral">-</span>`;
    })
    .join("")}`;
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

function normalizeTeamLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function isTeamMatch(event, team) {
  if (!event || !team) return false;
  const teamId = String(team.idTeam || "").trim();
  const homeId = String(event.idHomeTeam || "").trim();
  const awayId = String(event.idAwayTeam || "").trim();
  if (teamId && (homeId === teamId || awayId === teamId)) return true;
  const target = normalizeTeamLabel(team.strTeam);
  if (!target) return false;
  const home = normalizeTeamLabel(event.strHomeTeam);
  const away = normalizeTeamLabel(event.strAwayTeam);
  return home === target || away === target;
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

function showFavoriteLoadingState() {
  if (el.favoriteEmpty) el.favoriteEmpty.classList.add("hidden");
  if (el.favoriteContent) el.favoriteContent.classList.remove("hidden");
  if (el.favoriteStatus) {
    el.favoriteStatus.classList.remove("gameday", "live", "final");
    el.favoriteStatus.textContent = "Loading";
  }
  if (el.favoriteFixtureLine) {
    el.favoriteFixtureLine.innerHTML = `
      <span class="skeleton-line w-65"></span>
    `;
  }
  if (el.favoriteFixtureDetail) {
    el.favoriteFixtureDetail.innerHTML = `
      <span class="skeleton-line w-45"></span>
    `;
  }
  const fixtureBlock = document.querySelector(".favorite-fixture-block");
  if (fixtureBlock) fixtureBlock.classList.add("loading");
  if (el.favoriteLiveStrip) {
    el.favoriteLiveStrip.classList.remove("hidden");
    el.favoriteLiveStrip.classList.add("ticker-static");
    el.favoriteLiveStrip.innerHTML = `
      <span class="ticker-content ticker-loading">
        <span class="skeleton-line w-90"></span>
      </span>
    `;
  }
}

function clearFavoriteLoadingVisual() {
  const fixtureBlock = document.querySelector(".favorite-fixture-block");
  if (fixtureBlock) fixtureBlock.classList.remove("loading");
}

async function renderFavorite() {
  state.favoriteDataLoading = Boolean(state.favoriteTeamId);
  if (state.favoriteDataLoading) {
    showFavoriteLoadingState();
    renderFunZone();
  }
  if (!state.favoriteTeamId) {
    clearFavoriteLoadingVisual();
    state.favoriteDataLoading = false;
    state.favoriteTeam = null;
    state.favoriteUpcomingEvent = null;
    applyClubThemeFromFavoriteTeam();
    clearFavoriteGoalCinematic();
    clearGameDayCountdownTimer();
    state.lastCountdownTarget = null;
    setGameDayMessage("Select a favourite team", "neutral");
    setFavoritePickerDisplay(null);
    if (el.favoriteForm) {
      el.favoriteForm.classList.add("hidden");
      el.favoriteForm.innerHTML = "";
    }
    if (el.favoriteFormRight) {
      el.favoriteFormRight.classList.add("hidden");
      el.favoriteFormRight.innerHTML = "";
    }
    resetFavoriteTheme();
    renderSquadPanel();
    renderDreamTeamNavState();
    requestDreamTeamRender();
    renderFunZone();
    el.favoriteEmpty.classList.remove("hidden");
    el.favoriteContent.classList.add("hidden");
    return;
  }

  const team = await safeLoad(() => fetchTeamById(state.favoriteTeamId), null);
  if (!team) {
    clearFavoriteLoadingVisual();
    state.favoriteDataLoading = false;
    state.favoriteTeamId = "";
    state.favoriteTeam = null;
    state.favoriteUpcomingEvent = null;
    applyClubThemeFromFavoriteTeam();
    localStorage.removeItem("esra_favorite_team");
    clearFavoriteGoalCinematic();
    clearGameDayCountdownTimer();
    state.lastCountdownTarget = null;
    setGameDayMessage("Select a favourite team", "neutral");
    setFavoritePickerDisplay(null);
    if (el.favoriteForm) {
      el.favoriteForm.classList.add("hidden");
      el.favoriteForm.innerHTML = "";
    }
    if (el.favoriteFormRight) {
      el.favoriteFormRight.classList.add("hidden");
      el.favoriteFormRight.innerHTML = "";
    }
    resetFavoriteTheme();
    renderSquadPanel();
    renderDreamTeamNavState();
    requestDreamTeamRender();
    renderFunZone();
    el.favoriteEmpty.classList.remove("hidden");
    el.favoriteContent.classList.add("hidden");
    return;
  }

  state.favoriteTeam = team;
  clearFavoriteLoadingVisual();
  applyClubThemeFromFavoriteTeam();
  if (team.idTeam && !state.squadByTeamId[team.idTeam]) {
    const rawPlayers = await safeLoad(() => fetchPlayersForTeam(team), []);
    state.squadByTeamId[team.idTeam] = rawPlayers
      .map((player) => normalizeSquadPlayer(player, team))
      .filter(Boolean);
  }
  renderSquadPanel();
  renderDreamTeamNavState();
  requestDreamTeamRender();
  const todayIso = toISODate(new Date());
  const lastEvents = await safeLoad(() => fetchTeamLastEvents(team.idTeam), []);
  const liveEvent = findLiveForFavorite(team.strTeam);
  const todayEvent = findTodayEventForFavorite(team.idTeam, team.strTeam);
  const todayEventDetailed = todayEvent?.idEvent ? (await safeLoad(() => fetchEventById(todayEvent.idEvent), null)) || todayEvent : todayEvent;
  const liveEventDetailed = liveEvent?.idEvent ? (await safeLoad(() => fetchEventById(liveEvent.idEvent), null)) || liveEvent : liveEvent;
  const chosenToday = liveEventDetailed || todayEventDetailed;
  const nextEvents = await safeLoad(() => fetchTeamNextEvents(team.idTeam), []);
  const windowFrom = addDaysIso(todayIso, -7);
  const windowTo = addDaysIso(todayIso, FIXTURES_FUTURE_DAYS);
  const cachedWindow = await safeLoad(() => fetchTeamWindowFixturesFromCache(team, windowFrom, windowTo), []);
  const mergedNextEvents = mergeUniqueEvents([...nextEvents, ...cachedWindow]).sort(fixtureSort);
  const todayUpcomingFromNext = mergedNextEvents.find((event) => event.dateEvent === todayIso) || null;
  const todayPrimaryEvent =
    (chosenToday && chosenToday.dateEvent === todayIso && chosenToday) || todayUpcomingFromNext || null;
  const nextEvent = mergedNextEvents.find((event) => !isSameFixture(event, todayPrimaryEvent || chosenToday) && event.dateEvent >= todayIso) || null;
  state.favoriteUpcomingEvent = nextEvent || null;
  const hasFixtureToday = Boolean(
    (chosenToday && chosenToday.dateEvent === todayIso) || mergedNextEvents.some((event) => event.dateEvent === todayIso)
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
  const leagueCode = teamLeagueCode(team);
  const leagueId = LEAGUES[leagueCode]?.id;
  let pastLeague = [];
  let lastCompleted = findLastCompletedForTeam(lastEvents, team, todayIso, chosenToday);
  const needLeaguePastForSummaryOrForm = !lastCompleted || teamFormFromEvents(lastEvents, team).length < 5;
  if (leagueId && needLeaguePastForSummaryOrForm) {
    pastLeague = await safeLoad(() => fetchPastLeagueEvents(leagueId), []);
    if (!lastCompleted) {
      lastCompleted = findLastCompletedForTeam(pastLeague, team, todayIso, chosenToday);
    }
  }
  if (!lastCompleted && cachedWindow.length) {
    lastCompleted = findLastCompletedForTeam(cachedWindow, team, todayIso, chosenToday);
  }

  el.favoriteEmpty.classList.add("hidden");
  el.favoriteContent.classList.remove("hidden");

  const badgeUrl = team.strBadge || state.teamBadgeMap[team.strTeam] || "";
  el.favoriteLogo.src = badgeUrl;
  el.favoriteLogo.alt = `${team.strTeam} logo`;
  el.favoriteLogo.classList.toggle("hidden", !badgeUrl);
  await updateFavoriteThemeFromBadge(badgeUrl || "");
  el.favoriteName.textContent = team.strTeam || "Team";
  const teamPos = getTeamTablePosition(team);
  el.favoriteLeague.textContent = teamPos ? `${team.strLeague || ""}  •  ${teamPos}` : team.strLeague || "";
  if (el.favoriteForm) {
    const formEvents = mergeUniqueEvents([
      ...lastEvents,
      ...pastLeague,
      ...cachedWindow,
      ...(chosenToday && eventState(chosenToday).key === "final" ? [chosenToday] : []),
    ]);
    const d1Form = await safeLoad(() => fetchTeamFormFromCache(team, 5), []);
    const fallbackForm = teamFormFromEvents(formEvents, team);
    const form = d1Form.length ? d1Form : fallbackForm;
    const formHtml = renderFavoriteFormBadges(form);
    const showInlineForm = isMobileViewport();
    el.favoriteForm.innerHTML = formHtml;
    el.favoriteForm.classList.toggle("hidden", !showInlineForm);
    if (el.favoriteFormRight) {
      el.favoriteFormRight.innerHTML = formHtml;
      el.favoriteFormRight.classList.toggle("hidden", showInlineForm);
    }
  }
  setFavoritePickerDisplay(team);
  el.favoriteStatus.classList.remove("gameday", "live", "final");

  if (chosenToday && chosenToday.dateEvent === todayIso && chosenTodayState === "live") {
    const progress = liveProgressLabel(chosenToday);
    el.favoriteStatus.textContent = progress === "LIVE" ? "LIVE" : `LIVE ${progress}`;
    el.favoriteStatus.classList.add("live");
    el.favoriteFixtureLine.textContent = scoreLine(chosenToday);
    el.favoriteFixtureDetail.textContent = `${chosenToday.strVenue || "Venue TBD"} | ${chosenToday.strLeague || ""}`;
    el.favoriteLiveStrip.classList.remove("hidden");
    el.favoriteLiveStrip.classList.remove("ticker-static");
    el.favoriteLiveStrip.innerHTML = `<span class="ticker-content">${nextFixtureTickerText(team, nextEvent)}</span>`;
    maybeTriggerFavoriteGoalCinematic(chosenToday);
    state.favoriteDataLoading = false;
    renderFunZone();
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
    state.favoriteDataLoading = false;
    renderFunZone();
    return;
  }

  el.favoriteStatus.textContent = "Match Centre";
  clearFavoriteGoalCinematic();

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
  state.favoriteDataLoading = false;
  renderFunZone();
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
  const includeTables = options.includeTables !== false;
  const includeSurroundingDays = options.includeSurroundingDays !== false;
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
  const prevTablesEpl = Array.isArray(state.tables.EPL) ? state.tables.EPL : [];
  const prevTablesChamp = Array.isArray(state.tables.CHAMP) ? state.tables.CHAMP : [];
  const prevTeamsEpl = Array.isArray(state.teamsByLeague.EPL) ? state.teamsByLeague.EPL : [];
  const prevTeamsChamp = Array.isArray(state.teamsByLeague.CHAMP) ? state.teamsByLeague.CHAMP : [];

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
    includeSurroundingDays ? safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dates.prev), []) : Promise.resolve(state.fixtures.previous.EPL || []),
    includeSurroundingDays ? safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dates.prev), []) : Promise.resolve(state.fixtures.previous.CHAMP || []),
    includeSurroundingDays ? safeLoad(() => fetchLeagueDayFixtures(LEAGUES.EPL.id, dates.next), []) : Promise.resolve(state.fixtures.next.EPL || []),
    includeSurroundingDays ? safeLoad(() => fetchLeagueDayFixtures(LEAGUES.CHAMP.id, dates.next), []) : Promise.resolve(state.fixtures.next.CHAMP || []),
    includeTables ? safeLoad(() => fetchTable(LEAGUES.EPL.id), []) : Promise.resolve(state.tables.EPL || []),
    includeTables ? safeLoad(() => fetchTable(LEAGUES.CHAMP.id), []) : Promise.resolve(state.tables.CHAMP || []),
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
  setDateFixtureCache(dates.today, { EPL: state.fixtures.today.EPL, CHAMP: state.fixtures.today.CHAMP });
  setDateFixtureCache(dates.prev, { EPL: state.fixtures.previous.EPL, CHAMP: state.fixtures.previous.CHAMP });
  setDateFixtureCache(dates.next, { EPL: state.fixtures.next.EPL, CHAMP: state.fixtures.next.CHAMP });
  state.tables.EPL = includeTables ? (tableEpl.length ? tableEpl : prevTablesEpl) : prevTablesEpl;
  state.tables.CHAMP = includeTables ? (tableChamp.length ? tableChamp : prevTablesChamp) : prevTablesChamp;
  state.teamsByLeague.EPL = includeStatic ? (teamsEpl.length ? teamsEpl : prevTeamsEpl) : prevTeamsEpl;
  state.teamsByLeague.CHAMP = includeStatic ? (teamsChamp.length ? teamsChamp : prevTeamsChamp) : prevTeamsChamp;
  state.teamBadgeMap = {};
  [...state.teamsByLeague.EPL, ...state.teamsByLeague.CHAMP].forEach((team) => {
    if (team?.strTeam && team?.strBadge) {
      state.teamBadgeMap[team.strTeam] = team.strBadge;
    }
  });
  if (includeStatic) {
    state.lastStaticRefreshAt = Date.now();
  }
  if (includeTables) {
    state.lastTableRefreshAt = Date.now();
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

function shouldFetchTables(context) {
  if (!state.tables.EPL.length || !state.tables.CHAMP.length) return true;
  const intervalMs = context?.hasLive ? ONE_MINUTE_MS : THREE_HOURS_MS;
  return Date.now() - state.lastTableRefreshAt >= intervalMs;
}

function shouldFetchLiveData(context) {
  const sinceLastLiveProbe = Date.now() - state.lastLiveProbeAt;
  if (context.hasLive) return true;
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
    if (state.lastRefresh && state.pollMode !== "live") {
      renderFixtureSkeletons(6);
      if (shouldFetchTables(nextContext) || shouldFetchStaticData()) {
        renderTableSkeletons(2);
      }
    }
    if (!state.selectedDate) {
      state.selectedDate = toISODate(new Date());
    }
    if (state.favoriteTeamId) {
      localStorage.setItem("esra_favorite_team", state.favoriteTeamId);
    }
    const includeLive = shouldFetchLiveData(nextContext);
    const includeStatic = shouldFetchStaticData();
    const includeTables = shouldFetchTables(nextContext);
    const todayIso = toISODate(new Date());
    const includeSurroundingDays =
      includeStatic ||
      state.selectedDate !== todayIso ||
      !state.fixtures.previous.EPL.length ||
      !state.fixtures.previous.CHAMP.length ||
      !state.fixtures.next.EPL.length ||
      !state.fixtures.next.CHAMP.length;
    await loadCoreData({ includeLive, includeStatic, includeTables, includeSurroundingDays });
    detectGoalFlashes();
    const selectedDateForRefresh = normalizeDateIsoInput(state.selectedDate || todayIso);
    state.selectedDate = selectedDateForRefresh;
    const selectedSeq = ++state.selectedDateLoadSeq;
    await refreshSelectedDateFixtures(selectedDateForRefresh, selectedSeq);
    if (accountSignedIn() && Date.now() - Number(state.lastLeagueDirectoryAt || 0) > 60 * 1000) {
      await safeLoad(() => refreshLeagueDirectory(), null);
    }
    if (accountSignedIn()) {
      await safeLoad(() => refreshChallengeDashboard(false), null);
    }
    settleFamilyPredictions();
    buildFavoriteOptions();
    await safeLoad(() => renderFavorite(), null);
    const currentEvents = selectedEventsForCurrentView();
    const canPatchLive =
      !includeStatic &&
      state.selectedDate === todayIso &&
      nextContext.hasLive &&
      canPatchFixtureRows(currentEvents);
    if (canPatchLive) {
      patchVisibleFixtureRows(currentEvents);
    } else {
      renderFixtures();
    }
    if (includeTables || !el.tablesWrap.children.length || el.tablesWrap.querySelector(".error")) {
      renderTables();
    }
    renderFunZone();
    updateStickyDateBarVisibility();
    setLeagueButtonState();
    if (state.playerPopEnabled && el.playerDvdLayer?.classList.contains("hidden")) {
      showRandomPlayerPop();
    }
    ensurePlayerPopContinuity();

    state.lastRefresh = new Date();
    renderLastRefreshed();
    nextContext = currentPollContext();
  } catch (err) {
    console.error(err);
    const hasFixtureRows = Boolean(el.fixturesList?.querySelector(".fixture-item"));
    const hasTableRows = Boolean(el.tablesWrap?.querySelector(".table-card"));
    if (!hasFixtureRows) {
      displayApiError(el.fixturesList, err);
    }
    if (!hasTableRows) {
      el.tablesWrap.innerHTML = `<div class="error">Unable to load league tables. ${err.message}</div>`;
    }
    await safeLoad(() => ensureFavoritePickerDataLoaded(), null);
    buildFavoriteOptions();
    renderFunZone();
    if (el.lastRefreshed) {
      el.lastRefreshed.textContent = `Last refresh failed: ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    }
  } finally {
    state.refreshInFlight = false;
    persistCachedBootstrapData();
    scheduleNextRefresh(nextContext);
  }
}

function attachEvents() {
  if (el.accountRegisterBtn) {
    el.accountRegisterBtn.addEventListener("click", async () => {
      try {
        setAccountStatus("Creating account...");
        await registerAccount();
      } catch (err) {
        setAccountStatus(`Create account failed: ${err.message}`, true);
      }
    });
  }

  if (el.accountLoginBtn) {
    el.accountLoginBtn.addEventListener("click", async () => {
      try {
        setAccountStatus("Signing in...");
        await loginAccount();
      } catch (err) {
        setAccountStatus(`Sign in failed: ${err.message}`, true);
      }
    });
  }

  if (el.accountLogoutBtn) {
    el.accountLogoutBtn.addEventListener("click", async () => {
      await logoutAccount();
    });
  }

  if (el.accountSyncBtn) {
    el.accountSyncBtn.addEventListener("click", async () => {
      await syncCloudStateNow();
    });
  }

  if (el.familyCreateCodeBtn) {
    el.familyCreateCodeBtn.addEventListener("click", async () => {
      if (!accountSignedIn()) {
        setAccountStatus("Sign in to create a family league code.", true);
        return;
      }
      try {
        await createFamilyLeagueCode();
        renderFamilyLeaguePanel();
      } catch (err) {
        setAccountStatus(`Create league failed: ${err.message}`, true);
      }
    });
  }

  if (el.familyJoinCodeBtn) {
    el.familyJoinCodeBtn.addEventListener("click", async () => {
      if (!accountSignedIn()) {
        setAccountStatus("Sign in to join a family league code.", true);
        return;
      }
      try {
        await joinFamilyLeagueCode(el.familyJoinCodeInput?.value || "");
        if (el.familyJoinCodeInput) el.familyJoinCodeInput.value = "";
        renderFamilyLeaguePanel();
      } catch (err) {
        setAccountStatus(`Join league failed: ${err.message}`, true);
      }
    });
  }

  if (el.familyLeagueNameSaveBtn) {
    el.familyLeagueNameSaveBtn.addEventListener("click", async () => {
      try {
        await updateFamilyLeagueName(el.familyLeagueNameInput?.value || "");
      } catch (err) {
        setAccountStatus(`Save league name failed: ${err.message}`, true);
      }
    });
  }

  if (el.familyLeagueNameInput) {
    el.familyLeagueNameInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      try {
        await updateFamilyLeagueName(el.familyLeagueNameInput?.value || "");
      } catch (err) {
        setAccountStatus(`Save league name failed: ${err.message}`, true);
      }
    });
  }

  if (el.familyPrevLeagueBtn) {
    el.familyPrevLeagueBtn.addEventListener("click", () => {
      cycleLeague(-1);
    });
  }

  if (el.familyNextLeagueBtn) {
    el.familyNextLeagueBtn.addEventListener("click", () => {
      cycleLeague(1);
    });
  }

  el.mobileTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setMobileTab(btn.dataset.mobileTab || "fixtures");
    });
  });

  if (el.settingsToggleBtn) {
    el.settingsToggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeFavoritePickerMenu();
      setAccountMenuOpen(false);
      setSettingsMenuOpen(!state.settingsOpen);
    });
  }

  if (el.accountToggleBtn) {
    el.accountToggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeFavoritePickerMenu();
      setSettingsMenuOpen(false);
      setAccountMenuOpen(!state.accountMenuOpen);
    });
  }

  el.themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyUiTheme(btn.dataset.theme);
    });
  });

  el.motionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyMotionSetting(btn.dataset.motion);
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
        await showRandomPlayerPop(true);
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
      if (!dreamHasAnySelection() && el.dreamTeamHint) {
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
      state.dreamSwapActiveKey = "";
      renderDreamTeamNavState();
      requestDreamTeamRender();
    });
  }

  if (el.dreamTeamPanel) {
    el.dreamTeamPanel.addEventListener("click", (event) => {
      if (event.target !== el.dreamTeamPanel) return;
      state.dreamTeamOpen = false;
      state.dreamSwapActiveKey = "";
      renderDreamTeamNavState();
      requestDreamTeamRender();
    });
  }

  if (el.leagueMemberCloseBtn) {
    el.leagueMemberCloseBtn.addEventListener("click", () => {
      closeLeagueMemberView();
    });
  }

  if (el.leagueMemberPanel) {
    el.leagueMemberPanel.addEventListener("click", (event) => {
      if (event.target !== el.leagueMemberPanel) return;
      closeLeagueMemberView();
    });
  }

  if (el.squadToggleBtn) {
    el.squadToggleBtn.addEventListener("click", () => {
      state.squadOpen = !state.squadOpen;
      renderSquadPanel();
    });
  }

  if (el.higherLowerStartBtn) {
    el.higherLowerStartBtn.addEventListener("click", async () => {
      await startHigherLowerGame(true);
    });
  }

  window.addEventListener("resize", () => {
    updateStickyDateBarVisibility();
    positionFavoritePickerMenu();
    renderMobileSectionLayout();
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

  el.favoritePickerBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (state.dreamTeamOpen) {
      state.dreamTeamOpen = false;
      state.dreamSwapActiveKey = "";
      renderDreamTeamNavState();
      requestDreamTeamRender();
    }
    await ensureFavoritePickerDataLoaded();
    buildFavoriteOptions();
    toggleFavoritePickerMenu();
  });

  document.addEventListener("click", (e) => {
    if (el.settingsMenu && !el.settingsMenu.contains(e.target)) {
      setSettingsMenuOpen(false);
    }
    if (el.accountMenu && !el.accountMenu.contains(e.target)) {
      setAccountMenuOpen(false);
    }
    if (!el.favoritePicker.contains(e.target)) {
      closeFavoritePickerMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.dreamTeamOpen) {
      state.dreamTeamOpen = false;
      state.dreamSwapActiveKey = "";
      renderDreamTeamNavState();
      requestDreamTeamRender();
      return;
    }
    if (state.leagueMemberView.open) {
      closeLeagueMemberView();
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
    el.datePicker.addEventListener("change", (e) => {
      scheduleSelectedDateChange(e.target.value || toISODate(new Date()));
    });
  }

  el.dateQuickButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = new Date();
      d.setDate(d.getDate() + Number(btn.dataset.offset || 0));
      scheduleSelectedDateChange(toISODate(d));
    });
  });

  const shiftSelectedDate = (delta) => {
    const base = state.selectedDate ? new Date(`${state.selectedDate}T00:00:00`) : new Date();
    base.setDate(base.getDate() + delta);
    scheduleSelectedDateChange(toISODate(base));
  };

  if (el.datePrevBtn) {
    el.datePrevBtn.addEventListener("click", () => {
      shiftSelectedDate(-1);
    });
  }

  if (el.dateNextBtn) {
    el.dateNextBtn.addEventListener("click", () => {
      shiftSelectedDate(1);
    });
  }

  if (el.stickyDatePrev) {
    el.stickyDatePrev.addEventListener("click", () => {
      shiftSelectedDate(-1);
    });
  }
  if (el.stickyDateNext) {
    el.stickyDateNext.addEventListener("click", () => {
      shiftSelectedDate(1);
    });
  }
  if (el.stickyDateToday) {
    el.stickyDateToday.addEventListener("click", () => {
      scheduleSelectedDateChange(toISODate(new Date()));
    });
  }

  window.addEventListener("scroll", () => {
    updateStickyDateBarVisibility();
    positionFavoritePickerMenu();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    ensurePlayerPopContinuity();
    if (!state.liveStream.connected) {
      startLiveStream();
    }
  });
}

attachEvents();
applyUiTheme(state.uiTheme);
applyMotionSetting(state.motionLevel);
setPlayerPopScope(state.playerPopScope);
setPlayerPopButtonState();
hydrateCachedBootstrapData();
renderAccountUI();
refreshPlayerPopScoreBadge();
normalizeDreamSelections();
renderDreamTeamNavState();
requestDreamTeamRender();
setSettingsMenuOpen(false);
setAccountMenuOpen(false);
initRevealOnScroll();
updateStickyDateBarVisibility();
persistLocalMetaState();
renderFunZone();
renderMobileSectionLayout();
if (state.playerPopEnabled) {
  showRandomPlayerPop();
}
startLiveStream();
initAccountSession().finally(() => {
  fullRefresh();
});
