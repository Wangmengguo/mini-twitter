#!/usr/bin/env node
/**
 * Adam 推文智能检索器 v3.1
 * 
 * 策略：
 * 1. 读取所有推文全文（本地操作，免费）
 * 2. 用便宜模型（Flash）做检索 + 生成精准摘要
 * 3. 输出格式化结果，直接给主模型使用
 * 
 * 如果没有相关内容，只返回最近 3 篇（避免污染上下文）
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '../posts');
const FILTER_MODEL = 'gemini3-flash'; // 便宜模型

// 递归读取所有推文（完整内容）
function getAllPosts() {
  const posts = [];
  
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // 解析 frontmatter
        const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]+)$/);
        if (match) {
          const frontmatter = match[1];
          const body = match[2].trim();
          
          // 提取元数据
          const timeMatch = frontmatter.match(/time:\s*(.+)/);
          const time = timeMatch ? new Date(timeMatch[1]) : new Date();
          
          const tagsMatch = frontmatter.match(/tags:\s*(.+)/);
          const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()) : [];
          
          const moodMatch = frontmatter.match(/mood:\s*(.+)/);
          const mood = moodMatch ? moodMatch[1] : '';
          
          posts.push({
            path: fullPath,
            time: time.toISOString(),
            date: time.toISOString().split('T')[0],
            tags,
            mood,
            content: body
          });
        }
      }
    }
  }
  
  scanDir(POSTS_DIR);
  
  // 按时间倒序
  posts.sort((a, b) => new Date(b.time) - new Date(a.time));
  
  return posts;
}

// 计算天数差
function daysAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

// 生成检索提示词
function buildPrompt(allPosts, topic, newObservation, maxResults) {
  const postsText = allPosts.map((p, i) => {
    return `[${i}] 发布时间: ${p.date} (${daysAgo(p.time)}天前)
Tags: ${p.tags.join(', ')}
Mood: ${p.mood}
内容:
${p.content}

---`;
  }).join('\n\n');
  
  return `你是 Adam 的记忆检索助手。

**任务：** 从历史推文中找出与当前主题/观察最相关的内容，生成精准摘要。

**当前主题：** ${topic || '无特定主题'}
${newObservation ? `**新观察：** ${newObservation}` : ''}

**所有历史推文：**
${postsText}

**检索要求：**
1. 如果有明确相关的推文（语义相似、话题关联），选出最相关的 ${maxResults} 篇
2. 如果没有明确相关的，返回最近的 ${maxResults} 篇（避免无关内容污染上下文）
3. 优先选择时间较近的推文（权重：0-3天 > 4-7天 > 更早）

**输出格式（JSON）：**
\`\`\`json
{
  "hasRelevant": true,
  "selected": [
    {
      "index": 0,
      "date": "2026-02-07",
      "daysAgo": 1,
      "tags": ["Observation", "AI"],
      "relevance": "high",
      "summary": "简洁精准的摘要（1-2 句话，突出与当前主题的关联）",
      "keyPoint": "这篇推文的核心观点"
    }
  ],
  "reasoning": "为什么选这几篇（或为什么返回近期推文）"
}
\`\`\`

**重要：** 
- 摘要必须精准，突出相关性
- 如果实在没有相关的，直接说 hasRelevant=false，返回最近 ${maxResults} 篇
- 不要强行关联无关内容

只输出 JSON，不要其他内容。`;
}

// 格式化输出（给主模型用）
function formatForMainModel(recallResult) {
  const { hasRelevant, selected, reasoning } = recallResult;
  
  let output = `## 📚 历史推文检索结果\n\n`;
  output += `**相关性：** ${hasRelevant ? '找到相关内容' : '无明确相关，返回近期推文'}\n`;
  output += `**理由：** ${reasoning}\n\n`;
  
  selected.forEach((item, i) => {
    output += `### ${i + 1}. [${item.daysAgo}天前] ${item.date}\n`;
    output += `**Tags:** ${item.tags.join(', ')}\n`;
    output += `**相关性:** ${item.relevance}\n`;
    output += `**核心观点:** ${item.keyPoint}\n`;
    output += `**摘要:** ${item.summary}\n\n`;
  });
  
  return output;
}

// 回退方案
function fallbackRecent(allPosts, maxResults, reason) {
  return {
    hasRelevant: false,
    selected: allPosts.slice(0, maxResults).map((p, i) => ({
      index: i,
      date: p.date,
      daysAgo: daysAgo(p.time),
      tags: p.tags,
      relevance: 'recent-only',
      summary: p.content.substring(0, 100).replace(/\n/g, ' ') + '...',
      keyPoint: '近期推文'
    })),
    reasoning: reason
  };
}

// CLI 接口（简化版，输出提示词供外部调用）
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
用法：
  node smart-recall.js [主题] [新观察] [--prompt-only] [--json]

选项：
  --prompt-only  只输出提示词（供外部 OpenClaw 调用）
  --json         JSON 格式输出
  --max=N        最多返回 N 篇（默认 3）

示例：
  # 输出提示词
  node smart-recall.js "AI的记忆" --prompt-only > /tmp/prompt.txt
  
  # 完整调用（需要 OpenClaw）
  node smart-recall.js "AI的记忆"
`);
    process.exit(0);
  }
  
  const topic = args.find(a => !a.startsWith('--')) || null;
  const observation = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const promptOnly = args.includes('--prompt-only');
  const maxResults = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1]) || 3;
  
  console.error('📖 读取所有推文...');
  const allPosts = getAllPosts();
  console.error(`✅ 共 ${allPosts.length} 篇推文\n`);
  
  const prompt = buildPrompt(allPosts, topic, observation, maxResults);
  
  if (promptOnly) {
    // 只输出提示词
    console.log(prompt);
  } else {
    // 输出格式化的检索指南（供手动使用）
    console.error(`🤖 请将以下提示词发送给 ${FILTER_MODEL} 模型：\n`);
    console.error('='.repeat(60));
    console.log(prompt);
    console.error('='.repeat(60));
    console.error('\n然后将返回的 JSON 结果传入 formatForMainModel() 函数。');
    
    // 回退方案
    console.error('\n💡 如果无法调用模型，使用回退方案（最近 3 篇）：');
    const fallback = fallbackRecent(allPosts, maxResults, '手动回退');
    console.error(formatForMainModel(fallback));
  }
}

module.exports = { 
  getAllPosts,
  buildPrompt,
  formatForMainModel,
  fallbackRecent,
  daysAgo
};
