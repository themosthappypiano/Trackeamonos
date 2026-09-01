const STORAGE_KEY = 'tiktik-demo-state';
const defaults = {
  checkedIn: true,
  projects: ['Website Redesign', 'Mobile App'],
  tasks: [
    { id: 'api', name: 'API endpoints', project: 'Website Redesign', color: '#ff755f', seconds: 8100, running: false, done: false, slot: 3 },
    { id: 'polish', name: 'UI polish', project: 'Mobile App', color: '#7597f7', seconds: 2880, running: true, done: false, slot: 10 },
    { id: 'review', name: 'Review PR #42', project: 'Website Redesign', color: '#ff755f', seconds: 0, running: false, done: true, slot: 38 },
    { id: 'docs', name: 'Update docs', project: 'Mobile App', color: '#7597f7', seconds: 0, running: false, done: true, slot: 88 }
  ],
  notes: [
    { id: 'mockups', text: 'Finalize mockups', done: false },
    { id: 'review-note', text: 'Review PR #42', done: true },
    { id: 'docs-note', text: 'Update docs', done: false }
  ],
  archived: 1
};

let state = loadState();
let selectedTaskId = state.tasks.find((task) => task.running)?.id || state.tasks[0].id;
let ticker;

function loadState() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return structuredClone(defaults);
  }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hrs ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}` : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function trackedSeconds() { return state.tasks.reduce((sum, task) => sum + task.seconds, 0); }
function renderTasks() {
  const list = document.querySelector('#task-list');
  list.innerHTML = state.tasks.map((task) => `
    <label class="task-row ${task.done ? 'done' : ''}" data-task-id="${task.id}">
      <input type="checkbox" data-task-done="${task.id}" ${task.done ? 'checked' : ''} aria-label="Complete ${task.name}" />
      <span class="task-name"><i class="project-pill" style="--task-color:${task.color}"></i>${escapeHtml(task.name)}<small class="task-project">${escapeHtml(task.project)}</small></span>
      <button class="timer-button ${task.running ? 'running' : ''}" data-timer="${task.id}">${task.running ? '■ Stop' : formatTime(task.seconds)}</button>
    </label>`).join('');
  document.querySelector('#task-count').textContent = `${state.tasks.length} tasks`;
  document.querySelector('#completed-total').innerHTML = `${state.tasks.filter((task) => task.done).length} <i>/ ${state.tasks.length + 1}</i>`;
  document.querySelector('#tracked-total').textContent = formatTime(trackedSeconds());
  list.querySelectorAll('[data-timer]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); toggleTimer(button.dataset.timer); }));
  list.querySelectorAll('[data-task-done]').forEach((input) => input.addEventListener('change', () => toggleTaskDone(input.dataset.taskDone)));
  list.querySelectorAll('.task-row').forEach((row) => row.addEventListener('click', () => { selectedTaskId = row.dataset.taskId; }));
}
function renderNotes() {
  const list = document.querySelector('#notes-list');
  list.innerHTML = state.notes.map((note) => `<label class="note-row ${note.done ? 'done' : ''}"><input type="checkbox" data-note-done="${note.id}" ${note.done ? 'checked' : ''} /> <span>${escapeHtml(note.text)}</span></label>`).join('');
  document.querySelector('#archive-note').textContent = `${state.archived} archived`;
  list.querySelectorAll('[data-note-done]').forEach((input) => input.addEventListener('change', () => toggleNote(input.dataset.noteDone)));
}
function renderSchedule() {
  const grid = document.querySelector('#schedule-grid');
  grid.querySelectorAll('.schedule-event').forEach((node) => node.remove());
  state.tasks.filter((task) => !task.done).forEach((task) => {
    const event = document.createElement('div');
    event.className = 'schedule-event';
    event.draggable = true;
    event.dataset.taskId = task.id;
    event.style.setProperty('--event-color', task.color);
    event.style.top = `${task.slot}px`;
    event.style.height = task.id === 'api' ? '28px' : '25px';
    event.textContent = task.name;
    event.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', task.id); });
    event.addEventListener('click', () => { selectedTaskId = task.id; toggleTimer(task.id); });
    grid.appendChild(event);
  });
  grid.ondragover = (e) => e.preventDefault();
  grid.ondrop = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.slot = Math.max(0, Math.min(197, e.offsetY - 12));
    saveState(); renderSchedule(); toast(`${task.name} rescheduled`);
  };
}
function renderPresence() {
  const duration = state.checkedIn ? '04:18' : '04:18';
  document.querySelector('#presence-status').textContent = state.checkedIn ? 'Checked in' : 'Checked out';
  document.querySelector('#presence-time').textContent = state.checkedIn ? 'Today, 09:02' : 'Today, 13:20';
  document.querySelector('#presence-duration').textContent = duration;
  document.querySelector('.presence-dot').style.background = state.checkedIn ? '#62bc91' : '#abb4b1';
}
function render() { renderTasks(); renderNotes(); renderSchedule(); renderPresence(); }
function toggleTimer(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.done) return;
  const becameRunning = !task.running;
  state.tasks.forEach((item) => { item.running = false; });
  task.running = becameRunning;
  selectedTaskId = id;
  saveState(); renderTasks();
  toast(becameRunning ? `${task.name} started` : `${task.name} stopped`);
}
function toggleTaskDone(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.done = !task.done;
  if (task.done) { task.running = false; confetti(); toast(`${task.name} completed`); }
  saveState(); render();
}
function toggleNote(id) {
  const note = state.notes.find((item) => item.id === id);
  note.done = !note.done;
  if (note.done) confetti();
  saveState(); renderNotes();
}
function addTask() {
  const name = window.prompt('What are you working on?');
  if (!name?.trim()) return;
  const project = window.prompt(`Project name (existing: ${state.projects.join(', ')})`, state.projects[0])?.trim() || state.projects[0];
  if (!state.projects.includes(project)) state.projects.push(project);
  const colors = ['#9fd4bd', '#ffdb74', '#ff755f', '#7597f7'];
  state.tasks.unshift({ id: `task-${Date.now()}`, name: name.trim(), project, color: colors[state.tasks.length % colors.length], seconds: 0, running: false, done: false, slot: 120 });
  saveState(); render(); toast('Task added — press Space to start it');
}
function addNote() {
  const text = window.prompt('Add a note for today');
  if (!text?.trim()) return;
  state.notes.push({ id: `note-${Date.now()}`, text: text.trim(), done: false });
  saveState(); renderNotes();
}
function archiveNotes() {
  const done = state.notes.filter((note) => note.done).length;
  if (!done) return toast('No completed notes to archive');
  state.notes = state.notes.filter((note) => !note.done);
  state.archived += done;
  saveState(); renderNotes(); toast(`${done} note${done === 1 ? '' : 's'} archived`);
}
function togglePresence() { state.checkedIn = !state.checkedIn; saveState(); renderPresence(); toast(state.checkedIn ? 'Checked in — your presence timer is running' : 'Checked out — presence saved'); }
function toggleShortcuts() { const modal = document.querySelector('#shortcut-modal'); modal.hidden = !modal.hidden; }
function toast(message) { const element = document.querySelector('#toast'); element.textContent = message; element.classList.add('show'); clearTimeout(element._timer); element._timer = setTimeout(() => element.classList.remove('show'), 2500); }
function confetti() { const colors = ['#ff755f', '#7597f7', '#9fd4bd', '#ffdb74']; for (let i = 0; i < 24; i += 1) { const piece = document.createElement('i'); piece.className = 'confetti'; piece.style.background = colors[i % colors.length]; piece.style.left = `${40 + Math.random() * 20}%`; piece.style.top = `${35 + Math.random() * 15}%`; piece.style.setProperty('--x', `${(Math.random() - .5) * 360}px`); piece.style.setProperty('--y', `${80 + Math.random() * 220}px`); document.body.appendChild(piece); setTimeout(() => piece.remove(), 900); } }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

function bindActions() {
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'new-task') addTask();
    if (action === 'new-note') addNote();
    if (action === 'archive-notes') archiveNotes();
    if (action === 'toggle-presence') togglePresence();
    if (action === 'toggle-shortcuts') toggleShortcuts();
    if (action === 'now') document.querySelector('#schedule').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (action === 'focus-search') toast('Search is coming soon');
  }));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); toast(button.dataset.view === 'today' ? 'Today' : `${button.textContent.trim()} view is coming soon`); }));
  document.addEventListener('keydown', (event) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); addTask(); }
    if (event.key === '?' && !event.metaKey && !event.ctrlKey) toggleShortcuts();
    if (event.key.toLowerCase() === 'n' && !modifier && document.activeElement === document.body) addNote();
    if (event.code === 'Space' && document.activeElement === document.body) { event.preventDefault(); toggleTimer(selectedTaskId); }
    if (event.key === 'Escape' && !document.querySelector('#shortcut-modal').hidden) toggleShortcuts();
  });
}
function startTicker() { clearInterval(ticker); ticker = setInterval(() => { let changed = false; state.tasks.forEach((task) => { if (task.running) { task.seconds += 1; changed = true; } }); if (changed) { saveState(); renderTasks(); } }, 1000); }
render(); bindActions(); startTicker();
