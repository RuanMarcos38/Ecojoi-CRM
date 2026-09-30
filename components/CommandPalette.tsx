'use client';

import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock,Kanban,MessageCircle,Plus,Search,Settings,Users } from 'lucide-react';

const actions=[
  {label:'Atendimento',href:'/app/atendimento',Icon:MessageCircle},
  {label:'Contatos',href:'/app/contatos',Icon:Users},
  {label:'Leads / Pré-vendas',href:'/app/leads',Icon:Plus},
  {label:'Funil comercial',href:'/app/pipeline',Icon:Kanban},
  {label:'Agenda e tarefas',href:'/app/agenda',Icon:CalendarClock},
  {label:'Configurações',href:'/app/configuracoes',Icon:Settings}
];

export function CommandPalette(){
  const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [remote,setRemote]=useState<any[]>([]);const router=useRouter();
  useEffect(()=>{const fn=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(v=>!v);}if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[]);
  useEffect(()=>{if(!open||query.trim().length<2){setRemote([]);return;}const t=window.setTimeout(()=>fetch('/api/search?q='+encodeURIComponent(query.trim()),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>setRemote(d?.data??[])).catch(()=>setRemote([])),200);return()=>window.clearTimeout(t);},[open,query]);
  const local=useMemo(()=>actions.filter(a=>!query.trim()||a.label.toLowerCase().includes(query.toLowerCase())),[query]);
  function go(href:string){setOpen(false);setQuery('');router.push(href);}
  if(!open)return null;
  return <div onMouseDown={()=>setOpen(false)} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(17,27,33,.28)',display:'grid',placeItems:'start center',paddingTop:'12vh'}}>
    <div onMouseDown={e=>e.stopPropagation()} style={{width:'min(620px,92vw)',maxHeight:'70vh',overflow:'hidden',background:'#fff',border:'1px solid #dfe4e1',borderRadius:10,boxShadow:'0 24px 70px rgba(0,0,0,.2)'}}>
      <div style={{display:'flex',alignItems:'center',gap:9,padding:'12px 14px',borderBottom:'1px solid #edf0ee'}}><Search size={18}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar ou executar ação..." style={{border:0,outline:0,flex:1,fontSize:14}}/><kbd style={{fontSize:10,color:'#6f7a75'}}>Esc</kbd></div>
      <div style={{maxHeight:'60vh',overflow:'auto',padding:8}}>
        {local.map(({label,href,Icon})=><button key={href} onClick={()=>go(href)} style={{width:'100%',display:'flex',alignItems:'center',gap:9,border:0,background:'transparent',padding:'9px 10px',borderRadius:6,cursor:'pointer',textAlign:'left'}}><Icon size={16}/>{label}</button>)}
        {remote.length>0&&<><div style={{padding:'9px 10px 4px',fontSize:10,color:'#7b8881',textTransform:'uppercase'}}>Resultados</div>{remote.slice(0,8).map((r:any)=><button key={r.type+'-'+r.id} onClick={()=>go(r.href)} style={{width:'100%',display:'grid',gap:2,border:0,background:'transparent',padding:'8px 10px',borderRadius:6,cursor:'pointer',textAlign:'left'}}><strong style={{fontSize:12}}>{r.title}</strong><small style={{color:'#6f7a75'}}>{r.subtitle||r.type}</small></button>)}</>}
      </div>
    </div>
  </div>;
}
