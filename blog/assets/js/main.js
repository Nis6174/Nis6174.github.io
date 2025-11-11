// セキュリティ: XSS対策のためのサニタイズ関数
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// 記事データ（実際の運用では別ファイルから読み込むか、動的に生成）
const posts = [
    {
        id: 1,
        title: "Emotetマルウェアの静的解析入門",
        date: "2024-11-10",
        excerpt: "Emotetマルウェアのサンプルを静的解析ツールを使用して分析し、その動作原理と感染メカニズムを解説します。",
        tags: ["マルウェア解析", "Emotet", "静的解析"],
        filename: "2024-11-10-emotet-analysis.html"
    },
    {
        id: 2,
        title: "IDA Proを使ったバイナリ解析テクニック",
        date: "2024-11-05",
        excerpt: "IDA Proの基本的な使い方から、効率的な解析のためのプラグイン活用まで、実践的なテクニックを紹介します。",
        tags: ["リバースエンジニアリング", "IDA Pro", "ツール"],
        filename: "2024-11-05-ida-pro-techniques.html"
    },
    {
        id: 3,
        title: "ランサムウェアの暗号化アルゴリズム分析",
        date: "2024-10-28",
        excerpt: "最近のランサムウェアが使用する暗号化手法を解析し、その脅威と対策について考察します。",
        tags: ["マルウェア解析", "ランサムウェア", "暗号化"],
        filename: "2024-10-28-ransomware-crypto.html"
    }
];

// トップページの最新記事表示
function displayLatestPosts() {
    const container = document.getElementById('latestPosts');
    if (!container) return;

    // 最新3件を表示
    const latestPosts = posts.slice(0, 3);
    
    latestPosts.forEach(post => {
        const postCard = createPostCard(post);
        container.appendChild(postCard);
    });
}

// 記事一覧ページの全記事表示
function displayAllPosts() {
    const container = document.getElementById('allPosts');
    if (!container) return;

    posts.forEach(post => {
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