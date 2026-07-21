"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Crown,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Search,
  Shield,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { timeAgo } from "@/lib/utils";
import type {
  Conversation,
  GlobalSearchConversation,
  GlobalSearchMessage,
  GlobalSearchResponse,
  GlobalSearchType,
} from "@/types";

const EMPTY_RESULTS: GlobalSearchResponse = {
  query: "",
  users: [],
  conversations: [],
  messages: [],
  files: [],
};
const RECENT_SEARCHES_KEY = "ng_global_search_recent";
const SEARCH_FILTER_KEY = "ng_global_search_filter";

const FILTERS: Array<{ id: GlobalSearchType; label: string; icon: typeof Search }> = [
  { id: "all", label: "Всё", icon: Search },
  { id: "people", label: "Люди", icon: UserRound },
  { id: "chats", label: "Чаты", icon: MessagesSquare },
  { id: "messages", label: "Сообщения", icon: MessageCircle },
  { id: "files", label: "Файлы", icon: FileText },
];

function safeRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(String).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function rememberSearch(query: string, current: string[]): string[] {
  const value = query.trim();
  if (value.length < 2) return current;
  return [value, ...current.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8);
}

function highlighted(text: string, query: string) {
  const source = String(text || "");
  const term = query.trim();
  if (!term) return source;
  const index = source.toLocaleLowerCase("ru").indexOf(term.toLocaleLowerCase("ru"));
  if (index < 0) return source;
  return (
    <>
      {source.slice(0, index)}
      <mark className="rounded bg-neon-purple/25 px-0.5 text-white">{source.slice(index, index + term.length)}</mark>
      {source.slice(index + term.length)}
    </>
  );
}

function fileName(url: string | null, fallback: string) {
  if (!url) return fallback;
  try {
    const pathname = new URL(url, "https://nightgram.local").pathname;
    const name = pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : fallback;
  } catch {
    return fallback;
  }
}

function messagePreview(item: GlobalSearchMessage) {
  if (item.text) return item.text;
  if (item.type === "image") return "Фотография";
  if (item.type === "video") return "Видео";
  if (item.attachmentUrl) return fileName(item.attachmentUrl, "Файл");
  return "Сообщение";
}

