// App shell is cached for offline study after the first successful online visit.
const CACHE = '__SHELL_CACHE_NAME__';
const ASSETS = __PRECACHE_ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})));
    // Update to the latest worker, replacing the older navigation worker
    // promptly, including when a v0.8.14 launcher tab is still open.
    await self.skipWaiting();
  })());
});
self.addEventListener('message',event=>{if(event.data==='activate-update')event.waitUntil(self.skipWaiting());});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('ciyan-shell-')||k.startsWith('app-launcher-shell-'))&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
// Safari rejects a navigation if the Response returned by a service worker
// has a redirect flag, even if the redirect ended with a successful HTML page.
// Constructing a fresh Response clears the internal response URL/redirect flags
// without changing the final bytes or headers.
function navigationResponse(response){
  return new Response(response.body, {
    status:response.status,
    statusText:response.statusText,
    headers:response.headers
  });
}
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    const scope=new URL(self.registration.scope);
    const index=new URL('./index.html',scope);
    const isShell=url.pathname===scope.pathname||url.pathname===index.pathname;
    event.respondWith((async()=>{
      // Both the launcher URL and ?app=ciyan use the same cached HTML offline.
      // Do not return a cached Response directly: Cloudflare's canonical URL
      // redirects can leave it marked "redirected" inside Safari/WebKit.
      const cached=await caches.match(isShell?index.href:event.request);
      const result=cached||await fetch(event.request);
      return navigationResponse(result);
    })());
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
