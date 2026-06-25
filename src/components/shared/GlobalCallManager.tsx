"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, Video, Mic, MicOff, VideoOff, X, Minimize2, Maximize2, Loader2, ScreenShare, ScreenShareOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/lib/socket";
import { cn, uid } from "@/lib/utils";
import { GlowAvatar } from "./GlowAvatar";
import { pushGlobalToast } from "@/lib/toast";
import { CustomSelect } from "./CustomSelect";

type CallKind = "audio" | "video";
type CallStatus = "incoming" | "outgoing" | "connecting" | "active" | "ended";

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

type OfferPayload = IncomingPayload & { offer: RTCSessionDescriptionInit };
type AnswerPayload = { conversationId: string; callId: string; fromUserId: string; answer: RTCSessionDescriptionInit; participants?: string[] };
type IcePayload = { conversationId: string; callId: string; fromUserId: string; candidate: RTCIceCandidateInit };
type MediaStatePayload = { conversationId: string; callId: string; fromUserId: string; micEnabled?: boolean; cameraEnabled?: boolean; screenSharing?: boolean };

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
  if (stunUrls.length) servers.push({ urls: stunUrls });
  if (turnUrls.length) servers.push(username && credential ? { urls: turnUrls, username, credential } : { urls: turnUrls });
  return servers;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}


