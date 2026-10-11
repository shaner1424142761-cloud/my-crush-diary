# Private Sync Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 免费地保护云端密钥，并让两个人安全保存现有恋爱记录。

**Architecture:** GitHub Pages 保留前端和网址，Cloudflare Worker 验证登录令牌。
一个 SQLite-backed Durable Object 串行处理现有 JSONBin 的读改写。
浏览器与后端使用同一份纯数据合并逻辑，保留积分差额、删除标记和旧记录。

**Tech Stack:** 现有 HTML/CSS/JavaScript，Cloudflare Workers Free、SQLite-backed Durable Objects、Web Crypto、Node.js 内置测试工具、Wrangler。

**Spec:** `docs/superpowers/specs/2026-10-11-private-sync-design.md`

## Global Constraints

- 继续使用现有 GitHub Pages 网站地址，保留两个人此前的全部记录。
- 不购买付费套餐、不增加新服务费用。
- 使用一个 SQLite-backed Durable Object 协调读写。
- 继续将现有 JSONBin Bin 作为记录的主存储，不创建空 Bin 替换原记录。
- 默认令牌存在 sessionStorage，勾选记住时使用 localStorage，期限为 7 天。
- Worker Secrets 存储登录密码、会话签名密钥、JSONBin 连接密钥。
- Durable Object 持久化少量限速计数和最近 3 份保存前快照。
- 客户端不再使用 `X-Master-Key` 或 `X-Access-Key` 直接访问 JSONBin。
- 使用正式快照进行完全离线迁移核对，不运行真实 PUT 来测试修复。
- 不通过开启付费套餐解决性能问题。
- 部署与密钥更换需要用户登录和授权；秘密不发到聊天里。

## Review Focus

- 云端出现未来新增字段：上传必须保留已存在的未知顶层字段，不能因规范化而丢弃。
- 有效签名但已过期、损坏或超长的令牌：返回 401，不读取 JSONBin。
- 上游 PUT 成功但响应丢失：再次保存必须幂等，不重复计分或复活删除记录。
- 浏览器不能写入存储或登录令牌过期：显示明确状态，保留待同步内容，不误报已保存。
- 切换部署时仍有旧页面和未同步记录：先核对备份和新后端，再轮换旧密钥，不能提前中断旧连接。

## File Structure

- `shared/records.js`：无 DOM、网络或存储依赖的合并规则和数据规范化。
- `js/merge.js`：浏览器适配层，保留记录 ID 生成和删除操作。
- `backend/auth.mjs`：密码验证与签名令牌，不访问恋爱记录。
- `backend/diary-object.mjs`：串行 JSONBin 保存、快照、限速计数。
- `backend/worker.mjs`：HTTP 路由、CORS、鉴权、请求验证与响应。
- `js/ui/auth.js`：登录、记住设备、退出和请求认证。
- `js/api.js`：经过后端的读写、备份、失败状态和合并后的渲染。
- `js/config.js`：只有公开的后端地址；移除云端写入密钥。
- `css/auth.css` 与全部 6 个 HTML 页面：接入登录界面和共享脚本。
- `wrangler.jsonc` 与 `package.json`：Free 可用的 Worker/SQLite DO 配置、本地验证和部署命令。
- `.dev.vars.example`：只含占位值的本地配置示例；真实 `.dev.vars` 已被忽略。
- `tests/*.test.cjs` / `tests/*.test.mjs`：共享数据、接口、并发和登录测试。
- `tools/audit-snapshot.cjs`：本机快照的离线核对，不获取或上传私人数据。
- `tools/verify-public-files.cjs`：检查发布文件不含存储密钥或私人快照。
- `docs/deploy-cloudflare.md`：用户可跟随的中文部署、验收、轮换和回退教程。

### Task 1: 共享合并规则与无损迁移

**Files:** Create `shared/records.js`, `tests/records.test.cjs`, `tools/audit-snapshot.cjs`; modify `js/merge.js`, all 6 HTML script chains, `tests/sync.test.cjs`.

**Interfaces:**
- Produces `globalThis.CrushDiaryRecords.createRecordTools(limits?)`，返回 `{ mergeRecords(remote, local), normalizeFetched(record), keys }`。
- `mergeRecords(remote, local)` 返回完整记录，远端未知顶层字段保留；已知数组按现有规则合并，不能截断条数。
- 浏览器 `CD.mergeRecords`、`CD.normalizeFetched`、`CD.keys` 接口不变。
- `node tools/audit-snapshot.cjs <snapshot.json>` 返回 0 表示所有原内容和总分保留；失败返回非 0。

