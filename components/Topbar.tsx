'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Search, Bell, LogOut, CheckCheck, Sun, Moon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AgentAvatar } from './AgentAvatar';
import { useRouter } from 'next/navigation';

type Me={fullName:string;companyName:string;role:string;tenantId:string;userId:string};
type Result={id:string;type:'contact'|'deal'|'task'|'message';title:string;subtitle?:string;href:string};
type Notification={id:string;type:string;title:string;body?:string|null;entity_type?:string|null;entity_id?:string|null;priority:string;read_at?:string|null;created_at:string};

export function Topbar(){
  const [me,setMe]=useState<Me|null>(null);
  const [theme,setTheme]=useState<'dark'|'light'>('dark');
  useEffect(()=>{
    try {
      const stored=window.localStorage.getItem('ecojoi-ui-theme');
      const next=stored==='light'?'light':'dark';
      setTheme(next);
      document.documentElement.setAttribute('data-ecojoi-theme',next);
    } catch {
      document.documentElement.setAttribute('data-ecojoi-theme','dark');
    }
  },[]);
  function toggleTheme(){
    const next=theme==='dark'?'light':'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-ecojoi-theme',next);
    try { window.localStorage.setItem('ecojoi-ui-theme',next); } catch {}
  }
  const [q,setQ]=useState('');
  const [results,setResults]=useState<Result[]>([]);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [notifications,setNotifications]=useState<Notification[]>([]);
  const router=useRouter();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState('');

  async function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setAvatarFeedback('A foto deve ter até 1 MB.');
      return;
    }
    setAvatarBusy(true);
    setAvatarFeedback('');
    try {
      const form = new FormData();
      form.set('avatar', file);
      const response = await fetch('/api/me/avatar', { method: 'POST', body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setAvatarFeedback(payload?.error || 'Não foi possível salvar a foto.');
        return;
      }
      setAvatarVersion(Date.now());
      window.dispatchEvent(new Event('ecojoi:avatar-updated'));
      setAvatarFeedback('Foto atualizada.');
    } catch {
      setAvatarFeedback('Não foi possível salvar a foto.');
    } finally {
      setAvatarBusy(false);
    }
  }

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
      console.warn('[CRM] Realtime indisponível; notificações seguem por atualização manual.',error);
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
    const query=q.trim();
    if(query.length<2){setResults([]);return;}
    const controller=new AbortController();
    // Clear stale results immediately and prevent out-of-order responses.
    setResults([]);
    const timer=window.setTimeout(async()=>{
      try{
        const response=await fetch(`/api/search?q=${encodeURIComponent(query)}`,{
          cache:'no-store',signal:controller.signal
        });
        if(!response.ok)throw new Error('search_failed');
        const payload=await response.json();
        if(!controller.signal.aborted)setResults(Array.isArray(payload?.data)?payload.data:[]);
      }catch(error){
        if(!controller.signal.aborted)setResults([]);
      }
    },250);
    return()=>{window.clearTimeout(timer);controller.abort();};
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
      const response=await fetch('/api/notifications',{
        method:'PATCH',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(id?{id}:{all:true})
      });
      if(!response.ok)throw new Error('notifications_update_failed');
      await loadNotifications();
    }catch{await loadNotifications();}
  }

  const unread=useMemo(()=>notifications.filter(n=>!n.read_at).length,[notifications]);
  const initials=(me?.fullName??'Usuário').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]??'').join('').toUpperCase()||'US';

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
      <button type="button" className="btn btn-secondary theme-toggle" onClick={toggleTheme} aria-label={theme==='dark'?'Ativar modo claro':'Ativar modo escuro'} title={theme==='dark'?'Modo claro':'Modo escuro'}>
        {theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}
      </button>
      <div className="user-meta"><strong>{me?.fullName??'Usuário'}</strong><small>{me?.companyName??'CRM Corporativo'}</small></div>
      <div className="notification-wrap">
        <button className="btn btn-secondary notification-button" aria-label="Notificações" onClick={()=>setNotificationsOpen(v=>!v)}>
          <Bell size={17}/>
          {unread>0&&<span className="notification-badge">{unread>99?'99+':unread}</span>}
        </button>
        {notificationsOpen&&<div className="notification-popover" style={{width:340,maxHeight:430,overflow:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><strong>Notificações</strong>{unread>0&&<button className="btn btn-secondary" style={{minHeight:28,padding:'5px 7px',fontSize:10}} onClick={()=>void markRead()}><CheckCheck size={13}/>Marcar lidas</button>}</div>
          <div style={{display:'grid',gap:3,marginTop:8}}>{notifications.length?notifications.map(n=><button type="button" key={n.id} onClick={()=>void markRead(n.id)} style={{display:'grid',gap:2,textAlign:'left',border:0,borderBottom:'1px solid var(--line)',background:n.read_at?'transparent':'var(--eco-raised)',padding:'9px 7px',cursor:'pointer',borderRadius:4}}>
            <strong style={{fontSize:11}}>{n.title}</strong>{n.body&&<span style={{fontSize:10,color:'#6f7a75',lineHeight:1.35}}>{n.body}</span>}<small style={{fontSize:9,color:'#8a948f'}}>{Number.isNaN(new Date(n.created_at).getTime())?'':new Date(n.created_at).toLocaleString('pt-BR')}</small>
          </button>):<span>Nenhuma nova notificação.</span>}</div>
        </div>}
      </div>
      <div className="profile-photo-control">
        <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => void updateAvatar(event)}/>
        <button type="button" className="avatar profile-photo-button" aria-label="Alterar minha foto" title="Alterar minha foto" disabled={!me || avatarBusy} onClick={() => avatarInput.current?.click()}>
          {me ? <AgentAvatar name={me.fullName} userId={me.userId} version={avatarVersion}/> : initials}
        </button>
        {avatarFeedback && <div className="profile-photo-feedback" role="status">{avatarFeedback}<button type="button" aria-label="Dispensar aviso" onClick={() => setAvatarFeedback('')}>×</button></div>}
      </div>
      <button className="btn btn-secondary icon-btn" onClick={logout} aria-label="Sair"><LogOut size={17}/></button>
    </div>
  </header>;
}
