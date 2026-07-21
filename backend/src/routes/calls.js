const express = require('express');
const crypto = require('node:crypto');
const { supabase } = require('../lib/supabase');

const callsRouter = express.Router();

function csv(value, fallback = []) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function positiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function turnCredentials(userId) {
  const urls = csv(process.env.TURN_URLS || process.env.TURN_URL);
  if (!urls.length) return null;

  const sharedSecret = String(process.env.TURN_SHARED_SECRET || '').trim();
  if (sharedSecret) {
    const ttlSeconds = positiveInt(process.env.TURN_TTL_SECONDS, 3600, 300, 86_400);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiresAt}:${String(userId || 'nightgram').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)}`;
    const credential = crypto.createHmac('sha1', sharedSecret).update(username).digest('base64');
    return { urls, username, credential, expiresAt };
  }

  const username = String(process.env.TURN_USERNAME || '').trim();
  const credential = String(process.env.TURN_CREDENTIAL || '').trim();
  if (username && credential) return { urls, username, credential, expiresAt: null };
  return { urls, expiresAt: null };
}

callsRouter.get('/ice-config', (req, res) => {
  const stunUrls = csv(process.env.STUN_URLS, [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ]);
  const iceServers = [];
  if (stunUrls.length) iceServers.push({ urls: stunUrls });

  const turn = turnCredentials(req.userId);
  if (turn) {
    iceServers.push({
      urls: turn.urls,
      ...(turn.username && turn.credential ? { username: turn.username, credential: turn.credential } : {}),
    });
  }

  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    iceServers,
    turnEnabled: Boolean(turn),
    expiresAt: turn?.expiresAt ? new Date(turn.expiresAt * 1000).toISOString() : null,
  });
});

callsRouter.get('/history', async (req, res) => {
  const limit = positiveInt(req.query.limit, 50, 1, 100);
  try {
    const { data, error } = await supabase
      .from('call_history')
      .select('*')
      .eq('user_id', req.userId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (/call_history|schema cache|does not exist/i.test(error.message || '')) return res.json([]);
      throw error;
    }
    return res.json(data || []);
  } catch (error) {
    console.error('[Calls] history', error?.message || error);
    return res.status(500).json({ error: 'Не удалось загрузить историю звонков' });
  }
});

callsRouter.get('/pending', async (req, res) => {
  try {
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('call_history')
      .select('*')
      .eq('user_id', req.userId)
      .eq('direction', 'incoming')
      .eq('status', 'ringing')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (/call_history|schema cache|does not exist|multiple rows/i.test(error.message || '')) return res.json(null);
      throw error;
    }
    return res.json(data || null);
  } catch (error) {
    console.error('[Calls] pending', error?.message || error);
    return res.json(null);
  }
});

module.exports = callsRouter;
module.exports._internals = { csv, positiveInt, turnCredentials };
