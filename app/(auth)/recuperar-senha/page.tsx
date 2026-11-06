'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { createClient, getPublicAppUrl } from '@/lib/supabase/client';

export default function RecoverPasswordPage(){
  const [pending,setPending]=useState(false);
  const [submitted,setSubmitted]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const email=String(new FormData(event.currentTarget).get('email')??'').trim();
    setPending(true);
    try{
      const redirectTo=new URL('/auth/confirm',getPublicAppUrl());
      redirectTo.searchParams.set('next','/redefinir-senha');
      await createClient().auth.resetPasswordForEmail(email,{redirectTo:redirectTo.href});
    }catch{
      // Keep the response uniform to avoid exposing account existence.
    }finally{
      setPending(false);
      setSubmitted(true);
    }
  }

  return <div className="setup-page"><section className="setup-card card">
    <h1>Recuperar senha</h1>
    {submitted
      ? <p role="status">Se o e-mail estiver cadastrado, você receberá um link temporário para redefinir sua senha.</p>
      : <form onSubmit={submit}>
          <div className="field"><label htmlFor="recovery-email">E-mail</label><input className="input" id="recovery-email" name="email" type="email" autoComplete="email" required/></div>
          <button className="btn btn-primary" disabled={pending}>{pending?'Enviando…':'Enviar link'}</button>
        </form>}
    <p><Link href="/login">Voltar para o login</Link></p>
  </section></div>;
}
