'use client';
import { Search, Bell } from 'lucide-react';
export function Topbar(){return <header className="topbar"><div className="search"><Search size={17}/><input placeholder="Buscar contatos, leads, conversas..." /></div><div className="top-actions"><button className="btn btn-secondary" aria-label="Notificações"><Bell size={17}/></button><div className="avatar">E</div></div></header>}
