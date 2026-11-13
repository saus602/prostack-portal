/* ProStack service layer: Roadmap, Documents, Credit tracking and disputes, Lender matching, Cash-out comparison, Offers, Application coach, Cases (staff). */
(function () {
  'use strict';
  var P = window.ProApp, E = window.Engine, sb = P.sb, S = P.S, esc = P.esc, money = P.money, fmt = P.fmt;
  var X = window.ProExtra = window.ProExtra || {};
  var BUR = [['experian', 'Experian'], ['equifax', 'Equifax'], ['transunion', 'TransUnion'], ['dnb', 'Dun & Bradstreet']];
  var MEAS = [['personal_score', 'Personal score'], ['business_score', 'Business score'], ['paydex', 'PAYDEX (D&B)'], ['intelliscore', 'Intelliscore (Experian business)'], ['other', 'Other']];
  var DOCS = [['ein_letter', 'EIN confirmation letter'], ['business_license', 'Business license or registration'], ['bank_statement', 'Business bank statement'], ['revenue_proof', 'Revenue proof (invoices, processor report)'], ['tax_return', 'Business tax return'], ['other', 'Other business document']];
  var STAGES = [['intake', 'Intake'], ['docs', 'Documents'], ['matching', 'Matching'], ['applications', 'Applications'], ['negotiating', 'Negotiating'], ['funded', 'Funded'], ['closed', 'Closed']];
  var label = function (list, k) { var m = list.filter(function (x) { return x[0] === k; })[0]; return m ? m[1] : k; };
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dleft(isoDate) { var t = new Date(isoDate + 'T00:00:00'), n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 86400000); }
  function bail(r) { if (r && r.error) { P.fail(r.error); return true; } return false; }
  function legalOn() { return sb.from('app_config').select('value').eq('key', 'legal_review_complete').maybeSingle().then(function (r) { return !!(r.data && r.data.value === true); }); }
  var NOTICE = 'ProStack is a planning and coaching tool. It does not apply for credit for you, guarantee approval, limits or funding, or provide credit repair, legal, tax or financial advice.';

  /* ---------- ROADMAP ---------- */
  X.roadmap = function () {
    var uid = S.user.id;
    Promise.all([sb.from('client_checklist').select('*').eq('user_id', uid), sb.from('client_documents').select('category').eq('user_id', uid), sb.from('disputes').select('*').eq('user_id', uid), sb.from('funding_cases').select('*').eq('user_id', uid).maybeSingle()]).then(function (r) {
      var ck = (r[0].data || []).filter(function (x) { return x.done; }).length, docs = {}; (r[1].data || []).forEach(function (d) { docs[d.category] = 1; });
      var disp = (r[2].data || []).filter(function (d) { return d.status === 'sent'; }), kase = r[3].data, steps = [];
      function add(done, title, detail, tab) { steps.push({ done: done, title: title, detail: detail, tab: tab }); }
      add(!!S.credit, 'Save your profile', 'Your score range, account counts, goal and credit target drive every recommendation.', 'plan');
      add(ck >= 12, 'Finish the readiness checklist', ck + ' of 12 items done.', 'readiness');
      var need = ['ein_letter', 'bank_statement', 'revenue_proof'], have = need.filter(function (k) { return docs[k]; }).length;
      add(have === need.length, 'Upload your business documents', have + ' of 3 core documents uploaded (EIN letter, bank statement, revenue proof).', 'documents');
      add(disp.length === 0, 'Resolve open report disputes', disp.length ? disp.length + ' dispute(s) awaiting an answer.' : 'No disputes waiting.', 'credit');
      var planned = S.apps.filter(function (a) { return a.status === 'planned' && a.planned_on; }).sort(function (a, b) { return a.planned_on < b.planned_on ? -1 : 1; })[0];
      add(!planned && S.apps.length > 0, 'Work through your application schedule', planned ? 'Next: ' + P.cardName(planned.card_id) + ' on ' + fmt(planned.planned_on) + '.' : (S.apps.length ? 'Nothing left on the schedule.' : 'Build a plan and add it to the tracker.'), planned ? 'coach' : 'plan');
      var ap = S.apps.filter(function (a) { return a.status === 'approved' && a.intro_ends_on; }).sort(function (a, b) { return a.intro_ends_on < b.intro_ends_on ? -1 : 1; })[0];
      add(false, 'Plan the use and repayment of approved credit', ap ? 'First 0% period ends ' + fmt(ap.intro_ends_on) + ' (' + dleft(ap.intro_ends_on) + ' days).' : 'Once a card is approved, compare ways to use the credit.', 'cashout');
      add(kase && (kase.stage === 'funded' || kase.stage === 'closed'), 'Funding case', kase ? 'Stage: ' + label(STAGES, kase.stage) + '.' : 'Your advisor opens a case once you share your plan (Account tab).', 'offers');
      var first = steps.filter(function (s) { return !s.done; })[0];
      P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Your roadmap</h2><p class="sub">Built from your own progress. The next open step is highlighted. ' + esc(NOTICE) + '</p><ol class="steps">' + steps.map(function (s) {
        return '<li><span class="when">' + (s.done ? 'Done' : (s === first ? 'Next' : 'Later')) + '</span><div' + (s === first ? ' style="border-left:3px solid var(--gold-fill);padding-left:10px"' : '') + '><b>' + esc(s.title) + '</b><br><span class="src">' + esc(s.detail) + '</span> <a href="#" data-go="' + s.tab + '">Open</a></div></li>';
      }).join('') + '</ol></div>';
      P.app.querySelectorAll('[data-go]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); S.tab = a.dataset.go; P.rerender(); }; });
    });
  };

  /* ---------- DOCUMENTS ---------- */
  X.documents = function () {
    var uid = S.user.id;
    sb.from('client_documents').select('*').eq('user_id', uid).order('uploaded_at', { ascending: false }).then(function (r) {
      var rows = r.data || [];
      P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Documents</h2><p class="sub">PDF, PNG or JPG up to 10 MB. Files are private to you. Your advisor can open them only if you turned on sharing in Account.</p>' +
        '<div class="callout" style="margin:0 0 12px">Do not upload Social Security cards, driver\'s licenses or passports, full credit reports, or card and bank account numbers. Black out account numbers on statements. ProStack never asks for them here.</div>' +
        '<form id="dform" class="grid"><div class="field"><label for="d_cat">Document type</label><select id="d_cat">' + P.opts(DOCS, 'bank_statement') + '</select></div><div class="field"><label for="d_file">File</label><input id="d_file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit" id="d_btn">Upload</button></div></form></div>' +
        '<div class="panel"><h3>Your files</h3>' + (!rows.length ? '<p>Nothing uploaded yet.</p>' : '<div class="tablewrap"><table><thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th>Review status</th><th></th></tr></thead><tbody id="dBody">' + rows.map(function (d) {
          return '<tr data-id="' + esc(d.id) + '" data-path="' + esc(d.storage_path) + '"><td>' + esc(label(DOCS, d.category)) + '</td><td>' + esc(d.filename) + '</td><td>' + esc(fmt(d.uploaded_at)) + '</td><td><span class="pill ' + (d.status === 'reviewed' ? 'approved' : d.status === 'needs_replacement' ? 'denied' : 'planned') + '">' + esc(d.status.replace('_', ' ')) + '</span>' + (d.staff_note ? '<div class="src">' + esc(d.staff_note) + '</div>' : '') + '</td><td class="row"><button class="btn alt" data-act="open">Open</button><button class="btn danger" data-act="del">Delete</button></td></tr>';
        }).join('') + '</tbody></table></div>') + '</div>';
      document.getElementById('dform').onsubmit = function (e) {
        e.preventDefault();
        var f = document.getElementById('d_file').files[0]; if (!f) return;
        if (['application/pdf', 'image/png', 'image/jpeg'].indexOf(f.type) < 0) { P.flash('err', 'Only PDF, PNG or JPG files are accepted.'); return X.documents(); }
        if (f.size > 10485760) { P.flash('err', 'That file is over 10 MB.'); return X.documents(); }
        var safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120), path = uid + '/' + Date.now() + '-' + safe;
        document.getElementById('d_btn').disabled = true;
        sb.storage.from('client-docs').upload(path, f, { contentType: f.type, upsert: false }).then(function (u) {
          if (bail(u)) return X.documents();
          return sb.from('client_documents').insert({ user_id: uid, category: document.getElementById('d_cat').value, filename: f.name.slice(0, 200), storage_path: path, size_bytes: f.size }).then(function (m) { if (!bail(m)) P.flash('ok', 'Uploaded.'); X.documents(); });
        });
      };
      var b = document.getElementById('dBody'); if (b) b.addEventListener('click', function (e) {
        var act = e.target.dataset.act; if (!act) return; var tr = e.target.closest('tr'), path = tr.dataset.path;
        if (act === 'open') return sb.storage.from('client-docs').createSignedUrl(path, 60).then(function (u) { if (bail(u)) return X.documents(); window.open(u.data.signedUrl, '_blank', 'noopener'); });
        if (!window.confirm('Delete this file? This cannot be undone.')) return;
        sb.storage.from('client-docs').remove([path]).then(function (x) { if (bail(x)) return X.documents(); return sb.from('client_documents').delete().eq('id', tr.dataset.id).then(function (m) { if (!bail(m)) P.flash('ok', 'Deleted.'); X.documents(); }); });
      });
    });
  };

  /* ---------- CREDIT TRACKING + DISPUTES ---------- */
  X.credit = function () {
    var uid = S.user.id;
    Promise.all([sb.from('credit_scores_log').select('*').eq('user_id', uid).order('logged_on', { ascending: false }), sb.from('disputes').select('*').eq('user_id', uid).order('created_at', { ascending: false })]).then(function (r) {
      var sc = r[0].data || [], dp = r[1].data || [], latest = {};
      sc.slice().reverse().forEach(function (s) { var k = s.bureau + '|' + s.measure; latest[k] = latest[k] ? { cur: s, prev: latest[k].cur } : { cur: s, prev: null }; });
      var h = P.flashHtml() + '<div class="panel"><h2>Credit tracking</h2><p class="sub">Log your scores from each bureau\'s own site or your monitoring service whenever you check them. ProStack has no live feed from the bureaus or D&amp;B, so what you enter is what it shows. Checking your own score does not hurt it.</p>' +
        '<form id="sform" class="grid"><div class="field"><label for="s_b">Bureau</label><select id="s_b">' + P.opts(BUR, 'experian') + '</select></div><div class="field"><label for="s_m">Measure</label><select id="s_m">' + P.opts(MEAS, 'personal_score') + '</select></div>' +
        '<div class="field"><label for="s_v">Value</label><input id="s_v" type="number" min="0" max="1000" step="1" required></div><div class="field"><label for="s_d">Date</label><input id="s_d" type="date" value="' + iso(new Date()) + '" required></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Log it</button></div></form>' +
        (Object.keys(latest).length ? '<div class="tablewrap"><table><thead><tr><th>Bureau</th><th>Measure</th><th>Latest</th><th>Change</th><th>As of</th></tr></thead><tbody>' + Object.keys(latest).map(function (k) { var x = latest[k], d = x.prev ? x.cur.value - x.prev.value : null;
          return '<tr><td>' + esc(label(BUR, x.cur.bureau)) + '</td><td>' + esc(label(MEAS, x.cur.measure)) + '</td><td><b>' + esc(x.cur.value) + '</b></td><td>' + (d == null ? 'first entry' : (d > 0 ? '+' : '') + d) + '</td><td>' + esc(fmt(x.cur.logged_on)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p>No scores logged yet.</p>') + '</div>';
      h += '<div class="panel"><h3>Report error disputes</h3><p class="sub">Track each dispute you file. Credit bureaus generally must investigate within 30 days of receiving it. Use the Letters tab to draft the letter, then send it yourself and log the date here.</p>' +
        '<form id="dpform" class="grid"><div class="field"><label for="p_b">Bureau</label><select id="p_b">' + P.opts(BUR, 'experian') + '</select></div><div class="field"><label for="p_i">Item in dispute</label><input id="p_i" type="text" maxlength="300" required></div>' +
        '<div class="field"><label for="p_r">Why it is wrong</label><input id="p_r" type="text" maxlength="300"></div><div class="field"><label for="p_s">Date you sent it (blank = draft)</label><input id="p_s" type="date"></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Add dispute</button></div></form>' +
        (!dp.length ? '<p>No disputes logged.</p>' : '<div class="tablewrap"><table><thead><tr><th>Bureau</th><th>Item</th><th>Sent</th><th>Answer due</th><th>Status</th><th></th></tr></thead><tbody id="dpBody">' + dp.map(function (d) {
          var left = d.due_on && d.status === 'sent' ? dleft(d.due_on) : null;
          return '<tr data-id="' + esc(d.id) + '"><td>' + esc(label(BUR, d.bureau)) + '</td><td>' + esc(d.item) + '<div class="src">' + esc(d.reason || '') + '</div></td><td>' + esc(d.sent_on ? fmt(d.sent_on) : '') + '</td><td>' + esc(d.due_on ? fmt(d.due_on) : '') + (left != null ? '<div class="src">' + (left < 0 ? 'Overdue by ' + (-left) + ' days: follow up in writing' : left + ' days left') + '</div>' : '') + '</td>' +
            '<td><select data-f="status">' + P.opts([['draft', 'Draft'], ['sent', 'Sent'], ['resolved_corrected', 'Resolved: corrected'], ['resolved_unchanged', 'Resolved: unchanged'], ['escalated', 'Escalated']], d.status) + '</select></td><td class="row"><button class="btn" data-act="save">Save</button><button class="btn alt" data-act="del">Remove</button></td></tr>'; }).join('') + '</tbody></table></div>') + '</div>';
      P.app.innerHTML = h;
      document.getElementById('sform').onsubmit = function (e) { e.preventDefault(); sb.from('credit_scores_log').insert({ user_id: uid, bureau: document.getElementById('s_b').value, measure: document.getElementById('s_m').value, value: +document.getElementById('s_v').value, logged_on: document.getElementById('s_d').value }).then(function (x) { if (!bail(x)) P.flash('ok', 'Logged.'); X.credit(); }); };
      document.getElementById('dpform').onsubmit = function (e) { e.preventDefault(); var s = document.getElementById('p_s').value || null;
        sb.from('disputes').insert({ user_id: uid, bureau: document.getElementById('p_b').value, item: document.getElementById('p_i').value.trim(), reason: document.getElementById('p_r').value.trim() || null, sent_on: s, due_on: s ? iso(E.addDays(new Date(s + 'T00:00:00'), 30)) : null, status: s ? 'sent' : 'draft' }).then(function (x) { if (!bail(x)) P.flash('ok', 'Added.'); X.credit(); }); };
      var b = document.getElementById('dpBody'); if (b) b.addEventListener('click', function (e) {
        var act = e.target.dataset.act; if (!act) return; var tr = e.target.closest('tr'), id = tr.dataset.id;
        if (act === 'del') return sb.from('disputes').delete().eq('id', id).then(function (x) { bail(x); X.credit(); });
        var d = dp.filter(function (z) { return z.id === id; })[0], st = tr.querySelector('[data-f=status]').value, upd = { status: st };
        if (st === 'sent' && !d.sent_on) { upd.sent_on = iso(new Date()); upd.due_on = iso(E.addDays(new Date(), 30)); }
        sb.from('disputes').update(upd).eq('id', id).then(function (x) { if (!bail(x)) P.flash('ok', 'Saved.'); X.credit(); });
      });
    });
  };

  /* ---------- LENDER MATCHING ---------- */
  X.lenders = function () {
    sb.from('lenders').select('*').eq('is_active', true).order('name').then(function (r) {
      if (bail(r)) return;
      var list = r.data || [], months = { none: 0, under6: 3, '6to24': 15, over24: 36 }[S.form.biz] || 0, score = +S.form.score, st = (S.profile && S.profile.state) || '';
      var rev = +(localStorage.getItem('ps_rev') || 0), amt = +(localStorage.getItem('ps_amt') || 0);
      P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Lender matching</h2><p class="sub">Compares your saved profile with the criteria in ProStack\'s lender list. A match means you meet the listed minimums, not that you will be approved. Score range is the bottom of your band.</p>' +
        '<div class="grid"><div class="field"><label for="l_rev">Average monthly revenue ($)</label><input id="l_rev" type="number" min="0" step="500" value="' + (rev || '') + '"></div><div class="field"><label for="l_amt">Amount you want ($)</label><input id="l_amt" type="number" min="0" step="1000" value="' + (amt || '') + '"></div></div>' +
        '<p class="sub">Used here: score ' + score + '+, ' + months + '+ months in business' + (st ? ', state ' + esc(st) : '') + '.</p></div><div id="lres"></div>';
      function run() {
        rev = +document.getElementById('l_rev').value || 0; amt = +document.getElementById('l_amt').value || 0;
        try { localStorage.setItem('ps_rev', rev); localStorage.setItem('ps_amt', amt); } catch (e) {}
        var res = list.map(function (l) {
          var why = [];
          if (l.min_personal_score && score < l.min_personal_score) why.push('needs a score of ' + l.min_personal_score + '+');
          if (l.min_months_in_business && months < l.min_months_in_business) why.push('needs ' + l.min_months_in_business + '+ months in business');
          if (l.min_monthly_revenue && rev < l.min_monthly_revenue) why.push('needs ' + money(l.min_monthly_revenue) + '/mo revenue');
          if (l.max_amount && amt > l.max_amount) why.push('maximum ' + money(l.max_amount));
          if (l.states && l.states.length && st && l.states.indexOf(st) < 0) why.push('not offered in ' + st);
          return { l: l, why: why };
        }).sort(function (a, b) { return a.why.length - b.why.length; });
        document.getElementById('lres').innerHTML = '<div class="panel"><h3>Results</h3>' + (!list.length ? '<p>No lenders in the list yet. Your advisor adds them under Staff, Cases.</p>' : res.map(function (x) {
          return '<article class="cardrow"><h4>' + esc(x.l.name) + ' <span class="pill ' + (x.why.length ? 'reach' : 'likely') + '">' + (x.why.length ? 'Does not meet minimums' : 'Meets listed minimums') + '</span></h4><div class="src">' + esc(x.l.product) + (x.l.max_amount ? ' · up to ' + money(x.l.max_amount) : '') + (x.l.needs_collateral ? ' · collateral' : '') + '</div>' +
            (x.why.length ? '<ul class="reasons"><li class="warn">' + x.why.map(esc).join('</li><li class="warn">') + '</li></ul>' : '') + '<div class="src">' + esc(x.l.note || '') + (x.l.verified_on ? ' Verified ' + esc(fmt(x.l.verified_on)) + '.' : '') + ' ' + (/^https?:\/\//.test(x.l.source_url || '') ? '<a href="' + esc(x.l.source_url) + '" target="_blank" rel="noopener noreferrer">Source</a>' : '') + '</div></article>';
        }).join('')) + '</div>';
      }
      P.app.querySelector('.grid').addEventListener('input', run); run();
    });
  };

  /* ---------- CASH-OUT COMPARISON ---------- */
  X.cashout = function () {
    var amt = +(localStorage.getItem('co_amt') || 10000), mo = +(localStorage.getItem('co_mo') || 12);
    var methods = [
      ['Pay vendors and expenses directly by card', 0, 0, 'Lowest-cost use of a 0% card. Only works where the vendor accepts cards.'],
      ['Bill-pay service that charges your card and pays by check or ACH', 3, 0, 'The service charges a fee. Enter its actual fee. Some card issuers treat these as purchases, others do not. Check the card terms.'],
      ['Balance transfer or convenience check to your bank', 3, 0, 'Fee is set by the card. Many business cards do not offer this. Enter the actual fee from the card terms.'],
      ['Cash advance', 5, 1, 'Usually a fee plus interest starting the same day, with no 0% period. Almost always the most expensive route.']
    ];
    P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Turn card credit into working capital</h2><p class="sub">Compare what each way of using card credit costs for the amount and payoff time you choose. Fee numbers shown are placeholders: replace them with the fee in your card\'s terms or your bill-pay service\'s price list.</p>' +
      '<div class="grid"><div class="field"><label for="c_amt">Amount you need ($)</label><input id="c_amt" type="number" min="500" step="500" value="' + amt + '"></div><div class="field"><label for="c_mo">Months to pay it back</label><input id="c_mo" type="number" min="1" max="60" value="' + mo + '"></div>' +
      '<div class="field"><label for="c_intro">Card 0% months</label><input id="c_intro" type="number" min="0" max="36" value="12"></div><div class="field"><label for="c_apr">Card regular APR (%)</label><input id="c_apr" type="number" min="0" max="60" step="0.1" value="22"></div>' +
      '<div class="field"><label for="c_loan">Loan APR to compare (%)</label><input id="c_loan" type="number" min="0" max="99" step="0.1" value="15"></div></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Method</th><th>Fee %</th><th>Interest starts now?</th><th>Fee</th><th>Interest</th><th>Total cost</th><th>Cost as % of amount</th></tr></thead><tbody id="coBody">' + methods.map(function (m, i) {
        return '<tr data-i="' + i + '"><td><b>' + esc(m[0]) + '</b><div class="src">' + esc(m[3]) + '</div></td><td><input type="number" min="0" max="20" step="0.1" data-f="fee" value="' + m[1] + '" style="width:80px"></td><td><input type="checkbox" data-f="now"' + (m[2] ? ' checked' : '') + '></td><td data-o="fee"></td><td data-o="int"></td><td data-o="tot"></td><td data-o="pct"></td></tr>'; }).join('') +
      '<tr id="coLoan"><td><b>Business loan for comparison</b></td><td>-</td><td>-</td><td data-o="fee">$0</td><td data-o="int"></td><td data-o="tot"></td><td data-o="pct"></td></tr></tbody></table></div>' +
      '<div class="callout">Payments are modeled as equal monthly principal. Interest uses simple monthly accrual. This is an illustration, not an offer. Never use new credit to cover payments on other debt you cannot afford, and confirm with each issuer that your intended use is allowed.</div></div>';
    function calc() {
      var a = Math.max(0, +document.getElementById('c_amt').value || 0), m = Math.max(1, Math.min(60, +document.getElementById('c_mo').value || 12)), intro = Math.max(0, +document.getElementById('c_intro').value || 0), apr = +document.getElementById('c_apr').value || 0, loan = +document.getElementById('c_loan').value || 0;
      try { localStorage.setItem('co_amt', a); localStorage.setItem('co_mo', m); } catch (e) {}
      document.querySelectorAll('#coBody tr[data-i]').forEach(function (tr) {
        var fee = a * (+tr.querySelector('[data-f=fee]').value || 0) / 100, now = tr.querySelector('[data-f=now]').checked, i = E.simulate(a, m, now ? 0 : intro, apr).interest;
        tr.querySelector('[data-o=fee]').textContent = money(fee); tr.querySelector('[data-o=int]').textContent = money(i); tr.querySelector('[data-o=tot]').textContent = money(fee + i); tr.querySelector('[data-o=pct]').textContent = a ? (100 * (fee + i) / a).toFixed(1) + '%' : '-';
      });
      var li = E.simulate(a, m, 0, loan).interest, L = document.getElementById('coLoan');
      L.querySelector('[data-o=int]').textContent = money(li); L.querySelector('[data-o=tot]').textContent = money(li); L.querySelector('[data-o=pct]').textContent = a ? (100 * li / a).toFixed(1) + '%' : '-';
    }
    P.app.querySelector('.panel').addEventListener('input', calc); P.app.querySelector('.panel').addEventListener('change', calc); calc();
  };

  /* ---------- OFFERS + ENGAGEMENT ---------- */
  X.offers = function () {
    var uid = S.user.id;
    Promise.all([sb.from('funding_cases').select('*').eq('user_id', uid).maybeSingle(), sb.from('engagements').select('*').eq('user_id', uid).order('offered_at', { ascending: false }), legalOn()]).then(function (r) {
      var kase = r[0].data, eng = (r[1].data || []).filter(function (e) { return e.status !== 'draft' && e.status !== 'void'; }), on = r[2];
      function render(offers, fees) {
        var h = P.flashHtml() + '<div class="panel"><h2>Funding case and offers</h2>' + (!kase ? '<p>Your advisor opens a case once you turn on sharing in Account and your plan is reviewed.</p>' : '<p><span class="pill planned">' + esc(label(STAGES, kase.stage)) + '</span>' + (kase.target_amount ? ' · target ' + money(kase.target_amount) : '') + '</p>' + (kase.client_note ? '<p>' + esc(kase.client_note) + '</p>' : '')) + '</div>';
        if (kase) h += '<div class="panel"><h3>Offers</h3>' + (!offers.length ? '<p>No offers yet.</p>' : '<div class="tablewrap"><table><thead><tr><th>Source</th><th>Amount</th><th>Rate</th><th>Term</th><th>Status</th><th></th></tr></thead><tbody id="ofBody">' + offers.map(function (o) {
          return '<tr data-id="' + esc(o.id) + '"><td>' + esc(o.source) + '<div class="src">' + esc(o.kind) + '</div></td><td>' + (o.amount ? money(o.amount) : '') + '</td><td>' + esc(o.rate_text || '') + '</td><td>' + esc(o.term_text || '') + '</td><td>' + esc(o.status) + '</td><td class="row">' + (o.status === 'offered' ? '<button class="btn" data-act="accepted">Accept</button><button class="btn alt" data-act="declined">Decline</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="sub">Accepting here records your choice. You still sign and apply directly with the lender or issuer.</p>') + '</div>';
        h += '<div class="panel"><h3>Service agreement and fees</h3>' + (!eng.length ? '<p>No agreement has been offered to you.</p>' : eng.map(function (e) {
          var paid = fees.filter(function (f) { return f.engagement_id === e.id; });
          return '<div class="cardrow"><b>Membership fee ' + money(e.upfront_fee) + ' plus ' + e.success_pct + '% of funding received</b> <span class="pill planned">' + esc(e.status) + '</span><div class="src">Terms version ' + esc(e.terms_version) + '. Read the full agreement before accepting. You can ask your advisor any question first.</div>' +
            (paid.length ? '<ul class="reasons">' + paid.map(function (f) { return '<li>' + esc(f.kind) + ' ' + money(f.amount) + ' recorded ' + esc(fmt(f.recorded_at)) + (f.note ? ' (' + esc(f.note) + ')' : '') + '</li>'; }).join('') + '</ul>' : '') +
            (e.status === 'offered' ? '<div class="row"><button class="btn" data-eng="accepted" data-id="' + esc(e.id) + '">Accept agreement</button><button class="btn alt" data-eng="declined" data-id="' + esc(e.id) + '">Decline</button></div>' : '') + '</div>'; }).join('')) + '</div>';
        P.app.innerHTML = h;
        var ob = document.getElementById('ofBody'); if (ob) ob.addEventListener('click', function (e) { var a = e.target.dataset.act; if (!a) return; sb.from('funding_offers').update({ status: a }).eq('id', e.target.closest('tr').dataset.id).then(function (x) { if (!bail(x)) P.flash('ok', 'Recorded.'); X.offers(); }); });
        P.app.querySelectorAll('[data-eng]').forEach(function (b) { b.onclick = function () { if (b.dataset.eng === 'accepted' && !window.confirm('Accept this agreement? You are agreeing to the fees shown.')) return; sb.from('engagements').update({ status: b.dataset.eng, accepted_at: b.dataset.eng === 'accepted' ? new Date().toISOString() : null }).eq('id', b.dataset.id).then(function (x) { if (!bail(x)) P.flash('ok', 'Recorded.'); X.offers(); }); }; });
      }
      var ids = eng.map(function (e) { return e.id; });
      Promise.all([kase ? sb.from('funding_offers').select('*').eq('case_id', kase.id).order('created_at', { ascending: false }) : { data: [] }, ids.length ? sb.from('fee_events').select('*').in('engagement_id', ids) : { data: [] }]).then(function (q) { render(q[0].data || [], q[1].data || []); });
    });
  };

  /* ---------- APPLICATION COACH ---------- */
  var PATH = { prequal_soft: 'This issuer offers a pre-qualification check that uses a soft pull. Do that first. If it shows no offer, do not apply.', soft_only: 'This issuer uses a soft pull only at application.', no_personal_check: 'This issuer reports not checking personal credit for this card.', hard: 'Expect a hard inquiry on your personal report.', unknown: 'Inquiry type is not confirmed. Assume a hard inquiry.' };
  X.coach = function () {
    var list = S.apps.filter(function (a) { return a.status === 'planned' || a.status === 'applied'; }).sort(function (a, b) { return (a.planned_on || 'z') < (b.planned_on || 'z') ? -1 : 1; });
    if (!list.length) { P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Application coach</h2><p>No planned or open applications. Build a plan on the Plan tab and add it to your tracker.</p></div>'; return; }
    var sel = X._coachId && list.filter(function (a) { return a.id === X._coachId; })[0] || list[0], c = P.cardById(sel.card_id) || {}, p = S.profile || {}, cr = S.credit || {};
    P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Application coach</h2><p class="sub">You submit each application yourself on the issuer\'s site. This page prepares you and tells you what to do at each step. ' + esc(NOTICE) + '</p>' +
      '<div class="field"><label for="co_sel">Application</label><select id="co_sel">' + list.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === sel.id ? ' selected' : '') + '>' + esc(P.cardName(a.card_id) + (a.planned_on ? ' · ' + fmt(a.planned_on) : '') + ' · ' + a.status) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="panel"><h3>1. Have these answers ready</h3><p class="sub">From your profile. Confirm each against your records. The application asks for more (your SSN, exact income); enter those directly on the issuer\'s secure site, never here.</p><div class="tablewrap"><table><tbody>' +
      [['Legal business name', p.business_name || 'Add it on the Plan tab'], ['Business start date', p.business_started_on ? fmt(p.business_started_on) : 'Add it on the Plan tab'], ['State', p.state || 'Not set'], ['Your score range (self-reported)', cr.score_band ? cr.score_band + '+' : 'Not set'], ['New personal accounts in 24 months', cr.new_accounts_24m != null ? cr.new_accounts_24m : 'Not set']].map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="panel"><h3>2. About this card</h3><ul class="reasons"><li>' + esc(PATH[c.inq] || PATH.unknown) + (c.inqNote ? ' ' + esc(c.inqNote) : '') + '</li><li>Annual fee: ' + (c.fee == null ? 'unconfirmed' : '$' + c.fee) + '. 0% intro: ' + (c.intro == null ? 'unconfirmed' : c.intro + ' months') + '. Welcome offer: ' + esc(c.bonus || 'not confirmed') + '.</li>' + (c.minSpend ? '<li>Welcome offer needs ' + money(c.minSpend) + ' spend' + (c.spendDays ? ' within ' + c.spendDays + ' days of approval' : '') + '. Plan purchases you were going to make anyway.</li>' : '') + '</ul></div>' +
      '<div class="panel"><h3>3. On the day</h3><ol><li>Confirm the previous card\'s decision is in and recorded in the tracker.</li><li>Check your own report for new accounts or inquiries you did not expect.</li><li>Apply on the issuer\'s official site during business hours. Use the same business details everywhere.</li><li>Screenshot or save the confirmation page and any reference number.</li><li>Do not apply for another card the same day.</li></ol></div>' +
      '<div class="panel"><h3>4. After you submit</h3><ul class="reasons"><li><b>Instant approval:</b> record the limit and date in the tracker (this sets your 0% end date).</li><li><b>Pending or under review:</b> do not apply elsewhere. Answer document requests the same day. If there is no word in about 10 business days, call the issuer\'s application status line.</li><li><b>Denied:</b> stop the schedule. Save the denial notice. Request the reasons in the Letters tab, fix them, then use a reconsideration call or letter before reapplying.</li></ul><div class="row" style="margin-top:12px"><button class="btn" id="co_track">Open tracker to record the result</button></div></div>';
    document.getElementById('co_sel').onchange = function (e) { X._coachId = e.target.value; X.coach(); };
    document.getElementById('co_track').onclick = function () { S.tab = 'tracker'; P.rerender(); };
  };

  /* ---------- CASES (staff) ---------- */
  X.cases = function () {
    if (!S.isStaff) { S.tab = 'plan'; return P.rerender(); }
    var fl = P.flashHtml(); P.app.innerHTML = fl + '<div class="panel"><p>Loading…</p></div>';
    Promise.all([sb.rpc('staff_clients'), sb.from('lenders').select('*').order('name'), legalOn()]).then(function (r) {
      if (r[0].error) throw r[0].error; if (r[1].error) throw r[1].error;
      var cl = r[0].data || [], lenders = r[1].data || [], on = r[2];
      var h = fl + '<div class="panel"><h2>Funding cases</h2><p class="sub">Shared clients only. Opening a case, uploading nothing on their behalf: you coach, they apply.</p>' +
        '<div class="msg ' + (on ? 'ok' : 'info') + '">Fees and agreements are <b>' + (on ? 'enabled' : 'locked') + '</b>. ' + (on ? '' : 'They stay locked until an attorney has reviewed the fee model, contract and disclosures (the portal README requires this).') + (S.isAdmin ? ' <button class="btn alt" id="legalBtn">' + (on ? 'Lock again' : 'I confirm attorney review is complete') + '</button>' : '') + '</div>' +
        (!cl.length ? '<p>No shared clients.</p>' : '<div class="field"><label for="cs_sel">Client</label><select id="cs_sel"><option value="">Choose…</option>' + cl.map(function (c) { return '<option value="' + esc(c.user_id) + '">' + esc((c.full_name || c.email) + (c.business_name ? ' · ' + c.business_name : '')) + '</option>'; }).join('') + '</select></div>') + '</div><div id="csDetail"></div>';
      h += '<div class="panel"><h3>Lender list</h3><p class="sub">Enter only criteria you have confirmed from the lender\'s own published terms, with the source and date.</p><div class="tablewrap"><table><thead><tr><th>Lender</th><th>Product</th><th>Min score</th><th>Min months</th><th>Min revenue/mo</th><th>Max</th><th>Verified</th><th>Active</th><th></th></tr></thead><tbody id="lnBody">' + lenders.map(function (l) {
        return '<tr data-id="' + esc(l.id) + '"><td>' + esc(l.name) + '</td><td>' + esc(l.product) + '</td><td>' + esc(l.min_personal_score || '') + '</td><td>' + esc(l.min_months_in_business || '') + '</td><td>' + esc(l.min_monthly_revenue || '') + '</td><td>' + esc(l.max_amount || '') + '</td><td>' + esc(l.verified_on || '') + '</td><td><input type="checkbox" data-f="is_active"' + (l.is_active ? ' checked' : '') + '></td><td class="row"><button class="btn" data-act="save">Save</button><button class="btn danger" data-act="del">Delete</button></td></tr>'; }).join('') + '</tbody></table></div>' +
        '<form id="lnForm" class="grid" style="margin-top:12px"><div class="field"><label for="ln_n">Lender</label><input id="ln_n" required></div><div class="field"><label for="ln_p">Product</label><input id="ln_p" required></div><div class="field"><label for="ln_s">Min personal score</label><input id="ln_s" type="number" min="300" max="850"></div><div class="field"><label for="ln_m">Min months in business</label><input id="ln_m" type="number" min="0"></div><div class="field"><label for="ln_r">Min monthly revenue ($)</label><input id="ln_r" type="number" min="0"></div><div class="field"><label for="ln_x">Max amount ($)</label><input id="ln_x" type="number" min="0"></div><div class="field"><label for="ln_u">Source URL</label><input id="ln_u" type="text"></div><div class="field"><label for="ln_v">Verified on</label><input id="ln_v" type="date"></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Add lender</button></div></form></div>';
      P.app.innerHTML = h;
      var lb = document.getElementById('legalBtn'); if (lb) lb.onclick = function () { if (!window.confirm(on ? 'Lock fees and agreements again?' : 'Confirm that a licensed attorney has reviewed the fee model, contract and disclosures?')) return; sb.from('app_config').update({ value: !on, updated_at: new Date().toISOString() }).eq('key', 'legal_review_complete').then(function (x) { if (!bail(x)) P.flash('ok', on ? 'Locked.' : 'Unlocked.'); X.cases(); }); };
      var sel = document.getElementById('cs_sel'); if (sel) sel.onchange = function () { if (sel.value) X.caseDetail(sel.value, on); };
      document.getElementById('lnBody').addEventListener('click', function (e) { var a = e.target.dataset.act; if (!a) return; var tr = e.target.closest('tr'), id = tr.dataset.id;
        if (a === 'del') { if (!window.confirm('Delete this lender?')) return; return sb.from('lenders').delete().eq('id', id).then(function (x) { bail(x); X.cases(); }); }
        sb.from('lenders').update({ is_active: tr.querySelector('[data-f=is_active]').checked }).eq('id', id).then(function (x) { if (!bail(x)) P.flash('ok', 'Saved.'); X.cases(); }); });
      document.getElementById('lnForm').onsubmit = function (e) { e.preventDefault(); function v(k) { return document.getElementById('ln_' + k).value.trim(); } function n(k) { return v(k) === '' ? null : +v(k); }
        var u = v('u'); if (u && !/^https?:\/\//.test(u)) { P.flash('err', 'Source URL must start with http:// or https://'); return X.cases(); }
        sb.from('lenders').insert({ name: v('n'), product: v('p'), min_personal_score: n('s'), min_months_in_business: n('m'), min_monthly_revenue: n('r'), max_amount: n('x'), source_url: u || null, verified_on: v('v') || null }).then(function (x) { if (!bail(x)) P.flash('ok', 'Added.'); X.cases(); }); };
    }).catch(function (err) { P.fail(err); P.app.innerHTML = P.flashHtml() + '<div class="panel"><p>Could not load cases.</p></div>'; });
  };
  X.caseDetail = function (uid, legal) {
    var box = document.getElementById('csDetail'); box.innerHTML = '<div class="panel"><p>Loading…</p></div>';
    sb.from('funding_cases').select('*').eq('user_id', uid).maybeSingle().then(function (cr) {
      if (!cr.data) { box.innerHTML = '<div class="panel"><p>No case yet.</p><button class="btn" id="csOpen">Open a case</button></div>'; document.getElementById('csOpen').onclick = function () { sb.from('funding_cases').insert({ user_id: uid }).then(function (x) { if (!bail(x)) P.flash('ok', 'Case opened.'); X.cases(); }); }; return; }
      var k = cr.data;
      Promise.all([sb.from('funding_offers').select('*').eq('case_id', k.id).order('created_at', { ascending: false }), sb.from('case_notes').select('*').eq('case_id', k.id).order('created_at', { ascending: false }), sb.from('client_documents').select('*').eq('user_id', uid).order('uploaded_at', { ascending: false }), sb.from('engagements').select('*').eq('user_id', uid).order('offered_at', { ascending: false }), sb.from('credit_scores_log').select('*').eq('user_id', uid).order('logged_on', { ascending: false }).limit(12), sb.from('disputes').select('*').eq('user_id', uid)]).then(function (q) {
        var of = q[0].data || [], notes = q[1].data || [], docs = q[2].data || [], eng = q[3].data || [], sc = q[4].data || [], dp = q[5].data || [];
        var feeIds = eng.map(function (e) { return e.id; });
        (feeIds.length ? sb.from('fee_events').select('*').in('engagement_id', feeIds) : Promise.resolve({ data: [] })).then(function (fq) {
          var fees = fq.data || [];
          box.innerHTML = '<div class="panel"><h3>Case</h3><div class="grid"><div class="field"><label for="k_stage">Stage</label><select id="k_stage">' + P.opts(STAGES, k.stage) + '</select></div><div class="field"><label for="k_tgt">Target amount ($)</label><input id="k_tgt" type="number" min="0" value="' + esc(k.target_amount || '') + '"></div></div><div class="field"><label for="k_note">Message to client (they can see this)</label><input id="k_note" type="text" maxlength="500" value="' + esc(k.client_note || '') + '"></div><button class="btn" id="k_save">Save case</button></div>' +
            '<div class="panel"><h3>Offers</h3><div class="tablewrap"><table><tbody>' + of.map(function (o) { return '<tr><td>' + esc(o.source) + ' (' + esc(o.kind) + ')</td><td>' + (o.amount ? money(o.amount) : '') + '</td><td>' + esc(o.rate_text || '') + '</td><td>' + esc(o.term_text || '') + '</td><td>' + esc(o.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
            '<form id="of_f" class="grid" style="margin-top:10px"><div class="field"><label for="o_k">Kind</label><select id="o_k">' + P.opts([['card', 'Card'], ['lender', 'Lender'], ['other', 'Other']], 'card') + '</select></div><div class="field"><label for="o_s">Source</label><input id="o_s" required></div><div class="field"><label for="o_a">Amount ($)</label><input id="o_a" type="number" min="0"></div><div class="field"><label for="o_r">Rate</label><input id="o_r"></div><div class="field"><label for="o_t">Term</label><input id="o_t"></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Add offer</button></div></form></div>' +
            '<div class="panel"><h3>Documents</h3>' + (!docs.length ? '<p>None uploaded.</p>' : '<div class="tablewrap"><table><tbody id="kdBody">' + docs.map(function (d) { return '<tr data-id="' + esc(d.id) + '" data-path="' + esc(d.storage_path) + '"><td>' + esc(label(DOCS, d.category)) + '</td><td>' + esc(d.filename) + '</td><td><select data-f="status">' + P.opts([['received', 'Received'], ['reviewed', 'Reviewed'], ['needs_replacement', 'Needs replacement']], d.status) + '</select></td><td><input data-f="staff_note" type="text" maxlength="200" value="' + esc(d.staff_note || '') + '" placeholder="Note to client"></td><td class="row"><button class="btn alt" data-act="open">Open</button><button class="btn" data-act="save">Save</button></td></tr>'; }).join('') + '</tbody></table></div>') + '</div>' +
            '<div class="panel"><h3>Credit tracking and disputes</h3><p class="sub">Scores: ' + (sc.length ? sc.map(function (s) { return esc(label(BUR, s.bureau) + ' ' + label(MEAS, s.measure) + ' ' + s.value + ' (' + s.logged_on + ')'); }).join(' · ') : 'none logged') + '</p><p class="sub">Disputes: ' + (dp.length ? dp.map(function (d) { return esc(label(BUR, d.bureau) + ': ' + d.item + ' [' + d.status + ']'); }).join(' · ') : 'none') + '</p></div>' +
            '<div class="panel"><h3>Agreement and fees</h3>' + (!legal ? '<p class="sub">Locked until attorney review is confirmed above. You can prepare a draft; it cannot be offered yet.</p>' : '') + eng.map(function (e) { var paid = fees.filter(function (f) { return f.engagement_id === e.id; });
              return '<div class="cardrow"><b>' + money(e.upfront_fee) + ' + ' + e.success_pct + '%</b> · ' + esc(e.status) + ' · ' + esc(e.terms_version) + '<div class="src">Recorded: ' + (paid.length ? paid.map(function (f) { return esc(f.kind + ' ' + money(f.amount)); }).join(', ') : 'nothing') + '</div><div class="row">' + (e.status === 'draft' && legal ? '<button class="btn" data-eoffer="' + esc(e.id) + '">Offer to client</button>' : '') + '</div>' +
                (legal ? '<form class="grid" data-fee="' + esc(e.id) + '" style="margin-top:8px"><div class="field"><label>Record</label><select data-k="kind">' + P.opts([['upfront', 'Upfront fee received'], ['success', 'Success fee received'], ['refund', 'Refund given']], 'upfront') + '</select></div><div class="field"><label>Amount ($)</label><input data-k="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Note</label><input data-k="note"></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Record</button></div></form>' : '') + '</div>'; }).join('') +
            '<form id="eng_f" class="grid" style="margin-top:10px"><div class="field"><label for="e_u">Upfront fee ($)</label><input id="e_u" type="number" min="0" value="0" required></div><div class="field"><label for="e_p">Success fee % (8 to 12)</label><input id="e_p" type="number" min="8" max="12" step="0.5" value="10" required></div><div class="field"><label for="e_v">Terms version</label><input id="e_v" value="DRAFT" required></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Create draft</button></div></form><p class="sub">Fees are records only. ProStack does not collect payments. Collect them through your own processor under terms your attorney has approved.</p></div>' +
            '<div class="panel"><h3>Internal notes</h3><p class="sub">Clients cannot see these.</p><form id="nt_f" class="row"><input id="nt_t" type="text" style="flex:1" placeholder="Add a note" required><button class="btn" type="submit">Add</button></form><ul class="reasons">' + notes.map(function (n) { return '<li>' + esc(fmt(n.created_at)) + ': ' + esc(n.note) + '</li>'; }).join('') + '</ul></div>';
          function again() { X.caseDetail(uid, legal); }
          document.getElementById('k_save').onclick = function () { var t = document.getElementById('k_tgt').value; sb.from('funding_cases').update({ stage: document.getElementById('k_stage').value, target_amount: t === '' ? null : +t, client_note: document.getElementById('k_note').value.trim() || null, updated_at: new Date().toISOString() }).eq('id', k.id).then(function (x) { if (!bail(x)) P.flash('ok', 'Saved.'); again(); }); };
          document.getElementById('of_f').onsubmit = function (e) { e.preventDefault(); var a = document.getElementById('o_a').value; sb.from('funding_offers').insert({ case_id: k.id, kind: document.getElementById('o_k').value, source: document.getElementById('o_s').value.trim(), amount: a === '' ? null : +a, rate_text: document.getElementById('o_r').value.trim() || null, term_text: document.getElementById('o_t').value.trim() || null }).then(function (x) { if (!bail(x)) P.flash('ok', 'Offer added.'); again(); }); };
          var kd = document.getElementById('kdBody'); if (kd) kd.addEventListener('click', function (e) { var a = e.target.dataset.act; if (!a) return; var tr = e.target.closest('tr');
            if (a === 'open') return sb.storage.from('client-docs').createSignedUrl(tr.dataset.path, 60).then(function (u) { if (bail(u)) return; window.open(u.data.signedUrl, '_blank', 'noopener'); });
            sb.from('client_documents').update({ status: tr.querySelector('[data-f=status]').value, staff_note: tr.querySelector('[data-f=staff_note]').value.trim() || null }).eq('id', tr.dataset.id).then(function (x) { if (!bail(x)) P.flash('ok', 'Saved.'); again(); }); });
          document.getElementById('eng_f').onsubmit = function (e) { e.preventDefault(); sb.from('engagements').insert({ user_id: uid, upfront_fee: +document.getElementById('e_u').value, success_pct: +document.getElementById('e_p').value, terms_version: document.getElementById('e_v').value.trim() || 'DRAFT', status: 'draft' }).then(function (x) { if (!bail(x)) P.flash('ok', 'Draft created.'); again(); }); };
          box.querySelectorAll('[data-eoffer]').forEach(function (b) { b.onclick = function () { if (!window.confirm('Offer this agreement to the client? Confirm the terms version is the attorney-approved one.')) return; sb.from('engagements').update({ status: 'offered', offered_at: new Date().toISOString() }).eq('id', b.dataset.eoffer).then(function (x) { if (!bail(x)) P.flash('ok', 'Offered.'); again(); }); }; });
          box.querySelectorAll('[data-fee]').forEach(function (f) { f.onsubmit = function (e) { e.preventDefault(); function v(kk) { return f.querySelector('[data-k=' + kk + ']').value; } sb.from('fee_events').insert({ engagement_id: f.dataset.fee, kind: v('kind'), amount: +v('amount'), note: v('note').trim() || null }).then(function (x) { if (!bail(x)) P.flash('ok', 'Recorded.'); again(); }); }; });
          document.getElementById('nt_f').onsubmit = function (e) { e.preventDefault(); sb.from('case_notes').insert({ case_id: k.id, note: document.getElementById('nt_t').value.trim() }).then(function (x) { bail(x); again(); }); };
        });
      });
    });
  };
})();
