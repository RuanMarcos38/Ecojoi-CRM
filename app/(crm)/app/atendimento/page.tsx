'use client';

import { ClipboardEvent, ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, CheckCheck, ChevronLeft, Clock3, Download, FileText, Headphones, Image as ImageIcon,
  Mic, PanelRightClose, PanelRightOpen, Paperclip, Plus, Reply, Search, Send, Smile, Square, UserCheck, X
} from 'lucide-react';
import styles from './whatsapp.module.css';
import { ContactAvatar } from '@/components/ContactAvatar';
import { AgentAvatar } from '@/components/AgentAvatar';
import { createClient } from '@/lib/supabase/client';

type AttendanceState = 'waiting' | 'in_service' | 'automatic';
type Message = {
  id: string;
  provider_message_id?: string | null;
  reply_to_provider_id?: string | null;
  whatsapp_reaction?: string | null;
  sender_user_id?: string | null;
  sender_name?: string | null;
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
function quoteSummary(message: Message) {
  if (message.message_type === 'audio') return 'Mensagem de voz';
  if (message.message_type === 'image') return 'Imagem';
  if (message.message_type === 'file') return message.attachment_name || 'Arquivo';
  const body = message.body ?? '';
  return (message.direction === 'outbound' ? body.replace(/^\*[^\n]+\*\r?\n/, '') : body).trim() || 'Mensagem';
}

type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  owner_id?: string | null;
  attribution?: Record<string, unknown> | null;
  contact_tags?: { tag: { id: string; name: string } | null }[];
};
function acquisitionSource(contact?: Contact | null) {
  const attrs = contact?.attribution ?? {};
  const source = contact?.source?.trim() ?? '';
  const trackedSource = String(attrs.utm_source ?? '').trim();
  const referrer = String(attrs.referrer ?? '').trim();
  const candidate = trackedSource || source;

  if (attrs.meta_referral_type === 'ad' || attrs.meta_ctwa_clid || /click-to-whatsapp ads|anúncio meta|meta ads/i.test(candidate)) return 'Anúncio Meta';
  if (attrs.gclid || /google ads/i.test(candidate)) return 'Google Ads';
  if (/^google(?:\b|\.)/i.test(candidate) || /^https?:\/\/([\w-]+\.)?google\.[a-z.]+(?:\/|$)/i.test(referrer)) return 'Google';
  if (candidate && !/^(whatsapp|interno|email|e-mail)$/i.test(candidate)) return candidate;
  if (attrs.landing_page || /^(site|website|formulário)$/i.test(source)) return 'Site';
  return '';
}

type Assignee = { id: string; full_name: string };

type Conversation = {
  id: string;
  status: string;
  channel: string;
  assigned_to?: string | null;
  attendance_state: AttendanceState;
  attendance_changed_at?: string;
  updated_at?: string;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  first_response_at?: string | null;
  sla_due_at?: string | null;
  ai_summary?: string | null;
  ai_next_action?: string | null;
  ai_summary_updated_at?: string | null;
  contact: Contact;
  assignee?: Assignee | null;
  messages: Message[];
};
type Me = { role?: string; features?: Record<string, boolean>; tenantId?: string; userId?: string };
type QuickReply = { id:string; shortcut:string; title:string; body:string };
type WhatsAppTemplate = { id:string; name:string; language:string; category?:string|null; status?:string|null };
type ConversationNote = { id:string; body:string; created_at:string; user?: { id:string; full_name:string } | null };

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
type ReadState = { since: number; conversations: Record<string, number> };

