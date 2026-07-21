"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Phone,
  Video,
  Mic,
  MicOff,
  VideoOff,
  X,
  Minimize2,
  Maximize2,
  Loader2,
  ScreenShare,
  ScreenShareOff,
  RefreshCcw,
  Users,
  Volume2,
  Activity,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { cn, uid } from "@/lib/utils";
import { GlowAvatar } from "./GlowAvatar";
import { pushGlobalToast } from "@/lib/toast";
import { CustomSelect } from "./CustomSelect";
import {
  type CallQualitySample,
  classifyCallQuality,
  qualityLabel,
  videoEncodingForQuality,
  worstCallQuality,
} from "@/lib/callQuality";

type CallKind = "audio" | "video";
type CallStatus = "incoming" | "outgoing" | "connecting" | "active" | "ended";
type FacingMode = "user" | "environment";
type CallConnectionVisual = "incoming" | "dialing" | "connecting" | "connected" | "reconnecting" | "offline" | "disconnected" | "ended";

type ManagedCall = {
  callId: string;
  conversationId: string;
  type: CallKind;
  status: CallStatus;
  title: string;
  avatarUrl: string | null;
  fromUserId?: string;
  fromUsername?: string;
  participants?: string[];
  joinedParticipantIds?: string[];
  isCaller: boolean;
};

type StartCallDetail = {
  conversationId: string;
  title?: string;
  avatarUrl?: string | null;
  type: CallKind;
  participants?: string[];
};

type IncomingPayload = {
  conversationId: string;
  callId: string;
  fromUserId: string;
  fromUsername?: string;
  type: CallKind;
  conversationTitle?: string;
  avatarUrl?: string | null;
  participants?: string[];
};

type OfferPayload = IncomingPayload & { offer: RTCSessionDescriptionInit; iceRestart?: boolean };
type AnswerPayload = { conversationId: string; callId: string; fromUserId: string; answer: RTCSessionDescriptionInit; participants?: string[] };
type IcePayload = { conversationId: string; callId: string; fromUserId: string; candidate: RTCIceCandidateInit };
type MediaState = { micEnabled?: boolean; cameraEnabled?: boolean; screenSharing?: boolean };
type MediaStatePayload = MediaState & { conversationId: string; callId: string; fromUserId: string };
type ParticipantJoinedPayload = {
  conversationId: string;
  callId: string;
  participantId: string;
  joinedParticipantIds: string[];
  participants?: string[];
  resumed?: boolean;
};
type ParticipantLeftPayload = {
  conversationId: string;
  callId: string;
  participantId: string;
  joinedParticipantIds: string[];
  reason?: string;
};
type RemoteEntry = { userId: string; stream: MediaStream };
type WakeLockSentinelLike = { released?: boolean; release: () => Promise<void> };

const MAX_MESH_PARTICIPANTS = 8;
const ACTIVE_CALL_SESSION_KEY = "nightgram_active_call_v3";
const ACTIVE_CALL_MAX_AGE_MS = 5 * 60 * 1000;