- [ ] 写失败测试：`shared rules preserve future cloud fields`，远端 `{ futureSection: { note: 'keep' } }` 合并后该对象仍等于原值。
- [ ] 写共享工具的迁移测试，复用现有积分、删除、去重、超限保存断言；脚本在无 `window` 的环境中也能运行。
- [ ] 运行 `node --test`，确认新增测试因共享接口尚不存在而失败。
- [ ] 将纯数据函数迁入 `shared/records.js`，提供上述工厂；保持浏览器适配层中的删除和本机备份副作用。
- [ ] 在全部 6 页的 `js/merge.js` 之前加载共享脚本，不改成导致原有脚本链时序变化的 module 页面入口。
- [ ] 实现快照核对工具，接受保存的 JSONBin 响应或直接记录；输出条目数与是否完整，不输出正文或密钥。
- [ ] 运行 `node --test` 和离线真实快照核对；必须保持全部 7 类记录、原内容、两人总分一致。
- [ ] 提交：`git commit -m "Extract shared lossless record merge rules"`。

### Task 2: 登录保护与串行保存后端

**Files:** Create `backend/auth.mjs`, `backend/diary-object.mjs`, `backend/worker.mjs`, `tests/backend.test.mjs`, `wrangler.jsonc`, `package.json`, lockfile, `.dev.vars.example`.

**Interfaces:**
- Consumes Task 1 的共享数据工具；Worker 模块通过静态 import 加载共享脚本，不能动态 eval。
- `issueToken(env, nowSeconds)` 返回 `{ token, expiresAt }`；`verifyToken(token, env, nowSeconds)` 返回 boolean。
- Secrets：`DIARY_PASSWORD`（至少 16 字符）、`SESSION_SECRET`（至少 32 字符）、`JSONBIN_KEY`。
- 非秘密配置：`JSONBIN_BIN_ID`、`JSONBIN_KEY_HEADER`（默认 `X-Master-Key`，可选 `X-Access-Key`）、`ALLOWED_ORIGINS`。
- `DiaryObject` 是可由 Worker 导出的 Durable Object 类，构造参数为 `(ctx, env)`；外部网络依赖在测试中注入，不开放用户可修改的上游 URL。
- `POST /auth/login` 接受 `{ password }`；成功 200 `{ token, expiresAt }`，错误 401，15 分钟内同 IP 超过 5 次尝试返回 429。
- `GET /diary` 成功 200 `{ record }`；`PUT /diary` 接受完整记录，成功返回 200 `{ record }`，内容为服务器最终合并结果。
- `GET /health` 只返回 `{ configured: boolean }`；未配置后端其他接口返回 503。
- 无效认证 401；非允许 origin 403；错误输入 400；上游错误 502；请求过大 413；未知路由 404。
- POST/PUT JSON 最大 1 MiB；上游单次请求 10 秒超时；7 天登录有效期；响应 `Cache-Control: no-store`。
- 所有读写路由通过同一个固定命名 DO；它覆盖整个上游网络读改写的串行区间。
- SQLite 存储最近 3 份保存前快照和带到期时间的限速计数；限速键使用 IP 哈希并清理到期项。

- [ ] 写失败测试：缺失、损坏、超长、已过期的令牌均返回 401，并且没有上游请求；健康检查不返回任何秘密。
- [ ] 写失败测试：同 IP 前 5 次错误密码为 401，第 6 次 429，15 分钟后可再尝试；重建 DO 实例后计数仍生效。
- [ ] 写失败测试：合法登录的令牌 7 天后失效；签名被修改无法验证；密码和密钥不出现在响应体。
- [ ] 写失败测试：GET 不执行 PUT；两个并行保存最后同时保留加分、扣分、留言和删除标记；同请求重试不重复计分。
- [ ] 写失败测试：拉取失败、格式错误、PUT 失败均不能显示成功；保留保存前快照，快照数量最多 3；响应丢失后的重试幂等。
- [ ] 写失败测试：CORS preflight 正确；任意 origin 不能借健康检查获得私密数据；未知路由、超大 JSON、非法字段均失败。
- [ ] 运行 `node --test`，确认新增后端测试失败。
- [ ] 实现 HMAC-SHA256 签名令牌，严格验证格式、签名、过期时间；使用固定长度摘要比较密码，拒绝缺少 Secret 的配置。
- [ ] 实现持久化限速与串行保存。上游 URL 固定为 JSONBin；写入带 `X-Bin-Versioning: true`，保留未知远端字段。
- [ ] 实现路由、鉴权、输入验证、超时和脱敏错误；日志不记录密码、令牌、连接密钥或记录正文。
- [ ] 配置 `new_sqlite_classes` 类型迁移和 DO binding；只添加 Wrangler 开发依赖，不启用付费功能或定时任务。
- [ ] 运行 `node --test`、`npx wrangler deploy --dry-run`，以及本地 `wrangler dev --local` 的健康和错误认证请求；不得连接正式 Bin 进行写入测试。
- [ ] 提交：`git commit -m "Add authenticated free Worker sync backend"`。

