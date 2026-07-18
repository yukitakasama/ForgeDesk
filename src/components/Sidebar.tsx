import {
  Archive,
  Blocks,
  Bot,
  ChevronDown,
  Cloud,
  FolderOpen,
  Inbox,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import clsx from "clsx";
import { formatRelativeTime } from "../lib/format";
import { isTauriRuntime } from "../lib/bridge";
import { useAppStore } from "../store/useAppStore";

export default function Sidebar() {
  const projects = useAppStore((state) => state.projects);
  const selectedProjectId = useAppStore((state) => state.selectedProjectId);
  const selectProject = useAppStore((state) => state.selectProject);
  const addProject = useAppStore((state) => state.addProject);
  const threads = useAppStore((state) => state.threads);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const openThread = useAppStore((state) => state.openThread);
  const newThread = useAppStore((state) => state.newThread);
  const connection = useAppStore((state) => state.connection);
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);

  async function chooseProject() {
    if (!isTauriRuntime()) {
      await addProject("D:\\example-project");
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择项目目录",
    });
    if (typeof selected === "string") await addProject(selected);
  }

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">
          F
        </div>
        <div>
          <strong>codex+++</strong>
          <span>Codex workspace</span>
        </div>
        <span
          className={clsx("connection-dot", `is-${connection}`)}
          title={`连接状态：${connection}`}
        />
      </div>

      <button className="new-task-button" onClick={() => void newThread()}>
        <Plus size={16} />
        新任务
        <kbd>Ctrl N</kbd>
      </button>

      <nav className="primary-nav" aria-label="主要导航">
        <NavButton
          active={activeView === "workspace"}
          icon={<Sparkles size={16} />}
          label="工作台"
          onClick={() => setActiveView("workspace")}
        />
        <NavButton
          active={activeView === "automations"}
          icon={<Inbox size={16} />}
          label="自动化与收件箱"
          onClick={() => setActiveView("automations")}
        />
        <NavButton
          active={activeView === "cloud"}
          icon={<Cloud size={16} />}
          label="Cloud 任务"
          onClick={() => setActiveView("cloud")}
        />
        <NavButton
          active={activeView === "extensions"}
          icon={<Blocks size={16} />}
          label="扩展"
          onClick={() => setActiveView("extensions")}
        />
      </nav>

      <section className="project-section">
        <div className="section-label">
          <span>项目</span>
          <button onClick={() => void chooseProject()} title="添加项目">
            <FolderOpen size={15} />
          </button>
        </div>
        {projects.length === 0 ? (
          <button className="empty-project" onClick={() => void chooseProject()}>
            <FolderOpen size={17} />
            添加本地项目
          </button>
        ) : (
          <div className="project-switcher">
            {projects.map((project) => (
              <button
                key={project.id}
                className={clsx(
                  "project-button",
                  project.id === selectedProjectId && "is-active",
                )}
                onClick={() => selectProject(project.id)}
                title={project.root}
              >
                <span className="project-glyph">
                  {project.name.slice(0, 1).toUpperCase()}
                </span>
                <span>{project.name}</span>
                {project.id === selectedProjectId && <ChevronDown size={14} />}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="thread-section">
        <div className="section-label">
          <span>最近任务</span>
          <button title="搜索任务">
            <Search size={14} />
          </button>
        </div>
        <div className="thread-list">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={clsx(
                "thread-button",
                thread.id === activeThreadId && "is-active",
              )}
              onClick={() => void openThread(thread.id)}
            >
              <Bot size={15} />
              <span className="thread-copy">
                <strong>{thread.name || thread.preview || "未命名任务"}</strong>
                <small>{formatRelativeTime(thread.updatedAt)}</small>
              </span>
            </button>
          ))}
          {threads.length === 0 && projects.length > 0 && (
            <div className="empty-threads">
              这个项目还没有任务
              <span>从上方新建一个任务开始</span>
            </div>
          )}
        </div>
      </section>

      <div className="sidebar-footer">
        <button>
          <Archive size={15} />
          已归档
        </button>
        <button
          className={clsx(activeView === "settings" && "is-active")}
          onClick={() => setActiveView("settings")}
        >
          <Settings size={15} />
          设置
        </button>
      </div>
    </aside>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={clsx(active && "is-active")} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
