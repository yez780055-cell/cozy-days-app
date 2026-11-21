# 小饱日常 CloudBase 双人空间

目标环境为 `vicarious-cardinal-d6c5m0ec4d9c0`。应用使用 CloudBase 邮箱验证码认证和 PostgreSQL Data API。数据库从登录 JWT 识别账号，在 RPC 中校验成员身份并确定记录归属。

## 初始化与启用

1. 在目标环境的 PostgreSQL SQL 编辑器以管理员依次运行 [001_shared_space.sql](../cloudbase/001_shared_space.sql) 和 [002_email_signup_identity.sql](../cloudbase/002_email_signup_identity.sql)。前者创建一个空间、两个空席位、私有表和三个 RPC，后者兼容 CloudBase 邮箱验证码注册留下的身份标记。
2. 在「身份认证 → 登录方式 → 邮箱验证码」配置 CloudBase 邮件代发或已有 SMTP，并启用邮箱验证码。
3. 两位成员准备注册时，由管理员运行 [issue_invitations.sql](../cloudbase/issue_invitations.sql)。它为未占用席位随机生成一次性邀请码，有效期 7 天。请私下分别交给两位成员。重复执行会轮换尚未使用的邀请码。
4. 构建双人版时设置 `VITE_CLOUDBASE_ENABLED=true`。如果部署需要 Publishable Key，可额外设置 `VITE_CLOUDBASE_PUBLISHABLE_KEY`。前端构建只可使用 Publishable Key。若环境限制来源，请为 Web 预览、正式域名和 Android WebView 配置相应的安全来源。
5. 两位成员在欢迎页选择「首次使用，注册账号」，填入各自的邮箱和一次性邀请码，再输入邮件验证码。应用验证邮箱、创建账号，并用该登录会话验证和使用邀请码。绑定成功后会自动进入空间。邀请码错误时，可留在注册页更换邀请码并重试绑定。已有账号选择「已有账号，登录」。每台新设备首次进入需联网初始化缓存。

在 Windows PowerShell 启动本机双人版。

```powershell
npm ci
$env:VITE_CLOUDBASE_ENABLED = 'true'
npm run dev -- --host 127.0.0.1
```

同一 PowerShell 会话下可用 `npm run build`、`npm run build:pages` 或 `npm run build:android` 构建双人版。未设置开关的构建沿用单机模式。双人版分别为两个账号建立新的 IndexedDB 和草稿范围，旧本机记录不自动导入。

## 权限和同步

- 纪念日（含已有的压缩背景图格式）、生理期和周期设置由两位成员共同管理。待办和分类归各自账号。
- 本地记录和同步队列在同一 IndexedDB 事务里保存。应用联网、回到前台或点击「立即同步」时尝试同步，打开时也会定期检查。写入附带操作 ID 和基础版本，响应丢失后可重试同一操作。删除通过带版本的标记同步到其他设备。
- 纪念日、待办和每日生理期条目按行同步。经期起止区间列表作为一项同步，以保持日期区间不重叠。并发编辑同一项时，双方显示云端先提交的版本。「设置 → 账号与同步 → 同步冲突」保留本机副本，版本冲突可比较后重新应用。备份恢复也会向云端同步，共享记录的变动会影响另一位成员。
- 退出后，待同步更改留在该账号的设备缓存里。重新进入同一账号时继续同步。清除站点数据会清除该设备上尚未同步的内容。

## 验收

运行 `npm run test:cloudbase`，在两个 Chromium 上下文和嵌入式 PostgreSQL 中验证访问权限、断网、重试、冲突和换号隔离。验收使用合成账号。上线前应使用目标环境和实际邮箱验证收件、加入与双设备同步。

- [CloudBase 邮箱验证码 HTTP API](https://docs.cloudbase.net/http-api/auth/auth-send-verification)
- [CloudBase PostgreSQL RPC](https://docs.cloudbase.net/database/postgresql/http/rpc)
