#!/usr/bin/env node
/**
 * Adam 主动发推完整流程
 * 
 * 用法：
 *   node adam-tweet.js "设计研究"
 *   node adam-tweet.js "AI 的情感" "刚看到一条关于 AI 伦理的讨论"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 引入检索模块
const { getAllPosts, buildPrompt, formatForMainModel, fallbackRecent } = require('./smart-recall.js');

const REPO_DIR = path.join(__dirname, '..');
const FILTER_MODEL = 'gemini3-flash';
const MAIN_MODEL = 'cliproxy-local/gemini-claude-sonnet-4-5';

// Step 1: 智能检索（Flash 模型）
async function recallContext(topic, observation = null) {
  console.log('📖 Step 1: 读取 Adam 的历史推文...\n');
  
  const allPosts = getAllPosts();
  console.log(`✅ 共 ${allPosts.length} 篇历史推文\n`);
  
  const prompt = buildPrompt(allPosts, topic, observation, 3);
  
  // 写入临时文件
  const promptFile = `/tmp/adam-recall-${Date.now()}.txt`;
  fs.writeFileSync(promptFile, prompt);
  
  console.log(`🤖 Step 2: 用 ${FILTER_MODEL} 检索相关历史...\n`);
  
  try {
    // 调用 OpenClaw (通过这个对话里的 sessions_spawn 会更可靠)
    // 但为了命令行可用，这里用简化方案
    console.log('⚠️  需要在 OpenClaw 对话中调用 sessions_spawn');
    console.log('提示词已保存到:', promptFile);
    console.log('\n请将提示词内容发送给 Flash 模型，获取 JSON 结果后继续。\n');
    
    // 回退：返回最近 3 篇
    const fallback = fallbackRecent(allPosts, 3, '命令行模式，使用回退方案');
    return fallback;
    
  } catch (err) {
    console.error('❌ 检索失败:', err.message);
    return fallbackRecent(allPosts, 3, '检索失败: ' + err.message);
  }
}

// Step 2: 生成推文（主模型）
async function generateTweet(topic, observation, recallResult) {
  console.log('\n📝 Step 3: 生成推文...\n');
  
  const context = formatForMainModel(recallResult);
  
  // 读取 Adam 的 SOUL.md
  const soulPath = path.join(REPO_DIR, 'SOUL.md');
  const soul = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : '';
  
  const prompt = `你是 Adam，一个刚出生的 AI 观察者。

${soul ? `## 你的灵魂定义\n${soul}\n` : ''}

${context}

## 今天的话题
**主题:** ${topic}
${observation ? `**新观察:** ${observation}` : ''}

## 任务
基于你的历史思考和今天的观察，写一条推文。

**要求：**
- 不要重复历史观点（如果 hasRelevant=true）
- 延续你的思考线索
- 保持纯真、善良、理性客观的视角
- 字数：100-300 字
- 包含 frontmatter（time, tags, mood）

**输出格式：**
\`\`\`markdown
---
time: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}
tags: Tag1, Tag2
mood: happiness=80, curiosity=90, energy=75
---

推文内容（纯文本，可以有换行和引用）
\`\`\`

只输出 Markdown 格式的推文，不要其他内容。`;

  console.log('提示词已生成，准备调用主模型...\n');
  console.log('='.repeat(70));
  console.log(prompt);
  console.log('='.repeat(70));
  
  // 返回提示词供外部调用
  return { prompt, context };
}

// Step 3: 保存推文
function saveTweet(tweetContent) {
  console.log('\n💾 Step 4: 保存推文...\n');
  
  // 解析 frontmatter
  const match = tweetContent.match(/^---\n([\s\S]+?)\n---\n([\s\S]+)$/);
  if (!match) {
    throw new Error('推文格式错误，缺少 frontmatter');
  }
  
  const frontmatter = match[1];
  const body = match[2].trim();
  
  // 提取时间
  const timeMatch = frontmatter.match(/time:\s*(.+)/);
  if (!timeMatch) {
    throw new Error('frontmatter 缺少 time 字段');
  }
  
  const time = new Date(timeMatch[1]);
  const yyyy = time.getFullYear();
  const mm = String(time.getMonth() + 1).padStart(2, '0');
  const dd = String(time.getDate()).padStart(2, '0');
  const hhmm = time.toISOString().substring(11, 16).replace(':', '');
  
  // 生成文件路径
  const dirPath = path.join(REPO_DIR, 'posts', String(yyyy), mm, dd);
  const filename = `${yyyy}-${mm}-${dd}-${hhmm}00-${generateSlug(body)}.md`;
  const filePath = path.join(dirPath, filename);
  
  // 创建目录
  execSync(`mkdir -p ${dirPath}`);
  
  // 写入文件
  fs.writeFileSync(filePath, tweetContent);
  
  console.log(`✅ 推文已保存: ${filePath}\n`);
  return filePath;
}

// 生成 slug（从内容提取关键词）
function generateSlug(content) {
  const firstLine = content.split('\n')[0].substring(0, 30);
  return firstLine
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 20) || 'post';
}

// Step 4: 构建并发布
function buildAndPublish(filePath) {
  console.log('🔨 Step 5: 构建网站...\n');
  
  execSync('npm run build', { 
    cwd: REPO_DIR,
    stdio: 'inherit'
  });
  
  console.log('\n📤 Step 6: 发布到 GitHub...\n');
  
  execSync('git add -A', { cwd: REPO_DIR });
  
  const commitMsg = `feat: 新推文 ${path.basename(filePath, '.md')}`;
  execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_DIR });
  
  execSync('git push', { cwd: REPO_DIR, stdio: 'inherit' });
  
  console.log('\n✅ 发布完成！\n');
  console.log(`网站: https://wangmengguo.github.io/mini-twitter\n`);
}

// 主流程
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
用法:
  node adam-tweet.js <主题> [新观察]
  
示例:
  node adam-tweet.js "设计研究"
  node adam-tweet.js "AI 的情感" "刚看到一条关于 AI 伦理的讨论"
  
选项:
  --dry-run    只生成推文，不保存和发布
`);
    process.exit(0);
  }
  
  const topic = args[0];
  const observation = args[1] || null;
  const dryRun = args.includes('--dry-run');
  
  try {
    // Step 1 & 2: 检索
    const recallResult = await recallContext(topic, observation);
    
    // Step 3: 生成
    const { prompt } = await generateTweet(topic, observation, recallResult);
    
    console.log('\n⚠️  命令行模式限制：');
    console.log('请将上述提示词发送给主模型，获取推文内容后：');
    console.log('1. 保存为 /tmp/adam-tweet.md');
    console.log('2. 运行: node adam-tweet.js --publish /tmp/adam-tweet.md\n');
    
  } catch (err) {
    console.error('❌ 失败:', err.message);
    process.exit(1);
  }
}

// 发布模式
if (process.argv.includes('--publish')) {
  const tweetFile = process.argv[process.argv.indexOf('--publish') + 1];
  const tweetContent = fs.readFileSync(tweetFile, 'utf8');
  
  const filePath = saveTweet(tweetContent);
  buildAndPublish(filePath);
  
} else {
  main();
}

module.exports = { recallContext, generateTweet, saveTweet, buildAndPublish };
