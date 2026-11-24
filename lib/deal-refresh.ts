const key = 'ecojoi:deals-changed';

export function notifyDealsChanged() {
  window.dispatchEvent(new Event(key));
  try { localStorage.setItem(key, crypto.randomUUID()); } catch {}
}

export function onDealsChanged(refresh: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) refresh();
  };
  window.addEventListener(key, refresh);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(key, refresh);
    window.removeEventListener('storage', onStorage);
  };
}