function conversationPayload(item: GlobalSearchConversation | GlobalSearchMessage): Conversation {
  const isMessage = "conversationId" in item;
  const participants = (isMessage ? item.conversationParticipants : item.participants).map((participant) => ({
    ...participant,
    isOnline: Boolean(participant.isOnline),
  }));
  return {
    id: isMessage ? item.conversationId : item.id,
    type: isMessage ? item.conversationType : item.type,
    title: isMessage ? item.conversationTitle : item.title,
    avatarUrl: isMessage ? item.conversationAvatarUrl : item.avatarUrl,
    description: isMessage ? null : item.description,
    participants,
    lastMessage: null,
    unreadCount: 0,
    pinned: false,
    folder: "all",
  };
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GlobalSearchType>("all");
  const [results, setResults] = useState<GlobalSearchResponse>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setRecent(safeRecentSearches(localStorage.getItem(RECENT_SEARCHES_KEY)));
    const storedFilter = localStorage.getItem(SEARCH_FILTER_KEY) as GlobalSearchType | null;
    if (storedFilter && FILTERS.some((item) => item.id === storedFilter)) setFilter(storedFilter);
  }, []);

  useEffect(() => {
    localStorage.setItem(SEARCH_FILTER_KEY, filter);
  }, [filter]);

  useEffect(() => {
    const normalized = query.trim();
    const requestId = ++requestIdRef.current;
    if (normalized.length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      api.globalSearch(normalized, filter, filter === "all" ? 8 : 24)
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setResults(data);
          const nextRecent = rememberSearch(normalized, recent);
          setRecent(nextRecent);
          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecent));
        })
        .catch((reason) => {
          if (requestId !== requestIdRef.current) return;
          setResults(EMPTY_RESULTS);
          setError(reason instanceof Error ? reason.message : "Не удалось выполнить поиск");
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, 280);

    return () => window.clearTimeout(timer);
  // Recent queries are intentionally not a dependency: adding the current query
  // to history must not trigger another network request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query]);

  const totalResults = results.users.length
    + results.conversations.length
    + results.messages.length
    + results.files.length;

  const visibleSections = useMemo(() => ({
    people: filter === "all" || filter === "people",
    chats: filter === "all" || filter === "chats",
    messages: filter === "all" || filter === "messages",
    files: filter === "all" || filter === "files",
  }), [filter]);

  function openConversation(item: GlobalSearchConversation) {
    const payload = conversationPayload(item);
    localStorage.setItem("ng_open_chat", payload.id);
    localStorage.setItem("ng_open_chat_payload", JSON.stringify(payload));
    localStorage.removeItem("ng_open_message");
    router.push("/messages");
  }

  function openMessage(item: GlobalSearchMessage) {
    const payload = conversationPayload(item);
    localStorage.setItem("ng_open_chat", item.conversationId);
    localStorage.setItem("ng_open_chat_payload", JSON.stringify(payload));
    localStorage.setItem("ng_open_message", item.id);
    router.push("/messages");
  }

  function removeRecent(value: string) {
    const next = recent.filter((item) => item !== value);
    setRecent(next);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 md:pb-12">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <Search size={25} className="text-neon-purple" /> Глобальный поиск
        </h1>
        <p className="mt-1 text-sm text-white/45">Люди, чаты, сообщения и файлы в одном месте</p>
      </div>

      <div className="sticky top-2 z-30 mb-5 rounded-3xl border border-white/10 bg-[#0a0713]/90 p-3 shadow-2xl backdrop-blur-xl">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти человека, сообщение или файл…"
            autoFocus
            className="w-full rounded-2xl border border-white/10 bg-white/[0.045] py-3.5 pl-11 pr-20 text-sm outline-none transition focus:border-neon-purple/45 focus:bg-white/[0.065]"
          />
          {loading ? (
            <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-neon-purple" />
          ) : query ? (
            <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white">
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {FILTERS.map((item) => {
            const Icon = item.icon;
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${active ? "bg-neon-purple text-white shadow-lg shadow-neon-purple/20" : "bg-white/[0.055] text-white/55 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {query.trim().length < 2 ? (
        <div className="space-y-5">
          {recent.length > 0 && (
            <section className="glass-strong rounded-3xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold"><Clock3 size={17} className="text-neon-purple" /> Недавние запросы</h2>
                <button
                  type="button"
                  onClick={() => { setRecent([]); localStorage.removeItem(RECENT_SEARCHES_KEY); }}
                  className="text-xs text-white/40 hover:text-white"
                >
                  Очистить
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((item) => (
                  <div key={item} className="flex items-center overflow-hidden rounded-xl bg-white/[0.055]">
                    <button type="button" onClick={() => setQuery(item)} className="px-3 py-2 text-sm text-white/70 hover:text-white">{item}</button>
                    <button type="button" onClick={() => removeRecent(item)} className="grid h-9 w-8 place-items-center text-white/30 hover:bg-white/10 hover:text-white"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FILTERS.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" onClick={() => setFilter(item.id)} className="glass-strong rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:border-neon-purple/25">
                  <Icon size={22} className="mb-3 text-neon-purple" />
                  <div className="font-semibold">{item.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/40">
                    {item.id === "people" && "По username и отображаемому имени"}
                    {item.id === "chats" && "По названию группы или участникам"}
                    {item.id === "messages" && "По тексту во всех доступных диалогах"}
                    {item.id === "files" && "По подписи и имени вложения"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : error ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <div className="font-semibold text-red-200">Поиск временно недоступен</div>
          <div className="mt-2 text-sm text-white/40">{error}</div>
          <button type="button" onClick={() => setQuery((value) => `${value} `)} className="mt-4 rounded-xl bg-neon-purple px-4 py-2 text-sm font-semibold">Повторить</button>
        </div>
      ) : !loading && totalResults === 0 ? (
        <div className="glass-strong rounded-3xl py-20 text-center">
          <Search size={34} className="mx-auto mb-3 text-white/20" />
          <div className="font-semibold text-white/70">Ничего не найдено</div>
          <div className="mt-1 text-sm text-white/35">Попробуйте другое слово или выберите другой фильтр</div>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleSections.people && results.users.length > 0 && (
            <SearchSection title="Люди" icon={UserRound} count={results.users.length} onShowAll={filter === "all" ? () => setFilter("people") : undefined}>
              <div className="grid gap-3 md:grid-cols-2">
                {results.users.map((user) => (
                  <Link key={user.id} href={`/profile/${user.username}`} className="glass-strong flex items-center gap-3 rounded-2xl p-4 transition hover:border-neon-purple/25 hover:brightness-110">
                    <GlowAvatar src={user.avatarUrl} alt={user.username} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold" style={{ color: user.nameColor || "#fff" }}>{highlighted(user.displayName || user.username, query)}</span>
                        {user.isPremium && <Crown size={13} className="shrink-0 text-neon-gold" />}
                        {user.role !== "user" && <Shield size={13} className="shrink-0 text-neon-purple" />}
                      </div>
                      <div className="truncate text-xs text-white/40">@{highlighted(user.username, query)}</div>
                    </div>
                    <ArrowRight size={15} className="text-white/25" />
                  </Link>
                ))}
              </div>
            </SearchSection>
          )}

          {visibleSections.chats && results.conversations.length > 0 && (
            <SearchSection title="Чаты" icon={MessagesSquare} count={results.conversations.length} onShowAll={filter === "all" ? () => setFilter("chats") : undefined}>
              <div className="grid gap-3 md:grid-cols-2">
                {results.conversations.map((conversation) => (
                  <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className="glass-strong flex items-center gap-3 rounded-2xl p-4 text-left transition hover:border-neon-purple/25 hover:brightness-110">
                    <GlowAvatar src={conversation.avatarUrl} alt={conversation.title} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{highlighted(conversation.title, query)}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-white/40">
                        {conversation.type === "group" ? <Users size={12} /> : <MessageCircle size={12} />}
                        {conversation.type === "group" ? `${conversation.participants.length} участников` : "Личный чат"}
                      </div>
                    </div>
                    <ArrowRight size={15} className="text-white/25" />
                  </button>
                ))}
              </div>
            </SearchSection>
          )}

          {visibleSections.messages && results.messages.length > 0 && (
            <SearchSection title="Сообщения" icon={MessageCircle} count={results.messages.length} onShowAll={filter === "all" ? () => setFilter("messages") : undefined}>
              <div className="space-y-2.5">
                {results.messages.map((message) => (
                  <MessageResultCard key={message.id} item={message} query={query} onOpen={() => openMessage(message)} />
                ))}
              </div>
            </SearchSection>
          )}

          {visibleSections.files && results.files.length > 0 && (
            <SearchSection title="Файлы и медиа" icon={FileText} count={results.files.length} onShowAll={filter === "all" ? () => setFilter("files") : undefined}>
              <div className="grid gap-3 md:grid-cols-2">
                {results.files.map((item) => (
                  <FileResultCard key={item.id} item={item} query={query} onOpen={() => openMessage(item)} />
                ))}
              </div>
            </SearchSection>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSection({
  title,
  icon: Icon,
  count,
  onShowAll,
  children,
}: {
  title: string;
  icon: typeof Search;
  count: number;
  onShowAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Icon size={18} className="text-neon-purple" /> {title} <span className="text-xs font-normal text-white/30">{count}</span></h2>
        {onShowAll && <button type="button" onClick={onShowAll} className="text-xs text-neon-purple hover:text-white">Показать все</button>}
      </div>
      {children}
    </section>
  );
}

function MessageResultCard({ item, query, onOpen }: { item: GlobalSearchMessage; query: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="glass-strong flex w-full gap-3 rounded-2xl p-4 text-left transition hover:border-neon-purple/25 hover:brightness-110">
      <GlowAvatar src={item.sender?.avatarUrl ?? item.conversationAvatarUrl} alt={item.sender?.username ?? item.conversationTitle} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="font-semibold text-white/80">{item.sender?.displayName || item.sender?.username || "Пользователь"}</span>
          <span className="text-white/30">в {item.conversationTitle}</span>
          <span className="ml-auto text-white/25">{timeAgo(item.createdAt)}</span>
        </div>
        <div className="mt-1 line-clamp-3 text-sm leading-relaxed text-white/65">{highlighted(messagePreview(item), query)}</div>
      </div>
      <ArrowRight size={15} className="mt-1 shrink-0 text-white/25" />
    </button>
  );
}

function FileResultCard({ item, query, onOpen }: { item: GlobalSearchMessage; query: string; onOpen: () => void }) {
  const isImage = item.type === "image";
  const isVideo = item.type === "video";
  const preview = item.attachmentThumbnailUrl || (isImage ? item.attachmentUrl : null);
  const Icon = isImage ? ImageIcon : isVideo ? Video : FileIcon;
  const name = fileName(item.attachmentUrl, messagePreview(item));
  return (
    <button type="button" onClick={onOpen} className="glass-strong flex items-center gap-3 rounded-2xl p-3 text-left transition hover:border-neon-purple/25 hover:brightness-110">
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.06]">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Icon size={23} className="text-neon-purple" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{highlighted(name, query)}</div>
        <div className="mt-1 truncate text-xs text-white/40">{item.conversationTitle} · {timeAgo(item.createdAt)}</div>
        {item.text && item.text !== name && <div className="mt-1 line-clamp-1 text-xs text-white/45">{highlighted(item.text, query)}</div>}
      </div>
      <ArrowRight size={15} className="shrink-0 text-white/25" />
    </button>
  );
}
