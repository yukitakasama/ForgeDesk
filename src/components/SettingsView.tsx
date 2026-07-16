import { useDeferredValue, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  Blocks,
  Cat,
  CheckCircle2,
  CircleUserRound,
  Cpu,
  ExternalLink,
  FlaskConical,
  GitBranch,
  GitFork,
  Globe2,
  HardDrive,
  Keyboard,
  Mic,
  MonitorCog,
  Palette,
  RadioTower,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Webhook,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import {
  requestNotificationPermission,
  usePreferencesStore,
} from "../store/usePreferencesStore";
import thirdPartyNotices from "../../THIRD_PARTY_NOTICES.md?raw";

type SettingsPage =
  | "general"
  | "appearance"
  | "voice"
  | "configuration"
  | "personalization"
  | "pet"
  | "shortcuts"
  | "account"
  | "plugins"
  | "browser"
  | "computer"
  | "hooks"
  | "connection"
  | "git"
  | "environment"
  | "worktrees"
  | "archived";

interface SettingsNavItem {
  id: SettingsPage;
  label: string;
  icon: ReactNode;
  description: string;
}

const settingsGroups: Array<{
  label: string;
  items: SettingsNavItem[];
}> = [
  {
    label: "个人",
    items: [
      {
        id: "general",
        label: "常规",
        icon: <Settings2 size={15} />,
        description: "管理 ForgeDesk 的运行方式和实验能力。",
      },
      {
        id: "appearance",
        label: "外观",
        icon: <Palette size={15} />,
        description: "调整界面主题、密度和代码显示。",
      },
      {
        id: "voice",
        label: "语音",
        icon: <Mic size={15} />,
        description: "管理实时语音所需的能力和输入设备。",
      },
      {
        id: "configuration",
        label: "配置",
        icon: <SlidersHorizontal size={15} />,
        description: "查看 Codex CLI 配置来源和运行参数。",
      },
      {
        id: "personalization",
        label: "个性化",
        icon: <Sparkles size={15} />,
        description: "设置默认模型、推理偏好与回复体验。",
      },
      {
        id: "pet",
        label: "宠物",
        icon: <Cat size={15} />,
        description: "管理桌面伙伴及其互动行为。",
      },
      {
        id: "shortcuts",
        label: "键盘快捷键",
        icon: <Keyboard size={15} />,
        description: "查看工作台中的常用键盘操作。",
      },
      {
        id: "account",
        label: "账户",
        icon: <CircleUserRound size={15} />,
        description: "管理由 Codex CLI 安全托管的登录状态。",
      },
    ],
  },
  {
    label: "集成",
    items: [
      {
        id: "plugins",
        label: "插件",
        icon: <Blocks size={15} />,
        description: "管理 Skills、Hooks、MCP 与扩展资源。",
      },
      {
        id: "browser",
        label: "浏览器",
        icon: <Globe2 size={15} />,
        description: "查看浏览器工具和网页访问能力。",
      },
      {
        id: "computer",
        label: "电脑操控",
        icon: <MonitorCog size={15} />,
        description: "管理 Computer Use 与高风险操作边界。",
      },
    ],
  },
  {
    label: "编码",
    items: [
      {
        id: "hooks",
        label: "钩子",
        icon: <Webhook size={15} />,
        description: "管理任务生命周期中的自动化钩子。",
      },
      {
        id: "connection",
        label: "连接",
        icon: <RadioTower size={15} />,
        description: "查看本地 app-server 连接与诊断信息。",
      },
      {
        id: "git",
        label: "Git",
        icon: <GitBranch size={15} />,
        description: "管理变更审查和版本控制行为。",
      },
      {
        id: "environment",
        label: "环境",
        icon: <TerminalSquare size={15} />,
        description: "查看 Codex CLI 路径和工作环境。",
      },
      {
        id: "worktrees",
        label: "工作树",
        icon: <GitFork size={15} />,
        description: "配置并行任务使用的隔离 Git 工作树。",
      },
    ],
  },
  {
    label: "已归档",
    items: [
      {
        id: "archived",
        label: "已归档任务",
        icon: <HardDrive size={15} />,
        description: "查看和恢复已经归档的 Codex 任务。",
      },
    ],
  },
];

export default function SettingsView() {
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const setActiveView = useAppStore((state) => state.setActiveView);
  const activeItem = settingsGroups
    .flatMap((group) => group.items)
    .find((item) => item.id === activePage)!;
  const visibleGroups = settingsGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !deferredSearch ||
          `${item.label}${item.description}`
            .toLocaleLowerCase()
            .includes(deferredSearch),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="settings-page">
      <aside className="settings-nav" aria-label="设置导航">
        <button
          className="settings-back"
          onClick={() => setActiveView("workspace")}
        >
          <ArrowLeft size={15} />
          返回应用
        </button>
        <label className="settings-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索设置..."
            aria-label="搜索设置"
          />
        </label>
        <nav>
          {visibleGroups.map((group) => (
            <section key={group.label} className="settings-nav-group">
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={item.id === activePage ? "is-active" : ""}
                  onClick={() => setActivePage(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.id === "account" && <ExternalLink size={12} />}
                </button>
              ))}
            </section>
          ))}
          {visibleGroups.length === 0 && (
            <p className="settings-search-empty">没有匹配的设置</p>
          )}
        </nav>
      </aside>

      <main className="settings-content">
        <header className="settings-content-header">
          <span className="eyebrow">设置 / {activeItem.label}</span>
          <h1>{activeItem.label}</h1>
          <p>{activeItem.description}</p>
        </header>
        <SettingsContent page={activePage} />
      </main>
    </div>
  );
}

