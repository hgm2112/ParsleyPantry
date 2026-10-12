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

// Daily leftovers reminder (web-push). Shows the notification and, on tap,
// opens (or focuses) the home page scrolled to the leftovers widget.
self.addEventListener("push", (event) => {
  let payload = { title: "Don't forget your leftovers!", body: "", url: "/home#leftovers" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = { ...payload, ...parsed };
      }
    }
  } catch {
    // Malformed payload — fall back to the generic message.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/home#leftovers" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/home#leftovers";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