function buildFallbackIceServers(): RTCIceServer[] {
  const stunUrls = (process.env.NEXT_PUBLIC_STUN_URLS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
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
  if (stunUrls.length) servers.push({ urls: stunUrls });
  if (turnUrls.length) servers.push(username && credential ? { urls: turnUrls, username, credential } : { urls: turnUrls });
  return servers;
}

function containsTurn(servers: RTCIceServer[]) {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => String(url).startsWith("turn:") || String(url).startsWith("turns:"));
  });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function callConnectionMeta(status: CallConnectionVisual) {
  const values: Record<CallConnectionVisual, { label: string; className: string; dotClassName: string }> = {
    incoming: { label: "Входящий звонок", className: "border-cyan-300/30 bg-cyan-400/15 text-cyan-100", dotClassName: "bg-cyan-300" },
    dialing: { label: "Вызов…", className: "border-violet-300/30 bg-violet-400/15 text-violet-100", dotClassName: "bg-violet-300 animate-pulse" },
    connecting: { label: "Подключение…", className: "border-amber-300/30 bg-amber-400/15 text-amber-100", dotClassName: "bg-amber-300 animate-pulse" },
    connected: { label: "Подключено", className: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100", dotClassName: "bg-emerald-300" },
    reconnecting: { label: "Восстановление связи…", className: "border-orange-300/30 bg-orange-400/15 text-orange-100", dotClassName: "bg-orange-300 animate-pulse" },
    offline: { label: "Нет сети", className: "border-red-300/35 bg-red-500/20 text-red-100", dotClassName: "bg-red-300 animate-pulse" },
    disconnected: { label: "Отключено", className: "border-red-300/35 bg-red-500/20 text-red-100", dotClassName: "bg-red-300" },
    ended: { label: "Звонок завершён", className: "border-white/15 bg-white/5 text-white/55", dotClassName: "bg-white/35" },
  };
  return values[status];
}

function resolveCallConnectionVisual(
  callStatus: CallStatus,
  networkOnline: boolean,
  peerStates: RTCPeerConnectionState[],
): CallConnectionVisual {
  if (!networkOnline) return "offline";
  if (callStatus === "incoming") return "incoming";
  if (callStatus === "ended") return "ended";
  if (peerStates.some((state) => state === "failed" || state === "closed")) return "disconnected";
  if (peerStates.some((state) => state === "disconnected")) return "reconnecting";
  if (peerStates.some((state) => state === "connected") || callStatus === "active") return "connected";
  if (callStatus === "outgoing" && peerStates.length === 0) return "dialing";
  return "connecting";
}

function mediaErrorMessage(error: unknown, kind: "call" | "screen") {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return kind === "screen" ? "Доступ к экрану не разрешён" : "Разреши NightGram доступ к микрофону и камере";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Микрофон или камера не найдены";
  if (name === "NotReadableError" || name === "TrackStartError") return "Устройство уже используется другой программой";
  if (name === "OverconstrainedError") return "Выбранное устройство недоступно";
  if (name === "SecurityError") return "Для звонков на телефоне открой NightGram по HTTPS";
  return kind === "screen" ? "Не удалось начать демонстрацию экрана" : "Не удалось подключить микрофон или камеру";
}

function setMediaOutput(element: HTMLMediaElement | null, speakerId: string) {
  if (!element || !speakerId || !("setSinkId" in element)) return;
  (element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(speakerId).catch(() => {});
}

function RemoteParticipantTile({
  entry,
  mediaState,
  selectedSpeakerId,
  avatarUrl,
  title,
  quality,
  connectionState,
  centered = false,
}: {
  entry: RemoteEntry;
  mediaState?: MediaState;
  selectedSpeakerId: string;
  avatarUrl: string | null;
  title: string;
  quality?: CallQualitySample;
  connectionState?: RTCPeerConnectionState;
  centered?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const hasVideo = entry.stream.getVideoTracks().some((track) => track.readyState === "live");

  useEffect(() => {
    const element = hasVideo ? videoRef.current : audioRef.current;
    const inactiveElement = hasVideo ? audioRef.current : videoRef.current;
    if (inactiveElement) {
      inactiveElement.pause();
      inactiveElement.srcObject = null;
    }
    if (!element) return;
    element.srcObject = entry.stream;
    setMediaOutput(element, selectedSpeakerId);
    const play = element.play();
    if (play) play.then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
  }, [entry.stream, hasVideo, selectedSpeakerId]);

  const resumePlayback = () => {
    const element = hasVideo ? videoRef.current : audioRef.current;
    element?.play().then(() => setPlaybackBlocked(false)).catch(() => {});
  };

  const participantVisual = connectionState === "connected"
    ? callConnectionMeta("connected")
    : connectionState === "disconnected"
      ? callConnectionMeta("reconnecting")
      : connectionState === "failed" || connectionState === "closed"
        ? callConnectionMeta("disconnected")
        : callConnectionMeta("connecting");

  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-black/75 glass", centered ? "min-h-[320px]" : "min-h-[190px]")}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={cn("h-full w-full", centered ? "min-h-[320px]" : "min-h-[190px]", mediaState?.screenSharing ? "object-contain" : "object-cover")}
        />
      ) : (
        <div className={cn("grid place-items-center text-center text-white/45", centered ? "min-h-[320px]" : "min-h-[190px]")}>
          <div className="flex flex-col items-center justify-center">
            <GlowAvatar src={avatarUrl} alt={title} size={centered ? 112 : 66} glow="purple" />
            <div className={cn("font-semibold text-white/80", centered ? "mt-5 text-base" : "mt-3 text-xs")}>{title}</div>
            <div className="mt-1 text-xs text-white/40">Участник · {entry.userId.slice(0, 8)}</div>
          </div>
        </div>
      )}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-[11px] text-white/75">
        {mediaState?.screenSharing ? "Демонстрация" : `Участник ${entry.userId.slice(0, 5)}`}
      </div>
      <div className={cn("absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium", participantVisual.className)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", participantVisual.dotClassName)} />
        {participantVisual.label}
      </div>
      {quality && quality.level !== "unknown" && (
        <div className={cn(
          "absolute left-3 bottom-3 rounded-full border px-2 py-1 text-[10px]",
          quality.level === "bad" ? "border-red-400/30 bg-red-500/20 text-red-100"
            : quality.level === "poor" ? "border-amber-300/30 bg-amber-400/15 text-amber-100"
              : "border-emerald-300/25 bg-emerald-400/15 text-emerald-100",
        )}>
          <Activity size={11} className="mr-1 inline" /> {qualityLabel(quality.level)}
        </div>
      )}
      {mediaState?.micEnabled === false && (
        <div className="absolute right-3 top-12 rounded-full border border-red-400/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-200">
          <MicOff size={12} className="mr-1 inline" /> микрофон выкл.
        </div>
      )}
      {mediaState?.screenSharing && (
        <div className="absolute right-3 bottom-3 rounded-full border border-cyan-300/25 bg-cyan-300/15 px-2 py-1 text-[11px] text-cyan-100">
          <ScreenShare size={12} className="mr-1 inline" /> экран
        </div>
      )}
      {playbackBlocked && (
        <button onClick={resumePlayback} className="absolute inset-x-3 bottom-3 rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-xs text-white/80">
          <Volume2 size={13} className="mr-1 inline" /> Включить звук
        </button>
      )}
    </div>
  );
}

export function GlobalCallManager() {
  const { user, status } = useAuth();
  const [call, setCall] = useState<ManagedCall | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteEntries, setRemoteEntries] = useState<RemoteEntry[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [deviceLists, setDeviceLists] = useState<{ audioInputs: MediaDeviceInfo[]; videoInputs: MediaDeviceInfo[]; audioOutputs: MediaDeviceInfo[] }>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [duration, setDuration] = useState(0);
  const [screenSharing, setScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [turnEnabled, setTurnEnabled] = useState(() => containsTurn(buildFallbackIceServers()));
  const [connectionHint, setConnectionHint] = useState("Подготовка соединения");
  const [participantMediaState, setParticipantMediaState] = useState<Record<string, MediaState>>({});
  const [joinedParticipantIds, setJoinedParticipantIds] = useState<string[]>([]);
  const [qualityByParticipant, setQualityByParticipant] = useState<Record<string, CallQualitySample>>({});
  const [peerConnectionStates, setPeerConnectionStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [networkOnline, setNetworkOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [rtcConfig, setRtcConfig] = useState<RTCConfiguration>(() => ({
    iceServers: buildFallbackIceServers(),
    iceCandidatePoolSize: 6,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  }));

  const callRef = useRef<ManagedCall | null>(null);
  const peerMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const iceBufferRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const pendingOffersRef = useRef<Map<string, RTCSessionDescriptionInit>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const startedAtRef = useRef<number | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const micEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(true);
  const screenSharingRef = useRef(false);
  const appliedQualityRef = useRef<Map<string, CallQualitySample["level"]>>(new Map());
  const statsBaselineRef = useRef<Map<string, { lost: number; received: number }>>(new Map());
  const restoreAttemptedRef = useRef(false);

  const isMobileDevice = useMemo(() => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent), []);
  const overallQuality = useMemo(() => worstCallQuality(Object.values(qualityByParticipant)), [qualityByParticipant]);
  const screenShareSupported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia || window.nightgramDesktop?.chooseDisplaySource);

  function commitCall(next: ManagedCall | null) {
    callRef.current = next;
    setCall(next);
  }

  function patchCall(updater: (current: ManagedCall) => ManagedCall) {
    const current = callRef.current;
    if (!current) return;
    const next = updater(current);
    callRef.current = next;
    setCall(next);
  }

  function updateMicEnabled(next: boolean) {
    micEnabledRef.current = next;
    setMicEnabled(next);
  }

  function updateCameraEnabled(next: boolean) {
    cameraEnabledRef.current = next;
    setCameraEnabled(next);
  }

  function updateScreenSharing(next: boolean) {
    screenSharingRef.current = next;
    setScreenSharing(next);
  }

  function syncRemoteEntries() {
    setRemoteEntries(Array.from(remoteStreamsRef.current.entries()).map(([userId, stream]) => ({ userId, stream })));
  }

  useEffect(() => {
    try {
      if (!call) {
        if (restoreAttemptedRef.current) sessionStorage.removeItem(ACTIVE_CALL_SESSION_KEY);
        return;
      }
      if (call.status === "incoming" || call.status === "ended") {
        sessionStorage.removeItem(ACTIVE_CALL_SESSION_KEY);
        return;
      }
      sessionStorage.setItem(ACTIVE_CALL_SESSION_KEY, JSON.stringify({ ...call, savedAt: Date.now() }));
    } catch {
      // Private mode can deny sessionStorage; the live call still continues.
    }
  }, [call]);

  useEffect(() => {
    const active = Boolean(call && call.status !== "incoming" && call.status !== "ended");
    window.dispatchEvent(new CustomEvent(active ? "nightgram:call-service-start" : "nightgram:call-service-stop", {
      detail: active ? { title: call?.title || "Звонок NightGram", video: call?.type === "video", callId: call?.callId } : undefined,
    }));
  }, [call]);

  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent("nightgram:call-service-stop"));
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setNetworkOnline(true);
      const current = callRef.current;
      if (!current || current.status === "incoming" || current.status === "ended") return;
      setConnectionHint("Сеть вернулась, восстанавливаем звонок…");
      socket().emit("call:resume", { conversationId: current.conversationId, callId: current.callId }, (response: { ok?: boolean; joinedParticipantIds?: string[] }) => {
        if (!response?.ok) return;
        if (response.joinedParticipantIds) {
          setJoinedParticipantIds(response.joinedParticipantIds);
          patchCall((value) => ({ ...value, joinedParticipantIds: response.joinedParticipantIds }));
        }
        for (const [remoteUserId, pc] of peerMapRef.current.entries()) void restartPeerIce(remoteUserId, pc);
      });
    };
    const onOffline = () => {
      setNetworkOnline(false);
      setConnectionHint("Нет сети — звонок будет восстановлен после подключения");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // Handlers intentionally use mutable call/peer refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    api.getCallIceConfig()
      .then((config) => {
        if (cancelled || !config.iceServers.length) return;
        setRtcConfig({
          iceServers: config.iceServers,
          iceCandidatePoolSize: 6,
          bundlePolicy: "max-bundle",
          rtcpMuxPolicy: "require",
        });
        setTurnEnabled(config.turnEnabled || containsTurn(config.iceServers));
      })
      .catch(() => {
        // Старый backend продолжит работать через публичный STUN fallback.
      });
    return () => { cancelled = true; };
  }, [status]);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setDeviceLists({
      audioInputs: devices.filter((device) => device.kind === "audioinput"),
      videoInputs: devices.filter((device) => device.kind === "videoinput"),
      audioOutputs: devices.filter((device) => device.kind === "audiooutput"),
    });
  }

  useEffect(() => {
    setSelectedSpeakerId(localStorage.getItem("ng_audio_output_device") || "");
    const onOutput = (event: Event) => {
      const deviceId = ((event as CustomEvent<{ deviceId?: string }>).detail?.deviceId) || "";
      setSelectedSpeakerId(deviceId);
    };
    window.addEventListener("nightgram:audio-output-change", onOutput);
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      window.removeEventListener("nightgram:audio-output-change", onOutput);
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, []);

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream;
    localVideoRef.current.play().catch(() => {});
  }, [localStream]);

  useEffect(() => {
    if (!call || call.status !== "active") {
      setDuration(0);
      return;
    }
    startedAtRef.current ||= Date.now();
    const interval = window.setInterval(() => {
      setDuration(Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [call?.status, call]);

  useEffect(() => {
    if (!call || !["connecting", "active"].includes(call.status)) return;
    const sample = () => {
      for (const [remoteUserId, pc] of peerMapRef.current.entries()) void collectPeerQuality(remoteUserId, pc);
    };
    sample();
    const interval = window.setInterval(sample, 3000);
    return () => window.clearInterval(interval);
    // Sampling reads the current peer map and must not restart for each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.status, call]);

  async function acquireWakeLock() {
    if (document.visibilityState !== "visible") return;
    const wakeLockApi = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wakeLockApi || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await wakeLockApi.request("screen");
    } catch {
      // Wake Lock отсутствует на части iOS/desktop браузеров.
    }
  }

  async function releaseWakeLock() {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock && !lock.released) await lock.release().catch(() => {});
  }

  useEffect(() => {
    const shouldHold = Boolean(callRef.current && ["outgoing", "connecting", "active"].includes(callRef.current.status));
    if (shouldHold) void acquireWakeLock();
    else void releaseWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === "visible" && callRef.current && callRef.current.status !== "incoming") {
        void acquireWakeLock();
        for (const entry of remoteStreamsRef.current.values()) {
          for (const track of entry.getTracks()) track.enabled = true;
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [call?.status]);

  function socket() {
    return getSocket();
  }

  function clearReconnectTimer(key: string) {
    const timer = reconnectTimersRef.current.get(key);
    if (timer) window.clearTimeout(timer);
    reconnectTimersRef.current.delete(key);
  }

  function closePeerFor(remoteUserId: string) {
    clearReconnectTimer(remoteUserId);
    const pc = peerMapRef.current.get(remoteUserId);
    pc?.close();
    peerMapRef.current.delete(remoteUserId);
    makingOfferRef.current.delete(remoteUserId);
    remoteStreamsRef.current.get(remoteUserId)?.getTracks().forEach((track) => track.stop());
    remoteStreamsRef.current.delete(remoteUserId);
    setParticipantMediaState((prev) => {
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });
    setQualityByParticipant((prev) => {
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });
    setPeerConnectionStates((prev) => {
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });
    appliedQualityRef.current.delete(remoteUserId);
    statsBaselineRef.current.delete(remoteUserId);
    for (const key of iceBufferRef.current.keys()) {
      if (key.endsWith(`:${remoteUserId}`)) iceBufferRef.current.delete(key);
    }
    syncRemoteEntries();
  }

  function closeAllPeers() {
    for (const key of reconnectTimersRef.current.keys()) clearReconnectTimer(key);
    peerMapRef.current.forEach((pc) => pc.close());
    peerMapRef.current.clear();
    makingOfferRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    remoteStreamsRef.current.clear();
    setRemoteEntries([]);
    setLocalStream(null);
    pendingOffersRef.current.clear();
    setParticipantMediaState({});
    setQualityByParticipant({});
    setPeerConnectionStates({});
    appliedQualityRef.current.clear();
    statsBaselineRef.current.clear();
    setJoinedParticipantIds([]);
    iceBufferRef.current.clear();
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    updateScreenSharing(false);
    startedAtRef.current = null;
    setDuration(0);
    setConnectionHint("Подготовка соединения");
    void releaseWakeLock();
  }

  function emitMediaState(next?: Partial<Required<MediaState>>) {
    const current = callRef.current;
    if (!current || current.status === "incoming") return;
    socket().emit("call:media-state", {
      conversationId: current.conversationId,
      callId: current.callId,
      micEnabled: micEnabledRef.current,
      cameraEnabled: cameraEnabledRef.current,
      screenSharing: screenSharingRef.current,
      ...next,
    });
  }

  function audioConstraints(deviceId = selectedMicId): MediaTrackConstraints {
    return {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
    };
  }

  function videoConstraints(deviceId = selectedCameraId, facing: FacingMode = facingMode): MediaTrackConstraints {
    return {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      facingMode: deviceId ? undefined : { ideal: facing },
      width: { ideal: isMobileDevice ? 960 : 1280, max: 1920 },
      height: { ideal: isMobileDevice ? 540 : 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    };
  }

  async function getCallStream(type: CallKind) {
    if (!window.isSecureContext && !window.nightgramDesktop) throw new DOMException("WebRTC requires HTTPS", "SecurityError");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(),
        video: type === "video" ? videoConstraints() : false,
      });
    } catch (error) {
      if (type !== "video") throw error;
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
      pushGlobalToast("Камера недоступна — звонок начат только со звуком", "info");
    }
    localStreamRef.current = stream;
    setLocalStream(stream);
    updateMicEnabled(stream.getAudioTracks().some((track) => track.enabled));
    updateCameraEnabled(stream.getVideoTracks().some((track) => track.enabled));
    await refreshDevices();
    return stream;
  }

  function attachLocalTracks(pc: RTCPeerConnection, stream: MediaStream) {
    for (const track of stream.getTracks()) {
      const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
      if (!sender) pc.addTrack(track, stream);
    }
    if (!pc.getTransceivers().some((transceiver) => transceiver.receiver.track.kind === "video")) {
      pc.addTransceiver("video", { direction: "sendrecv" });
    }
  }

  async function flushIceBuffer(pc: RTCPeerConnection, remoteUserId: string, callId: string) {
    const key = `${callId}:${remoteUserId}`;
    const buffered = iceBufferRef.current.get(key) || [];
    iceBufferRef.current.delete(key);
    for (const candidate of buffered) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  }

  async function sendOffer(pc: RTCPeerConnection, current: ManagedCall, targetUserId: string, iceRestart = false) {
    if (pc.connectionState === "closed" || makingOfferRef.current.has(targetUserId)) return;
    try {
      makingOfferRef.current.add(targetUserId);
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer({ iceRestart, offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket().emit("call:offer", {
        conversationId: current.conversationId,
        callId: current.callId,
        offer: pc.localDescription || offer,
        type: current.type,
        toUserId: targetUserId,
        iceRestart,
      });
    } finally {
      makingOfferRef.current.delete(targetUserId);
    }
  }

  function canInitiateNegotiation(remoteUserId: string) {
    if (!user) return false;
    const current = callRef.current;
    return Boolean(current?.isCaller || user.id.localeCompare(remoteUserId) < 0);
  }

  async function restartPeerIce(remoteUserId: string, pc: RTCPeerConnection) {
    const current = callRef.current;
    if (!current || !canInitiateNegotiation(remoteUserId) || pc.connectionState === "closed") return;
    clearReconnectTimer(remoteUserId);
    try {
      setConnectionHint("Восстанавливаем соединение…");
      pc.restartIce();
      await sendOffer(pc, current, remoteUserId, true);
    } catch {
      pushGlobalToast("Не удалось восстановить участника. Проверь TURN и сеть.", "error");
    }
  }

  function refreshOverallConnectionHint() {
    const peers = Array.from(peerMapRef.current.values());
    const connected = peers.filter((pc) => pc.connectionState === "connected").length;
    const expected = Math.max(0, (callRef.current?.joinedParticipantIds?.length || joinedParticipantIds.length) - 1);
    if (connected > 0) {
      patchCall((current) => ({ ...current, status: "active" }));
      setConnectionHint(`${connected}${expected > connected ? ` из ${expected}` : ""} подключено${turnEnabled ? " · TURN доступен" : ""}`);
    }
  }

  async function applyAdaptiveVideoQuality(remoteUserId: string, pc: RTCPeerConnection, level: CallQualitySample["level"]) {
    if (level === "unknown" || appliedQualityRef.current.get(remoteUserId) === level) return;
    const sender = pc.getSenders().find((item) => item.track?.kind === "video");
    if (!sender) return;
    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) parameters.encodings = [{}];
      const adaptive = videoEncodingForQuality(level);
      parameters.encodings = parameters.encodings.map((encoding) => ({ ...encoding, ...adaptive }));
      parameters.degradationPreference = screenSharingRef.current ? "maintain-resolution" : "balanced";
      await sender.setParameters(parameters);
      appliedQualityRef.current.set(remoteUserId, level);
    } catch {
      // Safari and older Chromium may reject live encoding updates; media keeps working.
    }
  }

  async function collectPeerQuality(remoteUserId: string, pc: RTCPeerConnection) {
    if (pc.connectionState === "closed") return;
    try {
      const stats = await pc.getStats();
      let roundTripMs: number | null = null;
      let availableOutgoingBitrateKbps: number | null = null;
      let packetsLost = 0;
      let packetsReceived = 0;
      const jitterValues: number[] = [];

      stats.forEach((raw) => {
        const report = raw as RTCStats & Record<string, unknown>;
        if (report.type === "candidate-pair" && (report.state === "succeeded" || report.nominated === true)) {
          const rtt = Number(report.currentRoundTripTime);
          if (Number.isFinite(rtt) && rtt >= 0) roundTripMs = Math.round(rtt * 1000);
          const bitrate = Number(report.availableOutgoingBitrate);
          if (Number.isFinite(bitrate) && bitrate >= 0) availableOutgoingBitrateKbps = Math.round(bitrate / 1000);
        }
        if (report.type === "remote-inbound-rtp") {
          const rtt = Number(report.roundTripTime);
          if (roundTripMs === null && Number.isFinite(rtt) && rtt >= 0) roundTripMs = Math.round(rtt * 1000);
        }
        if (report.type === "inbound-rtp" && report.isRemote !== true) {
          const lost = Number(report.packetsLost);
          const received = Number(report.packetsReceived);
          if (Number.isFinite(lost) && lost > 0) packetsLost += lost;
          if (Number.isFinite(received) && received > 0) packetsReceived += received;
          const jitter = Number(report.jitter);
          if (Number.isFinite(jitter) && jitter >= 0) jitterValues.push(jitter * 1000);
        }
      });

      const previous = statsBaselineRef.current.get(remoteUserId);
      statsBaselineRef.current.set(remoteUserId, { lost: packetsLost, received: packetsReceived });
      const intervalLost = previous ? Math.max(0, packetsLost - previous.lost) : packetsLost;
      const intervalReceived = previous ? Math.max(0, packetsReceived - previous.received) : packetsReceived;
      const packetTotal = intervalLost + intervalReceived;
      const packetLossPercent = packetTotal > 0 ? Math.round((intervalLost / packetTotal) * 1000) / 10 : null;
      const jitterMs = jitterValues.length ? Math.round(Math.max(...jitterValues)) : null;
      const level = classifyCallQuality({ roundTripMs, packetLossPercent, jitterMs, availableOutgoingBitrateKbps });
      const sample: CallQualitySample = {
        level,
        roundTripMs,
        packetLossPercent,
        jitterMs,
        availableOutgoingBitrateKbps,
        updatedAt: Date.now(),
      };
      setQualityByParticipant((prev) => ({ ...prev, [remoteUserId]: sample }));
      await applyAdaptiveVideoQuality(remoteUserId, pc, level);
    } catch {
      // getStats can briefly fail while a peer is renegotiating.
    }
  }

  function createPeer(callId: string, conversationId: string, remoteUserId: string) {
    const existing = peerMapRef.current.get(remoteUserId);
    if (existing && existing.connectionState !== "closed") return existing;

    const pc = new RTCPeerConnection(rtcConfig);
    peerMapRef.current.set(remoteUserId, pc);
    setPeerConnectionStates((prev) => ({ ...prev, [remoteUserId]: "new" }));
    const remote = new MediaStream();
    remoteStreamsRef.current.set(remoteUserId, remote);
    syncRemoteEntries();

    pc.ontrack = (event) => {
      const incomingTracks = event.streams[0]?.getTracks().length ? event.streams[0].getTracks() : [event.track];
      for (const track of incomingTracks) {
        if (!remote.getTracks().some((existingTrack) => existingTrack.id === track.id)) remote.addTrack(track);
        track.onended = () => {
          remote.removeTrack(track);
          syncRemoteEntries();
        };
      }
      remoteStreamsRef.current.set(remoteUserId, remote);
      syncRemoteEntries();
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket().emit("call:ice-candidate", {
        conversationId,
        callId,
        candidate: event.candidate.toJSON(),
        toUserId: remoteUserId,
      });
    };

    pc.onicecandidateerror = () => {
      if (!turnEnabled) setConnectionHint("Прямое соединение; для сложных сетей нужен TURN");
    };

    const updateConnectionState = () => {
      const state = pc.connectionState;
      setPeerConnectionStates((prev) => ({ ...prev, [remoteUserId]: state }));
      if (state === "connected") {
        clearReconnectTimer(remoteUserId);
        startedAtRef.current ||= Date.now();
        refreshOverallConnectionHint();
        return;
      }
      if (state === "connecting" || state === "new") {
        setConnectionHint("Устанавливаем защищённые соединения…");
        return;
      }
      if (state === "disconnected") {
        setConnectionHint("Связь с участником прервалась, восстанавливаем…");
        if (!reconnectTimersRef.current.has(remoteUserId)) {
          const timer = window.setTimeout(() => void restartPeerIce(remoteUserId, pc), 2500);
          reconnectTimersRef.current.set(remoteUserId, timer);
        }
        return;
      }
      if (state === "failed") void restartPeerIce(remoteUserId, pc);
      if (state === "closed") closePeerFor(remoteUserId);
    };

    pc.onconnectionstatechange = updateConnectionState;
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") void restartPeerIce(remoteUserId, pc);
    };
    return pc;
  }

  async function createOfferFor(remoteUserId: string) {
    const current = callRef.current;
    const stream = localStreamRef.current;
    if (!current || !stream || remoteUserId === user?.id) return;
    const pc = createPeer(current.callId, current.conversationId, remoteUserId);
    attachLocalTracks(pc, stream);
    await sendOffer(pc, current, remoteUserId);
  }

  async function answerOffer(remoteUserId: string, offer: RTCSessionDescriptionInit) {
    const current = callRef.current;
    const stream = localStreamRef.current;
    if (!current || !stream) return;
    const pc = createPeer(current.callId, current.conversationId, remoteUserId);
    attachLocalTracks(pc, stream);
    const offerCollision = makingOfferRef.current.has(remoteUserId) || pc.signalingState !== "stable";
    const polite = Boolean(user && user.id.localeCompare(remoteUserId) > 0);
    if (offerCollision && !polite) return;
    if (offerCollision) await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIceBuffer(pc, remoteUserId, current.callId);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket().emit("call:answer", {
      conversationId: current.conversationId,
      callId: current.callId,
      answer: pc.localDescription || answer,
      toUserId: remoteUserId,
    });
    patchCall((value) => ({ ...value, status: "connecting" }));
  }

  async function startCall(detail: StartCallDetail) {
    if (status !== "authenticated" || !user) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      pushGlobalToast("Звонки требуют современный браузер и HTTPS", "error");
      return;
    }
    if (callRef.current && callRef.current.status !== "ended") {
      pushGlobalToast("Уже есть активный звонок", "info");
      return;
    }
    const requestedParticipants = Array.from(new Set(detail.participants || []));
    if (requestedParticipants.length > MAX_MESH_PARTICIPANTS) {
      pushGlobalToast(`Групповой звонок поддерживает до ${MAX_MESH_PARTICIPANTS} участников`, "error");
      return;
    }

    const callId = uid("call");
    const nextCall: ManagedCall = {
      callId,
      conversationId: detail.conversationId,
      type: detail.type,
      status: "outgoing",
      title: detail.title || "Звонок NightGram",
      avatarUrl: detail.avatarUrl ?? null,
      participants: requestedParticipants,
      joinedParticipantIds: [user.id],
      isCaller: true,
    };
    commitCall(nextCall);
    setJoinedParticipantIds([user.id]);
    setMinimized(false);
    setConnectionHint("Запрашиваем микрофон и камеру…");

    try {
      const stream = await getCallStream(detail.type);
      const response = await new Promise<{ ok?: boolean; error?: string; participants?: string[]; busyParticipantIds?: string[]; maxParticipants?: number }>((resolve) => {
        socket().emit("call:start", { conversationId: detail.conversationId, callId, type: detail.type }, resolve);
      });
      if (!response.ok) throw new Error(response.error || "call_start_failed");
      const participants = response.participants?.length ? response.participants : requestedParticipants;
      patchCall((current) => ({ ...current, participants }));
      const targets = participants.filter((id) => id && id !== user.id).slice(0, MAX_MESH_PARTICIPANTS - 1);
      for (const targetId of targets) await createOfferFor(targetId);
      setConnectionHint(targets.length > 1 ? "Ожидаем участников…" : "Ожидаем ответ…");
      window.setTimeout(() => emitMediaState({ micEnabled: true, cameraEnabled: stream.getVideoTracks().length > 0, screenSharing: false }), 250);
    } catch (error) {
      const message = error instanceof Error && error.message === "group_call_too_large"
        ? `В звонке может быть не больше ${MAX_MESH_PARTICIPANTS} участников`
        : error instanceof Error && error.message === "already_in_call"
          ? "Этот аккаунт уже участвует в другом звонке"
          : error instanceof Error && error.message === "participant_busy"
            ? "Собеседник уже занят другим звонком"
            : mediaErrorMessage(error, "call");
      pushGlobalToast(message, "error");
      closeAllPeers();
      commitCall(null);
    }
  }

  async function acceptCall() {
    const current = callRef.current;
    if (!current || current.status !== "incoming" || !user) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      pushGlobalToast("Звонки требуют современный браузер и HTTPS", "error");
      return;
    }
    patchCall((value) => ({ ...value, status: "connecting" }));
    setMinimized(false);
    setConnectionHint("Подключаемся…");
    try {
      const stream = await getCallStream(current.type);
      const response = await new Promise<{ ok?: boolean; error?: string; joinedParticipantIds?: string[] }>((resolve) => {
        socket().emit("call:accept", { conversationId: current.conversationId, callId: current.callId }, resolve);
      });
      if (!response.ok) throw new Error(response.error || "call_not_found");
      const joined = response.joinedParticipantIds || [user.id];
      setJoinedParticipantIds(joined);
      patchCall((value) => ({ ...value, joinedParticipantIds: joined }));
      const offers = Array.from(pendingOffersRef.current.entries());
      pendingOffersRef.current.clear();
      for (const [remoteUserId, offer] of offers) await answerOffer(remoteUserId, offer);
      window.setTimeout(() => emitMediaState({ micEnabled: true, cameraEnabled: stream.getVideoTracks().length > 0, screenSharing: false }), 250);
    } catch (error) {
      pushGlobalToast(error instanceof Error && error.message === "call_not_found" ? "Звонок уже завершён" : mediaErrorMessage(error, "call"), "error");
      rejectCall();
    }
  }

  function rejectCall() {
    const current = callRef.current;
    if (!current) return;
    socket().emit("call:reject", { conversationId: current.conversationId, callId: current.callId });
    closeAllPeers();
    commitCall(null);
  }

  function endCall() {
    const current = callRef.current;
    if (!current) return;
    const isGroupCall = (current.participants?.length || 0) > 2;
    const payload = { conversationId: current.conversationId, callId: current.callId };
    if (current.isCaller || !isGroupCall) socket().emit("call:end", payload);
    else socket().emit("call:leave", payload);
    closeAllPeers();
    commitCall(null);
  }

  function toggleMic() {
    const next = !micEnabledRef.current;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    updateMicEnabled(next);
    emitMediaState({ micEnabled: next });
  }

  function toggleCamera() {
    const next = !cameraEnabledRef.current;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    updateCameraEnabled(next);
    emitMediaState({ cameraEnabled: next });
  }

  async function replaceAudioInput(deviceId: string) {
    setSelectedMicId(deviceId);
    if (!localStreamRef.current) return;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId), video: false });
      const nextTrack = fresh.getAudioTracks()[0];
      if (!nextTrack) return;
      for (const pc of peerMapRef.current.values()) {
        const sender = pc.getSenders().find((item) => item.track?.kind === "audio");
        if (sender) await sender.replaceTrack(nextTrack);
        else pc.addTrack(nextTrack, fresh);
      }
      localStreamRef.current.getAudioTracks().forEach((track) => track.stop());
      const videoTracks = localStreamRef.current.getVideoTracks();
      localStreamRef.current = new MediaStream([nextTrack, ...videoTracks]);
      if (!screenSharingRef.current) setLocalStream(localStreamRef.current);
      updateMicEnabled(true);
      emitMediaState({ micEnabled: true });
    } catch (error) {
      pushGlobalToast(mediaErrorMessage(error, "call"), "error");
    }
  }

  async function replaceVideoInput(deviceId: string, nextFacing = facingMode) {
    setSelectedCameraId(deviceId);
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints(deviceId, nextFacing) });
      const nextTrack = fresh.getVideoTracks()[0];
      if (!nextTrack) return;
      const currentStream = localStreamRef.current || new MediaStream();
      const previousTracks = currentStream.getVideoTracks();
      const audioTracks = currentStream.getAudioTracks();
      localStreamRef.current = new MediaStream([...audioTracks, nextTrack]);
      if (!screenSharingRef.current) {
        for (const [remoteUserId, pc] of peerMapRef.current.entries()) {
          const sender = pc.getSenders().find((item) => item.track?.kind === "video");
          if (sender) await sender.replaceTrack(nextTrack);
          else {
            pc.addTrack(nextTrack, localStreamRef.current);
            const activeCall = callRef.current;
            if (activeCall) await sendOffer(pc, activeCall, remoteUserId);
          }
        }
        setLocalStream(localStreamRef.current);
      }
      previousTracks.forEach((track) => track.stop());
      updateCameraEnabled(true);
      emitMediaState({ cameraEnabled: true });
    } catch (error) {
      pushGlobalToast(mediaErrorMessage(error, "call"), "error");
    }
  }

  async function flipCamera() {
    if (screenSharingRef.current) return;
    const next: FacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    setSelectedCameraId("");
    await replaceVideoInput("", next);
  }

  async function startScreenShare() {
    const current = callRef.current;
    if (!current || current.status === "incoming") return;
    if (!screenShareSupported || !navigator.mediaDevices?.getDisplayMedia) {
      pushGlobalToast("На этом устройстве демонстрация экрана недоступна", "error");
      return;
    }
    try {
      if (window.nightgramDesktop?.chooseDisplaySource) {
        const selected = await window.nightgramDesktop.chooseDisplaySource();
        if (!selected) return;
      }
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) throw new DOMException("No screen track", "NotFoundError");
      for (const [remoteUserId, pc] of peerMapRef.current.entries()) {
        const sender = pc.getSenders().find((item) => item.track?.kind === "video")
          || pc.getTransceivers().find((item) => item.receiver.track.kind === "video")?.sender;
        if (sender) await sender.replaceTrack(screenTrack);
        else {
          pc.addTrack(screenTrack, displayStream);
          await sendOffer(pc, current, remoteUserId);
        }
      }
      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => { void stopScreenShare(); };
      const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
      setLocalStream(new MediaStream([...audioTracks, screenTrack]));
      updateScreenSharing(true);
      emitMediaState({ screenSharing: true, cameraEnabled: true });
      pushGlobalToast("Демонстрация экрана включена", "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      pushGlobalToast(mediaErrorMessage(error, "screen"), "error");
    }
  }

  async function stopScreenShare() {
    const activeScreenTrack = screenTrackRef.current;
    if (!activeScreenTrack) return;
    const originalVideo = localStreamRef.current?.getVideoTracks()[0] ?? null;
    for (const pc of peerMapRef.current.values()) {
      const sender = pc.getSenders().find((item) => item.track?.kind === "video")
        || pc.getTransceivers().find((item) => item.receiver.track.kind === "video")?.sender;
      await sender?.replaceTrack(originalVideo);
    }
    activeScreenTrack.onended = null;
    activeScreenTrack.stop();
    screenTrackRef.current = null;
    setLocalStream(localStreamRef.current);
    updateScreenSharing(false);
    emitMediaState({ screenSharing: false, cameraEnabled: Boolean(originalVideo?.enabled) });
    pushGlobalToast("Демонстрация экрана остановлена", "info");
  }

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const s = socket();

    const onStart = (event: Event) => void startCall((event as CustomEvent<StartCallDetail>).detail);
    const onAccept = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (!detail?.conversationId || detail.conversationId === callRef.current?.conversationId) void acceptCall();
    };
    const onReject = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (!detail?.conversationId || detail.conversationId === callRef.current?.conversationId) rejectCall();
    };
    const onEnd = () => endCall();

    const incoming = (payload: IncomingPayload) => {
      if (payload.fromUserId === user.id) return;
      if (callRef.current && callRef.current.status !== "ended" && callRef.current.callId !== payload.callId) {
        s.emit("call:reject", { conversationId: payload.conversationId, callId: payload.callId });
        return;
      }
      const next: ManagedCall = {
        callId: payload.callId,
        conversationId: payload.conversationId,
        type: payload.type,
        status: "incoming",
        title: payload.conversationTitle || (payload.fromUsername ? `@${payload.fromUsername}` : "Входящий звонок"),
        avatarUrl: payload.avatarUrl ?? null,
        fromUserId: payload.fromUserId,
        fromUsername: payload.fromUsername,
        participants: payload.participants,
        joinedParticipantIds: [payload.fromUserId],
        isCaller: false,
      };
      commitCall(next);
      setJoinedParticipantIds([payload.fromUserId]);
      setConnectionHint((payload.participants?.length || 0) > 2 ? "Входящий групповой звонок" : "Входящий звонок");
      setMinimized(true);
    };

    const offer = async (payload: OfferPayload) => {
      if (payload.fromUserId === user.id) return;
      let current = callRef.current;
      if (!current || current.callId !== payload.callId) {
        pendingOffersRef.current.set(payload.fromUserId, payload.offer);
        incoming(payload);
        return;
      }
      if (current.status === "incoming" || !localStreamRef.current) {
        pendingOffersRef.current.set(payload.fromUserId, payload.offer);
        return;
      }
      try {
        await answerOffer(payload.fromUserId, payload.offer);
        current = callRef.current;
        if (current?.callId === payload.callId) setMinimized(false);
      } catch {
        pushGlobalToast("Не удалось обновить соединение звонка", "error");
      }
    };

    const answer = async (payload: AnswerPayload) => {
      const current = callRef.current;
      if (!current || payload.fromUserId === user.id || payload.callId !== current.callId) return;
      const pc = peerMapRef.current.get(payload.fromUserId);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        await flushIceBuffer(pc, payload.fromUserId, payload.callId);
        setConnectionHint("Соединяем медиапотоки…");
        setMinimized(false);
      } catch {
        pushGlobalToast("Ответ на звонок повреждён или устарел", "error");
      }
    };

    const ice = async (payload: IcePayload) => {
      if (payload.fromUserId === user.id || !payload.candidate) return;
      const current = callRef.current;
      const pc = current?.callId === payload.callId ? peerMapRef.current.get(payload.fromUserId) : null;
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
      } else {
        const key = `${payload.callId}:${payload.fromUserId}`;
        const buffered = iceBufferRef.current.get(key) || [];
        buffered.push(payload.candidate);
        iceBufferRef.current.set(key, buffered.slice(-100));
      }
    };

    const mediaState = (payload: MediaStatePayload) => {
      const current = callRef.current;
      if (!current || payload.fromUserId === user.id || payload.callId !== current.callId) return;
      setParticipantMediaState((prev) => ({
        ...prev,
        [payload.fromUserId]: {
          ...prev[payload.fromUserId],
          micEnabled: payload.micEnabled,
          cameraEnabled: payload.cameraEnabled,
          screenSharing: payload.screenSharing,
        },
      }));
    };

    const participantJoined = async (payload: ParticipantJoinedPayload) => {
      const current = callRef.current;
      if (!current || current.callId !== payload.callId) return;
      setJoinedParticipantIds(payload.joinedParticipantIds);
      patchCall((value) => ({
        ...value,
        participants: payload.participants || value.participants,
        joinedParticipantIds: payload.joinedParticipantIds,
      }));
      if (payload.participantId === user.id || current.status === "incoming") return;
      if (!peerMapRef.current.has(payload.participantId) && localStreamRef.current) {
        await createOfferFor(payload.participantId).catch(() => {});
      } else if (payload.resumed) {
        const pc = peerMapRef.current.get(payload.participantId);
        if (pc && ["failed", "disconnected"].includes(pc.connectionState)) void restartPeerIce(payload.participantId, pc);
      }
      pushGlobalToast("Участник подключился к звонку", "info");
    };

    const participantLeft = (payload: ParticipantLeftPayload) => {
      const current = callRef.current;
      if (!current || current.callId !== payload.callId || payload.participantId === user.id) return;
      closePeerFor(payload.participantId);
      setJoinedParticipantIds(payload.joinedParticipantIds);
      patchCall((value) => ({ ...value, joinedParticipantIds: payload.joinedParticipantIds }));
      pushGlobalToast(payload.reason === "disconnected" ? "Участник потерял соединение" : "Участник вышел из звонка", "info");
    };

    const accepted = ({ callId, byUserId }: { callId: string; byUserId: string }) => {
      if (byUserId === user.id) return;
      const current = callRef.current;
      if (!current || current.callId !== callId) return;
      patchCall((value) => ({ ...value, status: "connecting" }));
      setConnectionHint((current.participants?.length || 0) > 2 ? "Участник принял звонок…" : "Собеседник принял звонок…");
      setMinimized(false);
    };

    const rejectFromRemote = ({ callId, byUserId }: { callId: string; byUserId: string }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId || byUserId === user.id) return;
      const isGroupCall = (current.participants?.length || 0) > 2;
      if (isGroupCall && current.status !== "incoming") {
        closePeerFor(byUserId);
        pushGlobalToast("Один участник отклонил звонок", "info");
        return;
      }
      closeAllPeers();
      commitCall({ ...current, status: "ended" });
      setMinimized(false);
      pushGlobalToast("Звонок отклонён", "info");
      window.setTimeout(() => {
        if (callRef.current?.callId === callId) commitCall(null);
      }, 1200);
    };

    const closeFromRemote = ({ callId, byUserId }: { callId: string; byUserId: string }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId || byUserId === user.id) return;
      closeAllPeers();
      commitCall({ ...current, status: "ended" });
      setMinimized(false);
      pushGlobalToast("Звонок завершён", "info");
      window.setTimeout(() => {
        if (callRef.current?.callId === callId) commitCall(null);
      }, 1200);
    };

    const resumeCurrentCall = () => {
      const current = callRef.current;
      if (!current || current.status === "incoming" || current.status === "ended") return;
      s.emit("call:resume", { conversationId: current.conversationId, callId: current.callId }, (response) => {
        if (!response?.ok || !response.joinedParticipantIds) return;
        setJoinedParticipantIds(response.joinedParticipantIds);
        patchCall((value) => ({ ...value, joinedParticipantIds: response.joinedParticipantIds }));
        emitMediaState();
      });
    };

    const onPushIncoming = (event: Event) => {
      const detail = (event as CustomEvent<Partial<IncomingPayload>>).detail;
      if (!detail?.callId || !detail.conversationId || !detail.fromUserId || !detail.type) return;
      incoming(detail as IncomingPayload);
    };

    window.addEventListener("nightgram:start-call", onStart);
    window.addEventListener("nightgram:accept-call", onAccept);
    window.addEventListener("nightgram:reject-call", onReject);
    window.addEventListener("nightgram:end-call", onEnd);
    window.addEventListener("nightgram:incoming-call", onPushIncoming);
    s.on("connect", resumeCurrentCall);
    s.on("call:incoming", incoming);
    s.on("call:offer", offer);
    s.on("call:answer", answer);
    s.on("call:ice-candidate", ice);
    s.on("call:media-state", mediaState);
    s.on("call:participant-joined", participantJoined);
    s.on("call:participant-left", participantLeft);
    s.on("call:accepted", accepted);
    s.on("call:rejected", rejectFromRemote);
    s.on("call:ended", closeFromRemote);

    void api.getPendingCall().then((pending) => {
      if (!pending || callRef.current) return;
      incoming({
        conversationId: pending.conversationId,
        callId: pending.callId,
        fromUserId: pending.initiatorId,
        fromUsername: pending.initiatorUsername || undefined,
        type: pending.callType,
        conversationTitle: pending.conversationTitle || undefined,
        avatarUrl: pending.avatarUrl || null,
        participants: pending.participantIds,
      });
      const params = new URLSearchParams(window.location.search);
      const action = params.get("callAction");
      if (action === "accept") window.setTimeout(() => void acceptCall(), 0);
      if (action === "reject") window.setTimeout(() => rejectCall(), 0);
      if (action) {
        params.delete("callAction");
        const query = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      }
    }).catch(() => {});

    return () => {
      window.removeEventListener("nightgram:start-call", onStart);
      window.removeEventListener("nightgram:accept-call", onAccept);
      window.removeEventListener("nightgram:reject-call", onReject);
      window.removeEventListener("nightgram:end-call", onEnd);
      window.removeEventListener("nightgram:incoming-call", onPushIncoming);
      s.off("connect", resumeCurrentCall);
      s.off("call:incoming", incoming);
      s.off("call:offer", offer);
      s.off("call:answer", answer);
      s.off("call:ice-candidate", ice);
      s.off("call:media-state", mediaState);
      s.off("call:participant-joined", participantJoined);
      s.off("call:participant-left", participantLeft);
      s.off("call:accepted", accepted);
      s.off("call:rejected", rejectFromRemote);
      s.off("call:ended", closeFromRemote);
    };
    // Обработчики читают mutable refs, чтобы не терять ранние offer/ICE во время React-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtcConfig, selectedCameraId, selectedMicId, status, turnEnabled, user]);

  useEffect(() => {
    if (status !== "authenticated" || !user || restoreAttemptedRef.current || callRef.current) return;
    restoreAttemptedRef.current = true;
    let stored: (ManagedCall & { savedAt?: number }) | null = null;
    try {
      const raw = sessionStorage.getItem(ACTIVE_CALL_SESSION_KEY);
      stored = raw ? JSON.parse(raw) as ManagedCall & { savedAt?: number } : null;
    } catch {
      stored = null;
    }
    if (!stored?.callId || !stored.conversationId || !stored.type || Date.now() - Number(stored.savedAt || 0) > ACTIVE_CALL_MAX_AGE_MS) {
      try { sessionStorage.removeItem(ACTIVE_CALL_SESSION_KEY); } catch {}
      return;
    }

    let cancelled = false;
    const restore = async () => {
      commitCall({ ...stored!, status: "connecting" });
      setJoinedParticipantIds(stored!.joinedParticipantIds || [user.id]);
      setConnectionHint("Восстанавливаем звонок после перезапуска…");
      setMinimized(false);
      try {
        await getCallStream(stored!.type);
        const response = await new Promise<{ ok?: boolean; error?: string; joinedParticipantIds?: string[] }>((resolve) => {
          const timer = window.setTimeout(() => resolve({ error: "resume_timeout" }), 8000);
          socket().emit("call:resume", { conversationId: stored!.conversationId, callId: stored!.callId }, (value: { ok?: boolean; error?: string; joinedParticipantIds?: string[] }) => {
            window.clearTimeout(timer);
            resolve(value || { error: "call_not_found" });
          });
        });
        if (cancelled) return;
        if (!response.ok) throw new Error(response.error || "call_not_found");
        const joined = response.joinedParticipantIds || [user.id];
        setJoinedParticipantIds(joined);
        patchCall((value) => ({ ...value, joinedParticipantIds: joined, status: joined.length > 1 ? "connecting" : value.status }));
        for (const participantId of joined) {
          if (participantId !== user.id) await createOfferFor(participantId);
        }
        emitMediaState();
        pushGlobalToast("Звонок восстановлен", "success");
      } catch (error) {
        if (cancelled) return;
        closeAllPeers();
        commitCall(null);
        try { sessionStorage.removeItem(ACTIVE_CALL_SESSION_KEY); } catch {}
        pushGlobalToast(error instanceof Error && error.message === "resume_timeout" ? "Backend не ответил при восстановлении звонка" : "Активный звонок уже завершён", "info");
      }
    };
    void restore();
    return () => { cancelled = true; };
    // Restore intentionally runs only once per authenticated application session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => closeAllPeers(), []);

  if (status !== "authenticated" || !call) return null;

  const isGroupCall = (call.participants?.length || 0) > 2;
  const activeCount = Math.max(1, joinedParticipantIds.length || call.joinedParticipantIds?.length || 1);
  const statusText = call.status === "incoming"
    ? isGroupCall ? "Входящий групповой звонок" : "Входящий звонок"
    : call.status === "outgoing"
      ? isGroupCall ? "Звоним группе…" : "Звоним…"
      : call.status === "connecting"
        ? "Соединяем…"
        : call.status === "active"
          ? `В звонке · ${formatDuration(duration)}`
          : "Звонок завершён";
  const hasLocalVideo = Boolean(localStream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled));
  const centeredAvatarStage = !isGroupCall && call.type === "audio";
  const gridSize = remoteEntries.length + (centeredAvatarStage ? 0 : 1);
  const connectionVisual = resolveCallConnectionVisual(call.status, networkOnline, Object.values(peerConnectionStates));
  const connectionMeta = callConnectionMeta(connectionVisual);

  return (
    <>
      <AnimatePresence>
        {call && !minimized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10090] grid place-items-center overflow-y-auto bg-black/75 p-4 py-6 sm:py-8 backdrop-blur-xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="relative w-full max-w-5xl ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="absolute right-4 top-4 z-20 flex gap-2">
                <button onClick={() => setMinimized(true)} className="grid h-8 w-8 place-items-center rounded-lg glass text-white/55 hover:text-white" title="Свернуть">
                  <Minimize2 size={16} />
                </button>
                <button onClick={call.status === "incoming" ? rejectCall : endCall} className="grid h-8 w-8 place-items-center rounded-lg glass text-white/55 hover:text-white" title="Закрыть">
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 flex items-center gap-3 pr-20">
                <div className="grid h-12 w-12 place-items-center rounded-full glass-strong shadow-glow">
                  {isGroupCall ? <Users size={20} className="text-neon-purple" /> : call.type === "video" ? <Video size={20} className="text-neon-purple" /> : <Phone size={20} className="text-neon-purple" />}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold">{statusText}</div>
                  <div className="text-xs text-white/45 truncate">
                    {call.fromUsername ? `от @${call.fromUsername}` : call.title} · {activeCount}/{Math.min(call.participants?.length || activeCount, MAX_MESH_PARTICIPANTS)}
                  </div>
                  <div className={cn("mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", connectionMeta.className)}>
                    <span className={cn("h-2 w-2 rounded-full", connectionMeta.dotClassName)} />
                    {connectionMeta.label}
                  </div>
                </div>
              </div>

              <div className={cn("grid gap-3", centeredAvatarStage ? "grid-cols-1" : gridSize <= 2 ? "md:grid-cols-2" : gridSize <= 4 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
                {remoteEntries.map((entry) => (
                  <RemoteParticipantTile
                    key={entry.userId}
                    entry={entry}
                    mediaState={participantMediaState[entry.userId]}
                    selectedSpeakerId={selectedSpeakerId}
                    avatarUrl={call.avatarUrl}
                    title={call.title}
                    quality={qualityByParticipant[entry.userId]}
                    connectionState={peerConnectionStates[entry.userId]}
                    centered={centeredAvatarStage}
                  />
                ))}

                {remoteEntries.length === 0 && (
                  <div className={cn("relative overflow-hidden rounded-3xl bg-black/75 glass", centeredAvatarStage ? "min-h-[320px]" : "min-h-[190px]")}>
                    <div className={cn("grid place-items-center text-center text-white/45", centeredAvatarStage ? "min-h-[320px]" : "min-h-[190px]")}>
                      <div className="flex flex-col items-center justify-center">
                        <GlowAvatar src={call.avatarUrl} alt={call.title} size={centeredAvatarStage ? 112 : 70} glow="purple" />
                        <div className={cn("font-semibold text-white/85", centeredAvatarStage ? "mt-5 text-lg" : "mt-3 text-sm")}>{call.title}</div>
                        <div className="mt-2 text-sm text-white/45">{call.status === "incoming" ? "Вам звонят" : isGroupCall ? "Ожидаем участников…" : "Ожидаем собеседника…"}</div>
                      </div>
                    </div>
                    <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white/70">{isGroupCall ? "Участники" : "Собеседник"}</div>
                  </div>
                )}

                {!centeredAvatarStage && <div className="relative min-h-[190px] overflow-hidden rounded-3xl bg-black/75 glass">
                  {localStream && hasLocalVideo && (cameraEnabled || screenSharing) ? (
                    <video ref={localVideoRef} autoPlay muted playsInline className={cn("h-full min-h-[190px] w-full", screenSharing ? "object-contain" : "object-cover")} />
                  ) : (
                    <div className="grid min-h-[190px] place-items-center text-white/45">
                      {(call.type === "video" || screenSharing) && !cameraEnabled ? <VideoOff size={30} /> : <Mic size={30} />}
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white/70">Вы</div>
                  {!micEnabled && <div className="absolute right-3 top-3 rounded-full border border-red-400/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-200"><MicOff size={12} className="mr-1 inline" /> микрофон выкл.</div>}
                  {screenSharing && <div className="absolute right-3 bottom-3 rounded-full border border-cyan-300/25 bg-cyan-300/15 px-2 py-1 text-[11px] text-cyan-100"><ScreenShare size={12} className="mr-1 inline" /> демонстрация</div>}
                </div>}
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <label className="text-[11px] text-white/45">
                  Микрофон
                  <CustomSelect
                    value={selectedMicId}
                    onChange={(id) => void replaceAudioInput(id)}
                    className="mt-1"
                    buttonClassName="rounded-xl px-3 py-2 text-xs"
                    options={[{ value: "", label: "По умолчанию" }, ...deviceLists.audioInputs.map((device) => ({ value: device.deviceId, label: device.label || `Микрофон ${device.deviceId.slice(0, 5)}` }))]}
                  />
                </label>
                <label className="text-[11px] text-white/45">
                  Камера
                  <CustomSelect
                    value={selectedCameraId}
                    onChange={(id) => void replaceVideoInput(id)}
                    className="mt-1"
                    buttonClassName="rounded-xl px-3 py-2 text-xs"
                    options={[{ value: "", label: "По умолчанию" }, ...deviceLists.videoInputs.map((device) => ({ value: device.deviceId, label: device.label || `Камера ${device.deviceId.slice(0, 5)}` }))]}
                  />
                </label>
                <label className="text-[11px] text-white/45">
                  Вывод
                  <CustomSelect
                    value={selectedSpeakerId}
                    onChange={(id) => {
                      setSelectedSpeakerId(id);
                      if (id) localStorage.setItem("ng_audio_output_device", id);
                      else localStorage.removeItem("ng_audio_output_device");
                    }}
                    className="mt-1"
                    buttonClassName="rounded-xl px-3 py-2 text-xs"
                    options={[{ value: "", label: "По умолчанию" }, ...deviceLists.audioOutputs.map((device) => ({ value: device.deviceId, label: device.label || `Устройство ${device.deviceId.slice(0, 5)}` }))]}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {call.status === "incoming" && <button onClick={acceptCall} className="btn-glow flex-1 min-w-[130px] py-2.5 text-sm">Принять</button>}
                {call.status === "incoming" && <button onClick={rejectCall} className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300">Отклонить</button>}
                {call.status !== "incoming" && <button onClick={endCall} className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300">{isGroupCall && !call.isCaller ? "Выйти" : "Завершить"}</button>}
                <button onClick={toggleMic} disabled={!localStream} className={micEnabled ? "btn-ghost px-4 py-2.5 text-sm" : "rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300"}>{micEnabled ? <Mic size={15} /> : <MicOff size={15} />}</button>
                {call.type === "video" && <button onClick={toggleCamera} disabled={!localStream || screenSharing} className={cameraEnabled ? "btn-ghost px-4 py-2.5 text-sm" : "rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300"}>{cameraEnabled ? <Video size={15} /> : <VideoOff size={15} />}</button>}
                {call.type === "video" && isMobileDevice && call.status !== "incoming" && (
                  <button onClick={() => void flipCamera()} disabled={screenSharing} className="btn-ghost px-4 py-2.5 text-sm" title="Переключить фронтальную/основную камеру">
                    <RefreshCcw size={15} />
                  </button>
                )}
                {call.status !== "incoming" && screenShareSupported && (
                  <button onClick={screenSharing ? stopScreenShare : startScreenShare} className={screenSharing ? "rounded-xl border border-cyan-400/30 bg-cyan-400/15 px-4 py-2.5 text-sm text-cyan-200" : "btn-ghost px-4 py-2.5 text-sm"} title="Демонстрация экрана — выбери экран, окно или вкладку">
                    {screenSharing ? <ScreenShareOff size={15} /> : <ScreenShare size={15} />}
                  </button>
                )}
              </div>

              <div className="mt-3 rounded-2xl glass px-3 py-2 text-[11px] text-white/45">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{isGroupCall ? `Mesh-звонок до ${MAX_MESH_PARTICIPANTS} участников. ` : ""}{connectionHint}.</span>
                  {!networkOnline && <span className="text-red-200"><WifiOff size={12} className="mr-1 inline" /> Нет сети</span>}
                  {overallQuality.level !== "unknown" && (
                    <span className={overallQuality.level === "bad" ? "text-red-200" : overallQuality.level === "poor" ? "text-amber-100" : "text-emerald-100"}>
                      <Activity size={12} className="mr-1 inline" /> {qualityLabel(overallQuality.level)}
                      {overallQuality.roundTripMs !== null ? ` · ${overallQuality.roundTripMs} мс` : ""}
                      {overallQuality.packetLossPercent !== null ? ` · потери ${overallQuality.packetLossPercent}%` : ""}
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  {turnEnabled ? "TURN подключён." : "Для мобильных сетей и строгого NAT настрой TURN на backend."} Видео автоматически снижает битрейт при ухудшении сети. Активный звонок восстанавливается после быстрой перезагрузки приложения.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {call && minimized && (
          <motion.div
            initial={{ opacity: 0, x: call.status === "incoming" ? 24 : -24, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: call.status === "incoming" ? 24 : -24, y: 16, scale: 0.95 }}
            className={cn(
              "fixed bottom-5 z-[10095] w-[min(24rem,calc(100vw-2rem))] ng-solid rounded-3xl p-3 shadow-glow-lg",
              call.status === "incoming" ? "right-4" : "left-4",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full glass-strong shadow-glow shrink-0">
                {isGroupCall ? <Users size={18} className="text-neon-purple" /> : call.type === "video" ? <Video size={18} className="text-neon-purple" /> : <Phone size={18} className="text-neon-purple" />}
              </div>
              <button onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-semibold">{statusText}</div>
                <div className="truncate text-xs text-white/45">{call.fromUsername ? `@${call.fromUsername}` : call.title} · {activeCount} в звонке</div>
                <div className={cn("mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", connectionMeta.className)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", connectionMeta.dotClassName)} />
                  {connectionMeta.label}
                </div>
              </button>
              {call.status === "incoming" ? (
                <>
                  <button onClick={acceptCall} className="btn-glow px-3 py-2 text-xs">Принять</button>
                  <button onClick={rejectCall} className="grid h-9 w-9 place-items-center rounded-xl border border-red-500/30 bg-red-500/15 text-red-300"><X size={15} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => setMinimized(false)} className="grid h-9 w-9 place-items-center rounded-xl glass text-white/60"><Maximize2 size={15} /></button>
                  <button onClick={endCall} className="grid h-9 w-9 place-items-center rounded-xl border border-red-500/30 bg-red-500/15 text-red-300"><X size={15} /></button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {call.status === "connecting" && (
        <div className="fixed bottom-5 right-5 z-[10100] rounded-full glass-strong px-3 py-2 text-xs text-white/65 shadow-glow">
          <Loader2 size={13} className="mr-1 inline animate-spin" /> Соединяем звонок…
        </div>
      )}
    </>
  );
}
