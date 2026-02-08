#!/usr/bin/env node
/**
 * Adam 推文智能筛选器
 * 
 * 使用便宜模型（Flash/GPT-4o-mini）做语义筛选
 * 输入：所有推文摘要
 * 输出：最相关的 3-5 篇推文路径
 * 
 * Token 消耗：~500-1000 tokens（远低于直接读取全文）
 */

const { recallContextSummary } = require('./recall-context.js');
const { execSync } = require('child_process');

// 配置：使用便宜模型
const FILTER_MODEL = 'gemini3-flash'; // 或 'gpt-4o-mini'
const MAX_RETURN = 3; // 只返回 3 篇

async function smartFilter(topic, newObservation = null) {
  // 1. 获取所有推文摘要（时间权重排序）
  const candidates = recallContextSummary(null, 15); // 取前 15 篇候选
  
  // 2. 构建提示词（Token 优化）
  const summariesText = candidates.map((p, i) => 
    `[${i}] ${p.daysAgo}天前 | ${p.tags.join(', ')} | ${p.summary}`
  ).join('\n');
  
  const prompt = `你是 Adam 的记忆检索助手。

**任务：** 从候选推文中选出最相关的 ${MAX_RETURN} 篇。

**选择标准：**
1. 与当前主题/观察最相关
2. 优先选择近期（权重已在候选列表中体现）
3. 避免重复话题

**当前主题：** ${topic || '无特定主题'}
${newObservation ? `**新观察：** ${newObservation}` : ''}

**候选推文：**
${summariesText}

**输出格式（JSON）：**
\`\`\`json
{
  "selected": [0, 3, 7],
  "reason": "简短说明为什么选这几篇"
}
\`\`\`

只输出 JSON，不要其他内容。`;

  // 3. 调用便宜模型
  console.log(`🤖 使用 ${FILTER_MODEL} 进行智能筛选...`);
  
  // 构建 OpenClaw sessions_send 命令
  const result = execSync(`openclaw chat --model ${FILTER_MODEL} "${prompt.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  
  // 4. 解析结果
  let selection;
  try {
    const jsonMatch = result.match(/```json\n([\s\S]+?)\n```/) || result.match(/\{[\s\S]+\}/);
    if (!jsonMatch) {
      throw new Error('未找到 JSON 输出');
    }
    selection = JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } catch (err) {
    console.error('⚠️  模型输出解析失败，回退到前 3 篇');
    selection = { selected: [0, 1, 2], reason: '解析失败，使用默认排序' };
  }
  
  // 5. 返回选中的推文路径
  const selected = selection.selected
    .filter(i => i >= 0 && i < candidates.length)
    .map(i => candidates[i]);
  
  console.log(`\n✅ 筛选完成：${selection.reason}\n`);
  
  return selected;
}

// CLI 接口
if (require.main === module) {
  const topic = process.argv[2] || null;
  const observation = process.argv[3] || null;
  
  smartFilter(topic, observation).then(results => {
    console.log('📋 选中的推文：\n');
    results.forEach((post, idx) => {
      console.log(`${idx + 1}. [${post.daysAgo}天前] ${post.tags.join(', ')}`);
      console.log(`   ${post.summary}`);
      console.log(`   → ${post.path}\n`);
    });
    
    // 输出路径列表（供脚本使用）
    console.log('---PATHS---');
    results.forEach(p => console.log(p.path));
  });
}

module.exports = { smartFilter };
