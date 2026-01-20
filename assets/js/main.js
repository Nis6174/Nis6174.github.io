// セキュリティ: XSS対策のためのサニタイズ関数
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// 記事データの定義（実際のブログ記事を追加していく）
const posts = [
    {
        id: 1,
        title: "React2Shell (CVE-2025-55182) 脆弱性検証記録",
        date: "2025-12-16",
        excerpt: "React Server Componentsの重大な脆弱性React2Shellについて、隔離環境での検証結果と独自テストの結果をまとめました。",
        tags: ["脆弱性解析", "CVE-2025-55182", "React"],
        filename: "2025-12-16-react2shell-cve-2025-55182.html"
    }
    // 新しい記事をここに追加していく
];

// トップページの最新記事表示
function displayLatestPosts() {
    const container = document.getElementById('latestPosts');
    if (!container) return;

    // 日付順にソート（新しい順）
    const sortedPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // 最新3件を表示
    const latestPosts = sortedPosts.slice(0, 3);
    
    latestPosts.forEach(post => {
        const postCard = createPostCard(post);
        container.appendChild(postCard);
    });
}

// 記事一覧ページの全記事表示
function displayAllPosts() {
    const container = document.getElementById('allPosts');
    if (!container) return;

    // 日付順にソート（新しい順）
    const sortedPosts = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedPosts.forEach(post => {
        const postCard = createPostCard(post);
        container.appendChild(postCard);
    });
}

// 記事カードの作成
function createPostCard(post) {
    const article = document.createElement('article');
    article.className = 'post-card';
    
    const link = document.createElement('a');
    link.href = `posts/${sanitizeHTML(post.filename)}`;
    link.style.textDecoration = 'none';
    link.style.color = 'inherit';
    
    // セキュリティ: 外部リンクではないためrel属性は不要
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    meta.textContent = formatDate(post.date);
    
    const title = document.createElement('h3');
    title.className = 'post-title';
    title.textContent = post.title;
    
    const excerpt = document.createElement('p');
    excerpt.className = 'post-excerpt';
    excerpt.textContent = post.excerpt;
    
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'post-tags';
    
    post.tags.forEach(tagText => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = tagText;
        tagsContainer.appendChild(tag);
    });
    
    link.appendChild(meta);
    link.appendChild(title);
    link.appendChild(excerpt);
    link.appendChild(tagsContainer);
    
    article.appendChild(link);
    
    return article;
}

// 日付フォーマット
function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}年${month}月${day}日`;
}

// ナビゲーションのアクティブ状態管理
function setActiveNavLink() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        const linkPath = new URL(link.href).pathname;
        
        if (currentPath === linkPath || 
            (currentPath.includes('/posts/') && linkPath.includes('/posts/'))) {
            link.classList.add('active');
        }
    });
}

// 外部リンクのセキュリティ対策
function secureExternalLinks() {
    const links = document.querySelectorAll('a[href^="http"]');
    links.forEach(link => {
        if (!link.href.includes(window.location.hostname)) {
            link.setAttribute('rel', 'noopener noreferrer');
            link.setAttribute('target', '_blank');
        }
    });
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    // 最新記事の表示（トップページ）
    displayLatestPosts();
    
    // 全記事の表示（記事一覧ページ）
    displayAllPosts();
    
    // ナビゲーションのアクティブ状態設定
    setActiveNavLink();
    
    // 外部リンクのセキュリティ対策
    secureExternalLinks();
    
    // スムーズスクロール
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// エクスポート（他のファイルから使用する場合）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sanitizeHTML,
        posts
    };
}