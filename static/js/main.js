const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

function getInitialTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') {
        return saved;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

applyTheme(getInitialTheme());

themeToggle?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
});

const posts = Array.from(document.querySelectorAll('.posts .post'));
const searchInput = document.getElementById('searchInput');
const filterStatus = document.getElementById('filterStatus');
const filterText = document.getElementById('filterText');
const clearFilter = document.getElementById('clearFilter');
const emptyState = document.getElementById('emptyState');
const backToTop = document.getElementById('backToTop');

let activeTag = '';
let searchTerm = '';

function normalize(value) {
    return (value || '').toLowerCase().trim();
}

function updateTagStyles() {
    const tags = document.querySelectorAll('.tag[data-tag]');
    tags.forEach((tag) => {
        const current = normalize(tag.dataset.tag);
        tag.classList.toggle('active', !!activeTag && current === activeTag);
    });
}

function updateFilterUI(visibleCount) {
    if (!filterStatus || !filterText) return;

    const conditions = [];
    if (activeTag) {
        conditions.push(`#${activeTag}`);
    }
    if (searchTerm) {
        conditions.push(`关键词: ${searchTerm}`);
    }

    if (!conditions.length) {
        filterStatus.classList.remove('visible');
        filterText.textContent = '';
        return;
    }

    filterStatus.classList.add('visible');
    filterText.textContent = `过滤条件: ${conditions.join(' · ')} (${visibleCount} 条)`;
}

function applyFilters() {
    if (!posts.length) return;

    let visibleCount = 0;
    posts.forEach((post) => {
        const content = normalize(post.innerText);
        const tags = normalize(post.dataset.tags)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        const matchesTag = !activeTag || tags.includes(activeTag);
        const matchesSearch = !searchTerm || content.includes(searchTerm);
        const visible = matchesTag && matchesSearch;

        post.hidden = !visible;
        if (visible) {
            visibleCount += 1;
        }
    });

    if (emptyState) {
        emptyState.classList.toggle('visible', visibleCount === 0);
    }

    updateTagStyles();
    updateFilterUI(visibleCount);
}

searchInput?.addEventListener('input', (event) => {
    searchTerm = normalize(event.target.value);
    applyFilters();
});

document.querySelectorAll('.tag[data-tag]').forEach((tag) => {
    tag.addEventListener('click', () => {
        const clicked = normalize(tag.dataset.tag);
        activeTag = activeTag === clicked ? '' : clicked;
        applyFilters();
    });
});

clearFilter?.addEventListener('click', () => {
    activeTag = '';
    searchTerm = '';
    if (searchInput) {
        searchInput.value = '';
    }
    applyFilters();
});

function toggleBackToTop() {
    if (!backToTop) return;
    backToTop.classList.toggle('visible', window.scrollY > 360);
}

window.addEventListener('scroll', toggleBackToTop, { passive: true });
backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});
toggleBackToTop();

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReducedMotion && posts.length) {
    const observer = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    obs.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12, rootMargin: '0px 0px -10% 0px' }
    );

    posts.forEach((post, index) => {
        post.classList.add('reveal-ready');
        post.style.setProperty('--reveal-delay', `${Math.min(index * 45, 260)}ms`);
        observer.observe(post);
    });
} else {
    posts.forEach((post) => post.classList.add('is-visible'));
}

applyFilters();
