export type ConnectionStatus =
  | "idle"
  | "starting"
  | "connected"
  | "degraded"
  | "error";

export interface CliRuntime {
  path: string;
  version: string;
  bundled: boolean;
  experimentalApi: boolean;
  codexHome?: string;
  platformOs?: string;
}

export interface AccountInfo {
  type: "chatgpt" | "apiKey" | "amazonBedrock";
  email?: string | null;
  planType?: string;
  credentialSource?: string;
}

export interface CapabilityMatrix {
  stableProtocol: boolean;
  experimentalProtocol: boolean;
  cloudTasks: boolean;
  dynamicTools: boolean;
  remoteControl: boolean;
  realtime: boolean;
  browser: boolean;
  computerUse: boolean;
}

export interface RouterConfig {
  enabled: boolean;
  upstreamFormat: "openaiChat" | "anthropicMessages";
  endpoint: string;
  model: string;
}

export interface RouterKeyStatus {
  saved: boolean;
  supported: boolean;
}

export interface RouterTestResult {
  ok: boolean;
  status: number;
  latencyMs: number;
}

export interface Project {
  id: string;
  name: string;
  root: string;
  createdAt: string;
  lastOpenedAt: string;
}

export interface CodexThread {
  id: string;
  preview: string;
  name?: string | null;
  cwd: string;
  updatedAt: number;
  status?: { type?: string } | string;
  turns?: CodexTurn[];
}

export interface CodexTurn {
  id: string;
  status?: string;
  items: ThreadItem[];
}

export interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface ThreadTokenUsage {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
}

export type ThreadItem =
  | {
      type: "userMessage";
      id: string;
      content: Array<{ type: string; text?: string; path?: string; url?: string }>;
    }
  | {
      type: "agentMessage";
      id: string;
      text: string;
      phase?: string | null;
    }
  | {
      type: "reasoning";
      id: string;
      summary: string[];
      content: string[];
    }
  | {
      type: "plan";
      id: string;
      text: string;
    }
  | {
      type: "commandExecution";
      id: string;
      command?: string;
      aggregatedOutput?: string;
      status?: string;
      cwd?: string;
    }
  | {
      type: "fileChange";
      id: string;
      changes?: Array<{
        path: string;
        kind?:
          | string
          | {
              type?: string;
              move_path?: string | null;
            };
        diff?: string;
      }>;
      status?: string;
    }
  | {
      type: "mcpToolCall";
      id: string;
      server?: string;
      tool?: string;
      status?: string;
      arguments?: unknown;
      result?: unknown;
    }
  | {
      type: "webSearch";
      id?: string;
      query?: string;
    }
  | {
      type: "imageGeneration";
      id: string;
      status: string;
      result: string;
      savedPath?: string;
    }
  | {
      type: "collabAgentToolCall";
      id: string;
      status?: string;
      tool?: string;
      senderThreadId?: string;
      receiverThreadIds?: string[];
      prompt?: string;
      agentsStates?: Record<
        string,
        | string
        | {
            status?: string;
            name?: string;
            task?: string;
            message?: string;
          }
      >;
    }
  | {
      type: "subAgentActivity";
      id: string;
      status?: string;
      kind?: string;
      agentThreadId?: string;
      agentPath?: string;
    }
  | {
      type: "__unknown";
      id?: string;
      originalType: string;
      raw: Record<string, unknown>;
    };

export interface ApprovalRequest {
  id: number | string;
  method: string;
  threadId?: string;
  itemId?: string;
  command?: string;
  cwd?: string;
  reason?: string;
  params: Record<string, unknown>;
}

export interface AutomationSpec {
  id: string;
  name: string;
  prompt: string;
  projectId: string;
  rrule: string;
  timezone: string;
  enabled: boolean;
  executionEnvironment: "local" | "worktree";
  createdAt?: string;
  updatedAt?: string;
}

export interface CloudTask {
  id: string;
  title?: string;
  status?: string;
  environmentId?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export type InspectorTab = "changes" | "files" | "terminal" | "agents";

export interface CodexMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, any>;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}
