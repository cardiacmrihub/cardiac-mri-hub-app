#!/usr/bin/env node
// Builds content/guides.json from the Markdown guides in content/guides/.
// Run from the project folder:  node scripts/build-content.mjs
// No dependencies — plain Node 18+.

import { readFileSync, writeFileSync, readdirSync, existsSync, openSync, readSync, closeSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content");
const GUIDES_DIR = join(CONTENT, "guides");
const IMAGES_DIR = join(CONTENT, "images");

const warnings = [];
const warn = (msg) => warnings.push(msg);

// ---------- front matter ----------
function parseFrontMatter(src, file) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw;
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) { warn(`${file}: front matter line not understood: "${raw}"`); continue; }
    data[kv[1]] = parseValue(stripComment(kv[2].trim()));
  }
  return { data, body: src.slice(m[0].length) };
}
// "draft: true   # hide it until ready" → "true". A # inside quotes, or without a space before it, stays.
function stripComment(v) {
  const q = v[0];
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    return end > 0 && /^\s*(#.*)?$/.test(v.slice(end + 1)) ? v.slice(0, end + 1) : v;
  }
  return v.replace(/\s+#.*$/, "");
}
function parseValue(v) {
  if (v === "") return "";
  if (/^(true|yes)$/i.test(v)) return true;
  if (/^(false|no)$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    return v.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean);
  }
  return unquote(v);
}
function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

