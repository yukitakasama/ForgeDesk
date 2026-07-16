import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import Composer from "./Composer";
import { useAppStore } from "../store/useAppStore";
import { usePreferencesStore } from "../store/usePreferencesStore";

function renderComposer() {
  return render(
    <TooltipProvider>
      <Composer />
    </TooltipProvider>,
  );
}

describe("Composer 工具栏", () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "composer-project",
          root: "D:\\repo",
          createdAt: "",
          lastOpenedAt: "",
        },
      ],
      selectedProjectId: "project-1",
      activeThreadId: "thread-1",
      models: [{ id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol" }],
      selectedModel: "gpt-5.6-sol",
      reasoningEffort: "medium",
      approvalPolicy: "on-request",
      tokenUsage: {
        total: {
          totalTokens: 80_000,
          inputTokens: 70_000,
          cachedInputTokens: 0,
          outputTokens: 10_000,
          reasoningOutputTokens: 0,
        },
        last: {
          totalTokens: 32_000,
          inputTokens: 28_000,
          cachedInputTokens: 0,
          outputTokens: 4_000,
          reasoningOutputTokens: 0,
        },
        modelContextWindow: 128_000,
      },
      running: false,
      inspectorTab: "changes",
      inspectorOpen: true,
    });
    usePreferencesStore.setState({
      showContextUsage: true,
      sendShortcut: "enter",
      defaultNoProjectTask: false,
    });
  });

  it("显示真实上下文环和紧凑模型组合", () => {
    const { container } = renderComposer();
    expect(
      screen.getByLabelText("上下文已使用 32K，剩余 96K"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "模型和高级选项" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "调整思考强度" }).textContent,
    ).toBe("中");
    expect(screen.queryByRole("slider", { name: "思考强度" })).toBeNull();
    expect(container.querySelector(".composer-menu-item-icon")).toBeNull();
  });

  it("点击思考文字后用粗滑条更新强度", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "调整思考强度" }));
    const slider = await screen.findByRole("slider", { name: "思考强度" });
    fireEvent.change(slider, {
      target: { value: "2" },
    });
    expect(useAppStore.getState().reasoningEffort).toBe("high");
  });

  it("点击模型后显示栏式模型、思考强度和高级选项", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "模型和高级选项" }));
    expect(await screen.findByText("高级")).toBeTruthy();
    expect(screen.getByText("模型")).toBeTruthy();
    expect(screen.getByText("思考强度")).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: /5.6 Sol/ })).toBeTruthy();
    expect(
      screen.getByRole("menuitemradio", {
        name: /^高\s+深入分析复杂任务$/,
      }),
    ).toBeTruthy();
  });

  it("审批按钮显示三档权限菜单", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "审批模式" }));
    expect(
      await screen.findByText("应如何批准 ChatGPT 操作？"),
    ).toBeTruthy();
    expect(screen.getByText("了解更多")).toBeTruthy();
    expect(screen.getByText("请求批准")).toBeTruthy();
    expect(
      screen.getByRole("menuitem", {
        name: /替我审批.*仅对检测到的风险操作请求批准/,
      }),
    ).toBeTruthy();
    expect(screen.getByText("完全访问权限")).toBeTruthy();
    expect(
      screen.getByText(
        "可不受限制地访问互联网和您电脑上的任何文件",
      ),
    ).toBeTruthy();
  });

  it("输入斜杠后可用键盘执行命令", () => {
    renderComposer();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "/files" } });
    expect(screen.getByRole("option", { name: /\/files/ })).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useAppStore.getState().inspectorTab).toBe("files");
    expect((input as HTMLTextAreaElement).value).toBe("");
  });
});
