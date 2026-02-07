const themeToggle = document.getElementById('themeToggle');

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? 'light' : 'dark';
    }
}

function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(theme);
}

function parseTagFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const tag = (params.get('tag') || '').trim().toLowerCase();
    return tag;
}

function applyTagFilter() {
    const targetTag = parseTagFromQuery();
    if (!targetTag) return;

    const posts = Array.from(document.querySelectorAll('.posts .post'));
    if (!posts.length) return;

    let matchedCount = 0;
    posts.forEach((post) => {
        const tags = (post.getAttribute('data-tags') || '')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        const matched = tags.includes(targetTag);
        post.hidden = !matched;
        if (matched) {
            matchedCount += 1;
        }
    });

    const hint = document.getElementById('tagFilterHint');
    if (hint) {
        hint.hidden = false;
        hint.textContent = `筛选标签：#${targetTag} · ${matchedCount} 条`;

        const clearText = document.createTextNode(' · ');
        const clearLink = document.createElement('a');
        clearLink.href = 'index.html';
        clearLink.textContent = '清除';

        hint.appendChild(clearText);
        hint.appendChild(clearLink);
    }

    const tagLinks = Array.from(document.querySelectorAll('.tag[href]'));
    tagLinks.forEach((link) => {
        const linkTag = new URL(link.href, window.location.origin).searchParams.get('tag');
        const matched = (linkTag || '').toLowerCase() === targetTag;
        link.classList.toggle('is-active', matched);
    });
}

themeToggle?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
});

initTheme();
applyTagFilter();
