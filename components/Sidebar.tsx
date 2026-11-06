'use client';
import { useEffect,useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, UserPlus, Kanban, CheckSquare, Bot, BarChart3, ShieldCheck, Settings, ScrollText, CalendarClock, Megaphone, MessageCircle, PlugZap, FileText, FormInput, HeartHandshake, Menu, PanelLeftClose, PanelLeftOpen, Wallet, Package, X, ChevronDown } from 'lucide-react';
import type { Permission, Role } from '@/lib/auth/permissions';

type Item={href:string;label:string;Icon:typeof LayoutDashboard;permission?:Permission;feature?:string;roles?:Role[]};
type Me={permissions:Permission[];features:Record<string,boolean>;role:Role;companyName?:string};
const groups:{title:string;items:Item[]}[]=[
  {title:'Visão geral',items:[{href:'/app',label:'Painel',Icon:LayoutDashboard}]},
  {title:'Comercial',items:[
    {href:'/app/atendimento',label:'Atendimento',Icon:MessageCircle,permission:'conversations.view',feature:'atendimento'},
    {href:'/app/contatos',label:'Contatos',Icon:Users,permission:'contacts.view'},
    {href:'/app/leads',label:'Pré-vendas',Icon:UserPlus,permission:'contacts.view'},
    {href:'/app/pipeline',label:'Funil',Icon:Kanban,permission:'deals.view'},
    {href:'/app/vendas',label:'Operações Comerciais',Icon:FileText,permission:'deals.view'},
    {href:'/app/relacionamento',label:'Relacionamento',Icon:HeartHandshake,permission:'deals.view'},
    {href:'/app/agenda',label:'Agenda',Icon:CalendarClock,permission:'tasks.view'},
    {href:'/app/tarefas',label:'Tarefas',Icon:CheckSquare,permission:'tasks.view'}
  ]},
  {title:'Operação e inteligência',items:[
    {href:'/app/campanhas',label:'Campanhas',Icon:Megaphone,permission:'reports.view',feature:'relatorios'},
    {href:'/app/captura',label:'Captura & Web',Icon:FormInput,permission:'settings.view'},
    {href:'/app/automacoes',label:'Automações',Icon:Bot,permission:'automations.view',feature:'automacoes'},
    {href:'/app/relatorios',label:'Relatórios',Icon:BarChart3,permission:'reports.view',feature:'relatorios'}
  ]},
  {title:'Gestão',items:[{href:'/app/financeiro',label:'Financeiro',Icon:Wallet,permission:'finance.view'},{href:'/app/erp',label:'ERP · Dashboard',Icon:LayoutDashboard,permission:'erp.stock.view'},{href:'/app/erp/estoque',label:'ERP · Estoque',Icon:Package,permission:'erp.stock.view'},{href:'/app/erp/compras',label:'ERP · Compras',Icon:FileText,permission:'erp.purchases.view'}]},
  {title:'Administração',items:[
    {href:'/app/equipe',label:'Equipe e Permissões',Icon:ShieldCheck,permission:'team.view'},
    {href:'/app/auditoria',label:'Auditoria',Icon:ScrollText,permission:'audit.view'},
    {href:'/app/integracoes',label:'Integrações',Icon:PlugZap,permission:'settings.view'},
    {href:'/app/configuracoes',label:'Configurações',Icon:Settings,permission:'settings.view'}
  ]},
  {title:'Plataforma',items:[{href:'/app/admin/empresas',label:'Empresas SaaS',Icon:ShieldCheck,roles:['super_admin']}] }
];
export function Sidebar(){
  const pathname=usePathname(); const [me,setMe]=useState<Me|null>(null); const [menuOpen,setMenuOpen]=useState(false);
  const [closedGroups,setClosedGroups]=useState<Record<string,boolean>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ecojoi:sidebar:groups') || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        setClosedGroups(Object.fromEntries(groups.map(group => [group.title, saved[group.title] === true])));
      }
    } catch {}
  }, []);
  function saveGroups(next: Record<string, boolean>) {
    setClosedGroups(next);
    try { localStorage.setItem('ecojoi:sidebar:groups', JSON.stringify(next)); } catch {}
  }
  useEffect(()=>{fetch('/api/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>setMe(d?.data??null)).catch(()=>{})},[]);
  useEffect(()=>{setMenuOpen(false)},[pathname]);
  function allowed(i:Item){if(!me)return i.href==='/app';if(i.roles&&!i.roles.includes(me.role))return false;if(i.permission&&!me.permissions.includes(i.permission))return false;if(i.feature&&me.features[i.feature]!==true)return false;return true}
  const ecojoiBrand=me?.companyName?.trim().toLowerCase()==='ecojoi'?<span className="ecojoi-wordmark">Eco<span>joi</span><sup>®</sup></span>:null;
  const [collapsed, setCollapsed] = useState(false);
  const desktopLabel = collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral';

  return <aside className={`sidebar${menuOpen ? ' mobile-open' : ''}`} data-collapsed={collapsed}>
    <div className="sidebar-mobile-head">
      <div className="sidebar-mobile-brand">
        <div className="brand-mark"/>
        <span>{ecojoiBrand ?? (me?.companyName || 'CRM Corporativo')}</span>
      </div>
      <button type="button" className="sidebar-mobile-toggle" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="crm-primary-nav" onClick={() => setMenuOpen(v => !v)}>
        {menuOpen ? <X size={18}/> : <Menu size={18}/>}
      </button>
    </div>
    <div className="brand">
      <div className="brand-mark"/>
      <div>
        <div className="brand-name">{ecojoiBrand ?? (me?.companyName || 'CRM Corporativo')}</div>
        <span className="brand-sub">GESTÃO DE RELACIONAMENTO</span>
      </div>
    </div>
    <button type="button" className="sidebar-desktop-toggle" aria-label={desktopLabel} title={desktopLabel} aria-expanded={!collapsed} aria-controls="crm-primary-nav" onClick={() => setCollapsed(v => !v)}>
      {collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}
      <span>{desktopLabel}</span>
    </button>
    <div className="sidebar-group-actions" aria-label="Organizar categorias">
      <button type="button" onClick={() => saveGroups(Object.fromEntries(groups.map(group => [group.title, true])))}>Recolher categorias</button>
      <button type="button" onClick={() => saveGroups({})}>Expandir categorias</button>
    </div>
    <nav className="nav" id="crm-primary-nav" aria-label="Navegação principal">
      {groups.map(group => {
        const items = group.items.filter(allowed);
        return items.length ? <div key={group.title} className="sidebar-nav-group">
          <button type="button" className="nav-title nav-group-toggle" aria-expanded={!closedGroups[group.title]} aria-label={`${closedGroups[group.title] ? 'Expandir' : 'Recolher'} ${group.title}`} title={`${closedGroups[group.title] ? 'Expandir' : 'Recolher'} categoria`} onClick={() => saveGroups({...closedGroups,[group.title]:!closedGroups[group.title]})}>
            <span>{group.title}</span><ChevronDown aria-hidden="true" size={14} className={closedGroups[group.title] ? 'nav-chevron is-closed' : 'nav-chevron'}/>
          </button>
          {(collapsed || !closedGroups[group.title]) && items.map(({href, label, Icon}) => <Link
            className={pathname === href ? 'active' : ''}
            aria-current={pathname === href ? 'page' : undefined}
            aria-label={label}
            title={collapsed ? label : undefined}
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
          >
            <Icon aria-hidden="true"/>
            <span className="sidebar-nav-label">{label}</span>
          </Link>)}
        </div> : null;
      })}
    </nav>
  </aside>;
}
