const API = "/api/v1/ezra/admin";
const TOKEN_KEY = "ezra_admin_token";

const el = {
  authCard: document.getElementById("auth-card"),
  dashCard: document.getElementById("dashboard-card"),
  loginForm: document.getElementById("login-form"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("login-btn"),
  authStatus: document.getElementById("auth-status"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  usersCount: document.getElementById("users-count"),
  active24h: document.getElementById("active-24h"),
  usersTbody: document.getElementById("users-tbody"),
  searchInput: document.getElementById("search-input"),
  leagueFilterBtns: Array.from(document.querySelectorAll(".league-filter-btn")),
  dashStatus: document.getElementById("dash-status"),
  leaguesCard: document.getElementById("leagues-card"),
  leaguesList: document.getElementById("leagues-list"),
  leaguesDetailWrap: document.getElementById("leagues-detail-wrap"),
  leaguesDetailTitle: document.getElementById("leagues-detail-title"),
  leaguesDetailTbody: document.getElementById("leagues-detail-tbody"),
  leaguesDetailEmpty: document.getElementById("leagues-detail-empty"),
  leaguesRefreshBtn: document.getElementById("leagues-refresh-btn"),
  leaguesStatus: document.getElementById("leagues-status"),
};

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  users: [],
  leagues: [],
  selectedLeagueCode: "",
  leagueVisibility: {
    EPL: true,
    CHAMP: true,
    LALIGA: true,
  },
};

function setStatus(node, msg, type = "") {
  node.textContent = msg || "";
  node.classList.remove("error", "ok");
  if (type) node.classList.add(type);
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.token}`,
  };
}

async function login(username, password) {
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Login failed (${res.status})`);
  return data;
}

async function fetchUsers() {
  const res = await fetch(`${API}/users`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Fetch failed (${res.status})`);
  return data;
}

function normalizeLeagueVisibility(input) {
  const next = {
    EPL: Boolean(input?.EPL),
    CHAMP: Boolean(input?.CHAMP),
    LALIGA: Boolean(input?.LALIGA),
  };
  if (!next.EPL && !next.CHAMP && !next.LALIGA) {
    next.EPL = true;
  }
  return next;
}

async function fetchLeagueVisibility() {
  const res = await fetch(`${API}/league-visibility`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Visibility fetch failed (${res.status})`);
  return normalizeLeagueVisibility(data?.visibility || {});
}

async function saveLeagueVisibility(visibility) {
  const payload = normalizeLeagueVisibility(visibility || {});
  const res = await fetch(`${API}/league-visibility`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ visibility: payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Visibility save failed (${res.status})`);
  return normalizeLeagueVisibility(data?.visibility || payload);
}

function formatLastActivity(iso) {
  if (!iso) return "--";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "--";
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderUsers() {
  const q = String(el.searchInput.value || "").trim().toLowerCase();
  const rows = state.users.filter((u) => !q || String(u.username || "").toLowerCase().includes(q));
  el.usersTbody.innerHTML = rows
    .map(
      (u) => `
      <tr>
        <td>${escapeHtml(u.username || "")}</td>
        <td>${Number(u.totalPoints || 0)}</td>
        <td>${escapeHtml(formatLastActivity(u.lastActivityAt))}</td>
      </tr>
    `
    )
    .join("");
}

function escapeHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setAuthedView(authed) {
  el.authCard.classList.toggle("hidden", authed);
  el.dashCard.classList.toggle("hidden", !authed);
  el.leaguesCard.classList.toggle("hidden", !authed);
}

async function fetchLeagues() {
  const res = await fetch(`${API}/leagues`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Leagues fetch failed (${res.status})`);
  return Array.isArray(data.leagues) ? data.leagues : [];
}

function formatSeasonId(seasonId) {
  const m = String(seasonId || "").match(/^W(\d{4})(\d{2})(\d{2})$/);
  if (!m) return seasonId || "--";
  return `w/c ${m[3]}/${m[2]}/${m[1]}`;
}

function renderLeagueWinners(leagueCode) {
  state.selectedLeagueCode = leagueCode;
  const league = state.leagues.find((l) => String(l.code || "").toUpperCase() === leagueCode.toUpperCase());

  el.leaguesDetailWrap.classList.remove("hidden");
  el.leaguesDetailTitle.textContent = league ? `${escapeHtml(league.name)} — Winners` : `League ${leagueCode} — Winners`;

  // Highlight selected row
  Array.from(el.leaguesList.querySelectorAll("li")).forEach((li) => {
    li.classList.toggle("active", String(li.dataset.code || "").toUpperCase() === leagueCode.toUpperCase());
  });

  const winners = Array.isArray(league?.winners) ? league.winners : [];
  if (!winners.length) {
    el.leaguesDetailTbody.innerHTML = "";
    el.leaguesDetailEmpty.classList.remove("hidden");
    return;
  }
  el.leaguesDetailEmpty.classList.add("hidden");
  el.leaguesDetailTbody.innerHTML = winners
    .map(
      (w) => `
      <tr>
        <td>${escapeHtml(formatSeasonId(w.seasonId))}</td>
        <td>${escapeHtml(w.name || w.userId || "--")}</td>
        <td>${Number(w.points || 0)} pts</td>
        <td>${escapeHtml(formatLastActivity(w.awardedAt))}</td>
      </tr>
    `
    )
    .join("");
}

