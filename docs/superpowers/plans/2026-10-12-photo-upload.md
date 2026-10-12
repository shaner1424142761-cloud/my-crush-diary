# Private Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让两人直接上传照片、在私人照片墙查看，同时完整保留旧相册和其他恋爱记录。

**Architecture:** 新增独立的 SQLite `PhotoObject` 保存展示图，沿用现有 Worker 的登录令牌和精确 CORS 来源校验。浏览器压缩照片后按内容摘要幂等上传，日记只同步图片引用；前端通过认证请求读取图片并管理 Blob URL。旧 HTTP(S) 图片链接继续展示。

**Tech Stack:** 现有经典浏览器脚本、Canvas/createImageBitmap/Web Crypto、Cloudflare Worker/SQLite Durable Objects、Node 内置测试、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-12-photo-upload-design.md`（用户已确认压缩展示照片方案）。

**Prerequisite:** 先完成 `docs/superpowers/plans/2026-10-12-couple-accounts.md`。相册沿用 v2 带签名 sub 的 yyf/zxr 会话，生产配置使用 YYF_PASSWORD/ZXR_PASSWORD；本地登录使用两个模拟账号。Task 2 的 CD.onAuthChange 由双账号任务提供，只需接入照片取消与 URL 清理。双方均可上传/查看照片，分账号待同步相册元数据仍走现有缓冲保护。

## Global Constraints

- 现有 Cloudflare Free 账号；不新增付费订阅、R2、数据库账号或第三方图床。
- 首版应用级照片容量上限 `200 * 1024 * 1024` 字节；免费额度账号共享，超限拒绝新增，不删旧照片，不自动升级。
- 最长边不超过 1600 像素；JPEG 展示图单张不超过 `400 * 1024` 字节；一次最多选择 9 张。
- 接受浏览器可解码的 JPEG、PNG、WebP；不支持的 HEIC 等格式明确提示转换。展示图不代替原图档案。
- 原相册的链接、说明和时间，以及所有日记、积分、愿望、纪念日和未知远端顶层字段均保留；不裁剪旧数组。
- 上传和读取均需 Bearer 登录；无公共永久图片 URL；错误、日志、发布内容不包含令牌、真实凭据或私人图片。
- 首版没有删除照片或自动清理接口。上传成功但元数据失败的图片可能占用容量，明确提示并允许重试。
- 仅本地模拟调试；不读取、下载或写入真实照片，不推送、不部署。

## Review Focus

- 上传或读图期间退出、令牌过期或换会话：旧响应不能再显示私人图片、追加条目或改写备份；Task 2/3 覆盖。
- 图片上传成功但回复丢失、元数据保存失败：重试不重复占用容量、不重复添加相册条目，不误报全部保存成功；Task 1/3 覆盖。
- 两设备并发上传且接近容量上限：容量计数和图片存储必须一致，不能超额或挤掉旧图；Task 1/4 覆盖。
- 手机旋转照片、透明 PNG、解码失败及高度极端的图片：方向正确、背景合理、失败保留选择，尺寸及内存有边界；Task 2/4 覆盖。
- 含旧字段、旧链接及缺失年份的相册：新合并和渲染不能丢失原内容或伪造拍摄日期；Task 2/3/4 覆盖。

## File Structure

- `backend/photo-object.mjs`：照片请求、文件验证、容量和原子存储。
- `backend/worker.mjs`、`wrangler.jsonc`：认证路由、PHOTO_STORE binding、v2 SQLite 迁移。
- `shared/records.js`：兼容新条目 ID/照片引用的无损合并。
- `js/ui/auth.js`：会话变更订阅，供图片缓存和上传取消使用。
- `js/photos.js`：压缩、摘要、上传、认证取图、Blob URL 生命周期。
- `js/pages/album.js`：选图队列、说明、逐张结果、元数据重试；保留旧链接入口。
- `js/ui/render-album.js`、`css/album.css`、`album.html`：照片墙与可访问的大图浏览。
- `tests/photos-backend.test.mjs`、`tests/photos-client.test.cjs`、`tests/photo-records.test.cjs`：纯逻辑和真实接口回归。
- `tools/photo-runtime-smoke.cjs`：实际本地 Worker/SQLite + 浏览器上传验收。
- `tools/local-preview.cjs`、`tests/fixtures/local-worker.mjs`：模拟预览接入实际照片对象。
- `README.md`、`docs/deploy-cloudflare.md`：本地试用、容量和未来部署说明。

### Task 1: 私人照片存储和认证接口

**Files:** Create `backend/photo-object.mjs`, `tests/photos-backend.test.mjs`; modify `backend/worker.mjs`, `wrangler.jsonc`.

**Interfaces:**
- Produces `export class PhotoObject`，构造签名 `(ctx, env)`，入口 `fetch(request): Promise<Response>`。
- `PUT /photos/{photoId}`：photoId 是 JPEG 字节 SHA-256 的 64 位小写十六进制值；请求 `Content-Type: image/jpeg`，原始二进制请求体；成功 JSON `{photoId, bytes, usedBytes, limitBytes}`。相同内容重复上传返回同一结果，不增加计数。
- `GET /photos/{photoId}`：认证 JPEG 响应，`Content-Type: image/jpeg`、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`；未找到 404。
- `GET /photo-usage`：认证 JSON `{usedBytes, limitBytes}`；两端上限固定为 200 MiB，客户端不能指定。
- 错误 JSON `{message}`；非法图片/摘要 400、未认证 401、方法错误 405、超大 413、容量不足 409、存储失败 503。不开放 DELETE。
- Consumes existing `verifyToken(token, env)`、`HttpError/json` 和来源校验；照片对象再验证一次认证。

