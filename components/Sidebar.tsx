'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, MessagesSquare, Users, UserPlus, Kanban, CheckSquare, Bot, BarChart3, ShieldCheck, Settings } from 'lucide-react';

const groups = [
  { title:'Visão geral', items:[['/app','Dashboard',LayoutDashboard]] },
  { title:'Comercial', items:[['/app/atendimento','Atendimento',MessagesSquare],['/app/contatos','Contatos',Users],['/app/leads','Leads',UserPlus],['/app/pipeline','Pipeline',Kanban],['/app/tarefas','Tarefas',CheckSquare]] },
  { title:'Inteligência', items:[['/app/automacoes','Automações',Bot],['/app/relatorios','Relatórios',BarChart3]] },
  { title:'Administração', items:[['/app/equipe','Equipe e Permissões',ShieldCheck],['/app/configuracoes','Configurações',Settings]] }
] as const;

export function Sidebar(){
  const pathname = usePathname();
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"></div><div><div className="brand-name">ecojoi</div><span className="brand-sub">CRM • SEJA ECO COM ECOJOI</span></div></div>
    <nav className="nav">{groups.map(g=><div key={g.title}><div className="nav-title">{g.title}</div>{g.items.map(([href,label,Icon])=><Link className={pathname===href?'active':''} key={href} href={href}><Icon/>{label}</Link>)}</div>)}</nav>
  </aside>
}
