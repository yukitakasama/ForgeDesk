import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  FileDiff,
  Image,
  LoaderCircle,
  Search,
  Sparkles,
  TerminalSquare,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import { extractText } from "../lib/format";
import type { ThreadItem } from "../lib/types";
import { useAppStore } from "../store/useAppStore";

export default function ThreadView() {
  const items = useAppStore((state) => state.items);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const running = useAppStore((state) => state.running);
  const historyLoading = useAppStore((state) => state.historyLoading);
  const projects = useAppStore((state) => state.projects);
  const selectedProjectId = useAppStore((state) => state.selectedProjectId);
  const newThread = useAppStore((state) => state.newThread);
  const project = projects.find((item) => item.id === selectedProjectId);
  const [visibleCount, setVisibleCount] = useState(300);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef<number | null>(null);
  const firstVisibleIndex = Math.max(0, items.length - visibleCount);
  const visibleItems = useMemo(
    () => items.slice(firstVisibleIndex),
    [firstVisibleIndex, items],
  );

  useEffect(() => {
    setVisibleCount(300);
  }, [activeThreadId]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (previousScrollHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousScrollHeight.current;
      previousScrollHeight.current = null;
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [activeThreadId, items.length, visibleCount]);

  if (historyLoading && activeThreadId) {
    return (
      <div className="history-loading">
        <LoaderCircle size={20} />
        <span>正在加载完整对话历史...</span>
      </div>
    );
  }

  if (!project && !activeThreadId) {
    return (
      <div className="blank-state">
        <div className="blank-symbol">F</div>
        <h2>连接你的第一个项目</h2>
        <p>从左侧添加一个本地目录，codex+++ 会将任务上下文限定在该工作区。</p>
      </div>
    );
  }

  if (project && !activeThreadId && items.length === 0) {
    return (
      <div className="task-start">
        <div>
          <span className="eyebrow">{project.name}</span>
          <h2>今天要推进什么？</h2>
          <p>描述目标，Codex 会读取项目、制定计划并在需要时请求你的批准。</p>
        </div>
        <div className="starter-grid">
          <button onClick={() => void newThread()}>
            <Search size={18} />
            <strong>理解代码库</strong>
            <span>梳理入口、架构和关键依赖</span>
          </button>
          <button onClick={() => void newThread()}>
            <FileDiff size={18} />
            <strong>实现一个改动</strong>
            <span>从计划、编辑到验证完整推进</span>
          </button>
          <button onClick={() => void newThread()}>
            <TerminalSquare size={18} />
            <strong>诊断问题</strong>
            <span>分析日志并运行定向检查</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="thread-view" ref={scrollRef}>
      <div className="history-list">
        {firstVisibleIndex > 0 && (
          <button
            className="load-earlier"
            onClick={() => {
              previousScrollHeight.current =
                scrollRef.current?.scrollHeight || null;
              setVisibleCount((count) => count + 300);
            }}
          >
            加载更早的 {Math.min(300, firstVisibleIndex)} 条记录
          </button>
        )}
        {visibleItems.map((item, index) => (
          <ThreadItemErrorBoundary
            key={item.id || `${item.type}-${firstVisibleIndex + index}`}
            item={item}
          >
            <ThreadItemView item={item} />
          </ThreadItemErrorBoundary>
        ))}
        {running ? (
          <div className="agent-working">
            <span className="working-pulse" />
            Codex 正在工作
          </div>
        ) : (
          <div className="thread-end">
            <Check size={13} />
            已同步
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadItemView({ item }: { item: ThreadItem }) {
  switch (item.type) {
    case "userMessage":
      return (
        <article className="message-row user-message">
          <div className="message-avatar">
            <UserRound size={15} />
          </div>
          <div className="message-body">
            <div className="message-label">你</div>
            <p>{extractText(item.content)}</p>
          </div>
        </article>
      );
    case "agentMessage":
      return (
        <article className="message-row agent-message">
          <div className="message-avatar">
            <Bot size={16} />
          </div>
          <div className="message-body">
            <div className="message-label">Codex</div>
            <div className="prose">{item.text}</div>
          </div>
        </article>
      );
    case "reasoning":
      return (
        <CollapsibleItem
          icon={<Sparkles size={15} />}
          title="思考过程"
          className="reasoning-item"
        >
          {[...(item.summary || []), ...(item.content || [])].map(
            (paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ),
          )}
        </CollapsibleItem>
      );
    case "plan":
      return (
        <CollapsibleItem
          icon={<CircleEllipsis size={15} />}
          title="实施计划"
          defaultOpen
          className="plan-item"
        >
          <div className="prose">{item.text}</div>
        </CollapsibleItem>
      );
    case "commandExecution":
      return (
        <CollapsibleItem
          icon={<TerminalSquare size={15} />}
          title={item.command || "终端命令"}
          badge={item.status}
          className="tool-item"
        >
          {item.cwd && <div className="tool-cwd">{item.cwd}</div>}
          <pre>{item.aggregatedOutput || "等待输出..."}</pre>
        </CollapsibleItem>
      );
    case "fileChange":
      return (
        <CollapsibleItem
          icon={<FileDiff size={15} />}
          title={`文件修改 · ${item.changes?.length || 0} 项`}
          badge={item.status}
          className="tool-item"
        >
          <div className="file-change-list">
            {item.changes?.map((change) => (
              <div key={change.path}>
                <span
                  className={clsx(
                    "change-kind",
                    fileChangeKind(change.kind),
                  )}
                >
                  {fileChangeKind(change.kind).slice(0, 1).toUpperCase()}
                </span>
                {change.path}
              </div>
            ))}
          </div>
        </CollapsibleItem>
      );
    case "mcpToolCall":
      return (
        <CollapsibleItem
          icon={<Wrench size={15} />}
          title={`${item.server || "MCP"} · ${item.tool || "工具调用"}`}
          badge={item.status}
          className="tool-item"
        >
          <pre>{JSON.stringify(item.result || item.arguments, null, 2)}</pre>
        </CollapsibleItem>
      );
    case "webSearch":
      return (
        <div className="compact-event">
          <Search size={14} />
          搜索网络{item.query ? `：${item.query}` : ""}
        </div>
      );
    case "collabAgentToolCall":
    case "subAgentActivity":
      return (
        <div className="compact-event">
          <Users size={14} />
          多代理协作
        </div>
      );
    case "imageGeneration":
      return (
        <CollapsibleItem
          icon={<Image size={15} />}
          title="生成图片"
          badge={item.status}
          defaultOpen
          className="tool-item"
        >
          {item.savedPath ? <code>{item.savedPath}</code> : "图片已生成"}
        </CollapsibleItem>
      );
    case "__unknown":
      return (
        <CollapsibleItem
          icon={<CircleEllipsis size={15} />}
          title={item.originalType}
          className="tool-item"
        >
          <pre>{JSON.stringify(item.raw, null, 2)}</pre>
        </CollapsibleItem>
      );
  }
}

function CollapsibleItem({
  icon,
  title,
  badge,
  children,
  defaultOpen = false,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={clsx("collapsible-item", className, open && "is-open")}>
      <button onClick={() => setOpen(!open)}>
        <span className="tool-icon">{icon}</span>
        <strong>{title}</strong>
        {badge && <span className="tool-badge">{badge}</span>}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="collapsible-content">{children}</div>}
    </section>
  );
}

function fileChangeKind(kind: unknown) {
  if (typeof kind === "string" && kind) return kind;
  if (
    kind &&
    typeof kind === "object" &&
    "type" in kind &&
    typeof kind.type === "string" &&
    kind.type
  ) {
    return kind.type;
  }
  return "update";
}

class ThreadItemErrorBoundary extends Component<
  { item: ThreadItem; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("历史记录渲染失败", {
      itemType: this.props.item.type,
      itemId: this.props.item.id,
      error,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="compact-event item-render-error">
          <CircleEllipsis size={14} />
          无法渲染此条 {this.props.item.type} 记录
        </div>
      );
    }
    return this.props.children;
  }
}