- [ ] 写失败测试：合法小 JPEG PUT→GET 字节相等；无认证/过期/错误来源访问不读照片存储；不存在返回 404。
- [ ] 写失败测试：错误 MIME、JPEG 文件头/结尾错误、无效 ID、摘要不匹配、空内容和超过 400 KiB 都不写存储；以流计数而非只相信 Content-Length。
- [ ] 写失败测试：重复 PUT、回复丢失重试不增加 usedBytes；并发接近 200 MiB 时至多一个请求成功，已有照片保留。
- [ ] 写失败测试：图片和 usedBytes 的存储事务失败时一起回滚，失败不能返回成功。使用可回滚的 fake storage 与真实 Request/Response。
- [ ] 运行 `node --test tests/photos-backend.test.mjs`，应因照片接口/类不存在失败。
- [ ] 实现 `PhotoObject.fetch`：完整读取与校验有大小及 10 秒截止边界；检查摘要和 JPEG magic，使用存储事务原子保存图片 ArrayBuffer 和用量；已有同 ID 必须核对长度和摘要一致。容量不足不清理旧图。
- [ ] 路由接入 PHOTO_STORE，固定对象名 `our-photos`；日记仍使用 `our-diary`。照片服务缺少 binding 返回 503，不破坏已存在日记接口。健康响应添加照片配置布尔值，不包含秘密。
- [ ] 在 `wrangler.jsonc` 追加 PHOTO_STORE 与 `{tag:'v2',new_sqlite_classes:['PhotoObject']}`，保留原 v1 和 DIARY_STORE。
- [ ] 运行新增测试及既有全套测试，预期全绿；运行 `node node_modules/wrangler/bin/wrangler.js deploy --dry-run`，预期两个 SQLite bindings，无部署。
- [ ] 提交 `Add authenticated bounded photo storage`。

### Task 2: 图片处理、会话生命周期与记录兼容

**Files:** Create `js/photos.js`, `tests/photos-client.test.cjs`, `tests/photo-records.test.cjs`; modify `js/ui/auth.js`, `shared/records.js`.