function renderLeaguesList() {
  el.leaguesList.innerHTML = state.leagues
    .map(
      (league) => `
      <li data-code="${escapeHtml(String(league.code || "").toUpperCase())}">
        <button type="button">
          <span>
            <span class="leagues-list-code">${escapeHtml(league.name || league.code)}</span>
            <span class="leagues-list-meta">${Number(league.memberCount || 0)} members · ${league.winners?.length || 0} winner${(league.winners?.length || 0) === 1 ? "" : "s"}</span>
          </span>
          <span class="leagues-list-meta">${escapeHtml(String(league.code || ""))}</span>
        </button>
      </li>
    `
    )
    .join("");

  Array.from(el.leaguesList.querySelectorAll("li")).forEach((li) => {
    li.querySelector("button").addEventListener("click", () => {
      renderLeagueWinners(String(li.dataset.code || ""));
    });
  });

  // Re-select previously selected league if still in list
  if (state.selectedLeagueCode) {
    const still = state.leagues.find((l) => String(l.code || "").toUpperCase() === state.selectedLeagueCode.toUpperCase());
    if (still) renderLeagueWinners(state.selectedLeagueCode);
    else {
      el.leaguesDetailWrap.classList.add("hidden");
      state.selectedLeagueCode = "";
    }
  }
}

async function refreshLeagues() {
  try {
    setStatus(el.leaguesStatus, "Loading leagues...");
    state.leagues = await fetchLeagues();
    renderLeaguesList();
    setStatus(el.leaguesStatus, `Updated ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, "ok");
  } catch (err) {
    setStatus(el.leaguesStatus, String(err?.message || err), "error");
    if (String(err?.message || "").toLowerCase().includes("unauthorized")) logout();
  }
}

function setLeagueVisibility(nextVisibility) {
  state.leagueVisibility = normalizeLeagueVisibility(nextVisibility || {});
  const allEnabled = state.leagueVisibility.EPL && state.leagueVisibility.CHAMP && state.leagueVisibility.LALIGA;
  for (const btn of el.leagueFilterBtns) {
    const code = String(btn.dataset.league || "").toUpperCase();
    const isActive = code === "ALL" ? allEnabled : Boolean(state.leagueVisibility[code]);
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

async function refreshDashboard() {
  try {
    setStatus(el.dashStatus, "Loading users and league visibility...");
    const [data, visibility] = await Promise.all([fetchUsers(), fetchLeagueVisibility()]);
    state.users = Array.isArray(data.users) ? data.users : [];
    setLeagueVisibility(visibility);
    el.usersCount.textContent = String(data?.summary?.usersCount ?? state.users.length ?? 0);
    el.active24h.textContent = String(data?.summary?.active24h ?? 0);
    renderUsers();
    setStatus(el.dashStatus, `Updated ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, "ok");
  } catch (err) {
    setStatus(el.dashStatus, String(err?.message || err), "error");
    if (String(err?.message || "").toLowerCase().includes("unauthorized") || String(err?.message || "").toLowerCase().includes("expired")) {
      logout();
    }
  }
}

function logout() {
  state.token = "";
  localStorage.removeItem(TOKEN_KEY);
  state.users = [];
  state.leagues = [];
  state.selectedLeagueCode = "";
  el.usersTbody.innerHTML = "";
  el.leaguesList.innerHTML = "";
  el.leaguesDetailWrap.classList.add("hidden");
  setAuthedView(false);
  setStatus(el.authStatus, "Logged out.", "ok");
  setStatus(el.dashStatus, "");
  setStatus(el.leaguesStatus, "");
}

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = String(el.username.value || "").trim();
  const password = String(el.password.value || "");
  if (!username || !password) {
    setStatus(el.authStatus, "Enter username and password.", "error");
    return;
  }
  try {
    el.loginBtn.disabled = true;
    setStatus(el.authStatus, "Signing in...");
    const data = await login(username, password);
    state.token = String(data.token || "");
    if (!state.token) throw new Error("No admin token returned.");
    localStorage.setItem(TOKEN_KEY, state.token);
    setAuthedView(true);
    setStatus(el.authStatus, "", "");
    await Promise.all([refreshDashboard(), refreshLeagues()]);
  } catch (err) {
    setStatus(el.authStatus, String(err?.message || err), "error");
  } finally {
    el.loginBtn.disabled = false;
  }
});

el.refreshBtn.addEventListener("click", refreshDashboard);
el.logoutBtn.addEventListener("click", logout);
el.searchInput.addEventListener("input", renderUsers);
el.leaguesRefreshBtn.addEventListener("click", refreshLeagues);
for (const btn of el.leagueFilterBtns) {
  btn.addEventListener("click", async () => {
    if (!state.token) return;
    const code = String(btn.dataset.league || "").toUpperCase();
    const current = normalizeLeagueVisibility(state.leagueVisibility);
    let next = { ...current };
    if (code === "ALL") {
      next = { EPL: true, CHAMP: true, LALIGA: true };
    } else if (["EPL", "CHAMP", "LALIGA"].includes(code)) {
      next[code] = !next[code];
      if (!next.EPL && !next.CHAMP && !next.LALIGA) {
        next[code] = true;
      }
    } else {
      return;
    }
    setLeagueVisibility(next);
    try {
      setStatus(el.dashStatus, "Saving league visibility...");
      const saved = await saveLeagueVisibility(next);
      setLeagueVisibility(saved);
      setStatus(el.dashStatus, "League visibility saved.", "ok");
    } catch (err) {
      setLeagueVisibility(current);
      setStatus(el.dashStatus, String(err?.message || err), "error");
    }
  });
}

(async function init() {
  setLeagueVisibility({ EPL: true, CHAMP: true, LALIGA: true });
  if (!state.token) {
    setAuthedView(false);
    return;
  }
  setAuthedView(true);
  await Promise.all([refreshDashboard(), refreshLeagues()]);
})();
