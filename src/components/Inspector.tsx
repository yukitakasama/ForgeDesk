import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileCode2,
  FileDiff,
  GitFork,
  LoaderCircle,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { ThreadItem } from "../lib/types";

interface AgentView {
  id: string;
  name: string;
  status: string;
  task?: string;
  path?: string;
  source: "collaboration" | "activity";
  order: number;
}

type AgentTone = "active" | "completed" | "failed" | "cancelled" | "waiting";

export default function Inspector() {
  const tab = useAppStore((state) => state.inspectorTab);
  const setTab = useAppStore((state) => state.setInspectorTab);
  const diff = useAppStore((state) => state.diff);
  const items = useAppStore((state) => state.items);
  const openThread = useAppStore((state) => state.openThread);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  const commandOutput = useMemo(
    () =>
      items
        .filter((item) => item.type === "commandExecution")
        .map((item) => {
          const command = item as {
            command?: string;
            aggregatedOutput?: string;
          };
          return `$ ${command.command || "command"}\n${command.aggregatedOutput || ""}`;
        })
        .join("\n\n"),
    [items],
  );

  const agents = useMemo(() => projectAgents(items), [items]);

  return (
    <aside className="inspector">
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="inspector-tabs"
      >
        <Tabs.List aria-label="检查器">
          <Tabs.Trigger value="changes">
            <FileDiff size={14} />
            Changes
          </Tabs.Trigger>
          <Tabs.Trigger value="files">
            <FileCode2 size={14} />
            Files
          </Tabs.Trigger>
          <Tabs.Trigger value="terminal">
            <TerminalSquare size={14} />
            Terminal
          </Tabs.Trigger>
          <Tabs.Trigger value="agents">
            <Bot size={14} />
            Agents
            {agents.length > 0 && <span className="agent-tab-count">{agents.length}</span>}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="changes" className="inspector-content">
          {diff ? (
            <Editor
              height="100%"
              defaultLanguage="diff"
              value={diff}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                lineNumbers: "on",
                fontSize: 12,
                wordWrap: "off",
                scrollBeyondLastLine: false,
                renderLineHighlight: "none",
                padding: { top: 14 },
              }}
            />
          ) : (
            <InspectorEmpty
              icon={<FileDiff size={22} />}
              title="还没有文件变更"
              copy="Codex 修改文件后，统一 Diff 会显示在这里。"
            />
          )}
        </Tabs.Content>
        <Tabs.Content value="files" className="inspector-content">
          <InspectorEmpty
            icon={<FileCode2 size={22} />}
            title="文件浏览器已就绪"
            copy="选择任务后可通过 app-server 文件接口浏览和监听项目文件。"
          />
        </Tabs.Content>
        <Tabs.Content value="terminal" className="inspector-content terminal-panel">
          {commandOutput ? (
            <pre>{commandOutput}</pre>
          ) : (
            <InspectorEmpty
              icon={<TerminalSquare size={22} />}
              title="终端等待命令"
              copy="命令执行输出会持续流入这个面板。"
            />
          )}
        </Tabs.Content>
        <Tabs.Content value="agents" className="inspector-content">
          {agents.length ? (
            <AgentsPanel
              agents={agents}
              expandedAgentId={expandedAgentId}
              onToggle={(id) =>
                setExpandedAgentId((current) => (current === id ? null : id))
              }
              onOpenThread={(id) => void openThread(id)}
            />
          ) : (
            <InspectorEmpty
              icon={<Bot size={22} />}
              title="暂无协作代理"
              copy="多代理任务开始后，可在这里打开子线程并查看状态。"
            />
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}

function AgentsPanel({
  agents,
  expandedAgentId,
  onToggle,
  onOpenThread,
}: {
  agents: AgentView[];
  expandedAgentId: string | null;
  onToggle: (id: string) => void;
  onOpenThread: (id: string) => void;
}) {
  const activeCount = agents.filter((agent) => statusTone(agent.status) === "active").length;
  const completedCount = agents.filter(
    (agent) => statusTone(agent.status) === "completed",
  ).length;

  return (
    <div className="agents-panel">
      <header className="agents-overview">
        <div className="agents-overview-mark">
          <GitFork size={16} />
        </div>
        <div>
          <span>当前任务编队</span>
          <strong>{agents.length} 名协作 Agent</strong>
        </div>
        <div className="agents-overview-counts">
          <span><i className="is-active" />{activeCount} 运行</span>
          <span><i className="is-completed" />{completedCount} 完成</span>
        </div>
      </header>

      <div className="agent-list">
        {agents.map((agent, index) => {
          const expanded = expandedAgentId === agent.id;
          const tone = statusTone(agent.status);
          return (
            <article key={agent.id} className={`agent-card is-${tone}`}>
              <button
                className="agent-card-trigger"
                aria-expanded={expanded}
                onClick={() => onToggle(agent.id)}
              >
                <span className="agent-identity">A{index + 1}</span>
                <span className="agent-card-copy">
                  <strong>{agent.name}</strong>
                  <small>{agent.task || statusCopy(agent.status)}</small>
                </span>
                <span className={`agent-state is-${tone}`}>
                  {statusIcon(tone)}
                  {statusLabel(agent.status)}
                </span>
                <ChevronDown className="agent-card-chevron" size={13} />
              </button>
              {expanded && (
                <div className="agent-card-detail">
                  <dl>
                    <div>
                      <dt>子线程</dt>
                      <dd>{agent.id}</dd>
                    </div>
                    <div>
                      <dt>工作路径</dt>
                      <dd>{agent.path || "继承主任务工作区"}</dd>
                    </div>
                    <div>
                      <dt>事件来源</dt>
                      <dd>{agent.source === "collaboration" ? "协作工具调用" : "子代理活动"}</dd>
                    </div>
                  </dl>
                  <button
                    className="agent-open-thread"
                    onClick={() => onOpenThread(agent.id)}
                  >
                    打开子线程
                    <ExternalLink size={12} />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function projectAgents(items: ThreadItem[]): AgentView[] {
  const agents = new Map<string, AgentView>();

  items.forEach((item, order) => {
    if (item.type === "collabAgentToolCall") {
      const receiverIds = new Set([
        ...(item.receiverThreadIds || []),
        ...Object.keys(item.agentsStates || {}),
      ]);
      receiverIds.forEach((id) => {
        const rawState = item.agentsStates?.[id];
        const details =
          rawState && typeof rawState === "object" ? rawState : undefined;
        const previous = agents.get(id);
        agents.set(id, {
          id,
          name: details?.name || previous?.name || agentName(undefined, id),
          status:
            (typeof rawState === "string" ? rawState : details?.status) ||
            item.status ||
            previous?.status ||
            "pending",
          task:
            details?.task || details?.message || item.prompt || previous?.task,
          path: previous?.path,
          source: "collaboration",
          order,
        });
      });
    }

    if (item.type === "subAgentActivity") {
      const id = item.agentThreadId || item.id;
      const previous = agents.get(id);
      agents.set(id, {
        id,
        name: previous?.name || agentName(item.agentPath, id),
        status: item.status || previous?.status || "active",
        task: item.kind || previous?.task,
        path: item.agentPath || previous?.path,
        source: "activity",
        order,
      });
    }
  });

  return [...agents.values()].sort((left, right) => left.order - right.order);
}

function agentName(path: string | undefined, id: string) {
  const segment = path?.split(/[\\/]/).filter(Boolean).at(-1);
  if (segment) return segment.replace(/[-_]+/g, " ");
  return `Agent ${id.slice(0, 6)}`;
}

function normalizedStatus(status: string) {
  return status.trim().toLocaleLowerCase().replace(/[\s_-]/g, "");
}

function statusTone(status: string): AgentTone {
  const normalized = normalizedStatus(status);
  if (["completed", "complete", "done", "success", "succeeded"].includes(normalized)) {
    return "completed";
  }
  if (["failed", "error", "errored"].includes(normalized)) return "failed";
  if (["cancelled", "canceled", "closed", "shutdown"].includes(normalized)) {
    return "cancelled";
  }
  if (["waiting", "idle", "pending", "queued"].includes(normalized)) return "waiting";
  return "active";
}

function statusLabel(status: string) {
  const tone = statusTone(status);
  return {
    active: "运行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已停止",
    waiting: "等待中",
  }[tone];
}

function statusCopy(status: string) {
  const tone = statusTone(status);
  return {
    active: "正在处理分派任务",
    completed: "任务已交付给主 Agent",
    failed: "执行过程中遇到错误",
    cancelled: "协作任务已终止",
    waiting: "等待主 Agent 的下一步指令",
  }[tone];
}

function statusIcon(tone: ReturnType<typeof statusTone>) {
  if (tone === "completed") return <CheckCircle2 size={11} />;
  if (tone === "failed") return <AlertTriangle size={11} />;
  if (tone === "cancelled") return <XCircle size={11} />;
  if (tone === "waiting") return <Clock3 size={11} />;
  if (tone === "active") return <LoaderCircle size={11} />;
  return <CircleDashed size={11} />;
}

function InspectorEmpty({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="inspector-empty">
      {icon}
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}
