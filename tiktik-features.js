// Tik Tik workspace tools layered into the existing Traquea Monos tracker.
// This stays deliberately local to the current browser so it never changes
// existing profiles, habits, checklist records, folders, or Supabase tables.

const TIKTIK_DAY_START = 8 * 60;
const TIKTIK_DAY_END = 20 * 60;
const TIKTIK_ROW_HEIGHT = 60;
const TIKTIK_MIN_DURATION = 30;
let tikTikTicker = null;
let tikTikResize = null;

function tikTikState() {
  state.tikTik = {
    timers: {},
    schedule: {},
    scheduleDay: today(),
    presence: null,
    ...(state.tikTik || {})
  };
  return state.tikTik;
}

// The day schedule is only meant to hold today's plan — once the clock rolls
// past midnight, wipe it so yesterday's blocks don't linger into the new day.
function ensureFreshSchedule() {
  const data = tikTikState();
  const day = today();
  if (data.scheduleDay !== day) {
    data.schedule = {};
    data.scheduleDay = day;
    persistTikTik();
  }
}

function secondsToClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function minutesToTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function activeTimer(profileId) {
  return Object.entries(tikTikState().timers).find(([, timer]) => timer.profileId === profileId && timer.running);
}

function elapsedForTimer(timer) {
  if (!timer) return 0;
  const live = timer.running && timer.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000)) : 0;
  return (timer.elapsed || 0) + live;
}

function currentTimerTotal(profileId) {
  return Object.values(tikTikState().timers)
    .filter((timer) => timer.profileId === profileId && timer.day === today())
    .reduce((sum, timer) => sum + elapsedForTimer(timer), 0);
}

function renderTikTikTimer() {
  const profile = activeProfile();
  if (!profile) return "";
  const timers = Object.entries(tikTikState().timers)
    .filter(([, timer]) => timer.profileId === profile.id && timer.day === today());
  const running = activeTimer(profile.id);
  const schedule = tikTikState().schedule;
  const visibleTasks = byProfile(state.tasks).filter((task) => task.date <= today() && task.status !== "done").sort(compareTasks);
  const presence = tikTikState().presence;
  const presenceSeconds = presence?.profileId === profile.id && presence?.checkedInAt
    ? Math.max(0, Math.floor((Date.now() - new Date(presence.checkedInAt).getTime()) / 1000)) + (presence.elapsed || 0)
    : (presence?.elapsed || 0);

  return `
    <div class="section-head">
      <div><h3>Time tracker</h3><span>Track tasks without leaving your existing workflow.</span></div>
      <button class="pill-button primary" data-tiktik-action="toggle-presence">${presence?.profileId === profile.id && presence?.checkedInAt ? "Check out" : "Check in"}</button>
    </div>
    <section class="tiktik-summary-grid">
      <article><strong>${secondsToClock(currentTimerTotal(profile.id))}</strong><span>tracked today</span></article>
      <article><strong>${secondsToClock(presenceSeconds)}</strong><span>presence today</span></article>
      <article><strong>${timers.length}</strong><span>time entries</span></article>
    </section>
    <section class="timer-now ${running ? "running" : ""}">
      <div><span>${running ? "Tracking now" : "No timer running"}</span><strong>${running ? escapeHtml((state.tasks.find((task) => task.id === running[1].taskId) || {}).title || "Task") : "Pick a task to begin"}</strong></div>
      ${running ? `<button class="pill-button primary" data-tiktik-action="stop-timer">■ Stop ${secondsToClock(elapsedForTimer(running[1]))}</button>` : ""}
    </section>
    <div class="item-list tiktik-task-list">
      ${visibleTasks.length ? visibleTasks.map((task) => {
        const timer = tikTikState().timers[task.id];
        const isRunning = !!timer?.running;
        const project = byProfile(state.folders).find((folder) => folder.id === task.folderId);
        return `<article class="task-item ${isRunning ? "in_progress" : "ready"}">
          <div class="item-title"><strong>${escapeHtml(task.title)}</strong><span>${project ? `Project · ${escapeHtml(project.name)}` : "No project"}${schedule[task.id] ? ` · Scheduled ${minutesToTime(schedule[task.id].start)}–${minutesToTime(schedule[task.id].start + (schedule[task.id].duration || TIKTIK_MIN_DURATION))}` : ""}</span></div>
          <button class="pill-button ${isRunning ? "primary" : ""}" data-tiktik-action="toggle-timer" data-task-id="${task.id}">${isRunning ? "■ Stop" : `▶ ${secondsToClock(elapsedForTimer(timer))}`}</button>
        </article>`;
      }).join("") : `<div class="empty">No active tasks for today. Add one in Tasks, then return here to time it.</div>`}
    </div>`;
}

