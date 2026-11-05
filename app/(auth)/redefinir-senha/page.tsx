'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage(){
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [done,setDone]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const password=String(fields.get('password')??'');
    if(password!==fields.get('confirmation')){
      setError('As senhas precisam ser iguais.');
      return;
    }

    setPending(true);
    setError('');
    try{
      const auth=createClient().auth;
      const {data:{user}}=await auth.getUser();
      if(!user){
        setError('O link expirou ou já foi utilizado. Solicite outro link.');
        return;
      }
      const {data:aal,error:aalError}=await auth.mfa.getAuthenticatorAssuranceLevel();
      if(aalError||!aal){
        setError('Não foi possível verificar a sessão. Tente novamente.');
        return;
      }
      if(aal.nextLevel==='aal2'&&aal.currentLevel!=='aal2'){
        setError('Conclua a verificação em duas etapas antes de alterar a senha.');
        return;
      }
      const {error:updateError}=await auth.updateUser({password});
      if(updateError){
        setError('Não foi possível salvar a senha. Use uma senha forte e tente novamente.');
        return;
      }
      setDone(true);
      const {error:signOutError}=await auth.signOut({scope:'global'});
      if(signOutError)setError('Senha alterada. Não foi possível encerrar todas as sessões.');
    }catch{
      setError('Não foi possível concluir a operação. Tente novamente.');
    }finally{
      setPending(false);
    }
  }

  return <div className="setup-page"><section className="setup-card card">
    <h1>Redefinir senha</h1>
    {error&&<p role="alert" className="error">{error}</p>}
    {done?<p role="status">Senha alterada.</p>:<form onSubmit={submit}>
      <div className="field"><label htmlFor="new-password">Nova senha</label><input className="input" id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required/></div>
      <div className="field"><label htmlFor="confirm-password">Confirmar senha</label><input className="input" id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={8} required/></div>
      <button className="btn btn-primary" disabled={pending}>{pending?'Salvando…':'Salvar nova senha'}</button>
    </form>}
    <p><Link href={done?'/login':'/recuperar-senha'}>{done?'Voltar para o login':'Solicitar outro link'}</Link></p>
  </section></div>;
}
