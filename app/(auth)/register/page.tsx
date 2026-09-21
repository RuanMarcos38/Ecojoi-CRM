'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage(){
  const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const router=useRouter();
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setLoading(true); setError(''); setNotice('');
    const fd=new FormData(e.currentTarget); const fullName=String(fd.get('full_name')??'').trim(); const email=String(fd.get('email')??'').trim(); const password=String(fd.get('password')??'');
    try{
      const supabase=createClient();
      const emailRedirectTo=`${window.location.origin}/auth/confirm?next=/setup`;
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo}});
      if(error) throw error;
      if(data.session){router.push('/setup');router.refresh();return;}
      setNotice('Conta criada. Confirme o e-mail e depois entre para concluir a configuração da empresa.');
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível criar a conta.')}finally{setLoading(false)}
  }
  return <div className="login-page"><section className="login-art"><div className="login-copy"><small>CRM MULTIEMPRESA COM SEGURANÇA POR PADRÃO</small><div className="big">ecojoi<br/>CRM</div><p>Crie sua conta administrativa e depois configure sua empresa com isolamento completo de dados.</p></div></section><section className="login-panel"><div className="login-box"><div className="brand" style={{color:'#054735',padding:0}}><div className="brand-mark" style={{borderColor:'#054735'}}></div><div className="brand-name">ecojoi</div></div><h1>Criar conta</h1><p className="muted">O primeiro usuário será configurado como administrador da empresa.</p><form onSubmit={submit}>{error&&<div className="error">{error}</div>}{notice&&<div className="success">{notice}</div>}<div className="field"><label>Nome completo</label><input className="input" name="full_name" required minLength={2}/></div><div className="field"><label>E-mail</label><input className="input" type="email" name="email" required/></div><div className="field"><label>Senha</label><input className="input" type="password" name="password" required minLength={8}/></div><button className="btn btn-primary" disabled={loading}>{loading?'Criando...':'Criar conta'}</button></form><p className="muted auth-link">Já possui conta? <Link href="/login">Entrar</Link></p></div></section></div>
}
