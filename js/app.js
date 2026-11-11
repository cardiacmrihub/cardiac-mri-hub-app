// Cardiac MRI Hub — the app.
// Content comes from /content/guides.json (built from the Markdown files in content/guides/).
// Every view has a real address, and the build writes a real page for each one so search
// engines and link previews see the content:
//   /  /topics/  /topic/:slug/  /guide/:slug/  /search/?q=  /saved/  /settings/
// Old #/guide/… links still work: they're switched to the matching address on load.

import { prefs } from "./prefs.js";
import { glyph, glyphFor, LOGO } from "./glyphs.js";
import { searchGuides, searchSections, highlight, snippetAround, suggestions } from "./search.js";

const APP_VERSION = "1.15.2";
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
  about: "/about/",
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
const titleClass = (g) => `guide-title${listTitle(g).length > 60 ? " long" : ""}`;
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
const returningUser = () => isStandalone() || prefs.get("launches", 0) >= 3;
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
  const cont = last ? `<h2 class="section">Continue reading</h2>${rowsHtml([last])}` : "";
  const start = d.guides.filter((g) => g.startHere && g !== last).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  let startHtml = "";
  if (start.length) {
    startHtml += `<h2 class="section">Start here</h2>`;
    for (const g of start) {
      const media = g.cover ? `<img src="${esc(g.cover)}" alt="">` : glyph(glyphFor(topicOf(g)));
      startHtml += `<a class="feature" href="${link.guide(g.slug)}"><div class="feature-media">${media}</div><h3>${esc(listTitle(g))}</h3><p>${esc(g.summary)}</p></a>`;
    }
  }
  const scanner = atScannerHtml(exam ? "" : flowCardHtml());
  // Newcomers (and Google) see Start here first; people who keep coming back, or installed the app, get the
  // scanner tools first and the beginner's guide further down.
  html += returningUser() ? scanner + cont + startHtml : cont + startHtml + scanner;
  const topics = topicsWithGuides();
  if (topics.length) {
    html += `<h2 class="section">Topics</h2><div class="tiles">`;
    for (const t of topics) {
      html += `<a class="tile" href="${link.topic(t.slug)}">${glyph(glyphFor(t))}<strong>${esc(t.label)}</strong><span>${t.count} ${t.count === 1 ? "guide" : "guides"}</span></a>`;
    }
    html += `</div>`;
  }
  html += recentHtml(d.guides) + aboutFootHtml();
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
// About link at the foot of the home page (the build writes the same: aboutFoot).
function aboutFootHtml() {
  return state.data?.about ? `<p class="home-foot"><a href="${link.about}">About Cardiac MRI Hub and its sources</a></p>` : "";
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
    <h1 class="${titleClass(g)}">${esc(listTitle(g))}</h1>
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
  const def = defineHtml(glossaryHit(q)) + sectionHitsHtml(searchSections(state.data.guides, q));
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

// Cards inside a guide (the artifact cards) that match the search, linked straight to the card.
function sectionHitsHtml(hits) {
  if (!hits.length) return "";
  return `<p class="hint">Jump to ${hits.length === 1 ? "a card" : `${hits.length} cards`}</p><ul class="rows">${hits.slice(0, 6).map(({ guide: g, section: s, terms }) => {
    const media = g.cover ? `<img src="${esc(g.cover)}" alt="" loading="lazy">` : glyph(glyphFor(topicOf(g)));
    return `<li><a class="row" href="${link.guide(g.slug)}#${esc(s.id)}"><span class="row-media">${media}</span><span><span class="row-title">${highlight(s.text, terms)}</span><span class="row-meta">${esc(listTitle(g))}${s.also ? ` · also called ${highlight(s.also, terms)}` : ""}</span></span><span class="row-flag"></span></a></li>`;
  }).join("")}</ul>`;
}

// Exam-flow steps link to the matching part of the artifact guide.
const ARTIFACT_GUIDE = "artifact-troubleshooting";
const ARTIFACT_STEPS = [ // first match wins: "TI scout, 5 minutes after rest perfusion" is an LGE step
  [/\bTI scout\b|\bLGE\b|\bPSIR\b|\bEGE\b|\b(?:dark|black)-blood\b/i, "lge-and-dark-blood"],
  [/\bperfusion\b/i, "perfusion"],
  [/\bT[12] maps?\b|\bT2\*|\bMOLLI\b/i, "maps"],
  [/\bflows?\b|phase contrast/i, "flow-phase-contrast"],
  [/\bcines?\b/i, "cines"],
];
function artifactLink(step, group) {
  if (!state.data?.guides?.some((g) => g.slug === ARTIFACT_GUIDE) || /^(localizers|close out)$/i.test(group || "")) return "";
  const text = step.html.replace(/<[^>]+>/g, " ");
  const hit = ARTIFACT_STEPS.find(([re]) => re.test(text));
  return hit ? ` <a class="flow-help" href="${link.guide(ARTIFACT_GUIDE)}#${hit[1]}">Artifacts</a>` : "";
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
// ---------- My protocol: a device's own version of a protocol ----------
// Saved in prefs "flowCustom" as { [protocol id]: { name, hidden: [key], added: { key: text }, layout: [{ label, keys }] } }.
// Steps are matched by key (from their words), so the standard protocol can change underneath without losing much:
// a step added to it later slots in after its standard neighbour; a step taken out of it just disappears.
const flowCustomAll = () => prefs.get("flowCustom", {});
const flowCustom = (id) => flowCustomAll()[id] || null;
function saveFlowCustom(id, c) {
  const all = { ...flowCustomAll() };
  if (c) all[id] = c; else delete all[id];
  prefs.set("flowCustom", all);
}
// Protocols made on the device ("+ New protocol"): prefs "flowOwn" = [{ id, name, from }]. One made from a copy
// keeps the standard protocol it came from (from) and works like an edited copy of it; a blank one starts with the
// localizers and a contrast step and ends with the close-out checks. Their steps, order and names are saved in flowCustom like any edited protocol.
const flowOwnList = () => prefs.get("flowOwn", []);
function blankProtocol(id, name) {
  const loc = state.data.protocols.list[0].groups.find((g) => g.label === "Localizers");
  const end = state.data.protocols.list[0].groups.find((g) => g.label === "Close out");
  return {
    id, name, groups: [
      ...(loc ? [loc] : []),
      { label: "Before contrast", steps: [] },
      { label: "Contrast", steps: [{ key: "contrast-in", html: "Contrast injection", contrast: true, atMin: null }] },
      { label: "After contrast", steps: [] },
      ...(end ? [end] : []),
    ],
  };
}
function findProtocol(id) {
  const P = state.data?.protocols;
  if (!P) return null;
  const std = P.list.find((x) => x.id === id);
  if (std) return std;
  const own = flowOwnList().find((x) => x.id === id);
  if (!own) return null;
  const src = own.from && P.list.find((x) => x.id === own.from);
  return src ? { ...src, id: own.id, name: own.name, own: true, from: src.id } : { ...blankProtocol(own.id, own.name), own: true, from: null };
}

// Same wording rule as the build: "10 minutes after contrast" times a step.
const TIMED_STEP = /(\d+)(?:\s*[–-]\s*\d+)?\s*min(?:ute)?s?\s+after\s+(?:the\s+)?(?:stress\s+|first\s+)?(?:contrast|injection)/i;
function addedStep(key, text) {
  const at = TIMED_STEP.exec(text);
  return { key, html: esc(text), added: true, contrast: false, atMin: at ? Number(at[1]) : null };
}
function effectiveProtocol(base) {
  const c = flowCustom(base.id);
  if (!c) return { ...base, base, edited: false, groups: base.groups.map((g) => ({ ...g, steps: g.steps.map((x) => ({ ...x, hidden: false })) })) };
  const byKey = new Map();
  base.groups.forEach((g) => g.steps.forEach((x) => byKey.set(x.key, x)));
  for (const [k, t] of Object.entries(c.added || {})) byKey.set(k, addedStep(k, t));
  const used = new Set();
  const groups = c.layout
    ? c.layout.map((g) => ({ label: g.label, steps: g.keys.filter((k) => byKey.has(k) && !used.has(k)).map((k) => (used.add(k), byKey.get(k))) }))
    : base.groups.map((g) => ({ label: g.label, steps: [] }));
  // Standard steps the saved layout doesn't have yet: after their standard neighbour, or first in their group.
  base.groups.forEach((bg) => bg.steps.forEach((x, i) => {
    if (used.has(x.key)) return;
    used.add(x.key);
    const prev = i > 0 ? bg.steps[i - 1].key : null;
    for (const g of groups) {
      const j = prev ? g.steps.findIndex((y) => y.key === prev) : -1;
      if (j >= 0) { g.steps.splice(j + 1, 0, x); return; }
    }
    let g = groups.find((y) => y.label === bg.label);
    if (!g) { g = { label: bg.label, steps: [] }; groups.push(g); }
    if (i === 0) g.steps.unshift(x); else g.steps.push(x);
  }));
  const hidden = new Set(c.hidden || []);
  return {
    ...base, base, edited: true, name: c.name || base.name,
    groups: groups.map((g) => ({ ...g, steps: g.steps.map((x) => ({ ...x, hidden: hidden.has(x.key) && !x.contrast })) })),
  };
}
// The visible steps, in order, as the exam runs them.
const runSteps = (p) => p.groups.flatMap((g) => g.steps.filter((x) => !x.hidden));
// Saves an edit: the layout as it stands, then the change.
function editFlowCustom(p, change) {
  const c = { ...(flowCustom(p.id) || {}) };
  c.layout = p.groups.map((g) => ({ label: g.label, keys: g.steps.map((x) => x.key) }));
  change(c);
  saveFlowCustom(p.id, c);
}

// The exam-flow card on Home and in the Plan tab: back to the exam in progress, or the last protocol run.
function flowCardHtml() {
  const P = state.data?.protocols;
  if (!P?.flow) return "";
  const f = flowState();
  const base = findProtocol(f.protocol);
  const p = base ? effectiveProtocol(base) : null;
  let title = "Exam flow";
  let sub = "Tick off each step, with a clock that starts when you inject contrast";
  if (p && flowActive()) {
    const steps = runSteps(p);
    const done = steps.filter((x) => f.done.includes(x.key)).length;
    title = "Back to your exam";
    sub = `${esc(p.name)} · ${done} of ${steps.length} steps done${f.contrastAt ? ` · ${clockFrom(p)} in at ${esc(clockTime(f.contrastAt))}` : ""}`;
  } else if (p && prefs.get("flowLast", null)) {
    sub = `Last exam: ${esc(p.name)}. Tick off each step, with a contrast clock.`;
  }
  return `<a class="flow-launch${flowActive() ? " active" : ""}" href="${link.flow}">${ICON.clock}<span><strong>${title}</strong><span>${sub}</span></span></a>`;
}
function flowProtocol(f = flowState()) {
  const P = state.data?.protocols;
  if (!P) return null;
  const base = findProtocol(f.protocol) || P.list[0];
  return effectiveProtocol(base);
}
// A timed step's minutes can be changed on the device (each site runs its own timing); kept until changed back.
const FLOW_MIN = 1, FLOW_MAX = 30;
const flowMinutes = (p, step) => prefs.get("flowTimes", {})[`${p.id}:${step.key}`] ?? step.atMin;
// Times saved before steps had keys were saved by position ("cardiomyopathy:10"); move them to the step's key once.
function migrateFlowTimes() {
  const times = prefs.get("flowTimes", {});
  const old = Object.keys(times).filter((k) => /:\d+$/.test(k));
  if (!old.length) return;
  const next = { ...times };
  for (const k of old) {
    const [id, n] = k.split(":");
    const base = state.data.protocols.list.find((x) => x.id === id);
    const step = base?.groups.flatMap((g) => g.steps)[Number(n)];
    if (step?.atMin) next[`${id}:${step.key}`] = times[k];
    delete next[k];
  }
  prefs.set("flowTimes", next);
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const stepLabel = (html) => html.replace(/<[^>]+>/g, "").split(/[,.:]/)[0].trim();
const plainText = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// What starts the clock: the contrast injection, or the stress agent in a stress protocol.
const clockFrom = (p) => p?.clockFrom || "contrast";
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function renderFlow() {
  if (!state.data) { setTopbar(`${backButton()}<h1 class="topbar-title">Exam flow</h1>`); view.innerHTML = loadingOrErrorHtml(); return; }
  const P = state.data.protocols;
  if (!P?.flow) { setTopbar(`${backButton()}<h1 class="topbar-title">Exam flow</h1>`); view.innerHTML = notFoundHtml("This page isn't in the app."); return; }
  migrateFlowTimes();
  const f = flowState();
  const p = flowProtocol(f);
  if (state.flowEdit === p.id) { renderFlowEdit(p); return; }
  if (state.flowNew) { renderFlowNew(p); return; }
  setTopbar(`${backButton()}<h1 class="topbar-title">Exam flow</h1>`);
  const nameOf = (x) => flowCustom(x.id)?.name || x.name;
  const own = flowOwnList().map((o) => findProtocol(o.id)).filter(Boolean);
  const all = [...own, ...P.list];
  const opt = (x) => `<option value="${esc(x.id)}"${x.id === p.id ? " selected" : ""}>${esc(nameOf(x))}</option>`;
  // A few protocols fit as chips; a longer list goes in a dropdown so the steps stay near the top.
  const pick = (all.length > 6
    ? `<label class="flow-select"><span>Protocol</span><span class="flow-select-box"><select data-flow-pick>${own.length ? `<optgroup label="Your protocols">${own.map(opt).join("")}</optgroup><optgroup label="Standard (SCMR)">${P.list.map(opt).join("")}</optgroup>` : P.list.map(opt).join("")}</select></span></label>`
    : `<div class="chips flow-pick">${all.map((x) => `<button class="chip" type="button" data-action="flow-pick" data-id="${esc(x.id)}" aria-pressed="${x.id === p.id}">${esc(nameOf(x))}</button>`).join("")}</div>`) +
    `<p class="flow-new-link"><button class="text-btn" type="button" data-action="fn-open">+ New protocol</button></p>`;
  let n = 0;
  const steps = p.groups.filter((gr) => gr.steps.some((x) => !x.hidden)).map((gr) => `${gr.label ? `<h2 class="flow-group">${esc(gr.label)}</h2>` : ""}<ol class="flow">${gr.steps.filter((x) => !x.hidden).map((s) => {
    const i = n++;
    const done = f.done.includes(s.key);
    const contrast = s.contrast
      ? `<div class="flow-contrast">${f.contrastAt ? `<span>${cap(clockFrom(p))} in at ${esc(clockTime(f.contrastAt))}</span> · <button class="text-btn flow-restart" type="button" data-action="flow-clock-restart">Restart</button>` : `<button class="btn" type="button" data-action="flow-contrast">${ICON.clock}${cap(clockFrom(p))} in</button>`}</div>`
      : "";
    let html = s.html;
    let timing = "";
    if (s.atMin) {
      const m = flowMinutes(p, s);
      if (m !== s.atMin) html = html.replace(new RegExp(`\\b${s.atMin}(?:\\s*[–-]\\s*\\d+)?(\\s*min)`), `${m}$1`);
      timing = ` <span class="flow-at" data-at="${m}">${m} min</span>` +
        `<div class="flow-adjust" role="group" aria-label="Minutes after ${clockFrom(p)}"><span class="flow-adjust-label">Change time</span><button class="flow-adj" type="button" data-action="flow-time" data-key="${s.key}" data-d="-1" aria-label="One minute earlier"${m <= FLOW_MIN ? " disabled" : ""}>−</button>` +
        `<span>${m} min</span>` +
        `<button class="flow-adj" type="button" data-action="flow-time" data-key="${s.key}" data-d="1" aria-label="One minute later"${m >= FLOW_MAX ? " disabled" : ""}>+</button>` +
        `${m !== s.atMin ? `<button class="text-btn" type="button" data-action="flow-time" data-key="${s.key}" data-d="reset">Back to ${s.atMin}</button>` : ""}</div>`;
    }
    return `<li class="flow-step${done ? " done" : ""}"><button type="button" class="tick" data-action="flow-tick" data-key="${s.key}" aria-pressed="${done}" aria-label="Step ${i + 1} done">${ICON.check}</button><div class="flow-text"><span class="flow-num">${i + 1}.</span> ${html}${artifactLink(s, gr.label)}${timing}${contrast}</div></li>`;
  }).join("")}</ol>`).join("");
  const edited = p.own
    ? `<p class="flow-edited">Your protocol, on this device · <button class="text-btn" type="button" data-action="fe-open">Edit</button></p>`
    : p.edited ? `<p class="flow-edited">Your version, on this device · <button class="text-btn" type="button" data-action="fe-open">Edit</button></p>` : "";
  const notes = p.own ? (p.from ? `${link.guide(P.slug)}#${esc(p.from)}` : link.guide(P.slug)) : `${link.guide(P.slug)}#${esc(p.id)}`;
  view.innerHTML = `<div class="flow-head"><h1 class="guide-title">${esc(p.name)}</h1><p class="guide-meta">Tick each step as you go. Tap <strong>${cap(clockFrom(p))} in</strong> when you inject, and the clock counts up to the timed steps.</p>${edited}</div>${pick}<div class="flow-clock" id="flow-clock" role="timer" hidden></div>${steps}<p class="flow-foot"><a href="${notes}">${p.own && !p.from ? "Protocols" : "Protocol notes"}</a> · <button class="text-btn" type="button" data-action="fe-open">Customize</button> · <button class="text-btn" type="button" data-action="flow-reset">Start over</button></p>`;
  tickFlowClock();
  clearInterval(state.flowTimer);
  state.flowTimer = setInterval(() => {
    if (!location.pathname.startsWith("/flow")) { clearInterval(state.flowTimer); return; }
    tickFlowClock();
  }, 1000);
}

// Edit mode: hide steps, move them (across groups too), add your own, rename, or go back to the standard protocol.
function renderFlowEdit(p) {
  clearInterval(state.flowTimer);
  setTopbar(`${backButton()}<h1 class="topbar-title">Customize</h1>`);
  const all = p.groups.flatMap((g) => g.steps);
  const first = all[0]?.key, last = all[all.length - 1]?.key;
  const groups = p.groups.map((g, gi) => {
    const rows = g.steps.map((s) => {
      const showBtn = s.contrast
        ? `<span class="tick fe-show fixed" title="Starts the clock, so it stays">${ICON.check}</span>`
        : `<button type="button" class="tick fe-show" data-action="fe-show" data-key="${s.key}" aria-pressed="${!s.hidden}" aria-label="${s.hidden ? "Show" : "Hide"} this step">${ICON.check}</button>`;
      const tags = (s.added ? `<span class="fe-tag">Added</span>` : "") + (s.contrast ? `<span class="fe-tag">Starts the clock</span>` : "") + (s.hidden ? `<span class="fe-tag off">Hidden</span>` : "");
      return `<li class="fe-step${s.hidden ? " off" : ""}">${showBtn}<span class="fe-text">${esc(plainText(s.html))}${tags ? `<span class="fe-tags">${tags}</span>` : ""}${s.added ? `<button class="text-btn fe-del" type="button" data-action="fe-del" data-key="${s.key}">Remove</button>` : ""}</span>` +
        `<span class="fe-move"><button type="button" class="flow-adj" data-action="fe-move" data-key="${s.key}" data-d="-1" aria-label="Move up"${s.key === first ? " disabled" : ""}>↑</button><button type="button" class="flow-adj" data-action="fe-move" data-key="${s.key}" data-d="1" aria-label="Move down"${s.key === last ? " disabled" : ""}>↓</button></span></li>`;
    }).join("");
    const add = state.flowAddGroup === gi
      ? `<div class="fe-add open"><input type="text" data-flow-add="${gi}" maxlength="140" placeholder="New step, e.g. Cine 4-chamber stack" aria-label="New step in ${esc(g.label || "this group")}" enterkeyhint="done"><button class="btn" type="button" data-action="fe-add" data-g="${gi}">Add</button><button class="text-btn" type="button" data-action="fe-add-cancel">Cancel</button></div>`
      : `<div class="fe-add"><button class="text-btn" type="button" data-action="fe-add-open" data-g="${gi}">+ Add a step here</button></div>`;
    return `${g.label ? `<h2 class="flow-group">${esc(g.label)}</h2>` : ""}<ol class="fe-list">${rows || `<li class="fe-empty">No steps here</li>`}</ol>${add}`;
  }).join("");
  view.innerHTML = `<div class="flow-head fe-head"><div><h1 class="guide-title">${esc(p.own ? p.name : p.base.name)}</h1><p class="guide-meta">Your version stays on this device (back it up in <a href="${link.settings}#your-protocols">Settings</a>). Untick steps you don't run, move steps with the arrows, and add your own. To time a step you add, word it like "15 minutes after contrast".</p></div><button class="btn" type="button" data-action="fe-done">Done</button></div>` +
    `<label class="flow-select fe-name"><span>${p.own ? "Name" : "Name on this device"}</span><input type="text" data-flow-name value="${esc(p.name)}" placeholder="${esc(p.base.name)}" maxlength="60" autocomplete="off"></label>` +
    groups +
    `<div class="fe-foot"><button class="btn" type="button" data-action="fe-done">Done</button>${p.own
      ? `<button class="text-btn fe-danger" type="button" data-action="fe-delete">${state.flowResetArmed ? "Tap again to delete this protocol" : "Delete this protocol"}</button>`
      : p.edited ? `<button class="text-btn" type="button" data-action="fe-reset">${state.flowResetArmed ? "Tap again to go back to the standard protocol" : "Back to the standard protocol"}</button>` : ""}</div>`;
  if (state.flowAddGroup != null) $(`input[data-flow-add="${state.flowAddGroup}"]`)?.focus();
}

// "+ New protocol": a name, and blank or a copy of any protocol (with this device's changes to it).
function renderFlowNew(current) {
  clearInterval(state.flowTimer);
  setTopbar(`${backButton()}<h1 class="topbar-title">New protocol</h1>`);
  const P = state.data.protocols;
  const nameOf = (x) => flowCustom(x.id)?.name || x.name;
  const own = flowOwnList().map((o) => findProtocol(o.id)).filter(Boolean);
  const opt = (x) => `<option value="${esc(x.id)}"${x.id === current.id ? " selected" : ""}>${esc(nameOf(x))}</option>`;
  view.innerHTML = `<div class="flow-head"><h1 class="guide-title">New protocol</h1><p class="guide-meta">For an exam your site runs that isn't here, or your own take on one that is. It stays on this device, listed under Your protocols.</p></div>` +
    `<label class="flow-select fe-name"><span>Name</span><input type="text" data-flow-new-name maxlength="60" autocomplete="off" placeholder="e.g. Athlete's heart" enterkeyhint="done"></label>` +
    `<label class="flow-select"><span>Start from</span><span class="flow-select-box"><select data-flow-new-from>` +
    `<option value="">Blank: the localizers, a contrast step and the close-out checks</option>` +
    (own.length ? `<optgroup label="A copy of one of yours">${own.map(opt).join("")}</optgroup>` : "") +
    `<optgroup label="A copy of a standard protocol">${P.list.map(opt).join("")}</optgroup></select></span></label>` +
    `<div class="fe-foot"><button class="btn" type="button" data-action="fn-create">Create and edit</button><button class="text-btn" type="button" data-action="fn-cancel">Cancel</button></div>`;
  $("input[data-flow-new-name]")?.focus();
}
function createFlowProtocol() {
  const name = $("input[data-flow-new-name]")?.value.trim() || "";
  const fromId = $("select[data-flow-new-from]")?.value || "";
  const src = fromId ? findProtocol(fromId) : null;
  const id = `own-${Date.now().toString(36)}`;
  const srcName = src ? flowCustom(src.id)?.name || src.name : "";
  const finalName = name || (src ? `${srcName} (copy)` : "My protocol");
  prefs.set("flowOwn", [...flowOwnList(), { id, name: finalName, from: src ? (src.own ? src.from : src.id) : null }]);
  // A copy brings this device's changes to the protocol it came from, under the new name.
  const c = src ? flowCustom(src.id) : null;
  if (c) saveFlowCustom(id, { ...JSON.parse(JSON.stringify(c)), name: undefined });
  saveFlow({ protocol: id, done: [], contrastAt: null });
  state.flowNew = false;
  state.flowEdit = id;
  state.flowAddGroup = null;
  state.flowResetArmed = false;
  renderFlow();
  window.scrollTo(0, 0);
  toast("Protocol created");
}

function tickFlowClock() {
  const el = $("#flow-clock");
  if (!el) return;
  const f = flowState();
  const p = flowProtocol(f);
  if (!f.contrastAt || !p) { el.hidden = true; return; }
  const s = Math.max(0, Math.floor((Date.now() - f.contrastAt) / 1000));
  const next = runSteps(p).map((x) => ({ ...x, atMin: x.atMin ? flowMinutes(p, x) : null })).find((x) => x.atMin && !f.done.includes(x.key));
  let status = "";
  if (next) {
    const left = next.atMin * 60 - s;
    status = left > 0 ? `<span>${esc(stepLabel(next.html))} in ${mmss(left)}</span>` : `<span class="due">${esc(stepLabel(next.html))}: now</span>`;
    if (left <= 0 && state.flowAlerted !== `${f.contrastAt}:${next.key}`) {
      state.flowAlerted = `${f.contrastAt}:${next.key}`;
      if (left > -5) { toast(`${stepLabel(next.html)}: ${next.atMin} ${next.atMin === 1 ? "minute" : "minutes"} since ${clockFrom(p)}`); navigator.vibrate?.(300); }
    }
  }
  el.hidden = false;
  el.innerHTML = `${ICON.clock}<span class="flow-clock-label">Since ${clockFrom(p)}</span><strong>${mmss(s)}</strong>${status}`;
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

function renderAbout() {
  setTopbar(`${backButton()}<span class="topbar-title" id="guide-bar-title"></span>`);
  if (!state.data) { view.innerHTML = loadingOrErrorHtml(); return; }
  const a = state.data.about;
  if (!a) { view.innerHTML = notFoundHtml("This page isn't in the app."); return; }
  const disclaimer = state.data.site?.disclaimer;
  view.innerHTML = `<article><h1 class="guide-title">${esc(a.title)}</h1><div class="prose">${a.html}</div>${disclaimer ? `<aside class="guide-note"><p>${esc(disclaimer)}</p></aside>` : ""}</article>`;
  $("#guide-bar-title").textContent = "About";
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

// ---------- Back up and restore protocols (Settings) ----------
// The file holds what the exam flow keeps on this device: protocols made here, versions of the standard ones and
// changed step times. Restoring adds the file's protocols; where the file and this device both changed the same
// protocol, the file's version wins. The same file moves a setup to a new phone or to a coworker.
const BACKUP_KIND = "cardiac-mri-hub-protocols";
function protocolCounts() {
  const own = flowOwnList().length;
  const edited = Object.keys(flowCustomAll()).filter((id) => state.data?.protocols?.list.some((x) => x.id === id)).length;
  return { own, edited };
}
const countOf = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function protocolSummary({ own, edited }) {
  if (!own && !edited) return "Nothing to back up yet. Protocols you change or make in the exam flow (Customize, New protocol) show up here.";
  const parts = [];
  if (own) parts.push(countOf(own, "protocol you made", "protocols you made"));
  if (edited) parts.push(countOf(edited, "standard protocol you changed", "standard protocols you changed"));
  return `On this device: ${parts.join(" and ")}.`;
}
async function backupProtocols() {
  const data = {
    kind: BACKUP_KIND, version: 1, exported: new Date().toISOString(), app: APP_VERSION,
    flowOwn: flowOwnList(), flowCustom: flowCustomAll(), flowTimes: prefs.get("flowTimes", {}),
  };
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const name = `cardiac-mri-hub-protocols-${day}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  // On phones the share sheet can save it to Files, AirDrop it or email it; elsewhere the file downloads.
  try {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Cardiac MRI Hub protocols" });
      return;
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast("Backup saved");
}
// Checks a backup file and merges it in. Returns counts, or a message saying why it can't be used.
function restoreProtocols(text) {
  let d;
  try { d = JSON.parse(text); } catch { return "That file isn't a Cardiac MRI Hub protocols backup."; }
  if (d?.kind !== BACKUP_KIND) return "That file isn't a Cardiac MRI Hub protocols backup.";
  const std = new Set(state.data.protocols.list.map((x) => x.id));
  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const own = (Array.isArray(d.flowOwn) ? d.flowOwn : [])
    .filter((o) => isObj(o) && /^own-[a-z0-9]+$/.test(o.id) && typeof o.name === "string" && o.name.trim())
    .slice(0, 100)
    .map((o) => ({ id: o.id, name: o.name.trim().slice(0, 60), from: std.has(o.from) ? o.from : null }));
  const ownIds = new Set(own.map((o) => o.id));
  const known = (id) => std.has(id) || ownIds.has(id);
  const custom = {};
  for (const [id, c] of Object.entries(isObj(d.flowCustom) ? d.flowCustom : {})) {
    if (!known(id) || !isObj(c)) continue;
    const keys = (a) => (Array.isArray(a) ? a.filter((k) => typeof k === "string").slice(0, 300) : []);
    const v = {};
    if (typeof c.name === "string" && c.name.trim()) v.name = c.name.trim().slice(0, 60);
    if (Array.isArray(c.hidden)) v.hidden = keys(c.hidden);
    if (isObj(c.added)) {
      v.added = Object.fromEntries(Object.entries(c.added)
        .filter(([k, t]) => /^c[a-z0-9]+$/.test(k) && typeof t === "string" && t.trim())
        .slice(0, 300).map(([k, t]) => [k, t.trim().slice(0, 140)]));
    }
    if (Array.isArray(c.layout)) {
      v.layout = c.layout.filter(isObj).slice(0, 40)
        .map((g) => ({ label: typeof g.label === "string" ? g.label.slice(0, 60) : "", keys: keys(g.keys) }));
    }
    custom[id] = v;
  }
  const times = {};
  for (const [k, m] of Object.entries(isObj(d.flowTimes) ? d.flowTimes : {})) {
    if (known(k.split(":")[0]) && Number.isInteger(m) && m >= FLOW_MIN && m <= FLOW_MAX) times[k] = m;
  }
  if (!own.length && !Object.keys(custom).length) return "That backup doesn't have any protocols in it.";
  prefs.set("flowOwn", [...flowOwnList().filter((o) => !ownIds.has(o.id)), ...own]);
  prefs.set("flowCustom", { ...flowCustomAll(), ...custom });
  prefs.set("flowTimes", { ...prefs.get("flowTimes", {}), ...times });
  return { own: own.length, edited: Object.keys(custom).filter((id) => std.has(id)).length };
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
    ${state.data?.protocols?.flow ? `<section class="setting" id="your-protocols"><h2>Your protocols</h2><p>${esc(protocolSummary(protocolCounts()))}</p>
      <p>Back up saves a file of the protocols you've made and your versions of the standard ones. Restore loads that file on a new phone, after reinstalling the app, or from a coworker. Restoring adds the file's protocols; if you and the file both changed the same protocol, the file's version replaces yours.</p>
      <div class="btn-row"><button class="btn" data-action="backup-protocols"${protocolCounts().own || protocolCounts().edited ? "" : " disabled"}>Back up my protocols</button><button class="btn secondary" data-action="restore-protocols">Restore from a file</button></div>
      <input type="file" accept=".json,application/json" data-restore hidden></section>` : ""}
    <section class="setting"><h2>Install</h2>${install}</section>
    <section class="setting"><h2>Check for new guides</h2><p>${state.data ? `Guides last updated ${fmtDate(state.data.generatedAt)}.` : ""}</p><button class="btn secondary" data-action="refresh">Check now</button></section>
    ${aboutHtml()}`;
}

function aboutHtml() {
  const site = state.data?.site || {};
  const contact = site.feedbackEmail
    ? `<p>Spotted an error or have a suggestion? Email <a href="mailto:${esc(site.feedbackEmail)}">${esc(site.feedbackEmail)}</a>.</p>`
    : "";
  return `<section class="setting"><h2>About</h2>${site.disclaimer ? `<p>${esc(site.disclaimer)}</p>` : ""}${contact}${state.data?.about ? `<p><a href="${link.about}">About Cardiac MRI Hub and its sources</a></p>` : ""}<p class="fine">Cardiac MRI Hub, version ${APP_VERSION}</p></section>`;
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
    : { topics: "Topics", search: "Search", saved: "Saved", settings: "Settings", plan: "Quick plan", flow: "Exam flow", cards: state.data?.cards?.title || "Planning cards", about: state.data?.about?.title || "About", parameters: state.data?.parameters?.title || "LV parameters" }[section];
  return label ? `${label} | ${name}` : name;
}

function route() {
  closeAbbr();
  const { section, arg, params } = parseRoute();
  // Leaving the exam flow closes its edit mode (the name field saves on the way out).
  if (section !== "flow" && state.flowEdit) { saveFlowName(); state.flowEdit = null; state.flowAddGroup = null; }
  if (section !== "flow") state.flowNew = false;
  const tab = { undefined: "home", topics: "topics", topic: "topics", search: "search", saved: "saved", plan: "plan", parameters: "plan", cards: "plan", flow: "plan", about: "home" }[section] || "";
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
    case "about": renderAbout(); break;
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
// Opens any folded section (More detail) that holds the element, so a link into it lands on something visible.
function reveal(el) {
  for (let d = el?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
  return el;
}
function scrollToHashTarget() {
  if (location.hash.length > 1 && !location.hash.startsWith("#/")) {
    reveal(document.getElementById(decodeURIComponent(location.hash.slice(1))))?.scrollIntoView({ block: "start" });
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

// Tap an abbreviation in a guide (marked by the build) to see what it stands for.
function abbrEntry(form) {
  return state.data?.glossary?.entries.find((x) => x.abbr.split(/,\s*/).includes(form)) || null;
}
function closeAbbr() { $("#abbr-pop")?.remove(); }
function showAbbr(el) {
  const entry = abbrEntry(el.dataset.abbr);
  if (!entry) return;
  closeAbbr();
  const pop = document.createElement("div");
  pop.id = "abbr-pop";
  pop.className = "abbr-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", `${el.dataset.abbr}: ${entry.meaning}`);
  pop.innerHTML = `<div><strong>${esc(el.dataset.abbr)}</strong> <span>${esc(entry.meaning)}</span>${entry.note ? `<p>${esc(entry.note)}</p>` : ""}<a href="${esc(entry.href)}">All abbreviations</a></div><button class="icon-btn" type="button" data-action="abbr-close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  document.body.append(pop);
  pop.querySelector("button")?.focus({ preventScroll: true });
}

document.addEventListener("click", async (e) => {
  const ab = e.target.closest?.("abbr[data-abbr]");
  if (ab) { e.preventDefault(); showAbbr(ab); return; }
  if ($("#abbr-pop") && !e.target.closest?.("#abbr-pop")) closeAbbr();
  if (e.target.closest?.('[data-action="abbr-close"]')) { closeAbbr(); return; }
  const jump = e.target.closest("[data-jump]");
  if (jump) {
    e.preventDefault();
    reveal(document.getElementById(jump.dataset.jump))?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const k = btn.dataset.key;
      f.done = f.done.includes(k) ? f.done.filter((x) => x !== k) : [...f.done.filter((x) => typeof x === "string"), k];
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
      const c = p ? runSteps(p).find((x) => x.contrast) : null;
      if (c && !f.done.includes(c.key)) f.done.push(c.key);
      saveFlow(f);
      renderFlow();
      break;
    }
    case "flow-time": {
      const p = flowProtocol();
      const step = p ? runSteps(p).find((x) => x.key === btn.dataset.key) : null;
      if (!step?.atMin) break;
      const times = { ...prefs.get("flowTimes", {}) };
      const key = `${p.id}:${step.key}`;
      if (btn.dataset.d === "reset") delete times[key];
      else times[key] = Math.min(FLOW_MAX, Math.max(FLOW_MIN, flowMinutes(p, step) + Number(btn.dataset.d)));
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
    // ----- Back up and restore (Settings) -----
    case "backup-protocols":
      backupProtocols();
      break;
    case "restore-protocols":
      $("input[data-restore]")?.click();
      break;
    // ----- New protocol -----
    case "fn-open":
      state.flowNew = true;
      renderFlow();
      window.scrollTo(0, 0);
      break;
    case "fn-cancel":
      state.flowNew = false;
      renderFlow();
      break;
    case "fn-create":
      createFlowProtocol();
      break;
    case "fe-delete": {
      if (!state.flowResetArmed) {
        state.flowResetArmed = true;
        renderFlow();
        setTimeout(() => { if (state.flowResetArmed) { state.flowResetArmed = false; if (state.flowEdit) renderFlow(); } }, 4000);
        break;
      }
      state.flowResetArmed = false;
      const p = flowProtocol();
      prefs.set("flowOwn", flowOwnList().filter((x) => x.id !== p.id));
      saveFlowCustom(p.id, null);
      const times = { ...prefs.get("flowTimes", {}) };
      for (const k of Object.keys(times)) if (k.startsWith(`${p.id}:`)) delete times[k];
      prefs.set("flowTimes", times);
      if (prefs.get("flowLast", null) === p.id) prefs.set("flowLast", null);
      state.flowEdit = null;
      saveFlow({ protocol: state.data.protocols.list[0].id, done: [], contrastAt: null });
      renderFlow();
      window.scrollTo(0, 0);
      toast("Protocol deleted");
      break;
    }
    // ----- My protocol (edit mode) -----
    case "fe-open": {
      const p = flowProtocol();
      state.flowEdit = p.id;
      state.flowAddGroup = null;
      state.flowResetArmed = false;
      renderFlow();
      window.scrollTo(0, 0);
      break;
    }
    case "fe-done": {
      saveFlowName();
      state.flowEdit = null;
      state.flowAddGroup = null;
      renderFlow();
      window.scrollTo(0, 0);
      break;
    }
    case "fe-show": {
      const p = flowProtocol();
      const k = btn.dataset.key;
      editFlowCustom(p, (c) => {
        const hidden = new Set(c.hidden || []);
        if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
        c.hidden = [...hidden];
      });
      renderFlow();
      $(`[data-action="fe-show"][data-key="${k}"]`)?.focus({ preventScroll: true });
      break;
    }
    case "fe-move": {
      // Up from the top of a group moves a step to the end of the group above, and down likewise.
      const p = flowProtocol();
      const k = btn.dataset.key;
      const d = Number(btn.dataset.d);
      const gi = p.groups.findIndex((g) => g.steps.some((x) => x.key === k));
      const g = p.groups[gi];
      const si = g.steps.findIndex((x) => x.key === k);
      const [step] = g.steps.splice(si, 1);
      if (d < 0 && si > 0) g.steps.splice(si - 1, 0, step);
      else if (d < 0) p.groups[gi - 1].steps.push(step);
      else if (si < g.steps.length) g.steps.splice(si + 1, 0, step);
      else p.groups[gi + 1].steps.unshift(step);
      editFlowCustom(p, () => {});
      renderFlow();
      const again = $(`[data-action="fe-move"][data-key="${k}"][data-d="${d}"]`);
      (again && !again.disabled ? again : $(`[data-action="fe-move"][data-key="${k}"][data-d="${-d}"]`))?.focus();
      break;
    }
    case "fe-add-open":
      state.flowAddGroup = Number(btn.dataset.g);
      renderFlow();
      break;
    case "fe-add-cancel":
      state.flowAddGroup = null;
      renderFlow();
      break;
    case "fe-add":
      addFlowStep(Number(btn.dataset.g));
      break;
    case "fe-del": {
      const p = flowProtocol();
      const k = btn.dataset.key;
      editFlowCustom(p, (c) => {
        c.added = { ...(c.added || {}) };
        delete c.added[k];
        c.layout = c.layout.map((g) => ({ ...g, keys: g.keys.filter((x) => x !== k) }));
        c.hidden = (c.hidden || []).filter((x) => x !== k);
      });
      renderFlow();
      toast("Step removed");
      break;
    }
    case "fe-reset": {
      // Two taps, so a stray one doesn't throw away someone's setup.
      if (!state.flowResetArmed) {
        state.flowResetArmed = true;
        renderFlow();
        setTimeout(() => { if (state.flowResetArmed) { state.flowResetArmed = false; if (state.flowEdit) renderFlow(); } }, 4000);
        break;
      }
      state.flowResetArmed = false;
      saveFlowCustom(flowProtocol().id, null);
      renderFlow();
      toast("Back to the standard protocol");
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
// My protocol: the device's name for a protocol (empty = the standard name).
function saveFlowName() {
  const input = $("input[data-flow-name]");
  if (!input) return;
  const p = flowProtocol();
  const name = input.value.trim();
  if ((name || p.base.name) === p.name) return;
  editFlowCustom(p, (c) => { if (name && name !== p.base.name) c.name = name; else delete c.name; });
}
function addFlowStep(gi) {
  const input = $(`input[data-flow-add="${gi}"]`);
  const text = input?.value.trim();
  if (!text) { input?.focus(); return; }
  const p = flowProtocol();
  const key = `c${Date.now().toString(36)}`;
  editFlowCustom(p, (c) => {
    c.added = { ...(c.added || {}), [key]: text };
    c.layout[gi].keys.push(key);
  });
  state.flowAddGroup = null;
  renderFlow();
  toast("Step added");
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const add = e.target.closest?.("input[data-flow-add]");
  if (add) { e.preventDefault(); addFlowStep(Number(add.dataset.flowAdd)); return; }
  if (e.target.closest?.("input[data-flow-name]")) { e.preventDefault(); e.target.blur(); }
  if (e.target.closest?.("input[data-flow-new-name]")) { e.preventDefault(); createFlowProtocol(); }
});

document.addEventListener("change", async (e) => {
  if (e.target.closest?.("input[data-flow-name]")) { saveFlowName(); return; }
  const restore = e.target.closest?.("input[data-restore]");
  if (restore) {
    const file = restore.files?.[0];
    restore.value = "";
    if (!file) return;
    if (file.size > 1_000_000) { toast("That file is too large to be a protocols backup."); return; }
    const r = restoreProtocols(await file.text());
    if (typeof r === "string") { toast(r); return; }
    const parts = [];
    if (r.own) parts.push(countOf(r.own, "protocol", "protocols"));
    if (r.edited) parts.push(countOf(r.edited, "changed standard protocol", "changed standard protocols"));
    toast(`Restored ${parts.join(" and ")}`);
    renderSettings();
    return;
  }
  const sel = e.target.closest?.("select[data-flow-pick]");
  if (!sel) return;
  saveFlow({ protocol: sel.value, done: [], contrastAt: null });
  renderFlow();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#abbr-pop")) { closeAbbr(); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("abbr[data-abbr]")) { e.preventDefault(); showAbbr(e.target); return; }
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
// Counts app launches, so Home can put the scanner tools first for people who keep coming back.
prefs.set("launches", (prefs.get("launches", 0) || 0) + 1);
if (!prerendered) route();
await loadContent();
state.lastCheck = Date.now();
if (state.data || !prerendered) route();
view.removeAttribute("data-prerendered");
scrollToHashTarget();
if (navigator.onLine) setTimeout(() => saveEverythingOffline(), 1500);
