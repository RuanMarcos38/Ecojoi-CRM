'use client';

import { FormEvent,useEffect,useMemo,useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarClock,CheckCircle2 } from 'lucide-react';

type Info={
  name:string;
  owner_name?:string|null;
  duration_minutes:number;
  timezone:string;
  available_weekdays:number[];
  day_start:string;
  day_end:string;
  interval_minutes:number;
  confirmation_message?:string|null;
  occupied:string[];
};

function pad(n:number){return String(n).padStart(2,'0');}
function slots(info:Info){
  const startParts=info.day_start.slice(0,5).split(':').map(Number);
  const endParts=info.day_end.slice(0,5).split(':').map(Number);
  const start=startParts[0]*60+startParts[1];
  const end=endParts[0]*60+endParts[1];
  const out:string[]=[];
  for(let m=start;m+info.duration_minutes<=end;m+=info.interval_minutes){
    out.push(pad(Math.floor(m/60))+':'+pad(m%60));
  }
  return out;
}

export default function BookingPublic(){
  const params=useParams<{slug:string}>();
  const slug=String(params?.slug||'');
  const [info,setInfo]=useState<Info|null>(null);
  const [date,setDate]=useState('');
  const [time,setTime]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  async function load(selectedDate?:string){
    if(!slug)return;
    const suffix=selectedDate?'?date='+encodeURIComponent(selectedDate):'';
    try{
      const response=await fetch('/api/public/booking/'+encodeURIComponent(slug)+suffix,{cache:'no-store'});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error);
      setInfo(payload.data);
    }catch{
      setError('Agenda não encontrada.');
    }
  }

  useEffect(()=>{void load();},[slug]);
  useEffect(()=>{if(date)void load(date);},[date]);

  const available=useMemo(()=>{
    if(!info||!date)return[];
    const day=new Date(date+'T12:00:00').getDay();
    if(!info.available_weekdays.includes(day))return[];
    return slots(info).filter(slot=>{
      const local=new Date(date+'T'+slot+':00');
      return local.getTime()>Date.now() &&
        !info.occupied.some(value=>Math.abs(new Date(value).getTime()-local.getTime())<60000);
    });
  },[info,date]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!info||!date||!time)return;
    setError('');
    setNotice('');
    const form=new FormData(event.currentTarget);
    const local=new Date(date+'T'+time+':00');
    const response=await fetch('/api/public/booking/'+encodeURIComponent(slug),{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name:form.get('name'),
        email:String(form.get('email')||'')||null,
        phone:String(form.get('phone')||'')||null,
        notes:String(form.get('notes')||'')||null,
        starts_at:local.toISOString()
      })
    });
    const payload=await response.json().catch(()=>null);
    if(response.ok){
      setNotice(payload?.data?.message||'Agendamento confirmado.');
      event.currentTarget.reset();
      setTime('');
      await load(date);
    }else{
      setError(payload?.error==='slot_unavailable'?'Este horário acabou de ser reservado. Escolha outro.':'Não foi possível agendar.');
    }
  }

  if(error&&!info){
    return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,Arial'}}>{error}</main>;
  }
  if(!info){
    return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,Arial'}}>Carregando agenda...</main>;
  }

  return <main style={{minHeight:'100vh',background:'#f5f7f5',padding:'32px 14px',fontFamily:'Inter,Arial',color:'#17211d'}}>
    <section style={{maxWidth:680,margin:'0 auto',background:'#fff',border:'1px solid #e1e5e2',borderRadius:10,padding:26}}>
      <CalendarClock size={24}/>
      <h1 style={{fontSize:24,margin:'10px 0 4px'}}>{info.name}</h1>
      <p style={{color:'#6f7a75',marginTop:0}}>{info.owner_name?('Com '+info.owner_name+' · '):''}{info.duration_minutes} minutos · {info.timezone}</p>

      {notice&&<div style={{padding:12,background:'#edf8f0',color:'#087a4b',borderRadius:7,marginBottom:12}}><CheckCircle2 size={16}/> {notice}</div>}
      {error&&<div style={{padding:12,background:'#fff2f0',color:'#b42318',borderRadius:7,marginBottom:12}}>{error}</div>}

      <form onSubmit={submit} style={{display:'grid',gap:10}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
          <input name="name" required placeholder="Seu nome" style={{padding:10,border:'1px solid #d4dad6',borderRadius:6}}/>
          <input name="email" type="email" placeholder="E-mail" style={{padding:10,border:'1px solid #d4dad6',borderRadius:6}}/>
          <input name="phone" placeholder="Telefone" style={{padding:10,border:'1px solid #d4dad6',borderRadius:6}}/>
          <input type="date" value={date} min={new Date().toISOString().slice(0,10)} onChange={e=>{setDate(e.target.value);setTime('');}} required style={{padding:10,border:'1px solid #d4dad6',borderRadius:6}}/>
        </div>

        {date&&<div>
          <strong style={{fontSize:12}}>Escolha o horário</strong>
          <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:8}}>
            {available.length?available.map(slot=><button type="button" key={slot} onClick={()=>setTime(slot)} style={{padding:'8px 10px',border:'1px solid #cfd7d2',borderRadius:6,background:time===slot?'#087a4b':'#fff',color:time===slot?'#fff':'#17211d',cursor:'pointer'}}>{slot}</button>):<span style={{fontSize:12,color:'#6f7a75'}}>Nenhum horário disponível.</span>}
          </div>
        </div>}

        <textarea name="notes" rows={3} placeholder="Observações" style={{padding:10,border:'1px solid #d4dad6',borderRadius:6}}/>
        <button disabled={!time} style={{padding:11,border:0,borderRadius:6,background:'#087a4b',color:'#fff',fontWeight:700,cursor:'pointer',opacity:time?1:.5}}>Confirmar agendamento</button>
      </form>
    </section>
  </main>;
}
