import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowUp,
  AtSign,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Eraser,
  FileDiff,
  Files,
  Hand,
  MessageSquarePlus,
  Plus,
  Settings2,
  ShieldAlert,
  Square,
  TerminalSquare,
  Users,
} from "lucide-react";
import type { InspectorTab, ThreadTokenUsage } from "../lib/types";
import {
  permissionModeFromSettings,
  type PermissionMode,
  useAppStore,
} from "../store/useAppStore";
import { usePreferencesStore } from "../store/usePreferencesStore";

const effortOptions = [
  {
    value: "low",
    label: "低",
    description: "更快，适合简单修改",
  },
  {
    value: "medium",
    label: "中",
    description: "平衡速度与分析深度",
  },
  {
    value: "high",
    label: "高",
    description: "深入分析复杂任务",
  },
  {
    value: "xhigh",
    label: "极高",
    description: "用于最困难、最开放的任务",
  },
];

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  run: () => void | Promise<void>;
};

export default function Composer() {
  const [text, setText] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sendPrompt = useAppStore((state) => state.sendPrompt);
  const interrupt = useAppStore((state) => state.interrupt);
  const compactThread = useAppStore((state) => state.compactThread);
  const startReview = useAppStore((state) => state.startReview);
  const newThread = useAppStore((state) => state.newThread);
  const setInspectorTab = useAppStore((state) => state.setInspectorTab);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const running = useAppStore((state) => state.running);
  const models = useAppStore((state) => state.models);
  const selectedModel = useAppStore((state) => state.selectedModel);
  const setSelectedModel = useAppStore((state) => state.setSelectedModel);
  const reasoningEffort = useAppStore((state) => state.reasoningEffort);
  const setReasoningEffort = useAppStore((state) => state.setReasoningEffort);
  const approvalPolicy = useAppStore((state) => state.approvalPolicy);
  const sandboxMode = useAppStore((state) => state.sandboxMode);
  const setPermissionMode = useAppStore((state) => state.setPermissionMode);
  const tokenUsage = useAppStore((state) => state.tokenUsage);
  const projects = useAppStore((state) => state.projects);
  const selectedProjectId = useAppStore((state) => state.selectedProjectId);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const showContextUsage = usePreferencesStore(
    (state) => state.showContextUsage,
  );
  const sendShortcut = usePreferencesStore((state) => state.sendShortcut);
  const followUpBehavior = usePreferencesStore(
    (state) => state.followUpBehavior,
  );
  const defaultNoProjectTask = usePreferencesStore(
    (state) => state.defaultNoProjectTask,
  );
  const canCompose = Boolean(
    selectedProjectId || activeThreadId || defaultNoProjectTask,
  );

  const permissionMode = permissionModeFromSettings(
    approvalPolicy,
    sandboxMode,
  );

  const slashMatch = text.match(/^\/([^\s]*)$/);
  const slashQuery = slashMatch?.[1].toLowerCase() || "";
  const commands: SlashCommand[] = [
    {
      id: "new",
      label: "/new",
      description: "创建新任务",
      icon: <MessageSquarePlus size={15} />,
      run: newThread,
    },
    {
      id: "compact",
      label: "/compact",
      description: "压缩当前任务上下文",
      icon: <BrainCircuit size={15} />,
      run: compactThread,
    },
    {
      id: "review",
      label: "/review",
      description: "审查当前未提交更改",
      icon: <FileDiff size={15} />,
      run: startReview,
    },
    {
      id: "changes",
      label: "/changes",
      description: "打开更改检查器",
      icon: <FileDiff size={15} />,
      run: () => setInspectorTab("changes"),
    },
    {
      id: "files",
      label: "/files",
      description: "打开项目文件",
      icon: <Files size={15} />,
      run: () => setInspectorTab("files"),
    },
    {
      id: "terminal",
      label: "/terminal",
      description: "打开项目终端",
      icon: <TerminalSquare size={15} />,
      run: () => setInspectorTab("terminal"),
    },
    {
      id: "agents",
      label: "/agents",
      description: "打开 Agents 面板",
      icon: <Users size={15} />,
      run: () => setInspectorTab("agents"),
    },
    {
      id: "clear",
      label: "/clear",
      description: "清空输入框",
      icon: <Eraser size={15} />,
      run: () => undefined,
    },
  ];
  const filteredCommands = commands.filter((command) =>
    command.id.startsWith(slashQuery),
  );
  const showSlashCommands =
    slashOpen && Boolean(slashMatch) && filteredCommands.length > 0;
  const activeCommandIndex = Math.min(
    commandIndex,
    Math.max(0, filteredCommands.length - 1),
  );

  async function submit(behavior = followUpBehavior) {
    const value = text.trim();
    if (!value) return;
    setText("");
    setSlashOpen(false);
    await sendPrompt(value, behavior);
    textarea.current?.focus();
  }

  async function executeCommand(command: SlashCommand) {
    setText("");
    setSlashOpen(false);
    setCommandIndex(0);
    try {
      await command.run();
    } finally {
      textarea.current?.focus();
    }
  }

  function insertMention() {
    const node = textarea.current;
    if (!node) {
      setText((value) => `${value}@`);
      return;
    }
    const start = node.selectionStart;
    const end = node.selectionEnd;
    setText((value) => `${value.slice(0, start)}@${value.slice(end)}`);
    requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(start + 1, start + 1);
    });
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        {showSlashCommands && (
          <SlashCommandMenu
            commands={filteredCommands}
            activeIndex={activeCommandIndex}
            onSelect={(command) => void executeCommand(command)}
          />
        )}

        <textarea
          ref={textarea}
          value={text}
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            setCommandIndex(0);
            setSlashOpen(/^\/[^\s]*$/.test(value));
          }}
          onKeyDown={(event) => {
            if (showSlashCommands) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCommandIndex(
                  (activeCommandIndex + 1) % filteredCommands.length,
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCommandIndex(
                  (activeCommandIndex - 1 + filteredCommands.length) %
                    filteredCommands.length,
                );
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setSlashOpen(false);
                return;
              }
              if (
                (event.key === "Enter" && !event.shiftKey) ||
                event.key === "Tab"
              ) {
                event.preventDefault();
                void executeCommand(filteredCommands[activeCommandIndex]);
                return;
              }
            }
            const shouldSend =
              event.key === "Enter" &&
              (sendShortcut === "enter"
                ? !event.shiftKey
                : event.ctrlKey || event.metaKey);
            if (shouldSend) {
              event.preventDefault();
              const oppositeBehavior =
                followUpBehavior === "queue" ? "steer" : "queue";
              void submit(
                running && (event.ctrlKey || event.metaKey)
                  ? oppositeBehavior
                  : followUpBehavior,
              );
            }
          }}
          placeholder={
            activeThreadId
              ? "要求后续变更"
              : projects.find((project) => project.id === selectedProjectId)
                ? "描述你要完成的任务"
                : "请先添加项目目录"
          }
          disabled={!canCompose}
          rows={2}
        />

        <div className="composer-tools">
          <div className="attachment-tools">
            <MoreToolsMenu
              onInsertMention={insertMention}
              onOpenInspector={setInspectorTab}
            />
            <ApprovalModeMenu
              value={permissionMode}
              onValueChange={setPermissionMode}
              onLearnMore={() => setActiveView("settings")}
            />
          </div>

          <div className="composer-options">
            <ModelAndEffortControl
              models={models}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              effort={reasoningEffort}
              onEffortChange={setReasoningEffort}
              usage={showContextUsage ? tokenUsage : null}
              onAdvanced={() => setActiveView("settings")}
            />

            {running && (
              <button
                className="stop-button"
                onClick={() => void interrupt()}
                title="停止"
                aria-label="停止"
              >
                <Square size={13} fill="currentColor" />
              </button>
            )}
            {(!running || text.trim()) && (
              <button
                className="send-button"
                onClick={() => void submit()}
                disabled={!text.trim() || !canCompose}
                title="发送"
                aria-label="发送"
              >
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="composer-note">
        Codex 可能会修改文件和运行命令。请在批准前检查操作内容。
      </p>
    </div>
  );
}

