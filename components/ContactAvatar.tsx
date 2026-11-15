'use client';
import { useEffect, useState } from 'react';
export function ContactAvatar({id,name,className,enabled=true,priority=false}:{id?:string;name:string;className?:string;enabled?:boolean;priority?:boolean}){
  const [revision,setRevision]=useState(0),[failed,setFailed]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setRevision(v=>v+1),300000);return()=>clearInterval(timer);},[]);
  const src=enabled&&id?`/api/contacts/${encodeURIComponent(id)}/avatar?v=${revision}`:'';
  const initials=name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase()||'?';
  return <span className={className} title={name} aria-label={`Foto de ${name}`}>
    {src&&src!==failed?<img src={src} alt={`Foto de ${name}`} loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:initials}
  </span>;
}
