import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "packages", "codex-protocol", "generated");
const command = process.platform === "win32" ? "codex.cmd" : "codex";

function runCodex(args, options = {}) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/c", command, ...args], options);
  }
  return spawnSync(command, args, options);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const version = runCodex(["--version"], {
  encoding: "utf8",
});

if (version.status !== 0) {
  console.error(version.stderr || "无法读取 Codex CLI 版本");
  process.exit(version.status ?? 1);
}

const generated = runCodex(
  ["app-server", "generate-ts", "--experimental", "--out", output],
  {
    stdio: "inherit",
  },
);

if (generated.status !== 0) {
  process.exit(generated.status ?? 1);
}

writeFileSync(
  join(root, "packages", "codex-protocol", "version.json"),
  JSON.stringify(
    {
      cli: version.stdout.trim(),
      generatedAt: new Date().toISOString(),
      experimental: true,
    },
    null,
    2,
  ) + "\n",
);

console.log(`协议已生成到 ${output}`);
