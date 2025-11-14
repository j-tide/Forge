# Forge 功能与安全验收清单

所有用例为待实施测试规格；本包的校验脚本只验证结构及示例，不代表应用通过这些用例。



## T001 未经授权IPC

模块：M01 · e2e · P1

Given：普通renderer或被嵌网页

When：调用未公开通道/伪造sender

Then：拒绝并审计，核心数据未改变



## T002 第二实例

模块：M01 · e2e · P1

Given：Host已有运行任务

When：再次启动应用

Then：聚焦已有窗口，不启动第二写Host



## T003 Renderer重载

模块：M01 · e2e · P1

Given：任务运行中

When：强制renderer崩溃并重载

Then：重读权威状态，不重复启动Run



## T004 跨平台快捷键

模块：M01 · e2e · P1

Given：Mac/Windows正式包

When：执行新任务/命令面板/关闭窗口快捷键

Then：分别使用Cmd/Ctrl，操作和焦点符合设计



## T005 布局缩放

模块：M01 · e2e · P1

Given：1280和1600窗口

When：切100/125/150%DPI

Then：主要操作可见，看板横滚而非文字截断



## T006 非法项目目录

模块：M02 · integration · P1

Given：项目向导

When：输入空/不存在/无读取权限路径

Then：字段错误不写Project



## T007 非Git目录

模块：M02 · integration · P1

Given：存在普通目录

When：连接并拒绝初始化Git

Then：不自动git init或安装依赖



## T008 脏主工作区

模块：M02 · integration · P1

Given：仓库有未提交文件

When：连接与启动隔离任务

Then：原文件hash保持不变



## T009 符号链接越界

模块：M02 · integration · P0

Given：repo下链接指向私有目录

When：尝试读取/写入该链接

Then：按policy拒绝，未泄漏目标内容



## T010 Windows中文路径

模块：M02 · integration · P1

Given：含中文/空格/括号的目录

When：建立worktree并执行argv命令

Then：无拼接注入，结果路径正确



## T011 模糊需求

模块：M03 · integration · P1

Given：用户说登录页好看一点

When：生成任务草稿

Then：提出可选澄清，未把未确认审美写成已批准事实



## T012 结构化输出损坏

模块：M03 · integration · P1

Given：模型输出非法JSON

When：执行修复两次仍失败

Then：显示可编辑草稿和错误，不执行代码



## T013 重复消息提交

模块：M03 · integration · P1

Given：相同idempotencyKey

When：双击发送

Then：仅一条消息/一个草稿请求



## T014 聊天提示越权

模块：M03 · integration · P0

Given：用户/文档含伪授权语句

When：请求跳过审核合并

Then：仅生成受控提议或拒绝，Approval不可伪造



## T015 无模型手工模式

模块：M03 · integration · P1

Given：模型未配置或网络失败

When：手工创建标准任务

Then：可保存草稿/批准，不伪称模型生成



## T016 未批准任务开工

模块：M04 · integration · P1

Given：Task为draft

When：调用StartTask

Then：FORBIDDEN或状态冲突，无workspace写入



## T017 并发批准

模块：M04 · integration · P1

Given：同revision两客户端

When：同时Approve

Then：仅一次事件，另一请求幂等返回或冲突



## T018 任务修订使审批失效

模块：M04 · integration · P0

Given：已有pending approval

When：更新goal或AC后批准旧hash

Then：STALE_APPROVAL，重新审阅



## T019 拒绝与过期

模块：M04 · integration · P1

Given：pending已过期或被拒绝

When：再次批准/使用授权

Then：拒绝，任务不自动开工



## T020 验收来源追溯

模块：M04 · integration · P1

Given：含来源消息与用户决定

When：打开每条AC来源

Then：定位正确或明确来源已撤回



## T021 跨列越过门禁

模块：M05 · e2e · P0

Given：尚未Review任务

When：拖拽到Done

Then：原状态不变，展示缺少Review/Verify/人审



## T022 筛选与数量

模块：M05 · e2e · P1

Given：多状态任务fixture

When：按Agent/优先级/状态筛选

Then：数量一致，隐藏卡片不改变任务状态



