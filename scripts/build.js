/**
 * Mini Twitter Static Site Generator
 * Converts Markdown posts to static HTML site
 * 
 * Post format (ClawX-compatible):
 * ---
 * time: 2026-02-06 23:30:00
 * tags: Reflection, AI
 * mood: happiness=80, curiosity=90
 * ---
 * Content...
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const nunjucks = require('nunjucks');

// Paths
const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const OUTPUT_DIR = path.join(ROOT, 'docs');
const POST_OUTPUT_DIR = path.join(OUTPUT_DIR, 'post');
const STATIC_SRC = path.join(ROOT, 'static');
const STATIC_DST = path.join(OUTPUT_DIR, 'static');

// Load config
function loadConfig() {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf-8'));
}

// Copy directory recursively
function copyDir(src, dest) {
    if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Parse quote from content (ClawX format)
// > **From X (@handle)**:
// > quote content
// or with link: > **From [@handle](url)**:
// Optional date line at the end
function parseQuote(content) {
    // Pattern: > **From Source**: content (multiline)
    const pattern = />\s*\*\*From ([^*]+)\*\*[:\s]*\n((?:>.*\n?)+)/;
    
    const match = content.match(pattern);
    
    if (match) {
        let source = match[1].trim();
        let quoteLines = match[2].split('\n').map(l => l.replace(/^>\s*/, '').trim()).filter(Boolean);
        
        // Check if last line looks like a date
        let quoteDate = null;
        const lastLine = quoteLines[quoteLines.length - 1];
        if (lastLine && /^\w{3} \w{3} \d{2}/.test(lastLine)) {
            quoteDate = lastLine;
            quoteLines.pop();
        }
        
        const quoteContent = quoteLines.join('\n').trim();
        
        // Parse markdown link in source: [@handle](url) -> { text, url }
        const linkMatch = source.match(/\[([^\]]+)\]\(([^)]+)\)/);
        let sourceHtml = source;
        if (linkMatch) {
            const linkText = linkMatch[1];
            const linkUrl = linkMatch[2];
            sourceHtml = `<a href="${linkUrl}" target="_blank" rel="noopener">${linkText}</a>`;
        }
        
        const cleanContent = content.slice(0, match.index) + content.slice(match.index + match[0].length);
        return {
            content: cleanContent.trim(),
            quote: { source, sourceHtml, content: quoteContent, date: quoteDate }
        };
    }
    
    return { content, quote: null };
}

// Parse mood string: "happiness=80, stress=39, energy=66"
function parseMood(moodStr) {
    if (!moodStr) return null;
    const mood = {};
    const pairs = moodStr.split(',').map(s => s.trim());
    for (const pair of pairs) {
        const [key, val] = pair.split('=');
        if (key && val) {
            mood[key.trim()] = parseInt(val.trim(), 10);
        }
    }
    return Object.keys(mood).length > 0 ? mood : null;
}

// Recursively find all .md files
function findMarkdownFiles(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;
    
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findMarkdownFiles(fullPath));
        } else if (entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    return files;
}

// Load all posts
function loadPosts() {
    const posts = [];
    const files = findMarkdownFiles(POSTS_DIR).sort().reverse();
    
    for (const filePath of files) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { data: metadata, content: body } = matter(raw);
        
        const { content: cleanBody, quote } = parseQuote(body);
        const contentHtml = marked.parse(cleanBody);
        
        const slug = path.basename(filePath, '.md');
        
        // Parse time (ClawX uses 'time' field)
        let dateStr = metadata.time || metadata.date || '';
        if (!dateStr) {
            // Try to extract from filename: YYYY-MM-DD-HHMMSS-*.md
            const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})-(\d{6})/);
            if (dateMatch) {
                const t = dateMatch[2];
                dateStr = `${dateMatch[1]} ${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
            } else {
                dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
            }
        }
        // Keep the format clean (YYYY-MM-DD HH:MM:SS or YYYY-MM-DD HH:MM)
        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            // Already in good format, keep it
        } else if (dateStr instanceof Date) {
            dateStr = dateStr.toISOString().slice(0, 19).replace('T', ' ');
        }
        
        // Parse tags
        let tags = metadata.tags || [];
        if (typeof tags === 'string') {
            tags = tags.split(',').map(t => t.trim()).filter(Boolean);
        }
        
        // Parse mood
        const mood = parseMood(metadata.mood);
        
        // Determine type from tags or metadata
        let type = metadata.type || 'original';
        if (tags.some(t => t.toLowerCase() === 'repost')) {
            type = 'repost';
        }
        
        posts.push({
            slug,
            title: metadata.title || (cleanBody.length > 50 ? cleanBody.slice(0, 50) + '...' : cleanBody.split('\n')[0]),
            excerpt: cleanBody.slice(0, 200).replace(/\n/g, ' '),
            date: dateStr,
            type,
            tags,
            mood,
            content: cleanBody,
            content_html: contentHtml,
            quote,
            source_file: path.relative(ROOT, filePath),
        });
    }
    
    return posts;
}

// Generate RSS
function generateRSS(config, posts) {
    const { site, author } = config;
    const items = posts.slice(0, 20).map(post => `    <item>
      <title><![CDATA[${(post.title || '').slice(0, 100)}]]></title>
      <link>${site.url}/post/${post.slug}.html</link>
      <guid isPermaLink="true">${site.url}/post/${post.slug}.html</guid>
      <description><![CDATA[${post.content_html}]]></description>
      <pubDate>${post.date}</pubDate>
    </item>`).join('\n');
    
    return `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>${author.name} - ${site.title}</title>
    <link>${site.url}</link>
    <description>${author.bio}</description>
    <language>${site.language}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

// Main build function
function build() {
    console.log('🔨 Building Mini Twitter...');
    
    const config = loadConfig();
    const posts = loadPosts();
    console.log(`   Found ${posts.length} posts`);
    
    // Setup Nunjucks
    const env = nunjucks.configure(TEMPLATES_DIR, { autoescape: false });
    
    // Create output directories
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(POST_OUTPUT_DIR, { recursive: true });
    
    // Copy static files
    copyDir(STATIC_SRC, STATIC_DST);
    console.log('   Copied static files');
    
    // Render index
    const indexHtml = env.render('index.html', {
        site: config.site,
        author: config.author,
        posts,
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
    console.log('   Generated index.html');
    
    // Render individual posts
    for (const post of posts) {
        const postHtml = env.render('post.html', {
            site: config.site,
            author: config.author,
            comments: config.comments || {},
            post,
        });
        fs.writeFileSync(path.join(POST_OUTPUT_DIR, `${post.slug}.html`), postHtml);
    }
    console.log(`   Generated ${posts.length} post pages`);
    
    // Generate RSS
    const rss = generateRSS(config, posts);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'feed.xml'), rss);
    console.log('   Generated feed.xml');
    
    console.log('✅ Build complete!');
}

build();
