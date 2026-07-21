const { supabase } = require("./supabase");

function extractMentionUsernames(text) {
  const source = typeof text === "string" ? text : "";
  const matches = source.matchAll(/(^|[^\p{L}\p{N}_])@([a-zA-Z0-9_]{3,32})/gu);
  return [...new Set(Array.from(matches, (match) => String(match[2] || "").toLowerCase()).filter(Boolean))];
}

function serializePoll(poll, options, votes, viewerId) {
  const votesByOption = new Map();
  const allVoters = new Set();
  for (const vote of votes || []) {
    const optionId = String(vote.option_id);
    const userId = String(vote.user_id);
    if (!votesByOption.has(optionId)) votesByOption.set(optionId, []);
    votesByOption.get(optionId).push(userId);
    allVoters.add(userId);
  }
  const anonymous = Boolean(poll.anonymous);
  const myOptionIds = (votes || [])
    .filter((vote) => String(vote.user_id) === String(viewerId || ""))
    .map((vote) => String(vote.option_id));
  return {
    id: String(poll.id),
    question: String(poll.question || "Опрос"),
    allowMultiple: Boolean(poll.allow_multiple),
    anonymous,
    closedAt: poll.closed_at || null,
    totalVotes: allVoters.size,
    myOptionIds,
    options: (options || [])
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
      .map((option) => {
        const voterIds = votesByOption.get(String(option.id)) || [];
        return {
          id: String(option.id),
          text: String(option.text || "Вариант"),
          position: Number(option.position || 0),
          votesCount: voterIds.length,
          ...(anonymous ? {} : { voterIds }),
        };
      }),
  };
}

async function getPollMap(messageIds, viewerId = null) {
  const ids = [...new Set((messageIds || []).map(String).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { data: polls, error } = await supabase
    .from("message_polls")
    .select("*")
    .in("message_id", ids);
  if (error || !polls?.length) return new Map();

  const pollIds = polls.map((poll) => poll.id);
  const [{ data: options }, { data: votes }] = await Promise.all([
    supabase.from("message_poll_options").select("*").in("poll_id", pollIds),
    supabase.from("message_poll_votes").select("poll_id,option_id,user_id").in("poll_id", pollIds),
  ]);

  const map = new Map();
  for (const poll of polls) {
    const pollOptions = (options || []).filter((option) => String(option.poll_id) === String(poll.id));
    const pollVotes = (votes || []).filter((vote) => String(vote.poll_id) === String(poll.id));
    map.set(String(poll.message_id), serializePoll(poll, pollOptions, pollVotes, viewerId));
  }
  return map;
}

async function syncMessageMentions({ messageId, conversationId, senderId, text, io }) {
  try {
    await supabase.from("message_mentions").delete().eq("message_id", messageId);
    const usernames = extractMentionUsernames(text);
    if (usernames.length === 0) return [];

    const [{ data: users }, { data: participants }, { data: sender }] = await Promise.all([
      supabase.from("users").select("id,username,display_name,avatar_url").in("username", usernames),
      supabase.from("conversation_participants").select("user_id").eq("conversation_id", conversationId),
      supabase.from("users").select("id,username,display_name,avatar_url").eq("id", senderId).maybeSingle(),
    ]);
    const participantIds = new Set((participants || []).map((item) => String(item.user_id)));
    const mentioned = (users || []).filter((target) => participantIds.has(String(target.id)) && String(target.id) !== String(senderId));
    if (mentioned.length === 0) return [];

    const rows = mentioned.map((target) => ({
      message_id: messageId,
      conversation_id: conversationId,
      user_id: target.id,
      sender_id: senderId,
    }));
    const inserted = await supabase.from("message_mentions").upsert(rows, { onConflict: "message_id,user_id" });
    if (inserted.error) return [];

    const actorName = sender?.display_name || sender?.username || "Пользователь";
    const preview = String(text || "").replace(/\s+/g, " ").slice(0, 180);
    for (const target of mentioned) {
      const notification = {
        user_id: target.id,
        type: "mention",
        title: `${actorName} упомянул вас`,
        body: preview,
        avatar_url: sender?.avatar_url || null,
        actor_id: senderId,
        action_type: `mention:${conversationId}:${messageId}`,
        read: false,
      };
      let createdResult = await supabase.from("notifications").insert(notification).select("*").maybeSingle();
      if (createdResult.error && /actor_id|action_type|schema cache|column/i.test(createdResult.error.message || "")) {
        const { actor_id: _actorId, action_type: _actionType, ...legacy } = notification;
        createdResult = await supabase.from("notifications").insert(legacy).select("*").maybeSingle();
      }
      const created = createdResult.data;
      if (created) {
        io?.to(`user:${target.id}`).emit("notification:new", created);
      }
      io?.to(`user:${target.id}`).emit("mention:new", { conversationId, messageId, senderId });
    }
    return mentioned.map((target) => String(target.id));
  } catch (error) {
    console.warn("[Mentions]", error?.message || error);
    return [];
  }
}

module.exports = {
  extractMentionUsernames,
  getPollMap,
  serializePoll,
  syncMessageMentions,
};
