# codex+++

codex+++ 是一个独立品牌的开源 Codex 桌面客户端。它使用 Codex CLI 的
`app-server` 协议提供项目、线程、流式事件、审批、Diff、终端和扩展管理体验。

## 本地开发

```powershell
pnpm.cmd install
pnpm.cmd protocol:generate
pnpm.cmd tauri:dev
```

要求：

- Node.js 20+
- pnpm
- Rust stable
- Visual Studio 2022 Build Tools（Desktop development with C++）
- Codex CLI

仅预览前端：

```powershell
pnpm.cmd dev
```

## 安全边界

- codex+++ 不读取 Codex 登录令牌。
- 主 WebView 不直接获得 Shell 或任意文件系统权限。
- 高风险操作必须由用户确认。
- 项目不包含 OpenAI/Codex 官方桌面应用的私有资源或接口。
