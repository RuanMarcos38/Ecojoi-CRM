'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Bell, LogOut, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Me={fullName:string;companyName:string;role:string;tenantId:string;userId:string};
type Result={id:string;type:'contact'|'deal'|'task'|'message';title:string;subtitle?:string;href:string};
type Notification={id:string;type:string;title:string;body?:string|null;entity_type?:string|null;entity_id?:string|null;priority:string;read_at?:string|null;created_at:string};

export function Topbar(){
  const [me,setMe]=useState<Me|null>(null);
  const [q,setQ]=useState('');
  const [results,setResults]=useState<Result[]>([]);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [notifications,setNotifications]=useState<Notification[]>([]);
  const router=useRouter();
  const searchInput=useRef<HTMLInputElement>(null);

  async function loadNotifications(){
    try{
      const r=await fetch('/api/notifications',{cache:'no-store'});
      if(!r.ok)return;
      const d=await r.json().catch(()=>null);
      setNotifications(Array.isArray(d?.data)?d.data:[]);
    }catch{
      setNotifications([]);
    }
  }

  useEffect(()=>{
    let active=true;
    fetch('/api/me',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(d=>{if(active)setMe(d?.data??null);})
      .catch(()=>{if(active)setMe(null);});
    void loadNotifications();
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!me?.tenantId)return;
    let supabase:ReturnType<typeof createClient>|null=null;
    let channel:ReturnType<ReturnType<typeof createClient>['channel']>|null=null;

    try{
      supabase=createClient();
      channel=supabase.channel(`ecojoi-notifications-${me.tenantId}`)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`tenant_id=eq.${me.tenantId}`},()=>void loadNotifications())
        .subscribe();
    }catch(error){
      console.warn('[Ecojoi CRM] Realtime indisponível; notificações seguem por atualização manual.',error);
    }

    return()=>{
      try{
        if(supabase&&channel)void supabase.removeChannel(channel);
      }catch{}
    };
  },[me?.tenantId]);

  useEffect(()=>{
    function shortcut(event:KeyboardEvent){
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener('keydown',shortcut);
    return()=>window.removeEventListener('keydown',shortcut);
  },[]);

  useEffect(()=>{
    if(q.trim().length<2){setResults([]);return;}
    const t=window.setTimeout(()=>{
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`,{cache:'no-store'})
        .then(r=>r.ok?r.json():null)
        .then(d=>setResults(Array.isArray(d?.data)?d.data:[]))
        .catch(()=>setResults([]));
    },220);
    return()=>window.clearTimeout(t);
  },[q]);

  async function logout(){
    try{
      await createClient().auth.signOut();
    }catch{}
    router.push('/login');
    router.refresh();
  }

  async function markRead(id?:string){
    try{
      await fetch('/api/notifications',{
        method:'PATCH',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(id?{id}:{all:true})
      });
      await loadNotifications();
    }catch{}
  }

  const unread=useMemo(()=>notifications.filter(n=>!n.read_at).length,[notifications]);
  const initials=(me?.fullName??'Ecojoi').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]??'').join('').toUpperCase()||'EC';

  return <header className="topbar">
    <div className="search-wrap">
      <div className="search"><Search size={17}/><input ref={searchInput} aria-label="Busca global" placeholder="Buscar no CRM...  Ctrl+K" value={q} onChange={e=>setQ(e.target.value)}/></div>
      {q.trim().length>=2&&<div className="search-results">
        {results.length?results.map(r=><button type="button" className="search-result" key={`${r.type}-${r.id}`} onClick={()=>{setQ('');setResults([]);router.push(r.href);}}>
          <strong>{r.title}</strong><span>{r.subtitle??r.type}</span>
        </button>):<div className="search-result muted">Nenhum resultado encontrado.</div>}
      </div>}
    </div>

    <div className="top-actions">
      <div className="user-meta"><strong>{me?.fullName??'Usuário'}</strong><small>{me?.companyName??'Ecojoi CRM'}</small></div>
      <div className="notification-wrap">
        <button className="btn btn-secondary notification-button" aria-label="Notificações" onClick={()=>setNotificationsOpen(v=>!v)}>
          <Bell size={17}/>
          {unread>0&&<span className="notification-badge">{unread>99?'99+':unread}</span>}
        </button>
        {notificationsOpen&&<div className="notification-popover" style={{width:340,maxHeight:430,overflow:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><strong>Notificações</strong>{unread>0&&<button className="btn btn-secondary" style={{minHeight:28,padding:'5px 7px',fontSize:10}} onClick={()=>void markRead()}><CheckCheck size={13}/>Marcar lidas</button>}</div>
          <div style={{display:'grid',gap:3,marginTop:8}}>{notifications.length?notifications.map(n=><button type="button" key={n.id} onClick={()=>void markRead(n.id)} style={{display:'grid',gap:2,textAlign:'left',border:0,borderBottom:'1px solid #edf0ee',background:n.read_at?'transparent':'#f2f8f5',padding:'9px 7px',cursor:'pointer',borderRadius:4}}>
            <strong style={{fontSize:11}}>{n.title}</strong>{n.body&&<span style={{fontSize:10,color:'#6f7a75',lineHeight:1.35}}>{n.body}</span>}<small style={{fontSize:9,color:'#8a948f'}}>{Number.isNaN(new Date(n.created_at).getTime())?'':new Date(n.created_at).toLocaleString('pt-BR')}</small>
          </button>):<span>Nenhuma nova notificação.</span>}</div>
        </div>}
      </div>
      <div className="avatar" title={me?.role}>{initials}</div>
      <button className="btn btn-secondary icon-btn" onClick={logout} aria-label="Sair"><LogOut size={17}/></button>
    </div>
  </header>;
}
