'use client';
import { useState } from 'react';
type Result={data:{summary:Record<string,number>;records:Array<{id:string;original:string;normalized:string|null;status:string}>};offset:number;total:number;next_offset:number|null};
export default function PhoneDiagnosticsPanel({enabled}:{enabled:boolean}){
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function inspect(offset=0){
  setBusy(true);setError('');
  try{const r=await fetch('/api/contacts/phone-diagnostics?offset='+offset,{cache:'no-store'});if(!r.ok)throw new Error();setResult(await r.json());}catch{setError('Não foi possível analisar os telefones. Confira sua permissão.');}finally{setBusy(false);}
 }
 return <section className="card section"><h3>Conferência de telefones</h3><p className="muted">Analisa formatos e números compartilhados. Esta conferência não altera nem mescla cadastros.</p>
 <button type="button" className="btn btn-secondary" disabled={!enabled||busy} onClick={()=>void inspect()}>{busy?'Analisando...':'Analisar cadastros'}</button>
 {error&&<p className="error" role="alert">{error}</p>}
 {result&&<><p role="status">Página de {result.data.records.length} cadastros · total {result.total}. Válidos: {result.data.summary.valid}; incompletos: {result.data.summary.incomplete}; ambíguos: {result.data.summary.ambiguous}; inválidos: {result.data.summary.invalid}. Números compartilhados nesta página: {result.data.summary.sharedNumbers}.</p>
 <div style={{overflowX:'auto',maxHeight:360}}><table className="table"><thead><tr><th>Original</th><th>Normalizado</th><th>Estado</th></tr></thead><tbody>{result.data.records.map(row=><tr key={row.id}><td>{row.original||'—'}</td><td>{row.normalized??'Revisão necessária'}</td><td>{row.status}</td></tr>)}</tbody></table></div>
 <button type="button" className="btn btn-secondary" disabled={busy||result.offset===0} onClick={()=>void inspect(Math.max(0,result.offset-500))}>Página anterior</button>
 <button type="button" className="btn btn-secondary" disabled={busy||result.next_offset===null} onClick={()=>void inspect(result.next_offset??0)}>Próxima página</button>
 </>}
 </section>;
}

