self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/')||url.pathname.includes('supabase'))return;
  if(url.pathname.startsWith('/_next/static/')){
    event.respondWith(caches.open('ecojoi-static-v1').then(async cache=>{
      const cached=await cache.match(request);
      if(cached)return cached;
      const response=await fetch(request);
      if(response.ok)cache.put(request,response.clone());
      return response;
    }));
  }
});
