// service-worker.js
// Estratégia: Cache-First com fallback de rede, e pré-cache total no "install".
// Sempre que alterares ficheiros do app, incrementa a versão do CACHE_NAME
// (ex: 'v1' -> 'v2') para forçar a atualização da cache nos dispositivos dos utilizadores.

const CACHE_NAME = 'simulador-exames-v1';

// Recursos do próprio site (caminhos relativos ao service-worker.js)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Recursos externos (CDNs). São pedidos em modo "no-cors" porque servidores
// de CDN normalmente não devolvem cabeçalhos CORS para caching direto;
// a resposta fica "opaca" (não conseguimos ler o conteúdo/status),
// mas o browser consegue servi-la offline a partir da cache na mesma.
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // ativa a nova versão do SW imediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache dos ficheiros locais (têm de existir, senão o addAll falha tudo)
      await cache.addAll(APP_SHELL);

      // Cache dos recursos externos, um a um, para uma falha isolada
      // não impedir a instalação do resto da app.
      await Promise.all(
        EXTERNAL_ASSETS.map(async (url) => {
          try {
            const request = new Request(url, { mode: 'no-cors' });
            const response = await fetch(request);
            await cache.put(request, response);
          } catch (err) {
            console.warn('[SW] Falha ao pré-cachear recurso externo:', url, err);
          }
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // remove caches de versões antigas
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Só intercetamos pedidos GET (POST/PUT etc. vão direto à rede)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // CACHE-FIRST: se já está na cache, serve imediatamente, sem tocar na rede
        return cachedResponse;
      }

      // Não estava em cache: tenta a rede e guarda uma cópia para a próxima vez
      return fetch(event.request)
        .then((networkResponse) => {
          const isSameOrigin = event.request.url.startsWith(self.location.origin);
          const isOpaque = networkResponse.type === 'opaque';

          if (isSameOrigin || isOpaque) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Sem rede e sem cache: se for navegação, devolve o index.html
          // como página de fallback offline.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
