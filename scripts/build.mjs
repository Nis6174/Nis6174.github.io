// Markdown 記事 → HTML 変換と、公開用ディレクトリ(_site)の組み立て。
//
//   npm run build           通常ビルド（draft: true の記事は除外）
//   npm run build:drafts    下書きも含めてビルド（ローカル確認用）
//
// 既存の手書きHTML記事は posts/ にそのまま置き、content/legacy-posts.json で一覧に載せる。
// 新しい記事は content/posts/YYYY-MM-DD-slug.md に書く。

import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import hljs from 'highlight.js';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import YAML from 'yaml';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_KEYS = new Set(['title', 'date', 'tags', 'excerpt', 'draft']);
const FILENAME_RE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 公開物に含めないもの（それ以外のルート直下のファイル・ディレクトリは公開される）
const EXCLUDE_FROM_SITE = new Set([
  'node_modules', '_site', 'content', 'scripts', 'package.json', 'package-lock.json',
]);
const KEEP_DOTFILES = new Set(['.well-known']);
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export class BuildError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.errors = errors;
  }
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function formatDateJa(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

// 一覧用メタデータ（md の Front Matter と legacy-posts.json で共通）の検証
function validateMeta(meta, label, errors, { allowDraft, allowFilename = false }) {
  const ok = (cond, msg) => { if (!cond) errors.push(`${label}: ${msg}`); return cond; };

  for (const key of Object.keys(meta)) {
    if (!ALLOWED_KEYS.has(key) && !(allowFilename && key === 'filename')) {
      errors.push(`${label}: 未知のキー "${key}"（使えるキー: ${[...ALLOWED_KEYS].join(', ')}）。typo の可能性があります`);
    }
  }
  ok(typeof meta.title === 'string' && meta.title.trim() !== '', 'title は空でない文字列が必要です');
  ok(typeof meta.excerpt === 'string' && meta.excerpt.trim() !== '', 'excerpt は空でない文字列が必要です');
  ok(typeof meta.date === 'string' && isRealDate(meta.date),
    `date は実在する YYYY-MM-DD 形式が必要です（値: ${JSON.stringify(meta.date)}）`);
  if (ok(Array.isArray(meta.tags) && meta.tags.length > 0, 'tags は1つ以上の配列が必要です')) {
    const seen = new Set();
    for (const t of meta.tags) {
      if (typeof t !== 'string' || t.trim() === '') {
        errors.push(`${label}: tags には空でない文字列だけを入れてください（値: ${JSON.stringify(t)}）。数字だけのタグは "2025" のように引用符で囲んでください`);
      } else if (seen.has(t.trim())) {
        errors.push(`${label}: tags に重複があります（${t.trim()}）`);
      } else {
        seen.add(t.trim());
      }
    }
  }
  if ('draft' in meta) {
    ok(allowDraft, 'draft は md 記事でのみ使えます');
    ok(typeof meta.draft === 'boolean', `draft は true か false で書いてください（値: ${JSON.stringify(meta.draft)}）`);
  }
}

function parseFrontMatter(text, label, errors) {
  const m = text.replace(/^﻿/, '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/);
  if (!m) {
    errors.push(`${label}: ファイル先頭に Front Matter（--- で囲んだ YAML）が必要です`);
    return null;
  }
  let meta;
  try {
    // core スキーマ: 日付が Date 型に変換されない（タイムゾーンずれ防止）
    meta = YAML.parse(m[1], { schema: 'core', uniqueKeys: true });
  } catch (e) {
    errors.push(`${label}: Front Matter の YAML が不正です: ${e.message.split('\n')[0]}`);
    return null;
  }
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    errors.push(`${label}: Front Matter は key: value の形式で書いてください`);
    return null;
  }
  return { meta, body: m[2] ?? '' };
}

function createRenderer() {
  return new Marked(
    markedHighlight({
      langPrefix: 'hljs language-',
      emptyLangClass: 'hljs',
      highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        }
        return escapeHtml(code);
      },
    }),
    {
      gfm: true,
      walkTokens(token) {
        if (token.type === 'heading' && token.depth === 1) {
          throw new Error(`本文に # (h1) は使えません。タイトルは Front Matter の title から出力されるため、本文は ## から始めてください（見出し: "${token.text}"）`);
        }
      },
    },
  );
}

// 生成HTMLのうち、このサイトのCSP（script-src 'self'; img-src 'self' data:）で動かないものを検出
function lintHtml(html, label, errors) {
  if (/<script[\s>]/i.test(html)) {
    errors.push(`${label}: <script> は CSP で実行されないため使えません`);
  }
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) {
    errors.push(`${label}: onclick などのインラインイベント属性は CSP で動かないため使えません`);
  }
  for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*"((?:https?:)?\/\/[^"]*)"/gi)) {
    errors.push(`${label}: 外部画像は CSP (img-src 'self' data:) でブロックされます。画像は assets/ に置いてください（${m[1]}）`);
  }
}

