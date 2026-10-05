'use client';
import {FormEvent,useCallback,useEffect,useState} from 'react';
type Doc={id:string;name:string;draft_name?:string|null;active:boolean;published_version:number;updated_at:string;draft_text?:string|null;extracted_text?:string|null;version_history?:Array<{version:number;name:string}>};
export default function KnowledgePanel(){
 const [docs,setDocs]=useState<Doc[]>([]),[editing,setEditing]=useState<Doc|null>(null),[history,setHistory]=useState<Doc|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/integrations/ai/knowledge',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error();setDocs(d.data??[]);}catch{setError('Não foi possível carregar a base de conhecimento.');}},[]);
 useEffect(()=>{void load();},[load]);
 async function detail(doc:Doc,edit:boolean){
  try{setError('');const r=await fetch('/api/integrations/ai/knowledge/'+doc.id,{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error();if(edit)setEditing(d.data);else setHistory(d.data);}catch{setError('Conteúdo indisponível ou acesso negado.');}
 }
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;const form=e.currentTarget,fd=new FormData(form);setBusy(true);setError('');setNotice('');
  try{
   const body={name:fd.get('name'),text:fd.get('text'),...(editing?{action:'draft',expected_updated_at:editing.updated_at}:{})};
   const r=await fetch('/api/integrations/ai/knowledge'+(editing?'/'+editing.id:''),{method:editing?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   if(!r.ok)throw Error(r.status===409?'changed':'failed');form.reset();setEditing(null);setNotice('Rascunho salvo. Publique para disponibilizar ao agente.');await load();
  }catch(e){setError(e instanceof Error&&e.message==='changed'?'Outro usuário alterou o documento. Abra novamente antes de editar.':'Não foi possível salvar o rascunho.');}finally{setBusy(false);}
 }
 async function action(doc:Doc,action:'publish'|'archive'|'restore',version?:number){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/integrations/ai/knowledge/'+doc.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action,expected_updated_at:doc.updated_at,restore_version:version})});if(!r.ok)throw Error();setHistory(null);setNotice(action==='publish'?'Versão publicada para os próximos atendimentos.':action==='restore'?'Versão recuperada como rascunho. Revise antes de publicar.':'Conteúdo retirado do agente; histórico preservado.');await load();}
  catch{setError('Não foi possível concluir. Atualize a lista e confira sua permissão.');}finally{setBusy(false);}
 }
 return <section className="card section"><h3>Base de conhecimento</h3><p className="muted">O agente usa somente versões publicadas e ativas. Rascunhos ficam separados.</p>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}
  <form key={editing?.id??'new'} onSubmit={save} style={{display:'grid',gap:10}}>
   <label>Nome<input className="input" name="name" required minLength={2} maxLength={180} defaultValue={editing?.draft_name??editing?.name??''}/></label>
   <label>Conteúdo<textarea className="textarea" name="text" required maxLength={120000} rows={5} defaultValue={editing?.draft_text??editing?.extracted_text??''}/></label>
   <button className="btn btn-primary" disabled={busy}>Salvar rascunho</button>{editing&&<button type="button" className="btn btn-secondary" onClick={()=>setEditing(null)}>Cancelar edição</button>}
  </form>
  {docs.map(doc=><div className="setting-row" key={doc.id} style={{flexWrap:'wrap',gap:8}}><span><strong>{doc.name}</strong><small style={{display:'block'}}>Versão {doc.published_version} · {doc.active&&doc.published_version>0?'Publicada':'Fora do agente'}{doc.draft_name?' · Rascunho pendente':''}</small></span>
   <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void detail(doc,true)}>Editar rascunho</button>
   <button type="button" className="btn btn-primary" disabled={busy||!doc.draft_name} onClick={()=>void action(doc,'publish')}>Publicar</button>
   <button type="button" className="btn btn-secondary" disabled={busy||!doc.active} onClick={()=>void action(doc,'archive')}>Retirar do agente</button>
   <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void detail(doc,false)}>Histórico</button>
  </div>)}
  {history&&<div><h4>Versões anteriores · {history.name}</h4>{history.version_history?.length?history.version_history.map(v=><p key={v.version}>Versão {v.version} · {v.name} <button className="btn btn-secondary" disabled={busy} onClick={()=>void action(history,'restore',v.version)}>Recuperar como rascunho</button></p>):<p>Nenhuma versão anterior.</p>}<button className="btn btn-secondary" onClick={()=>setHistory(null)}>Fechar histórico</button></div>}
 </section>;
}

