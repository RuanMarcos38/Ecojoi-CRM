'use client';
import { useEffect,useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, MessagesSquare, Users, UserPlus, Kanban, CheckSquare, Bot, BarChart3, ShieldCheck, Settings, ScrollText } from 'lucide-react';
import type { Permission, Role } from '@/lib/auth/permissions';

type Item={href:string;label:string;Icon:typeof LayoutDashboard;permission?:Permission;feature?:string;roles?:Role[]};
type Me={permissions:Permission[];features:Record<string,boolean>;role:Role};
const groups:{title:string;items:Item[]}[]=[
  {title:'Visão geral',items:[{href:'/app',label:'Dashboard',Icon:LayoutDashboard}]},
  {title:'Comercial',items:[
    {href:'/app/atendimento',label:'Atendimento',Icon:MessagesSquare,permission:'conversations.view',feature:'atendimento'},
    {href:'/app/contatos',label:'Contatos',Icon:Users,permission:'contacts.view'},
    {href:'/app/leads',label:'Leads',Icon:UserPlus,permission:'contacts.view'},
    {href:'/app/pipeline',label:'Pipeline',Icon:Kanban,permission:'deals.view'},
    {href:'/app/tarefas',label:'Tarefas',Icon:CheckSquare,permission:'tasks.view'}
  ]},
  {title:'Inteligência',items:[
    {href:'/app/automacoes',label:'Automações',Icon:Bot,permission:'automations.view',feature:'automacoes'},
    {href:'/app/relatorios',label:'Relatórios',Icon:BarChart3,permission:'reports.view',feature:'relatorios'}
  ]},
  {title:'Administração',items:[
    {href:'/app/equipe',label:'Equipe e Permissões',Icon:ShieldCheck,permission:'team.view'},
    {href:'/app/auditoria',label:'Auditoria',Icon:ScrollText,permission:'audit.view'},
    {href:'/app/configuracoes',label:'Configurações',Icon:Settings,permission:'settings.view'}
  ]},
  {title:'Plataforma',items:[{href:'/app/admin/empresas',label:'Empresas SaaS',Icon:ShieldCheck,roles:['super_admin']}] }
];
export function Sidebar(){
  const pathname=usePathname(); const [me,setMe]=useState<Me|null>(null);
  useEffect(()=>{fetch('/api/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>setMe(d?.data??null)).catch(()=>{})},[]);
  function allowed(i:Item){if(!me)return i.href==='/app';if(i.roles&&!i.roles.includes(me.role))return false;if(i.permission&&!me.permissions.includes(i.permission))return false;if(i.feature&&me.features[i.feature]!==true)return false;return true}
  return <aside className="sidebar"><div className="brand"><div className="brand-mark"></div><div><div className="brand-name">ecojoi</div><span className="brand-sub">CRM • SEJA ECO COM ECOJOI</span></div></div><nav className="nav">{groups.map(g=>{const items=g.items.filter(allowed);return items.length?<div key={g.title}><div className="nav-title">{g.title}</div>{items.map(({href,label,Icon})=><Link className={pathname===href?'active':''} key={href} href={href}><Icon/>{label}</Link>)}</div>:null})}</nav></aside>
}