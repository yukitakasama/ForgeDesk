import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const command = process.platform === "win32" ? "cmd.exe" : "codex";
const args =
  process.platform === "win32"
    ? ["/d", "/c", "codex.cmd", "app-server", "--stdio"]
    : ["app-server", "--stdio"];
const child = spawn(command, args, {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const lines = createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined || message.method) return;
  const callback = pending.get(String(message.id));
  if (!callback) return;
  pending.delete(String(message.id));
  callback(message);
});

function write(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(String(id));
      reject(new Error(`${method} 请求超时`));
    }, 30_000);
    pending.set(String(id), (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    write({ id, method, params });
  });
}

function summarizeTurns(turns = []) {
  return {
    turnCount: turns.length,
    itemCount: turns.reduce((total, turn) => total + (turn.items?.length || 0), 0),
    itemViews: [...new Set(turns.map((turn) => turn.itemsView))],
    itemTypes: [
      ...new Set(
        turns.flatMap((turn) => (turn.items || []).map((item) => item.type)),
      ),
    ],
  };
}

try {
  const initialized = await request("initialize", {
    clientInfo: {
      name: "forgedesk-history-inspector",
      title: "ForgeDesk history inspector",
      version: "0.1.0",
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      mcpServerOpenaiFormElicitation: false,
      optOutNotificationMethods: [],
    },
  });
  write({ method: "initialized" });
  const listed = await request("thread/list", {
    limit: 10,
    sortKey: "recency_at",
    sortDirection: "desc",
  });
  const summaries = [];
  for (const thread of listed.data || []) {
    const read = await request("thread/read", {
      threadId: thread.id,
      includeTurns: true,
    });
    summaries.push({
      id: thread.id,
      source: thread.source,
      previewLength: thread.preview?.length || 0,
      read: summarizeTurns(read.thread?.turns),
    });
  }

  let paged = null;
  let resumed = null;
  if (listed.data?.[0]) {
    const resume = await request("thread/resume", {
      threadId: listed.data[0].id,
      excludeTurns: false,
    });
    resumed = summarizeTurns(resume.thread?.turns);
    const page = await request("thread/turns/list", {
      threadId: listed.data[0].id,
      limit: 20,
      sortDirection: "asc",
      itemsView: "full",
    });
    paged = summarizeTurns(page.data);
  }

  console.log(
    JSON.stringify(
      {
        codexHome: initialized.codexHome,
        listedCount: listed.data?.length || 0,
        summaries,
        firstThreadResume: resumed,
        firstThreadFullPage: paged,
      },
      null,
      2,
    ),
  );
} finally {
  lines.close();
  child.kill();
}
