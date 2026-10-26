// 現在のページが posts/ 配下にあるかどうかで、記事へのリンクの組み立て方を切り替える
// 例:
//   index.html        (ルート)   -> 記事へは "posts/xxx.html" でアクセス
//   posts/index.html  (posts配下) -> 記事へは "xxx.html" でアクセス（同一ディレクトリ内）
const IN_POSTS_DIR = window.location.pathname.includes('/posts/');

// セキュリティ: XSS対策のためのサニタイズ関数
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// 記事データは、ビルド時に生成される assets/data/posts.json から読み込む。
// （Markdown記事は content/posts/、既存のHTML記事は content/legacy-posts.json が元データ）
// 現在のページの階層に合わせて、JSONへの相対パスを組み立てる。
const POSTS_JSON_URL = IN_POSTS_DIR ? '../assets/data/posts.json' : 'assets/data/posts.json';

async function loadPosts() {
    const response = await fetch(POSTS_JSON_URL, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
        throw new Error('posts.json の形式が不正です');
    }
    return data;
}

// 記事一覧の取得に失敗したときの表示
function showPostsError(container) {
    const message = document.createElement('p');
    message.className = 'post-excerpt';
    message.textContent = '記事一覧を読み込めませんでした。時間をおいて再読み込みしてください。';
    container.appendChild(message);
}

// トップページの最新記事表示
function displayLatestPosts(posts) {
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
function displayAllPosts(posts) {
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
    const pathPrefix = IN_POSTS_DIR ? '' : 'posts/';
    link.href = `${pathPrefix}${encodeURIComponent(post.filename)}`;
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
    // 記事一覧が必要なページ（トップ・記事一覧）だけ posts.json を読み込む
    const latestContainer = document.getElementById('latestPosts');
    const allContainer = document.getElementById('allPosts');
    if (latestContainer || allContainer) {
        loadPosts()
            .then(posts => {
                // 最新記事の表示（トップページ）
                displayLatestPosts(posts);
                // 全記事の表示（記事一覧ページ）
                displayAllPosts(posts);
            })
            .catch(() => {
                if (latestContainer) showPostsError(latestContainer);
                if (allContainer) showPostsError(allContainer);
            });
    }
    
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
        sanitizeHTML
    };
}
