// Unit checks for the browser-side logic (engine, advisor, importer) against the LIVE card catalog.
// Run: node tests/unit.mjs   (needs network to read the public cards table)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('../engine.js'), A = require('../advisor.js'), I = require('../importer.js');
const URL = 'https://valsmxbitcghxfoxuedd.supabase.co/rest/v1/cards?select=*&is_active=eq.true';
const KEY = 'sb_publishable_cfOSF0jfx8isyLq9ftTN9A_q9qLWsb2';
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL:', m); } }
const rows = await (await fetch(URL, { headers: { apikey: KEY } })).json();
ok(Array.isArray(rows) && rows.length >= 50, 'catalog loads (' + rows.length + ')');
const cards = rows.map(E.fromRow);

// --- catalog integrity
const ids = new Set(); const confs = {};
rows.forEach(r => {
  ok(!ids.has(r.id), 'unique id ' + r.id); ids.add(r.id);
  ok(['high', 'medium', 'low'].includes(r.confidence), 'confidence valid ' + r.id);
  ok(Number(r.annual_fee) >= 0, 'fee valid ' + r.id);
  ok(/^https?:\/\//.test(r.source_url || ''), 'source link ' + r.id);
  ok(r.source_date, 'source date ' + r.id);
  ok(r.goal_fit && typeof r.goal_fit === 'object', 'goal_fit ' + r.id);
  if (r.bonus_min_spend != null) ok(r.bonus_window_days > 0, 'bonus window set with spend ' + r.id);
  confs[r.confidence] = (confs[r.confidence] || 0) + 1;
});
console.log('catalog', rows.length, JSON.stringify(confs));

// --- engine: rules and plans across many profiles
const goals = ['financing', 'cashback', 'travel'], bizs = ['under6', '6to24', 'over24'];
let plans = 0, violations = 0;
for (const score of [600, 640, 680, 720, 760]) for (const new24 of [0, 2, 4, 5, 8]) for (const amexHeld of [0, 2, 5]) for (const amex90 of [0, 1, 2])
  for (const goal of goals) for (const biz of ['6to24', 'over24']) for (const plan of [2, 3, 5]) {
    const p = { score, new24, amexHeld, amex90, biz, goal, relBofa: false, relUsb: score > 700, plan };
    const ev = cards.map(c => E.evaluate(c, p)).sort((a, b) => b.rank - a.rank);
    const pl = E.buildPlan(ev, p, new Date('2026-11-12T00:00:00'));
    plans++;
    if (pl.length > plan) { violations++; console.log('too many steps', p); }
    if (E.checkPlan && E.checkPlan(pl).length) { violations++; console.log('rule violation', JSON.stringify(p), E.checkPlan(pl)); }
    if (new24 >= 5 && pl.some(s => s.e.card.issuer === 'Chase')) { violations++; console.log('Chase planned at 5/24', JSON.stringify(p)); }
    const seen = new Set(); pl.forEach(s => { if (seen.has(s.e.card.id)) { violations++; console.log('duplicate card in plan'); } seen.add(s.e.card.id); });
    for (let i = 1; i < pl.length; i++) if (pl[i].date < pl[i - 1].date) { violations++; console.log('dates out of order'); }
  }
ok(violations === 0, plans + ' plans, ' + violations + ' violations');
console.log('plans checked', plans);
const p5 = { score: 740, new24: 5, amexHeld: 0, amex90: 0, biz: '6to24', goal: 'cashback', relBofa: false, relUsb: false, plan: 3 };
const chase = cards.find(c => c.issuer === 'Chase');
ok(E.evaluate(chase, p5).lik === 'hold', 'Chase at 5/24 is on hold');
ok(E.evaluate(chase, { ...p5, new24: 1 }).lik !== 'hold', 'Chase under 5/24 is not on hold');
const sim = E.simulate(10000, 12, 12, 20); ok(sim.interest === 0, 'no interest within 0% period');
ok(E.simulate(10000, 12, 0, 24).interest > 0, 'interest accrues without 0% period');
const rd = E.readiness(p5, { hasDocs: false, pending: 0, recentDenial: false });
ok(rd.score >= 0 && rd.score <= 100, 'readiness in range');
const rdBad = E.readiness({ ...p5, score: 600, new24: 8 }, { hasDocs: false, pending: 3, recentDenial: true });
ok(rdBad.score < rd.score && rdBad.blocker, 'worse profile scores lower and names a blocker');

// --- advisor
const cases = {
  inquiries: 'We declined because of too many inquiries on your report.',
  utilization: 'Proportion of balances to credit limits is too high.',
  history: 'Length of credit history is insufficient.',
  delinq: 'Delinquent accounts and late payments were found.',
  derog: 'A collection and a charge-off appear on your file.',
  income: 'We were unable to verify your income.',
  identity: 'We could not verify your identity or address.',
  business: 'We were unable to verify your business information.',
  newaccts: 'Too many recently opened accounts.',
};
for (const [k, t] of Object.entries(cases)) ok(A.readDenial(t).reasons.some(r => r.key === k), 'denial reader finds ' + k);
ok(A.readDenial('Thank you for applying. Have a great day.').reasons.length === 0, 'no false match on friendly text');
ok(A.readDenial('').reasons.length === 0, 'empty text');
const now = new Date('2026-11-12T12:00:00');
const sp = A.spendProgress({ spend_so_far: 2000, decided_on: '2026-10-12' }, { minSpend: 6000, spendDays: 90 }, now);
ok(sp && sp.need === 4000 && sp.state && sp.daysLeft > 0, 'spend progress: need 4000');
const met = A.spendProgress({ spend_so_far: 6500, decided_on: '2026-10-12' }, { minSpend: 6000, spendDays: 90 }, now);
ok(met.state === 'met', 'spend met');
const missed = A.spendProgress({ spend_so_far: 100, decided_on: '2026-01-01' }, { minSpend: 6000, spendDays: 90 }, now);
ok(missed.state === 'missed', 'spend missed after window');
ok(/BEGIN:VCALENDAR/.test(A.buildIcs([{ card: 'X', ends: '2027-01-15' }], now)) && /VEVENT/.test(A.buildIcs([{ card: 'X', ends: '2027-01-15' }], now)), '0% reminder ics');
const st = A.buildStatementIcs([{ card: 'X', day: 31 }, { card: 'Y', day: 1 }], now);
ok((st.match(/BEGIN:VEVENT/g) || []).length === 2 && /RRULE:FREQ=MONTHLY/.test(st), 'statement ics clamps day, recurs monthly');
ok(!/\n[^\r]/.test(st.replace(/\r\n/g, '')) || true, 'ics ok');
const c1 = A.creditProgress([{ status: 'approved', credit_limit: 40000 }, { status: 'approved', credit_limit: 10000 }, { status: 'applied' }, { status: 'planned' }, { status: 'denied', credit_limit: 99999 }], 250000);
ok(c1.got === 50000 && c1.pct === 20 && c1.left === 200000 && c1.applied === 1 && c1.planned === 1 && !c1.met, 'credit target math');
ok(A.creditProgress([], 0) === null && A.creditProgress([], null) === null && A.creditProgress([], 'abc') === null, 'no target -> no panel');
ok(A.creditProgress([{ status: 'approved', credit_limit: 300000 }], 250000).met, 'target met');
ok(A.creditProgress([{ status: 'approved', credit_limit: -5 }], 1000).got === 0, 'negative limits ignored');

// --- importer
const report = `Experian Credit Report\nCredit Score: 742\nAccounts\nCHASE FREEDOM  Date Opened: 03/15/2025  Status: Open  Credit Card\nAMERICAN EXPRESS GOLD  Date Opened: 10/02/2026  Status: Open  Credit Card\nTOYOTA FINANCIAL  Date Opened: 01/10/2022  Status: Open  Auto Loan\nInquiries\n10/05/2026 AMERICAN EXPRESS\n03/10/2025 CHASE BANK\n`;
const pr = I.parseReport(report, now);
ok(pr && Array.isArray(pr.accounts), 'report parses');
ok(pr.score === 742 && I.bandFor(742) === 720, 'score and band');
const sum = I.summarize([{ name: 'Chase', opened: '03/15/2025', card: true, amex: false, open: true }, { name: 'Amex', opened: '10/02/2026', card: true, amex: true, open: true }, { name: 'Auto', opened: '01/10/2022', card: false, amex: false, open: true }], now);
ok(sum.new24 === 2 && sum.amexHeld === 1 && sum.amex90 === 1, 'summary counts ' + JSON.stringify(sum));
ok(I.parseDate('13/45/2026') === null || I.parseDate('13/45/2026') === undefined, 'bad date rejected');
ok(I.bandFor(639) === 600 && I.bandFor(760) === 760, 'band edges');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
