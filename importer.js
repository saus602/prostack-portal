/* Reads text from a credit report the client chooses to load. Runs in the browser only; nothing here is sent anywhere.
   The parser is a best guess: the client reviews and corrects every line before any number is used. */
(function (root) {
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var DATE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|\\d{1,2}\\/\\d{4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4}|[A-Za-z]{3,9}\\.?\\s+\\d{4}|\\d{4}-\\d{2}(?:-\\d{2})?)';

  function parseDate(s) {
    if (!s) return null; s = String(s).trim(); var m, y, mo, d;
    function real(yy, mm, dd) { var t = new Date(yy, mm - 1, dd); return t.getFullYear() === yy && t.getMonth() === mm - 1 && t.getDate() === dd ? t : null; }
    if ((m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/))) return real(+m[1], +m[2], +(m[3] || 1));
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) { y = +m[3]; if (y < 100) y += 2000; return real(y, +m[1], +m[2]); }
    if ((m = s.match(/^(\d{1,2})\/(\d{4})$/))) return real(+m[2], +m[1], 1);
    if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/))) { mo = MONTHS[m[1].toLowerCase()]; if (mo == null) return null; return new Date(+m[3], mo, +(m[2] || 1)); }
    return null;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function monthsAgo(d, now) { return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + (now.getDate() < d.getDate() ? -0.5 : 0); }
  function daysAgo(d, now) { return Math.floor((now - d) / 86400000); }

  function parseReport(raw, now) {
    now = now || new Date();
    var text = String(raw || '').replace(/\s+/g, ' ');
    var accounts = [], found = 0;
    var STOP = '(?=\\s+(?:account\\s+(?:number|type|status)|type\\s*:|date\\s+opened|status\\s*:|balance|responsib|credit\\s+limit|monthly|high\\s+balance)|$)';
    function build(block, nameGuess) {
      var dm = block.match(new RegExp('date\\s+opened\\s*[:\\-]?\\s*' + DATE, 'i'));
      if (!dm) return; found++;
      var d = parseDate(dm[1]); if (!d || d > new Date(now.getTime() + 864e5)) return;
      var after = block.slice(dm.index);
      var amex = /american\s+express|\bamex\b/i.test(block);
      var isCharge = /charge\s*card/i.test(block);
      var other = /mortgage|auto\b|automobile|student|installment|personal loan|home equity|line of credit/i.test(block) && !/credit\s*card|revolving/i.test(block);
      var isCard = (/credit\s*card|revolving|bankcard/i.test(block) || isCharge) && !other;
      var status = (after.match(new RegExp('status\\s*[:\\-]?\\s*([A-Za-z ]{3,30}?)' + STOP, 'i')) || [])[1] || '';
      var open = /\bopen\b/i.test(status) || (!status && !/closed|paid and closed|transferred/i.test(after));
      accounts.push({ name: (nameGuess || 'Account').slice(0, 40), amex: amex, card: isCard, open: open && !/closed/i.test(status), opened: iso(d) });
    }
    var anchors = [], ar = /account\s+name\s*[:\-]/gi, am;
    while ((am = ar.exec(text))) anchors.push({ idx: am.index, len: am[0].length });
    if (anchors.length) {
      anchors.forEach(function (an, i) {
        var block = text.slice(an.idx, i + 1 < anchors.length ? anchors[i + 1].idx : an.idx + 900);
        var nm = block.slice(an.len).match(new RegExp('^\\s*([A-Za-z0-9][A-Za-z0-9&\'./ \\-]{1,40}?)' + STOP, 'i'));
        build(block, nm ? nm[1].trim() : '');
      });
    } else {
      var re = new RegExp('date\\s+opened\\s*[:\\-]?\\s*' + DATE, 'gi'), hits = [], m;
      while ((m = re.exec(text))) hits.push(m.index);
      hits.forEach(function (idx, i) {
        var start = Math.max(i ? hits[i - 1] + 30 : 0, idx - 300), end = Math.min(idx + 420, i + 1 < hits.length ? hits[i + 1] - 200 : text.length);
        var blk = text.slice(start, Math.max(end, idx + 60));
        build(blk, (blk.slice(0, idx - start).trim().match(/([A-Z][A-Z0-9&.' \-]{3,38})\s*$/) || [])[1] || '');
      });
    }
    var sc = text.match(/(?:FICO|Vantage\s*Score|credit\s+score)[\s\S]{0,40}?\b([3-8]\d{2})\b/i);
    var score = sc ? +sc[1] : null;
    var inq = 0, hi = text.search(/hard\s+inquiries/i);
    if (hi >= 0) {
      var sec = text.slice(hi, hi + 4000), stop = sec.slice(10).search(/soft\s+inquiries|promotional|account\s+review|personal\s+information|public\s+records/i);
      if (stop > 0) sec = sec.slice(0, stop + 10);
      var dr = new RegExp(DATE, 'g'), dm;
      while ((dm = dr.exec(sec))) { var d = parseDate(dm[1]); if (d && monthsAgo(d, now) <= 24 && d <= now) inq++; }
    }
    return { accounts: accounts, score: score, hardInquiries24: inq, found: found };
  }

  function bandFor(score) { return score >= 760 ? 760 : score >= 720 ? 720 : score >= 680 ? 680 : score >= 640 ? 640 : 600; }

  // Totals from the lines the client has confirmed.
  function summarize(accounts, now) {
    now = now || new Date(); var n24 = 0, amexHeld = 0, amex90 = 0;
    accounts.forEach(function (a) {
      var d = parseDate(a.opened); if (!d) return;
      if (a.card && monthsAgo(d, now) <= 24) n24++;
      if (a.amex && a.card && a.open) amexHeld++;
      if (a.amex && a.card && daysAgo(d, now) <= 90 && daysAgo(d, now) >= 0) amex90++;
    });
    return { new24: Math.min(50, n24), amexHeld: Math.min(20, amexHeld), amex90: Math.min(20, amex90) };
  }

  var api = { parseReport: parseReport, summarize: summarize, bandFor: bandFor, parseDate: parseDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Importer = api;
})(typeof window !== 'undefined' ? window : this);
