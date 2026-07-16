import { useMemo } from "react";
import Editor from "@monaco-editor/react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bot,
  FileCode2,
  FileDiff,
  TerminalSquare,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export default function Inspector() {
  const tab = useAppStore((state) => state.inspectorTab);
  const setTab = useAppStore((state) => state.setInspectorTab);
  const diff = useAppStore((state) => state.diff);
  const items = useAppStore((state) => state.items);

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

  const agents = items.filter(
    (item) =>
      item.type === "collabAgentToolCall" || item.type === "subAgentActivity",
  );

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
            <div className="agent-list">
              {agents.map((agent, index) => (
                <div key={agent.id || index}>
                  <span className="agent-status" />
                  <div>
                    <strong>协作代理 {index + 1}</strong>
                    <span>{String(agent.status || "active")}</span>
                  </div>
                </div>
              ))}
            </div>
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
