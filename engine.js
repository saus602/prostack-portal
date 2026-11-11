/* ProStack planning engine. Pure functions, no DOM. Same rules as the public planner page. */
(function (root) {
  var RANK = { likely: 3, possible: 2, reach: 1, unlikely: 0, hold: -5 };
  var LABEL = { likely: 'Likely', possible: 'Possible', reach: 'Reach', unlikely: 'Unlikely', hold: 'Hold' };
  var MIN_BY_TIER = { 1: 660, 2: 700, 3: 730 };

  function num(v) { return v == null ? null : Number(v); }

  // Convert a row from the `cards` table into the shape the engine uses.
  function fromRow(r) {
    return {
      id: r.id, issuer: r.issuer, name: r.name, type: r.card_type,
      fee: num(r.annual_fee), intro: r.intro_months == null ? null : Number(r.intro_months),
      introVerify: !!r.intro_verify, aprLow: num(r.apr_low), aprHigh: num(r.apr_high),
      apr: r.apr_text || 'Not confirmed', rewards: r.rewards || 'Not confirmed',
      bonus: r.welcome_bonus || 'Not confirmed', tier: Number(r.tier), conf: r.confidence,
      fit: r.goal_fit || {}, reportsPersonal: !!r.reports_personal,
      bofa: r.issuer === 'Bank of America', usb: r.issuer === 'U.S. Bank',
      inq: r.inquiry_path || 'unknown', inqNote: r.inquiry_note || '',
      note: r.note || '', src: r.source_url || '', date: r.source_date || ''
    };
  }

  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { var x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; }

  function evaluate(c, p) {
    var flags = [], blocked = false, warns = 0;
    function add(level, text) {
      flags.push({ level: level, text: text });
      if (level === 'block') blocked = true;
      if (level === 'warn') warns++;
    }
    if (c.issuer === 'Chase') {
      if (p.new24 >= 5) add('block', 'You are at ' + p.new24 + '/24. Chase generally denies applicants at 5/24 or above. Wait until older accounts age out.');
      else if (p.new24 === 4) add('warn', 'You are at 4/24. One more new personal account puts you at 5/24, so apply to Chase first.');
      else add('good', 'Under 5/24 (' + p.new24 + '/24). Chase business cards do not add to this count.');
    }
    if (c.issuer === 'American Express') {
      if (c.type === 'credit') {
        if (p.amexHeld >= 5) add('block', 'You hold ' + p.amexHeld + ' Amex credit cards. Amex generally stops near 5.');
        else if (p.amexHeld === 4) add('warn', 'You hold 4 Amex credit cards. Some applicants are declined at 4.');
      } else add('good', "Charge cards often do not count toward Amex's card limit.");
      if (p.amex90 >= 3) add('block', 'You opened ' + p.amex90 + ' Amex cards in 90 days. Amex generally declines a 4th within 90 days.');
      add('info', 'Welcome bonus is once per card per lifetime.');
    }
    if (c.reportsPersonal) add('warn', 'Capital One can report this to personal credit, which may count toward Chase 5/24. Apply to Chase first.');
    if (c.bofa) {
      if (p.relBofa) add('good', 'Your Bank of America relationship helps approval odds.');
      else add('info', 'Bank of America favors customers with an existing relationship. Also limits you to 2 cards in 2 months.');
    }
    if (c.usb) {
      if (p.relUsb) add('good', 'Your U.S. Bank relationship helps approval odds.');
      else add('warn', 'U.S. Bank favors existing customers and can be conservative with new ones.');
    }
    var need = MIN_BY_TIER[c.tier], diff = p.score - need;
    if (diff < 0) add('warn', 'Your score range sits below the typical level for this card (about ' + need + '+).');
    else if (diff >= 40) add('good', 'Your score range clears the typical level for this card (about ' + need + '+).');
    if (p.biz === 'none') add('warn', 'Applications ask for accurate business details. Without an active business your odds drop.');
    if (p.biz === 'under6' && c.tier === 3) add('warn', 'Premium business cards usually favor businesses with some operating history.');
    var lik;
    if (blocked) lik = 'hold';
    else if (diff >= 40) lik = 'likely';
    else if (diff >= 0) lik = 'possible';
    else if (diff >= -40) lik = 'reach';
    else lik = 'unlikely';
    function down(l) { return l === 'likely' ? 'possible' : l === 'possible' ? 'reach' : l === 'reach' ? 'unlikely' : l; }
    if (lik !== 'hold') {
      if (warns >= 2) lik = down(down(lik)); else if (warns === 1 && lik === 'likely') lik = 'possible';
      if (p.biz === 'none') lik = down(lik);
    }
    var softPath = c.inq === 'prequal_soft' || c.inq === 'soft_only' || c.inq === 'no_personal_check';
    if (softPath) add('info', c.inqNote || 'A soft-pull or no-credit-check path is available.');
    var confBonus = { high: 1, medium: 0.5, low: 0 }[c.conf];
    var rank = ((c.fit && c.fit[p.goal]) || 0) * 2 + RANK[lik] + confBonus + (softPath && lik !== 'hold' ? 0.5 : 0);
    return { card: c, lik: lik, flags: flags, rank: rank };
  }


  // Pacing constraints (days). Same-issuer gaps follow the reported issuer rules in the rules table.
  var GLOBAL_GAP = 14;
  var SAME_ISSUER_GAP = { 'Chase': 30, 'Citi': 95, 'Capital One': 180, 'Barclays': 180, 'Wells Fargo': 180, 'Bank of America': 60, 'U.S. Bank': 60 };
  function earliestFor(issuer, date, out) {
    var prior = out.filter(function (x) { return x.e.card.issuer === issuer; });
    if (prior.length) {
      var gap = SAME_ISSUER_GAP[issuer] || 30;
      date = new Date(Math.max(date.getTime(), addDays(prior[prior.length - 1].date, gap).getTime()));
    }
    if (issuer === 'American Express') { // never a third Amex card inside 90 days
      var am = prior.map(function (x) { return x.date; });
      if (am.length >= 2) date = new Date(Math.max(date.getTime(), addDays(am[am.length - 2], 91).getTime()));
    }
    return date;
  }
  // Returns a list of violated constraints; an empty list means the plan respects every pacing rule.
  function checkPlan(plan) {
    var bad = [];
    for (var i = 0; i < plan.length; i++) {
      for (var j = 0; j < i; j++) {
        var a = plan[j], b = plan[i], days = Math.round((b.date - a.date) / 86400000);
        if (i - j === 1 && days < GLOBAL_GAP) bad.push('gap<' + GLOBAL_GAP + ' between steps ' + (j + 1) + ' and ' + (i + 1));
        if (a.e.card.issuer === b.e.card.issuer && days < (SAME_ISSUER_GAP[a.e.card.issuer] || 30)) bad.push(a.e.card.issuer + ' same-issuer gap');
      }
      if (plan[i].e.card.issuer === 'American Express') {
        var inWin = plan.slice(0, i + 1).filter(function (x) { return x.e.card.issuer === 'American Express' && (plan[i].date - x.date) / 86400000 <= 90; }).length;
        if (inWin > 2) bad.push('3 Amex inside 90 days');
      }
    }
    return bad;
  }
  // Fold in the client's own issuer pre-approval results: map card id -> 'approved' | 'not_shown' | 'unavailable'
  function applyPrequal(evals, map) {
    return evals.map(function (e) {
      var r = map && map[e.card.id];
      if (r === 'not_shown' && (e.lik === 'likely' || e.lik === 'possible')) {
        var flags = e.flags.concat([{ level: 'warn', text: 'The issuer did not show you a pre-approval. Consider waiting or choosing another card.' }]);
        return Object.assign({}, e, { lik: 'reach', flags: flags, rank: e.rank - 2 });
      }
      if (r === 'approved') return Object.assign({}, e, { flags: e.flags.concat([{ level: 'info', text: 'The issuer showed you a pre-approval (not a guarantee).' }]), rank: e.rank + 1 });
      return e;
    });
  }
  // Readiness 0-100 with the single biggest blocker named. Rule-based, not a statistical model.
  function readiness(p, x) {
    x = x || {};
    var items = [];
    var scorePts = p.score >= 760 ? 35 : p.score >= 720 ? 30 : p.score >= 680 ? 24 : p.score >= 640 ? 14 : 6;
    items.push({ lost: 35 - scorePts, text: 'Raise your credit score range before applying. Pay balances down and fix any report errors.' });
    var n = p.new24 || 0, newPts = n <= 1 ? 20 : n <= 3 ? 14 : n <= 4 ? 8 : 2;
    items.push({ lost: 20 - newPts, text: 'You opened ' + n + ' accounts in 24 months. Several issuers react to that. Space out new accounts.' });
    var bizPts = p.biz === '24plus' ? 15 : p.biz === '6to24' ? 11 : 5;
    items.push({ lost: 15 - bizPts, text: 'A younger business lowers odds. Some issuers prefer a longer history.' });
    items.push({ lost: x.hasDocs ? 0 : 15, text: 'Gather revenue records (bank statements, invoices or returns) before you apply.' });
    items.push({ lost: x.pending ? 10 : 0, text: 'Wait for ' + (x.pending || 0) + ' pending application(s) to be decided before applying again.' });
    items.push({ lost: x.recentDenial ? 5 : 0, text: 'You were denied recently. Read the reason and fix it before another application.' });
    var lost = items.reduce(function (a, b) { return a + b.lost; }, 0), top = items.slice().sort(function (a, b) { return b.lost - a.lost; })[0];
    return { score: Math.max(0, 100 - lost), blocker: top.lost > 0 ? top.text : null };
  }

  function buildPlan(evals, p, start) {
    var cand = evals.filter(function (e) { return (e.lik === 'likely' || e.lik === 'possible') && ((e.card.fit && e.card.fit[p.goal]) || 0) > 0; })
      .sort(function (a, b) { return b.rank - a.rank; });
    var picked = [], used = {};
    cand.forEach(function (e) { if (picked.length < p.plan && !used[e.card.issuer]) { picked.push(e); used[e.card.issuer] = 1; } });
    cand.forEach(function (e) { if (picked.length < p.plan && picked.indexOf(e) < 0) picked.push(e); });
    var order = { 'Chase': 0, 'American Express': 1, 'Bank of America': 2, 'U.S. Bank': 3, 'Wells Fargo': 4, 'Capital One': 9 };
    picked.sort(function (a, b) {
      var oa = order[a.card.issuer], ob = order[b.card.issuer];
      oa = oa == null ? 5 : oa; ob = ob == null ? 5 : ob;
      return oa - ob || b.rank - a.rank;
    });
    var d = start || new Date(), out = [];
    picked.forEach(function (e, i) {
      var date = i === 0 ? new Date(d.getTime()) : addDays(out[i - 1].date, GLOBAL_GAP);
      date = earliestFor(e.card.issuer, date, out);
      out.push({ e: e, date: date });
    });
    return out;
  }

  function simulate(amount, months, intro, apr) {
    var pay = amount / months, bal = amount, interest = 0;
    for (var m = 1; m <= months; m++) {
      if (m > intro) interest += bal * apr / 1200;
      bal = Math.max(0, bal - pay);
    }
    return { interest: interest };
  }

  // Business age bucket <-> start date
  function bizFromDate(iso, now) {
    if (!iso) return 'none';
    var s = new Date(iso + 'T00:00:00'), n = now || new Date();
    var months = (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth());
    if (months < 6) return 'under6';
    if (months < 24) return '6to24';
    return 'over24';
  }
  function dateFromBiz(biz, now) {
    var n = now || new Date();
    var m = { under6: 3, '6to24': 15, over24: 36 }[biz];
    if (!m) return null;
    var d = addMonths(n, -m);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  var INQ_LABEL = { prequal_soft: 'Soft-pull pre-approval available', soft_only: 'Soft-pull credit check', no_personal_check: 'No personal credit check', hard: 'Hard inquiry on application', unknown: 'Hard inquiry likely (not confirmed)' };
  var api = { INQ_LABEL: INQ_LABEL, LABEL: LABEL, fromRow: fromRow, evaluate: evaluate, buildPlan: buildPlan, checkPlan: checkPlan, applyPrequal: applyPrequal, readiness: readiness, simulate: simulate,
    bizFromDate: bizFromDate, dateFromBiz: dateFromBiz, addDays: addDays, addMonths: addMonths };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : this);
