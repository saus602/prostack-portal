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
    var confBonus = { high: 1, medium: 0.5, low: 0 }[c.conf];
    var rank = ((c.fit && c.fit[p.goal]) || 0) * 2 + RANK[lik] + confBonus;
    return { card: c, lik: lik, flags: flags, rank: rank };
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
    var d = start || new Date(), out = [], last = {};
    picked.forEach(function (e, i) {
      var date;
      if (i === 0) date = new Date(d.getTime());
      else {
        date = addDays(out[i - 1].date, 14);
        if (last[e.card.issuer]) date = new Date(Math.max(date.getTime(), addDays(last[e.card.issuer], 30).getTime()));
      }
      last[e.card.issuer] = date;
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

  var api = { LABEL: LABEL, fromRow: fromRow, evaluate: evaluate, buildPlan: buildPlan, simulate: simulate,
    bizFromDate: bizFromDate, dateFromBiz: dateFromBiz, addDays: addDays, addMonths: addMonths };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : this);
