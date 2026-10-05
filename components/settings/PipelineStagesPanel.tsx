'use client';
import {FormEvent,useCallback,useEffect,useState} from 'react';
type Stage={id:string;name:string;active:boolean;sort_order:number;probability:number;semantic_stage:string};
export default function PipelineStagesPanel(){
 const [stages,setStages]=useState<Stage[]>([]),[pipeline,setPipeline]=useState(''),[pipelines,setPipelines]=useState<Array<{id:string;name:string}>>([]),[editing,setEditing]=useState<Stage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async(id?:string)=>{try{const r=await fetch('/api/pipeline-stages'+(id?'?pipeline_id='+id:''),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error();setStages(d.data??[]);setPipeline(d.pipeline_id);setPipelines(d.pipelines??[]);}catch{setError('Não foi possível carregar as etapas existentes.');}},[]);
 useEffect(()=>{void load();},[load]);
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;const form=e.currentTarget,fd=new FormData(form);setBusy(true);setError('');setNotice('');
  try{const body={name:fd.get('name'),sort_order:Number(fd.get('order')),probability:Number(fd.get('probability')),...(!editing?{pipeline_id:pipeline,semantic_stage:fd.get('semantic')}:{})};
   const r=await fetch('/api/pipeline-stages'+(editing?'/'+editing.id:''),{method:editing?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error();form.reset();setEditing(null);setNotice('Etapa salva. O histórico das oportunidades foi preservado.');await load(pipeline);
  }catch{setError('Não foi possível salvar a etapa. Confira os campos e sua permissão.');}finally{setBusy(false);}
 }
 async function toggle(stage:Stage){
  if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/pipeline-stages/'+stage.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active:!stage.active})});if(r.status===409){setError('Esta etapa tem oportunidades. Mova-as antes de retirar a etapa.');return;}if(!r.ok)throw Error();await load(pipeline);}catch{setError('Não foi possível alterar a etapa.');}finally{setBusy(false);}
 }
 return <section className="card section"><h3>Etapas do pipeline</h3><p className="muted">Personalize nomes e ordem usando os pipelines já cadastrados. Etapas em uso não podem ser retiradas.</p>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <label>Pipeline<select className="select" value={pipeline} disabled={busy} onChange={e=>{setEditing(null);void load(e.target.value);}}>{pipelines.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
  <form key={editing?.id??'new'} onSubmit={save} style={{display:'grid',gap:8}}>
   <label>Nome da etapa<input className="input" name="name" required minLength={2} maxLength={120} defaultValue={editing?.name??''}/></label>
   <label>Ordem<input className="input" type="number" name="order" min={0} max={10000} required defaultValue={editing?.sort_order??50}/></label>
   <label>Probabilidade (%)<input className="input" type="number" name="probability" min={0} max={100} required defaultValue={editing?.probability??10}/></label>
   {!editing&&<label>Categoria para relatórios e automações<select className="select" name="semantic" defaultValue="qualification"><option value="new">Novo</option><option value="qualification">Qualificação</option><option value="proposal">Proposta</option><option value="closing">Fechamento</option><option value="won">Ganho</option><option value="lost">Perdido</option></select></label>}
   <button className="btn btn-primary" disabled={busy||!pipeline}>{editing?'Salvar etapa':'Adicionar etapa'}</button>{editing&&<button type="button" className="btn btn-secondary" onClick={()=>setEditing(null)}>Cancelar</button>}
  </form>
  {stages.map(s=><div className="setting-row" key={s.id} style={{flexWrap:'wrap',gap:8}}><span>{s.sort_order} · {s.name} · {s.active?'Ativa':'Retirada'}</span><button className="btn btn-secondary" disabled={busy} onClick={()=>setEditing(s)}>Editar</button><button className="btn btn-secondary" disabled={busy} onClick={()=>void toggle(s)}>{s.active?'Retirar etapa':'Reativar'}</button></div>)}
 </section>;
}

