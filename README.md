# Emolog

一个人用的情绪手账：聊天倾诉、偶尔软问记账、回顾趋势。

**手机用法**：部署到 Vercel 后，用手机浏览器打开给你的网址（可「添加到主屏幕」）。数据库用 Turso，不是靠局域网连电脑。

---

## 上线到手机（Vercel + Turso）

### 1. 注册并建 Turso 库

1. 打开 https://turso.tech 注册登录  
2. 新建一个 Database（随便起名，比如 `emolog`）  
3. 在库里复制两样东西：
   - `TURSO_DATABASE_URL`（形如 `libsql://xxx.turso.io`）
   - `TURSO_AUTH_TOKEN`

### 2. 在本机对 Turso 建表（只做一次）

在项目目录 PowerShell 里（注意用 `npm.cmd`）：

```powershell
$env:TURSO_DATABASE_URL="libsql://你的地址.turso.io"
$env:TURSO_AUTH_TOKEN="你的token"
npm.cmd run db:setup
```

成功会看到建表 +「Seed OK」。

### 3. 生成门锁密码哈希

```powershell
npm.cmd run hash-password -- 你想设的密码
```

复制输出的整行 `APP_PASSWORD_HASH=\$2a\$12\$...`（里面的 `\$` 要保留）。

再自己想一串很长的随机字符当 `SESSION_SECRET`。

### 4. 推到 GitHub，用 Vercel 部署

1. 把本项目放到一个 GitHub 仓库（不要提交 `.env.local`）  
2. 打开 https://vercel.com → Import 该仓库  
3. 在 Environment Variables 填：

| 变量 | 必填 | 说明 |
|------|------|------|
| `SESSION_SECRET` | 是 | 很长的随机字符串 |
| `APP_PASSWORD_HASH` | 是 | 上一步生成的哈希（含 `\$`） |
| `TURSO_DATABASE_URL` | 是 | Turso 地址 |
| `TURSO_AUTH_TOKEN` | 是 | Turso token |
| `AI_API_KEY` | 否 | 可空；上线后也可在 App 右上角齿轮里填 |
| `AI_BASE_URL` | 否 | 默认 DeepSeek：`https://api.deepseek.com` |
| `AI_MODEL` | 否 | 默认 `deepseek-chat` |

4. Deploy。完成后 Vercel 会给你一个 `https://xxx.vercel.app`  
5. **手机浏览器打开这个网址** → 输门锁密码 → 点齿轮填 AI Key / 地址 → 点「测试连接」→ 保存。

---

## 本地开发（可选）

```powershell
npm.cmd install
copy .env.example .env.local
# 编辑 .env.local：SESSION_SECRET、APP_PASSWORD_HASH（\$ 转义）
mkdir data
npm.cmd run db:setup
npm.cmd run dev
```

浏览器打开 http://localhost:3000 。

---

## 功能

- 密码门锁（约 14 天会话）
- 今天：沉浸聊天、软问、推荐回答、「记一下」、「今天别问了」
- 回顾：折线 + 点进某天看原话
- 设置：称呼、**AI 密钥 / 地址 / 模型 + 测试连接**、维度、导出 JSON
- 预装维度：心情、焦虑、睡眠、咖啡因、对亲友看法（默认敏感，不上 AI）

---

## 说明

这不是医疗或心理咨询产品。明显自伤表述时只会附上很轻的求助提示。

原型在 `prototype/`。
