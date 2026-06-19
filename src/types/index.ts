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
  /** Glow effect token bought in Night Store. */
  glowEffect: string | null;
  /** Frame token bought in Night Store. */
  avatarFrame: string | null;
  nightCoins: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: string;
  role: "user" | "creator" | "moderator" | "admin" | "support" | "co_owner" | "owner";
  ownedItems: StoreItem["id"][];
  notificationSettings: NotificationSettings;
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
  liked: boolean;
  saved: boolean;
  createdAt: string;
}

export interface Comment {
  id: ID;
  postId: ID;
  author: Pick<User, "id" | "username" | "displayName" | "avatarUrl" | "nameColor"> & { role?: string };
  text: string;
  likesCount: number;
  liked: boolean;
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
  folder: ChatFolder;
  isOnline?: boolean;
}

export interface ConversationParticipant {
  id: ID;
  username: string;
  avatarUrl: string | null;
  nameColor: string;
  role: "member" | "admin" | "owner" | "user";
  isOnline: boolean;
}

export type MessageType = "text" | "image" | "video" | "file" | "sticker" | "system";
export type MessageStatus = "sending" | "sent" | "delivered" | "read";

export interface Message {
  id: ID;
  conversationId: ID;
  senderId: ID;
  text?: string;
  type: MessageType;
  attachmentUrl?: string;
  replyTo?: Pick<Message, "id" | "text" | "senderId"> | null;
  reactions: { emoji: string; userIds: ID[] }[];
  status: MessageStatus;
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
  | "badge";

export interface StoreItem {
  id: ID;
  name: string;
  description: string;
  category: StoreCategory;
  previewUrl: string;
  /** Price in NightCoins. If 0 → real-money only (Stripe price). */
  priceCoins: number;
  /** Stripe price id for direct purchase (optional). */
  stripePriceId?: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  owned: boolean;
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
  "message:new": (message: Message) => void;
  "message:status": (data: { messageId: ID; status: MessageStatus }) => void;
  "message:reaction": (data: { messageId: ID; emoji: string; userId: ID }) => void;
  "conversation:update": (conversation: Conversation) => void;
  "post:new": (post: Post) => void;
  "post:like": (data: { postId: ID; userId: ID; liked: boolean }) => void;
  "typing": (data: { conversationId: ID; userId: ID; isTyping: boolean }) => void;
  "presence:update": (data: { userId: ID; isOnline: boolean }) => void;
  "coins:update": (balance: number) => void;
  "premium:update": (isPremium: boolean, until: string | null) => void;
}

export interface ClientToServerEvents {
  "message:send": (payload: {
    conversationId: ID;
    text?: string;
    type?: MessageType;
    attachmentUrl?: string;
    replyTo?: ID;
  }) => void;
  "message:react": (data: { messageId: ID; emoji: string }) => void;
  "typing": (data: { conversationId: ID; isTyping: boolean }) => void;
  "post:like": (data: { postId: ID; liked: boolean }) => void;
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
