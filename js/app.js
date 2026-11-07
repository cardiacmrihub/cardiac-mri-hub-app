// Cardiac MRI Hub — the app.
// Content comes from /content/guides.json (built from the Markdown files in content/guides/).
// Every view has a real address, and the build writes a real page for each one so search
// engines and link previews see the content:
//   /  /topics/  /topic/:slug/  /guide/:slug/  /search/?q=  /saved/  /settings/
// Old #/guide/… links still work: they're switched to the matching address on load.

import { prefs } from "./prefs.js";
import { glyph, glyphFor, LOGO } from "./glyphs.js";
import { searchGuides, highlight, snippetAround, suggestions } from "./search.js";

const APP_VERSION = "1.6.1";
const IMAGE_CACHE = "cmh-images";
const VIDEO_CACHE = "cmh-videos";
const CONTENT_CACHE = "cmh-content"; // same names as in sw.js

const $ = (sel, el = document) => el.querySelector(sel);
const view = $("#view");
const topbar = $("#topbar");
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const link = {
  home: "/",
  topics: "/topics/",
  topic: (s) => `/topic/${encodeURIComponent(s)}/`,
  guide: (s) => `/guide/${encodeURIComponent(s)}/`,
  search: (q = "") => `/search/${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  saved: "/saved/",
  settings: "/settings/",
  plan: "/plan/",
  parameters: "/parameters/",
  cards: "/cards/",
  flow: "/flow/",
};

const ICON = {
  back: `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24"><path d="M7 3.5h10v17l-5-3.6-5 3.6z"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 12.5V20h14v-7.5"/></svg>`,
  text: `<svg viewBox="0 0 24 24"><path d="M3 19l5-13 5 13M5 14.5h6M14.5 19l3.5-8.5 3.5 8.5M15.6 16.4h4.8"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4.5l3 2M9.5 2.5h5"/></svg>`,
  clear: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  deck: `<svg class="deck-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.5" width="13" height="13" rx="2"/><path d="M7.5 3.5h11a2 2 0 0 1 2 2v11"/></svg>`,
};

const state = {
  data: null,          // { topics, guides, generatedAt, bySlug, topicBySlug }
  loadError: null,
  offline: { total: 0, done: 0, running: false, complete: false },
  updateReady: null,   // waiting service worker
  installPrompt: null, // Android/desktop install event
};

/* ---------------- preferences applied to the page ---------------- */
function applyPrefs() {
  const root = document.documentElement;
  const theme = prefs.get("theme", "system");
  if (theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
  root.setAttribute("data-text", prefs.get("text", "m"));
}
applyPrefs();

/* ---------------- content ---------------- */
async function loadContent() {
  try {
    const res = await fetch("/content/guides.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`The guide list couldn't be loaded (error ${res.status}).`);
    const data = await res.json();
    data.bySlug = new Map(data.guides.map((g) => [g.slug, g]));
    data.topicBySlug = new Map(data.topics.map((t) => [t.slug, t]));
    const before = state.data?.generatedAt;
    state.data = data;
    state.loadError = null;
    return before !== data.generatedAt;
  } catch (err) {
    state.loadError = err;
    return false;
  }
}

const topicOf = (g) => (g.topics?.length ? state.data.topicBySlug.get(g.topics[0]) : null);
const guidesInTopic = (slug) =>
  state.data.guides
    .filter((g) => g.topics?.includes(slug))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.published || "").localeCompare(b.published || "") || a.title.localeCompare(b.title));
const topicsWithGuides = () =>
  state.data.topics
    .map((t, i) => ({ ...t, count: guidesInTopic(t.slug).length, _i: i }))
    .filter((t) => t.count > 0)
    .sort((a, b) => (a.order ?? a._i) - (b.order ?? b._i));

// Long titles like "Understanding the X View: Comprehensive Cardiac MRI Planning for Technologists"
// read better in lists as just the part before the colon.
function listTitle(g) {
  if (g.shortTitle) return g.shortTitle;
  const i = g.title.indexOf(":");
  return i >= 12 ? g.title.slice(0, i) : g.title;
}
const byUpdated = (a, b) =>
  (b.updated || b.published || "").localeCompare(a.updated || a.published || "") || (b.published || "").localeCompare(a.published || "");
