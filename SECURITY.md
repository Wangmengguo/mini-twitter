# Security Setup for Model Health Check

## 🔐 防泄漏机制（三层防护）

### 1. 环境变量隔离
所有 API keys 从环境变量读取，绝不硬编码到代码中。

**设置步骤：**
```bash
# 复制示例文件
cp scripts/.env.example scripts/.env

# 编辑 .env 文件，填入真实 key
nano scripts/.env

# 运行脚本前加载环境变量
source scripts/.env
python3 scripts/check-model-health-secure.py
```

### 2. Git Ignore 保护
`.gitignore` 已配置屏蔽所有敏感文件：
- `.env` / `.env.*`
- `**/apiKey*`, `**/secret*`
- `**/*key*.json`

### 3. Pre-commit Hook 拦截
`.git/hooks/pre-commit` 会自动检测即将提交的代码，阻止包含以下模式的提交：
- `sk-[a-zA-Z0-9-]{20,}` (OpenAI/OpenRouter keys)
- `apiKey: "非占位符"`
- 纯数字 key（长度 7-10 位）
- `password: "非星号"`

**测试：**
```bash
# 这个会被拦截
echo 'apiKey: "sk-test-123"' > test.py
git add test.py
git commit -m "test"  # ❌ BLOCKED!

# 这个可以通过
echo 'apiKey: os.getenv("MY_KEY")' > test.py
git add test.py
git commit -m "test"  # ✅ OK
```

---

## 🚀 迁移旧脚本到新版本

**替换步骤：**
```bash
cd ~/repos/mini-twitter

# 备份旧脚本
mv scripts/check-model-health.py scripts/check-model-health.py.old

# 使用新版本
mv scripts/check-model-health-secure.py scripts/check-model-health.py

# 配置环境变量
cp scripts/.env.example scripts/.env
nano scripts/.env  # 填入真实 keys

# 测试运行
source scripts/.env
python3 scripts/check-model-health.py
```

---

## 📝 配置文件结构

### `secrets-config.json` (可以提交到 git)
只包含非敏感信息：provider 名称、baseUrl、model 列表、环境变量名。

```json
{
  "providers": {
    "cliproxy-local": {
      "apiKeyEnv": "CLIPROXY_LOCAL_KEY",  ← 指向环境变量名
      "baseUrl": "http://localhost:7861/v1"
    }
  }
}
```

### `.env` (绝不提交)
真实 API keys：
```bash
CLIPROXY_LOCAL_KEY="Flzx3000c_cpamc"
GCLI2API_AG_KEY="12345677"
OPENROUTER_API_KEY="sk-or-v1-xxx"
```

---

## ⚡ Systemd Timer 集成

修改 `model-health-check.service`：
```ini
[Service]
EnvironmentFile=/home/openclaw/repos/mini-twitter/scripts/.env
ExecStart=/usr/bin/python3 /home/openclaw/repos/mini-twitter/scripts/check-model-health.py
```

重启服务：
```bash
systemctl --user daemon-reload
systemctl --user restart model-health-check.service
```

---

## 🛡️ 已执行的历史清理

2026-02-11 已用 `git-filter-repo` 清理全部历史：
- `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` → `OPENROUTER_API_KEY_REDACTED`
- `Flzx3000c_cpamc` → `LOCAL_PROXY_KEY_REDACTED`
- `12345677` → `REMOTE_API_KEY_REDACTED`

所有 3 个 key 已从整个 Git 历史中抹除并强制推送到 GitHub。

---

## 📋 Checklist

- [x] 环境变量配置文件创建 (`scripts/.env.example`)
- [x] 非敏感配置文件 (`scripts/secrets-config.json`)
- [x] 安全版脚本 (`scripts/check-model-health-secure.py`)
- [x] `.gitignore` 更新
- [x] Pre-commit hook 安装
- [x] Git 历史清理完成
- [ ] 替换旧脚本为新版本
- [ ] 配置 Systemd `EnvironmentFile`
- [ ] 团队成员同步新流程（如果有协作者）

---

**记住：**
- ✅ 环境变量 = 安全
- ❌ 硬编码 = 泄露
