# 🔐 迁移完成 Checklist

## ✅ 已完成的自动化步骤

- [x] 备份旧脚本 (`check-model-health.py.old`, `check-model-health.py.backup`)
- [x] 替换为新版安全脚本 (`check-model-health.py`)
- [x] 创建环境变量模板 (`scripts/.env.example`)
- [x] 创建空的 `.env` 文件（待你填入 keys）
- [x] 更新 `auto-health-check.sh` 自动加载 `.env`
- [x] 提交并推送到 GitHub
- [x] 创建测试脚本 (`scripts/test-env.sh`)

---

## 🔴 你需要手动完成的步骤

### 1. 填入真实 API Keys（SSH 操作）

```bash
# 编辑 .env 文件
nano ~/repos/mini-twitter/scripts/.env
```

**需要填入的内容：**
```bash
# Local Proxy (localhost:7861)
CLIPROXY_LOCAL_KEY="你的新 key"

# Remote API (148.135.124.86:7861)
GCLI2API_AG_KEY="你的新 key"

# OpenRouter
OPENROUTER_API_KEY="sk-or-v1-你的新 key"
```

⚠️ **注意：**
- OpenRouter key 去 <https://openrouter.ai/keys> 新建
- Local Proxy 和 Remote API 的 key 需要你自己去对应服务的配置文件改（我不知道它们在哪）

---

### 2. 测试环境变量配置

```bash
# 运行测试脚本
~/repos/mini-twitter/scripts/test-env.sh
```

**期望输出：**
```
✅ CLIPROXY_LOCAL_KEY: 已设置 (14 字符)
✅ GCLI2API_AG_KEY: 已设置 (8 字符)
✅ OPENROUTER_API_KEY: 已设置 (64 字符)
✅ 测试成功！脚本运行正常。
```

**如果失败：**
- 检查 `.env` 文件是否正确填入（没有多余空格、引号匹配）
- 检查 key 是否包含 `REPLACE-ME`（需要替换为真实值）

---

### 3. 重启 Systemd Timer

```bash
# 重启服务让它使用新配置
systemctl --user restart model-health-check.service

# 查看状态
systemctl --user status model-health-check.service

# 查看日志（验证 .env 是否加载成功）
journalctl --user -u model-health-check.service -n 50
```

**期望日志输出：**
```
[2026-02-11 22:XX:XX] Loaded API keys from scripts/.env
[2026-02-11 22:XX:XX] Running model health check...
[Local Proxy]
  Checking Opus 4.6...
```

---

### 4. 验证定时任务

```bash
# 手动触发一次
systemctl --user start model-health-check.service

# 查看是否正常运行
journalctl --user -u model-health-check.service -f
```

---

## 📋 故障排查

### Q: 测试脚本报错 "未设置"
**A:** `.env` 文件格式错误，检查：
- 变量名和值之间有 `=` 且无空格（`KEY="value"` 而不是 `KEY = "value"`）
- 引号匹配（`"` 开头必须 `"` 结尾）

### Q: Systemd 日志里看不到 "Loaded API keys"
**A:** `auto-health-check.sh` 没有正确加载 `.env`，检查：
```bash
cat ~/repos/mini-twitter/scripts/auto-health-check.sh | grep "source scripts/.env"
```
应该能看到这行代码。如果没有，重新 pull 代码：
```bash
cd ~/repos/mini-twitter && git pull
```

### Q: 脚本运行报 "Warning: CLIPROXY_LOCAL_KEY not set"
**A:** `.env` 文件路径不对或变量名拼写错误。确保：
- 文件在 `~/repos/mini-twitter/scripts/.env`
- 变量名完全一致（区分大小写）

---

## 🎯 完成后验证

所有步骤完成后，运行：
```bash
# 最终验证
~/repos/mini-twitter/scripts/test-env.sh && \
systemctl --user restart model-health-check.service && \
journalctl --user -u model-health-check.service -n 20
```

看到这些就说明成功了：
```
✅ CLIPROXY_LOCAL_KEY: 已设置
✅ GCLI2API_AG_KEY: 已设置
✅ OPENROUTER_API_KEY: 已设置
✅ 测试成功！
...
[2026-02-11 22:XX:XX] Loaded API keys from scripts/.env
[2026-02-11 22:XX:XX] Running model health check...
```

---

## 🔒 安全提醒

- ✅ `.env` 文件已加入 `.gitignore`（永不会被 commit）
- ✅ Pre-commit hook 会拦截任何硬编码的 key
- ✅ 所有历史泄露已清理

**但你仍需要：**
1. **换掉那 3 个旧 key**（它们已经公开过，虽然 Git 历史清理了，但可能被缓存）
2. **检查 VPS 日志**（`148.135.124.86`）看是否有可疑调用

---

_Updated: 2026-02-11 22:30 CST_
