// Runs before the app bundle (external file: the CSP allows no inline scripts).
// 1. Apply the stored or system theme before first paint (no flash).
try {
  var t = localStorage.getItem('ligapedia-theme');
  var dark = t === 'dark' || ((!t || t === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
} catch {
  // storage or matchMedia unavailable: keep the default (light) theme
}

// 2. Start the page's main API request and its route code while the main bundle downloads.
//    lib/api.ts reuses the response; ROUTE_CHUNKS is filled in at build time (vite.config.ts).
var ROUTE_CHUNKS = /* route chunks */ {};
(function () {
  var p = location.pathname;
  var urls = ['/api/v1/meta'];
  var m;
  var route = null;
  var api = null;
  if (p === '/') {
    route = 'index';
    api = '/api/v1/inicio';
  } else if (p === '/temporadas') {
    route = 'temporadas/index';
    api = '/api/v1/temporadas';
  } else if ((m = /^\/temporadas\/(\d{4})$/.exec(p))) {
    route = 'temporadas/$anio';
    api = '/api/v1/temporadas/' + m[1];
  } else if ((m = /^\/torneos\/(\d+)(?:-[^/]*)?$/.exec(p))) {
    route = 'torneos/$torneo';
    api = '/api/v1/torneos/' + m[1];
  } else if ((m = /^\/partidos\/(\d+)$/.exec(p))) {
    route = 'partidos/$id';
    api = '/api/v1/partidos/' + m[1];
  } else if ((m = /^\/equipos\/(\d+)(?:-[^/]*)?$/.exec(p))) {
    route = 'equipos/$equipo';
    api = '/api/v1/equipos/' + m[1];
  } else if ((m = /^\/jugadores\/(\d+)(?:-[^/]*)?$/.exec(p))) {
    route = 'jugadores/$jugador';
    api = '/api/v1/jugadores/' + m[1];
  } else if (p === '/equipos') {
    route = 'equipos/index';
  } else if (p === '/jugadores') {
    route = 'jugadores/index';
  } else if (p === '/records') {
    route = 'records/index';
  }
  if (api) urls.push(api);
  var chunks = route && ROUTE_CHUNKS[route] ? ROUTE_CHUNKS[route] : [];
  chunks.forEach(function (href) {
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = href;
    document.head.appendChild(link);
  });
  var cache = (window.__lpPrefetch = {});
  urls.forEach(function (u) {
    cache[u] = fetch(u, { headers: { accept: 'application/json' } }).then(function (r) {
      return r.ok ? r.json() : Promise.reject(r.status);
    });
    cache[u].catch(function () {});
  });
})();
