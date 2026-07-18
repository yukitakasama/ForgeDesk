import { useState } from "react";
import {
  CalendarClock,
  Inbox,
  Pause,
  Play,
  Plus,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export default function AutomationsView() {
  const [creating, setCreating] = useState(false);
  const automations = useAppStore((state) => state.automations);
  const projects = useAppStore((state) => state.projects);
  const saveAutomation = useAppStore((state) => state.saveAutomation);
  const deleteAutomation = useAppStore((state) => state.deleteAutomation);
  const runAutomation = useAppStore((state) => state.runAutomation);

  async function createAutomation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const projectId = String(data.get("projectId") || "");
    if (!projectId) return;
    await saveAutomation({
      id: crypto.randomUUID(),
      name: String(data.get("name") || "未命名自动化"),
      prompt: String(data.get("prompt") || ""),
      projectId,
      rrule: String(data.get("rrule") || "FREQ=DAILY;BYHOUR=9;BYMINUTE=0"),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabled: true,
      executionEnvironment: String(
        data.get("executionEnvironment") || "worktree",
      ) as "local" | "worktree",
    });
    setCreating(false);
  }

  return (
    <div className="surface-page">
      <header className="surface-header">
        <div>
          <span className="eyebrow">本地调度</span>
          <h1>自动化与收件箱</h1>
          <p>在应用或托盘运行时，按计划启动独立 Codex 任务。</p>
        </div>
        <button
          className="surface-action"
          onClick={() => setCreating(!creating)}
        >
          {creating ? <X size={15} /> : <Plus size={15} />}
          {creating ? "取消" : "新建自动化"}
        </button>
      </header>
      <div className="automation-layout">
        <section>
          <div className="subsection-title">
            <CalendarClock size={16} />
            自动化
          </div>
          {creating && (
            <form className="automation-form" onSubmit={createAutomation}>
              <label>
                <span>名称</span>
                <input name="name" required placeholder="每日代码健康检查" />
              </label>
              <label>
                <span>项目</span>
                <select name="projectId" required defaultValue={projects[0]?.id}>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">
                <span>任务提示</span>
                <textarea
                  name="prompt"
                  required
                  rows={4}
                  placeholder="检查最近改动，运行测试并总结需要处理的问题。"
                />
              </label>
              <label>
                <span>计划</span>
                <select name="rrule" defaultValue="FREQ=DAILY;BYHOUR=9;BYMINUTE=0">
                  <option value="FREQ=DAILY;BYHOUR=9;BYMINUTE=0">
                    每天 09:00
                  </option>
                  <option value="FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0">
                    每周一 09:00
                  </option>
                  <option value="FREQ=HOURLY;INTERVAL=4">每 4 小时</option>
                </select>
              </label>
              <label>
                <span>执行环境</span>
                <select name="executionEnvironment" defaultValue="worktree">
                  <option value="worktree">独立 worktree</option>
                  <option value="local">本地目录</option>
                </select>
              </label>
              <div className="automation-form-actions">
                <button type="submit" className="surface-action">
                  <Plus size={14} />
                  创建
                </button>
              </div>
            </form>
          )}
          {automations.map((automation) => {
            const project = projects.find(
              (item) => item.id === automation.projectId,
            );
            return (
              <div className="automation-example" key={automation.id}>
                <div className="data-icon">
                  <TimerReset size={18} />
                </div>
                <div>
                  <strong>{automation.name}</strong>
                  <span>
                    {scheduleLabel(automation.rrule)} ·{" "}
                    {project?.name || "未知项目"} ·{" "}
                    {automation.executionEnvironment}
                  </span>
                </div>
                <div className="row-actions">
                  <button
                    title="立即运行"
                    onClick={() => void runAutomation(automation.id)}
                  >
                    <Play size={15} />
                  </button>
                  <button title={automation.enabled ? "暂停" : "已暂停"}>
                    <Pause size={15} />
                  </button>
                  <button
                    title="删除"
                    onClick={() => void deleteAutomation(automation.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          {automations.length === 0 && !creating && (
            <div className="large-empty compact">
              <TimerReset size={24} />
              <h2>还没有自动化</h2>
              <p>创建计划任务后，它会在 codex+++ 或系统托盘运行时执行。</p>
            </div>
          )}
        </section>
        <section>
          <div className="subsection-title">
            <Inbox size={16} />
            收件箱
          </div>
          <div className="large-empty compact">
            <Inbox size={24} />
            <h2>收件箱是空的</h2>
            <p>自动化结果、失败和待审批操作会汇总到这里。</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function scheduleLabel(rrule: string) {
  if (rrule.includes("FREQ=HOURLY")) return "每 4 小时";
  if (rrule.includes("FREQ=WEEKLY")) return "每周一 09:00";
  return "每天 09:00";
}
