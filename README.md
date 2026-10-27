# YYF 和 ZXR 的恋爱日记

## 两人日程

侧栏「两人日程」可查看每周固定安排、单次安排及 DDL。按 YYF、ZXR 或共同安排区分颜色，支持筛选、切换周和跳转日期。电脑按时间轴展示，手机按天排列；时间统一为新加坡时间（UTC+8）。

固定安排可以选择生效日期、每周哪几天与可选结束日期；点击某一次可单独改期或取消，也可编辑或删除整个安排。DDL 支持标记完成和恢复未完成，近期未完成项显示倒计时或逾期状态。没有站外通知。两人均可维护日程，离线更改保留在各自账号的本机备份，恢复联网后点「同步」重试。

本地验收运行 `node tools/schedule-runtime-smoke.cjs`（Chrome + Playwright，可用 `PLAYWRIGHT_MODULE` 指定路径）。它使用模拟 Worker 数据，不访问真实日程；验证重复、跨周改期、取消一次、DDL 完成、双账号同步、离线重试和手机布局。上线须同时更新静态网站与 Worker 的共享数据规则。

保留原 GitHub Pages 地址和 JSONBin 记录，增加免费 Cloudflare Worker 后端与YYF/ZXR 双账号登录。

- 删除标记阻止旧缓存恢复已删愿望和纪念日。
- 分数由去重后的历史计算，保留迁移前的历史差额，扣分不会被旧分数覆盖。
- 后端串行执行读、合并、写；保留未知云端字段和所有旧记录。
- 前端仅保存登录令牌，云端写入密钥通过 Worker Secrets 配置。
- 离线操作先写本机备份，失败时不会用旧快照覆盖云端。

**当前状态：本地实现完成；正式后端配置、网站切换及旧密钥轮换待部署。**

详见[免费部署教程](docs/deploy-cloudflare.md)。不要创建空 Bin 或清除网站数据。

## 验证

需要 Node.js 22 或以上；后端开发还需安装依赖。

```powershell
npm install
npm test
npm run check:public
npm run check:backend
```

自动测试只使用模拟记录，不读取或写入真实云端。浏览器验收可安装 Playwright 后运行 `node tools/browser-smoke.cjs`（需要 Chrome），或通过 `PLAYWRIGHT_MODULE` 指定已有 Playwright 路径。

本地静态预览可运行 `python -m http.server 8000`；生产连接配置未填写前，登录页会提示先完成服务配置。本地后端使用假的测试凭据，运行 `npm run dev:backend`。

公开 Git 历史曾包含旧密钥，必须在 JSONBin 原账号轮换。只移除当前代码中的密钥尚不能让历史泄露失效。

## 本地模拟调试

运行 `npm run dev:local`（这台电脑也可直接运行 `node tools/local-preview.cjs`），打开 `http://127.0.0.1:8765`。YYF 测试密码为 `local-yyf-password-123`，ZXR 为 `local-zxr-password-123`。页面有明确的本地模拟提示，使用实际 Worker/SQLite 运行环境，所有 JSONBin 请求均被本地模拟适配器处理，完全不接触真实记录。每次启动是新的模拟数据；这些测试内容不会上线。按 Ctrl+C 停止。

完整运行环境验收：`npm run test:runtime`，需要 Chrome 和 Playwright；可用 `PLAYWRIGHT_MODULE` 指定本机已有 Playwright。生产配置不受本地预览影响。

YYF 只能给 ZXR 打分，ZXR 只能给 YYF 打分。新悄悄话显示真实作者，旧留言保持未署名。未同步备份按账号隔离，旧 v1 备份始终保留，可在核对面板勾选恢复。

## 私人照片相册

现在支持选择 JPEG / PNG / WebP 直接上传，一次最多9张。浏览器先压缩成最长边1600像素、最多400KiB的JPEG展示照片，原图请另存。两人登录后都可上传和查看；旧图片链接、说明与时间保留。手机两列、桌面三列，点击进入大图，支持方向键和Esc。

首版容量为200MiB，存于SQLite Durable Object，不使用R2或新增付费服务。图片上传后相册记录仍须同步；失败可用同一队列重试。已上传图片没有删除接口，孤立上传也占容量；免费额度或容量耗尽会明确失败。`npm run test:photos` 使用合成图片和实际本地Worker/SQLite进行验收，不读取真实照片。
