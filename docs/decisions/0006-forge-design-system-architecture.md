# ADR 0006: Forge Design System Architecture

日期：2026-09-23。状态：P0-07 在 macOS arm64 已采用。

## 背景

P0-02 只有 `tokens.css` 和应用目录中的三个轻量组件；Web 与 Desktop 虽共用 Vue App，组件样式仍散在 `apps/web/src/style.css`。`forge_glass_v1.1` 是视觉基准，旧工程包的铜橙与深色侧栏不再用于新页面。P0-07 需要可维护的公开 UI 边界，同时不得提前实现任务、审批或工作流业务。

## 决定

- `@forge/ui` 是纯 Vue/CSS workspace 包。正式公开入口导出 typed token、基础组件和布局组件；`apps/web` 是唯一 App、Host 诊断和页面状态拥有者；Desktop Renderer 仍加载同一 Web 构建。UI 包不导入 Electron、Node、Host 或执行器。当前只服务 Vite/Vue workspace 消费者，尚未发布独立 npm 构建物。
- `packages/ui/src/tokens/values.json` 是工程 token 唯一手工维护来源；`scripts/build-tokens.mjs` 生成 `tokens.css`，构建时 `--check` 比对一致性，TypeScript 导出从同一 JSON 读取。色板、圆角、68px 侧栏、34px shell blur、330/200ms 动效取自 glass v1.1；额外的语义/可访问性 token（例如文字用蓝与中性文字）在组件中使用，保留原稿交互蓝作装饰与焦点色。
- GlassSurface 提供五种有限材质层级；主要阅读、Dialog/Drawer 和代码内容使用高不透明度或实色。减少透明度由 `data-reduce-transparency="true"` 与系统媒体查询控制，将 blur 归零并替换为实色。减少动效由系统偏好与 `data-reduce-motion="true"` 控制；Spinner 保留静态加载语义，非必要位移/过渡归零。
- Button/Field/Status/Card/Tabs/Overlay 等使用原生语义、可见 focus 与文字状态。Select 采用原生 `<select>`，避免引入尚未验证的 headless 包。Dialog/Drawer 使用 `aria-modal`、背景 inert、Tab 环绕、Escape 与焦点返回；Popover 可点击外部或 Escape 关闭。关键错误和审批未来不能只依赖 Toast。
- AppShell、IconRail、WorkspaceHeader、CommandPanelShell、ContentArea 属于布局；Host 状态与权限仍由 Web/Client 获取。`/#/dev/ui` 仅在 Vite 开发模式显示组件检视页；正式首页无示例业务数据。

## 验证与限制

本机真实 Web 浏览器和 Electron Renderer 使用相同 Vue 代码；Desktop 1440×900、1600×1000 截图与 Host connected 通过。1280×800 的 125% **CSS zoom 模拟**需要主内容纵向滚动，按钮仍可到达；这不是 Windows 系统 125% DPI 或 Mac Retina 字体渲染测试。Playwright 本次 Electron viewport `devicePixelRatio=1`。键盘 Dialog 焦点环绕/Escape 返回在真实浏览器与组件测试均通过。核心阅读面及状态文字在其不透明背景上通过 4.5:1 静态对比检查；真实合成表面、读屏器、OS 高对比度和暗色主题未完成审计。

规格 T107 提到亮暗主题，但 glass v1.1 仅提供浅色视觉基准；本轮没有擅自设计暗色版。T108 的 Windows 150% 与 Mac Retina 真机对比仍待目标平台验证。T109 的正式任务详情未实现，当前只为长文本提供换行和可访问名称，不能声明业务页验收。详见实施记录。
