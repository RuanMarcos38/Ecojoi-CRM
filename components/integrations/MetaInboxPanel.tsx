'use client';
import{useCallback,useEffect,useState}from'react';
type Event={id:string|number;event_type:string;processing_status:string;attempts:number;max_attempts:number;last_error:string|null;received_at:string};
export default function MetaInboxPanel(){
 const[events,setEvents]=useState<Event[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/integrations/meta/events',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error();setEvents(d.data??[]);}catch{setError('Não foi possível carregar as entradas Meta.');}},[]);
 useEffect(()=>{void load();},[load]);
 async function retry(event:Event){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/integrations/meta/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:String(event.id)})});if(!r.ok)throw Error();setNotice('Evento recolocado na fila. O processamento usará a mesma identidade, sem criar uma mensagem repetida.');await load();}catch{setError('Não foi possível reprocessar. Confira sua permissão e o estado do evento.');}finally{setBusy(false);}
 }
 return <section className="card section"><h3>Entradas Meta</h3><p className="muted">Mensagens e leads são gravados antes do processamento. Corrija a causa de falha antes de reprocessar um evento.</p>
 {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <button className="btn btn-secondary" disabled={busy} onClick={()=>void load()}>Atualizar entradas</button>
 <div className="table-wrap"><table className="table"><thead><tr><th>Recebido</th><th>Evento</th><th>Estado</th><th>Tentativas</th><th>Motivo</th><th>Ação</th></tr></thead><tbody>
 {events.length?events.map(event=><tr key={event.id}><td>{new Date(event.received_at).toLocaleString('pt-BR')}</td><td>{event.event_type}</td><td>{event.processing_status}</td><td>{event.attempts}/{event.max_attempts}</td><td>{event.last_error==='identity_manual_review_required'?'Identidade compartilhada ou incompleta: revise os contatos antes de tentar novamente.':event.last_error??'—'}</td><td>{['failed','dead_letter'].includes(event.processing_status)&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void retry(event)}>Reprocessar entrada</button>}</td></tr>):<tr><td colSpan={6}>Nenhum evento recebido.</td></tr>}
 </tbody></table></div></section>;
}