// ---------- image helpers ----------
const VIDEO_RE = /\.(mp4|m4v|webm|mov)$/i;
function resolveImage(src) {
  // Guides reference images as ../images/name.png and videos as ../videos/name.mp4
  // (so they preview in any Markdown editor).
  // Addresses start at the site root ("/content/…") so they work from every page.
  if (/^https?:\/\//.test(src)) return { url: src, local: null };
  const v = src.match(/^(?:\.\.\/)?(?:\/?content\/)?videos\/(.+)$/);
  if (v) return { url: `/content/videos/${v[1]}`, local: join(CONTENT, "videos", v[1]) };
  const name = src.replace(/^(\.\.\/)?(\/?content\/)?images\//, "");
  const local = join(IMAGES_DIR, name);
  return { url: `/content/images/${name}${imageVersion(local)}`, local };
}
// "?v=" + a short fingerprint of the file, so an image replaced under the same name gets a new
// address and phones that saved the old one fetch the new one (the offline helper keys on it).
const versions = new Map();
function imageVersion(file) {
  if (!versions.has(file)) {
    let v = "";
    try { v = `?v=${createHash("md5").update(readFileSync(file)).digest("hex").slice(0, 8)}`; } catch { /* missing: the build warns */ }
    versions.set(file, v);
  }
  return versions.get(file);
}
function imageSize(file) {
  try {
    const fd = openSync(file, "r");
    const buf = Buffer.alloc(64 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    // PNG
    if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    // JPEG: walk segments to SOFn
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < n - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    // WebP (VP8X / VP8 / VP8L)
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
    }
  } catch { /* fall through */ }
  return null;
}

// ---------- Markdown → HTML (the subset guides use) ----------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function inline(text, ctx) {
  // Protect code spans first.
  const codes = [];
  const escapes = [];
  let s = text.replace(/\\([\\`*_[\]#>!-])/g, (_, c) => { escapes.push(c); return `\u0001${escapes.length - 1}\u0001`; });
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  // Images inside a line of text.
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src) => {
    const img = resolveImage(src.replace(/&amp;/g, "&"));
    ctx.images.add(img.url);
    return `<img src="${esc(img.url)}" alt="${alt}" loading="lazy" class="inline-img">`;
  });
  // Links.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const url = href.replace(/&amp;/g, "&");
    const external = /^https?:\/\//.test(url);
    return `<a href="${esc(url)}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
  });
  // Bold, then italic.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");
  // Hard line breaks (two trailing spaces or backslash).
  s = s.replace(/( {2,}|\\)\n/g, "<br>\n");
  return s
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i]).replace(/\u0001(\d+)\u0001/g, (__, k) => "\\" + esc(escapes[+k]))}</code>`)
    .replace(/\u0001(\d+)\u0001/g, (_, i) => esc(escapes[+i]));
}

function figure(alt, src, caption, ctx) {
  const img = resolveImage(src);
  if (VIDEO_RE.test(src)) {
    // ![caption](../videos/clip.mp4 "caption") → an inline, looping cine clip.
    ctx.videos.add(img.url);
    if (img.local && !existsSync(img.local)) warn(`${ctx.file}: video not found: ${src}`);
    const capHtml = caption ? inline(caption, ctx) : "";
    const cap = capHtml ? `<figcaption>${capHtml}</figcaption>` : "";
    const label = alt || caption || "Cine clip";
    ctx.figures.push({ type: "video", src: img.url, alt: label, captionHtml: capHtml, section: ctx.section });
    return `<figure class="video"><video src="${esc(img.url)}" controls loop muted playsinline preload="metadata" aria-label="${esc(label)}"></video>${cap}</figure>`;
  }
  ctx.images.add(img.url);
  let dims = "";
  let sz = null;
  if (img.local) {
    if (!existsSync(img.local)) warn(`${ctx.file}: image not found: ${src}`);
    else {
      sz = imageSize(img.local);
      if (sz) dims = ` width="${sz.w}" height="${sz.h}"`;
    }
  }
  const capHtml = caption ? inline(caption, ctx) : "";
  const cap = capHtml ? `<figcaption>${capHtml}</figcaption>` : "";
  // Every image and clip, in order, also feeds the guide's swipeable quick plan.
  ctx.figures.push({ type: "image", src: img.url, alt, captionHtml: capHtml, section: ctx.section, ...(sz ? { w: sz.w, h: sz.h } : {}) });
  return `<figure><img src="${esc(img.url)}" alt="${esc(alt)}"${dims} loading="lazy">${cap}</figure>`;
}

function markdownToHtml(md, ctx) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlank = (l) => !l || !l.trim();
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    // Fenced code
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = Math.min(6, h[1].length + 1); // # in a guide renders as h2 (the guide title is the page's h1)
      const html = inline(h[2], ctx);
      const id = slugify(h[2]);
      if (level === 2) {
        ctx.headings.push({ id, text: h[2].replace(/[*_`]/g, "") });
        ctx.section = h[2].replace(/[*_`\\]/g, "");
      }
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++;
      continue;
    }
    // Horizontal rule
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) { out.push("<hr>"); i++; continue; }
    // Standalone image → figure
    const fig = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
    if (fig) { out.push(figure(fig[1], fig[2], fig[3], ctx)); i++; continue; }
    // Raw HTML block
    if (/^\s*<(details|div|table|figure|iframe|video|aside|p|ul|ol)\b/i.test(line)) {
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join("\n"));
      continue;
    }
    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${markdownToHtml(buf.join("\n"), ctx)}</blockquote>`);
      continue;
    }
    // Table
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      const aligns = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !isBlank(lines[i])) rows.push(cells(lines[i++]));
      const al = (k) => (aligns[k] ? ` style="text-align:${aligns[k]}"` : "");
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c, k) => `<th${al(k)}>${inline(c, ctx)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c, k) => `<td${al(k)}>${inline(c, ctx)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      );
      continue;
    }
    // List (supports nesting by indentation)
    if (listRe.test(line)) {
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(listRe);
        if (m) { items.push({ indent: m[1].replace(/\t/g, "    ").length, ordered: /\d/.test(m[2]), start: parseInt(m[2], 10), text: m[3] }); i++; continue; }
        if (!isBlank(l) && /^\s+\S/.test(l) && items.length) { items[items.length - 1].text += " " + l.trim(); i++; continue; }
        break;
      }
      out.push(renderList(items, ctx));
      continue;
    }
    // Paragraph
    const buf = [];
    while (
      i < lines.length && !isBlank(lines[i]) &&
      !/^(#{1,6}\s|```|\s*>|!\[[^\]]*\]\([^)]+\)\s*$)/.test(lines[i]) &&
      !listRe.test(lines[i]) && !/^(\s*[-*_]\s*){3,}$/.test(lines[i])
    ) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join("\n"), ctx)}</p>`);
  }
  return out.join("\n");
}

function renderList(items, ctx) {
  let html = "";
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) {
      html += `</li></${stack.pop().tag}>`;
    }
    const top = stack[stack.length - 1];
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? "ol" : "ul";
      stack.push({ indent: it.indent, tag });
      // A numbered list that picks up after an image ("2. …") keeps counting from where it left off.
      html += `<${tag}${it.ordered && it.start > 1 ? ` start="${it.start}"` : ""}><li>`;
    } else {
      html += `</li><li>`;
    }
    html += inline(it.text, ctx);
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

const toText = (html) =>
  html.replace(/<figcaption>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// ---------- build ----------
const site = JSON.parse(readFileSync(join(CONTENT, "site.json"), "utf8"));
site.url = String(site.url || "").replace(/\/+$/, "");
const topicsPath = join(CONTENT, "topics.json");
const topics = existsSync(topicsPath) ? JSON.parse(readFileSync(topicsPath, "utf8")) : [];
const topicSlugs = new Set(topics.map((t) => t.slug));

const files = existsSync(GUIDES_DIR) ? readdirSync(GUIDES_DIR).filter((f) => f.endsWith(".md")).sort() : [];
const guides = [];
const bodies = new Map(); // slug → Markdown body, for the parameters page
let landmarkSource = null; // the guide whose front matter says `landmarks: true` (3-point planning)
let glossarySource = null; // the guide whose front matter says `glossary: true` (abbreviations)
let protocolSource = null; // the guide whose front matter says `protocols: true` (exam flow)
let examFlow = false;      // its `examFlow: true` turns on the /flow/ checklist and contrast clock
// Guides in these topics only aren't planning walkthroughs, so they get no quick plan
// unless their front matter says `quickPlan: true` (and `quickPlan: false` hides one).
const NOT_PLANNING = new Set(["technique", "getting-started"]);
const seen = new Set();

for (const f of files) {
  const src = readFileSync(join(GUIDES_DIR, f), "utf8");
  const { data, body } = parseFrontMatter(src, f);
  if (data.draft === true) continue;
  const slug = data.slug || basename(f, ".md");
  if (seen.has(slug)) throw new Error(`Two guides use the slug "${slug}" — every guide needs its own.`);
  seen.add(slug);
  if (!data.title) warn(`${f}: missing title`);
  if (data.landmarks === true) landmarkSource = slug;
  if (data.glossary === true) glossarySource = slug;
  if (data.protocols === true) { protocolSource = slug; examFlow = data.examFlow === true; }

  const ctx = { file: f, images: new Set(), videos: new Set(), headings: [], figures: [], section: "" };
  bodies.set(data.slug || basename(f, ".md"), body);
  const html = foldMoreDetail(markdownToHtml(body, ctx));
  const text = toText(html);
  const words = text.split(" ").filter(Boolean).length;
  const guideTopics = [].concat(data.topics || data.topic || []);
  for (const t of guideTopics) if (!topicSlugs.has(t)) warn(`${f}: topic "${t}" isn't listed in content/topics.json`);

  let cover = null;
  let coverWide = false; // small covers (Wix thumbnails) look blurry stretched across the guide, so they stay in lists only
  if (data.cover) {
    const img = resolveImage(String(data.cover));
    if (img.local && !existsSync(img.local)) warn(`${f}: cover image not found: ${data.cover}`);
    else if (img.local) coverWide = (imageSize(img.local)?.w || 0) >= 600;
    cover = img.url;
    ctx.images.add(img.url);
  }

  guides.push({
    slug,
    title: data.title || slug,
    shortTitle: data.shortTitle || "",
    summary: data.summary || text.slice(0, 220),
    topics: guideTopics,
    published: data.published ? String(data.published) : "",
    updated: data.updated ? String(data.updated) : data.published ? String(data.published) : "",
    startHere: data.startHere === true,
    order: typeof data.order === "number" ? data.order : null,
    sourceUrl: data.sourceUrl || "",
    cover,
    coverWide,
    preview: existsSync(join(CONTENT, "previews", `${slug}.jpg`)) ? `/content/previews/${slug}.jpg${imageVersion(join(CONTENT, "previews", `${slug}.jpg`))}` : cover,
    minutes: Math.max(1, Math.round(words / 200)),
    headings: ctx.headings,
    images: [...ctx.images],
    videos: [...ctx.videos],
    figures: ctx.figures,
    quickPlan:
      typeof data.quickPlan === "boolean"
        ? data.quickPlan && ctx.figures.length > 0
        : ctx.figures.length >= 1 && guideTopics.some((t) => !NOT_PLANNING.has(t)),
    html,
    text,
  });
}

guides.sort((a, b) => (b.published || "").localeCompare(a.published || "") || a.title.localeCompare(b.title));

