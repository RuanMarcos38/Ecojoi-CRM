'use client';

import { FormEvent,useEffect,useState } from 'react';
import { Plus,X } from 'lucide-react';

type Member={
  id:string;
  full_name:string;
  role:string;
  active:boolean;
  availability_state:'online'|'busy'|'break'|'offline';
  max_open_conversations:number;
  open_conversations:number;
  created_at:string;
};

const availabilityLabel={online:'Online',busy:'Ocupado',break:'Pausa',offline:'Offline'};

export default function Equipe(){
  const [rows,setRows]=useState<Member[]>([]);
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [inviteUrl,setInviteUrl]=useState('');
  const [inviting,setInviting]=useState(false);

  async function load(){
    const r=await fetch('/api/team',{cache:'no-store'});
    const d=await r.json();
    if(r.ok)setRows(d.data??[]);
  }
  useEffect(()=>{void load();},[]);

  async function change(id:string,patch:Record<string,unknown>){
    setError('');setNotice('');
    const r=await fetch(`/api/team/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
    if(!r.ok)setError('Você não possui permissão para alterar este usuário.');
    else setNotice('Configuração do atendente atualizada.');
    await load();
  }

  async function invite(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setNotice('');setInviteUrl('');setInviting(true);
    const fd=new FormData(e.currentTarget);
    try {
    const r=await fetch('/api/team/invite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(fd.entries()))});
    const d=await r.json();
    if(r.ok){setOpen(false);setInviteUrl(d.data?.invite_url??'');setNotice(d.data?.delivery==='link'?'Convite criado por link. O e-mail não foi enviado. Copie e compartilhe o link somente com o colaborador informado.':'Convite enviado. O colaborador deve abrir o e-mail, criar sua senha e entrar no CRM Ecojoi. Não é necessário cadastrar outra empresa.');await load();return;}
    setError(d.error==='email_unavailable'?'Este e-mail não está disponível para esta empresa.':d.error==='profile_create_failed'?'Não foi possível vincular o colaborador. Tente novamente sem alterar o e-mail.':d.error==='admin_key_not_configured'?'Convites exigem SUPABASE_SERVICE_ROLE_KEY configurada somente no servidor.':d.error==='user_already_registered'?'Este e-mail já possui cadastro. Para definir ou recuperar a senha, utilize Recuperar senha na tela de login.':'Não foi possível enviar o convite. Confira a configuração de e-mails e redirecionamento no Supabase.');
    } catch {setError('Falha de conexão ao criar convite. Tente novamente.');} finally {setInviting(false);}
  }

  return <div className="content">
    <div className="page-head">
      <div><h1 className="page-title">Equipe e Permissões</h1><p className="page-sub">Usuários sem limite de quantidade no CRM. Perfis e capacidade de atendimento por colaborador.</p></div>
      <button className="btn btn-primary" onClick={()=>setOpen(v=>!v)}>{open?<X size={17}/>:<Plus size={17}/>} {open?'Fechar':'Convidar usuário'}</button>
    </div>

    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    {inviteUrl&&<div className="card section"><label htmlFor="invite-link">Link individual de primeiro acesso</label><input id="invite-link" className="input" value={inviteUrl} readOnly/><button type="button" className="btn btn-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(inviteUrl);setNotice('Link copiado. Compartilhe somente com o colaborador convidado.');}catch{setError('Selecione e copie o link acima.');}}}>Copiar convite</button><p>O link expira conforme a configuração de autenticação. Não publique em grupos.</p></div>}
    {open&&<form className="card section" onSubmit={invite}>
      <div className="form-grid">
        <div className="field"><label>Nome</label><input className="input" name="full_name" required/></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" name="email" required/></div>
        <div className="field"><label>Perfil</label><select className="select" name="role"><option value="user">Usuário</option><option value="manager">Gestor</option><option value="company_admin">Administrador da Empresa</option></select></div>
      </div>
      <div className="field"><label htmlFor="invite-delivery">Entrega do convite</label><select id="invite-delivery" className="select" name="delivery"><option value="email">Enviar e-mail (gerar link se indisponível)</option><option value="link">Gerar link para compartilhar</option></select></div>
      <button className="btn btn-primary" disabled={inviting} style={{marginTop:14}}>{inviting?'Criando convite...':'Criar convite'}</button>
    </form>}

    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>Usuário</th><th>Perfil</th><th>Disponibilidade</th><th>Atendimentos</th><th>Capacidade</th><th>Status</th></tr></thead>
        <tbody>{rows.length?rows.map(r=><tr key={r.id}>
          <td><strong>{r.full_name}</strong><small className="muted" style={{display:'block'}}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</small></td>
          <td><select className="select" value={r.role} onChange={e=>void change(r.id,{role:e.target.value})} disabled={r.role==='super_admin'}><option value="company_admin">Administrador</option><option value="manager">Gestor</option><option value="user">Usuário</option>{r.role==='super_admin'&&<option value="super_admin">Super Admin</option>}</select></td>
          <td><select className="select" value={r.availability_state??'online'} onChange={e=>void change(r.id,{availability_state:e.target.value})}><option value="online">Online</option><option value="busy">Ocupado</option><option value="break">Pausa</option><option value="offline">Offline</option></select></td>
          <td><strong>{r.open_conversations??0}</strong><small className="muted" style={{display:'block'}}>abertos</small></td>
          <td><input className="input" type="number" min={1} max={500} value={r.max_open_conversations??30} onChange={e=>setRows(rows=>rows.map(x=>x.id===r.id?{...x,max_open_conversations:Number(e.target.value)}:x))} onBlur={e=>void change(r.id,{max_open_conversations:Number(e.target.value)})} style={{width:90}}/></td>
          <td><span className={r.active?'badge':'badge badge-off'}>{r.active?availabilityLabel[r.availability_state]:'Inativo'}</span></td>
        </tr>):<tr><td colSpan={6} className="empty">Nenhum usuário disponível.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
