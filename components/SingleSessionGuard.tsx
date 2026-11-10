'use client';

import {useEffect} from 'react';

// Mantem a tela sincronizada com a decisao do backend.
// O bloqueio real ocorre no middleware, nas APIs e nas politicas de dados.
export function SingleSessionGuard(){
  useEffect(()=>{
    let disposed=false;
    let checking=false;

    async function check(){
      if(disposed||checking)return;
      checking=true;
      try{
        const response=await fetch('/api/session/check',{cache:'no-store',credentials:'same-origin'});
        if(!disposed&&response.status===401){
          window.location.replace('/login?session=expired');
        }
      }catch{
        // Falhas transitorias de rede nao revogam uma sessao legitima.
      }finally{checking=false;}
    }

    function onVisibility(){
      if(document.visibilityState==='visible')void check();
    }
    void check();
    window.addEventListener('focus',onVisibility);
    document.addEventListener('visibilitychange',onVisibility);
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void check();},12000);
    return ()=>{
      disposed=true;
      window.clearInterval(timer);
      window.removeEventListener('focus',onVisibility);
      document.removeEventListener('visibilitychange',onVisibility);
    };
  },[]);
  return null;
}
