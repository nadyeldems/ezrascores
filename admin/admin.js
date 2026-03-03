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
};

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  users: [],
  league: "ALL",
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
  const qs = new URLSearchParams();
  if (state.league && state.league !== "ALL") qs.set("league", state.league);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${API}/users${suffix}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Fetch failed (${res.status})`);
  return data;
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
}

function setLeagueFilter(nextLeague) {
  const normalized = String(nextLeague || "ALL").toUpperCase();
  state.league = ["ALL", "EPL", "CHAMP", "LALIGA"].includes(normalized) ? normalized : "ALL";
  for (const btn of el.leagueFilterBtns) {
    const isActive = String(btn.dataset.league || "").toUpperCase() === state.league;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

async function refreshDashboard() {
  try {
    const scope = state.league === "ALL" ? "all leagues" : state.league;
    setStatus(el.dashStatus, `Loading users (${scope})...`);
    const data = await fetchUsers();
    state.users = Array.isArray(data.users) ? data.users : [];
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
  el.usersTbody.innerHTML = "";
  setAuthedView(false);
  setStatus(el.authStatus, "Logged out.", "ok");
  setStatus(el.dashStatus, "");
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
    await refreshDashboard();
  } catch (err) {
    setStatus(el.authStatus, String(err?.message || err), "error");
  } finally {
    el.loginBtn.disabled = false;
  }
});

el.refreshBtn.addEventListener("click", refreshDashboard);
el.logoutBtn.addEventListener("click", logout);
el.searchInput.addEventListener("input", renderUsers);
for (const btn of el.leagueFilterBtns) {
  btn.addEventListener("click", async () => {
    const nextLeague = String(btn.dataset.league || "ALL");
    if (nextLeague === state.league) return;
    setLeagueFilter(nextLeague);
    await refreshDashboard();
  });
}

(async function init() {
  setLeagueFilter("ALL");
  if (!state.token) {
    setAuthedView(false);
    return;
  }
  setAuthedView(true);
  await refreshDashboard();
})();
