// =============================================================================
//  NightGram Web — Demo mock data
//  Provides realistic content when the backend isn't connected yet, so the
//  UI is fully explorable. When the API is live, real data replaces these.
// =============================================================================

import type {
  AppNotification,
  Comment,
  Conversation,
  Message,
  NotificationSettings,
  Post,
  StoreItem,
  User,
} from "@/types";
import { uid } from "./utils";

const now = Date.now();
const mins = (m: number) => new Date(now - m * 60_000).toISOString();

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  push: true,
  messages: true,
  likes: true,
  comments: true,
  newFollowers: true,
  storeDrops: true,
  sounds: true,
};

const USERS: User[] = [
  {
    id: "u_nova",
    ngId: 10000002,
    customId: "nova",
    username: "nova",
    displayName: "Nova Aurora",
    email: "nova@nightgram.app",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop",
    bannerUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&h=400&fit=crop",
    bio: "Digital artist ✦ building dreams in neon. NightGram Creator.",
    nameColor: "#ffffff",
    nameColorId: "light",
    isPremium: true,
    premiumUntil: null,
    glowEffect: "purple",
    avatarFrame: "aurora",
    nightCoins: 8400,
    followersCount: 128400,
    followingCount: 312,
    postsCount: 284,
    createdAt: mins(60 * 24 * 400),
    role: "creator",
    ownedItems: ["it_aurora_theme", "it_frame_aurora"],
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  },
  {
    id: "u_kestrel",
    ngId: 10000003,
    customId: null,
    username: "kestrel",
    displayName: "Kestrel Vex",
    email: "kestrel@nightgram.app",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop",
    bannerUrl: null,
    bio: "Night-owl photographer 🌃 capturing the city glow.",
    nameColor: "#22d3ee",
    nameColorId: "ocean",
    isPremium: false,
    premiumUntil: null,
    glowEffect: null,
    avatarFrame: null,
    nightCoins: 320,
    followersCount: 9120,
    followingCount: 540,
    postsCount: 96,
    createdAt: mins(60 * 24 * 220),
    role: "user",
    ownedItems: [],
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  },
  {
    id: "u_lumen",
    ngId: 10000004,
    customId: "lumen",
    username: "lumen",
    displayName: "Lumen",
    email: "lumen@nightgram.app",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop",
    bannerUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&h=400&fit=crop",
    bio: "Music producer 🎧 lo-fi & synthwave. Stream my night tapes.",
    nameColor: "#ec4899",
    nameColorId: "sakura",
    isPremium: true,
    premiumUntil: null,
    glowEffect: "pink",
    avatarFrame: "pulse",
    nightCoins: 1560,
    followersCount: 45200,
    followingCount: 88,
    postsCount: 410,
    createdAt: mins(60 * 24 * 510),
    role: "creator",
    ownedItems: ["it_pink_glow", "it_frame_pulse"],
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  },
  {
    id: "u_ember",
    ngId: 10000005,
    customId: null,
    username: "ember",
    displayName: "Ember Vale",
    email: "ember@nightgram.app",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop",
    bannerUrl: null,
    bio: "Street style & neon nights. ✦ Tokyo / Berlin",
    nameColor: "#fbbf24",
    nameColorId: "gold",
    isPremium: false,
    premiumUntil: null,
    glowEffect: null,
    avatarFrame: null,
    nightCoins: 90,
    followersCount: 2310,
    followingCount: 1200,
    postsCount: 58,
    createdAt: mins(60 * 24 * 130),
    role: "user",
    ownedItems: [],
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  },
];

const CHANNEL = {
  id: "ch_nightwire",
  name: "NightWire",
  handle: "nightwire",
  avatarUrl: "https://images.unsplash.com/photo-1614851099511-773084f6911d?w=200&h=200&fit=crop",
  description: "Official NightGram updates, drops & creator highlights.",
  subscribersCount: 892000,
  verified: true,
};

const POST_MEDIA = [
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=900&h=1200&fit=crop",
  "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=900&h=900&fit=crop",
  "https://images.unsplash.com/photo-1493514789931-586cb221d7a7?w=900&h=1200&fit=crop",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&h=600&fit=crop",
  "https://images.unsplash.com/photo-1574169208507-84376144848b?w=900&h=900&fit=crop",
];

const CAPTIONS = [
  "Midnight glow never sleeps ✦ #nightgram #neon",
  "Captured this on the way home — the city hums in violet.",
  "New drop just landed in the Night Store 🔥 go grab the Aurora theme.",
  "Synthwave session at 3am. Full track in bio 🎧",
  "When the lights hit different 🌃",
  "Building something new for you all. Stay glowing. ✦",
  "Street reflections, neon directions.",
  "Premium members: your exclusive sticker pack is live now.",
];