### Task 3: 前端登录和安全连接

**Files:** Create `js/ui/auth.js`, `css/auth.css`, `tests/auth-ui.test.cjs`; modify `js/config.js`, `js/constants.js`, `js/api.js`, all 6 HTML files, navigation logout entry.

**Interfaces:**
- Consumes `POST /auth/login`、`GET /diary`、`PUT /diary` 和 Task 1 的共享合并工具。
- `CD.API_BASE_URL` 是唯一公开连接配置，初始为空；不保留直连 JSONBin 或硬编码密钥的自动回退。
- `CD.ensureAuthenticated()` 返回 Promise；已登录可继续，未登录显示登录界面并等待登录完成。
- `CD.authenticatedFetch(path, options?)` 向配置后端发送 Bearer 令牌；401 时保留本机数据并重新登录，不能回退到匿名写入。
- `CD.logout()` 移除两种存储中的令牌、隐藏当前记录并显示登录界面，不删除云端或本机备份。
- 后端响应最终 `record` 与本机待同步记录合并；只有成功的后端响应才能显示“数据已保存”。

- [ ] 写失败测试：无令牌时不读取云端、不显示原记录；登录成功后才显示记录；退出不调用云端 DELETE/PUT。
- [ ] 写失败测试：默认只保存在 sessionStorage，记住设备时只保存在 localStorage；密码从不进入存储。
- [ ] 写失败测试：令牌过期或存储不可用时给出可恢复的状态，未同步记录完整保留；配置为空时不发送网络请求。
- [ ] 修改现有同步测试，让上游替身使用后端接口契约，保持原来全部数据修复断言。
- [ ] 运行 `node --test`，确认新前端行为失败。
- [ ] 实现登录界面，匹配现有颜色、字号和移动端宽度，提供密码、记住设备、登录和错误状态，不暴露云端密钥设置到日常流程。
- [ ] 在现有加载入口等待 `ensureAuthenticated()`；登录过期后冻结写操作，恢复登录后重新拉取再合并。
- [ ] 改写 API 调用为后端接口；移除公开配置中的 Bin 写入密钥和 JSONBin 请求头；保留原备份键以接续未同步记录。
- [ ] 给全部页面接入共享登录脚本和退出入口；更新配置提示与测试。
- [ ] 运行 `node --test`；在本地浏览器逐页验收登录、记住、退出、断网恢复和移动端。使用模拟后端数据，真实写入保持关闭。
- [ ] 提交：`git commit -m "Connect diary pages through authenticated backend"`。

### Task 4: 部署教程、发布检查与用户交接

**Files:** Create `tools/verify-public-files.cjs`, `tests/public-files.test.cjs`, `docs/deploy-cloudflare.md`; update `README.md` 与实施状态。

**Interfaces:**
- `node tools/verify-public-files.cjs` 检查浏览器发布文件，发现密钥格式、私人快照或直接存储认证配置时返回非 0。
- 中文教程以实际命令和设置字段为准，包含 Cloudflare Free、workers.dev、Secrets、测试、GitHub Pages 配置与 JSONBin 旧密钥轮换。
- 不把 `.dev.vars`、私人备份、日志或有效密钥提交到 GitHub。历史提交中的旧密钥依靠轮换失效，不进行未经授权的历史重写。

- [ ] 写失败测试：临时发布目录包含伪造密钥或私人快照时扫描失败，正常 HTML/CSS/JS 发布集合通过。
- [ ] 运行 `node --test`，确认发布扫描测试因工具不存在而失败。
- [ ] 实现发布检查工具，并将测试、后端 dry-run、发布检查命令加入 package scripts。
- [ ] 编写中文教程：用户已登录 Cloudflare；下一步授权 Wrangler 或使用控制台，保持 Free，配置 Secrets 后才部署。密钥通过本机或服务控制台输入，不要求发到聊天里。
- [ ] 教程明确先核对正式云端只读快照，再用模拟环境测试写入，最后切前端、轮换旧密钥、验证两人的设备。
- [ ] 写明未同步记录保护、免费额度失败处理、JSONBin 原有限制和不覆盖云端的回退步骤。
- [ ] 运行 `node --test`、后端 dry-run、发布检查、真实快照离线核对，检查 Git 状态不含任何秘密和私人数据。
- [ ] 完成一次独立分支审查并处理问题；不得把“代码通过”报告成“线上已经更新”。
- [ ] 提交：`git commit -m "Document free deployment and verify public files"`。
- [ ] 向用户展示本地可审阅结果，明确待用户操作项；获得具体部署授权后，再发布后端和前端并完成只读线上验收。

## Execution Handoff

推荐 Native：由当前会话直接逐项实施，完成后做一次独立审查，避免每个任务都启动新代理增加额度消耗。
用户确认本计划并选择执行方式前，不进入后端实现或部署。
