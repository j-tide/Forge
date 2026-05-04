# Forge · Frosted Workspace 1.1

本包是依据用户上传的磨砂玻璃 UI 视频重做的 **Forge 界面与交互方向稿**。
它不是已完成的 Forge 客户端，也不修改既有产品规格中的任务、审批、插件与 Host 边界。

## 先看什么

1. 用浏览器打开 `forge_glass_prototype.html`，不用安装依赖。
2. 查看 `forge_glass_walkthrough.mp4`：约 27 秒，从看板到审批、任务执行详情、工作流与角色配置。
3. `screens/` 是同一 HTML 原型渲染的截图，不是图片生成模型绘制的界面。
4. `design/visual-spec.md` 解释与旧设计的差异、页面结构与跨端落地约束。
5. `design/codex-handoff.md` 用于把设计移植到 Vue / Electron 工程。
6. `design/tokens.json`、`design/motion.json`、`design/reference.css` 是实现参考。

## 可以体验的交互

草稿编辑与审批、审批后入 TODO、手动开始、暂停/继续、任务详情页签、Review 退回开发、人工验收后完成、看板/列表切换、待处理筛选、快捷搜索、工作流节点选择与示例配置保存、角色配置、知识搜索、减少透明度/动效，以及手机控制端预览。

`⌘ K` 或 `Ctrl K` 搜索；`Esc` 关闭面板；输入框 Enter 提交、Shift+Enter 换行。

聊天输入不会调用模型。它把文本放入演示草稿，要求手工补齐验收标准；不会假装已经理解并分解任意需求。

## 范围与诚实说明

- 所有任务、运行日志、代码差异、检查结果和主机状态都是演示数据。
- 没有真正运行 Codex / Claude，没有访问仓库、网络服务、模型 API 或远程设备。
- 原型状态保存在页面内存，刷新重置；不要用它存放正式需求。
- 外围蓝色背景是本稿自绘的展示背景，不是读取用户桌面的结果；没有分发参考视频或系统壁纸。
- 工程需将桌面展示框换成真实的系统窗口；不要把“窗口里的假窗口”照搬进成品。
- `ui-smoke-results.json` 是 30 项已执行的原型冒烟检查，不代表完整产品测试通过。
- 未做 macOS / Windows 实机材质、原生窗口行为、模型接入、真实远程连接或完整无障碍审计。
- 这是新的视觉/交互方向稿，不是对 105 页蓝图、100 个工程任务的整体重写。旧工程契约继续保留；旧视觉稿不再作为本方向的实现基准。

## 字体与素材

仅使用系统字体列表；包内不包含任何字体文件。F 标记、图标与演示背景均在 HTML 中以 SVG / CSS 实现。

## 可选：重新执行原型冒烟检查

安装 Python 与 Playwright 后，在本目录运行：

```sh
python -m pip install playwright
python -m playwright install chromium
python design/prototype-smoke-test.py
```

已有 Chromium 时可设置 `CHROMIUM_PATH` 指向本机可执行文件。此脚本只测试静态原型交互，不会调用模型、访问仓库或连接 Host。