function MoreToolsMenu({
  onInsertMention,
  onOpenInspector,
}: {
  onInsertMention: () => void;
  onOpenInspector: (tab: InspectorTab) => void;
}) {
  const tools = [
    {
      label: "引用项目文件",
      description: "在输入框中插入 @",
      icon: <AtSign size={15} />,
      action: onInsertMention,
    },
    {
      label: "浏览项目文件",
      description: "打开 Files 检查器",
      icon: <Files size={15} />,
      action: () => onOpenInspector("files"),
    },
    {
      label: "打开终端",
      description: "打开 Terminal 检查器",
      icon: <TerminalSquare size={15} />,
      action: () => onOpenInspector("terminal"),
    },
    {
      label: "检查更改",
      description: "打开 Changes 检查器",
      icon: <FileDiff size={15} />,
      action: () => onOpenInspector("changes"),
    },
    {
      label: "查看 Agents",
      description: "打开 Agents 检查器",
      icon: <Users size={15} />,
      action: () => onOpenInspector("agents"),
    },
  ];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="more-tools-trigger"
          title="更多工具"
          aria-label="更多工具"
        >
          <Plus size={18} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="composer-menu-content tools-menu-content"
          side="top"
          align="start"
          sideOffset={9}
          collisionPadding={12}
        >
          <DropdownMenu.Label className="composer-menu-label">
            更多工具
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="composer-menu-separator" />
          {tools.map((tool) => (
            <DropdownMenu.Item
              key={tool.label}
              className="composer-tool-menu-item"
              onSelect={tool.action}
            >
              <span>{tool.icon}</span>
              <span>
                <strong>{tool.label}</strong>
                <small>{tool.description}</small>
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ApprovalModeMenu({
  value,
  onValueChange,
  onLearnMore,
}: {
  value: PermissionMode;
  onValueChange: (value: PermissionMode) => Promise<void>;
  onLearnMore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmFullAccess, setConfirmFullAccess] = useState(false);
  const options: Array<{
    value: PermissionMode;
    label: string;
    description: string;
    danger?: boolean;
  }> = [
    {
      value: "request",
      label: "请求批准",
      description: "编辑外部文件和使用互联网时始终询问",
    },
    {
      value: "auto",
      label: "替我审批",
      description: "仅对检测到的风险操作请求批准",
    },
    {
      value: "full-access",
      label: "完全访问权限",
      description: "可不受限制地访问互联网和您电脑上的任何文件",
      danger: true,
    },
  ];
  const selected = options.find((option) => option.value === value)!;

  async function applyMode(mode: PermissionMode) {
    setConfirmFullAccess(false);
    setOpen(false);
    await onValueChange(mode);
  }

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setConfirmFullAccess(false);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          className={`approval-mode-trigger${selected.danger ? " is-danger" : ""}`}
          title="审批模式"
          aria-label="审批模式"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          {permissionModeIcon(value, 14)}
          <span>{selected.label}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="composer-menu-content approval-mode-menu"
          side="top"
          align="start"
          sideOffset={9}
          collisionPadding={12}
        >
          <div className="approval-menu-header">
            <span>应如何批准 ChatGPT 操作？</span>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setOpen(false);
                onLearnMore();
              }}
            >
              了解更多
            </button>
          </div>

          <div className="approval-mode-options">
            {options.map((option) => (
              <DropdownMenu.Item
                key={option.value}
                className={`approval-mode-item${option.danger ? " is-danger" : ""}`}
                onSelect={(event) => {
                  if (
                    option.value === "full-access" &&
                    value !== "full-access"
                  ) {
                    event.preventDefault();
                    setConfirmFullAccess(true);
                    return;
                  }
                  void applyMode(option.value);
                }}
              >
                <span className="approval-mode-icon">
                  {permissionModeIcon(option.value, 18)}
                </span>
                <span className="approval-mode-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {value === option.value && (
                  <Check className="approval-mode-check" size={17} />
                )}
              </DropdownMenu.Item>
            ))}
          </div>

          {confirmFullAccess && (
            <div
              className="full-access-confirmation"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <strong>启用完全访问权限？</strong>
              <span>Codex 将可访问网络和电脑上的任意文件。</span>
              <div>
                <button
                  type="button"
                  onClick={() => setConfirmFullAccess(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="confirm-danger"
                  onClick={() => void applyMode("full-access")}
                >
                  确认启用
                </button>
              </div>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function permissionModeIcon(mode: PermissionMode, size: number) {
  if (mode === "request") return <Hand size={size} />;
  if (mode === "full-access") return <ShieldAlert size={size} />;
  return <Bot size={size} />;
}

function ContextUsageMeter({ usage }: { usage: ThreadTokenUsage | null }) {
  const contextWindow = usage?.modelContextWindow || 0;
  const used = usage?.last.totalTokens || 0;
  const remaining = Math.max(0, contextWindow - used);
  const percent = contextWindow
    ? Math.min(100, Math.max(0, (used / contextWindow) * 100))
    : 0;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className="context-usage-trigger"
          aria-label={`上下文已使用 ${formatTokens(used)}，剩余 ${formatTokens(remaining)}`}
        >
          <span
            className="context-usage-ring"
            style={
              {
                "--context-progress": `${percent * 3.6}deg`,
              } as React.CSSProperties
            }
          />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="context-usage-tooltip"
          side="top"
          sideOffset={8}
        >
          <strong>上下文 {Math.round(percent)}%</strong>
          {contextWindow ? (
            <>
              <span>已使用 {formatTokens(used)} tokens</span>
              <span>剩余 {formatTokens(remaining)} tokens</span>
              <span>窗口 {formatTokens(contextWindow)} tokens</span>
            </>
          ) : (
            <span>发送消息后显示 Token 用量</span>
          )}
          {usage && (
            <small>任务累计 {formatTokens(usage.total.totalTokens)} tokens</small>
          )}
          <Tooltip.Arrow className="context-usage-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function ModelAndEffortControl({
  models,
  selectedModel,
  onModelChange,
  effort,
  onEffortChange,
  usage,
  onAdvanced,
}: {
  models: Array<{ id: string; displayName?: string }>;
  selectedModel: string;
  onModelChange: (value: string) => void;
  effort: string;
  onEffortChange: (value: string) => void;
  usage: ThreadTokenUsage | null;
  onAdvanced: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sliderOpen, setSliderOpen] = useState(false);
  const selectedModelInfo = models.find((model) => model.id === selectedModel);
  const selectedEffortIndex = Math.max(
    0,
    effortOptions.findIndex((option) => option.value === effort),
  );
  const selectedEffort = effortOptions[selectedEffortIndex];
  const sliderProgress =
    (selectedEffortIndex / (effortOptions.length - 1)) * 100;
  const modelOptions = models.length
    ? models.map((model) => ({
        value: model.id,
        label: modelLabel(model.id, model.displayName),
        description: model.id,
      }))
    : [
        {
          value: "",
          label: "默认模型",
          description: "使用 Codex CLI 默认设置",
        },
      ];

  return (
    <div className="model-effort-cluster">
      <ContextUsageMeter usage={usage} />

      <DropdownMenu.Root
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) setSliderOpen(false);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            className="model-label-trigger"
            aria-label="模型和高级选项"
            title="模型和高级选项"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              setSliderOpen(false);
              setMenuOpen((open) => !open);
            }}
          >
            {modelLabel(selectedModel, selectedModelInfo?.displayName)}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="composer-menu-content model-effort-menu-content"
            side="top"
            align="end"
            sideOffset={9}
            collisionPadding={12}
          >
            <DropdownMenu.Label className="model-effort-section-label">
              模型
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup
              value={selectedModel}
              onValueChange={onModelChange}
            >
              {modelOptions.map((option) => (
                <DropdownMenu.RadioItem
                  key={option.value || "default"}
                  className="model-effort-menu-row"
                  value={option.value}
                >
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <DropdownMenu.ItemIndicator className="composer-menu-indicator">
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>

            <DropdownMenu.Separator className="model-effort-separator" />
            <DropdownMenu.Label className="model-effort-section-label">
              思考强度
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup
              value={effort}
              onValueChange={onEffortChange}
            >
              {effortOptions.map((option) => (
                <DropdownMenu.RadioItem
                  key={option.value}
                  className="model-effort-menu-row effort-menu-row"
                  value={option.value}
                >
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <DropdownMenu.ItemIndicator className="composer-menu-indicator">
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>

            <DropdownMenu.Separator className="model-effort-separator" />
            <DropdownMenu.Item
              className="advanced-options-item"
              onSelect={onAdvanced}
            >
              <Settings2 size={14} />
              <span>高级</span>
              <ChevronRight size={13} />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DropdownMenu.Root
        open={sliderOpen}
        onOpenChange={(open) => {
          setSliderOpen(open);
          if (open) setMenuOpen(false);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            className="effort-label-trigger"
            aria-label="调整思考强度"
            title="调整思考强度"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              setMenuOpen(false);
              setSliderOpen((open) => !open);
            }}
          >
            {selectedEffort.label}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="composer-menu-content reasoning-slider-popover"
            side="top"
            align="end"
            sideOffset={9}
            collisionPadding={12}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="reasoning-slider-header">
              <span>
                <BrainCircuit size={15} />
                思考强度
              </span>
              <strong>{selectedEffort.label}</strong>
            </div>
            <p>{selectedEffort.description}</p>
            <input
              type="range"
              min={0}
              max={effortOptions.length - 1}
              step={1}
              value={selectedEffortIndex}
              aria-label="思考强度"
              aria-valuetext={selectedEffort.label}
              style={
                {
                  "--reasoning-progress": `${sliderProgress}%`,
                } as React.CSSProperties
              }
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) =>
                onEffortChange(
                  effortOptions[Number(event.target.value)].value,
                )
              }
            />
            <div className="reasoning-slider-ticks" aria-hidden="true">
              {effortOptions.map((option) => (
                <span key={option.value}>{option.label}</span>
              ))}
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <button
        className={`model-menu-chevron${menuOpen ? " is-open" : ""}`}
        aria-label="展开模型和高级选项"
        title="展开模型和高级选项"
        onClick={() => {
          setSliderOpen(false);
          setMenuOpen((open) => !open);
        }}
      >
        <ChevronDown size={13} />
      </button>
    </div>
  );
}

function SlashCommandMenu({
  commands,
  activeIndex,
  onSelect,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
}) {
  return (
    <div className="slash-command-menu" role="listbox" aria-label="快捷命令">
      <div className="slash-command-heading">
        <span>命令</span>
        <kbd>Esc</kbd>
      </div>
      <div className="slash-command-list">
        {commands.map((command, index) => (
          <button
            key={command.id}
            className={index === activeIndex ? "is-active" : undefined}
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command)}
          >
            <span className="slash-command-icon">{command.icon}</span>
            <span>
              <strong>{command.label}</strong>
              <small>{command.description}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTokens(value: number) {
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(
      value >= 10_000_000 ? 0 : 1,
    );
    return `${formatted.replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    const formatted = (value / 1_000).toFixed(value >= 100_000 ? 0 : 1);
    return `${formatted.replace(/\.0$/, "")}K`;
  }
  return String(value);
}

function modelLabel(id: string, displayName?: string) {
  const source = (displayName || id || "默认模型")
    .replace(/^gpt-/i, "")
    .replace(/^GPT-/i, "")
    .replaceAll("-", " ");
  return source.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
