#!/usr/bin/env node
/**
 * Adam 推文检索 - OpenClaw 集成版
 * 
 * 使用 sessions_spawn 调用便宜模型做检索
 */

const { getAllPosts, buildPrompt, formatForMainModel, fallbackRecent } = require('./smart-recall.js');
const { execSync } = require('child_process');
const fs = require('fs');

const FILTER_MODEL = 'gemini3-flash';

async function recallWithOpenClaw(topic, observation = null, maxResults = 3) {
  console.log('📖 读取所有推文...');
  const allPosts = getAllPosts();
  console.log(`✅ 共 ${allPosts.length} 篇推文\n`);
  
  const prompt = buildPrompt(allPosts, topic, observation, maxResults);
  
  // 写入临时文件
  const promptFile = `/tmp/adam-recall-${Date.now()}.txt`;
  fs.writeFileSync(promptFile, prompt);
  
  console.log(`🤖 使用 ${FILTER_MODEL} 进行智能检索...\n`);
  
  try {
    // 使用 OpenClaw CLI 直接调用（不spawn子会话，减少开销）
    const result = execSync(
      `openclaw chat --model ${FILTER_MODEL} --file ${promptFile}`,
      { 
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 60000 // 60秒超时
      }
    );
    
    fs.unlinkSync(promptFile);
    
    // 解析 JSON
    const jsonMatch = result.match(/```json\s*([\s\S]+?)\s*```/) || result.match(/(\{[\s\S]+\})/);
    if (!jsonMatch) {
      console.error('⚠️  未找到 JSON 输出，使用回退方案');
      return fallbackRecent(allPosts, maxResults, 'JSON 解析失败');
    }
    
    const selection = JSON.parse(jsonMatch[1]);
    
    // 验证格式
    if (!selection.selected || !Array.isArray(selection.selected)) {
      console.error('⚠️  返回格式错误，使用回退方案');
      return fallbackRecent(allPosts, maxResults, '格式验证失败');
    }
    
    return selection;
    
  } catch (err) {
    console.error('❌ 模型调用失败:', err.message);
    fs.existsSync(promptFile) && fs.unlinkSync(promptFile);
    return fallbackRecent(allPosts, maxResults, '模型调用失败: ' + err.message);
  }
}

// CLI 接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const topic = args[0] || null;
  const observation = args[1] || null;
  const jsonOnly = args.includes('--json');
  const maxResults = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1]) || 3;
  
  recallWithOpenClaw(topic, observation, maxResults).then(result => {
    if (jsonOnly) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n' + '='.repeat(70));
      console.log(formatForMainModel(result));
      console.log('='.repeat(70));
      console.log('\n✅ 检索完成，上述内容可直接用于主模型的上下文。');
    }
  }).catch(err => {
    console.error('❌ 执行失败:', err);
    process.exit(1);
  });
}

module.exports = { recallWithOpenClaw };
