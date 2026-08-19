// Meenakshi Hospital -- offline-viewing service worker.
//
// Scope on purpose: this makes already-visited pages installable and
// viewable offline (cached patient lists, visit history, dashboards, etc.).
// It does NOT enable offline writes -- dispensing medicine, taking a
// payment, saving a consultation and every other Server Action is a
// non-GET request and is deliberately never touched here, so those still
// need a live connection (this app's stock and money operations are not
// safe to queue and replay blind).
//
// Bump CACHE_VERSION on any change to the caching strategy below so old
// clients pick up the new worker instead of running stale logic forever.
const CACHE_VERSION = "v1";
const PAGE_CACHE = `meenakshi-pages-${CACHE_VERSION}`;
const ASSET_CACHE = `meenakshi-assets-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== PAGE_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept anything that isn't a plain GET -- every Server Action
  // (dispense, payment, consultation save, ...) is a POST and must always
  // go straight to the network, succeed or fail honestly.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (Supabase auth/storage, WHO's API, Google Fonts' own CDN,
  // etc.) is left alone -- caching someone else's origin here would not
  // help offline viewing and could serve stale auth state.
  if (url.origin !== self.location.origin) return;

  // Full page navigations: network-first so a connected user always sees
  // the live page, falling back to whatever was last cached for that exact
  // URL, and finally to a friendly offline page instead of the browser's
  // own "no internet" screen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? (await caches.match(OFFLINE_URL));
        }),
    );
    return;
  }

  // Static assets and same-origin data GETs (Next's build output, images,
  // fonts, /api/search/* etc.): stale-while-revalidate -- answer instantly
  // from cache when there is one, refresh it in the background, and fall
  // back to the network when there is nothing cached yet.
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);
      return cached ?? (await network) ?? Response.error();
    }),
  );
});
