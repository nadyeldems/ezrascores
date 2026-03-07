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
  rescoreBtn: document.getElementById("rescore-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  usersCount: document.getElementById("users-count"),
  active24h: document.getElementById("active-24h"),
  usersTbody: document.getElementById("users-tbody"),
  searchInput: document.getElementById("search-input"),
  leagueFilterBtns: Array.from(document.querySelectorAll(".league-filter-btn")),
  dashStatus: document.getElementById("dash-status"),
  // Grant panel
  grantPanel: document.getElementById("grant-panel"),
  grantUserInput: document.getElementById("grant-user-input"),
  grantUserList: document.getElementById("grant-user-list"),
  grantUserSelected: document.getElementById("grant-user-selected"),
  grantPointsInput: document.getElementById("grant-points-input"),
  grantReasonInput: document.getElementById("grant-reason-input"),
  grantPreview: document.getElementById("grant-preview"),
  grantBtn: document.getElementById("grant-btn"),
  grantClearBtn: document.getElementById("grant-clear-btn"),
  grantStatus: document.getElementById("grant-status"),
  grantHistory: document.getElementById("grant-history"),
  grantHistoryList: document.getElementById("grant-history-list"),
};

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  users: [],
  leagueVisibility: {
    EPL: true,
    CHAMP: true,
    LALIGA: true,
  },
  grant: {
    selectedUser: null,   // { id, username, totalPoints }
    grantLog: [],         // session-scoped audit log
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
        <td><button type="button" class="quick-grant-btn" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(u.username)}" data-points="${Number(u.totalPoints || 0)}">+ Grant</button></td>
      </tr>
    `
    )
    .join("");
  // Attach quick-grant click handlers
  for (const btn of el.usersTbody.querySelectorAll(".quick-grant-btn")) {
    btn.addEventListener("click", () => {
      selectGrantUser({
        id: btn.dataset.userId,
        username: btn.dataset.username,
        totalPoints: Number(btn.dataset.points || 0),
      });
      // Scroll to and open the grant panel
      if (el.grantPanel && !el.grantPanel.open) el.grantPanel.open = true;
      el.grantPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      el.grantPointsInput?.focus();
    });
  }
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

el.rescoreBtn.addEventListener("click", async () => {
  if (!state.token) return;
  try {
    el.rescoreBtn.disabled = true;
    el.rescoreBtn.textContent = "Rescoring...";
    setStatus(el.dashStatus, "Running full rescore — this may take a few seconds...");
    const res = await fetch(`${API}/rescore-all`, { method: "POST", headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Rescore failed (${res.status})`);
    setStatus(el.dashStatus, `Rescore complete — ${data.leaguesProcessed ?? 0} league(s) settled at ${new Date(data.settledAt || Date.now()).toLocaleTimeString("en-GB")}`, "ok");
    await refreshDashboard();
  } catch (err) {
    setStatus(el.dashStatus, String(err?.message || err), "error");
  } finally {
    el.rescoreBtn.disabled = false;
    el.rescoreBtn.textContent = "Rescore All Users";
  }
});
el.refreshBtn.addEventListener("click", refreshDashboard);
el.logoutBtn.addEventListener("click", logout);
el.searchInput.addEventListener("input", renderUsers);
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

// ─── Grant Points Panel ──────────────────────────────────────────────────────

