const CACHE='ecojoi-static-v2';

self.addEventListener('install',event=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('ecojoi-static-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;

  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(url.pathname.startsWith('/_next/static/')){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req);
        if(fresh.ok){
          const cache=await caches.open(CACHE);
          void cache.put(req,fresh.clone());
        }
        return fresh;
      }catch{
        const cached=await caches.match(req);
        return cached||Response.error();
      }
    })());
  }
});

self.addEventListener('push',event=>{
  let data={title:'Ecojoi CRM',body:'Você tem uma nova atualização.'};
  try{data={...data,...event.data?.json()};}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,tag:data.tag||'ecojoi-crm',data:data.data||{}}));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'/app';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if('focus' in client){
        client.navigate(target);
        return client.focus();
      }
    }
    if(clients.openWindow)return clients.openWindow(target);
  }));
});
