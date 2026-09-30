'use client';
import { useEffect } from 'react';

export function PwaRegister(){
  useEffect(()=>{
    if(!('serviceWorker' in navigator))return;

    let cancelled=false;
    async function register(){
      try{
        const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
        if(cancelled)return;
        await registration.update().catch(()=>undefined);
      }catch(error){
        console.warn('[Ecojoi CRM] Service worker indisponível.',error);
      }
    }

    if(document.readyState==='complete')void register();
    else window.addEventListener('load',register,{once:true});

    return()=>{
      cancelled=true;
      window.removeEventListener('load',register);
    };
  },[]);
  return null;
}
