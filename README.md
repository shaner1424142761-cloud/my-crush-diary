# YYF 和 ZXR 的恋爱日记

保留原 GitHub Pages 地址和 JSONBin 记录，增加免费 Cloudflare Worker 后端与共同密码登录。

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
