// Service worker — clears all caches and unregisters itself.
// The PWA manifest handles home screen installation without needing caching.

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(keys.map(function(key) { return caches.delete(key); }));
      })
      .then(function() { return self.registration.unregister(); })
      .then(function() { return self.clients.matchAll(); })
      .then(function(clients) {
        clients.forEach(function(client) { client.navigate(client.url); });
      })
  );
});
