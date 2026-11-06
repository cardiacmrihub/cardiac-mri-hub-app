// Per-device preferences and saved guides, kept in localStorage.
// Every access is guarded: private browsing and full storage must never break the app.

const KEY = "cmh-prefs-v1";
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { cache = {}; }
  if (!Array.isArray(cache.saved)) cache.saved = [];
  return cache;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable */ }
}

export const prefs = {
  get(key, fallback) {
    const v = load()[key];
    return v === undefined ? fallback : v;
  },
  set(key, value) {
    load()[key] = value;
    persist();
  },
  isSaved(slug) {
    return load().saved.includes(slug);
  },
  /** Returns true when the guide is now saved, false when it was removed. */
  toggleSaved(slug) {
    const saved = load().saved;
    const i = saved.indexOf(slug);
    if (i >= 0) saved.splice(i, 1); else saved.unshift(slug);
    persist();
    return i < 0;
  },
  savedSlugs() {
    return [...load().saved];
  },
};