const titleClass = (g) => `guide-title${g.title.length > 60 ? " long" : ""}`;
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/* ---------------- shared pieces ---------------- */
function setTopbar(html) {
  topbar.innerHTML = html;
}
function backButton() {
  return `<button class="icon-btn" type="button" data-action="back" aria-label="Back">${ICON.back}</button>`;
}
function rowHtml(g, opts = {}) {
  const t = topicOf(g);
  const media = g.cover ? `<img src="${esc(g.cover)}" alt="" loading="lazy">` : glyph(glyphFor(t));
  const title = opts.titleHtml ?? esc(listTitle(g));
  const meta = opts.meta ?? (t ? esc(t.label) : `${g.minutes} min read`);
  const saved = prefs.isSaved(g.slug);
  return `<li><a class="row" href="${link.guide(g.slug)}">
    <span class="row-media">${media}</span>
    <span><span class="row-title">${title}</span><span class="row-meta">${meta}</span>${opts.snippet ? `<span class="row-snippet">${opts.snippet}</span>` : ""}</span>
    <span class="row-flag">${saved ? `${ICON.bookmark}<span class="visually-hidden">Saved</span>` : ""}</span>
  </a></li>`;
}
function rowsHtml(list, opts) {
  return `<ul class="rows">${list.map((g) => rowHtml(g, opts)).join("")}</ul>`;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function noticesHtml() {
  let html = "";
  if (!navigator.onLine) {
    html += `<div class="notice"><p>You're offline. Guides saved on this device still open normally.</p></div>`;
  }
  if (isIOS() && !isStandalone() && !prefs.get("iosHintDismissed", false)) {
    html += `<div class="notice"><p>Add this app to your Home Screen for one-tap access and offline reading. <a href="${link.guide("install-the-app")}">How to install</a></p><button class="text-btn" data-action="dismiss-ios" aria-label="Dismiss">Close</button></div>`;
  } else if (state.installPrompt && !prefs.get("installDismissed", false)) {
    html += `<div class="notice"><p>Install the app for one-tap access and offline reading.</p><button class="text-btn" data-action="install">Install</button></div>`;
  }
  return html;
}

function loadingOrErrorHtml() {
  if (state.loadError) {
    return `<div class="empty"><h2>Guides didn't load</h2><p>${navigator.onLine ? esc(state.loadError.message) : "You're offline and the guides haven't been saved on this device yet. Connect once and they'll stay available offline."}</p><button class="btn" data-action="retry">Try again</button></div>`;
  }
  return `<div class="empty"><p>Loading guides…</p></div>`;
}

/* ---------------- quick plan + parameters pieces (same markup as the build writes) ---------------- */
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function figureCount(g) {
  const clips = (g.figures || []).filter((f) => f.type === "video").length;
  const imgs = (g.figures || []).length - clips;
  return [imgs ? plural(imgs, "image") : "", clips ? plural(clips, "clip") : ""].filter(Boolean).join(", ");
}
const planButton = (g) =>
  g.quickPlan ? `<button class="btn plan-btn" type="button" data-action="quick-plan" data-slug="${esc(g.slug)}">${ICON.deck}Quick plan<span>${figureCount(g)}</span></button>` : "";
function paramsXref(g) {
  const p = state.data?.parameters;
  return p?.slugs.includes(g.slug) ? `<p class="guide-xref">See every LV view's settings side by side in <a href="${link.parameters}">${esc(p.title)}</a>.</p>` : "";
}
const toolTile = (slug, kind, label, sub) =>
  slug && state.data?.bySlug.get(slug) ? `<a class="tile" href="${link.guide(slug)}">${glyph(kind)}<strong>${label}</strong><span>${sub}</span></a>` : "";
const atScannerHtml = (flowCard = "") =>
  `<h2 class="section">At the scanner</h2>${flowCard}<div class="tiles"><a class="tile" href="${link.plan}">${glyph("sax")}<strong>Quick plan</strong><span>Swipe through each view's planning images</span></a>${state.data?.parameters ? `<a class="tile" href="${link.parameters}">${glyph("lv")}<strong>LV parameters</strong><span>Every view on one page</span></a>` : ""}${toolTile(state.data?.landmarkGuide, "points", "3-point landmarks", "Where each point goes, view by view")}${toolTile(state.data?.glossary?.slug, "abbr", "Abbreviations", "LVOT, VENC, STJ and the rest")}</div>`;
/** The abbreviation typed on its own, if the abbreviations guide lists it. */
function glossaryHit(q) {
  const key = q.trim().toLowerCase().replace(/[\s-]+/g, "");
  return key ? state.data?.glossary?.entries.find((e) => e.keys.includes(key)) : null;
}
const defineHtml = (d) =>
  d ? `<div class="define"><p><strong>${esc(d.abbr)}</strong> ${d.meaning}</p>${d.note ? `<p class="define-note">${d.note}</p>` : ""}<a href="${esc(d.href)}">All abbreviations</a></div>` : "";

/* ---------------- views ---------------- */
function renderHome() {
  setTopbar(`<span class="brand">${LOGO}Cardiac MRI Hub</span><a class="icon-btn" href="${link.settings}" aria-label="Settings">${ICON.settings}</a>`);
  let html = `<a class="search-launch" href="${link.search()}">${ICON.search}<span>Search guides or type 4ch, SAX, LVOT</span></a>${noticesHtml()}`;
  const d = state.data;
  if (!d) { view.innerHTML = html + loadingOrErrorHtml(); return; }
  if (!d.guides.length) {
    view.innerHTML = html + `<div class="empty"><h2>No guides yet</h2><p>Guides added to the app will show up here.</p></div>`;
    return;
  }
  const exam = flowActive();
  if (exam) html += flowCardHtml();
  const last = d.bySlug.get(prefs.get("lastGuide", ""));
  if (last) html += `<h2 class="section">Continue reading</h2>${rowsHtml([last])}`;
  const start = d.guides.filter((g) => g.startHere && g !== last).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  if (start.length) {
    html += `<h2 class="section">Start here</h2>`;
    for (const g of start) {
      const media = g.cover ? `<img src="${esc(g.cover)}" alt="">` : glyph(glyphFor(topicOf(g)));
      html += `<a class="feature" href="${link.guide(g.slug)}"><div class="feature-media">${media}</div><h3>${esc(listTitle(g))}</h3><p>${esc(g.summary)}</p></a>`;
    }
  }
  html += atScannerHtml(exam ? "" : flowCardHtml());
  const topics = topicsWithGuides();
  if (topics.length) {
    html += `<h2 class="section">Topics</h2><div class="tiles">`;
    for (const t of topics) {
      html += `<a class="tile" href="${link.topic(t.slug)}">${glyph(glyphFor(t))}<strong>${esc(t.label)}</strong><span>${t.count} ${t.count === 1 ? "guide" : "guides"}</span></a>`;
    }
    html += `</div>`;
  }
  html += recentHtml(d.guides);
  view.innerHTML = html;
}

// "Recently updated" on the home page, and every guide A–Z on the Topics page (same markup as the build).
function recentHtml(guides) {
  const recent = [...guides].sort(byUpdated).slice(0, 5);
  const rows = recent.map((g) => {
    const t = topicOf(g);
    return rowHtml(g, { meta: esc([t?.label, g.updated ? `updated ${fmtDate(g.updated)}` : ""].filter(Boolean).join(" · ")) });
  }).join("");
  return `<h2 class="section">Recently updated</h2><ul class="rows">${rows}</ul><a class="btn secondary all-guides" href="${link.topics}#all">Browse all ${guides.length} guides</a>`;
}
const azHtml = (guides) =>
  `<h2 class="section" id="all">All guides A–Z <small>${guides.length}</small></h2>${rowsHtml([...guides].sort((a, b) => listTitle(a).localeCompare(listTitle(b))))}`;

function renderTopics() {
  setTopbar(`<h1 class="topbar-title" style="margin-left:8px">Topics</h1>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  const topics = topicsWithGuides();
  const loose = state.data.guides.filter((g) => !g.topics?.length);
  let html = `<div class="topic-list">`;
  for (const t of topics) {
    html += `<a class="tile" href="${link.topic(t.slug)}">${glyph(glyphFor(t))}<strong>${esc(t.label)}</strong><span>${t.count}</span></a>`;
  }
  html += `</div>`;
  if (state.data.guides.length) html += azHtml(state.data.guides);
  if (!topics.length && !loose.length) html = `<div class="empty"><h2>No topics yet</h2><p>Topics appear once guides are added.</p></div>`;
  view.innerHTML = html;
}

function renderTopic(slug) {
  setTopbar(`${backButton()}<span class="topbar-title"></span>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  const t = state.data.topicBySlug.get(slug);
  if (!t) { view.innerHTML = notFoundHtml("This topic isn't in the app."); return; }
  const list = guidesInTopic(slug);
  view.innerHTML = `<div class="topic-head">${glyph(glyphFor(t))}<h1>${esc(t.label)}</h1></div>
    ${t.description ? `<p class="topic-desc">${esc(t.description)}</p>` : ""}
    ${list.length ? rowsHtml(list, { meta: null }) : `<div class="empty"><p>No guides in this topic yet.</p></div>`}`;
  // In a topic list, show reading time instead of repeating the topic name.
  view.querySelectorAll(".row").forEach((a, i) => { a.querySelector(".row-meta").textContent = `${list[i].minutes} min read`; });
}

function renderGuide(slug) {
  const g = state.data?.bySlug.get(slug);
  const saved = g ? prefs.isSaved(slug) : false;
  setTopbar(`${backButton()}<span class="topbar-title" id="guide-bar-title"></span>
    ${g ? `<button class="icon-btn" type="button" data-action="text-size" aria-label="Change text size">${ICON.text}</button>
    <button class="icon-btn" type="button" data-action="toggle-save" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save guide"}">${ICON.bookmark}</button>
    <button class="icon-btn" type="button" data-action="share" aria-label="Share">${ICON.share}</button>` : ""}`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  if (!g) { view.innerHTML = notFoundHtml("This guide isn't in the app. It may have been renamed or removed."); return; }
  prefs.set("lastGuide", slug);

  const topics = (g.topics || []).map((s) => state.data.topicBySlug.get(s)).filter(Boolean);
  const coverInBody = g.cover && g.html.includes(`src="${g.cover}"`);
  const meta = [`${g.minutes} min read`];
  if (g.updated) meta.push(`updated ${fmtDate(g.updated)}`);
  // Headings that already carry their own numbers ("1. Purpose…") get an unnumbered list.
  const selfNumbered = g.headings?.some((h) => /^\d+[.)]\s/.test(h.text));
  const tocList = selfNumbered ? "ul" : "ol";
  const toc = g.headings?.length >= 3
    ? `<details class="toc"><summary>In this guide <span>${g.headings.length} sections</span></summary><nav aria-label="In this guide"><${tocList}${selfNumbered ? ' class="plain"' : ""}>${g.headings.map((h) => `<li><a href="#${esc(h.id)}" data-jump="${esc(h.id)}">${esc(h.text)}</a></li>`).join("")}</${tocList}></nav></details>`
    : "";

  // Other guides in the same topic, starting after this one.
  let more = "";
  if (topics[0]) {
    const list = guidesInTopic(topics[0].slug);
    const at = list.findIndex((x) => x.slug === g.slug);
    const next = [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))].slice(0, 3);
    if (next.length) more = `<div class="guide-foot"><h2 class="section">More in ${esc(topics[0].label)}</h2>${rowsHtml(next)}</div>`;
  }

  view.innerHTML = `<article>
    ${topics.length ? `<ul class="guide-topics">${topics.map((t) => `<li><a href="${link.topic(t.slug)}">${esc(t.label)}</a></li>`).join("")}</ul>` : ""}
    <h1 class="${titleClass(g)}">${esc(g.title)}</h1>
    <p class="guide-meta">${meta.join(", ")}</p>
    ${planButton(g)}
    ${g.landmarksHtml || ""}
    ${toc}
    <div class="prose">
      ${g.cover && g.coverWide !== false && !coverInBody ? `<figure><img src="${esc(g.cover)}" alt=""></figure>` : ""}
      ${g.html}
    </div>
    ${pagerHtml(g)}
    ${paramsXref(g)}
    ${guideNoteHtml(g)}
    ${more}
  </article>`;
  $("#guide-bar-title").textContent = listTitle(g);
}

