#!/usr/bin/env node
/**
 * Adam 推文上下文检索器
 * 用途：生成新推文前，检索相关历史推文
 * 策略：时间衰减 + 语义相关性
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '../posts');
const MAX_RESULTS = 10;

// 时间衰减函数
function getTimeDecay(daysAgo) {
  if (daysAgo <= 3) return 1.0;
  if (daysAgo <= 7) return 0.7;
  if (daysAgo <= 14) return 0.5;
  if (daysAgo <= 30) return 0.3;
  return 0.1;
}

// 递归读取所有推文
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
          
          posts.push({
            path: fullPath,
            time,
            tags,
            body,
            wordCount: body.split(/\s+/).length
          });
        }
      }
    }
  }
  
  scanDir(POSTS_DIR);
  return posts;
}

// 计算相关性得分（简单关键词匹配，后续可接入 embedding）
function getRelevanceScore(post, query) {
  if (!query) return 0.5; // 无查询词时，返回中等分数
  
  const queryLower = query.toLowerCase();
  const bodyLower = post.body.toLowerCase();
  
  // 标题匹配（如果有）
  let score = 0;
  
  // 关键词出现次数
  const occurrences = (bodyLower.match(new RegExp(queryLower, 'g')) || []).length;
  score += occurrences * 0.2;
  
  // Tag 匹配
  const tagMatch = post.tags.some(tag => 
    tag.toLowerCase().includes(queryLower) || 
    queryLower.includes(tag.toLowerCase())
  );
  if (tagMatch) score += 0.5;
  
  return Math.min(score, 1.0);
}

// 主检索函数
function recallContext(query = null, maxResults = MAX_RESULTS) {
  const posts = getAllPosts();
  const now = new Date();
  
  // 计算综合得分
  const scored = posts.map(post => {
    const daysAgo = (now - post.time) / (1000 * 60 * 60 * 24);
    const timeDecay = getTimeDecay(daysAgo);
    const relevance = getRelevanceScore(post, query);
    
    const finalScore = relevance * timeDecay;
    
    return {
      ...post,
      daysAgo: Math.floor(daysAgo),
      timeDecay,
      relevance,
      finalScore
    };
  });
  
  // 排序并取前 N 条
  scored.sort((a, b) => b.finalScore - a.finalScore);
  
  return scored.slice(0, maxResults);
}

// CLI 接口
if (require.main === module) {
  const query = process.argv[2] || null;
  const results = recallContext(query);
  
  console.log(`📚 检索到 ${results.length} 条相关推文\n`);
  
  results.forEach((post, idx) => {
    console.log(`${idx + 1}. [${post.daysAgo}天前] 得分=${post.finalScore.toFixed(2)} (相关性=${post.relevance.toFixed(2)} × 时间衰减=${post.timeDecay.toFixed(2)})`);
    console.log(`   Tags: ${post.tags.join(', ')}`);
    console.log(`   内容: ${post.body.substring(0, 80)}...`);
    console.log(`   路径: ${post.path.replace(POSTS_DIR, 'posts')}\n`);
  });
  
  // 输出 JSON 格式（供 OpenClaw 调用）
  if (process.env.OUTPUT_JSON === '1') {
    console.log('\n---JSON---');
    console.log(JSON.stringify(results, null, 2));
  }
}

module.exports = { recallContext, getAllPosts };
