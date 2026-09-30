'use client';

import { useState } from 'react';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function SessionSecurityPanel(){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function revokeOthers(){
    if(!confirm('Encerrar todas as outras sessões da sua conta?'))return;
    setBusy(true);setError('');setNotice('');
    const supabase=createClient();
    const {error}=await supabase.auth.signOut({scope:'others'});
    setBusy(false);
    if(error){setError(error.message);return;}
    setNotice('As outras sessões foram revogadas. Este dispositivo permanece conectado.');
  }

  return <section className="card section">
    <div className="automation-top">
      <div><h3 style={{marginBottom:4}}>Sessões da conta</h3><p className="muted" style={{margin:0}}>Revogue acessos de outros navegadores ou dispositivos sem sair deste.</p></div>
      <MonitorSmartphone size={21}/>
    </div>
    {error&&<div className="error" style={{marginTop:10}}>{error}</div>}
    {notice&&<div className="success" style={{marginTop:10}}>{notice}</div>}
    <button className="btn btn-secondary" type="button" style={{marginTop:12}} disabled={busy} onClick={()=>void revokeOthers()}><LogOut size={14}/>{busy?'Revogando...':'Encerrar outras sessões'}</button>
  </section>;
}