const TAGS = ["nightgram", "neon", "art", "photography", "synthwave", "street"];

function makePost(i: number, offset = 0): Post {
  const useChannel = i % 5 === 4;
  const user = USERS[i % USERS.length];
  const hasMedia = i % 6 !== 5; // some text-only
  const hasVideo = i % 7 === 0;
  return {
    id: `p_${i}_${offset}`,
    author: useChannel
      ? { kind: "channel", channel: CHANNEL }
      : { kind: "user", user },
    text: hasMedia ? CAPTIONS[i % CAPTIONS.length] : CAPTIONS[(i + 3) % CAPTIONS.length],
    media: hasMedia
      ? hasVideo
        ? [
            {
              id: `m_${i}`,
              type: "video",
              url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
              thumbnailUrl: POST_MEDIA[i % POST_MEDIA.length],
              durationSec: 15,
            },
          ]
        : [
            {
              id: `m_${i}`,
              type: "image",
              url: POST_MEDIA[(i + offset) % POST_MEDIA.length],
            },
          ]
      : [],
    tags: TAGS.slice(i % 3, (i % 3) + 2),
    likesCount: 1200 + ((i * 137) % 40000),
    commentsCount: 12 + ((i * 9) % 500),
    viewsCount: 8000 + ((i * 523) % 200000),
    sharesCount: 5 + ((i * 11) % 800),
    liked: false,
    saved: false,
    createdAt: mins(8 + i * 37 + offset * 5),
  };
}

export function mockFeed(page = 0, limit = 6): { posts: Post[]; nextCursor: string | null } {
  const start = page * limit;
  const posts = Array.from({ length: limit }, (_, k) => makePost(start + k, page));
  return {
    posts,
    nextCursor: page < 8 ? String(page + 1) : null, // ~9 pages then "end"
  };
}

export function mockComments(postId: string): Comment[] {
  return Array.from({ length: 5 }, (_, i) => {
    const u = USERS[i % USERS.length];
    return {
      id: `c_${postId}_${i}`,
      postId,
      author: { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, nameColor: u.nameColor },
      text: ["This is unreal 🔥", "Where was this taken?", "Aurora vibes ✦", "Premium worth it", "Need this theme asap"][i],
      likesCount: (i * 13) % 200,
      liked: false,
      createdAt: mins(3 + i * 7),
    };
  });
}

export function mockUser(): User {
  return {
    id: "u_me",
    ngId: 10000001,
    customId: null,
    username: "you",
    displayName: "You (Demo)",
    email: "you@nightgram.app",
    avatarUrl: "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop",
    bannerUrl: null,
    bio: "Exploring NightGram ✦ Welcome to my night.",
    nameColor: "#ffffff",
    nameColorId: "light",
    isPremium: false,
    premiumUntil: null,
    glowEffect: null,
    avatarFrame: null,
    nightCoins: 1250,
    followersCount: 482,
    followingCount: 231,
    postsCount: 18,
    createdAt: mins(60 * 24 * 40),
    role: "user",
    ownedItems: [],
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  };
}

export function mockUserByUsername(username: string): User | null {
  return USERS.find((u) => u.username === username) ?? null;
}

export function mockConversations(): Conversation[] {
  return USERS.map((u, i) => ({
    id: `conv_${u.id}`,
    type: "direct" as const,
    title: u.displayName,
    avatarUrl: u.avatarUrl,
    participants: [
      {
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        nameColor: u.nameColor,
        role: "member" as const,
        isOnline: i % 2 === 0,
      },
    ],
    lastMessage: {
      id: uid("msg"),
      conversationId: `conv_${u.id}`,
      senderId: i % 2 === 0 ? u.id : "u_me",
      text: ["you around tonight? ✦", "sent you the track", "🔥🔥🔥", "check Night Store"][i % 4],
      type: "text" as const,
      reactions: [],
      status: "read" as const,
      createdAt: mins(2 + i * 23),
    },
    unreadCount: i === 0 ? 3 : i === 2 ? 1 : 0,
    pinned: i === 0,
    folder: i === 0 ? "favorites" : "all",
    isOnline: i % 2 === 0,
  }));
}

