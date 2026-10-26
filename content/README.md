# 記事の書き方（Markdown）

新しい記事は `content/posts/` に Markdown で書きます。push（main へのマージ）すると GitHub Actions が HTML に変換して公開します。
既存のHTML記事（`posts/*.html`）は変換対象外で、そのまま公開され続けます。

## 手順

1. `content/posts/_template.md` をコピーして `content/posts/YYYY-MM-DD-slug.md` を作る
   - ファイル名の日付と、Front Matter の `date` は同じにする
   - `slug` は半角小文字英数字とハイフンのみ（例: `2026-01-05-cve-2026-0001-notes.md`）
   - 公開URLは `/posts/YYYY-MM-DD-slug.html` になる
2. Front Matter と本文を書く
3. ローカルで確認する場合: `npm ci` → `npm run build:drafts` → `_site/` を静的サーバーで開く（例: `npx http-server _site`）
4. 公開する準備ができたら `draft: true` の行を消して push

## Front Matter

| キー | 必須 | 内容 |
|---|---|---|
| `title` | ○ | 記事タイトル |
| `date` | ○ | `YYYY-MM-DD`（引用符なしでOK） |
| `tags` | ○ | 1つ以上。例: `[脆弱性解析, React]`。数字だけのタグは `"2025"` のように引用符で囲む |
| `excerpt` | ○ | 一覧カードと `<meta name="description">` に使う要約 |
| `draft` | | `true` で公開しない（`false` と書くか、行ごと削除で公開） |

これ以外のキーはエラーになります（typo 防止）。

## 本文のルール

- 見出しは `##` から（`#` はエラー。タイトルは `title` から出力される）
- コードブロックは言語名を付けるとビルド時に色付けされる（JavaScript 不要）
- 画像は `assets/images/` に置き、`../assets/images/xxx.png` で指定する
  （記事は `posts/` 配下に出力されるため `../` が必要）
- サイトの CSP（`script-src 'self'; img-src 'self' data:`）に合わせ、次はビルドエラーになる
  - `<script>`、`onclick` などのインラインイベント属性
  - 外部URLの画像（`![](https://...)`）
- 存在しないファイルへの相対リンク・画像もエラーになる
- 外部リンクの `target="_blank"` / `rel` は、ページ読み込み時に `main.js` が自動で付ける

## 既存HTML記事を一覧に載せる

`content/legacy-posts.json` に `title` / `date` / `excerpt` / `tags` / `filename` を書く。
一覧に載せたくない記事は載せなければよい（ファイル自体は公開される。削除したい場合は `posts/` から消す）。
