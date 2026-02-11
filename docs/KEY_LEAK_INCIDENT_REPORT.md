# 🔐 Key 泄露事件总结与防护方案

## 📊 泄露情况

### 泄露的 Key
| Key | 用途 | 泄露 Commit | 风险等级 |
|-----|------|-------------|----------|
| `sk-or-v1-4127...` | OpenRouter API | `4f4e4f7` (2026-02-10 22:59) | 🔴 高危（已被 GitHub 禁用） |
| `Flzx3000c_cpamc` | Local Proxy (localhost:7861) | `6720ba4` + `4f4e4f7` | 🟡 中危（内网服务，外网无法访问） |
| `12345677` | Remote API (148.135.124.86:7861) | `6720ba4` + `4f4e4f7` | 🔴 高危（公网 IP，任何人可用） |

### 根本原因
在 `scripts/check-model-health.py` 中硬编码了 API keys，然后 `git add . && git commit` 直接推送到了 GitHub。

---

## ✅ 已执行的补救措施

### 1. Git 历史彻底清理（2026-02-11）
使用 `git-filter-repo` 重写了整个仓库历史：
- 所有 3 个 key 替换为 `*_REDACTED` 占位符
- 强制推送到 GitHub（`git push --force`）
- 备份原始 `.git` 到 `.git.backup-<timestamp>`

### 2. 三层防泄漏系统部署

#### Layer 1: 环境变量隔离
- 创建 `secrets-config.json`（只包含非敏感信息：provider 名称、baseUrl、环境变量名）
- 创建 `.env.example`（示例文件，可提交）
- 真实 keys 存放在 `.env`（已加入 `.gitignore`，永不提交）

#### Layer 2: `.gitignore` 保护
```
.env
secrets-config.local.json
**/apiKey-*.json
**/*credential*
```

#### Layer 3: Pre-commit Hook 拦截
- 自动检测暂存区文件中的敏感模式（`sk-*`, `apiKey: "非占位符"`, 纯数字 key）
- 排除文档和示例文件（`.md`, `.example`）
- 阻止包含硬编码 key 的 commit

**测试结果：**
```bash
# ❌ 被拦截
echo 'KEY="sk-real-123"' > test.py && git add test.py && git commit -m "test"
# 🚨 BLOCKED: test.py contains potential secret

# ✅ 通过
echo 'KEY=os.getenv("MY_KEY")' > test.py && git add test.py && git commit -m "test"
# ✅ No secrets detected in commit.
```

---

## 📝 后续操作（TODO）

### 立刻做（紧急）
1. **换掉这 3 个 key**：
   - OpenRouter: 去 <https://openrouter.ai/keys> 新建 key，替换 `~/.openclaw/openclaw.json` 中的 `openrouter.apiKey`
   - Local Proxy: 修改本地 CLI Proxy 配置文件的 `apiKey`
   - Remote API (148.135.124.86): SSH 到 VPS，修改服务配置的 `apiKey`

2. **检查服务日志**：
   - SSH 到 `148.135.124.86`，查看 `7861` 端口日志，搜索可疑的非你本人的 API 调用

3. **迁移旧脚本到新版本**：
   ```bash
   cd ~/repos/mini-twitter
   mv scripts/check-model-health.py scripts/check-model-health.py.old
   mv scripts/check-model-health-secure.py scripts/check-model-health.py
   cp scripts/.env.example scripts/.env
   nano scripts/.env  # 填入新 keys
   ```

4. **更新 Systemd Timer**：
   编辑 `~/.config/systemd/user/model-health-check.service`，添加：
   ```ini
   [Service]
   EnvironmentFile=/home/openclaw/repos/mini-twitter/scripts/.env
   ```
   然后重启：
   ```bash
   systemctl --user daemon-reload
   systemctl --user restart model-health-check.service
   ```

### 长期维护
- 定期 review `.gitignore` 和 pre-commit hook 规则
- 团队协作时共享 `SECURITY.md` 文档
- 每次添加新 provider 都用环境变量（不要硬编码）

---

## 🎓 教训

1. **永远不要硬编码 secrets**（即使是"临时测试"）
2. **`git add .` 之前先看 `git diff`**
3. **敏感配置文件第一时间加入 `.gitignore`**
4. **Pre-commit hook 是最后一道防线**（但别依赖它）

---

## 📂 相关文件

- `SECURITY.md` — 防泄漏系统使用指南
- `scripts/secrets-config.json` — Provider 配置模板（可提交）
- `scripts/.env.example` — 环境变量示例（可提交）
- `scripts/.env` — 真实 keys（永不提交，已 ignore）
- `.git/hooks/pre-commit` — 自动检测脚本
- `.gitignore` — 敏感文件屏蔽规则

---

_Updated: 2026-02-11 22:10 CST_
