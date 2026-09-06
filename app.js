const localDateKey = (date = new Date()) => {
  const local = date instanceof Date ? date : new Date(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = () => localDateKey();
const formatDateLabel = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const addDaysToDateKey = (dateKey, days) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
};
const dateKeyDiffDays = (a, b) => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((new Date(ay, am - 1, ad) - new Date(by, bm - 1, bd)) / 86400000);
};
const SUPABASE_URL = "https://kqzwtsqntmusvdzdjhha.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxend0c3FudG11c3ZkemRqaGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDYyNjYsImV4cCI6MjA5OTgyMjI2Nn0.7t7eqkLURQSJv7v7Kv0N7Kmbly_mmVy-e0xePnLsJxY";
const USE_SUPABASE = true;
const JAR_CAPACITY = 1.00;
const JAR_OVERFLOW_PENALTY = 500;
const DEFAULT_GIF_SRC = "./loads/ogwlz-monkey.gif";
const REQUEST_TIMEOUT_MS = 12000;
const ASSET_TIMEOUT_MS = 5000;
const DARK_MODE_KEY = "traquea-monos-dark";
const MOON_PHASES_KEY = "traquea-monos-moon-phases";

function loadDarkMode() {
  try {
    return localStorage.getItem(DARK_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyDarkMode(enabled) {
  document.body.classList.toggle("dark", enabled);
}

let darkModeEnabled = loadDarkMode();
applyDarkMode(darkModeEnabled);

// Full/new moon are always shown to everyone; the other phases are an
// opt-in local display setting (localStorage is per-browser, so this is
// effectively "visible on this device only"). Defaults on.
function loadMoonPhasesEnabled() {
  try {
    const stored = localStorage.getItem(MOON_PHASES_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

let moonPhasesEnabled = loadMoonPhasesEnabled();

// Synodic month approximation, anchored to a known new moon (2000-01-06 18:14 UTC).
const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);
const MOON_PHASE_ICONS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
const MOON_PHASE_LABELS = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];

function moonAgeDays(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const daysSinceNew = (noonUtc - KNOWN_NEW_MOON_UTC) / 86400000;
  return ((daysSinceNew % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
}

// Full/new moon only mark the single calendar day whose local noon falls
// closest to the exact 100% instant, not every day bucketed near it.
function moonPhaseForDateKey(dateKey) {
  const age = moonAgeDays(dateKey);
  const prevAge = moonAgeDays(addDaysToDateKey(dateKey, -1));
  const nextAge = moonAgeDays(addDaysToDateKey(dateKey, 1));
  const distToNew = (a) => Math.min(a, SYNODIC_MONTH_DAYS - a);
  const distToFull = (a) => Math.abs(a - SYNODIC_MONTH_DAYS / 2);
  const isNew = distToNew(age) <= distToNew(prevAge) && distToNew(age) < distToNew(nextAge);
  const isFull = !isNew && distToFull(age) <= distToFull(prevAge) && distToFull(age) < distToFull(nextAge);

  const index = Math.floor((age / SYNODIC_MONTH_DAYS) * 8 + 0.5) % 8;
  const icon = isNew ? "🌑" : isFull ? "🌕" : MOON_PHASE_ICONS[index];
  const label = isNew ? "New moon" : isFull ? "Full moon" : MOON_PHASE_LABELS[index];
  return { icon, label, isKeyPhase: isNew || isFull };
}

const LIKE_JAR_OPEN_KEY = "traquea-monos-like-jar-open";
const COMPLAIN_JAR_OPEN_KEY = "traquea-monos-complain-jar-open";

function loadFoldOpen(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

let likeJarOpen = loadFoldOpen(LIKE_JAR_OPEN_KEY);
let complainJarOpen = loadFoldOpen(COMPLAIN_JAR_OPEN_KEY);

let gifSources = [DEFAULT_GIF_SRC];
let brandGifSrc = DEFAULT_GIF_SRC;
let loadingGifSrc = DEFAULT_GIF_SRC;
let dailyGifSrc = DEFAULT_GIF_SRC;
let introDismissed = false;
let syncInFlight = false;
let taskReorderInFlight = false;
let lastDeleteTap = { id: null, kind: null, time: 0, x: 0, y: 0 };
let lastDragMoveEndAt = 0;

const seed = {
  loading: USE_SUPABASE,
  activeProfileId: null,
  activeTab: "tasks",
  sidebarOpen: false,
  settingsOpen: false,
  taskFormOpen: false,
  habitFormOpen: false,
  checkFormOpen: false,
  folderFormOpen: false,
  openFolderId: null,
  gratitudeOpen: false,
  calendarSearch: "",
  calendarMonthOffset: 0,
  selectedDay: null,
  eventFormOpen: false,
  profiles: [],
  tasks: [],
  folders: [],
  habits: [],
  habitLogs: [],
  checklist: [],
  checklistLogs: [],
  gratitude: [],
  gratitudeShuffle: {},
  periodLogs: [],
  calendarEvents: [],
  tikTik: { timers: {}, schedule: {}, presence: null },
  earnedXp: {},
  profileVisibility: [],
  sectionVisibility: [],
  adminSettingsOpen: false
};

let currentSession = null;
let currentSessionToken = null;

// Initialize Supabase SDK Client
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (supabaseClient) {
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    currentSession = session;
    currentSessionToken = session ? session.access_token : null;
    if (session) {
      hydrateFromSupabase().finally(() => { state.loading = false; render(); });
    } else {
      state.loading = false;
      render();
    }
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    currentSessionToken = session ? session.access_token : null;
    if (session && state.profiles.length === 0) {
      hydrateFromSupabase().finally(() => { state.loading = false; render(); });
    } else {
      state.loading = false;
      render();
    }
  });
} else if (USE_SUPABASE) {
  state.loading = false;
}

let authMode = "login"; // "login" | "signup"

async function handleLogin() {
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  if (!email || !password) { notify("Enter email and password."); return; }
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) notify(error.message);
}

async function handleSignup() {
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  const confirmPassword = document.getElementById("auth-confirm-password")?.value;
  if (!email || !password) { notify("Enter email and password."); return; }
  if (password !== confirmPassword) { notify("Passwords do not match."); return; }
  if (password.length < 6) { notify("Password must be at least 6 characters."); return; }
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) notify(error.message);
  else notify("Check your email for the confirmation link!");
}

function setAuthMode(mode) {
  authMode = mode;
  renderAuth();
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  state.profiles = [];
  state.tasks = [];
  currentSession = null;
  currentSessionToken = null;
  window.location.reload();
}

function renderAuth() {
  const app = document.getElementById("app");
  const isSignup = authMode === "signup";
  app.innerHTML = `
    <div class="intro-screen">
      <div class="intro-content">
        <h1>Trackeamonos</h1>
        <p>${isSignup ? "Create your private account" : "Sign in to your private workspace"}</p>
        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
          <input type="email" id="auth-email" placeholder="Email" class="form-input" />
          <input type="password" id="auth-password" placeholder="Password" class="form-input" />
          ${isSignup ? `<input type="password" id="auth-confirm-password" placeholder="Confirm password" class="form-input" />` : ""}
          ${isSignup
            ? `<button class="pill-button primary" onclick="handleSignup()">Sign Up</button>
               <button class="pill-button secondary" onclick="setAuthMode('login')">Back to Log In</button>`
            : `<button class="pill-button primary" onclick="handleLogin()">Log In</button>
               <button class="pill-button secondary" onclick="setAuthMode('signup')">Sign Up</button>`}
        </div>
      </div>
    </div>
  `;
}



let state = loadState();

function loadState() {
  const base = cloneState(seed);
  const saved = readStoredState();
  if (USE_SUPABASE) {
    if (!saved) return base;
    try {
      const parsed = JSON.parse(saved);
      return {
        ...base,
        activeProfileId: parsed.activeProfileId || base.activeProfileId,
        tikTik: { ...base.tikTik, ...(parsed.tikTik || {}) }
      };
    } catch {
      return base;
    }
  }
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
      gratitude: parsed.gratitude || base.gratitude,
      periodLogs: parsed.periodLogs || base.periodLogs,
      calendarEvents: parsed.calendarEvents || base.calendarEvents,
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
      Authorization: `Bearer ${currentSessionToken || SUPABASE_ANON_KEY}`,
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


function canViewItem(itemProfileId, visibility) {
  if (visibility !== "private") return true;
  const me = myProfile();
  return !!me && me.id === itemProfileId;
}
function canViewSection(profile, sectionName) {
  if (!profile) return true;
  const me = myProfile();
  if (isCurrentUserAdmin()) return true;
  if (me && me.id === profile.id) return true;
  return canViewSectionClient(me ? me.id : null, profile.id, sectionName);
}
function renderVisibilityToggle(item, kind) {
  if (!item) return "";
  const me = myProfile();
  if (!me || me.id !== item.profileId) return "";
  const isPrivate = item.visibility === "private";
  return `<button class="icon-button visibility-toggle" style="background: transparent; border: none; font-size: 1.1rem; padding: 2px 6px; cursor: pointer;" data-toggle-visibility="${kind}:${item.id}" title="${isPrivate ? 'Private' : 'Public'}">${isPrivate ? '🔒' : '👁️'}</button>`;
}

// Small "hide this specific item from person X" control, same idea as gratitude's
// hidden_from but reusable for tasks / habits / checklist_items.
// Small "hide this specific item from person X" icon — visual indicator only.
// The actual interaction is right-click anywhere on the item, which opens the
// Trackeamonos-styled context menu (see openHideFromMenu / bindContextMenus).
function renderHideFromControl(item, table) {
  if (!item) return "";
  if (!activeProfile() || item.profileId !== activeProfile().id) return "";
  const others = state.profiles.filter(p => p.id !== item.profileId);
  if (!others.length) return "";
  const hiddenFrom = item.hiddenFrom || [];
  const hasHidden = hiddenFrom.length > 0;
  return `<span class="icon-button" title="Right-click to hide from specific people" style="background: transparent; border: none; font-size: 1rem; padding: 2px 4px; opacity: ${hasHidden ? 1 : 0.55};">🙈</span>`;
}


function mapProfile(row) {
  return {
    id: row.id,
    name: row.display_name,
    color: profileColor(row.color),
    avatar: row.avatar || row.display_name?.[0]?.toUpperCase() || "?",
    photo: row.avatar_url || "",
    hiddenSections: row.hidden_sections || [],
    sharedWith: row.shared_with || [],
    streak: row.streak_count || 0,
    lastActiveDate: row.last_active_date || null,
    likeJarAmount: row.like_jar_amount != null ? Number(row.like_jar_amount) : 0,
    complainJarAmount: row.complain_jar_amount != null ? Number(row.complain_jar_amount) : 0,
    xpPenalty: row.xp_penalty != null ? Number(row.xp_penalty) : 0,
    authUserId: row.auth_user_id || null,
    isAdmin: !!row.is_admin
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
    folderId: row.folder_id || null,
    completedAt: row.completed_at,
    visibility: row.visibility || "public" || null,
    hiddenFrom: row.hidden_from || [],
    createdAt: row.created_at
  };
}

function mapFolder(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order == null ? null : Number(row.sort_order),
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
    visibility: row.visibility || "public",
    hiddenFrom: row.hidden_from || [],
    count: log?.count || 0,
    createdAt: row.created_at
  };
}

function mapHabitLog(row) {
  return {
    id: row.id,
    habitId: row.habit_id,
    profileId: row.profile_id,
    date: row.log_date,
    count: row.count
  };
}

function mapChecklistItem(row, logs) {
  const log = logs.find((item) => item.checklist_item_id === row.id);
  return {
    id: row.id,
    profileId: row.profile_id,
    prompt: row.prompt,
    visibility: row.visibility || "public",
    hiddenFrom: row.hidden_from || [],
    answer: log ? log.answer : null,
    createdAt: row.created_at
  };
}

function mapChecklistLog(row) {
  return {
    id: row.id,
    checklistItemId: row.checklist_item_id,
    profileId: row.profile_id,
    date: row.log_date,
    answer: row.answer
  };
}

function mapGratitude(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    date: row.gratitude_date,
    text: row.note,
    hiddenFrom: row.hidden_from || []
  };
}

function mapPeriodLog(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    date: row.log_date
  };
}

function mapCalendarEvent(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    type: row.event_type,
    recurring: !!row.recurring,
    createdBy: row.created_by
  };
}

// Recurring events (birthdays) match on month/day every year; one-off events match the exact date.
// Birthdays/events are private to whoever added them — only the profile
// that created an entry sees it on their calendar.
function calendarEventsOnDateKey(dateKey) {
  const owner = activeProfile();
  if (!owner) return [];
  const [, month, day] = dateKey.split("-");
  return (state.calendarEvents || []).filter((item) => {
    if (item.createdBy !== owner.id) return false;
    if (item.recurring) {
      const [, itemMonth, itemDay] = item.date.split("-");
      return itemMonth === month && itemDay === day;
    }
    return item.date === dateKey;
  });
}

function findProfileByName(name) {
  return state.profiles.find((profile) => (profile.name || "").trim().toLowerCase() === name);
}

