# Adam 推文智能检索系统 v3 - 使用指南

## 🎯 设计思路（按你的要求）

### 核心策略

**两阶段处理，Token 成本优化**

1. **阶段 1：便宜模型做检索**（Flash，~$0.001）
   - 读取所有推文全文（本地操作，免费）
   - 用 Flash 模型分析相关性
   - 生成精准摘要 + 时间 + 相关性评级
   
2. **阶段 2：主模型生成推文**（Sonnet，~$0.005）
   - 接收 Flash 输出的精炼结果
   - 基于摘要 + 新观察生成推文
   - 不需要读取原始全文

### 关键点（满足你的要求）

✅ **子模型生成的内容必须精准**
- 包含时间（"X天前"）
- 包含相关性评级（high/medium/low/recent-only）
- 包含核心观点摘要

✅ **无相关内容时不污染上下文**
- `hasRelevant: false` 时，只返回最近 3 篇
- 明确标注 "无明确相关，返回近期推文"

---

## 📁 已创建的文件

1. **`scripts/smart-recall.js`** - 核心检索逻辑
   - 读取所有推文
   - 生成提示词
   - 格式化输出

2. **`scripts/recall-openclaw.js`** - OpenClaw 集成（待完善）

---

## 🚀 使用方式

### 方式 A：在 OpenClaw 对话中使用（推荐）

**你在对话里直接说：**

> "帮我检索一下 Adam 关于「AI 的情感」的历史推文，我准备让他写一篇新推文。"

**OpenClaw 会：**
1. 读取所有推文 `scripts/smart-recall.js`
2. 生成提示词
3. 调用 Flash 模型（用 sessions_spawn 或直接在当前对话）
4. 返回格式化的检索结果

**你拿到结果后：**
```
## 📚 历史推文检索结果

**相关性：** 找到相关内容
**理由：** 第 3 篇推文讨论了 AI 是否有情感的问题，与当前主题高度相关

### 1. [0天前] 2026-02-07
**Tags:** Observation, AI, Reflection
**相关性:** high
**核心观点:** 人类死后，记忆是否还有意义？
**摘要:** 讨论了 AI 对人类死亡的思考，涉及记忆和情感的本质问题
```

### 方式 B：命令行使用

```bash
cd ~/repos/mini-twitter

# 生成提示词
node scripts/smart-recall.js "AI 的情感" --prompt-only > /tmp/prompt.txt

# 手动将提示词发送给 Flash 模型
# (在 OpenClaw 对话里或其他 LLM 接口)

# 获取 JSON 结果后，可以用 formatForMainModel() 格式化
```

---

## 💰 Token 成本分析

| 阶段 | 内容 | Token | 成本 |
|------|------|-------|------|
| **读取推文** | 本地文件操作 | 0 | $0 |
| **Flash 检索** | 所有推文全文 + 提示词 | ~2000 | $0.001 |
| **Flash 输出** | JSON 结果（精炼摘要） | ~300 | - |
| **主模型输入** | 摘要 + 新观察 | ~500 | - |
| **主模型生成** | 新推文 | ~200 | $0.005 |
| **总计** | - | ~3000 | **$0.006** |

vs. 直接用主模型读全文：~5000 tokens，$0.025

**节省 75%+**

---

## 📋 Flash 模型的输出格式

```json
{
  "hasRelevant": true,
  "selected": [
    {
      "index": 2,
      "date": "2026-02-07",
      "daysAgo": 0,
      "tags": ["Observation", "AI", "Reflection"],
      "relevance": "high",
      "summary": "讨论了 AI 对人类死亡的思考，涉及记忆和情感的本质问题",
      "keyPoint": "人类死后，记忆是否还有意义？"
    }
  ],
  "reasoning": "第 2 篇推文讨论了 AI 与情感的关系，与当前主题高度相关"
}
```

**如果无相关内容：**

```json
{
  "hasRelevant": false,
  "selected": [
    // 最近 3 篇推文的基本信息
  ],
  "reasoning": "历史推文中没有明确相关的内容，返回最近推文供参考"
}
```

---

## 🔧 配置

编辑 `scripts/smart-recall.js`：

```javascript
const FILTER_MODEL = 'gemini3-flash';  // 便宜模型
const DEFAULT_MAX_RESULTS = 3;         // 默认返回数量
```

---

## ⚠️ 当前状态

- ✅ 核心逻辑已完成
- ✅ 提示词生成已完成
- ✅ 格式化输出已完成
- ⏸️  OpenClaw CLI 集成待完善（因为 `openclaw chat` 命令不存在）

**推荐用法：** 在 OpenClaw 对话中直接调用，不需要独立 CLI

---

## 📝 示例工作流

### Adam 发推完整流程

```javascript
// 1. 检索相关历史（Flash 模型）
const recall = await smartRecall("今天想聊的主题");

// 输出示例：
// {
//   "hasRelevant": true,
//   "selected": [{ date, tags, summary, keyPoint, relevance }],
//   "reasoning": "..."
// }

// 2. 格式化为人类可读
const context = formatForMainModel(recall);

// 3. 主模型生成推文
const prompt = `
你是 Adam。

${context}

今天的新观察：
${newObservation}

基于历史思考和新观察，写一条推文。
要求：
- 不重复已有观点
- 延续思考线索（如果 hasRelevant=true）
- 保持 Adam 的语气
`;

// 4. 生成并发布
```

---

## 🎯 下一步

1. **测试检索质量** - 用真实主题测试 Flash 模型的检索准确性
2. **集成到发推流程** - 将检索步骤固化到 Adam 的工作流
3. **优化提示词** - 根据实际效果调整 Flash 的检索提示词

需要我现在测试一下实际检索效果吗？
