'use client';

import { useEffect, useRef, useState } from 'react';

// Conversation refreshes supply new signed URLs even when the file is unchanged.
const REFRESH_AFTER_MS = 45 * 60 * 1000;

export default function MessageAudio({ url }: { url?: string | null }) {
  const player = useRef<HTMLAudioElement>(null);
  const [source, setSource] = useState(url ?? null);
  const loadedAt = useRef(Date.now());

  function replaceSource(next: string) {
    loadedAt.current = Date.now();
    setSource(next);
  }

  useEffect(() => {
    if (!url || url === source) return;
    const audio = player.current;
    if (!source || (Date.now() - loadedAt.current >= REFRESH_AFTER_MS &&
      audio?.paused && (audio.currentTime === 0 || audio.ended))) {
      replaceSource(url);
    }
  }, [url, source]);

  if (!source) return <small>Áudio indisponível</small>;

  return <audio ref={player} controls preload="metadata" src={source} onError={() => {
    if (url && url !== source) replaceSource(url);
  }} />;
}
