import { expect, test } from "@playwright/test";

test("工作台在桌面视口正确显示", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("codex+++", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /新任务/ })).toBeVisible();
  await expect(page.getByText("连接你的第一个项目")).toBeVisible();
  await expect(page.locator("body")).toHaveScreenshot("workspace-empty.png", {
    animations: "disabled",
  });
});
