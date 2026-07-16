import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AutomationSpec,
  CliRuntime,
  CloudTask,
  CodexMessage,
  Project,
} from "./types";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function isTauriRuntime() {
  return inTauri;
}

export async function startCodex(
  cliPath: string | null,
  experimentalApi: boolean,
): Promise<CliRuntime> {
  if (!inTauri) {
    return {
      path: "浏览器预览模式",
      version: "preview",
      bundled: false,
      experimentalApi,
      platformOs: "web",
    };
  }
  return invoke<CliRuntime>("codex_start", {
    cliPath,
    experimentalApi,
  });
}

export async function stopCodex() {
  if (!inTauri) return;
  await invoke("codex_stop");
}

export async function codexRequest<T = unknown>(
  method: string,
  params?: unknown,
): Promise<T> {
  if (!inTauri) {
    return mockRequest(method, params) as T;
  }
  return invoke<T>("codex_request", { method, params: params ?? null });
}

export async function codexRespond(id: number | string, result: unknown) {
  if (!inTauri) return;
  await invoke("codex_respond", { id, result });
}

export async function subscribeCodex(
  handler: (message: CodexMessage) => void,
): Promise<UnlistenFn> {
  if (!inTauri) return () => undefined;
  return listen<CodexMessage>("codex://message", (event) =>
    handler(event.payload),
  );
}

export async function listProjects(): Promise<Project[]> {
  if (!inTauri) return [];
  return invoke<Project[]>("project_list");
}

export async function addProject(root: string): Promise<Project> {
  if (!inTauri) {
    const name = root.split(/[\\/]/).filter(Boolean).at(-1) || root;
    return {
      id: crypto.randomUUID(),
      name,
      root,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    };
  }
  return invoke<Project>("project_add", { root });
}

export async function removeProject(id: string) {
  if (!inTauri) return;
  await invoke("project_remove", { id });
}

export async function runDoctor(): Promise<Record<string, unknown>> {
  if (!inTauri) return { preview: true, status: "ok" };
  return invoke("cli_doctor");
}

export async function listCloudTasks(): Promise<CloudTask[]> {
  if (!inTauri) return [];
  return invoke<CloudTask[]>("cloud_list");
}

export async function listAutomations(): Promise<AutomationSpec[]> {
  if (!inTauri) return [];
  return invoke<AutomationSpec[]>("automation_list");
}

export async function saveAutomation(
  input: Omit<AutomationSpec, "createdAt" | "updatedAt">,
): Promise<AutomationSpec> {
  if (!inTauri) return input;
  return invoke<AutomationSpec>("automation_save", { input });
}

export async function deleteAutomation(id: string) {
  if (!inTauri) return;
  await invoke("automation_delete", { id });
}

function mockRequest(method: string, params?: unknown) {
  if (method === "thread/list") {
    return {
      data: [],
      nextCursor: null,
    };
  }
  if (method === "model/list") {
    return { data: [{ id: "gpt-5.4", displayName: "GPT-5.4" }] };
  }
  if (method === "thread/start") {
    return {
      thread: {
        id: crypto.randomUUID(),
        preview: "",
        cwd: (params as { cwd?: string })?.cwd || "",
        updatedAt: Date.now() / 1000,
        turns: [],
      },
    };
  }
  return {};
}