function renderTikTikSchedule() {
  const profile = activeProfile();
  if (!profile) return "";
  ensureFreshSchedule();
  const tasks = byProfile(state.tasks).sort(compareTasks);
  const schedule = tikTikState().schedule;
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const hours = Array.from({ length: 13 }, (_, index) => TIKTIK_DAY_START + index * 60);
  const scheduled = tasks.filter((task) => schedule[task.id]);
  return `
    <div class="section-head"><div><h3>Day schedule</h3><span>Drag a task onto a time slot, then drag its bottom edge to extend how long it runs.</span></div><button class="pill-button" data-tiktik-action="clear-schedule">Clear day</button></div>
    <div class="schedule-workspace">
      <aside class="schedule-task-bank"><strong>Unscheduled tasks</strong>${tasks.filter((task) => !schedule[task.id]).map((task) => `<button class="schedule-task-chip${task.status === "done" ? " done" : ""}" draggable="true" data-schedule-task="${task.id}">${escapeHtml(task.title)}</button>`).join("") || `<span>Everything is scheduled.</span>`}</aside>
      <div class="tiktik-timeline" style="height:${hours.length * TIKTIK_ROW_HEIGHT}px">
        ${hours.map((minute) => `<div class="schedule-hour" data-schedule-slot="${minute}" style="height:${TIKTIK_ROW_HEIGHT}px"><time>${minutesToTime(minute)}</time><div></div></div>`).join("")}
        <div class="schedule-overlay">
          ${scheduled.map((task) => {
            const entry = schedule[task.id];
            const duration = entry.duration || TIKTIK_MIN_DURATION;
            const top = ((entry.start - TIKTIK_DAY_START) / 60) * TIKTIK_ROW_HEIGHT;
            const height = (duration / 60) * TIKTIK_ROW_HEIGHT;
            return `<div class="scheduled-block${task.status === "done" ? " done" : ""}" draggable="true" data-schedule-task="${task.id}" style="top:${top}px;height:${height}px">
              <span>${escapeHtml(task.title)}</span><small>${minutesToTime(entry.start)}–${minutesToTime(entry.start + duration)}</small>
              <i class="schedule-resize-handle" data-resize-task="${task.id}"></i>
            </div>`;
          }).join("")}
          ${currentMinute >= TIKTIK_DAY_START && currentMinute < TIKTIK_DAY_END ? `<i class="schedule-now" style="top:${((currentMinute - TIKTIK_DAY_START) / 60) * TIKTIK_ROW_HEIGHT}px">Now</i>` : ""}
        </div>
      </div>
    </div>`;
}

function persistTikTik() { saveState(); }

function toggleTikTikTimer(taskId) {
  const profile = activeProfile();
  if (!profile) return;
  const data = tikTikState();
  const existing = data.timers[taskId] || { taskId, profileId: profile.id, day: today(), elapsed: 0, startedAt: null, running: false };
  const running = activeTimer(profile.id);
  if (existing.running) {
    existing.elapsed = elapsedForTimer(existing);
    existing.startedAt = null;
    existing.running = false;
    data.timers[taskId] = existing;
    notify("Timer stopped.");
  } else {
    if (running) {
      running[1].elapsed = elapsedForTimer(running[1]);
      running[1].startedAt = null;
      running[1].running = false;
    }
    existing.day = today();
    existing.startedAt = new Date().toISOString();
    existing.running = true;
    data.timers[taskId] = existing;
    notify("Timer started.");
  }
  persistTikTik();
  render();
}

