'use client';

import { FormEvent,useState } from 'react';
import { Braces, Play, ShieldCheck } from 'lucide-react';

export default function ApiPlayground(){
  const [key,setKey]=useState('');
  const [method,setMethod]=useState('GET');
  const [path,setPath]=useState('/api/v1/leads?limit=10');
  const [body,setBody]=useState('{
  "name": "Lead de teste",
  "source": "Playground"
}');
  const [result,setResult]=useState('');
  const [status,setStatus]=useState('');

  async function run(e:FormEvent){
    e.preventDefault();setResult('Executando...');setStatus('');
    try{
      const init:RequestInit={method,headers:{authorization:'Bearer '+key,'content-type':'application/json'}};
      if(method!=='GET'&&method!=='DELETE')init.body=body;
      const started=performance.now();
      const response=await fetch(path,init);
      const text=await response.text();
      setStatus(`HTTP ${response.status} · ${Math.round(performance.now()-started)} ms`);
      try{setResult(JSON.stringify(JSON.parse(text),null,2));}catch{setResult(text);}
    }catch(error){setResult(error instanceof Error?error.message:'Falha na requisição');}
  }

  return <div className="content">
    <div className="page-head"><div><h1 className="page-title">API Playground</h1><p className="page-sub">Teste endpoints da API pública usando uma chave gerada em Configurações.</p></div><a className="btn btn-secondary" href="/api/v1/openapi" target="_blank"><Braces size={15}/>OpenAPI</a></div>
    <div className="settings-grid">
      <form className="card section" onSubmit={run}>
        <h3><ShieldCheck size={16}/> Requisição</h3>
        <div className="field"><label>API Key</label><input className="input" type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="ecojoi_live_..." required/></div>
        <div className="form-grid" style={{marginTop:10}}>
          <div className="field"><label>Método</label><select className="select" value={method} onChange={e=>setMethod(e.target.value)}><option>GET</option><option>POST</option></select></div>
          <div className="field"><label>Endpoint</label><input className="input" value={path} onChange={e=>setPath(e.target.value)}/></div>
        </div>
        {method!=='GET'&&<div className="field" style={{marginTop:10}}><label>JSON</label><textarea className="textarea" rows={12} value={body} onChange={e=>setBody(e.target.value)}/></div>}
        <button className="btn btn-primary" style={{marginTop:10}}><Play size={15}/>Executar</button>
      </form>
      <section className="card section">
        <h3>Resposta</h3>
        {status&&<p className="muted">{status}</p>}
        <pre style={{margin:0,padding:12,borderRadius:6,background:'#101713',color:'#d9f7e7',fontSize:11,whiteSpace:'pre-wrap',overflow:'auto',minHeight:360,maxHeight:620}}>{result||'Execute uma requisição para visualizar o retorno.'}</pre>
      </section>
    </div>
  </div>;
}
