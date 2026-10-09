// Minimal service worker: exists so the app is installable (Chromium requires
// a fetch handler for the installability criteria). No caching — every request
// goes to the network so barcode scanning, Supabase realtime, and Server
// Actions are untouched, and a new deploy is picked up on the next page load.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally no respondWith: default browser fetch, network only.
});
