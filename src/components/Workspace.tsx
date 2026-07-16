import {
  GitBranch,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
} from "lucide-react";
import { pathName } from "../lib/format";
import { useAppStore } from "../store/useAppStore";
import ThreadView from "./ThreadView";
import Composer from "./Composer";
import Inspector from "./Inspector";

export default function Workspace() {
  const projects = useAppStore((state) => state.projects);
  const selectedProjectId = useAppStore((state) => state.selectedProjectId);
  const threads = useAppStore((state) => state.threads);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const inspectorOpen = useAppStore((state) => state.inspectorOpen);
  const setInspectorOpen = useAppStore((state) => state.setInspectorOpen);
  const project = projects.find((item) => item.id === selectedProjectId);
  const thread = threads.find((item) => item.id === activeThreadId);

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="workspace-heading">
          <span className="eyebrow">
            {project?.name ||
              (thread?.cwd ? pathName(thread.cwd) : "未选择项目")}
          </span>
          <h1>{thread?.name || thread?.preview || "新任务"}</h1>
        </div>
        <div className="workspace-meta">
          {project && (
            <span title={project.root}>
              <GitBranch size={14} />
              main
            </span>
          )}
          <button title="回滚任务">
            <RotateCcw size={15} />
          </button>
          <button
            title={inspectorOpen ? "关闭检查器" : "打开检查器"}
            onClick={() => setInspectorOpen(!inspectorOpen)}
          >
            {inspectorOpen ? (
              <PanelRightClose size={17} />
            ) : (
              <PanelRightOpen size={17} />
            )}
          </button>
        </div>
      </header>
      <div className="workspace-content">
        <section className="conversation-pane">
          <ThreadView />
          <Composer />
        </section>
        {inspectorOpen && <Inspector />}
      </div>
    </div>
  );
}
