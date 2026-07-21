import fs from "node:fs";

const required = {
  "src/components/messenger/ChatView.tsx": ["CreatePollModal", "PollCard", "mentionSuggestions", 'socket.on("poll:updated"'],
  "src/components/messenger/PollCard.tsx": ["Голосовать", "Завершить", "votesCount"],
  "src/components/messenger/CreatePollModal.tsx": ["Новый опрос", "Несколько ответов", "Анонимный опрос"],
  "src/components/messenger/ChatList.tsx": ['id: "mentions"', "mentionCount"],
  "src/lib/api.ts": ["createPoll", "votePoll", "closePoll"],
  "backend/src/routes/conversations.js": ["poll-vote", "poll-close", 'router.post("/:id/polls"'],
  "backend/src/socket.js": ["syncMessageMentions"],
  "backend/src/lib/pollsMentions.js": ["extractMentionUsernames", "message_mentions", "message_poll_votes", "mention:new"],
  "supabase/migration_polls_mentions.sql": ["message_polls", "message_poll_options", "message_poll_votes", "message_mentions"],
};

for (const [file, needles] of Object.entries(required)) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const source = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${file}: missing ${needle}`);
  }
}

console.log("[OK] Polls and mentions configuration verified.");
