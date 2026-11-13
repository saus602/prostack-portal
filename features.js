/* ProStack feature tabs: Report, Funding, Readiness, Letters, Clients (staff). Loaded after app.js. */
(function () {
  'use strict';
  var P = window.ProApp, E = window.Engine, sb = P.sb, S = P.S, esc = P.esc, money = P.money, fmt = P.fmt;
  var X = window.ProExtra = window.ProExtra || {};
  var BUREAUS = [['unknown', 'Not sure yet'], ['experian', 'Experian'], ['equifax', 'Equifax'], ['transunion', 'TransUnion']];
  var DISCLAIMER = 'ProStack is a planning tool. It does not apply for credit for you, guarantee approval or limits, or provide credit repair, legal, tax or financial advice. Odds, dates and card terms are estimates from public sources and can be wrong or out of date. Confirm every term with the issuer before you apply. Credit cards carry interest, fees and personal liability; a missed payment can end a 0% period early and damage your credit.';

  function day(iso) { return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function daysUntil(isoDate) { var t = day(isoDate), n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 86400000); }
  function download(name, text, type) {
    var b = new Blob([text], { type: type || 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function engineBits() {
    var p = P.profileForEngine();
    var evals = S.cards.map(function (c) { return E.evaluate(c, p); }).sort(function (a, b) { return b.rank - a.rank; });
    return { p: p, evals: evals, plan: E.buildPlan(evals, p) };
  }
  function bureauFor(issuer, map) {
    var rows = (map || []).filter(function (r) { return r.issuer === issuer; });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return (b.observations || 0) - (a.observations || 0); });
    return rows[0];
  }

  /* ---------- report builder (shared by client and staff) ---------- */
  var BEFORE = [
    'Pull your own credit reports (annualcreditreport.com is the free federal source) and confirm the new-account and inquiry counts match what you entered.',
    'Check that your business details (legal name, address, phone, EIN or tax ID path, start date, revenue) are accurate and match your records.',
    'Make sure any credit freeze is lifted at the bureau this issuer is likely to use, and know which one you are lifting.',
    'Confirm the card\'s current terms, fees, 0% period and any pre-qualification option on the issuer\'s own site.',
    'Decide in advance what you will spend the credit on and that you can repay it inside the 0% window.',
    'Apply during business hours so a reviewer can reach you if the application goes to manual review.'
  ];
  var AFTER = [
    ['Approved', 'Record the limit and decision date in the tracker (this sets your 0% end date). Put the 0% end date and the first payment due date in your calendar. Set up autopay for at least the minimum. Do not apply again until the next scheduled date.'],
    ['Pending or "under review"', 'Do not apply elsewhere. Watch for mail or email and answer any request for documents quickly. Many issuers decide within about 7 to 30 days; call the issuer\'s reconsideration line if there is no word after that.'],
    ['Denied', 'Stop the schedule. Read the denial notice for the stated reasons (the Letters tab has a request template if reasons were not given). Fix what the notice names, wait, and only then continue. Each denial usually costs a hard inquiry.']
  ];
  function reportHtml(d) {
    function r(s) { return esc(s); }
    var rows = d.items.map(function (it, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + r(it.name) + '</b><br><small>' + r(it.likelihood || '') + (it.status && it.status !== 'planned' ? ' · status: ' + r(it.status) : '') + '</small></td><td>' + r(it.when) + '<br><small>' + r(d.time) + ' local</small></td><td>' + r(it.gap) + '</td></tr>';
    }).join('');
    var terms = d.items.map(function (it) {
      return '<tr><td><b>' + r(it.name) + '</b></td><td>' + r(it.fee) + '</td><td>' + r(it.intro) + '</td><td>' + r(it.apr) + '</td><td>' + r(it.bonus) + '</td><td>' + r(it.bureau) + '</td></tr>';
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ProStack plan - ' + r(d.business || d.name || 'Client') + '</title><style>' +
      'body{font:14px/1.5 Georgia,serif;color:#111;max-width:820px;margin:24px auto;padding:0 18px}h1{font-size:26px;margin:0}h2{font-size:17px;border-bottom:1px solid #999;padding-bottom:3px;margin-top:26px}' +
      'table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eee}small{color:#555}' +
      '.box{border:1px solid #999;padding:8px 12px;background:#faf6e8;font-size:12.5px}.pb{page-break-inside:avoid}button{font:600 14px system-ui;padding:8px 14px;margin-bottom:12px}@media print{button{display:none}}' +
      '</style></head><body><button onclick="window.print()">Print or save as PDF</button>' +
      '<h1>Business Card Application Plan</h1><p>Prepared for <b>' + r(d.business || d.name || 'Client') + '</b>' + (d.business && d.name ? ' (' + r(d.name) + ')' : '') + ' · prepared ' + r(d.prepared) + ' · goal: ' + r(d.goal) +
      (d.target ? ' · tracking target: ' + r(money(d.target)) + ' of total credit (a goal, not a forecast)' : '') + '</p>' +
      '<h2>1. Application schedule</h2><p>Apply to one card at a time. Wait for each decision before the next. Dates are earliest suggested dates, not issuer requirements; if a step slips, shift every later date by the same amount.</p>' +
      (rows ? '<table class="pb"><tr><th>#</th><th>Card</th><th>Apply on</th><th>Gap from previous</th></tr>' + rows + '</table>' : '<p>No card currently clears the rules for this goal.</p>') +
      '<h2>2. Before every application</h2><ol>' + BEFORE.map(function (b) { return '<li>' + r(b) + '</li>'; }).join('') + '</ol>' +
      '<h2>3. After each application</h2>' + AFTER.map(function (a) { return '<p class="pb"><b>' + r(a[0]) + '.</b> ' + r(a[1]) + '</p>'; }).join('') +
      '<h2>4. Card terms at a glance</h2>' + (terms ? '<table class="pb"><tr><th>Card</th><th>Annual fee</th><th>0% intro</th><th>Regular APR</th><th>Welcome offer</th><th>Likely bureau</th></tr>' + terms + '</table>' : '') +
      '<h2>5. Using the credit and repaying it</h2><p>Use the credit for planned business expenses. Pay at least the minimum on time every month, and plan to clear each card before its 0% period ends: monthly payment = balance divided by the months left. The Funding tab in the portal calculates this for you and shows when each 0% period ends.</p>' +
      '<h2>6. Important limits</h2><div class="box">' + r(DISCLAIMER) + '</div></body></html>';
  }
  function planItems(plan, mapRows, time) {
    var prevDate = null;
    return plan.map(function (s) {
      var c = s.e.card, b = bureauFor(c.issuer, mapRows), it = {
        name: c.issuer + ' ' + c.name, likelihood: E.LABEL[s.e.lik], when: s.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        gap: prevDate ? Math.round((s.date - prevDate) / 86400000) + ' days after the previous card' : 'Start', fee: c.fee == null ? 'Unconfirmed' : '$' + c.fee,
        intro: c.intro == null ? 'Unconfirmed' : c.intro === 0 ? 'None' : c.intro + ' months' + (c.introVerify ? ' (verify)' : ''), apr: c.apr, bonus: c.bonus,
        bureau: b ? b.bureau + ' (' + b.confidence + ' confidence)' : 'Unknown. Log it after you apply.'
      };
      prevDate = s.date; return it;
    });
  }

  /* ---------- calendar export ---------- */
  function icsEscape(t) { return String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function ics(events) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProStack//Plan//EN'];
    events.forEach(function (ev, i) {
      var d = ev.date.replace(/-/g, '');
      var hh = ev.time || '100000', end = ev.time ? ev.time : '103000';
      out.push('BEGIN:VEVENT', 'UID:prostack-' + d + '-' + i + '@prostack.local', 'DTSTAMP:' + stamp);
      if (ev.allDay) out.push('DTSTART;VALUE=DATE:' + d);
      else out.push('DTSTART:' + d + 'T' + hh, 'DTEND:' + d + 'T' + (ev.time ? ev.time : end));
      out.push('SUMMARY:' + icsEscape(ev.title), 'DESCRIPTION:' + icsEscape(ev.desc || ''), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(ev.title), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
    });
    out.push('END:VCALENDAR'); return out.join('\r\n');
  }
  function calendarEvents() {
    var ev = [], b = engineBits(), seen = {};
    S.apps.forEach(function (a) {
      if (a.status === 'planned' && a.planned_on) { ev.push({ date: a.planned_on, time: '100000', title: 'Apply: ' + P.cardName(a.card_id), desc: 'Run the before-application checklist first. Apply to one card, then wait for the decision.' }); seen[a.card_id] = 1; }
      if (a.status === 'approved' && a.intro_ends_on) {
        ev.push({ date: a.intro_ends_on, allDay: true, title: '0% ENDS: ' + P.cardName(a.card_id), desc: 'Balance should be paid off by this date to avoid interest.' });
        ev.push({ date: iso(E.addDays(day(a.intro_ends_on), -30)), allDay: true, title: '30 days until 0% ends: ' + P.cardName(a.card_id), desc: 'Plan the payoff now.' });
      }
    });
    b.plan.forEach(function (s) { if (!seen[s.e.card.id]) ev.push({ date: iso(s.date), time: '100000', title: 'Apply: ' + s.e.card.issuer + ' ' + s.e.card.name, desc: 'Suggested date from your ProStack plan.' }); });
    return ev;
  }

  /* ---------- REPORT tab ---------- */
  X.report = function () {
    var b = engineBits(), f = S.form, time = localStorage.getItem('ps_time') || '10:00 a.m.';
    var h = P.flashHtml() + '<div class="panel"><h2>Your plan report</h2><p class="sub">A client-ready document with your dates, before and after steps, card terms and limits. Open it to print or save as PDF.</p>' +
      '<div class="grid"><div class="field"><label for="rp_time">Time of day to apply</label><input id="rp_time" type="text" value="' + esc(time) + '"></div></div>' +
      '<div class="row"><button class="btn" id="rp_open">Open printable report</button><button class="btn alt" id="rp_dl">Download report (HTML)</button><button class="btn alt" id="rp_ics">Add dates to my calendar (.ics)</button></div>' +
      '<p class="sub" style="margin-top:12px">The calendar file includes each application date, and the 0% end date plus a 30-day warning for every approved card. Your calendar app will remind you a day ahead.</p></div>';
    h += '<div class="panel"><h3>Preview</h3>' + (b.plan.length ? '<ol class="steps">' + b.plan.map(function (s, i) {
      return '<li><span class="when">' + esc(s.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</span><div><b>' + esc(s.e.card.issuer + ' ' + s.e.card.name) + '</b></div></li>';
    }).join('') + '</ol>' : '<p>No card clears the rules for this goal right now.</p>') + '</div>';
    P.app.innerHTML = h;
    function build() {
      var t = document.getElementById('rp_time').value.trim() || '10:00 a.m.'; try { localStorage.setItem('ps_time', t); } catch (e) {}
      return reportHtml({ name: f.full_name, business: f.business_name, goal: (P.GOALS.filter(function (g) { return g[0] === f.goal; })[0] || [0, f.goal])[1], target: S.credit && S.credit.target_credit ? Number(S.credit.target_credit) : null,
        prepared: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), time: t, items: planItems(b.plan, X.bureauRows || [], t) });
    }
    document.getElementById('rp_open').onclick = function () { var w = window.open('', '_blank'); if (!w) { P.flash('err', 'Your browser blocked the new window. Use Download instead.'); return X.report(); } w.document.open(); w.document.write(build()); w.document.close(); };
    document.getElementById('rp_dl').onclick = function () { download('prostack-plan-' + iso(new Date()) + '.html', build(), 'text/html'); };
    document.getElementById('rp_ics').onclick = function () { var ev = calendarEvents(); if (!ev.length) { P.flash('info', 'Nothing to add yet.'); return X.report(); } download('prostack-dates.ics', ics(ev), 'text/calendar'); };
  };

  /* ---------- FUNDING tab ---------- */
  function approved() { return S.apps.filter(function (a) { return a.status === 'approved'; }); }
  X.funding = function () {
    var ap = approved(), total = ap.reduce(function (s, a) { return s + (Number(a.credit_limit) || 0); }, 0), target = S.credit && S.credit.target_credit ? Number(S.credit.target_credit) : 0;
    var pct = target ? Math.min(100, Math.round(100 * total / target)) : 0;
    var h = P.flashHtml() + '<div class="panel"><h2>Funding tracker</h2><p class="sub">Approved credit against the goal you set. The goal is yours to track, not a forecast or promise.</p>' +
      '<div style="font:600 28px var(--serif)">' + money(total) + (target ? ' <span class="sub" style="font:400 14px var(--sans)">of ' + money(target) + ' (' + pct + '%)</span>' : '') + '</div>' +
      (target ? '<div style="background:var(--soft);border-radius:99px;height:10px;margin:8px 0"><div style="width:' + pct + '%;background:var(--gold-fill);height:10px;border-radius:99px"></div></div><p class="sub">' + money(Math.max(0, target - total)) + ' remaining to your goal.</p>' : '<p class="sub">Set a target in the Plan tab to see progress.</p>') + '</div>';
    // expiry alerts
    var exp = ap.filter(function (a) { return a.intro_ends_on; }).sort(function (a, b) { return a.intro_ends_on < b.intro_ends_on ? -1 : 1; });
    h += '<div class="panel"><h3>0% expiry alerts</h3>' + (!exp.length ? '<p class="sub">Approved cards with a 0% period show here once you record the approval date in the tracker.</p>' :
      '<div class="tablewrap"><table><thead><tr><th>Card</th><th>0% ends</th><th>Days left</th><th>Status</th></tr></thead><tbody>' + exp.map(function (a) {
        var d = daysUntil(a.intro_ends_on), cls = d < 0 ? 'denied' : d <= 30 ? 'hold' : d <= 60 ? 'reach' : 'likely', msg = d < 0 ? 'Ended. Regular APR applies to any balance.' : d <= 30 ? 'Pay down now' : d <= 60 ? 'Start the payoff plan' : 'On track';
        return '<tr><td>' + esc(P.cardName(a.card_id)) + '</td><td>' + esc(fmt(a.intro_ends_on)) + '</td><td>' + d + '</td><td><span class="pill ' + cls + '">' + esc(msg) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>') + '</div>';
    // per-card details
    var live = S.apps.filter(function (a) { return a.status === 'applied' || a.status === 'approved'; });
    h += '<div class="panel"><h3>Card details: bureau, spend and statement date</h3><p class="sub">Log which bureau each issuer pulled (it appears in the denial or approval letter) and your spend toward each welcome offer. Bureau notes you log help you spread inquiries across bureaus.</p>';
    if (!live.length) h += '<p>Applied and approved cards show here.</p>';
    else h += '<div class="tablewrap"><table><thead><tr><th>Card</th><th>Bureau pulled</th><th>Spend so far</th><th>Welcome offer progress</th><th>Statement day</th><th></th></tr></thead><tbody id="fdBody">' + live.map(function (a) {
      var c = P.cardById(a.card_id) || {}, need = c.minSpend, spent = Number(a.spend_so_far) || 0, prog = '', dl = '';
      if (need && a.decided_on) { var end = iso(E.addDays(day(a.decided_on), c.spendDays || 90)), left = daysUntil(end); prog = Math.min(100, Math.round(100 * spent / need)) + '% of ' + money(need); dl = left >= 0 ? ' · ' + left + ' days left' : ' · window closed'; }
      else if (need) prog = 'Needs ' + money(need) + ' (window starts at approval)'; else prog = 'Offer terms not recorded';
      return '<tr data-id="' + esc(a.id) + '"><td>' + esc(P.cardName(a.card_id)) + '</td><td><select data-f="bureau_pulled">' + P.opts(BUREAUS, a.bureau_pulled || 'unknown') + '</select></td>' +
        '<td><input type="number" min="0" step="50" data-f="spend_so_far" value="' + esc(a.spend_so_far == null ? '' : a.spend_so_far) + '" style="width:110px"></td><td class="src">' + esc(prog + dl) + '</td>' +
        '<td><input type="number" min="1" max="31" data-f="statement_day" value="' + esc(a.statement_day == null ? '' : a.statement_day) + '" style="width:70px"></td><td><button class="btn" data-act="save">Save</button></td></tr>';
    }).join('') + '</tbody></table></div>';
    h += '</div>';
    // payoff planner
    var defAmt = Math.round((total || 25000) * 0.5 / 500) * 500 || 5000;
    h += '<div class="panel"><h3>Payoff planner</h3><p class="sub">Shows how much to put on each approved card and the monthly payment that clears it before its 0% period ends. Illustration only: your issuers set the real limits and rates.</p>' +
      (!ap.length ? '<p>Record an approval in the tracker to use this.</p>' : '<div class="grid"><div class="field"><label for="pp_amt">Amount you plan to use ($)</label><input id="pp_amt" type="number" min="500" step="500" value="' + defAmt + '"></div></div><div class="tablewrap"><table><thead><tr><th>Card</th><th>Put on card</th><th>0% months left</th><th>Monthly payment to clear in time</th><th>Interest if not cleared</th></tr></thead><tbody id="ppBody"></tbody></table></div><p id="ppNote" class="sub"></p>') +
      '<div class="callout">Using the credit: pay business expenses and vendors by card first, since purchases at the 0% rate are the lowest-cost use. Cash advances, balance transfers and cash-equivalent purchases usually carry fees and may start interest immediately: read each card\'s terms before using the credit that way. Never use new credit to cover old card payments you cannot afford.</div></div>';
    P.app.innerHTML = h;
    var fb = document.getElementById('fdBody');
    if (fb) fb.addEventListener('click', function (e) {
      if (e.target.dataset.act !== 'save') return;
      var tr = e.target.closest('tr'); function v(k) { return tr.querySelector('[data-f=' + k + ']').value; }
      var upd = { bureau_pulled: v('bureau_pulled'), spend_so_far: v('spend_so_far') === '' ? null : Math.max(0, +v('spend_so_far')), statement_day: v('statement_day') === '' ? null : Math.max(1, Math.min(31, Math.round(+v('statement_day')))) };
      sb.from('applications').update(upd).eq('id', tr.dataset.id).then(function (r) { if (r.error) P.fail(r.error); else P.flash('ok', 'Saved.'); return P.loadAll(); }).then(function () { X.funding(); });
    });
    if (ap.length) {
      var calc = function () {
        var amt = Math.max(0, +document.getElementById('pp_amt').value || 0), rows = [], left = amt, tot = 0;
        // longest remaining 0% first
        var list = ap.map(function (a) { var c = P.cardById(a.card_id) || {}, m = a.intro_ends_on ? Math.max(0, Math.round(daysUntil(a.intro_ends_on) / 30.4)) : (c.intro || 0); return { a: a, c: c, months: m, limit: Number(a.credit_limit) || 0 }; }).sort(function (x, y) { return y.months - x.months; });
        list.forEach(function (it) { var put = Math.min(left, it.limit); left -= put; var apr = it.c.aprHigh != null ? (it.c.aprLow + it.c.aprHigh) / 2 : 22, mp = it.months > 0 ? put / it.months : put, intr = it.months > 0 ? 0 : E.simulate(put, 12, 0, apr).interest;
          rows.push('<tr><td>' + esc(P.cardName(it.a.card_id)) + '</td><td>' + money(put) + '</td><td>' + it.months + '</td><td>' + (put ? (it.months > 0 ? money(mp) + ' / mo' : 'Pay immediately') : '-') + '</td><td>' + (it.months > 0 ? '$0' : put ? 'About ' + money(intr) + ' over 12 mo' : '-') + '</td></tr>'); tot += it.months > 0 ? mp : 0; });
        document.getElementById('ppBody').innerHTML = rows.join('');
        document.getElementById('ppNote').textContent = (left > 0 ? money(left) + ' does not fit within your recorded limits. ' : '') + 'Combined monthly payment to clear everything inside the 0% windows: about ' + money(tot) + '.';
      };
      document.getElementById('pp_amt').addEventListener('input', calc); calc();
    }
  };

  /* ---------- READINESS tab ---------- */
  var CHECK = [
    ['ein', 'I have an EIN (or have chosen the SSN path knowingly)'], ['entity', 'My business is registered with my state'], ['bank', 'I have a business bank account'],
    ['address', 'I have a business address and phone number that match my records'], ['revenue', 'I can show revenue (bank statements, invoices or tax returns)'],
    ['report', 'I reviewed my personal credit reports from all three bureaus'], ['errors', 'I disputed or documented any errors I found'], ['freeze', 'I know how to lift my credit freezes, and which bureau to lift'],
    ['email', 'I have a business email or website that matches the business name'], ['income', 'I know my annual business and personal income figures to state on applications'],
    ['payoff', 'I have a written plan for repaying each card before its 0% period ends'], ['calendar', 'I added the application and 0% end dates to my calendar']
  ];
  X.readiness = function () {
    var uid = S.user.id;
    sb.from('client_checklist').select('*').eq('user_id', uid).then(function (r) {
      var done = {}; (r.data || []).forEach(function (x) { if (x.done) done[x.item_key] = 1; });
      var n = CHECK.filter(function (c) { return done[c[0]]; }).length, pct = Math.round(100 * n / CHECK.length);
      var bv = X.bv || null;
      sb.from('business_verification').select('*').eq('user_id', uid).maybeSingle().then(function (br) {
        bv = br.data || {};
        var h = P.flashHtml() + '<div class="panel"><h2>Application readiness</h2><p class="sub">Work through this before the first application date. ' + n + ' of ' + CHECK.length + ' done (' + pct + '%).</p>' +
          '<div style="background:var(--soft);border-radius:99px;height:10px;margin-bottom:14px"><div style="width:' + pct + '%;background:var(--gold-fill);height:10px;border-radius:99px"></div></div>' +
          CHECK.map(function (c) { return '<div class="check"><input type="checkbox" data-k="' + c[0] + '" id="ck_' + c[0] + '"' + (done[c[0]] ? ' checked' : '') + '><label for="ck_' + c[0] + '" style="font-weight:400">' + esc(c[1]) + '</label></div>'; }).join('') + '</div>';
        h += '<div class="panel"><h3>Business profile</h3><p class="sub">Choices only. Never enter your EIN, SSN or account numbers here.</p><form id="bvf"><div class="grid">' +
          '<div class="field"><label for="bv_type">Entity type</label><select id="bv_type">' + P.opts([['sole_proprietor', 'Sole proprietor'], ['llc', 'LLC'], ['corporation', 'Corporation'], ['partnership', 'Partnership'], ['other', 'Other']], bv.entity_type || 'llc') + '</select></div>' +
          '<div class="field"><label for="bv_path">Tax ID you will use on applications</label><select id="bv_path">' + P.opts([['ein', 'EIN'], ['ssn', 'SSN (sole proprietor path)']], bv.tax_id_path || 'ein') + '</select></div>' +
          '<div class="field"><label for="bv_start">Business start date</label><input id="bv_start" type="date" value="' + esc(bv.business_started_on || '') + '" required></div></div>' +
          '<div class="check"><input type="checkbox" id="bv_rev"' + (bv.has_revenue_docs ? ' checked' : '') + '><label for="bv_rev" style="font-weight:400">I have documents showing business revenue</label></div>' +
          '<button class="btn" type="submit">Save business profile</button></form></div>';
        P.app.innerHTML = h;
        P.app.querySelectorAll('[data-k]').forEach(function (el) {
          el.onchange = function () { sb.from('client_checklist').upsert({ user_id: uid, item_key: el.dataset.k, done: el.checked, updated_at: new Date().toISOString() }, { onConflict: 'user_id,item_key' }).then(function (x) { if (x.error) P.fail(x.error); X.readiness(); }); };
        });
        document.getElementById('bvf').onsubmit = function (e) {
          e.preventDefault();
          sb.from('business_verification').upsert({ user_id: uid, entity_type: document.getElementById('bv_type').value, tax_id_path: document.getElementById('bv_path').value, business_started_on: document.getElementById('bv_start').value, has_revenue_docs: document.getElementById('bv_rev').checked, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
            .then(function (x) { if (x.error) P.fail(x.error); else P.flash('ok', 'Saved.'); X.readiness(); });
        };
      });
    });
  };

  /* ---------- LETTERS tab ---------- */
  var LETTERS = {
    reasons: { label: 'Ask an issuer for denial reasons', body: function (v) { return v.date + '\n\n' + v.issuer + '\nCredit Department\n\nRe: Application for ' + v.card + (v.ref ? ', reference ' + v.ref : '') + '\n\nTo whom it may concern,\n\nI applied for the account above on ' + v.applied + ' and was not approved. Please send me, in writing, the specific reasons for the decision, the name and contact details of any consumer reporting agency whose report you used, and the credit score and key factors you used if a score was part of the decision.\n\nPlease send the response to the address below.\n\nSincerely,\n' + v.name + '\n' + v.address + '\n[Add any account identifiers yourself, only if the issuer asks for them by mail.]'; } },
    reconsider: { label: 'Request reconsideration', body: function (v) { return v.date + '\n\n' + v.issuer + '\nReconsideration / Application Review\n\nRe: ' + v.card + (v.ref ? ', reference ' + v.ref : '') + '\n\nTo whom it may concern,\n\nI applied for ' + v.card + ' on ' + v.applied + ' and received a decision I would like you to review. ' + (v.reason ? 'The notice stated: ' + v.reason + '. ' : '') + 'My business, ' + v.business + ', has operated since ' + v.since + ' and I can provide revenue documentation, bank statements or any additional information you need. I am also willing to move credit from another account with your bank if that helps.\n\nThank you for taking another look.\n\nSincerely,\n' + v.name + '\n' + v.address; } },
    dispute: { label: 'Dispute an error on a credit report', body: function (v) { return v.date + '\n\n' + v.issuer + '\n[Bureau dispute address: take it from the bureau\'s own website]\n\nRe: Dispute of inaccurate information\n\nTo whom it may concern,\n\nI am disputing the following information in my credit file as inaccurate: ' + (v.reason || '[describe the account or inquiry and what is wrong]') + '. I request that you investigate and correct or delete it as required by the Fair Credit Reporting Act, and send me the results in writing. Copies of supporting documents are enclosed.\n\nSincerely,\n' + v.name + '\n' + v.address + '\n[Add your identifiers on the printed copy yourself. Do not store them here.]'; } }
  };
  X.letters = function () {
    var f = S.form, keys = Object.keys(LETTERS);
    var h = P.flashHtml() + '<div class="panel"><h2>Letters and scripts</h2><p class="sub">Fill in the blanks and copy the letter. ProStack sends nothing for you and stores nothing you type here. You mail or send each letter yourself.</p>' +
      '<div class="grid"><div class="field"><label for="lt_kind">Letter</label><select id="lt_kind">' + keys.map(function (k) { return '<option value="' + k + '">' + esc(LETTERS[k].label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="lt_issuer">Issuer or bureau</label><input id="lt_issuer" type="text"></div><div class="field"><label for="lt_card">Card name</label><input id="lt_card" type="text"></div>' +
      '<div class="field"><label for="lt_applied">Date applied</label><input id="lt_applied" type="date"></div><div class="field"><label for="lt_ref">Reference number (optional)</label><input id="lt_ref" type="text"></div>' +
      '<div class="field"><label for="lt_name">Your name</label><input id="lt_name" type="text" value="' + esc(f.full_name || '') + '"></div><div class="field"><label for="lt_business">Business name</label><input id="lt_business" type="text" value="' + esc(f.business_name || '') + '"></div>' +
      '<div class="field"><label for="lt_since">Business start date</label><input id="lt_since" type="text" value="' + esc((S.profile && S.profile.business_started_on) || '') + '"></div></div>' +
      '<div class="field"><label for="lt_address">Mailing address</label><input id="lt_address" type="text"></div><div class="field"><label for="lt_reason">Reason stated or item disputed (optional)</label><input id="lt_reason" type="text"></div>' +
      '<div class="field"><label for="lt_out">Letter</label><textarea id="lt_out" rows="16" style="width:100%;font:13px/1.5 monospace;padding:10px;border:1px solid var(--line);border-radius:3px;background:var(--surface);color:var(--ink)"></textarea></div>' +
      '<div class="row"><button class="btn" id="lt_copy">Copy</button><button class="btn alt" id="lt_dl">Download .txt</button></div>' +
      '<div class="callout">These are templates, not legal advice. Reconsideration also works by phone: call the issuer\'s reconsideration line, state your business history, offer documents, and ask what would change the decision.</div></div>';
    P.app.innerHTML = h;
    function gen() {
      if (!document.getElementById('lt_kind')) return;
      function v(k) { return document.getElementById('lt_' + k).value.trim(); }
      var vals = { date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), issuer: v('issuer') || '[Issuer]', card: v('card') || '[Card name]', applied: v('applied') || '[date]', ref: v('ref'), name: v('name') || '[Your name]', business: v('business') || '[Business name]', since: v('since') || '[start date]', address: v('address') || '[Your mailing address]', reason: v('reason') };
      document.getElementById('lt_out').value = LETTERS[document.getElementById('lt_kind').value].body(vals);
    }
    P.app.addEventListener('input', gen); P.app.addEventListener('change', gen); gen();
    document.getElementById('lt_copy').onclick = function () { var t = document.getElementById('lt_out'); t.select(); try { document.execCommand('copy'); P.flash('ok', 'Copied.'); } catch (e) { P.flash('err', 'Copy failed. Select the text and copy it.'); } X.letters(); };
    document.getElementById('lt_dl').onclick = function () { download('prostack-letter.txt', document.getElementById('lt_out').value); };
  };

  /* ---------- account: advisor sharing ---------- */
  X.afterAccount = function () {
    var on = !!(S.credit && S.credit.share_with_advisor), d = document.createElement('div');
    d.className = 'panel';
    d.innerHTML = '<h3>Share with my ProStack advisor</h3><p class="sub">When on, ProStack staff can see your profile ranges, plan, tracker, checklist and repayment plan so they can coach you. Off by default. Each staff view is logged. Turn it off any time.</p>' +
      '<div class="check"><input type="checkbox" id="shareAdv"' + (on ? ' checked' : '') + (S.credit ? '' : ' disabled') + '><label for="shareAdv" style="font-weight:400">Let my ProStack advisor see my plan' + (S.credit ? '' : ' (save your profile on the Plan tab first)') + '</label></div>';
    P.app.appendChild(d);
    var cb = document.getElementById('shareAdv'); if (cb) cb.onchange = function () {
      sb.from('credit_profiles').update({ share_with_advisor: cb.checked }).eq('user_id', S.user.id).then(function (r) { if (r.error) P.fail(r.error); else P.flash('ok', cb.checked ? 'Sharing is on.' : 'Sharing is off.'); return P.loadAll(); }).then(function () { P.rerender(); });
    };
  };

  /* ---------- global banner ---------- */
  X.banner = function () {
    var msgs = [];
    approved().forEach(function (a) {
      if (a.intro_ends_on) { var d = daysUntil(a.intro_ends_on); if (d >= 0 && d <= 45) msgs.push(P.cardName(a.card_id) + ': 0% ends in ' + d + ' days (' + fmt(a.intro_ends_on) + ').'); }
      var c = P.cardById(a.card_id); if (c && c.minSpend && a.decided_on) { var end = iso(E.addDays(day(a.decided_on), c.spendDays || 90)), l = daysUntil(end); if (l >= 0 && l <= 30 && (Number(a.spend_so_far) || 0) < c.minSpend) msgs.push(P.cardName(a.card_id) + ': ' + l + ' days left to meet the welcome-offer spend.'); }
    });
    S.apps.forEach(function (a) { if (a.status === 'planned' && a.planned_on) { var d = daysUntil(a.planned_on); if (d >= 0 && d <= 3) msgs.push('Next application: ' + P.cardName(a.card_id) + ' on ' + fmt(a.planned_on) + '. Run the readiness checklist first.'); } });
    if (!msgs.length) return;
    var d = document.createElement('div'); d.className = 'msg info'; d.setAttribute('role', 'status'); d.innerHTML = '<b>Heads up</b><ul style="margin:4px 0 0;padding-left:18px">' + msgs.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    P.app.insertBefore(d, P.app.firstChild);
  };

  /* ---------- CLIENTS tab (staff) ---------- */
  X.clients = function () {
    if (!S.isStaff) { S.tab = 'plan'; return P.rerender(); }
    var fl = P.flashHtml(); P.app.innerHTML = fl + '<div class="panel"><p>Loading…</p></div>';
    Promise.all([sb.rpc('staff_clients'), sb.rpc('staff_calibration', { min_group: 5 }), sb.from('bureau_map').select('*').order('issuer')]).then(function (r) {
      for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
      var cl = r[0].data || [], cal = r[1].data || []; X.bureauRows = r[2].data || [];
      var h = fl + '<div class="panel"><h2>Clients</h2><p class="sub">Only clients who chose to share their plan with an advisor appear here. Each detail view is logged.</p>' +
        (!cl.length ? '<p>No clients have shared their plan yet.</p>' : '<div class="tablewrap"><table><thead><tr><th>Client</th><th>Business</th><th>Goal</th><th>Apps</th><th>Approved credit</th><th>Next planned</th><th></th></tr></thead><tbody id="clBody">' + cl.map(function (c) {
          return '<tr data-id="' + esc(c.user_id) + '"><td>' + esc(c.full_name || c.email) + '<div class="src">' + esc(c.email) + '</div></td><td>' + esc(c.business_name || '') + '</td><td>' + esc(c.goal) + '</td><td>' + esc(c.apps_total) + '</td><td>' + money(c.approved_credit) + (c.target_credit ? ' / ' + money(c.target_credit) : '') + '</td><td>' + esc(c.next_planned ? fmt(c.next_planned) : '') + '</td><td><button class="btn" data-act="view">View</button></td></tr>';
        }).join('') + '</tbody></table></div>') + '</div><div id="clDetail"></div>';
      h += '<div class="panel"><h3>Predicted likelihood vs actual outcome</h3><p class="sub">Compares the label the portal gave each application with what happened. Groups under 5 decisions are hidden. Until the groups fill, treat the labels as unvalidated estimates.</p>' +
        (!cal.length ? '<p>Not enough decided applications yet.</p>' : '<div class="tablewrap"><table><thead><tr><th>Predicted</th><th>Decisions</th><th>Approved</th><th>Actual approval rate</th></tr></thead><tbody>' + cal.map(function (c) { return '<tr><td>' + esc(c.predicted) + '</td><td>' + c.decisions + '</td><td>' + c.approvals + '</td><td>' + Math.round(100 * c.approvals / c.decisions) + '%</td></tr>'; }).join('') + '</tbody></table></div>') + '</div>';
      h += '<div class="panel"><h3>Bureau map</h3><p class="sub">Which bureau each issuer is known to pull, from your own observations. Clients see it in their reports. Leave an issuer out if you are not sure.</p><div class="tablewrap"><table><thead><tr><th>Issuer</th><th>State</th><th>Bureau</th><th>Confidence</th><th>Note</th><th></th></tr></thead><tbody id="bmBody">' + X.bureauRows.map(function (b) {
        return '<tr data-id="' + esc(b.id) + '"><td>' + esc(b.issuer) + '</td><td>' + esc(b.state) + '</td><td>' + esc(b.bureau) + '</td><td>' + esc(b.confidence) + '</td><td>' + esc(b.source_note || '') + '</td><td><button class="btn danger" data-act="del">Remove</button></td></tr>'; }).join('') +
        '</tbody></table></div><form id="bmForm" class="grid" style="margin-top:12px"><div class="field"><label for="bm_i">Issuer</label><input id="bm_i" type="text" required></div><div class="field"><label for="bm_s">State (* for all)</label><input id="bm_s" type="text" value="*" maxlength="2" required></div>' +
        '<div class="field"><label for="bm_b">Bureau</label><select id="bm_b">' + P.opts([['experian', 'Experian'], ['equifax', 'Equifax'], ['transunion', 'TransUnion'], ['varies', 'Varies']], 'experian') + '</select></div>' +
        '<div class="field"><label for="bm_c">Confidence</label><select id="bm_c">' + P.opts([['low', 'low'], ['medium', 'medium'], ['high', 'high']], 'low') + '</select></div><div class="field"><label for="bm_n">Note</label><input id="bm_n" type="text"></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Add</button></div></form></div>';
      P.app.innerHTML = h;
      var cb = document.getElementById('clBody'); if (cb) cb.addEventListener('click', function (e) { if (e.target.dataset.act === 'view') X.clientDetail(e.target.closest('tr').dataset.id); });
      document.getElementById('bmBody').addEventListener('click', function (e) { if (e.target.dataset.act !== 'del') return; if (!window.confirm('Remove this bureau entry?')) return; sb.from('bureau_map').delete().eq('id', e.target.closest('tr').dataset.id).then(function (x) { if (x.error) P.fail(x.error); else P.flash('ok', 'Removed.'); X.clients(); }); });
      document.getElementById('bmForm').onsubmit = function (e) { e.preventDefault(); function v(k) { return document.getElementById('bm_' + k).value.trim(); }
        sb.from('bureau_map').insert({ issuer: v('i'), state: v('s').toUpperCase() || '*', bureau: v('b'), confidence: v('c'), source_note: v('n') || null, last_seen: iso(new Date()) }).then(function (x) { if (x.error) P.fail(x.error); else P.flash('ok', 'Added.'); X.clients(); }); };
    }).catch(function (err) { P.fail(err); P.app.innerHTML = P.flashHtml() + '<div class="panel"><p>Could not load clients.</p></div>'; });
  };
  X.clientDetail = function (id) {
    var box = document.getElementById('clDetail'); box.innerHTML = '<div class="panel"><p>Loading…</p></div>';
    sb.rpc('staff_client_detail', { p_user: id }).then(function (r) {
      if (r.error || !r.data) { box.innerHTML = '<div class="panel"><p>That client has not shared their plan.</p></div>'; return; }
      var d = r.data, pr = d.profile || {}, cr = d.credit || {}, apps = d.applications || [], ck = {}; (d.checklist || []).forEach(function (x) { if (x.done) ck[x.item_key] = 1; });
      var done = CHECK.filter(function (c) { return ck[c[0]]; }).length;
      var items = apps.map(function (a, i) { var c = P.cardById(a.card_id) || {}, b = bureauFor(c.issuer, X.bureauRows);
        return { name: P.cardName(a.card_id), likelihood: a.predicted_likelihood ? E.LABEL[a.predicted_likelihood] : '', status: a.status, when: a.applied_on ? fmt(a.applied_on) : a.planned_on ? fmt(a.planned_on) : 'TBD', gap: a.status === 'approved' ? 'Limit ' + (a.credit_limit ? money(a.credit_limit) : 'not recorded') : '', fee: c.fee == null ? 'Unconfirmed' : '$' + c.fee, intro: c.intro == null ? 'Unconfirmed' : c.intro + ' months', apr: c.apr || '', bonus: c.bonus || '', bureau: a.bureau_pulled && a.bureau_pulled !== 'unknown' ? a.bureau_pulled + ' (logged)' : b ? b.bureau : 'Unknown' }; });
      box.innerHTML = '<div class="panel"><h3>' + esc(pr.full_name || 'Client') + (pr.business_name ? ' · ' + esc(pr.business_name) : '') + '</h3><p class="sub">Score range ' + esc(cr.score_band) + ' · new accounts 24 mo: ' + esc(cr.new_accounts_24m) + ' · goal ' + esc(cr.goal) + ' · readiness ' + done + '/' + CHECK.length + (d.repayment ? ' · repayment plan ' + money(d.repayment.amount) + ' over ' + d.repayment.months + ' mo' : '') + '</p>' +
        '<div class="tablewrap"><table><thead><tr><th>Card</th><th>Status</th><th>Predicted</th><th>Planned</th><th>Applied</th><th>Decided</th><th>Limit</th><th>Bureau</th><th>0% ends</th><th>Note</th></tr></thead><tbody>' + apps.map(function (a) {
          return '<tr><td>' + esc(P.cardName(a.card_id)) + '</td><td><span class="pill ' + esc(a.status) + '">' + esc(a.status) + '</span></td><td>' + esc(a.predicted_likelihood || '') + '</td><td>' + esc(a.planned_on || '') + '</td><td>' + esc(a.applied_on || '') + '</td><td>' + esc(a.decided_on || '') + '</td><td>' + (a.credit_limit ? money(a.credit_limit) : '') + '</td><td>' + esc(a.bureau_pulled || '') + '</td><td>' + esc(a.intro_ends_on || '') + '</td><td>' + esc(a.denial_reason || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn" id="cdRep">Open client report</button></div></div>';
      document.getElementById('cdRep').onclick = function () { var w = window.open('', '_blank'); if (!w) return; w.document.open(); w.document.write(reportHtml({ name: pr.full_name, business: pr.business_name, goal: cr.goal, target: cr.target_credit ? Number(cr.target_credit) : null, prepared: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), time: '10:00 a.m.', items: items })); w.document.close(); };
      box.scrollIntoView();
    });
  };

  // load bureau map for reports (readable by all signed-in users)
  X.loadBureau = function () { return sb.from('bureau_map').select('*').then(function (r) { X.bureauRows = r.data || []; }); };
})();