function togglePresence() {
  const profile = activeProfile();
  if (!profile) return;
  const data = tikTikState();
  const existing = data.presence;
  if (existing?.profileId === profile.id && existing.checkedInAt) {
    existing.elapsed = (existing.elapsed || 0) + Math.max(0, Math.floor((Date.now() - new Date(existing.checkedInAt).getTime()) / 1000));
    existing.checkedInAt = null;
    notify("Checked out. Presence saved locally.");
  } else {
    data.presence = { profileId: profile.id, day: today(), elapsed: existing?.profileId === profile.id && existing.day === today() ? existing.elapsed || 0 : 0, checkedInAt: new Date().toISOString() };
    notify("Checked in.");
  }
  persistTikTik();
  render();
}

function bindTikTikEvents() {
  document.querySelectorAll("[data-tiktik-action]").forEach((node) => node.addEventListener("click", (event) => {
    event.preventDefault();
    const action = node.dataset.tiktikAction;
    if (action === "toggle-timer") toggleTikTikTimer(node.dataset.taskId);
    if (action === "stop-timer") { const current = activeTimer(activeProfile()?.id); if (current) toggleTikTikTimer(current[0]); }
    if (action === "toggle-presence") togglePresence();
    if (action === "clear-schedule") { tikTikState().schedule = {}; persistTikTik(); render(); notify("Schedule cleared."); }
  }));
  document.querySelectorAll("[data-schedule-task]").forEach((node) => node.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", node.dataset.scheduleTask)));
  document.querySelectorAll("[data-schedule-slot]").forEach((node) => {
    node.addEventListener("dragover", (event) => event.preventDefault());
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      const taskId = event.dataTransfer.getData("text/plain");
      if (!taskId) return;
      const existing = tikTikState().schedule[taskId];
      tikTikState().schedule[taskId] = { start: Number(node.dataset.scheduleSlot), duration: existing?.duration || TIKTIK_MIN_DURATION * 2 };
      persistTikTik();
      render();
      notify("Task scheduled.");
    });
  });
  document.querySelectorAll("[data-resize-task]").forEach((node) => node.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const taskId = node.dataset.resizeTask;
    const entry = tikTikState().schedule[taskId];
    if (!entry) return;
    const block = node.closest(".scheduled-block");
    tikTikResize = { taskId, startY: event.clientY, baseDuration: entry.duration || TIKTIK_MIN_DURATION, block };
    node.setPointerCapture(event.pointerId);
  }));
  document.querySelectorAll(".scheduled-block").forEach((block) => {
    block.addEventListener("pointermove", (event) => {
      if (!tikTikResize || tikTikResize.block !== block) return;
      const deltaMinutes = ((event.clientY - tikTikResize.startY) / TIKTIK_ROW_HEIGHT) * 60;
      const snapped = Math.max(TIKTIK_MIN_DURATION, Math.round((tikTikResize.baseDuration + deltaMinutes) / TIKTIK_MIN_DURATION) * TIKTIK_MIN_DURATION);
      block.style.height = `${(snapped / 60) * TIKTIK_ROW_HEIGHT}px`;
      tikTikResize.pending = snapped;
    });
    block.addEventListener("pointerup", () => {
      if (!tikTikResize || tikTikResize.block !== block) return;
      const entry = tikTikState().schedule[tikTikResize.taskId];
      if (entry && tikTikResize.pending) {
        const maxDuration = TIKTIK_DAY_END - entry.start;
        entry.duration = Math.min(tikTikResize.pending, maxDuration);
      }
      tikTikResize = null;
      persistTikTik();
      render();
    });
  });
}

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    setState({ activeTab: "tasks", taskFormOpen: true });
  }
  if (event.key.toLowerCase() === "t") setState({ activeTab: "timer", ...closeOpenForms() });
  if (event.key.toLowerCase() === "s") setState({ activeTab: "schedule", ...closeOpenForms() });
  if (event.code === "Space" && state.activeTab === "timer") {
    event.preventDefault();
    const running = activeTimer(activeProfile()?.id);
    const first = byProfile(state.tasks).find((task) => task.date <= today() && task.status !== "done");
    if (running) toggleTikTikTimer(running[0]); else if (first) toggleTikTikTimer(first.id);
  }
});

// Keep a visible running timer fresh without disturbing the rest of the app.
tikTikTicker = window.setInterval(() => {
  if (state.activeTab === "timer" && activeTimer(activeProfile()?.id)) render();
  if (tikTikState().scheduleDay !== today()) {
    ensureFreshSchedule();
    if (state.activeTab === "schedule") render();
  }
}, 1000);
