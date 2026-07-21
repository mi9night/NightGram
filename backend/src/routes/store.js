// Night Store routes — list items, buy with coins, Stripe checkout
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const Stripe = require("stripe");
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

function serializeItem(i, owned = false, applied = false, ownedMeta = {}) {
  const isNft = isNftItem(i);
  const nftMetadata = normalizeNftMetadata(ownedMeta.nft_metadata ?? ownedMeta.nftMetadata);
  const upgradedAt = ownedMeta.upgraded_at ?? ownedMeta.upgradedAt ?? nftMetadata?.revealedAt ?? null;
  const serialNumber = ownedMeta.serial_number ?? ownedMeta.serialNumber ?? nftMetadata?.serialNumber ?? null;
  const rawLevel = Math.max(1, Number(ownedMeta.level || 1) || 1);
  const isNftUpgraded = isNft && Boolean(upgradedAt || serialNumber || rawLevel > 1 || nftMetadata?.upgraded);
  const level = isNft ? (isNftUpgraded ? 2 : 1) : rawLevel;

  return {
    id: i.id,
    name: i.name,
    description: i.description,
    category: i.category,
    previewUrl: i.preview_url,
    effectType: i.effect_type || inferEffectType(i),
    effectValue: i.effect_value || null,
    effectPayload: i.effect_payload || null,
    priceCoins: i.price_coins,
    stripePriceId: i.stripe_price_id,
    rarity: i.rarity,
    owned,
    applied,
    level,
    serialNumber: isNftUpgraded ? serialNumber : null,
    upgradeable: Boolean(i.upgradeable),
    maxLevel: isNft ? 2 : Number(i.max_level || 1),
    upgradePriceCoins: isNft ? nftUpgradeCost(i, 1) : null,
    nftCollection: i.nft_collection || null,
    nftMetadata: isNftUpgraded ? nftMetadata : null,
    upgradedAt: isNftUpgraded ? upgradedAt : null,
    isNftUpgraded,
    dropStartsAt: i.drop_starts_at || null,
    dropEndsAt: i.drop_ends_at || null,
    stockTotal: i.stock_total ?? null,
    stockSold: i.stock_sold ?? 0,
  };
}

function inferEffectType(item) {
  if (item.effect_type) return item.effect_type;
  if (item.category === "color_pack") return "name_color";
  if (item.category === "frame") return "avatar_frame";
  if (item.category === "glow_effect") return "glow_effect";
  if (item.category === "theme") return "theme";
  if (item.category === "badge") return "badge";
  if (item.category === "sticker_pack") return "sticker_pack";
  if (item.category === "nft") return "nft";
  return item.category;
}

function isNftItem(item) {
  return item?.category === "nft" || inferEffectType(item || {}) === "nft";
}

