// ProStack catalog checker. Runs on YOUR computer and talks ONLY to your local Hermes model.
// It re-reads each card's source page, asks Hermes what the page says, and files a proposal
// for staff to approve in the portal. It never changes the live catalog itself.
// No dependencies. Needs Node 18+.

import { gatewayChat, focus } from './gateway.mjs';
const env = process.env;
const GATEWAY_TOKEN = env.HERMES_GATEWAY_TOKEN || '';  // set this to use the HTTPS gateway (see README)
const SUPABASE_URL = env.PROSTACK_SUPABASE_URL || 'https://valsmxbitcghxfoxuedd.supabase.co';
const SUPABASE_KEY = env.PROSTACK_SUPABASE_KEY || 'sb_publishable_cfOSF0jfx8isyLq9ftTN9A_q9qLWsb2';
const STAFF_EMAIL = env.PROSTACK_STAFF_EMAIL;
const STAFF_PASSWORD = env.PROSTACK_STAFF_PASSWORD;
const HERMES_URL = (env.HERMES_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const HERMES_MODEL = env.HERMES_MODEL || 'hermes3';
const MAX_CARDS = Number(env.MAX_CARDS || 10);
const DRY_RUN = env.DRY_RUN === '1';

// "Hermes only": refuse to send anything to a model that is not on your own computer or home/office network.
// Allowed: localhost, private network addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x), Tailscale (100.64-127.x.x) and .local names.
function isPrivateHost(h) {
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(h)) return true;
  if (/\.local$/i.test(h) || /^[a-z0-9-]+$/i.test(h) && !/^\d+(\.\d+){3}$/.test(h) && !h.includes('.')) return true; // bare machine name like ALIENWARE
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}
function assertLocal(u) {
  const h = new URL(u).hostname;
  if (!isPrivateHost(h)) {
    console.error('Refusing to run: HERMES_URL must be on this computer or your own network (192.168.x.x, 10.x.x.x, localhost, or a machine name). Got ' + h);
    process.exit(1);
  }
}
assertLocal(HERMES_URL);
if (!STAFF_EMAIL || !STAFF_PASSWORD) {
  console.error('Set PROSTACK_STAFF_EMAIL and PROSTACK_STAFF_PASSWORD (a staff login) before running. See README.');
  process.exit(1);
}

async function j(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }

async function signIn() {
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD })
  });
  const d = await j(r);
  if (!r.ok) throw new Error('Sign-in failed: ' + (d.msg || d.error_description || r.status));
  return d.access_token;
}

function rest(token) {
  const h = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  return async (path, opts = {}) => {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
    const d = await j(r);
    if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + JSON.stringify(d));
    return d;
  };
}

function pageText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

const FIELDS = ['annual_fee', 'intro_months', 'apr_low', 'apr_high', 'apr_text', 'rewards', 'welcome_bonus'];

async function askHermes(card, text) {
  const current = Object.fromEntries(FIELDS.map(f => [f, card[f]]));
  const prompt = 'You check credit card terms against a web page. Card: ' + card.issuer + ' ' + card.name + '.\n' +
    'Current record: ' + JSON.stringify(current) + '\n' +
    'Page text (may be partial):\n' + (GATEWAY_TOKEN ? focus(text, /annual fee|intro|apr|0%|bonus|earn|\$\d|\d%/i, 2000) : text.slice(0, 12000)) + '\n\n' +
    'Reply with ONLY a JSON object: {"changes": {...}, "evidence": "..."}. In "changes" include a field ONLY if the page clearly states a DIFFERENT value for it. ' +
    'Allowed fields: annual_fee (number, dollars), intro_months (integer), apr_low, apr_high (numbers), apr_text, rewards, welcome_bonus (short text). ' +
    '"evidence" is one short quote from the page that supports the change. If nothing differs or the page does not clearly say, reply {"changes": {}, "evidence": ""}. Never guess.';
  let out = '';
  if (GATEWAY_TOKEN) out = await gatewayChat({ url: HERMES_URL, token: GATEWAY_TOKEN, prompt });
  else {
    const r = await fetch(HERMES_URL + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: HERMES_MODEL, temperature: 0, messages: [{ role: 'user', content: prompt }] })
    });
    const d = await j(r);
    if (!r.ok) throw new Error('Hermes error ' + r.status + ': ' + JSON.stringify(d).slice(0, 200));
    out = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  }
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function clean(ch) {
  const o = {};
  for (const f of FIELDS) {
    if (!(f in (ch || {}))) continue;
    let v = ch[f];
    if (['annual_fee', 'apr_low', 'apr_high'].includes(f)) { v = Number(v); if (!isFinite(v) || v < 0 || v > 5000) continue; }
    else if (f === 'intro_months') { v = Math.round(Number(v)); if (!isFinite(v) || v < 0 || v > 36) continue; }
    else { v = String(v).trim().slice(0, 300); if (!v) continue; }
    o[f] = v;
  }
  return o;
}

(async () => {
  const token = await signIn();
  const db = rest(token);
  // Oldest-verified and lowest-confidence cards first.
  const cards = await db('cards?select=*&is_active=eq.true&source_url=not.is.null&order=confidence.desc,source_date.asc.nullsfirst&limit=' + MAX_CARDS * 3);
  const pending = await db('catalog_proposals?select=card_id&status=eq.pending');
  const skip = new Set(pending.map(p => p.card_id));
  let n = 0;
  for (const c of cards) {
    if (n >= MAX_CARDS) break;
    if (skip.has(c.id) || !/^https:\/\//.test(c.source_url)) continue;
    n++;
    process.stdout.write('Checking ' + c.issuer + ' ' + c.name + ' ... ');
    try {
      const pr = await fetch(c.source_url, { headers: { 'User-Agent': 'Mozilla/5.0 ProStackChecker' }, redirect: 'follow' });
      if (!pr.ok) { console.log('page returned ' + pr.status + ', skipped'); continue; }
      const text = pageText(await pr.text());
      if (text.length < 500) { console.log('page too short, skipped'); continue; }
      const ans = await askHermes(c, text);
      const ch = clean(ans && ans.changes);
      // Drop anything identical to what we already have.
      for (const k of Object.keys(ch)) if (String(ch[k]) === String(c[k])) delete ch[k];
      if (!Object.keys(ch).length) { console.log('no change'); continue; }
      const evidence = String((ans && ans.evidence) || '').slice(0, 500);
      if (DRY_RUN) { console.log('WOULD PROPOSE', JSON.stringify(ch)); continue; }
      await db('catalog_proposals', { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ card_id: c.id, changes: ch, evidence, model: HERMES_MODEL }) });
      console.log('proposed', JSON.stringify(ch));
    } catch (e) { console.log('error: ' + e.message); }
  }
  console.log('Done. Open the Staff tab in the portal to review proposals.');
})().catch(e => { console.error(e.message); process.exit(1); });
