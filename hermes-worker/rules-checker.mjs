// ProStack ISSUER RULES checker. Runs on YOUR computer and talks ONLY to your local Hermes model.
// It re-reads the source page of each stale issuer rule (not verified in 60 days), asks Hermes what it says, and files a proposal
// for staff to approve in the portal. It never changes the live catalog itself.
// No dependencies. Needs Node 18+.

const env = process.env;
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

const RULE_FIELDS = ['description', 'threshold', 'window_days', 'effect'];

async function askHermes(rule, text) {
  const current = Object.fromEntries(RULE_FIELDS.map(f => [f, rule[f]]));
  const prompt = 'You check a credit card issuer rule against a web page. Issuer: ' + rule.issuer + '. Rule: ' + rule.rule_name + '.\n' +
    'Current record: ' + JSON.stringify(current) + '\n' + 'Page text (may be partial):\n' + text.slice(0, 12000) + '\n\n' +
    'Reply with ONLY a JSON object: {"status": "current" | "changed" | "unclear", "changes": {...}, "evidence": "..."}. ' +
    'Use "current" only if the page clearly supports the record. Use "changed" with a "changes" object (allowed: description as short text, threshold integer, window_days integer, effect "block" or "risk") only if the page clearly states different terms. Otherwise "unclear". Never guess. "evidence" is one short quote.';
  const r = await fetch(HERMES_URL + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: HERMES_MODEL, temperature: 0, messages: [{ role: 'user', content: prompt }] }) });
  const d = await j(r);
  if (!r.ok) throw new Error('Hermes error ' + r.status);
  const out = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || '';
  const m = out.match(/\{[\s\S]*\}/); if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
function clean(ch) {
  const o = {};
  if (ch && typeof ch.description === 'string' && ch.description.trim()) o.description = ch.description.trim().slice(0, 600);
  for (const f of ['threshold', 'window_days']) if (ch && ch[f] != null) { const v = Math.round(Number(ch[f])); if (isFinite(v) && v >= 0 && v <= 3650) o[f] = v; }
  if (ch && (ch.effect === 'block' || ch.effect === 'risk')) o.effect = ch.effect;
  return o;
}

(async () => {
  const token = await signIn(); const db = rest(token);
  const stale = await db('rpc/rules_stale', { method: 'POST', body: JSON.stringify({ max_days: 60 }) });
  const pending = new Set((await db('rule_proposals?select=rule_id&status=eq.pending')).map(p => p.rule_id));
  let n = 0;
  for (const s of stale) {
    if (n >= MAX_CARDS) break;
    if (pending.has(s.id)) continue;
    const [rule] = await db('issuer_rules?select=*&id=eq.' + s.id);
    if (!rule || !/^https:\/\//.test(rule.source_url || '')) continue;
    n++;
    process.stdout.write('Checking ' + rule.issuer + ' ' + rule.rule_name + ' ... ');
    try {
      const pr = await fetch(rule.source_url, { headers: { 'User-Agent': 'Mozilla/5.0 ProStackChecker' }, redirect: 'follow' });
      if (!pr.ok) { console.log('page returned ' + pr.status + ', skipped'); continue; }
      const text = pageText(await pr.text());
      if (text.length < 500) { console.log('page too short, skipped'); continue; }
      const ans = await askHermes(rule, text);
      if (!ans || ans.status === 'unclear') { console.log('unclear, left alone'); continue; }
      const evidence = String(ans.evidence || '').slice(0, 500);
      const ch = ans.status === 'changed' ? clean(ans.changes) : {};
      if (ans.status === 'changed' && !Object.keys(ch).length) { console.log('no usable change'); continue; }
      if (DRY_RUN) { console.log('WOULD PROPOSE', ans.status, JSON.stringify(ch)); continue; }
      await db('rule_proposals', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ rule_id: rule.id, changes: ch, evidence, model: HERMES_MODEL }) });
      console.log(ans.status === 'current' ? 'proposed: still current' : 'proposed ' + JSON.stringify(ch));
    } catch (e) { console.log('error: ' + e.message); }
  }
  console.log('Done. Open the Staff tab in the portal to review rule proposals.');
})().catch(e => { console.error(e.message); process.exit(1); });
