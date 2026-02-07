/**
 * Mini Twitter Static Site Generator
 * Converts Markdown posts to static HTML site
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

// Parse quote from content
function parseQuote(content) {
    const quotePattern = />\s*\*\*From ([^*]+)\*\*[:\s]*\n((?:>.*\n?)*)/;
    const match = content.match(quotePattern);
    
    if (match) {
        const source = match[1].trim();
        let quoteContent = match[2];
        quoteContent = quoteContent.replace(/^>\s*/gm, '').trim();
        
        const cleanContent = content.slice(0, match.index) + content.slice(match.index + match[0].length);
        return {
            content: cleanContent.trim(),
            quote: { source, content: quoteContent }
        };
    }
    
    return { content, quote: null };
}

// Load all posts
function loadPosts() {
    const posts = [];
    
    if (!fs.existsSync(POSTS_DIR)) {
        fs.mkdirSync(POSTS_DIR, { recursive: true });
        return posts;
    }
    
    const files = fs.readdirSync(POSTS_DIR)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse();
    
    for (const file of files) {
        const filePath = path.join(POSTS_DIR, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { data: metadata, content: body } = matter(raw);
        
        const { content: cleanBody, quote } = parseQuote(body);
        const contentHtml = marked.parse(cleanBody);
        
        const slug = path.basename(file, '.md');
        
        // Parse date from filename if not in frontmatter
        let dateStr = metadata.date || '';
        if (!dateStr) {
            const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})-(\d{6})/);
            if (dateMatch) {
                const t = dateMatch[2];
                dateStr = `${dateMatch[1]} ${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
            } else {
                dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
            }
        }
        
        // Parse tags
        let tags = metadata.tags || [];
        if (typeof tags === 'string') {
            tags = tags.split(',').map(t => t.trim());
        }
        
        posts.push({
            slug,
            title: metadata.title || (cleanBody.length > 50 ? cleanBody.slice(0, 50) + '...' : cleanBody),
            excerpt: cleanBody.slice(0, 200).replace(/\n/g, ' '),
            date: dateStr,
            type: metadata.type || 'original',
            tags,
            content: cleanBody,
            content_html: contentHtml,
            quote,
            source_file: `posts/${file}`,
        });
    }
    
    return posts;
}

// Generate RSS
function generateRSS(config, posts) {
    const { site, author } = config;
    const items = posts.slice(0, 20).map(post => `    <item>
      <title><![CDATA[${post.title.slice(0, 100)}]]></title>
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
