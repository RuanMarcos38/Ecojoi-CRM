'use client';

import { FormEvent,useEffect,useState } from 'react';
import { CheckCircle2,KeyRound,ShieldCheck,Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Factor={id:string;friendly_name?:string;status?:string;factor_type?:string};
type Enrollment={id:string;qr_code?:string;secret?:string};

export default function Seguranca(){
  const [factors,setFactors]=useState<Factor[]>([]);
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
  const [aal,setAal]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function load(){
    const supabase=createClient();
    const mfa:any=(supabase.auth as any).mfa;
    if(!mfa)return;
    const [listed,assurance]=await Promise.all([mfa.listFactors(),mfa.getAuthenticatorAssuranceLevel()]);
    const all=[...(listed?.data?.totp??[]),...(listed?.data?.phone??[])];
    setFactors(all);
    setAal(assurance?.data?.currentLevel??'aal1');
  }
  useEffect(()=>{void load();},[]);

  async function enroll(){
    setError('');setNotice('');
    const supabase=createClient();const mfa:any=(supabase.auth as any).mfa;
    const result=await mfa.enroll({factorType:'totp',friendlyName:'Ecojoi CRM'});
    if(result?.error){setError(result.error.message||'Não foi possível iniciar o 2FA.');return;}
    setEnrollment({id:result.data.id,qr_code:result.data.totp?.qr_code,secret:result.data.totp?.secret});
  }

  async function verify(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!enrollment)return;setError('');setNotice('');
    const code=String(new FormData(event.currentTarget).get('code')||'').trim();
    const supabase=createClient();const mfa:any=(supabase.auth as any).mfa;
    const result=await mfa.challengeAndVerify({factorId:enrollment.id,code});
    if(result?.error){setError(result.error.message||'Código inválido.');return;}
    setEnrollment(null);setNotice('Autenticação em dois fatores ativada.');await load();
  }

  async function remove(id:string){
    if(!confirm('Remover este fator de autenticação?'))return;
    const supabase=createClient();const mfa:any=(supabase.auth as any).mfa;
    const result=await mfa.unenroll({factorId:id});
    if(result?.error)setError(result.error.message||'Não foi possível remover o fator.');
    else{setNotice('Fator removido.');await load();}
  }

  return <div className="content">
    <div className="page-head"><div><h1 className="page-title">Segurança da conta</h1><p className="page-sub">Proteção de acesso e autenticação em dois fatores.</p></div></div>
    {error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}
    <div className="settings-grid">
      <section className="card section">
        <div className="automation-top"><div><h3>Autenticação em dois fatores</h3><p className="muted">Use um aplicativo autenticador compatível com TOTP.</p></div><ShieldCheck size={22}/></div>
        <div className="setting-row"><span>Nível atual da sessão</span><span className="badge">{aal.toUpperCase()}</span></div>
        {factors.length?factors.map(f=><div className="setting-row" key={f.id}><span><strong>{f.friendly_name||'Autenticador'}</strong><small className="muted" style={{display:'block'}}>{f.status||'verificado'} · {f.factor_type||'totp'}</small></span><button className="btn btn-danger" onClick={()=>void remove(f.id)}><Trash2 size={14}/>Remover</button></div>):<p className="muted">Nenhum segundo fator configurado.</p>}
        {!enrollment&&<button className="btn btn-primary" onClick={()=>void enroll()}><KeyRound size={15}/>Ativar 2FA</button>}
      </section>

      {enrollment&&<section className="card section">
        <h3>Confirmar autenticador</h3>
        <p className="muted">Escaneie o QR Code e informe o código de seis dígitos.</p>
        {enrollment.qr_code&&<div style={{background:'#fff',padding:12,width:'fit-content'}} dangerouslySetInnerHTML={{__html:enrollment.qr_code}}/>}
        {enrollment.secret&&<div className="setting-row"><span>Chave manual</span><code>{enrollment.secret}</code></div>}
        <form onSubmit={verify} style={{display:'grid',gap:9,marginTop:12}}>
          <div className="field"><label>Código</label><input className="input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required/></div>
          <button className="btn btn-primary"><CheckCircle2 size={14}/>Verificar e ativar</button>
        </form>
      </section>}
    </div>
  </div>;
}
