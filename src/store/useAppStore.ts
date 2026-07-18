import { create } from "zustand";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  addProject as addProjectBridge,
  codexRequest,
  codexRespond,
  deleteAutomation as deleteAutomationBridge,
  listAutomations,
  listCloudTasks,
  listProjects,
  saveAutomation as saveAutomationBridge,
  saveRouterApiKey,
  startCodex,
  subscribeCodex,
} from "../lib/bridge";
import type {
  ApprovalRequest,
  AccountInfo,
  AutomationSpec,
  CapabilityMatrix,
  CliRuntime,
  CloudTask,
  CodexMessage,
  CodexThread,
  ConnectionStatus,
  InspectorTab,
  Project,
  ThreadItem,
  ThreadTokenUsage,
  RouterConfig,
} from "../lib/types";
import {
  showDesktopNotification,
  usePreferencesStore,
} from "./usePreferencesStore";

type AppView = "workspace" | "automations" | "cloud" | "extensions" | "settings";
export type PermissionMode = "request" | "auto" | "full-access";

interface AppState {
  connection: ConnectionStatus;
  runtime: CliRuntime | null;
  account: AccountInfo | null;
  capabilities: CapabilityMatrix;
  projects: Project[];
  selectedProjectId: string | null;
  threads: CodexThread[];
  activeThreadId: string | null;
  items: ThreadItem[];
  tokenUsage: ThreadTokenUsage | null;
  historyLoading: boolean;
  running: boolean;
  activeTurnId: string | null;
  diff: string;
  approvals: ApprovalRequest[];
  inspectorTab: InspectorTab;
  inspectorOpen: boolean;
  activeView: AppView;
  error: string | null;
  diagnostics: string[];
  models: Array<{ id: string; displayName?: string }>;
  selectedModel: string;
  reasoningEffort: string;
  approvalPolicy: string;
  sandboxMode: string;
  experimentalApi: boolean;
  cloudTasks: CloudTask[];
  cloudLoading: boolean;
  automations: AutomationSpec[];
  bootstrap: () => Promise<() => void>;
  addProject: (root: string) => Promise<void>;
  selectProject: (id: string) => void;
  loadThreads: () => Promise<void>;
  newThread: () => Promise<string>;
  openThread: (id: string) => Promise<void>;
  sendPrompt: (
    text: string,
    followUpBehavior?: "queue" | "steer",
  ) => Promise<void>;
  interrupt: () => Promise<void>;
  compactThread: () => Promise<void>;
  startReview: () => Promise<void>;
  resolveApproval: (
    approval: ApprovalRequest,
    decision: "accept" | "acceptForSession" | "decline" | "cancel",
  ) => Promise<void>;
  handleCodexMessage: (message: CodexMessage) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setInspectorOpen: (open: boolean) => void;
  setActiveView: (view: AppView) => void;
  setSelectedModel: (model: string) => void;
  setReasoningEffort: (effort: string) => void;
  setPermissionMode: (mode: PermissionMode) => Promise<void>;
  setApprovalPolicy: (policy: string) => void;
  setSandboxMode: (mode: string) => void;
  setExperimentalApi: (enabled: boolean) => Promise<void>;
  applyRouterConfig: (config: RouterConfig, apiKey?: string) => Promise<void>;
  loadCloudTasks: () => Promise<void>;
  loadAccount: () => Promise<void>;
  loginWithChatGpt: () => Promise<void>;
  logout: () => Promise<void>;
  saveAutomation: (
    automation: Omit<AutomationSpec, "createdAt" | "updatedAt">,
  ) => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
  runAutomation: (id: string) => Promise<void>;
  clearError: () => void;
}

const defaultCapabilities: CapabilityMatrix = {
  stableProtocol: false,
  experimentalProtocol: false,
  cloudTasks: false,
  dynamicTools: false,
  remoteControl: false,
  realtime: false,
  browser: false,
  computerUse: false,
};

export function flattenThread(thread?: CodexThread | null): ThreadItem[] {
  return (
    thread?.turns?.flatMap((turn) =>
      (turn.items || []).map((item) =>
        normalizeThreadItem(item as unknown as Record<string, unknown>),
      ),
    ) || []
  );
}