// 相対パスのリンク・画像が公開物の中に実在するか確認
function checkLocalRefs(html, pageFile, outDir, label, errors) {
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/gi)) {
    const ref = m[1];
    if (ref === '' || ref.startsWith('#') || ref.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
    let rel;
    try { rel = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { rel = ref.split(/[?#]/)[0]; }
    let target = rel.startsWith('/') ? path.join(outDir, rel) : path.resolve(path.dirname(pageFile), rel);
    if (rel.endsWith('/')) target = path.join(target, 'index.html');
    const inside = path.relative(outDir, target);
    if (inside.startsWith('..') || path.isAbsolute(inside) || !existsSync(target)) {
      errors.push(`${label}: リンク先が見つかりません: ${ref}（記事は posts/ 配下に出力されるので、画像は ../assets/... のように指定します）`);
    }
  }
}

function listSiteEntries(root, outDir) {
  return readdirSync(root).filter((name) => {
    if (EXCLUDE_FROM_SITE.has(name) || path.resolve(root, name) === outDir) return false;
    if (name.startsWith('.') && !KEEP_DOTFILES.has(name)) return false;
    if (/^README.*\.md$/i.test(name)) return false;
    return !IGNORED_FILES.has(name);
  });
}

export function build({ root, contentDir, outDir, drafts = false, today = new Date() }) {
  const errors = [];
  const warnings = [];
  const notes = [];

  root = path.resolve(root);
  outDir = path.resolve(outDir);
  contentDir = path.resolve(contentDir);
  const rel = path.relative(root, outDir);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new BuildError([`出力先 ${outDir} はリポジトリ内の別ディレクトリにしてください`]);
  }

  const template = readFileSync(path.join(SCRIPT_DIR, 'post-template.html'), 'utf8');
  const renderer = createRenderer();
  const staticPostsDir = path.join(root, 'posts');
  const staticPostFiles = existsSync(staticPostsDir)
    ? readdirSync(staticPostsDir).filter((f) => f.endsWith('.html')) : [];

  // --- 既存HTML記事（一覧用メタデータ）---
  const entries = [];
  const legacyPath = path.join(root, 'content', 'legacy-posts.json');
  const listedLegacy = new Set();
  if (existsSync(legacyPath)) {
    let legacy = [];
    try { legacy = JSON.parse(readFileSync(legacyPath, 'utf8')); } catch (e) {
      errors.push(`content/legacy-posts.json: JSON が不正です: ${e.message}`);
    }
    if (!Array.isArray(legacy)) {
      errors.push('content/legacy-posts.json: 配列である必要があります');
      legacy = [];
    }
    legacy.forEach((p, i) => {
      const label = `content/legacy-posts.json[${i}]`;
      validateMeta(p, label, errors, { allowDraft: false, allowFilename: true });
      if (typeof p.filename !== 'string' || !staticPostFiles.includes(p.filename) || p.filename === 'index.html') {
        errors.push(`${label}: filename に指定した posts/${p.filename ?? '(未指定)'} が存在しません`);
        return;
      }
      if (listedLegacy.has(p.filename)) errors.push(`${label}: filename が重複しています（${p.filename}）`);
      listedLegacy.add(p.filename);
      entries.push({ title: p.title, date: p.date, excerpt: p.excerpt, tags: p.tags, filename: p.filename });
    });
  }
  for (const f of staticPostFiles) {
    if (f !== 'index.html' && !listedLegacy.has(f)) {
      notes.push(`posts/${f} は legacy-posts.json に無いため、公開はされますが一覧には載りません`);
    }
  }

  // --- Markdown 記事 ---
  const generated = []; // { filename, html }
  const seenFilenames = new Set(entries.map((e) => e.filename));
  const mdNames = existsSync(contentDir)
    ? readdirSync(contentDir).filter((f) => !f.startsWith('_') && !f.startsWith('.')).sort() : [];
  const todayStr = today.toISOString().slice(0, 10);
  const futureLimit = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);

  for (const name of mdNames) {
    const label = `content/posts/${name}`;
    const fm = FILENAME_RE.exec(name);
    if (!fm) {
      errors.push(`${label}: ファイル名は YYYY-MM-DD-slug.md（slug は半角小文字英数字とハイフンのみ）にしてください。md 以外のファイルは content/posts/ に置けません`);
      continue;
    }
    const before = errors.length;
    const parsed = parseFrontMatter(readFileSync(path.join(contentDir, name), 'utf8'), label, errors);
    if (!parsed) continue;
    const { meta, body } = parsed;
    validateMeta(meta, label, errors, { allowDraft: true });
    if (typeof meta.date === 'string' && meta.date !== fm[1]) {
      errors.push(`${label}: ファイル名の日付(${fm[1]})と Front Matter の date(${meta.date}) が一致しません`);
    }
    if (body.trim() === '') errors.push(`${label}: 本文が空です`);

    const filename = name.replace(/\.md$/, '.html');
    if (staticPostFiles.includes(filename) || filename === 'index.html' || seenFilenames.has(filename)) {
      errors.push(`${label}: 出力先 posts/${filename} が既存ファイルと衝突します`);
    }
    seenFilenames.add(filename);

    if (errors.length > before) continue; // この記事に問題があれば変換はしない

    if (meta.draft === true && !drafts) {
      notes.push(`${label} は draft: true のため公開しません`);
      continue;
    }
    if (meta.date > futureLimit) warnings.push(`${label}: date(${meta.date}) が未来の日付です`);

    let contentHtml;
    try {
      contentHtml = renderer.parse(body);
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
      continue;
    }
    lintHtml(contentHtml, label, errors);

    const tags = meta.tags.map((t) => `                        <span class="tag">${escapeHtml(t.trim())}</span>`).join('\n');
    const page = template
      .replaceAll('{{description}}', () => escapeHtml(meta.excerpt))
      .replaceAll('{{title}}', () => escapeHtml(meta.title))
      .replaceAll('{{date_iso}}', () => meta.date)
      .replaceAll('{{date_ja}}', () => formatDateJa(meta.date))
      .replaceAll('{{year}}', () => String(today.getUTCFullYear()))
      .replaceAll('{{tags}}', () => tags)
      // <pre> 内の空白は意味を持つので、本文にはインデントを足さずそのまま埋め込む
      .replaceAll('{{content}}', () => contentHtml.trim());
    generated.push({ filename, html: page, label });
    entries.push({
      title: meta.title.trim(), date: meta.date, excerpt: meta.excerpt.trim(),
      tags: meta.tags.map((t) => t.trim()), filename,
    });
    if (meta.draft === true) notes.push(`${label} は下書きですが --drafts 指定のためビルドに含めました`);
  }

  if (errors.length) throw new BuildError(errors);

  // --- 出力ディレクトリの組み立て ---
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const name of listSiteEntries(root, outDir)) {
    cpSync(path.join(root, name), path.join(outDir, name), {
      recursive: true,
      filter: (src) => !IGNORED_FILES.has(path.basename(src)),
    });
  }
  mkdirSync(path.join(outDir, 'posts'), { recursive: true });
  for (const g of generated) writeFileSync(path.join(outDir, 'posts', g.filename), g.html);

  entries.sort((a, b) => (a.date === b.date ? (a.filename < b.filename ? 1 : -1) : (a.date < b.date ? 1 : -1)));
  mkdirSync(path.join(outDir, 'assets', 'data'), { recursive: true });
  writeFileSync(path.join(outDir, 'assets', 'data', 'posts.json'), `${JSON.stringify(entries, null, 2)}\n`);

  // --- 生成物のリンク・画像チェック（出力ツリーに対して行う）---
  for (const g of generated) {
    checkLocalRefs(g.html, path.join(outDir, 'posts', g.filename), outDir, g.label, errors);
  }
  if (errors.length) throw new BuildError(errors);

  return { posts: entries, generated: generated.map((g) => g.filename), warnings, notes, today: todayStr };
}

// --- CLI ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: path.resolve(SCRIPT_DIR, '..') },
      content: { type: 'string' },
      out: { type: 'string' },
      drafts: { type: 'boolean', default: false },
    },
  });
  const root = path.resolve(values.root);
  try {
    const result = build({
      root,
      contentDir: values.content ?? path.join(root, 'content', 'posts'),
      outDir: values.out ?? path.join(root, '_site'),
      drafts: values.drafts,
    });
    for (const n of result.notes) console.log(`note: ${n}`);
    for (const w of result.warnings) console.warn(`warning: ${w}`);
    console.log(`OK: ${result.posts.length} 件を一覧に掲載（Markdown から生成: ${result.generated.length} 件）`);
  } catch (e) {
    if (e instanceof BuildError) {
      console.error(`ビルド失敗（${e.errors.length} 件のエラー）:`);
      for (const m of e.errors) console.error(`  - ${m}`);
      process.exit(1);
    }
    throw e;
  }
}
