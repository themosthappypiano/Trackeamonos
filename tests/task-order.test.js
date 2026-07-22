const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8")
  .replace(/boot\(\);\s*$/, "");

function createAppContext(fetchImpl, appConsole = console) {
  const context = vm.createContext({
    AbortController,
    console: appConsole,
    crypto: require("node:crypto").webcrypto,
    fetch: fetchImpl,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout,
    clearTimeout,
    structuredClone
  });
  vm.runInContext(appSource, context);
  vm.runInContext("render = () => {}; notify = () => {};", context);
  return context;
}

const profileId = "00000000-0000-4000-8000-000000000001";
const firstId = "00000000-0000-4000-8000-000000000011";
const secondId = "00000000-0000-4000-8000-000000000012";
const futureId = "00000000-0000-4000-8000-000000000013";

function seedTasks(context) {
  vm.runInContext(`
    state.profiles = [{ id: "${profileId}", name: "Test" }];
    state.activeProfileId = "${profileId}";
    state.tasks = [
      { id: "${firstId}", profileId: "${profileId}", title: "First", date: "2020-01-01", status: "ready", sortOrder: 1, createdAt: "2020-01-01T00:00:00Z" },
      { id: "${futureId}", profileId: "${profileId}", title: "Future", date: "2999-01-01", status: "ready", sortOrder: 2, createdAt: "2020-01-02T00:00:00Z" },
      { id: "${secondId}", profileId: "${profileId}", title: "Second", date: "2020-01-01", status: "ready", sortOrder: 3, createdAt: "2020-01-03T00:00:00Z" }
    ];
  `, context);
}

test("task drag persists the complete profile order and retains hidden task slots", async () => {
  const requests = [];
  const context = createAppContext(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 204, text: async () => "" };
  });
  seedTasks(context);

  await vm.runInContext(`moveItem("tasks", "${firstId}", 1)`, context);

  const orders = vm.runInContext("state.tasks.map(({ id, sortOrder }) => [id, sortOrder])", context);
  assert.deepEqual(JSON.parse(JSON.stringify(orders)), [
    [firstId, 3],
    [futureId, 2],
    [secondId, 1]
  ]);
  assert.equal(requests.length, 1);
  const requestBody = JSON.parse(requests[0].options.body);
  assert.deepEqual(requestBody, {
    profile_id: profileId,
    ordered_task_ids: [secondId, futureId, firstId]
  });
});

test("failed task reorder restores the optimistic state", async () => {
  const context = createAppContext(async () => ({
    ok: false,
    status: 409,
    text: async () => "reorder conflict"
  }), { ...console, error: () => {} });
  seedTasks(context);

  await vm.runInContext(`moveItem("tasks", "${firstId}", 1)`, context);

  const orders = vm.runInContext("state.tasks.map(({ id, sortOrder }) => [id, sortOrder])", context);
  assert.deepEqual(JSON.parse(JSON.stringify(orders)), [
    [firstId, 1],
    [futureId, 2],
    [secondId, 3]
  ]);
});

test("task ordering falls back to created_at only when sort_order is absent", () => {
  const context = createAppContext(async () => ({ ok: true, status: 204, text: async () => "" }));
  const result = vm.runInContext(`[
    { id: "b", sortOrder: null, createdAt: "2020-01-02T00:00:00Z" },
    { id: "a", sortOrder: null, createdAt: "2020-01-01T00:00:00Z" }
  ].sort(compareTasks).map((task) => task.id)`, context);
  assert.deepEqual(Array.from(result), ["a", "b"]);
});
