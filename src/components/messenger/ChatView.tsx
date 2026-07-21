"use client";

// =============================================================================
//  Messenger — center panel: real-time message thread
//  Socket.io events drive incoming messages; optimistic UI on send.
// =============================================================================

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  Mic,
  MicOff,
  VideoOff,
  Volume2,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Info,
  X,
  Reply,
  Image as ImageIcon,
  Loader2,
  Forward,
  Star,
  Pin,
  PinOff,
  MessageSquare,
  Bookmark,
  Minimize2,
  Maximize2,
  Palette,
  RefreshCw,
  Pencil,
  Trash2,
  CalendarClock,
  BarChart3,
  AtSign,
  Flag,
} from "lucide-react";
import type { Conversation, Message, ScheduledMessage } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { cn, clockTime, uid } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { RoleBadge, PremiumBadge, VerifiedBadge } from "@/components/shared/RoleBadge";
import { useSocket } from "@/context/SocketProvider";
import { api, normalizeMessage } from "@/lib/api";
import { uploadMediaDetailed, type UploadProgress } from "@/lib/upload";
import { MediaViewer, type MediaViewerItem } from "@/components/shared/MediaViewer";
import { saveItem } from "@/lib/saved";
import { pushGlobalToast } from "@/lib/toast";
import { CustomSelect } from "@/components/shared/CustomSelect";
import { cacheKey, readClientCache, writeClientCache } from "@/lib/clientCache";
import { getConversationOutbox, removeOutboxMessage, subscribeToOutboxMessages, upsertOutboxMessage } from "@/lib/messageOutbox";
import { buildMessageSearchIndex, searchMessageIndex } from "@/lib/messageSearch";
import { getConversationFirstPage, peekConversationPrefetch } from "@/lib/conversationPrefetch";
import { clearChatDraft, getChatDraft, saveChatDraft } from "@/lib/chatDrafts";
import { PollCard } from "@/components/messenger/PollCard";
import { CreatePollModal } from "@/components/messenger/CreatePollModal";

const STICKERS = ["🌙", "✨", "🔥", "💜", "😎", "🚀", "🌃", "💫", "🎧", "🦊", "👾", "💎"];
const QUICK_MESSAGE_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢"];
const EMOJIS = [
  "👍", "👎", "❤️", "💜", "🖤", "🤍", "😂", "🤣", "😊", "😍", "😘", "😎",
  "😮", "😳", "🥺", "😭", "😢", "😡", "🤯", "🥶", "😈", "💀", "👀", "🙈",
  "🔥", "✨", "💫", "⭐", "🌙", "☀️", "⚡", "💎", "🎉", "🎁", "🚀", "🫶",
  "👏", "🙏", "💪", "🤝", "👌", "🤌", "💯", "✅", "❌", "⚠️", "🎧", "🎮",
];
const MESSAGE_LIMIT = 4096;
const MESSAGE_CACHE_MAX_AGE = 60 * 60 * 1000;
const MESSAGE_STALE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MESSAGE_CACHE_LIMIT = 500;
const MESSAGE_WINDOW_INITIAL = 60;
const MESSAGE_WINDOW_STEP = 60;
const MESSAGE_ACK_TIMEOUT_MS = 12_000;
const MEDIA_BATCH_LIMIT = 10;
const MEDIA_SIZE_LIMIT = 50 * 1024 * 1024;
const USE_GLOBAL_CALLS = true;
const VOICE_PREFIX = "__voice:";
const VOICE_MAX_SECONDS = 180;

function toLocalDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatScheduledDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
const CHAT_THEMES = [
  { id: "nebula", label: "Nebula", emoji: "💜", main: "#a855f7", secondary: "#ec4899", bg: "radial-gradient(circle at 15% 20%, rgba(168,85,247,0.18), transparent 40%), radial-gradient(circle at 90% 85%, rgba(236,72,153,0.14), transparent 42%)" },
  { id: "ocean", label: "Ocean", emoji: "🌊", main: "#22d3ee", secondary: "#6366f1", bg: "radial-gradient(circle at 20% 15%, rgba(34,211,238,0.16), transparent 42%), radial-gradient(circle at 85% 80%, rgba(99,102,241,0.16), transparent 42%)" },
  { id: "gold", label: "Gold", emoji: "✨", main: "#fbbf24", secondary: "#f97316", bg: "radial-gradient(circle at 18% 25%, rgba(251,191,36,0.16), transparent 42%), radial-gradient(circle at 85% 80%, rgba(249,115,22,0.12), transparent 42%)" },
  { id: "emerald", label: "Emerald", emoji: "💚", main: "#34d399", secondary: "#14b8a6", bg: "radial-gradient(circle at 18% 25%, rgba(52,211,153,0.15), transparent 42%), radial-gradient(circle at 85% 80%, rgba(20,184,166,0.12), transparent 42%)" },
  { id: "blood", label: "Blood Moon", emoji: "🩸", main: "#fb7185", secondary: "#ef4444", bg: "radial-gradient(circle at 18% 25%, rgba(251,113,133,0.15), transparent 42%), radial-gradient(circle at 85% 80%, rgba(239,68,68,0.12), transparent 42%)" },
] as const;