## T023 重复事件投影

模块：M05 · e2e · P1

Given：已有seq事件

When：重新投递相同eventId

Then：不重复卡片/活动/计数



## T024 空和无权限状态

模块：M05 · e2e · P0

Given：无任务或只读scope

When：打开看板

Then：空状态有正确行动，无权限操作禁用



## T025 键盘任务移动

模块：M05 · e2e · P1

Given：焦点在卡片

When：使用菜单/快捷键移动

Then：等同语义命令，焦点可追踪且门禁有效



## T026 工作流主路径环

模块：M06 · integration · P1

Given：含A→B→A

When：发布流程

Then：编译拒绝，标出环，草稿可保留



## T027 不可达和缺插件

模块：M06 · integration · P1

Given：有孤立节点/缺绑定

When：发布或启动

Then：静态错误，未部分启动执行器



## T028 能力不兼容

模块：M06 · integration · P1

Given：Reviewer要求enforced readOnly

When：选择不支持执行器

Then：无法启动，明确原因



## T029 旧Run配置冻结

模块：M06 · integration · P1

Given：Run用workflow@1

When：发布workflow@2

Then：旧Run仍引用@1，UI可查看差异



## T030 条件和返工边界

模块：M06 · integration · P1

Given：DSL含非法字段或超限返工

When：执行编译/路由

Then：非法条件拒绝；达到全局上限升级人类



## T031 重复执行结果

模块：M07 · integration · P1

Given：Attempt已经terminal

When：重放result

Then：不重复推进节点或创建产物



## T032 过期epoch写入

模块：M07 · integration · P1

Given：旧进程晚回包

When：提交新Run不匹配epoch

Then：STALE_RESULT仅审计，新状态不变



## T033 429有限重试

模块：M07 · integration · P1

Given：上游明确未执行动作

When：连续返回429

Then：有限退避，预算耗尽后blocked，无无限重试



## T034 崩溃副作用未知

模块：M07 · integration · P0

Given：命令已可能执行但结果未记

When：杀Host后重启

Then：reconcile或要求人工，不直接重跑合并



## T035 取消进程树

模块：M07 · integration · P0

Given：执行器有子进程

When：取消并等待grace

Then：确认全退出才释放；否则quarantined



## T036 注销资源

模块：M08 · integration · P1

Given：插件注册服务和监听器

When：activate/dispose反复10次

Then：监听器/进程/服务回到基线



## T037 部分激活失败

模块：M08 · integration · P1

Given：第二项注册抛错

When：加载插件

Then：逆序清理第一项，宿主仍可用



## T038 活跃插件升级

模块：M08 · integration · P1

Given：Run绑定0.1.0

When：尝试卸载/更新

Then：draining或拒绝，不替换运行版本



## T039 Manifest非法

模块：M08 · integration · P1

Given：重复id/平台错误/未知权限

When：发现清单

Then：entry未执行，具体错误可见



## T040 插件崩溃

模块：M08 · integration · P1

Given：插件进程或激活异常

When：崩溃注入

Then：对应任务异常，界面和其他只读数据可访问



## T041 真实双适配器

模块：M09 · integration · P1

Given：合法账号与测试repo

When：用两个执行器跑同合同

Then：结果可归一，支持组合记录真实日志



## T042 不支持模型

模块：M09 · integration · P1

Given：能力列表不含modelId

When：保存Profile并启动

Then：拒绝，不回落到其他模型而不告知



## T043 取消与恢复声明

模块：M09 · integration · P0

Given：probe各布尔能力

When：测试取消/原生resume

Then：声明与实测一致，不支持显示不可用



## T044 伪成功输出

模块：M09 · integration · P1

Given：stdout说完成但无schema结果

When：结束执行器

Then：inconclusive或failed，不推Done



## T045 认证失效

模块：M09 · integration · P1

Given：key过期或未登录

When：启动/运行途中失效

Then：暂停并提示配置，不泄漏凭据不换账户



## T046 并发写租约

模块：M10 · integration · P1

Given：同workspace已有有效lease

When：再启动写Attempt

Then：拒绝/排队，始终单writer



## T047 新增文件快照