async function apiGrantPoints(userId, points, reason) {
  const res = await fetch(`${API}/grant-points`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ userId, points, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Grant failed (${res.status})`);
  return data;
}

function selectGrantUser(user) {
  state.grant.selectedUser = user;
  if (el.grantUserInput) el.grantUserInput.value = user.username;
  if (el.grantUserSelected) {
    el.grantUserSelected.textContent = `✓ ${user.username} (${user.totalPoints} pts)`;
    el.grantUserSelected.classList.remove("hidden");
  }
  closeGrantUserList();
  updateGrantPreview();
}

function clearGrantUser() {
  state.grant.selectedUser = null;
  if (el.grantUserInput) el.grantUserInput.value = "";
  if (el.grantUserSelected) el.grantUserSelected.classList.add("hidden");
  updateGrantPreview();
}

function clearGrantForm() {
  clearGrantUser();
  if (el.grantPointsInput) el.grantPointsInput.value = "";
  if (el.grantReasonInput) el.grantReasonInput.value = "";
  if (el.grantPreview) el.grantPreview.classList.add("hidden");
  if (el.grantBtn) el.grantBtn.disabled = true;
  setStatus(el.grantStatus, "");
}

function closeGrantUserList() {
  if (el.grantUserList) el.grantUserList.classList.add("hidden");
}

function openGrantUserList(matches) {
  if (!el.grantUserList) return;
  if (!matches.length) { closeGrantUserList(); return; }
  el.grantUserList.innerHTML = matches
    .slice(0, 8)
    .map(
      (u) =>
        `<li role="option" class="grant-user-option" data-user-id="${escapeHtml(u.id)}" data-username="${escapeHtml(u.username)}" data-points="${Number(u.totalPoints || 0)}">
          <span class="grant-option-name">${escapeHtml(u.username)}</span>
          <span class="grant-option-pts">${Number(u.totalPoints || 0)} pts</span>
        </li>`
    )
    .join("");
  el.grantUserList.classList.remove("hidden");
  for (const item of el.grantUserList.querySelectorAll(".grant-user-option")) {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep focus on input
      selectGrantUser({
        id: item.dataset.userId,
        username: item.dataset.username,
        totalPoints: Number(item.dataset.points || 0),
      });
    });
  }
}

function updateGrantPreview() {
  const user = state.grant.selectedUser;
  const pts = Math.floor(Number(el.grantPointsInput?.value || 0));
  const valid = user && Number.isFinite(pts) && pts > 0;
  if (el.grantBtn) el.grantBtn.disabled = !valid;
  if (!el.grantPreview) return;
  if (!valid) {
    el.grantPreview.classList.add("hidden");
    return;
  }
  const newTotal = (user.totalPoints || 0) + pts;
  el.grantPreview.innerHTML = `
    <span class="grant-preview-icon">⚡</span>
    Grant <strong>${pts}</strong> point${pts !== 1 ? "s" : ""} to <strong>${escapeHtml(user.username)}</strong>
    — lifetime total: <strong>${user.totalPoints}</strong> → <strong>${newTotal}</strong>.
    Current season standings will also be updated across all their leagues.
  `;
  el.grantPreview.classList.remove("hidden");
}

function addGrantToLog(entry) {
  state.grant.grantLog.unshift(entry);
  if (!el.grantHistory || !el.grantHistoryList) return;
  el.grantHistory.classList.remove("hidden");
  el.grantHistoryList.innerHTML = state.grant.grantLog
    .map(
      (g) =>
        `<li class="grant-log-entry">
          <span class="grant-log-user">${escapeHtml(g.username)}</span>
          <span class="grant-log-pts">+${g.pointsGranted} pts</span>
          <span class="grant-log-total">→ ${g.newLifetimeTotal} total</span>
          <span class="grant-log-season">(season: ${g.currentSeasonPoints})</span>
          ${g.reason ? `<span class="grant-log-reason">${escapeHtml(g.reason)}</span>` : ""}
          <span class="grant-log-time">${new Date(g.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </li>`
    )
    .join("");
}

// Input: filter autocomplete list
el.grantUserInput?.addEventListener("input", () => {
  clearGrantUser();
  const q = String(el.grantUserInput.value || "").trim().toLowerCase();
  if (!q) { closeGrantUserList(); return; }
  const matches = state.users.filter((u) =>
    String(u.username || "").toLowerCase().includes(q)
  );
  openGrantUserList(matches);
});

el.grantUserInput?.addEventListener("blur", () => {
  // Delay so mousedown on a list item fires first
  setTimeout(closeGrantUserList, 150);
});

el.grantPointsInput?.addEventListener("input", updateGrantPreview);

el.grantClearBtn?.addEventListener("click", clearGrantForm);

el.grantBtn?.addEventListener("click", async () => {
  const user = state.grant.selectedUser;
  const pts = Math.floor(Number(el.grantPointsInput?.value || 0));
  const reason = String(el.grantReasonInput?.value || "").trim() || "admin_grant";
  if (!user || !pts || pts <= 0) return;
  try {
    el.grantBtn.disabled = true;
    el.grantBtn.textContent = "Granting…";
    setStatus(el.grantStatus, "");
    const result = await apiGrantPoints(user.id, pts, reason);
    const entry = { ...result, at: new Date().toISOString() };
    addGrantToLog(entry);
    // Update local user list so the table reflects new total immediately
    const idx = state.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      state.users[idx] = { ...state.users[idx], totalPoints: result.newLifetimeTotal };
    }
    setStatus(
      el.grantStatus,
      `✓ Granted ${result.pointsGranted} pts to ${result.username}. New lifetime total: ${result.newLifetimeTotal}. Season: ${result.currentSeasonPoints} pts (${result.leaguesUpdated} league${result.leaguesUpdated !== 1 ? "s" : ""} updated).`,
      "ok"
    );
    clearGrantForm();
    renderUsers();
  } catch (err) {
    setStatus(el.grantStatus, String(err?.message || err), "error");
    el.grantBtn.disabled = false;
  } finally {
    el.grantBtn.textContent = "Grant Points";
    if (state.grant.selectedUser) el.grantBtn.disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────

(async function init() {
  setLeagueVisibility({ EPL: true, CHAMP: true, LALIGA: true });
  if (!state.token) {
    setAuthedView(false);
    return;
  }
  setAuthedView(true);
  await refreshDashboard();
})();
