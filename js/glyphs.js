// Small drawings of the cardiac planes each topic covers.
// Strokes use currentColor; the amber "planning line" uses the .plan class.

const wrap = (body, label = "") =>
  `<svg class="glyph" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"'}>${body}</svg>`;

const SHAPES = {
  // Artifact: a short-axis ring, its faint ghost copy, and a wavy amber band across it.
  artifact: `<circle cx="21" cy="22" r="10"/><circle cx="31" cy="22" r="10" opacity=".35" stroke-dasharray="3 4"/>
       <path class="plan" d="M6 39c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/>`,
  // Short-axis ring: LV myocardium seen end-on, RV crescent alongside.
  sax: `<circle cx="27" cy="24" r="12"/><circle cx="27" cy="24" r="6.5"/>
        <path d="M15.5 15.5c-4.6 2.2-7 6-7 9.5s2.4 6.7 7 8.5" opacity=".55"/>
        <path class="plan" d="M8 40L42 8"/>`,
  // Long-axis LV: cavity from mitral valve to apex, planning line along the long axis.
  lv: `<path d="M16 13c6-5 17-3 21 5 4 9-2 21-15 24C14 38 9 31 10 23c.4-4 2.6-7.6 6-10z"/>
       <path d="M18 18c4-2.8 10-1.8 12.6 2.6 2.6 5-.8 12-7.8 14" opacity=".55"/>
       <path class="plan" d="M14 12L34 42"/>`,
  // Right ventricle: crescent wrapping the septum.
  rv: `<circle cx="29" cy="25" r="9" opacity=".55"/>
       <path d="M20 13.5C13 15 8.5 20 8.5 26.5S14 38 22 38.5c-4.5-3.2-6.5-7.5-6.5-12.5S17 16.8 20 13.5z"/>
       <path class="plan" d="M6 31L42 17"/>`,
  // Valve en face: three leaflets meeting centrally, planning line through the valve plane.
  valve: `<circle cx="24" cy="24" r="13"/>
          <path d="M24 24V11M24 24l11.3 6.5M24 24l-11.3 6.5"/>
          <path class="plan" d="M5 24h38"/>`,
  // Special views: oblique double-oblique crosshair over an outline.
  special: `<ellipse cx="24" cy="24" rx="15" ry="11" transform="rotate(-30 24 24)"/>
            <circle cx="24" cy="24" r="3"/>
            <path class="plan" d="M10 38L38 10"/><path class="plan" d="M14 12l20 24" opacity=".6"/>`,
  // 3-point planning: three points on a plane.
  points: `<path d="M10 36L24 11L39 30Z" opacity=".45"/>
           <circle class="plan" cx="10" cy="36" r="3.6"/><circle class="plan" cx="24" cy="11" r="3.6"/><circle class="plan" cx="39" cy="30" r="3.6"/>`,
  // Abbreviations: a short term beside its longer meaning, three rows.
  abbr: `<path class="plan" d="M7 14h8M7 24h8M7 34h8"/>
         <path d="M21 14h19M21 24h14M21 34h17" opacity=".75"/>`,
  // Workflow / getting started: an ECG trace.
  ecg: `<path d="M4 27h9l3-8 4 16 4-22 4 18 3-6h13"/>
        <path class="plan" d="M4 40h40" opacity=".8"/>`,
};

export function glyph(kind, label) {
  return wrap(SHAPES[kind] || SHAPES.special, label);
}

/** Pick a drawing for a topic: an explicit "glyph" in topics.json wins, otherwise match on its name. */
export function glyphFor(topic) {
  if (!topic) return "special";
  if (topic.glyph && SHAPES[topic.glyph]) return topic.glyph;
  const s = `${topic.slug} ${topic.label}`.toLowerCase();
  if (/valv/.test(s)) return "valve";
  if (/right|\brv\b/.test(s)) return "rv";
  if (/short[- ]?axis|\bsax\b/.test(s)) return "sax";
  if (/left|\blv\b|ventric/.test(s)) return "lv";
  if (/begin|workflow|start|basic|quick/.test(s)) return "ecg";
  return "special";
}

export const LOGO = `<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round" aria-hidden="true">
  <circle cx="24" cy="24" r="12.5" stroke="currentColor" stroke-width="5"/>
  <path d="M7 37L41 11" stroke="var(--accent)" stroke-width="3"/></svg>`;
