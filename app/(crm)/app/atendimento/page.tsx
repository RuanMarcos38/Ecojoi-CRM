'use client';

import MessageAudio from './message-audio';
import ContactDeals from './contact-deals';
import { ClipboardEvent, ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRightLeft, Bot, Check, CheckCircle2, CheckCheck, ChevronLeft, Clock3, Download, FileText, Headphones, Image as ImageIcon,
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
  attachment_path?: string | null;
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
type WhatsAppTemplate = { id:string; name:string; language:string; category?:string|null; status?:string|null; components?: {type?:string; text?:string}[] };
function templatePreview(template: WhatsAppTemplate) {
  return (template.components ?? [])
    .filter(component => ['HEADER', 'BODY', 'FOOTER'].includes(component.type?.toUpperCase() ?? '') && typeof component.text === 'string')
    .map(component => component.text?.trim()).filter(Boolean).join('\n');
}
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

function whatsappConversationKeys(conversation: Conversation) {
  if (conversation.channel !== 'whatsapp' || conversation.status === 'closed') return [];
  const keys = conversation.contact?.id ? [`contact:${conversation.contact.id}`] : [];
  const phone = conversation.contact?.phone?.trim() ?? '';
  const digits = phone.replace(/\D/g, '');
  if (/^\+?[\d\s().-]+$/.test(phone) && /^[1-9]\d{10,14}$/.test(digits)) keys.push(`phone:${digits}`);
  return keys;
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
  const [showFinished, setShowFinished] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('ecojoi:attendance:font-size'));
      if (saved >= 12 && saved <= 22) setFontSize(saved);
    } catch {}
  }, []);

  function changeFontSize(delta: number) {
    const size = Math.max(12, Math.min(22, fontSize + delta));
    setFontSize(size);
    try { localStorage.setItem('ecojoi:attendance:font-size', String(size)); } catch {}
  }
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const draftVersion = useRef(0);
  const openingConversationLock = useRef(false);
  const [reply, setReply] = useState<{ conversationId: string; message: Message } | null>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const [sendingText, setSendingText] = useState(false);
  // Ref locks synchronously, before React renders the disabled state.
  const sendingTextRef = useRef(false);
  const textAttempt = useRef<{ draft: string; id: string; accepted: boolean } | null>(null);
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
  const [recoveringAttachment, setRecoveringAttachment] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{ conversationId: string; file: File } | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState('');
  useEffect(() => {
    if (!pendingAttachment?.file.type.startsWith('image/')) { setAttachmentPreview(''); return; }
    const url = URL.createObjectURL(pendingAttachment.file);
    setAttachmentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingAttachment]);
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

  const refreshSequence = useRef(0);
  const appliedRefresh = useRef(0);
  const inboundCursor = useRef<{ time: number; ids: Set<string> } | null>(null);
  const notificationAudio = useRef<AudioContext | null>(null);
  const nextNotificationAt = useRef(0);
  const [soundEnabled, setSoundEnabled] = useState(false);

  function trackIncoming(conversations: Conversation[], initialTime?: number) {
    const previous = inboundCursor.current;
    const cursor = { time: previous?.time ?? initialTime ?? 0, ids: new Set(previous?.ids) };
    let incoming = 0;

    for (const conversation of conversations) {
      for (const message of conversation.messages ?? []) {
        if (message.direction !== 'inbound') continue;
        const time = messageTime(message.created_at);
        if (previous && (time > previous.time || (time === previous.time && !previous.ids.has(message.id)))) incoming++;
        if (time > cursor.time) {
          cursor.time = time;
          cursor.ids.clear();
        }
        if (time === cursor.time) cursor.ids.add(message.id);
      }
    }
    inboundCursor.current = cursor;

    const audio = notificationAudio.current;
    if (!audio || audio.state !== 'running') return;
    for (let i = 0; i < incoming; i++) {
      const start = Math.max(audio.currentTime, nextNotificationAt.current);
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = 740;
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.15);
      nextNotificationAt.current = start + 0.22;
    }
  }

  useEffect(() => () => {
    const audio = notificationAudio.current;
    notificationAudio.current = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
  }, []);

  async function toggleNotificationSound() {
    try {
      const audio = notificationAudio.current ?? new AudioContext();
      notificationAudio.current = audio;
      if (audio.state === 'running') {
        await audio.suspend();
        setSoundEnabled(false);
      } else {
        await audio.resume();
        nextNotificationAt.current = 0;
        setSoundEnabled(true);
      }
    } catch {
      setError('O navegador não permitiu ativar o som do Atendimento.');
    }
  }

  async function refreshConversations() {
    const sequence = ++refreshSequence.current;
    const response = await fetch('/api/conversations', { cache: 'no-store' });
    if (!response.ok) return;
    const { data } = await response.json();
    const next: Conversation[] = data ?? [];
    const pinnedId = pinnedConversation.current;
    if (pinnedId && !next.some(item => item.id === pinnedId)) {
      const pinned = await fetchConversation(pinnedId);
      if (pinned) next.push(pinned);
    }
    if (sequence < appliedRefresh.current) return;
    appliedRefresh.current = sequence;
    trackIncoming(next);
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
    if (cr.ok) {
      trackIncoming(cd.data ?? [], messageTime(cr.headers.get('date') ?? undefined) || Date.now());
      setItems(cd.data ?? []);
    }
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
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshConversations().catch(() => {});
      }, 180);
    };

    const channel = supabase
      .channel(`ecojoi-attendance-${me.tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `tenant_id=eq.${me.tenantId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${me.tenantId}` }, refresh)
      .subscribe();

    const fallback = window.setInterval(() => void refreshConversations().catch(() => {}), 5000);
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

  const [attendantFilter, setAttendantFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [registeredTags, setRegisteredTags] = useState<{ id: string; name: string }[]>([]);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
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

  const visibleItems = useMemo(() => {
    const occupied = new Set(items.filter(item =>
      item.messages?.length || item.last_inbound_at || item.last_outbound_at
    ).flatMap(whatsappConversationKeys));
    return items.filter(item => {
      const keys = whatsappConversationKeys(item);
      if (!keys.length || item.messages?.length || item.last_inbound_at || item.last_outbound_at) return true;
      if (keys.some(key => occupied.has(key))) return false;
      keys.forEach(key => occupied.add(key));
      return true;
    });
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return visibleItems.filter(item => {
      if ((item.status === 'closed') !== showFinished) return false;
      if (!showFinished && (item.attendance_state ?? 'waiting') !== queue) return false;
      if (unreadOnly && unreadCount(item) === 0) return false;
      if (attendantFilter && (attendantFilter === 'unassigned' ? Boolean(item.assigned_to) : item.assigned_to !== attendantFilter)) return false;
      if (tagFilter && !item.contact?.contact_tags?.some(({ tag }) => tag?.id === tagFilter)) return false;
      if (channelFilter && item.channel !== channelFilter) return false;
      if (originFilter && acquisitionSource(item.contact) !== originFilter) return false;
      if (!needle) return true;
      const last = item.messages?.[item.messages.length - 1]?.body ?? '';
      return `${item.contact?.name ?? ''} ${item.contact?.email ?? ''} ${item.contact?.phone ?? ''} ${last}`.toLowerCase().includes(needle);
    }).sort((a, b) => {
      const comparison = conversationActivity(a) - conversationActivity(b)
        || String(a.last_inbound_at ?? '').localeCompare(String(b.last_inbound_at ?? ''));
      return oldestFirst ? comparison : -comparison;
    });
  }, [visibleItems, queue, showFinished, search, attendantFilter, tagFilter, channelFilter, originFilter, oldestFirst, unreadOnly, readState, readKey]);
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
  const [loadedQuote, setLoadedQuote] = useState<{ conversationId: string; messages: Message[] } | null>(null);
  const [quoteJump, setQuoteJump] = useState<{ conversationId: string; messageId: string } | null>(null);
  const activeMessages = useMemo(() => {
    const messages = active?.messages ?? [];
    if (!loadedQuote || loadedQuote.conversationId !== active?.id) return messages;
    const ids = new Set(messages.map(message => message.id));
    return [...messages, ...loadedQuote.messages.filter(message => !ids.has(message.id))]
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }, [active?.id, active?.messages, loadedQuote]);
  const messageByProviderId = useMemo(() => new Map(
    (activeMessages ?? []).flatMap(message => message.provider_message_id ? [[message.provider_message_id.trim(), message] as const] : [])
  ), [activeMessages]);
  useEffect(() => { draftVersion.current++; setReply(null); }, [activeId]);
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
  // The queue badge counts unread inbound messages, not open conversations.
  // It respects the operator's existing read markers, so a read queue shows 0.
  const queueCounts = useMemo(() => {
    const counts: Record<AttendanceState, number> = { waiting: 0, in_service: 0, automatic: 0 };
    for (const item of items) {
      if (item.status === 'closed') continue;
      counts[item.attendance_state ?? 'waiting'] += unreadCount(item);
    }
    return counts;
  }, [items, readState, readKey]);

  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!quoteJump || quoteJump.conversationId !== activeId) return;
    const target = document.getElementById(`message-${quoteJump.messageId}`);
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }, [activeId, quoteJump]);

  async function jumpToQuote(reference: string, original?: Message) {
    if (!active) return;
    const conversationId = active.id;
    if (original) {
      setQuoteJump({ conversationId, messageId: original.id });
      return;
    }

    setError('');
    try {
      const params = new URLSearchParams({ id: conversationId, quoted: reference.trim() });
      const response = await fetch(`/api/conversations?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      const message: Message | undefined = result.data?.[0]?.messages?.[0];
      if (!message || message.provider_message_id !== reference.trim()) {
        setError('A mensagem citada não foi encontrada no histórico deste atendimento.');
        return;
      }
      setLoadedQuote(current => ({
        conversationId,
        messages: [...(current?.conversationId === conversationId ? current.messages.filter(item => item.id !== message.id) : []), message]
      }));
      setQuoteJump({ conversationId, messageId: message.id });
    } catch {
      setError('Não foi possível buscar a mensagem citada. Tente novamente.');
    }
  }
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

  useEffect(() => {
    if (!text.trim() && textAttempt.current?.accepted) textAttempt.current = null;
  }, [text]);

  function clearSentDraft(version: number, conversationId: string) {
    if (draftVersion.current !== version) return;
    draftVersion.current++;
    setText('');
    setReply(current => current?.conversationId === conversationId ? null : current);
    setEmojiOpen(false);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    // Enter, a rapid second Enter and a click must never dispatch overlapping requests.
    if (sendingTextRef.current || sendingMedia || recording || !text.trim() || !active || active.attendance_state !== 'in_service') return;
    const messageBody = text.trim();
    const version = draftVersion.current;
    const conversationId = active.id;
    const replyId = replyTarget?.id;
    const draft = JSON.stringify([conversationId, replyId, messageBody]);
    const previous = textAttempt.current;
    if (previous?.draft === draft && previous.accepted) return;
    const attempt = previous?.draft === draft ? previous : { draft, id: crypto.randomUUID(), accepted: false };
    textAttempt.current = attempt;
    sendingTextRef.current = true;
    setSendingText(true);
    setError(''); setNotice('');
    try {
      const r = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: messageBody, reply_to_message_id: replyId, request_id: attempt.id })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        attempt.accepted = true;
        clearSentDraft(version, conversationId);
        if (d.delivery === 'failed') setError('O WhatsApp não confirmou o envio. Confira a conversa antes de enviar novamente.');
        else setNotice(d.delivery === 'queued' ? 'Mensagem enfileirada para o provedor do canal.' : 'Mensagem enviada.');
        if (d.data?.id) {
          const message: Message = { ...d.data, sender_name: null };
          setItems(current => current.map(item => item.id !== conversationId || item.messages.some(existing => existing.id === message.id)
            ? item : { ...item, messages: [...item.messages, message] }));
        }
        void refreshConversations().catch(() => {});
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
    } catch {
      setError('Falha de conexão ao enviar. Confira a conversa antes de tentar novamente.');
    } finally {
      sendingTextRef.current = false;
      setSendingText(false);
    }
  }

  async function recoverAttachment(message: Message) {
    if (!active || recoveringAttachment) return;
    setRecoveringAttachment(message.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/conversations/${active.id}/attachments/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 403 ? 'A recuperação requer permissão para gerenciar conversas.' : 'Não foi possível recuperar o anexo pelo provedor.');
        return;
      }
      if (!result.recovered) {
        setError('O WhatsApp não disponibilizou o arquivo para recuperação.');
        return;
      }
      await refreshConversations();
      setNotice('Anexo recuperado na conversa original.');
    } catch {
      setError('Falha de conexão ao recuperar o anexo.');
    } finally {
      setRecoveringAttachment(null);
    }
  }

  async function sendFile(file: File, durationMs?: number) {
    if (!active || active.attendance_state !== 'in_service' || sendingMedia) return false;
    const version = draftVersion.current;
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
          attachment_storage_failed: 'O armazenamento do CRM recusou o anexo. O arquivo não foi enviado.',
          unsupported_file_type: 'Este tipo de arquivo não é permitido.',
          ffmpeg_unavailable: 'Conversão de áudio indisponível no servidor. Instale FFmpeg antes de enviar gravações.',
          audio_conversion_failed: 'Não foi possível preparar um áudio compatível. Grave novamente ou use MP3.',
          audio_too_large: 'Áudio excede o limite de 16 MB do WhatsApp.',
          conversation_not_in_human_service: 'Assuma o atendimento antes de enviar anexos.',
          whatsapp_window_closed: 'A janela de 24 horas terminou. Envie um template aprovado antes de anexar arquivos.'
        };
        if (d.error === 'whatsapp_window_closed') setTemplateOpen(true);
        setError(messages[d.error] ?? (r.status === 413 ? 'O servidor recusou o tamanho do arquivo. Envie um arquivo menor.' : 'Não foi possível enviar o arquivo.'));
        return false;
      }
      clearSentDraft(version, active.id);
      setNotice(d.data?.status === 'queued' ? 'Arquivo enfileirado para envio no canal.' : 'Arquivo aceito pelo provedor. Aguarde a confirmação de entrega no WhatsApp.');
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

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && active) setPendingAttachment({ conversationId: active.id, file });
    e.target.value = '';
  }

  async function confirmAttachment() {
    if (!pendingAttachment || pendingAttachment.conversationId !== active?.id) return;
    if (await sendFile(pendingAttachment.file)) setPendingAttachment(current => current === pendingAttachment ? null : current);
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
    setShowFinished(conversation.status === 'closed');
    setQueue(conversation.attendance_state ?? 'waiting');
    setActiveId(id);
    setMobileChatOpen(true);
    setCreating(false);
  }

  async function createConversation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (openingConversationLock.current) return;
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const body = phoneMode
      ? { phone: form.get('phone'), channel: 'whatsapp', ...(name ? { name } : {}) }
      : { contact_id: form.get('contact_id'), channel: form.get('channel') };
    openingConversationLock.current = true;
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
      openingConversationLock.current = false;
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

  async function finishAttendance() {
    if (!active || changingState || !window.confirm('Finalizar o atendimento e solicitar a avaliação?')) return;
    setChangingState(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/conversations/${active.id}/finish`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        setError('Não foi possível finalizar o atendimento. Confira seu acesso e tente novamente.');
        return;
      }
      pinnedConversation.current = active.id;
      setShowFinished(true);
      setUnreadOnly(false);
      setSearch('');
      setItems(items => items.map(item => item.id === active.id ? {
        ...item, status: 'closed',
        messages: result.message && !item.messages.some(message => message.id === result.message.id)
          ? [...item.messages, result.message] : item.messages
      } : item));
      if (result.survey === 'failed' || result.survey === 'window_closed') {
        setError('Atendimento finalizado. O WhatsApp não confirmou o envio da avaliação.');
      } else {
        setNotice(result.survey === 'sent' ? 'Atendimento finalizado. Pedido de nota enviado.' : 'Atendimento finalizado.');
      }
      void refreshConversations().catch(() => {});
    } catch {
      setError('Falha ao finalizar. Confira o estado do atendimento antes de tentar novamente.');
    } finally {
      setChangingState(false);
    }
  }

  async function changeAttendance(state: AttendanceState) {
    if (!active || changingState || active.attendance_state === state) return;
    setChangingState(true); setError(''); setNotice('');
    try {
      const r = await fetch(`/api/conversations/${active.id}/attendance`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error === 'attendance_capacity_reached' ? 'Você atingiu o limite de atendimentos. Finalize um atendimento antes de assumir outro.' : d.error === 'attendance_state_update_failed' ? 'Não foi possível alterar a fila.' : 'Você não possui permissão para alterar esta fila.'); return; }
      setQueue(state); setActiveId(active.id); await load();
    } finally { setChangingState(false); }
  }

  async function sendTemplate(template: WhatsAppTemplate) {
    if (!active || active.status === 'closed') return;
    const version = draftVersion.current;
    setError(''); setNotice('');
    const r = await fetch(`/api/conversations/${active.id}/template`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: template.name, language: template.language, components: [] })
    });
    const d = await r.json().catch(() => null);
    if (r.ok) {
      clearSentDraft(version, active.id);
      setTemplateOpen(false);
      setNotice(d?.data?.delivery === 'sent' ? 'Template enviado.' : 'Template enfileirado para retentativa.');
      await refreshConversations();
    } else {
      const reason = d?.error;
      setError(reason === 'template_body_or_parameters_unavailable'
        ? 'Este template exige parâmetros ou não possui texto sincronizado. Revise o modelo aprovado antes de enviar.'
        : reason === 'template_not_approved_or_not_synced'
          ? 'O template não está aprovado ou sincronizado com a Meta. Atualize os templates.'
          : 'Não foi possível enviar o template do WhatsApp.');
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
    draftVersion.current++;
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
    draftVersion.current++;
    setReply({ conversationId: active.id, message });
    setReactionPicker(null);
    textInput.current?.focus();
  }

  function renderMessage(message: Message) {
    const original = message.reply_to_provider_id ? messageByProviderId.get(message.reply_to_provider_id.trim()) : undefined;
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
          {message.reply_to_provider_id && <button type="button" className={styles.messageQuote}
            onClick={() => void jumpToQuote(message.reply_to_provider_id!, original)}>
            {original && <b>{quoteAuthor(original)}</b>}
            <span>{original ? quoteSummary(original) : 'Localizar mensagem citada'}</span>
          </button>}
          {message.message_type === 'image' && message.attachment_url && (
            <a href={message.attachment_url} target="_blank" rel="noreferrer" className={styles.imageMessage}><img src={message.attachment_url} alt={message.attachment_name ?? 'Imagem'} /></a>
          )}
          {message.message_type === 'image' && !message.attachment_url && <small>Imagem indisponível</small>}
          {message.message_type === 'audio' && (message.attachment_path || message.attachment_url) && (
            <div className={styles.audioMessage}><Mic size={17}/><MessageAudio key={message.attachment_path ?? message.id} url={message.attachment_url} /></div>
          )}
          {message.message_type === 'audio' && !message.attachment_path && !message.attachment_url && <small>Áudio indisponível</small>}
          {active?.channel === 'whatsapp' && !message.attachment_url && message.provider_message_id
            && !message.provider_message_id.startsWith('wamid.') && ['image', 'audio', 'file'].includes(message.message_type ?? '') && (
              <button type="button" className="btn btn-secondary" disabled={Boolean(recoveringAttachment)}
                onClick={() => void recoverAttachment(message)}>
                {recoveringAttachment === message.id ? 'Recuperando…' : 'Recuperar anexo'}
              </button>
          )}
          {message.message_type === 'file' && message.attachment_url && (
            <a href={message.attachment_url} target="_blank" rel="noreferrer" className={styles.fileMessage}>
              <span className={styles.fileIcon}><FileText size={20}/></span>
              <span><b>{message.attachment_name ?? 'Arquivo'}</b><small>{formatSize(message.attachment_size)}</small></span>
              <Download size={17}/>
            </a>
          )}
          {body && !repeatsFileName && message.message_type !== 'audio' && <div className={styles.messageText}>{body}</div>}
          <div className={styles.reactionBar}>
            {active?.channel === 'whatsapp' && active.status !== 'closed' && active.attendance_state === 'in_service' && message.provider_message_id &&
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
          <div className={styles.messageMeta}><span>{formatTime(message.created_at)}</span>{message.direction === 'outbound' && (() => {
            const status = String(message.status || 'queued').toLowerCase();
            const failed = status === 'failed' || status === 'dead_letter';
            const queued = status === 'queued' || status === 'pending' || status === 'processing';
            const read = status === 'read';
            const delivered = status === 'delivered';
            const label = failed ? 'Falhou — não entregue' : queued ? 'Aguardando envio' : read ? 'Visualizado pelo destinatário' : delivered ? 'Entregue ao destinatário' : 'Aceito pelo provedor — entrega não confirmada';
            return <span title={label} aria-label={label} style={{display:'inline-flex',alignItems:'center',gap:3,color:failed?'#b91c1c':undefined}}>
              {failed ? <><AlertCircle size={14}/>Falhou</> : queued ? <><Clock3 size={14}/>Na fila</> : read || delivered ? <CheckCheck size={14} color={read?'#0ea5e9':undefined}/> : <Check size={14}/>}
            </span>;
          })()}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${styles.whatsappShell}`} data-message-size={fontSize} data-mobile-chat={mobileChatOpen ? "open" : "list"} data-details-open={detailsOpen && !!active}>
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
          <summary>Filtros de atendimento{(search || tagFilter || channelFilter || attendantFilter || originFilter || oldestFirst || unreadOnly) && <span> · Ativos</span>}</summary>
          <div className={styles.attendanceFilterFields}>
            <label className={styles.attendanceFilterSearch}><Search size={16}/><input className="input" aria-label="Nome, telefone ou mensagem" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, telefone ou mensagem" /></label>
            <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)}/> Somente não lidas</label>
            <select className="select" aria-label="Atendente" value={attendantFilter} onChange={event => setAttendantFilter(event.target.value)}><option value="">Todos atendentes</option><option value="unassigned">Sem atendente</option>{filterOptions.attendants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            <select className="select" aria-label="Tag" value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="">Todas tags</option>{filterOptions.tags.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            <select className="select" aria-label="Canal" value={channelFilter} onChange={event => setChannelFilter(event.target.value)}><option value="">Todos canais</option>{filterOptions.channels.map(channel => <option key={channel} value={channel}>{channelName(channel)}</option>)}</select>
            <select className="select" aria-label="Origem" value={originFilter} onChange={event => setOriginFilter(event.target.value)}><option value="">Todas origens</option>{filterOptions.origins.map(origin => <option key={origin}>{origin}</option>)}</select>
            <select className="select" aria-label="Ordem por última atividade" value={oldestFirst ? 'oldest' : 'recent'} onChange={e => setOldestFirst(e.target.value === 'oldest')}><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option></select>
            <button className="btn btn-secondary" type="button" disabled={!search && !attendantFilter && !tagFilter && !channelFilter && !originFilter && !oldestFirst && !unreadOnly} onClick={() => { setSearch(''); setAttendantFilter(''); setTagFilter(''); setChannelFilter(''); setOriginFilter(''); setOldestFirst(false); setUnreadOnly(false); }}>Limpar filtros</button>
          </div>
        </details>
        <button type="button" className="btn btn-secondary" aria-pressed={soundEnabled} onClick={() => void toggleNotificationSound()}>
          {soundEnabled ? 'Silenciar novas mensagens' : 'Ativar som de novas mensagens'}
        </button>
        <div className={styles.queueTabs} role="tablist">
          {QUEUES.map(({ state, label, Icon }) => <button key={state} type="button" className={!showFinished && queue === state ? styles.queueActive : ''} onClick={() => { setShowFinished(false); setQueue(state); }}><Icon size={14}/><span>{label}</span><b>{queueCounts[state]}</b></button>)}
        </div>
        <button type="button" className="btn btn-secondary" aria-pressed={showFinished} onClick={() => setShowFinished(value => !value)}>Finalizados</button>
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
              <button type="button" className="btn btn-secondary" aria-label="Diminuir fonte das mensagens" title="Diminuir fonte" disabled={fontSize <= 12} onClick={() => changeFontSize(-2)}>A−</button>
              <button type="button" className="btn btn-secondary" aria-label="Aumentar fonte das mensagens" title="Aumentar fonte" disabled={fontSize >= 22} onClick={() => changeFontSize(2)}>A+</button>
              {active.status !== 'closed' && active.attendance_state !== 'in_service' && <button className="btn btn-primary" disabled={changingState} onClick={() => void changeAttendance('in_service')}><UserCheck size={15}/>Assumir</button>}
              {active.status !== 'closed' && active.attendance_state === 'in_service' && <><button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}><Clock3 size={15}/>Esperar</button><button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('automatic')}><Bot size={15}/>Agente IA</button></>}
              {active.status !== 'closed' && active.attendance_state === 'automatic' && <button className="btn btn-secondary" disabled={changingState} onClick={() => void changeAttendance('waiting')}><Clock3 size={15}/>Espera</button>}
              {active.channel === 'whatsapp' && templates.length > 0 && <button className="btn btn-secondary" type="button" onClick={() => setTemplateOpen(v => !v)}><FileText size={15}/>Template</button>}
              {canTransfer && active.status !== 'closed' && <button type="button" className="btn btn-secondary"
                title="Transferir atendimento" disabled={transferBusy || changingState}
                aria-expanded={transfer?.conversationId === active.id}
                onClick={() => transfer?.conversationId === active.id ? setTransfer(null) : void prepareTransfer()}>
                <ArrowRightLeft size={15}/><span>Transferir</span>
              </button>}
              {canTransfer && active.status !== 'closed' && active.attendance_state === 'in_service' &&
                <button type="button" className="btn btn-secondary" title="Finalizar atendimento"
                  disabled={changingState || transferBusy} onClick={() => void finishAttendance()}>
                  <CheckCircle2 size={15}/><span>Finalizar</span>
                </button>}
              <button type="button" className={styles.roundButton} onClick={() => toggleDetails(!detailsOpen)} aria-label={detailsOpen ? "Ocultar detalhes do contato" : "Mostrar detalhes do contato"} title={detailsOpen ? "Ocultar detalhes do contato" : "Mostrar detalhes do contato"} aria-expanded={detailsOpen} aria-controls="attendance-contact-details">{detailsOpen ? <PanelRightClose size={20}/> : <PanelRightOpen size={20}/>}</button>
            </div>
          </header>
          {active.status !== 'closed' && transfer?.conversationId === active.id && <form id="attendance-transfer" className={styles.transferForm} onSubmit={transferConversation}>
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
            </form>}
          {transferFeedback && <p className={styles.transferFeedback} role="status">{transferFeedback}</p>}

          {templateOpen && active.channel === 'whatsapp' && <div className={styles.templatePanel}><div className={styles.templateHeader}><strong>Templates aprovados</strong><button type="button" className={styles.roundButton} onClick={() => setTemplateOpen(false)}><X size={16}/></button></div><div className={styles.templateList}>{templates.filter(t => t.status?.toUpperCase() === 'APPROVED').map(t => <button key={t.id} type="button" onClick={() => void sendTemplate(t)} disabled={!templatePreview(t)} title={templatePreview(t) || 'Template sem texto sincronizado'}><span><b>{t.name}</b><small>{t.language} · {t.category ?? 'WhatsApp'}</small><small style={{whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{templatePreview(t) || 'Sincronize o conteúdo deste template antes de enviar'}</small></span><Send size={14}/></button>)}</div></div>}
          {active.status !== 'closed' && active.attendance_state === 'automatic' && <div className={`${styles.modeBanner} ${styles.aiBanner}`}><Bot size={17}/><div><b>{aiAgentEnabled ? 'Agente de IA atendendo' : 'Modo automático selecionado'}</b><span>{aiAgentEnabled ? 'Assuma o atendimento para responder manualmente.' : 'Ative o Agente de IA nas configurações da empresa para respostas automáticas.'}</span></div></div>}
          {active.status !== 'closed' && active.attendance_state === 'waiting' && <div className={`${styles.modeBanner} ${styles.waitingBanner}`}><Clock3 size={17}/><div><b>Aguardando atendimento</b><span>Assuma esta conversa para liberar texto, áudio, emojis e anexos.</span></div></div>}

          <div className={styles.messages} ref={messagesRef}>{activeMessages.length ? activeMessages.map(renderMessage) : <div className={styles.empty}>Envie a primeira mensagem deste atendimento.</div>}</div>

          {active.status !== 'closed' && active.attendance_state === 'in_service' ? <>
            {(error || notice) && <div className={error ? styles.errorBar : styles.noticeBar}>{error || notice}</div>}
            {pastedImage?.conversationId === active?.id && <div className={styles.pastedAttachment}>
              {pastedPreview && <img src={pastedPreview} alt="Prévia da imagem colada"/>}
              <span>Imagem colada</span>
              <button type="button" className="btn btn-secondary" disabled={sendingMedia} onClick={() => setPastedImage(null)}>Remover</button>
              <button type="button" className="btn btn-primary" disabled={sendingMedia || recording} onClick={() => void sendPastedImage()}>Enviar imagem</button>
            </div>}
            {pendingAttachment?.conversationId === active.id && <div className={styles.pastedAttachment} role="group" aria-label="Confirmar anexo antes do envio">
              {attachmentPreview && <img src={attachmentPreview} alt="Prévia do arquivo selecionado"/>}
              <span>{pendingAttachment.file.name} · {formatSize(pendingAttachment.file.size)}</span>
              <button type="button" className="btn btn-secondary" disabled={sendingMedia} onClick={() => setPendingAttachment(null)}>Cancelar anexo</button>
              <button type="button" className="btn btn-primary" disabled={sendingMedia || recording} onClick={() => void confirmAttachment()}>{sendingMedia ? 'Enviando…' : 'Confirmar envio'}</button>
            </div>}
            <form className={styles.composer} onSubmit={send}>
              {replyTarget && <div className={styles.replyPreview} aria-label="Mensagem a que você está respondendo">
                <div className={styles.messageQuote}><b>{quoteAuthor(replyTarget)}</b><span>{quoteSummary(replyTarget)}</span></div>
                <button type="button" className={styles.roundButton} aria-label="Cancelar resposta" title="Cancelar resposta"
                  onClick={() => { draftVersion.current++; setReply(null); }}><X size={18}/></button>
              </div>}
              <div className={styles.composerTools}>
                <button type="button" className={styles.composerIcon} onClick={() => setEmojiOpen(v => !v)} title="Emojis" aria-label="Emoji" aria-expanded={emojiOpen}><Smile size={22}/></button>
                <button type="button" className={styles.composerIcon} onClick={() => fileInput.current?.click()} disabled={sendingMedia} title="Anexar arquivo" aria-label="Anexar arquivo"><Paperclip size={22}/></button>
                <input ref={fileInput} type="file" hidden onChange={onFileChange} accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
                {emojiOpen && <div className={styles.emojiPicker}>{EMOJIS.map(emoji => <button key={emoji} type="button" onClick={() => { draftVersion.current++; setText(value => value + emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
              </div>
              {recording ? <div className={styles.recording}><span className={styles.recordDot}/><b>Gravando áudio</b><span>{String(Math.floor(recordSeconds / 60)).padStart(2,'0')}:{String(recordSeconds % 60).padStart(2,'0')}</span></div> : <div className={styles.messageInputWrap}>{quickMatches.length > 0 && <div className={styles.quickReplies}>{quickMatches.map(reply => <button type="button" key={reply.id} onClick={() => applyQuickReply(reply)}><b>/{reply.shortcut}</b><span>{reply.title}</span></button>)}</div>}<textarea ref={textInput} lang="pt-BR" spellCheck={true} rows={1} value={text} onChange={e => { draftVersion.current++; setText(e.target.value); }}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
                  e.preventDefault();
                  if (!e.repeat && !sendingTextRef.current) e.currentTarget.form?.requestSubmit();
                }}
                aria-label="Mensagem" title="Enter para enviar; Shift+Enter para quebrar linha"
                placeholder="Digite uma mensagem ou /atalho" /></div>}
              <div className={styles.composerActions}>
                {recording ? <button type="button" className={`${styles.sendButton} ${styles.stopButton}`} onClick={stopRecording} title="Parar e enviar áudio" aria-label="Parar gravação"><Square size={18}/></button> : <button type="button" className={styles.composerIcon} onClick={startRecording} disabled={sendingMedia} title="Gravar áudio" aria-label="Gravar áudio"><Mic size={20}/></button>}
                <button className={styles.sendButton} type="submit" disabled={!text.trim() || recording || sendingMedia || sendingText} title="Enviar mensagem" aria-label="Enviar"><Send size={19}/></button>
              </div>
            </form>
          </> : <div className={styles.lockedComposer}>{active.attendance_state === 'automatic' ? <Bot size={18}/> : <Clock3 size={18}/>}<span>{active.status === 'closed' ? 'Atendimento finalizado.' : active.attendance_state === 'automatic' ? 'Envio humano bloqueado enquanto o agente automático estiver responsável.' : 'Assuma o atendimento para responder.'}</span></div>}
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
          {detailsOpen && active.contact?.id && <>
            <ContactDeals key={active.contact.id} contactId={active.contact.id} />
            <hr/>
          </>}
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
