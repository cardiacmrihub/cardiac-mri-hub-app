// Service worker: makes the app open instantly and work offline.
// Bump VERSION whenever app files (HTML/CSS/JS/icons) change so devices pick up the update.
const VERSION = "1.10.1";
const SHELL_CACHE = `cmh-shell-${VERSION}`;
const CONTENT_CACHE = "cmh-content"; // guides.json — network first, so new guides show up when online
const IMAGE_CACHE = "cmh-images";    // guide images — cache first (file names are stable)
const VIDEO_CACHE = "cmh-videos";    // cine clips — saved by "Save everything", served from cache with byte ranges
const FONT_CACHE = "cmh-fonts";

// "./" rather than "index.html": hosts like Cloudflare Pages redirect /index.html to /, and a
// redirected response can't be used to answer a page load when offline.
const SHELL = [
  "./",
  "css/app.css",
  "js/app.js",
  "js/prefs.js",
  "js/search.js",
  "js/glyphs.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })));
      // First install takes over right away; later updates wait for the app's "Update" button.
      if (!self.registration.active) self.skipWaiting();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("cmh-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") return event.respondWith(networkFirst(req, SHELL_CACHE, "./"));
    if (url.pathname.endsWith("/content/guides.json")) return event.respondWith(networkFirst(req, CONTENT_CACHE));
    if (url.pathname.includes("/content/images/")) return event.respondWith(image(req));
    if (url.pathname.includes("/content/videos/")) return event.respondWith(video(req));
    return event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    return event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
  }
});

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Image addresses end in "?v=<fingerprint>", which changes when an image is replaced, so the exact
// address is looked up first. A new version is fetched and replaces the old one; offline, any saved
// version of the same image is better than none.
async function image(req) {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const path = new URL(req.url).pathname;
      for (const key of await cache.keys()) if (key.url !== req.url && new URL(key.url).pathname === path) cache.delete(key);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const old = await cache.match(req, { ignoreSearch: true });
    if (old) return old;
    throw err;
  }
}

// Video players ask for byte ranges, and Safari won't play a clip unless it gets them.
// Some static hosts (Cloudflare Workers among them) ignore ranges and send the whole file,
// so the first time a clip is requested the whole file is fetched once and saved, and every
// range is answered from that saved copy. That also leaves each watched clip available offline.
const videoDownloads = new Map(); // url → in-progress download, so parallel range requests share one fetch

async function video(req) {
  const url = new URL(req.url);
  url.search = "";
  const key = url.href;
  const cache = await caches.open(VIDEO_CACHE);
  let hit = await cache.match(key);
  if (!hit) {
    if (!videoDownloads.has(key)) {
      videoDownloads.set(
        key,
        fetch(key)
          .then((res) => (res.status === 200 ? cache.put(key, res) : null))
          .catch(() => null)
          .finally(() => videoDownloads.delete(key))
      );
    }
    await videoDownloads.get(key);
    hit = await cache.match(key);
    if (!hit) return fetch(req); // couldn't save it: let the network answer as best it can
  }
  const range = req.headers.get("range");
  if (!range) return hit;
  const blob = await hit.blob();
  const size = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? Number(m[1]) : NaN;
  let end = m[2] ? Number(m[2]) : size - 1;
  if (isNaN(start)) { start = Math.max(0, size - end); end = size - 1; } // "bytes=-500"
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": hit.headers.get("Content-Type") || "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await network) || new Response("Offline", { status: 503, statusText: "Offline" });
}
