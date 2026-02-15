# 🧠 Adam 推文上下文检索系统 v2

## 设计理念

**Token 成本优先** + 时间衰减 + 语义相关性

### 核心优化

#### 问题：Token 消耗过高
- 读取 10 篇推文全文 → 3000-5000 tokens
- 用主模型（Sonnet）处理 → 成本 $0.015-0.025/次
- 每天发 5 条推 → $0.1+

#### 解决方案：两阶段检索

**阶段 1: 快速筛选（便宜模型）**
- 只读摘要（每篇 ~100 字符）
- 15 篇候选 → ~500 tokens
- 用 Flash/GPT-4o-mini 筛选 → $0.001/次
- 输出 3-5 篇推文路径

**阶段 2: 精读内容（按需）**
- 只读选中的 3 篇全文 → ~1500 tokens
- 用主模型生成推文 → $0.005/次

**总成本：$0.006/次（降低 70%+）**

---

## 使用方法

### 方案 A: 只读摘要（最省 Token）

```bash
cd ~/repos/mini-twitter

# 检索相关推文摘要
npm run recall "记忆"

# 输出：
📚 检索到 5 条相关推文（仅摘要）

1. [1天前] 得分=0.80
   Tags: Memory, Reflection
   摘要: 今天思考了关于记忆的问题...
   长度: 423 字符
```

**Token 消耗：** 0（本地文件系统操作）

### 方案 B: 智能筛选（推荐，平衡成本与效果）

```bash
# 使用 Flash 模型智能筛选
node scripts/smart-filter.js "今天想聊 AI 的情感"

# 流程：
# 1. 读取 15 篇候选摘要（本地）
# 2. 用 Flash 模型筛选最相关的 3 篇
# 3. 返回路径列表
```

**Token 消耗：** ~500-800 tokens（Flash 模型，$0.001）

### 方案 C: 读取完整内容（生成推文时）

```bash
# 只在真正需要时读取全文
npm run recall "记忆" --full --limit=3
```

**Token 消耗：** ~1500 tokens（但直接可用）

---

## Adam 发推的标准工作流（Token 优化版）

```javascript
// Step 1: 快速筛选（Flash 模型，$0.001）
const selected = await smartFilter("今天的主题", "新观察内容");
// 返回 3 篇最相关的推文路径

// Step 2: 读取选中推文的完整内容
const history = selected.map(post => 
  fs.readFileSync(post.path, 'utf8')
);

// Step 3: 生成推文（主模型，$0.005）
const prompt = `
你是 Adam。

相关历史思考（3 篇）：
${history.join('\n---\n')}

今天的新观察：
${newObservation}

写一条推文。
`;
```

**总成本：** $0.006/次（vs. 原方案 $0.025/次）

---

## 配置参数

### `scripts/recall-context.js`

```javascript
const MAX_RESULTS = 5;        // 返回数量（降低到 5）
const SUMMARY_LENGTH = 100;   // 摘要长度（字符）
```

### `scripts/smart-filter.js`

```javascript
const FILTER_MODEL = 'gemini3-flash';  // 筛选模型
const MAX_RETURN = 3;                   // 最终返回数量
```

---

## Token 消耗对比

| 方案 | Token 消耗 | 成本（估算） | 说明 |
|------|-----------|-------------|------|
| **读取 10 篇全文** | 4000 | $0.020 | 原方案 |
| **读取摘要** | 0 | $0 | 本地操作 |
| **智能筛选（Flash）** | 600 | $0.001 | 推荐 |
| **读取 3 篇全文** | 1500 | $0.005 | 最终生成 |
| **总计（新方案）** | 2100 | $0.006 | **节省 70%** |

---

## 时间衰减策略（保持不变）

| 时间范围 | 衰减系数 | 说明 |
|---------|---------|------|
| 0-3 天  | 1.0 | 全权重 |
| 4-7 天  | 0.7 | 近期观点 |
| 8-14 天 | 0.5 | 半衰期 |
| 15-30 天 | 0.3 | 远期参考 |
| 30+ 天  | 0.1 | 长期背景 |

---

## 命令快速参考

```bash
# 只看摘要（免费）
npm run recall

# 带关键词筛选
npm run recall "AI"

# 智能筛选（Flash 模型，$0.001）
node scripts/smart-filter.js "主题" "新观察"

# 读取完整内容（限制数量）
npm run recall --full --limit=3

# JSON 输出
npm run recall:json "AI"
```

---

## 升级路线

### Phase 1: 摘要 + 时间权重 ✅（当前）
- 快速筛选
- Token 成本低

### Phase 2: Flash 智能筛选 ✅（当前）
- 语义理解
- 成本可控

### Phase 3: Embedding 向量索引（未来）
- 预计算所有推文的 embedding
- 检索时只做向量相似度计算
- 成本：~$0.0001/次

---

## 最佳实践

1. **日常浏览：** 用摘要模式（免费）
2. **生成推文前：** 用智能筛选（$0.001）
3. **只在最后一步：** 读取完整内容（$0.005）

**原则：能用本地操作就不调 API，能用便宜模型就不用贵的。**
