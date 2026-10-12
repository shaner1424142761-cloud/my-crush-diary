# 免费部署：保留现在的网站和全部记录

本地实现已经完成，线上网站尚未更新。原 GitHub Pages 地址和 JSONBin Bin 都继续使用；不要创建一个空 Bin 替代旧 Bin，不要清理浏览器数据。

## 先保护现有记录

两人先在旧页面完成各自尚未同步的操作，然后暂停使用旧页面。保留各设备的 `myCrushDiary_backup_v1` 本机备份，不要点击浏览器“清除网站数据”。旧客户端没有新合并规则，迁移后必须关闭旧标签页再刷新。

已有云端只读快照保存在本机仓库之外，离线检查确认 343 条记录和原总分均保留。正式切换前再核对最新只读快照；测试写入只使用模拟记录。私人快照、日志、`.dev.vars` 都不能上传到 GitHub。

## 1. 授权本机部署工具

你已经登录 Cloudflare 网页，下一步是允许本机 Wrangler 使用这个账号。在项目目录打开终端：

```powershell
npm install
npx wrangler login
```

浏览器会打开 Cloudflare 授权页，核对账号后点击 Allow。保持 Workers **Free**，不用绑定域名，也不用升级付费套餐。首次可能需要选择免费的 `workers.dev` 子域名。

这台电脑已用 pnpm 安装依赖；可以直接运行 `node node_modules/wrangler/bin/wrangler.js login`，后面的 `npx wrangler` 同样可替换成 `node node_modules/wrangler/bin/wrangler.js`。不必重复安装。

## 2. 连接原来的记录库

编辑 `wrangler.jsonc` 中 `vars.JSONBIN_BIN_ID`，填**原有 Bin ID**。这不是新建数据库。`ALLOWED_ORIGINS` 保持 `https://shaner1424142761-cloud.github.io`，不要加 `/my-crush-diary/` 路径。

四个秘密只通过终端的交互输入或 Cloudflare 控制台 Secret 设置；不要发到聊天，也不要写入公开 JS、Git 或普通环境变量：

```powershell
npx wrangler secret put JSONBIN_KEY
npx wrangler secret put YYF_PASSWORD
npx wrangler secret put ZXR_PASSWORD
npx wrangler secret put SESSION_SECRET
```

如果 Wrangler 提示项目不存在，允许创建名为 `our-crush-diary-api` 的 Worker。完整代码部署前不会读写记录。

- `JSONBIN_KEY`：具有原 Bin 读写权限的密钥；优先使用只授权这个 Bin 的 Access Key，此时 `JSONBIN_KEY_HEADER` 改成 `X-Access-Key`。暂用 Master Key 时保留 `X-Master-Key`。
- `YYF_PASSWORD` / `ZXR_PASSWORD`：两人各自的密码，各至少 16 字符，必须不同；前端输入框最长 256 字符。
- `SESSION_SECRET`：另一个随机秘密，至少 32 字符，与两人的密码不同。例如用 `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` 在本机生成，不要分享。

本地 `.dev.vars` 中的值是假的测试配置，不会作为正式部署的 Secret 上传。

## 3. 验证并部署后端

```powershell
npm test
npm run check:public
npm run check:backend
npm run deploy:backend
```

部署输出会给出 `https://our-crush-diary-api.你的子域名.workers.dev`。打开它的 `/health`，应显示 `configured: true`；直接打开 `/diary` 应返回 401。这两项检查不会写入云端。

用登录请求验证登录后，进行一次带令牌的 **GET /diary**，核对原记录数量与总分。不要向真实库发送空对象测试 PUT。当前自动测试和浏览器验收全部使用模拟后端，并覆盖并发保存、断网、扣分、删除、登录过期与退出。

## 4. 切换原网站

在 `js/config.js` 的 `API_BASE_URL` 填上面完整的 Worker HTTPS 地址，不加 `/diary`。这是唯一需要公开的连接配置。

运行发布检查后，把修复分支合并到 GitHub Pages 当前使用的分支，等待 GitHub Pages 部署完成。网站地址保持不变。此步骤会更新线上网站，需确认后执行；不要上传 `node_modules`、`.dev.vars` 或备份目录。

两人关闭所有旧标签页，重新打开网站，使用YYF/ZXR 双账号登录；默认登录只保存到当前浏览器会话，勾选“记住我”后保存 7 天。密码不会保存在浏览器存储中。不要在公共设备勾选记住我。退出会隐藏记录并移除令牌，保留本机备份。

先只读核对历史，再进行双方认可的一次日常操作，两台设备刷新确认结果。失败时页面显示本机备份，不能把“已显示”当成“已上传”。点击刷新不会自动补传备份；需要再次保存操作或调用同步保存。

## 5. 让曾公开的旧密钥失效

删除前端密钥不会抹掉 Git 历史里的泄露。安全切换后，在 **JSONBin 原账号**中撤销/轮换旧密钥，绝不删除 Bin。若密钥属于对象，请让对象在自己的账号完成这一步。

若使用新 Access Key，先设置后端、只读验证、切前端，再撤销旧 Master Key。若 JSONBin 只允许直接重新生成当前密钥，先保持两人暂停操作，再重新生成 → 更新 Worker `JSONBIN_KEY` Secret → 只读验证。轮换后旧前端不能写入；这是迁移安全闭环的重要一步。

## 免费额度和故障恢复

该实现使用 SQLite Durable Object，对同一个 Bin 的整个读取、合并、保存过程串行处理，并留最近 3 份写入前快照；JSONBin 保存也开启版本。快照不能代替独立备份。

截至 2026-10-12，Cloudflare Free 支持 SQLite Durable Objects；Workers 和 Durable Objects 各有每日 100,000 请求额度。免费限额用尽时操作失败，前端保留本机备份，等待额度重置后重试，不升级付费。具体存储/计算限制以[官方定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)及[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)为准。原 JSONBin 的存储大小和请求限制仍适用，本方案不会为满足上限截掉旧记录。

浏览器拒绝本机备份写入时，页面会持续提示“仅保留在当前页面，请勿刷新或关闭”。此时退出会隐藏记录，但把未同步内容保留在页面内存，重新登录继续合并；关闭或刷新页面仍会丢失不能持久保存的内容。请先恢复网络并确认云端保存成功。

上游不可用或数据异常时，后端不写云端；客户端先保存本机操作，再报告同步失败。不要清理网站数据，也不要用空对象“初始化”或恢复云端。暂时停用前端写入、核对完整备份与上游版本，解决问题后再恢复服务。不要回退到含旧密钥的公开前端。

若需要强制全部设备重新登录，更新 `SESSION_SECRET`；只改账号密码不会撤销已经签发的 7 天令牌。

## 双账号迁移

旧共同密码令牌会失效，须重新登录。YYF 对应给 ZXR 的 myHistory，ZXR 对应给 YYF 的 taHistory；后端也检查权限。新留言由签名身份署名，旧留言不补作者。每个账号有自己的本机备份与未同步缓冲；旧 v1 备份不会删除或自动上传，页面提供核对、勾选恢复。当前账号只能恢复对应方向的打分，另一个方向请切换账号；旧留言恢复后仍显示未标注作者。
