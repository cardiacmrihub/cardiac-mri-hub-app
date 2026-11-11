// Search across guide titles, summaries and full text.
// Understands the shorthand techs actually type: "4ch" finds "four-chamber", "sax" finds "short axis", etc.

const GROUPS = [
  ["2ch", "2 ch", "2-ch", "2 chamber", "2-chamber", "two chamber", "two-chamber"],
  ["3ch", "3 ch", "3-ch", "3 chamber", "3-chamber", "three chamber", "three-chamber"],
  ["4ch", "4 ch", "4-ch", "4 chamber", "4-chamber", "four chamber", "four-chamber"],
  ["sax", "short axis", "short-axis"],
  ["lax", "long axis", "long-axis"],
  ["hla", "horizontal long axis"],
  ["vla", "vertical long axis"],
  ["lvot", "lv outflow", "left ventricular outflow", "left ventricle outflow"],
  ["rvot", "rv outflow", "right ventricular outflow", "right ventricle outflow"],
  ["lv", "left ventricle", "left ventricular"],
  ["rv", "right ventricle", "right ventricular"],
  ["la", "left atrium", "left atrial"],
  ["ra", "right atrium", "right atrial"],
  ["laa", "left atrial appendage"],
  ["av", "aortic valve"],
  ["mv", "mitral valve"],
  ["tv", "tricuspid valve"],
  ["pv", "pulmonic valve", "pulmonary valve"],
  ["ssfp", "bssfp", "balanced ssfp", "truefisp", "fiesta", "balanced ffe", "bffe"],
  ["lge", "late gadolinium", "late enhancement", "delayed enhancement"],
  ["pc", "phase contrast", "flow quantification", "qflow", "q flow", "venc"],
  ["stir", "t2 stir", "triple ir"],
  ["papillary", "papillary muscle", "pm"],
];
const STOP = new Set(["the", "a", "an", "of", "and", "or", "for", "to", "in", "on", "how", "view", "views", "plan", "planning", "guide", "mri", "cardiac"]);

const norm = (s) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole-word match for shorthand, word-start match for ordinary words ("valv" finds "valves").
const wordRe = (term, prefix) => new RegExp(`(^|[^a-z0-9])(${reEsc(term)})${prefix ? "" : "(?![a-z0-9])"}`, "i");

/** Turn a query into required terms; each term is a list of alternatives. */
export function parseQuery(q) {
  let rest = ` ${norm(q)} `;
  const terms = [];
  const variants = GROUPS.flatMap((g) => g.map((v) => ({ v, g }))).sort((a, b) => b.v.length - a.v.length);
  for (const { v, g } of variants) {
    const re = new RegExp(`(^|[^a-z0-9])${reEsc(v)}(?![a-z0-9])`, "i");
    if (re.test(rest)) {
      terms.push({ alts: g, exact: true });
      rest = rest.replace(re, "$1 ");
    }
  }
  for (const w of rest.split(/[^a-z0-9-]+/)) {
    if (w && !STOP.has(w)) terms.push({ alts: [w], exact: w.length <= 2 });
  }
  return terms;
}

function findTerm(text, term) {
  for (const alt of term.alts) {
    const m = wordRe(alt, !term.exact).exec(text);
    if (m) return { index: m.index + m[1].length, length: m[2].length };
  }
  return null;
}

export function searchGuides(guides, q) {
  const terms = parseQuery(q);
  if (!terms.length) return [];
  const results = [];
  for (const g of guides) {
    let score = 0;
    let bodyHit = null;
    let ok = true;
    for (const t of terms) {
      const inTitle = findTerm(g.title, t) || (g.shortTitle ? findTerm(g.shortTitle, t) : null);
      const inSummary = findTerm(g.summary || "", t);
      const inBody = findTerm(g.text || "", t);
      if (!inTitle && !inSummary && !inBody) { ok = false; break; }
      score += (inTitle ? 10 : 0) + (inSummary ? 4 : 0) + (inBody ? 1 : 0);
      if (!bodyHit && inBody && !inTitle) bodyHit = inBody;
    }
    if (ok) results.push({ guide: g, score, bodyHit, terms });
  }
  return results.sort((a, b) => b.score - a.score || a.guide.title.localeCompare(b.guide.title));
}

/** Sections of guides that list them (the artifact cards) whose heading or "also called" words match every term. */
export function searchSections(guides, q) {
  const terms = parseQuery(q);
  if (!terms.length) return [];
  const hits = [];
  for (const g of guides) {
    for (const s of g.sections || []) {
      let score = 0;
      let ok = true;
      for (const t of terms) {
        const inHead = findTerm(s.text, t);
        const inAlso = findTerm(s.also || "", t);
        if (!inHead && !inAlso) { ok = false; break; }
        score += inHead ? 2 : 1;
      }
      if (ok) hits.push({ guide: g, section: s, score, terms });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

const escHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** HTML-escaped text with every matched term wrapped in <mark>. */
export function highlight(text, terms) {
  const ranges = [];
  for (const t of terms) {
    for (const alt of t.alts) {
      const re = new RegExp(wordRe(alt, !t.exact).source, "gi");
      let m;
      while ((m = re.exec(text))) {
        ranges.push([m.index + m[1].length, m.index + m[1].length + m[2].length]);
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    out += escHtml(text.slice(pos, s)) + "<mark>" + escHtml(text.slice(s, e)) + "</mark>";
    pos = e;
  }
  return out + escHtml(text.slice(pos));
}

/** A short excerpt of the body around the first match. */
export function snippetAround(text, hit, terms, width = 150) {
  if (!hit) return "";
  let start = Math.max(0, hit.index - 50);
  if (start > 0) {
    const sp = text.indexOf(" ", start);
    if (sp > -1 && sp < hit.index) start = sp + 1;
  }
  let end = Math.min(text.length, start + width);
  if (end < text.length) {
    const sp = text.lastIndexOf(" ", end);
    if (sp > hit.index + hit.length) end = sp;
  }
  return (start > 0 ? "…" : "") + highlight(text.slice(start, end), terms) + (end < text.length ? "…" : "");
}

/** Shorthand suggestions that actually return results for this set of guides. */
export function suggestions(guides) {
  const candidates = ["4ch", "2ch", "3ch", "sax", "lvot", "rv", "valves", "mitral valve", "aortic valve", "lge", "papillary"];
  return candidates.filter((c) => searchGuides(guides, c).length > 0).slice(0, 8);
}
