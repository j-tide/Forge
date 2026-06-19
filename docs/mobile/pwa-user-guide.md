# Forge Companion PWA · 当前内部使用说明

**状态：开发中，尚未发布 v1.1，也不是已上架的 iOS/Android 原生应用。** 本文对应 2026-09-26 的 `mobile-route-20260926` 内部构建。真实通过的是同一已安装 macOS arm64 Desktop、包内 Python Host 和本机 390×844/844×390 Chromium 的回环流程；实体手机与私网 HTTPS 仍待验收。

## 目前可实际操作的本机预览

1. 在 Forge Desktop 选择并信任一个真实本地 Project。正常启动时不会开启 HTTP 监听。
2. 在 Desktop「设置 → 远程设备」明确启动**本机预览**，接受 macOS 原生确认。仅在这次选择后，当前 Host 在 `127.0.0.1` 的随机端口监听；关闭预览或退出 Desktop 会停止监听。
3. 用**同一台 Mac** 的浏览器打开 Desktop 显示的回环地址。手机不能访问这个地址。
4. 在 Desktop 发起一次性配对，手机布局的「连接」页输入代码和设备名称；回到 Desktop 核对设备、Project 和操作权限并人工批准。
5. 浏览器确认当前会话后，可查看获授权 Project 的待处理、任务和消息。某些消息/草稿和当前草稿批准操作还要求对应 `task:draft` 或 `task:approve` 授权。批准前须重新审阅当前版本；批准只进入 TODO，不自动启动 Agent。
6. 「连接」页可主动断开本机会话并清除本机 Forge 静态缓存与脱敏摘要。Desktop 可随时缩小 Project/操作授权或撤销设备。

本机预览用于测试。它**没有私网 TLS/证书**，不应通过端口转发、公开隧道、HTTP 局域网地址或关闭浏览器安全设置给另一台设备使用。当前未交付可从手机访问的安全地址。

## 手机安装步骤（待私网 HTTPS 与真机验收后使用）

先由 Forge 提供经授权且手机信任的**同源私网 HTTPS** 地址，并在 Desktop 确认该地址确实接入同一 Python Host。不得将本机 `127.0.0.1` 预览地址改写成 Mac 的 LAN IP 来绕过这一步。实际手机配对、证书/代理、切网与旧审批拒绝尚未通过 P7-10/P8-09，因此下面是浏览器安装方法，**不是已验证的 Forge 手机发行流程**。

- **iPhone Safari：**访问上述已验证地址；使用页面菜单/分享菜单，选择「添加到主屏幕」，启用「作为 Web App 打开」，再点「添加」。菜单文字随 iOS 语言和版本可能不同。[Apple 官方说明](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)。
- **Android Chrome：**访问上述已验证地址；打开右上角「更多」，选择「安装并创建快捷方式」或当前浏览器显示的安装入口，再按屏幕提示完成。[Google Chrome 官方说明](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en-CO)。

Forge 当前静态壳包含 manifest、图标和 Service Worker。浏览器是否提供安装入口还取决于受信任 HTTPS、安装条件和实际浏览器；[Chrome 的安装条件](https://web.dev/articles/install-criteria)要求 HTTPS 及合格 manifest。尚未在 iOS Safari 或 Android Chrome 真机确认这些条件。

## 连接、离线和通知

- 实时事件只是 Host 已提交变动的提示。页面必须重新读取 Host 的 Task/Approval 快照后才更新权威状态；站内通知最多列出当前 Project 最近 20 条事件元数据，不是系统后台推送，也不证明任何命令已成功。
- 页面关闭期间 Host 可以继续运行；重新打开后重新验证设备会话并获取最新快照。浏览器断线时，旧任务只读，不能审批、Start 或自动重放写请求。本机允许保存有限的**未提交文字草稿**和脱敏数量摘要；它们不等于 Host 中的消息或任务。
- 授权到期或被 Desktop 撤销后须重新配对。设备撤销后浏览器下次联网检查会清除 Forge 静态缓存/摘要；离线设备若尚未联网，应由用户在浏览器清除此站点数据。
- 旧版本审批、过期 CSRF 或不确定的写入结果要求重新读取 Host，并由用户再次确认；页面不得自动重试危险写入。

## Capacitor 预留边界

`@forge/client` 的 `MobilePlatformBridge` 定义未来原生 `push`、`secureStore` 和 `scanner` 端口。当前浏览器适配器对三者全部报告 `native-adapter-unavailable`，没有伪造实现或权限提示：

- push 未来只能唤醒后读取权威 Host 快照，不能作为审批/运行结果。
- secureStore 端口只允许检查保护状态与清除本机会话，不向 Vue 读取原始凭据；浏览器继续使用 Host 发放的 HttpOnly 会话 Cookie。
- scanner 未来返回的配对文字仍是**不可信输入**，必须走一次性挑战、Host 时效检查和 Desktop 人工授权。

原生实现、系统推送、Keychain/Keystore、摄像头授权、App Store/Play Store 上架均**未实现、未验收**。这层类型接口不改变现有 Host/Project/审批安全规则。

## 完整交付仍需

P7-05 的完整公开写命令适配与并发安全、P7-10 的私网 HTTPS 和安全闸门、P8-02～09 的实体手机配对/审批/断网/重连验收，以及 P8-10 引用的 T111～T115 安装、升级、凭据、运行中退出和诊断包实测。当前 Mac 本机浏览器结果不能替代这些验收，也不能据此发布 v1.1。