// The planning views in Plan-tab order (Technique and Getting started guides left out), for the
// previous/next links under each one. The build writes the same links into each guide's page (pagerHtml).
const NOT_PLANNING = ["technique", "getting-started"];
function planSequence() {
  const home = (g) => g.topics.find((t) => !NOT_PLANNING.includes(t)) || g.topics[0];
  return topicsWithGuides().filter((t) => !NOT_PLANNING.includes(t.slug))
    .flatMap((t) => guidesInTopic(t.slug).filter((g) => g.quickPlan && home(g) === t.slug));
}
function pagerHtml(g) {
  const seq = planSequence();
  const i = seq.findIndex((x) => x.slug === g.slug);
  if (i < 0) return "";
  const a = (x, cls, label) => x
    ? `<a class="pager-link ${cls}" href="${link.guide(x.slug)}"><span>${label}</span><strong>${esc(listTitle(x))}</strong></a>`
    : `<span class="pager-link ${cls} none"></span>`;
  return `<nav class="pager" aria-label="Previous and next views">${a(seq[i - 1], "prev", "Previous")}${a(seq[i + 1], "next", "Next")}</nav>`;
}

// Disclaimer and "Suggest a correction" under every guide. The build writes the same markup
// into each guide's page, so keep the two in step (scripts/build-content.mjs → guideNoteHtml).
function guideNoteHtml(g) {
  const site = state.data?.site || {};
  if (!site.disclaimer && !site.feedbackEmail) return "";
  const url = (site.url || location.origin) + link.guide(g.slug);
  const mail = site.feedbackEmail
    ? `<a class="btn secondary" href="mailto:${esc(site.feedbackEmail)}?subject=${encodeURIComponent(`Correction: ${g.title}`)}&amp;body=${encodeURIComponent(`Guide: ${url}\n\nWhat should change:\n\n`)}">Suggest a correction</a>`
    : "";
  return `<aside class="guide-note">${site.disclaimer ? `<p>${esc(site.disclaimer)}</p>` : ""}${mail}</aside>`;
}

function renderSearch(q) {
  setTopbar(`<h1 class="topbar-title" style="margin-left:8px">Search</h1>`);
  view.innerHTML = `<label class="search-field">${ICON.search}
      <input type="search" id="q" value="${esc(q)}" placeholder="Try 4ch, short axis, LVOT" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Search guides">
      <button class="icon-btn" type="button" data-action="clear-search" aria-label="Clear search"${q ? "" : " hidden"}>${ICON.clear}</button>
    </label><div id="results" aria-live="polite"></div>`;
  const input = $("#q");
  const run = () => {
    const value = input.value;
    $('[data-action="clear-search"]').hidden = !value;
    history.replaceState(null, "", link.search(value));
    showResults(value);
  };
  let timer;
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  showResults(q);
  if (!q) setTimeout(() => input.focus(), 50);
}