function messageTime(value?: string | null) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function conversationActivity(conversation: Conversation) {
  const last = conversation.messages?.[conversation.messages.length - 1];
  return Math.max(messageTime(last?.created_at), messageTime(conversation.last_inbound_at), messageTime(conversation.last_outbound_at))
    || messageTime(conversation.updated_at);
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
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [explicitlyOpened, setExplicitlyOpened] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ecojoi:attendance:details');
      setDetailsOpen(saved === null ? window.matchMedia('(min-width: 1361px)').matches : saved === 'open');
    } catch { setDetailsOpen(window.matchMedia('(min-width: 1361px)').matches); }
  }, []);
  function toggleDetails(open: boolean) {
    setDetailsOpen(open);
    try { localStorage.setItem('ecojoi:attendance:details', open ? 'open' : 'closed'); } catch {}
  }
  const [queue, setQueue] = useState<AttendanceState>('waiting');
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [reply, setReply] = useState<{ conversationId: string; message: Message } | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [contactNameDraft, setContactNameDraft] = useState<{ id: string; name: string } | null>(null);
  const [savingContactName, setSavingContactName] = useState(false);
  const [pastedImage, setPastedImage] = useState<{ conversationId: string; file: File } | null>(null);
  const [pastedPreview, setPastedPreview] = useState('');

  useEffect(() => {
    if (!pastedImage) { setPastedPreview(''); return; }
    const url = URL.createObjectURL(pastedImage.file);
    setPastedPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pastedImage]);
  const [phoneMode, setPhoneMode] = useState(true);
  const [openingConversation, setOpeningConversation] = useState(false);
  const [openingError, setOpeningError] = useState('');
  const pinnedConversation = useRef<string | null>(null);
  const [changingState, setChangingState] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [readState, setReadState] = useState<{ key: string; data: ReadState } | null>(null);
  const readKey = me?.tenantId && me.userId ? 'ecojoi:attendance:read:' + me.tenantId + ':' + me.userId : '';
  useEffect(() => {
    if (!readKey) return;
    function readStored(value: string | null): ReadState | null {
      try {
        const data = value ? JSON.parse(value) : null;
        return data && Number.isFinite(data.since) && data.conversations && typeof data.conversations === 'object' ? data : null;
      } catch { return null; }
    }
    let existing: ReadState | null = null;
    try { existing = readStored(localStorage.getItem(readKey)); } catch {}
    const initial = existing ?? { since: Date.now(), conversations: {} };
    setReadState({ key: readKey, data: initial });
    if (!existing) {
      try { localStorage.setItem(readKey, JSON.stringify(initial)); } catch {}
    }
    const sync = (event: StorageEvent) => {
      if (event.key !== readKey) return;
      const data = readStored(event.newValue);
      if (data) setReadState({ key: readKey, data });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [readKey]);
  const [transfer, setTransfer] = useState<{ conversationId: string; members: Assignee[]; target: string } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState('');
  const canTransfer = ['company_admin', 'super_admin', 'manager'].includes(me?.role ?? '');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [notes,setNotes]=useState<ConversationNote[]>([]);
  const [noteText,setNoteText]=useState('');
  const [savingNote,setSavingNote]=useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordStartedAt = useRef<number>(0);

  async function refreshConversations() {
    const response = await fetch('/api/conversations', { cache: 'no-store' });
    if (!response.ok) return;
    const { data } = await response.json();
    const next: Conversation[] = data ?? [];
    const pinnedId = pinnedConversation.current;
    if (pinnedId && !next.some(item => item.id === pinnedId)) {
      const pinned = await fetchConversation(pinnedId);
      if (pinned) next.push(pinned);
    }
    setItems(next);
  }

  async function load() {
    setLoading(true);
    const [cr, ct, mr, qr, tr] = await Promise.all([
      fetch('/api/conversations', { cache: 'no-store' }),
      fetch('/api/contacts', { cache: 'no-store' }),
      fetch('/api/me', { cache: 'no-store' }),
      fetch('/api/quick-replies', { cache: 'no-store' }),
      fetch('/api/integrations/meta/templates', { cache: 'no-store' })
    ]);
    const [cd, td, md, qd, templatesData] = await Promise.all([
      cr.json(), ct.json(), mr.ok ? mr.json() : Promise.resolve(null),
      qr.ok ? qr.json() : Promise.resolve(null),
      tr.ok ? tr.json() : Promise.resolve(null)
    ]);
    if (cr.ok) setItems(cd.data ?? []);
    if (ct.ok) setContacts(td.data ?? []);
    if (mr.ok) setMe(md?.data ?? null);
    if (qr.ok) setQuickReplies(qd?.data ?? []);
    if (tr.ok) setTemplates(templatesData?.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('conversa');
    void load().then(async () => {
      if (target) await focusConversation(target);
    }).catch(() => {
      setLoading(false);
      setOpeningError('Não foi possível carregar o Atendimento.');
    });
  }, []);

  useEffect(() => {
    if (!me?.tenantId) return;
    const supabase = createClient();
    let refreshTimer: number | null = null;
    const refresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshConversations().catch(() => {}), 180);
    };

    const channel = supabase
      .channel(`ecojoi-attendance-${me.tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `tenant_id=eq.${me.tenantId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${me.tenantId}` }, refresh)
      .subscribe();

    const fallback = window.setInterval(() => void refreshConversations().catch(() => {}), 30000);
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [me?.tenantId]);
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
  const [attendantFilter, setAttendantFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [registeredTags, setRegisteredTags] = useState<{ id: string; name: string }[]>([]);
  const [oldestFirst, setOldestFirst] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/tags', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const payload = await response.json();
      if (!cancelled) setRegisteredTags(payload.data ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [channelFilter, setChannelFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const filterOptions = useMemo(() => {
    const attendants = new Map<string, string>();
    const tags = new Map(registeredTags.map(tag => [tag.id, tag.name] as const));
    const channels = new Set<string>();
    const origins = new Set<string>();
    for (const item of items) {
      if (item.assignee) attendants.set(item.assignee.id, item.assignee.full_name);
      for (const { tag } of item.contact?.contact_tags ?? []) {
        if (tag) tags.set(tag.id, tag.name);
      }
      channels.add(item.channel);
      const origin = acquisitionSource(item.contact);
      if (origin) origins.add(origin);
    }
    const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], 'pt-BR');
    return { attendants: [...attendants].sort(byLabel), tags: [...tags].sort(byLabel), channels: [...channels].sort(), origins: [...origins].sort() };
  }, [items, registeredTags]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      if ((item.attendance_state ?? 'waiting') !== queue) return false;
      if (attendantFilter && (attendantFilter === 'unassigned' ? Boolean(item.assigned_to) : item.assigned_to !== attendantFilter)) return false;
      if (tagFilter && !item.contact?.contact_tags?.some(({ tag }) => tag?.id === tagFilter)) return false;
      if (channelFilter && item.channel !== channelFilter) return false;
      if (originFilter && acquisitionSource(item.contact) !== originFilter) return false;
      if (!needle) return true;
      const last = item.messages?.[item.messages.length - 1]?.body ?? '';
      return `${item.contact?.name ?? ''} ${item.contact?.email ?? ''} ${item.contact?.phone ?? ''} ${last}`.toLowerCase().includes(needle);
    }).sort((a, b) => {
      const comparison = conversationActivity(a) - conversationActivity(b);
      return oldestFirst ? comparison : -comparison;
    });
  }, [items, queue, search, attendantFilter, tagFilter, channelFilter, originFilter, oldestFirst]);
  useEffect(() => {
    if (filtered.some(item => item.id === activeId)) return;
    setActiveId(filtered[0]?.id ?? null);
  }, [filtered, activeId]);

  useEffect(()=>{
    if(!activeId){setNotes([]);return;}
    let cancelled=false;
    fetch(`/api/conversations/${activeId}/notes`,{cache:'no-store'})
      .then(async response=>{
        const payload=await response.json().catch(()=>null);
        if(!cancelled&&response.ok)setNotes(payload?.data??[]);
      })
      .catch(()=>{if(!cancelled)setNotes([]);});
    return()=>{cancelled=true;};
  },[activeId]);

  const active = items.find(item => item.id === activeId) ?? null;
  const replyTarget = reply && reply.conversationId === active?.id ? reply.message : null;
  const activeMessages = active?.messages;
  const messageByProviderId = useMemo(() => new Map(
    (activeMessages ?? []).flatMap(message => message.provider_message_id ? [[message.provider_message_id, message] as const] : [])
  ), [activeMessages]);
  useEffect(() => { setReply(null); }, [activeId]);
  const lastIncoming = active?.channel === 'whatsapp'
    ? (active.messages ?? []).reduce((latest, message) => message.direction === 'inbound'
      ? Math.max(latest, messageTime(message.created_at)) : latest, 0)
    : 0;

  useEffect(() => {
    if (!activeId || explicitlyOpened !== activeId || !mobileChatOpen || !lastIncoming || !readState || readState.key !== readKey) return;
    const previous = readState.data.conversations[activeId] ?? readState.data.since;
    if (lastIncoming <= previous) return;
    const markRead = () => {
      if (document.visibilityState !== 'visible') return;
      const next = { ...readState.data, conversations: { ...readState.data.conversations, [activeId]: lastIncoming } };
      setReadState({ key: readKey, data: next });
      try { localStorage.setItem(readKey, JSON.stringify(next)); } catch {}
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [activeId, explicitlyOpened, mobileChatOpen, lastIncoming, readKey, readState]);

  function unreadCount(conversation: Conversation) {
    if (conversation.channel !== 'whatsapp' || !readState || readState.key !== readKey) return 0;
    const after = readState.data.conversations[conversation.id] ?? readState.data.since;
    return (conversation.messages ?? []).filter(message => message.direction === 'inbound' && messageTime(message.created_at) > after).length;
  }
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container=messagesRef.current;
    if(container) container.scrollTop=container.scrollHeight;
  }, [activeId, active?.messages?.length]);
  const aiAgentEnabled = me?.features?.ai_agent === true;
  const quickMatches = useMemo(() => {
    if (!text.startsWith('/')) return [];
    const needle = text.slice(1).toLowerCase();
    return quickReplies.filter(reply => !needle || reply.shortcut.toLowerCase().includes(needle) || reply.title.toLowerCase().includes(needle)).slice(0, 8);
  }, [text, quickReplies]);
  const channelName = (channel: string) => ({
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    facebook: 'Facebook',
    email: 'E-mail',
    internal: 'Interno'
  } as Record<string, string>)[channel] ?? channel;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !active || active.attendance_state !== 'in_service') return;
    setError(''); setNotice('');
    const r = await fetch(`/api/conversations/${active.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: text.trim(), reply_to_message_id: replyTarget?.id })
    });
    const d = await r.json();
    if (r.ok) {
      setText(current => current === text ? '' : current);
      setReply(current => current?.conversationId === active.id && current.message.id === replyTarget?.id ? null : current);
      setNotice(d.delivery === 'queued' ? 'Mensagem enfileirada para o provedor do canal.' : 'Mensagem enviada.');
      await load();
      return;
    }
    const errors: Record<string, string> = {
      conversation_in_automatic_mode: 'O agente de IA está responsável. Assuma o atendimento antes de responder.',
      conversation_not_in_human_service: 'Assuma o atendimento antes de enviar uma mensagem.',
      reply_target_unavailable: 'A mensagem original está indisponível. Remova a citação ou escolha outra mensagem.',
      whatsapp_reply_not_supported: 'Este canal não oferece respostas com citação.',
      whatsapp_window_closed: 'A janela de 24 horas do WhatsApp terminou. Use um template aprovado para reabrir a conversa.'
    };
    if (d.error === 'whatsapp_window_closed') setTemplateOpen(true);
    setError(errors[d.error] ?? 'Não foi possível enviar a mensagem.');
  }

  async function sendFile(file: File, durationMs?: number) {
    if (!active || active.attendance_state !== 'in_service' || sendingMedia) return false;
    setSendingMedia(true); setError(''); setNotice('');
    const form = new FormData();
    form.append('file', file);
    if (durationMs) form.append('duration_ms', String(durationMs));
    try {
      const r = await fetch(`/api/conversations/${active.id}/attachments`, { method: 'POST', body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const messages: Record<string, string> = {
          file_too_large: 'O arquivo deve ter no máximo 25 MB.',
          unsupported_file_type: 'Este tipo de arquivo não é permitido.',
          conversation_not_in_human_service: 'Assuma o atendimento antes de enviar anexos.',
          whatsapp_window_closed: 'A janela de 24 horas terminou. Envie um template aprovado antes de anexar arquivos.'
        };
        if (d.error === 'whatsapp_window_closed') setTemplateOpen(true);
        setError(r.status === 413 ? 'O servidor recusou o tamanho do arquivo. Envie um arquivo menor.' : messages[d.error] ?? 'Não foi possível enviar o arquivo.');
        return false;
      }
      setNotice(d.data?.status === 'queued' ? 'Arquivo enfileirado para envio no canal.' : 'Arquivo enviado.');
      await refreshConversations().catch(() => {});
      return true;
    } catch {
      setError('Falha de conexão ao enviar o arquivo. Confira a conversa antes de tentar novamente.');
      return false;
    } finally {
      setSendingMedia(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function pasteImage(event: ClipboardEvent<HTMLElement>) {
    const item = Array.from(event.clipboardData.items).find(entry => entry.kind === 'file' && entry.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file || !active || active.attendance_state !== 'in_service') return;
    event.preventDefault();
    if (sendingMedia || recording) return;
    setPastedImage({ conversationId: active.id, file });
    setError('');
  }

  async function sendPastedImage() {
    if (!pastedImage || pastedImage.conversationId !== active?.id) return;
    if (await sendFile(pastedImage.file)) setPastedImage(current => current === pastedImage ? null : current);
  }

  async function renameContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactNameDraft || savingContactName) return;
    const { id, name } = contactNameDraft;
    const clean = name.trim();
    if (clean.length < 2) { setError('Informe pelo menos dois caracteres para o nome.'); return; }
    setSavingContactName(true);
    setError('');
    try {
      const response = await fetch('/api/contacts/' + encodeURIComponent(id), {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: clean })
      });
      if (!response.ok) {
        setError(response.status === 403 ? 'Seu perfil não tem permissão para editar contatos.' : 'Não foi possível salvar o nome do cliente.');
        return;
      }
      setItems(current => current.map(item => item.contact?.id === id ? { ...item, contact: { ...item.contact, name: clean } } : item));
      setContacts(current => current.map(item => item.id === id ? { ...item, name: clean } : item));
      setContactNameDraft(null);
    } catch {
      setError('Falha de conexão ao salvar o nome do cliente.');
    } finally {
      setSavingContactName(false);
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
    const mp4 = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (active.channel === 'whatsapp' && !mp4) {
      setError('Este navegador não grava no formato de áudio do WhatsApp. Anexe um arquivo MP3 ou M4A.');
      return;
    }
    const preferredMime = active.channel === 'whatsapp' ? mp4 : 'audio/webm';
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      const recorder = new MediaRecorder(stream, preferredMime && MediaRecorder.isTypeSupported(preferredMime) ? { mimeType: preferredMime } : undefined);
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = event => { if (event.data.size) audioChunks.current.push(event.data); };
      recorder.onstop = async () => {
        const duration = Date.now() - recordStartedAt.current;
        const mime = (recorder.mimeType || audioChunks.current[0]?.type || preferredMime || '').split(';', 1)[0];
        const extension = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm';
        const blob = new Blob(audioChunks.current, { type: mime });
        stream.getTracks().forEach(track => track.stop());
        mediaStream.current = null;
        setRecording(false); setRecordSeconds(0);
        if (blob.size) await sendFile(new File([blob], `audio-${Date.now()}.${extension}`, { type: mime }), duration);
      };
      recordStartedAt.current = Date.now();
      recorder.start(250);
      setRecording(true); setRecordSeconds(0);
    } catch {
      mediaStream.current?.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
    }
  }
  function stopRecording() { mediaRecorder.current?.stop(); }

  async function fetchConversation(id: string): Promise<Conversation | null> {
    const response = await fetch('/api/conversations?id=' + encodeURIComponent(id), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()).data?.[0] ?? null;
  }

  async function focusConversation(id: string) {
    const conversation = await fetchConversation(id);
    if (!conversation) {
      setOpeningError('Conversa não encontrada ou indisponível.');
      return;
    }
    pinnedConversation.current = id;
    setItems(current => current.some(item => item.id === id)
      ? current.map(item => item.id === id ? conversation : item)
      : [conversation, ...current]);
    setExplicitlyOpened(id);
    setSearch('');
    setTagFilter('');
    setChannelFilter('');
    setAttendantFilter('');
    setOriginFilter('');
    setQueue(conversation.attendance_state ?? 'waiting');
    setActiveId(id);
    setMobileChatOpen(true);
    setCreating(false);
  }

  async function createConversation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (openingConversation) return;
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const body = phoneMode
      ? { phone: form.get('phone'), channel: 'whatsapp', ...(name ? { name } : {}) }
      : { contact_id: form.get('contact_id'), channel: form.get('channel') };
    setOpeningConversation(true);
    setOpeningError('');
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = {
          invalid_phone: 'Informe um telefone válido com DDD. Para outros países, inclua o código do país com +.',
          phone_required: 'O contato selecionado precisa ter um telefone cadastrado.',
          forbidden: 'Seu perfil não tem permissão para iniciar este atendimento.'
        };
        setOpeningError(messages[result.error] ?? 'Não foi possível abrir a conversa.');
        return;
      }
      await focusConversation(result.data.id);
    } catch {
      setOpeningError('Falha de conexão ao abrir a conversa.');
    } finally {
      setOpeningConversation(false);
    }
  }

  async function prepareTransfer() {
    if (!active || transferBusy) return;
    const id = active.id;
    setTransferFeedback('');
    setTransferBusy(true);
    try {
      const response = await fetch('/api/conversations/' + id + '/transfer', { cache: 'no-store' });
      if (!response.ok) throw Error();
      setTransfer({ conversationId: id, members: (await response.json()).data ?? [], target: '' });
    } catch {
      setTransferFeedback('Não foi possível carregar os usuários disponíveis.');
    } finally {
      setTransferBusy(false);
    }
  }

  async function transferConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || transfer?.conversationId !== active.id || !transfer.target || transferBusy) return;
    const id = active.id;
    setTransferBusy(true);
    setTransferFeedback('');
    try {
      const response = await fetch('/api/conversations/' + id + '/transfer', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignee_id: transfer.target })
      });
      if (!response.ok) throw Error();
      const { data } = await response.json();
      setItems(current => current.map(item => item.id === id ? { ...item, ...data } : item));
      setQueue('in_service');
      setActiveId(id);
      setAttendantFilter('');
      setTransfer(null);
      setTransferFeedback('Atendimento transferido.');
    } catch {
      setTransferFeedback('Não foi possível transferir. Confira se a conversa está aberta e o usuário está ativo.');
    } finally {
      setTransferBusy(false);
    }
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

  async function sendTemplate(template: WhatsAppTemplate) {
    if (!active) return;
    setError(''); setNotice('');
    const r = await fetch(`/api/conversations/${active.id}/template`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: template.name, language: template.language, components: [] })
    });
    const d = await r.json().catch(() => null);
    if (r.ok) {
      setTemplateOpen(false);
      setNotice(d?.data?.delivery === 'sent' ? 'Template enviado.' : 'Template enfileirado para retentativa.');
      await refreshConversations();
    } else {
      setError('Não foi possível enviar o template do WhatsApp.');
    }
  }

  async function addInternalNote(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!active||!noteText.trim()||savingNote)return;
    setSavingNote(true);setError('');setNotice('');
    try{
      const response=await fetch(`/api/conversations/${active.id}/notes`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({body:noteText.trim()})
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok){
        setError('Não foi possível salvar a nota interna.');
        return;
      }
      setNoteText('');
      setNotes(current=>[{
        id:payload?.data?.id??crypto.randomUUID(),
        body:payload?.data?.body??noteText.trim(),
        created_at:payload?.data?.created_at??new Date().toISOString(),
        user:me?.userId?{id:me.userId,full_name:'Você'}:null
      },...current]);
      setNotice('Nota interna registrada.');
    }finally{
      setSavingNote(false);
    }
  }

  function applyQuickReply(reply: QuickReply) {
    setText(reply.body);
  }

  const [reactionPicker, setReactionPicker] = useState<string | null>(null);
  const [sendingReaction, setSendingReaction] = useState(false);

  async function reactToMessage(message: Message, emoji: string) {
    if (!active || sendingReaction) return;
    setSendingReaction(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${active.id}/reactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message_id: message.id, emoji })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error === 'reaction_expired'
          ? 'O WhatsApp aceita reações em mensagens de até 30 dias.'
          : result.error === 'provider_not_supported'
            ? 'Reações estão disponíveis no canal oficial da Meta.'
            : 'Não foi possível registrar a reação no WhatsApp.');
        return;
      }
      setItems(current => current.map(conversation => conversation.id !== active.id ? conversation : {
        ...conversation,
        messages: conversation.messages?.map(item => item.id === message.id ? { ...item, whatsapp_reaction: result.reaction } : item)
      }));
      setReactionPicker(null);
    } catch {
      setError('Falha de conexão ao registrar a reação.');
    } finally {
      setSendingReaction(false);
    }
  }

  function quoteAuthor(message: Message) {
    return message.direction === 'outbound' ? message.sender_name || 'Equipe Ecojoi' : active?.contact?.name || 'Cliente';
  }

  function replyToMessage(message: Message) {
    if (!active) return;
    setReply({ conversationId: active.id, message });
    setReactionPicker(null);
    textInput.current?.focus();
  }

  function renderMessage(message: Message) {
    const original = message.reply_to_provider_id ? messageByProviderId.get(message.reply_to_provider_id) : undefined;
    const agentName = message.direction === 'outbound' && message.sender_user_id
      ? message.sender_name
      : null;
    const signedName = agentName?.replace(/[\r\n*_~`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    const signature = signedName ? `*${signedName}*\n` : null;
    const body = signature && message.body?.startsWith(signature)
      ? message.body.slice(signature.length)
      : message.body;
    const repeatsFileName = message.message_type === 'file' && message.attachment_url
      && body === message.attachment_name;

    return (
      <div key={message.id} id={`message-${message.id}`} tabIndex={-1} className={`${styles.messageRow} ${message.direction === 'outbound' ? styles.outbound : styles.inbound}`}>
        <div className={styles.messageBubble}>
          {message.direction === 'outbound' && message.sender_user_id && message.sender_name && (
            <div className="message-agent"><AgentAvatar name={message.sender_name} userId={message.sender_user_id}/><strong>{message.sender_name}</strong></div>
          )}
          {original ? <button type="button" className={styles.messageQuote} onClick={() => {
            const target = document.getElementById(`message-${original.id}`);
            target?.scrollIntoView({ block: 'center' });
            target?.focus({ preventScroll: true });
          }}><b>{quoteAuthor(original)}</b><span>{quoteSummary(original)}</span></button>
            : message.reply_to_provider_id && <div className={styles.messageQuote}><span>Mensagem original indisponível</span></div>}
          {message.message_type === 'image' && message.attachment_url && (
            <a href={message.attachment_url} target="_blank" rel="noreferrer" className={styles.imageMessage}><img src={message.attachment_url} alt={message.attachment_name ?? 'Imagem'} /></a>
          )}
          {message.message_type === 'audio' && message.attachment_url && (
            <div className={styles.audioMessage}><Mic size={17}/><audio controls preload="metadata" src={message.attachment_url} /></div>
          )}
          {message.message_type === 'audio' && !message.attachment_url && <small>Áudio indisponível</small>}
          {message.message_type === 'file' && message.attachment_url && (
            <a href={message.attachment_url} target="_blank" rel="noreferrer" className={styles.fileMessage}>
              <span className={styles.fileIcon}><FileText size={20}/></span>
              <span><b>{message.attachment_name ?? 'Arquivo'}</b><small>{formatSize(message.attachment_size)}</small></span>
              <Download size={17}/>
            </a>
          )}
          {body && !repeatsFileName && message.message_type !== 'audio' && <div className={styles.messageText}>{body}</div>}
          <div className={styles.reactionBar}>
            {active?.channel === 'whatsapp' && active.attendance_state === 'in_service' && message.provider_message_id?.startsWith('wamid.') &&
              <button type="button" className={styles.reactButton} title="Responder" aria-label="Responder à mensagem"
                onClick={() => replyToMessage(message)}><Reply size={15}/></button>}
            {message.whatsapp_reaction && <span aria-label="Reação enviada">{message.whatsapp_reaction}</span>}
            {active?.channel === 'whatsapp' && active.attendance_state === 'in_service' && message.provider_message_id && <>
              <button type="button" className={styles.reactButton} aria-label="Reagir à mensagem" aria-expanded={reactionPicker === message.id}
                onClick={() => setReactionPicker(reactionPicker === message.id ? null : message.id)}><Smile size={14}/></button>
              {reactionPicker === message.id && <div className={styles.reactionOptions} aria-label="Escolher reação">
                {[['👍', 'Curtir'], ['❤️', 'Coração'], ['😂', 'Risada'], ['😊', 'Sorriso'], ['😮', 'Surpresa'], ['😢', 'Triste'], ['🙏', 'Agradecer']].map(([emoji, label]) => (
                  <button type="button" key={emoji} aria-label={label} aria-pressed={message.whatsapp_reaction === emoji}
                    disabled={sendingReaction} onClick={() => void reactToMessage(message, message.whatsapp_reaction === emoji ? '' : emoji)}>{emoji}</button>
                ))}
              </div>}
            </>}
          </div>
          <div className={styles.messageMeta}><span>{formatTime(message.created_at)}</span>{message.direction === 'outbound' && <><span>{message.status === 'queued' ? 'na fila' : ''}</span><CheckCheck size={14}/></>}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${styles.whatsappShell}`} data-mobile-chat={mobileChatOpen ? "open" : "list"} data-details-open={detailsOpen && !!active}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div><strong>Conversas</strong><span>WhatsApp e canais conectados</span></div>
          <button className={styles.roundButton} onClick={() => setCreating(v => !v)} aria-label="Novo atendimento">{creating ? <X size={18}/> : <Plus size={18}/>}</button>
        </div>
        {creating && (
          <form className={styles.newConversation} onSubmit={createConversation}>
            <select className="select" aria-label="Como iniciar atendimento" value={phoneMode ? 'phone' : 'contact'} onChange={e => { setPhoneMode(e.target.value === 'phone'); setOpeningError(''); }}>
              <option value="phone">Digitar telefone do WhatsApp</option>
              <option value="contact">Escolher contato cadastrado</option>
            </select>
            {phoneMode ? <>
              <input name="name" aria-label="Nome do cliente" className="input" autoComplete="off" placeholder="Nome do cliente (opcional)" minLength={2} maxLength={140}/>
              <input name="phone" aria-label="Telefone do cliente" className="input" type="tel" autoComplete="tel" placeholder="Telefone com DDD" required maxLength={40}/>
            </> : <>
            <select className="select" name="contact_id" required defaultValue=""><option value="" disabled>Selecione um contato</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select>
            <select className="select" name="channel" defaultValue="internal"><option value="internal">Interno</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="email">E-mail</option></select>
            </>}
            <button className="btn btn-primary" disabled={openingConversation}>{openingConversation ? 'Abrindo…' : 'Abrir conversa'}</button>
          </form>
        )}
        {openingError && <div className={styles.errorBar} role="alert">{openingError}</div>}
        <details className={styles.attendanceFilters}>
          <summary>Filtros de atendimento{(search || tagFilter || channelFilter || attendantFilter || originFilter || oldestFirst) && <span> · Ativos</span>}</summary>
          <div className={styles.attendanceFilterFields}>
            <label className={styles.attendanceFilterSearch}><Search size={16}/><input className="input" aria-label="Nome, telefone ou mensagem" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, telefone ou mensagem" /></label>
            <select className="select" aria-label="Atendente" value={attendantFilter} onChange={event => setAttendantFilter(event.target.value)}><option value="">Todos atendentes</option><option value="unassigned">Sem atendente</option>{filterOptions.attendants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            <select className="select" aria-label="Tag" value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="">Todas tags</option>{filterOptions.tags.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            <select className="select" aria-label="Canal" value={channelFilter} onChange={event => setChannelFilter(event.target.value)}><option value="">Todos canais</option>{filterOptions.channels.map(channel => <option key={channel} value={channel}>{channelName(channel)}</option>)}</select>
            <select className="select" aria-label="Origem" value={originFilter} onChange={event => setOriginFilter(event.target.value)}><option value="">Todas origens</option>{filterOptions.origins.map(origin => <option key={origin}>{origin}</option>)}</select>
            <select className="select" aria-label="Ordem por última atividade" value={oldestFirst ? 'oldest' : 'recent'} onChange={e => setOldestFirst(e.target.value === 'oldest')}><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option></select>
            <button className="btn btn-secondary" type="button" disabled={!search && !attendantFilter && !tagFilter && !channelFilter && !originFilter && !oldestFirst} onClick={() => { setSearch(''); setAttendantFilter(''); setTagFilter(''); setChannelFilter(''); setOriginFilter(''); setOldestFirst(false); }}>Limpar filtros</button>
          </div>
        </details>
        <div className={styles.queueTabs} role="tablist">
          {QUEUES.map(({ state, label, Icon }) => <button key={state} type="button" className={queue === state ? styles.queueActive : ''} onClick={() => setQueue(state)}><Icon size={14}/><span>{label}</span><b>{queueCounts[state]}</b></button>)}
        </div>
        <div className={styles.conversationList}>
          {loading ? <div className={styles.empty}>Carregando...</div> : filtered.length === 0 ? <div className={styles.empty}>Nenhuma conversa nesta fila.</div> : filtered.map(conversation => {
            const last = conversation.messages?.[conversation.messages.length - 1];
            const unread = unreadCount(conversation);
            const timestamp = conversationActivity(conversation);
            return <button className={`${styles.conversation} ${activeId === conversation.id ? styles.conversationActive : ''}`} key={conversation.id} onClick={() => { setActiveId(conversation.id); setExplicitlyOpened(conversation.id); setMobileChatOpen(true); }}>
              <ContactAvatar id={conversation.contact?.id} name={conversation.contact?.name??'Contato'} enabled={conversation.channel==='whatsapp'} className={styles.avatar}/>
              <span className={styles.conversationCopy}>
                <span className={styles.conversationName}><b>{conversation.contact?.name ?? 'Contato'}</b><small>{timestamp ? formatTime(new Date(timestamp).toISOString()) : ''}</small></span>
                <span className={styles.conversationPreview}>
                  <span className={styles.lastMessage}>{last?.message_type === 'audio' ? '🎙️ Mensagem de voz' : last?.message_type === 'file' ? `📎 ${last.attachment_name ?? 'Arquivo'}` : last?.body ?? 'Sem mensagens'}</span>
                  {unread > 0 && <span className={styles.unreadBadge} aria-label={unread + (unread === 1 ? ' mensagem não lida' : ' mensagens não lidas')}>{unread > 99 ? '99+' : unread}</span>}
                </span>
                <span className={styles.conversationMeta}>
                  <i>{channelName(conversation.channel)}</i>{acquisitionSource(conversation.contact) && <span title={acquisitionSource(conversation.contact)}>{acquisitionSource(conversation.contact)}</span>}
                </span>
              </span>
            </button>;
          })}
        </div>
      </aside>

      <main className={styles.chatPanel} onPaste={pasteImage}>
        {active ? <>
          <header className={styles.chatHeader}>
            <button type="button" className={styles.mobileBack} onClick={() => setMobileChatOpen(false)} aria-label="Voltar para conversas"><ChevronLeft size={22}/></button>
            <div className={styles.contactIdentity}><ContactAvatar id={active.contact?.id} name={active.contact?.name??'Contato'} enabled={active.channel==='whatsapp'} className={styles.avatar}/><div><strong>{active.contact?.name ?? 'Contato'}</strong><span>{channelName(active.channel)}{(active.contact?.phone ?? active.contact?.email) && <> · {active.contact?.phone ?? active.contact?.email}</>}</span></div></div>
            <div className={styles.headerActions}>
              {active.attendance_state !== 'in_service' && <button className="btn btn-primary" disabled={changingState} onClick={() => void changeAttendance('in_service')}><UserCheck size={15}/>Assumir</button>}
              {active.attendance_state === 'in_service' && <><button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}><Clock3 size={15}/>Esperar</button><button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('automatic')}><Bot size={15}/>Agente IA</button></>}
              {active.attendance_state === 'automatic' && <button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}><Clock3 size={15}/>Espera</button>}
              {active.channel === 'whatsapp' && templates.length > 0 && <button className="btn btn-secondary" type="button" onClick={() => setTemplateOpen(v => !v)}><FileText size={15}/>Template</button>}
              <button type="button" className={styles.roundButton} onClick={() => toggleDetails(!detailsOpen)} aria-label={detailsOpen ? "Ocultar detalhes do contato" : "Mostrar detalhes do contato"} title={detailsOpen ? "Ocultar detalhes do contato" : "Mostrar detalhes do contato"} aria-expanded={detailsOpen} aria-controls="attendance-contact-details">{detailsOpen ? <PanelRightClose size={20}/> : <PanelRightOpen size={20}/>}</button>
            </div>
          </header>

          {templateOpen && active.channel === 'whatsapp' && <div className={styles.templatePanel}><div className={styles.templateHeader}><strong>Templates aprovados</strong><button type="button" className={styles.roundButton} onClick={() => setTemplateOpen(false)}><X size={16}/></button></div><div className={styles.templateList}>{templates.filter(t => !t.status || t.status === 'APPROVED').map(t => <button key={t.id} type="button" onClick={() => void sendTemplate(t)}><span><b>{t.name}</b><small>{t.language} · {t.category ?? 'WhatsApp'}</small></span><Send size={14}/></button>)}</div></div>}
          {active.attendance_state === 'automatic' && <div className={`${styles.modeBanner} ${styles.aiBanner}`}><Bot size={17}/><div><b>{aiAgentEnabled ? 'Agente de IA atendendo' : 'Modo automático selecionado'}</b><span>{aiAgentEnabled ? 'Assuma o atendimento para responder manualmente.' : 'Ative o Agente de IA nas configurações da empresa para respostas automáticas.'}</span></div></div>}
          {active.attendance_state === 'waiting' && <div className={`${styles.modeBanner} ${styles.waitingBanner}`}><Clock3 size={17}/><div><b>Aguardando atendimento</b><span>Assuma esta conversa para liberar texto, áudio, emojis e anexos.</span></div></div>}

          <div className={styles.messages} ref={messagesRef}>{active.messages?.length ? active.messages.map(renderMessage) : <div className={styles.empty}>Envie a primeira mensagem deste atendimento.</div>}</div>

          {active.attendance_state === 'in_service' ? <>
            {(error || notice) && <div className={error ? styles.errorBar : styles.noticeBar}>{error || notice}</div>}
            {pastedImage?.conversationId === active?.id && <div className={styles.pastedAttachment}>
              {pastedPreview && <img src={pastedPreview} alt="Prévia da imagem colada"/>}
              <span>Imagem colada</span>
              <button type="button" className="btn btn-secondary" disabled={sendingMedia} onClick={() => setPastedImage(null)}>Remover</button>
              <button type="button" className="btn btn-primary" disabled={sendingMedia || recording} onClick={() => void sendPastedImage()}>Enviar imagem</button>
            </div>}
            <form className={styles.composer} onSubmit={send}>
              {replyTarget && <div className={styles.replyPreview} aria-label="Mensagem a que você está respondendo">
                <div className={styles.messageQuote}><b>{quoteAuthor(replyTarget)}</b><span>{quoteSummary(replyTarget)}</span></div>
                <button type="button" className={styles.roundButton} aria-label="Cancelar resposta" title="Cancelar resposta"
                  onClick={() => setReply(null)}><X size={18}/></button>
              </div>}
              <div className={styles.composerTools}>
                <button type="button" className={styles.composerIcon} onClick={() => setEmojiOpen(v => !v)} title="Emojis" aria-label="Emoji" aria-expanded={emojiOpen}><Smile size={22}/></button>
                <button type="button" className={styles.composerIcon} onClick={() => fileInput.current?.click()} disabled={sendingMedia} title="Anexar arquivo" aria-label="Anexar arquivo"><Paperclip size={22}/></button>
                <input ref={fileInput} type="file" hidden onChange={onFileChange} accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
                {emojiOpen && <div className={styles.emojiPicker}>{EMOJIS.map(emoji => <button key={emoji} type="button" onClick={() => { setText(value => value + emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
              </div>
              {recording ? <div className={styles.recording}><span className={styles.recordDot}/><b>Gravando áudio</b><span>{String(Math.floor(recordSeconds / 60)).padStart(2,'0')}:{String(recordSeconds % 60).padStart(2,'0')}</span></div> : <div className={styles.messageInputWrap}>{quickMatches.length > 0 && <div className={styles.quickReplies}>{quickMatches.map(reply => <button type="button" key={reply.id} onClick={() => applyQuickReply(reply)}><b>/{reply.shortcut}</b><span>{reply.title}</span></button>)}</div>}<input ref={textInput} value={text} onChange={e => setText(e.target.value)} placeholder="Digite uma mensagem ou /atalho" /></div>}
              <div className={styles.composerActions}>
                {recording ? <button type="button" className={`${styles.sendButton} ${styles.stopButton}`} onClick={stopRecording} title="Parar e enviar áudio" aria-label="Parar gravação"><Square size={18}/></button> : <button type="button" className={styles.composerIcon} onClick={startRecording} disabled={sendingMedia} title="Gravar áudio" aria-label="Gravar áudio"><Mic size={20}/></button>}
                <button className={styles.sendButton} type="submit" disabled={!text.trim() || recording || sendingMedia} title="Enviar mensagem" aria-label="Enviar"><Send size={19}/></button>
              </div>
            </form>
          </> : <div className={styles.lockedComposer}>{active.attendance_state === 'automatic' ? <Bot size={18}/> : <Clock3 size={18}/>}<span>{active.attendance_state === 'automatic' ? 'Envio humano bloqueado enquanto o agente automático estiver responsável.' : 'Assuma o atendimento para responder.'}</span></div>}
        </> : <div className={styles.chatPlaceholder}><div className={styles.placeholderIcon}><ImageIcon size={28}/></div><h3>Ecojoi Atendimento</h3><p>Selecione uma conversa para iniciar.</p></div>}
      </main>

      <aside className={styles.details} id="attendance-contact-details" aria-label="Detalhes do contato" hidden={!detailsOpen || !active}>
        <div className={styles.detailsHeading}><strong>Detalhes do contato</strong><button type="button" className={styles.roundButton} aria-label="Fechar detalhes do contato" title="Fechar detalhes do contato" onClick={() => toggleDetails(false)}><X size={18}/></button></div>
        {active && <>
          <ContactAvatar id={active.contact?.id} name={active.contact?.name??'Contato'} enabled={active.channel==='whatsapp'} className={styles.bigAvatar}/>
          <h3>{active.contact?.name}</h3>
          {active.contact?.id && (contactNameDraft && contactNameDraft.id === active.contact.id ? (
            <form className={styles.renameContact} onSubmit={renameContact}>
              <input className="input" aria-label="Editar nome do cliente" value={contactNameDraft.name} onChange={e => setContactNameDraft({ ...contactNameDraft, name: e.target.value })} required minLength={2} maxLength={140}/>
              <button className="btn btn-primary" disabled={savingContactName}>Salvar nome</button>
              <button type="button" className="btn btn-secondary" disabled={savingContactName} onClick={() => setContactNameDraft(null)}>Cancelar</button>
            </form>
          ) : <button type="button" className="btn btn-secondary" onClick={() => {
            if (active.contact?.id) setContactNameDraft({ id: active.contact.id, name: active.contact.name });
          }}>Editar nome</button>)}
          <p>{active.contact?.phone || 'Telefone não informado'}</p>
          <p>{active.contact?.email || 'E-mail não informado'}</p>

          <hr/>
          <b>Responsável</b>
          <div className={styles.ownerCard}><Headphones size={18}/><div><strong>{active.assignee?.full_name ?? 'Sem responsável'}</strong><span>{active.assignee ? 'Distribuição ativa' : 'Aguardando distribuição'}</span></div></div>

          <hr/>
          {canTransfer && active.status !== 'closed' && <>
            {transfer?.conversationId === active.id ? <form className="field" onSubmit={transferConversation}>
              <label htmlFor="transfer-member">Novo responsável</label>
              <select className="select" id="transfer-member" value={transfer.target}
                onChange={event => setTransfer({ ...transfer, target: event.target.value })} required disabled={transferBusy}>
                <option value="">Selecione um usuário</option>
                {transfer.members.filter(member => member.id !== active.assigned_to).map(member => (
                  <option key={member.id} value={member.id}>{member.full_name}</option>
                ))}
              </select>
              <button className="btn btn-primary" disabled={transferBusy || !transfer.target}>Confirmar transferência</button>
              <button type="button" className="btn btn-secondary" disabled={transferBusy} onClick={() => setTransfer(null)}>Cancelar</button>
            </form> : <button type="button" className="btn btn-secondary" disabled={transferBusy}
              onClick={() => void prepareTransfer()}>Transferir atendimento</button>}
            {transferFeedback && <p role="status">{transferFeedback}</p>}
          </>}
          <b>Status do atendimento</b>
          <div className={styles.ownerCard}>{active.attendance_state === 'automatic' ? <Bot size={18}/> : active.attendance_state === 'in_service' ? <Headphones size={18}/> : <Clock3 size={18}/>}<div><strong>{STATE_LABEL[active.attendance_state]}</strong><span>{active.attendance_state === 'automatic' ? 'Agente de IA' : active.attendance_state === 'in_service' ? 'Operador humano' : 'Fila aguardando'}</span></div></div>

          {(active.ai_summary||active.ai_next_action)&&<>
            <hr/>
            <b>Inteligência da conversa</b>
            {active.ai_summary&&<div style={{marginTop:9,padding:10,border:'1px solid var(--line)',borderRadius:7,textAlign:'left',background:'var(--eco-raised)'}}>
              <strong style={{fontSize:11}}>Resumo IA</strong>
              <p style={{marginTop:5,lineHeight:1.45,whiteSpace:'pre-wrap'}}>{active.ai_summary}</p>
            </div>}
            {active.ai_next_action&&<div style={{marginTop:7,padding:10,border:'1px solid var(--line)',borderRadius:7,textAlign:'left',background:'var(--eco-raised)'}}>
              <strong style={{fontSize:11}}>Próxima ação</strong>
              <p style={{marginTop:5,lineHeight:1.45,whiteSpace:'pre-wrap'}}>{active.ai_next_action}</p>
            </div>}
          </>}

          <hr/>
          <b>Notas internas</b>
          <form onSubmit={addInternalNote} style={{display:'grid',gap:7,marginTop:8,textAlign:'left'}}>
            <textarea className="textarea" rows={3} value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Visível somente para a equipe..." maxLength={4000}/>
            <button className="btn btn-secondary" disabled={savingNote||!noteText.trim()}>{savingNote?'Salvando...':'Adicionar nota'}</button>
          </form>
          <div style={{display:'grid',gap:6,marginTop:9,maxHeight:190,overflow:'auto',textAlign:'left'}}>
            {notes.length?notes.map(note=><div key={note.id} style={{padding:'8px 9px',border:'1px solid var(--line)',borderRadius:6,background:'var(--eco-surface)'}}>
              <p style={{margin:0,whiteSpace:'pre-wrap',lineHeight:1.4}}>{note.body}</p>
              <small className="muted">{Array.isArray(note.user)?note.user[0]?.full_name:note.user?.full_name||'Equipe'} · {new Date(note.created_at).toLocaleString('pt-BR')}</small>
            </div>):<p className="muted">Nenhuma nota interna.</p>}
          </div>

          <hr/><b>Canal</b><p className={styles.channelLabel}>{channelName(active.channel)}</p>
          {acquisitionSource(active.contact) && <><hr/><b>Origem</b><p className={styles.channelLabel}>{acquisitionSource(active.contact)}</p></>}
        </>}
      </aside>
    </div>
  );
}
