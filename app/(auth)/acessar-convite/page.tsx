'use client';
import {useEffect,useState} from 'react';
export default function AccessLink(){
 const [destination,setDestination]=useState('');
 useEffect(()=>{const p=new URLSearchParams(window.location.search);const token=p.get('token_hash');const type=p.get('type');if(token&&['invite','recovery'].includes(type??'')){const target=new URL('/auth/confirm',window.location.origin);target.searchParams.set('token_hash',token);target.searchParams.set('type',type!);target.searchParams.set('next','/redefinir-senha?convite=1');setDestination(target.pathname+target.search);}},[]);
 return <main className="setup-page"><section className="setup-card card"><h1>Acesso ao CRM Ecojoi</h1><p>Continue para escolher sua senha e acessar a empresa à qual você já está vinculada.</p>{destination?<button className="btn btn-primary" onClick={()=>window.location.assign(destination)}>Continuar para definir senha</button>:<p>Link incompleto. Solicite um novo link ao administrador.</p>}<p>Este link é pessoal e de uso único.</p></section></main>;
}