function showResults(q) {
  const box = $("#results");
  if (!box) return;
  if (!state.data) { box.innerHTML = loadingOrErrorHtml(); return; }
  if (!q.trim()) {
    const chips = suggestions(state.data.guides);
    box.innerHTML = chips.length
      ? `<p class="hint">Shorthand works too. Try:</p><div class="chips">${chips.map((c) => `<button class="chip" type="button" data-suggest="${esc(c)}">${esc(c)}</button>`).join("")}</div>`
      : `<p class="hint">Search titles and the full text of every guide.</p>`;
    return;
  }
  const results = searchGuides(state.data.guides, q);
  const def = defineHtml(glossaryHit(q));
  if (!results.length) {
    box.innerHTML = def + `<div class="empty"><h2>No matches for “${esc(q)}”</h2><p>Try a view name such as 4ch or SAX, or browse by topic.</p><a class="btn secondary" href="${link.topics}">Browse topics</a></div>`;
    return;
  }
  box.innerHTML = def + `<p class="hint">${results.length} ${results.length === 1 ? "guide" : "guides"}</p><ul class="rows">${results
    .map((r) => rowHtml(r.guide, {
      titleHtml: highlight(listTitle(r.guide), r.terms),
      snippet: r.bodyHit ? snippetAround(r.guide.text, r.bodyHit, r.terms) : "",
    }))
    .join("")}</ul>`;
}

