# 正式后端切换核对（2026-10-12）

正式后端：https://our-crush-diary-api.my-crush-diary.workers.dev 。保留原 JSONBin Bin 和原 GitHub Pages 地址，没有导入本地模拟数据。

最新只读快照保存于本机仓库外的私人备份目录。正式后端分别用 YYF/ZXR 签名会话进行 GET /auth/me、GET /diary 和 GET /photo-usage 核对；返回身份正确、历史与原云端完整内容一致、照片服务可用。未登录 GET /diary 返回401，允许来源的 CORS 正确。正式密码的长度、区别和配置通过 health 验证；用户仍需用自设密码实际登录。

原数据包含 taHistory 110、myHistory 102、留言101、相册1、博客5、愿望20、纪念日4，共343条；两边原分数保留。核对前后的原云端内容及版本元信息均一致。所有正式记录库操作均为只读，没有测试 PUT 或上传测试图片。

上线核对发现 Cloudflare 的原生 fetch 被保存为对象方法后触发 Illegal invocation。添加保留原生函数接收者的回归测试，确认修复前失败，默认 fetch 绑定 globalThis 后通过。完整83项测试和44个公开文件扫描通过，正式后端重新部署后两账号读取均200。临时诊断日志已从正式代码移除，私人诊断文件没有进入版本库。

前端仅公开后端地址；正式密钥和两人密码仅存 Cloudflare Secrets。仍需在 JSONBin 原账号轮换旧公开密钥并更新后端 Secret；删除当前前端密钥不能撤销历史中的旧密钥。切换后关闭旧标签页并重新打开网站，旧本机备份保留供明确核对恢复。
