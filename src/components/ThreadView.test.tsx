import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThreadView from "./ThreadView";
import { useAppStore } from "../store/useAppStore";

describe("历史对话渲染", () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "history-project",
          root: "D:\\repo",
          createdAt: "",
          lastOpenedAt: "",
        },
      ],
      selectedProjectId: "project-1",
      activeThreadId: "thread-1",
      historyLoading: false,
      running: false,
      items: [
        {
          type: "userMessage",
          id: "user-1",
          content: [{ type: "text", text: "历史用户消息" }],
        },
        {
          type: "agentMessage",
          id: "agent-1",
          text: "历史助手回复",
        },
      ],
    });
  });

  it("显示用户与助手的历史消息", () => {
    render(<ThreadView />);
    expect(screen.getByText("历史用户消息")).toBeTruthy();
    expect(screen.getByText("历史助手回复")).toBeTruthy();
  });

  it("历史加载期间显示明确状态", () => {
    useAppStore.setState({ historyLoading: true });
    render(<ThreadView />);
    expect(screen.getByText("正在加载完整对话历史...")).toBeTruthy();
  });

  it("未注册项目时仍显示已有历史线程", () => {
    useAppStore.setState({
      projects: [],
      selectedProjectId: null,
      activeThreadId: "thread-1",
      historyLoading: false,
    });
    render(<ThreadView />);
    expect(screen.getByText("历史用户消息")).toBeTruthy();
    expect(screen.getByText("历史助手回复")).toBeTruthy();
  });

  it("支持结构化文件变更类型", () => {
    useAppStore.setState({
      items: [
        {
          type: "fileChange",
          id: "change-1",
          status: "completed",
          changes: [
            {
              path: "src/App.tsx",
              kind: { type: "add", move_path: null },
            },
          ],
        },
      ],
    });
    render(<ThreadView />);
    fireEvent.click(screen.getByText("文件修改 · 1 项"));
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("src/App.tsx")).toBeTruthy();
  });
});