function isLuabubuProfile(profile) {
  return !!profile && (profile.name || "").trim().toLowerCase() === "luabubu";
}

function isJonashiProfile(profile) {
  return !!profile && (profile.name || "").trim().toLowerCase() === "jonashi";
}

function isFamilyProfile(profile) {
  return isLuabubuProfile(profile) || isJonashiProfile(profile);
}

// Is the currently logged-in profile an admin? Mirrors the DB's is_admin_profile()
// used in RLS — this copy is only for UI filtering/rendering, the real
// enforcement always happens server-side.
function isCurrentUserAdmin() {
  const me = state.profiles.find(p => p.authUserId === (currentSession && currentSession.user.id));
  return !!(me && me.isAdmin);
}

function myProfile() {
  return state.profiles.find(p => p.authUserId === (currentSession && currentSession.user.id)) || null;
}

// Mirrors public.can_view_profile() from the DB, for UI filtering (which
// profile cards to show). RLS is the real gate; this just keeps the UI honest.
function canViewProfileClient(viewerId, targetId) {
  if (!viewerId || !targetId) return true;
  if (viewerId === targetId) return true;
  const viewer = state.profiles.find(p => p.id === viewerId);
  const target = state.profiles.find(p => p.id === targetId);
  if (viewer && viewer.isAdmin) return true;
  const explicit = (state.profileVisibility || []).find(v => v.viewerId === viewerId && v.targetId === targetId);
  if (explicit) return explicit.visible;
  if (isFamilyProfile(viewer) && isFamilyProfile(target)) return true;
  return false;
}

// Mirrors public.can_view_section() from the DB.
function canViewSectionClient(viewerId, ownerId, section) {
  if (!viewerId || !ownerId) return true;
  if (viewerId === ownerId) return true;
  const viewer = state.profiles.find(p => p.id === viewerId);
  const owner = state.profiles.find(p => p.id === ownerId);
  if (viewer && viewer.isAdmin) return true;
  if (!canViewProfileClient(viewerId, ownerId)) return false;
  const explicit = (state.sectionVisibility || []).find(v => v.ownerId === ownerId && v.section === section && v.viewerId === viewerId);
  if (explicit) return explicit.visible;
  if (isFamilyProfile(owner) && isFamilyProfile(viewer)) return true;
  return false;
}

async function setProfileVisibility(viewerId, targetId, visible) {
  const list = (state.profileVisibility || []).filter(v => !(v.viewerId === viewerId && v.targetId === targetId));
  state.profileVisibility = [...list, { viewerId, targetId, visible }];
  render();
  try {
    await supabaseRequest("profile_visibility", {
      method: "POST",
      query: "?on_conflict=viewer_profile_id,target_profile_id",
      body: { viewer_profile_id: viewerId, target_profile_id: targetId, visible },
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  } catch (err) {
    notify("Failed to save profile visibility.");
  }
}

async function setSectionVisibility(ownerId, section, viewerId, visible) {
  const list = (state.sectionVisibility || []).filter(v => !(v.ownerId === ownerId && v.section === section && v.viewerId === viewerId));
  state.sectionVisibility = [...list, { ownerId, section, viewerId, visible }];
  render();
  try {
    await supabaseRequest("section_visibility", {
      method: "POST",
      query: "?on_conflict=owner_profile_id,section,viewer_profile_id",
      body: { owner_profile_id: ownerId, section, viewer_profile_id: viewerId, visible },
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  } catch (err) {
    notify("Failed to save section visibility.");
  }
}

async function toggleHideFromItem(table, itemId, targetProfileId, isChecked) {
  const collectionName = table === "checklist_items" ? "checklist" : table;
  const item = state[collectionName].find(i => i.id === itemId);
  if (!item) return;
  let hiddenFrom = item.hiddenFrom || [];
  if (isChecked && !hiddenFrom.includes(targetProfileId)) {
    hiddenFrom = [...hiddenFrom, targetProfileId];
  } else if (!isChecked) {
    hiddenFrom = hiddenFrom.filter(id => id !== targetProfileId);
  }
  item.hiddenFrom = hiddenFrom;
  render();
  try {
    await supabaseRequest(`${table}?id=eq.${itemId}`, {
      method: "PATCH",
      body: { hidden_from: hiddenFrom }
    });
  } catch (err) {
    notify("Failed to save privacy.");
  }
}

// ---- Trackeamonos-styled context menu, replaces native browser popups ----
function closeContextMenu() {
  const existing = document.querySelector(".context-menu");
  if (existing) existing.remove();
}

function openContextMenu(x, y, title, rowsHtml) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.innerHTML = `
    ${title ? `<div class="context-menu-title">${escapeHtml(title)}</div>` : ""}
    ${rowsHtml || `<div class="context-menu-empty">Nothing to show.</div>`}
  `;
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 12);
  const top = Math.min(y, window.innerHeight - rect.height - 12);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  return menu;
}

if (!window.__contextMenuGlobalBound) {
  window.__contextMenuGlobalBound = true;
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".context-menu")) closeContextMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeContextMenu();
  });
}


// Right-click on a task / habit / checklist item: choose who it's hidden from.
function openItemHideMenu(x, y, table, itemId) {
  const collectionName = table === "checklist_items" ? "checklist" : table;
  const item = state[collectionName].find(i => i.id === itemId);
  if (!item) return;
  const others = state.profiles.filter(p => p.id !== item.profileId);
  const hiddenFrom = item.hiddenFrom || [];
  const rows = others.length
    ? others.map(p => `
        <label>
          <input type="checkbox" data-ctx-hide-item="${table}:${itemId}:${p.id}" ${hiddenFrom.includes(p.id) ? "checked" : ""}>
          🙈 Hide from ${escapeHtml(p.name)}
        </label>
      `).join("")
    : "";
  const menu = openContextMenu(x, y, "Hide this item from...", rows);
  menu.querySelectorAll("[data-ctx-hide-item]").forEach(node => {
    node.addEventListener("change", (e) => {
      const [t, id, targetId] = node.dataset.ctxHideItem.split(":");
      toggleHideFromItem(t, id, targetId, e.target.checked);
    });
  });
}

// Right-click on a profile card: (admin only) choose who can see this profile.
function openProfileVisibilityMenu(x, y, targetProfileId) {
  if (!isCurrentUserAdmin()) return;
  const target = state.profiles.find(p => p.id === targetProfileId);
  if (!target) return;
  const viewers = state.profiles.filter(p => p.id !== targetProfileId);
  const rows = viewers.length
    ? viewers.map(viewer => {
        const visible = canViewProfileClient(viewer.id, targetProfileId);
        return `
          <label>
            <input type="checkbox" data-ctx-profile-vis="${viewer.id}:${targetProfileId}" ${visible ? "checked" : ""}>
            👁️ ${escapeHtml(viewer.name)} can see ${escapeHtml(target.name)}
          </label>
        `;
      }).join("")
    : "";
  const menu = openContextMenu(x, y, `Who can see ${target.name}?`, rows);
  menu.querySelectorAll("[data-ctx-profile-vis]").forEach(node => {
    node.addEventListener("change", (e) => {
      const [viewerId, tId] = node.dataset.ctxProfileVis.split(":");
      setProfileVisibility(viewerId, tId, e.target.checked);
    });
  });
}

// Right-click on a section header: control who sees that section (mine if I own
// it, or — if I'm admin — anyone's).
function openSectionVisibilityMenu(x, y, ownerId, section) {
  const owner = state.profiles.find(p => p.id === ownerId);
  if (!owner) return;
  const isMine = myProfile() && myProfile().id === ownerId;
  if (!isMine && !isCurrentUserAdmin()) return;
  const viewers = state.profiles.filter(p => p.id !== ownerId);
  const rows = viewers.length
    ? viewers.map(viewer => {
        const visible = canViewSectionClient(viewer.id, ownerId, section);
        return `
          <label>
            <input type="checkbox" data-ctx-section-vis="${ownerId}:${section}:${viewer.id}" ${visible ? "checked" : ""}>
            ${escapeHtml(viewer.name)} sees this section
          </label>
        `;
      }).join("")
    : "";
  const menu = openContextMenu(x, y, `${owner.name}'s ${tabLabel(section) || section} — who sees it`, rows);
  menu.querySelectorAll("[data-ctx-section-vis]").forEach(node => {
    node.addEventListener("change", (e) => {
      const [oId, sec, viewerId] = node.dataset.ctxSectionVis.split(":");
      setSectionVisibility(oId, sec, viewerId, e.target.checked);
    });
  });
}

// Period tracking is Lua's own data; Jonas only ever sees her days for awareness.
function periodTrackingSourceProfile() {
  const active = activeProfile();
  if (isLuabubuProfile(active)) return active;
  if (isJonashiProfile(active)) return findProfileByName("luabubu");
  return null;
}

function getPeriodStartDates(profileId) {
  const dates = (state.periodLogs || [])
    .filter((log) => log.profileId === profileId)
    .map((log) => log.date)
    .sort();
  return dates.filter((date, index) => index === 0 || dateKeyDiffDays(date, dates[index - 1]) > 1);
}

// Predicts the next period start from the last logged start date, assuming a
// fixed 28-day cycle (not the averaged cycle length used for ovulation).
function getPredictedPeriodDate(profileId) {
  const starts = getPeriodStartDates(profileId);
  if (!starts.length) return null;
  const lastStart = starts[starts.length - 1];
  return addDaysToDateKey(lastStart, 28);
}

// Predicts the upcoming ovulation day from logged period start dates: ~14 days
// before the next expected period, using the average cycle length if known.
function getPredictedOvulationDate(profileId) {
  const starts = getPeriodStartDates(profileId);
  if (!starts.length) return null;
  const lastStart = starts[starts.length - 1];
  let cycleLength = 28;
  if (starts.length >= 2) {
    const gaps = starts.slice(1).map((date, index) => dateKeyDiffDays(date, starts[index]));
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    cycleLength = Math.min(35, Math.max(21, Math.round(avgGap)));
  }
  return addDaysToDateKey(lastStart, cycleLength - 14);
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
  return { tasks: "Tasks", habits: "Habits", checklist: "Checklist", calendar: "Calendar", timer: "Track", schedule: "Schedule" }[tab];
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
    checklist: "checklist_items",
    folders: "task_folders"
  }[kind];
}

