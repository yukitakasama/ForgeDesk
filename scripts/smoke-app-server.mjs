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
  if (message.id !== undefined && !message.method) {
    const callback = pending.get(String(message.id));
    if (callback) {
      pending.delete(String(message.id));
      callback(message);
    }
  }
});

child.stderr.on("data", (chunk) => {
  const text = String(chunk).trim();
  if (text) process.stderr.write(`[app-server] ${text}\n`);
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
    }, 20_000);
    pending.set(String(id), (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    write({ id, method, params });
  });
}

try {
  const initialized = await request("initialize", {
    clientInfo: {
      name: "forgedesk-smoke",
      title: "codex+++ protocol smoke test",
      version: "0.1.0",
    },
    capabilities: {
      experimentalApi: false,
      requestAttestation: false,
      mcpServerOpenaiFormElicitation: false,
      optOutNotificationMethods: [],
    },
  });
  write({ method: "initialized" });
  const threads = await request("thread/list", {
    limit: 1,
    sortKey: "recency_at",
    sortDirection: "desc",
    useStateDbOnly: true,
  });
  const account = await request("account/read", { refreshToken: false });
  console.log(
    JSON.stringify(
      {
        ok: true,
        platformOs: initialized.platformOs,
        codexHome: initialized.codexHome,
        threadCount: threads.data?.length || 0,
        accountType: account.account?.type || null,
      },
      null,
      2,
    ),
  );
} finally {
  lines.close();
  child.kill();
}
