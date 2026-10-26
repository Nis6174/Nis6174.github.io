import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { BuildError, build } from './build.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpRoots = [];
const TODAY = new Date('2026-06-01T00:00:00Z');

after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

const GOOD_MD = `---
title: Hello <World>
date: 2026-01-05
tags: [テスト, "2026"]
excerpt: 要約 & テスト
---

## 見出し

本文 [記事へ](2026-01-05-hello.html) と画像 ![図](../assets/images/a.png)

\`\`\`js
const x = 1;
\`\`\`

\`\`\`
<script>alert(1)</script>
\`\`\`
`;

// 仮のサイトを作る。files: { 相対パス: 内容 }
function site(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'blog-test-'));
  tmpRoots.push(root);
  const all = {
    'index.html': '<html></html>',
    'about.html': '<html></html>',
    'assets/js/main.js': '//',
    'README.md': '# readme',
    'assets/css/style.css': 'body{}',
    'assets/images/a.png': 'png',
    'posts/index.html': '<html></html>',
    'posts/old.html': '<html>old</html>',
    'content/legacy-posts.json': JSON.stringify([{
      title: '旧記事', date: '2025-12-16', excerpt: 'old', tags: ['x'], filename: 'old.html',
    }]),
    '.well-known/security.txt': 'Contact: x',
    '.github/workflows/x.yml': 'x',
    'package.json': '{}',
    ...files,
  };
  for (const [rel, body] of Object.entries(all)) {
    if (body === null) continue;
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  return root;
}

function run(root, opts = {}) {
  return build({
    root, contentDir: path.join(root, 'content/posts'), outDir: path.join(root, '_site'), today: TODAY, ...opts,
  });
}

function errorsOf(root, opts) {
  try { run(root, opts); } catch (e) {
    assert.ok(e instanceof BuildError, e.stack);
    return e.errors.join('\n');
  }
  assert.fail('ビルドが成功してしまった');
}

const md = (frontMatter, body = '## 本文\n\nテキスト\n') => `---\n${frontMatter}\n---\n\n${body}`;
const FM = 'title: T\ndate: 2026-01-05\ntags: [a]\nexcerpt: e';

