// Support routes — user tickets without admin role requirements
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

async function safe(promise, fallback = { data: [], error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

router.get("/tickets", async (req, res) => {
  const { data, error } = await safe(
    supabase
      .from("tickets")
      .select("*")
      .eq("author_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(50),
  );
  if (error) return res.status(503).json({ error: "Tickets table unavailable", detail: error.message });
  res.json(data || []);
});

router.post("/tickets", async (req, res) => {
  const { subject, body, category } = req.body;
  if (!subject || !String(subject).trim()) return res.status(400).json({ error: "Укажите тему" });

  const { data: user } = await safe(
    supabase.from("users").select("username").eq("id", req.userId).single(),
    { data: null, error: null },
  );

  const { data, error } = await safe(
    supabase.from("tickets").insert({
      subject: String(subject).trim(),
      body: String(body || ""),
      category: String(category || "Вопрос"),
      status: "open",
      author_id: req.userId,
      author_name: user?.username || req.username || "Аноним",
      priority: "low",
    }).select("*").single(),
    { data: null, error: null },
  );
  if (error) return res.status(503).json({ error: "Tickets table unavailable", detail: error.message });
  res.status(201).json(data);
});


router.get("/tickets/:id/messages", async (req, res) => {
  const { data: ticket } = await safe(
    supabase.from("tickets").select("author_id").eq("id", req.params.id).maybeSingle(),
    { data: null, error: null },
  );
  if (!ticket || ticket.author_id !== req.userId) return res.status(403).json({ error: "No access" });
  const { data, error } = await safe(
    supabase.from("ticket_messages").select("*").eq("ticket_id", req.params.id).order("created_at", { ascending: true }),
  );
  if (error) return res.status(503).json({ error: "Ticket replies unavailable", detail: error.message });
  res.json(data || []);
});

router.post("/tickets/:id/messages", async (req, res) => {
  const { text } = req.body;
  if (!text || !String(text).trim()) return res.status(400).json({ error: "Empty reply" });
  const { data: ticket } = await safe(
    supabase.from("tickets").select("author_id").eq("id", req.params.id).maybeSingle(),
    { data: null, error: null },
  );
  if (!ticket || ticket.author_id !== req.userId) return res.status(403).json({ error: "No access" });
  const { data, error } = await safe(
    supabase.from("ticket_messages").insert({ ticket_id: req.params.id, author_id: req.userId, author_role: "user", text: String(text).trim() }).select("*").single(),
    { data: null, error: null },
  );
  if (error) return res.status(503).json({ error: "Ticket replies unavailable", detail: error.message });
  res.status(201).json(data);
});

module.exports = router;