// ---------- LV parameters at a glance (content/parameters.json) ----------
// Built from the "Summary Table" at the end of each listed guide, so editing a guide's table
// updates this page on the next build.
function summaryTable(body) {
  return tableUnder(body, /^#{1,6}\s+Summary Table/i);
}

// The first Markdown table under the first heading that matches `headingRe`.
function tableUnder(body, headingRe) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) return null;
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith("|")) {
    if (/^#{1,6}\s/.test(lines[i])) return null;
    i++;
  }
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = cells(lines[i] || "");
  const rows = [];
  for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]));
  return { heading: lines[start].replace(/^#+\s*/, ""), header, rows };
}

function noteHtml(title, path) {
  if (!site.disclaimer && !site.feedbackEmail) return "";
  const mail = site.feedbackEmail
    ? `<a class="btn secondary" href="mailto:${esc(site.feedbackEmail)}?subject=${encodeURIComponent(`Correction: ${title}`)}&amp;body=${encodeURIComponent(`Page: ${site.url}${path}\n\nWhat should change:\n\n`)}">Suggest a correction</a>`
    : "";
  return `<aside class="guide-note">${site.disclaimer ? `<p>${esc(site.disclaimer)}</p>` : ""}${mail}</aside>`;
}

// ---------- 3-point planning landmarks ----------
// The guide marked `landmarks: true` has a table under a "Landmarks" heading: view (a link to its guide),
// the three points, and which image each goes on. Each linked guide shows its row near the top, and the
// parameters page and planning cards repeat it, so the table is the one place to edit.
const landmarks = new Map(); // guide slug → { points, placeOn }
let landmarkGuide = null;
if (landmarkSource) {
  landmarkGuide = guides.find((g) => g.slug === landmarkSource);
  const t = tableUnder(bodies.get(landmarkSource), /^#{1,6}\s+.*landmarks/i);
  if (!t) warn(`${landmarkSource}: landmarks: true, but no table under a "Landmarks" heading`);
  for (const r of t?.rows || []) {
    const m = /\(\/guide\/([^/)]+)\/?\)/.exec(r[0] || "");
    if (!m) { warn(`${landmarkSource}: landmarks row "${r[0]}" doesn't link to a guide`); continue; }
    if (!guides.some((g) => g.slug === m[1])) { warn(`${landmarkSource}: landmarks row links to a missing guide "${m[1]}"`); continue; }
    landmarks.set(m[1], { points: (r[1] || "").replace(/\.$/, ""), placeOn: (r[2] || "").replace(/\.$/, "") });
  }
}
const lmCtx = () => ({ file: "landmarks", images: new Set(), videos: new Set(), headings: [], figures: [], section: "" });
const landmarkText = (l) => `${inline(l.points, lmCtx())}. ${inline(l.placeOn, lmCtx())}.`;
for (const g of guides) {
  const l = landmarks.get(g.slug);
  g.landmarksHtml = l && landmarkGuide
    ? `<div class="guide-points"><p><strong>3-point planning:</strong> ${landmarkText(l)}</p><a href="/guide/${landmarkGuide.slug}/">Landmarks for every view</a></div>`
    : "";
}

// ---------- Abbreviations ----------
// Every table row in the guide marked `glossary: true` (Abbreviation | Stands for | Notes). Search shows
// the meaning when someone types an abbreviation on its own.
// A "# More detail" heading folds everything after it into a closed section, so a guide can open with the
// steps a tech needs at the console and keep the background a tap away. The section keeps the heading's id, so
// "In this guide" links still reach it (the app opens it on the way).
function foldMoreDetail(html) {
  const m = /<h2 id="more-detail">More detail<\/h2>/.exec(html);
  if (!m) return html;
  const rest = html.slice(m.index + m[0].length);
  const sections = (rest.match(/<h2[ >]/g) || []).length;
  // Only a "… Settings" table is called the settings table (the short-axis samples end with a slice-level table).
  const table = !/<table/.test(rest) ? "" : /<h2[^>]*>[^<]*settings/i.test(rest) ? ", with the full settings table" : ", with a summary table";
  const hint = sections ? `${sections} more ${sections === 1 ? "section" : "sections"}${table}` : "";
  return `${html.slice(0, m.index)}<details class="more-detail" id="more-detail"><summary><span class="more-title">More detail</span>${hint ? `<span class="more-hint">${hint}</span>` : ""}</summary>${rest}</details>`;
}

let glossary = null;
// The first use of each abbreviation in a guide becomes <abbr title data-abbr>: a hover shows the meaning, and in
// the app a tap opens it with the note. Links, headings, captions and code are left alone, and abbreviations with
// two common meanings in cardiac MRI (AS, PV, MR, CS) are skipped so a tap never shows the wrong one.
const ABBR_SKIP = new Set(["MRI", "CINE", "AS", "PV", "MR", "CS"]);
function markAbbreviations(html, entries) {
  const forms = new Map();
  for (const e of entries) for (const f of e.abbr.split(/,\s*/)) if (f && !ABBR_SKIP.has(f)) forms.set(f, e);
  const alts = [...forms.keys()].sort((a, b) => b.length - a.length).map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!alts.length) return html;
  const re = new RegExp(`(?<![A-Za-z0-9-])(${alts.join("|")})(?![A-Za-z0-9])`, "g");
  const SKIP = /^(a|abbr|h[1-6]|figcaption|code|pre|button|th|script|style)$/i;
  const seen = new Set();
  let depth = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith("<")) {
      const m = /^<(\/?)([a-z0-9]+)/i.exec(part);
      if (m && SKIP.test(m[2]) && !part.endsWith("/>")) depth = Math.max(0, depth + (m[1] ? -1 : 1));
      return part;
    }
    if (depth || !part.trim()) return part;
    return part.replace(re, (w) => {
      const e = forms.get(w);
      if (!e || seen.has(e)) return w;
      seen.add(e);
      return `<abbr title="${esc(e.meaning)}" data-abbr="${esc(w)}" tabindex="0">${w}</abbr>`;
    });
  }).join("");
}
if (glossarySource) {
  const g = guides.find((x) => x.slug === glossarySource);
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const entries = [];
  let heading = "";
  for (const line of bodies.get(glossarySource).split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { heading = h[1].trim(); continue; }
    const t = line.trim();
    if (!t.startsWith("|") || /^\|\s*:?-{3,}/.test(t)) continue;
    const r = cells(t);
    if (!r[0] || !r[1] || /^abbreviation$/i.test(r[0])) continue;
    const id = g.headings.find((x) => x.text === heading)?.id;
    entries.push({
      abbr: r[0],
      keys: r[0].split(/[,/]/).map((k) => k.trim().toLowerCase().replace(/[\s-]+/g, "")).filter(Boolean),
      meaning: inline(r[1], lmCtx()),
      note: r[2] ? inline(r[2], lmCtx()) : "",
      href: `/guide/${g.slug}/${id ? `#${id}` : ""}`,
    });
  }
  glossary = { slug: g.slug, title: g.shortTitle || g.title, entries };
  for (const x of guides) if (x.slug !== glossarySource) x.html = markAbbreviations(x.html, entries);
}