export function mockMessages(conversationId: string): Message[] {
  return Array.from({ length: 8 }, (_, i) => {
    const mine = i % 2 === 1;
    return {
      id: uid("msg"),
      conversationId,
      senderId: mine ? "u_me" : "u_nova",
      text: [
        "hey, did you see the new drop? 🔥",
        "yes!! the Aurora theme is incredible",
        "grabbing it with my NightCoins rn",
        "worth every coin ✦",
        "we should hop on a call later",
        "definitely, around midnight?",
        "perfect 🌙",
        "see you then",
      ][i],
      type: "text" as const,
      reactions: i === 3 ? [{ emoji: "🔥", userIds: ["u_nova"] }] : [],
      status: "read" as const,
      createdAt: mins((8 - i) * 4),
    };
  });
}

export function mockStoreItems(): StoreItem[] {
  const base: Omit<StoreItem, "owned">[] = [
    { id: "it_aurora_theme", name: "Aurora Theme", description: "Shifting midnight aurora gradient across the whole app.", category: "theme", previewUrl: POST_MEDIA[0], priceCoins: 800, rarity: "epic" },
    { id: "it_void_theme", name: "Void Theme", description: "Deep-space black with violet star particles.", category: "theme", previewUrl: POST_MEDIA[4], priceCoins: 1200, rarity: "legendary" },
    { id: "it_neon_pack", name: "Neon Color Pack", description: "12 vivid neon name colors.", category: "color_pack", previewUrl: POST_MEDIA[2], priceCoins: 400, rarity: "rare" },
    { id: "it_frame_aurora", name: "Aurora Frame", description: "Animated aurora ring around your avatar.", category: "frame", previewUrl: POST_MEDIA[0], priceCoins: 600, rarity: "epic" },
    { id: "it_frame_pulse", name: "Pulse Frame", description: "Heartbeat-pulsing neon frame.", category: "frame", previewUrl: POST_MEDIA[5], priceCoins: 900, rarity: "epic" },
    { id: "it_pink_glow", name: "Pink Neon Glow", description: "Saturated pink glow on your username & posts.", category: "glow_effect", previewUrl: POST_MEDIA[3], priceCoins: 350, rarity: "rare" },
    { id: "it_purple_glow", name: "Violet Nebula Glow", description: "Soft violet nebula halo on everything you post.", category: "glow_effect", previewUrl: POST_MEDIA[2], priceCoins: 550, rarity: "rare" },
    { id: "it_sticker_neon", name: "Neon Sticker Pack", description: "40 animated neon stickers for chats.", category: "sticker_pack", previewUrl: POST_MEDIA[1], priceCoins: 300, rarity: "common" },
    { id: "it_sticker_cyber", name: "Cyber Sticker Pack", description: "Cyberpunk animated stickers.", category: "sticker_pack", previewUrl: POST_MEDIA[5], priceCoins: 450, rarity: "rare" },
    { id: "it_badge_founder", name: "Founder Badge", description: "Permanent ✦ badge. Early supporters only.", category: "badge", previewUrl: POST_MEDIA[3], priceCoins: 0, stripePriceId: "price_founder", rarity: "legendary" },
    { id: "it_badge_verified", name: "Verified Glow Badge", description: "Glowing verified checkmark badge.", category: "badge", previewUrl: POST_MEDIA[0], priceCoins: 1500, rarity: "legendary" },
    { id: "it_gold_pack", name: "Gold Accent Pack", description: "Golden name, frame & glow trio.", category: "color_pack", previewUrl: POST_MEDIA[3], priceCoins: 2000, rarity: "legendary" },
  ];
  return base.map((b) => ({ ...b, owned: false }));
}

export function mockNotifications(): AppNotification[] {
  return [
    {
      id: uid("n"),
      type: "like",
      title: "Nova Aurora",
      body: "оценил(а) твой пост 🔥",
      avatarUrl: USERS[0].avatarUrl,
      read: false,
      createdAt: mins(3),
    },
    {
      id: uid("n"),
      type: "follow",
      title: "Lumen",
      body: "подписался(ась) на тебя",
      avatarUrl: USERS[2].avatarUrl,
      read: false,
      createdAt: mins(22),
    },
    {
      id: uid("n"),
      type: "comment",
      title: "Kestrel Vex",
      body: "ответил(а): «Aurora vibes ✦»",
      avatarUrl: USERS[1].avatarUrl,
      read: true,
      createdAt: mins(60),
    },
    {
      id: uid("n"),
      type: "store",
      title: "Night Store",
      body: "Новое обновление: Void Theme уже доступен 💎",
      avatarUrl: null,
      read: true,
      createdAt: mins(180),
    },
    {
      id: uid("n"),
      type: "system",
      title: "NightGram",
      body: "Добро пожаловать! Твой профиль готов ✦",
      avatarUrl: null,
      read: true,
      createdAt: mins(60 * 24 * 2),
    },
  ];
}