function SettingsContent({ page }: { page: SettingsPage }) {
  const [importedAt, setImportedAt] = useState("12 小时前");
  const [licensesOpen, setLicensesOpen] = useState(false);
  const runtime = useAppStore((state) => state.runtime);
  const account = useAppStore((state) => state.account);
  const loginWithChatGpt = useAppStore((state) => state.loginWithChatGpt);
  const logout = useAppStore((state) => state.logout);
  const connection = useAppStore((state) => state.connection);
  const experimentalApi = useAppStore((state) => state.experimentalApi);
  const setExperimentalApi = useAppStore(
    (state) => state.setExperimentalApi,
  );
  const capabilities = useAppStore((state) => state.capabilities);
  const diagnostics = useAppStore((state) => state.diagnostics);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const approvalPolicy = useAppStore((state) => state.approvalPolicy);
  const sandboxMode = useAppStore((state) => state.sandboxMode);
  const setPermissionMode = useAppStore((state) => state.setPermissionMode);
  const defaultFileTarget = usePreferencesStore(
    (state) => state.defaultFileTarget,
  );
  const terminalShell = usePreferencesStore((state) => state.terminalShell);
  const uiLanguage = usePreferencesStore((state) => state.uiLanguage);
  const showBottomPanel = usePreferencesStore(
    (state) => state.showBottomPanel,
  );
  const suggestionsEnabled = usePreferencesStore(
    (state) => state.suggestionsEnabled,
  );
  const showContextUsage = usePreferencesStore(
    (state) => state.showContextUsage,
  );
  const sendShortcut = usePreferencesStore((state) => state.sendShortcut);
  const followUpBehavior = usePreferencesStore(
    (state) => state.followUpBehavior,
  );
  const popupShortcut = usePreferencesStore((state) => state.popupShortcut);
  const defaultNoProjectTask = usePreferencesStore(
    (state) => state.defaultNoProjectTask,
  );
  const completionNotification = usePreferencesStore(
    (state) => state.completionNotification,
  );
  const permissionNotifications = usePreferencesStore(
    (state) => state.permissionNotifications,
  );
  const questionNotifications = usePreferencesStore(
    (state) => state.questionNotifications,
  );
  const updatePreference = usePreferencesStore(
    (state) => state.updatePreference,
  );

  if (page === "account") {
    return (
      <div className="settings-layout">
        <section className="settings-section">
          <SectionTitle icon={<CircleUserRound size={17} />} title="Codex 账户" />
          <div className="account-row">
            <div>
              <strong>
                {account?.email ||
                  (account?.type === "apiKey" ? "OpenAI API Key" : "尚未登录")}
              </strong>
              <span>
                {account
                  ? `${account.type}${account.planType ? ` · ${account.planType}` : ""}`
                  : "登录由 Codex CLI 安全处理，ForgeDesk 不读取令牌。"}
              </span>
            </div>
            {account ? (
              <button className="settings-button" onClick={() => void logout()}>
                退出登录
              </button>
            ) : (
              <button
                className="settings-button primary"
                onClick={() => void loginWithChatGpt()}
              >
                使用 ChatGPT 登录
              </button>
            )}
          </div>
        </section>
        <InfoSection
          title="凭据安全"
          icon={<ShieldCheck size={17} />}
          lines={[
            "ForgeDesk 不读取或保存 API Key 与 ChatGPT 令牌。",
            "所有认证状态均由本机 Codex CLI 管理。",
          ]}
        />
      </div>
    );
  }

  if (page === "general") {
    const permissionMode =
      sandboxMode === "danger-full-access" || approvalPolicy === "never"
        ? "full-access"
        : approvalPolicy === "untrusted"
          ? "request"
          : "auto";
    return (
      <div className="settings-layout">
        <SettingsGroup title="权限">
          <SettingRow
            label="默认权限"
            description="Codex 可以读取和编辑当前工作区中的文件，需要时会请求额外访问权限。"
            control={
              <SettingsSwitch
                checked={permissionMode === "request"}
                label="使用默认权限"
                onChange={() => void setPermissionMode("request")}
              />
            }
          />
          <SettingRow
            label="自动审核"
            description="Codex 会自动审核额外访问请求，仅对检测到的风险操作请求批准。自动审核可能出错。"
            control={
              <SettingsSwitch
                checked={permissionMode === "auto"}
                label="使用自动审核"
                onChange={() => void setPermissionMode("auto")}
              />
            }
          />
          <SettingRow
            label="完全访问权限"
            description="无需批准即可编辑电脑上的文件并运行可访问网络的命令，这会显著增加数据丢失或意外行为风险。"
            danger
            control={
              <SettingsSwitch
                checked={permissionMode === "full-access"}
                label="使用完全访问权限"
                danger
                onChange={() => void setPermissionMode("full-access")}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title="常规">
          <SettingRow
            label="默认文件打开目标"
            description="默认打开文件和文件夹的位置"
            control={
              <SettingsSelect
                ariaLabel="默认文件打开目标"
                value={defaultFileTarget}
                onChange={(value) => updatePreference("defaultFileTarget", value)}
                options={[
                  ["vscode", "VS Code"],
                  ["system", "系统默认应用"],
                  ["explorer", "文件资源管理器"],
                ]}
              />
            }
          />
          <SettingRow
            label="集成终端 Shell"
            description="选择要在集成终端中打开的 Shell"
            control={
              <SettingsSelect
                ariaLabel="集成终端 Shell"
                value={terminalShell}
                onChange={(value) => updatePreference("terminalShell", value)}
                options={[
                  ["powershell", "PowerShell"],
                  ["cmd", "Command Prompt"],
                  ["git-bash", "Git Bash"],
                ]}
              />
            }
          />
          <SettingRow
            label="语言"
            description="应用 UI 语言"
            control={
              <SettingsSelect
                ariaLabel="应用 UI 语言"
                value={uiLanguage}
                onChange={(value) => updatePreference("uiLanguage", value)}
                options={[
                  ["auto", "自动检测"],
                  ["zh-CN", "简体中文"],
                  ["en", "English"],
                ]}
              />
            }
          />
          <SettingRow
            label="底部面板"
            description="在应用标题栏中显示底部面板控件"
            control={
              <SettingsSwitch
                checked={showBottomPanel}
                label="显示底部面板控件"
                onChange={() =>
                  updatePreference("showBottomPanel", !showBottomPanel)
                }
              />
            }
          />
          <SettingRow
            label="建议提示"
            description="搜索项目文件和已连接应用，建议下一步操作"
            control={
              <SettingsSwitch
                checked={suggestionsEnabled}
                label="启用建议提示"
                onChange={() =>
                  updatePreference("suggestionsEnabled", !suggestionsEnabled)
                }
              />
            }
          />
          <SettingRow
            label="导入的智能体设置"
            description={`上次于 ${importedAt}导入`}
            control={
              <button
                className="settings-button"
                onClick={() => setImportedAt("刚刚")}
              >
                再次导入
              </button>
            }
          />
          <SettingRow
            label="开源许可证"
            description="捆绑依赖项的第三方声明"
            control={
              <button
                className="settings-button"
                onClick={() => setLicensesOpen(true)}
              >
                查看
              </button>
            }
          />
        </SettingsGroup>

        <SettingsGroup title="编辑器">
          <SettingRow
            label="显示上下文窗口使用情况"
            control={
              <SettingsSwitch
                checked={showContextUsage}
                label="显示上下文窗口使用情况"
                onChange={() =>
                  updatePreference("showContextUsage", !showContextUsage)
                }
              />
            }
          />
          <SettingRow
            label="发送快捷键"
            description="选择按 Enter 时是发送提示还是插入新行"
            control={
              <SettingsSelect
                ariaLabel="发送快捷键"
                value={sendShortcut}
                onChange={(value) =>
                  updatePreference(
                    "sendShortcut",
                    value as "enter" | "ctrl-enter",
                  )
                }
                options={[
                  ["enter", "按 Enter 键"],
                  ["ctrl-enter", "按 Ctrl + Enter 键"],
                ]}
              />
            }
          />
          <SettingRow
            label="跟进行为"
            description="Codex 运行时将后续指令加入队列，或引导当前运行。按 Ctrl + Enter 可执行相反操作。"
            control={
              <SegmentedControl
                value={followUpBehavior}
                options={[
                  ["queue", "排队"],
                  ["steer", "引导"],
                ]}
                onChange={(value) =>
                  updatePreference(
                    "followUpBehavior",
                    value as "queue" | "steer",
                  )
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title="弹出窗口">
          <SettingRow
            label="弹出窗口快捷键"
            description="为弹出窗口设置全局快捷键，留空则保持关闭"
            control={
              <input
                className="shortcut-recorder"
                value={popupShortcut}
                readOnly
                placeholder="禁用"
                aria-label="弹出窗口快捷键"
                onKeyDown={(event) => {
                  event.preventDefault();
                  if (event.key === "Backspace" || event.key === "Delete") {
                    updatePreference("popupShortcut", "");
                    return;
                  }
                  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
                    return;
                  }
                  const keys = [
                    event.ctrlKey && "Ctrl",
                    event.shiftKey && "Shift",
                    event.altKey && "Alt",
                    event.metaKey && "Meta",
                    event.key.length === 1 ? event.key.toUpperCase() : event.key,
                  ].filter(Boolean);
                  updatePreference("popupShortcut", keys.join(" + "));
                }}
              />
            }
          />
          <SettingRow
            label="默认为无项目任务"
            description="无需项目即可开始新任务"
            control={
              <SettingsSwitch
                checked={defaultNoProjectTask}
                label="默认为无项目任务"
                onChange={() =>
                  updatePreference(
                    "defaultNoProjectTask",
                    !defaultNoProjectTask,
                  )
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title="通知">
          <SettingRow
            label="轮次完成通知"
            description="设置 Codex 完成回复时提醒你的时机"
            control={
              <SettingsSelect
                ariaLabel="轮次完成通知"
                value={completionNotification}
                onChange={(value) => {
                  updatePreference(
                    "completionNotification",
                    value as "always" | "unfocused" | "never",
                  );
                  if (value !== "never") void requestNotificationPermission();
                }}
                options={[
                  ["always", "始终"],
                  ["unfocused", "仅当应用失焦时"],
                  ["never", "从不"],
                ]}
              />
            }
          />
          <SettingRow
            label="启用权限通知"
            description="需要操作批准时显示提醒"
            control={
              <SettingsSwitch
                checked={permissionNotifications}
                label="启用权限通知"
                onChange={() => {
                  updatePreference(
                    "permissionNotifications",
                    !permissionNotifications,
                  );
                  if (!permissionNotifications) {
                    void requestNotificationPermission();
                  }
                }}
              />
            }
          />
          <SettingRow
            label="启用问题通知"
            description="需要输入才能继续时显示提醒"
            control={
              <SettingsSwitch
                checked={questionNotifications}
                label="启用问题通知"
                onChange={() => {
                  updatePreference(
                    "questionNotifications",
                    !questionNotifications,
                  );
                  if (!questionNotifications) {
                    void requestNotificationPermission();
                  }
                }}
              />
            }
          />
        </SettingsGroup>

        <section className="settings-section">
          <SectionTitle icon={<FlaskConical size={17} />} title="实验能力" />
          <div className="toggle-row">
            <div>
              <strong>实验 app-server API</strong>
              <span>启用远程控制、实时语音、动态工具和高级进程接口。</span>
            </div>
            <SettingsSwitch
              checked={experimentalApi}
              label="实验 app-server API"
              onChange={() => void setExperimentalApi(!experimentalApi)}
            />
          </div>
          <div className="capability-grid">
            <Capability
              icon={<Activity size={15} />}
              name="稳定协议"
              enabled={capabilities.stableProtocol}
            />
            <Capability
              icon={<Cpu size={15} />}
              name="动态工具"
              enabled={capabilities.dynamicTools}
            />
            <Capability
              icon={<HardDrive size={15} />}
              name="远程控制"
              enabled={capabilities.remoteControl}
            />
            <Capability
              icon={<ShieldCheck size={15} />}
              name="Computer Use"
              enabled={capabilities.computerUse}
            />
          </div>
        </section>
        <InfoSection
          title="安全边界"
          icon={<ShieldCheck size={17} />}
          lines={[
            "主 WebView 不拥有 Shell、任意文件系统或凭据访问权限。",
            "高风险操作仍需遵循当前任务的审批与 Sandbox 策略。",
          ]}
        />
        {licensesOpen && (
          <div className="settings-modal-backdrop" role="presentation">
            <section
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="licenses-title"
            >
              <header>
                <div>
                  <span className="eyebrow">ForgeDesk</span>
                  <h2 id="licenses-title">开源许可证</h2>
                </div>
                <button
                  className="settings-button"
                  onClick={() => setLicensesOpen(false)}
                >
                  关闭
                </button>
              </header>
              <pre>{thirdPartyNotices}</pre>
            </section>
          </div>
        )}
      </div>
    );
  }

  if (page === "connection" || page === "environment" || page === "configuration") {
    return (
      <div className="settings-layout">
        <section className="settings-section">
          <SectionTitle icon={<TerminalSquare size={17} />} title="Codex 运行时" />
          <div className="definition-list">
            <div>
              <span>状态</span>
              <strong className={`status-text is-${connection}`}>
                <CheckCircle2 size={14} />
                {connection}
              </strong>
            </div>
            <div>
              <span>版本</span>
              <code>{runtime?.version || "检测中"}</code>
            </div>
            <div>
              <span>路径</span>
              <code>{runtime?.path || "自动检测"}</code>
            </div>
            <div>
              <span>CODEX_HOME</span>
              <code>{runtime?.codexHome || "由 CLI 管理"}</code>
            </div>
          </div>
        </section>
        {diagnostics.length > 0 && (
          <section className="settings-section diagnostics">
            <SectionTitle icon={<Activity size={17} />} title="诊断信息" />
            <pre>{diagnostics.slice(-20).join("\n")}</pre>
          </section>
        )}
      </div>
    );
  }

  if (page === "plugins") {
    return (
      <div className="settings-layout">
        <section className="settings-section settings-action-row">
          <div>
            <SectionTitle icon={<Blocks size={17} />} title="扩展管理" />
            <p>安装和管理 Skills、Hooks、MCP 服务器及共享资源。</p>
          </div>
          <button
            className="settings-button primary"
            onClick={() => setActiveView("extensions")}
          >
            打开扩展
          </button>
        </section>
      </div>
    );
  }

  if (page === "browser" || page === "computer" || page === "voice") {
    const enabled =
      page === "browser"
        ? capabilities.browser
        : page === "computer"
          ? capabilities.computerUse
          : capabilities.realtime;
    return (
      <div className="settings-layout">
        <section className="settings-section">
          <SectionTitle icon={<Activity size={17} />} title="能力状态" />
          <div className="settings-feature-status">
            <span className={enabled ? "is-enabled" : ""}>
              {enabled ? "当前可用" : "当前关闭"}
            </span>
            <p>此能力由实验 app-server API 提供，可在“常规”中启用。</p>
          </div>
        </section>
      </div>
    );
  }

  const emptyState = {
    appearance: ["界面外观", "ForgeDesk 当前跟随内置深色工作台主题。"],
    personalization: ["个性化体验", "模型与推理强度可在每个任务的输入栏中调整。"],
    pet: ["桌面宠物", "桌面伙伴功能尚未启用，后续版本将在这里提供设置。"],
    shortcuts: ["快捷键", "使用 Enter 发送消息，Shift + Enter 在输入框中换行。"],
    hooks: ["Codex Hooks", "Hooks 由扩展系统管理，可前往“插件”查看已安装资源。"],
    git: ["Git 集成", "任务中的文件变更会自动投影到工作台 Diff 检查器。"],
    worktrees: ["隔离工作树", "ForgeDesk 可为并行任务创建独立 Git worktree。"],
    archived: ["已归档任务", "归档任务管理将在任务列表接入后显示在这里。"],
  }[page] || ["设置", "此设置项将在后续版本中提供。"];

  return (
    <div className="settings-layout">
      <InfoSection
        title={emptyState[0]}
        icon={activeIcon(page)}
        lines={[emptyState[1]]}
      />
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      <h2>{title}</h2>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  control,
  danger = false,
}: {
  label: string;
  description?: string;
  control: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`setting-row${danger ? " is-danger" : ""}`}>
      <div className="setting-row-copy">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <div className="setting-row-control">{control}</div>
    </div>
  );
}

function SettingsSwitch({
  checked,
  label,
  onChange,
  danger = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={`settings-switch${checked ? " is-checked" : ""}${danger ? " is-danger" : ""}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function SettingsSelect({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="settings-select"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-segmented">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          className={value === optionValue ? "is-active" : ""}
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <h2>
      {icon}
      {title}
    </h2>
  );
}

function InfoSection({
  icon,
  title,
  lines,
}: {
  icon: ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <section className="settings-section">
      <SectionTitle icon={icon} title={title} />
      <div className="security-copy">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function activeIcon(page: SettingsPage) {
  return settingsGroups
    .flatMap((group) => group.items)
    .find((item) => item.id === page)?.icon;
}

function Capability({
  icon,
  name,
  enabled,
}: {
  icon: ReactNode;
  name: string;
  enabled: boolean;
}) {
  return (
    <div className={enabled ? "is-enabled" : ""}>
      {icon}
      <span>{name}</span>
      <strong>{enabled ? "可用" : "关闭"}</strong>
    </div>
  );
}