function parseEffectPayload(item) {
  const raw = item?.effect_payload;
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeNftMetadata(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isOwnedNftUpgraded(owned) {
  if (!owned) return false;
  const metadata = normalizeNftMetadata(owned.nft_metadata ?? owned.nftMetadata);
  return Boolean(
    owned.upgraded_at
      || owned.upgradedAt
      || owned.serial_number
      || owned.serialNumber
      || Number(owned.level || 1) > 1
      || metadata?.upgraded,
  );
}

function pickByRarity(item, values) {
  return values[item.rarity] || values.common;
}

function resolveStoreEffect(item) {
  if (item.effect_value) return item.effect_value;
  const effectType = inferEffectType(item);
  const text = `${item.name || ""} ${item.description || ""} ${item.preview_url || ""}`.toLowerCase();
  if (effectType === "name_color") {
    const hex = String(item.preview_url || "").match(/^#[0-9a-f]{6}$/i)?.[0];
    if (hex) return hex;
    if (/gold|золот|amber|sun/.test(text)) return "#fbbf24";
    if (/cyan|blue|ocean|неон|голуб/.test(text)) return "#22d3ee";
    if (/pink|rose|sakura|роз/.test(text)) return "#ec4899";
    if (/green|emerald|лес|зел/.test(text)) return "#34d399";
    return pickByRarity(item, { common: "#ffffff", rare: "#22d3ee", epic: "#a855f7", legendary: "#fbbf24" });
  }
  if (effectType === "avatar_frame") {
    if (/rainbow|радуг/.test(text)) return "rainbow";
    if (/dual|2|две|sakura|pink/.test(text)) return "dual:#a855f7:#ec4899";
    if (/gold|золот|premium|прем/.test(text)) return "premium";
    return "gradient";
  }
  if (effectType === "glow_effect") {
    if (/gold|золот|sun/.test(text)) return "gold";
    if (/cyan|blue|ocean|голуб/.test(text)) return "cyan";
    if (/pink|rose|sakura|роз/.test(text)) return "pink";
    return "purple";
  }
  if (effectType === "profile_background") return item.preview_url;
  if (effectType === "theme") return item.effect_value || item.id;
  if (effectType === "accent") return item.effect_value || item.id;
  if (effectType === "nft") return item.effect_value || item.preview_url || item.id;
  return item.id;
}

function profilePatchForItem(item) {
  const effect = resolveStoreEffect(item);
  const effectType = inferEffectType(item);
  if (effectType === "name_color") return { name_color: effect, name_color_id: item.id };
  if (effectType === "avatar_frame") return { avatar_frame: effect };
  if (effectType === "glow_effect") return { glow_effect: effect };
  // Themes, profile backgrounds, badges, stickers and NFTs are activated through user_items.applied.
  return {};
}

async function pushStoreNotification(req, userId, title, body) {
  try {
    const { data } = await supabase.from("notifications").insert({ user_id: userId, type: "store", title, body, read: false }).select("*").single();
    req.app.get("io")?.to(`user:${userId}`).emit("notification:new", {
      id: data.id,
      type: data.type,
      title: data.title,
      body: data.body || "",
      avatarUrl: data.avatar_url || null,
      read: data.read || false,
      createdAt: data.created_at,
    });
  } catch { /* optional */ }
}

async function nextItemSerial(itemId) {
  const { count } = await safe(
    supabase
      .from("user_items")
      .select("*", { count: "exact", head: true })
      .eq("item_id", itemId)
      .not("serial_number", "is", null),
    { count: 0, data: null, error: null },
  );
  return (count || 0) + 1;
}

async function grantUserItem(userId, item) {
  const payload = {
    user_id: userId,
    item_id: item.id,
    applied: false,
    level: 1,
    serial_number: null,
    nft_metadata: {},
    upgraded_at: null,
  };
  let result = await safe(
    supabase.from("user_items").upsert(payload, { onConflict: "user_id,item_id" }),
    { error: null },
  );
  if (result.error && /applied|level|serial_number|nft_metadata|upgraded_at|schema cache/i.test(result.error.message || "")) {
    result = await safe(
      supabase.from("user_items").upsert({ user_id: userId, item_id: item.id, applied: false }, { onConflict: "user_id,item_id" }),
      { error: null },
    );
  }
  return result;
}

function nftUpgradeCost(item) {
  const payload = parseEffectPayload(item);
  const explicit = Number(
    payload.upgradePriceCoins
      ?? payload.upgrade_price_coins
      ?? payload.upgradeCost
      ?? payload.upgrade_cost
      ?? payload.upgradeCostBase,
  );
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  return Math.max(100, Math.ceil((Number(item.price_coins) || 400) * 0.25));
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function normalizeModelEntry(entry, fallbackName) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const raw = entry.trim();
    if (!raw) return null;
    const parts = raw.includes("|") ? raw.split("|").map((x) => x.trim()).filter(Boolean) : [];
    const url = parts.length >= 2 ? parts[parts.length - 1] : raw;
    const name = parts.length >= 2 ? parts.slice(0, -1).join(" ") : fallbackName;
    return { name: name || fallbackName, url };
  }
  if (typeof entry === "object") {
    const url = entry.url || entry.modelUrl || entry.model_url || entry.previewUrl || entry.preview_url;
    if (!url) return null;
    return { name: entry.name || entry.title || fallbackName, url };
  }
  return null;
}

function nftModelsForItem(item) {
  const payload = parseEffectPayload(item);
  const source = payload.nftModels || payload.nft_models || payload.models || payload.modelUrls || payload.model_urls || payload.upgradeModels || [];
  const list = (Array.isArray(source) ? source : String(source || "").split(/[\n,]+/))
    .map((entry) => normalizeModelEntry(entry, item.name))
    .filter(Boolean);
  if (list.length > 0) return list;
  return [{ name: `${item.name} · awakened`, url: item.effect_value || item.preview_url }];
}

const NAMED_NFT_COLORS = {
  purple: ["#a855f7", "Фиолетовый"], violet: ["#8b5cf6", "Violet"], pink: ["#ec4899", "Pink"], rose: ["#fb7185", "Rose"],
  cyan: ["#22d3ee", "Cyan"], blue: ["#60a5fa", "Blue"], ocean: ["#0ea5e9", "Ocean"], gold: ["#fbbf24", "Gold"],
  amber: ["#f59e0b", "Amber"], green: ["#34d399", "Emerald"], emerald: ["#34d399", "Emerald"], red: ["#ef4444", "Red"],
  crimson: ["#dc2626", "Crimson"], black: ["#020617", "Obsidian"], white: ["#f8fafc", "White"], orange: ["#f97316", "Orange"],
  fire: ["#fb7185", "Fire"], ice: ["#67e8f9", "Ice"], фиолетовый: ["#a855f7", "Фиолетовый"], фиолет: ["#a855f7", "Фиолетовый"],
  розовый: ["#ec4899", "Розовый"], циан: ["#22d3ee", "Циан"], голубой: ["#22d3ee", "Голубой"], синий: ["#60a5fa", "Синий"],
  золото: ["#fbbf24", "Золото"], золотой: ["#fbbf24", "Золото"], изумруд: ["#34d399", "Изумруд"], зеленый: ["#34d399", "Зелёный"], зелёный: ["#34d399", "Зелёный"],
  красный: ["#ef4444", "Красный"], черный: ["#020617", "Чёрный"], чёрный: ["#020617", "Чёрный"], белый: ["#f8fafc", "Белый"], оранжевый: ["#f97316", "Оранжевый"],
  огонь: ["#fb7185", "Огонь"], огненный: ["#fb7185", "Огненный"], лед: ["#67e8f9", "Лёд"], лёд: ["#67e8f9", "Лёд"],
};

function colorFromToken(token, seed = 0) {
  if (token && typeof token === "object") {
    const color = token.color || token.hex || token.value;
    const name = token.name || token.label || color;
    return colorFromToken(`${name}|${color}`, seed);
  }
  const raw = String(token || "").trim();
  const parts = raw.includes("|") ? raw.split("|").map((x) => x.trim()).filter(Boolean) : [];
  const value = parts.length >= 2 ? parts[parts.length - 1] : raw;
  const label = parts.length >= 2 ? parts.slice(0, -1).join(" ") : raw;
  const hex = String(value).match(/#[0-9a-f]{6}/i)?.[0];
  if (hex) return { hex, label: label && label !== value ? label : hex };
  const key = value.toLowerCase().replace(/ё/g, "е");
  const named = NAMED_NFT_COLORS[key] || NAMED_NFT_COLORS[label.toLowerCase().replace(/ё/g, "е")];
  if (named) return { hex: named[0], label: label && label !== value ? label : named[1] };
  const palette = ["#a855f7", "#ec4899", "#22d3ee", "#fbbf24", "#34d399", "#fb7185", "#60a5fa", "#f97316"];
  return { hex: palette[seed % palette.length], label: raw || "Neon" };
}

function nftColorTokensForItem(item) {
  const payload = parseEffectPayload(item);
  const source = payload.nftColors || payload.nft_colors || payload.backgroundColors || payload.background_colors || payload.colors || payload.colorNames;
  if (Array.isArray(source)) return source.length ? source : ["Фиолетовый", "Циан", "Золото"];
  if (typeof source === "string" && source.trim()) return source.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  return item.rarity === "legendary"
    ? ["Золото", "Фиолетовый", "Циан", "Розовый"]
    : item.rarity === "epic"
      ? ["Фиолетовый", "Розовый", "Циан"]
      : ["Фиолетовый", "Циан", "Синий", "Изумруд"];
}

function createNftRevealMetadata(item, serialNumber, userId) {
  const seed = hashString(`${item.id}:${serialNumber}:${userId}`);
  const models = nftModelsForItem(item);
  const model = models[seed % models.length] || models[0];
  const colorTokens = nftColorTokensForItem(item);
  const primary = colorFromToken(colorTokens[seed % colorTokens.length], seed);
  const secondary = colorFromToken(colorTokens[(seed * 7 + 3) % colorTokens.length], seed + 3);
  const second = secondary.hex.toLowerCase() === primary.hex.toLowerCase()
    ? colorFromToken(colorTokens[(seed + 1) % colorTokens.length] || "Gold", seed + 1)
    : secondary;
  const payload = parseEffectPayload(item);
  const auraBonus = Number(payload.upgradedAuraBonus ?? payload.auraBonusUpgraded ?? payload.auraBonus ?? 12) || 12;
  return {
    schema: "nightgram.nft.v1",
    upgraded: true,
    serialNumber,
    modelName: model.name || item.name,
    modelUrl: model.url || item.preview_url,
    colorName: `${primary.label} / ${second.label}`,
    colors: [primary.hex, second.hex],
    backgroundCss: `radial-gradient(circle at 18% 18%, ${primary.hex}66, transparent 34%), radial-gradient(circle at 84% 74%, ${second.hex}66, transparent 38%), linear-gradient(135deg, #030712 0%, ${primary.hex}44 44%, ${second.hex}44 100%)`,
    auraBonus,
    revealSeed: seed,
    variantId: `${item.id}-${serialNumber}`,
    revealedAt: new Date().toISOString(),
  };
}

function camelUserPatch(patch) {
  const out = {};
  if (patch.name_color !== undefined) out.nameColor = patch.name_color;
  if (patch.name_color_id !== undefined) out.nameColorId = patch.name_color_id;
  if (patch.avatar_frame !== undefined) out.avatarFrame = patch.avatar_frame;
  if (patch.glow_effect !== undefined) out.glowEffect = patch.glow_effect;
  return out;
}

// GET /api/store/items
router.get("/items", async (req, res) => {
  const { data: items, error } = await supabase.from("store_items").select("*");
  if (error) return res.status(500).json({ error: error.message });

  let ownedResult = await safe(
    supabase
      .from("user_items")
      .select("item_id,applied,level,serial_number,nft_metadata,upgraded_at")
      .eq("user_id", req.userId),
    { data: [], error: null },
  );
  if (ownedResult.error && /applied|level|serial_number|nft_metadata|upgraded_at|schema cache/i.test(ownedResult.error.message || "")) {
    ownedResult = await safe(
      supabase
        .from("user_items")
        .select("item_id")
        .eq("user_id", req.userId),
      { data: [], error: null },
    );
  }
  const ownedMap = new Map((ownedResult.data || []).map((o) => [o.item_id, o]));

  res.json((items || []).map((i) => {
    const meta = ownedMap.get(i.id);
    return serializeItem(i, Boolean(meta), Boolean(meta?.applied), meta || {});
  }));
});

// GET /api/store/owned?username= — owned store items for current/profile user
router.get("/owned", async (req, res) => {
  let userId = req.userId;
  if (req.query.username) {
    let targetResult = await safe(
      supabase
        .from("users")
        .select("id,hide_purchases")
        .eq("username", String(req.query.username))
        .maybeSingle(),
      { data: null, error: null },
    );
    if (targetResult.error && /hide_purchases|schema cache/i.test(targetResult.error.message || "")) {
      targetResult = await safe(
        supabase
          .from("users")
          .select("id")
          .eq("username", String(req.query.username))
          .maybeSingle(),
        { data: null, error: null },
      );
    }
    const target = targetResult.data;
    if (!target) return res.json([]);
    if (target.hide_purchases && target.id !== req.userId) return res.json([]);
    userId = target.id;
  }

  let result = await safe(
    supabase
      .from("user_items")
      .select("applied,level,serial_number,nft_metadata,upgraded_at,store_items(*)")
      .eq("user_id", userId)
      .order("purchased_at", { ascending: false }),
    { data: [], error: null },
  );
  if (result.error && /applied|level|serial_number|nft_metadata|upgraded_at|schema cache/i.test(result.error.message || "")) {
    result = await safe(
      supabase
        .from("user_items")
        .select("store_items(*)")
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false }),
      { data: [], error: null },
    );
  }

  res.json((result.data || []).map((row) => {
    const i = row.store_items;
    if (!i) return null;
    return serializeItem(i, true, Boolean(row.applied), row);
  }).filter(Boolean));
});

// POST /api/store/items/:id/buy  (NightCoins)
router.post("/items/:id/buy", async (req, res) => {
  const { id } = req.params;
  const { data: item } = await supabase.from("store_items").select("*").eq("id", id).single();
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (!item.price_coins || item.price_coins <= 0) {
    return res.status(400).json({ error: "This item is not available for NightCoins" });
  }
  const now = Date.now();
  if (item.drop_starts_at && new Date(item.drop_starts_at).getTime() > now) {
    return res.status(403).json({ error: "Drop ещё не начался" });
  }
  if (item.drop_ends_at && new Date(item.drop_ends_at).getTime() < now) {
    return res.status(410).json({ error: "Drop уже завершён" });
  }
  if (item.stock_total !== null && item.stock_total !== undefined && (item.stock_sold ?? 0) >= item.stock_total) {
    return res.status(409).json({ error: "Тираж распродан" });
  }

  const [{ data: user }, { data: owned }] = await Promise.all([
    supabase.from("users").select("night_coins").eq("id", req.userId).single(),
    supabase
      .from("user_items")
      .select("item_id")
      .eq("user_id", req.userId)
      .eq("item_id", id)
      .maybeSingle(),
  ]);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (owned) return res.json({ balance: user.night_coins ?? 0, owned: true });

  if ((user.night_coins ?? 0) < item.price_coins) {
    return res.status(402).json({ error: "Not enough NightCoins" });
  }

  // Atomic-ish debit + grant + ledger (use an RPC/transaction in production).
  const newBalance = (user.night_coins ?? 0) - item.price_coins;
  const { error: debitError } = await supabase
    .from("users")
    .update({ night_coins: newBalance })
    .eq("id", req.userId);
  if (debitError) return res.status(500).json({ error: debitError.message });

  const grantResult = await grantUserItem(req.userId, item);
  if (grantResult.error) return res.status(500).json({ error: grantResult.error.message });

  await supabase.from("coin_transactions").insert({
    user_id: req.userId,
    delta: -item.price_coins,
    reason: "purchase",
    reference_id: id,
  });
  if (item.stock_total !== null && item.stock_total !== undefined) {
    await supabase.from("store_items").update({ stock_sold: (item.stock_sold ?? 0) + 1 }).eq("id", id);
  }

  req.app.get("io")?.to(`user:${req.userId}`).emit("coins:update", newBalance);
  res.json({ balance: newBalance, owned: true });
});

// POST /api/store/items/:id/gift  (NightCoins gift to another user)
router.post("/items/:id/gift", async (req, res) => {
  const { id } = req.params;
  const { recipientId, message } = req.body;
  if (!recipientId || recipientId === req.userId) return res.status(400).json({ error: "Выбери другого получателя" });

  const [{ data: item }, { data: buyer }, { data: recipient }] = await Promise.all([
    supabase.from("store_items").select("*").eq("id", id).single(),
    supabase.from("users").select("night_coins,username").eq("id", req.userId).single(),
    supabase.from("users").select("id,username,display_name,avatar_url,ng_id").eq("id", recipientId).maybeSingle(),
  ]);
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (!recipient) return res.status(404).json({ error: "Получатель не найден" });
  if (!item.price_coins || item.price_coins <= 0) return res.status(400).json({ error: "Этот товар нельзя подарить за NightCoins" });

  const now = Date.now();
  if (item.drop_starts_at && new Date(item.drop_starts_at).getTime() > now) return res.status(403).json({ error: "Drop ещё не начался" });
  if (item.drop_ends_at && new Date(item.drop_ends_at).getTime() < now) return res.status(410).json({ error: "Drop уже завершён" });
  if (item.stock_total !== null && item.stock_total !== undefined && (item.stock_sold ?? 0) >= item.stock_total) return res.status(409).json({ error: "Тираж распродан" });

  const { data: alreadyOwned } = await supabase
    .from("user_items")
    .select("item_id")
    .eq("user_id", recipientId)
    .eq("item_id", id)
    .maybeSingle();
  if (alreadyOwned) return res.status(409).json({ error: "У получателя уже есть этот товар" });

  if ((buyer?.night_coins ?? 0) < item.price_coins) return res.status(402).json({ error: "Not enough NightCoins" });
  const newBalance = (buyer?.night_coins ?? 0) - item.price_coins;
  const { error: debitError } = await supabase.from("users").update({ night_coins: newBalance }).eq("id", req.userId);
  if (debitError) return res.status(500).json({ error: debitError.message });

  const grantResult = await grantUserItem(recipientId, item);
  if (grantResult.error) return res.status(500).json({ error: grantResult.error.message });

  await safe(supabase.from("coin_transactions").insert([
    { user_id: req.userId, delta: -item.price_coins, reason: "gift_sent", reference_id: id },
    { user_id: recipientId, delta: 0, reason: "gift_item", reference_id: id },
  ]));
  await safe(supabase.from("user_gifts").insert({
    sender_id: req.userId,
    recipient_id: recipientId,
    item_id: id,
    gift_type: "store_item",
    title: item.name,
    message: String(message || "").trim().slice(0, 160) || null,
  }), { data: null, error: null });
  if (item.stock_total !== null && item.stock_total !== undefined) await supabase.from("store_items").update({ stock_sold: (item.stock_sold ?? 0) + 1 }).eq("id", id);

  req.app.get("io")?.to(`user:${req.userId}`).emit("coins:update", newBalance);
  await pushStoreNotification(req, recipientId, "Вам подарили товар", `@${buyer?.username || "user"} подарил «${item.name}»`);
  await pushStoreNotification(req, req.userId, "Подарок отправлен", `Товар «${item.name}» отправлен @${recipient.username}`);
  res.json({ ok: true, balance: newBalance, recipient });
});

// POST /api/store/items/:id/apply — apply owned cosmetic item to profile/app state
router.post("/items/:id/apply", async (req, res) => {
  const { id } = req.params;
  const { data: item } = await safe(
    supabase.from("store_items").select("*").eq("id", id).maybeSingle(),
    { data: null, error: null },
  );
  if (!item) return res.status(404).json({ error: "Item not found" });

  let ownedResult = await safe(
    supabase.from("user_items").select("item_id,level,serial_number,nft_metadata,upgraded_at").eq("user_id", req.userId).eq("item_id", id).maybeSingle(),
    { data: null, error: null },
  );
  if (ownedResult.error && /level|serial_number|nft_metadata|upgraded_at|schema cache/i.test(ownedResult.error.message || "")) {
    ownedResult = await safe(
      supabase.from("user_items").select("item_id").eq("user_id", req.userId).eq("item_id", id).maybeSingle(),
      { data: null, error: null },
    );
  }
  const owned = ownedResult.data;
  if (!owned) return res.status(403).json({ error: "Сначала купи этот предмет" });
  if (isNftItem(item) && !isOwnedNftUpgraded(owned)) {
    return res.status(403).json({ error: "Сначала улучши NFT — фон, serial # и моделька открываются после улучшения" });
  }

  const effectType = inferEffectType(item);
  const exclusiveEffectTypes = effectType === "nft" || effectType === "profile_background" ? ["nft", "profile_background"] : [effectType];
  let relatedItems = await safe(
    exclusiveEffectTypes.includes("nft")
      ? supabase.from("store_items").select("id,effect_type,category")
      : supabase.from("store_items").select("id,effect_type,category").in("effect_type", exclusiveEffectTypes),
    { data: [], error: null },
  );
  if (relatedItems.error && /effect_type|schema cache/i.test(relatedItems.error.message || "")) {
    relatedItems = await safe(
      supabase.from("store_items").select("id,category").eq("category", item.category),
      { data: [], error: null },
    );
  }
  const categoryItemIds = (relatedItems.data || [])
    .filter((row) => exclusiveEffectTypes.includes(row.effect_type || row.category) || (exclusiveEffectTypes.includes("nft") && row.category === "nft"))
    .map((row) => row.id)
    .filter(Boolean);
  if (categoryItemIds.length > 0) {
    const sameCategory = await safe(
      supabase
        .from("user_items")
        .update({ applied: false })
        .eq("user_id", req.userId)
        .in("item_id", categoryItemIds),
      { data: null, error: null },
    );
    if (sameCategory.error && /applied|schema cache|failed to parse/i.test(sameCategory.error.message || "")) {
      return res.status(503).json({ error: "Run store applied migration", detail: sameCategory.error.message });
    }
  }

  const applyResult = await safe(
    supabase.from("user_items").update({ applied: true, applied_at: new Date().toISOString() }).eq("user_id", req.userId).eq("item_id", id),
    { data: null, error: null },
  );
  if (applyResult.error) return res.status(503).json({ error: "Run store applied migration", detail: applyResult.error.message });

  const profilePatch = profilePatchForItem(item);
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await safe(supabase.from("users").update(profilePatch).eq("id", req.userId), { error: null });
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, applied: true, item: serializeItem(item, true, true, owned), userPatch: camelUserPatch(profilePatch), effect: resolveStoreEffect(item) });
});

