# Couple Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YYF/ZXR 独立登录，后端限制只能给对方打分，新悄悄话带可信作者，换账号不丢待同步内容。

**Architecture:** 固定两个账号、两份密码 Secret，升级 HMAC 会话为带 sub 的 v2。服务器在串行读改写内检查新增事件权限并确认作者，原历史保持不可变；前端使用分账号备份和内存缓冲。接续已确认的私人照片方案，先本地调试，不上线。

**Tech Stack:** 现有浏览器经典脚本、Worker/Web Crypto、SQLite Durable Object、Node 内置测试、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-12-couple-accounts-design.md`（用户已确认）。

## Global Constraints

- 固定账号 yyf/zxr，显示 YYF/ZXR；不新增公开注册、邮箱服务、认证订阅或付费产品。
- YYF 只能新增 `myHistory` 的记分事件；ZXR 只能新增 `taHistory` 的记分事件。双方可查看完整历史。
- YYF_PASSWORD/ZXR_PASSWORD 至少 16 字符且不同；SESSION_SECRET 至少 32 字符；正式密码只在本机/控制台输入。
- 会话 7 天，默认 sessionStorage，记住设备使用 localStorage；密码不存储。旧 v1 令牌失效，不能匿名回退。
- 新作者来自签名 sub；现有作者不可修改；无作者的原留言显示“历史留言 · 未标注作者”。
- 原记录、积分差额、未知远端字段完整保留；不清理旧 `myCrushDiary_backup_v1`；换账号不能改署名或覆盖未同步记录。
- 相册/日记/愿望/纪念日仍共同使用；照片接口接受同一 v2 登录身份，双方均可查看。
- 仅本地假数据验收，真实备份只离线核对；不推送、不部署。

## Review Focus

- 伪造作者、复用旧事件 ID 或直接修改总分/差额：后端不能允许越权或改变原历史；Task 1/2 测试。
- 两人同一分钟发送相同文本：两条有独立 ID 的新留言都保留，旧留言不能全部复制；Task 2/3 测试。
- 一方有未同步内容时退出，存储写入失败，另一方登录：内容留在原账号缓冲，不能串号；Task 3/4 测试。
- v1 会话、恶意本机 user 字段或延迟旧 401：必须确认服务端身份，旧响应不能清除新会话；Task 1/3 测试。
- 旧本机独有、未署名的内容：不静默认领，不清空；恢复时按打分目标核对权限，留言保留未标注作者；Task 2/3/4 测试。

## File Structure

- `backend/auth.mjs`：固定账号、密码校验、v2 令牌和签名身份读取。
- `backend/permissions.mjs`：远端基准、增量事件权限、可信作者、不可变历史和旧内容恢复规则。
- `backend/worker.mjs`、`backend/diary-object.mjs`：登录/me 路由及串行权限检查。
- `shared/records.js`：新留言稳定 ID、作者和历史字段的保留。
- `js/store.js`、`js/api.js`、`js/ui/auth.js`：身份确认、分账号备份、缓冲、迁移提示和会话变更订阅。
- 首页与留言页面/渲染器：对应打分控件、作者显示与导出。
- 新鉴权/权限/账号 UI 测试、现有回归、实际 SQLite/双浏览器验收。
- 本地 fixture、预览、示例配置和教程：两个模拟账号，生产 Secrets 说明。

### Task 1: v2 签名身份与独立登录

**Files:** Modify `backend/auth.mjs`, `backend/worker.mjs`, `backend/diary-object.mjs`; create `tests/accounts-auth.test.mjs`; update existing backend fixtures/tests.

**Interfaces:**
- `passwordMatches(password, env, userId): Promise<boolean>`；只有 yyf/zxr 可选，未知账号与错误密码均为 401，不泄露匹配细节。
- `issueToken(env, userId, nowSeconds?): Promise<{token,expiresAt,user:{id,name}}>`；payload 为 v2、sub、exp、nonce。
- `readSession(token, env, nowSeconds?): Promise<{id,name}|null>`；严格校验身份、签名、长度、7天过期边界；`verifyToken(...)` 保留为返回 boolean 的适配接口。
- `POST /auth/login` 请求 `{username,password}`，成功返回上述令牌结构；`GET /auth/me` 用 Bearer 返回 `{user:{id,name}}`。两处均 no-store。
- `configured(env)` 使用两份独立密码及现有连接配置，拒绝相同密码；登录持久化 IP 限速继续有效，账号切换不能绕过。

- [ ] 写失败测试：两账号各自密码登录，错账号/错密码统一失败；有效 v2 得到准确身份；v1、篡改 sub、未知 sub、过期与超长 token 全部拒绝。
- [ ] 写失败测试：me 未认证时不访问 JSONBin；登录不同账号仍共享同 IP 5 次/15分钟限速；缺少密码或两密码相同则 configured=false。
- [ ] 运行 `node --test tests/accounts-auth.test.mjs`，预期因 v2/独立账号不存在失败。
- [ ] 实现鉴权接口和路由；服务端身份必须从 readSession 读取，不能读取客户端声明的 actor/header。
- [ ] 更新假测试 env 和签发调用，运行既有及新增测试，预期全绿；提交 `Add YYF and ZXR signed account sessions`。

### Task 2: 后端记分权限、可信作者与不可变历史

**Files:** Create `backend/permissions.mjs`, `tests/accounts-permissions.test.mjs`; modify `backend/diary-object.mjs`, `shared/records.js`.

**Interfaces:**
- `authorizeChanges(remote, local, userId): normalizedLocal`：检查两份历史与留言的稳定键；已存在记录不可更改，缺失记录仅视为旧快照，不视为删除。新增记分目标不匹配返回 403；复用 ID 修改内容返回 409；新增声明为另一账号的 authorId 返回 403。
- 新事件字段 `id/authorId`；标准 PUT 对新增合法历史和留言以签名 userId 确认作者。新留言必须有 ID；作者不能从客户端任意字符串获得。
- `messageKey`：有新 id 时按 id，否则保留原 time|text 键；合并保留 authorId/id 及原正文/时间；既有无作者内容不补作者。
- 总分及 scoreBaseline 来自可信远端推导和授权历史，忽略客户端提交的标量和差额，不能用空远端绕过。先把远端规范成带可信基准，再合并授权 local。
- `POST /legacy-import`：显式恢复请求 `{target:'ta'|'my',history:[],messages:[]}`；只允许账号对应目标的历史，留言作为未署名历史恢复；记录 importedBy 而非伪造历史作者。稳定导入 ID 来自旧键，重复恢复幂等。标准 PUT 不接受无 ID 的新留言来偷偷冒用恢复流程。

- [ ] 写失败测试：YYF→my、ZXR→ta 合法；反向 403 且上游 PUT=0；伪造 authorId、修改旧事件 ID、篡改 totals/baseline 都不能更改历史或总分。
- [ ] 写失败测试：带另一方原历史的正常旧快照仍可同步；两人同文本同时间但不同 ID 留言各保留一次；无作者旧留言深相等。
- [ ] 写失败测试：当前账号不能同步另一方本机独有待同步事件，明确失败且不改署名；合法增量并发/重试计分一次。
- [ ] 写失败测试：显式恢复旧留言保留未署名；恢复记分只允许对应目标；重复导入不重复条目，总分与远端差额保留。
- [ ] 运行权限测试，预期无权限类/作者保留而失败。
- [ ] 在完整串行 GET/authorize/merge/snapshot/PUT 内实施规则，403/409/异常不写云端；恢复也走同一个串行对象，不建立另一个竞态路径。
- [ ] 运行全套测试和真实备份离线核对，预期原记录及总分完整；提交 `Enforce scoring permissions and trusted message authors`。

### Task 3: 双账号 UI、分账号备份与恢复

**Files:** Modify `js/ui/auth.js`, `js/store.js`, `js/api.js`, `js/constants.js`, `js/pages/home.js`, `js/ui/render-home.js`, `js/pages/messages.js`, `js/ui/render-messages.js`, `js/ui/side-menu.js`, `css/auth.css`, `css/messages.css`, `index.html`; create `tests/accounts-ui.test.cjs`.

**Interfaces:**
- `CD.login(username,password,remember): Promise<boolean>`，登录选择 YYF/ZXR；CD.auth.user 为服务端确认的 `{id,name}`。从存储恢复的身份先调用 me 确认，不能把本机 user 字段当服务端权限。
- `CD.onAuthChange(listener): unsubscribe` 通知 `{generation,locked,user}`；供账户缓冲和后续照片清理使用，订阅异常不影响登录。
- 活动备份键 `myCrushDiary_backup_v2_yyf` / `myCrushDiary_backup_v2_zxr`；内存缓冲也按这两个 ID 保存。保存 API 绑定开始身份/代次，旧响应不能写新的备份键。
- `CD.activateUser(user): void`：切换前保存上一账号缓冲，再载入目标账号缓冲；不把上一账号内容合并进下一账号待同步数据。退出隐藏记录、保留原缓冲，存储失败继续提示勿刷新。
- `CD.inspectLegacyBackup(remote)` 返回旧备份的独有内容计数及对应目标；展示可核对的恢复列表，用户明确选择对应目标历史/未署名留言后调用 legacy-import。原备份始终保留，不自动上传或认领。
- 前端更新打分目标校验与控件禁用；新历史/留言带稳定 ID 和当前 authorId。旧作者标签固定“历史留言 · 未标注作者”，作者 UI 和导出使用 textContent/文本。

- [ ] 写失败测试：YYF/ZXR 正确启用对应控件；伪造本机 user 字段不能跳过 me 确认；错密码保持登录门禁。
- [ ] 写失败测试：两账号离线待同步内容独立，换账号不丢、不改署名；blocked localStorage 与过期重登保留正确内存；旧读取/保存/401 不能改新账号数据。
- [ ] 写失败测试：新留言显示/导出真实作者；旧留言正文时间和无作者状态不变；旧备份未删除、未自动认领，明确恢复后幂等。
- [ ] 运行新 UI 测试，预期缺少账户控件和分账号缓冲而失败。
- [ ] 实现登录选择、当前账号展示、会话通知和缓冲；只有 me/登录成功确认身份后才激活并解锁记录。
- [ ] 实现对应打分控件、消息作者及导出、旧备份核对恢复面板；保留所有既有同步失败保护和旧备份。
- [ ] 运行全套测试，预期全绿；提交 `Add account-aware controls messages and pending backups`。

### Task 4: 双浏览器实际权限验收和相册依赖更新

**Files:** Create `tools/accounts-runtime-smoke.cjs`; update `tools/local-preview.cjs`, `tools/runtime-smoke.cjs`, `tools/browser-smoke.cjs`, `tests/fixtures/local-worker.mjs`, `.dev.vars.example`, `README.md`, `docs/deploy-cloudflare.md`, `package.json` and photo plan.

**Interfaces:**
- 模拟账号 yyf 密码 `local-yyf-password-123`、zxr 密码 `local-zxr-password-123`，仅用于本地 fixture；生产示例只用占位值。
- `node tools/accounts-runtime-smoke.cjs` 在独立端口 8768/8880 启动预览，使用实际 Worker/SQLite 和两个独立浏览器会话，关闭时停止服务。
- 相册计划改用 v2 token、独立模拟账号和现成 onAuthChange；照片不另开注册或改密码规则。

- [ ] 写实际浏览器/HTTP 验收：YYF 给 ZXR 扣分、ZXR 给 YYF 加分；两方越权直接请求都 403 且云端不变；同时发同文字显示两位作者。
- [ ] 写实际验收：旧留言仍显示未标注；网络失败后换号/重登各自待同步记录保留；恢复旧内容不猜作者、不重复历史。
- [ ] 先运行验收，预期本地 fixture 仍只支持共同密码而失败。
- [ ] 更新本地 preview/模拟脚本和教程，逐页验证六页面访问与退出；生产配置不填写真实密码，旧 DIARY_PASSWORD 不再作为认证回退。
- [ ] 运行全套测试、新账户运行环境验收、原 browser/runtime 验收、发布扫描、部署 dry-run 和私人备份离线核对，预期全通过。
- [ ] 提交 `Verify local couple accounts and update photo dependencies`。
- [ ] 直接实施流程最后做一次独立审查；重要问题以失败回归测试修复后再跑全套；打开本地预览供用户用两个账号试用，继续相册计划，不部署。

## Self-review

每项设计都有任务：固定身份、令牌/限速、对应打分、可信作者、旧记录不变、分账号存储、旧备份恢复、实际本地验收。后端新接口、前端登录签名和相册依赖前后一致。旧无作者内容与新作者区分，原备份不自动归属。没有真实密钥、付费开通或未经确认的线上写入步骤。

## Execution Handoff

沿用此前选择的直接实施，不再询问执行方式。用户确认这份双账号计划与已更新的相册依赖后，依次完成双账号和照片上传；验证两阶段本地效果之后再安排上线。
