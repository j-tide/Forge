# ADR 0001: 共享 Web 构建作为 Desktop Renderer

日期：2026-09-23。状态：已采用，范围仅 P0-02。

## 背景

工程蓝图要求 Electron Desktop 与普通 Web 入口复用 Vue UI，并保持 Main、Preload、Renderer 的安全边界。独立 Host 与 LocalTransport 属于 P0-03；本轮没有可用的 Host 能力。

## 决定

- `apps/web` 承载唯一的 Vue App。`packages/ui` 提供正式 glass tokens；Desktop 不复制页面。
- 开发时 Desktop 只加载固定的本机 Vite 地址 `http://127.0.0.1:5173/`；构建后加载同一个 Web 产物的 `index.html`。使用 Vite 的相对资源路径支持 `file://` 加载。
- Electron 使用原生标题栏及跨平台窗口尺寸。Main 仅管理窗口生命周期、加载来源与权限拒绝。
- Preload 目前只提供冻结的 `{ platform }` 只读 bridge。Web 入口通过存在性判断使用该能力；没有 IPC、Host 连接或执行能力。后续增加 IPC 时需定义具体 channel 与 schema，并重新审查权限。

## 结果

Web 与 Desktop 的布局、空状态和 token 保持一致；当前输入只存于页面内存。原生标题栏避免本轮引入未验证的拖拽区域与窗口按钮行为。P0-03 可以在不把业务调度移入 Main 的前提下接入独立 Host。