// ---------- Protocols and the exam flow ----------
// In the guide marked `protocols: true`, each "#" section is a protocol; a paragraph that is only bold text
// starts a group ("Before contrast"); numbered items are the steps. A step that mentions the injection gets
// the "Contrast in" button, and "N minutes after contrast" makes it a timed step on the exam-flow clock.
let protocols = null;
if (protocolSource) {
  const g = guides.find((x) => x.slug === protocolSource);
  const list = [];
  const common = { groups: [] }; // "# Every exam starts with": steps that open every protocol
  let cur = null;
  let group = null;
  for (const line of bodies.get(protocolSource).split(/\r?\n/)) {
    const h = /^#\s+(.*)$/.exec(line);
    if (h && /^(every exam|all exams)/i.test(h[1].trim())) { cur = common; group = null; continue; }
    if (h) {
      const name = h[1].trim();
      cur = { id: g.headings.find((x) => x.text === name)?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, groups: [] };
      list.push(cur);
      group = null;
      continue;
    }
    if (!cur) continue;
    const label = /^\*\*([^*]+)\*\*\s*$/.exec(line.trim());
    if (label) { group = { label: label[1].trim(), steps: [] }; cur.groups.push(group); continue; }
    const item = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (item) {
      if (!group) { group = { label: "", steps: [] }; cur.groups.push(group); }
      const text = item[1].trim();
      // A timed step says "10 minutes after contrast" (or "after the injection", or "after the stress injection" when
      // there's a stress and a rest injection). A range like "1–3 minutes" times the step from its first number.
      const at = /(\d+)(?:\s*[–-]\s*\d+)?\s*min(?:ute)?s?\s+after\s+(?:the\s+)?(?:stress\s+|first\s+)?(?:contrast|injection)/i.exec(text);
      // The contrast step (where the clock starts) is the first one that mentions the injection itself,
      // not one timed from it ("after the stress injection").
      const contrast = !cur.hasContrast && /\binject/i.test(text) && !/after\s+(?:the\s+)?(?:\w+\s+)?inject/i.test(text);
      if (contrast) { cur.hasContrast = true; if (/\bstress\b/i.test(text)) cur.clockFrom = "stress agent"; }
      // A stable key from the step's words, so changes saved on a device (hidden or moved steps, ticks, times)
      // still find the step after the protocol is edited around it.
      const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "").trim();
      const key = createHash("md5").update(plain.toLowerCase()).digest("hex").slice(0, 8);
      group.steps.push({ key, html: inline(text, lmCtx()), contrast, atMin: at ? Number(at[1]) : null });
    }
  }
  const opening = common.groups.map((x) => ({ ...x, label: x.label || "Localizers" }));
  for (const p of list) {
    p.groups = [...opening, ...p.groups];
    delete p.hasContrast;
    // Two steps with the same words in one protocol get distinct keys.
    const seen = new Map();
    p.groups = p.groups.map((g) => ({ ...g, steps: g.steps.map((st) => {
      const n = seen.get(st.key) || 0;
      seen.set(st.key, n + 1);
      return n ? { ...st, key: `${st.key}-${n}` } : st;
    }) }));
  }
  protocols = { slug: g.slug, flow: examFlow, list: list.filter((p) => p.groups.some((x) => x.steps.length)) };
  if (!protocols.list.length) { warn(`${protocolSource}: protocols: true, but no numbered steps found`); protocols = null; }
}

