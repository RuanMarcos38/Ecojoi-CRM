'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Factor={id:string;friendly_name?:string|null;status?:string;factor_type?:string};
type Enrollment={factorId:string;qrCode:string;secret:string};

export function MfaPanel(){
  const [factors,setFactors]=useState<Factor[]>([]);
  const [aal,setAal]=useState<string>('aal1');
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){
    const supabase=createClient();
    const [{data:factorsData},{data:aalData}]=await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);
    setFactors((factorsData?.totp??[]) as Factor[]);
    setAal(aalData?.currentLevel??'aal1');
  }

  useEffect(()=>{void load();},[]);

  async function enroll(){
    setBusy(true);setError('');setNotice('');
    const supabase=createClient();
    const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Ecojoi CRM'});
    setBusy(false);
    if(error||!data?.id||!data.totp){
      setError(error?.message??'Não foi possível iniciar o MFA.');
      return;
    }
    setEnrollment({factorId:data.id,qrCode:data.totp.qr_code,secret:data.totp.secret});
  }

  async function verify(e:FormEvent){
    e.preventDefault();
    if(!enrollment)return;
    setBusy(true);setError('');setNotice('');
    const supabase=createClient();
    const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:enrollment.factorId});
    if(challengeError||!challenge?.id){
      setBusy(false);setError(challengeError?.message??'Não foi possível gerar o desafio.');return;
    }
    const {error:verifyError}=await supabase.auth.mfa.verify({
      factorId:enrollment.factorId,
      challengeId:challenge.id,
      code:code.trim()
    });
    setBusy(false);
    if(verifyError){setError(verifyError.message);return;}
    setEnrollment(null);setCode('');setNotice('Autenticação em dois fatores ativada.');await load();
  }

  async function remove(factorId:string){
    if(!confirm('Remover este segundo fator?'))return;
    setBusy(true);setError('');setNotice('');
    const supabase=createClient();
    const {error}=await supabase.auth.mfa.unenroll({factorId});
    setBusy(false);
    if(error){setError(error.message);return;}
    setNotice('Segundo fator removido.');await load();
  }

  const verified=factors.filter(f=>f.status==='verified');

  return <section className="card section">
    <div className="automation-top">
      <div><h3 style={{marginBottom:4}}>Autenticação em dois fatores</h3><p className="muted" style={{margin:0}}>Proteja o acesso com código TOTP de um aplicativo autenticador.</p></div>
      <ShieldCheck size={21}/>
    </div>

    {error&&<div className="error" style={{marginTop:10}}>{error}</div>}
    {notice&&<div className="success" style={{marginTop:10}}>{notice}</div>}

    <div className="report-grid" style={{marginTop:12}}>
      <div><span>Status</span><strong style={{fontSize:16}}>{verified.length?'Ativado':'Opcional'}</strong></div>
      <div><span>Sessão atual</span><strong style={{fontSize:16}}>{aal==='aal2'?'Verificada':'Senha'}</strong></div>
    </div>

    {verified.length>0&&<div style={{display:'grid',gap:7,marginTop:12}}>
      {verified.map(f=><div className="setting-row" key={f.id}>
        <span><strong>{f.friendly_name||'Aplicativo autenticador'}</strong><small className="muted" style={{display:'block'}}>TOTP · verificado</small></span>
        <button className="btn btn-danger" type="button" disabled={busy||aal!=='aal2'} onClick={()=>void remove(f.id)}><Trash2 size={14}/>Remover</button>
      </div>)}
    </div>}

    {!enrollment&&<button className="btn btn-primary" type="button" style={{marginTop:12}} disabled={busy} onClick={()=>void enroll()}><KeyRound size={14}/>{verified.length?'Adicionar outro autenticador':'Ativar 2FA'}</button>}

    {enrollment&&<div style={{display:'grid',gap:12,marginTop:14,padding:14,border:'1px solid #dfe5e1',borderRadius:6}}>
      <strong>Escaneie o QR Code no autenticador</strong>
      <img src={enrollment.qrCode} alt="QR Code MFA" style={{width:190,height:190,maxWidth:'100%',background:'#fff'}}/>
      <div><small className="muted">Se não conseguir escanear, use a chave:</small><code style={{display:'block',marginTop:4,overflowWrap:'anywhere'}}>{enrollment.secret}</code></div>
      <form onSubmit={verify} style={{display:'flex',gap:8,alignItems:'end'}}>
        <div className="field" style={{flex:1}}><label>Código de 6 dígitos</label><input className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} required minLength={6} maxLength={6}/></div>
        <button className="btn btn-primary" disabled={busy||code.length!==6}><CheckCircle2 size={14}/>Confirmar</button>
      </form>
    </div>}
  </section>;
}
