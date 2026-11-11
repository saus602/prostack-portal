// Marketing/claims lint. Fails if public copy promises approvals or dollar outcomes.
// Run: node lint-claims.mjs
import { readFileSync, readdirSync } from 'node:fs';
const files = ['index.html', 'terms.html', 'privacy.html', 'app.js', 'advisor.js', 'engine.js'];
const banned = [
  [/guarantee[ds]?\b(?!d? ?(?:approval)?[^.]{0,40}(?:cannot|can't|not|no|never|isn't|is not|without))/i, 'guarantee language'],
  [/\b(?:get|receive|earn|unlock)\s+(?:up to\s+)?\$\s?\d[\d,]*\s*(?:k|in credit|in funding|in working capital)/i, 'dollar-outcome promise'],
  [/\b(?:approved|approval)\s+(?:every time|100%|for sure)/i, 'approval promise'],
  [/\bno (?:credit )?(?:check|inquir)/i, 'no-credit-check claim'],
  [/\binstant(?:ly)? approv/i, 'instant approval claim']
];
let bad = 0;
for (const f of files) {
  const lines = readFileSync(new URL(f, import.meta.url), 'utf8').split('\n');
  lines.forEach((l, i) => {
    // allow lines that are plainly disclaimers
    if (/\b(?:not|cannot|never|no|without)\b[^.]{0,80}guarantee|cannot guarantee|not a guarantee|never guarantee|no guarantee|does not guarantee|not guaranteed|approval is never guaranteed|guarantees? (?:no|nothing)|never promise|promises? (?:no|nothing)|not promise/i.test(l)) return;
    for (const [re, why] of banned) if (re.test(l)) { bad++; console.log(f + ':' + (i + 1) + ': ' + why + ': ' + l.trim().slice(0, 120)); }
  });
}
console.log(bad ? bad + ' problem(s)' : 'Claims lint passed.');
process.exit(bad ? 1 : 0);
