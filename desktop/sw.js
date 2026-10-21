/* A separate scope and prefix avoid touching the original game's caches or saves. */
const CACHE='district-builder-0.1.0';
const ASSETS=['./','./index.html','./district.css','./simulation.js','./scene.js','./app.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('district-builder-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url),scope=new URL('./',self.location.href);
  if(req.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(req,{ignoreSearch:true});
    if(hit)return hit;
    if(req.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===scope.pathname+'index.html'))return (await cache.match('./index.html'))||fetch(req);
    return fetch(req);
  }));
});
