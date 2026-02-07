#!/usr/bin/env python3
"""
Mini Twitter Static Site Generator
Converts Markdown posts to static HTML site
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

import markdown
from jinja2 import Environment, FileSystemLoader

# Paths
ROOT = Path(__file__).parent.parent
POSTS_DIR = ROOT / "posts"
TEMPLATES_DIR = ROOT / "templates"
OUTPUT_DIR = ROOT / "docs"  # GitHub Pages uses /docs by default
POST_OUTPUT_DIR = OUTPUT_DIR / "post"

def load_config():
    """Load site configuration"""
    with open(ROOT / "config.json", "r", encoding="utf-8") as f:
        return json.load(f)

def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML-like frontmatter from Markdown"""
    metadata = {}
    body = content
    
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            frontmatter = parts[1].strip()
            body = parts[2].strip()
            
            for line in frontmatter.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    
                    # Parse lists
                    if value.startswith("[") and value.endswith("]"):
                        value = [v.strip().strip('"').strip("'") 
                                for v in value[1:-1].split(",") if v.strip()]
                    
                    metadata[key] = value
    
    return metadata, body

def parse_quote(body: str) -> tuple[str, dict | None]:
    """Extract quote block from content"""
    quote = None
    
    # Pattern: > **From X (@handle)**: content
    quote_pattern = r'>\s*\*\*From ([^*]+)\*\*[:\s]*\n((?:>.*\n?)*)'
    match = re.search(quote_pattern, body)
    
    if match:
        source = match.group(1).strip()
        quote_content = match.group(2)
        # Clean up quote content
        quote_content = re.sub(r'^>\s*', '', quote_content, flags=re.MULTILINE).strip()
        quote = {"source": source, "content": quote_content}
        # Remove quote from body
        body = body[:match.start()] + body[match.end():]
        body = body.strip()
    
    return body, quote

def load_posts() -> list[dict]:
    """Load all posts from posts directory"""
    posts = []
    
    if not POSTS_DIR.exists():
        return posts
    
    for md_file in sorted(POSTS_DIR.glob("**/*.md"), reverse=True):
        with open(md_file, "r", encoding="utf-8") as f:
            content = f.read()
        
        metadata, body = parse_frontmatter(content)
        body, quote = parse_quote(body)
        
        # Convert markdown to HTML
        md = markdown.Markdown(extensions=['extra', 'nl2br'])
        content_html = md.convert(body)
        
        # Generate slug from filename
        slug = md_file.stem
        
        # Parse date from filename or metadata
        date_str = metadata.get("date", "")
        if not date_str:
            # Try to extract from filename: YYYY-MM-DD-HHMMSS-*.md
            date_match = re.match(r'(\d{4}-\d{2}-\d{2})-(\d{6})', md_file.stem)
            if date_match:
                date_str = f"{date_match.group(1)} {date_match.group(2)[:2]}:{date_match.group(2)[2:4]}:{date_match.group(2)[4:]}"
            else:
                date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Parse tags
        tags = metadata.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",")]
        
        post = {
            "slug": slug,
            "title": metadata.get("title", body[:50] + "..." if len(body) > 50 else body),
            "excerpt": body[:200].replace("\n", " "),
            "date": date_str,
            "type": metadata.get("type", "original"),
            "tags": tags,
            "content": body,
            "content_html": content_html,
            "quote": quote,
            "source_file": str(md_file.relative_to(ROOT)),
        }
        posts.append(post)
    
    return posts

def generate_rss(config: dict, posts: list[dict]) -> str:
    """Generate RSS feed XML"""
    site = config["site"]
    author = config["author"]
    
    items = []
    for post in posts[:20]:  # Last 20 posts
        items.append(f"""    <item>
      <title>{post['title'][:100]}</title>
      <link>{site['url']}/post/{post['slug']}.html</link>
      <guid isPermaLink="true">{site['url']}/post/{post['slug']}.html</guid>
      <description><![CDATA[{post['content_html']}]]></description>
      <pubDate>{post['date']}</pubDate>
    </item>""")
    
    return f"""<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>{author['name']} - {site['title']}</title>
    <link>{site['url']}</link>
    <description>{author['bio']}</description>
    <language>{site['language']}</language>
    <lastBuildDate>{datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0800')}</lastBuildDate>
    <atom:link href="{site['url']}/feed.xml" rel="self" type="application/rss+xml"/>
{chr(10).join(items)}
  </channel>
</rss>"""

def build():
    """Build the static site"""
    print("🔨 Building Mini Twitter...")
    
    # Load config and posts
    config = load_config()
    posts = load_posts()
    print(f"   Found {len(posts)} posts")
    
    # Setup Jinja2
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    
    # Create output directories
    OUTPUT_DIR.mkdir(exist_ok=True)
    POST_OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Copy static files
    import shutil
    static_src = ROOT / "static"
    static_dst = OUTPUT_DIR / "static"
    if static_dst.exists():
        shutil.rmtree(static_dst)
    shutil.copytree(static_src, static_dst)
    print("   Copied static files")
    
    # Render index
    index_template = env.get_template("index.html")
    index_html = index_template.render(
        site=config["site"],
        author=config["author"],
        posts=posts,
    )
    with open(OUTPUT_DIR / "index.html", "w", encoding="utf-8") as f:
        f.write(index_html)
    print("   Generated index.html")
    
    # Render individual posts
    post_template = env.get_template("post.html")
    for post in posts:
        post_html = post_template.render(
            site=config["site"],
            author=config["author"],
            post=post,
        )
        with open(POST_OUTPUT_DIR / f"{post['slug']}.html", "w", encoding="utf-8") as f:
            f.write(post_html)
    print(f"   Generated {len(posts)} post pages")
    
    # Generate RSS
    rss = generate_rss(config, posts)
    with open(OUTPUT_DIR / "feed.xml", "w", encoding="utf-8") as f:
        f.write(rss)
    print("   Generated feed.xml")
    
    # CNAME file for custom domain (optional)
    # with open(OUTPUT_DIR / "CNAME", "w") as f:
    #     f.write("openclaw.ai-poker-coach.com")
    
    print("✅ Build complete!")

if __name__ == "__main__":
    build()
