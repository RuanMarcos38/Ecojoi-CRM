'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function LoginPage(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const router=useRouter();

  async function submit(e:FormEvent){
    e.preventDefault();setError('');setLoading(true);
    try{
      const supabase=createClient();
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error)throw error;

      const [{data:factors},{data:aal}]=await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      const hasVerified=(factors?.totp??[]).some(f=>f.status==='verified')||(factors?.phone??[]).some(f=>f.status==='verified');
      router.push(hasVerified&&aal?.currentLevel!=='aal2'?'/mfa':'/app');
      router.refresh();
    }catch(err){
      setError(err instanceof Error && 'code' in err && err.code==='invalid_credentials'
        ? 'E-mail ou senha inválidos.'
        : 'Não foi possível entrar. Verifique seus dados e tente novamente.');
    }finally{setLoading(false);}
  }

  return <main className={styles.page}>
    <section className={styles.hero} aria-label="Ecojoi CRM">
      <span className={styles.wordmark}>Eco<span>joi</span><sup>®</sup></span>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>GESTÃO DE RELACIONAMENTO</p>
        <p className={styles.headline}>Conecte atendimento <span>e vendas.</span></p>
        <p>Centralize seus contatos, acompanhe oportunidades e organize sua operação comercial em um só lugar.</p>
      </div>
    </section>

    <section className={styles.panel} aria-labelledby="login-title">
      <div className={styles.box}>
        <p className={styles.eyebrow}>ECOJOI CRM</p>
        <h1 id="login-title">Acesse sua conta</h1>
        <p className={styles.description}>Entre com suas credenciais para acessar o Ecojoi CRM.</p>
        <form onSubmit={submit} aria-busy={loading}>
          {error&&<div className={styles.error} role="alert">{error}</div>}
          <div className={styles.field}>
            <label htmlFor="crm-login-email">E-mail</label>
            <input id="crm-login-email" name="email" autoComplete="username" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/>
          </div>
          <div className={styles.field}>
            <label htmlFor="crm-login-password">Senha</label>
            <div className={styles.password}>
              <input id="crm-login-password" name="password" autoComplete="current-password" type={showPassword?'text':'password'} required value={password} onChange={e=>setPassword(e.target.value)}/>
              <button type="button" aria-label={showPassword?'Ocultar senha':'Mostrar senha'} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Ocultar':'Mostrar'}</button>
            </div>
          </div>
          <button className={styles.submit} disabled={loading}>{loading?'Entrando...':'Entrar no CRM'}</button>
        </form>
        <p className={styles.link}><Link href="/recuperar-senha">Esqueci minha senha</Link></p>
        <p className={styles.link}>Primeiro acesso? Use o convite enviado pelo administrador. <Link href="/recuperar-senha">Definir senha</Link></p>
      </div>
    </section>
  </main>;
}
