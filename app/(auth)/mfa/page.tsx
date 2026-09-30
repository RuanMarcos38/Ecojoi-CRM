'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Factor={id:string;friendly_name?:string|null;status?:string};

export default function MfaChallengePage(){
  const [factor,setFactor]=useState<Factor|null>(null);
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const router=useRouter();

  useEffect(()=>{
    const supabase=createClient();
    (async()=>{
      const [{data:factors},{data:aal}]=await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      if(aal?.currentLevel==='aal2'){router.replace('/app');return;}
      const verified=(factors?.totp??[]).find(f=>f.status==='verified');
      if(!verified){router.replace('/app');return;}
      setFactor(verified as Factor);setLoading(false);
    })().catch(()=>{setError('Não foi possível carregar o segundo fator.');setLoading(false);});
  },[router]);

  async function verify(e:FormEvent){
    e.preventDefault();
    if(!factor)return;
    setLoading(true);setError('');
    const supabase=createClient();
    const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
    if(challengeError||!challenge?.id){setError(challengeError?.message??'Falha ao gerar desafio.');setLoading(false);return;}
    const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:code.trim()});
    if(verifyError){setError('Código inválido ou expirado.');setLoading(false);return;}
    router.replace('/app');router.refresh();
  }

  return <div className="login-page">
    <section className="login-art"><div className="login-copy"><small>SEGURANÇA DA CONTA</small><div className="big">ecojoi<br/>CRM</div><p>Confirme o segundo fator para acessar os dados da empresa.</p></div></section>
    <section className="login-panel"><div className="login-box">
      <div style={{display:'flex',alignItems:'center',gap:9}}><ShieldCheck size={28}/><h1 style={{margin:0}}>Verificação em duas etapas</h1></div>
      <p className="muted">Digite o código gerado pelo seu aplicativo autenticador.</p>
      <form onSubmit={verify}>
        {error&&<div className="error">{error}</div>}
        <div className="field"><label>Código</label><input className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" required minLength={6} maxLength={6}/></div>
        <button className="btn btn-primary" disabled={loading||code.length!==6}>{loading?'Verificando...':'Confirmar e entrar'}</button>
      </form>
    </div></section>
  </div>;
}
