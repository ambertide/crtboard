#!/usr/bin/env node
// Stand-in for crtboardd while it does not exist yet: serves the REST
// resources and CRTBOARD_EVENT_SUM server-sent events described in
// docs/System.md, with data that changes every so often.
//
// Usage: node mock/crtboardd.mjs [port]   (default 7777)
//        curl -X POST localhost:7777/mock/mutate                     forces a random change now
//        curl -X POST 'localhost:7777/mock/mutate?change=task-created' forces that change
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 7777);
const SUM_INTERVAL_MS = 2000;
const CHANGE_EVERY_SUMS = 10;

const available = {
  gitRepos: [
    { name: "beemu", path: "/Users/demo/src/beemu" },
    { name: "basehieroglpyh", path: "/Users/demo/src/basehieroglpyh" },
    { name: "crtboard", path: "/Users/demo/src/crtboard" },
  ],
  asanaBoards: [
    { id: "1201", name: "Team Board", availableColumns: ["Backlog", "Will Do", "Unable To Go", "Ongoing", "Completed"] },
    { id: "1202", name: "Bugs", availableColumns: ["Reported", "Triaged", "Fixing", "Fixed"] },
  ],
};

const tracked = { git: new Map(), asana: new Map() };
let nextId = 1;

const repos = {
  beemu: { PRs: 4, todaysMergedPRs: 0, branch: "feat/tokenizer/add-ld-instructions", reviewRequested: 0 },
  basehieroglpyh: { PRs: 9, todaysMergedPRs: 1, branch: "feat/package/cats-are-here", reviewRequested: 7 },
  crtboard: { PRs: 2, todaysMergedPRs: 0, branch: "main", reviewRequested: 1 },
};
const columnTasks = { TO_DO: 7, BLOCKED: 0, IN_PROGRESS: 0, DONE: 5 };
const createdToday = { TO_DO: 2, BLOCKED: 0, IN_PROGRESS: 0, DONE: 1 };
const BRANCHES = [
  "main",
  "feat/crt/flash-changes",
  "fix/serial/reconnect",
  "chore/deps/bump-vite",
  "feature/tokenizer/add-support-for-very-long-load-instructions-in-the-assembler",
];

/** Changes the mock can make; `POST /mock/mutate?change=<name>` picks one. */
const CHANGES = {
  "review-requested": (repo) => (repo.reviewRequested += 1),
  "review-done": (repo) => (repo.reviewRequested = Math.max(0, repo.reviewRequested - 1)),
  "pr-opened": (repo) => (repo.PRs += 1),
  "pr-closed": (repo) => (repo.PRs = Math.max(0, repo.PRs - 1)),
  merged: (repo) => {
    repo.PRs = Math.max(0, repo.PRs - 1);
    repo.todaysMergedPRs += 1;
  },
  branch: (repo) => (repo.branch = BRANCHES[Math.floor(Math.random() * BRANCHES.length)]),
  "task-created": () => {
    columnTasks.TO_DO += 1;
    createdToday.TO_DO += 1;
  },
  "task-moved": () => {
    const columns = Object.keys(columnTasks);
    const column = columns[Math.floor(Math.random() * columns.length)];
    columnTasks[column] = Math.max(0, columnTasks[column] + (Math.random() < 0.5 ? -1 : 1));
  },
};

/** One change, random unless named, so the dashboard has something to flash about. */
function mutate(name) {
  const names = Object.keys(repos);
  const repo = repos[names[Math.floor(Math.random() * names.length)]];
  const keys = Object.keys(CHANGES);
  const change = CHANGES[name] ?? CHANGES[keys[Math.floor(Math.random() * keys.length)]];
  change(repo);
}

function sum() {
  const gitRepos = {};
  for (const { name } of tracked.git.values()) if (repos[name]) gitRepos[name] = repos[name];
  const asanaBoards = {};
  for (const board of tracked.asana.values()) {
    for (const [kind, column] of Object.entries(board.columns ?? {})) {
      if (column) {
        asanaBoards[kind] = { matchedColumnName: column, tasks: columnTasks[kind], todaysCreatedTasks: createdToday[kind] };
      }
    }
  }
  return { gitRepos, asanaBoards };
}

const clients = new Set();
let sums = 0;
setInterval(() => {
  if (++sums % CHANGE_EVERY_SUMS === 0) mutate();
  const data = JSON.stringify(sum());
  for (const res of clients) res.write(`event: CRTBOARD_EVENT_SUM\ndata: ${data}\n\n`);
}, SUM_INTERVAL_MS);

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Lets pages served over HTTPS (GitHub Pages) reach this local server in Chrome.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") return send(res, 204);

  const url = new URL(req.url, "http://localhost");
  console.log(req.method, url.pathname);

  if (req.method === "GET" && url.pathname === "/resources/available") return send(res, 200, available);

  // Not part of crtboardd: forces a change, e.g. to watch something flash.
  if (req.method === "POST" && url.pathname === "/mock/mutate") {
    const name = url.searchParams.get("change");
    if (name && !CHANGES[name]) return send(res, 400, { error: `change must be one of ${Object.keys(CHANGES).join(", ")}` });
    mutate(name);
    return send(res, 200, sum());
  }

  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: CRTBOARD_EVENT_SUM\ndata: ${JSON.stringify(sum())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const match = /^\/resources\/(git|asana)\/tracked(?:\/([^/]+))?$/.exec(url.pathname);
  if (match) {
    const [, kind, id] = match;
    const store = tracked[kind];
    try {
      if (req.method === "POST" && !id) {
        const created = String(nextId++);
        store.set(created, await readJson(req));
        return send(res, 201, { id: created });
      }
      if (req.method === "PUT" && id) {
        if (!store.has(id)) return send(res, 404, { error: "not tracked" });
        store.set(id, await readJson(req));
        return send(res, 200, { id });
      }
      if (req.method === "DELETE" && id) {
        store.delete(id);
        return send(res, 204);
      }
    } catch {
      return send(res, 400, { error: "invalid JSON" });
    }
  }

  send(res, 404, { error: "not found" });
});

server.listen(port, () => console.log(`mock crtboardd on http://localhost:${port}`));
