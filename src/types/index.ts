// =============================================================================
//  NightGram Web — Domain Types
//  Shared with the backend & mobile app for full data sync.
// =============================================================================

export type ID = string;

export interface User {
  id: ID;
  /** Public numeric ID, like 10000001. Incremented for each new user. */
  ngId: number;
  /** Optional custom ID (like Telegram @username). If null, shows ngId. */
  customId: string | null;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string;
  /** Hex / token for the colored username (bought in Night Store). */
  nameColor: string;
  /** id of the selected name-color preset (for de-dup tracking). */
  nameColorId: string;
  isPremium: boolean;
  premiumUntil: string | null;
  /** Separate verification flag. Does not occupy avatarFrame anymore. */
  verified?: boolean;
  /** Glow effect token bought in Night Store. */
  glowEffect: string | null;
  /** Frame token bought in Night Store. */
  avatarFrame: string | null;
  nightCoins: number;
  boostBalance?: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: string;
  role: "user" | "creator" | "moderator" | "admin" | "support" | "co_owner" | "owner";
  ownedItems: StoreItem["id"][];
  notificationSettings: NotificationSettings;
  hideSocial?: boolean;
  hidePurchases?: boolean;
  deletionRequestedAt?: string | null;
  deletionScheduledAt?: string | null;
  deletedAt?: string | null;
  isOnline?: boolean;
  lastSeen?: string | null;
  nightStatusText?: string | null;
  nightStatusEmoji?: string | null;
  nightStatusExpiresAt?: string | null;
  musicArtist?: string | null;
  musicTrack?: string | null;
  roomScene?: "midnight" | "cyber" | "gold" | "rain" | "void" | null;
  activeBan?: {
    id?: string;
    type?: "ban" | string;
    reason?: string | null;
    duration?: string | null;
    issuedByName?: string | null;
    expiresAt?: string | null;
    createdAt?: string | null;
  } | null;
}

export type PostMediaType = "image" | "video";

