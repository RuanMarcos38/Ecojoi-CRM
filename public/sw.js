const CACHE='ecojoi-static-v1';
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/_next/static/')){
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const hit=await cache.match(req);
      if(hit)return hit;
      const res=await fetch(req);
      if(res.ok)cache.put(req,res.clone());
      return res;
    }));
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
    for(const client of list){if('focus' in client){client.navigate(target);return client.focus();}}
    if(clients.openWindow)return clients.openWindow(target);
  }));
});