function renderPlan() {
  setTopbar(`<h1 class="topbar-title" style="margin-left:8px">Quick plan</h1>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  // Each guide appears once, under its main planning topic (not "Getting started" or "Technique").
  const home = (g) => g.topics.find((t) => t !== "technique" && t !== "getting-started") || g.topics[0];
  const groups = topicsWithGuides()
    .map((t) => ({ t, list: guidesInTopic(t.slug).filter((g) => g.quickPlan && home(g) === t.slug) }))
    .filter((x) => x.list.length);
  const row = (g) => {
    const first = g.figures.find((f) => f.type === "image");
    const media = first ? `<img src="${esc(first.src)}" alt="" loading="lazy">` : glyph("sax");
    return `<li><button class="row" type="button" data-action="quick-plan" data-slug="${esc(g.slug)}"><span class="row-media">${media}</span><span><span class="row-title">${esc(listTitle(g))}</span><span class="row-meta">${figureCount(g)}</span></span><span class="row-flag">${ICON.deck}</span></button></li>`;
  };
  view.innerHTML = flowCardHtml() +
    `<p class="lede">Swipe through each view's planning images and cine clips, full screen. Tap an image to zoom.</p>` +
    `<p class="plan-links">${[state.data.protocols ? `<a href="${link.guide(state.data.protocols.slug)}">Protocols</a>` : "", state.data.cards ? `<a href="${link.cards}">Printable planning cards</a>` : "", state.data.parameters ? `<a href="${link.parameters}">LV parameters at a glance</a>` : ""].filter(Boolean).join(" · ")}</p>` +
    groups.map(({ t, list }) => `<h2 class="section">${esc(t.label)}</h2><ul class="rows">${list.map(row).join("")}</ul>`).join("");
}

/* ---------------- exam flow ---------------- */
// One exam at a time on this device: which protocol, which steps are done, and when contrast went in.
// Kept for 4 hours, so a forgotten checklist doesn't carry into the next day's first exam.
const FLOW_TTL = 4 * 60 * 60 * 1000;
function flowState() {
  const f = prefs.get("flow", null);
  // After 4 hours the ticks and clock are cleared, but the flow still opens on the last protocol run.
  if (!f || Date.now() - (f.updated || 0) > FLOW_TTL) return { protocol: prefs.get("flowLast", null), done: [], contrastAt: null, updated: Date.now() };
  return f;
}
function saveFlow(f) {
  prefs.set("flow", { ...f, updated: Date.now() });
  if (f.protocol) prefs.set("flowLast", f.protocol);
}
// An exam is in progress once a step is ticked or contrast is in, until the 4 hours run out.
function flowActive() {
  const f = prefs.get("flow", null);
  return !!f && Date.now() - (f.updated || 0) <= FLOW_TTL && (f.done?.length > 0 || !!f.contrastAt);
}
// The exam-flow card on Home and in the Plan tab: back to the exam in progress, or the last protocol run.
function flowCardHtml() {
  const P = state.data?.protocols;
  if (!P?.flow) return "";
  const f = flowState();
  const p = P.list.find((x) => x.id === f.protocol);
  let title = "Exam flow";
  let sub = "Tick off each step, with a clock that starts when you inject contrast";
  if (p && flowActive()) {
    const total = p.groups.reduce((n, g) => n + g.steps.length, 0);
    title = "Back to your exam";
    sub = `${esc(p.name)} · ${f.done.length} of ${total} steps done${f.contrastAt ? ` · contrast in at ${esc(clockTime(f.contrastAt))}` : ""}`;
  } else if (p && prefs.get("flowLast", null)) {
    sub = `Last exam: ${esc(p.name)}. Tick off each step, with a contrast clock.`;
  }
  return `<a class="flow-launch${flowActive() ? " active" : ""}" href="${link.flow}">${ICON.clock}<span><strong>${title}</strong><span>${sub}</span></span></a>`;
}
function flowProtocol(f = flowState()) {
  const P = state.data?.protocols;
  return P ? P.list.find((x) => x.id === f.protocol) || P.list[0] : null;
}
// A timed step's minutes can be changed on the device (each site runs its own timing); kept until changed back.
const FLOW_MIN = 1, FLOW_MAX = 30;
const flowMinutes = (p, i, step) => prefs.get("flowTimes", {})[`${p.id}:${i}`] ?? step.atMin;
const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const stepLabel = (html) => html.replace(/<[^>]+>/g, "").split(/[,.:]/)[0].trim();
const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function renderFlow() {
  setTopbar(`${backButton()}<h1 class="topbar-title">Exam flow</h1>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  const P = state.data.protocols;
  if (!P?.flow) { view.innerHTML = notFoundHtml("This page isn't in the app."); return; }
  const f = flowState();
  const p = flowProtocol(f);
  // A few protocols fit as chips; a longer list goes in a dropdown so the steps stay near the top.
  const pick = P.list.length > 6
    ? `<label class="flow-select"><span>Protocol</span><span class="flow-select-box"><select data-flow-pick>${P.list.map((x) => `<option value="${esc(x.id)}"${x.id === p.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></span></label>`
    : P.list.length > 1
    ? `<div class="chips flow-pick">${P.list.map((x) => `<button class="chip" type="button" data-action="flow-pick" data-id="${esc(x.id)}" aria-pressed="${x.id === p.id}">${esc(x.name)}</button>`).join("")}</div>`
    : "";
  let n = 0;
  const steps = p.groups.map((gr) => `${gr.label ? `<h2 class="flow-group">${esc(gr.label)}</h2>` : ""}<ol class="flow">${gr.steps.map((s) => {
    const i = n++;
    const done = f.done.includes(i);
    const contrast = s.contrast
      ? `<div class="flow-contrast">${f.contrastAt ? `<span>Contrast in at ${esc(clockTime(f.contrastAt))}</span> · <button class="text-btn flow-restart" type="button" data-action="flow-clock-restart">Restart</button>` : `<button class="btn" type="button" data-action="flow-contrast">${ICON.clock}Contrast in</button>`}</div>`
      : "";
    let html = s.html;
    let timing = "";
    if (s.atMin) {
      const m = flowMinutes(p, i, s);
      if (m !== s.atMin) html = html.replace(new RegExp(`\\b${s.atMin}(?:\\s*[–-]\\s*\\d+)?(\\s*min)`), `${m}$1`);
      timing = ` <span class="flow-at" data-at="${m}">${m} min</span>` +
        `<div class="flow-adjust" role="group" aria-label="Minutes after contrast"><span class="flow-adjust-label">Change time</span><button class="flow-adj" type="button" data-action="flow-time" data-i="${i}" data-d="-1" aria-label="One minute earlier"${m <= FLOW_MIN ? " disabled" : ""}>−</button>` +
        `<span>${m} min</span>` +
        `<button class="flow-adj" type="button" data-action="flow-time" data-i="${i}" data-d="1" aria-label="One minute later"${m >= FLOW_MAX ? " disabled" : ""}>+</button>` +
        `${m !== s.atMin ? `<button class="text-btn" type="button" data-action="flow-time" data-i="${i}" data-d="reset">Back to ${s.atMin}</button>` : ""}</div>`;
    }
    return `<li class="flow-step${done ? " done" : ""}"><button type="button" class="tick" data-action="flow-tick" data-i="${i}" aria-pressed="${done}" aria-label="Step ${i + 1} done">${ICON.check}</button><div class="flow-text"><span class="flow-num">${i + 1}.</span> ${html}${timing}${contrast}</div></li>`;
  }).join("")}</ol>`).join("");
  view.innerHTML = `<div class="flow-head"><h1 class="guide-title">${esc(p.name)}</h1><p class="guide-meta">Tick each step as you go. Tap <strong>Contrast in</strong> when you inject, and the clock counts up to the timed steps.</p></div>${pick}<div class="flow-clock" id="flow-clock" role="timer" hidden></div>${steps}<p class="flow-foot"><a href="${link.guide(P.slug)}#${esc(p.id)}">Protocol notes</a> · <button class="text-btn" type="button" data-action="flow-reset">Start over</button></p>`;
  tickFlowClock();
  clearInterval(state.flowTimer);
  state.flowTimer = setInterval(() => {
    if (!location.pathname.startsWith("/flow")) { clearInterval(state.flowTimer); return; }
    tickFlowClock();
  }, 1000);
}

function tickFlowClock() {
  const el = $("#flow-clock");
  if (!el) return;
  const f = flowState();
  const p = flowProtocol(f);
  if (!f.contrastAt || !p) { el.hidden = true; return; }
  const s = Math.max(0, Math.floor((Date.now() - f.contrastAt) / 1000));
  const all = p.groups.flatMap((g) => g.steps);
  const next = all.map((x, i) => ({ ...x, i, atMin: x.atMin ? flowMinutes(p, i, x) : null })).find((x) => x.atMin && !f.done.includes(x.i));
  let status = "";
  if (next) {
    const left = next.atMin * 60 - s;
    status = left > 0 ? `<span>${esc(stepLabel(next.html))} in ${mmss(left)}</span>` : `<span class="due">${esc(stepLabel(next.html))}: now</span>`;
    if (left <= 0 && state.flowAlerted !== `${f.contrastAt}:${next.i}`) {
      state.flowAlerted = `${f.contrastAt}:${next.i}`;
      if (left > -5) { toast(`${stepLabel(next.html)}: ${next.atMin} minutes since contrast`); navigator.vibrate?.(300); }
    }
  }
  el.hidden = false;
  el.innerHTML = `${ICON.clock}<span class="flow-clock-label">Since contrast</span><strong>${mmss(s)}</strong>${status}`;
  document.querySelectorAll(".flow-at").forEach((c) => {
    const left = Number(c.dataset.at) * 60 - s;
    c.classList.toggle("due", left <= 0);
    c.textContent = left <= 0 ? `${c.dataset.at} min · now` : `in ${mmss(left)}`;
  });
}

function renderParameters() {
  setTopbar(`${backButton()}<span class="topbar-title" id="guide-bar-title"></span>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  const p = state.data.parameters;
  if (!p) { view.innerHTML = notFoundHtml("This page isn't in the app."); return; }
  view.innerHTML = p.html;
  $("#guide-bar-title").textContent = "LV parameters";
}

function renderCards() {
  setTopbar(`${backButton()}<span class="topbar-title" id="guide-bar-title"></span>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  const c = state.data.cards;
  if (!c) { view.innerHTML = notFoundHtml("This page isn't in the app."); return; }
  view.innerHTML = c.html;
  $("#guide-bar-title").textContent = c.title;
}

function renderSaved() {
  setTopbar(`<h1 class="topbar-title" style="margin-left:8px">Saved</h1>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  const list = prefs.savedSlugs().map((s) => state.data.bySlug.get(s)).filter(Boolean);
  view.innerHTML = list.length
    ? `<p class="lede">Your go-to guides, newest saved first.</p>${rowsHtml(list)}`
    : `<div class="empty"><h2>Nothing saved yet</h2><p>Tap the bookmark at the top of any guide to keep it here for quick access at the scanner.</p><a class="btn secondary" href="${link.home}">Browse guides</a></div>`;
}

function renderSettings() {
  setTopbar(`${backButton()}<h1 class="topbar-title">Settings</h1>`);
  const seg = (name, current, options) =>
    `<div class="seg" role="group">${options.map(([v, label]) => `<button type="button" data-pref="${name}" data-value="${v}" aria-pressed="${current === v}">${label}</button>`).join("")}</div>`;
  const o = state.offline;
  const guideCount = state.data?.guides.length ?? 0;
  let offlineText;
  if (!("serviceWorker" in navigator) || !("caches" in window)) offlineText = "This browser can't save guides for offline use.";
  else if (o.running) offlineText = `Saving images and cine clips for offline use: ${o.done} of ${o.total}.`;
  else if (o.complete) offlineText = `All ${guideCount} guides, with their images and cine clips, are saved on this device.`;
  else offlineText = `Guides you open are saved automatically. Save everything now (about 30 MB) to have every image and cine clip ready before you're at the scanner.`;

  let install;
  if (isStandalone()) install = `<p>Installed on this device.</p>`;
  else if (isIOS()) install = `<ol class="steps"><li>Open this page in Safari.</li><li>Tap <strong>Share</strong> (on iOS 26, tap <strong>•••</strong> next to the address bar, then <strong>Share</strong>).</li><li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol>`;
  else if (state.installPrompt) install = `<p>Add the app to this device for one-tap access.</p><button class="btn" data-action="install">Install app</button>`;
  else install = `<p>Use your browser's menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>`;
  if (!isStandalone()) install += `<p><a href="${link.guide("install-the-app")}">Step-by-step instructions for every device</a></p>`;

  view.innerHTML = `
    <section class="setting"><h2>Offline reading</h2><p id="offline-text">${offlineText}</p>
      <button class="btn" data-action="save-offline"${o.running || !guideCount ? " disabled" : ""}>Save everything for offline</button>
      <div class="progress" ${o.running ? "" : "hidden"}><i id="offline-bar" style="width:${o.total ? Math.round((o.done / o.total) * 100) : 0}%"></i></div>
    </section>
    <section class="setting"><h2>Text size</h2><p>Applies across the app: guides, lists, the exam flow and Quick plan captions. The <strong>Aa</strong> button at the top of a guide changes it too.</p>${seg("text", prefs.get("text", "m"), [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Largest"]])}</section>
    <section class="setting"><h2>Appearance</h2><p>Dark is easier on the eyes in a dim control room.</p>${seg("theme", prefs.get("theme", "system"), [["system", "Match device"], ["light", "Light"], ["dark", "Dark"]])}</section>
    <section class="setting"><h2>Install</h2>${install}</section>
    <section class="setting"><h2>Check for new guides</h2><p>${state.data ? `Guides last updated ${fmtDate(state.data.generatedAt)}.` : ""}</p><button class="btn secondary" data-action="refresh">Check now</button></section>
    ${aboutHtml()}`;
}

function aboutHtml() {
  const site = state.data?.site || {};
  const contact = site.feedbackEmail
    ? `<p>Spotted an error or have a suggestion? Email <a href="mailto:${esc(site.feedbackEmail)}">${esc(site.feedbackEmail)}</a>.</p>`
    : "";
  return `<section class="setting"><h2>About</h2>${site.disclaimer ? `<p>${esc(site.disclaimer)}</p>` : ""}${contact}<p class="fine">Cardiac MRI Hub, version ${APP_VERSION}</p></section>`;
}

function notFoundHtml(msg) {
  return `<div class="empty"><h2>Not found</h2><p>${esc(msg)}</p><a class="btn secondary" href="${link.home}">Browse all guides</a></div>`;
}

/* ---------------- router ---------------- */
const scrollMemory = new Map();
const routeKey = () => location.pathname + location.search;
let navigatedInApp = false;
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// Addresses from before version 1.2 looked like /#/guide/lv-4-chamber.
function hashToPath(hash) {
  const [p, qs] = hash.replace(/^#/, "").split("?");
  const path = !p || p === "/" ? "/" : p.replace(/\/?$/, "/");
  return path + (qs ? `?${qs}` : "");
}
if (location.hash.startsWith("#/")) history.replaceState(null, "", hashToPath(location.hash));

function parseRoute() {
  const [section, arg] = location.pathname.split("/").filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  return { section, arg: arg || "", params: new URLSearchParams(location.search) };
}

function pageTitle(section, arg) {
  const name = "Cardiac MRI Hub";
  const g = section === "guide" ? state.data?.bySlug.get(arg) : null;
  const t = section === "topic" ? state.data?.topicBySlug.get(arg) : null;
  const label = g ? g.title : t ? t.label
    : { topics: "Topics", search: "Search", saved: "Saved", settings: "Settings", plan: "Quick plan", flow: "Exam flow", cards: state.data?.cards?.title || "Planning cards", parameters: state.data?.parameters?.title || "LV parameters" }[section];
  return label ? `${label} | ${name}` : name;
}

function route() {
  const { section, arg, params } = parseRoute();
  const tab = { undefined: "home", topics: "topics", topic: "topics", search: "search", saved: "saved", plan: "plan", parameters: "plan", cards: "plan", flow: "plan" }[section] || "";
  document.querySelectorAll("#tabbar a").forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  switch (section) {
    case undefined: renderHome(); break;
    case "topics": renderTopics(); break;
    case "topic": renderTopic(arg); break;
    case "guide": renderGuide(arg); break;
    case "search": renderSearch(params.get("q") || ""); break;
    case "saved": renderSaved(); break;
    case "settings": renderSettings(); break;
    case "plan": renderPlan(); break;
    case "parameters": renderParameters(); break;
    case "cards": renderCards(); break;
    case "flow": renderFlow(); break;
    default: setTopbar(backButton()); view.innerHTML = notFoundHtml("That page doesn't exist.");
  }
  document.title = pageTitle(section, arg);
}

function showRoute(scrollY) {
  route();
  window.scrollTo(0, scrollY);
  if (!location.pathname.startsWith("/search")) view.focus({ preventScroll: true });
  scrollToHashTarget();
}
// Addresses like /topics/#all open at that part of the page.
function scrollToHashTarget() {
  if (location.hash.length > 1 && !location.hash.startsWith("#/")) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }
}

function go(url) {
  const same = url === routeKey();
  history[same ? "replaceState" : "pushState"](null, "", url);
  navigatedInApp = true;
  showRoute(0);
}

window.addEventListener("popstate", () => {
  if (!lightbox.hidden) { closeLightbox(); return; } // Back closes the image viewer first,
  if (!deck.hidden) { closeDeck(); return; }        // then the quick plan.
  navigatedInApp = true;
  showRoute(scrollMemory.get(routeKey()) || 0);
});
window.addEventListener("scroll", () => {
  scrollMemory.set(routeKey(), window.scrollY);
  topbar.classList.toggle("scrolled", window.scrollY > 4);
}, { passive: true });

/* ---------------- interactions ---------------- */
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

const TEXT_SIZES = [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Largest"]];

document.addEventListener("click", async (e) => {
  const jump = e.target.closest("[data-jump]");
  if (jump) {
    e.preventDefault();
    document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  // Links to the app's own pages change the view in place instead of reloading.
  const a = e.target.closest("a[href]");
  if (a && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !a.target && !a.hasAttribute("download")) {
    const href = a.getAttribute("href");
    if (href.startsWith("#/")) { e.preventDefault(); go(hashToPath(href)); return; }
    if (/^\/(?!\/)/.test(href) && !/\.[a-z0-9]+$/i.test(href.split(/[?#]/)[0])) { e.preventDefault(); go(href); return; }
  }
  const img = e.target.closest(".prose figure img");
  if (img) { openLightbox(img); return; }

  const chip = e.target.closest("[data-suggest]");
  if (chip) {
    const input = $("#q");
    input.value = chip.dataset.suggest;
    input.dispatchEvent(new Event("input"));
    return;
  }
  const pref = e.target.closest("[data-pref]");
  if (pref) {
    prefs.set(pref.dataset.pref, pref.dataset.value);
    applyPrefs();
    pref.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === pref)));
    return;
  }
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const here = parseRoute();
  const slug = here.section === "guide" ? here.arg : "";
  switch (btn.dataset.action) {
    case "back":
      if (navigatedInApp && history.length > 1) history.back(); else go(link.home);
      break;
    case "toggle-save": {
      const nowSaved = prefs.toggleSaved(slug);
      btn.setAttribute("aria-pressed", String(nowSaved));
      btn.setAttribute("aria-label", nowSaved ? "Remove from saved" : "Save guide");
      toast(nowSaved ? "Saved" : "Removed from saved");
      break;
    }
    case "text-size": {
      const cur = prefs.get("text", "m");
      const next = TEXT_SIZES[(TEXT_SIZES.findIndex(([v]) => v === cur) + 1) % TEXT_SIZES.length];
      prefs.set("text", next[0]);
      applyPrefs();
      toast(`Text size: ${next[1]}`);
      break;
    }
    case "share": {
      const g = state.data?.bySlug.get(slug);
      const data = { title: g?.title || document.title, url: location.href };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(data.url); toast("Link copied"); }
      } catch { /* share sheet dismissed */ }
      break;
    }
    case "flow-tick": {
      const f = flowState();
      const i = Number(btn.dataset.i);
      f.done = f.done.includes(i) ? f.done.filter((x) => x !== i) : [...f.done, i];
      f.protocol = flowProtocol(f)?.id || null;
      saveFlow(f);
      renderFlow();
      break;
    }
    case "flow-contrast": {
      const f = flowState();
      const p = flowProtocol(f);
      f.protocol = p?.id || null;
      f.contrastAt = Date.now();
      const i = p ? p.groups.flatMap((g) => g.steps).findIndex((x) => x.contrast) : -1;
      if (i >= 0 && !f.done.includes(i)) f.done.push(i);
      saveFlow(f);
      renderFlow();
      break;
    }
    case "flow-time": {
      const p = flowProtocol();
      const i = Number(btn.dataset.i);
      const step = p?.groups.flatMap((g) => g.steps)[i];
      if (!step?.atMin) break;
      const times = { ...prefs.get("flowTimes", {}) };
      const key = `${p.id}:${i}`;
      if (btn.dataset.d === "reset") delete times[key];
      else times[key] = Math.min(FLOW_MAX, Math.max(FLOW_MIN, flowMinutes(p, i, step) + Number(btn.dataset.d)));
      if (times[key] === step.atMin) delete times[key];
      prefs.set("flowTimes", times);
      state.flowAlerted = null;
      renderFlow();
      break;
    }
    case "flow-clock-restart": {
      // Tapped early, or the injection was held up: count from now and keep the ticks.
      const f = flowState();
      f.contrastAt = Date.now();
      saveFlow(f);
      state.flowAlerted = null;
      renderFlow();
      toast("Clock restarted from now");
      break;
    }
    case "flow-reset": {
      const p = flowProtocol();
      saveFlow({ protocol: p?.id || null, done: [], contrastAt: null });
      renderFlow();
      window.scrollTo(0, 0);
      toast("Started over");
      break;
    }
    case "flow-pick": {
      saveFlow({ protocol: btn.dataset.id, done: [], contrastAt: null });
      renderFlow();
      break;
    }
    case "clear-search": {
      const input = $("#q");
      input.value = "";
      input.dispatchEvent(new Event("input"));
      input.focus();
      break;
    }
    case "retry":
      await loadContent();
      route();
      break;
    case "refresh": {
      btn.disabled = true;
      const changed = await loadContent();
      if (state.loadError) toast(navigator.onLine ? "Couldn't check right now" : "You're offline");
      else toast(changed ? "New guides loaded" : "You have the latest guides");
      route();
      if (changed) saveEverythingOffline();
      break;
    }
    case "save-offline":
      saveEverythingOffline(true);
      break;
    case "quick-plan":
      openQuickPlan(btn.dataset.slug);
      break;
    case "print":
      // Load every image first so none print blank.
      view.querySelectorAll("img[loading='lazy']").forEach((i) => { i.loading = "eager"; });
      await Promise.all([...view.querySelectorAll("img")].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
      window.print();
      break;
    case "dismiss-ios":
      prefs.set("iosHintDismissed", true);
      btn.closest(".notice").remove();
      break;
    case "install":
      if (state.installPrompt) {
        state.installPrompt.prompt();
        const choice = await state.installPrompt.userChoice.catch(() => null);
        if (choice?.outcome !== "accepted") prefs.set("installDismissed", true);
        state.installPrompt = null;
        route();
      }
      break;
    case "apply-update":
      state.updateReady?.postMessage("skip-waiting");
      break;
  }
});

/* ---------------- image viewer ---------------- */
const lightbox = $("#lightbox");
function openLightbox(img) {
  const stageImg = $("#lightbox-stage img");
  stageImg.src = img.currentSrc || img.src;
  stageImg.alt = img.alt;
  $("#lightbox-caption").textContent = img.closest("figure")?.querySelector("figcaption")?.textContent || "";
  lightbox.classList.remove("zoomed");
  lightbox.querySelector('[data-lb="zoom"]').textContent = "Zoom";
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  history.pushState({ lightbox: true }, "");
  lightbox.querySelector('[data-lb="close"]').focus();
}
function closeLightbox() {
  if (lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.style.overflow = deck.hidden ? "" : "hidden";
}
lightbox.addEventListener("click", (e) => {
  const action = e.target.closest("[data-lb]")?.dataset.lb;
  if (action === "close" || e.target.id === "lightbox-stage") { history.back(); return; }
  if (action === "zoom" || e.target.closest("#lightbox-stage img")) {
    const zoomed = lightbox.classList.toggle("zoomed");
    lightbox.querySelector('[data-lb="zoom"]').textContent = zoomed ? "Fit" : "Zoom";
  }
});
document.addEventListener("change", (e) => {
  const sel = e.target.closest?.("select[data-flow-pick]");
  if (!sel) return;
  saveFlow({ protocol: sel.value, done: [], contrastAt: null });
  renderFlow();
});

document.addEventListener("keydown", (e) => {
  if (!lightbox.hidden) { if (e.key === "Escape") history.back(); return; }
  if (!deck.hidden) {
    if (e.key === "Escape") history.back();
    else if (e.key === "ArrowRight") { e.preventDefault(); deckStep(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); deckStep(-1); }
  }
});

/* ---------------- quick plan: a full-screen deck of a guide's images and clips ---------------- */
const deck = $("#deck");
const track = $("#deck-track");
let deckIndex = -1;
function openQuickPlan(slug) {
  const g = state.data?.bySlug.get(slug);
  if (!g?.figures?.length) return;
  const n = g.figures.length;
  $("#deck-title").textContent = listTitle(g);
  track.innerHTML = g.figures.map((f, i) => `<figure class="deck-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}">
      ${f.section ? `<p class="deck-section">${esc(f.section)}</p>` : ""}
      <div class="deck-media">${f.type === "video"
        ? `<video src="${esc(f.src)}" muted loop playsinline controls preload="metadata" aria-label="${esc(f.alt || "Cine clip")}"></video>`
        : `<img src="${esc(f.src)}" alt="${esc(f.alt || "")}"${f.w ? ` width="${f.w}" height="${f.h}"` : ""} decoding="async">`}</div>
      ${f.captionHtml ? `<figcaption>${f.captionHtml}</figcaption>`
        : f.alt && f.alt !== "Cine clip" ? `<figcaption class="alt-cap">${esc(f.alt)}</figcaption>` : ""}
    </figure>`).join("");
  deck.classList.toggle("single", n === 1);
  deck.hidden = false;
  document.body.style.overflow = "hidden";
  history.pushState({ deck: true }, "");
  track.scrollLeft = 0;
  deckIndex = -1;
  updateDeck();
  deck.querySelector('[data-deck="close"]').focus();
}
function closeDeck() {
  if (deck.hidden) return;
  track.querySelectorAll("video").forEach((v) => v.pause());
  deck.hidden = true;
  track.innerHTML = "";
  document.body.style.overflow = "";
}
function updateDeck() {
  const slides = track.children;
  if (!slides.length || !track.clientWidth) return;
  const i = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  if (i === deckIndex) return;
  deckIndex = i;
  $("#deck-count").textContent = `${i + 1} / ${slides.length}`;
  [...slides].forEach((s, k) => {
    const v = s.querySelector("video");
    if (v) { if (k === i) v.play().catch(() => {}); else v.pause(); }
  });
  deck.querySelector('[data-deck="prev"]').disabled = i === 0;
  deck.querySelector('[data-deck="next"]').disabled = i === slides.length - 1;
}
function deckStep(d) {
  track.scrollBy({ left: d * track.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
track.addEventListener("scroll", () => requestAnimationFrame(updateDeck), { passive: true });
window.addEventListener("resize", () => { if (!deck.hidden) { track.scrollLeft = Math.max(0, deckIndex) * track.clientWidth; } });
deck.addEventListener("click", (e) => {
  const action = e.target.closest("[data-deck]")?.dataset.deck;
  if (action === "close") { history.back(); return; }
  if (action === "prev") { deckStep(-1); return; }
  if (action === "next") { deckStep(1); return; }
  const img = e.target.closest(".deck-media img");
  if (img) openLightbox(img);
});

/* ---------------- offline: images ---------------- */
async function saveEverythingOffline(userAsked = false) {
  if (!state.data || !("caches" in window) || state.offline.running) return;
  const conn = navigator.connection;
  if (!userAsked && conn && (conn.saveData || /2g/.test(conn.effectiveType || ""))) return;
  if (userAsked && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  const urls = [...new Set(state.data.guides.flatMap((g) => g.images))];
  const clips = [...new Set(state.data.guides.flatMap((g) => g.videos || []))];
  const o = state.offline;
  Object.assign(o, { total: urls.length + clips.length, done: 0, running: true, complete: false });
  updateOfflineUi();
  const imageCache = await caches.open(IMAGE_CACHE);
  const videoCache = await caches.open(VIDEO_CACHE);
  let failed = 0;
  // The guide list itself, in case it was first loaded before the offline helper was running.
  try {
    const res = await fetch("/content/guides.json");
    if (res.ok) await (await caches.open(CONTENT_CACHE)).put("/content/guides.json", res);
  } catch { /* offline: whatever is saved stays */ }
  const queue = [...urls.map((u) => [u, imageCache]), ...clips.map((u) => [u, videoCache])];
  const worker = async () => {
    while (queue.length) {
      const [url, cache] = queue.shift();
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res); else failed++;
        }
      } catch { failed++; }
      o.done++;
      updateOfflineUi();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (!failed) {
    // Drop saved images the guides no longer use, including older versions of replaced ones.
    const keep = new Set(urls.map((u) => new URL(u, location.href).href));
    for (const key of await imageCache.keys()) if (!keep.has(key.url)) await imageCache.delete(key);
  }
  o.running = false;
  o.complete = failed === 0;
  updateOfflineUi();
  if (userAsked) toast(failed ? `${failed} files couldn't be saved. Try again on a better connection.` : "Everything is saved for offline");
}
function updateOfflineUi() {
  if (!location.pathname.startsWith("/settings")) return;
  const o = state.offline;
  const bar = $("#offline-bar");
  if (bar && o.running) {
    bar.parentElement.hidden = false;
    bar.style.width = `${o.total ? Math.round((o.done / o.total) * 100) : 0}%`;
    $("#offline-text").textContent = `Saving images and cine clips for offline use: ${o.done} of ${o.total}.`;
  } else if (!o.running) {
    renderSettings();
  }
}

/* ---------------- service worker + install ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const watch = (worker) => {
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            state.updateReady = worker;
            $("#update-bar").hidden = false;
          }
        });
      };
      // An update that finished downloading last time is applied as the app opens (one quick reload),
      // so nobody has to find the Update button to get new pictures or fixes.
      if (reg.waiting && navigator.serviceWorker.controller) {
        state.updateReady = reg.waiting;
        reg.waiting.postMessage("skip-waiting");
      }
      reg.addEventListener("updatefound", () => reg.installing && watch(reg.installing));
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (state.updateReady && !reloading) { reloading = true; location.reload(); }
      });
    } catch { /* offline support unavailable */ }
  });
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  state.installPrompt = e;
  if ((location.pathname === "/" || location.pathname.startsWith("/settings")) && state.data) route();
});
window.addEventListener("online", () => state.data && route());
window.addEventListener("offline", () => state.data && route());
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !navigator.onLine || !state.data) return;
  const age = Date.now() - (state.lastCheck || 0);
  if (age < 30 * 60 * 1000) return;
  state.lastCheck = Date.now();
  if (await loadContent()) { route(); saveEverythingOffline(); }
});

/* ---------------- start ---------------- */
// Pages written by the build already contain their content; keep it on screen until the
// guide list has loaded, rather than flashing "Loading…". (When offline, the saved home page
// can stand in for another address, so only trust content written for this address.)
const prerendered = view.dataset.prerendered === location.pathname;
if (!prerendered) route();
await loadContent();
state.lastCheck = Date.now();
if (state.data || !prerendered) route();
view.removeAttribute("data-prerendered");
scrollToHashTarget();
if (navigator.onLine) setTimeout(() => saveEverythingOffline(), 1500);
