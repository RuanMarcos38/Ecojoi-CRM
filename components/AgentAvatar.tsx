'use client';

import { useEffect, useState } from 'react';

export function AgentAvatar({ name, userId, version }: { name: string; userId?: string; version?: number }) {
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{const update=()=>setRefresh(Date.now());const timer=setInterval(update,60000);window.addEventListener('ecojoi:avatar-updated',update);return()=>{clearInterval(timer);window.removeEventListener('ecojoi:avatar-updated',update);};},[]);
  const [failedSource, setFailedSource] = useState('');
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const source = userId ? `/api/me/avatar?userId=${encodeURIComponent(userId)}${version||refresh ? `&v=${version||refresh}` : ''}` : '';
  return <span className="agent-avatar" aria-hidden="true">
    {source && source !== failedSource
      ? <img src={source} alt="" loading="lazy" onError={() => setFailedSource(source)}/>
      : initials}
  </span>;
}