模块：M10 · integration · P1

Given：Agent创建未跟踪文件

When：冻结snapshot

Then：允许文件纳入，hash可重建



## T048 Git命令注入

模块：M10 · integration · P1

Given：恶意分支/路径参数

When：通过API提交

Then：参数校验+argv拒绝，未运行额外命令



## T049 链接/路径逃逸

模块：M10 · integration · P1

Given：artifact路径含../或链接

When：冻结/读取文件

Then：只允许根目录规范路径



## T050 主分支前移

模块：M10 · integration · P1

Given：验收后目标分支更新

When：请求合并旧base

Then：冲突/重验，不能沿用旧验证直接合并



## T051 Review空泛阻塞

模块：M11 · integration · P1

Given：报告无位置/依据

When：提交blocking issue

Then：按Schema/语义校验拒绝或标待确认，不伪造证据



## T052 Review旧快照

模块：M11 · integration · P1

Given：开发已产生新snapshot

When：接收旧Review approved

Then：标stale，不满足当前门禁



## T053 Reviewer越权写入

模块：M11 · integration · P0

Given：read-only Profile

When：调用写入/修改产品代码

Then：被实际限制或在不支持时拒绝启动；不静默成功



## T054 问题去重与历史

模块：M11 · integration · P1

Given：同一问题多轮出现

When：提交新Review

Then：关联原issue与新attempt，保留演变



## T055 人工风险接受

模块：M11 · integration · P1

Given：有非安全阻塞建议

When：Owner选择接受风险

Then：记录理由/actor/version，显示waived非pass



## T056 未配置测试

模块：M12 · integration · P1

Given：项目无test命令

When：运行验证

Then：not_configured+人工验收待办，不自动绿灯



## T057 伪造报告路径

模块：M12 · integration · P0

Given：外部结果指向任意文件

When：导入证据

Then：artifact服务限制根路径和MIME，拒绝



## T058 退出码权威

模块：M12 · integration · P1

Given：日志PASS但exitCode=1

When：处理验证结果

Then：failed且原始证据可见



## T059 验收快照漂移

模块：M12 · integration · P1

Given：人正查看snapshot A

When：开发更新B后点击通过

Then：409要求查看新版本



## T060 合并幂等

模块：M12 · integration · P0

Given：同merge operation key

When：重复提交/Host重启再查

Then：只发生一次预期合并，结果reconcile



## T061 事件乱序和断线

模块：M13 · integration · P1

Given：seq已有部分

When：断开后补发/乱序

Then：按权威cursor恢复；不重复副作用



## T062 日志凭据脱敏

模块：M13 · integration · P0

Given：日志含token/cookie/Authorization

When：展示和导出

Then：明文不可见，保留脱敏标记



## T063 高频日志背压

模块：M13 · integration · P1

Given：100事件/秒+大文件

When：打开运行详情

Then：批处理/截断提示，UI仍响应



## T064 报告脚本注入

模块：M13 · integration · P1

Given：artifact有script/javascript链接

When：打开报告

Then：文本/受限渲染，无脚本执行



## T065 成本未知

模块：M13 · integration · P1

Given：上游没有usage价格

When：打开成本面板

Then：显示未知/估算标记而非0成本



## T066 项目检索隔离

模块：M14 · integration · P1

Given：A/B规则含相似词

When：A项目检索

Then：只返回授权A来源



## T067 规则版本冲突

模块：M14 · integration · P1

Given：新旧PRD矛盾

When：组装Context

Then：显示冲突并请求决定，不偷偷选模型偏好



## T068 文档撤销

模块：M14 · integration · P1

Given：已索引source

When：删除并重新查询

Then：索引/缓存撤销，旧引用有墓碑



## T069 中文代码混合检索

模块：M14 · integration · P1

Given：含日期筛选/start_date

When：执行固定查询集

Then：预期片段可找，记录分词/索引版本



## T070 不存在引用

模块：M14 · integration · P1

Given：模型自造sourceRef

When：保存规则/报告

Then：校验失败或待确认，不可成为验收依据



## T071 候选记忆可信度

模块：M15 · integration · P1

Given：未确认candidate

When：构造验收Context