function buildIceServers(): RTCIceServer[] {
  const stunUrls = (process.env.NEXT_PUBLIC_STUN_URLS || "stun:stun.l.google.com:19302")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const turnUrls = (process.env.NEXT_PUBLIC_TURN_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME || undefined;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined;

  const servers: RTCIceServer[] = [];
  if (stunUrls.length > 0) servers.push({ urls: stunUrls });
  if (turnUrls.length > 0) {
    servers.push(username && credential ? { urls: turnUrls, username, credential } : { urls: turnUrls });
  }
  return servers;
}

type DraftMedia = { id: string; file: File; url: string; type: "image" | "video" | "file"; size: number; name: string };
type ActiveUpload = UploadProgress & { fileName: string; index: number; totalFiles: number };
type VoiceDraft = { blob: Blob; url: string; durationSec: number };
type CallState = { callId: string; type: "audio" | "video"; status: "outgoing" | "incoming" | "active" | "ended"; fromUsername?: string };

export function ChatView({
  conversation,
  initialMessageId,
  onInitialMessageHandled,
  onBack,
  onToggleInfo,
  onConversationPatch,
}: {
  conversation: Conversation;
  initialMessageId?: string | null;
  onInitialMessageHandled?: () => void;
  onBack: () => void;
  onToggleInfo: () => void;
  onConversationPatch?: (id: string, patch: Partial<Conversation>) => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const socket = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingOlder, setHistoryLoadingOlder] = useState(false);
  const [visibleMessageCount, setVisibleMessageCount] = useState(MESSAGE_WINDOW_INITIAL);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [schedulingMessage, setSchedulingMessage] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [activeMessageActionsId, setActiveMessageActionsId] = useState<string | null>(null);
  const [isTouchInput, setIsTouchInput] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [chatThemeId, setChatThemeId] = useState<(typeof CHAT_THEMES)[number]["id"]>("nebula");
  const [showStickers, setShowStickers] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [typing, setTyping] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<ActiveUpload | null>(null);
  const [sendOriginal, setSendOriginal] = useState(false);
  const [draftMedia, setDraftMedia] = useState<DraftMedia[]>([]);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [viewer, setViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardConversations, setForwardConversations] = useState<Conversation[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [deviceLists, setDeviceLists] = useState<{ audioInputs: MediaDeviceInfo[]; videoInputs: MediaDeviceInfo[]; audioOutputs: MediaDeviceInfo[] }>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const preserveScrollHeightRef = useRef<number | null>(null);
  const revealOlderFrameRef = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const actionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMessageHandledRef = useRef<string | null>(null);
  const draftReadyRef = useRef(false);
  const draftTextRef = useRef("");
  const draftBeforeEditRef = useRef("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageAckTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messagesRef = useRef<Message[]>([]);
  const historyBeforeCursorRef = useRef<string | null>(null);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStartedAtRef = useRef<number>(0);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const iceBufferRef = useRef<RTCIceCandidateInit[]>([]);

  const clearMessageAckTimer = useCallback((clientId: string) => {
    const timer = messageAckTimersRef.current.get(clientId);
    if (timer) clearTimeout(timer);
    messageAckTimersRef.current.delete(clientId);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    draftTextRef.current = text;
  }, [text]);

  useEffect(() => {
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const sync = () => setIsTouchInput(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => () => {
    if (actionCloseTimerRef.current) clearTimeout(actionCloseTimerRef.current);
  }, []);

  useEffect(() => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setUploadProgress(null);
    setActiveMessageActionsId(null);
    setEditingMessage(null);
    setPinnedPanelOpen(false);
    setFocusedMessageId(null);
    setSchedulePanelOpen(false);
    setPollModalOpen(false);
    initialMessageHandledRef.current = null;
  }, [conversation.id]);

  useEffect(() => {
    draftReadyRef.current = false;
    const draft = getChatDraft(user?.id, conversation.id);
    draftTextRef.current = draft?.text || "";
    setText(draftTextRef.current);
    setReplyTo(null);
    window.requestAnimationFrame(() => { draftReadyRef.current = true; });
    return () => {
      if (draftReadyRef.current) {
        saveChatDraft(user?.id, { conversationId: conversation.id, text: draftTextRef.current, updatedAt: new Date().toISOString() });
      }
      draftReadyRef.current = false;
    };
  }, [conversation.id, user?.id]);

  useEffect(() => {
    if (!draftReadyRef.current || editingMessage) return;
    const timer = window.setTimeout(() => {
      saveChatDraft(user?.id, {
        conversationId: conversation.id,
        text,
        updatedAt: new Date().toISOString(),
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [conversation.id, editingMessage, text, user?.id]);

  useEffect(() => {
    let active = true;
    setScheduledLoading(true);
    api.getScheduledMessages(conversation.id)
      .then((items) => { if (active) setScheduledMessages(items); })
      .catch(() => { if (active) setScheduledMessages([]); })
      .finally(() => { if (active) setScheduledLoading(false); });
    return () => { active = false; };
  }, [conversation.id]);

  useEffect(() => {
    let active = true;
    api.getPinnedMessages(conversation.id)
      .then((items) => { if (active) setPinnedMessages(items); })
      .catch(() => { if (active) setPinnedMessages([]); });
    return () => { active = false; };
  }, [conversation.id]);

  const cancelMessageActionsClose = useCallback(() => {
    if (actionCloseTimerRef.current) clearTimeout(actionCloseTimerRef.current);
    actionCloseTimerRef.current = null;
  }, []);

  const openMessageActions = useCallback((messageId: string) => {
    cancelMessageActionsClose();
    setActiveMessageActionsId(messageId);
  }, [cancelMessageActionsClose]);

  const scheduleMessageActionsClose = useCallback((delay = 650) => {
    cancelMessageActionsClose();
    actionCloseTimerRef.current = setTimeout(() => {
      setActiveMessageActionsId(null);
      actionCloseTimerRef.current = null;
    }, delay);
  }, [cancelMessageActionsClose]);

  const activeActionMessage = useMemo(
    () => messages.find((message) => message.id === activeMessageActionsId) ?? null,
    [activeMessageActionsId, messages],
  );

  const isGroupChat = conversation.type === "group";
  const messagePeer = useMemo(
    () => messages.find((message) => message.senderId !== user?.id && message.sender)?.sender,
    [messages, user?.id],
  );
  const messagePeerParticipant = useMemo<Conversation["participants"][number] | null>(() => messagePeer ? {
    id: messagePeer.id || "",
    username: messagePeer.username || "",
    displayName: messagePeer.displayName || messagePeer.username || "Пользователь",
    avatarUrl: messagePeer.avatarUrl ?? null,
    nameColor: messagePeer.nameColor || "#ffffff",
    role: "member",
    isPremium: messagePeer.isPremium,
    avatarFrame: messagePeer.avatarFrame,
    verified: messagePeer.verified,
    isOnline: messagePeer.isOnline ?? false,
  } : null, [messagePeer]);
  const fallbackParticipant: Conversation["participants"][number] = {
    id: "",
    username: "",
    displayName: conversation.title && conversation.title !== "Чат" ? conversation.title : "Пользователь",
    avatarUrl: conversation.avatarUrl,
    nameColor: "#ffffff",
    role: "member",
    isOnline: false,
  };
  const other = conversation.participants.find((p) => p.id !== user?.id)
    ?? (!isGroupChat ? messagePeerParticipant : null)
    ?? conversation.participants[0]
    ?? fallbackParticipant;
  const chatTitle = !isGroupChat
    ? (other.displayName || other.username || conversation.title || "Чат")
    : conversation.title;
  const chatAvatarUrl = !isGroupChat ? (other.avatarUrl ?? conversation.avatarUrl) : conversation.avatarUrl;
  const chatOnline = !isGroupChat ? Boolean(other.isOnline || conversation.isOnline) : conversation.isOnline;
  const isChannelChat = isGroupChat && /(?:· чат|чат канала)/i.test(conversation.title);
  const profileTarget = !isGroupChat && other.username ? other.username : null;
  const requestPending = conversation.requestStatus === "pending";
  const selectedChatTheme = CHAT_THEMES.find((theme) => theme.id === chatThemeId) ?? CHAT_THEMES[0];
  const otherStatusActive = Boolean(other.nightStatusText && (!other.nightStatusExpiresAt || new Date(other.nightStatusExpiresAt).getTime() > Date.now()));
  const participantById = useMemo(() => {
    const map = new Map<string, Conversation["participants"][number]>();
    for (const participant of conversation.participants) {
      if (participant.id) map.set(String(participant.id), participant);
    }
    return map;
  }, [conversation.participants]);
  const selfParticipant = conversation.participants.find((participant) => participant.id === user?.id);
  const canManageMessagePins = !isGroupChat || ["owner", "admin"].includes(selfParticipant?.role || "member");
  const latestPinnedMessage = pinnedMessages[0] ?? null;
  const mentionMatch = useMemo(() => text.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/), [text]);
  const mentionSuggestions = useMemo(() => {
    if (!mentionMatch || editingMessage) return [];
    const query = String(mentionMatch[1] || "").toLowerCase();
    return conversation.participants
      .filter((participant) => participant.id !== user?.id && participant.username && participant.username.toLowerCase().includes(query))
      .slice(0, 6);
  }, [conversation.participants, editingMessage, mentionMatch, user?.id]);

  useEffect(() => {
    if (isGroupChat || !messagePeerParticipant?.id) return;
    const alreadyHasPeer = conversation.participants.some((participant) => String(participant.id) === String(messagePeerParticipant.id));
    if (alreadyHasPeer) return;
    onConversationPatch?.(conversation.id, {
      title: messagePeerParticipant.displayName || messagePeerParticipant.username || conversation.title,
      avatarUrl: messagePeerParticipant.avatarUrl ?? conversation.avatarUrl,
      participants: [...conversation.participants, messagePeerParticipant],
      isOnline: messagePeerParticipant.isOnline,
      avatarFrame: messagePeerParticipant.avatarFrame ?? conversation.avatarFrame,
      verified: messagePeerParticipant.verified ?? conversation.verified,
      isPremium: messagePeerParticipant.isPremium ?? conversation.isPremium,
    });
  }, [conversation, isGroupChat, messagePeerParticipant, onConversationPatch]);

  const iceServers = useMemo(() => buildIceServers(), []);
  const turnEnabled = useMemo(() => iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => String(url).startsWith("turn:" ) || String(url).startsWith("turns:"));
  }), [iceServers]);
  const rtcConfig = useMemo<RTCConfiguration>(() => ({
    iceServers,
    iceCandidatePoolSize: 4,
  }), [iceServers]);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setDeviceLists({
      audioInputs: devices.filter((d) => d.kind === "audioinput"),
      videoInputs: devices.filter((d) => d.kind === "videoinput"),
      audioOutputs: devices.filter((d) => d.kind === "audiooutput"),
    });
  }

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, []);

  useEffect(() => {
    if (remoteVideoRef.current && selectedSpeakerId && "setSinkId" in remoteVideoRef.current) {
      (remoteVideoRef.current as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(selectedSpeakerId).catch(() => {});
    }
  }, [remoteStream, selectedSpeakerId]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    const key = `ng_chat_theme:${conversation.id}`;
    const stored = localStorage.getItem(key);
    if (stored && CHAT_THEMES.some((theme) => theme.id === stored)) setChatThemeId(stored as (typeof CHAT_THEMES)[number]["id"]);
    else setChatThemeId("nebula");
    setThemePanelOpen(false);
  }, [conversation.id]);

  function applyChatTheme(themeId: (typeof CHAT_THEMES)[number]["id"]) {
    setChatThemeId(themeId);
    localStorage.setItem(`ng_chat_theme:${conversation.id}`, themeId);
    pushGlobalToast("Тема чата применена", "success");
  }

  useEffect(() => {

    let active = true;
    if (!other?.id || other.id === user?.id) return;
    api.getSocial()
      .then((social) => {
        if (!active) return;
        const blockedList = (social.blocked ?? []) as Record<string, unknown>[];
        setBlocked(blockedList.some((x) => String(x.id) === String(other.id)));
      })
      .catch(() => active && setBlocked(false));
    return () => { active = false; };
  }, [other?.id, user?.id]);

  // Load cached history immediately, then revalidate in the background.
  useEffect(() => {
    let active = true;
    const key = cacheKey(user?.id, `messages:${conversation.id}`);
    const cached = readClientCache<Message[]>(key, MESSAGE_CACHE_MAX_AGE, MESSAGE_STALE_MAX_AGE);
    const restored = cached?.map((message) => (
      message.status === "sending" ? { ...message, status: "queued" as const } : message
    )) ?? [];
    const outbox = getConversationOutbox(user?.id, conversation.id).map((message) => (
      message.status === "sending" ? { ...message, status: "queued" as const } : message
    ));
    const prefetchedPage = peekConversationPrefetch(user?.id, conversation.id);
    const initialMessagesBuffer: Message[] = [];
    const initialIndexById = new Map<string, number>();
    const initialIndexByClientId = new Map<string, number>();
    const addInitialMessage = (message: Message) => {
      const existingIndex = initialIndexById.get(message.id)
        ?? (message.clientId ? initialIndexByClientId.get(message.clientId) : undefined);
      if (existingIndex === undefined) {
        const nextIndex = initialMessagesBuffer.length;
        initialMessagesBuffer.push(message);
        initialIndexById.set(message.id, nextIndex);
        if (message.clientId) initialIndexByClientId.set(message.clientId, nextIndex);
        return;
      }
      initialMessagesBuffer[existingIndex] = message;
      initialIndexById.set(message.id, existingIndex);
      if (message.clientId) initialIndexByClientId.set(message.clientId, existingIndex);
    };
    for (const message of restored) addInitialMessage(message);
    for (const message of outbox) addInitialMessage(message);
    // Confirmed server messages win over an outbox copy with the same clientId.
    for (const message of prefetchedPage?.messages ?? []) addInitialMessage(normalizeMessage(message));
    const initialMessages = initialMessagesBuffer.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const initialBefore = [
      initialMessages.find((message) => !["queued", "failed", "sending"].includes(message.status))?.createdAt,
      prefetchedPage?.nextBefore,
    ].filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;

    setHistoryLoading(initialMessages.length === 0 && !prefetchedPage);
    setHistoryHasMore(prefetchedPage?.hasMore ?? false);
    setHistoryLoadingOlder(false);
    historyBeforeCursorRef.current = initialBefore;
    setMessages(initialMessages);
    setVisibleMessageCount(MESSAGE_WINDOW_INITIAL);
    stickToBottomRef.current = true;
    previousMessageCountRef.current = 0;
    setReplyTo(null);
    setForwardMessage(null);
    setSearchIndex(0);

    getConversationFirstPage(user?.id, conversation.id).then((page) => {
      if (!active) return;
      const normalized = page.messages.map(normalizeMessage);
      const cachedBefore = initialMessages.find((message) => !["queued", "failed", "sending"].includes(message.status))?.createdAt ?? null;
      historyBeforeCursorRef.current = [cachedBefore, page.nextBefore]
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
      setHistoryHasMore(page.hasMore);
      setMessages((current) => {
        const next = [...current];
        const byId = new Map(next.map((message, index) => [message.id, index]));
        const byClientId = new Map(next.filter((message) => message.clientId).map((message, index) => [message.clientId!, index]));
        for (const message of normalized) {
          const existingIndex = byId.get(message.id) ?? (message.clientId ? byClientId.get(message.clientId) : undefined);
          if (existingIndex === undefined) next.push(message);
          else next[existingIndex] = message;
          if (message.clientId) removeOutboxMessage(user?.id, message.clientId);
        }
        return next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      });
      onConversationPatch?.(conversation.id, { unreadCount: 0 });
    }).catch(() => {
      // Keep cached history visible when the network is temporarily slow.
      setHistoryHasMore(Boolean(historyBeforeCursorRef.current));
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => {
      active = false;
    };
  }, [conversation.id, onConversationPatch, user?.id]);

  useEffect(() => {
    if (historyLoading || messages.length === 0) return;
    if (messages.some((message) => message.conversationId !== conversation.id)) return;
    const key = cacheKey(user?.id, `messages:${conversation.id}`);
    const pending = messages.filter((message) => ["queued", "failed", "sending"].includes(message.status));
    const pendingIds = new Set(pending.map((message) => message.clientId || message.id));
    const recentSettled = messages
      .filter((message) => !pendingIds.has(message.clientId || message.id))
      .slice(-MESSAGE_CACHE_LIMIT);
    const safeForRestore = [...recentSettled, ...pending]
      .map((message) => (message.status === "sending" ? { ...message, status: "queued" as const } : message))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    writeClientCache(key, safeForRestore);
  }, [conversation.id, historyLoading, messages, user?.id]);

  useEffect(() => {
    if (!forwardMessage) return;
    setForwardLoading(true);
    api.getConversations()
      .then((data) => setForwardConversations(data.filter((c) => c.id !== conversation.id)))
      .catch(() => setForwardConversations([]))
      .finally(() => setForwardLoading(false));
  }, [conversation.id, forwardMessage]);

  // Join the Socket.io room for this conversation so real-time messages
  // and reactions are scoped to the active chat.
  useEffect(() => {
    const join = () => socket.emit("conversation:join", conversation.id);
    join();
    socket.on("connect", join);
    localStorage.setItem("ng_active_conversation", conversation.id);
    window.dispatchEvent(new CustomEvent("nightgram:active-conversation", { detail: { conversationId: conversation.id } }));
    return () => {
      socket.off("connect", join);
      socket.emit("conversation:leave", conversation.id);
      if (localStorage.getItem("ng_active_conversation") === conversation.id) {
        localStorage.removeItem("ng_active_conversation");
        window.dispatchEvent(new CustomEvent("nightgram:active-conversation", { detail: { conversationId: null } }));
      }
    };
  }, [socket, conversation.id]);

  useEffect(() => {
    const onDisconnect = () => {
      messageAckTimersRef.current.forEach((timer) => clearTimeout(timer));
      messageAckTimersRef.current.clear();
      for (const message of getConversationOutbox(user?.id, conversation.id)) {
        if (message.status === "sending") upsertOutboxMessage(user?.id, { ...message, status: "queued" });
      }
      setMessages((prev) => prev.map((message) => (
        message.senderId === user?.id && message.status === "sending"
          ? { ...message, status: "queued" }
          : message
      )));
    };
    socket.on("disconnect", onDisconnect);
    return () => { socket.off("disconnect", onDisconnect); };
  }, [conversation.id, socket, user?.id]);

  useEffect(() => {
    if (USE_GLOBAL_CALLS) return;
    const incoming = ({ conversationId, callId, fromUserId, fromUsername, type }: { conversationId: string; callId: string; fromUserId: string; fromUsername: string; type: "audio" | "video" }) => {
      if (conversationId !== conversation.id || fromUserId === user?.id) return;
      setCallMinimized(true);
      setCallState((prev) => prev ?? { callId, type, status: "incoming", fromUsername });
    };
    const offer = ({ conversationId, callId, fromUserId, offer, type }: { conversationId: string; callId: string; fromUserId: string; offer: RTCSessionDescriptionInit; type: "audio" | "video" }) => {
      if (conversationId !== conversation.id || fromUserId === user?.id) return;
      setPendingOffer(offer);
      setCallMinimized(true);
      setCallState((prev) => prev ?? { callId, type, status: "incoming", fromUsername: other.username });
    };
    const answer = async ({ conversationId, callId, fromUserId, answer }: { conversationId: string; callId: string; fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      if (conversationId !== conversation.id || fromUserId === user?.id) return;
      if (peerRef.current && callState?.callId === callId) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
        setCallMinimized(false);
        setCallState((prev) => prev?.callId === callId ? { ...prev, status: "active" } : prev);
      }
    };
    const ice = async ({ conversationId, callId, fromUserId, candidate }: { conversationId: string; callId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (conversationId !== conversation.id || fromUserId === user?.id || !candidate) return;
      if (peerRef.current && callState?.callId === callId && peerRef.current.remoteDescription) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        iceBufferRef.current.push(candidate);
      }
    };
    const accepted = ({ conversationId, callId, byUserId }: { conversationId: string; callId: string; byUserId: string }) => {
      if (conversationId !== conversation.id || byUserId === user?.id) return;
      setCallMinimized(false);
      setCallState((prev) => prev?.callId === callId ? { ...prev, status: "active" } : prev);
    };
    const rejected = ({ conversationId, callId }: { conversationId: string; callId: string }) => {
      if (conversationId !== conversation.id) return;
      setCallState((prev) => prev?.callId === callId ? { ...prev, status: "ended" } : prev);
      closePeer();
      setCallMinimized(false);
      window.setTimeout(() => setCallState((prev) => prev?.callId === callId ? null : prev), 1400);
    };
    const ended = rejected;
    socket.on("call:incoming", incoming);
    socket.on("call:offer", offer);
    socket.on("call:answer", answer);
    socket.on("call:ice-candidate", ice);
    socket.on("call:accepted", accepted);
    socket.on("call:rejected", rejected);
    socket.on("call:ended", ended);
    return () => {
      socket.off("call:incoming", incoming);
      socket.off("call:offer", offer);
      socket.off("call:answer", answer);
      socket.off("call:ice-candidate", ice);
      socket.off("call:accepted", accepted);
      socket.off("call:rejected", rejected);
      socket.off("call:ended", ended);
    };
  }, [callState?.callId, conversation.id, other.username, socket, user?.id]);

  // Socket: incoming messages, reactions and typing state.
  useEffect(() => {
    const handler = (raw: Message & { clientId?: string; client_id?: string }) => {
      const msg = normalizeMessage(raw);
      msg.clientId = raw.clientId ?? raw.client_id;
      if (msg.conversationId !== conversation.id) return;
      const clientId = raw.clientId ?? raw.client_id;
      if (clientId) {
        clearMessageAckTimer(clientId);
        removeOutboxMessage(user?.id, clientId);
      }
      if (msg.senderId !== user?.id && msg.status !== "read") {
        socket.emit("message:read", { messageId: msg.id, conversationId: conversation.id });
      }

      setMessages((prev) => {
        if (clientId) {
          const optimisticIndex = prev.findIndex((m) => m.id === clientId);
          if (optimisticIndex >= 0) {
            const next = [...prev];
            next[optimisticIndex] = msg;
            return next;
          }
        }
        return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
      });
    };

    const reactionHandler = ({
      messageId,
      emoji,
      userId,
      active = true,
    }: { messageId: string; emoji: string; userId: string; active?: boolean }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          if (!existing) {
            return active
              ? { ...m, reactions: [...m.reactions, { emoji, userIds: [userId] }] }
              : m;
          }
          const hasUser = existing.userIds.includes(userId);
          return {
            ...m,
            reactions: m.reactions
              .map((r) =>
                r.emoji === emoji
                  ? {
                      ...r,
                      userIds: active
                        ? hasUser ? r.userIds : [...r.userIds, userId]
                        : r.userIds.filter((id) => id !== userId),
                    }
                  : r,
              )
              .filter((r) => r.userIds.length > 0),
          };
        }),
      );
    };

    const editedHandler = ({ messageId, text, editedAt }: { messageId: string; text: string; editedAt: string }) => {
      setMessages((prev) => prev.map((message) => (
        message.id === messageId ? { ...message, text, editedAt, deletedAt: null } : message
      )));
      setPinnedMessages((prev) => prev.map((message) => (
        message.id === messageId ? { ...message, text, editedAt, deletedAt: null } : message
      )));
      setEditingMessage((current) => current?.id === messageId ? null : current);
    };

    const deletedHandler = ({ messageId, deletedAt }: { messageId: string; deletedAt: string }) => {
      setMessages((prev) => prev.map((message) => (
        message.id === messageId
          ? {
              ...message,
              text: undefined,
              attachmentUrl: undefined,
              attachmentThumbnailUrl: undefined,
              reactions: [],
              deletedAt,
            }
          : message
      )));
      setPinnedMessages((current) => current.filter((message) => message.id !== messageId));
      setActiveMessageActionsId((current) => current === messageId ? null : current);
      setEditingMessage((current) => current?.id === messageId ? null : current);
    };

    const pinnedHandler = ({ messageId, conversationId, pinned, pinnedAt, pinnedBy }: { messageId: string; conversationId: string; pinned: boolean; pinnedAt: string | null; pinnedBy: string | null }) => {
      if (conversationId !== conversation.id) return;
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, pinnedAt, pinnedBy } : message));
      if (!pinned) {
        setPinnedMessages((current) => current.filter((message) => message.id !== messageId));
        return;
      }
      const local = messagesRef.current.find((message) => message.id === messageId);
      if (local) {
        const next = { ...local, pinnedAt, pinnedBy };
        setPinnedMessages((current) => [next, ...current.filter((message) => message.id !== messageId)]);
      } else {
        api.getPinnedMessages(conversation.id).then(setPinnedMessages).catch(() => {});
      }
    };

    const pollHandler = ({ messageId, conversationId, poll }: { messageId: string; conversationId: string; poll: NonNullable<Message["poll"]> }) => {
      if (conversationId !== conversation.id) return;
      setMessages((current) => current.map((message) => {
        if (message.id !== messageId) return message;
        const keepMyOptionIds = poll.myOptionIds.length === 0 && message.poll?.myOptionIds?.length
          ? message.poll.myOptionIds
          : poll.myOptionIds;
        return { ...message, poll: { ...poll, myOptionIds: keepMyOptionIds } };
      }));
    };

    const mergeReceipt = (payload: { messageId: string; status?: Message["status"]; deliveredTo?: string[]; readBy?: string[] }) => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== payload.messageId) return m;
        return {
          ...m,
          status: payload.status ?? m.status,
          deliveredTo: payload.deliveredTo ?? m.deliveredTo ?? [],
          readBy: payload.readBy ?? m.readBy ?? [],
        };
      }));
    };
    const statusHandler = (payload: { messageId: string; status: Message["status"]; deliveredTo?: string[]; readBy?: string[] }) => {
      mergeReceipt(payload);
    };
    const deliveredHandler = (payload: { messageId: string; userId: string; status?: Message["status"]; deliveredTo?: string[]; readBy?: string[] }) => {
      mergeReceipt({ ...payload, status: payload.status ?? "delivered" });
    };
    const readHandler = (payload: { messageId: string; userId: string; status?: Message["status"]; deliveredTo?: string[]; readBy?: string[] }) => {
      mergeReceipt({ ...payload, status: payload.status ?? "read" });
    };

    const typingHandler = ({ conversationId, isTyping: t, userId }: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (conversationId === conversation.id && userId !== user?.id) setTyping(t);
    };

    const scheduledChangedHandler = (payload: { action: "created" | "cancelled"; scheduled?: ScheduledMessage; scheduledId?: string; conversationId?: string }) => {
      const targetConversationId = payload.scheduled?.conversationId || payload.conversationId;
      if (targetConversationId !== conversation.id) return;
      if (payload.action === "created" && payload.scheduled) {
        setScheduledMessages((current) => [...current.filter((item) => item.id !== payload.scheduled!.id), payload.scheduled!].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)));
      } else if (payload.scheduledId) {
        setScheduledMessages((current) => current.filter((item) => item.id !== payload.scheduledId));
      }
    };
    const scheduledSentHandler = ({ scheduledId, conversationId }: { scheduledId: string; conversationId: string }) => {
      if (conversationId !== conversation.id) return;
      setScheduledMessages((current) => current.filter((item) => item.id !== scheduledId));
      pushGlobalToast("Запланированное сообщение отправлено", "success");
    };
    const scheduledFailedHandler = ({ scheduledId, conversationId }: { scheduledId: string; conversationId: string }) => {
      if (conversationId !== conversation.id) return;
      setScheduledMessages((current) => current.map((item) => item.id === scheduledId ? { ...item, status: "failed" } : item));
      pushGlobalToast("Не удалось отправить запланированное сообщение", "error");
    };

    socket.on("message:new", handler);
    socket.on("message:reaction", reactionHandler);
    socket.on("message:edited", editedHandler);
    socket.on("message:deleted", deletedHandler);
    socket.on("message:pinned", pinnedHandler);
    socket.on("poll:updated", pollHandler);
    socket.on("message:status", statusHandler);
    socket.on("message:receipt", statusHandler);
    socket.on("message:delivered", deliveredHandler);
    socket.on("message:read", readHandler);
    socket.on("typing", typingHandler);
    socket.on("scheduled:changed", scheduledChangedHandler);
    socket.on("scheduled:sent", scheduledSentHandler);
    socket.on("scheduled:failed", scheduledFailedHandler);
    return () => {
      socket.off("message:new", handler);
      socket.off("message:reaction", reactionHandler);
      socket.off("message:edited", editedHandler);
      socket.off("message:deleted", deletedHandler);
      socket.off("message:pinned", pinnedHandler);
      socket.off("poll:updated", pollHandler);
      socket.off("message:status", statusHandler);
      socket.off("message:receipt", statusHandler);
      socket.off("message:delivered", deliveredHandler);
      socket.off("message:read", readHandler);
      socket.off("typing", typingHandler);
      socket.off("scheduled:changed", scheduledChangedHandler);
      socket.off("scheduled:sent", scheduledSentHandler);
      socket.off("scheduled:failed", scheduledFailedHandler);
    };
  }, [clearMessageAckTimer, socket, conversation.id, user?.id]);

  useEffect(() => {
    let syncing = false;
    const reconcile = async () => {
      if (syncing || document.visibilityState === "hidden") return;
      syncing = true;
      try {
        const latestServerMessage = [...messagesRef.current]
          .reverse()
          .find((message) => !["queued", "failed", "sending"].includes(message.status));
        let after = latestServerMessage?.createdAt ?? null;
        const received: Message[] = [];
        let hasMore = true;
        let pages = 0;

        while (hasMore && pages < 8) {
          const page = await api.getMessagesPage(conversation.id, { after, limit: 100 });
          received.push(...page.messages.map(normalizeMessage));
          hasMore = page.hasMore;
          after = page.nextAfter;
          pages += 1;
          if (!after || page.messages.length === 0) break;
        }

        if (received.length > 0) {
          setMessages((current) => {
            const next = [...current];
            const byId = new Map(next.map((message, index) => [message.id, index]));
            const byClientId = new Map(next.filter((message) => message.clientId).map((message, index) => [message.clientId!, index]));
            for (const message of received) {
              const existingIndex = byId.get(message.id) ?? (message.clientId ? byClientId.get(message.clientId) : undefined);
              if (existingIndex === undefined) {
                byId.set(message.id, next.length);
                if (message.clientId) byClientId.set(message.clientId, next.length);
                next.push(message);
              } else {
                next[existingIndex] = message;
              }
              if (message.clientId) removeOutboxMessage(user?.id, message.clientId);
            }
            return next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          });
        }
        onConversationPatch?.(conversation.id, { unreadCount: 0 });
      } catch {
        // Cached history remains usable until the next reconnect.
      } finally {
        syncing = false;
      }
    };
    const onSync = () => { void reconcile(); };
    window.addEventListener("nightgram:socket-ready", onSync);
    window.addEventListener("nightgram:resume-sync", onSync);
    return () => {
      window.removeEventListener("nightgram:socket-ready", onSync);
      window.removeEventListener("nightgram:resume-sync", onSync);
    };
  }, [conversation.id, onConversationPatch, user?.id]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const messageSearchIndex = useMemo(() => buildMessageSearchIndex(messages), [messages]);
  const searchMatches = useMemo(
    () => searchMessageIndex(messageSearchIndex, deferredSearchQuery),
    [deferredSearchQuery, messageSearchIndex],
  );
  const activeSearchMessageId = searchMatches.length > 0
    ? searchMatches[Math.min(searchIndex, searchMatches.length - 1)]?.id
    : null;
  const activeFocusMessageId = activeSearchMessageId ?? focusedMessageId;
  const activeSearchMessageIndex = activeFocusMessageId
    ? messages.findIndex((message) => message.id === activeFocusMessageId)
    : -1;
  const searchWindowStart = activeSearchMessageIndex >= 0
    ? Math.max(0, Math.min(messages.length - MESSAGE_WINDOW_INITIAL, activeSearchMessageIndex - 24))
    : null;
  const normalVisibleMessageStart = Math.max(0, messages.length - visibleMessageCount);
  const visibleMessageStart = searchWindowStart ?? normalVisibleMessageStart;
  const visibleMessageEnd = searchWindowStart === null
    ? messages.length
    : Math.min(messages.length, searchWindowStart + MESSAGE_WINDOW_INITIAL);
  const visibleMessages = useMemo(
    () => messages.slice(visibleMessageStart, visibleMessageEnd),
    [messages, visibleMessageEnd, visibleMessageStart],
  );

  const loadOlderMessages = useCallback(async () => {
    if (historyLoadingOlder || !historyHasMore) return;
    const before = historyBeforeCursorRef.current
      ?? messagesRef.current.find((message) => !["queued", "failed", "sending"].includes(message.status))?.createdAt
      ?? null;
    if (!before) return;

    const element = scrollRef.current;
    if (element) preserveScrollHeightRef.current = element.scrollHeight;
    setHistoryLoadingOlder(true);
    try {
      const page = await api.getMessagesPage(conversation.id, { before, limit: 80 });
      historyBeforeCursorRef.current = page.nextBefore;
      setHistoryHasMore(page.hasMore);
      if (page.messages.length === 0) return;

      const normalizedPage = page.messages.map(normalizeMessage);
      const knownIds = new Set(messagesRef.current.map((message) => message.id));
      const knownClientIds = new Set(messagesRef.current.map((message) => message.clientId).filter(Boolean));
      const inserted = normalizedPage.filter((message) => (
        !knownIds.has(message.id) && !knownClientIds.has(message.clientId)
      )).length;
      setMessages((current) => {
        const next = [...current];
        const byId = new Map(next.map((message, index) => [message.id, index]));
        const byClientId = new Map(next.filter((message) => message.clientId).map((message, index) => [message.clientId!, index]));
        for (const message of normalizedPage) {
          const existingIndex = byId.get(message.id) ?? (message.clientId ? byClientId.get(message.clientId) : undefined);
          if (existingIndex === undefined) next.push(message);
          else next[existingIndex] = message;
        }
        return next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      });
      if (inserted > 0) setVisibleMessageCount((count) => count + inserted);
    } catch {
      pushGlobalToast("Не удалось загрузить более ранние сообщения", "error");
    } finally {
      setHistoryLoadingOlder(false);
    }
  }, [conversation.id, historyHasMore, historyLoadingOlder]);

  const revealOlderMessages = useCallback(() => {
    if (searchWindowStart !== null) return;
    const element = scrollRef.current;
    if (element) preserveScrollHeightRef.current = element.scrollHeight;
    if (normalVisibleMessageStart > 0) {
      setVisibleMessageCount((count) => Math.min(messages.length, count + MESSAGE_WINDOW_STEP));
      return;
    }
    void loadOlderMessages();
  }, [loadOlderMessages, messages.length, normalVisibleMessageStart, searchWindowStart]);

  const handleMessagesScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 180;

    if (searchWindowStart === null && element.scrollTop < 100 && (normalVisibleMessageStart > 0 || historyHasMore) && revealOlderFrameRef.current === null) {
      revealOlderFrameRef.current = window.requestAnimationFrame(() => {
        revealOlderFrameRef.current = null;
        revealOlderMessages();
      });
    }
  }, [historyHasMore, normalVisibleMessageStart, revealOlderMessages, searchWindowStart]);

  // Preserve the user's exact position when older messages are prepended.
  useLayoutEffect(() => {
    const previousHeight = preserveScrollHeightRef.current;
    const element = scrollRef.current;
    if (previousHeight === null || !element) return;
    preserveScrollHeightRef.current = null;
    element.scrollTop += element.scrollHeight - previousHeight;
  }, [visibleMessageCount]);

  // Scroll only when opening a thread or when the user is already near the
  // bottom. Incoming messages no longer pull the reader away from history.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || historyLoading) return;

    const previousCount = previousMessageCountRef.current;
    const firstPaint = previousCount === 0 && messages.length > 0;
    const appended = messages.length > previousCount;
    previousMessageCountRef.current = messages.length;

    if (firstPaint || (appended && stickToBottomRef.current) || (typing && stickToBottomRef.current)) {
      window.requestAnimationFrame(() => {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: firstPaint ? "auto" : "smooth",
        });
      });
    }
  }, [historyLoading, messages.length, typing]);

  useEffect(() => () => {
    if (revealOlderFrameRef.current !== null) {
      window.cancelAnimationFrame(revealOlderFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    if (voiceDraft?.url) URL.revokeObjectURL(voiceDraft.url);
  }, [voiceDraft?.url]);

  useEffect(() => () => {
    messageAckTimersRef.current.forEach((timer) => clearTimeout(timer));
    messageAckTimersRef.current.clear();
  }, []);

  const emitOutgoingMessage = useCallback((msg: Message) => {
    const clientId = msg.clientId || msg.id;
    clearMessageAckTimer(clientId);

    const queueMessage = (showNotice = false) => {
      const queued = { ...msg, clientId, status: "queued" as const };
      setMessages((prev) => prev.map((item) => (item.id === msg.id || item.clientId === clientId) ? queued : item));
      upsertOutboxMessage(user?.id, queued);
      if (showNotice) pushGlobalToast("Нет соединения. Сообщение сохранено и отправится автоматически.", "info");
    };

    if (!navigator.onLine || !socket.connected) {
      queueMessage(true);
      return;
    }

    const sending = { ...msg, clientId, status: "sending" as const };
    setMessages((prev) => prev.map((item) => (item.id === msg.id || item.clientId === clientId) ? sending : item));
    upsertOutboxMessage(user?.id, sending);

    const timeout = setTimeout(() => {
      messageAckTimersRef.current.delete(clientId);
      const nextStatus = !navigator.onLine || !socket.connected ? "queued" as const : "failed" as const;
      const timedOut = { ...msg, clientId, status: nextStatus };
      setMessages((prev) => prev.map((item) => (item.id === msg.id || item.clientId === clientId) && item.status === "sending" ? timedOut : item));
      upsertOutboxMessage(user?.id, timedOut);
      if (nextStatus === "failed") pushGlobalToast("Сервер не подтвердил отправку. Нажми «Повторить».", "error");
    }, MESSAGE_ACK_TIMEOUT_MS);
    messageAckTimersRef.current.set(clientId, timeout);

    socket.emit("typing", { conversationId: conversation.id, isTyping: false });
    socket.emit("message:send", {
      conversationId: conversation.id,
      clientId,
      text: msg.text,
      type: msg.type,
      attachmentUrl: msg.attachmentUrl,
      attachmentThumbnailUrl: msg.attachmentThumbnailUrl,
      mediaWidth: msg.mediaWidth,
      mediaHeight: msg.mediaHeight,
      mediaDurationSec: msg.mediaDurationSec,
      replyTo: msg.replyTo?.id,
    }, (ack) => {
      clearMessageAckTimer(clientId);
      if (ack?.error) {
        const failed = { ...msg, clientId, status: "failed" as const };
        setMessages((prev) => prev.map((item) => (item.id === msg.id || item.clientId === clientId) ? failed : item));
        upsertOutboxMessage(user?.id, failed);
        const retry = ack.retryAfter ? ` · ${ack.retryAfter} сек.` : "";
        pushGlobalToast(ack.message || (ack.error === "rate_limited" ? `Слишком много сообщений${retry}` : "Не удалось отправить сообщение"), ack.error === "rate_limited" ? "info" : "error");
        return;
      }
      if (ack?.id) {
        removeOutboxMessage(user?.id, clientId);
        setMessages((prev) =>
          prev.map((item) => ((item.id === msg.id || item.clientId === clientId) ? { ...item, id: ack.id!, clientId, status: "sent" } : item)),
        );
      }
    });
  }, [clearMessageAckTimer, conversation.id, socket, user?.id]);

  async function reportMessage(message: Message) {
    const reason = window.prompt("Опиши причину жалобы на сообщение:", "");
    if (!reason?.trim()) return;
    try {
      await api.createReport({ targetType: "message", targetId: message.id, category: "message_report", reason: reason.trim().slice(0, 1000) });
      pushGlobalToast("Жалоба отправлена модераторам", "success");
      setActiveMessageActionsId(null);
    } catch {
      pushGlobalToast("Не удалось отправить жалобу", "error");
    }
  }

  function retryMessage(message: Message) {
    if (message.status !== "failed" && message.status !== "queued") return;
    emitOutgoingMessage(message);
  }

  function send(payload: Partial<Pick<Message, "text" | "type" | "attachmentUrl" | "attachmentThumbnailUrl" | "mediaWidth" | "mediaHeight" | "mediaDurationSec">>) {
    if (!user) return;
    const clientId = uid("msg");
    const connected = navigator.onLine && socket.connected;
    const msg: Message = {
      id: clientId,
      clientId,
      conversationId: conversation.id,
      senderId: user.id,
      text: payload.text,
      type: payload.type ?? "text",
      attachmentUrl: payload.attachmentUrl,
      attachmentThumbnailUrl: payload.attachmentThumbnailUrl,
      mediaWidth: payload.mediaWidth,
      mediaHeight: payload.mediaHeight,
      mediaDurationSec: payload.mediaDurationSec,
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : null,
      reactions: [],
      status: connected ? "sending" : "queued",
      deliveredTo: [],
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    stickToBottomRef.current = true;
    setVisibleMessageCount((count) => Math.max(count, MESSAGE_WINDOW_INITIAL));
    setMessages((prev) => [...prev, msg]);
    onConversationPatch?.(conversation.id, { lastMessage: msg, unreadCount: 0 });
    upsertOutboxMessage(user.id, { ...msg, status: msg.status === "sending" ? "sending" : "queued" });
    clearChatDraft(user.id, conversation.id);
    setText("");
    setReplyTo(null);
    setShowStickers(false);
    emitOutgoingMessage(msg);
  }

  useEffect(() => subscribeToOutboxMessages((outboxMessage) => {
    if (outboxMessage.conversationId !== conversation.id) return;
    const clientId = outboxMessage.clientId || outboxMessage.id;
    setMessages((prev) => prev.map((message) => (
      (message.clientId || message.id) === clientId ? { ...message, status: outboxMessage.status } : message
    )));
  }), [conversation.id]);

  function onTyping() {
    socket.emit("typing", { conversationId: conversation.id, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { conversationId: conversation.id, isTyping: false });
    }, 1200);
  }

  const mediaGallery = useMemo<MediaViewerItem[]>(() => messages
    .filter((m) => (m.type === "image" || m.type === "video") && m.attachmentUrl)
    .map((m) => ({ id: m.id, type: m.type === "video" ? "video" : "image", url: m.attachmentUrl! })), [messages]);

  useEffect(() => {
    setSearchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!activeFocusMessageId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`msg-${activeFocusMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [activeFocusMessageId, visibleMessageStart]);

  const draftSize = useMemo(() => draftMedia.reduce((sum, item) => sum + item.size, 0), [draftMedia]);
  const draftOverBatch = draftMedia.length > MEDIA_BATCH_LIMIT;
  const draftOverSize = draftSize > MEDIA_SIZE_LIMIT;
  const messageOverLimit = text.length > MESSAGE_LIMIT;

  function isVoiceMessage(message: Message) {
    return message.type === "file" && Boolean(message.attachmentUrl) && (message.text ?? "").startsWith(VOICE_PREFIX);
  }

  function voiceDuration(message: Message) {
    const raw = (message.text ?? "").slice(VOICE_PREFIX.length);
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  function prettyDuration(seconds: number) {
    const total = Math.max(0, Math.round(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function addDraftFiles(files: FileList | null) {
    if (!files || blocked || requestPending) return;
    const accepted = Array.from(files).filter((file) => {
      if (file.size > MEDIA_SIZE_LIMIT) {
        pushGlobalToast(`${file.name}: максимальный размер 50 МБ`, "error");
        return false;
      }
      return true;
    });
    const acceptedSize = accepted.reduce((sum, file) => sum + file.size, 0);
    if (draftSize + acceptedSize > MEDIA_SIZE_LIMIT) {
      pushGlobalToast("Общий размер вложений не должен превышать 50 МБ", "error");
      return;
    }
    const next: DraftMedia[] = accepted.map((file) => ({
      id: uid("draft"),
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "file",
      size: file.size,
      name: file.name,
    }));
    setDraftMedia((prev) => [...prev, ...next].slice(0, 40));
  }

  function cancelActiveUpload() {
    uploadAbortRef.current?.abort();
  }

  function uploadOptions(fileName: string, index: number, totalFiles: number, controller: AbortController) {
    return {
      preserveOriginal: sendOriginal,
      signal: controller.signal,
      onProgress: (progress: UploadProgress) => {
        const overallPercent = Math.round(((index + progress.percent / 100) / Math.max(1, totalFiles)) * 100);
        setUploadProgress({ ...progress, percent: overallPercent, fileName, index: index + 1, totalFiles });
      },
    };
  }

  function removeDraft(id: string) {
    setDraftMedia((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((x) => x.id !== id);
    });
  }

  async function startVoiceRecording() {
    if (blocked || recordingVoice || uploadingFile) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      pushGlobalToast("Браузер не поддерживает запись голосовых", "error");
      return;
    }
    try {
      if (voiceDraft?.url) URL.revokeObjectURL(voiceDraft.url);
      setVoiceDraft(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      recordChunksRef.current = [];
      recordStreamRef.current = stream;
      recordStartedAtRef.current = Date.now();
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationSec = Math.max(1, Math.round((Date.now() - recordStartedAtRef.current) / 1000));
        const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recordStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordStreamRef.current = null;
        if (blob.size > 0) setVoiceDraft({ blob, url: URL.createObjectURL(blob), durationSec });
      };
      recorder.start(250);
      setRecordSeconds(0);
      setRecordingVoice(true);
      recordIntervalRef.current = setInterval(() => {
        const seconds = Math.round((Date.now() - recordStartedAtRef.current) / 1000);
        setRecordSeconds(seconds);
        if (seconds >= VOICE_MAX_SECONDS) stopVoiceRecording();
      }, 500);
    } catch {
      pushGlobalToast("Нет доступа к микрофону", "error");
    }
  }

  function stopVoiceRecording(discard = false) {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    recordIntervalRef.current = null;
    setRecordingVoice(false);
    if (discard) {
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") {
          try { recorder.stop(); } catch { /* ignore */ }
        }
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordChunksRef.current = [];
      mediaRecorderRef.current = null;
      recordStreamRef.current = null;
      setRecordSeconds(0);
      return;
    }
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  }

  function clearVoiceDraft() {
    if (voiceDraft?.url) URL.revokeObjectURL(voiceDraft.url);
    setVoiceDraft(null);
    setRecordSeconds(0);
  }

  async function sendVoiceDraft() {
    if (!voiceDraft || uploadingFile || blocked) return;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadingFile(true);
    try {
      const file = new File([voiceDraft.blob], `voice-${Date.now()}.webm`, { type: voiceDraft.blob.type || "audio/webm" });
      const uploaded = await uploadMediaDetailed(file, "messages", uploadOptions("Голосовое сообщение", 0, 1, controller));
      send({
        type: "file",
        attachmentUrl: uploaded.url,
        mediaDurationSec: voiceDraft.durationSec,
        text: `${VOICE_PREFIX}${voiceDraft.durationSec}`,
      });
      clearVoiceDraft();
      pushGlobalToast("Голосовое отправлено", "success");
    } catch (error) {
      pushGlobalToast(error instanceof DOMException && error.name === "AbortError" ? "Загрузка отменена" : "Не удалось отправить голосовое", error instanceof DOMException && error.name === "AbortError" ? "info" : "error");
    } finally {
      uploadAbortRef.current = null;
      setUploadProgress(null);
      setUploadingFile(false);
    }
  }

  async function submitComposer() {
    if (editingMessage) {
      saveEditedMessage();
      return;
    }
    if (blocked || requestPending || messageOverLimit || draftOverSize || uploadingFile) return;
    const body = text.trim();
    if (draftMedia.length === 0) {
      if (body) send({ text: body });
      return;
    }

    const mediaToSend = [...draftMedia];
    setText("");
    setUploadingFile(true);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    if (mediaToSend.length > MEDIA_BATCH_LIMIT) {
      pushGlobalToast(`Медиа больше ${MEDIA_BATCH_LIMIT}: отправим несколькими сообщениями`, "info");
    }

    try {
      for (let i = 0; i < mediaToSend.length; i += 1) {
        const item = mediaToSend[i];
        const uploaded = await uploadMediaDetailed(item.file, "messages", uploadOptions(item.name, i, mediaToSend.length, controller));
        send({
          type: item.type,
          attachmentUrl: uploaded.url,
          attachmentThumbnailUrl: uploaded.thumbnailUrl,
          mediaWidth: uploaded.width,
          mediaHeight: uploaded.height,
          mediaDurationSec: uploaded.durationSec,
          text: i === 0 ? body || undefined : undefined,
        });
        removeDraft(item.id);
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      pushGlobalToast(cancelled ? "Загрузка отменена — неотправленные файлы остались в черновике" : "Не удалось отправить часть медиа — можно повторить", cancelled ? "info" : "error");
    } finally {
      uploadAbortRef.current = null;
      setUploadProgress(null);
      setUploadingFile(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function openSchedulePanel() {
    if (!scheduleAt) setScheduleAt(toLocalDateTimeInput(new Date(Date.now() + 15 * 60 * 1000)));
    setSchedulePanelOpen(true);
  }

  async function scheduleComposerMessage() {
    if (editingMessage || blocked || requestPending || schedulingMessage || draftOverSize || uploadingFile) return;
    const body = text.trim();
    if (!body && draftMedia.length === 0) {
      pushGlobalToast("Добавьте текст или медиа", "info");
      return;
    }
    const targetDate = new Date(scheduleAt);
    if (Number.isNaN(targetDate.getTime()) || targetDate.getTime() < Date.now() + 30_000) {
      pushGlobalToast("Выберите время минимум на 30 секунд позже", "info");
      return;
    }

    setSchedulingMessage(true);
    setUploadingFile(draftMedia.length > 0);
    const mediaToSchedule = [...draftMedia];
    const controller = new AbortController();
    if (mediaToSchedule.length > 0) uploadAbortRef.current = controller;
    try {
      const created: ScheduledMessage[] = [];
      if (mediaToSchedule.length === 0) {
        created.push(await api.scheduleMessage(conversation.id, {
          text: body,
          type: "text",
          replyTo: replyTo?.id || null,
          scheduledAt: targetDate.toISOString(),
        }));
      } else {
        for (let index = 0; index < mediaToSchedule.length; index += 1) {
          const item = mediaToSchedule[index];
          const uploaded = await uploadMediaDetailed(item.file, "messages", uploadOptions(item.name, index, mediaToSchedule.length, controller));
          const itemDate = new Date(targetDate.getTime() + index * 1000);
          created.push(await api.scheduleMessage(conversation.id, {
            text: index === 0 ? body || undefined : undefined,
            type: item.type,
            attachmentUrl: uploaded.url,
            attachmentThumbnailUrl: uploaded.thumbnailUrl,
            mediaWidth: uploaded.width,
            mediaHeight: uploaded.height,
            mediaDurationSec: uploaded.durationSec,
            replyTo: index === 0 ? replyTo?.id || null : null,
            scheduledAt: itemDate.toISOString(),
          }));
          removeDraft(item.id);
        }
      }

      setScheduledMessages((current) => [...current, ...created].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)));
      setText("");
      setReplyTo(null);
      clearChatDraft(user?.id, conversation.id);
      setSchedulePanelOpen(false);
      setPollModalOpen(false);
      pushGlobalToast(created.length > 1 ? `Запланировано сообщений: ${created.length}` : "Сообщение запланировано", "success");
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      pushGlobalToast(cancelled ? "Загрузка отменена — файлы остались в черновике" : error instanceof Error ? error.message : "Не удалось запланировать сообщение", cancelled ? "info" : "error");
      api.getScheduledMessages(conversation.id).then(setScheduledMessages).catch(() => {});
    } finally {
      uploadAbortRef.current = null;
      setUploadProgress(null);
      setSchedulingMessage(false);
      setUploadingFile(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function cancelScheduled(id: string) {
    try {
      await api.cancelScheduledMessage(conversation.id, id);
      setScheduledMessages((current) => current.filter((item) => item.id !== id));
      pushGlobalToast("Запланированное сообщение отменено", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось отменить сообщение", "error");
    }
  }

  async function retryScheduled(id: string) {
    try {
      const updated = await api.retryScheduledMessage(conversation.id, id);
      setScheduledMessages((current) => current.map((item) => item.id === id ? updated : item).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)));
      pushGlobalToast("Повторная отправка запланирована", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось повторить отправку", "error");
    }
  }

  function forwardedFrom(m: Message): string {
    if (m.senderId === user?.id) return user?.username ? `@${user.username}` : "вас";
    const sender = m.sender ?? participantById.get(m.senderId);
    return sender?.username ? `@${sender.username}` : "пользователя";
  }

  function forwardedText(m: Message): string {
    const prefix = `↪ Переслано от ${forwardedFrom(m)}`;
    return m.text ? `${prefix}
${m.text}` : prefix;
  }

  async function togglePinChat() {
    try {
      const res = await api.toggleConversationPin(conversation.id);
      onConversationPatch?.(conversation.id, { pinned: res.pinned });
      pushGlobalToast(res.pinned ? "Чат закреплён" : "Чат откреплён", "success");
    } catch {
      pushGlobalToast("Не удалось изменить закреп", "error");
    }
  }

  async function handleMessageRequest(action: "accept" | "hide" | "block") {
    try {
      const res = await api.handleConversationRequest(conversation.id, action);
      if (action === "accept") {
        onConversationPatch?.(conversation.id, { requestStatus: "accepted" });
        pushGlobalToast("Запрос принят", "success");
      } else {
        onConversationPatch?.(conversation.id, { requestStatus: res.requestStatus as Conversation["requestStatus"] });
        pushGlobalToast(action === "block" ? "Пользователь заблокирован" : "Запрос скрыт", "success");
        onBack();
      }
    } catch {
      pushGlobalToast("Не удалось обработать запрос", "error");
    }
  }

  async function toggleFavoriteUser() {
    if (!other?.id) return;
    try {
      const res = await api.socialAction("favorite", other.id);
      onConversationPatch?.(conversation.id, { favorite: res.active });
      pushGlobalToast(res.active ? "Пользователь добавлен в избранное" : "Пользователь убран из избранного", "success");
    } catch {
      pushGlobalToast("Не удалось изменить избранное", "error");
    }
  }

  function saveMessage(m: Message) {
    saveItem({
      id: `message:${m.id}`,
      type: m.attachmentUrl ? "media" : "message",
      title: `Переслано от ${forwardedFrom(m)}`,
      text: m.text,
      mediaUrl: m.attachmentUrl,
      mediaType: m.type === "video" ? "video" : m.attachmentUrl ? "image" : undefined,
      source: chatTitle,
      createdAt: new Date().toISOString(),
    });
    setSaveNotice("Переслано в Избранное");
    window.setTimeout(() => setSaveNotice(null), 2200);
  }

  function forwardToSaved(m: Message) {
    saveMessage(m);
    setForwardMessage(null);
  }

  function forwardToConversation(target: Conversation, m: Message) {
    if (!user) return;
    socket.emit("message:send", {
      conversationId: target.id,
      text: forwardedText(m),
      type: m.type,
      attachmentUrl: m.attachmentUrl,
      replyTo: undefined,
    }, (ack) => {
      if (ack?.error) {
        pushGlobalToast("Не удалось переслать сообщение", "error");
        return;
      }
      pushGlobalToast(`Переслано в «${target.title}»`, "success");
      setForwardMessage(null);
    });
  }

  function closePeer() {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setPendingOffer(null);
    iceBufferRef.current = [];
  }

  async function getCallStream(type: "audio" | "video") {
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === "video"
        ? { deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    await refreshDevices();
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicEnabled(true);
    setCameraEnabled(type === "video");
    return stream;
  }

  function createPeer(callId: string) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerRef.current = pc;
    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    setRemoteStream(remote);
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remote.addTrack(track));
      setRemoteStream(new MediaStream(remote.getTracks()));
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("call:ice-candidate", { conversationId: conversation.id, callId, candidate: event.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setCallState((prev) => prev ? { ...prev, status: "ended" } : prev);
      }
    };
    return pc;
  }

  async function flushIceBuffer() {
    if (!peerRef.current) return;
    const buffered = [...iceBufferRef.current];
    iceBufferRef.current = [];
    for (const candidate of buffered) {
      await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  async function startCall(type: "audio" | "video") {
    if (USE_GLOBAL_CALLS) {
      window.dispatchEvent(new CustomEvent("nightgram:start-call", {
        detail: {
          conversationId: conversation.id,
          title: chatTitle,
          avatarUrl: chatAvatarUrl,
          type,
          participants: conversation.participants.map((p) => p.id),
        },
      }));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      pushGlobalToast("Браузер не поддерживает звонки", "error");
      return;
    }
    const callId = uid("call");
    setCallMinimized(false);
    setCallState({ callId, type, status: "outgoing" });
    try {
      const stream = await getCallStream(type);
      const pc = createPeer(callId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      socket.emit("call:start", { conversationId: conversation.id, callId, type });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("call:offer", { conversationId: conversation.id, callId, offer, type });
    } catch {
      pushGlobalToast("Не удалось получить доступ к микрофону/камере", "error");
      closePeer();
      setCallState(null);
    }
  }

  async function acceptCall() {
    if (USE_GLOBAL_CALLS) {
      window.dispatchEvent(new CustomEvent("nightgram:accept-call", { detail: { conversationId: conversation.id } }));
      return;
    }
    if (!callState || !pendingOffer) {
      pushGlobalToast("Ожидаем данные звонка…", "info");
      return;
    }
    setCallMinimized(false);
    try {
      const stream = await getCallStream(callState.type);
      const pc = createPeer(callState.callId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      await flushIceBuffer();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:accept", { conversationId: conversation.id, callId: callState.callId });
      socket.emit("call:answer", { conversationId: conversation.id, callId: callState.callId, answer });
      setCallState({ ...callState, status: "active" });
    } catch {
      pushGlobalToast("Не удалось принять звонок", "error");
      rejectCall();
    }
  }

  function rejectCall() {
    if (USE_GLOBAL_CALLS) {
      window.dispatchEvent(new CustomEvent("nightgram:reject-call", { detail: { conversationId: conversation.id } }));
      return;
    }
    if (!callState) return;
    socket.emit("call:reject", { conversationId: conversation.id, callId: callState.callId });
    closePeer();
    setCallMinimized(false);
    setCallState(null);
  }

  function endCall() {
    if (USE_GLOBAL_CALLS) {
      window.dispatchEvent(new CustomEvent("nightgram:end-call", { detail: { conversationId: conversation.id } }));
      return;
    }
    if (callState) socket.emit("call:end", { conversationId: conversation.id, callId: callState.callId });
    closePeer();
    setCallMinimized(false);
    setCallState(null);
  }

  function toggleMic() {
    const next = !micEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicEnabled(next);
  }

  function toggleCamera() {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraEnabled(next);
  }

  async function createPoll(payload: { question: string; options: string[]; allowMultiple: boolean; anonymous: boolean }) {
    try {
      const message = await api.createPoll(conversation.id, payload);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      onConversationPatch?.(conversation.id, { lastMessage: message, unreadCount: 0 });
      stickToBottomRef.current = true;
      pushGlobalToast("Опрос создан", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось создать опрос", "error");
      throw error;
    }
  }

  async function votePoll(message: Message, optionIds: string[]) {
    const previous = message.poll;
    if (!previous) return;
    setMessages((current) => current.map((item) => item.id === message.id && item.poll ? { ...item, poll: { ...item.poll, myOptionIds: optionIds } } : item));
    try {
      const poll = await api.votePoll(conversation.id, message.id, optionIds);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, poll } : item));
    } catch (error) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, poll: previous } : item));
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось проголосовать", "error");
    }
  }

  async function closePoll(message: Message) {
    try {
      const poll = await api.closePoll(conversation.id, message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, poll } : item));
      pushGlobalToast("Опрос завершён", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось завершить опрос", "error");
    }
  }

  function insertMention(username: string) {
    setText((current) => current.replace(/(?:^|\s)@[a-zA-Z0-9_]*$/, (match) => match.replace(/@[a-zA-Z0-9_]*$/, `@${username} `)));
    window.requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  function reactToMessage(messageId: string, emoji: string) {
    if (!user) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        if (existing) {
          const has = existing.userIds.includes(user.id);
          return {
            ...m,
            reactions: m.reactions
              .map((r) =>
                r.emoji === emoji
                  ? { ...r, userIds: has ? r.userIds.filter((u) => u !== user.id) : [...r.userIds, user.id] }
                  : r,
              )
              .filter((r) => r.userIds.length > 0),
          };
        }
        return { ...m, reactions: [...m.reactions, { emoji, userIds: [user.id] }] };
      }),
    );
    socket.emit("message:react", { messageId, emoji });
    if (isTouchInput) setActiveMessageActionsId(null);
  }

  function beginEditMessage(message: Message) {
    if (message.senderId !== user?.id || message.deletedAt || !message.text || isVoiceMessage(message)) return;
    draftBeforeEditRef.current = getChatDraft(user?.id, conversation.id)?.text || text;
    setEditingMessage(message);
    setReplyTo(null);
    setDraftMedia((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    if (voiceDraft) clearVoiceDraft();
    setText(message.text);
    setShowEmojis(false);
    setShowStickers(false);
    setActiveMessageActionsId(null);
    window.requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  function cancelEditMessage() {
    setEditingMessage(null);
    setText(draftBeforeEditRef.current);
    draftBeforeEditRef.current = "";
  }

  function saveEditedMessage() {
    if (!editingMessage || editSubmitting) return;
    const nextText = text.trim();
    if (!nextText || nextText === editingMessage.text) {
      cancelEditMessage();
      return;
    }
    setEditSubmitting(true);
    socket.emit("message:edit", { messageId: editingMessage.id, text: nextText }, (ack) => {
      setEditSubmitting(false);
      if (ack?.error) {
        pushGlobalToast(ack.message || "Не удалось изменить сообщение", "error");
        return;
      }
      const editedAt = ack?.editedAt || new Date().toISOString();
      setMessages((prev) => prev.map((message) => (
        message.id === editingMessage.id ? { ...message, text: nextText, editedAt } : message
      )));
      setEditingMessage(null);
      setText(draftBeforeEditRef.current);
      draftBeforeEditRef.current = "";
      pushGlobalToast("Сообщение изменено", "success");
    });
  }

  function deleteOwnMessage(message: Message) {
    if (message.senderId !== user?.id || message.deletedAt) return;
    if (!window.confirm("Удалить сообщение у всех участников чата?")) return;
    const deletedAt = new Date().toISOString();
    setActiveMessageActionsId(null);
    setPinnedMessages((current) => current.filter((item) => item.id !== message.id));
    setMessages((prev) => prev.map((item) => (
      item.id === message.id
        ? { ...item, text: undefined, attachmentUrl: undefined, attachmentThumbnailUrl: undefined, reactions: [], deletedAt }
        : item
    )));
    socket.emit("message:delete", { messageId: message.id }, (ack) => {
      if (ack?.error) {
        setMessages((prev) => prev.map((item) => item.id === message.id ? message : item));
        pushGlobalToast(ack.message || "Не удалось удалить сообщение", "error");
        return;
      }
      if (editingMessage?.id === message.id) cancelEditMessage();
      pushGlobalToast("Сообщение удалено", "success");
    });
  }

  function pinnedMessagePreview(message: Message) {
    if (message.deletedAt) return "Сообщение удалено";
    if (message.text && !isVoiceMessage(message)) return parseForwardedText(message.text)?.body || message.text;
    if (isVoiceMessage(message)) return "Голосовое сообщение";
    if (message.type === "image") return "Фотография";
    if (message.type === "video") return "Видео";
    if (message.attachmentUrl) return "Файл";
    return "Сообщение";
  }

  async function togglePinnedMessage(message: Message) {
    if (!canManageMessagePins || message.deletedAt) return;
    setActiveMessageActionsId(null);
    try {
      const result = await api.toggleMessagePin(conversation.id, message.id);
      const patched = { ...message, pinnedAt: result.pinnedAt, pinnedBy: result.pinnedBy };
      setMessages((current) => current.map((item) => item.id === message.id ? patched : item));
      setPinnedMessages((current) => result.pinned
        ? [patched, ...current.filter((item) => item.id !== message.id)]
        : current.filter((item) => item.id !== message.id));
      pushGlobalToast(result.pinned ? "Сообщение закреплено" : "Сообщение откреплено", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось изменить закрепление", "error");
    }
  }

  async function jumpToPinnedMessage(messageId: string) {
    setPinnedPanelOpen(false);
    setFocusedMessageId(messageId);
    if (messagesRef.current.some((message) => message.id === messageId)) return;
    try {
      const context = await api.getMessageContext(conversation.id, messageId);
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        for (const message of context) byId.set(message.id, message);
        return [...byId.values()].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
      });
    } catch (error) {
      setFocusedMessageId(null);
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось открыть сообщение", "error");
    }
  }

  useEffect(() => {
    if (!initialMessageId || historyLoading) return;
    const key = `${conversation.id}:${initialMessageId}`;
    if (initialMessageHandledRef.current === key) return;
    initialMessageHandledRef.current = key;
    void jumpToPinnedMessage(initialMessageId).finally(() => onInitialMessageHandled?.());
  // jumpToPinnedMessage intentionally uses the latest refs and conversation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, historyLoading, initialMessageId, onInitialMessageHandled]);

  function messageStatusMeta(message: Message) {
    const recipients = conversation.participants.filter((participant) => participant.id !== user?.id);
    const total = Math.max(recipients.length, conversation.type === "direct" ? 1 : 0);
    const readCount = (message.readBy ?? []).filter((id) => id !== user?.id).length;
    const deliveredCount = (message.deliveredTo ?? []).filter((id) => id !== user?.id).length;
    const effectiveStatus = readCount >= total && total > 0
      ? "read"
      : deliveredCount >= total && total > 0
        ? "delivered"
        : message.status;

    if (message.status === "queued") return { mark: "↥", title: "В очереди — отправится после подключения", className: "text-amber-200", count: "" };
    if (message.status === "sending") return { mark: "…", title: "Отправляется", className: "text-white/35", count: "" };
    if (message.status === "failed") return { mark: "!", title: "Не отправлено", className: "text-red-300", count: "" };
    if (effectiveStatus === "read") {
      return {
        mark: "✓✓",
        title: total > 1 ? `Прочитали ${readCount}/${total}` : "Прочитано",
        className: "text-neon-purple",
        count: total > 1 ? `${readCount}/${total}` : "",
      };
    }
    if (effectiveStatus === "delivered") {
      return {
        mark: "✓✓",
        title: total > 1 ? `Доставлено ${deliveredCount}/${total}` : "Доставлено",
        className: "text-white/45",
        count: total > 1 ? `${deliveredCount}/${total}` : "",
      };
    }
    return { mark: "✓", title: "Отправлено", className: "text-white/30", count: "" };
  }

  function resolveMessageSender(message: Message) {
    const mine = message.senderId === user?.id;
    if (message.sender) {
      return {
        id: message.sender.id || message.senderId,
        username: message.sender.username || "",
        displayName: message.sender.displayName || message.sender.username || "Пользователь",
        avatarUrl: message.sender.avatarUrl ?? null,
        nameColor: message.sender.nameColor || "#ffffff",
        isPremium: message.sender.isPremium,
        avatarFrame: message.sender.avatarFrame,
        verified: message.sender.verified,
        isOnline: message.sender.isOnline ?? false,
      };
    }
    const participant = participantById.get(message.senderId);
    if (participant) return participant;
    if (mine && user) {
      return {
        id: user.id,
        username: user.username || "",
        displayName: user.displayName || user.username || "Вы",
        avatarUrl: user.avatarUrl,
        nameColor: user.nameColor || "#ffffff",
        isOnline: true,
      };
    }
    return {
      id: message.senderId,
      username: "",
      displayName: "Пользователь",
      avatarUrl: null,
      nameColor: "#ffffff",
      isOnline: false,
    };
  }

  function openProfile(username?: string | null) {
    if (!username) return;
    router.push(`/profile/${username}`);
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden rounded-[inherit]"
      style={{
        backgroundImage: selectedChatTheme.bg,
        ["--chat-main" as string]: selectedChatTheme.main,
        ["--chat-secondary" as string]: selectedChatTheme.secondary,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-white/5 glass-strong">
        <button onClick={onBack} className="md:hidden grid place-items-center h-9 w-9 rounded-lg glass">
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => openProfile(profileTarget)}
          className={cn("shrink-0 transition", profileTarget ? "hover:scale-105" : "cursor-default")}
          title={profileTarget ? `@${profileTarget}` : "Профиль пока недоступен"}
        >
          {blocked ? (
            <div className="grid h-[42px] w-[42px] place-items-center rounded-full bg-red-500/15 text-red-300 shadow-glow">✕</div>
          ) : (
            <GlowAvatar src={chatAvatarUrl} alt={chatTitle} size={42} online={chatOnline} glow="purple" frame={conversation.avatarFrame ?? other.avatarFrame} ringColor={other.nameColor} />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => openProfile(profileTarget)}
            className={cn("font-semibold truncate", profileTarget && "hover:underline")}
            title={profileTarget ? `@${profileTarget}` : undefined}
          >
            {chatTitle}
          </button>
          {!isGroupChat && (other?.verified || other?.avatarFrame === "verified" || conversation.verified) && <VerifiedBadge size={15} />}
          {!isGroupChat && other?.appRole && other.appRole !== "user" && (
            <RoleBadge role={other.appRole} size={15} />
          )}
          {!isGroupChat && other?.isPremium && <PremiumBadge size={15} />}
          <div className="text-xs text-white/45">
            {typing ? (
              <span className="text-neon-purple">печатает…</span>
            ) : isGroupChat ? (
              isChannelChat ? `${conversation.participants.length} участников · чат канала` : `${conversation.participants.length} участников`
            ) : otherStatusActive ? (
              `${other.nightStatusEmoji || "🌙"} ${other.nightStatusText}`
            ) : conversation.isOnline ? (
              "в сети"
            ) : (
              "не в сети"
            )}
          </div>
        </div>
        <button onClick={togglePinChat} className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition" title={conversation.pinned ? "Открепить чат" : "Закрепить чат"}>
          {conversation.pinned ? <PinOff size={17} /> : <Pin size={17} />}
        </button>
        <button onClick={toggleFavoriteUser} className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition" title="Добавить пользователя в избранное">
          <Star size={17} />
        </button>
        <button
          onClick={() => setThemePanelOpen((v) => !v)}
          className={cn("grid place-items-center h-9 w-9 rounded-lg transition", themePanelOpen ? "text-white shadow-glow" : "glass text-white/60 hover:text-neon-purple")}
          style={themePanelOpen ? { background: `${selectedChatTheme.main}33`, border: `1px solid ${selectedChatTheme.main}66` } : undefined}
          title="Тема чата"
        >
          <Palette size={17} />
        </button>
        <button onClick={() => startCall("audio")} className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-white transition" title="Аудиозвонок">
          <Phone size={17} />
        </button>
        <button onClick={() => startCall("video")} className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-white transition" title="Видеозвонок">
          <Video size={17} />
        </button>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className={cn("grid place-items-center h-9 w-9 rounded-lg transition", searchOpen ? "bg-neon-purple/20 text-neon-purple" : "glass text-white/60 hover:text-neon-purple")}
          title="Поиск по чату"
        >
          <Search size={17} />
        </button>
        <button
          onClick={onToggleInfo}
          className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition"
        >
          <Info size={17} />
        </button>
      </div>

      {latestPinnedMessage && (
        <div className="relative border-b border-neon-purple/15 bg-neon-purple/[0.06]">
          <button
            type="button"
            onClick={() => pinnedMessages.length > 1 ? setPinnedPanelOpen((value) => !value) : jumpToPinnedMessage(latestPinnedMessage.id)}
            className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-white/[0.03]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-neon-purple/15 text-neon-purple"><Pin size={14} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-neon-purple">Закреплённое сообщение{pinnedMessages.length > 1 ? ` · ${pinnedMessages.length}` : ""}</span>
              <span className="block truncate text-xs text-white/55">{pinnedMessagePreview(latestPinnedMessage)}</span>
            </span>
            {pinnedMessages.length > 1 ? <ChevronDown size={15} className={cn("text-white/40 transition", pinnedPanelOpen && "rotate-180")} /> : <MessageSquare size={14} className="text-white/35" />}
          </button>
          <AnimatePresence>
            {pinnedPanelOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="absolute left-2 right-2 top-full z-40 max-h-72 overflow-y-auto rounded-b-3xl border border-white/10 ng-solid shadow-glow-lg">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
                  <span className="text-xs font-semibold text-white/70">Закреплённые сообщения</span>
                  <button type="button" onClick={() => setPinnedPanelOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg glass text-white/45"><X size={13} /></button>
                </div>
                <div className="p-2">
                  {pinnedMessages.map((message) => (
                    <button key={message.id} type="button" onClick={() => jumpToPinnedMessage(message.id)} className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5">
                      <Pin size={13} className="mt-0.5 shrink-0 text-neon-purple" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white/75">{pinnedMessagePreview(message)}</span>
                        <span className="block text-[10px] text-white/30">{clockTime(message.createdAt)}</span>
                      </span>
                      {canManageMessagePins && (
                        <span onClick={(event) => { event.stopPropagation(); void togglePinnedMessage(message); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/35 hover:bg-white/10 hover:text-white" title="Открепить">
                          <PinOff size={13} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {themePanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/5"
          >
            <div className="grid grid-cols-2 gap-2 bg-white/[0.02] p-3 sm:grid-cols-5">
              {CHAT_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => applyChatTheme(theme.id)}
                  className={cn("relative overflow-hidden rounded-2xl px-3 py-3 text-left transition hover:scale-[1.02]", chatThemeId === theme.id ? "text-white shadow-glow" : "glass text-white/65")}
                  style={{ background: chatThemeId === theme.id ? `linear-gradient(135deg, ${theme.main}33, ${theme.secondary}22)` : undefined, border: chatThemeId === theme.id ? `1px solid ${theme.main}66` : undefined }}
                >
                  <div className="text-lg">{theme.emoji}</div>
                  <div className="text-xs font-semibold">{theme.label}</div>
                  <div className="mt-2 h-1 rounded-full" style={{ background: `linear-gradient(90deg, ${theme.main}, ${theme.secondary})` }} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/5 overflow-hidden"
          >
            <div className="flex items-center gap-2 p-3 bg-white/[0.02]">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по сообщениям…"
                  className="w-full rounded-xl glass pl-8 pr-3 py-2 text-sm outline-none focus:border-neon-purple/40"
                />
              </div>
              <span className="w-14 text-center text-xs text-white/40">{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : "0"}</span>
              <button disabled={searchMatches.length === 0} onClick={() => setSearchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length)} className="grid h-8 w-8 place-items-center rounded-lg glass text-white/55 disabled:opacity-30"><ChevronUp size={15} /></button>
              <button disabled={searchMatches.length === 0} onClick={() => setSearchIndex((i) => (i + 1) % searchMatches.length)} className="grid h-8 w-8 place-items-center rounded-lg glass text-white/55 disabled:opacity-30"><ChevronDown size={15} /></button>
              <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="grid h-8 w-8 place-items-center rounded-lg glass text-white/55"><X size={15} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {blocked && (
        <div className="border-b border-red-500/20 bg-red-500/8 px-4 py-2 text-xs text-red-200">
          Пользователь в чёрном списке. Отправка сообщений отключена, пока он в ЧС.
        </div>
      )}

      {requestPending && !blocked && (
        <div className="border-b border-amber-400/20 bg-amber-400/8 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-amber-100">Запрос сообщений</div>
              <div className="text-xs text-white/45">{other.username ? `@${other.username}` : "Пользователь"} не из твоего близкого круга. Прими запрос, чтобы отвечать без ограничений.</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleMessageRequest("accept")} className="btn-glow px-3 py-2 text-xs">Принять</button>
              <button onClick={() => handleMessageRequest("hide")} className="rounded-xl glass px-3 py-2 text-xs text-white/60 hover:text-white">Скрыть</button>
              <button onClick={() => handleMessageRequest("block")} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">Блок</button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto p-4 space-y-2">
        {historyLoading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2, 3, 4].map((item) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: item * 0.04 }}
                className={cn("flex", item % 2 ? "justify-end" : "justify-start")}
              >
                <div className={cn("h-10 rounded-3xl glass-strong", item % 2 ? "w-44 bg-neon-purple/10" : "w-56 bg-white/5")} />
              </motion.div>
            ))}
          </div>
        ) : <>
          {searchWindowStart === null && (normalVisibleMessageStart > 0 || historyHasMore) && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={revealOlderMessages}
                disabled={historyLoadingOlder}
                className="inline-flex items-center gap-2 rounded-xl glass px-3 py-1.5 text-xs text-white/55 transition hover:text-white disabled:cursor-wait disabled:opacity-60"
              >
                {historyLoadingOlder && <Loader2 size={12} className="animate-spin" />}
                {normalVisibleMessageStart > 0
                  ? `Показать предыдущие · ${Math.min(MESSAGE_WINDOW_STEP, normalVisibleMessageStart)}`
                  : "Загрузить более ранние сообщения"}
              </button>
            </div>
          )}
          {visibleMessages.map((m, localIndex) => {
          const i = visibleMessageStart + localIndex;
          if (m.type === "system") {
            const cleanText = (m.text ?? "").replace(/^[📞📹]\s*/u, "");
            const canAnswerCall = cleanText.includes("звонит") && !cleanText.includes("заверш") && !cleanText.includes("Пропущ");
            return (
              <div
                id={`msg-${m.id}`}
                key={m.id}
                className="flex justify-center py-1 ng-message-enter"
              >
                <div className="max-w-[92%] rounded-2xl glass px-3.5 py-2 text-xs text-white/70 flex items-center gap-2 flex-wrap justify-center">
                  <Phone size={13} className="text-neon-purple shrink-0" />
                  <span>{cleanText}</span>
                  {canAnswerCall && (
                    <span className="ml-1 inline-flex gap-1.5">
                      <button onClick={acceptCall} className="rounded-lg bg-neon-purple/25 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-neon-purple/35 transition">Принять</button>
                      <button onClick={rejectCall} className="rounded-lg bg-red-500/15 border border-red-500/25 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/25 transition">Отклонить</button>
                    </span>
                  )}
                </div>
              </div>
            );
          }
          const mine = m.senderId === user?.id;
          const sender = resolveMessageSender(m);
          const prev = messages[i - 1];
          const showAvatar = !mine && (!prev || prev.senderId !== m.senderId);
          const showSenderName = conversation.type === "group" && !mine && showAvatar;
          return (
            <div
              id={`msg-${m.id}`}
              key={m.id}
              className={cn("flex items-end gap-2 group ng-message-enter", mine ? "justify-end" : "justify-start")}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && !m.deletedAt) openMessageActions(m.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") scheduleMessageActionsClose();
              }}
            >
              {!mine && (
                <div className="w-7 shrink-0">
                  {showAvatar && (
                    <button onClick={() => openProfile(sender.username)} className={cn("transition", sender.username && "hover:scale-105")} title={sender.username ? `@${sender.username}` : "Профиль пока недоступен"}>
                      <GlowAvatar src={sender.avatarUrl} alt={sender.username || sender.displayName || "Пользователь"} size={28} online={sender.isOnline} />
                    </button>
                  )}
                </div>
              )}

              <div className={cn("relative min-w-[46px] max-w-[75%] rounded-3xl transition", mine && "items-end", activeFocusMessageId === m.id && "ring-2 ring-neon-purple/70 ring-offset-2 ring-offset-transparent")}>
                {showSenderName && (
                  <button onClick={() => openProfile(sender.username)} className={cn("mb-1 ml-1 block text-left text-[11px] font-semibold", sender.username && "hover:underline")} style={{ color: sender.nameColor || "#ffffff" }}>
                    {sender.displayName || sender.username || "Пользователь"}
                  </button>
                )}
                {m.deletedAt ? (
                  <div className={cn(
                    "rounded-2xl border border-white/8 px-3.5 py-2 text-sm italic text-white/35",
                    mine ? "rounded-br-md bg-white/5" : "rounded-bl-md glass",
                  )}>
                    Сообщение удалено
                  </div>
                ) : (<>
                {/* reply quote */}
                {m.replyTo && (
                  <div className="mb-1 rounded-lg border-l-2 border-neon-purple bg-neon-purple/10 px-2 py-1 text-xs text-white/60">
                    {m.replyTo.text}
                  </div>
                )}

                {/* attachment */}
                {m.type === "image" && m.attachmentUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      const mediaIndex = mediaGallery.findIndex((item) => item.id === m.id);
                      setViewer({ items: mediaGallery, index: Math.max(mediaIndex, 0) });
                    }}
                    className="block mb-1 overflow-hidden rounded-2xl"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.attachmentThumbnailUrl || m.attachmentUrl} alt="" loading="lazy" decoding="async" width={m.mediaWidth} height={m.mediaHeight} className="rounded-2xl max-h-60 object-cover" />
                  </button>
                )}

                {m.type === "video" && m.attachmentUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={m.attachmentUrl} poster={m.attachmentThumbnailUrl} preload="none" className="mb-1 max-h-64 rounded-2xl bg-black/50" controls playsInline />
                )}

                {isVoiceMessage(m) && m.attachmentUrl && (
                  <VoiceMessageBubble
                    id={m.id}
                    url={m.attachmentUrl}
                    durationSec={voiceDuration(m)}
                    mine={mine}
                    mainColor={selectedChatTheme.main}
                    secondaryColor={selectedChatTheme.secondary}
                  />
                )}

                {m.type === "file" && m.attachmentUrl && !isVoiceMessage(m) && (
                  <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="mb-1 block rounded-2xl glass px-3 py-2 text-xs text-white/70 hover:text-white">
                    Файл · открыть
                  </a>
                )}

                {m.type === "poll" && m.poll && (
                  <PollCard
                    message={m}
                    mine={mine}
                    canClose={mine || ["owner", "admin"].includes(selfParticipant?.role || "member")}
                    onVote={(optionIds) => votePoll(m, optionIds)}
                    onClose={() => closePoll(m)}
                  />
                )}

                {m.text && m.type !== "poll" && !isVoiceMessage(m) && (
                  <div
                    className={cn(
                      "px-3.5 py-2 text-sm break-words",
                      mine
                        ? "text-white rounded-2xl rounded-br-md"
                        : "glass text-white/90 rounded-2xl rounded-bl-md",
                      m.type === "sticker" && "bg-transparent px-0 py-0 text-5xl",
                    )}
                    style={mine && m.type !== "sticker" ? { background: `linear-gradient(135deg, ${selectedChatTheme.main}, ${selectedChatTheme.secondary})` } : undefined}
                  >
                    {(() => {
                      const forwarded = parseForwardedText(m.text);
                      if (!forwarded) return <HighlightedText text={m.text ?? ""} query={deferredSearchQuery} />;
                      return (
                        <div className="space-y-1.5">
                          <div className={cn("flex items-center gap-1.5 rounded-xl px-2 py-1 text-[11px]", mine ? "bg-white/12 text-white/75" : "bg-neon-purple/10 text-neon-purple")}> 
                            <Forward size={12} /> {forwarded.header}
                          </div>
                          {forwarded.body && <HighlightedText text={forwarded.body} query={deferredSearchQuery} />}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* reactions */}
                {m.reactions.length > 0 && (
                  <div className={cn("mt-1 flex w-max max-w-[240px] flex-wrap gap-1", mine ? "ml-auto justify-end" : "mr-auto justify-start")}>
                    {m.reactions.map((r) => (
                      <button key={r.emoji} onClick={() => reactToMessage(m.id, r.emoji)} className="shrink-0 rounded-full glass px-1.5 py-0.5 text-xs leading-none transition hover:scale-105">
                        {r.emoji} {r.userIds.length}
                      </button>
                    ))}
                  </div>
                )}
                </>)}

                <div className={cn("flex items-center gap-1 mt-0.5 text-[10px] text-white/30", mine ? "justify-end" : "justify-start")}>
                  {clockTime(m.createdAt)}
                  {m.editedAt && !m.deletedAt && <span title="Сообщение изменено">изменено</span>}
                  {m.pinnedAt && !m.deletedAt && <Pin size={9} className="text-neon-purple" aria-label="Закреплено" />}
                  {!m.deletedAt && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        activeMessageActionsId === m.id ? setActiveMessageActionsId(null) : openMessageActions(m.id);
                      }}
                      className={cn("ml-0.5 h-5 w-5 items-center justify-center rounded-full text-white/35 hover:bg-white/10 hover:text-white", isTouchInput ? "inline-flex" : "inline-flex md:hidden")}
                      title="Реакции и действия"
                      aria-label="Открыть реакции и действия"
                    >
                      <Smile size={11} />
                    </button>
                  )}
                  {mine && (() => {
                    const meta = messageStatusMeta(m);
                    return (
                      <span title={meta.title} className={cn("inline-flex items-center gap-0.5", meta.className)}>
                        {meta.mark}{meta.count && <span className="ml-0.5">{meta.count}</span>}
                      </span>
                    );
                  })()}
                  {mine && (m.status === "failed" || m.status === "queued") && (
                    <button
                      type="button"
                      onClick={() => retryMessage(m)}
                      className={cn("ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition", m.status === "queued" ? "bg-amber-400/10 text-amber-100 hover:bg-amber-400/20" : "bg-red-400/10 text-red-200 hover:bg-red-400/20")}
                      title={m.status === "queued" ? "Отправить сейчас" : "Повторить отправку"}
                    >
                      <RefreshCw size={10} /> {m.status === "queued" ? "В очереди" : "Повторить"}
                    </button>
                  )}
                </div>

                {/* Desktop actions: explicit state + delayed close prevents the toolbar from disappearing while moving the mouse. */}
                {!m.deletedAt && (
                  <div
                    onPointerEnter={cancelMessageActionsClose}
                    onPointerLeave={() => scheduleMessageActionsClose()}
                    className={cn(
                      "absolute -top-10 z-30 hidden w-max max-w-[min(420px,calc(100vw-3rem))] flex-nowrap items-center gap-1 rounded-2xl glass-strong px-2 py-1.5 shadow-glow-lg transition duration-150 md:flex",
                      activeMessageActionsId === m.id
                        ? "pointer-events-auto translate-y-0 opacity-100"
                        : "pointer-events-none translate-y-1 opacity-0",
                      mine ? "right-0 justify-end" : "left-0 justify-start",
                    )}
                  >
                    {QUICK_MESSAGE_REACTIONS.map((e) => (
                      <button key={e} onClick={() => reactToMessage(m.id, e)} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-base transition hover:scale-125 hover:bg-white/10">
                        {e}
                      </button>
                    ))}
                    {canManageMessagePins && (
                      <button onClick={() => togglePinnedMessage(m)} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-white/50 transition hover:bg-white/10 hover:text-neon-purple" title={m.pinnedAt ? "Открепить сообщение" : "Закрепить сообщение"}>
                        {m.pinnedAt ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                    )}
                    <button onClick={() => { setForwardMessage(m); setActiveMessageActionsId(null); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-white/50 transition hover:bg-white/10 hover:text-white" title="Переслать">
                      <Forward size={13} />
                    </button>
                    <button onClick={() => { setReplyTo(m); setActiveMessageActionsId(null); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-white/50 transition hover:bg-white/10 hover:text-white" title="Ответить">
                      <Reply size={13} />
                    </button>
                    {mine && m.text && !isVoiceMessage(m) && (
                      <button onClick={() => beginEditMessage(m)} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-white/50 transition hover:bg-white/10 hover:text-white" title="Изменить">
                        <Pencil size={13} />
                      </button>
                    )}
                    {!mine && (
                      <button onClick={() => reportMessage(m)} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-amber-300/75 transition hover:bg-amber-500/10 hover:text-amber-200" title="Пожаловаться">
                        <Flag size={13} />
                      </button>
                    )}
                    {mine && (
                      <button onClick={() => deleteOwnMessage(m)} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-red-300/75 transition hover:bg-red-500/10 hover:text-red-200" title="Удалить">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}

              </div>
            </div>
          );
        })}
        </>}

        {typing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2">
            <div className="w-7" />
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-white/60"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isTouchInput && activeActionMessage && !activeActionMessage.deletedAt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10035] flex items-end bg-black/55 p-3 backdrop-blur-sm"
          >
            <button
              type="button"
              aria-label="Закрыть действия сообщения"
              className="absolute inset-0"
              onClick={() => setActiveMessageActionsId(null)}
            />
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 28, opacity: 0 }}
              className="relative z-10 w-full rounded-3xl ng-solid p-4 shadow-glow-lg"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Реакция на сообщение</div>
                  <div className="max-w-[75vw] truncate text-xs text-white/40">
                    {activeActionMessage.text || (activeActionMessage.attachmentUrl ? "Медиафайл" : "Сообщение")}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveMessageActionsId(null)} className="grid h-8 w-8 place-items-center rounded-xl glass text-white/50">
                  <X size={15} />
                </button>
              </div>

              <div className="grid grid-cols-6 gap-2">
                {QUICK_MESSAGE_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => reactToMessage(activeActionMessage.id, emoji)}
                    className="grid h-11 place-items-center rounded-2xl glass text-2xl active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setReplyTo(activeActionMessage); setActiveMessageActionsId(null); }} className="flex items-center justify-center gap-2 rounded-2xl glass px-3 py-3 text-sm text-white/75">
                  <Reply size={15} /> Ответить
                </button>
                <button type="button" onClick={() => { setForwardMessage(activeActionMessage); setActiveMessageActionsId(null); }} className="flex items-center justify-center gap-2 rounded-2xl glass px-3 py-3 text-sm text-white/75">
                  <Forward size={15} /> Переслать
                </button>
                {canManageMessagePins && (
                  <button type="button" onClick={() => togglePinnedMessage(activeActionMessage)} className="flex items-center justify-center gap-2 rounded-2xl glass px-3 py-3 text-sm text-white/75">
                    {activeActionMessage.pinnedAt ? <PinOff size={15} /> : <Pin size={15} />} {activeActionMessage.pinnedAt ? "Открепить" : "Закрепить"}
                  </button>
                )}
                {activeActionMessage.senderId === user?.id && activeActionMessage.text && !isVoiceMessage(activeActionMessage) && (
                  <button type="button" onClick={() => beginEditMessage(activeActionMessage)} className="flex items-center justify-center gap-2 rounded-2xl glass px-3 py-3 text-sm text-white/75">
                    <Pencil size={15} /> Изменить
                  </button>
                )}
                {activeActionMessage.senderId !== user?.id && (
                  <button type="button" onClick={() => reportMessage(activeActionMessage)} className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                    <Flag size={15} /> Пожаловаться
                  </button>
                )}
                {activeActionMessage.senderId === user?.id && (
                  <button type="button" onClick={() => deleteOwnMessage(activeActionMessage)} className="flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 px-3 py-3 text-sm text-red-200">
                    <Trash2 size={15} /> Удалить
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticker / emoji panels */}
      <AnimatePresence>
        {showStickers && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="p-3 grid grid-cols-6 gap-2">
              {STICKERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send({ text: s, type: "sticker" })}
                  className="text-3xl rounded-xl hover:bg-neon-purple/10 py-2 transition hover:scale-110"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {showEmojis && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="p-3 flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setText((t) => t + e)}
                  className="text-2xl rounded-xl hover:bg-neon-purple/10 p-1.5 transition hover:scale-110"
                >
                  {e}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit / reply banners */}
      <AnimatePresence>
        {editingMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="flex items-center gap-2 bg-amber-400/5 px-4 py-2">
              <Pencil size={14} className="text-amber-200" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-amber-100">Редактирование сообщения</div>
                <div className="truncate text-xs text-white/45">{editingMessage.text}</div>
              </div>
              <button type="button" onClick={cancelEditMessage} className="text-white/40 hover:text-white" aria-label="Отменить редактирование">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply banner */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-neon-purple/5">
              <Reply size={14} className="text-neon-purple" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neon-purple font-semibold">Ответ</div>
                <div className="text-xs text-white/50 truncate">{replyTo.text}</div>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <AnimatePresence>
        {saveNotice && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="fixed bottom-6 left-1/2 z-[10020] -translate-x-1/2 rounded-full glass-strong px-4 py-2 text-xs text-white/80 shadow-glow"
          >
            {saveNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-3 border-t border-white/5 glass-strong">
        <AnimatePresence>
          {draftMedia.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="mb-3 overflow-hidden"
            >
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {draftMedia.map((item, i) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.88 }}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/5"
                  >
                    {item.type === "video" ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                    ) : item.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-white/55">
                        <Paperclip size={18} />
                        <span className="line-clamp-2 text-[9px] leading-tight">{item.name}</span>
                      </div>
                    )}
                    {i === MEDIA_BATCH_LIMIT && (
                      <span className="absolute left-1 top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">след.</span>
                    )}
                    <button onClick={() => removeDraft(item.id)} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/65 text-white/80 hover:text-red-300">
                      <X size={11} />
                    </button>
                  </motion.div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className={draftOverBatch ? "text-red-300" : "text-white/40"}>
                  {draftMedia.length}/{MEDIA_BATCH_LIMIT} вложений{draftOverBatch ? " · лишнее уйдёт следующим сообщением" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setSendOriginal((value) => !value)}
                  className={cn("rounded-full border px-2.5 py-1 transition", sendOriginal ? "border-neon-purple/45 bg-neon-purple/15 text-neon-purple" : "border-white/10 bg-white/5 text-white/45 hover:text-white")}
                  title="Не преобразовывать изображения в WebP"
                >
                  {sendOriginal ? "Оригиналы" : "Сжимать фото"}
                </button>
                <span className={draftOverSize ? "text-red-300" : "text-white/40"}>
                  {(draftSize / 1024 / 1024).toFixed(1)} / 50 МБ
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {uploadProgress && (
            <motion.div
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 8, height: 0 }}
              className="mb-3 overflow-hidden rounded-2xl border border-neon-purple/20 bg-neon-purple/8 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <Loader2 size={16} className={cn("shrink-0 text-neon-purple", uploadProgress.phase !== "waiting-network" && "animate-spin")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-white/75">{uploadProgress.phase === "waiting-network" ? "Ожидание сети" : uploadProgress.phase === "retrying" ? "Повтор загрузки" : `Загрузка ${uploadProgress.index}/${uploadProgress.totalFiles}`}</span>
                    <span className="shrink-0 font-semibold text-neon-purple">{uploadProgress.percent}%</span>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-white/40">{uploadProgress.fileName}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-neon-purple transition-[width]" style={{ width: `${uploadProgress.percent}%` }} />
                  </div>
                </div>
                <button type="button" onClick={cancelActiveUpload} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5 text-white/45 hover:bg-red-500/10 hover:text-red-300" title="Отменить загрузку">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(recordingVoice || voiceDraft) && (
            <motion.div
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 8, height: 0 }}
              className="mb-3 overflow-hidden rounded-2xl glass px-3 py-2"
            >
              {recordingVoice ? (
                <div className="flex items-center gap-3">
                  <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                    <span className="absolute h-full w-full animate-ping rounded-full bg-red-500/20" />
                    <Mic size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white/80">Запись голосового</div>
                    <div className="text-xs text-white/40">{prettyDuration(recordSeconds)} / {prettyDuration(VOICE_MAX_SECONDS)}</div>
                  </div>
                  <button type="button" onClick={() => stopVoiceRecording(true)} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/55 hover:text-white">Отмена</button>
                  <button type="button" onClick={() => stopVoiceRecording()} className="btn-glow px-3 py-2 text-xs">Готово</button>
                </div>
              ) : voiceDraft ? (
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-neon-purple/15 text-neon-purple"><Mic size={16} /></span>
                  <audio src={voiceDraft.url} controls className="h-8 min-w-0 flex-1" />
                  <span className="text-xs text-white/40">{prettyDuration(voiceDraft.durationSec)}</span>
                  <button type="button" onClick={clearVoiceDraft} className="grid h-8 w-8 place-items-center rounded-xl glass text-white/45 hover:text-red-300"><X size={14} /></button>
                  <button type="button" onClick={sendVoiceDraft} disabled={uploadingFile} className="btn-glow px-3 py-2 text-xs disabled:opacity-50">Отправить</button>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitComposer();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.docx,.xlsx,.pptx"
            multiple
            onChange={(e) => addDraftFiles(e.currentTarget.files)}
          />
          <button
            type="button"
            disabled={uploadingFile || requestPending || Boolean(editingMessage)}
            onClick={() => !blocked && !requestPending && !editingMessage && fileInput.current?.click()}
            className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition shrink-0 disabled:opacity-50"
          >
            {uploadingFile ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
          </button>
          <button
            type="button"
            disabled={uploadingFile || requestPending || Boolean(editingMessage)}
            onClick={() => !blocked && !requestPending && !editingMessage && fileInput.current?.click()}
            className="hidden sm:grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition shrink-0 disabled:opacity-50"
            title="Выбрать фото, видео или файл"
          >
            <ImageIcon size={17} />
          </button>
          <button
            type="button"
            disabled={uploadingFile || blocked || requestPending || Boolean(editingMessage)}
            onClick={() => recordingVoice ? stopVoiceRecording() : startVoiceRecording()}
            className={cn("grid place-items-center h-9 w-9 rounded-lg transition shrink-0 disabled:opacity-50", recordingVoice ? "bg-red-500/15 text-red-300 border border-red-500/30" : "glass text-white/60 hover:text-neon-purple")}
            title="Голосовое сообщение"
          >
            <Mic size={17} />
          </button>
          <button
            type="button"
            disabled={uploadingFile || blocked || requestPending || Boolean(editingMessage)}
            onClick={openSchedulePanel}
            className="relative grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition shrink-0 disabled:opacity-50"
            title="Запланировать сообщение"
          >
            <CalendarClock size={17} />
            {scheduledMessages.length > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-neon-purple px-1 text-[9px] font-bold text-white">
                {scheduledMessages.length > 9 ? "9+" : scheduledMessages.length}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={uploadingFile || blocked || requestPending || Boolean(editingMessage)}
            onClick={() => setPollModalOpen(true)}
            className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition shrink-0 disabled:opacity-50"
            title="Создать опрос"
          >
            <BarChart3 size={17} />
          </button>
          <div className="flex-1 relative">
            {mentionSuggestions.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30 overflow-hidden rounded-2xl border border-white/10 ng-solid shadow-glow-lg">
                <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/30"><AtSign size={12} /> Упомянуть участника</div>
                {mentionSuggestions.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    onClick={() => insertMention(participant.username)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                  >
                    <GlowAvatar src={participant.avatarUrl} alt={participant.displayName || participant.username} size={28} frame={participant.avatarFrame} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white/75">{participant.displayName || participant.username}</span>
                      <span className="block truncate text-[10px] text-neon-purple">@{participant.username}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <input
              ref={composerInputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value.slice(0, MESSAGE_LIMIT));
                onTyping();
              }}
              disabled={blocked || requestPending}
              placeholder={editingMessage ? "Измените текст сообщения…" : blocked ? "Пользователь в ЧС" : requestPending ? "Прими запрос, чтобы ответить…" : "Сообщение…"}
              className="w-full rounded-full glass pl-4 pr-10 py-2.5 text-sm outline-none focus:border-neon-purple/40"
            />
            <button
              type="button"
              onClick={() => {
                setShowEmojis((v) => !v);
                setShowStickers(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-neon-purple"
            >
              <Smile size={18} />
            </button>
            {(text.length > 3600 || draftMedia.length > 0) && (
              <span className={cn("absolute -bottom-4 right-3 text-[10px]", messageOverLimit ? "text-red-300" : "text-white/30")}>{text.length}/{MESSAGE_LIMIT}</span>
            )}
          </div>
          <button
            type="submit"
            disabled={blocked || requestPending || uploadingFile || editSubmitting || messageOverLimit || draftOverSize || (!text.trim() && draftMedia.length === 0)}
            className="grid place-items-center h-10 w-10 rounded-full btn-glow disabled:opacity-40 shrink-0"
          >
            {editSubmitting ? <Loader2 size={16} className="animate-spin" /> : editingMessage ? <Pencil size={16} /> : <Send size={16} />}
          </button>
        </form>
      </div>

      <AnimatePresence>
        {schedulePanelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10045] grid place-items-center overflow-y-auto bg-black/70 p-4 py-6 backdrop-blur-sm"
          >
            <div className="absolute inset-0" onClick={() => !schedulingMessage && setSchedulePanelOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              className="relative z-10 w-full max-w-lg ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">Отложенная отправка</h3>
                  <p className="mt-1 text-xs text-white/45">Сервер отправит сообщение даже если NightGram закрыт.</p>
                </div>
                <button type="button" onClick={() => !schedulingMessage && setSchedulePanelOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl glass text-white/50 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <label className="block text-xs font-semibold text-white/60">Дата и время</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                min={toLocalDateTimeInput(new Date(Date.now() + 30_000))}
                onChange={(event) => setScheduleAt(event.target.value)}
                className="mt-2 w-full rounded-2xl glass px-4 py-3 text-sm outline-none focus:border-neon-purple/50"
              />

              <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">Будет отправлено</div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/75">
                  {text.trim() || (draftMedia.length > 0 ? `${draftMedia.length} медиа` : "Пустое сообщение")}
                </p>
                {draftMedia.length > 0 && <div className="mt-2 text-xs text-neon-purple">Вложений: {draftMedia.length}</div>}
                {replyTo && <div className="mt-2 text-xs text-white/40">Ответ на: {replyTo.text || "сообщение"}</div>}
              </div>

              <button
                type="button"
                onClick={() => void scheduleComposerMessage()}
                disabled={schedulingMessage || (!text.trim() && draftMedia.length === 0)}
                className="btn-glow mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-40"
              >
                {schedulingMessage ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
                Запланировать
              </button>

              <div className="mt-6 border-t border-white/8 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Запланированные</h4>
                  <span className="text-xs text-white/35">{scheduledMessages.length}</span>
                </div>
                {scheduledLoading ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-white/40"><Loader2 size={14} className="animate-spin" /> Загрузка…</div>
                ) : scheduledMessages.length === 0 ? (
                  <div className="rounded-2xl glass px-4 py-5 text-center text-xs text-white/35">Нет запланированных сообщений</div>
                ) : (
                  <div className="space-y-2">
                    {scheduledMessages.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-2xl glass p-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neon-purple/12 text-neon-purple">
                          <CalendarClock size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-white/75">{item.text || (item.type === "image" ? "Изображение" : item.type === "video" ? "Видео" : "Вложение")}</div>
                          <div className="mt-0.5 text-[11px] text-white/35">{formatScheduledDate(item.scheduledAt)}{item.status === "failed" ? " · ошибка отправки" : ""}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {item.status === "failed" && (
                            <button
                              type="button"
                              onClick={() => void retryScheduled(item.id)}
                              className="grid h-8 w-8 place-items-center rounded-xl text-white/35 hover:bg-neon-purple/10 hover:text-neon-purple"
                              title="Повторить через 30 секунд"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void cancelScheduled(item.id)}
                            className="grid h-8 w-8 place-items-center rounded-xl text-white/35 hover:bg-red-500/10 hover:text-red-300"
                            title="Отменить"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pollModalOpen && (
          <CreatePollModal onClose={() => setPollModalOpen(false)} onCreate={createPoll} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {forwardMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10040] grid place-items-center overflow-y-auto bg-black/70 p-4 py-6 sm:py-8 backdrop-blur-sm"
          >
            <div className="absolute inset-0" onClick={() => setForwardMessage(null)} />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.94 }}
              className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <button onClick={() => setForwardMessage(null)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white">
                <X size={16} />
              </button>
              <h3 className="font-display font-bold text-xl flex items-center gap-2 mb-2">
                <Forward size={18} className="text-neon-purple" /> Переслать сообщение
              </h3>
              <div className="mb-4 rounded-2xl glass px-3 py-2 text-xs text-white/60 line-clamp-2">
                {forwardMessage.text || (forwardMessage.attachmentUrl ? "Медиафайл" : "Сообщение")}
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                <button
                  onClick={() => forwardToSaved(forwardMessage)}
                  className="w-full flex items-center gap-3 rounded-2xl glass px-3 py-3 text-left hover:brightness-110 transition"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full glass-strong shadow-glow">
                    <Bookmark size={17} className="text-neon-purple" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">Избранное</div>
                    <div className="text-xs text-white/40">Личный чат-сейф</div>
                  </div>
                </button>

                {forwardLoading ? (
                  <div className="py-6 text-center text-white/40"><Loader2 size={18} className="animate-spin mx-auto" /></div>
                ) : forwardConversations.length === 0 ? (
                  <div className="py-6 text-center text-sm text-white/40">Других чатов пока нет</div>
                ) : forwardConversations.map((target) => (
                  <button
                    key={target.id}
                    onClick={() => forwardToConversation(target, forwardMessage)}
                    className="w-full flex items-center gap-3 rounded-2xl glass px-3 py-3 text-left hover:brightness-110 transition"
                  >
                    <GlowAvatar src={target.avatarUrl} alt={target.title} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{target.title}</div>
                      <div className="text-xs text-white/40 truncate">{target.type === "group" ? "Группа" : "Личные сообщения"}</div>
                    </div>
                    <MessageSquare size={15} className="text-white/35" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {callState && !callMinimized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10060] grid place-items-center overflow-y-auto bg-black/70 p-4 py-6 sm:py-8 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              className="relative w-full max-w-3xl ng-solid rounded-4xl p-5 shadow-glow-lg"
            >
              <div className="absolute right-4 top-4 z-20 flex gap-2">
                <button onClick={() => setCallMinimized(true)} className="grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white" title="Свернуть">
                  <Minimize2 size={16} />
                </button>
                <button onClick={endCall} className="grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white" title="Закрыть звонок">
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 flex items-center gap-3 pr-20">
                <div className="grid h-12 w-12 place-items-center rounded-full glass-strong shadow-glow">
                  {callState.type === "video" ? <Video size={20} className="text-neon-purple" /> : <Phone size={20} className="text-neon-purple" />}
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-lg">
                    {callState.status === "incoming" ? "Входящий звонок" : callState.status === "outgoing" ? "Звоним…" : callState.status === "active" ? "Звонок активен" : "Звонок завершён"}
                  </div>
                  <div className="text-xs text-white/45">
                    {callState.type === "video" ? "Видеозвонок" : "Аудиозвонок"} {callState.fromUsername ? `от @${callState.fromUsername}` : `с ${chatTitle}`}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="relative min-h-[180px] overflow-hidden rounded-3xl bg-black/70 glass">
                  {remoteStream ? (
                    <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-[180px] w-full object-cover" />
                  ) : (
                    <div className="grid min-h-[180px] place-items-center text-center text-white/45">
                      <div>
                        <GlowAvatar src={chatAvatarUrl} alt={chatTitle} size={72} glow="purple" />
                        <div className="mt-3 text-sm">Ожидаем собеседника…</div>
                      </div>
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-[11px] text-white/70">Собеседник</div>
                </div>
                <div className="relative min-h-[180px] overflow-hidden rounded-3xl bg-black/70 glass">
                  {localStream && callState.type === "video" ? (
                    <video ref={localVideoRef} autoPlay muted playsInline className="h-full min-h-[180px] w-full object-cover" />
                  ) : (
                    <div className="grid min-h-[180px] place-items-center text-white/45">
                      {callState.type === "video" && !cameraEnabled ? <VideoOff size={30} /> : <Mic size={30} />}
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-[11px] text-white/70">Вы</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <label className="text-[11px] text-white/45">
                  Микрофон
                  <CustomSelect
                    value={selectedMicId}
                    onChange={setSelectedMicId}
                    className="mt-1"
                    buttonClassName="rounded-xl px-3 py-2 text-xs"
                    options={[{ value: "", label: "По умолчанию" }, ...deviceLists.audioInputs.map((d) => ({ value: d.deviceId, label: d.label || `Микрофон ${d.deviceId.slice(0, 5)}` }))]}
                  />
                </label>
                <label className="text-[11px] text-white/45">
                  Камера
                  <CustomSelect
                    value={selectedCameraId}
                    onChange={setSelectedCameraId}
                    className="mt-1"
                    buttonClassName="rounded-xl px-3 py-2 text-xs"
                    options={[{ value: "", label: "По умолчанию" }, ...deviceLists.videoInputs.map((d) => ({ value: d.deviceId, label: d.label || `Камера ${d.deviceId.slice(0, 5)}` }))]}
                  />
                </label>
                <label className="text-[11px] text-white/45">
                  Наушники/вывод
                  <CustomSelect
                    value={selectedSpeakerId}
                    onChange={setSelectedSpeakerId}
                    className="mt-1"
                    buttonClassName="rounded-xl px-3 py-2 text-xs"
                    options={[{ value: "", label: "По умолчанию" }, ...deviceLists.audioOutputs.map((d) => ({ value: d.deviceId, label: d.label || `Устройство ${d.deviceId.slice(0, 5)}` }))]}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {callState.status === "incoming" && <button onClick={acceptCall} className="btn-glow flex-1 min-w-[120px] py-2.5 text-sm">Принять</button>}
                {callState.status === "incoming" && <button onClick={rejectCall} className="rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-2.5 text-sm text-red-300">Отклонить</button>}
                {callState.status !== "incoming" && <button onClick={endCall} className="rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-2.5 text-sm text-red-300">Завершить</button>}
                <button onClick={toggleMic} disabled={!localStream} className={micEnabled ? "btn-ghost px-4 py-2.5 text-sm" : "rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-2.5 text-sm text-red-300"}>{micEnabled ? <Mic size={15} /> : <MicOff size={15} />}</button>
                {callState.type === "video" && <button onClick={toggleCamera} disabled={!localStream} className={cameraEnabled ? "btn-ghost px-4 py-2.5 text-sm" : "rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-2.5 text-sm text-red-300"}>{cameraEnabled ? <Video size={15} /> : <VideoOff size={15} />}</button>}
              </div>

              <div className="mt-3 rounded-2xl glass px-3 py-2 text-[11px] text-white/45">
                Шумоподавление включено через браузерные constraints: echoCancellation, noiseSuppression, autoGainControl.
                {" "}{turnEnabled
                  ? "TURN-сервер подключён — звонки стабильнее за строгими NAT/фаерволами."
                  : "TURN пока не настроен: STUN работает, но для продакшн-звонков через сложные сети добавь NEXT_PUBLIC_TURN_URL/USERNAME/CREDENTIAL."}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {callState && callMinimized && (
          <motion.div
            initial={{ opacity: 0, x: -24, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -24, y: 16, scale: 0.95 }}
            className={cn(
              "fixed left-3 right-3 bottom-20 z-[10060] ng-solid rounded-3xl p-3 shadow-glow-lg md:bottom-5 md:w-80",
              callState.status === "incoming"
                ? "md:left-auto md:right-5"
                : "md:left-5 md:right-auto",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full glass-strong shadow-glow shrink-0">
                {callState.type === "video" ? <Video size={18} className="text-neon-purple" /> : <Phone size={18} className="text-neon-purple" />}
              </div>
              <button onClick={() => setCallMinimized(false)} className="min-w-0 flex-1 text-left">
                <div className="font-semibold text-sm truncate">
                  {callState.status === "incoming" ? "Вам звонят" : callState.status === "outgoing" ? "Звоним…" : callState.status === "active" ? "Звонок активен" : "Звонок"}
                </div>
                <div className="text-xs text-white/45 truncate">{callState.fromUsername ? `@${callState.fromUsername}` : chatTitle}</div>
              </button>
              {callState.status === "incoming" ? (
                <>
                  <button onClick={acceptCall} className="btn-glow px-3 py-2 text-xs">Принять</button>
                  <button onClick={rejectCall} className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/15 border border-red-500/30 text-red-300"><X size={15} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => setCallMinimized(false)} className="grid h-9 w-9 place-items-center rounded-xl glass text-white/60" title="Развернуть"><Maximize2 size={15} /></button>
                  <button onClick={endCall} className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/15 border border-red-500/30 text-red-300"><X size={15} /></button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MediaViewer
        items={viewer?.items ?? []}
        initialIndex={viewer?.index ?? 0}
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}

function VoiceMessageBubble({
  id,
  url,
  durationSec,
  mine,
  mainColor,
  secondaryColor,
}: {
  id: string;
  url: string;
  durationSec: number;
  mine: boolean;
  mainColor: string;
  secondaryColor: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const bars = useMemo(() => Array.from({ length: 36 }, (_, index) => {
    const seed = id.charCodeAt(index % Math.max(1, id.length)) + index * 17;
    return 18 + (seed % 54);
  }), [id]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div
      className={cn("mb-1 min-w-[260px] rounded-2xl px-3 py-2", mine ? "text-white" : "glass text-white/90")}
      style={mine ? { background: `linear-gradient(135deg, ${mainColor}, ${secondaryColor})` } : undefined}
    >
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          const duration = audio.duration || durationSec || 1;
          setProgress(Math.min(1, audio.currentTime / duration));
        }}
      />
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/70">
        <span className="flex items-center gap-1.5"><Mic size={12} /> Голосовое</span>
        <span>{prettyVoiceDuration(durationSec)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full bg-black/20 text-white hover:bg-black/30">
          {playing ? "Ⅱ" : "▶"}
        </button>
        <button type="button" onClick={cycleRate} className="rounded-full bg-black/18 px-2 py-1 text-[11px] font-semibold text-white/75 hover:text-white">
          {rate}x
        </button>
        <button type="button" onClick={toggle} className="group flex h-10 flex-1 items-end gap-[2px] rounded-xl bg-black/12 px-2 py-1.5">
          {bars.map((height, index) => {
            const active = index / bars.length <= progress;
            return (
              <span
                key={index}
                className={cn("w-full rounded-full transition", active ? "bg-white" : "bg-white/32")}
                style={{ height: `${height}%`, minHeight: 4 }}
              />
            );
          })}
        </button>
      </div>
    </div>
  );
}

function prettyVoiceDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function parseForwardedText(text?: string): { header: string; body: string } | null {
  if (!text?.startsWith("↪ Переслано от ")) return null;
  const [firstLine, ...rest] = text.split("\n");
  return { header: firstLine.replace(/^↪\s*/, ""), body: rest.join("\n") };
}

function MentionAwareText({ text }: { text: string }) {
  const chunks = text.split(/(@[a-zA-Z0-9_]{3,32})/g);
  return (
    <>
      {chunks.map((chunk, index) => chunk.startsWith("@")
        ? <span key={`${chunk}-${index}`} className="rounded-md bg-neon-purple/15 px-0.5 font-semibold text-neon-purple">{chunk}</span>
        : <span key={`plain-${index}`}>{chunk}</span>)}
    </>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <span className="whitespace-pre-wrap"><MentionAwareText text={text} /></span>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needle, cursor);
  while (idx !== -1) {
    if (idx > cursor) parts.push(<MentionAwareText key={`t-${cursor}`} text={text.slice(cursor, idx)} />);
    parts.push(<mark key={`m-${idx}`} className="rounded bg-yellow-300/25 px-0.5 text-inherit">{text.slice(idx, idx + q.length)}</mark>);
    cursor = idx + q.length;
    idx = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(<MentionAwareText key={`t-${cursor}`} text={text.slice(cursor)} />);
  return <span className="whitespace-pre-wrap">{parts}</span>;
}

