'use client';
import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { importFields, type ImportMapping, parseImportRow } from '@/lib/contact-import';
const labels={name:'Nome',phone:'Telefone / WhatsApp',email:'E-mail',source:'Origem',agent:'Atendente na Suri',status:'Situação na Suri',notes:'Observações'};
type Preview={total:number;headers:string[];mapping:ImportMapping;sample:Record<string,unknown>[]};
export default function ContactImport({onComplete}:{onComplete:()=>Promise<void>}){
  const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<Preview|null>(null);
  const [mapping,setMapping]=useState<ImportMapping>({}),[source,setSource]=useState('Suri'),[conversations,setConversations]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [failures,setFailures]=useState<Array<{row:number;error:string}>>([]);
  function formFor(f:File){const form=new FormData();form.append('file',f);form.append('source',source);return form;}
  async function previewFile(f:File){
    setFile(f);setPreview(null);setError('');setNotice('');setFailures([]);setBusy(true);
    try{const form=formFor(f);form.append('preview','true');const r=await fetch('/api/contacts/import',{method:'POST',body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao ler arquivo.');setPreview(d.data);setMapping(d.data.mapping);}
    catch(e){setError(e instanceof Error?e.message:'Falha ao ler arquivo.');}finally{setBusy(false);}
  }
  async function run(){
    if(!file||!preview)return;setBusy(true);setError('');setFailures([]);
    let offset=0,processed=0,failed=0;
    const errors:Array<{row:number;error:string}>=[];
    try{
      while(offset<preview.total){
        const form=formFor(file);form.append('mapping',JSON.stringify(mapping));form.append('offset',String(offset));form.append('create_conversation',String(conversations));
        const r=await fetch('/api/contacts/import',{method:'POST',body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||'Lote interrompido.');
        if(d.data.nextOffset<=offset)throw new Error('O lote não avançou.');
        offset=d.data.nextOffset;processed+=d.data.processed;failed+=d.data.failed;errors.push(...d.data.errors);
        setNotice(`${offset} de ${preview.total} linhas: ${processed} processadas, ${failed} com erro.`);setFailures([...errors]);
      }
      setNotice(`Importação concluída: ${processed} linhas processadas e ${failed} com erro. Nenhuma mensagem foi enviada.`);
      await onComplete();
    }catch(e){setError(`${e instanceof Error?e.message:'Falha na importação.'} ${processed} linhas já foram processadas. É possível reenviar a planilha; contatos são localizados por telefone ou e-mail.`);}
    finally{setBusy(false);}
  }
  return <>
    <button type="button" className="btn btn-secondary" onClick={()=>setOpen(true)}><Upload size={15}/>Importar / Suri</button>
    {open&&<div role="dialog" aria-modal="true" aria-label="Importar contatos da Suri" style={{position:'fixed',inset:0,zIndex:1200,background:'rgba(0,0,0,.5)',display:'grid',placeItems:'center',padding:16}}>
      <section className="card section" style={{maxWidth:900,width:'100%',maxHeight:'90dvh',overflow:'auto'}}>
        <div className="page-head"><h2>Importar contatos da Suri</h2><button className="btn btn-secondary" disabled={busy} onClick={()=>setOpen(false)} aria-label="Fechar importação"><X size={18}/></button></div>
        <p>Selecione a exportação CSV ou Excel da Suri (até 8 MB). Confira as colunas antes de importar. Cadastros existentes mantêm nome e responsável; telefone ou e-mail identificam contatos repetidos.</p>
        <p>O histórico de mensagens e arquivos da Suri não é importado por esta planilha. Atendente, situação e observações ficam registrados como dados de origem.</p>
        <label>Arquivo CSV / Excel<input aria-label="Arquivo CSV / Excel" className="input" type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void previewFile(f);}}/></label>
        <label>Origem<input className="input" value={source} disabled={busy} onChange={e=>setSource(e.target.value)}/></label>
        <label style={{display:'flex',gap:8,margin:'16px 0'}}><input type="checkbox" checked={conversations} disabled={busy} onChange={e=>setConversations(e.target.checked)}/>Retomar contatos em Atendimento WhatsApp (não envia mensagens; usa a distribuição atual da equipe)</label>
        {preview&&<>
          <p><strong>{preview.total} linhas encontradas.</strong> Telefones brasileiros sem DDI recebem +55. Para outros países, use +DDI.</p>
          <div className="form-grid">{importFields.map(field=><label key={field}>{labels[field]}{field==='name'?' *':''}<select aria-label={`Coluna ${labels[field]}`} className="select" disabled={busy} value={mapping[field]??''} onChange={e=>setMapping({...mapping,[field]:e.target.value})}><option value="">Não importar</option>{preview.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>
          <h3>Prévia das primeiras linhas</h3><div className="table-wrap"><table className="table"><thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Conferência</th></tr></thead><tbody>{preview.sample.map((r,i)=>{const p=parseImportRow(r,mapping,source);return <tr key={i}><td>{p.name}</td><td>{p.phone}</td><td>{p.email}</td><td>{p.error||'Pronto para importar'}</td></tr>;})}</tbody></table></div>
          <button className="btn btn-primary" disabled={busy||!mapping.name||(!mapping.phone&&!mapping.email)||!preview.total} onClick={()=>void run()}>{busy?'Processando...':'Confirmar importação'}</button>
        </>}
        {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}
        {failures.length>0&&<details><summary>{failures.length} linhas para corrigir</summary><ul>{failures.map(e=><li key={e.row}>Linha {e.row}: {e.error}</li>)}</ul></details>}
      </section>
    </div>}
  </>;
}
