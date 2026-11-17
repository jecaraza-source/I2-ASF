/*
 * Service worker de la app de campo. Solo guarda lo necesario para abrir /campo sin señal: la página
 * (un cascarón sin datos) y los archivos estáticos de Next. Nunca guarda respuestas de la API, de
 * Supabase ni fotos; esos datos viven en IndexedDB y se borran al enviarse o al cerrar sesión.
 */
const CACHE = "sigma-campo-v1";
const PAGINA = "/campo";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((c) => c.startsWith("sigma-campo") && c !== CACHE)
            .map((c) => caches.delete(c)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // La página: primero la red; sin señal, la última copia.
  if (req.mode === "navigate" && url.pathname === PAGINA) {
    event.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok && !r.redirected) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(PAGINA, copia));
          }
          return r;
        })
        .catch(() => caches.match(PAGINA).then((r) => r || Response.error())),
    );
    return;
  }

  // Estáticos de Next (llevan huella en el nombre): de la caché si ya están.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/marca/")) {
    event.respondWith(
      caches.match(req).then(
        (r) =>
          r ||
          fetch(req).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return resp;
          }),
      ),
    );
  }
});

// La app avisa qué estáticos ya cargó antes de que este service worker la controlara.
self.addEventListener("message", (event) => {
  const datos = event.data;
  if (!datos || datos.tipo !== "guardar" || !Array.isArray(datos.urls)) return;
  const urls = datos.urls.filter((u) => {
    try {
      const p = new URL(u);
      return (
        p.origin === self.location.origin &&
        (p.pathname === PAGINA ||
          p.pathname.startsWith("/_next/static/") ||
          p.pathname.startsWith("/marca/"))
      );
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(urls))
      .catch(() => undefined),
  );
});
