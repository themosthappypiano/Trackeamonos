const localDateKey = (date = new Date()) => {
  const local = date instanceof Date ? date : new Date(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = () => localDateKey();
const SUPABASE_URL = "https://kqzwtsqntmusvdzdjhha.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxend0c3FudG11c3ZkemRqaGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDYyNjYsImV4cCI6MjA5OTgyMjI2Nn0.7t7eqkLURQSJv7v7Kv0N7Kmbly_mmVy-e0xePnLsJxY";
const USE_SUPABASE = true;
const DEFAULT_GIF_SRC = "./loads/ogwlz-monkey.gif";
const REQUEST_TIMEOUT_MS = 12000;
const ASSET_TIMEOUT_MS = 5000;

let gifSources = [DEFAULT_GIF_SRC];
let brandGifSrc = DEFAULT_GIF_SRC;
let loadingGifSrc = DEFAULT_GIF_SRC;
let dailyGifSrc = DEFAULT_GIF_SRC;
let syncInFlight = false;
let taskReorderInFlight = false;
let lastDeleteTap = { id: null, kind: null, time: 0, x: 0, y: 0 };

const seed = {
  loading: USE_SUPABASE,
  activeProfileId: null,
  activeTab: "tasks",
  sidebarOpen: false,
  settingsOpen: false,
  taskFormOpen: false,
  habitFormOpen: false,
  checkFormOpen: false,
  gratitudeOpen: false,
  guideOpen: false,
  profiles: [],
  tasks: [],
  habits: [],
  checklist: [],
  gratitude: [],
  earnedXp: {}
};

let state = loadState();

function loadState() {
  const base = cloneState(seed);
  if (USE_SUPABASE) return base;
  const saved = readStoredState();
  if (!saved) return base;
  try {
    const parsed = JSON.parse(saved);
    return {
      ...base,
      ...parsed,
      settingsOpen: false,
      taskFormOpen: false,
      habitFormOpen: false,
      checkFormOpen: false,
      gratitudeOpen: false,
  guideOpen: false,
      gratitude: parsed.gratitude || base.gratitude,
      checklist: normalizeChecklist(parsed.checklist || base.checklist),
      profiles: (parsed.profiles || base.profiles).map((profile) => ({
        photo: "",
        ...profile,
        color: profileColor(profile.color)
      }))
    };
  } catch {
    return base;
  }
}

function saveState() {
  try {
    localStorage.setItem("traquea-monos-state", JSON.stringify(state));
  } catch (error) {
    console.warn("State could not be saved locally.", error);
  }
}

function cloneState(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function readStoredState() {
  try {
    return localStorage.getItem("traquea-monos-state");
  } catch (error) {
    console.warn("Stored state could not be read.", error);
    return null;
  }
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  let timeoutId;
  const timeoutError = new Error("Request timed out");

  if (typeof AbortController === "undefined") {
    try {
      return await Promise.race([
        fetch(resource, options),
        new Promise((_, reject) => {
          timeoutId = globalThis.setTimeout(() => reject(timeoutError), timeoutMs);
        })
      ]);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  const controller = new AbortController();
  timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw timeoutError;
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function loadGifSources() {
  try {
    const response = await fetchWithTimeout("./loads/gifs.json", { cache: "no-store" }, ASSET_TIMEOUT_MS);
    if (!response.ok) throw new Error("GIF manifest missing");
    const filenames = await response.json();
    const sources = filenames
      .filter((filename) => typeof filename === "string" && filename.trim())
      .map((filename) => `./loads/${filename}`);
    if (sources.length) gifSources = sources;
  } catch (error) {
    console.warn(error);
    gifSources = [DEFAULT_GIF_SRC];
  }
}

function randomGifSrc() {
  return gifSources[Math.floor(Math.random() * gifSources.length)] || DEFAULT_GIF_SRC;
}

function dailyGifForDate(dateKey = today()) {
  let hash = 0;
  for (const char of dateKey) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return gifSources[hash % gifSources.length] || DEFAULT_GIF_SRC;
}

function appImage(src, className, alt = "") {
  return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" ${alt ? "" : "aria-hidden=\"true\""} />`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

async function supabaseRequest(table, { method = "GET", query = "", body, prefer = "return=representation" } = {}) {
  if (!USE_SUPABASE) return null;
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${table} ${method} failed: ${details}`);
  }

  if (response.status === 204) return null;
  const responseBody = await response.text();
  return responseBody ? JSON.parse(responseBody) : null;
}

function mapProfile(row) {
  return {
    id: row.id,
    name: row.display_name,
    color: profileColor(row.color),
    avatar: row.avatar || row.display_name?.[0]?.toUpperCase() || "?",
    photo: row.avatar_url || "",
    streak: row.streak_count || 0,
    likeJarAmount: row.like_jar_amount != null ? Number(row.like_jar_amount) : 0
  };
}

function mapTask(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    description: row.description || "",
    date: row.task_date,
    status: row.status,
    sortOrder: row.sort_order == null ? null : Number(row.sort_order),
    completedAt: row.completed_at || null,
    createdAt: row.created_at
  };
}

function mapHabit(row, logs) {
  const log = logs.find((item) => item.habit_id === row.id);
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    target: row.target_count,
    count: log?.count || 0,
    createdAt: row.created_at
  };
}

function mapChecklistItem(row, logs) {
  const log = logs.find((item) => item.checklist_item_id === row.id);
  return {
    id: row.id,
    profileId: row.profile_id,
    prompt: row.prompt,
    answer: log ? log.answer : null,
    createdAt: row.created_at
  };
}

function mapGratitude(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    date: row.gratitude_date,
    text: row.note
  };
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function activeProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
}