export function GlobalCallManager() {
  const { user, status } = useAuth();
  const [call, setCall] = useState<ManagedCall | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [deviceLists, setDeviceLists] = useState<{ audioInputs: MediaDeviceInfo[]; videoInputs: MediaDeviceInfo[]; audioOutputs: MediaDeviceInfo[] }>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [duration, setDuration] = useState(0);
  const [screenSharing, setScreenSharing] = useState(false);
  const [participantMediaState, setParticipantMediaState] = useState<Record<string, { micEnabled?: boolean; cameraEnabled?: boolean; screenSharing?: boolean }>>({});

  const callRef = useRef<ManagedCall | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peerMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const iceBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const iceServers = useMemo(() => buildIceServers(), []);
  const turnEnabled = useMemo(() => iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => String(url).startsWith("turn:") || String(url).startsWith("turns:"));
  }), [iceServers]);
  const rtcConfig = useMemo<RTCConfiguration>(() => ({ iceServers, iceCandidatePoolSize: 4 }), [iceServers]);

  useEffect(() => { callRef.current = call; }, [call]);

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
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (audio && selectedSpeakerId && "setSinkId" in audio) {
      (audio as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(selectedSpeakerId).catch(() => {});
    }
  }, [remoteStream, selectedSpeakerId]);

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

  function socket() {
    return getSocket();
  }

  function closePeer() {
    peerRef.current?.close();
    peerRef.current = null;
    peerMapRef.current.forEach((pc) => pc.close());
    peerMapRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    remoteStreamsRef.current.clear();
    setLocalStream(null);
    setRemoteStream(null);
    setPendingOffer(null);
    setParticipantMediaState({});
    iceBufferRef.current = [];
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    setScreenSharing(false);
    startedAtRef.current = null;
    setDuration(0);
  }

  function rebuildRemoteStream() {
    const tracks = Array.from(remoteStreamsRef.current.values()).flatMap((stream) => stream.getTracks());
    const combined = new MediaStream(tracks);
    remoteStreamRef.current = combined;
    setRemoteStream(combined);
  }

  function emitMediaState(next?: Partial<{ micEnabled: boolean; cameraEnabled: boolean; screenSharing: boolean }>) {
    const current = callRef.current;
    if (!current || current.status === "incoming") return;
    socket().emit("call:media-state", {
      conversationId: current.conversationId,
      callId: current.callId,
      micEnabled,
      cameraEnabled,
      screenSharing,
      ...next,
    });
  }

  async function getCallStream(type: CallKind) {
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
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicEnabled(true);
    setCameraEnabled(type === "video");
    await refreshDevices();
    return stream;
  }

  function createPeer(callId: string, conversationId: string, targetUserId?: string) {
    const key = targetUserId || "__broadcast";
    peerMapRef.current.get(key)?.close();
    const pc = new RTCPeerConnection(rtcConfig);
    peerMapRef.current.set(key, pc);
    peerRef.current = pc;
    const remote = new MediaStream();
    remoteStreamsRef.current.set(key, remote);
    rebuildRemoteStream();

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        stream.getTracks().forEach((track) => {
          if (!remote.getTracks().some((existing) => existing.id === track.id)) remote.addTrack(track);
        });
      } else {
        remote.addTrack(event.track);
      }
      remoteStreamsRef.current.set(key, remote);
      rebuildRemoteStream();
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket().emit("call:ice-candidate", { conversationId, callId, candidate: event.candidate.toJSON(), toUserId: targetUserId });
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected"].includes(pc.connectionState)) {
        pushGlobalToast("Соединение звонка нестабильно. Проверь сеть или TURN.", "error");
      }
      if (pc.connectionState === "connected") {
        startedAtRef.current ||= Date.now();
        setCall((prev) => prev?.callId === callId ? { ...prev, status: "active" } : prev);
      }
      if (["closed", "failed"].includes(pc.connectionState)) {
        remoteStreamsRef.current.delete(key);
        rebuildRemoteStream();
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

  async function startCall(detail: StartCallDetail) {
    if (status !== "authenticated" || !user) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      pushGlobalToast("Браузер не поддерживает звонки", "error");
      return;
    }
    if (callRef.current && callRef.current.status !== "ended") {
      pushGlobalToast("Уже есть активный звонок", "info");
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
      participants: detail.participants,
    };
    setCall(nextCall);
    setMinimized(false);

    try {
      const stream = await getCallStream(detail.type);
      socket().emit("call:start", { conversationId: detail.conversationId, callId, type: detail.type });
      const targets = (detail.participants || []).filter((id) => id && id !== user.id);
      if (targets.length === 0) {
        const pc = createPeer(callId, detail.conversationId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: detail.type === "video" });
        await pc.setLocalDescription(offer);
        socket().emit("call:offer", { conversationId: detail.conversationId, callId, offer, type: detail.type });
      } else {
        for (const targetId of targets) {
          const pc = createPeer(callId, detail.conversationId, targetId);
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: detail.type === "video" });
          await pc.setLocalDescription(offer);
          socket().emit("call:offer", { conversationId: detail.conversationId, callId, offer, type: detail.type, toUserId: targetId });
        }
      }
      window.setTimeout(() => emitMediaState({ micEnabled: true, cameraEnabled: detail.type === "video", screenSharing: false }), 250);
    } catch {
      pushGlobalToast("Не удалось получить доступ к микрофону/камере", "error");
      closePeer();
      setCall(null);
    }
  }

  async function acceptCall() {
    const current = callRef.current;
    if (!current || current.status !== "incoming") return;
    if (!pendingOffer) {
      pushGlobalToast("Ожидаем данные звонка…", "info");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      pushGlobalToast("Браузер не поддерживает звонки", "error");
      return;
    }

    setCall((prev) => prev ? { ...prev, status: "connecting" } : prev);
    setMinimized(false);
    try {
      const stream = await getCallStream(current.type);
      const pc = createPeer(current.callId, current.conversationId, current.fromUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      await flushIceBuffer();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket().emit("call:accept", { conversationId: current.conversationId, callId: current.callId });
      socket().emit("call:answer", { conversationId: current.conversationId, callId: current.callId, answer, toUserId: current.fromUserId });
      startedAtRef.current = Date.now();
      setCall((prev) => prev ? { ...prev, status: "active" } : prev);
      window.setTimeout(() => emitMediaState({ micEnabled: true, cameraEnabled: current.type === "video", screenSharing: false }), 250);
    } catch {
      pushGlobalToast("Не удалось принять звонок", "error");
      rejectCall();
    }
  }

  function rejectCall() {
    const current = callRef.current;
    if (!current) return;
    socket().emit("call:reject", { conversationId: current.conversationId, callId: current.callId });
    closePeer();
    setCall(null);
  }

  function endCall() {
    const current = callRef.current;
    if (current) socket().emit("call:end", { conversationId: current.conversationId, callId: current.callId });
    closePeer();
    setCall(null);
  }

  function toggleMic() {
    const next = !micEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicEnabled(next);
    emitMediaState({ micEnabled: next });
  }

  function toggleCamera() {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraEnabled(next);
    emitMediaState({ cameraEnabled: next });
  }

  async function startScreenShare() {
    const current = callRef.current;
    if (!current || current.status === "incoming") return;
    if (!navigator.mediaDevices?.getDisplayMedia || !peerRef.current) {
      pushGlobalToast("Браузер не поддерживает демонстрацию экрана", "error");
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = displayStream.getVideoTracks()[0];
      const peers = Array.from(peerMapRef.current.entries());
      for (const [targetId, pc] of peers) {
        const sender = pc.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
        else pc.addTrack(screenTrack, displayStream);
        const current = callRef.current;
        if (!sender && current) {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).catch(() => null);
          if (offer) {
            await pc.setLocalDescription(offer).catch(() => {});
            socket().emit("call:offer", { conversationId: current.conversationId, callId: current.callId, offer, type: "video", toUserId: targetId === "__broadcast" ? undefined : targetId });
          }
        }
      }
      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => stopScreenShare();
      const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
      setLocalStream(new MediaStream([...audioTracks, screenTrack]));
      setCameraEnabled(true);
      setScreenSharing(true);
      emitMediaState({ screenSharing: true, cameraEnabled: true });
      pushGlobalToast("Выбери экран или окно — демонстрация включена", "success");
    } catch {
      // user cancelled browser picker — do not show error
    }
  }

  async function stopScreenShare() {
    if (!peerRef.current || !screenSharing) return;
    const originalVideo = localStreamRef.current?.getVideoTracks()[0] ?? null;
    for (const pc of peerMapRef.current.values()) {
      const sender = pc.getSenders().find((item) => item.track?.kind === "video");
      await sender?.replaceTrack(originalVideo);
    }
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    setLocalStream(localStreamRef.current);
    setScreenSharing(false);
    emitMediaState({ screenSharing: false, cameraEnabled });
    pushGlobalToast("Демонстрация экрана остановлена", "info");
  }


  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const s = socket();

    const onStart = (event: Event) => startCall((event as CustomEvent<StartCallDetail>).detail);
    const onAccept = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (!detail?.conversationId || detail.conversationId === callRef.current?.conversationId) acceptCall();
    };
    const onReject = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (!detail?.conversationId || detail.conversationId === callRef.current?.conversationId) rejectCall();
    };
    const onEnd = () => endCall();

    const incoming = (payload: IncomingPayload) => {
      if (payload.fromUserId === user.id) return;
      if (callRef.current && callRef.current.status !== "ended") {
        s.emit("call:reject", { conversationId: payload.conversationId, callId: payload.callId });
        return;
      }
      setCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        type: payload.type,
        status: "incoming",
        title: payload.conversationTitle || (payload.fromUsername ? `@${payload.fromUsername}` : "Входящий звонок"),
        avatarUrl: payload.avatarUrl ?? null,
        fromUserId: payload.fromUserId,
        fromUsername: payload.fromUsername,
        participants: payload.participants,
      });
      setMinimized(true);
    };

    const offer = async (payload: OfferPayload) => {
      if (payload.fromUserId === user.id) return;
      const current = callRef.current;
      if (current?.callId === payload.callId && current.status !== "incoming" && localStreamRef.current) {
        const pc = createPeer(payload.callId, payload.conversationId, payload.fromUserId);
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer)).catch(() => {});
        const answer = await pc.createAnswer().catch(() => null);
        if (answer) {
          await pc.setLocalDescription(answer).catch(() => {});
          socket().emit("call:answer", { conversationId: payload.conversationId, callId: payload.callId, answer, toUserId: payload.fromUserId });
        }
        return;
      }
      setPendingOffer(payload.offer);
      if (!current || current.callId !== payload.callId) incoming(payload);
    };

    const answer = async (payload: AnswerPayload) => {
      const current = callRef.current;
      if (!current || payload.fromUserId === user.id || payload.callId !== current.callId) return;
      const pc = peerMapRef.current.get(payload.fromUserId) || peerRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer)).catch(() => {});
        await flushIceBuffer();
        startedAtRef.current = Date.now();
        setCall((prev) => prev?.callId === payload.callId ? { ...prev, status: "active" } : prev);
        setMinimized(false);
      }
    };

    const ice = async (payload: IcePayload) => {
      const current = callRef.current;
      if (!current || payload.fromUserId === user.id || payload.callId !== current.callId || !payload.candidate) return;
      const pc = peerMapRef.current.get(payload.fromUserId) || peerRef.current;
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
      } else {
        iceBufferRef.current.push(payload.candidate);
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

    const accepted = async ({ callId, byUserId }: { callId: string; byUserId: string }) => {
      if (byUserId === user.id) return;
      const current = callRef.current;
      setCall((prev) => prev?.callId === callId ? { ...prev, status: "active" } : prev);
      startedAtRef.current = Date.now();
      setMinimized(false);
      if (current?.callId === callId && localStreamRef.current && !peerMapRef.current.has(byUserId)) {
        const pc = createPeer(callId, current.conversationId, byUserId);
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: current.type === "video" }).catch(() => null);
        if (offer) {
          await pc.setLocalDescription(offer).catch(() => {});
          socket().emit("call:offer", { conversationId: current.conversationId, callId, offer, type: current.type, toUserId: byUserId });
        }
      }
    };

    const rejectFromRemote = ({ callId, byUserId }: { callId: string; byUserId: string }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId || byUserId === user.id) return;
      const isGroupCall = (current.participants?.length ?? 0) > 2;
      if (isGroupCall && current.status !== "incoming") {
        pushGlobalToast("Один участник отклонил звонок", "info");
        return;
      }
      closePeer();
      setCall({ ...current, status: "ended" });
      setMinimized(false);
      pushGlobalToast("Звонок отклонён", "info");
      window.setTimeout(() => setCall((prev) => prev?.callId === callId ? null : prev), 1200);
    };

    const closeFromRemote = ({ callId, byUserId }: { callId: string; byUserId: string }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId || byUserId === user.id) return;
      closePeer();
      setCall({ ...current, status: "ended" });
      setMinimized(false);
      pushGlobalToast("Звонок завершён", "info");
      window.setTimeout(() => setCall((prev) => prev?.callId === callId ? null : prev), 1200);
    };

    window.addEventListener("nightgram:start-call", onStart);
    window.addEventListener("nightgram:accept-call", onAccept);
    window.addEventListener("nightgram:reject-call", onReject);
    window.addEventListener("nightgram:end-call", onEnd);
    s.on("call:incoming", incoming);
    s.on("call:offer", offer);
    s.on("call:answer", answer);
    s.on("call:ice-candidate", ice);
    s.on("call:media-state", mediaState);
    s.on("call:accepted", accepted);
    s.on("call:rejected", rejectFromRemote);
    s.on("call:ended", closeFromRemote);

    return () => {
      window.removeEventListener("nightgram:start-call", onStart);
      window.removeEventListener("nightgram:accept-call", onAccept);
      window.removeEventListener("nightgram:reject-call", onReject);
      window.removeEventListener("nightgram:end-call", onEnd);
      s.off("call:incoming", incoming);
      s.off("call:offer", offer);
      s.off("call:answer", answer);
      s.off("call:ice-candidate", ice);
      s.off("call:media-state", mediaState);
      s.off("call:accepted", accepted);
      s.off("call:rejected", rejectFromRemote);
      s.off("call:ended", closeFromRemote);
    };
    // The handlers intentionally read the latest call through refs; adding action functions here would re-register socket listeners on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOffer, rtcConfig, selectedCameraId, selectedMicId, status, user]);

  useEffect(() => () => closePeer(), []);

  if (status !== "authenticated" || !call) return null;

  const statusText = call.status === "incoming"
    ? "Входящий звонок"
    : call.status === "outgoing"
      ? "Звоним…"
      : call.status === "connecting"
        ? "Соединяем…"
        : call.status === "active"
          ? `В звонке · ${formatDuration(duration)}`
          : "Звонок завершён";
  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks().length);
  const remoteStates = Object.values(participantMediaState);
  const remoteMutedCount = remoteStates.filter((state) => state.micEnabled === false).length;
  const remoteSharingCount = remoteStates.filter((state) => state.screenSharing).length;

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
              className="relative w-full max-w-3xl ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
                  {call.type === "video" ? <Video size={20} className="text-neon-purple" /> : <Phone size={20} className="text-neon-purple" />}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold">{statusText}</div>
                  <div className="text-xs text-white/45 truncate">{call.fromUsername ? `от @${call.fromUsername}` : call.title}</div>
                </div>
              </div>

              <audio ref={remoteAudioRef} autoPlay playsInline />


              <div className="grid gap-3 md:grid-cols-2">
                <div className="relative min-h-[210px] overflow-hidden rounded-3xl bg-black/75 glass">
                  {hasRemoteVideo ? (
                    <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-[210px] w-full object-cover" />
                  ) : (
                    <div className="grid min-h-[210px] place-items-center text-center text-white/45">
                      <div>
                        <GlowAvatar src={call.avatarUrl} alt={call.title} size={78} glow="purple" />
                        <div className="mt-3 text-sm">{call.status === "incoming" ? "Вам звонят" : "Ожидаем собеседника…"}</div>
                      </div>
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white/70">{call.participants && call.participants.length > 2 ? "Участники" : "Собеседник"}</div>
                  {remoteMutedCount > 0 && <div className="absolute right-3 top-3 rounded-full border border-red-400/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-200"><MicOff size={12} className="mr-1 inline" /> {remoteMutedCount > 1 ? `${remoteMutedCount} muted` : "muted"}</div>}
                  {remoteSharingCount > 0 && <div className="absolute right-3 bottom-3 rounded-full border border-cyan-300/25 bg-cyan-300/15 px-2 py-1 text-[11px] text-cyan-100"><ScreenShare size={12} className="mr-1 inline" /> screen</div>}
                </div>
                <div className="relative min-h-[210px] overflow-hidden rounded-3xl bg-black/75 glass">
                  {localStream && call.type === "video" && cameraEnabled ? (
                    <video ref={localVideoRef} autoPlay muted playsInline className="h-full min-h-[210px] w-full object-cover" />
                  ) : (
                    <div className="grid min-h-[210px] place-items-center text-white/45">
                      {call.type === "video" && !cameraEnabled ? <VideoOff size={30} /> : <Mic size={30} />}
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white/70">Вы</div>
                  {!micEnabled && <div className="absolute right-3 top-3 rounded-full border border-red-400/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-200"><MicOff size={12} className="mr-1 inline" /> микрофон выкл.</div>}
                  {screenSharing && <div className="absolute right-3 bottom-3 rounded-full border border-cyan-300/25 bg-cyan-300/15 px-2 py-1 text-[11px] text-cyan-100"><ScreenShare size={12} className="mr-1 inline" /> демонстрация</div>}
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
                  Вывод
                  <CustomSelect
                    value={selectedSpeakerId}
                    onChange={(id) => { setSelectedSpeakerId(id); if (id) localStorage.setItem("ng_audio_output_device", id); else localStorage.removeItem("ng_audio_output_device"); }}
                    className="mt-1"
                    buttonClassName="rounded-xl px-3 py-2 text-xs"
                    options={[{ value: "", label: "По умолчанию" }, ...deviceLists.audioOutputs.map((d) => ({ value: d.deviceId, label: d.label || `Устройство ${d.deviceId.slice(0, 5)}` }))]}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {call.status === "incoming" && <button onClick={acceptCall} className="btn-glow flex-1 min-w-[130px] py-2.5 text-sm">Принять</button>}
                {call.status === "incoming" && <button onClick={rejectCall} className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300">Отклонить</button>}
                {call.status !== "incoming" && <button onClick={endCall} className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300">Завершить</button>}
                <button onClick={toggleMic} disabled={!localStream} className={micEnabled ? "btn-ghost px-4 py-2.5 text-sm" : "rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300"}>{micEnabled ? <Mic size={15} /> : <MicOff size={15} />}</button>
                {call.type === "video" && <button onClick={toggleCamera} disabled={!localStream || screenSharing} className={cameraEnabled ? "btn-ghost px-4 py-2.5 text-sm" : "rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm text-red-300"}>{cameraEnabled ? <Video size={15} /> : <VideoOff size={15} />}</button>}
                {call.status !== "incoming" && (
                  <button onClick={screenSharing ? stopScreenShare : startScreenShare} className={screenSharing ? "rounded-xl border border-cyan-400/30 bg-cyan-400/15 px-4 py-2.5 text-sm text-cyan-200" : "btn-ghost px-4 py-2.5 text-sm"} title="Демонстрация экрана — браузер даст выбрать экран/окно/вкладку">
                    {screenSharing ? <ScreenShareOff size={15} /> : <ScreenShare size={15} />}
                  </button>
                )}
              </div>


              <div className="mt-3 rounded-2xl glass px-3 py-2 text-[11px] text-white/45">
                Звонок работает глобально: можно свернуть окно и перейти в другой раздел. {turnEnabled ? "TURN подключён." : "Для максимальной стабильности подключи TURN в env."}
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
              "fixed bottom-5 z-[10095] w-[min(22rem,calc(100vw-2rem))] ng-solid rounded-3xl p-3 shadow-glow-lg",
              call.status === "incoming" ? "right-4" : "left-4",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full glass-strong shadow-glow shrink-0">
                {call.type === "video" ? <Video size={18} className="text-neon-purple" /> : <Phone size={18} className="text-neon-purple" />}
              </div>
              <button onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-semibold">{statusText}</div>
                <div className="truncate text-xs text-white/45">{call.fromUsername ? `@${call.fromUsername}` : call.title}</div>
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
