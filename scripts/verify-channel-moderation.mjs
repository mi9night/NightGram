import fs from "node:fs";

const required = {
  "backend/src/routes/channels.js": [
    "canModerateChannel",
    "getActiveChannelBan",
    'router.get("/:id/bans"',
    'router.post("/:id/bans"',
    'router.delete("/:id/bans/:userId"',
    'router.get("/:id/moderation-log"',
    "comments_enabled",
    "comment_slow_mode_seconds",
    "channel:banned",
  ],
  "backend/src/routes/posts.js": [
    "getChannelPostContext",
    "canModerateChannelPost",
    "Комментарии в канале отключены",
    "channel:comment:",
    "delete_comment",
  ],
  "src/app/(app)/channels/[handle]/page.tsx": [
    "ChannelModerationModal",
    "Комментарии под постами",
    "Медленный режим комментариев",
    "banChannelSubscriber",
    "getChannelModerationLog",
  ],
  "src/components/feed/CommentSheet.tsx": ["canModerate", "commentsEnabled"],
  "src/lib/api.ts": ["getChannelBans", "banChannelSubscriber", "unbanChannelSubscriber", "getChannelModerationLog"],
  "supabase/migration_channel_moderation.sql": ["channel_bans", "channel_moderation_log", "comments_enabled", "comment_slow_mode_seconds"],
};

for (const [file, needles] of Object.entries(required)) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const source = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${file}: missing ${needle}`);
  }
}

console.log("[OK] Channel moderation configuration verified.");
