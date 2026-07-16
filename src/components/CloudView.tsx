import { useEffect } from "react";
import { Cloud, GitPullRequestArrow, RefreshCw } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export default function CloudView() {
  const tasks = useAppStore((state) => state.cloudTasks);
  const loading = useAppStore((state) => state.cloudLoading);
  const load = useAppStore((state) => state.loadCloudTasks);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="surface-page">
      <header className="surface-header">
        <div>
          <span className="eyebrow">Labs</span>
          <h1>Codex Cloud</h1>
          <p>浏览云端任务，并在审阅后将 Diff 应用到本地工作区。</p>
        </div>
        <button className="surface-action" onClick={() => void load()}>
          <RefreshCw size={15} className={loading ? "is-spinning" : ""} />
          刷新
        </button>
      </header>
      {tasks.length ? (
        <div className="data-list">
          {tasks.map((task) => (
            <article key={task.id}>
              <div className="data-icon">
                <Cloud size={18} />
              </div>
              <div>
                <strong>{task.title || task.id}</strong>
                <span>
                  {task.status || "unknown"} ·{" "}
                  {task.environmentId || "默认环境"}
                </span>
              </div>
              <button title="查看 Diff">
                <GitPullRequestArrow size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="large-empty">
          <Cloud size={28} />
          <h2>{loading ? "正在读取云任务" : "没有可显示的云任务"}</h2>
          <p>此功能通过版本受控的 `codex cloud` CLI 适配器提供。</p>
        </div>
      )}
    </div>
  );
}
