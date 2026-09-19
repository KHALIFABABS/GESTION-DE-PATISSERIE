/* ============================================================
   SERVICE WORKER — PÂTISSERIE PRESTIGE v6.2
   Gestion du cache et mode hors ligne
   ============================================================ */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = 'patisserie-prestige-' + CACHE_VERSION;
const CACHE_RUNTIME = 'patisserie-runtime-' + CACHE_VERSION;

/* Fichiers essentiels à mettre en cache dès l'installation */
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* Domaines autorisés pour le cache runtime (limiter pour éviter de tout cacher) */
const RUNTIME_CACHE_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ============================================================
   INSTALLATION : mise en cache initiale
   ============================================================ */
self.addEventListener('install', function(event) {
  console.log('[SW] Installation en cours...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Mise en cache des fichiers essentiels');
        /* addAll échoue si un seul fichier est introuvable.
           On utilise Promise.allSettled-like pour être tolérant. */
        return Promise.all(
          CORE_ASSETS.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Échec cache:', url, err);
            });
          })
        );
      })
      .then(function() {
        console.log('[SW] Installation terminée');
        /* Activer immédiatement le nouveau SW sans attendre */
        return self.skipWaiting();
      })
  );
});

/* ============================================================
   ACTIVATION : nettoyage des anciens caches
   ============================================================ */
self.addEventListener('activate', function(event) {
  console.log('[SW] Activation...');

  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.map(function(key) {
            /* Supprimer les caches qui ne sont pas les caches actuels */
            if (key !== CACHE_NAME && key !== CACHE_RUNTIME) {
              console.log('[SW] Suppression ancien cache:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(function() {
        console.log('[SW] Activation terminée');
        /* Prendre le contrôle de toutes les pages immédiatement */
        return self.clients.claim();
      })
  );
});

/* ============================================================
   FETCH : stratégie de cache
   ============================================================ */
self.addEventListener('fetch', function(event) {
  var request = event.request;

  /* Ignorer les requêtes non-GET */
  if (request.method !== 'GET') {
    return;
  }

  /* Ignorer les requêtes chrome-extension:// ou autres protocoles */
  var url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  /* Ignorer les appels API externes (WhatsApp, etc.) */
  if (url.hostname.indexOf('wa.me') !== -1 || url.hostname.indexOf('whatsapp') !== -1) {
    return;
  }

  /* =========================================================
     STRATÉGIE 1 : Fichiers HTML → Network First (toujours à jour)
     ========================================================= */
  if (request.headers.get('accept') && request.headers.get('accept').indexOf('text/html') !== -1) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  /* =========================================================
     STRATÉGIE 2 : Fichiers statiques locaux → Cache First
     ========================================================= */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  /* =========================================================
     STRATÉGIE 3 : Polices Google → Cache First (runtime cache)
     ========================================================= */
  if (RUNTIME_CACHE_DOMAINS.some(function(domain) { return url.hostname.indexOf(domain) !== -1; })) {
    event.respondWith(cacheFirstStrategy(request, CACHE_RUNTIME));
    return;
  }

  /* Par défaut : laisser passer la requête normalement */
});

/* ============================================================
   STRATÉGIE : Cache First (statique)
   ============================================================ */
function cacheFirstStrategy(request, cacheName) {
  var cacheTarget = cacheName || CACHE_NAME;

  return caches.match(request)
    .then(function(cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then(function(networkResponse) {
          /* Ne pas mettre en cache les réponses invalides */
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          var responseClone = networkResponse.clone();
          caches.open(cacheTarget).then(function(cache) {
            cache.put(request, responseClone);
          });

          return networkResponse;
        })
        .catch(function() {
          /* Fallback : retourner index.html si c'est une navigation */
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    });
}

/* ============================================================
   STRATÉGIE : Network First (HTML frais)
   ============================================================ */
function networkFirstStrategy(request) {
  return fetch(request)
    .then(function(networkResponse) {
      if (networkResponse && networkResponse.status === 200) {
        var responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, responseClone);
        });
      }
      return networkResponse;
    })
    .catch(function() {
      return caches.match(request)
        .then(function(cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('./index.html');
        });
    });
}

/* ============================================================
   MESSAGES du client (pour mise à jour manuelle)
   ============================================================ */
self.addEventListener('message', function(event) {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) { return caches.delete(key); }));
    }).then(function() {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
});

console.log('[SW] Service Worker chargé — Pâtisserie Prestige v6.2');