function byProfile(collection) {
  if (!activeProfile()) return [];
  return collection.filter((item) => item.profileId === activeProfile().id);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function tabLabel(tab) {
  return { tasks: "Tasks", habits: "Habits", checklist: "Checklist", calendar: "Calendar" }[tab];
}

function normalizeChecklist(items) {
  const replacements = {
    "Did you eat sugar today?": "No sugar today",
    "Did you watch reels today?": "No reels today",
    "Did you get sunlight?": "Got sunlight"
  };
  return items.map((item) => ({ ...item, prompt: replacements[item.prompt] || item.prompt }));
}

function profileColor(color) {
  const allowed = ["#16a56f", "#2476d9", "#e25b45", "#f4b83b"];
  return allowed.includes(String(color).toLowerCase()) ? color : "#16a56f";
}

function statusLabel(status) {
  return {
    ready: "Ready",
    in_progress: "In progress",
    done: "Done"
  }[status] || "Ready";
}

function compareItems(a, b) {
  return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
}

function compareTasks(a, b) {
  const aHasOrder = Number.isInteger(a.sortOrder);
  const bHasOrder = Number.isInteger(b.sortOrder);
  if (aHasOrder && bHasOrder && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
  return compareItems(a, b) || String(a.id).localeCompare(String(b.id));
}

function tableForKind(kind) {
  return {
    tasks: "tasks",
    habits: "habits",
    checklist: "checklist_items"
  }[kind];
}

function collectionForKind(kind) {
  return {
    tasks: "tasks",
    habits: "habits",
    checklist: "checklist"
  }[kind];
}

function visibleItemsForKind(kind) {
  const profile = activeProfile();
  if (!profile) return [];
  const collection = state[collectionForKind(kind)] || [];
  return collection
    .filter((item) => item.profileId === profile.id)
    .filter((item) => kind !== "tasks" || isTaskVisibleToday(item))
    .sort(kind === "tasks" ? compareTasks : compareItems);
}

let dragState = null;

function taskCompletedDate(task) {
  if (!task.completedAt) return task.date;
  return localDateKey(task.completedAt);
}

function isTaskVisibleToday(task) {
  if (task.date > today()) return false;
  if (task.status !== "done") return true;
  return taskCompletedDate(task) === today();
}

function stats(profileId) {
  const dueTasks = state.tasks.filter((task) => task.profileId === profileId && task.date <= today());
  const activeTasks = dueTasks.filter((task) => task.status !== "done");
  const done = dueTasks.filter((task) => task.status === "done" && taskCompletedDate(task) === today()).length;
  const overdue = dueTasks.filter((task) => task.status !== "done" && task.date < today()).length;
  const habits = state.habits.filter((habit) => habit.profileId === profileId);
  const habitScore = habits.length
    ? Math.round(habits.reduce((sum, habit) => sum + Math.min(habit.count / habit.target, 1), 0) / habits.length * 100)
    : 0;
  const checklist = state.checklist.filter((item) => item.profileId === profileId);
  const clean = checklist.filter((item) => item.answer === false).length;
  const answered = checklist.filter((item) => item.answer !== null).length;
  const earnedToday = done * 35 + Math.round(habitScore * 1.5) + clean * 20 + answered * 5;
  const xp = (state.earnedXp[profileId] || 0) + earnedToday;
  const level = Math.floor(xp / 100) + 1;
  const levelProgress = xp % 100;
  return { tasks: activeTasks.length + done, done, overdue, habitScore, clean, checklist: checklist.length, answered, xp, level, levelProgress };
}

function calculateEarnedXpBeforeToday(profileIds, tasks, habits, habitLogs, checklistLogs) {
  const earnedXp = Object.fromEntries(profileIds.map((profileId) => [profileId, 0]));

  for (const task of tasks) {
    const completedDate = task.completed_at ? localDateKey(task.completed_at) : task.task_date;
    if (task.status === "done" && completedDate < today()) {
      earnedXp[task.profile_id] = (earnedXp[task.profile_id] || 0) + 35;
    }
  }

  const habitsByProfile = new Map();
  for (const habit of habits) {
    const profileHabits = habitsByProfile.get(habit.profile_id) || [];
    profileHabits.push(habit);
    habitsByProfile.set(habit.profile_id, profileHabits);
  }

  const habitDays = new Map();
  for (const log of habitLogs) {
    if (log.log_date >= today()) continue;
    const key = `${log.profile_id}:${log.log_date}`;
    const logs = habitDays.get(key) || [];
    logs.push(log);
    habitDays.set(key, logs);
  }
  for (const [key, logs] of habitDays) {
    const profileId = key.split(":", 1)[0];
    const profileHabits = habitsByProfile.get(profileId) || [];
    if (!profileHabits.length) continue;
    const score = profileHabits.reduce((sum, habit) => {
      const count = logs.find((log) => log.habit_id === habit.id)?.count || 0;
      return sum + Math.min(count / habit.target_count, 1);
    }, 0) / profileHabits.length * 100;
    earnedXp[profileId] = (earnedXp[profileId] || 0) + Math.round(Math.round(score) * 1.5);
  }

  for (const log of checklistLogs) {
    if (log.log_date >= today()) continue;
    earnedXp[log.profile_id] = (earnedXp[log.profile_id] || 0) + 5 + (log.answer === false ? 20 : 0);
  }

  return earnedXp;
}

function allHabitsComplete(profileId, habits = state.habits) {
  const profileHabits = habits.filter((habit) => habit.profileId === profileId);
  return profileHabits.length > 0 && profileHabits.every((habit) => habit.count >= habit.target);
}

function profileImage(profile, size = "normal") {
  const content = profile.photo
    ? `<img src="${profile.photo}" alt="${escapeHtml(profile.name)} profile picture" />`
    : `<span>${escapeHtml(profile.avatar || profile.name[0] || "?")}</span>`;
  return `<span class="avatar ${size}" style="--avatar-color:${profile.color}">${content}</span>`;
}

async function hydrateFromSupabase() {
  if (!USE_SUPABASE) return;
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    let profiles = await supabaseRequest("profiles", { query: "?select=id,display_name,avatar,avatar_url,color,streak_count,like_jar_amount,created_at&order=created_at.asc" });
    
    // WORKSPACE FILTER: Hide specific profiles from this secret URL
    profiles = profiles.filter(profile => {
      const name = (profile.display_name || "").toLowerCase();
      // Hide your girlfriend's profile (luabubu) from Kayla's view
      return !name.includes("luabubu") && !name.includes("jonashi");
    });

    const profileIds = profiles.map((profile) => profile.id);
    if (!profileIds.length) {
      state = { ...state, loading: false, profiles: [], tasks: [], habits: [], checklist: [], gratitude: [], activeProfileId: null };
      saveState();
      render();
      notify("Supabase connected. No profiles yet.");
      return;
    }
    const idFilter = `(${profileIds.join(",")})`;
    const [tasks, habits, habitLogs, checklistItems, checklistLogs, gratitude] = await Promise.all([
      supabaseRequest("tasks", { query: `?select=id,profile_id,title,description,task_date,status,sort_order,created_at,completed_at&profile_id=in.${idFilter}&order=sort_order.asc.nullslast,created_at.asc` }),
      supabaseRequest("habits", { query: `?select=id,profile_id,title,target_count,created_at&profile_id=in.${idFilter}&archived_at=is.null&order=created_at.asc` }),
      supabaseRequest("habit_logs", { query: `?select=id,habit_id,profile_id,log_date,count&profile_id=in.${idFilter}` }),
      supabaseRequest("checklist_items", { query: `?select=id,profile_id,prompt,created_at&profile_id=in.${idFilter}&active=eq.true&order=created_at.asc` }),
      supabaseRequest("daily_checklist_logs", { query: `?select=id,checklist_item_id,profile_id,log_date,answer&profile_id=in.${idFilter}` }),
      supabaseRequest("daily_gratitude", { query: `?select=id,profile_id,gratitude_date,note&profile_id=in.${idFilter}&gratitude_date=eq.${today()}` })
    ]);

    const uiState = {
      ...closeOpenForms(),
      gratitudeOpen: false
    };
    const nextState = {
      ...state,
      profiles: profiles.map(mapProfile),
      tasks: tasks.map(mapTask),
      habits: habits.map((habit) => mapHabit(habit, habitLogs.filter((log) => log.log_date === today()))),
      checklist: normalizeChecklist(checklistItems.map((item) => mapChecklistItem(item, checklistLogs.filter((log) => log.log_date === today())))),
      gratitude: gratitude.map(mapGratitude),
      earnedXp: calculateEarnedXpBeforeToday(profileIds, tasks, habits, habitLogs, checklistLogs),
      loading: false,
      activeProfileId: profileIds.includes(state.activeProfileId) ? state.activeProfileId : profileIds[0],
      ...uiState
    };
    const changed = JSON.stringify({
      profiles: state.profiles,
      tasks: state.tasks,
      habits: state.habits,
      checklist: state.checklist,
      gratitude: state.gratitude,
      activeProfileId: state.activeProfileId
    }) !== JSON.stringify({
      profiles: nextState.profiles,
      tasks: nextState.tasks,
      habits: nextState.habits,
      checklist: nextState.checklist,
      gratitude: nextState.gratitude,
      activeProfileId: nextState.activeProfileId
    });
    nextState = organizeKaylaData(nextState);
    state = nextState;
    saveState();
    if (changed) render();
    notify("Supabase connected.");
  } catch (error) {
    console.error(error);
    state = { ...state, loading: false };
    saveState();
    render();
    notify("Supabase needs the SQL schema first.");
  } finally {
    syncInFlight = false;
  }
}

function render() {
  if (state.loading) {
    renderLoadingApp();
    return;
  }

  const profile = activeProfile();
  if (!profile) {
    renderEmptyApp();
    return;
  }
  const profileStats = stats(profile.id);
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      <div class="backdrop ${state.sidebarOpen ? "open" : ""}" data-action="close-sidebar"></div>
      <aside class="sidebar ${state.sidebarOpen ? "open" : ""}">
        <div class="brand">
          ${appImage(brandGifSrc, "monkey-mark")}
          <div>
            <h1>Traquea Monos (K)</h1>
            <p>Vest Self</p>
          </div>
        </div>
        <div class="profile-actions">
          <button class="pill-button primary" data-action="add-profile">+ Profile</button>
          <button class="icon-button" title="Profile settings" data-action="toggle-settings">⚙</button>
        </div>
        ${renderSidebarSettings(profile)}
        ${renderDailyGif()}
        <div class="profile-list">
          ${state.profiles.map((person) => {
            const personStats = stats(person.id);
            return `
              <div class="profile-card ${person.id === profile.id ? "active" : ""}" data-profile="${person.id}" role="button" tabindex="0">
                ${profileImage(person)}
                <span class="profile-copy">
                  <strong>${escapeHtml(person.name)}</strong>
                  <span>Lvl ${personStats.level} · ${personStats.xp} XP</span>
                </span>
                <b class="streak-badge">🔥 ${person.streak}</b>
              </div>
            `;
          }).join("")}
        </div>
        <div style="padding: 16px 16px 4px 16px; margin-top: 8px;">
          <button id="guide-toggle" data-action="open-guide" style="width: 100%; background: #10b981; color: #fff; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <span style="font-size: 16px;">📖</span> Trackeamonos Guide
          </button>
        </div>
        <div style="padding: 4px 16px 16px 16px;">
          <button id="ai-bot-toggle" style="width: 100%; background: #000; color: #fff; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <span style="font-size: 16px;">✨</span> AI Developer
          </button>
        </div>
      </aside>

      <main class="main">
        <div class="mobile-topbar">
          <button class="pill-button" data-action="open-sidebar">☰ People</button>
        </div>
        <header class="top-summary">
          <div class="person-heading">
            ${profileImage(profile, "large")}
            <div>
              <p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
              <h2>${escapeHtml(profile.name)}</h2>
            </div>
          </div>
          <div class="level-card">
            <div>
              <strong>Level ${profileStats.level}</strong>
              <span>${profileStats.xp} XP</span>
            </div>
            <div class="xp-line" style="--xp:${profileStats.levelProgress}%"><div></div></div>
          </div>
          <div class="mini-stat fire"><b>🔥 ${profile.streak}</b><span>streak</span></div>
        </header>

        <section class="workspace">
          <div class="board">
            ${renderTabs()}
            <div class="panel-body">${renderPanel()}</div>
          </div>
          ${renderOverview(profile)}
        </section>
      </main>
      ${state.gratitudeOpen ? renderGratitudeModal() : ""}
      ${state.guideOpen ? renderGuideModal() : ""}
    </div>
  `;

  bindEvents();
}

function renderLoadingApp() {
  document.querySelector("#app").innerHTML = `
    <main class="loading-screen">
      ${appImage(loadingGifSrc, "loading-monkey", "Loading monkey")}
      <h1>Monkey business loading...</h1>
    </main>
  `;
}

function renderEmptyApp() {
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          ${appImage(brandGifSrc, "monkey-mark")}
          <div>
            <h1>Traquea Monos (K)</h1>
            <p>Vest Self</p>
          </div>
        </div>
        <div class="profile-actions">
          <button class="pill-button primary" data-action="add-profile">+ Profile</button>
        </div>
        ${renderDailyGif()}
        <div class="profile-list">
          <div class="empty">No profiles yet.</div>
        </div>
        <div style="padding: 16px; margin-top: 8px;">
          <button id="ai-bot-toggle" style="width: 100%; background: #000; color: #fff; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <span style="font-size: 16px;">✨</span> AI Developer
          </button>
        </div>
      </aside>
      <main class="main">
        <section class="empty-start">
          ${appImage(randomGifSrc(), "empty-logo")}
          <h2>No profiles yet</h2>
          <p>Add a profile when you are ready to start tracking tasks, habits, checklist items, and gratitude.</p>
          <button class="pill-button primary" data-action="add-profile">+ Add profile</button>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function renderSidebarSettings(profile) {
  if (!state.settingsOpen) return "";
  return `
    <section class="sidebar-settings">
      <div class="field">
        <label for="profile-name">Name</label>
        <input id="profile-name" value="${escapeHtml(profile.name)}" />
      </div>
      <div class="field">
        <label for="profile-photo">Profile picture</label>
        <input id="profile-photo" type="file" accept="image/*,.gif" />
      </div>
      <div class="settings-actions">
        <button class="pill-button primary" data-action="save-profile">Save</button>
        <button class="pill-button" data-action="reset-demo">Reset</button>
      </div>
    </section>
  `;
}

function renderDailyGif() {
  return `
    <section class="daily-gif">
      ${appImage(dailyGifSrc, "daily-gif-image", "Daily GIF")}
      <div>
        <strong>Daily GIF</strong>
        <span>${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
    </section>
  `;
}

function renderTabs() {
  return `
    <div class="tab-row">
      ${(() => {
        const prof = activeProfile();
        const isKayla = prof && prof.name.toLowerCase().includes("kayla");
        const availableTabs = ["tasks", "habits", "checklist", "calendar"].filter(t => !(isKayla && t === "calendar"));
        return availableTabs;
      })().map((tab) => `
        <button class="tab-button ${state.activeTab === tab ? "active" : ""}" data-tab="${tab}">
          ${tabLabel(tab)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderPanel() {
  if (state.activeTab === "habits") return renderHabits();
  if (state.activeTab === "checklist") return renderChecklist();
  if (state.activeTab === "calendar") return renderCalendar();
  return renderTasks();
}

function renderCalendar() {
  return `
    <div class="section-head">
      <div>
        <h3>Calendar</h3>
      </div>
    </div>
    <div class="empty">No events yet. Calendar coming soon.</div>
  `;
}

function closeOpenForms() {
  return { taskFormOpen: false, habitFormOpen: false, checkFormOpen: false };
}

function renderTasks() {
  const tasks = byProfile(state.tasks)
    .filter(isTaskVisibleToday)
    .sort(compareTasks);
  return `
    <div class="section-head">
      <div>
        <h3>Tasks</h3>
      </div>
      <button class="pill-button primary" data-action="toggle-task-form">+ Add task</button>
    </div>
    ${state.taskFormOpen ? `
      <form class="add-card" id="task-form">
        <input id="task-title" placeholder="Task name" required />
        <textarea id="task-description" placeholder="Description optional"></textarea>
        <input id="task-date" type="date" value="${today()}" />
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    <div class="item-list">
      ${tasks.length ? tasks.map((task) => `
        <article class="task-item ${task.status}" data-delete-kind="tasks" data-delete-id="${task.id}" data-drag-kind="tasks" data-drag-id="${task.id}">
          <div class="item-title">
            <strong>${escapeHtml(task.title)}</strong>
            ${task.status === "ready" ? "" : `<span>${statusLabel(task.status)}</span>`}
            ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
          </div>
          <div class="task-actions">
            <button class="status-dot progress ${task.status === "in_progress" ? "active" : ""}" data-task-status="${task.id}:in_progress" title="In progress"></button>
            <button class="status-dot complete ${task.status === "done" ? "active" : ""}" data-task-status="${task.id}:done" title="Done">✓</button>
          </div>
        </article>
      `).join("") : `<div class="empty">No active tasks. Future tasks will show on their date.</div>`}
    </div>
  `;
}

function renderHabits() {
  const habits = byProfile(state.habits).sort(compareItems);
  return `
    <div class="section-head">
      <div>
        <h3>Habits</h3>
        <span>Small repeatable wins that build streaks.</span>
      </div>
      <button class="pill-button primary" data-action="toggle-habit-form">+ Add habit</button>
    </div>
    ${state.habitFormOpen ? `
      <form class="add-card two" id="habit-form">
        <input id="habit-title" placeholder="Habit name" required />
        <input id="habit-target" type="number" min="1" max="99" value="1" aria-label="Daily target" />
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    <div class="item-list">
      ${habits.length ? habits.map((habit) => {
        const pct = Math.min(100, Math.round(habit.count / habit.target * 100));
        return `
          <article class="habit-item" data-delete-kind="habits" data-delete-id="${habit.id}" data-drag-kind="habits" data-drag-id="${habit.id}">
            <div class="item-title">
              <strong>${escapeHtml(habit.title)}</strong>
              <span>${habit.count}/${habit.target} today</span>
              <div class="habit-meter" style="--meter:${pct}%"><div></div></div>
            </div>
            <div class="counter">
              <button class="icon-button" data-habit-count="${habit.id}:-1">−</button>
              <b>${pct}%</b>
              <button class="icon-button primary" data-habit-count="${habit.id}:1">+</button>
            </div>
          </article>
        `;
      }).join("") : `<div class="empty">No habits yet. Add one that feels easy to repeat.</div>`}
    </div>
  `;
}

function renderChecklist() {
  const checks = byProfile(state.checklist).sort(compareItems);
  return `
    <div class="section-head">
      <div>
        <h3>End of day</h3>
        <span>Daily statements to confirm before the day closes.</span>
      </div>
      <button class="pill-button primary" data-action="toggle-check-form">+ Add item</button>
    </div>
    ${state.checkFormOpen ? `
      <form class="add-card" id="check-form">
        <input id="check-prompt" placeholder="Example: No reels today" required />
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    <div class="item-list">
      ${checks.length ? checks.map((item) => `
        <article class="check-item" data-delete-kind="checklist" data-delete-id="${item.id}" data-drag-kind="checklist" data-drag-id="${item.id}">
          <div class="item-title">
            <strong>${escapeHtml(item.prompt)}</strong>
            <span>${item.answer === null ? "Not logged yet" : item.answer ? "Confirmed" : "Not today"}</span>
          </div>
          <div class="check-row">
            <button class="${item.answer === true ? "active yes" : ""}" data-check="${item.id}:true">Yes</button>
            <button class="${item.answer === false ? "active no" : ""}" data-check="${item.id}:false">No</button>
          </div>
        </article>
      `).join("") : `<div class="empty">No checklist items yet.</div>`}
    </div>
    ${(() => {
      const prof = activeProfile();
      if (prof && prof.name.toLowerCase().includes("kayla")) return "";
      return `<div class="end-action">
        <button class="pill-button primary gratitude-open" data-action="open-gratitude">Gratitude</button>
      </div>`;
    })()}
  `;
}

function renderGratitudeModal() {
  const gratitude = state.gratitude.find((item) => item.profileId === activeProfile().id && item.date === today()) || { text: "" };
  return `
    <div class="modal-backdrop" data-action="close-gratitude">
      <section class="gratitude-modal" role="dialog" aria-modal="true" aria-labelledby="gratitude-title" data-modal>
        <div class="section-head">
          <div>
            <h3 id="gratitude-title">Gratitude</h3>
            <span>Write one thing worth remembering from today.</span>
          </div>
          <button class="icon-button" data-action="close-gratitude" title="Close">×</button>
        </div>
        <label for="gratitude-text">I am grateful for</label>
        <textarea id="gratitude-text" placeholder="Something small, real, or good from today">${escapeHtml(gratitude.text)}</textarea>
        <button class="pill-button primary" data-action="save-gratitude">Save gratitude</button>
      </section>
    </div>
  `;
}

function renderOverview(profile) {
  const profileStats = stats(profile.id);
  const taskPct = profileStats.tasks ? Math.round(profileStats.done / profileStats.tasks * 100) : 0;
  const checkPct = profileStats.checklist ? Math.round(profileStats.answered / profileStats.checklist * 100) : 0;

  const isLuabubu = profile.name.toLowerCase().includes("luabubu");
  let likeJarHtml = "";
  if (isLuabubu) {
    const likeJarAmount = profile.likeJarAmount || 0;
    const pileHeight = Math.min(80, Math.floor(likeJarAmount * 3));
    const pileOpacity = likeJarAmount > 0 ? 0.85 : 0;

    likeJarHtml = `
      <div class="like-jar-card">
        <div class="like-jar-title">💖 Luabubu's Like Jar</div>
        <div class="jar-wrapper">
          <div class="piggy-jar">
            <div class="coin-pile" style="height: ${pileHeight}px; opacity: ${pileOpacity};"></div>
          </div>
        </div>
        <div class="jar-total">€${likeJarAmount.toFixed(2)}</div>
        <button class="like-btn" data-action="like-jar-hit">
          👍 She said "Like"
        </button>
        <span class="reset-jar-btn" data-action="like-jar-reset" style="font-size: 11px; opacity: 0.5; margin-top: 6px; cursor: pointer; text-decoration: underline;">reset jar</span>
      </div>
    `;
  }

  return `
    <aside class="overview">
      <h3>Today</h3>
      ${likeJarHtml}
      <div class="overview-card">
        <strong>Tasks complete</strong>
        <b>${profileStats.done}/${profileStats.tasks}</b>
        <div class="progress-line" style="--progress-width:${taskPct}%"><div></div></div>
      </div>
      <div class="overview-card">
        <strong>Habit score</strong>
        <b>${profileStats.habitScore}%</b>
        <div class="progress-line" style="--progress-width:${profileStats.habitScore}%"><div></div></div>
      </div>
      <div class="overview-card">
        <strong>Checklist answered</strong>
        <b>${profileStats.answered}/${profileStats.checklist}</b>
        <div class="progress-line" style="--progress-width:${checkPct}%"><div></div></div>
      </div>
      <div class="overview-card xp-card">
        <strong>Experience</strong>
        <b>${profileStats.xp} XP</b>
        <span>Next level in ${100 - profileStats.levelProgress} XP</span>
      </div>
    </aside>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("[data-modal]") && node.classList.contains("modal-backdrop")) return;
      handleAction(node.dataset.action);
    });
  });

  document.querySelectorAll("[data-profile]").forEach((node) => {
    node.addEventListener("click", () => setState({ activeProfileId: node.dataset.profile, sidebarOpen: false, ...closeOpenForms() }));
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      deleteProfile(node.dataset.profile);
    });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setState({ activeProfileId: node.dataset.profile, sidebarOpen: false, ...closeOpenForms() });
    });
    node.addEventListener("dblclick", () => setState({ activeProfileId: node.dataset.profile, activeTab: "tasks", sidebarOpen: false, ...closeOpenForms() }));
  });

  document.querySelectorAll("[data-tab]").forEach((node) => {
    node.addEventListener("click", () => setState({ activeTab: node.dataset.tab, ...closeOpenForms() }));
  });

  document.querySelectorAll("[data-delete-kind]").forEach((node) => {
    const deleteFromCard = (event) => {
      if (event.target.closest("button, input, textarea, label")) return;
      event.preventDefault();
      deleteItem(node.dataset.deleteKind, node.dataset.deleteId);
    };
    node.addEventListener("contextmenu", deleteFromCard);
    node.addEventListener("dblclick", deleteFromCard);
    node.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse" || event.target.closest("button, input, textarea, label")) return;
      if (dragState?.moved) return;
      const now = Date.now();
      const distance = Math.hypot(event.clientX - lastDeleteTap.x, event.clientY - lastDeleteTap.y);
      const sameCard = lastDeleteTap.kind === node.dataset.deleteKind && lastDeleteTap.id === node.dataset.deleteId;
      if (sameCard && now - lastDeleteTap.time < 520 && distance < 28) {
        event.preventDefault();
        lastDeleteTap = { id: null, kind: null, time: 0, x: 0, y: 0 };
        deleteItem(node.dataset.deleteKind, node.dataset.deleteId);
        return;
      }
      lastDeleteTap = {
        kind: node.dataset.deleteKind,
        id: node.dataset.deleteId,
        time: now,
        x: event.clientX,
        y: event.clientY
      };
    });
  });

  document.querySelectorAll("[data-drag-kind]").forEach((node) => {
    node.addEventListener("pointerdown", startDrag);
  });

  document.querySelectorAll("[data-task-status]").forEach((node) => {
    node.addEventListener("click", () => {
      const [id, status] = node.dataset.taskStatus.split(":");
      const current = state.tasks.find((task) => task.id === id);
      const nextStatus = current?.status === status ? "ready" : status;
      const completedNow = current?.status !== "done" && nextStatus === "done";
      state.tasks = state.tasks.map((task) => task.id === id
        ? { ...task, status: nextStatus, completedAt: nextStatus === "done" ? new Date().toISOString() : null }
        : task);
      saveState();
      render();
      persistTaskStatus(id, nextStatus);
      notify(nextStatus === "done" ? "Task done. XP locked in." : "Task updated.", { gif: completedNow });
    });
  });

  document.querySelectorAll("[data-habit-count]").forEach((node) => {
    node.addEventListener("click", () => {
      const [id, delta] = node.dataset.habitCount.split(":");
      const profileId = activeProfile()?.id;
      const completedBefore = profileId ? allHabitsComplete(profileId) : false;
      const current = state.habits.find((habit) => habit.id === id);
      const habitWasComplete = current ? current.count >= current.target : false;
      state.habits = state.habits.map((habit) => habit.id === id
        ? { ...habit, count: Math.max(0, Math.min(habit.target, habit.count + Number(delta))) }
        : habit);
      const updated = state.habits.find((habit) => habit.id === id);
      const habitCompletedNow = updated ? !habitWasComplete && updated.count >= updated.target : false;
      const completedNow = profileId ? !completedBefore && allHabitsComplete(profileId) : false;
      saveState();
      render();
      if (updated) persistHabitLog(updated);
      notify(completedNow ? "All habits complete." : habitCompletedNow ? "Habit complete." : "Habit progress saved.", { gif: completedNow || habitCompletedNow });
    });
  });

  document.querySelectorAll("[data-check]").forEach((node) => {
    node.addEventListener("click", () => {
      const [id, value] = node.dataset.check.split(":");
      const answer = value === "true";
      state.checklist = state.checklist.map((item) => item.id === id ? { ...item, answer } : item);
      const updated = state.checklist.find((item) => item.id === id);
      saveState();
      render();
      if (updated) persistChecklistLog(updated, answer);
      notify("Checklist answer saved.");
    });
  });

  const taskForm = document.querySelector("#task-form");
  if (taskForm) taskForm.addEventListener("submit", addTask);

  const habitForm = document.querySelector("#habit-form");
  if (habitForm) habitForm.addEventListener("submit", addHabit);

  const checkForm = document.querySelector("#check-form");
  if (checkForm) checkForm.addEventListener("submit", addChecklist);
}

function handleAction(action) {
  if (action === "open-sidebar") setState({ sidebarOpen: true });
  if (action === "close-sidebar") setState({ sidebarOpen: false });
  if (action === "toggle-settings") setState({ settingsOpen: !state.settingsOpen });
  if (action === "toggle-task-form") setState({ taskFormOpen: !state.taskFormOpen });
  if (action === "toggle-habit-form") setState({ habitFormOpen: !state.habitFormOpen });
  if (action === "toggle-check-form") setState({ checkFormOpen: !state.checkFormOpen });
  if (action === "open-gratitude") {
    const prof = activeProfile();
    if (prof && prof.name.toLowerCase().includes("kayla")) {
      notify("Gratitude journal is disabled.");
      return;
    }
    setState({ gratitudeOpen: true });
  }
  if (action === "open-guide") setState({ guideOpen: true });
  if (action === "close-guide") setState({ guideOpen: false });
  if (action === "close-gratitude") setState({ gratitudeOpen: false });
  if (action === "add-profile") addProfile();
  if (action === "save-profile") saveProfile();
  if (action === "save-gratitude") saveGratitude();
  if (action === "like-jar-hit") hitLikeJar();
  if (action === "like-jar-reset") resetLikeJar();
  if (action === "reset-demo") {
    try {
      localStorage.removeItem("traquea-monos-state");
    } catch (error) {
      console.warn("Stored state could not be cleared.", error);
    }
    state = cloneState(seed);
    render();
  }
}

async function hitLikeJar() {
  const profile = activeProfile();
  if (!profile) return;

  const prevAmount = profile.likeJarAmount || 0;
  const nextAmount = prevAmount + 0.10;

  // Optimistically update local profile state
  state.profiles = state.profiles.map((p) => p.id === profile.id ? { ...p, likeJarAmount: nextAmount } : p);

  const jarWrapper = document.querySelector(".jar-wrapper");
  const piggyJar = document.querySelector(".piggy-jar");
  const jarTotal = document.querySelector(".jar-total");
  const coinPile = document.querySelector(".coin-pile");

  if (jarWrapper && piggyJar && jarTotal && coinPile) {
    const coin = document.createElement("div");
    coin.className = "dropping-coin";
    coin.dataset.targetAmount = nextAmount.toFixed(2);
    const randomLeft = 40 + Math.random() * 40;
    coin.style.left = `${randomLeft}px`;
    jarWrapper.appendChild(coin);

    coin.addEventListener("animationend", () => {
      const targetAmountVal = parseFloat(coin.dataset.targetAmount);
      coin.remove();

      piggyJar.classList.add("bounce-jar");
      piggyJar.addEventListener("animationend", () => {
        piggyJar.classList.remove("bounce-jar");
      }, { once: true });

      for (let i = 0; i < 3; i++) {
        const sparkle = document.createElement("div");
        sparkle.className = "sparkle";
        sparkle.style.left = `${20 + Math.random() * 80}px`;
        sparkle.style.bottom = `${15 + Math.random() * 20}px`;
        const scale = 0.5 + Math.random() * 0.7;
        sparkle.style.transform = `scale(${scale})`;
        sparkle.style.animation = "sparkle 0.4s ease forwards";
        jarWrapper.appendChild(sparkle);
        sparkle.addEventListener("animationend", () => sparkle.remove());
      }

      jarTotal.textContent = `€${targetAmountVal.toFixed(2)}`;
      jarTotal.classList.add("scale-up");
      setTimeout(() => jarTotal.classList.remove("scale-up"), 200);

      const pileHeight = Math.min(80, Math.floor(targetAmountVal * 3));
      coinPile.style.height = `${pileHeight}px`;
      coinPile.style.opacity = "0.85";
    });
  }

  // Persist update to Supabase
  if (isUuid(profile.id)) {
    try {
      await supabaseRequest(`profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { like_jar_amount: nextAmount }
      });
    } catch (error) {
      console.error("Failed to update Like Jar on Supabase:", error);
    }
  }
}

async function resetLikeJar() {
  const profile = activeProfile();
  if (!profile) return;
  if (!confirm("Reset Luabubu's Like Jar to €0.00?")) return;

  state.profiles = state.profiles.map((p) => p.id === profile.id ? { ...p, likeJarAmount: 0 } : p);
  render();

  if (isUuid(profile.id)) {
    try {
      await supabaseRequest(`profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { like_jar_amount: 0.00 }
      });
      notify("Like Jar reset on Supabase.");
    } catch (error) {
      console.error("Failed to reset Like Jar on Supabase:", error);
      notify("Failed to reset Like Jar on Supabase.");
    }
  }
}



async function addTask(event) {
  event.preventDefault();
  const title = document.querySelector("#task-title").value.trim();
  const description = (document.querySelector("#task-description")?.value || "").trim();
  const date = document.querySelector("#task-date").value || today();
  if (!title) return;
  const profile = activeProfile();
  const nextSortOrder = Math.max(0, ...state.tasks
    .filter((item) => item.profileId === profile.id && Number.isInteger(item.sortOrder))
    .map((item) => item.sortOrder)) + 1;
  let task = { id: uid("task"), profileId: profile.id, title, description, date, status: "ready", sortOrder: nextSortOrder, completedAt: null, createdAt: new Date().toISOString() };
  if (isUuid(profile.id)) {
    try {
      const rows = await supabaseRequest("tasks", {
        method: "POST",
        body: {
          profile_id: profile.id,
          title,
          description,
          task_date: date,
          status: "ready"
        }
      });
      task = mapTask(rows[0]);
    } catch (error) {
      console.error(error);
      notify("Task saved locally. Supabase failed.");
    }
  }
  state.tasks.push(task);
  state.taskFormOpen = false;
  saveState();
  render();
  notify(date > today() ? "Future task saved. It will appear on that day." : "Task added.");
}

async function addHabit(event) {
  event.preventDefault();
  const title = document.querySelector("#habit-title").value.trim();
  const target = Math.max(1, Number(document.querySelector("#habit-target").value) || 1);
  if (!title) return;
  const profile = activeProfile();
  let habit = { id: uid("habit"), profileId: profile.id, title, target, count: 0, createdAt: new Date().toISOString() };
  if (isUuid(profile.id)) {
    try {
      const rows = await supabaseRequest("habits", {
        method: "POST",
        body: {
          profile_id: profile.id,
          title,
          target_count: target
        }
      });
      habit = mapHabit(rows[0], []);
    } catch (error) {
      console.error(error);
      notify("Habit saved locally. Supabase failed.");
    }
  }
  state.habits.unshift(habit);
  state.habitFormOpen = false;
  saveState();
  render();
  notify("Habit added.");
}

async function addChecklist(event) {
  event.preventDefault();
  const prompt = document.querySelector("#check-prompt").value.trim();
  if (!prompt) return;
  const profile = activeProfile();
  let item = { id: uid("check"), profileId: profile.id, prompt, answer: null, createdAt: new Date().toISOString() };
  if (isUuid(profile.id)) {
    try {
      const rows = await supabaseRequest("checklist_items", {
        method: "POST",
        body: {
          profile_id: profile.id,
          prompt
        }
      });
      item = mapChecklistItem(rows[0], []);
    } catch (error) {
      console.error(error);
      notify("Checklist item saved locally. Supabase failed.");
    }
  }
  state.checklist.unshift(item);
  state.checkFormOpen = false;
  saveState();
  render();
  notify("Checklist item added.");
}

async function addProfile() {
  const number = state.profiles.length + 1;
  let profile = {
    id: uid("profile"),
    name: `Player ${number}`,
    color: ["#16a56f", "#2476d9", "#e25b45", "#f4b83b"][number % 4],
    avatar: String(number),
    photo: "",
    streak: 0
  };
  try {
    const rows = await supabaseRequest("profiles", {
      method: "POST",
      body: {
        display_name: profile.name,
        avatar: profile.avatar,
        avatar_url: null,
        color: profile.color,
        streak_count: 0
      }
    });
    profile = mapProfile(rows[0]);
  } catch (error) {
    console.error(error);
    notify("Profile saved locally. Supabase failed.");
  }
  state.profiles.push(profile);
  setState({ activeProfileId: profile.id, settingsOpen: true, sidebarOpen: false });
  notify("Profile created.");
}

async function persistTaskStatus(id, status) {
  if (!isUuid(id)) return;
  try {
    await supabaseRequest("tasks", {
      method: "PATCH",
      query: `?id=eq.${id}`,
      body: {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null
      }
    });
  } catch (error) {
    console.error(error);
    notify("Supabase task update failed.");
  }
}

async function persistHabitLog(habit) {
  if (!isUuid(habit.id) || !isUuid(habit.profileId)) return;
  try {
    await supabaseRequest("habit_logs", {
      method: "POST",
      query: "?on_conflict=habit_id,log_date",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        habit_id: habit.id,
        profile_id: habit.profileId,
        log_date: today(),
        count: habit.count
      }
    });
  } catch (error) {
    console.error(error);
    notify("Supabase habit update failed.");
  }
}

async function persistChecklistLog(item, answer) {
  if (!isUuid(item.id) || !isUuid(item.profileId)) return;
  try {
    await supabaseRequest("daily_checklist_logs", {
      method: "POST",
      query: "?on_conflict=checklist_item_id,log_date",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        checklist_item_id: item.id,
        profile_id: item.profileId,
        log_date: today(),
        answer
      }
    });
  } catch (error) {
    console.error(error);
    notify("Supabase checklist update failed.");
  }
}

async function deleteItem(kind, id) {
  const collectionName = collectionForKind(kind);
  const table = tableForKind(kind);
  if (!collectionName || !table) return;
  if (!window.confirm("Delete this item?")) return;

  state[collectionName] = state[collectionName].filter((item) => item.id !== id);
  saveState();
  render();
  notify("Item deleted.");

  if (!isUuid(id)) return;
  try {
    await supabaseRequest(table, {
      method: "DELETE",
      query: `?id=eq.${id}`,
      prefer: "return=minimal"
    });
  } catch (error) {
    console.error(error);
    notify("Supabase delete failed.");
  }
}

async function deleteProfile(id) {
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) return;
  if (!window.confirm(`Delete ${profile.name}? This removes their tasks, habits, checklist items, and gratitude.`)) return;

  const remainingProfiles = state.profiles.filter((item) => item.id !== id);
  state = {
    ...state,
    profiles: remainingProfiles,
    tasks: state.tasks.filter((item) => item.profileId !== id),
    habits: state.habits.filter((item) => item.profileId !== id),
    checklist: state.checklist.filter((item) => item.profileId !== id),
    gratitude: state.gratitude.filter((item) => item.profileId !== id),
    activeProfileId: state.activeProfileId === id ? remainingProfiles[0]?.id || null : state.activeProfileId,
    ...closeOpenForms(),
    settingsOpen: false,
    gratitudeOpen: false
  };
  saveState();
  render();
  notify("Profile deleted.");

  if (!isUuid(id)) return;
  try {
    await supabaseRequest("profiles", {
      method: "DELETE",
      query: `?id=eq.${id}`,
      prefer: "return=minimal"
    });
  } catch (error) {
    console.error(error);
    notify("Supabase profile delete failed.");
  }
}

function startDrag(event) {
  if (taskReorderInFlight && event.currentTarget.dataset.dragKind === "tasks") return;
  if (event.target.closest("button, input, textarea, label")) return;
  const node = event.currentTarget;
  dragState = {
    kind: node.dataset.dragKind,
    id: node.dataset.dragId,
    startY: event.clientY,
    moved: false
  };
  node.classList.add("dragging");
  node.setPointerCapture(event.pointerId);
  node.addEventListener("pointermove", dragMove);
  node.addEventListener("pointerup", endDrag);
  node.addEventListener("pointercancel", endDrag);
}

function dragMove(event) {
  if (!dragState) return;
  const distance = event.clientY - dragState.startY;
  event.currentTarget.style.transform = `translateY(${Math.max(-80, Math.min(80, distance))}px)`;
  dragState.moved = Math.abs(distance) > 24;
}

function endDrag(event) {
  const node = event.currentTarget;
  node.classList.remove("dragging");
  node.style.transform = "";
  node.removeEventListener("pointermove", dragMove);
  node.removeEventListener("pointerup", endDrag);
  node.removeEventListener("pointercancel", endDrag);

  if (!dragState) return;
  const distance = event.clientY - dragState.startY;
  const direction = Math.abs(distance) < 24 ? 0 : Math.sign(distance);
  const { kind, id, moved } = dragState;
  dragState = null;
  if (moved && direction) moveItem(kind, id, direction);
}

async function moveItem(kind, id, delta) {
  const collectionName = collectionForKind(kind);
  if (!collectionName) return;

  const visible = visibleItemsForKind(kind);
  const index = visible.findIndex((item) => item.id === id);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= visible.length) return;

  const reordered = [...visible];
  const [item] = reordered.splice(index, 1);
  reordered.splice(nextIndex, 0, item);

  if (kind === "tasks") {
    const profileId = activeProfile()?.id;
    if (!profileId) return;
    const previousTasks = state.tasks.map((task) => ({ ...task }));
    const reorderedVisibleIds = reordered.map((entry) => entry.id);
    let visibleIndex = 0;
    const fullOrder = state.tasks
      .filter((task) => task.profileId === profileId)
      .sort(compareTasks)
      .map((task) => reorderedVisibleIds.includes(task.id)
        ? reordered[visibleIndex++]
        : task);

    const sortOrderById = new Map(fullOrder.map((task, order) => [task.id, order + 1]));
    state.tasks = state.tasks.map((task) => sortOrderById.has(task.id)
      ? { ...task, sortOrder: sortOrderById.get(task.id) }
      : task);
    saveState();
    render();

    taskReorderInFlight = true;
    try {
      await persistTaskOrder(profileId, fullOrder.map((task) => task.id));
      notify("Order saved.");
    } catch (error) {
      console.error(error);
      state.tasks = previousTasks;
      saveState();
      render();
      notify("Task order could not be saved. The previous order was restored.");
    } finally {
      taskReorderInFlight = false;
    }
    return;
  }

  const timestampBase = Date.now();
  const createdAtById = new Map(reordered.map((entry, order) => [
    entry.id,
    new Date(timestampBase + order * 1000).toISOString()
  ]));

  state[collectionName] = state[collectionName].map((entry) => (
    createdAtById.has(entry.id) ? { ...entry, createdAt: createdAtById.get(entry.id) } : entry
  ));
  saveState();
  render();
  persistOrder(kind, reordered.map((entry) => ({ ...entry, createdAt: createdAtById.get(entry.id) })));
}

async function persistTaskOrder(profileId, orderedTaskIds) {
  if (!isUuid(profileId) || orderedTaskIds.some((id) => !isUuid(id))) return;
  await supabaseRequest("rpc/reorder_tasks", {
    method: "POST",
    body: {
      profile_id: profileId,
      ordered_task_ids: orderedTaskIds
    },
    prefer: "return=minimal"
  });
}

async function persistOrder(kind, orderedItems) {
  const table = tableForKind(kind);
  if (!table) return;
  try {
    await Promise.all(orderedItems
      .filter((item) => isUuid(item.id))
      .map((item) => supabaseRequest(table, {
        method: "PATCH",
        query: `?id=eq.${item.id}`,
        body: { created_at: item.createdAt }
      })));
    notify("Order saved.");
  } catch (error) {
    console.error(error);
    notify("Supabase order update failed.");
  }
}

function saveProfile() {
  const input = document.querySelector("#profile-name");
  const fileInput = document.querySelector("#profile-photo");
  const name = input ? input.value.trim() : "";
  if (!name) return;

  const applyProfile = async (photo = undefined) => {
    state.profiles = state.profiles.map((profile) => profile.id === activeProfile().id
      ? { ...profile, name, avatar: name[0].toUpperCase(), photo: photo === undefined ? profile.photo : photo }
      : profile);
    const profile = activeProfile();
    if (isUuid(profile.id)) {
      try {
        await supabaseRequest("profiles", {
          method: "PATCH",
          query: `?id=eq.${profile.id}`,
          body: {
            display_name: profile.name,
            avatar: profile.avatar,
            avatar_url: profile.photo || null,
            color: profile.color,
            streak_count: profile.streak
          }
        });
      } catch (error) {
        console.error(error);
        notify("Supabase profile update failed.");
      }
    }
    saveState();
    render();
    notify("Profile saved.");
  };

  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    applyProfile();
    return;
  }

  resizeProfilePhoto(file)
    .then(applyProfile)
    .catch((error) => {
      console.error(error);
      notify("That profile picture could not be processed.");
    });
}

function resizeProfilePhoto(file) {
  const MAX_AVATAR_SIZE = 256;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Profile picture could not be read"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Profile picture is not a valid image"));
      image.onload = () => {
        const scale = Math.min(1, MAX_AVATAR_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Canvas is unavailable"));
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.78));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveGratitude() {
  const text = (document.querySelector("#gratitude-text")?.value || "").trim();
  const existing = state.gratitude.find((item) => item.profileId === activeProfile().id && item.date === today());
  if (existing) {
    state.gratitude = state.gratitude.map((item) => item.id === existing.id ? { ...item, text } : item);
  } else {
    state.gratitude.push({ id: uid("gratitude"), profileId: activeProfile().id, date: today(), text });
  }
  const profile = activeProfile();
  if (isUuid(profile.id)) {
    try {
      await supabaseRequest("daily_gratitude", {
        method: "POST",
        query: "?on_conflict=profile_id,gratitude_date",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          profile_id: profile.id,
          gratitude_date: today(),
          note: text,
          updated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(error);
      notify("Supabase gratitude update failed.");
    }
  }
  state.gratitudeOpen = false;
  saveState();
  render();
  notify("Gratitude saved.");
}

function notify(message, options = {}) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${options.gif ? "with-gif celebration-toast" : ""}`;
  toast.innerHTML = `
    ${options.gif ? appImage(randomGifSrc(), "toast-gif", "Celebration monkey") : ""}
    <div>
      <strong>${options.gif ? "Well done" : "Nice"}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.classList.add("show"), 20);
  window.setTimeout(() => toast.classList.remove("show"), options.gif ? 3200 : 2200);
  window.setTimeout(() => toast.remove(), options.gif ? 3700 : 2700);
}

async function boot() {
  try {
    await loadGifSources();
    dailyGifSrc = dailyGifForDate();
    brandGifSrc = randomGifSrc();
    loadingGifSrc = randomGifSrc();
    render();
    await hydrateFromSupabase();
  } catch (error) {
    console.error(error);
    state = { ...state, loading: false };
    render();
  }
}

boot();


function renderGuideModal() {
  return `
    <div class="modal-backdrop open" data-action="close-guide" data-modal="true">
      <section class="modal-card gratitude-modal" style="max-width: 520px; text-align: left;" onclick="event.stopPropagation()">
        <div class="modal-head">
          <div>
            <h2>📖 Trackeamonos Guide</h2>
            <span>Everything you need to know to organize your day.</span>
          </div>
          <button class="icon-button" data-action="close-guide" title="Close">×</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 16px; font-size: 14px; line-height: 1.5; color: var(--ink);">
          <div style="background: var(--surface-subtle, #f3f4f6); padding: 12px; border-radius: 8px;">
            <strong style="color: #10b981;">📋 Tasks</strong>
            <p style="margin-top: 4px;">Specific action items for today. Check them off when completed to earn XP and level up!</p>
          </div>
          <div style="background: var(--surface-subtle, #f3f4f6); padding: 12px; border-radius: 8px;">
            <strong style="color: #2476d9;">🔁 Habits</strong>
            <p style="margin-top: 4px;">Small repeatable daily wins. Tap (+) to log daily progress and build your streak 🔥.</p>
          </div>
          <div style="background: var(--surface-subtle, #f3f4f6); padding: 12px; border-radius: 8px;">
            <strong style="color: #e25b45;">✅ End of Day Checklist</strong>
            <p style="margin-top: 4px;">Daily confirmation statements to answer (Yes/No) before closing out your day.</p>
          </div>
          <div style="background: var(--surface-subtle, #f3f4f6); padding: 12px; border-radius: 8px;">
            <strong style="color: #f4b83b;">🏆 Level & Streaks</strong>
            <p style="margin-top: 4px;">Stay consistent every day to level up your avatar and keep your daily fire burning!</p>
          </div>
        </div>
        <div style="margin-top: 20px; text-align: right;">
          <button class="pill-button primary" data-action="close-guide">Got it!</button>
        </div>
      </section>
    </div>
  `;
}

function organizeKaylaData(nextState) {
  const kaylaProfile = nextState.profiles.find(p => p.name.toLowerCase().includes("kayla"));
  if (!kaylaProfile) return nextState;

  const kId = kaylaProfile.id;
  let tasks = [...nextState.tasks];
  let checklist = [...nextState.checklist];

  // Re-organize items for Kayla:
  // If a checklist prompt is actually a task (doesn't look like a yes/no statement), move it to tasks.
  const checklistForKayla = checklist.filter(item => item.profileId === kId);
  const tasksForKayla = tasks.filter(t => t.profileId === kId);

  const movedToTasks = [];
  const keptChecklist = [];

  checklistForKayla.forEach(item => {
    const text = item.prompt.trim();
    // If it's an action item like "Buy...", "Finish...", "Clean...", move to tasks
    const isTaskLike = /^(buy|clean|finish|call|send|do|write|make|pay|organize|prep|submit|schedule|pick up)/i.test(text);
    if (isTaskLike) {
      movedToTasks.push({
        id: "task-from-check-" + item.id,
        profileId: kId,
        title: text,
        description: "Organized from checklist",
        date: today(),
        status: item.answer === true ? "done" : "ready",
        sortOrder: 1,
        completedAt: item.answer === true ? new Date().toISOString() : null,
        createdAt: item.createdAt || new Date().toISOString()
      });
    } else {
      keptChecklist.push(item);
    }
  });

  const movedToChecklist = [];
  const keptTasks = [];

  tasksForKayla.forEach(t => {
    const text = t.title.trim();
    // If it's a statement like "No reels...", "Drink 2L...", "Did I...", move to checklist
    const isChecklistLike = /^(no |did i|confirm|check|was i|slept|ate|read )/i.test(text);
    if (isChecklistLike) {
      movedToChecklist.push({
        id: "check-from-task-" + t.id,
        profileId: kId,
        prompt: text,
        answer: t.status === "done" ? true : null,
        createdAt: t.createdAt || new Date().toISOString()
      });
    } else {
      keptTasks.push(t);
    }
  });

  // Re-assemble
  nextState.tasks = [
    ...tasks.filter(t => t.profileId !== kId),
    ...keptTasks,
    ...movedToTasks
  ];
  nextState.checklist = [
    ...checklist.filter(c => c.profileId !== kId),
    ...keptChecklist,
    ...movedToChecklist
  ];

  return nextState;
}
