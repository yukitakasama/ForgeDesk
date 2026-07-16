import { describe, expect, it } from "vitest";
import {
  flattenThread,
  permissionModeFromSettings,
  useAppStore,
} from "./useAppStore";

describe("Codex 事件投影", () => {
  it("合并 agent message 增量", () => {
    useAppStore.setState({ items: [] });
    useAppStore.getState().handleCodexMessage({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "你好",
      },
    });
    useAppStore.getState().handleCodexMessage({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "，世界",
      },
    });
    expect(useAppStore.getState().items[0]).toMatchObject({
      type: "agentMessage",
      id: "item-1",
      text: "你好，世界",
    });
  });

  it("将审批请求放入队列", () => {
    useAppStore.setState({ approvals: [] });
    useAppStore.getState().handleCodexMessage({
      id: 18,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        command: "pnpm test",
        cwd: "D:\\repo",
      },
    });
    expect(useAppStore.getState().approvals).toHaveLength(1);
    expect(useAppStore.getState().approvals[0].command).toBe("pnpm test");
  });

  it("未知通知不会破坏现有状态", () => {
    useAppStore.setState({ diff: "existing" });
    expect(() =>
      useAppStore.getState().handleCodexMessage({
        method: "future/newNotification",
        params: { value: true },
      }),
    ).not.toThrow();
    expect(useAppStore.getState().diff).toBe("existing");
  });

  it("权限模式正确映射审批策略与 Sandbox", async () => {
    useAppStore.setState({
      activeThreadId: null,
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
    });
    expect(
      permissionModeFromSettings("untrusted", "workspace-write"),
    ).toBe("request");
    expect(
      permissionModeFromSettings("on-request", "workspace-write"),
    ).toBe("auto");
    expect(
      permissionModeFromSettings("never", "danger-full-access"),
    ).toBe("full-access");

    await useAppStore.getState().setPermissionMode("request");
    expect(useAppStore.getState()).toMatchObject({
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    });

    await useAppStore.getState().setPermissionMode("full-access");
    expect(useAppStore.getState()).toMatchObject({
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    });
  });

  it("只接收当前任务的上下文 Token 用量", () => {
    useAppStore.setState({
      activeThreadId: "thread-1",
      tokenUsage: null,
    });
    useAppStore.getState().handleCodexMessage({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-2",
        turnId: "turn-1",
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
      },
    });
    expect(useAppStore.getState().tokenUsage).toBeNull();

    useAppStore.getState().handleCodexMessage({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-2",
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
      },
    });
    expect(useAppStore.getState().tokenUsage?.last.totalTokens).toBe(32_000);
  });

  it("展平历史 turns 并保留消息顺序", () => {
    const items = flattenThread({
      id: "thread-1",
      preview: "history",
      cwd: "D:\\repo",
      updatedAt: 1,
      turns: [
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-1",
              content: [{ type: "text", text: "问题" }],
            },
          ],
        },
        {
          id: "turn-2",
          items: [
            {
              type: "agentMessage",
              id: "agent-1",
              text: "回答",
            },
          ],
        },
      ],
    });
    expect(items.map((item) => item.type)).toEqual([
      "userMessage",
      "agentMessage",
    ]);
  });
});