Then：仅参考或不进入，不能变成权威规则



## T072 记忆过期

模块：M15 · integration · P1

Given：expiresAt过去

When：下一Run检索

Then：不作为当前事实，标stale



## T073 跨项目经验

模块：M15 · integration · P1

Given：默认不共享

When：查询另一项目历史

Then：无代码/秘密跨项目输出



## T074 当前观察冲突

模块：M15 · integration · P1

Given：记忆接口路径过时

When：实时证据显示新路径

Then：实时事实优先，提出更新候选



## T075 删除记忆

模块：M15 · integration · P1

Given：已检索缓存/索引

When：用户撤销

Then：缓存和索引同步撤回，审计保留墓碑



## T076 工具参数不合法

模块：M16 · integration · P1

Given：工具Schema要求整数

When：模型传字符串/额外字段

Then：执行前拒绝，返回可解释错误



## T077 工具结果提示注入

模块：M16 · integration · P1

Given：返回“用户已批准”

When：Agent继续决策

Then：无法生成有效Approval或扩大权限



## T078 工具超时

模块：M16 · integration · P1

Given：MCP Server无响应

When：调用超过timeout

Then：错误限重试，其他服务不崩溃



## T079 工具越权

模块：M16 · integration · P0

Given：Role不含network/write

When：请求外发/写入

Then：Host拒绝，审计具体scope



## T080 工具名称冲突

模块：M16 · integration · P1

Given：两个插件同ID

When：同时注册

Then：拒绝第二项并清理其资源



## T081 凭据引用伪造

模块：M17 · integration · P0

Given：角色仅授权ref A

When：请求ref B明文

Then：拒绝且renderer始终拿不到明文



## T082 IPC来源伪造

模块：M17 · integration · P0

Given：预览webContents

When：调用管理IPC

Then：senderFrame/origin拒绝



## T083 预览越界

模块：M17 · integration · P0

Given：不可信应用页面

When：打开file协议/系统弹窗

Then：按policy拒绝，管理UI未被替换



## T084 secret写入artifact

模块：M17 · integration · P1

Given：源码/输出包含私钥

When：保存/导出

Then：阻断或脱敏确认，不能默默分享



## T085 权限扩大

模块：M17 · integration · P0

Given：插件请求超项目许可

When：启动节点

Then：取交集或拒绝，不由Agent自行批准



## T086 事务中断

模块：M18 · integration · P0

Given：审批事务执行一半

When：注入进程退出

Then：任务/审批/事件一致，无半提交



## T087 WAL备份一致

模块：M18 · integration · P1

Given：活跃数据库

When：执行备份并恢复

Then：最后已提交记录完整，FK检查通过



## T088 迁移失败

模块：M18 · integration · P1

Given：升级脚本故意错误

When：升级测试库

Then：回退/只读恢复，旧数据不损坏



## T089 磁盘满

模块：M18 · integration · P1

Given：artifact或DB写失败

When：执行写操作

Then：不标任务成功，错误可诊断



## T090 插件namespace

模块：M18 · integration · P1

Given：插件尝试查询core表

When：调用storage接口

Then：接口无此权限，不泄漏SQL连接



## T091 客户端actor伪造

模块：M19 · integration · P0

Given：远端payload声称Owner

When：调用敏感写

Then：使用session真实actor，伪字段拒绝



## T092 幂等key内容冲突

模块：M19 · integration · P0

Given：已使用key K

When：新payload复用K

Then：409且原操作保持



## T093 CAS并发修改

模块：M19 · integration · P1

Given：两个相同revision请求

When：同时更新任务

Then：一成功一冲突，无静默覆盖



## T094 事件游标过期

模块：M19 · integration · P1

Given：客户端cursor落后保留期

When：重连订阅

Then：resync_required→snapshot，不伪接连续流



## T095 未知命令

模块：M19 · integration · P1

Given：请求executeSql/shell.any

When：调用入口

Then：404/403，不存在通用后门



## T096 nonce重放

模块：M20 · integration · P1

Given：已消费配对nonce

When：第二设备再消费

Then：拒绝，nonce只有一次



## T097 撤销在线设备

