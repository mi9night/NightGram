"use client";

// =============================================================================
//  Messenger — chat info, shared media and group management
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  BellOff,
  Archive,
  ArchiveRestore,
  Briefcase,
  Heart,
  Home,
  FolderOpen,
  Camera,
  Check,
  Copy,
  Crown,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Save,
  Search,
  Shield,
  ShieldCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import type { Conversation, ConversationParticipant, Message } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { ColoredUsername } from "@/components/shared/Badges";
import { MediaViewer, type MediaViewerItem } from "@/components/shared/MediaViewer";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import { pushGlobalToast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";

interface ChatInfoProps {
  conversation: Conversation;
  onConversationPatch?: (id: string, patch: Partial<Conversation>) => void;
  onClose?: () => void;
}

type SearchUser = Record<string, unknown>;

function userId(user: SearchUser) {
  return String(user.id ?? "");
}

function userName(user: SearchUser) {
  return String(user.displayName ?? user.display_name ?? user.username ?? "Пользователь");
}

export function ChatInfo({ conversation, onConversationPatch, onClose }: ChatInfoProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewer, setViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);
  const [mediaMode, setMediaMode] = useState<"all" | "sent" | "received">("all");
  const [details, setDetails] = useState<"files" | "links" | null>(null);
  const [editingGroup, setEditingGroup] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [description, setDescription] = useState(conversation.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(conversation.avatarUrl);
  const [savingGroup, setSavingGroup] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<SearchUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchUser[]>([]);
  const [memberAction, setMemberAction] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  const isGroupChat = conversation.type === "group";
  const isChannelChat = isGroupChat && /(?:· чат|чат канала)/i.test(conversation.title);
  const other = conversation.participants.find((participant) => participant.id !== user?.id) ?? conversation.participants[0];
  const selfParticipant = conversation.participants.find((participant) => participant.id === user?.id);
  const selfRole = selfParticipant?.role ?? "member";
  const canManageGroup = isGroupChat && !isChannelChat && (selfRole === "owner" || selfRole === "admin");
  const isGroupOwner = selfRole === "owner";

  useEffect(() => {
    setTitle(conversation.title);
    setDescription(conversation.description ?? "");
    setAvatarUrl(conversation.avatarUrl);
  }, [conversation.avatarUrl, conversation.description, conversation.id, conversation.title]);

  useEffect(() => {
    let active = true;
    api.getMessages(conversation.id)
      .then((data) => active && setMessages(data))
      .catch(() => active && setMessages([]));
    return () => { active = false; };
  }, [conversation.id]);

  useEffect(() => {
    if (!addingMembers || memberQuery.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.searchUsers(memberQuery.trim())
        .then((items) => {
          const existing = new Set(conversation.participants.map((participant) => participant.id));
          setMemberResults((items as SearchUser[]).filter((item) => !existing.has(userId(item))));
        })
        .catch(() => setMemberResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [addingMembers, conversation.participants, memberQuery]);

  const media = useMemo<MediaViewerItem[]>(() => messages
    .filter((message) => {
      if (!((message.type === "image" || message.type === "video") && message.attachmentUrl)) return false;
      if (mediaMode === "sent") return message.senderId === user?.id;
      if (mediaMode === "received") return message.senderId !== user?.id;
      return true;
    })
    .map((message) => ({
      id: message.id,
      type: message.type === "video" ? "video" : "image",
      url: message.attachmentUrl!,
      thumbnailUrl: message.attachmentThumbnailUrl,
    })), [mediaMode, messages, user?.id]);

  const files = messages.filter((message) => message.type === "file" || (message.attachmentUrl && message.type !== "image" && message.type !== "video"));
  const links = messages.flatMap((message) => ((message.text ?? "").match(/https?:\/\/\S+/g) ?? []).map((url) => ({ url, messageId: message.id })));

  function applyConversation(next: Conversation) {
    onConversationPatch?.(conversation.id, next);
  }

  async function toggleMute() {
    try {
      const response = await api.toggleConversationMute(conversation.id);
      onConversationPatch?.(conversation.id, { muted: response.muted });
    } catch {
      pushGlobalToast("Не удалось изменить уведомления", "error");
    }
  }

  async function toggleArchive() {
    try {
      const result = await api.toggleConversationArchive(conversation.id);
      onConversationPatch?.(conversation.id, { archived: result.archived });
      pushGlobalToast(result.archived ? "Чат перемещён в архив" : "Чат возвращён из архива", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось изменить архив", "error");
    }
  }

  async function setFolder(folder: "all" | "work" | "friends" | "family") {
    try {
      const result = await api.setConversationFolder(conversation.id, folder);
      onConversationPatch?.(conversation.id, { folder: result.folder });
      const labels = { all: "Без папки", work: "Работа", friends: "Друзья", family: "Семья" };
      pushGlobalToast(`Папка: ${labels[result.folder]}`, "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось изменить папку", "error");
    }
  }

  async function copyInvite() {
    if (!isGroupChat) return;
    try {
      const { code } = await api.createConversationInvite(conversation.id);
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${code}`);
      pushGlobalToast("Ссылка приглашения скопирована", "success");
    } catch {
      pushGlobalToast("Создавать ссылку могут только администраторы", "error");
    }
  }

  async function pickAvatar(file?: File) {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadMedia(file, "avatars");
      setAvatarUrl(url);
    } catch {
      pushGlobalToast("Не удалось загрузить аватар группы", "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveGroup() {
    setSavingGroup(true);
    try {
      const next = await api.updateGroupConversation(conversation.id, {
        title: title.trim(),
        description: description.trim(),
        avatarUrl,
      });
      applyConversation(next);
      setEditingGroup(false);
      pushGlobalToast("Информация о группе обновлена", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось обновить группу", "error");
    } finally {
      setSavingGroup(false);
    }
  }

  function toggleSelectedMember(item: SearchUser) {
    const id = userId(item);
    setSelectedMembers((previous) => previous.some((selected) => userId(selected) === id)
      ? previous.filter((selected) => userId(selected) !== id)
      : [...previous, item]);
  }

  async function submitMembers() {
    if (selectedMembers.length === 0) return;
    setMemberAction("add");
    try {
      const next = await api.addGroupMembers(conversation.id, selectedMembers.map(userId));
      applyConversation(next);
      setSelectedMembers([]);
      setMemberQuery("");
      setMemberResults([]);
      setAddingMembers(false);
      if ((next.skippedPrivacyCount ?? 0) > 0) pushGlobalToast(`Не добавлено из-за приватности: ${next.skippedPrivacyCount}`, "info");
      else pushGlobalToast("Участники добавлены", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось добавить участников", "error");
    } finally {
      setMemberAction(null);
    }
  }

  async function changeRole(participant: ConversationParticipant, role: "member" | "admin") {
    setMemberAction(`role:${participant.id}`);
    try {
      const next = await api.updateGroupMemberRole(conversation.id, participant.id, role);
      applyConversation(next);
      pushGlobalToast(role === "admin" ? "Администратор назначен" : "Права администратора сняты", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось изменить роль", "error");
    } finally {
      setMemberAction(null);
    }
  }

  async function transferOwnership(participant: ConversationParticipant) {
    if (!window.confirm(`Передать группу пользователю @${participant.username}? Вы останетесь администратором.`)) return;
    setMemberAction(`owner:${participant.id}`);
    try {
      const next = await api.transferGroupOwnership(conversation.id, participant.id);
      applyConversation(next);
      pushGlobalToast("Права владельца переданы", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось передать группу", "error");
    } finally {
      setMemberAction(null);
    }
  }

  async function removeMember(participant: ConversationParticipant) {
    if (!window.confirm(`Удалить @${participant.username} из группы?`)) return;
    setMemberAction(`remove:${participant.id}`);
    try {
      const next = await api.removeGroupMember(conversation.id, participant.id);
      applyConversation(next);
      pushGlobalToast("Участник удалён", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось удалить участника", "error");
    } finally {
      setMemberAction(null);
    }
  }

  async function leaveGroup() {
    const warning = isGroupOwner
      ? "Если в группе есть другие участники, сначала передайте права владельца. Продолжить?"
      : "Покинуть эту группу?";
    if (!window.confirm(warning)) return;
    setMemberAction("leave");
    try {
      await api.leaveGroupConversation(conversation.id);
      onConversationPatch?.(conversation.id, { requestStatus: "hidden" });
      onClose?.();
      pushGlobalToast("Вы покинули группу", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось покинуть группу", "error");
    } finally {
      setMemberAction(null);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex h-full flex-col">
      <div className="relative flex flex-col items-center border-b border-white/5 p-5 text-center">
        {onClose && (
          <button type="button" onClick={onClose} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl glass text-white/50 hover:text-white" aria-label="Закрыть">
            <X size={16} />
          </button>
        )}
        <button type="button" onClick={() => canManageGroup && editingGroup && avatarInput.current?.click()} className="relative rounded-full">
          <GlowAvatar src={avatarUrl} alt={conversation.title} size={72} glow="purple" online={conversation.isOnline} />
          {canManageGroup && editingGroup && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white">
              {uploadingAvatar ? <Loader2 size={19} className="animate-spin" /> : <Camera size={19} />}
            </span>
          )}
        </button>
        <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(event) => void pickAvatar(event.target.files?.[0])} />

        {editingGroup ? (
          <div className="mt-3 w-full space-y-2">
            <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl glass px-3 py-2 text-center text-sm font-semibold outline-none focus:border-neon-purple/50" placeholder="Название группы" />
            <textarea value={description} maxLength={240} onChange={(event) => setDescription(event.target.value)} className="min-h-20 w-full resize-none rounded-xl glass px-3 py-2 text-xs outline-none focus:border-neon-purple/50" placeholder="Описание группы" />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingGroup(false); setTitle(conversation.title); setDescription(conversation.description ?? ""); setAvatarUrl(conversation.avatarUrl); }} className="btn-ghost flex-1 py-2 text-xs">Отмена</button>
              <button type="button" onClick={() => void saveGroup()} disabled={savingGroup || !title.trim()} className="btn-glow flex-1 py-2 text-xs disabled:opacity-50">
                {savingGroup ? <Loader2 size={14} className="mx-auto animate-spin" /> : <span className="flex items-center justify-center gap-1.5"><Save size={13} /> Сохранить</span>}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2">
              <h3 className="font-display text-base font-bold">{conversation.title}</h3>
              {canManageGroup && <button type="button" onClick={() => setEditingGroup(true)} className="text-white/35 hover:text-neon-purple" title="Изменить группу"><Pencil size={14} /></button>}
            </div>
            {!isGroupChat && other && <ColoredUsername username={other.username} color={other.nameColor} className="mt-0.5 text-xs" />}
            {isGroupChat && conversation.description && <p className="mt-1 max-w-full whitespace-pre-wrap text-xs text-white/45">{conversation.description}</p>}
          </>
        )}

        <p className="mt-1 text-xs text-white/45">
          {isGroupChat ? (isChannelChat ? `${conversation.participants.length} участников · чат канала` : `${conversation.participants.length} участников`) : conversation.isOnline ? "в сети" : "не в сети"}
        </p>
        {conversation.muted && <p className="mt-1 text-[11px] text-white/35">Всплывающие уведомления отключены</p>}

        <div className="mt-4 flex w-full gap-2">
          <button className="btn-glow flex-1 py-2.5 text-sm">Сообщение</button>
          <button type="button" onClick={() => void toggleMute()} className={conversation.muted ? "rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white/45" : "btn-ghost px-3 py-2.5"} title={conversation.muted ? "Включить уведомления" : "Заглушить чат"}>
            {conversation.muted ? <BellOff size={16} /> : <Bell size={16} />}
          </button>
        </div>

        <div className="mt-3 w-full rounded-2xl border border-white/8 bg-white/[0.025] p-2.5 text-left">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-white/45"><FolderOpen size={13} /> Организация чата</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["all", "Без папки", FolderOpen],
              ["work", "Работа", Briefcase],
              ["friends", "Друзья", Heart],
              ["family", "Семья", Home],
            ] as const).map(([folderId, label, Icon]) => (
              <button key={folderId} type="button" onClick={() => void setFolder(folderId)} className="flex items-center gap-1.5 rounded-xl glass px-2.5 py-2 text-[11px] text-white/60 hover:text-white">
                <Icon size={12} /> {label} {conversation.folder === folderId && <Check size={11} className="ml-auto text-neon-purple" />}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void toggleArchive()} className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-white/55 hover:text-white">
            {conversation.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {conversation.archived ? "Вернуть чат из архива" : "Переместить чат в архив"}
          </button>
        </div>
      </div>

      <div className="border-b border-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
          <Users size={15} /> Участники
          {canManageGroup && <button type="button" onClick={() => setAddingMembers((value) => !value)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-neon-purple hover:bg-neon-purple/10"><Plus size={13} /> Добавить</button>}
        </div>

        {addingMembers && (
          <div className="mb-3 rounded-2xl border border-neon-purple/20 bg-neon-purple/[0.05] p-2.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35" />
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Поиск по username" className="w-full rounded-xl glass py-2 pl-8 pr-2 text-xs outline-none" />
            </div>
            {selectedMembers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedMembers.map((item) => <button key={userId(item)} type="button" onClick={() => toggleSelectedMember(item)} className="rounded-full bg-neon-purple/15 px-2 py-1 text-[10px] text-neon-purple">@{String(item.username ?? "user")} ×</button>)}
              </div>
            )}
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
              {memberResults.map((item) => {
                const selected = selectedMembers.some((entry) => userId(entry) === userId(item));
                return (
                  <button key={userId(item)} type="button" onClick={() => toggleSelectedMember(item)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/5">
                    <GlowAvatar src={String(item.avatarUrl ?? item.avatar_url ?? "") || null} alt={userName(item)} size={28} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs text-white/75">{userName(item)}</span><span className="block truncate text-[10px] text-white/35">@{String(item.username ?? "")}</span></span>
                    {selected && <Check size={13} className="text-neon-purple" />}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => void submitMembers()} disabled={selectedMembers.length === 0 || memberAction === "add"} className="btn-glow mt-2 w-full py-2 text-xs disabled:opacity-50">
              {memberAction === "add" ? <Loader2 size={13} className="mx-auto animate-spin" /> : `Добавить${selectedMembers.length ? ` · ${selectedMembers.length}` : ""}`}
            </button>
          </div>
        )}

        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {conversation.participants.map((participant) => {
            const busy = memberAction?.endsWith(participant.id);
            const canRemove = canManageGroup && participant.id !== user?.id && participant.role !== "owner" && !(selfRole === "admin" && participant.role === "admin");
            return (
              <div key={participant.id} className="group flex items-center gap-2 rounded-xl px-1 py-1.5 hover:bg-white/[0.03]">
                <GlowAvatar src={participant.avatarUrl} alt={participant.username} size={34} online={participant.isOnline} />
                <div className="min-w-0 flex-1">
                  <ColoredUsername username={participant.username} color={participant.nameColor} className="text-sm" />
                  <div className="text-[10px] text-white/35">{participant.isOnline ? "в сети" : "офлайн"}</div>
                </div>
                {!isChannelChat && participant.role !== "member" && participant.role !== "user" && (
                  <span className="rounded-md bg-neon-purple/15 px-1.5 py-0.5 text-[9px] text-neon-purple">{participant.role === "owner" ? "владелец" : "админ"}</span>
                )}
                {busy ? <Loader2 size={13} className="animate-spin text-white/35" /> : (
                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    {isGroupOwner && participant.id !== user?.id && participant.role !== "owner" && (
                      <>
                        <button type="button" onClick={() => void changeRole(participant, participant.role === "admin" ? "member" : "admin")} className="grid h-7 w-7 place-items-center rounded-lg text-white/35 hover:bg-white/10 hover:text-neon-purple" title={participant.role === "admin" ? "Снять администратора" : "Назначить администратором"}>
                          {participant.role === "admin" ? <Shield size={13} /> : <ShieldCheck size={13} />}
                        </button>
                        <button type="button" onClick={() => void transferOwnership(participant)} className="grid h-7 w-7 place-items-center rounded-lg text-white/35 hover:bg-white/10 hover:text-amber-300" title="Передать права владельца"><Crown size={13} /></button>
                      </>
                    )}
                    {canRemove && <button type="button" onClick={() => void removeMember(participant)} className="grid h-7 w-7 place-items-center rounded-lg text-white/35 hover:bg-red-500/10 hover:text-red-300" title="Удалить из группы"><UserMinus size={13} /></button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70"><ImageIcon size={15} /> Медиа</div>
        <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {([ ["all", "Все"], ["sent", "Отправленные"], ["received", "Полученные"] ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setMediaMode(id)} className={mediaMode === id ? "rounded-lg border border-neon-purple/40 bg-neon-purple/20 px-2.5 py-1 text-[11px] text-white" : "rounded-lg glass px-2.5 py-1 text-[11px] text-white/55"}>{label}</button>
          ))}
        </div>
        {media.length === 0 ? <div className="rounded-2xl glass p-5 text-center text-xs text-white/40">Медиа пока нет</div> : (
          <div className="grid grid-cols-3 gap-1.5">
            {media.slice(0, 12).map((item, index) => (
              <motion.button key={item.id} whileHover={{ scale: 1.05 }} onClick={() => setViewer({ items: media, index })} className="aspect-square overflow-hidden rounded-lg bg-white/5">
                {item.type === "video" && !item.thumbnailUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={item.url} preload="none" className="h-full w-full object-cover" muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl || item.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                )}
              </motion.button>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <button type="button" onClick={() => setDetails((value) => value === "files" ? null : "files")} className="flex w-full items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white"><FileText size={16} /> Файлы <span className="ml-auto text-white/30">{files.length}</span></button>
          {details === "files" && <div className="space-y-2 rounded-2xl glass p-3 text-xs text-white/50">{files.length === 0 ? "Файлов пока нет" : files.map((file) => <a key={file.id} href={file.attachmentUrl} target="_blank" rel="noreferrer" className="block truncate hover:text-white">{file.text || file.attachmentUrl}</a>)}</div>}
          <button type="button" onClick={() => setDetails((value) => value === "links" ? null : "links")} className="flex w-full items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white"><Link2 size={16} /> Ссылки <span className="ml-auto text-white/30">{links.length}</span></button>
          {details === "links" && <div className="max-h-40 space-y-2 overflow-y-auto rounded-2xl glass p-3 text-xs text-white/50">{links.length === 0 ? "Ссылок пока нет" : links.map((link) => <a key={`${link.messageId}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="block truncate hover:text-white">{link.url}</a>)}</div>}
        </div>
      </div>

      {isGroupChat && (
        <div className="space-y-2 border-t border-white/5 p-4">
          <button type="button" onClick={() => void copyInvite()} className="flex w-full items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white"><Copy size={16} /> Скопировать ссылку приглашения</button>
          {!isChannelChat && <button type="button" onClick={() => void leaveGroup()} disabled={memberAction === "leave"} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-300/75 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50">{memberAction === "leave" ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Покинуть группу</button>}
        </div>
      )}

      <div className="border-t border-white/5 p-4">
        <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:text-white"><Shield size={15} /> Конфиденциальность</button>
      </div>

      <MediaViewer items={viewer?.items ?? []} initialIndex={viewer?.index ?? 0} open={Boolean(viewer)} onClose={() => setViewer(null)} />
    </motion.div>
  );
}
