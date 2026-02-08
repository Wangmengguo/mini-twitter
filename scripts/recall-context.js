#!/usr/bin/env node
/**
 * Adam 推文上下文检索器 v2
 * Token 优化版本
 * 
 * 策略：
 * 1. 只返回摘要 + 路径（不读全文）
 * 2. 默认返回 3-5 篇（可配置）
 * 3. 提供 --full 选项读取完整内容
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '../posts');
const MAX_RESULTS = 5; // 降低到 5 篇
const SUMMARY_LENGTH = 100; // 摘要长度（字符）

// 时间衰减函数
function getTimeDecay(daysAgo) {
  if (daysAgo <= 3) return 1.0;
  if (daysAgo <= 7) return 0.7;
  if (daysAgo <= 14) return 0.5;
  if (daysAgo <= 30) return 0.3;
  return 0.1;
}

// 递归读取所有推文（只读元数据 + 摘要）
function getAllPostsSummary() {
  const posts = [];
  
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const stats = fs.statSync(fullPath);
        
        // 解析 frontmatter
        const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]+)$/);
        if (match) {
          const frontmatter = match[1];
          const body = match[2].trim();
          
          // 提取时间
          const timeMatch = frontmatter.match(/time:\s*(.+)/);
          const time = timeMatch ? new Date(timeMatch[1]) : stats.mtime;
          
          // 提取 tags
          const tagsMatch = frontmatter.match(/tags:\s*(.+)/);
          const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()) : [];
          
          // 生成摘要（取前 N 个字符）
          const summary = body.substring(0, SUMMARY_LENGTH).replace(/\n/g, ' ');
          
          posts.push({
            path: fullPath,
            time,
            tags,
            summary: summary + (body.length > SUMMARY_LENGTH ? '...' : ''),
            bodyLength: body.length,
            fullBody: null // 不加载全文
          });
        }
      }
    }
  }
  
  scanDir(POSTS_DIR);
  return posts;
}

// 计算相关性得分
function getRelevanceScore(post, query) {
  if (!query) return 0.5;
  
  const queryLower = query.toLowerCase();
  const summaryLower = post.summary.toLowerCase();
  
  let score = 0;
  
  // 摘要中关键词出现次数
  const occurrences = (summaryLower.match(new RegExp(queryLower, 'g')) || []).length;
  score += occurrences * 0.3;
  
  // Tag 匹配
  const tagMatch = post.tags.some(tag => 
    tag.toLowerCase().includes(queryLower) || 
    queryLower.includes(tag.toLowerCase())
  );
  if (tagMatch) score += 0.5;
  
  return Math.min(score, 1.0);
}

// 主检索函数（只返回摘要）
function recallContextSummary(query = null, maxResults = MAX_RESULTS) {
  const posts = getAllPostsSummary();
  const now = new Date();
  
  const scored = posts.map(post => {
    const daysAgo = (now - post.time) / (1000 * 60 * 60 * 24);
    const timeDecay = getTimeDecay(daysAgo);
    const relevance = getRelevanceScore(post, query);
    
    const finalScore = relevance * timeDecay;
    
    return {
      path: post.path,
      time: post.time.toISOString(),
      daysAgo: Math.floor(daysAgo),
      tags: post.tags,
      summary: post.summary,
      bodyLength: post.bodyLength,
      timeDecay,
      relevance,
      finalScore
    };
  });
  
  scored.sort((a, b) => b.finalScore - a.finalScore);
  
  return scored.slice(0, maxResults);
}

// 读取完整内容（按需加载）
function loadFullContent(posts) {
  return posts.map(post => {
    const content = fs.readFileSync(post.path, 'utf8');
    const match = content.match(/^---\n[\s\S]+?\n---\n([\s\S]+)$/);
    return {
      ...post,
      fullBody: match ? match[1].trim() : ''
    };
  });
}

// CLI 接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const query = args.find(a => !a.startsWith('--')) || null;
  const fullMode = args.includes('--full');
  const jsonMode = args.includes('--json') || process.env.OUTPUT_JSON === '1';
  const maxResults = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || MAX_RESULTS;
  
  let results = recallContextSummary(query, maxResults);
  
  if (fullMode) {
    results = loadFullContent(results);
  }
  
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`📚 检索到 ${results.length} 条相关推文${fullMode ? '（含全文）' : '（仅摘要）'}\n`);
    
    results.forEach((post, idx) => {
      console.log(`${idx + 1}. [${post.daysAgo}天前] 得分=${post.finalScore.toFixed(2)} (相关性=${post.relevance.toFixed(2)} × 时间衰减=${post.timeDecay.toFixed(2)})`);
      console.log(`   Tags: ${post.tags.join(', ')}`);
      console.log(`   摘要: ${post.summary}`);
      console.log(`   路径: ${post.path.replace(POSTS_DIR, 'posts')}`);
      console.log(`   长度: ${post.bodyLength} 字符\n`);
    });
    
    if (!fullMode) {
      console.log('💡 提示: 使用 --full 读取完整内容');
    }
  }
}

module.exports = { recallContextSummary, loadFullContent, getAllPostsSummary };