function collectionForKind(kind) {
  return {
    tasks: "tasks",
    habits: "habits",
    checklist: "checklist",
    folders: "folders"
  }[kind];
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
  const checklistAnswered = checklist.filter((item) => item.answer !== null).length;
  const habitsAnswered = habits.filter((habit) =>
    (state.habitLogs || []).some((log) => log.habitId === habit.id && log.date === today())
  ).length;
  const boxes = checklist.length + habits.length;
  const answered = checklistAnswered + habitsAnswered;
  const earnedToday = done * 35 + Math.round(habitScore * 1.5) + clean * 20 + checklistAnswered * 5;
  const xpPenalty = state.profiles.find((p) => p.id === profileId)?.xpPenalty || 0;
  const xp = Math.max(0, (state.earnedXp[profileId] || 0) + earnedToday - xpPenalty);
  const level = Math.floor(xp / 100) + 1;
  const levelProgress = xp % 100;
  return { tasks: activeTasks.length + done, done, overdue, habitScore, clean, checklist: boxes, answered, xp, level, levelProgress };
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
    const profiles = await supabaseRequest("profiles", { query: "?select=id,display_name,avatar,avatar_url,color,streak_count,last_active_date,like_jar_amount,complain_jar_amount,xp_penalty,created_at,hidden_sections,shared_with,auth_user_id,is_admin&order=created_at.asc" });

    const profileIds = profiles.map((profile) => profile.id);
    if (!profileIds.length) {
      state = { ...state, loading: false, profiles: [], tasks: [], folders: [], habits: [], checklist: [], gratitude: [], periodLogs: [], activeProfileId: null };
      saveState();
      render();
      notify("Supabase connected. No profiles yet.");
      return;
    }
    const idFilter = `(${profileIds.join(",")})`;
    const [tasks, folders, habits, habitLogs, checklistItems, checklistLogs, gratitude, periodLogs, calendarEvents, profileVisibility, sectionVisibility] = await Promise.all([
      supabaseRequest("tasks", { query: `?select=id,profile_id,title,description,task_date,status,sort_order,folder_id,created_at,completed_at,visibility,hidden_from&profile_id=in.${idFilter}&order=sort_order.asc.nullslast,created_at.asc` }),
      supabaseRequest("task_folders", { query: `?select=id,profile_id,name,color,sort_order,created_at&profile_id=in.${idFilter}&order=sort_order.asc.nullslast,created_at.asc` }),
      supabaseRequest("habits", { query: `?select=id,profile_id,title,target_count,created_at,visibility,hidden_from&profile_id=in.${idFilter}&archived_at=is.null&order=created_at.asc` }),
      supabaseRequest("habit_logs", { query: `?select=id,habit_id,profile_id,log_date,count&profile_id=in.${idFilter}` }),
      supabaseRequest("checklist_items", { query: `?select=id,profile_id,prompt,created_at,visibility,hidden_from&profile_id=in.${idFilter}&active=eq.true&order=created_at.asc` }),
      supabaseRequest("daily_checklist_logs", { query: `?select=id,checklist_item_id,profile_id,log_date,answer&profile_id=in.${idFilter}` }),
      supabaseRequest("daily_gratitude", { query: `?select=id,profile_id,gratitude_date,note,hidden_from&profile_id=in.${idFilter}&order=gratitude_date.desc` }),
      supabaseRequest("period_logs", { query: `?select=id,profile_id,log_date&profile_id=in.${idFilter}` }),
      supabaseRequest("calendar_events", { query: "?select=id,title,event_date,event_type,recurring,created_by&order=event_date.asc" }),
      supabaseRequest("profile_visibility", { query: "?select=viewer_profile_id,target_profile_id,visible" }).catch(() => []),
      supabaseRequest("section_visibility", { query: "?select=owner_profile_id,section,viewer_profile_id,visible" }).catch(() => [])
    ]);

    const uiState = {
      ...closeOpenForms(),
      gratitudeOpen: false
    };
    const mappedTasks = tasks.map(mapTask);
    const nonEmptyFolders = folders
      .map(mapFolder)
      .filter((folder) => mappedTasks.some((task) => task.folderId === folder.id));
    const removedFolders = folders
      .map(mapFolder)
      .filter((folder) => !nonEmptyFolders.some((kept) => kept.id === folder.id));
    removedFolders.forEach((folder) => {
      if (!isUuid(folder.id)) return;
      supabaseRequest("task_folders", {
        method: "DELETE",
        query: `?id=eq.${folder.id}`,
        prefer: "return=minimal"
      }).catch((error) => console.error("Failed to delete empty folder:", error));
    });
    const nextState = {
      ...state,
      profiles: profiles.map(mapProfile),
      tasks: mappedTasks,
      folders: nonEmptyFolders,
      habits: habits.map((habit) => mapHabit(habit, habitLogs.filter((log) => log.log_date === today()))),
      habitLogs: habitLogs.map(mapHabitLog),
      checklist: normalizeChecklist(checklistItems.map((item) => mapChecklistItem(item, checklistLogs.filter((log) => log.log_date === today())))),
      checklistLogs: checklistLogs.map(mapChecklistLog),
      gratitude: gratitude.map(mapGratitude),
      periodLogs: periodLogs.map(mapPeriodLog),
      calendarEvents: calendarEvents.map(mapCalendarEvent),
      profileVisibility: profileVisibility.map(v => ({ viewerId: v.viewer_profile_id, targetId: v.target_profile_id, visible: v.visible })),
      sectionVisibility: sectionVisibility.map(v => ({ ownerId: v.owner_profile_id, section: v.section, viewerId: v.viewer_profile_id, visible: v.visible })),
      earnedXp: calculateEarnedXpBeforeToday(profileIds, tasks, habits, habitLogs, checklistLogs),
      loading: false,
      activeProfileId: (() => {
        const mapped = profiles.map(mapProfile);
        const mine = currentSession && mapped.find(p => p.authUserId === currentSession.user.id);
        if (mine) return mine.id;
        return profileIds.includes(state.activeProfileId) ? state.activeProfileId : profileIds[0];
      })(),
      ...uiState
    };
    const changed = JSON.stringify({
      profiles: state.profiles,
      tasks: state.tasks,
      folders: state.folders,
      habits: state.habits,
      habitLogs: state.habitLogs,
      checklist: state.checklist,
      checklistLogs: state.checklistLogs,
      gratitude: state.gratitude,
      periodLogs: state.periodLogs,
      calendarEvents: state.calendarEvents,
      activeProfileId: state.activeProfileId
    }) !== JSON.stringify({
      profiles: nextState.profiles,
      tasks: nextState.tasks,
      folders: nextState.folders,
      habits: nextState.habits,
      habitLogs: nextState.habitLogs,
      checklist: nextState.checklist,
      checklistLogs: nextState.checklistLogs,
      gratitude: nextState.gratitude,
      periodLogs: nextState.periodLogs,
      calendarEvents: nextState.calendarEvents,
      activeProfileId: nextState.activeProfileId
    });
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

// A profile's streak is the number of consecutive calendar days that profile
// has been the active/open profile in the app. Checked once per profile per
// day (guarded by streakCheckedProfiles) so it only bumps on the first
// render of a new day, not on every re-render.
let streakCheckedProfiles = new Set();

function maybeBumpStreak(profile) {
  if (!profile) return;
  if (streakCheckedProfiles.has(profile.id)) return;
  const todayKey = today();
  if (profile.lastActiveDate === todayKey) {
    streakCheckedProfiles.add(profile.id);
    return;
  }
  streakCheckedProfiles.add(profile.id);
  const yesterdayKey = addDaysToDateKey(todayKey, -1);
  const nextStreak = profile.lastActiveDate === yesterdayKey ? (profile.streak || 0) + 1 : 1;
  state.profiles = state.profiles.map((item) => item.id === profile.id
    ? { ...item, streak: nextStreak, lastActiveDate: todayKey }
    : item);
  saveState();
  if (isUuid(profile.id)) {
    supabaseRequest("profiles", {
      method: "PATCH",
      query: `?id=eq.${profile.id}`,
      body: { streak_count: nextStreak, last_active_date: todayKey },
      prefer: "return=minimal"
    }).catch((error) => {
      console.error(error);
      notify("Streak update failed to save to Supabase.");
    });
  }
}

function render() {
  if (state.loading) {
    renderLoadingApp();
    return;
  }
  if (USE_SUPABASE && !currentSession) {
    renderAuth();
    return;
  }
  if (!introDismissed) {
    renderIntro();
    return;
  }
  maybeBumpStreak(activeProfile());

  const profile = activeProfile();
  if (!profile) {
    renderEmptyApp();
    return;
  }
  const profileStats = stats(profile.id);
  const previousMain = document.querySelector(".main");
  const scrollTop = previousMain ? previousMain.scrollTop : 0;
  const windowScrollY = window.scrollY;
  const previousTaskBank = document.querySelector(".schedule-task-bank");
  const taskBankScrollTop = previousTaskBank ? previousTaskBank.scrollTop : 0;
  const previousPanelBody = document.querySelector(".panel-body");
  const panelBodyScrollTop = previousPanelBody ? previousPanelBody.scrollTop : 0;
  const previousOverview = document.querySelector(".overview");
  const overviewScrollTop = previousOverview ? previousOverview.scrollTop : 0;
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      <div class="backdrop ${state.sidebarOpen ? "open" : ""}" data-action="close-sidebar"></div>
      <aside class="sidebar ${state.sidebarOpen ? "open" : ""}">
        <div class="brand">
          ${appImage(brandGifSrc, "monkey-mark")}
          <div>
            <h1>Traquea Monos</h1>
            <p>shared progress tracker</p>
          </div>
        </div>
        <div class="profile-actions">
          <button class="pill-button primary" data-action="add-profile">+ Profile</button>
          <button class="icon-button" title="Toggle dark mode" data-action="toggle-dark-mode">${darkModeEnabled ? "☀" : "🌙"}</button>
          <button class="icon-button" title="Profile settings" data-action="toggle-settings">⚙</button>
          <button class="icon-button" title="Monkey Mode" data-action="toggle-monkey-mode" id="monkey-mode-btn">🐒</button>
        </div>
        ${renderSidebarSettings(profile)}
        ${renderDailyGif()}
        ${renderGratitudeRecap()}
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
      ${state.adminSettingsOpen ? renderAdminSettingsModal() : ""}
    </div>
  `;

  bindEvents();
  const restoreScroll = () => {
    const newMain = document.querySelector(".main");
    if (newMain) newMain.scrollTop = scrollTop;
    window.scrollTo(0, windowScrollY);
    const newTaskBank = document.querySelector(".schedule-task-bank");
    if (newTaskBank) newTaskBank.scrollTop = taskBankScrollTop;
    const newPanelBody = document.querySelector(".panel-body");
    if (newPanelBody) newPanelBody.scrollTop = panelBodyScrollTop;
    const newOverview = document.querySelector(".overview");
    if (newOverview) newOverview.scrollTop = overviewScrollTop;
  };
  restoreScroll();
  requestAnimationFrame(restoreScroll);
}

function renderIntro() {
  document.querySelector("#app").innerHTML = `
    <main class="intro-screen">
      ${appImage(dailyGifSrc, "intro-gif", "Daily GIF")}
      <p class="intro-caption">Click to enter</p>
    </main>
  `;
  document.querySelector(".intro-screen").addEventListener("click", () => {
    introDismissed = true;
    render();
  });
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
            <h1>Traquea Monos</h1>
            <p>shared progress tracker</p>
          </div>
        </div>
        <div class="profile-actions">
          <button class="pill-button primary" data-action="add-profile">+ Profile</button>
          <button class="icon-button" title="Toggle dark mode" data-action="toggle-dark-mode">${darkModeEnabled ? "☀" : "🌙"}</button>
        </div>
        ${renderDailyGif()}
        <div class="profile-list">
          <div class="empty">No profiles yet.</div>
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
        <label for="profile-name">Name${isCurrentUserAdmin() ? '<span class="admin-badge">Admin</span>' : ''}</label>
        <input id="profile-name" value="${escapeHtml(profile.name)}" />
      </div>
      <div class="field">
        <label>Share My Data With</label>
        <div class="checkbox-group">
          ${state.profiles.filter(p => p.id !== profile.id).map(p => `
            <label>
              <input type="checkbox" data-share-with="${p.id}" ${(profile.sharedWith || []).includes(p.id) ? "checked" : ""}>
              ${escapeHtml(p.name)}
            </label>
          `).join("")}
        </div>
      </div>
      <button class="pill-button secondary" onclick="handleLogout()" style="margin-top: 15px; width: 100%;">Log Out</button>
      <div class="field">
        <label>Hide Sections from Others</label>
        <div class="checkbox-group">
          ${["tasks", "habits", "checklist", "gratitude"].map(sec => `
            <label><input type="checkbox" data-section-hide="${sec}" ${(profile.hiddenSections || []).includes(sec) ? "checked" : ""}> ${sec}</label>
          `).join("")}
        </div>
      </div>
      <div class="field">
        <label for="profile-photo">Profile picture</label>
        <input id="profile-photo" type="file" accept="image/*,.gif" />
      </div>
      ${isCurrentUserAdmin() ? `
        <div class="field">
          <button type="button" class="pill-button primary" data-action="open-admin-settings" style="width: 100%;">🛠️ Admin: Who Sees What</button>
        </div>
      ` : ""}
      <div class="settings-actions">
        <button class="pill-button primary" data-action="save-profile">Save</button>
        <button class="pill-button" data-action="reset-demo">Reset</button>
      </div>
    </section>
  `;
}

function renderAdminSettingsModal() {
  if (!state.adminSettingsOpen) return "";
  const profiles = state.profiles;
  return `
    <div class="modal-backdrop" data-action="close-admin-settings">
      <section class="settings-modal" role="dialog" aria-modal="true" data-modal>
        <div class="section-head">
          <div>
            <h3>Admin: Who Sees What</h3>
            <span>Full control over profile visibility and section sharing.</span>
          </div>
          <button class="icon-button" data-action="close-admin-settings" title="Close">×</button>
        </div>

        <div>
          <h4 style="margin: 0 0 8px;">Profile visibility</h4>
          <div class="visibility-grid">
            ${profiles.map(target => `
              <div class="visibility-row">
                <strong>${escapeHtml(target.name)}${target.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}</strong>
                <div class="checkbox-group">
                  ${profiles.filter(v => v.id !== target.id).map(viewer => `
                    <label>
                      <input type="checkbox" data-admin-profile-vis="${viewer.id}:${target.id}" ${canViewProfileClient(viewer.id, target.id) ? "checked" : ""}>
                      ${escapeHtml(viewer.name)}
                    </label>
                  `).join("")}
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <div>
          <h4 style="margin: 0 0 8px;">Section visibility</h4>
          <div class="visibility-grid">
            ${profiles.map(owner => `
              ${["tasks", "habits", "checklist", "gratitude"].map(sec => `
                <div class="visibility-row">
                  <strong>${escapeHtml(owner.name)} — ${sec}</strong>
                  <div class="checkbox-group">
                    ${profiles.filter(v => v.id !== owner.id).map(viewer => `
                      <label>
                        <input type="checkbox" data-admin-section-vis="${owner.id}:${sec}:${viewer.id}" ${canViewSectionClient(viewer.id, owner.id, sec) ? "checked" : ""}>
                        ${escapeHtml(viewer.name)}
                      </label>
                    `).join("")}
                  </div>
                </div>
              `).join("")}
            `).join("")}
          </div>
        </div>

        <div>
          <h4 style="margin: 0 0 8px;">Make admin</h4>
          <div class="visibility-grid">
            <div class="visibility-row">
              <strong>Grant admin powers</strong>
              <div class="checkbox-group">
                ${profiles.map(p => `
                  <label>
                    <input type="checkbox" data-admin-grant="${p.id}" ${p.isAdmin ? "checked" : ""}>
                    ${escapeHtml(p.name)}
                  </label>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
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

function hashString(value) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

// One of the gratitudes each of Lua and Jonas has written so far, picked in
// no particular order — today's pick can be something from weeks ago. The
// pick is seeded by the date + profile so it stays put for the whole day
// instead of reshuffling on every render.
function latestGratitudeByName(name) {
  const owner = findProfileByName(name);
  if (!owner) return null;
  const me = myProfile();
  const myId = me ? me.id : null;
  const entries = (state.gratitude || []).filter(g => !g.hiddenFrom || !g.hiddenFrom.includes(myId))
    .filter((item) => item.profileId === owner.id && item.text && item.text.trim())
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!entries.length) return null;
  const shuffleSeed = (state.gratitudeShuffle || {})[owner.id] || "";
  const index = hashString(`${today()}:${owner.id}:${shuffleSeed}`) % entries.length;
  return { name: owner.name, date: entries[index].date, text: entries[index].text };
}

function renderGratitudeRecap() {
  const entries = [latestGratitudeByName("luabubu"), latestGratitudeByName("jonashi")].filter(Boolean);
  if (!entries.length) return "";
  return `
    <section class="gratitude-recap">
      <strong>Gratitude journal</strong>
      ${entries.map((entry) => `
        <div class="gratitude-recap-entry">
          <span class="gratitude-recap-name">${escapeHtml(entry.name)} <i>${formatDateLabel(entry.date)}</i></span>
          <p>${escapeHtml(entry.text)}</p>
        </div>
      `).join("")}
    </section>
  `;
}

function renderTabs() {
  return `
    <div class="tab-row">
      ${["tasks", "schedule", "timer", "checklist", "calendar"].map((tab) => `
        <button class="tab-button ${state.activeTab === tab ? "active" : ""}" data-tab="${tab}">
          ${tabLabel(tab)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderPanel() {
  if (state.activeTab === "timer") return typeof renderTikTikTimer === "function" ? renderTikTikTimer() : "";
  if (state.activeTab === "schedule") return typeof renderTikTikSchedule === "function" ? renderTikTikSchedule() : "";
  if (state.activeTab === "checklist") return renderChecklist();
  if (state.activeTab === "calendar") return renderCalendar();
  return renderTasks();
}

function renderCalendarGroup(title, daysArray, dateKeyForDay, todayDate, isMetFn) {
  let daysMet = 0;
  const dayCells = daysArray.map((day) => {
    const dateKey = dateKeyForDay(day);
    const met = isMetFn(dateKey);
    const isFuture = day > todayDate;
    if (met) daysMet += 1;
    const cls = isFuture ? "calendar-day future" : met ? "calendar-day met" : "calendar-day";
    return `<div class="${cls}" title="${dateKey}">${day}</div>`;
  }).join("");

  return `
    <article class="calendar-habit">
      <div class="calendar-habit-head">
        <strong>${escapeHtml(title)}</strong>
        <span>${daysMet}/${daysArray.length} days this month</span>
      </div>
      <div class="calendar-day-grid">${dayCells}</div>
    </article>
  `;
}

function renderCalendarSection(icon, label, rowsHtml) {
  if (!rowsHtml) return "";
  return `
    <div class="calendar-section">
      <span class="calendar-section-label">${icon} ${label}</span>
      <div class="item-list">${rowsHtml}</div>
    </div>
  `;
}

function renderCalendarDayDetail(dateKey) {
  const dayTasks = byProfile(state.tasks).filter((task) => task.date === dateKey
    || (task.status === "done" && taskCompletedDate(task) === dateKey));
  const habitLogs = (state.habitLogs || []).filter((log) => activeProfile() && log.profileId === activeProfile().id && log.date === dateKey);
  const habitsById = new Map(byProfile(state.habits).map((habit) => [habit.id, habit]));
  const dayHabits = habitLogs
    .map((log) => ({ log, habit: habitsById.get(log.habitId) }))
    .filter((entry) => entry.habit);

  const checklistLogsForDay = (state.checklistLogs || []).filter((log) => activeProfile() && log.profileId === activeProfile().id && log.date === dateKey);
  const checklistById = new Map(byProfile(state.checklist).map((item) => [item.id, item]));
  const dayChecklist = checklistLogsForDay
    .map((log) => ({ log, item: checklistById.get(log.checklistItemId) }))
    .filter((entry) => entry.item);

  const sourceProfile = periodTrackingSourceProfile();
  const isPeriodDay = sourceProfile
    ? (state.periodLogs || []).some((log) => log.profileId === sourceProfile.id && log.date === dateKey)
    : false;
  const isOvulationDay = sourceProfile ? getPredictedOvulationDate(sourceProfile.id) === dateKey : false;
  const canToggle = isLuabubuProfile(activeProfile());

  const dayEvents = calendarEventsOnDateKey(dateKey);
  const eventRows = dayEvents.map((item) => `
    <div class="calendar-upcoming-row">
      <strong>${item.type === "birthday" ? "🎂" : "📌"} ${escapeHtml(item.title)}</strong>
      <button class="icon-button" title="Delete" data-delete-event-id="${item.id}">✕</button>
    </div>
  `).join("");
  const eventsBlock = renderCalendarSection("🎉", "Events", eventRows);

  let periodToggle = "";
  if (canToggle) {
    periodToggle = `
      <button class="pill-button period-toggle${isPeriodDay ? " active" : ""}" data-action="toggle-period-day">
        🩸 ${isPeriodDay ? "Unmark period day" : "Mark period day"}
      </button>
    `;
  } else if (sourceProfile && (isPeriodDay || isOvulationDay)) {
    periodToggle = `
      <div class="period-note">${isPeriodDay ? "🩸 Lua's period day" : "🥚 Lua's predicted ovulation day"}</div>
    `;
  }

  if (!dayTasks.length && !dayHabits.length && !dayChecklist.length && !dayEvents.length) {
    return `
      <div class="calendar-day-detail">
        <h4>${formatDateLabel(dateKey)}</h4>
        ${eventsBlock}
        <div class="empty">Nothing tracked on ${formatDateLabel(dateKey)}.</div>
        ${periodToggle}
      </div>
    `;
  }

  const taskRows = dayTasks.map((task) => `
    <div class="calendar-upcoming-row status-${task.status}">
      <strong>${escapeHtml(task.title)}</strong>
      <span>${statusLabel(task.status)}</span>
    </div>
  `).join("");

  const habitRows = dayHabits.map(({ log, habit }) => `
    <div class="calendar-upcoming-row ${log.count >= habit.target ? "status-done" : ""}">
      <strong>${escapeHtml(habit.title)}</strong>
      <span>${log.count}/${habit.target} ${log.count >= habit.target ? "✓" : ""}</span>
    </div>
  `).join("");

  const checklistRows = dayChecklist.map(({ log, item }) => `
    <div class="calendar-upcoming-row ${log.answer ? "status-done" : "status-off"}">
      <strong>${escapeHtml(item.prompt)}</strong>
      <span>${log.answer ? "Yes ✓" : "No"}</span>
    </div>
  `).join("");

  return `
    <div class="calendar-day-detail">
      <h4>${formatDateLabel(dateKey)}</h4>
      ${eventsBlock}
      ${renderCalendarSection("📋", "Tasks", taskRows)}
      ${renderCalendarSection("🔁", "Habits", habitRows)}
      ${renderCalendarSection("✅", "Checklist", checklistRows)}
      ${periodToggle}
    </div>
  `;
}

function renderCalendar() {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + (state.calendarMonthOffset || 0), 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const dateKeyForDay = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const todayKey = today();

  const query = (state.calendarSearch || "").trim().toLowerCase();

  if (query) {
    const habits = byProfile(state.habits).sort(compareItems)
      .filter((habit) => habit.title.toLowerCase().includes(query));
    const habitLogs = (state.habitLogs || []).filter((log) => activeProfile() && log.profileId === activeProfile().id);

    const habitRows = habits.map((habit) => {
      const logsForHabit = habitLogs.filter((log) => log.habitId === habit.id);
      return renderCalendarGroup(habit.title, daysArray, dateKeyForDay, todayDate, (dateKey) => {
        const log = logsForHabit.find((item) => item.date === dateKey);
        return (log?.count || 0) >= habit.target;
      });
    }).join("");

    const upcomingTasks = byProfile(state.tasks)
      .filter((task) => task.title.toLowerCase().includes(query))
      .filter((task) => task.status !== "done" && task.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

    const upcomingHtml = upcomingTasks.length ? `
      <div class="calendar-upcoming">
        <h4>Upcoming tasks</h4>
        <div class="item-list">
          ${upcomingTasks.map((task) => `
            <div class="calendar-upcoming-row">
              <strong>${escapeHtml(task.title)}</strong>
              <span>${formatDateLabel(task.date)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    ` : "";

    const hasResults = habitRows || upcomingHtml;

    return `
      <div class="section-head">
        <div>
          <h3>Calendar</h3>
          <span>${monthLabel}</span>
        </div>
        <div class="counter">
          <button class="icon-button" title="Previous month" data-action="calendar-prev-month">&larr;</button>
          <button class="icon-button" title="Next month" data-action="calendar-next-month">&rarr;</button>
        </div>
      </div>
      <input id="calendar-search" class="calendar-search" type="search" placeholder="Search a habit for its monthly count, or a task for upcoming dates…" value="${escapeHtml(state.calendarSearch || "")}" />
      ${hasResults
        ? `${habitRows ? `<div class="calendar-habit-list">${habitRows}</div>` : ""}${upcomingHtml}`
        : `<div class="empty">No habit or upcoming task matches "${escapeHtml(state.calendarSearch)}".</div>`}
    `;
  }

  return `
    <div class="section-head">
      <div>
        <h3>Calendar</h3>
        <span>${monthLabel}</span>
      </div>
      <div class="counter">
        <button class="icon-button" title="Previous month" data-action="calendar-prev-month">&larr;</button>
        <button class="icon-button" title="Next month" data-action="calendar-next-month">&rarr;</button>
        <button class="pill-button primary" data-action="toggle-event-form">+ Event</button>
        <button class="icon-button" title="${moonPhasesEnabled ? "Hide daily moon phases (full/new moon stay visible)" : "Show daily moon phases on this device"}" data-action="toggle-moon-phases">${moonPhasesEnabled ? "🌗" : "🌑"}</button>
      </div>
    </div>
    <input id="calendar-search" class="calendar-search" type="search" placeholder="Search a habit for its monthly count, or a task for upcoming dates…" value="${escapeHtml(state.calendarSearch || "")}" />
    ${state.eventFormOpen ? `
      <form class="add-card" id="event-form">
        <input id="event-title" placeholder="What's the event?" required />
        <input id="event-date" type="date" value="${todayKey}" />
        <button class="pill-button primary" type="submit">Save</button>
      </form>
    ` : ""}
    <div class="calendar-legend">
      ${periodTrackingSourceProfile() ? `
        <span><i class="legend-dot period"></i> Period/Ovulation</span>
      ` : ""}
      <span><i class="legend-dot event"></i> Event</span>
      <span>🌕 Full moon · 🌑 New moon${moonPhasesEnabled ? " · other phases shown daily (this device only)" : ""}</span>
    </div>
    <div class="calendar-weekdays">
      ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => `<span>${label}</span>`).join("")}
    </div>
    <div class="calendar-grid">
      ${Array.from({ length: new Date(year, month, 1).getDay() }, () => `<div class="day-box empty"></div>`).join("")}
      ${(() => {
        const sourceProfile = periodTrackingSourceProfile();
        const periodDates = sourceProfile
          ? new Set((state.periodLogs || []).filter((log) => log.profileId === sourceProfile.id).map((log) => log.date))
          : new Set();
        const ovulationDate = sourceProfile ? getPredictedOvulationDate(sourceProfile.id) : null;
        const predictedPeriodDate = sourceProfile ? getPredictedPeriodDate(sourceProfile.id) : null;
        return daysArray.map((day) => {
          const dateKey = dateKeyForDay(day);
          const isPeriodDay = periodDates.has(dateKey);
          const isOvulationDay = !isPeriodDay && ovulationDate === dateKey;
          const isPredictedPeriodDay = !isPeriodDay && predictedPeriodDate === dateKey;
          const dayEvents = calendarEventsOnDateKey(dateKey);
          const hasBirthday = dayEvents.some((item) => item.type === "birthday");
          const hasEvent = dayEvents.some((item) => item.type === "event");
          const moonPhase = moonPhaseForDateKey(dateKey);
          const showMoon = moonPhase.isKeyPhase || moonPhasesEnabled;
          const titleParts = [
            isPeriodDay ? "Period day" : "",
            isOvulationDay ? "Predicted ovulation day" : "",
            isPredictedPeriodDay ? "Predicted period day (28-day cycle)" : "",
            ...dayEvents.map((item) => item.type === "birthday" ? `🎂 ${item.title}` : `📌 ${item.title}`),
            showMoon ? moonPhase.label : ""
          ].filter(Boolean);
          const cls = [
            "day-box",
            dateKey === todayKey ? "today" : "",
            dateKey === state.selectedDay ? "selected" : "",
            isPeriodDay ? "period" : "",
            isOvulationDay ? "ovulation" : "",
            isPredictedPeriodDay ? "predicted-period" : "",
            hasBirthday ? "birthday" : "",
            hasEvent ? "event" : ""
          ].filter(Boolean).join(" ");
          return `<div class="${cls}" data-calendar-day="${dateKey}" title="${escapeHtml(titleParts.join(" · "))}">
            <span class="day-number">${day}</span>
            ${showMoon ? `<span class="moon-phase">${moonPhase.icon}</span>` : ""}
          </div>`;
        }).join("");
      })()}
    </div>
    ${state.selectedDay ? renderCalendarDayDetail(state.selectedDay) : ""}
  `;
}

function closeOpenForms() {
  return { taskFormOpen: false, habitFormOpen: false, checkFormOpen: false, folderFormOpen: false, openFolderId: null, selectedDay: null, eventFormOpen: false };
}

function renderTaskItem(task) {
  return `
    <article class="task-item ${task.status}" data-delete-kind="tasks" data-delete-id="${task.id}" data-drag-kind="tasks" data-drag-id="${task.id}" data-drag-scope="tasks-${task.folderId || "unfiled"}">
      <div class="item-title">
        <strong>${escapeHtml(task.title)}</strong>
        ${task.status === "ready" ? "" : `<span>${statusLabel(task.status)}</span>`}
        ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
      </div>
      ${renderVisibilityToggle(task, "tasks")}
      ${renderHideFromControl(task, "tasks")}
              <div class="task-actions">
        <select class="task-folder-select" data-task-folder="${task.id}" title="Move to folder">
          <option value="">No folder</option>
          ${byProfile(state.folders).sort(compareTasks).map((folder) => `
            <option value="${folder.id}" ${folder.id === task.folderId ? "selected" : ""}>${escapeHtml(folder.name)}</option>
          `).join("")}
        </select>
        <button class="status-dot progress ${task.status === "in_progress" ? "active" : ""}" data-task-status="${task.id}:in_progress" title="In progress"></button>
        <button class="status-dot complete ${task.status === "done" ? "active" : ""}" data-task-status="${task.id}:done" title="Done">✓</button>
      </div>
    </article>
  `;
}

function renderTasks() {
  if (!canViewSection(activeProfile(), "tasks")) return `<div class="section-head"><h3>Tasks</h3></div><p style="padding:1rem;color:var(--text-muted)">This section is private.</p>`;
  const tasks = byProfile(state.tasks).filter(t => canViewItem(t.profileId, t.visibility))
    .filter(isTaskVisibleToday)
    .sort(compareTasks);
  const folders = byProfile(state.folders).sort(compareTasks);
  const unfiledTasks = tasks.filter((task) => !task.folderId || !folders.some((folder) => folder.id === task.folderId));

  const openFolder = folders.find((folder) => folder.id === state.openFolderId);

  if (openFolder) {
    const folderTasks = tasks.filter((task) => task.folderId === openFolder.id);
    return `
      <div class="section-head">
        <div>
          <button class="pill-button" data-action="close-folder">← Projects</button>
          <h3>${escapeHtml(openFolder.name)}</h3>
        </div>
        <button class="pill-button primary" data-action="toggle-task-form">+ Add task</button>
      </div>
      ${state.taskFormOpen ? `
        <form class="add-card" id="task-form">
          <input id="task-title" placeholder="Task name" required />
          <textarea id="task-description" placeholder="Description optional"></textarea>
          <input id="task-date" type="date" value="${today()}" />
          <input type="hidden" id="task-folder" value="${openFolder.id}" />
          <button class="pill-button primary" type="submit">Create</button>
        </form>
      ` : ""}
      <div class="item-list">
        ${folderTasks.length ? folderTasks.map(renderTaskItem).join("") : `<div class="empty">No tasks in this folder yet.</div>`}
      </div>
    `;
  }

  return `
    <div class="section-head" data-section-name="tasks">
      <div>
        <h3>Tasks</h3>
      </div>
      <div class="counter">
        <button class="pill-button primary" data-action="toggle-task-form">+ Add task</button>
        <button class="pill-button primary" data-action="toggle-folder-form">+ Add project</button>
      </div>
    </div>
    ${state.taskFormOpen ? `
      <form class="add-card" id="task-form">
        <input id="task-title" placeholder="Task name" required />
        <textarea id="task-description" placeholder="Description optional"></textarea>
        <input id="task-date" type="date" value="${today()}" />
        <input type="hidden" id="task-folder" value="" />
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    ${state.folderFormOpen ? `
      <form class="add-card two" id="folder-form">
        <input id="folder-name" placeholder="Folder name (e.g. Work, Health, Home)" required />
        <input id="folder-color" type="color" value="#44bba4" />
        ${(() => {
          const pastColors = [...new Set(folders.map((folder) => folder.color).filter(Boolean))];
          return pastColors.length ? `
            <div class="folder-color-swatches">
              ${pastColors.map((color) => `<button type="button" class="folder-color-swatch" style="--swatch-color:${color}" data-pick-folder-color="${color}" title="${color}"></button>`).join("")}
            </div>
          ` : "";
        })()}
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    ${folders.length ? `
      <div class="folder-list">
        ${folders.map((folder) => {
          const folderTasks = tasks.filter((task) => task.folderId === folder.id);
          return `
            <div class="folder-row" data-drag-kind="folders" data-drag-id="${folder.id}" data-drag-scope="folders" data-delete-kind="folders" data-delete-id="${folder.id}" data-open-folder="${folder.id}" style="--folder-color:${folder.color || "#44bba4"}">
              <span class="drag-handle">⠿</span>
              <strong>${escapeHtml(folder.name)}</strong>
              <span class="folder-count">${folderTasks.length} task${folderTasks.length === 1 ? "" : "s"}</span>
              <span class="folder-arrow">›</span>
            </div>
          `;
        }).join("")}
      </div>
    ` : ""}
    ${unfiledTasks.length ? `
      <div class="item-list">
        ${unfiledTasks.map(renderTaskItem).join("")}
      </div>
    ` : ""}
    ${!folders.length && !unfiledTasks.length ? `<div class="empty">No tasks yet. Add one directly, or create a folder to organize them.</div>` : ""}
  `;
}

function renderChecklist() {
  if (!canViewSection(activeProfile(), "habits") && !canViewSection(activeProfile(), "checklist")) return `<div class="section-head"><h3>Checklist</h3></div><p style="padding:1rem;color:var(--text-muted)">This section is private.</p>`;
  const habits = byProfile(state.habits).filter(h => canViewItem(h.profileId, h.visibility)).sort(compareItems);
  const checks = byProfile(state.checklist).filter(c => canViewItem(c.profileId, c.visibility)).sort(compareItems);
  return `
    <div class="section-head" data-section-name="checklist">
      <div>
        <h3>Checklist</h3>
        <span>Habits and daily statements to confirm before the day closes.</span>
      </div>
      <div class="counter">
        <button class="pill-button" data-action="toggle-habit-form">+ Add habit</button>
        <button class="pill-button primary" data-action="toggle-check-form">+ Add item</button>
      </div>
    </div>
    ${state.habitFormOpen ? `
      <form class="add-card two" id="habit-form">
        <input id="habit-title" placeholder="Habit name" required />
        <input id="habit-target" type="number" min="1" max="99" value="1" aria-label="Daily target" />
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    ${state.checkFormOpen ? `
      <form class="add-card" id="check-form">
        <input id="check-prompt" placeholder="Example: No reels today" required />
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    <div class="item-list">
      ${habits.map((habit) => {
        const pct = Math.min(100, Math.round(habit.count / habit.target * 100));
        return `
          <article class="habit-item" data-delete-kind="habits" data-delete-id="${habit.id}" data-drag-kind="habits" data-drag-id="${habit.id}" data-drag-scope="habits">
            <div class="item-title">
              <strong>${escapeHtml(habit.title)}</strong>
              <span>${habit.count}/${habit.target} today</span>
            </div>
            <div class="check-row">
            ${renderVisibilityToggle(habit, "habits")}
            ${renderHideFromControl(habit, "habits")}
              <button class="${pct >= 100 ? "active yes" : ""}" data-habit-set="${habit.id}:yes">Yes</button>
              <button class="${habit.count === 0 ? "active no" : ""}" data-habit-set="${habit.id}:no">No</button>
            </div>
          </article>
        `;
      }).join("")}
      ${checks.map((item) => `
        <article class="check-item" data-delete-kind="checklist" data-delete-id="${item.id}" data-drag-kind="checklist" data-drag-id="${item.id}" data-drag-scope="checklist">
          <div class="item-title">
            <strong>${escapeHtml(item.prompt)}</strong>
            <span>${item.answer === null ? "Not logged yet" : item.answer ? "Confirmed" : "Not today"}</span>
          </div>
          <div class="check-row">
            ${renderVisibilityToggle(item, "checklist_items")}
            ${renderHideFromControl(item, "checklist_items")}
            <button class="${item.answer === true ? "active yes" : ""}" data-check="${item.id}:true">Yes</button>
            <button class="${item.answer === false ? "active no" : ""}" data-check="${item.id}:false">No</button>
          </div>
        </article>
      `).join("")}
      ${!habits.length && !checks.length ? `<div class="empty">No habits or checklist items yet.</div>` : ""}
    </div>
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

        <div class="past-gratitudes" style="margin-top: 2rem;">
          <h4>Past Gratitudes</h4>
          ${state.gratitude.filter(g => g.profileId === activeProfile().id).sort((a, b) => b.date.localeCompare(a.date)).map(g => `
            <div class="gratitude-entry" style="background:var(--surface-hover); padding:1rem; border-radius:8px; margin-bottom:1rem;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                <span class="gratitude-recap-name"><i>${formatDateLabel(g.date)}</i></span>
              </div>
              <p>${escapeHtml(g.text)}</p>
              <div style="margin-top:0.5rem; font-size:0.85rem; color:var(--text-muted);">
                Hide from:
                ${state.profiles.filter(p => p.id !== activeProfile().id).map(p => `
                  <label style="margin-left:0.5rem;">
                    <input type="checkbox" data-hide-gratitude="${g.id}:${p.id}" ${g.hiddenFrom && g.hiddenFrom.includes(p.id) ? "checked" : ""}> ${escapeHtml(p.name)}
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>

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
    const likeJarFull = likeJarAmount >= JAR_CAPACITY;

    likeJarHtml = `
      <div class="like-jar-card ${likeJarOpen ? "open" : "folded"}">
        <button class="jar-fold-toggle" type="button" data-action="toggle-like-jar-fold">
          <span class="like-jar-title">Luabubu's Like Jar</span>
          <span class="jar-fold-right">€${likeJarAmount.toFixed(2)} <i class="fold-caret">${likeJarOpen ? "▾" : "▸"}</i></span>
        </button>
        ${likeJarOpen ? `
          <div class="jar-wrapper">
            <div class="piggy-jar">
              <div class="coin-pile" style="height: ${pileHeight}px; opacity: ${pileOpacity};"></div>
            </div>
          </div>
          <div class="jar-total">€${likeJarAmount.toFixed(2)}</div>
          <button class="like-btn" data-action="like-jar-hit" ${likeJarFull ? "disabled" : ""}>
            ${likeJarFull ? `Jar full (-${JAR_OVERFLOW_PENALTY} XP)` : `She said "Like"`}
          </button>
          <span class="reset-jar-btn" data-action="like-jar-reset" style="font-size: 11px; opacity: 0.5; margin-top: 6px; cursor: pointer; text-decoration: underline;">reset jar</span>
        ` : ""}
      </div>
    `;
  }

  const isJonashi = profile.name.trim().toLowerCase() === "jonashi";
  let complainJarHtml = "";
  if (isJonashi) {
    const complainJarAmount = profile.complainJarAmount || 0;
    const complainPileHeight = Math.min(80, Math.floor(complainJarAmount * 3));
    const complainPileOpacity = complainJarAmount > 0 ? 0.85 : 0;
    const complainJarFull = complainJarAmount >= JAR_CAPACITY;

    complainJarHtml = `
      <div class="complain-jar-card ${complainJarOpen ? "open" : "folded"}">
        <button class="jar-fold-toggle" type="button" data-action="toggle-complain-jar-fold">
          <span class="complain-jar-title">Jonas's Complaint Jar</span>
          <span class="jar-fold-right">€${complainJarAmount.toFixed(2)} <i class="fold-caret">${complainJarOpen ? "▾" : "▸"}</i></span>
        </button>
        ${complainJarOpen ? `
          <div class="jar-wrapper">
            <div class="piggy-jar">
              <div class="coin-pile" style="height: ${complainPileHeight}px; opacity: ${complainPileOpacity};"></div>
            </div>
          </div>
          <div class="jar-total">€${complainJarAmount.toFixed(2)}</div>
          <button class="complain-btn" data-action="complain-jar-hit" ${complainJarFull ? "disabled" : ""}>
            ${complainJarFull ? `Jar full (-${JAR_OVERFLOW_PENALTY} XP)` : "He complained"}
          </button>
          <span class="reset-jar-btn" data-action="complain-jar-reset" style="font-size: 11px; opacity: 0.5; margin-top: 6px; cursor: pointer; text-decoration: underline;">reset jar</span>
        ` : ""}
      </div>
    `;
  }

  const gratitudeCardHtml = (isLuabubu || isJonashi) ? `
    <button type="button" class="overview-card gratitude-trigger-card" data-action="open-gratitude" data-section-name="gratitude">
      <strong>Gratitude</strong>
    </button>
  ` : "";

  const anyJarOpen = (isLuabubu && likeJarOpen) || (isJonashi && complainJarOpen);

  const restOfOverviewHtml = anyJarOpen ? "" : `
      ${gratitudeCardHtml}
      <div class="overview-card compact">
        <strong>Tasks complete</strong>
        <b>${profileStats.done}/${profileStats.tasks}</b>
        <div class="progress-line" style="--progress-width:${taskPct}%"><div></div></div>
      </div>
      <div class="overview-card compact">
        <strong>Checklist answered</strong>
        <b>${profileStats.answered}/${profileStats.checklist}</b>
        <div class="progress-line" style="--progress-width:${checkPct}%"><div></div></div>
      </div>
      <div class="overview-card xp-card compact">
        <strong>Experience</strong>
        <b>${profileStats.xp} XP</b>
        <span>Next level in ${100 - profileStats.levelProgress} XP</span>
        ${profile.xpPenalty ? `<span>-${profile.xpPenalty} XP from full jars so far</span>` : ""}
      </div>
  `;

  return `
    <aside class="overview ${anyJarOpen ? "jar-expanded" : ""}">
      ${likeJarHtml}
      ${complainJarHtml}
      ${restOfOverviewHtml}
    </aside>
  `;
}

function bindEvents() {

  document.querySelectorAll("[data-admin-profile-vis]").forEach(node => {
    node.addEventListener("change", (e) => {
      const [viewerId, targetId] = node.dataset.adminProfileVis.split(":");
      setProfileVisibility(viewerId, targetId, e.target.checked);
    });
  });

  document.querySelectorAll("[data-admin-section-vis]").forEach(node => {
    node.addEventListener("change", (e) => {
      const [ownerId, sec, viewerId] = node.dataset.adminSectionVis.split(":");
      setSectionVisibility(ownerId, sec, viewerId, e.target.checked);
    });
  });

  document.querySelectorAll("[data-admin-grant]").forEach(node => {
    node.addEventListener("change", async (e) => {
      const targetId = node.dataset.adminGrant;
      const target = state.profiles.find(p => p.id === targetId);
      if (!target) return;
      target.isAdmin = e.target.checked;
      render();
      try {
        await supabaseRequest(`profiles?id=eq.${targetId}`, {
          method: "PATCH",
          body: { is_admin: e.target.checked },
          prefer: "return=minimal"
        });
      } catch (err) {
        notify("Failed to update admin status.");
      }
    });
  });

  document.querySelectorAll("[data-section-hide]").forEach(node => {
    node.addEventListener("change", async (e) => {
      const section = node.dataset.sectionHide;
      const isChecked = e.target.checked;
      const profile = activeProfile();
      let hiddenSections = profile.hiddenSections || [];
      if (isChecked && !hiddenSections.includes(section)) {
        hiddenSections.push(section);
      } else if (!isChecked && hiddenSections.includes(section)) {
        hiddenSections = hiddenSections.filter(s => s !== section);
      }
      profile.hiddenSections = hiddenSections;
      
      try {
        await supabaseRequest(`profiles?id=eq.${profile.id}`, {
          method: "PATCH",
          body: { hidden_sections: hiddenSections }
        });
      } catch (err) {
        notify("Failed to save section privacy.");
      }
      render();
    });
  });

  document.querySelectorAll("[data-toggle-visibility]").forEach(node => {
    node.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [kind, id] = node.dataset.toggleVisibility.split(":");
      const collectionName = kind === "checklist_items" ? "checklist" : kind;
      const item = state[collectionName].find(i => i.id === id);
      if (!item) return;
      
      const newVisibility = item.visibility === "private" ? "public" : "private";
      item.visibility = newVisibility;
      render(); // Optimistic update
      
      try {
        await supabaseRequest(`${kind}?id=eq.${id}`, {
          method: "PATCH",
          body: { visibility: newVisibility }
        });
      } catch (err) {
        notify("Failed to save visibility.");
      }
    });
  });

  document.querySelectorAll("[data-hide-gratitude]").forEach(node => {
    node.addEventListener("change", async (e) => {
      const [gratitudeId, targetProfileId] = node.dataset.hideGratitude.split(":");
      const isChecked = e.target.checked;
      const entry = state.gratitude.find(g => g.id === gratitudeId);
      if (!entry) return;
      
      let hiddenFrom = entry.hiddenFrom || [];
      if (isChecked && !hiddenFrom.includes(targetProfileId)) {
        hiddenFrom.push(targetProfileId);
      } else if (!isChecked && hiddenFrom.includes(targetProfileId)) {
        hiddenFrom = hiddenFrom.filter(id => id !== targetProfileId);
      }
      entry.hiddenFrom = hiddenFrom;
      
      try {
        await supabaseRequest(`daily_gratitude?id=eq.${gratitudeId}`, {
          method: "PATCH",
          body: { hidden_from: hiddenFrom }
        });
      } catch (err) {
        notify("Failed to save gratitude privacy.");
      }
    });
  });

  document.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("[data-modal]") && node.classList.contains("modal-backdrop")) return;
      handleAction(node.dataset.action);
    });
  });

  document.querySelectorAll("[data-section-name]").forEach((node) => {
    node.addEventListener("contextmenu", (event) => {
      const owner = activeProfile();
      if (!owner) return;
      event.preventDefault();
      openSectionVisibilityMenu(event.clientX, event.clientY, owner.id, node.dataset.sectionName);
    });
  });

  document.querySelectorAll("[data-profile]").forEach((node) => {
    node.addEventListener("click", () => setState({ activeProfileId: node.dataset.profile, sidebarOpen: false, ...closeOpenForms() }));
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const targetId = node.dataset.profile;
      const target = state.profiles.find(p => p.id === targetId);
      if (!target) return;
      if (isCurrentUserAdmin()) {
        const others = state.profiles.filter(p => p.id !== targetId);
        const rows = `
          ${others.length ? others.map(viewer => {
            const visible = canViewProfileClient(viewer.id, targetId);
            return `
              <label>
                <input type="checkbox" data-ctx-profile-vis="${viewer.id}:${targetId}" ${visible ? "checked" : ""}>
                👁️ ${escapeHtml(viewer.name)} can see ${escapeHtml(target.name)}
              </label>
            `;
          }).join("") : `<div class="context-menu-empty">No other profiles yet.</div>`}
          <label style="border-top: 2px solid var(--line); margin-top: 4px; padding-top: 8px;">
            <input type="checkbox" data-ctx-delete-profile="${targetId}">
            🗑️ Delete ${escapeHtml(target.name)}
          </label>
        `;
        const menu = openContextMenu(event.clientX, event.clientY, `Who can see ${target.name}?`, rows);
        menu.querySelectorAll("[data-ctx-profile-vis]").forEach(box => {
          box.addEventListener("change", (e) => {
            const [viewerId, tId] = box.dataset.ctxProfileVis.split(":");
            setProfileVisibility(viewerId, tId, e.target.checked);
          });
        });
        const deleteBox = menu.querySelector("[data-ctx-delete-profile]");
        if (deleteBox) {
          deleteBox.addEventListener("change", () => {
            closeContextMenu();
            deleteProfile(deleteBox.dataset.ctxDeleteProfile);
          });
        }
      } else {
        deleteProfile(targetId);
      }
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

  document.querySelectorAll("[data-pick-folder-color]").forEach((node) => {
    node.addEventListener("click", () => {
      const input = document.querySelector("#folder-color");
      if (input) input.value = node.dataset.pickFolderColor;
    });
  });

  document.querySelectorAll("[data-delete-kind]").forEach((node) => {
    const cancelPendingOpen = () => {
      if (node._openFolderTimer) {
        clearTimeout(node._openFolderTimer);
        node._openFolderTimer = null;
      }
    };
    const deleteFromCard = (event) => {
      if (event.target.closest("button, input, textarea, label")) return;
      event.preventDefault();
      cancelPendingOpen();
      deleteItem(node.dataset.deleteKind, node.dataset.deleteId);
    };
    const rightClickMenu = (event) => {
      if (event.target.closest("button, input, textarea, label")) return;
      event.preventDefault();
      cancelPendingOpen();
      const kind = node.dataset.deleteKind;
      if (kind === "tasks" || kind === "habits" || kind === "checklist") {
        const table = kind === "checklist" ? "checklist_items" : kind;
        openItemHideMenu(event.clientX, event.clientY, table, node.dataset.deleteId);
      } else {
        deleteFromCard(event);
      }
    };
    node.addEventListener("contextmenu", rightClickMenu);
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
        cancelPendingOpen();
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

  document.querySelectorAll("[data-open-folder]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button, input, textarea, label")) return;
      if (Date.now() - lastDragMoveEndAt < 300) return;
      if (node._openFolderTimer) return;
      node._openFolderTimer = setTimeout(() => {
        node._openFolderTimer = null;
        setState({ openFolderId: node.dataset.openFolder });
      }, 260);
    });
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

  document.querySelectorAll("[data-habit-set]").forEach((node) => {
    node.addEventListener("click", () => {
      const [id, answer] = node.dataset.habitSet.split(":");
      const profileId = activeProfile()?.id;
      const completedBefore = profileId ? allHabitsComplete(profileId) : false;
      const current = state.habits.find((habit) => habit.id === id);
      const habitWasComplete = current ? current.count >= current.target : false;
      state.habits = state.habits.map((habit) => {
        if (habit.id !== id) return habit;
        if (answer === "yes") {
          return { ...habit, count: habit.count >= habit.target ? 0 : habit.target <= 1 ? 1 : habit.count + 1 };
        }
        return { ...habit, count: habit.target <= 1 ? 0 : Math.max(0, habit.count - 1) };
      });
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
      const tapped = value === "true";
      const current = state.checklist.find((item) => item.id === id);
      const answer = current?.answer === tapped ? null : tapped;
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

  const folderForm = document.querySelector("#folder-form");
  if (folderForm) folderForm.addEventListener("submit", addFolder);

  document.querySelectorAll("[data-task-folder]").forEach((node) => {
    node.addEventListener("change", () => moveTaskToFolder(node.dataset.taskFolder, node.value));
  });

  const habitForm = document.querySelector("#habit-form");
  if (habitForm) habitForm.addEventListener("submit", addHabit);

  const checkForm = document.querySelector("#check-form");
  if (checkForm) checkForm.addEventListener("submit", addChecklist);

  const calendarSearch = document.querySelector("#calendar-search");
  if (calendarSearch) {
    calendarSearch.addEventListener("input", () => {
      const caret = calendarSearch.selectionStart;
      state.calendarSearch = calendarSearch.value;
      render();
      const nextInput = document.querySelector("#calendar-search");
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(caret, caret);
      }
    });
  }

  document.querySelectorAll("[data-calendar-day]").forEach((node) => {
    node.addEventListener("click", () => {
      const dateKey = node.dataset.calendarDay;
      setState({ selectedDay: state.selectedDay === dateKey ? null : dateKey });
    });
  });

  const eventForm = document.querySelector("#event-form");
  if (eventForm) eventForm.addEventListener("submit", addCalendarEvent);

  document.querySelectorAll("[data-delete-event-id]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCalendarEvent(node.dataset.deleteEventId);
    });
  });

  if (typeof bindTikTikEvents === "function") bindTikTikEvents();
}

function handleAction(action) {
  if (action === "open-sidebar") setState({ sidebarOpen: true });
  if (action === "close-sidebar") setState({ sidebarOpen: false });
  if (action === "toggle-settings") setState({ settingsOpen: !state.settingsOpen });
  if (action === "open-admin-settings") setState({ adminSettingsOpen: true });
  if (action === "close-admin-settings") setState({ adminSettingsOpen: false });
  if (action === "toggle-monkey-mode") toggleMonkeyMode();
  if (action === "toggle-dark-mode") {
    darkModeEnabled = !darkModeEnabled;
    applyDarkMode(darkModeEnabled);
    try {
      localStorage.setItem(DARK_MODE_KEY, darkModeEnabled ? "1" : "0");
    } catch (error) {
      console.error(error);
    }
    render();
  }
  if (action === "toggle-task-form") setState({ taskFormOpen: !state.taskFormOpen });
  if (action === "toggle-folder-form") setState({ folderFormOpen: !state.folderFormOpen });
  if (action === "close-folder") setState({ openFolderId: null, taskFormOpen: false });
  if (action === "toggle-habit-form") setState({ habitFormOpen: !state.habitFormOpen });
  if (action === "toggle-check-form") setState({ checkFormOpen: !state.checkFormOpen });
  if (action === "open-gratitude") setState({ gratitudeOpen: true });
  if (action === "close-gratitude") setState({ gratitudeOpen: false });
  if (action === "add-profile") addProfile();
  if (action === "save-profile") saveProfile();
  if (action === "save-gratitude") saveGratitude();
  if (action === "toggle-period-day") togglePeriodDay();
  if (action === "toggle-event-form") setState({ eventFormOpen: !state.eventFormOpen });
  if (action === "calendar-prev-month") setState({ calendarMonthOffset: (state.calendarMonthOffset || 0) - 1, selectedDay: null });
  if (action === "calendar-next-month") setState({ calendarMonthOffset: (state.calendarMonthOffset || 0) + 1, selectedDay: null });
  if (action === "toggle-moon-phases") {
    moonPhasesEnabled = !moonPhasesEnabled;
    try {
      localStorage.setItem(MOON_PHASES_KEY, moonPhasesEnabled ? "1" : "0");
    } catch (error) {
      console.error(error);
    }
    render();
  }
  if (action === "toggle-like-jar-fold") {
    likeJarOpen = !likeJarOpen;
    try {
      localStorage.setItem(LIKE_JAR_OPEN_KEY, likeJarOpen ? "1" : "0");
    } catch (error) {
      console.error(error);
    }
    render();
  }
  if (action === "toggle-complain-jar-fold") {
    complainJarOpen = !complainJarOpen;
    try {
      localStorage.setItem(COMPLAIN_JAR_OPEN_KEY, complainJarOpen ? "1" : "0");
    } catch (error) {
      console.error(error);
    }
    render();
  }
  if (action === "like-jar-hit") hitLikeJar();
  if (action === "like-jar-reset") resetLikeJar();
  if (action === "complain-jar-hit") hitComplainJar();
  if (action === "complain-jar-reset") resetComplainJar();
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
  if (prevAmount >= JAR_CAPACITY) return;
  const nextAmount = Math.min(prevAmount + 0.10, JAR_CAPACITY);
  const justFilled = nextAmount >= JAR_CAPACITY;
  const levelsLost = Math.floor(JAR_OVERFLOW_PENALTY / 100);

  if (justFilled) {
    const proceed = window.confirm(`Luabubu's Like Jar is about to fill up. This applies a -${JAR_OVERFLOW_PENALTY} XP penalty (~${levelsLost} levels). Continue?`);
    if (!proceed) return;
  }

  const nextPenalty = justFilled ? (profile.xpPenalty || 0) + JAR_OVERFLOW_PENALTY : profile.xpPenalty || 0;

  // Optimistically update local profile state
  state.profiles = state.profiles.map((p) => p.id === profile.id ? { ...p, likeJarAmount: nextAmount, xpPenalty: nextPenalty } : p);
  if (justFilled) notify(`Luabubu's Like Jar is full! -${JAR_OVERFLOW_PENALTY} XP (~${levelsLost} levels).`);

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
        body: { like_jar_amount: nextAmount, xp_penalty: nextPenalty }
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

async function hitComplainJar() {
  const profile = activeProfile();
  if (!profile) return;

  const prevAmount = profile.complainJarAmount || 0;
  if (prevAmount >= JAR_CAPACITY) return;
  const nextAmount = Math.min(prevAmount + 0.10, JAR_CAPACITY);
  const justFilled = nextAmount >= JAR_CAPACITY;
  const levelsLost = Math.floor(JAR_OVERFLOW_PENALTY / 100);

  if (justFilled) {
    const proceed = window.confirm(`Jonas's Complaint Jar is about to fill up. This applies a -${JAR_OVERFLOW_PENALTY} XP penalty (~${levelsLost} levels). Continue?`);
    if (!proceed) return;
  }

  const nextPenalty = justFilled ? (profile.xpPenalty || 0) + JAR_OVERFLOW_PENALTY : profile.xpPenalty || 0;

  // Optimistically update local profile state
  state.profiles = state.profiles.map((p) => p.id === profile.id ? { ...p, complainJarAmount: nextAmount, xpPenalty: nextPenalty } : p);
  if (justFilled) notify(`Jonas's Complaint Jar is full! -${JAR_OVERFLOW_PENALTY} XP (~${levelsLost} levels).`);

  const jarWrapper = document.querySelector(".complain-jar-card .jar-wrapper");
  const piggyJar = document.querySelector(".complain-jar-card .piggy-jar");
  const jarTotal = document.querySelector(".complain-jar-card .jar-total");
  const coinPile = document.querySelector(".complain-jar-card .coin-pile");

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
        body: { complain_jar_amount: nextAmount, xp_penalty: nextPenalty }
      });
    } catch (error) {
      console.error("Failed to update Complaint Jar on Supabase:", error);
    }
  }
}

async function resetComplainJar() {
  const profile = activeProfile();
  if (!profile) return;
  if (!confirm("Reset Jonas's Complaint Jar to €0.00?")) return;

  state.profiles = state.profiles.map((p) => p.id === profile.id ? { ...p, complainJarAmount: 0 } : p);
  render();

  if (isUuid(profile.id)) {
    try {
      await supabaseRequest(`profiles?id=eq.${profile.id}`, {
        method: "PATCH",
        body: { complain_jar_amount: 0.00 }
      });
      notify("Complaint Jar reset on Supabase.");
    } catch (error) {
      console.error("Failed to reset Complaint Jar on Supabase:", error);
      notify("Failed to reset Complaint Jar on Supabase.");
    }
  }
}



async function addTask(event) {
  event.preventDefault();
  const title = document.querySelector("#task-title").value.trim();
  const description = (document.querySelector("#task-description")?.value || "").trim();
  const date = document.querySelector("#task-date").value || today();
  const folderId = document.querySelector("#task-folder")?.value || null;
  if (!title) return;
  const profile = activeProfile();
  const nextSortOrder = Math.max(0, ...state.tasks
    .filter((item) => item.profileId === profile.id && Number.isInteger(item.sortOrder))
    .map((item) => item.sortOrder)) + 1;
  let task = { id: uid("task"), profileId: profile.id, title, description, date, status: "ready", sortOrder: nextSortOrder, folderId, completedAt: null, createdAt: new Date().toISOString() };
  if (isUuid(profile.id)) {
    try {
      const rows = await supabaseRequest("tasks", {
        method: "POST",
        body: {
          profile_id: profile.id,
          title,
          description,
          task_date: date,
          status: "ready",
          folder_id: isUuid(folderId) ? folderId : null
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

async function addFolder(event) {
  event.preventDefault();
  const name = document.querySelector("#folder-name").value.trim();
  const color = document.querySelector("#folder-color")?.value || "#44bba4";
  if (!name) return;
  const profile = activeProfile();
  const nextSortOrder = Math.max(0, ...state.folders
    .filter((item) => item.profileId === profile.id && Number.isInteger(item.sortOrder))
    .map((item) => item.sortOrder)) + 1;
  let folder = { id: uid("folder"), profileId: profile.id, name, color, sortOrder: nextSortOrder, createdAt: new Date().toISOString() };
  if (isUuid(profile.id)) {
    try {
      const rows = await supabaseRequest("task_folders", {
        method: "POST",
        body: {
          profile_id: profile.id,
          name,
          color,
          sort_order: nextSortOrder
        }
      });
      folder = mapFolder(rows[0]);
    } catch (error) {
      console.error(error);
      notify("Folder saved locally. Supabase failed.");
    }
  }
  state.folders.push(folder);
  state.folderFormOpen = false;
  saveState();
  render();
  notify("Folder added.");
}

async function moveTaskToFolder(taskId, folderId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const previousFolderId = task.folderId;
  const nextFolderId = folderId || null;
  if (previousFolderId === nextFolderId) return;
  state.tasks = state.tasks.map((item) => item.id === taskId ? { ...item, folderId: nextFolderId } : item);
  await pruneFolderIfEmpty(previousFolderId);
  saveState();
  render();
  if (!isUuid(taskId)) return;
  try {
    await supabaseRequest(`tasks?id=eq.${taskId}`, {
      method: "PATCH",
      body: { folder_id: isUuid(nextFolderId) ? nextFolderId : null }
    });
  } catch (error) {
    console.error(error);
    notify("Supabase failed to save the folder change.");
  }
}

async function pruneFolderIfEmpty(folderId) {
  if (!folderId) return;
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return;
  const hasTasks = state.tasks.some((task) => task.folderId === folderId);
  if (hasTasks) return;
  state.folders = state.folders.filter((item) => item.id !== folderId);
  if (state.openFolderId === folderId) state.openFolderId = null;
  if (!isUuid(folderId)) return;
  try {
    await supabaseRequest("task_folders", {
      method: "DELETE",
      query: `?id=eq.${folderId}`,
      prefer: "return=minimal"
    });
  } catch (error) {
    console.error(error);
    notify("Supabase failed to delete the empty folder.");
  }
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
  const me = myProfile();
  let profile = {
    id: uid("profile"),
    name: `Player ${number}`,
    color: ["#16a56f", "#2476d9", "#e25b45", "#f4b83b"][number % 4],
    avatar: String(number),
    photo: "",
    streak: 0,
    authUserId: me ? null : (currentSession ? currentSession.user.id : null)
  };
  try {
    const rows = await supabaseRequest("profiles", {
      method: "POST",
      body: {
        display_name: profile.name,
        avatar: profile.avatar,
        avatar_url: null,
        color: profile.color,
        streak_count: 0,
        auth_user_id: profile.authUserId
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
    if (answer === null) {
      await supabaseRequest("daily_checklist_logs", {
        method: "DELETE",
        query: `?checklist_item_id=eq.${item.id}&log_date=eq.${today()}`,
        prefer: "return=minimal"
      });
      return;
    }
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

// Trackeamonos-styled confirm dialog, replaces window.confirm's ugly native
// popup for destructive actions. Returns a Promise<boolean>.
function styledConfirm(message, { title = "Are you sure?", confirmLabel = "Delete", danger = true } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <section class="gratitude-modal" role="dialog" aria-modal="true" data-modal>
        <div class="section-head">
          <h3>${escapeHtml(title)}</h3>
        </div>
        <p style="margin: 0; color: var(--ink);">${escapeHtml(message)}</p>
        <div style="display:flex; gap:10px; justify-self:end;">
          <button class="pill-button" data-confirm-cancel>Cancel</button>
          <button class="pill-button ${danger ? "" : "primary"}" data-confirm-ok style="${danger ? "background:var(--red); border-color:var(--red); color:#fff;" : ""}">${escapeHtml(confirmLabel)}</button>
        </div>
      </section>
    `;
    document.body.appendChild(backdrop);
    const cleanup = (result) => { backdrop.remove(); resolve(result); };
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cleanup(false); });
    backdrop.querySelector("[data-confirm-cancel]").addEventListener("click", () => cleanup(false));
    backdrop.querySelector("[data-confirm-ok]").addEventListener("click", () => cleanup(true));
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { document.removeEventListener("keydown", onKey); cleanup(false); }
    });
  });
}

async function deleteItem(kind, id) {
  const collectionName = collectionForKind(kind);
  const table = tableForKind(kind);
  if (!collectionName || !table) return;
  if (!(await styledConfirm("Delete this item? This can't be undone.", { title: "Delete item" }))) return;

  const deletedTask = kind === "tasks" ? state[collectionName].find((item) => item.id === id) : null;
  state[collectionName] = state[collectionName].filter((item) => item.id !== id);
  if (kind === "folders") {
    state.tasks = state.tasks.map((task) => task.folderId === id ? { ...task, folderId: null } : task);
    if (state.openFolderId === id) state.openFolderId = null;
  }
  if (kind === "tasks" && deletedTask?.folderId) {
    await pruneFolderIfEmpty(deletedTask.folderId);
  }
  if (kind === "tasks" && typeof tikTikState === "function") {
    const tikTik = tikTikState();
    delete tikTik.schedule[id];
    delete tikTik.timers[id];
  }
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
  if (!(await styledConfirm(`Delete ${profile.name}? This removes their tasks, habits, checklist items, and gratitude.`, { title: "Delete profile" }))) return;

  const remainingProfiles = state.profiles.filter((item) => item.id !== id);
  state = {
    ...state,
    profiles: remainingProfiles,
    tasks: state.tasks.filter((item) => item.profileId !== id),
    folders: state.folders.filter((item) => item.profileId !== id),
    habits: state.habits.filter((item) => item.profileId !== id),
    checklist: state.checklist.filter((item) => item.profileId !== id),
    gratitude: state.gratitude.filter((item) => item.profileId !== id),
    periodLogs: state.periodLogs.filter((item) => item.profileId !== id),
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

let holdTimeout = null;
let holdState = null;

function clearHold() {
  if (holdTimeout) clearTimeout(holdTimeout);
  holdTimeout = null;
  if (holdState) {
    const { node } = holdState;
    node.removeEventListener("pointermove", checkHoldMove);
    node.removeEventListener("pointerup", clearHold);
    node.removeEventListener("pointercancel", clearHold);
    holdState = null;
  }
}

function checkHoldMove(event) {
  if (!holdState) return;
  if (Math.abs(event.clientY - holdState.y) > 10 || Math.abs(event.clientX - holdState.x) > 10) {
    clearHold(); // user is scrolling
  }
}

function startDrag(event) {
  if (taskReorderInFlight && event.currentTarget.dataset.dragKind === "tasks") return;
  if (event.target.closest("button, input, textarea, label")) return;
  
  const node = event.currentTarget;
  if (event.pointerType === "touch") {
    holdState = { x: event.clientX, y: event.clientY, node, event };
    node.addEventListener("pointermove", checkHoldMove);
    node.addEventListener("pointerup", clearHold);
    node.addEventListener("pointercancel", clearHold);
    holdTimeout = setTimeout(() => {
      const savedEvent = holdState ? holdState.event : event;
      clearHold();
      if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback for touch hold
      node.style.touchAction = "none"; // Prevent browser pan during drag
      executeDrag(savedEvent, node);
    }, 450); // 450ms hold
  } else {
    executeDrag(event, node);
  }
}

function executeDrag(event, node) {
  const kind = node.dataset.dragKind;
  const scope = node.dataset.dragScope || "";
  const siblings = Array.from(document.querySelectorAll(
    `[data-drag-kind="${kind}"][data-drag-scope="${scope}"]`
  ));
  const siblingOrder = siblings.map((el) => {
    const rect = el.getBoundingClientRect();
    return { id: el.dataset.dragId, center: rect.top + rect.height / 2 };
  });
  dragState = {
    kind,
    id: node.dataset.dragId,
    scope,
    startY: event.clientY,
    moved: false,
    siblingOrder
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
  event.currentTarget.style.transform = `translateY(${distance}px)`;
  dragState.moved = Math.abs(distance) > 12;
}

function endDrag(event) {
  const node = event.currentTarget;
  node.classList.remove("dragging");
  node.style.transform = "";
  node.style.touchAction = "";
  node.removeEventListener("pointermove", dragMove);
  node.removeEventListener("pointerup", endDrag);
  node.removeEventListener("pointercancel", endDrag);

  if (!dragState) return;
  const { kind, id, moved, siblingOrder } = dragState;
  const finalY = event.clientY;
  dragState = null;
  if (!moved) return;
  lastDragMoveEndAt = Date.now();

  const others = siblingOrder.filter((entry) => entry.id !== id);
  const targetIndex = others.filter((entry) => entry.center < finalY).length;
  const orderedIds = others.map((entry) => entry.id);
  orderedIds.splice(targetIndex, 0, id);
  moveItemTo(kind, orderedIds);
}

async function moveItemTo(kind, orderedIds) {
  const collectionName = collectionForKind(kind);
  if (!collectionName) return;

  const reordered = orderedIds
    .map((itemId) => state[collectionName].find((item) => item.id === itemId))
    .filter(Boolean);
  if (reordered.length < 2) return;

  if (kind === "tasks") {
    const profileId = activeProfile()?.id;
    if (!profileId) return;
    const previousTasks = state.tasks.map((task) => ({ ...task }));
    const reorderedIds = reordered.map((entry) => entry.id);
    let scopedIndex = 0;
    const fullOrder = state.tasks
      .filter((task) => task.profileId === profileId)
      .sort(compareTasks)
      .map((task) => reorderedIds.includes(task.id)
        ? reordered[scopedIndex++]
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

  if (kind === "folders") {
    const previousFolders = state.folders.map((folder) => ({ ...folder }));
    const sortOrderById = new Map(reordered.map((folder, order) => [folder.id, order + 1]));
    state.folders = state.folders.map((folder) => sortOrderById.has(folder.id)
      ? { ...folder, sortOrder: sortOrderById.get(folder.id) }
      : folder);
    saveState();
    render();

    try {
      await Promise.all(reordered
        .filter((folder) => isUuid(folder.id))
        .map((folder, order) => supabaseRequest("task_folders", {
          method: "PATCH",
          query: `?id=eq.${folder.id}`,
          body: { sort_order: order + 1 }
        })));
      notify("Folder order saved.");
    } catch (error) {
      console.error(error);
      state.folders = previousFolders;
      saveState();
      render();
      notify("Folder order could not be saved. The previous order was restored.");
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
  state.gratitudeShuffle = { ...(state.gratitudeShuffle || {}), [activeProfile().id]: uid("shuffle") };
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

async function addCalendarEvent(event) {
  event.preventDefault();
  const title = document.querySelector("#event-title").value.trim();
  const date = document.querySelector("#event-date").value || today();
  const type = "event";
  if (!title) return;
  const profile = activeProfile();
  const recurring = false;
  let item = { id: uid("event"), title, date, type, recurring, createdBy: profile?.id || null };
  if (profile && isUuid(profile.id)) {
    try {
      const rows = await supabaseRequest("calendar_events", {
        method: "POST",
        body: {
          title,
          event_date: date,
          event_type: type,
          recurring,
          created_by: profile.id
        }
      });
      item = mapCalendarEvent(rows[0]);
    } catch (error) {
      console.error(error);
      notify("Saved locally. Supabase failed — has the calendar_events table been created yet?");
    }
  }
  state.calendarEvents.push(item);
  state.eventFormOpen = false;
  saveState();
  render();
  notify("Event added.");
}

async function deleteCalendarEvent(id) {
  const existing = (state.calendarEvents || []).find((item) => item.id === id);
  if (!existing) return;
  state.calendarEvents = state.calendarEvents.filter((item) => item.id !== id);
  saveState();
  render();
  if (isUuid(existing.id)) {
    try {
      await supabaseRequest("calendar_events", {
        method: "DELETE",
        query: `?id=eq.${existing.id}`,
        prefer: "return=minimal"
      });
    } catch (error) {
      console.error(error);
      notify("Supabase delete failed.");
    }
  }
}

async function togglePeriodDay() {
  const profile = activeProfile();
  const dateKey = state.selectedDay;
  if (!profile || !dateKey || !isLuabubuProfile(profile)) return;
  const existing = state.periodLogs.find((log) => log.profileId === profile.id && log.date === dateKey);

  if (existing) {
    state.periodLogs = state.periodLogs.filter((log) => log.id !== existing.id);
    saveState();
    render();
    if (isUuid(existing.id)) {
      try {
        await supabaseRequest("period_logs", {
          method: "DELETE",
          query: `?id=eq.${existing.id}`,
          prefer: "return=minimal"
        });
      } catch (error) {
        console.error(error);
        notify("Supabase period update failed.");
      }
    }
    return;
  }

  const localId = uid("period");
  state.periodLogs.push({ id: localId, profileId: profile.id, date: dateKey });
  saveState();
  render();
  if (isUuid(profile.id)) {
    try {
      const [row] = await supabaseRequest("period_logs", {
        method: "POST",
        query: "?on_conflict=profile_id,log_date",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          profile_id: profile.id,
          log_date: dateKey
        }
      });
      if (row) {
        state.periodLogs = state.periodLogs.map((log) => log.id === localId ? mapPeriodLog(row) : log);
        saveState();
      }
    } catch (error) {
      console.error(error);
      notify("Supabase period update failed.");
    }
  }
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
    if (!USE_SUPABASE) await hydrateFromSupabase();
  } catch (error) {
    console.error(error);
    state = { ...state, loading: false };
    render();
  }
}

boot();
scheduleMidnightRefresh();

function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  window.setTimeout(() => window.location.reload(), nextMidnight.getTime() - now.getTime());
}


let monkeyModeActive = false;
let matterLoaded = false;
let matterEngine = null;
let matterWorld = null;
let matterRunner = null;
let monkeyBodies = [];

function toggleMonkeyMode() {
  if (monkeyModeActive) {
    window.location.reload();
    return;
  }
  
  monkeyModeActive = true;
  const btn = document.getElementById("monkey-mode-btn");
  if (btn) btn.style.background = "var(--green)";
  
  if (!matterLoaded) {
    loadMatterJS();
  }
}

function loadMatterJS() {
  const script = document.createElement('script');
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js";
  script.onload = () => {
    matterLoaded = true;
    initMatterWorld();
  };
  document.head.appendChild(script);
}

function initMatterWorld() {
  const Engine = Matter.Engine,
        Runner = Matter.Runner,
        World = Matter.World,
        Bodies = Matter.Bodies,
        Mouse = Matter.Mouse,
        MouseConstraint = Matter.MouseConstraint;

  matterEngine = Engine.create();
  matterWorld = matterEngine.world;

  const ground = Bodies.rectangle(window.innerWidth / 2, window.innerHeight + 50, window.innerWidth, 100, { isStatic: true });
  const leftWall = Bodies.rectangle(-50, window.innerHeight / 2, 100, window.innerHeight, { isStatic: true });
  const rightWall = Bodies.rectangle(window.innerWidth + 50, window.innerHeight / 2, 100, window.innerHeight, { isStatic: true });
  
  World.add(matterWorld, [ground, leftWall, rightWall]);

  matterRunner = Runner.create();
  Runner.start(matterRunner, matterEngine);

  // Enable dragging elements with mouse
  const mouse = Mouse.create(document.body);
  const mouseConstraint = MouseConstraint.create(matterEngine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: { visible: false }
    }
  });
  World.add(matterWorld, mouseConstraint);

  Matter.Events.on(matterEngine, "afterUpdate", () => {
    monkeyBodies.forEach(item => {
      const { body, domElement } = item;
      domElement.style.transform = `translate(${body.position.x - body.width/2}px, ${body.position.y - body.height/2}px) rotate(${body.angle}rad)`;
    });
  });

  blowUpDOM();

  document.addEventListener("mousedown", (e) => {
    if (!monkeyModeActive) return;
    spawnMonkeyOrBanana(e.clientX, e.clientY);
  });
}

function blowUpDOM() {
  const interactables = Array.from(document.querySelectorAll('button, input, textarea, img, .pill-button, .card, article, h1, h2, h3, p, span, .task-actions, .status-dot'));
  
  interactables.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    el.style.position = 'fixed';
    el.style.left = '0px'; 
    el.style.top = '0px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
    el.style.margin = '0px';
    el.style.zIndex = '9000';

    const body = Matter.Bodies.rectangle(x, y, rect.width, rect.height, {
      restitution: 0.6,
      frictionAir: 0.02
    });
    
    body.width = rect.width;
    body.height = rect.height;

    Matter.World.add(matterWorld, body);
    monkeyBodies.push({ body, domElement: el });
  });
}

function spawnMonkeyOrBanana(x, y) {
  // Always spawn monkey GIFs! (with occasional bonus bananas)
  const isBanana = Math.random() < 0.2;
  const size = isBanana ? 40 : 100 + Math.random() * 50;
  
  const domElement = document.createElement("div");
  domElement.style.position = "fixed";
  domElement.style.top = "0px";
  domElement.style.left = "0px";
  domElement.style.width = size + "px";
  domElement.style.height = size + "px";
  domElement.style.pointerEvents = "none";
  domElement.style.zIndex = "999999";
  domElement.style.display = "flex";
  domElement.style.alignItems = "center";
  domElement.style.justifyContent = "center";
  
  if (isBanana) {
    domElement.style.fontSize = (size * 0.8) + "px";
    domElement.innerText = "🍌";
  } else {
    const gifs = [
      "https://media.tenor.com/cO-b5vLz-lEAAAAC/monkey-type.gif",
      "https://media.tenor.com/bQ9_iG-v_xYAAAAC/monkey-computer.gif",
      "https://media.tenor.com/2Xy-o4i0sIEAAAAd/monkey-banana.gif",
      "./loads/ogwlz-monkey.gif"
    ];
    const gif = gifs[Math.floor(Math.random() * gifs.length)];
    const img = document.createElement("img");
    img.src = gif;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    domElement.appendChild(img);
  }
  
  document.body.appendChild(domElement);

  const body = Matter.Bodies.rectangle(x, y, size, size, {
    restitution: 0.8,
    frictionAir: 0.01
  });
  body.width = size;
  body.height = size;
  
  Matter.World.add(matterWorld, body);
  monkeyBodies.push({ body, domElement });
}


// Regular Mode Falling Banana Listener
document.addEventListener("click", (e) => {
  if (typeof monkeyModeActive !== "undefined" && monkeyModeActive) return;
  
  const banana = document.createElement("div");
  banana.className = "regular-falling-banana";
  banana.innerText = "🍌";
  banana.style.left = `${e.clientX - 16}px`;
  banana.style.top = `${e.clientY - 16}px`;
  
  const dx = (Math.random() - 0.5) * 140;
  const rot = (Math.random() - 0.5) * 720;
  banana.style.setProperty("--dx", `${dx}px`);
  banana.style.setProperty("--rot", `${rot}deg`);
  
  document.body.appendChild(banana);
  
  setTimeout(() => {
    if (banana.parentNode) banana.parentNode.removeChild(banana);
  }, 4000);
});
