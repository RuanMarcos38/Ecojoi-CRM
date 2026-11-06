'use client';

import { useState } from 'react';

export function AgentAvatar({ name, userId, version }: { name: string; userId?: string; version?: number }) {
  const [failedSource, setFailedSource] = useState('');
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const source = userId ? `/api/me/avatar?userId=${encodeURIComponent(userId)}${version ? `&v=${version}` : ''}` : '';
  return <span className="agent-avatar" aria-hidden="true">
    {source && source !== failedSource
      ? <img src={source} alt="" loading="lazy" onError={() => setFailedSource(source)}/>
      : initials}
  </span>;
}