// POST /api/store/items/:id/unapply — remove active cosmetic from profile/app state
router.post("/items/:id/unapply", async (req, res) => {
  const { id } = req.params;
  const { data: item } = await safe(supabase.from("store_items").select("*").eq("id", id).maybeSingle(), { data: null, error: null });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const result = await safe(
    supabase.from("user_items").update({ applied: false, applied_at: null }).eq("user_id", req.userId).eq("item_id", id),
    { data: null, error: null },
  );
  if (result.error) return res.status(503).json({ error: "Run store applied migration", detail: result.error.message });

  const effectType = inferEffectType(item);
  const resetPatch = effectType === "name_color"
    ? { name_color: "#ffffff", name_color_id: "light" }
    : effectType === "avatar_frame"
      ? { avatar_frame: null }
      : effectType === "glow_effect"
        ? { glow_effect: null }
        : {};
  if (Object.keys(resetPatch).length > 0) await safe(supabase.from("users").update(resetPatch).eq("id", req.userId));
  res.json({ ok: true, applied: false, userPatch: camelUserPatch(resetPatch) });
});

// POST /api/store/items/:id/upgrade — one-time NFT awakening/reveal
router.post("/items/:id/upgrade", async (req, res) => {
  const { id } = req.params;
  const [{ data: item }, ownedResult, { data: user }] = await Promise.all([
    safe(supabase.from("store_items").select("*").eq("id", id).maybeSingle(), { data: null, error: null }),
    safe(
      supabase.from("user_items").select("applied,level,serial_number,nft_metadata,upgraded_at").eq("user_id", req.userId).eq("item_id", id).maybeSingle(),
      { data: null, error: null },
    ),
    safe(supabase.from("users").select("night_coins").eq("id", req.userId).single(), { data: null, error: null }),
  ]);

  if (!item) return res.status(404).json({ error: "NFT не найден" });
  if (!isNftItem(item)) return res.status(400).json({ error: "Улучшать можно только NFT" });
  if (ownedResult.error && /level|serial_number|nft_metadata|upgraded_at|schema cache/i.test(ownedResult.error.message || "")) {
    return res.status(503).json({ error: "Run one-time NFT upgrade migration", detail: ownedResult.error.message });
  }
  const owned = ownedResult.data;
  if (!owned) return res.status(403).json({ error: "Сначала купи этот NFT" });
  if (!item.upgradeable) return res.status(403).json({ error: "Админ отключил улучшение для этого NFT" });
  if (isOwnedNftUpgraded(owned)) return res.status(409).json({ error: "NFT уже улучшен. Улучшение доступно только один раз" });

  const cost = nftUpgradeCost(item);
  if ((user?.night_coins ?? 0) < cost) return res.status(402).json({ error: "Недостаточно NightCoins для улучшения" });

  const now = new Date().toISOString();
  let serialNumber = await nextItemSerial(id);
  let metadata = createNftRevealMetadata(item, serialNumber, req.userId);
  let update = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      serialNumber += 1;
      metadata = createNftRevealMetadata(item, serialNumber, req.userId);
    }
    update = await safe(
      supabase
        .from("user_items")
        .update({ level: 2, serial_number: serialNumber, nft_metadata: metadata, upgraded_at: now })
        .eq("user_id", req.userId)
        .eq("item_id", id)
        .select("applied,level,serial_number,nft_metadata,upgraded_at")
        .single(),
      { data: null, error: null },
    );
    if (!update.error || !/duplicate|unique/i.test(update.error.message || "")) break;
  }
  if (update?.error && /level|serial_number|nft_metadata|upgraded_at|schema cache/i.test(update.error.message || "")) {
    return res.status(503).json({ error: "Run one-time NFT upgrade migration", detail: update.error.message });
  }
  if (update?.error) return res.status(500).json({ error: update.error.message });

  const balance = (user?.night_coins ?? 0) - cost;
  const debit = await safe(supabase.from("users").update({ night_coins: balance }).eq("id", req.userId), { error: null });
  if (debit.error) {
    await safe(
      supabase
        .from("user_items")
        .update({ level: 1, serial_number: null, nft_metadata: {}, upgraded_at: null })
        .eq("user_id", req.userId)
        .eq("item_id", id),
    );
    return res.status(500).json({ error: debit.error.message });
  }

  await safe(supabase.from("coin_transactions").insert({ user_id: req.userId, delta: -cost, reason: "nft_reveal_upgrade", reference_id: id }));
  req.app.get("io")?.to(`user:${req.userId}`).emit("coins:update", balance);
  await pushStoreNotification(req, req.userId, "NFT пробуждён", `«${item.name}» получил serial #${String(serialNumber).padStart(4, "0")}, фон и уникальную модельку.`);

  res.json({
    ok: true,
    balance,
    level: 2,
    serialNumber,
    nftMetadata: metadata,
    upgradedAt: now,
    cost,
    item: serializeItem(item, true, Boolean(update.data?.applied), update.data || { level: 2, serial_number: serialNumber, nft_metadata: metadata, upgraded_at: now }),
  });
});

// GET /api/store/transactions — current user's NightCoins ledger
router.get("/transactions", async (req, res) => {
  const { data, error } = await safe(
    supabase
      .from("coin_transactions")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(80),
    { data: [], error: null },
  );
  if (error) return res.json([]);
  res.json((data || []).map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    referenceId: row.reference_id,
    createdAt: row.created_at,
  })));
});

// POST /api/store/items/:id/checkout  (Stripe — real money items)
router.post("/items/:id/checkout", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
  const { id } = req.params;
  const { data: item } = await supabase.from("store_items").select("*").eq("id", id).single();
  if (!item || !item.stripe_price_id) return res.status(400).json({ error: "Not a Stripe item" });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: item.stripe_price_id, quantity: 1 }],
    success_url: `${process.env.APP_WEBHOOK_RETURN_URL}?purchased=${id}`,
    cancel_url: `${process.env.APP_WEBHOOK_RETURN_URL}?canceled=1`,
    metadata: { userId: req.userId, itemId: id, kind: "store_item" },
  });
  res.json({ url: session.url });
});

module.exports = { storeRouter: router };
