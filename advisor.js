/* Client-side helpers. No network, no AI: plain pattern matching so a client's letters and dates never leave their browser. */
(function (root) {
  var REASONS = [
    { key: 'inquiries', re: /(too many|number of|excessive)[^.]{0,40}inquir|inquir[^.]{0,40}(too many|excessive)/i, label: 'Too many recent inquiries',
      next: 'Pause new applications. Use soft-pull pre-approval where the issuer offers it. Some issuers will review again by phone, but there is no guarantee.' },
    { key: 'newaccts', re: /(too many|number of)[^.]{0,40}(new|recently (opened|established))[^.]{0,30}account|recently (opened|established) account/i, label: 'Too many new accounts',
      next: 'Hold off on new cards while recent accounts age. Plan the next application further out.' },
    { key: 'history', re: /length of (your )?(credit )?history|insufficient (credit )?history|limited (credit )?history|age of (your )?(credit )?(file|accounts)|too new/i, label: 'Short credit history',
      next: 'Time is the main fix. Consider a card built for newer credit before reapplying to premium cards.' },
    { key: 'utilization', re: /(balances?|utili[sz]ation|revolving)[^.]{0,60}(too high|high|exceed|proportion)|proportion of balances|high (credit )?(card )?balances/i, label: 'Balances high compared with limits',
      next: 'Pay balances down before the next application. After paying down, you can ask the issuer whether it will review the decision again.' },
    { key: 'delinq', re: /delinquen|late payment|past due|payment history/i, label: 'Late payments or past-due accounts',
      next: 'Bring accounts current, check your report for errors, and wait before applying again.' },
    { key: 'derog', re: /bankruptcy|collection|charge-?off|public record|judgment|lien/i, label: 'Collections, charge-offs or public records',
      next: 'Review your report and dispute anything wrong. These items weigh on applications until they age.' },
    { key: 'income', re: /income|unable to (verify|confirm) (your )?(income|employment)|insufficient (income|revenue)/i, label: 'Income or revenue could not be supported',
      next: 'Check that the income and revenue on the application were accurate. Stated figures must be true. Ask the issuer which documents it accepts.' },
    { key: 'identity', re: /(verify|confirm)[^.]{0,30}(identity|address|social)|identity (could not|cannot|unable)/i, label: 'Identity could not be verified',
      next: 'Call the number on the letter. Many issuers will verify by phone or with documents.' },
    { key: 'business', re: /(verify|confirm|locate)[^.]{0,40}(your )?business|business (information|name|address|age|history)/i, label: 'Business could not be verified',
      next: 'Make sure the business name, address, phone and EIN match your registration and public listings, then call the issuer.' },
    { key: 'issuer', re: /(too many|maximum|limit)[^.]{0,40}(accounts|cards)[^.]{0,30}(with us|with (our|this) (bank|company))|existing (accounts|credit) with us/i, label: 'Too many accounts with this issuer',
      next: 'Ask whether credit can be moved from one of your existing cards, or wait and apply elsewhere.' }
  ];
  function readDenial(text) {
    var t = String(text || '').replace(/\s+/g, ' ');
    var found = REASONS.filter(function (r) { return r.re.test(t); }).map(function (r) { return { key: r.key, label: r.label, next: r.next }; });
    return { reasons: found, summary: found.map(function (r) { return r.label; }).join('; ').slice(0, 190) };
  }
  var NO_MATCH = 'No standard reason found. Call the phone number on the letter and ask for the specific reasons for the decision. You can ask the issuer to explain it.';

  function ymd(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d; }
  // Upcoming 0% endings, soonest first. apps: [{card, ends}]
  function upcoming(items, now) {
    now = now || new Date(); var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return items.filter(function (x) { return x.ends; }).map(function (x) {
      return { card: x.card, ends: x.ends, days: Math.round((new Date(x.ends + 'T00:00:00') - t0) / 86400000) };
    }).filter(function (x) { return x.days >= -1; }).sort(function (a, b) { return a.days - b.days; });
  }
  function esc(s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
  function buildIcs(list, now) {
    now = now || new Date();
    var stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProStack//Reminders//EN', 'CALSCALE:GREGORIAN'];
    list.forEach(function (x, i) {
      [30, 7].forEach(function (before) {
        var d = addDays(x.ends, -before); if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return;
        var end = new Date(d.getTime()); end.setDate(end.getDate() + 1);
        lines.push('BEGIN:VEVENT', 'UID:prostack-' + i + '-' + before + '-' + x.ends + '@prostack', 'DTSTAMP:' + stamp,
          'DTSTART;VALUE=DATE:' + ymd(d), 'DTEND;VALUE=DATE:' + ymd(end),
          'SUMMARY:' + esc('0% on ' + x.card + ' ends in ' + before + ' days'),
          'DESCRIPTION:' + esc('The 0% intro period on ' + x.card + ' ends on ' + x.ends + '. Pay the balance down or have a plan before interest starts. Confirm the exact date on your statement.'),
          'END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // Welcome-bonus spend progress. app: {decided_on, spend_so_far}; card: {minSpend, spendDays}
  function spendProgress(app, card, now) {
    if (!card || !card.minSpend || !card.spendDays || !app.decided_on) return null;
    now = now || new Date();
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var end = addDays(app.decided_on, card.spendDays);
    var left = Math.round((end - t0) / 86400000);
    var spent = Number(app.spend_so_far || 0), need = Math.max(0, card.minSpend - spent);
    var state = need === 0 ? 'met' : left < 0 ? 'missed' : (left > 0 && need / left * 30 > card.minSpend * 0.45 && left < card.spendDays * 0.5) ? 'behind' : 'ontrack';
    return { target: card.minSpend, spent: spent, need: need, daysLeft: left, ends: ymdDash(end), state: state, perWeek: left > 0 && need > 0 ? Math.ceil(need / (left / 7)) : 0 };
  }
  function ymdDash(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Monthly "pay before the statement closes" reminders, 3 days before each statement day.
  function buildStatementIcs(list, now) {
    now = now || new Date();
    var stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProStack//Statements//EN', 'CALSCALE:GREGORIAN'];
    list.forEach(function (x, i) {
      var day = Math.min(28, Math.max(1, Number(x.day))), rem = Math.max(1, day - 3);
      var start = new Date(now.getFullYear(), now.getMonth(), rem); if (start < new Date(now.getFullYear(), now.getMonth(), now.getDate())) start = new Date(now.getFullYear(), now.getMonth() + 1, rem);
      var end = new Date(start.getTime()); end.setDate(end.getDate() + 1);
      lines.push('BEGIN:VEVENT', 'UID:prostack-stmt-' + i + '-' + day + '@prostack', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ymd(start), 'DTEND;VALUE=DATE:' + ymd(end),
        'RRULE:FREQ=MONTHLY', 'SUMMARY:' + esc('Statement for ' + x.card + ' closes around the ' + day + 'th'),
        'DESCRIPTION:' + esc('Paying down the balance before the statement closes lowers the balance that gets reported. Check your own statement for the exact closing date.'), 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  /* Tracking goal for total approved credit. Counts approved limits the client entered; never a forecast. */
  function creditProgress(apps, target) {
    var t = Number(target);
    if (!isFinite(t) || t <= 0) return null;
    var got = 0, approved = 0, pending = 0, pendingCards = 0;
    (apps || []).forEach(function (a) {
      if (a.status === 'approved') { approved++; got += Math.max(0, Number(a.credit_limit) || 0); }
      else if (a.status === 'applied') pendingCards++;
      else if (a.status === 'planned') pending++;
    });
    var left = Math.max(0, t - got);
    return { target: t, got: got, left: left, pct: Math.min(100, Math.round(got / t * 100)), approved: approved, applied: pendingCards, planned: pending, met: got >= t };
  }
  var api = { creditProgress: creditProgress, spendProgress: spendProgress, buildStatementIcs: buildStatementIcs, readDenial: readDenial, NO_MATCH: NO_MATCH, upcoming: upcoming, buildIcs: buildIcs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Advisor = api;
})(typeof window !== 'undefined' ? window : this);
