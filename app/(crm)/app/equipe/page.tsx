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
  email?:string;confirmed?:boolean;deleted_at?:string|null;
};

const availabilityLabel={online:'Online',busy:'Ocupado',break:'Pausa',offline:'Offline'};

export default function Equipe(){
  const [rows,setRows]=useState<Member[]>([]);
  const [viewer,setViewer]=useState({id:'',role:''});
  const [showDeleted,setShowDeleted]=useState(false);
  const [busyId,setBusyId]=useState('');
  const master=viewer.role==='company_admin'||viewer.role==='super_admin';
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [inviteUrl,setInviteUrl]=useState('');
  const [inviting,setInviting]=useState(false);

  async function load(){
    const r=await fetch('/api/team',{cache:'no-store'});
    const d=await r.json();
    if(r.ok){setRows(d.data??[]);setViewer(d.viewer??{id:'',role:''});}
  }
  useEffect(()=>{void load();},[]);

  const errorMessage=(code:string)=>({forbidden:'Seu perfil não permite esta ação.',cannot_change_self_access:'Você não pode remover ou inativar o próprio acesso.',user_deleted:'Este acesso foi excluído. Restaure o cadastro antes de continuar.',inactive_user:'Reative o usuário antes de enviar um link.',not_found:'Usuário não encontrado nesta empresa.'}[code]||'Não foi possível concluir a ação. Tente novamente.');
  async function change(id:string,patch:Record<string,unknown>){
    setError('');setNotice('');setBusyId(id);
    try{const r=await fetch(`/api/team/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});const d=await r.json();
    if(!r.ok)setError(errorMessage(d.error));else{setNotice('Cadastro atualizado. Atendimentos abertos de usuários inativados retornam à fila de espera.');await load();}}
    catch{setError('Falha de conexão. Tente novamente.');}finally{setBusyId('');}
  }
  async function remove(member:Member){
    if(!confirm(`Excluir o acesso de ${member.full_name}? O histórico será preservado e o cadastro poderá ser restaurado pelo administrador master.`))return;
    setBusyId(member.id);setError('');setNotice('');
    try{const r=await fetch(`/api/team/${member.id}`,{method:'DELETE'});const d=await r.json();if(!r.ok)setError(errorMessage(d.error));else{setNotice('Acesso excluído. Histórico preservado.');await load();}}
    catch{setError('Falha de conexão. Tente novamente.');}finally{setBusyId('');}
  }
  async function accessLink(member:Member,delivery:'email'|'link'){
    setError('');setNotice('');setInviteUrl('');setBusyId(member.id);
    try{const r=await fetch(`/api/team/${member.id}/access-link`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({delivery})});const d=await r.json();
    if(!r.ok){setError(errorMessage(d.error));return;}
    setInviteUrl(d.data.invite_url??'');setNotice(d.data.delivery==='email'?`Link encaminhado pelo servidor de e-mail para ${d.data.email}. Confira a caixa de entrada e o spam.`:`Link gerado para ${d.data.email}. O e-mail não foi enviado; compartilhe o link somente com esta pessoa.`);
    }catch{setError('Não foi possível gerar o link. Tente novamente.');}finally{setBusyId('');}
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
      <div><h1 className="page-title">Equipe e Permissões</h1><p className="page-sub">Sem limite de usuários no CRM. Administrador master gerencia acessos; gestor pode inativar usuários.</p></div>
      <button className="btn btn-primary" disabled={!master} onClick={()=>setOpen(v=>!v)}>{open?<X size={17}/>:<Plus size={17}/>} {open?'Fechar':'Convidar usuário'}</button>
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

    {master&&<label style={{display:'flex',gap:8,margin:'16px 0'}}><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/>Mostrar acessos excluídos</label>}
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>Usuário</th><th>Perfil</th><th>Disponibilidade</th><th>Atendimentos</th><th>Capacidade</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{rows.filter(r=>showDeleted||!r.deleted_at).length?rows.filter(r=>showDeleted||!r.deleted_at).map(r=><tr key={r.id}>
          <td><strong>{r.full_name}</strong>{r.email&&<small style={{display:'block'}}>{r.email}</small>}{r.confirmed===false&&<small className="muted">Primeiro acesso pendente</small>}<small className="muted" style={{display:'block'}}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</small></td>
          <td><select className="select" value={r.role} onChange={e=>void change(r.id,{role:e.target.value})} disabled={!master||r.id===viewer.id||!!r.deleted_at||busyId===r.id||(r.role==='super_admin'&&viewer.role!=='super_admin')}><option value="company_admin">Administrador master</option><option value="manager">Gestor</option><option value="user">Usuário</option>{r.role==='super_admin'&&<option value="super_admin">Super Admin</option>}</select></td>
          <td><select disabled={!master||!!r.deleted_at||busyId===r.id} className="select" value={r.availability_state??'online'} onChange={e=>void change(r.id,{availability_state:e.target.value})}><option value="online">Online</option><option value="busy">Ocupado</option><option value="break">Pausa</option><option value="offline">Offline</option></select></td>
          <td><strong>{r.open_conversations??0}</strong><small className="muted" style={{display:'block'}}>abertos</small></td>
          <td><input disabled={!master||!!r.deleted_at||busyId===r.id} className="input" type="number" min={1} max={500} value={r.max_open_conversations??30} onChange={e=>setRows(rows=>rows.map(x=>x.id===r.id?{...x,max_open_conversations:Number(e.target.value)}:x))} onBlur={e=>void change(r.id,{max_open_conversations:Number(e.target.value)})} style={{width:90}}/></td>
          <td><span className={r.active?'badge':'badge badge-off'}>{r.deleted_at?'Excluído':r.active?availabilityLabel[r.availability_state]:'Inativo'}</span></td>
          <td><div style={{display:'flex',gap:8,flexWrap:'wrap',minWidth:200}}>
            {master&&!r.deleted_at&&r.active&&<><button className="btn btn-secondary" disabled={!!busyId} onClick={()=>void accessLink(r,'email')}>Enviar link de acesso</button><button className="btn btn-secondary" disabled={!!busyId} onClick={()=>void accessLink(r,'link')}>Copiar novo link</button></>}
            {r.id!==viewer.id&&!r.deleted_at&&(master||(viewer.role==='manager'&&r.role==='user'&&r.active))&&<button className="btn btn-secondary" disabled={!!busyId} onClick={()=>void change(r.id,{active:!r.active})}>{r.active?'Inativar':'Ativar'}</button>}
            {master&&r.id!==viewer.id&&!r.deleted_at&&<button className="btn btn-danger" disabled={!!busyId} onClick={()=>void remove(r)}>Excluir acesso</button>}
            {master&&r.deleted_at&&<button className="btn btn-secondary" disabled={!!busyId} onClick={()=>void change(r.id,{restore:true})}>Restaurar cadastro</button>}
            {busyId===r.id&&<span role="status">Processando...</span>}
          </div></td>
        </tr>):<tr><td colSpan={7} className="empty">Nenhum usuário disponível.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