**Interfaces:**
- `CD.onAuthChange(listener): unsubscribe`；登录成功、退出、认证失效时同步通知 `{generation, locked}`；订阅异常不能中断登录或退出。沿用现有 generation，旧操作保护仍成立。
- `CD.preparePhoto(file): Promise<{blob, photoId, width, height}>`：输出 JPEG <=400 KiB、最长边<=1600，SHA-256 ID；文件大于 20 MiB 或解码后超过 40 百万像素拒绝；透明背景铺白。只按浏览器支持解码，失败给可理解的提示。
- `CD.uploadPhoto(prepared): Promise<{photoId, bytes, usedBytes, limitBytes}>`：认证 PUT，绑定开始时会话代次，20 秒请求超时；旧会话响应不能当成功。允许用同一 prepared 重试。
- `CD.getPhotoURL(photoId): Promise<string>`：认证 GET，校验 JPEG 类型/400 KiB上限；生成并缓存 Blob URL。同 ID 在途请求复用；并发读取最多 3 个；logout/换会话时中止并撤销缓存，不接纳旧响应。
- `CD.clearPhotoCache(): void`：中止在途、撤销所有 Blob URL，清空队列；重复调用安全。
- 新条目 `{id, photoId, url:'private-photo:'+photoId, caption, time}`；time 为上传时 ISO 时间，不称拍摄日期。旧条目保持原字段及原键；新条目按 id 去重，保留 photoId/id，不能让重试重复条目。

- [ ] 写失败测试：旧相册字段不变，新 photoId/id 经合并、规范化、备份和旧快照重试均保留；同图不同条目 ID 可同时存在。
- [ ] 写失败测试：文件类型、大小和像素限制；摘要以压缩后字节计算；质量步进无法满足 400 KiB 时明确失败。用可注入浏览器边界替身测试规则，真实编码由 Task 4 验证。
- [ ] 写失败测试：重复读图只发一次请求；错误 MIME/超大响应不生成 URL；缓存清理 revoke 全部 URL，旧 GET/PUT/解析响应在 logout 后不被接纳。
- [ ] 写失败测试：读取并发最多 3；清理后等待任务全部结束且不发送旧排队请求；新会话仍可重新取图。
- [ ] 运行 `node --test tests/photos-client.test.cjs tests/photo-records.test.cjs`，预期新函数/字段缺失失败。
- [ ] 实现 `js/photos.js` 和会话订阅；压缩质量从 .88 逐步降到 .5，必要时进一步缩小最长边，仍不能满足时拒绝，不上传 PNG/SVG/原图二进制。
- [ ] 调整相册合并：仅带新 id 的条目使用 ID 键；保留旧键算法和全部旧内容；明确保留新字段，不改变其他记录规则。
- [ ] 运行新增测试与既有全套测试，预期全绿；提交 `Add safe photo processing and session-aware loading`。

### Task 3: 上传流程、照片墙与大图浏览

**Files:** Modify `album.html`, `css/album.css`, `js/pages/album.js`, `js/ui/render-album.js`; extend `tests/photos-client.test.cjs`.

**Interfaces:**
- Consumes Task 2 的准备/上传/读图接口和现有 `CD.saveDataToCloud(): Promise<boolean>`。
- `CD.renderAlbum(): void`：渲染 HTTP(S) 旧图或 photoId 私人图，其他协议拒绝；说明用 textContent，懒加载图，旧响应不能填入已销毁卡片。
- `CD.openAlbumPhoto(index): void` / `CD.closeAlbumPhoto(): void`：大图、上一张/下一张、Esc、键盘方向键和关闭后焦点恢复；会话变化关闭大图。
- 上传队列项稳定保存 prepared、条目 ID、创建时间、caption 和阶段：处理中/上传中/待同步/完成/失败。重试仅补失败阶段；逐张上传和保存，不无限并发。

