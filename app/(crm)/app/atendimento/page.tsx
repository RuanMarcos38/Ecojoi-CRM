'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, CheckCheck, Clock3, Download, FileText, Headphones, Image as ImageIcon,
  Mic, MoreVertical, Paperclip, Plus, Search, Send, Smile, Square, UserCheck, X
} from 'lucide-react';
import styles from './attendance.module.css';

type AttendanceState = 'waiting' | 'in_service' | 'automatic';
type Message = {
  id: string;
  direction: string;
  body: string;
  status: string;
  message_type?: 'text' | 'image' | 'audio' | 'file' | 'system';
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  audio_duration_ms?: number | null;
  created_at: string;
};
type Contact = { id: string; name: string; email?: string; phone?: string };
type Conversation = {
  id: string;
  status: string;
  channel: string;
  assigned_to?: string | null;
  attendance_state: AttendanceState;
  attendance_changed_at?: string;
  updated_at?: string;
  contact: Contact;
  messages: Message[];
};
type Me = { features?: Record<string, boolean> };

const QUEUES: { state: AttendanceState; label: string; Icon: typeof Clock3 }[] = [
  { state: 'waiting', label: 'Esperando', Icon: Clock3 },
  { state: 'in_service', label: 'Atendimento', Icon: Headphones },
  { state: 'automatic', label: 'Automático', Icon: Bot }
];
const STATE_LABEL: Record<AttendanceState, string> = { waiting: 'Esperando', in_service: 'Atendimento', automatic: 'Automático' };
const EMOJIS = ['😀','😁','😂','😊','😍','👍','🙏','👏','🎉','✅','💚','📞','📎','🔥','😉','🤝','💬','🚀'];

