import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import Inspector, { projectAgents } from "./Inspector";
import { useAppStore } from "../store/useAppStore";

describe("Agents 检查器", () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      inspectorTab: "agents",
      items: [],
    });
  });

  it("按子线程合并协作状态", () => {
    const agents = projectAgents([
      {
        type: "collabAgentToolCall",
        id: "call-1",
        status: "inProgress",
        prompt: "检查设置页面",
        receiverThreadIds: ["thread-agent-1"],
      },
      {
        type: "collabAgentToolCall",
        id: "call-2",
        status: "completed",
        agentsStates: {
          "thread-agent-1": { status: "completed", name: "界面审查" },
        },
      },
    ]);

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: "thread-agent-1",
      name: "界面审查",
      status: "completed",
      task: "检查设置页面",
    });
  });

  it("显示状态并可展开 Agent 详情", () => {
    useAppStore.setState({
      items: [
        {
          type: "subAgentActivity",
          id: "activity-1",
          agentThreadId: "thread-agent-2",
          agentPath: "D:\\repo\\视觉审查",
          kind: "检查右侧面板",
          status: "active",
        },
      ],
    });

    render(<Inspector />);

    expect(screen.getByText("1 名协作 Agent")).toBeTruthy();
    expect(screen.getByText("运行中")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /视觉审查/ }));
    expect(screen.getByText("thread-agent-2")).toBeTruthy();
    expect(screen.getByText("D:\\repo\\视觉审查")).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开子线程" })).toBeTruthy();
  });
});