describe('正常系', () => {
  const root = site({ 'content/posts/2026-01-05-hello.md': GOOD_MD });
  const result = run(root);
  const out = (p) => path.join(root, '_site', p);

  it('記事HTMLを生成し、タイトル・要約・タグをエスケープする', () => {
    const html = readFileSync(out('posts/2026-01-05-hello.html'), 'utf8');
    assert.match(html, /<title>Hello &lt;World&gt; \| Security Research Blog<\/title>/);
    assert.match(html, /<h1 class="article-title">Hello &lt;World&gt;<\/h1>/);
    assert.match(html, /<meta name="description" content="要約 &amp; テスト">/);
    assert.match(html, /<time datetime="2026-01-05">2026年1月5日<\/time>/);
    assert.match(html, /<span class="tag">2026<\/span>/);
    assert.match(html, /<script src="\.\.\/assets\/js\/main\.js">/);
    assert.match(html, /Content-Security-Policy/);
  });

  it('コードをビルド時にハイライトし、コード内の <script> はエスケープされたまま', () => {
    const html = readFileSync(out('posts/2026-01-05-hello.html'), 'utf8');
    assert.match(html, /<span class="hljs-keyword">const<\/span>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
  });

  it('コードブロックの空白・インデントをテンプレートが変えない', () => {
    const body = '## a\n\n```python\ndef f():\n    return 1\n```\n';
    const r = site({ 'content/posts/2026-01-05-a.md': md(FM, body) });
    run(r);
    const html = readFileSync(path.join(r, '_site/posts/2026-01-05-a.html'), 'utf8');
    assert.match(html, /\n    <span class="hljs-keyword">return<\/span>/);
    assert.doesNotMatch(html, /\n {5,}<span class="hljs-keyword">return/);
  });

  it('posts.json は新しい順で、既存記事も含む', () => {
    const posts = JSON.parse(readFileSync(out('assets/data/posts.json'), 'utf8'));
    assert.deepEqual(posts.map((p) => p.filename), ['2026-01-05-hello.html', 'old.html']);
    assert.deepEqual(Object.keys(posts[0]).sort(), ['date', 'excerpt', 'filename', 'tags', 'title']);
    assert.equal(result.posts.length, 2);
  });

  it('既存HTMLと静的ファイルは公開され、ソース類は公開されない', () => {
    assert.ok(existsSync(out('posts/old.html')));
    assert.ok(existsSync(out('index.html')));
    assert.ok(existsSync(out('assets/images/a.png')));
    assert.ok(existsSync(out('.well-known/security.txt')));
    for (const p of ['content', 'scripts', '.github', 'package.json', 'README.md']) {
      assert.ok(!existsSync(out(p)), `${p} が公開物に含まれている`);
    }
  });

  it('再ビルドしても結果が変わらない（出力先は毎回作り直す）', () => {
    writeFileSync(out('stale.txt'), 'x');
    run(root);
    assert.ok(!existsSync(out('stale.txt')));
  });
});

describe('下書き', () => {
  const root = site({ 'content/posts/2026-02-01-wip.md': md(`${FM.replace('2026-01-05', '2026-02-01')}\ndraft: true`) });
  it('通常ビルドでは公開しない', () => {
    run(root);
    assert.ok(!existsSync(path.join(root, '_site/posts/2026-02-01-wip.html')));
    const posts = JSON.parse(readFileSync(path.join(root, '_site/assets/data/posts.json'), 'utf8'));
    assert.ok(!posts.some((p) => p.filename.includes('wip')));
  });
  it('--drafts では含める', () => {
    run(root, { drafts: true });
    assert.ok(existsSync(path.join(root, '_site/posts/2026-02-01-wip.html')));
  });
  it('下書きでも検証はされる', () => {
    const bad = site({ 'content/posts/2026-02-01-wip.md': md('title: T\ndate: 2026-02-01\ntags: [a]\ndraft: true') });
    assert.match(errorsOf(bad), /excerpt/);
  });
  it('draft: "false"（文字列）は誤りとして弾く', () => {
    const bad = site({ 'content/posts/2026-01-05-a.md': md(`${FM}\ndraft: "false"`) });
    assert.match(errorsOf(bad), /draft は true か false/);
  });
  it('_ で始まるファイル（ひな形）は無視する', () => {
    const r = site({ 'content/posts/_template.md': 'not even front matter' });
    assert.equal(run(r).generated.length, 0);
  });
});

describe('Front Matter とファイル名の検証', () => {
  const cases = [
    ['title 欠落', 'date: 2026-01-05\ntags: [a]\nexcerpt: e', /title/],
    ['excerpt 欠落', 'title: T\ndate: 2026-01-05\ntags: [a]', /excerpt/],
    ['tags 欠落', 'title: T\ndate: 2026-01-05\nexcerpt: e', /tags/],
    ['tags が空', 'title: T\ndate: 2026-01-05\ntags: []\nexcerpt: e', /tags/],
    ['tags が文字列', 'title: T\ndate: 2026-01-05\ntags: a\nexcerpt: e', /tags/],
    ['tags が数値', 'title: T\ndate: 2026-01-05\ntags: [2025]\nexcerpt: e', /引用符/],
    ['tags 重複', 'title: T\ndate: 2026-01-05\ntags: [a, a]\nexcerpt: e', /重複/],
    ['日付が実在しない', 'title: T\ndate: 2026-02-31\ntags: [a]\nexcerpt: e', /実在する/],
    ['ファイル名と date の不一致', 'title: T\ndate: 2026-01-06\ntags: [a]\nexcerpt: e', /一致しません/],
    ['未知のキー（typo）', `${FM}\ntag: [b]`, /未知のキー "tag"/],
    ['YAML 不正', 'title: [\n', /YAML が不正/],
  ];
  for (const [name, fm, re] of cases) {
    it(name, () => {
      const root = site({ 'content/posts/2026-01-05-a.md': md(fm) });
      assert.match(errorsOf(root), re);
    });
  }

  it('Front Matter が無い', () => {
    const root = site({ 'content/posts/2026-01-05-a.md': '## 本文' });
    assert.match(errorsOf(root), /Front Matter/);
  });

  for (const bad of ['hello.md', '2026-1-5-a.md', '2026-01-05-Hello.md', '2026-01-05-日本語.md', '2026-01-05-a.txt', '2026-01-05-a.markdown']) {
    it(`不正なファイル名を弾く: ${bad}`, () => {
      const root = site({ [`content/posts/${bad}`]: md(FM) });
      assert.match(errorsOf(root), /ファイル名は YYYY-MM-DD-slug\.md/);
    });
  }

  it('既存HTML記事と同じ出力名は衝突として弾く', () => {
    const root = site({
      'posts/2026-01-05-a.html': '<html></html>',
      'content/posts/2026-01-05-a.md': md(FM),
    });
    assert.match(errorsOf(root), /衝突/);
  });

  it('エラーは1件ずつでなくまとめて報告する', () => {
    const root = site({
      'content/posts/2026-01-05-a.md': md('title: T'),
      'content/posts/2026-01-06-b.md': md('title: T'),
    });
    const msg = errorsOf(root);
    assert.match(msg, /2026-01-05-a\.md/);
    assert.match(msg, /2026-01-06-b\.md/);
  });
});

describe('本文の検証（CSP・リンク）', () => {
  const bodyCases = [
    ['本文の h1', '# 見出し1\n', /h1/],
    ['引用内の h1', '> # 見出し1\n', /h1/],
    ['<script>', '<script>alert(1)</script>\n', /<script>/],
    ['インラインイベント', '<a href="#" onclick="x()">a</a>\n', /イベント属性/],
    ['外部画像', '![x](https://example.com/a.png)\n', /外部画像/],
    ['プロトコル相対の外部画像', '![x](//example.com/a.png)\n', /外部画像/],
    ['存在しない画像', '![x](../assets/images/none.png)\n', /見つかりません/],
    ['記事内で ../ を忘れた画像', '![x](assets/images/a.png)\n', /見つかりません/],
    ['存在しない記事へのリンク', '[x](nothing.html)\n', /見つかりません/],
    ['本文が空', '', /本文が空/],
  ];
  for (const [name, body, re] of bodyCases) {
    it(name, () => {
      const root = site({ 'content/posts/2026-01-05-a.md': md(FM, body) });
      assert.match(errorsOf(root), re);
    });
  }

  it('コードブロック内の # や <script> は誤検知しない', () => {
    const body = '## 見出し\n\n```bash\n# コメント\n<script>x</script>\n```\n\nインライン `<script>` も可\n';
    const root = site({ 'content/posts/2026-01-05-a.md': md(FM, body) });
    assert.equal(run(root).generated.length, 1);
  });

  it('外部リンク・アンカー・既存記事・画像（正しいパス）は通る', () => {
    const body = '## a\n\n[外](https://example.com/) [ページ内](#a) [旧](old.html) [戻る](index.html) ![x](../assets/images/a.png)\n';
    const root = site({ 'content/posts/2026-01-05-a.md': md(FM, body) });
    assert.equal(run(root).generated.length, 1);
  });
});

describe('既存記事メタデータ（legacy-posts.json）', () => {
  it('存在しないファイルを指していたら失敗する', () => {
    const root = site({
      'content/legacy-posts.json': JSON.stringify([{ title: 't', date: '2025-01-01', excerpt: 'e', tags: ['a'], filename: 'missing.html' }]),
    });
    assert.match(errorsOf(root), /missing\.html/);
  });
  it('一覧に載せていない既存HTMLは note を出す（公開はされる）', () => {
    const root = site({ 'posts/unlisted.html': '<html></html>' });
    const r = run(root);
    assert.ok(r.notes.some((n) => n.includes('unlisted.html')));
    assert.ok(existsSync(path.join(root, '_site/posts/unlisted.html')));
  });
});

describe('安全装置', () => {
  it('出力先がリポジトリの外・ルート自身なら拒否する', () => {
    const root = site();
    assert.throws(() => run(root, { outDir: root }), BuildError);
    assert.throws(() => run(root, { outDir: path.join(root, '..', 'elsewhere') }), BuildError);
  });
  it('未来の日付は警告', () => {
    const root = site({ 'content/posts/2030-01-05-a.md': md(FM.replace('2026-01-05', '2030-01-05')) });
    assert.ok(run(root).warnings.some((w) => w.includes('未来')));
  });
});

describe('このリポジトリ自体', () => {
  it('実際のコンテンツがビルドできる', () => {
    const outDir = path.join(REPO_ROOT, '_site');
    const r = build({ root: REPO_ROOT, contentDir: path.join(REPO_ROOT, 'content/posts'), outDir, today: TODAY });
    assert.ok(r.posts.some((p) => p.filename === '2025-12-16-react2shell-cve-2025-55182.html'));
    rmSync(outDir, { recursive: true, force: true });
  });
});