function itemId(item: ThreadItem) {
  return item.id || `${item.type}-${JSON.stringify(item).slice(0, 80)}`;
}

function upsertItem(items: ThreadItem[], item: ThreadItem) {
  const id = itemId(item);
  const index = items.findIndex((candidate) => itemId(candidate) === id);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = { ...next[index], ...item };
  return next;
}

function approvalFrom(message: CodexMessage): ApprovalRequest | null {
  if (message.id === undefined || !message.method) return null;
  const approvalMethods = new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/permissions/requestApproval",
    "execCommandApproval",
    "applyPatchApproval",
  ]);
  if (!approvalMethods.has(message.method)) return null;
  const params = message.params || {};
  return {
    id: message.id,
    method: message.method,
    threadId: params.threadId,
    itemId: params.itemId,
    command:
      params.command ||
      params.parsedCommand?.join?.(" ") ||
      params.commandExecution?.command,
    cwd: params.cwd,
    reason: params.reason || params.rationale,
    params,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  connection: "idle",
  runtime: null,
  account: null,
  capabilities: defaultCapabilities,
  projects: [],
  selectedProjectId: null,
  threads: [],
  activeThreadId: null,
  items: [],
  tokenUsage: null,
  historyLoading: false,
  running: false,
  activeTurnId: null,
  diff: "",
  approvals: [],
  inspectorTab: "changes",
  inspectorOpen: true,
  activeView: "workspace",
  error: null,
  diagnostics: [],
  models: [],
  selectedModel: "",
  reasoningEffort: "medium",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  experimentalApi: false,
  cloudTasks: [],
  cloudLoading: false,
  automations: [],

  bootstrap: async () => {
    set({ connection: "starting", error: null });
    const unlisten = await subscribeCodex(get().handleCodexMessage);
    try {
      const [projects, runtime, automations] = await Promise.all([
        listProjects(),
        startCodex(
          null,
          get().experimentalApi,
          usePreferencesStore.getState().apiRouter,
        ),
        listAutomations(),
      ]);
      set({
        projects,
        selectedProjectId: projects[0]?.id || null,
        runtime,
        automations,
        connection: runtime.version === "preview" ? "degraded" : "connected",
        capabilities: {
          ...defaultCapabilities,
          stableProtocol: true,
          experimentalProtocol: runtime.experimentalApi,
          cloudTasks: true,
          dynamicTools: runtime.experimentalApi,
          remoteControl: runtime.experimentalApi,
          realtime: runtime.experimentalApi,
          browser: runtime.experimentalApi,
          computerUse: runtime.experimentalApi,
        },
      });
      await Promise.all([
        get().loadThreads(),
        get().loadAccount(),
        loadModels(set),
      ]);
    } catch (error) {
      set({
        connection: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return unlisten;
  },

  addProject: async (root) => {
    const project = await addProjectBridge(root);
    set((state) => ({
      projects: [
        project,
        ...state.projects.filter((candidate) => candidate.id !== project.id),
      ],
      selectedProjectId: project.id,
      activeView: "workspace",
    }));
  },

  selectProject: (id) => {
    set({
      selectedProjectId: id,
      activeThreadId: null,
      items: [],
      tokenUsage: null,
      diff: "",
    });
    void get().loadThreads();
  },

  loadThreads: async () => {
    if (get().connection === "error") return;
    try {
      const selectedProject = get().projects.find(
        (project) => project.id === get().selectedProjectId,
      );
      const result = await codexRequest<{
        data?: CodexThread[];
        threads?: CodexThread[];
      }>("thread/list", {
        limit: 100,
        sortKey: "recency_at",
        sortDirection: "desc",
        cwd: selectedProject?.root || null,
      });
      set({ threads: result.data || result.threads || [] });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  newThread: async () => {
    const project = get().projects.find(
      (candidate) => candidate.id === get().selectedProjectId,
    );
    if (!project && !usePreferencesStore.getState().defaultNoProjectTask) {
      throw new Error("请先添加一个项目目录");
    }
    const result = await codexRequest<{ thread: CodexThread }>("thread/start", {
      cwd: project?.root || null,
      model: get().selectedModel || null,
      approvalPolicy: get().approvalPolicy,
      sandboxPolicy: sandboxPolicyFor(get().sandboxMode, project?.root),
      serviceName: "codex+++",
      threadSource: "forgedesk",
    });
    set((state) => ({
      activeThreadId: result.thread.id,
      items: [],
      tokenUsage: null,
      threads: [
        result.thread,
        ...state.threads.filter((thread) => thread.id !== result.thread.id),
      ],
      activeView: "workspace",
    }));
    return result.thread.id;
  },

  openThread: async (id) => {
    set({
      activeThreadId: id,
      items: [],
      tokenUsage: null,
      diff: "",
      activeView: "workspace",
      historyLoading: true,
    });
    try {
      let result: { thread: CodexThread };
      try {
        result = await codexRequest<{ thread: CodexThread }>("thread/resume", {
          threadId: id,
          excludeTurns: false,
        });
      } catch {
        result = await codexRequest<{ thread: CodexThread }>("thread/read", {
          threadId: id,
          includeTurns: true,
        });
      }
      if (get().activeThreadId !== id) return;
      set({
        items: flattenThread(result.thread),
        running: statusIsRunning(result.thread.status),
        historyLoading: false,
      });
    } catch (error) {
      if (get().activeThreadId === id) {
        set({
          historyLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },

  sendPrompt: async (text, followUpBehavior) => {
    const prompt = text.trim();
    if (!prompt) return;
    let threadId = get().activeThreadId;
    if (!threadId) threadId = await get().newThread();
    const activeTurnId = get().activeTurnId;
    const isFollowUp = get().running && Boolean(activeTurnId);
    const localItem: ThreadItem = {
      type: "userMessage",
      id: crypto.randomUUID(),
      content: [{ type: "text", text: prompt }],
    };
    set((state) => ({
      items: [...state.items, localItem],
      running: true,
      error: null,
    }));
    try {
      if (isFollowUp && followUpBehavior === "steer" && activeTurnId) {
        await codexRequest("turn/steer", {
          threadId,
          expectedTurnId: activeTurnId,
          input: [{ type: "text", text: prompt, text_elements: [] }],
        });
        return;
      }
      const result = await codexRequest<{ turn?: { id?: string } }>(
        "turn/start",
        {
          threadId,
          input: [{ type: "text", text: prompt, text_elements: [] }],
          model: get().selectedModel || null,
          effort: get().reasoningEffort,
          approvalPolicy: get().approvalPolicy,
          sandboxPolicy: sandboxPolicyFor(
            get().sandboxMode,
            currentWorkspaceRoot(get()),
          ),
        },
      );
      if (!isFollowUp && result.turn?.id) {
        set({ activeTurnId: result.turn.id });
      }
    } catch (error) {
      set({
        running: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  interrupt: async () => {
    const { activeThreadId, activeTurnId } = get();
    if (!activeThreadId || !activeTurnId) return;
    await codexRequest("turn/interrupt", {
      threadId: activeThreadId,
      turnId: activeTurnId,
    });
  },

  compactThread: async () => {
    const threadId = get().activeThreadId;
    if (!threadId) {
      set({ error: "当前没有可压缩的任务" });
      return;
    }
    try {
      await codexRequest("thread/compact/start", { threadId });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  startReview: async () => {
    const threadId = get().activeThreadId;
    if (!threadId) {
      set({ error: "当前没有可审查的任务" });
      return;
    }
    try {
      const result = await codexRequest<{
        turn?: { id?: string };
        reviewThreadId?: string;
      }>("review/start", {
        threadId,
        target: { type: "uncommittedChanges" },
        delivery: "inline",
      });
      set({
        running: true,
        activeTurnId: result.turn?.id || null,
      });
    } catch (error) {
      set({
        running: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  resolveApproval: async (approval, decision) => {
    await codexRespond(approval.id, { decision });
    set((state) => ({
      approvals: state.approvals.filter((item) => item.id !== approval.id),
    }));
  },

  handleCodexMessage: (message) => {
    const approval = approvalFrom(message);
    if (approval) {
      if (usePreferencesStore.getState().permissionNotifications) {
        showDesktopNotification(
          "需要批准操作",
          approval.command || approval.reason || "Codex 正在等待你的批准。",
        );
      }
      set((state) => ({
        approvals: [
          ...state.approvals.filter((item) => item.id !== approval.id),
          approval,
        ],
      }));
      return;
    }

    if (
      ["item/tool/requestUserInput", "mcpServer/elicitation/request"].includes(
        message.method || "",
      ) &&
      usePreferencesStore.getState().questionNotifications
    ) {
      showDesktopNotification("需要你的输入", "Codex 正在等待你回答问题。");
    }

    const params = message.params || {};
    switch (message.method) {
      case "thread/started":
        if (params.thread) {
          set((state) => ({
            threads: [
              params.thread,
              ...state.threads.filter(
                (thread) => thread.id !== params.thread.id,
              ),
            ],
          }));
        }
        break;
      case "thread/name/updated":
        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === params.threadId
              ? { ...thread, name: params.name }
              : thread,
          ),
        }));
        break;
      case "thread/tokenUsage/updated":
        if (
          params.tokenUsage &&
          params.threadId === get().activeThreadId
        ) {
          set({ tokenUsage: params.tokenUsage as ThreadTokenUsage });
        }
        break;
      case "turn/started":
        set({
          running: true,
          activeTurnId: params.turn?.id || params.turnId || null,
        });
        break;
      case "turn/completed":
        set({ running: false, activeTurnId: null });
        {
          const preference = usePreferencesStore.getState();
          const shouldNotify =
            preference.completionNotification === "always" ||
            (preference.completionNotification === "unfocused" &&
              typeof document !== "undefined" &&
              !document.hasFocus());
          if (shouldNotify) {
            showDesktopNotification("任务已完成", "codex+++ 已完成本轮回复。");
          }
        }
        void get().loadThreads();
        break;
      case "item/started":
      case "item/completed":
        if (
          params.item &&
          (!get().activeThreadId || params.threadId === get().activeThreadId)
        ) {
          set((state) => ({
            items: upsertItem(
              state.items,
              normalizeThreadItem(params.item as Record<string, unknown>),
            ),
          }));
        }
        break;
      case "item/agentMessage/delta":
        set((state) => ({
          items: appendTextDelta(
            state.items,
            params.itemId,
            params.delta,
            "agentMessage",
          ),
        }));
        break;
      case "item/plan/delta":
        set((state) => ({
          items: appendTextDelta(
            state.items,
            params.itemId,
            params.delta,
            "plan",
          ),
        }));
        break;
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta":
        set((state) => ({
          items: appendReasoningDelta(
            state.items,
            params.itemId,
            params.delta,
          ),
        }));
        break;
      case "item/commandExecution/outputDelta":
        set((state) => ({
          items: appendCommandDelta(
            state.items,
            params.itemId,
            params.delta,
          ),
        }));
        break;
      case "turn/diff/updated":
        set({
          diff:
            params.diff ||
            params.unifiedDiff ||
            JSON.stringify(params, null, 2),
          inspectorTab: "changes",
        });
        break;
      case "forgedesk/disconnected":
        set({
          connection: "error",
          running: false,
          error: params.reason || "Codex app-server 已断开",
        });
        break;
      case "forgedesk/protocolError":
      case "forgedesk/diagnostic":
      case "warning":
      case "configWarning":
      case "deprecationNotice":
        set((state) => ({
          diagnostics: [
            ...state.diagnostics.slice(-99),
            params.message || JSON.stringify(params),
          ],
        }));
        break;
      case "error":
        set({ error: params.message || "Codex 返回了错误" });
        break;
      case "account/login/completed":
      case "account/updated":
        void get().loadAccount();
        break;
      default:
        break;
    }
  },

  setInspectorTab: (tab) => set({ inspectorTab: tab, inspectorOpen: true }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setActiveView: (view) => set({ activeView: view }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setReasoningEffort: (effort) => set({ reasoningEffort: effort }),
  setPermissionMode: async (mode) => {
    const previousApprovalPolicy = get().approvalPolicy;
    const previousSandboxMode = get().sandboxMode;
    const { approvalPolicy, sandboxMode } = permissionSettings(mode);
    set({ approvalPolicy, sandboxMode, error: null });

    const threadId = get().activeThreadId;
    if (!threadId) return;
    try {
      await codexRequest("thread/settings/update", {
        threadId,
        approvalPolicy,
        sandboxPolicy: sandboxPolicyFor(
          sandboxMode,
          currentWorkspaceRoot(get()),
        ),
      });
    } catch (error) {
      set({
        approvalPolicy: previousApprovalPolicy,
        sandboxMode: previousSandboxMode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  setApprovalPolicy: (policy) => set({ approvalPolicy: policy }),
  setSandboxMode: (mode) => set({ sandboxMode: mode }),

  setExperimentalApi: async (enabled) => {
    set({ experimentalApi: enabled, connection: "starting" });
    try {
      const runtime = await startCodex(
        null,
        enabled,
        usePreferencesStore.getState().apiRouter,
      );
      set({
        runtime,
        connection: "connected",
        capabilities: {
          ...get().capabilities,
          experimentalProtocol: enabled,
          dynamicTools: enabled,
          remoteControl: enabled,
          realtime: enabled,
          browser: enabled,
          computerUse: enabled,
        },
      });
      await get().loadThreads();
    } catch (error) {
      set({
        connection: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  applyRouterConfig: async (config, apiKey) => {
    set({ connection: "starting", error: null });
    try {
      if (apiKey?.trim()) await saveRouterApiKey(apiKey.trim());
      const runtime = await startCodex(null, get().experimentalApi, config);
      set({ runtime, connection: "connected" });
      await Promise.all([get().loadThreads(), loadModels(set)]);
    } catch (error) {
      set({
        connection: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  loadCloudTasks: async () => {
    set({ cloudLoading: true });
    try {
      set({ cloudTasks: await listCloudTasks(), cloudLoading: false });
    } catch (error) {
      set({
        cloudLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  loadAccount: async () => {
    try {
      const result = await codexRequest<{
        account: AccountInfo | null;
        requiresOpenaiAuth: boolean;
      }>("account/read", { refreshToken: false });
      set({ account: result.account });
    } catch {
      set({ account: null });
    }
  },

  loginWithChatGpt: async () => {
    const result = await codexRequest<{
      type: string;
      authUrl?: string;
      verificationUrl?: string;
    }>("account/login/start", {
      type: "chatgpt",
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
      appBrand: "codex",
    });
    const target = result.authUrl || result.verificationUrl;
    if (target) {
      if ("__TAURI_INTERNALS__" in window) await openUrl(target);
      else window.open(target, "_blank", "noopener,noreferrer");
    }
  },

  logout: async () => {
    await codexRequest("account/logout", {});
    set({ account: null });
  },

  saveAutomation: async (automation) => {
    const saved = await saveAutomationBridge(automation);
    set((state) => ({
      automations: [
        saved,
        ...state.automations.filter((item) => item.id !== saved.id),
      ],
    }));
  },

  deleteAutomation: async (id) => {
    await deleteAutomationBridge(id);
    set((state) => ({
      automations: state.automations.filter((item) => item.id !== id),
    }));
  },

  runAutomation: async (id) => {
    const automation = get().automations.find((item) => item.id === id);
    if (!automation) return;
    set({
      selectedProjectId: automation.projectId,
      activeView: "workspace",
      activeThreadId: null,
      items: [],
      tokenUsage: null,
    });
    const threadId = await get().newThread();
    if (threadId) await get().sendPrompt(automation.prompt);
  },

  clearError: () => set({ error: null }),
}));

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__FORGEDESK_STORE__ = useAppStore;
}

export function permissionModeFromSettings(
  approvalPolicy: string,
  sandboxMode: string,
): PermissionMode {
  if (sandboxMode === "danger-full-access" || approvalPolicy === "never") {
    return "full-access";
  }
  return approvalPolicy === "untrusted" ? "request" : "auto";
}

function permissionSettings(mode: PermissionMode) {
  if (mode === "request") {
    return {
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };
  }
  if (mode === "full-access") {
    return {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    };
  }
  return {
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
  };
}

function currentWorkspaceRoot(state: AppState) {
  const project = state.projects.find(
    (candidate) => candidate.id === state.selectedProjectId,
  );
  if (project?.root) return project.root;
  return state.threads.find((thread) => thread.id === state.activeThreadId)?.cwd;
}

function sandboxPolicyFor(mode: string, writableRoot?: string) {
  if (mode === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  if (mode === "read-only") {
    return { type: "readOnly", networkAccess: false };
  }
  return {
    type: "workspaceWrite",
    writableRoots: writableRoot ? [writableRoot] : [],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

async function loadModels(
  set: (
    partial:
      | Partial<AppState>
      | ((state: AppState) => Partial<AppState>),
  ) => void,
) {
  try {
    const result = await codexRequest<{
      data?: Array<{ id: string; displayName?: string }>;
      models?: Array<{ id: string; displayName?: string }>;
    }>("model/list", {});
    const models = result.data || result.models || [];
    set((state) => ({
      models,
      selectedModel: state.selectedModel || models[0]?.id || "",
    }));
  } catch {
    set({ models: [] });
  }
}

function statusIsRunning(status: unknown) {
  if (typeof status === "string") return status === "active";
  return Boolean(
    status &&
      typeof status === "object" &&
      "type" in status &&
      status.type === "active",
  );
}

function appendTextDelta(
  items: ThreadItem[],
  id: string,
  delta: string,
  type: "agentMessage" | "plan",
) {
  const index = items.findIndex((item) => itemId(item) === id);
  if (index < 0) {
    const created: ThreadItem =
      type === "agentMessage"
        ? { type: "agentMessage", id, text: delta }
        : { type: "plan", id, text: delta };
    return [...items, created];
  }
  const next = [...items];
  if (type === "agentMessage") {
    const item = next[index] as Extract<ThreadItem, { type: "agentMessage" }>;
    next[index] = {
      ...item,
      type: "agentMessage",
      text: `${item.text || ""}${delta}`,
    };
  } else {
    const item = next[index] as Extract<ThreadItem, { type: "plan" }>;
    next[index] = {
      ...item,
      type: "plan",
      text: `${item.text || ""}${delta}`,
    };
  }
  return next;
}

function appendReasoningDelta(items: ThreadItem[], id: string, delta: string) {
  const index = items.findIndex((item) => itemId(item) === id);
  if (index < 0) {
    const created: ThreadItem = {
      type: "reasoning",
      id,
      summary: [delta],
      content: [],
    };
    return [...items, created];
  }
  const next = [...items];
  const item = next[index] as Extract<ThreadItem, { type: "reasoning" }>;
  const summary = [...(item.summary || [])];
  if (summary.length === 0) summary.push(delta);
  else summary[summary.length - 1] += delta;
  next[index] = { ...item, summary };
  return next;
}

function appendCommandDelta(items: ThreadItem[], id: string, delta: string) {
  const index = items.findIndex((item) => itemId(item) === id);
  if (index < 0) {
    const created: ThreadItem = {
      type: "commandExecution",
      id,
      aggregatedOutput: delta,
      status: "inProgress",
    };
    return [...items, created];
  }
  const next = [...items];
  const item = next[index] as Extract<ThreadItem, { type: "commandExecution" }>;
  next[index] = {
    ...item,
    aggregatedOutput: `${item.aggregatedOutput || ""}${delta}`,
  };
  return next;
}

const knownItemTypes = new Set([
  "userMessage",
  "agentMessage",
  "reasoning",
  "plan",
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "webSearch",
  "imageGeneration",
  "collabAgentToolCall",
  "subAgentActivity",
]);

function normalizeThreadItem(raw: Record<string, unknown>): ThreadItem {
  const type = typeof raw.type === "string" ? raw.type : "unknown";
  if (knownItemTypes.has(type)) return raw as unknown as ThreadItem;
  return {
    type: "__unknown",
    id: typeof raw.id === "string" ? raw.id : undefined,
    originalType: type,
    raw,
  };
}