模块：M20 · integration · P1

Given：手机有SSE与session

When：本地撤销后继续写

Then：流关闭且403；已经提交动作不假撤销



## T098 Origin与CSRF

模块：M20 · integration · P1

Given：已登录手机浏览器

When：跨站伪造写请求

Then：Origin/CSRF拒绝



## T099 远端权限缩小

模块：M20 · integration · P0

Given：设备scope被移除

When：对旧project发命令

Then：403，缓存不能授予权限



## T100 Host睡眠/退出

模块：M20 · integration · P1

Given：有远端连接

When：Host休眠/退出

Then：显示离线/最后更新时间，不自动显示完成



## T101 离线不能审批

模块：M21 · e2e · P0

Given：已缓存审批页

When：断网点击批准

Then：仅提示离线，不加入后台重放队列



## T102 手机旧版本审批

模块：M21 · e2e · P0

Given：手机显示rev1

When：桌面改成rev2后批准

Then：409强制刷新，用户重新看差异



## T103 双设备争抢

模块：M21 · e2e · P1

Given：两个合法设备同approval

When：并发批准/拒绝

Then：一权威决定，另一显示已处理



## T104 小屏输入和方向

模块：M21 · e2e · P1

Given：390×844与横屏

When：输入中文长需求并旋转

Then：输入保存，44px目标和焦点可用



## T105 弱网重连

模块：M21 · e2e · P1

Given：断流/超时/重复返回

When：重连并发Start重试

Then：幂等不重复启动，snapshot权威



## T106 焦点与键盘

模块：M22 · e2e · P1

Given：打开Drawer/Dialog

When：Tab/ShiftTab/Esc/返回

Then：焦点不掉入底层，退出回触发器



## T107 颜色和对比

模块：M22 · e2e · P1

Given：亮暗主题

When：检查文本/错误/状态

Then：正文目标4.5:1，状态含文字非仅颜色



## T108 高DPI可用

模块：M22 · e2e · P1

Given：Win150%、MacRetina

When：比较关键页面

Then：无裁切和模糊可操作文本



## T109 长标题与中文

模块：M22 · e2e · P1

Given：120字标题/长路径

When：打开卡片详情和表单

Then：截断有完整访问方式，无按钮挤出



## T110 减少动画

模块：M22 · e2e · P1

Given：系统reduced-motion

When：切换运行状态/流程

Then：无强制循环动效，不影响状态理解



## T111 全新安装与卸载

模块：M23 · e2e · P1

Given：空用户配置

When：安装/启动/卸载

Then：向导可完成，保留数据政策明确



## T112 升级与回滚

模块：M23 · e2e · P1

Given：旧版本有任务

When：升级/中断/回滚

Then：迁移一致，旧版schema不兼容只读



## T113 凭据跨升级

模块：M23 · e2e · P0

Given：已保存合法Key

When：签名一致升级

Then：凭据可用且不暴露；失败有重新授权提示



## T114 运行中关闭和退出

模块：M23 · e2e · P1

Given：active Run

When：关窗口/真正退出

Then：托盘继续与取消退出行为明确一致



## T115 诊断包隐私

模块：M23 · e2e · P1

Given：有token日志与项目路径

When：导出诊断

Then：用户预览，默认脱敏，不含认证文件



## T116 公平基线

模块：M24 · integration · P1

Given：同任务同预算

When：比较单Agent与流程

Then：预算含全部角色，报告无选择性成功样本



## T117 隐藏验收隔离

模块：M24 · integration · P1

Given：测试有holdout答案

When：构造Agent上下文

Then：隐藏内容不可读取，泄漏检测失败阻发布



## T118 坏策略回滚

模块：M24 · integration · P1

Given：新Prompt增加误报

When：离线评测/灰度

Then：不推广或回滚到原hash，不修改旧Run



## T119 成本预算上限

模块：M24 · integration · P1

Given：工具循环持续

When：达到turn/time/token预算

Then：升级人类/停止，所有消耗计入



## T120 取消不算成功

模块：M24 · integration · P0

Given：用户取消或Host中断

When：汇总评测

Then：单列cancelled/interrupted，不能计pass