export interface PostMedia {
  id: ID;
  type: PostMediaType;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export type PostAuthor =
  | { kind: "user"; user: User }
  | { kind: "channel"; channel: Channel };

export interface Post {
  id: ID;
  author: PostAuthor;
  text: string | null;
  media: PostMedia[];
  tags: string[];
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  sharesCount: number;
  visibility?: "public" | "followers" | "circle";
  circleId?: ID | null;
  liked: boolean;
  saved: boolean;
  pinnedOnProfile?: boolean;
  pinnedAt?: string | null;
  createdAt: string;
}

export interface Comment {
  id: ID;
  postId: ID;
  parentId?: ID | null;
  author: Pick<User, "id" | "username" | "displayName" | "avatarUrl" | "nameColor"> & { role?: string; isPremium?: boolean };
  text: string;
  likesCount: number;
  liked: boolean;
  pinned?: boolean;
  pinnedAt?: string | null;
  createdAt: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

// ---- Channels -------------------------------------------------------------

export interface Channel {
  id: ID;
  name: string;
  handle: string;
  avatarUrl: string | null;
  description: string;
  subscribersCount: number;
  verified: boolean;
  ownerId?: ID;
  myRole?: string | null;
  isPrivate?: boolean;
  boostColor?: string | null;
  boostGlow?: string | null;
  boostAvatarFrame?: string | null;
  boostLevel?: number;
  boostMeta?: {
    level: number;
    activeBoosts: number;
    needPerLevel: number;
    nextLevelBoosts: number;
    maxBoosts: number;
    storyLimit: number;
    unlockedColors: number;
    unlockedFrames: number;
    priority: boolean;
  };
  availableBoostColors?: string[];
  availableBoostFrames?: string[];
}

// ---- Messenger ------------------------------------------------------------

export type ConversationType = "direct" | "group";

export interface Conversation {
  id: ID;
  type: ConversationType;
  title: string;
  avatarUrl: string | null;
  participants: ConversationParticipant[];
  lastMessage: Message | null;
  unreadCount: number;
  pinned: boolean;
  muted?: boolean;
  requestStatus?: "accepted" | "pending" | "hidden" | "blocked";
  favorite?: boolean;
  folder: ChatFolder;
  appRole?: User["role"];
  isPremium?: boolean;
  avatarFrame?: string | null;
  verified?: boolean;
  isOnline?: boolean;
  lastSeen?: string | null;
  nightStatusText?: string | null;
  nightStatusEmoji?: string | null;
  nightStatusExpiresAt?: string | null;
}

export interface ConversationParticipant {
  id: ID;
  username: string;
  displayName?: string;
  avatarUrl: string | null;
  nameColor: string;
  role: "member" | "admin" | "owner" | "user";
  appRole?: User["role"];
  isPremium?: boolean;
  avatarFrame?: string | null;
  verified?: boolean;
  isOnline: boolean;
  lastSeen?: string | null;
  nightStatusText?: string | null;
  nightStatusEmoji?: string | null;
  nightStatusExpiresAt?: string | null;
}

export type MessageType = "text" | "image" | "video" | "file" | "sticker" | "system";
export type MessageStatus = "sending" | "sent" | "delivered" | "read";

export interface Message {
  id: ID;
  conversationId: ID;
  senderId: ID;
  sender?: Pick<User, "id" | "username" | "displayName" | "avatarUrl" | "nameColor"> & { isPremium?: boolean; avatarFrame?: string | null; verified?: boolean; isOnline?: boolean };
  text?: string;
  type: MessageType;
  attachmentUrl?: string;
  replyTo?: Pick<Message, "id" | "text" | "senderId"> | null;
  reactions: { emoji: string; userIds: ID[] }[];
  status: MessageStatus;
  /** Per-recipient delivery/read receipts. Filled by backend when message_reads migration is installed. */
  deliveredTo?: ID[];
  readBy?: ID[];
  createdAt: string;
}

export type ChatFolder = "all" | "unread" | "groups" | "favorites";

// ---- Night Store ----------------------------------------------------------

export type StoreCategory =
  | "theme"
  | "color_pack"
  | "sticker_pack"
  | "frame"
  | "glow_effect"
  | "badge"
  | "nft";

export type StoreEffectType =
  | "theme"
  | "accent"
  | "name_color"
  | "avatar_frame"
  | "glow_effect"
  | "profile_background"
  | "badge"
  | "sticker_pack"
  | "nft";

export interface StoreItem {
  id: ID;
  name: string;
  description: string;
  category: StoreCategory;
  previewUrl: string;
  /** Explicit use/effect pipeline. Admin can create backgrounds, badges, frames, colors, NFTs, etc. */
  effectType?: StoreEffectType | null;
  effectValue?: string | null;
  effectPayload?: Record<string, unknown> | null;
  /** Price in NightCoins. If 0 → real-money only (Stripe price). */
  priceCoins: number;
  /** Stripe price id for direct purchase (optional). */
  stripePriceId?: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  owned: boolean;
  applied?: boolean;
  level?: number;
  serialNumber?: number | null;
  /** One-time NFT reveal state: false/empty until user upgrades the base NFT. */
  isNftUpgraded?: boolean;
  upgradedAt?: string | null;
  upgradePriceCoins?: number | null;
  nftMetadata?: {
    upgraded?: boolean;
    serialNumber?: number;
    modelName?: string;
    modelUrl?: string;
    colorName?: string;
    colors?: string[];
    backgroundCss?: string;
    auraBonus?: number;
    revealSeed?: number;
    variantId?: string;
    revealedAt?: string;
    [key: string]: unknown;
  } | null;
  upgradeable?: boolean;
  maxLevel?: number;
  nftCollection?: string | null;
  dropStartsAt?: string | null;
  dropEndsAt?: string | null;
  stockTotal?: number | null;
  stockSold?: number;
}

// ---- Auth -----------------------------------------------------------------

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ---- Real-time events (mirror the backend socket contract) ----------------

export interface ServerToClientEvents {
  "message:new": (message: Message & { clientId?: ID; client_id?: ID }) => void;
  "message:push": (payload: { conversationId: ID; message: Message; muted?: boolean; conversationTitle?: string; avatarUrl?: string | null }) => void;
  "message:status": (data: { messageId: ID; status: MessageStatus; deliveredTo?: ID[]; readBy?: ID[] }) => void;
  "message:receipt": (data: { messageId: ID; userId: ID; status: MessageStatus; deliveredTo?: ID[]; readBy?: ID[]; deliveredAt?: string; readAt?: string }) => void;
  "message:reaction": (data: { messageId: ID; emoji: string; userId: ID; active?: boolean }) => void;
  "message:delivered": (data: { messageId: ID; userId: ID; status?: MessageStatus; deliveredTo?: ID[]; readBy?: ID[] }) => void;
  "message:read": (data: { messageId: ID; userId: ID; status?: MessageStatus; deliveredTo?: ID[]; readBy?: ID[] }) => void;
  "conversation:update": (conversation: Conversation) => void;
  "post:new": (post: Post) => void;
  "post:like": (data: { postId: ID; userId: ID; liked: boolean }) => void;
  "typing": (data: { conversationId: ID; userId: ID; isTyping: boolean }) => void;
  "presence:update": (data: { userId: ID; isOnline: boolean }) => void;
  "call:incoming": (data: { conversationId: ID; callId: ID; fromUserId: ID; fromUsername: string; type: "audio" | "video"; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:accepted": (data: { conversationId: ID; callId: ID; byUserId: ID; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:offer": (data: { conversationId: ID; callId: ID; fromUserId: ID; offer: RTCSessionDescriptionInit; type: "audio" | "video"; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:answer": (data: { conversationId: ID; callId: ID; fromUserId: ID; answer: RTCSessionDescriptionInit; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:ice-candidate": (data: { conversationId: ID; callId: ID; fromUserId: ID; candidate: RTCIceCandidateInit; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:reaction": (data: { conversationId: ID; callId: ID; fromUserId: ID; fromUsername?: string; emoji: string; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:watch": (data: { conversationId: ID; callId: ID; fromUserId: ID; fromUsername?: string; url?: string; action?: "share" | "close"; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:media-state": (data: { conversationId: ID; callId: ID; fromUserId: ID; micEnabled?: boolean; cameraEnabled?: boolean; screenSharing?: boolean; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:rejected": (data: { conversationId: ID; callId: ID; byUserId: ID; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "call:ended": (data: { conversationId: ID; callId: ID; byUserId: ID; conversationTitle?: string; avatarUrl?: string | null; participants?: ID[] }) => void;
  "notification:new": (notification: AppNotification) => void;
  "coins:update": (balance: number) => void;
  "premium:update": (isPremium: boolean, until: string | null) => void;
}

export interface ClientToServerEvents {
  "message:send": (payload: {
    conversationId: ID;
    clientId?: ID;
    text?: string;
    type?: MessageType;
    attachmentUrl?: string;
    replyTo?: ID;
  }, ack?: (response: { ok?: boolean; id?: ID; clientId?: ID; error?: string; message?: string; retryAfter?: number }) => void) => void;
  "message:react": (data: { messageId: ID; emoji: string }) => void;
  "message:delivered": (data: { messageId: ID; conversationId: ID }) => void;
  "message:read": (data: { messageId: ID; conversationId: ID }) => void;
  "conversation:join": (conversationId: ID, ack?: (response: { ok?: boolean; error?: string }) => void) => void;
  "conversation:leave": (conversationId: ID) => void;
  "typing": (data: { conversationId: ID; isTyping: boolean }) => void;
  "post:like": (data: { postId: ID; liked: boolean }) => void;
  "call:start": (payload: { conversationId: ID; callId: ID; type: "audio" | "video" }) => void;
  "call:accept": (payload: { conversationId: ID; callId: ID }) => void;
  "call:offer": (payload: { conversationId: ID; callId: ID; offer: RTCSessionDescriptionInit; type: "audio" | "video"; toUserId?: ID }) => void;
  "call:answer": (payload: { conversationId: ID; callId: ID; answer: RTCSessionDescriptionInit; toUserId?: ID }) => void;
  "call:ice-candidate": (payload: { conversationId: ID; callId: ID; candidate: RTCIceCandidateInit; toUserId?: ID }) => void;
  "call:reaction": (payload: { conversationId: ID; callId: ID; emoji: string }) => void;
  "call:watch": (payload: { conversationId: ID; callId: ID; url?: string; action?: "share" | "close" }) => void;
  "call:media-state": (payload: { conversationId: ID; callId: ID; micEnabled?: boolean; cameraEnabled?: boolean; screenSharing?: boolean }) => void;
  "call:reject": (payload: { conversationId: ID; callId: ID }) => void;
  "call:end": (payload: { conversationId: ID; callId: ID }) => void;
  "presence:ping": () => void;
}

// ---- Notification settings -------------------------------------------------

export interface NotificationSettings {
  push: boolean;
  messages: boolean;
  likes: boolean;
  comments: boolean;
  newFollowers: boolean;
  storeDrops: boolean;
  sounds: boolean;
}

// ---- Notifications ---------------------------------------------------------

export type NotificationType =
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "store"
  | "system"
  | "message";

export interface AppNotification {
  id: ID;
  type: NotificationType;
  title: string;
  body: string;
  /** actor avatar, if any */
  avatarUrl?: string | null;
  actorId?: ID | null;
  actionType?: "follow_back" | string | null;
  read: boolean;
  createdAt: string;
}

// ---- Appearance / theme ----------------------------------------------------

export type ThemeId =
  | "night"
  | "midnight"
  | "royal"
  | "gold"
  | "sakura"
  | "ocean"
  | "forest"
  | "crimson"
  | "amber"
  | "emerald"
  | "amoled"
  | "graphite"
  | "navy"
  | "mint"
  | "void"
  | "obsidian"
  | "plum"
  | "bloodmoon"
  | "cyber"
  | "aurora"
  | "nebula"
  | "dracula"
  | "ice"
  | "terminal"
  | "coffee"
  | "cream"
  | "light";

export type AccentId = ThemeId;

export interface AppearanceSettings {
  /** Background + surfaces + text (the "тема"). */
  theme: ThemeId;
  /** Accent: buttons, glow, hover, borders, gradients. */
  accent: AccentId;
  glassOpacity: number; // 0.2 - 0.85
  reducedMotion: boolean;
  fontSize: "sm" | "base" | "lg";
}

// ---- Moderation / Admin ----------------------------------------------------

export type PunishmentType = "ban" | "mute_dm" | "mute_posts" | "warning";

export interface Punishment {
  id: ID;
  userId: ID;
  type: PunishmentType;
  reason: string;
  duration: string; // "7d", "permanent", "30d"
  issuedBy: ID;
  issuedByName: string;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
}

export type TicketStatus = "open" | "in_progress" | "resolved" | "unresolved" | "closed";

export interface ModerationTicket {
  id: ID;
  subject: string;
  body: string;
  category: string;
  status: TicketStatus;
  authorId: ID;
  authorName: string;
  createdAt: string;
  assignedTo?: string;
  priority: "low" | "medium" | "high";
}

export type ReportCategory =
  | "spam"
  | "scam"
  | "harassment"
  | "nsfw"
  | "violence"
  | "copyright"
  | "other";

export interface Report {
  id: ID;
  targetType: "post" | "comment" | "user";
  targetId: ID;
  category: ReportCategory;
  reason: string;
  reporterId: ID;
  reporterName: string;
  status: "pending" | "reviewed" | "actioned";
  createdAt: string;
}

export interface ModerationLog {
  id: ID;
  action: string;
  adminId: ID;
  adminName: string;
  targetUserId: ID;
  targetUserName: string;
  details: string;
  createdAt: string;
}

export interface BroadcastNotification {
  id: ID;
  title: string;
  subtitle: string;
  body: string;
  icon: string;
  createdAt: string;
}

export type PurchaseStatus = "pending" | "approved" | "rejected";

export interface PurchaseRequest {
  id: ID;
  userId: ID;
  username: string;
  ngId: number;
  itemType: "premium" | "coins";
  itemName: string;
  price: number;
  status: PurchaseStatus;
  createdAt: string;
}
