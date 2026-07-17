import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsView from "./SettingsView";
import { useAppStore } from "../store/useAppStore";
import { usePreferencesStore } from "../store/usePreferencesStore";

describe("常规设置", () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      activeThreadId: null,
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
    });
    usePreferencesStore.setState({
      showContextUsage: false,
      sendShortcut: "enter",
      followUpBehavior: "queue",
    });
  });

  it("显示截图中的设置分组", () => {
    render(<SettingsView />);
    expect(screen.getByRole("heading", { name: "权限" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "编辑器" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "弹出窗口" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "通知" })).toBeTruthy();
  });

  it("持久更新编辑器与权限选项", () => {
    render(<SettingsView />);
    fireEvent.click(
      screen.getByRole("switch", { name: "显示上下文窗口使用情况" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "发送快捷键" }), {
      target: { value: "ctrl-enter" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: "使用默认权限" }),
    );

    expect(usePreferencesStore.getState()).toMatchObject({
      showContextUsage: true,
      sendShortcut: "ctrl-enter",
    });
    expect(useAppStore.getState()).toMatchObject({
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    });
  });

  it("可在应用内查看开源许可证", () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(screen.getByRole("dialog", { name: "开源许可证" })).toBeTruthy();
    expect(screen.getByText(/Third-party notices/)).toBeTruthy();
  });

  it("可持久更新外观主题与偏好", () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "外观" }));
    fireEvent.click(screen.getByRole("button", { name: "深色" }));
    fireEvent.click(screen.getByRole("switch", { name: "使用指针光标" }));

    expect(usePreferencesStore.getState().appearance).toMatchObject({
      theme: "dark",
      pointerCursor: true,
    });
    expect(screen.getByLabelText("浅色主题对比度")).toBeTruthy();
    expect(screen.getByLabelText("深色主题对比度")).toBeTruthy();
  });
});
