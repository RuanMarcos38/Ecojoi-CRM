'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
type Hook={id:string;name:string;endpoint_url:string;events:string[];active:boolean;last_status?:number|null};
type Delivery={id:string;event_type:string;status:string;attempts:number;max_attempts:number;response_status:number|null;duration_ms:number|null;error:string|null;created_at:string};
const events=['lead.created','contact.updated','conversation.received','message.sent','deal.created','deal.won','task.created','proposal.created','booking.created'];
export default function WebhookPanel(){
 const [hooks,setHooks]=useState<Hook[]>([]),[selected,setSelected]=useState<Hook|null>(null),[editing,setEditing]=useState<Hook|null>(null);
 const [deliveries,setDeliveries]=useState<Delivery[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  try{const response=await fetch('/api/integrations/webhooks',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error();setHooks(data.data??[]);}catch{setError('Não foi possível carregar os webhooks ou seu perfil não tem acesso.');}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function history(hook:Hook){
  setSelected(hook);setDeliveries([]);setError('');
  try{const r=await fetch('/api/integrations/webhooks/'+hook.id+'/deliveries',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error();setDeliveries(d.data??[]);}catch{setError('Histórico indisponível. Confira a configuração do banco e sua permissão.');}
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const form=event.currentTarget,fd=new FormData(form);
  setBusy(true);setError('');setNotice('');
  try{
   const input={name:String(fd.get('name')),endpoint_url:String(fd.get('endpoint_url')),events:fd.getAll('events')};
   const r=await fetch('/api/integrations/webhooks'+(editing?'/'+editing.id:''),{method:editing?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
   const d=await r.json();if(!r.ok)throw new Error();
   form.reset();setEditing(null);setNotice(editing?'Webhook atualizado.':'Webhook criado. Guarde o segredo de assinatura, exibido somente agora: '+d.data.signing_secret);await load();
  }catch{setError('Não foi possível criar. Use um endpoint HTTPS público, selecione eventos e confira sua permissão.');}finally{setBusy(false);}
 }
 async function action(hook:Hook,kind:'toggle'|'rotate'|'test'|'retry',deliveryId?:string){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   const manage=kind==='toggle'||kind==='rotate';
   const r=await fetch('/api/integrations/webhooks/'+hook.id+(manage?'':'/deliveries'),{
    method:manage?'PATCH':'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(kind==='toggle'?{active:!hook.active}:kind==='rotate'?{rotate_secret:true}:kind==='test'?{action:'test'}:{action:'retry',delivery_id:deliveryId})
   });const d=await r.json();if(!r.ok)throw new Error();
   setNotice(kind==='rotate'?'Novo segredo: '+d.data.signing_secret:manage?'Webhook atualizado.':'Evento colocado na fila. O worker fará a entrega.');
   await load();if(selected?.id===hook.id)await history({...hook,active:kind==='toggle'?!hook.active:hook.active});
  }catch{setError('Não foi possível concluir. Confira sua permissão e o estado do webhook.');}finally{setBusy(false);}
 }
 return <section className="card section">
  <h3>Webhooks de saída</h3><p className="muted">Entregas assinadas, retentativas e histórico por integração.</p>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="success" role="status">{notice}<button type="button" className="btn btn-secondary" onClick={()=>setNotice('')}>Ocultar aviso</button></p>}
  <form key={editing?.id??'new'} onSubmit={save} style={{display:'grid',gap:10}}>
   <label>Nome<input className="input" name="name" defaultValue={editing?.name??''} required minLength={2} maxLength={120}/></label>
   <label>Endpoint HTTPS<input className="input" type="url" name="endpoint_url" defaultValue={editing?.endpoint_url??''} required placeholder="https://..." maxLength={2000}/></label>
   <fieldset disabled={busy}><legend>Eventos</legend><div style={{display:'flex',flexWrap:'wrap',gap:12}}>{events.map(value=><label key={value}><input type="checkbox" name="events" value={value} defaultChecked={editing?.events.includes(value)??false}/>{value}</label>)}</div></fieldset>
   <button className="btn btn-primary" disabled={busy}>{editing?'Salvar alterações':'Criar webhook'}</button>{editing&&<button type="button" className="btn btn-secondary" onClick={()=>setEditing(null)}>Cancelar edição</button>}
  </form>
  {hooks.map(hook=><div className="setting-row" key={hook.id} style={{flexWrap:'wrap',gap:8}}>
   <span><strong>{hook.name}</strong><small className="muted" style={{display:'block'}}>{hook.events.join(', ')}</small></span>
   <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>setEditing(hook)}>Editar</button>
   <span className="badge">{hook.active?'Ativo':'Pausado'}{hook.last_status?' · HTTP '+hook.last_status:''}</span>
   <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void action(hook,'toggle')}>{hook.active?'Pausar':'Ativar'}</button>
   <button type="button" className="btn btn-secondary" disabled={busy||!hook.active} onClick={()=>void action(hook,'test')}>Testar</button>
   <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void history(hook)}>Histórico</button>
   <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>{if(confirm('Rotacionar o segredo? Atualize também o sistema que recebe este webhook.'))void action(hook,'rotate');}}>Rotacionar segredo</button>
  </div>)}
  {selected&&<div style={{overflowX:'auto'}}><h4>Entregas · {selected.name}</h4><button type="button" className="btn btn-secondary" onClick={()=>void history(selected)}>Atualizar histórico</button><table className="table"><thead><tr><th>Evento</th><th>Estado</th><th>Tentativas</th><th>HTTP</th><th>Duração</th><th>Erro</th><th>Ação</th></tr></thead><tbody>
   {deliveries.length===0?<tr><td colSpan={7}>Nenhuma entrega registrada.</td></tr>:deliveries.map(item=><tr key={item.id}><td>{item.event_type}<small style={{display:'block'}}>{new Date(item.created_at).toLocaleString('pt-BR')}</small></td><td>{item.status}</td><td>{item.attempts}/{item.max_attempts}</td><td>{item.response_status??'—'}</td><td>{item.duration_ms===null?'—':item.duration_ms+' ms'}</td><td>{item.error??'—'}</td><td>{['failed','dead_letter'].includes(item.status)&&<button type="button" className="btn btn-secondary" disabled={busy||!selected.active} onClick={()=>void action(selected,'retry',item.id)}>Reprocessar</button>}</td></tr>)}
  </tbody></table></div>}
 </section>;
}

