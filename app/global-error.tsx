'use client';

import { useEffect, useState } from 'react';

export default function GlobalError({
  error,
  reset
}:{
  error:Error & {digest?:string};
  reset:()=>void;
}){
  const [recovering,setRecovering]=useState(false);
  useEffect(()=>{
    console.error('[CRM] Falha de renderização', {
      message:error.message,
      digest:error.digest,
      stack:error.stack
    });
  },[error]);

  async function recover(){
    setRecovering(true);
    try{
      // Remove only the application's static caches. Do not touch authentication,
      // local storage, session cookies, or customer data.
      if('caches' in window){
        const names=await window.caches.keys();
        await Promise.all(names.filter(name=>name.startsWith('ecojoi-static-')||name.startsWith('crm-static-')).map(name=>window.caches.delete(name)));
      }
      if('serviceWorker' in navigator){
        const registration=await navigator.serviceWorker.getRegistration('/');
        await registration?.update().catch(()=>undefined);
      }
    }catch(e){
      console.warn('[CRM] Não foi possível atualizar os recursos locais',e);
    }finally{
      window.location.replace('/login?reload='+Date.now());
    }
  }

  return <html lang="pt-BR">
    <body style={{margin:0,fontFamily:'Arial,Helvetica,sans-serif',background:'#f3f5f7',color:'#182c3c'}}>
      <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24}}>
        <section role="alert" style={{width:'min(540px,100%)',background:'#fff',border:'1px solid #dce4eb',borderRadius:12,padding:26,boxSizing:'border-box'}}>
          <div aria-hidden="true" style={{width:40,height:40,borderRadius:9,display:'grid',placeItems:'center',background:'#e6f0f2',color:'#175d68',fontWeight:700}}>!</div>
          <h1 style={{fontSize:21,margin:'16px 0 8px'}}>Não foi possível carregar o CRM</h1>
          <p style={{fontSize:14,lineHeight:1.55,color:'#5c6d7c',margin:'0 0 16px'}}>
            Ocorreu uma falha na apresentação da página. Tente recuperar os arquivos da aplicação sem alterar seus dados.
          </p>
          {error.digest&&<p style={{fontSize:12,color:'#566d7d'}}>Referência do erro: {error.digest}</p>}
          <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
            <button type="button" onClick={()=>reset()} style={{border:0,borderRadius:7,padding:'10px 14px',background:'#176c60',color:'#fff',cursor:'pointer'}}>Tentar novamente</button>
            <button type="button" disabled={recovering} onClick={()=>void recover()} style={{border:'1px solid #cbd7e0',borderRadius:7,padding:'10px 14px',background:'#fff',color:'#182c3c',cursor:'pointer'}}>{recovering?'Atualizando...':'Atualizar aplicação'}</button>
          </div>
          <p style={{margin:'16px 0 0',fontSize:11,color:'#687987'}}>Se o erro persistir, informe a referência acima ao suporte. Detalhes técnicos estão no console do navegador.</p>
        </section>
      </main>
    </body>
  </html>;
}