let parameters = null;
const paramsPath = join(CONTENT, "parameters.json");
if (existsSync(paramsPath)) {
  const cfg = JSON.parse(readFileSync(paramsPath, "utf8"));
  const pctx = { file: "parameters.json", images: new Set(), videos: new Set(), headings: [], figures: [], section: "" };
  const md = (s) => inline(s, pctx);
  const gHref = (slug) => `/guide/${encodeURIComponent(slug)}/`;
  const norm = (s) => s.replace(/[‐-―]/g, "-").replace(/[​\s]+/g, " ").replace(/[.\s]+$/, "").trim().toLowerCase();
  const views = [];
  for (const v of cfg.views || []) {
    const t = bodies.has(v.guide) ? summaryTable(bodies.get(v.guide)) : null;
    if (!t) { warn(`parameters.json: no summary table found in ${v.guide}`); continue; }
    views.push({ ...v, rows: t.rows.filter((r) => r[0]).map((r) => [r[0], r[1] || ""]) });
  }
  const order = [];
  const byParam = new Map();
  for (const v of views) {
    for (const [name, value] of v.rows) {
      const key = norm(name);
      if (!byParam.has(key)) { byParam.set(key, { name, values: [] }); order.push(key); }
      byParam.get(key).values.push({ view: v, value });
    }
  }
  // A setting is "shared" when most views give the same value; the rest are listed view by view.
  const perView = [];
  const shared = [];
  for (const key of order) {
    const { name, values } = byParam.get(key);
    const groups = new Map();
    for (const x of values) {
      const k = norm(x.value);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
    const missing = views.filter((v) => !values.some((x) => x.view === v)).map((v) => v.label);
    if (ranked[0].length * 2 > values.length) shared.push({ name, value: ranked[0][0].value, variants: ranked.slice(1), missing });
    else perView.push({ name, values, missing });
  }
  const labelsOf = (xs) => xs.map((x) => x.view.label).join(", ");
  let html = `<article class="params"><h1 class="guide-title">${esc(cfg.title)}</h1>${cfg.intro ? `<p class="guide-meta">${esc(cfg.intro)}</p>` : ""}<div class="prose">`;
  for (const p of perView) {
    const heading = norm(p.name) === "orientation" ? "How each view is planned" : p.name;
    html += `<h2>${esc(heading)}</h2><dl class="view-list">${p.values.map((x) => `<div><dt><a href="${gHref(x.view.guide)}">${esc(x.view.label)}</a></dt><dd>${md(x.value)}</dd></div>`).join("")}</dl>`;
    if (p.missing.length) html += `<p class="param-note">Not listed for ${esc(p.missing.join(", "))}.</p>`;
  }
  const lmViews = views.filter((v) => landmarks.has(v.guide));
  if (lmViews.length && landmarkGuide) {
    html += `<h2>3-point landmarks</h2><dl class="view-list">${lmViews.map((v) => `<div><dt><a href="${gHref(v.guide)}">${esc(v.label)}</a></dt><dd>${landmarkText(landmarks.get(v.guide))}</dd></div>`).join("")}</dl>`;
    html += `<p class="param-note">From <a href="${gHref(landmarkGuide.slug)}">${esc(landmarkGuide.shortTitle || landmarkGuide.title)}</a>.</p>`;
  }
  if (shared.length) {
    html += `<h2>Shared settings</h2><p>The same for ${views.length === 2 ? "both" : `all ${views.length}`} views unless noted.</p><div class="table-wrap"><table class="params-table"><tbody>`;
    for (const s of shared) {
      const notes = [
        ...s.variants.map((g) => `${esc(labelsOf(g))}: ${md(g[0].value)}`),
        ...(s.missing.length ? [`Not listed for ${esc(s.missing.join(", "))}`] : []),
      ];
      html += `<tr><th scope="row">${md(s.name)}</th><td>${md(s.value)}${notes.map((n) => `<span class="param-note">${n}</span>`).join("")}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  if (cfg.levels?.guide) {
    const t = bodies.has(cfg.levels.guide) ? summaryTable(bodies.get(cfg.levels.guide)) : null;
    if (t) {
      html += `<h2>${esc(cfg.levels.title || t.heading)}</h2><div class="table-wrap"><table><thead><tr>${t.header.map((c) => `<th>${md(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      html += `<p class="param-note">From <a href="${gHref(cfg.levels.guide)}">${esc(guides.find((g) => g.slug === cfg.levels.guide)?.title || cfg.levels.guide)}</a>.</p>`;
    } else warn(`parameters.json: no summary table found in ${cfg.levels.guide}`);
  }
  html += `</div>${noteHtml(cfg.title, "/parameters/")}</article>`;
  parameters = {
    title: cfg.title,
    description: cfg.intro || "",
    slugs: [...views.map((v) => v.guide), cfg.levels?.guide].filter(Boolean),
    html,
    perView: perView.length,
    shared: shared.length,
    notes: shared.reduce((n, s) => n + s.variants.length + (s.missing.length ? 1 : 0), 0),
  };
}

// ---------- Printable planning cards (content/cards.json) ----------
// One page per view: chosen images from the guide with their captions (or descriptions), plus the
// LV views' orientation line from the parameters tables.
let cards = null;
const cardsPath = join(CONTENT, "cards.json");
if (existsSync(cardsPath)) {
  const cfg = JSON.parse(readFileSync(cardsPath, "utf8"));
  const bySlugAll = new Map(guides.map((g) => [g.slug, g]));
  const orientation = new Map();
  if (parameters) {
    const pcfg = JSON.parse(readFileSync(paramsPath, "utf8"));
    for (const v of pcfg.views || []) {
      const t = bodies.has(v.guide) ? summaryTable(bodies.get(v.guide)) : null;
      const row = t?.rows.find((r) => /^orientation$/i.test((r[0] || "").trim()));
      if (row) orientation.set(v.guide, row[1]);
    }
  }
  const short = (g) => g.shortTitle || g.title;
  const plain = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  let html = `<div class="cards-intro"><h1 class="guide-title">${esc(cfg.title)}</h1><p class="guide-meta">${esc(cfg.intro || "")}</p><button class="btn" type="button" data-action="print">Print cards</button></div>`;
  let count = 0;
  for (const c of cfg.cards || []) {
    const g = bySlugAll.get(c.guide);
    if (!g) { warn(`cards.json: no guide "${c.guide}"`); continue; }
    const imgs = g.figures.filter((f) => f.type === "image");
    const picks = (c.images || imgs.map((_, i) => i)).map((i) => imgs[i]).filter(Boolean).slice(0, 5);
    if (!picks.length) { warn(`cards.json: no images for ${c.guide}`); continue; }
    const topic = topics.find((t) => t.slug === g.topics[0]);
    const plane = orientation.get(g.slug);
    const lm = landmarks.get(g.slug);
    const figs = picks.map((f) => {
      const cap = f.captionHtml || esc(f.alt || "");
      return `<figure><img src="${esc(f.src)}" alt="${esc(f.alt || plain(f.captionHtml || ""))}"${f.w ? ` width="${f.w}" height="${f.h}"` : ""} loading="lazy">${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
    }).join("");
    html += `<section class="card" aria-labelledby="card-${esc(g.slug)}"><header class="card-head">${topic ? `<span class="card-topic">${esc(topic.label)}</span>` : ""}<h2 id="card-${esc(g.slug)}">${esc(short(g))}</h2>${plane ? `<p class="card-plane"><strong>Orientation:</strong> ${inline(plane, { file: "cards.json", images: new Set(), videos: new Set(), headings: [], figures: [], section: "" })}</p>` : ""}${lm ? `<p class="card-plane"><strong>3-point:</strong> ${landmarkText(lm)}</p>` : ""}</header><div class="card-grid n${picks.length}">${figs}</div><footer class="card-foot"><span>${esc(site.name)} · ${esc(site.url.replace(/^https?:\/\//, ""))}/guide/${esc(g.slug)}/</span><span>For education only. Follow your department's protocols.</span></footer></section>`;
    count++;
  }
  cards = { title: cfg.title, description: cfg.intro || "", html, count };
}

// ---------- About page (content/about.md) ----------
let about = null;
const aboutPath = join(CONTENT, "about.md");
if (existsSync(aboutPath)) {
  const { data, body } = parseFrontMatter(readFileSync(aboutPath, "utf8"), "about.md");
  const actx = { file: "about.md", images: new Set(), videos: new Set(), headings: [], figures: [], section: "" };
  about = { title: data.title || "About", description: data.summary || "", html: markdownToHtml(body, actx) };
}

const publicSite = { name: site.name, url: site.url, feedbackEmail: site.feedbackEmail || "", disclaimer: site.disclaimer || "" };
const out = { generatedAt: new Date().toISOString(), site: publicSite, topics, guides, parameters, cards, glossary, protocols, about, landmarkGuide: landmarkSource };
writeFileSync(join(CONTENT, "guides.json"), JSON.stringify(out));

const imageCount = new Set(guides.flatMap((g) => g.images)).size;
const videoCount = new Set(guides.flatMap((g) => g.videos)).size;
console.log(`Built ${guides.length} guide(s), ${topics.length} topic(s), ${imageCount} image(s), ${videoCount} video(s) → content/guides.json`);

// =====================================================================================
// The upload folder: site/ holds everything the host needs, including a real page for
// every guide and topic so search engines and link previews see the content.
// =====================================================================================
const SITE_DIR = join(ROOT, "site");
const { glyph, glyphFor } = await import(
  "data:text/javascript;base64," + Buffer.from(readFileSync(join(ROOT, "js", "glyphs.js"))).toString("base64")
);
const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>`;
const abs = (path) => site.url + path;
const link = {
  home: "/",
  topics: "/topics/",
  topic: (s) => `/topic/${encodeURIComponent(s)}/`,
  guide: (s) => `/guide/${encodeURIComponent(s)}/`,
};
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const listTitle = (g) => {
  if (g.shortTitle) return g.shortTitle;
  const i = g.title.indexOf(":");
  return i >= 12 ? g.title.slice(0, i) : g.title;
};
const topicBySlug = new Map(topics.map((t) => [t.slug, t]));
const byUpdated = (a, b) =>
  (b.updated || b.published || "").localeCompare(a.updated || a.published || "") || (b.published || "").localeCompare(a.published || "");
const titleClass = (g) => `guide-title${listTitle(g).length > 60 ? " long" : ""}`;
const inTopic = (slug) =>
  guides
    .filter((g) => g.topics.includes(slug))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.published || "").localeCompare(b.published || "") || a.title.localeCompare(b.title));
const liveTopics = topics.map((t, i) => ({ ...t, count: inTopic(t.slug).length, _i: i })).filter((t) => t.count > 0)
  .sort((a, b) => (a.order ?? a._i) - (b.order ?? b._i));

// The markup below mirrors the views in js/app.js, so the page looks the same before and
// after the app takes over.
const rowHtml = (g, meta) => {
  const t = g.topics.length ? topicBySlug.get(g.topics[0]) : null;
  const media = g.cover ? `<img src="${esc(g.cover)}" alt="" loading="lazy">` : glyph(glyphFor(t));
  return `<li><a class="row" href="${link.guide(g.slug)}"><span class="row-media">${media}</span><span><span class="row-title">${esc(listTitle(g))}</span><span class="row-meta">${esc(meta ?? (t ? t.label : `${g.minutes} min read`))}</span></span><span class="row-flag"></span></a></li>`;
};
const rowsHtml = (list, meta) => `<ul class="rows">${list.map((g) => rowHtml(g, typeof meta === "function" ? meta(g) : meta)).join("")}</ul>`;

function guideNoteHtml(g) {
  if (!site.disclaimer && !site.feedbackEmail) return "";
  const mail = site.feedbackEmail
    ? `<a class="btn secondary" href="mailto:${esc(site.feedbackEmail)}?subject=${encodeURIComponent(`Correction: ${g.title}`)}&amp;body=${encodeURIComponent(`Guide: ${abs(link.guide(g.slug))}\n\nWhat should change:\n\n`)}">Suggest a correction</a>`
    : "";
  return `<aside class="guide-note">${site.disclaimer ? `<p>${esc(site.disclaimer)}</p>` : ""}${mail}</aside>`;
}

// Quick plan and parameters pieces (same markup as js/app.js).
const DECK_ICON = `<svg class="deck-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.5" width="13" height="13" rx="2"/><path d="M7.5 3.5h11a2 2 0 0 1 2 2v11"/></svg>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const figureCount = (g) => {
  const clips = g.figures.filter((f) => f.type === "video").length;
  const imgs = g.figures.length - clips;
  return [imgs ? plural(imgs, "image") : "", clips ? plural(clips, "clip") : ""].filter(Boolean).join(", ");
};
const planButton = (g) =>
  g.quickPlan ? `<button class="btn plan-btn" type="button" data-action="quick-plan" data-slug="${esc(g.slug)}">${DECK_ICON}Quick plan<span>${figureCount(g)}</span></button>` : "";
const paramsXref = (g) =>
  parameters?.slugs.includes(g.slug) ? `<p class="guide-xref">See every LV view's settings side by side in <a href="/parameters/">${esc(parameters.title)}</a>.</p>` : "";
const CLOCK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4.5l3 2M9.5 2.5h5"/></svg>`;
// The app swaps in "Back to your exam" or the last protocol run (flowCardHtml in js/app.js).
const flowCard = () => `<a class="flow-launch" href="/flow/">${CLOCK_ICON}<span><strong>Exam flow</strong><span>Tick off each step, with a clock that starts when you inject contrast</span></span></a>`;
// Previous/next planning views, in Plan-tab order (pagerHtml in js/app.js).
const planSequence = () => liveTopics.filter((t) => !NOT_PLANNING.has(t.slug))
  .flatMap((t) => inTopic(t.slug).filter((g) => g.quickPlan && planHome(g) === t.slug));
function pagerHtml(g) {
  const seq = planSequence();
  const i = seq.findIndex((x) => x.slug === g.slug);
  if (i < 0) return "";
  const a = (x, cls, label) => x
    ? `<a class="pager-link ${cls}" href="${link.guide(x.slug)}"><span>${label}</span><strong>${esc(listTitle(x))}</strong></a>`
    : `<span class="pager-link ${cls} none"></span>`;
  return `<nav class="pager" aria-label="Previous and next views">${a(seq[i - 1], "prev", "Previous")}${a(seq[i + 1], "next", "Next")}</nav>`;
}
// About link at the foot of the home page (aboutFootHtml in js/app.js).
const aboutFoot = () => (about ? `<p class="home-foot"><a href="/about/">About Cardiac MRI Hub and its sources</a></p>` : "");
const aboutView = () => `<article><h1 class="guide-title">${esc(about.title)}</h1><div class="prose">${about.html}</div>${site.disclaimer ? `<aside class="guide-note"><p>${esc(site.disclaimer)}</p></aside>` : ""}</article>`;
const toolTile = (slug, kind, label, sub) =>
  slug && guides.some((g) => g.slug === slug) ? `<a class="tile" href="/guide/${slug}/">${glyph(kind)}<strong>${label}</strong><span>${sub}</span></a>` : "";
const atScannerHtml = () =>
  `<h2 class="section">At the scanner</h2>${protocols?.flow ? flowCard() : ""}<div class="tiles"><a class="tile" href="/plan/">${glyph("sax")}<strong>Quick plan</strong><span>Swipe through each view's planning images</span></a>${parameters ? `<a class="tile" href="/parameters/">${glyph("lv")}<strong>LV parameters</strong><span>Every view on one page</span></a>` : ""}${toolTile(landmarkSource, "points", "3-point landmarks", "Where each point goes, view by view")}${toolTile(glossarySource, "abbr", "Abbreviations", "LVOT, VENC, STJ and the rest")}</div>`;
const planHome = (g) => g.topics.find((t) => !NOT_PLANNING.has(t)) || g.topics[0];
const planGuides = () =>
  liveTopics
    .map((t) => ({ t, list: inTopic(t.slug).filter((g) => g.quickPlan && planHome(g) === t.slug) }))
    .filter((x) => x.list.length);
const planRowHtml = (g) => {
  const first = g.figures.find((f) => f.type === "image");
  const media = first ? `<img src="${esc(first.src)}" alt="" loading="lazy">` : glyph("sax");
  return `<li><button class="row" type="button" data-action="quick-plan" data-slug="${esc(g.slug)}"><span class="row-media">${media}</span><span><span class="row-title">${esc(listTitle(g))}</span><span class="row-meta">${figureCount(g)}</span></span><span class="row-flag">${DECK_ICON}</span></button></li>`;
};
const planView = () =>
  (protocols?.flow ? flowCard() : "") +
  `<p class="lede">Swipe through each view's planning images and cine clips, full screen. Tap an image to zoom.</p>` +
  `<p class="plan-links">${[protocols ? `<a href="/guide/${protocols.slug}/">Protocols</a>` : "", cards ? `<a href="/cards/">Printable planning cards</a>` : "", parameters ? `<a href="/parameters/">LV parameters at a glance</a>` : ""].filter(Boolean).join(" · ")}</p>` +
  planGuides().map(({ t, list }) => `<h2 class="section">${esc(t.label)}</h2><ul class="rows">${list.map(planRowHtml).join("")}</ul>`).join("");

function homeView() {
  let html = `<a class="search-launch" href="/search/">${SEARCH_ICON}<span>Search guides or type 4ch, SAX, LVOT</span></a>`;
  const start = guides.filter((g) => g.startHere).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  if (start.length) {
    html += `<h2 class="section">Start here</h2>`;
    for (const g of start) {
      const media = g.cover ? `<img src="${esc(g.cover)}" alt="">` : glyph("ecg");
      html += `<a class="feature" href="${link.guide(g.slug)}"><div class="feature-media">${media}</div><h3>${esc(listTitle(g))}</h3><p>${esc(g.summary)}</p></a>`;
    }
  }
  html += atScannerHtml();
  html += `<h2 class="section">Topics</h2><div class="tiles">${liveTopics.map((t) => `<a class="tile" href="${link.topic(t.slug)}">${glyph(glyphFor(t))}<strong>${esc(t.label)}</strong><span>${t.count} ${t.count === 1 ? "guide" : "guides"}</span></a>`).join("")}</div>`;
  const recent = [...guides].sort(byUpdated).slice(0, 5);
  html += `<h2 class="section">Recently updated</h2><ul class="rows">${recent
    .map((g) => rowHtml(g, [topicBySlug.get(g.topics[0])?.label, g.updated ? `updated ${fmtDate(g.updated)}` : ""].filter(Boolean).join(" · ")))
    .join("")}</ul><a class="btn secondary all-guides" href="/topics/#all">Browse all ${guides.length} guides</a>${aboutFoot()}`;
  return html;
}
const topicsView = () =>
  `<div class="topic-list">${liveTopics.map((t) => `<a class="tile" href="${link.topic(t.slug)}">${glyph(glyphFor(t))}<strong>${esc(t.label)}</strong><span>${t.count}</span></a>`).join("")}</div>` +
  `<h2 class="section" id="all">All guides A–Z <small>${guides.length}</small></h2>${rowsHtml([...guides].sort((a, b) => listTitle(a).localeCompare(listTitle(b))))}`;
const topicView = (t) =>
  `<div class="topic-head">${glyph(glyphFor(t))}<h1>${esc(t.label)}</h1></div>${t.description ? `<p class="topic-desc">${esc(t.description)}</p>` : ""}${rowsHtml(inTopic(t.slug), (g) => `${g.minutes} min read`)}`;

function guideView(g) {
  const gTopics = g.topics.map((s) => topicBySlug.get(s)).filter(Boolean);
  const coverInBody = g.cover && g.html.includes(`src="${g.cover}"`);
  const meta = [`${g.minutes} min read`];
  if (g.updated) meta.push(`updated ${fmtDate(g.updated)}`);
  const selfNumbered = g.headings.some((h) => /^\d+[.)]\s/.test(h.text));
  const tag = selfNumbered ? "ul" : "ol";
  const toc = g.headings.length >= 3
    ? `<details class="toc"><summary>In this guide <span>${g.headings.length} sections</span></summary><nav aria-label="In this guide"><${tag}${selfNumbered ? ' class="plain"' : ""}>${g.headings.map((h) => `<li><a href="#${esc(h.id)}" data-jump="${esc(h.id)}">${esc(h.text)}</a></li>`).join("")}</${tag}></nav></details>`
    : "";
  let more = "";
  if (gTopics[0]) {
    const list = inTopic(gTopics[0].slug);
    const at = list.findIndex((x) => x.slug === g.slug);
    const next = [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))].slice(0, 3);
    if (next.length) more = `<div class="guide-foot"><h2 class="section">More in ${esc(gTopics[0].label)}</h2>${rowsHtml(next)}</div>`;
  }
  return `<article>${gTopics.length ? `<ul class="guide-topics">${gTopics.map((t) => `<li><a href="${link.topic(t.slug)}">${esc(t.label)}</a></li>`).join("")}</ul>` : ""}<h1 class="${titleClass(g)}">${esc(listTitle(g))}</h1><p class="guide-meta">${meta.join(", ")}</p>${planButton(g)}${g.landmarksHtml || ""}${toc}<div class="prose">${g.cover && g.coverWide && !coverInBody ? `<figure><img src="${esc(g.cover)}" alt=""></figure>` : ""}${g.html}</div>${pagerHtml(g)}${paramsXref(g)}${guideNoteHtml(g)}${more}</article>`;
}