- [ ] 写失败测试：一次最多 9 张，单张失败保留其他预览；开始后禁用重复上传按钮；caption 有明确长度上限，不插入 HTML。
- [ ] 写失败测试：图片成功、元数据失败→保存一个待同步条目；重试只同步元数据，不重新占容量或创建新条目；失败状态不显示“全部已保存”。
- [ ] 写失败测试：退出发生于压缩/上传/保存任意阶段时，旧流程不追加条目、不改写新的登录状态；既有备份仍保留。
- [ ] 写失败测试：旧图和新图共同展示；没有完整日期的旧时间原样展示，大图说明不伪造年份，坏链有占位。
- [ ] 运行相关客户端测试，预期缺少 UI/阶段行为失败。
- [ ] 实现选图、逐张预览与说明、结果和重试；旧 `album-url`/`btn-add-album` 入口放在折叠区域，保留现有链接流程与事件 ID。
- [ ] 实现自然比例照片墙，手机两列、宽屏三列，相册专用宽度不改变其他页面；只为新图显示上传日期，旧时间原样显示。
- [ ] 实现大图浏览、焦点和退出清理；图片 Blob URL 不写 localStorage、不同步到 JSONBin。
- [ ] 运行全套测试，预期全绿；提交 `Build private photo upload flow and photo wall`。

### Task 4: 实际本地上传验收与交接

**Files:** Create `tools/photo-runtime-smoke.cjs`; modify `tools/local-preview.cjs`, `tests/fixtures/local-worker.mjs`, `package.json`, `README.md`, `docs/deploy-cloudflare.md`.

**Interfaces:**
- 本地 fixture 导出真实 PhotoObject；local-preview 新增 PHOTO_STORE binding/v2 migration，仍只使用假日记和独立本地状态，不能请求正式服务。
- `node tools/photo-runtime-smoke.cjs`：启动独立端口 8767/8879 的模拟预览，退出时关闭服务和浏览器；用 PLAYWRIGHT_MODULE 引入本机浏览器库。
- `test:photos` package script 调用上述验收；`dev:local` 保留原 URL 8765。

- [ ] 写实际浏览器验收：在浏览器 Canvas 生成横图、竖图、透明 PNG、超高图片及坏文件；选择照片并上传，读取后端 JPEG 检查像素尺寸与容量，不使用用户真实照片。
- [ ] 写实际 SQLite 验收：重复与并发上传、两个登录浏览器互看、拒绝匿名读图、待同步元数据重试不重复条目；测试环境可通过 fixture 注入失败，生产对象无故障开关。
- [ ] 写浏览器验收：400KiB边界、9张选择、移动端照片墙和大图键盘操作、旧链接可见、退出时不残留私人图；收集 pageerror，应为空。
- [ ] 先运行验收，预期当前本地 preview 缺少 photo binding/上传 UI 而失败。
- [ ] 接入本地模拟配置和说明；运行 `node tools/photo-runtime-smoke.cjs` 预期通过；检查桌面/手机截图，确认无挤压、裁切或遮挡。
- [ ] 运行既有全套测试、原 runtime-smoke、browser-smoke、新 photo-runtime-smoke、发布扫描、部署 dry-run；真实日记备份只做离线核对，预期全部通过。
- [ ] 更新教程：照片容量、压缩与原图区别、孤立上传可能占容量、缺少 binding 和免费额度失败处理；部署步骤保留“本地确认后再上线”。
- [ ] 提交 `Verify local photo uploads and document deployment`。
- [ ] 按直接实施流程做一次独立全分支审查，修复重要问题后重新运行相应回归与全套测试；不把本地验收表述为已上线。
- [ ] 向用户打开本地照片墙试用；保留原记录，不推送或部署。

## Self-review

Spec coverage：上传、压缩、容量、私人读取、旧相册保留、重试、照片墙、大图、本地先行均有对应任务。接口一致：PhotoObject/PHOTO_STORE、photoId、private-photo 引用和客户端接口名称前后一致。新增字段已列入合并任务，避免被现有白名单合并丢掉。读图与上传失效操作都绑定现有登录代次。没有付费开通步骤、删除接口或未定占位值。

## Execution Handoff

用户新增的双账号设计已确认；相册工作保留，先执行双账号实施计划，随后按上述 Prerequisite 使用新的身份和缓冲接口继续本计划，不再按旧共同密码接口实现。

沿用用户此前选择的直接实施：当前会话逐项实现，最后一次独立审查；不再询问执行方式。用户确认本计划后才开始实现。
