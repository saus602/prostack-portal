// Talks to the "Hermes worker" gateway on your model PC (HTTPS, bearer token, /api/generate).
// That gateway only answers the one allowed computer, forces its own model, and caps replies at 128 tokens
// with a small context window, so prompts sent through it must be short.
export async function gatewayChat({ url, token, prompt }) {
  const r = await fetch(url.replace(/\/$/, '') + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ prompt, options: { num_predict: 128 } })
  });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = null; }
  if (!r.ok) throw new Error('Gateway error ' + r.status + ': ' + t.slice(0, 160));
  return (d && d.response) || '';
}

// Keep only the sentences most likely to hold terms, so the page fits the gateway's small context.
export function focus(text, re, max = 2000) {
  const parts = String(text).split(/(?<=[.!?])\s+/).filter(s => re.test(s));
  let out = '';
  for (const s of parts) { if ((out + ' ' + s).length > max) break; out += (out ? ' ' : '') + s.slice(0, 400); }
  return out;
}