const template = readFileSync(join(ROOT, "index.html"), "utf8");
const attr = (s) => esc(String(s ?? "").replace(/\s+/g, " ").trim());
// Fingerprinted like images, so apps that cached an old link preview pick up a new picture.
const sitePreview = existsSync(join(CONTENT, "previews", "site.jpg")) ? `/content/previews/site.jpg${imageVersion(join(CONTENT, "previews", "site.jpg"))}` : "/icons/icon-512.png";
const beacon = site.analyticsToken
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: site.analyticsToken })}'></script>`
  : "";

function page({ path, title, description, view, image = sitePreview, type = "website", noindex = false, jsonLd = null, verify = false }) {
  const fullTitle = title ? `${title} | ${site.name}` : site.name;
  const desc = description || site.description;
  const imgAbs = /^https?:/.test(image) ? image : abs(image);
  const isJpeg = /\.jpe?g(\?|$)/i.test(image);
  const meta = [
    `<link rel="canonical" href="${attr(abs(path))}">`,
    noindex ? `<meta name="robots" content="noindex">` : "",
    verify && site.googleVerification ? `<meta name="google-site-verification" content="${attr(site.googleVerification)}">` : "",
    `<meta property="og:site_name" content="${attr(site.name)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${attr(title || site.name)}">`,
    `<meta property="og:description" content="${attr(desc)}">`,
    `<meta property="og:url" content="${attr(abs(path))}">`,
    `<meta property="og:image" content="${attr(imgAbs)}">`,
    isJpeg ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : "",
  ].filter(Boolean).join("\n  ");
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${attr(desc)}">`)
    .replace("<!--PAGE-META-->", meta)
    .replace(`<main id="view" tabindex="-1"><!--VIEW--></main>`, `<main id="view" tabindex="-1" data-prerendered="${attr(path)}">${view}</main>`)
    .replace("<!--BODY-END-->", beacon);
  const dir = join(SITE_DIR, ...path.split("/").filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

if (!site.url) throw new Error('content/site.json needs "url" (the site\'s address) to build the pages.');
rmSync(SITE_DIR, { recursive: true, force: true });
mkdirSync(SITE_DIR, { recursive: true });
for (const item of ["css", "js", "icons", "manifest.webmanifest", "sw.js"]) cpSync(join(ROOT, item), join(SITE_DIR, item), { recursive: true });
mkdirSync(join(SITE_DIR, "content"), { recursive: true });
cpSync(join(CONTENT, "guides.json"), join(SITE_DIR, "content", "guides.json"));
for (const dir of ["images", "videos", "previews"]) {
  if (existsSync(join(CONTENT, dir))) cpSync(join(CONTENT, dir), join(SITE_DIR, "content", dir), { recursive: true });
}

page({ path: "/", title: "", description: site.description, view: homeView(), verify: true });
page({ path: "/topics/", title: "Topics", description: `Browse ${site.name} guides by topic.`, view: topicsView() });
page({ path: "/plan/", title: "Quick plan", description: "Swipe through the planning images and cine clips for each cardiac MRI view.", view: planView(), noindex: true });
if (parameters) {
  page({ path: "/parameters/", title: parameters.title, description: parameters.description, view: parameters.html });
}
if (protocols?.flow) {
  // Static first paint for /flow/; the app adds the ticks and the contrast clock once it loads.
  const p = protocols.list[0];
  let n = 0;
  const steps = p.groups.map((gr) => `${gr.label ? `<h2 class="flow-group">${esc(gr.label)}</h2>` : ""}<ol class="flow">${gr.steps.map((s) => { const i = n++; return `<li class="flow-step"><span class="tick" aria-hidden="true"></span><div class="flow-text"><span class="flow-num">${i + 1}.</span> ${s.html}${s.atMin ? ` <span class="flow-at">${s.atMin} min</span>` : ""}</div></li>`; }).join("")}</ol>`).join("");
  page({ path: "/flow/", title: "Exam flow", description: "Tick off each step of the exam, with a clock that starts when you inject contrast.", view: `<div class="flow-head"><h1 class="guide-title">${esc(p.name)}</h1></div>${steps}`, noindex: true });
}
if (about) {
  page({ path: "/about/", title: about.title, description: about.description, view: aboutView() });
}
if (cards) {
  page({ path: "/cards/", title: cards.title, description: cards.description, view: cards.html, noindex: true });
}
for (const t of liveTopics) {
  page({ path: link.topic(t.slug), title: t.label, description: t.description || `${t.label} guides.`, view: topicView(t) });
}
for (const g of guides) {
  page({
    path: link.guide(g.slug),
    title: g.title,
    description: g.summary,
    view: guideView(g),
    image: g.preview || sitePreview,
    type: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: g.title,
      description: g.summary,
      image: abs(g.preview || sitePreview),
      datePublished: g.published || undefined,
      dateModified: g.updated || g.published || undefined,
      mainEntityOfPage: abs(link.guide(g.slug)),
      publisher: { "@type": "Organization", name: site.name, logo: { "@type": "ImageObject", url: abs("/icons/icon-512.png") } },
    },
  });
}
const loading = `<div class="empty"><p>Loading…</p></div>`;
page({ path: "/search/", title: "Search", view: loading, noindex: true });
page({ path: "/saved/", title: "Saved", view: loading, noindex: true });
page({ path: "/settings/", title: "Settings", view: loading, noindex: true });

const urls = [
  { loc: abs("/") },
  { loc: abs("/topics/") },
  ...(parameters ? [{ loc: abs("/parameters/") }] : []),
  ...(about ? [{ loc: abs("/about/") }] : []),
  ...liveTopics.map((t) => ({ loc: abs(link.topic(t.slug)) })),
  ...guides.map((g) => ({ loc: abs(link.guide(g.slug)), lastmod: g.updated || g.published })),
];
writeFileSync(
  join(SITE_DIR, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${String(u.lastmod).slice(0, 10)}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`
);
writeFileSync(join(SITE_DIR, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);
// Files macOS adds to folders (Finder's .DS_Store and ._ copies) never go online. `npx wrangler deploy` reads this.
writeFileSync(join(SITE_DIR, ".assetsignore"), ".DS_Store\n._*\n.assetsignore\n");

const pageCount = 6 + (parameters ? 1 : 0) + (cards ? 1 : 0) + (about ? 1 : 0) + liveTopics.length + guides.length;
console.log(`Quick plan: ${guides.filter((g) => g.quickPlan).length} guide(s). Parameters page: ${parameters ? `${parameters.perView} per-view setting(s), ${parameters.shared} shared, ${parameters.notes} note(s)` : "off"}.`);
console.log(`Wrote ${pageCount} page(s), sitemap.xml and robots.txt → site/ (this is the folder to upload)`);
if (!site.analyticsToken) console.log("  note: no analyticsToken in content/site.json, so visitor counts are off");
if (!site.googleVerification) console.log("  note: no googleVerification in content/site.json");
for (const w of warnings) console.warn(`  warning: ${w}`);