function initials(name = 'Contato') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}
function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function formatSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Atendimento() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [queue, setQueue] = useState<AttendanceState>('waiting');
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordStartedAt = useRef<number>(0);

  async function load() {
    setLoading(true);
    const [cr, ct, mr] = await Promise.all([
      fetch('/api/conversations', { cache: 'no-store' }),
      fetch('/api/contacts', { cache: 'no-store' }),
      fetch('/api/me', { cache: 'no-store' })
    ]);
    const [cd, td, md] = await Promise.all([cr.json(), ct.json(), mr.ok ? mr.json() : Promise.resolve(null)]);
    if (cr.ok) setItems(cd.data ?? []);
    if (ct.ok) setContacts(td.data ?? []);
    if (mr.ok) setMe(md?.data ?? null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordSeconds(Math.floor((Date.now() - recordStartedAt.current) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => mediaStream.current?.getTracks().forEach(track => track.stop()), []);

  const queueCounts = useMemo(() => {
    const counts: Record<AttendanceState, number> = { waiting: 0, in_service: 0, automatic: 0 };
    for (const item of items) counts[item.attendance_state ?? 'waiting'] += 1;
    return counts;
  }, [items]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      if ((item.attendance_state ?? 'waiting') !== queue) return false;
      if (!needle) return true;
      const last = item.messages?.[item.messages.length - 1]?.body ?? '';
      return `${item.contact?.name ?? ''} ${item.contact?.email ?? ''} ${item.contact?.phone ?? ''} ${last}`.toLowerCase().includes(needle);
    });
  }, [items, queue, search]);
  useEffect(() => {
    if (filtered.some(item => item.id === activeId)) return;
    setActiveId(filtered[0]?.id ?? null);
  }, [filtered, activeId]);

  const active = items.find(item => item.id === activeId) ?? null;
  const aiAgentEnabled = me?.features?.ai_agent === true;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !active || active.attendance_state !== 'in_service') return;
    setError(''); setNotice('');
    const r = await fetch(`/api/conversations/${active.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: text.trim() })
    });
    const d = await r.json();
    if (r.ok) {
      setText('');
      setNotice(d.delivery === 'queued' ? 'Mensagem enfileirada para o provedor do canal.' : 'Mensagem enviada.');
      await load();
      return;
    }
    const errors: Record<string, string> = {
      conversation_in_automatic_mode: 'O agente de IA está responsável. Assuma o atendimento antes de responder.',
      conversation_not_in_human_service: 'Assuma o atendimento antes de enviar uma mensagem.'
    };
    setError(errors[d.error] ?? 'Não foi possível enviar a mensagem.');
  }

  async function sendFile(file: File, durationMs?: number) {
    if (!active || active.attendance_state !== 'in_service') return;
    setSendingMedia(true); setError(''); setNotice('');
    const form = new FormData();
    form.append('file', file);
    if (durationMs) form.append('duration_ms', String(durationMs));
    try {
      const r = await fetch(`/api/conversations/${active.id}/attachments`, { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) {
        const messages: Record<string, string> = {
          file_too_large: 'O arquivo deve ter no máximo 25 MB.',
          unsupported_file_type: 'Este tipo de arquivo não é permitido.',
          conversation_not_in_human_service: 'Assuma o atendimento antes de enviar anexos.'
        };
        setError(messages[d.error] ?? 'Não foi possível enviar o arquivo.');
        return;
      }
      setNotice(d.data?.status === 'queued' ? 'Arquivo enfileirado para envio no canal.' : 'Arquivo enviado.');
      await load();
    } finally {
      setSendingMedia(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await sendFile(file);
  }

  async function startRecording() {
    if (!active || active.attendance_state !== 'in_service') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Seu navegador não permite gravação de áudio neste dispositivo.');
      return;
    }
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined);
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = event => { if (event.data.size) audioChunks.current.push(event.data); };
      recorder.onstop = async () => {
        const duration = Date.now() - recordStartedAt.current;
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunks.current, { type: mime });
        stream.getTracks().forEach(track => track.stop());
        mediaStream.current = null;
        setRecording(false); setRecordSeconds(0);
        if (blob.size) await sendFile(new File([blob], `audio-${Date.now()}.webm`, { type: mime }), duration);
      };
      recordStartedAt.current = Date.now();
      recorder.start(250);
      setRecording(true); setRecordSeconds(0);
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
    }
  }
  function stopRecording() { mediaRecorder.current?.stop(); }

  async function createConversation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    const r = await fetch('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contact_id: fd.get('contact_id'), channel: fd.get('channel') || 'internal' }) });
    const d = await r.json();
    if (r.ok) { setCreating(false); setQueue('in_service'); setActiveId(d.data.id); await load(); }
    else setError('Você não possui permissão para iniciar este atendimento.');
  }

  async function changeAttendance(state: AttendanceState) {
    if (!active || changingState || active.attendance_state === state) return;
    setChangingState(true); setError(''); setNotice('');
    try {
      const r = await fetch(`/api/conversations/${active.id}/attendance`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error === 'attendance_state_update_failed' ? 'Não foi possível alterar a fila.' : 'Você não possui permissão para alterar esta fila.'); return; }
      setQueue(state); setActiveId(active.id); await load();
    } finally { setChangingState(false); }
  }

  function renderMessage(message: Message) {
    return (
      <div key={message.id} className={`${styles.messageRow} ${message.direction === 'outbound' ? styles.outbound : styles.inbound}`}>
        <div className={styles.messageBubble}>
          {message.message_type === 'image' && message.attachment_url && (
            <a href={message.attachment_url} target="_blank" rel="noreferrer" className={styles.imageMessage}><img src={message.attachment_url} alt={message.attachment_name ?? 'Imagem'} /></a>
          )}
          {message.message_type === 'audio' && message.attachment_url && (
            <div className={styles.audioMessage}><Mic size={17}/><audio controls preload="metadata" src={message.attachment_url} /></div>
          )}
          {message.message_type === 'file' && message.attachment_url && (
            <a href={message.attachment_url} target="_blank" rel="noreferrer" className={styles.fileMessage}>
              <span className={styles.fileIcon}><FileText size={20}/></span>
              <span><b>{message.attachment_name ?? 'Arquivo'}</b><small>{formatSize(message.attachment_size)}</small></span>
              <Download size={17}/>
            </a>
          )}
          {message.body && message.message_type !== 'audio' && <div className={styles.messageText}>{message.body}</div>}
          <div className={styles.messageMeta}><span>{formatTime(message.created_at)}</span>{message.direction === 'outbound' && <><span>{message.status === 'queued' ? 'na fila' : ''}</span><CheckCheck size={14}/></>}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${styles.whatsappShell}`}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div><strong>Atendimento</strong><span>Caixa de entrada omnichannel</span></div>
          <button className={styles.roundButton} onClick={() => setCreating(v => !v)} aria-label="Novo atendimento">{creating ? <X size={18}/> : <Plus size={18}/>}</button>
        </div>
        {creating && (
          <form className={styles.newConversation} onSubmit={createConversation}>
            <select className="select" name="contact_id" required defaultValue=""><option value="" disabled>Selecione um contato</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select>
            <select className="select" name="channel" defaultValue="internal"><option value="internal">Interno</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="email">E-mail</option></select>
            <button className="btn btn-primary">Iniciar</button>
          </form>
        )}
        <div className={styles.searchBox}><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar ou iniciar conversa" /></div>
        <div className={styles.queueTabs} role="tablist">
          {QUEUES.map(({ state, label, Icon }) => <button key={state} type="button" className={queue === state ? styles.queueActive : ''} onClick={() => setQueue(state)}><Icon size={14}/><span>{label}</span><b>{queueCounts[state]}</b></button>)}
        </div>
        <div className={styles.conversationList}>
          {loading ? <div className={styles.empty}>Carregando...</div> : filtered.length === 0 ? <div className={styles.empty}>Nenhuma conversa nesta fila.</div> : filtered.map(conversation => {
            const last = conversation.messages?.[conversation.messages.length - 1];
            return <button className={`${styles.conversation} ${activeId === conversation.id ? styles.conversationActive : ''}`} key={conversation.id} onClick={() => setActiveId(conversation.id)}>
              <span className={styles.avatar}>{initials(conversation.contact?.name)}</span>
              <span className={styles.conversationCopy}><span className={styles.conversationName}><b>{conversation.contact?.name ?? 'Contato'}</b><small>{conversation.updated_at ? formatTime(conversation.updated_at) : ''}</small></span><span className={styles.lastMessage}>{last?.message_type === 'audio' ? '🎙️ Mensagem de voz' : last?.message_type === 'file' ? `📎 ${last.attachment_name ?? 'Arquivo'}` : last?.body ?? 'Sem mensagens'}</span></span>
            </button>;
          })}
        </div>
      </aside>

      <main className={styles.chatPanel}>
        {active ? <>
          <header className={styles.chatHeader}>
            <div className={styles.contactIdentity}><span className={styles.avatar}>{initials(active.contact?.name)}</span><div><strong>{active.contact?.name ?? 'Contato'}</strong><span>{active.contact?.phone ?? active.contact?.email ?? active.channel} · {STATE_LABEL[active.attendance_state]}</span></div></div>
            <div className={styles.headerActions}>
              {active.attendance_state !== 'in_service' && <button className="btn btn-primary" disabled={changingState} onClick={() => void changeAttendance('in_service')}><UserCheck size={15}/>Assumir</button>}
              {active.attendance_state === 'in_service' && <><button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}><Clock3 size={15}/>Esperar</button><button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('automatic')}><Bot size={15}/>Agente IA</button></>}
              {active.attendance_state === 'automatic' && <button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}><Clock3 size={15}/>Espera</button>}
              <button className={styles.roundButton} aria-label="Mais opções"><MoreVertical size={18}/></button>
            </div>
          </header>

          {active.attendance_state === 'automatic' && <div className={`${styles.modeBanner} ${styles.aiBanner}`}><Bot size={17}/><div><b>{aiAgentEnabled ? 'Agente de IA atendendo' : 'Modo automático selecionado'}</b><span>{aiAgentEnabled ? 'Assuma o atendimento para responder manualmente.' : 'Ative o Agente de IA nas configurações da empresa para respostas automáticas.'}</span></div></div>}
          {active.attendance_state === 'waiting' && <div className={`${styles.modeBanner} ${styles.waitingBanner}`}><Clock3 size={17}/><div><b>Aguardando atendimento</b><span>Assuma esta conversa para liberar texto, áudio, emojis e anexos.</span></div></div>}

          <div className={styles.messages}>{active.messages?.length ? active.messages.map(renderMessage) : <div className={styles.empty}>Envie a primeira mensagem deste atendimento.</div>}</div>

          {active.attendance_state === 'in_service' ? <>
            {(error || notice) && <div className={error ? styles.errorBar : styles.noticeBar}>{error || notice}</div>}
            <form className={styles.composer} onSubmit={send}>
              <div className={styles.composerTools}>
                <button type="button" className={styles.composerIcon} onClick={() => setEmojiOpen(v => !v)} aria-label="Emoji"><Smile size={22}/></button>
                <button type="button" className={styles.composerIcon} onClick={() => fileInput.current?.click()} disabled={sendingMedia} aria-label="Anexar arquivo"><Paperclip size={22}/></button>
                <input ref={fileInput} type="file" hidden onChange={onFileChange} accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
                {emojiOpen && <div className={styles.emojiPicker}>{EMOJIS.map(emoji => <button key={emoji} type="button" onClick={() => { setText(value => value + emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
              </div>
              {recording ? <div className={styles.recording}><span className={styles.recordDot}/><b>Gravando áudio</b><span>{String(Math.floor(recordSeconds / 60)).padStart(2,'0')}:{String(recordSeconds % 60).padStart(2,'0')}</span></div> : <input value={text} onChange={e => setText(e.target.value)} placeholder="Digite uma mensagem" />}
              {recording ? <button type="button" className={`${styles.sendButton} ${styles.stopButton}`} onClick={stopRecording} aria-label="Parar gravação"><Square size={18}/></button> : text.trim() ? <button className={styles.sendButton} type="submit" aria-label="Enviar"><Send size={19}/></button> : <button type="button" className={styles.sendButton} onClick={startRecording} disabled={sendingMedia} aria-label="Gravar áudio"><Mic size={20}/></button>}
            </form>
          </> : <div className={styles.lockedComposer}>{active.attendance_state === 'automatic' ? <Bot size={18}/> : <Clock3 size={18}/>}<span>{active.attendance_state === 'automatic' ? 'Envio humano bloqueado enquanto o agente automático estiver responsável.' : 'Assuma o atendimento para responder.'}</span></div>}
        </> : <div className={styles.chatPlaceholder}><div className={styles.placeholderIcon}><ImageIcon size={28}/></div><h3>Ecojoi Atendimento</h3><p>Selecione uma conversa para iniciar.</p></div>}
      </main>

      <aside className={styles.details}>
        {active && <><span className={`${styles.bigAvatar}`}>{initials(active.contact?.name)}</span><h3>{active.contact?.name}</h3><p>{active.contact?.phone}</p><p>{active.contact?.email}</p><hr/><b>Status do atendimento</b><div className={styles.ownerCard}>{active.attendance_state === 'automatic' ? <Bot size={18}/> : active.attendance_state === 'in_service' ? <Headphones size={18}/> : <Clock3 size={18}/>}<div><strong>{STATE_LABEL[active.attendance_state]}</strong><span>{active.attendance_state === 'automatic' ? 'Agente de IA' : active.attendance_state === 'in_service' ? 'Operador humano' : 'Fila aguardando'}</span></div></div><hr/><b>Canal</b><p className={styles.channelLabel}>{active.channel}</p><hr/><small className={styles.securityText}>Arquivos e mensagens ficam isolados pelo tenant da empresa. Mensagens de canais externos aparecem como “na fila” enquanto o provedor oficial não estiver conectado.</small></>}
      </aside>
    </div>
  );
}
