'use client';

export default function GlobalError({
  error,
  reset
}:{
  error:Error & {digest?:string};
  reset:()=>void;
}){
  return <html lang="pt-BR">
    <body style={{margin:0,fontFamily:'Arial,Helvetica,sans-serif',background:'#f3f5f4',color:'#17211d'}}>
      <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24}}>
        <section style={{width:'min(520px,100%)',background:'#fff',border:'1px solid #dfe4e1',borderRadius:10,padding:24,boxSizing:'border-box'}}>
          <div style={{width:38,height:38,borderRadius:8,display:'grid',placeItems:'center',background:'#e8f4ee',color:'#087a4b',fontWeight:700}}>!</div>
          <h1 style={{fontSize:20,margin:'16px 0 8px'}}>Não foi possível carregar este módulo</h1>
          <p style={{fontSize:13,lineHeight:1.5,color:'#66736d',margin:'0 0 16px'}}>
            O CRM encontrou uma falha de interface. Nenhum dado ou credencial foi alterado.
          </p>
          {error?.digest&&<p style={{fontSize:11,color:'#87918c'}}>Código: {error.digest}</p>}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" onClick={reset} style={{border:0,borderRadius:5,padding:'9px 12px',background:'#087a4b',color:'#fff',cursor:'pointer'}}>Tentar novamente</button>
            <button type="button" onClick={()=>{window.location.href='/app';}} style={{border:'1px solid #d8dedb',borderRadius:5,padding:'9px 12px',background:'#fff',cursor:'pointer'}}>Ir para o painel</button>
          </div>
        </section>
      </main>
    </body>
  </html>;
}
