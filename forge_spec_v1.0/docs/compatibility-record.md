# P0兼容性记录（实施时填写）

状态：**尚未对实际Forge应用或目标操作系统验证**。以下是验证矩阵，不是兼容性承诺。

| 组件/组合 | 候选路线 | 精确版本 | 实测命令/证据 | 结果 |
|---|---|---|---|---|
| Electron +内置Node | 官方稳定版，锁定minor/patch | P0填写 | Mac/Windows启动、utilityProcess | 待验证 |
| pnpm + TS + Vue + Vite | 工作区、strict、共享UI | P0填写 | 安装/lint/typecheck/build | 待验证 |
| SQLite驱动/Drizzle | 单Host写，原生ABI匹配 | P0填写 | Electron和standalone Node各运行迁移 | 待验证 |
| Codex SDK | 第一真实执行器 | P0填写 | structured output/cancel/resume/auth | 待验证 |
| Claude Agent SDK | 第二真实执行器，官方API Key | P4填写 | 同样Task与交接测试 | 待验证 |
| macOS Apple Silicon | 首要开发组合 | OS最低/当前填写 | 安装、签名、公证、Git、SDK、更新 | 待验证 |
| macOS Intel | 计划支持，依赖上游支持 | OS/arch填写 | 同上；未实测不发布安装包 | 待验证 |
| Windows x64 | 必须的Desktop发布目标 | OS最低/当前填写 | 路径、长路径、CRLF、进程树、签名、升级 | 待验证 |
| Windows ARM64 | 后续评估 | 不作v1承诺 | 全部原生依赖可用后再纳入 | 未规划发布 |
| iOS Safari/PWA | P8手机控制端 | 浏览器/OS填写 | 配对、Cookie、SSE、后台、离线、安全区 | 待验证 |
| Android Chrome/PWA | P8手机控制端 | 浏览器/OS填写 | 同上 | 待验证 |
| Capacitor原生包 | P9可选 | 后续填写 | 相机/推送/分发再评估 | 不属v1 |
| 独立Linux/NAS Host | 后续 | 后续填写 | 凭据、进程、队列、升级、远端 | 不属v1 |

每项依赖记录许可证、分发方式、二进制大小与供应链检查。不要使用浮动latest，不假定浏览器WebView与桌面CLI具有相同权限与认证。
