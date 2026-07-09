const today = () => new Date().toISOString().slice(0, 10);
const SUPABASE_URL = "https://gihhrbhxteroccaebgxs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpaGhyYmh4dGVyb2NjYWViZ3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTQzOTgsImV4cCI6MjA5OTE5MDM5OH0.nkJdaOfbabk2V_p0cgIshARuuGs3JVi99Wz18g-83BA";
const USE_SUPABASE = true;

const seed = {
  activeProfileId: null,
  activeTab: "tasks",
  sidebarOpen: false,
  settingsOpen: false,
  taskFormOpen: false,
  habitFormOpen: false,
  checkFormOpen: false,
  gratitudeOpen: false,
  profiles: [],
  tasks: [],
  habits: [],
  checklist: [],
  gratitude: []
};

let state = loadState();

function loadState() {
  const base = structuredClone(seed);
  if (USE_SUPABASE) return base;
  const saved = localStorage.getItem("traquea-monos-state");
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
  localStorage.setItem("traquea-monos-state", JSON.stringify(state));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

async function supabaseRequest(table, { method = "GET", query = "", body, prefer = "return=representation" } = {}) {
  if (!USE_SUPABASE) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
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
  return response.json();
}

function mapProfile(row) {
  return {
    id: row.id,
    name: row.display_name,
    color: profileColor(row.color),
    avatar: row.avatar || row.display_name?.[0]?.toUpperCase() || "?",
    photo: row.avatar_url || "",
    streak: row.streak_count || 0
  };
}

function mapTask(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    date: row.task_date,
    status: row.status,
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
  return { tasks: "Tasks", habits: "Habits", checklist: "Checklist" }[tab];
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
    .filter((item) => kind !== "tasks" || item.date === today())
    .sort(compareItems);
}

function stats(profileId) {
  const tasks = state.tasks.filter((task) => task.profileId === profileId && task.date === today());
  const done = tasks.filter((task) => task.status === "done").length;
  const habits = state.habits.filter((habit) => habit.profileId === profileId);
  const habitScore = habits.length
    ? Math.round(habits.reduce((sum, habit) => sum + Math.min(habit.count / habit.target, 1), 0) / habits.length * 100)
    : 0;
  const checklist = state.checklist.filter((item) => item.profileId === profileId);
  const clean = checklist.filter((item) => item.answer === false).length;
  const answered = checklist.filter((item) => item.answer !== null).length;
  const xp = done * 35 + Math.round(habitScore * 1.5) + clean * 20 + answered * 5;
  const level = Math.floor(xp / 100) + 1;
  const levelProgress = xp % 100;
  return { tasks: tasks.length, done, habitScore, clean, checklist: checklist.length, answered, xp, level, levelProgress };
}

function profileImage(profile, size = "normal") {
  const content = profile.photo
    ? `<img src="${profile.photo}" alt="${escapeHtml(profile.name)} profile picture" />`
    : `<span>${escapeHtml(profile.avatar || profile.name[0] || "?")}</span>`;
  return `<span class="avatar ${size}" style="--avatar-color:${profile.color}">${content}</span>`;
}

async function hydrateFromSupabase() {
  if (!USE_SUPABASE) return;
  try {
    const profiles = await supabaseRequest("profiles", { query: "?select=*&order=created_at.asc" });

    const profileIds = profiles.map((profile) => profile.id);
    if (!profileIds.length) {
      state = { ...state, profiles: [], tasks: [], habits: [], checklist: [], gratitude: [], activeProfileId: null };
      saveState();
      render();
      notify("Supabase connected. No profiles yet.");
      return;
    }
    const idFilter = `(${profileIds.join(",")})`;
    const [tasks, habits, habitLogs, checklistItems, checklistLogs, gratitude] = await Promise.all([
      supabaseRequest("tasks", { query: `?select=*&profile_id=in.${idFilter}&order=task_date.asc,created_at.asc` }),
      supabaseRequest("habits", { query: `?select=*&profile_id=in.${idFilter}&archived_at=is.null&order=created_at.asc` }),
      supabaseRequest("habit_logs", { query: `?select=*&profile_id=in.${idFilter}&log_date=eq.${today()}` }),
      supabaseRequest("checklist_items", { query: `?select=*&profile_id=in.${idFilter}&active=eq.true&order=created_at.asc` }),
      supabaseRequest("daily_checklist_logs", { query: `?select=*&profile_id=in.${idFilter}&log_date=eq.${today()}` }),
      supabaseRequest("daily_gratitude", { query: `?select=*&profile_id=in.${idFilter}&gratitude_date=eq.${today()}` })
    ]);

    state = {
      ...state,
      profiles: profiles.map(mapProfile),
      tasks: tasks.map(mapTask),
      habits: habits.map((habit) => mapHabit(habit, habitLogs)),
      checklist: normalizeChecklist(checklistItems.map((item) => mapChecklistItem(item, checklistLogs))),
      gratitude: gratitude.map(mapGratitude),
      activeProfileId: profileIds.includes(state.activeProfileId) ? state.activeProfileId : profileIds[0],
      ...closeOpenForms(),
      gratitudeOpen: false
    };
    saveState();
    render();
    notify("Supabase connected.");
  } catch (error) {
    console.error(error);
    notify("Supabase needs the SQL schema first.");
  }
}

function render() {
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
          <img class="monkey-mark" src="./loads/app-logo.jpg" alt="" aria-hidden="true" />
          <div>
            <h1>Traquea Monos</h1>
            <p>shared progress tracker</p>
          </div>
        </div>
        <div class="profile-actions">
          <button class="pill-button primary" data-action="add-profile">+ Profile</button>
          <button class="icon-button" title="Profile settings" data-action="toggle-settings">⚙</button>
        </div>
        ${renderSidebarSettings(profile)}
        <div class="profile-list">
          ${state.profiles.map((person) => {
            const personStats = stats(person.id);
            return `
              <button class="profile-card ${person.id === profile.id ? "active" : ""}" data-profile="${person.id}">
                ${profileImage(person)}
                <span class="profile-copy">
                  <strong>${escapeHtml(person.name)}</strong>
                  <span>Lvl ${personStats.level} · ${personStats.xp} XP</span>
                </span>
                <b class="streak-badge">🔥 ${person.streak}</b>
              </button>
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
    </div>
  `;

  bindEvents();
}

function renderEmptyApp() {
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="monkey-mark" src="./loads/app-logo.jpg" alt="" aria-hidden="true" />
          <div>
            <h1>Traquea Monos</h1>
            <p>shared progress tracker</p>
          </div>
        </div>
        <div class="profile-actions">
          <button class="pill-button primary" data-action="add-profile">+ Profile</button>
        </div>
        <div class="profile-list">
          <div class="empty">No profiles yet.</div>
        </div>
      </aside>
      <main class="main">
        <section class="empty-start">
          <img class="empty-logo" src="./loads/app-logo.jpg" alt="" aria-hidden="true" />
          <h2>Create your first profile</h2>
          <p>Supabase is connected. Add a profile to start tracking real tasks, habits, checklist items, and gratitude.</p>
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

function renderTabs() {
  return `
    <div class="tab-row">
      ${["tasks", "habits", "checklist"].map((tab) => `
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
  return renderTasks();
}

function closeOpenForms() {
  return { taskFormOpen: false, habitFormOpen: false, checkFormOpen: false };
}

function renderTasks() {
  const tasks = byProfile(state.tasks)
    .filter((task) => task.date === today())
    .sort(compareItems);
  return `
    <div class="section-head">
      <div>
        <h3>Tasks</h3>
        <span>Only today's tasks show here. Tomorrow starts clean.</span>
      </div>
      <button class="pill-button primary" data-action="toggle-task-form">+ Add task</button>
    </div>
    ${state.taskFormOpen ? `
      <form class="add-card" id="task-form">
        <input id="task-title" placeholder="Task name" required />
        <input id="task-date" type="date" value="${today()}" />
        <button class="pill-button primary" type="submit">Create</button>
      </form>
    ` : ""}
    <div class="item-list">
      ${tasks.length ? tasks.map((task) => `
        <article class="task-item ${task.status}" data-delete-kind="tasks" data-delete-id="${task.id}">
          <button class="tick ${task.status === "done" ? "done" : ""}" data-task-done="${task.id}" title="Mark done">✓</button>
          <div class="item-title">
            <strong>${escapeHtml(task.title)}</strong>
            ${task.status === "ready" ? "" : `<span>${statusLabel(task.status)}</span>`}
          </div>
          <div class="reorder-actions">
            <button class="mini-button" data-move="tasks:${task.id}:-1" title="Move up">↑</button>
            <button class="mini-button" data-move="tasks:${task.id}:1" title="Move down">↓</button>
          </div>
          <div class="task-actions">
            <button class="status-dot progress ${task.status === "in_progress" ? "active" : ""}" data-task-status="${task.id}:in_progress" title="In progress"></button>
            <button class="status-dot complete ${task.status === "done" ? "active" : ""}" data-task-status="${task.id}:done" title="Done">✓</button>
          </div>
        </article>
      `).join("") : `<div class="empty">No tasks for today. Future tasks will show on their date.</div>`}
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
          <article class="habit-item" data-delete-kind="habits" data-delete-id="${habit.id}">
            <div class="item-title">
              <strong>${escapeHtml(habit.title)}</strong>
              <span>${habit.count}/${habit.target} today</span>
              <div class="habit-meter" style="--meter:${pct}%"><div></div></div>
            </div>
            <div class="reorder-actions">
              <button class="mini-button" data-move="habits:${habit.id}:-1" title="Move up">↑</button>
              <button class="mini-button" data-move="habits:${habit.id}:1" title="Move down">↓</button>
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
        <article class="check-item" data-delete-kind="checklist" data-delete-id="${item.id}">
          <div class="item-title">
            <strong>${escapeHtml(item.prompt)}</strong>
            <span>${item.answer === null ? "Not logged yet" : item.answer ? "Confirmed" : "Not today"}</span>
          </div>
          <div class="reorder-actions">
            <button class="mini-button" data-move="checklist:${item.id}:-1" title="Move up">↑</button>
            <button class="mini-button" data-move="checklist:${item.id}:1" title="Move down">↓</button>
          </div>
          <div class="check-row">
            <button class="${item.answer === true ? "active yes" : ""}" data-check="${item.id}:true">Yes</button>
            <button class="${item.answer === false ? "active no" : ""}" data-check="${item.id}:false">No</button>
          </div>
        </article>
      `).join("") : `<div class="empty">No checklist items yet.</div>`}
    </div>
    <div class="end-action">
      <button class="pill-button primary gratitude-open" data-action="open-gratitude">Gratitude</button>
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
      </section>
    </div>
  `;
}

function renderOverview(profile) {
  const profileStats = stats(profile.id);
  const taskPct = profileStats.tasks ? Math.round(profileStats.done / profileStats.tasks * 100) : 0;
  const checkPct = profileStats.checklist ? Math.round(profileStats.answered / profileStats.checklist * 100) : 0;
  return `
    <aside class="overview">
      <h3>Today</h3>
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
  });

  document.querySelectorAll("[data-move]").forEach((node) => {
    node.addEventListener("click", () => {
      const [kind, id, delta] = node.dataset.move.split(":");
      moveItem(kind, id, Number(delta));
    });
  });

  document.querySelectorAll("[data-task-status]").forEach((node) => {
    node.addEventListener("click", () => {
      const [id, status] = node.dataset.taskStatus.split(":");
      const current = state.tasks.find((task) => task.id === id);
      const nextStatus = current?.status === status ? "ready" : status;
      state.tasks = state.tasks.map((task) => task.id === id ? { ...task, status: nextStatus } : task);
      saveState();
      render();
      persistTaskStatus(id, nextStatus);
      notify(nextStatus === "done" ? "Task done. XP locked in." : "Task updated.");
    });
  });

  document.querySelectorAll("[data-task-done]").forEach((node) => {
    node.addEventListener("click", () => {
      state.tasks = state.tasks.map((task) => task.id === node.dataset.taskDone ? { ...task, status: task.status === "done" ? "ready" : "done" } : task);
      const updated = state.tasks.find((task) => task.id === node.dataset.taskDone);
      saveState();
      render();
      if (updated) persistTaskStatus(updated.id, updated.status);
      notify("Task updated.");
    });
  });

  document.querySelectorAll("[data-habit-count]").forEach((node) => {
    node.addEventListener("click", () => {
      const [id, delta] = node.dataset.habitCount.split(":");
      state.habits = state.habits.map((habit) => habit.id === id
        ? { ...habit, count: Math.max(0, Math.min(habit.target, habit.count + Number(delta))) }
        : habit);
      const updated = state.habits.find((habit) => habit.id === id);
      saveState();
      render();
      if (updated) persistHabitLog(updated);
      notify("Habit progress saved.");
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
  if (action === "open-gratitude") setState({ gratitudeOpen: true });
  if (action === "close-gratitude") setState({ gratitudeOpen: false });
  if (action === "add-profile") addProfile();
  if (action === "save-profile") saveProfile();
  if (action === "save-gratitude") saveGratitude();
  if (action === "reset-demo") {
    localStorage.removeItem("traquea-monos-state");
    state = structuredClone(seed);
    render();
  }
}

async function addTask(event) {
  event.preventDefault();
  const title = document.querySelector("#task-title").value.trim();
  const date = document.querySelector("#task-date").value || today();
  if (!title) return;
  const profile = activeProfile();
  let task = { id: uid("task"), profileId: profile.id, title, date, status: "ready", createdAt: new Date().toISOString() };
  if (isUuid(profile.id)) {
    try {
      const rows = await supabaseRequest("tasks", {
        method: "POST",
        body: {
          profile_id: profile.id,
          title,
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
  state.tasks.unshift(task);
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

function moveItem(kind, id, delta) {
  const collectionName = collectionForKind(kind);
  if (!collectionName) return;

  const visible = visibleItemsForKind(kind);
  const index = visible.findIndex((item) => item.id === id);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= visible.length) return;

  const reordered = [...visible];
  const [item] = reordered.splice(index, 1);
  reordered.splice(nextIndex, 0, item);

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

  const reader = new FileReader();
  reader.onload = () => applyProfile(reader.result);
  reader.readAsDataURL(file);
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

function notify(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>Nice</strong><span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.classList.add("show"), 20);
  window.setTimeout(() => toast.classList.remove("show"), 2200);
  window.setTimeout(() => toast.remove(), 2700);
}

render();
hydrateFromSupabase();
