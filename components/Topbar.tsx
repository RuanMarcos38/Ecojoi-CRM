'use client';
import { useEffect,useState } from 'react';
import { Search, Bell, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
type Me={fullName:string;companyName:string;role:string};type Result={id:string;name:string;email?:string;phone?:string;status:string};
export function Topbar(){
  const [me,setMe]=useState<Me|null>(null);const [q,setQ]=useState('');const [results,setResults]=useState<Result[]>([]);const [notifications,setNotifications]=useState(false);const router=useRouter();
  useEffect(()=>{fetch('/api/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>setMe(d?.data??null)).catch(()=>{})},[]);
  useEffect(()=>{if(q.trim().length<2){setResults([]);return}const t=setTimeout(()=>{fetch(`/api/search?q=${encodeURIComponent(q.trim())}`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>setResults(d?.data??[])).catch(()=>setResults([]))},250);return()=>clearTimeout(t)},[q]);
  async function logout(){await createClient().auth.signOut();router.push('/login');router.refresh()}
  const initials=(me?.fullName??'Ecojoi').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  return <header className="topbar"><div className="search-wrap"><div className="search"><Search size={17}/><input aria-label="Busca global" placeholder="Buscar contatos..." value={q} onChange={e=>setQ(e.target.value)} /></div>{q.trim().length>=2&&<div className="search-results">{results.length?results.map(r=><div className="search-result" key={r.id}><strong>{r.name}</strong><span>{r.phone??r.email??r.status}</span></div>):<div className="search-result muted">Nenhum contato encontrado.</div>}</div>}</div><div className="top-actions"><div className="user-meta"><strong>{me?.fullName??'Usuário'}</strong><small>{me?.companyName??'Ecojoi CRM'}</small></div><div className="notification-wrap"><button className="btn btn-secondary" aria-label="Notificações" onClick={()=>setNotifications(v=>!v)}><Bell size={17}/></button>{notifications&&<div className="notification-popover"><strong>Notificações</strong><span>Nenhuma nova notificação.</span></div>}</div><div className="avatar" title={me?.role}>{initials}</div><button className="btn btn-secondary icon-btn" onClick={logout} aria-label="Sair"><LogOut size={17}/></button></div></header>
}