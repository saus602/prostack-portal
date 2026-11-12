(function () {
  'use strict';
  var CFG = window.PROSTACK_CONFIG, E = window.Engine;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
  var app = document.getElementById('app'), nav = document.getElementById('nav');
  var S = { user: null, tab: 'plan', cards: [], profile: null, credit: null, apps: [], repay: null, consents: [], form: null, flash: null, isStaff: false, isAdmin: false, imp: null, impMsg: '' };
  var CONSENTS = [
    ['terms', 'I have read the terms of use (terms.html) and privacy summary (privacy.html), agree to them, and understand ProStack is a planning tool that does not apply for credit on my behalf or guarantee approval.'],
    ['credit_data', 'I agree to store the credit ranges and counts I enter here (never my SSN, full report, or card numbers) so ProStack can build my plan.'],
    ['estimates_notice', 'I understand odds, dates and card terms are estimates from public sources and may be wrong or out of date.'],
    ['affiliate_disclosure', 'I understand ProStack may earn referral fees from some issuers if I apply through a ProStack link. Any such link will be marked.']
  ];
  var SCORES = [[760, '760 and above'], [720, '720 to 759'], [680, '680 to 719'], [640, '640 to 679'], [600, 'Below 640']];
  var BIZ = [['none', 'Not started yet'], ['under6', 'Under 6 months'], ['6to24', '6 to 24 months'], ['over24', 'Over 24 months']];
  var GOALS = [['financing', '0% financing (working capital)'], ['cashback', 'Cash back'], ['travel', 'Travel rewards']];
  var STATUSES = ['planned', 'applied', 'approved', 'denied', 'withdrawn'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function fmt(d) { return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function opts(list, sel) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(sel) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
  function flash(type, text) { S.flash = { type: type, text: text }; }
  function flashHtml() { var f = S.flash; S.flash = null; return f ? '<div class="msg ' + f.type + '" role="status">' + esc(f.text) + '</div>' : ''; }
  function cardById(id) { return S.cards.filter(function (c) { return c.id === id; })[0]; }
  function cardName(id) { var c = cardById(id); return c ? c.issuer + ' ' + c.name : id; }
  function feeText(c) { return c.fee == null ? 'Unconfirmed' : (c.fee === 0 ? '$0' : '$' + c.fee); }
  function introText(c) { return c.intro == null ? 'Unconfirmed' : c.intro === 0 ? 'None' : c.intro + ' mo' + (c.introVerify ? ' (verify)' : ''); }

  /* ---------- data ---------- */
  function fail(err) { flash('err', (err && err.message) || 'Something went wrong. Please try again.'); }
  function loadAll() {
    var uid = S.user.id;
    return Promise.all([
      sb.from('cards').select('*').eq('is_active', true).order('issuer').order('name'),
      sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      sb.from('credit_profiles').select('*').eq('user_id', uid).maybeSingle(),
      sb.from('applications').select('*').order('created_at', { ascending: true }),
      sb.from('repayment_plans').select('*').order('created_at', { ascending: false }).limit(1),
      sb.from('consents').select('*'),
      sb.from('staff').select('role').eq('user_id', uid).maybeSingle(),
      sb.from('business_verification').select('*').eq('user_id', uid).maybeSingle(),
      sb.from('prequal_results').select('card_id,result,id').order('id', { ascending: true })
    ]).then(function (r) {
      for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
      S.cards = (r[0].data || []).map(E.fromRow);
      S.profile = r[1].data; S.credit = r[2].data; S.apps = r[3].data || [];
      S.repay = (r[4].data || [])[0] || null; S.consents = r[5].data || []; S.isStaff = !!r[6].data; S.isAdmin = !!(r[6].data && r[6].data.role === 'admin'); S.bv = r[7].data || null; S.pq = {}; (r[8].data || []).forEach(function (x) { S.pq[x.card_id] = x.result; });
    });
  }
  function hasAllConsents() {
    var have = {}; S.consents.forEach(function (c) { if (c.version === CFG.consentVersion) have[c.consent_type] = 1; });
    return CONSENTS.every(function (c) { return have[c[0]]; });
  }
  function formFromState() {
    var c = S.credit || {}, p = S.profile || {};
    return {
      score: c.score_band || 720, new24: c.new_accounts_24m != null ? c.new_accounts_24m : 0,
      amexHeld: c.amex_credit_held || 0, amex90: c.amex_opened_90d || 0,
      relBofa: !!c.rel_bofa, relUsb: !!c.rel_usb, goal: c.goal || 'financing',
      biz: S.credit ? E.bizFromDate(p.business_started_on) : '6to24', plan: 3,
      business_name: p.business_name || '', full_name: p.full_name || ''
    };
  }
  function profileForEngine() {
    var f = S.form;
    return { score: +f.score, new24: +f.new24 || 0, amexHeld: +f.amexHeld || 0, amex90: +f.amex90 || 0, biz: f.biz, goal: f.goal, relBofa: !!f.relBofa, relUsb: !!f.relUsb, plan: +f.plan || 3 };
  }

  /* ---------- auth screens ---------- */
  function renderAuth(mode) {
    nav.hidden = true;
    var signup = mode === 'signup';
    app.innerHTML = '<div class="panel auth"><h2>' + (signup ? 'Create your account' : 'Sign in') + '</h2>' +
      '<p class="sub">' + (signup ? 'Build a card plan for your business and track every application in one place.' : 'Welcome back.') + '</p>' + flashHtml() +
      '<form id="authForm"><div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label for="pw">Password' + (signup ? ' (at least 10 characters)' : '') + '</label><input id="pw" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" minlength="10" required></div>' +
      '<div class="row"><button class="btn" type="submit">' + (signup ? 'Create account' : 'Sign in') + '</button>' +
      '<button class="btn alt" type="button" id="swap">' + (signup ? 'I have an account' : 'Create an account') + '</button></div></form>' +
      (signup ? '' : '<p class="sub" style="margin-top:14px"><a href="#" id="forgot">Forgot password?</a></p>') + '</div>';
    document.getElementById('swap').onclick = function () { renderAuth(signup ? 'signin' : 'signup'); };
    var fg = document.getElementById('forgot');
    if (fg) fg.onclick = function (e) {
      e.preventDefault();
      var em = document.getElementById('em').value.trim();
      if (!em) { flash('err', 'Enter your email first.'); return renderAuth('signin'); }
      sb.auth.resetPasswordForEmail(em, { redirectTo: location.href.split('#')[0] }).then(function (r) {
        flash(r.error ? 'err' : 'ok', r.error ? r.error.message : 'If that email has an account, a reset link is on its way.'); renderAuth('signin');
      });
    };
    document.getElementById('authForm').onsubmit = function (e) {
      e.preventDefault();
      var em = document.getElementById('em').value.trim(), pw = document.getElementById('pw').value;
      var btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      var p = signup ? sb.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: location.href.split('#')[0] } }) : sb.auth.signInWithPassword({ email: em, password: pw });
      p.then(function (r) {
        if (r.error) { flash('err', r.error.message); return renderAuth(mode); }
        if (signup && !r.data.session) { flash('ok', 'Check your email to confirm your account, then sign in.'); return renderAuth('signin'); }
      });
    };
  }

  function renderNewPassword() {
    nav.hidden = true;
    app.innerHTML = '<div class="panel auth"><h2>Set a new password</h2><p class="sub">Choose a password with at least 10 characters.</p>' + flashHtml() +
      '<form id="npForm"><div class="field"><label for="np1">New password</label><input id="np1" type="password" autocomplete="new-password" minlength="10" required></div>' +
      '<div class="field"><label for="np2">Repeat it</label><input id="np2" type="password" autocomplete="new-password" minlength="10" required></div>' +
      '<div class="row"><button class="btn" type="submit">Save password</button></div></form></div>';
    document.getElementById('npForm').onsubmit = function (e) {
      e.preventDefault();
      var a = document.getElementById('np1').value, b = document.getElementById('np2').value;
      if (a !== b) { flash('err', 'The two passwords do not match.'); return renderNewPassword(); }
      sb.auth.updateUser({ password: a }).then(function (r) {
        if (r.error) { flash('err', r.error.message); return renderNewPassword(); }
        S.recovery = false; flash('ok', 'Password updated.'); render();
      });
    };
  }

  function renderConsent() {
    nav.hidden = true;
    var have = {}; S.consents.forEach(function (c) { if (c.version === CFG.consentVersion) have[c.consent_type] = 1; });
    app.innerHTML = '<div class="panel auth" style="max-width:640px"><h2>Before you start</h2><p class="sub">Please review and accept each item. You can see what is stored about you any time under Account.</p>' + flashHtml() +
      '<form id="cf">' + CONSENTS.map(function (c) {
        return '<div class="check"><input type="checkbox" id="c_' + c[0] + '"' + (have[c[0]] ? ' checked disabled' : '') + '><label for="c_' + c[0] + '" style="font-weight:400">' + esc(c[1]) + '</label></div>';
      }).join('') + '<div class="row"><button class="btn" type="submit" id="cbtn" disabled>Accept and continue</button><button class="btn alt" type="button" id="so">Sign out</button></div></form></div>';
    var form = document.getElementById('cf');
    function refresh() { document.getElementById('cbtn').disabled = !CONSENTS.every(function (c) { return document.getElementById('c_' + c[0]).checked; }); }
    form.addEventListener('change', refresh); refresh();
    document.getElementById('so').onclick = function () { sb.auth.signOut(); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var rows = CONSENTS.filter(function (c) { return !have[c[0]]; }).map(function (c) { return { user_id: S.user.id, consent_type: c[0], version: CFG.consentVersion }; });
      sb.from('consents').insert(rows).then(function (r) {
        if (r.error) { fail(r.error); return renderConsent(); }
        return loadAll().then(function () { S.form = formFromState(); render(); });
      });
    };
  }

  /* ---------- plan ---------- */
  var ATTEST_V = 'v1', ATTEST_TXT = 'I confirm that my business is real, that the details I give ProStack and any issuer are true, and that I will not overstate income or revenue on any application. I understand I apply directly and ProStack cannot guarantee approval.';
  function renderGate() {
    app.innerHTML = flashHtml() + '<div class="panel"><h2>Confirm your business first</h2><p class="sub">ProStack plans business cards only, and every application needs a real, documented business. We store these answers, not your EIN or SSN.</p>' +
      '<form id="bvf"><div class="grid">' +
      '<div class="field"><label for="bv_type">Business type</label><select id="bv_type">' + opts([['sole_proprietor', 'Sole proprietor'], ['llc', 'LLC'], ['corporation', 'Corporation'], ['partnership', 'Partnership'], ['other', 'Other']], 'llc') + '</select></div>' +
      '<div class="field"><label for="bv_tax">Tax ID you will use on applications</label><select id="bv_tax">' + opts([['ein', 'EIN'], ['ssn', 'SSN (sole proprietor)']], 'ein') + '</select></div>' +
      '<div class="field"><label for="bv_start">Date the business started</label><input id="bv_start" type="date" required max="' + esc(today()) + '"></div></div>' +
      '<label class="row"><input type="checkbox" id="bv_docs"> I can show revenue records (bank statements, invoices or tax returns)</label>' +
      '<h3>Documents issuers often ask for</h3><ul><li>Business name, address and phone that match your registration</li><li>EIN letter or SSN, as applicable</li><li>Recent business bank statements</li><li>Proof of revenue or income you will state on the application</li></ul>' +
      '<label class="row"><input type="checkbox" id="bv_ok" required> ' + esc(ATTEST_TXT) + '</label>' +
      '<div class="row"><button class="btn" id="bv_go" type="submit" disabled>Confirm and continue</button></div></form></div>';
    var ok = document.getElementById('bv_ok'), go = document.getElementById('bv_go');
    ok.addEventListener('change', function () { go.disabled = !ok.checked; });
    document.getElementById('bvf').addEventListener('submit', function (e) {
      e.preventDefault();
      var st = document.getElementById('bv_start').value; if (!st || !ok.checked) return;
      var uid = S.user.id;
      sb.from('business_verification').upsert({ user_id: uid, entity_type: document.getElementById('bv_type').value, tax_id_path: document.getElementById('bv_tax').value,
        business_started_on: st, has_revenue_docs: document.getElementById('bv_docs').checked, updated_at: new Date().toISOString() }).then(function (r) {
        if (r.error) throw r.error;
        return sb.from('attestations').insert({ user_id: uid, version: ATTEST_V, statement: ATTEST_TXT });
      }).then(function (r) { if (r.error) throw r.error; return loadAll(); }).then(function () { flash('ok', 'Thanks. Your plan is ready.'); render(); })
        .catch(function (err) { fail(err); renderGate(); });
    });
  }
  function renderPlan() {
    if (!S.isStaff && !S.bv) return renderGate();
    var f = S.form, p = profileForEngine();
    var evals = E.applyPrequal(S.cards.map(function (c) { return E.evaluate(c, p); }), S.pq).sort(function (a, b) { return b.rank - a.rank; });
    var plan = E.buildPlan(evals, p);
    var h0 = flashHtml();
    var h = '<div class="panel"><h2>Your profile</h2><p class="sub">Ranges and counts only. Never enter your SSN, card numbers, or bureau logins. You can fill in the counts from your own Experian report below.</p><form id="pf">' +
      '<div class="grid">' +
      '<div class="field"><label for="f_score">Credit score range</label><select id="f_score">' + opts(SCORES, f.score) + '</select></div>' +
      '<div class="field"><label for="f_new24">New personal accounts, last 24 months</label><input id="f_new24" type="number" min="0" max="50" value="' + esc(f.new24) + '"></div>' +
      '<div class="field"><label for="f_amexHeld">Amex credit cards you hold</label><input id="f_amexHeld" type="number" min="0" max="20" value="' + esc(f.amexHeld) + '"></div>' +
      '<div class="field"><label for="f_amex90">Amex cards opened, last 90 days</label><input id="f_amex90" type="number" min="0" max="20" value="' + esc(f.amex90) + '"></div>' +
      '<div class="field"><label for="f_biz">Business age</label><select id="f_biz">' + opts(BIZ, f.biz) + '</select></div>' +
      '<div class="field"><label for="f_goal">Main goal</label><select id="f_goal">' + opts(GOALS, f.goal) + '</select></div>' +
      '<div class="field"><label for="f_plan">Cards in your plan</label><select id="f_plan">' + opts([[2, '2'], [3, '3'], [4, '4'], [5, '5']], f.plan) + '</select></div>' +
      '<div class="field"><label for="f_business_name">Business name (optional)</label><input id="f_business_name" type="text" maxlength="120" value="' + esc(f.business_name) + '"></div>' +
      '</div><div class="check"><input type="checkbox" id="f_relBofa"' + (f.relBofa ? ' checked' : '') + '><label for="f_relBofa" style="font-weight:400">I bank with Bank of America</label></div>' +
      '<div class="check"><input type="checkbox" id="f_relUsb"' + (f.relUsb ? ' checked' : '') + '><label for="f_relUsb" style="font-weight:400">I bank with U.S. Bank</label></div>' +
      '<button class="btn" type="submit">Save profile</button></form></div>';

    var I = window.Importer, imp = S.imp;
    var hp = '<details class="panel" id="impBox"' + (imp || S.impMsg ? ' open' : '') + '><summary><b>Fill in from my Experian report</b></summary>' +
      '<p class="sub" style="margin-top:8px">Download your report from Experian (free at annualcreditreport.com), then load it here. It is read in this browser only. It is never uploaded or saved, and ProStack never logs in to Experian or any bureau for you. Only the numbers you confirm go into your profile. Check every line against your report.</p>' +
      '<div class="check"><input type="checkbox" id="imp_ok"><label for="imp_ok" style="font-weight:400">I am choosing to load my own credit report for this purpose.</label></div>' +
      '<div class="field"><label for="imp_file">Report file (PDF or saved text)</label><input type="file" id="imp_file" accept=".pdf,.txt,.html,.htm"></div>' +
      '<div class="field"><label for="imp_text">Or paste the text of your report</label><textarea id="imp_text" rows="4"></textarea></div>' +
      '<button class="btn" id="imp_go" type="button" disabled>Read report</button>' + (S.impMsg ? '<div class="msg info" style="margin-top:10px">' + esc(S.impMsg) + '</div>' : '');
    if (imp) {
      var sm = I.summarize(imp.accounts);
      hp += '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Account</th><th>Opened (YYYY-MM-DD)</th><th>Card</th><th>Amex</th><th>Open</th><th></th></tr></thead><tbody id="impBody">' +
        imp.accounts.map(function (x, i) {
          return '<tr data-i="' + i + '"><td><input type="text" data-k="name" value="' + esc(x.name) + '" aria-label="Account name"></td><td><input type="text" data-k="opened" value="' + esc(x.opened) + '" style="width:120px" aria-label="Date opened"></td>' +
            '<td><input type="checkbox" data-k="card"' + (x.card ? ' checked' : '') + ' aria-label="Credit or charge card"></td><td><input type="checkbox" data-k="amex"' + (x.amex ? ' checked' : '') + ' aria-label="American Express"></td>' +
            '<td><input type="checkbox" data-k="open"' + (x.open ? ' checked' : '') + ' aria-label="Open"></td><td><button class="btn alt" type="button" data-act="drop">Remove</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p style="margin:10px 0"><b>New card accounts, 24 months:</b> ' + sm.new24 + ' &nbsp; <b>Amex cards held:</b> ' + sm.amexHeld + ' &nbsp; <b>Amex opened, 90 days:</b> ' + sm.amex90 +
        (imp.inq ? ' &nbsp; <span class="src">Hard inquiries, 24 months: ' + imp.inq + ' (for your information)</span>' : '') +
        (imp.score ? ' &nbsp; <span class="src">Score found: ' + imp.score + ' (range ' + I.bandFor(imp.score) + ')</span>' : '') + '</p>' +
        '<div class="row"><button class="btn" type="button" id="imp_use">Use these numbers</button><button class="btn alt" type="button" id="imp_clear">Discard</button></div>';
    }
    hp += '</details>';
    h = h0 + hp + h;
    var rd = E.readiness(p, { hasDocs: S.bv && S.bv.has_revenue_docs, pending: S.apps.filter(function (a) { return a.status === 'applied'; }).length,
      recentDenial: S.apps.some(function (a) { return a.status === 'denied' && a.decided_on && (new Date() - new Date(a.decided_on + 'T00:00:00')) / 86400000 < 30; }) });
    h += '<div class="panel"><h2>Readiness: ' + rd.score + ' / 100</h2><p class="sub">A simple checklist score, not a prediction of approval.</p>' + (rd.blocker ? '<p><b>Biggest blocker:</b> ' + esc(rd.blocker) + '</p>' : '<p>No blockers found from what you have entered.</p>') +
      '<details><summary>Documents issuers often ask for</summary><ul><li>Business name, address and phone matching your registration</li><li>EIN letter or SSN, as applicable</li><li>Recent business bank statements</li><li>Proof of the revenue or income you will state</li></ul></details></div>';
    h += '<div class="panel"><h2>Application plan</h2><p class="sub">Ordered so rule-sensitive issuers go first. Apply to one card, wait for the decision, then continue. Dates are suggested earliest times, not issuer requirements.</p>';
    if (!plan.length) h += '<p>No card clears the rules for this goal right now. Review the cards on hold below, or change your goal.</p>';
    else {
      h += '<ol class="steps">' + plan.map(function (s, i) {
        var c = s.e.card, extra = (S.form.goal === 'financing' && c.intro) ? ' · 0% for ' + c.intro + ' months' : '';
        return '<li><span class="when">' + (i === 0 ? 'Start ' : 'After ') + fmt(s.date.toISOString().slice(0, 10)) + '</span><div><b>' + esc(c.issuer + ' ' + c.name) + '</b><br><span class="pill ' + s.e.lik + '">' + esc(E.LABEL[s.e.lik]) + '</span>' + esc(extra) + ' <span class="src">· ' + esc(E.INQ_LABEL[c.inq] || E.INQ_LABEL.unknown) + '</span><div class="src">Issuer pre-approval check: <select data-pq="' + esc(c.id) + '" aria-label="Pre-approval result for ' + esc(c.name) + '">' + opts([['', 'Not checked'], ['approved', 'Shown pre-approved'], ['not_shown', 'Not shown / not pre-approved'], ['unavailable', 'No tool available']], S.pq[c.id] || '') + '</select></div></div></li>';
      }).join('') + '</ol><div class="row" style="margin-top:12px"><button class="btn" id="addPlan">Add this plan to my tracker</button></div>' +
        '<div class="callout"><b>Cut down on hard inquiries.</b> Before each step, look for a soft-pull pre-approval. Capital One offers one for business cards. Experian\'s "No Ding Decline" label, found in Experian\'s own card offers, limits the damage of a decline on certain personal cards; Experian does not say it covers business cards, so ask the issuer. ProStack is not affiliated with Experian. A pre-approval is not a guarantee, and applying still triggers a hard pull.</div><div class="callout">Check your actual credit report for new accounts and inquiries before each step. If a card is denied, stop and review the reason before applying elsewhere. Each denial costs a hard inquiry.</div>';
    }
    h += '</div>';
    [['Ready to consider', ['likely', 'possible']], ['Reach', ['reach', 'unlikely']], ['On hold', ['hold']]].forEach(function (g) {
      var list = evals.filter(function (e) { return g[1].indexOf(e.lik) >= 0; });
      if (!list.length) return;
      h += '<div class="panel"><h3>' + g[0] + ' (' + list.length + ')</h3>' + list.map(function (e) {
        var c = e.card;
        return '<article class="cardrow"><div class="issuer">' + esc(c.issuer) + '</div><h4>' + esc(c.name) + ' <span class="pill ' + e.lik + '">' + esc(E.LABEL[e.lik]) + '</span></h4>' +
          '<div class="facts-line"><span>Annual fee <b>' + feeText(c) + '</b></span><span>0% intro <b>' + introText(c) + '</b></span><span>Rewards <b>' + esc(c.rewards) + '</b></span><span>Credit check <b>' + esc(E.INQ_LABEL[c.inq] || E.INQ_LABEL.unknown) + '</b></span></div>' +
          '<ul class="reasons">' + e.flags.map(function (x) { return '<li class="' + esc(x.level) + '">' + esc(x.text) + '</li>'; }).join('') + '</ul>' +
          '<div class="src">Data confidence: ' + esc(c.conf) + '. ' + esc(c.note) + ' ' + (/^https?:\/\//.test(c.src) ? '<a href="' + esc(c.src) + '" target="_blank" rel="noopener noreferrer">Source</a>' : '') + '</div></article>';
      }).join('') + '</div>';
    });
    app.innerHTML = h;
    Array.prototype.forEach.call(app.querySelectorAll('select[data-pq]'), function (sel) {
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        sb.from('prequal_results').insert({ user_id: S.user.id, card_id: sel.dataset.pq, result: sel.value }).then(function (r) {
          if (r.error) fail(r.error); else flash('ok', 'Pre-approval result saved. Your plan has been updated.');
          return loadAll();
        }).then(function () { renderPlan(); });
      });
    });

    // report import (all in this browser; nothing is uploaded)
    (function () {
      var ok = document.getElementById('imp_ok'), go = document.getElementById('imp_go'), file = document.getElementById('imp_file'), txt = document.getElementById('imp_text');
      function can() { go.disabled = !ok.checked || !(file.files.length || txt.value.trim()); }
      [ok, file, txt].forEach(function (el) { el.addEventListener('input', can); el.addEventListener('change', can); });
      function pdfText(f) {
        if (!window.pdfjsLib) return Promise.reject(new Error('PDF reader unavailable'));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        return f.arrayBuffer().then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; }).then(function (doc) {
          var pages = [], chain = Promise.resolve();
          for (var i = 1; i <= Math.min(doc.numPages, 60); i++) (function (n) {
            chain = chain.then(function () { return doc.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (c) { pages.push(c.items.map(function (it) { return it.str; }).join(' ')); });
          })(i);
          return chain.then(function () { return pages.join('\n'); });
        });
      }
      go.onclick = function () {
        go.disabled = true; S.impMsg = 'Reading…';
        var f = file.files[0], p;
        if (f && f.size > 15 * 1024 * 1024) { S.impMsg = 'That file is too large. Try pasting the text instead.'; return renderPlan(); }
        if (f) p = /\.pdf$/i.test(f.name) ? pdfText(f) : f.text(); else p = Promise.resolve(txt.value);
        p.then(function (text) {
          var r = window.Importer.parseReport(text);
          text = null; txt.value = '';
          if (!r.accounts.length) { S.imp = null; S.impMsg = 'We could not find accounts in that report. Try pasting its text, or enter the numbers yourself below.'; }
          else { S.imp = { accounts: r.accounts, score: r.score, inq: r.hardInquiries24 }; S.impMsg = 'Found ' + r.accounts.length + ' accounts. Check each line, fix anything wrong, then use the numbers.'; }
          renderPlan();
        }).catch(function () { S.imp = null; S.impMsg = 'We could not read that file. Try pasting the text instead.'; renderPlan(); });
      };
      var body = document.getElementById('impBody');
      if (body) {
        body.addEventListener('change', function (e) {
          var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return;
          var x = S.imp.accounts[+tr.dataset.i]; x[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
          renderPlan();
        });
        body.addEventListener('click', function (e) {
          if (e.target.dataset.act !== 'drop') return;
          S.imp.accounts.splice(+e.target.closest('tr').dataset.i, 1); renderPlan();
        });
        document.getElementById('imp_use').onclick = function () {
          var sm = window.Importer.summarize(S.imp.accounts);
          sb.from('credit_data_log').insert({ user_id: S.user.id, kind: 'browser_import', consent_version: CFG.consentVersion }).then(function () {}, function () {});
          S.form.new24 = sm.new24; S.form.amexHeld = sm.amexHeld; S.form.amex90 = sm.amex90;
          if (S.imp.score) S.form.score = window.Importer.bandFor(S.imp.score);
          S.imp = null; S.impMsg = ''; flash('ok', 'Filled in from your report. The report itself was not kept. Review the numbers, then press Save profile.');
          renderPlan();
        };
        document.getElementById('imp_clear').onclick = function () { S.imp = null; S.impMsg = ''; renderPlan(); };
      }
    })();
    var form = document.getElementById('pf');
    function readForm() {
      ['score', 'new24', 'amexHeld', 'amex90', 'biz', 'goal', 'plan', 'business_name'].forEach(function (k) { S.form[k] = document.getElementById('f_' + k).value; });
      S.form.relBofa = document.getElementById('f_relBofa').checked; S.form.relUsb = document.getElementById('f_relUsb').checked;
    }
    form.addEventListener('change', function () { readForm(); renderPlan(); });
    form.onsubmit = function (e) {
      e.preventDefault(); readForm();
      var f = S.form, uid = S.user.id;
      Promise.all([
        sb.from('credit_profiles').upsert({ user_id: uid, score_band: +f.score, new_accounts_24m: Math.max(0, Math.min(50, +f.new24 || 0)), amex_credit_held: Math.max(0, Math.min(20, +f.amexHeld || 0)), amex_opened_90d: Math.max(0, Math.min(20, +f.amex90 || 0)), rel_bofa: !!f.relBofa, rel_usb: !!f.relUsb, goal: f.goal }, { onConflict: 'user_id' }),
        sb.from('profiles').update({ business_name: f.business_name || null, business_started_on: E.dateFromBiz(f.biz) }).eq('id', uid)
      ]).then(function (r) {
        var err = r[0].error || r[1].error;
        if (err) fail(err); else flash('ok', 'Profile saved.');
        return loadAll();
      }).then(function () { renderPlan(); }, function (e2) { fail(e2); renderPlan(); });
    };
    var add = document.getElementById('addPlan');
    if (add) add.onclick = function () {
      var existing = {}; S.apps.forEach(function (a) { if (a.status !== 'withdrawn' && a.status !== 'denied') existing[a.card_id] = 1; });
      var rows = plan.filter(function (s) { return !existing[s.e.card.id]; }).map(function (s) {
        return { user_id: S.user.id, card_id: s.e.card.id, status: 'planned', planned_on: s.date.toISOString().slice(0, 10), score_band: +S.form.score, new_accounts_24m: +S.form.new24 || 0 };
      });
      if (!rows.length) { flash('info', 'Those cards are already in your tracker.'); return renderPlan(); }
      sb.from('applications').insert(rows).then(function (r) {
        if (r.error) { fail(r.error); return renderPlan(); }
        flash('ok', rows.length + ' card' + (rows.length > 1 ? 's' : '') + ' added to your tracker.');
        return loadAll().then(function () { S.tab = 'tracker'; render(); });
      });
    };
  }

  /* ---------- tracker ---------- */
  function renderTracker() {
    var h = flashHtml() + '<div class="panel"><h2>Application tracker</h2><p class="sub">Record what actually happens at each issuer. Your own outcomes keep your plan honest. Only anonymized totals from groups of five or more are ever used to improve estimates.</p>';
    if (!S.apps.length) h += '<p>Nothing here yet. Build a plan and add it to your tracker.</p>';
    else {
      h += '<div class="tablewrap"><table><thead><tr><th>Card</th><th>Status</th><th>Applied</th><th>Decided</th><th>Limit</th><th>Notes</th><th>Bureau pulled</th><th></th></tr></thead><tbody>';
      S.apps.forEach(function (a) {
        var c = cardById(a.card_id), id = esc(a.id), ends = a.intro_ends_on ? '<div class="src">0% ends ' + esc(fmt(a.intro_ends_on)) + '</div>' : '';
        h += '<tr data-id="' + id + '"><td><b>' + esc(cardName(a.card_id)) + '</b>' + (a.planned_on ? '<div class="src">Planned ' + esc(fmt(a.planned_on)) + '</div>' : '') + ends + '</td>' +
          '<td><select data-f="status" aria-label="Status">' + opts(STATUSES.map(function (s) { return [s, s]; }), a.status) + '</select></td>' +
          '<td><input type="date" data-f="applied_on" value="' + esc(a.applied_on || '') + '" aria-label="Applied on"></td>' +
          '<td><input type="date" data-f="decided_on" value="' + esc(a.decided_on || '') + '" aria-label="Decided on"></td>' +
          '<td><input type="number" min="0" step="100" data-f="credit_limit" value="' + esc(a.credit_limit == null ? '' : a.credit_limit) + '" aria-label="Credit limit"' + (a.status === 'approved' ? '' : ' disabled') + '></td>' +
          '<td><input type="text" maxlength="200" data-f="denial_reason" placeholder="Denial reason / note" value="' + esc(a.denial_reason || '') + '" aria-label="Denial reason or note"></td>' +
          '<td><select data-f="bureau_pulled" aria-label="Credit bureau pulled">' + opts([['', 'Unknown'], ['experian', 'Experian'], ['equifax', 'Equifax'], ['transunion', 'TransUnion']], a.bureau_pulled || '') + '</select></td>' +
          '<td class="row"><button class="btn" data-act="save">Save</button><button class="btn alt" data-act="del">Remove</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    var pend = S.apps.filter(function (a) { return a.status === 'applied' && a.applied_on && (new Date() - new Date(a.applied_on + 'T00:00:00')) / 86400000 >= 7; });
    if (pend.length) {
      h += '<div class="panel"><h2>Waiting on a decision</h2><ul>' + pend.map(function (a) { return '<li><b>' + esc(cardName(a.card_id)) + '</b>, applied ' + esc(fmt(a.applied_on)) + '</li>'; }).join('') +
        '</ul><p class="sub">Many issuers decide within about 7 to 10 business days, and some ask for documents first. Check your mail and email, including spam. Then use the status number on your application confirmation. You can say: "I applied on [date] and have not heard back. Can you tell me the status and whether you need anything from me?" Do not apply for another card while this one is open.</p></div>';
    }
    var appr = S.apps.filter(function (a) { return a.status === 'approved'; });
    if (appr.length) {
      h += '<div class="panel"><h2>Welcome bonus spending</h2><p class="sub">Spend only on real business expenses. Do not buy gift cards, pay yourself, or move money around to reach a minimum; issuers watch for that and may close the account. Dates count from your approval date and are estimates. Check your offer terms.</p><div class="tablewrap"><table id="spendTbl"><thead><tr><th>Card</th><th>Bonus goal</th><th>Spent so far ($)</th><th>Statement closes (day of month)</th><th></th></tr></thead><tbody>' +
        appr.map(function (a) {
          var c = cardById(a.card_id), sp = Advisor.spendProgress(a, c), goal = sp ? ('Spend ' + money(sp.target) + ' by ' + fmt(sp.ends) + (sp.state === 'met' ? ' (met)' : sp.state === 'missed' ? ' (window passed)' : ' (' + sp.daysLeft + ' days left' + (sp.perWeek ? ', about ' + money(sp.perWeek) + ' a week' : '') + ')')) : 'No spend minimum on file';
          return '<tr data-id="' + esc(a.id) + '"><td><b>' + esc(cardName(a.card_id)) + '</b></td><td>' + esc(goal) + (sp && sp.state === 'behind' ? '<div class="src">You may be behind. Only count real business spending.</div>' : '') + '</td>' +
            '<td><input type="number" min="0" step="50" data-f="spend_so_far" value="' + esc(a.spend_so_far == null ? '' : a.spend_so_far) + '" aria-label="Spent so far"></td>' +
            '<td><input type="number" min="1" max="31" data-f="statement_day" value="' + esc(a.statement_day == null ? '' : a.statement_day) + '" aria-label="Statement closing day"></td>' +
            '<td class="row"><button class="btn" data-act="spendsave">Save</button></td></tr>';
        }).join('') + '</tbody></table></div><button class="btn alt" id="stmtBtn">Download statement reminders (.ics)</button><p class="src">Monthly reminder 3 days before each statement closes. Paying down before then lowers the balance reported to the bureaus.</p></div>';
    }
    var aged = appr.filter(function (a) { return a.decided_on && (new Date() - new Date(a.decided_on + 'T00:00:00')) / 86400000 >= 180; });
    if (aged.length) {
      h += '<div class="panel"><h2>Ask about a higher credit limit</h2><p class="sub">These cards are at least 6 months old. Before you ask, call the issuer and ask whether a limit request uses a soft or a hard credit check. Requests can be declined, and a decline is not a sign of a problem with the account.</p><ul>' +
        aged.map(function (a) { return '<li><b>' + esc(cardName(a.card_id)) + '</b>, opened ' + esc(fmt(a.decided_on)) + '</li>'; }).join('') + '</ul></div>';
    }
    var up = Advisor.upcoming(S.apps.filter(function (a) { return a.status === 'approved' && a.intro_ends_on; }).map(function (a) { return { card: cardName(a.card_id), ends: a.intro_ends_on }; }));
    if (up.length) {
      h += '<div class="panel"><h2>Upcoming 0% endings</h2><p class="sub">Dates are estimates from your approval date. Confirm on your statement.</p><ul>' +
        up.map(function (u) { return '<li><b>' + esc(u.card) + '</b>: ' + esc(fmt(u.ends)) + ' (' + (u.days < 0 ? 'ended' : u.days === 0 ? 'today' : u.days + ' days') + ')</li>'; }).join('') +
        '</ul><button class="btn" id="icsBtn">Download calendar reminders (.ics)</button><p class="src">Adds reminders 30 and 7 days before each date. The file is made in your browser.</p></div>';
    }
    var den = S.apps.filter(function (a) { return a.status === 'denied'; });
    if (den.length) {
      h += '<div class="panel"><h2>Understand a denial letter</h2><p class="sub">Paste the reasons from your letter. This runs in your browser; the text is not saved or sent anywhere. It cannot promise a reconsideration will succeed.</p>' +
        '<label>Which application<select id="dl_app">' + den.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(cardName(a.card_id)) + '</option>'; }).join('') + '</select></label>' +
        '<label>Letter text<textarea id="dl_text" rows="5" maxlength="6000"></textarea></label>' +
        '<div class="row"><button class="btn" id="dl_go">Read it</button></div><div id="dl_out"></div></div>';
    }
    app.innerHTML = h;
    var sb2 = document.getElementById('stmtBtn');
    if (sb2) sb2.addEventListener('click', function () {
      var list = S.apps.filter(function (a) { return a.status === 'approved' && a.statement_day; }).map(function (a) { return { card: cardName(a.card_id), day: a.statement_day }; });
      if (!list.length) { flash('err', 'Enter a statement closing day on at least one card first.'); return renderTracker(); }
      var blob = new Blob([Advisor.buildStatementIcs(list)], { type: 'text/calendar' }), u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = 'prostack-statement-reminders.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    });
    var st = document.getElementById('spendTbl');
    if (st) st.addEventListener('click', function (e) {
      if (e.target.dataset.act !== 'spendsave') return;
      var tr = e.target.closest('tr'), id = tr.dataset.id;
      function val(f) { return tr.querySelector('[data-f=' + f + ']').value; }
      var upd = { spend_so_far: val('spend_so_far') === '' ? null : Math.max(0, +val('spend_so_far')), statement_day: val('statement_day') === '' ? null : Math.min(31, Math.max(1, Math.round(+val('statement_day')))) };
      sb.from('applications').update(upd).eq('id', id).then(function (r) {
        if (r.error) fail(r.error); else flash('ok', 'Saved.');
        return loadAll();
      }).then(function () { renderTracker(); });
    });
    var ib = document.getElementById('icsBtn');
    if (ib) ib.addEventListener('click', function () {
      var blob = new Blob([Advisor.buildIcs(up)], { type: 'text/calendar' }), u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = 'prostack-reminders.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    });
    var dg = document.getElementById('dl_go');
    if (dg) dg.addEventListener('click', function () {
      var r = Advisor.readDenial(document.getElementById('dl_text').value), out = document.getElementById('dl_out');
      if (!r.reasons.length) { out.innerHTML = '<p>' + esc(Advisor.NO_MATCH) + '</p>'; return; }
      out.innerHTML = '<ul>' + r.reasons.map(function (x) { return '<li><b>' + esc(x.label) + '.</b> ' + esc(x.next) + '</li>'; }).join('') + '</ul>' +
        '<p class="src">You can call the issuer and ask for a second look. Results vary and approval is never guaranteed.</p><button class="btn alt" id="dl_use">Put reasons in my notes</button>';
      document.getElementById('dl_use').addEventListener('click', function () {
        var tr = app.querySelector('tr[data-id="' + document.getElementById('dl_app').value + '"]');
        if (tr) { S.reasonsFor = S.reasonsFor || {}; S.reasonsFor[tr.dataset.id] = r.reasons.map(function (x) { return x.key; }); tr.querySelector('[data-f=denial_reason]').value = r.summary; out.insertAdjacentHTML('beforeend', '<p class="msg ok" role="status">Added to the notes. Press Save on that row to keep it.</p>'); }
      });
    });
    var tbody = app.querySelector('tbody'); if (!tbody) return;
    tbody.addEventListener('change', function (e) {
      if (e.target.dataset.f !== 'status') return;
      var tr = e.target.closest('tr'), st = e.target.value;
      var lim = tr.querySelector('[data-f=credit_limit]'); lim.disabled = st !== 'approved'; if (st !== 'approved') lim.value = '';
      if (st === 'applied' && !tr.querySelector('[data-f=applied_on]').value) tr.querySelector('[data-f=applied_on]').value = today();
      if ((st === 'approved' || st === 'denied') && !tr.querySelector('[data-f=decided_on]').value) tr.querySelector('[data-f=decided_on]').value = today();
    });
    tbody.addEventListener('click', function (e) {
      var act = e.target.dataset.act; if (!act) return;
      var tr = e.target.closest('tr'), id = tr.dataset.id;
      function v(f) { return tr.querySelector('[data-f=' + f + ']').value; }
      if (act === 'del') {
        return sb.from('applications').delete().eq('id', id).then(function (r) {
          if (r.error) fail(r.error); else flash('ok', 'Removed.');
          return loadAll();
        }).then(function () { renderTracker(); });
      }
      var a = S.apps.filter(function (x) { return x.id === id; })[0], c = a && cardById(a.card_id), st = v('status');
      var limit = st === 'approved' && v('credit_limit') !== '' ? Math.max(0, +v('credit_limit')) : null;
      var decided = v('decided_on') || null;
      var upd = { status: st, applied_on: v('applied_on') || null, decided_on: decided, credit_limit: limit, denial_reason: v('denial_reason') || null, bureau_pulled: v('bureau_pulled') || null, adverse_reasons: (S.reasonsFor && S.reasonsFor[id]) || (a && a.adverse_reasons) || null,
        intro_ends_on: (st === 'approved' && decided && c && c.intro > 0) ? E.addMonths(new Date(decided + 'T00:00:00'), c.intro).toISOString().slice(0, 10) : null };
      sb.from('applications').update(upd).eq('id', id).then(function (r) {
        if (r.error) fail(r.error); else flash('ok', 'Saved.');
        return loadAll();
      }).then(function () { renderTracker(); });
    });
  }

  /* ---------- repayment ---------- */
  function renderRepay() {
    var amt = S.repay ? Number(S.repay.amount) : 25000, mo = S.repay ? S.repay.months : 12;
    var p = profileForEngine();
    var plan = E.buildPlan(S.cards.map(function (c) { return E.evaluate(c, p); }), p);
    var h = flashHtml() + '<div class="panel"><h2>Repayment planner</h2><p class="sub">Work out the payoff before you spend. Missing a minimum payment can end a 0% period early.</p>' +
      '<form id="rf" class="grid"><div class="field"><label for="r_amt">Amount you plan to borrow ($)</label><input id="r_amt" type="number" min="500" step="500" value="' + esc(amt) + '"></div>' +
      '<div class="field"><label for="r_mo">Months to pay off</label><input id="r_mo" type="number" min="1" max="60" value="' + esc(mo) + '"></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn" type="submit">Save plan</button></div></form><p id="mline" class="sub"></p>' +
      '<div class="tablewrap"><table><thead><tr><th>Card</th><th>Covers your payoff?</th><th>Est. interest if on this card</th></tr></thead><tbody id="rt"></tbody></table></div>' +
      '<div class="callout">Interest figures use the middle of each card\'s published APR range (22% when unknown) and are rough illustrations. Issuers set actual limits and rates.</div></div>';
    app.innerHTML = h;
    function calc() {
      var a = Math.max(500, +document.getElementById('r_amt').value || 0), m = Math.max(1, Math.min(60, +document.getElementById('r_mo').value || 12));
      document.getElementById('mline').textContent = 'Even payments of ' + money(a / m) + ' per month over ' + m + ' months.';
      document.getElementById('rt').innerHTML = !plan.length ? '<tr><td colspan="3">Build a plan first.</td></tr>' : plan.map(function (s) {
        var c = s.e.card, apr = c.aprHigh != null ? (c.aprLow + c.aprHigh) / 2 : 22, cover, intr;
        if (c.intro == null) { cover = 'Verify the 0% period'; intr = 'Unknown'; }
        else if (c.intro === 0) { cover = 'No 0% period'; intr = c.type === 'charge' ? 'Pay in full each month' : 'About ' + money(E.simulate(a, m, 0, apr).interest); }
        else if (c.intro >= m) { cover = 'Yes (' + c.intro + ' mo)' + (c.introVerify ? ', verify' : ''); intr = '$0'; }
        else { cover = 'Short by ' + (m - c.intro) + ' mo'; intr = 'About ' + money(E.simulate(a, m, c.intro, apr).interest); }
        return '<tr><td>' + esc(c.issuer + ' ' + c.name) + '</td><td>' + esc(cover) + '</td><td>' + esc(intr) + '</td></tr>';
      }).join('');
    }
    document.getElementById('rf').addEventListener('input', calc); calc();
    document.getElementById('rf').onsubmit = function (e) {
      e.preventDefault();
      var a = Math.max(500, +document.getElementById('r_amt').value || 0), m = Math.max(1, Math.min(60, Math.round(+document.getElementById('r_mo').value) || 12));
      sb.from('repayment_plans').insert({ user_id: S.user.id, amount: a, months: m }).then(function (r) {
        if (r.error) fail(r.error); else flash('ok', 'Repayment plan saved.');
        return loadAll();
      }).then(function () { renderRepay(); });
    };
  }

  /* ---------- account ---------- */
  function renderAccount() {
    app.innerHTML = flashHtml() + '<div class="panel"><h2>Account</h2><p class="sub">Signed in as ' + esc(S.user.email) + '</p>' +
      '<div class="row"><button class="btn" id="exp">Download my data (JSON)</button><button class="btn alt" id="so">Sign out</button></div></div>' +
      '<div class="panel"><h3>Change password</h3><div class="row"><button class="btn alt" id="chpw">Change my password</button></div></div>' +
      '<div class="panel"><h3>Delete my data</h3><p class="sub">Removes your credit profile, tracker entries, existing-card records and repayment plans. Your consent record and login stay so we can show what you agreed to; contact support to close the login itself.</p>' +
      '<button class="btn danger" id="del">Delete my data</button></div>';
    document.getElementById('so').onclick = function () { sb.auth.signOut(); };
    document.getElementById('chpw').onclick = function () { S.recovery = true; render(); };
    document.getElementById('exp').onclick = function () {
      var blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), email: S.user.email, profile: S.profile, credit_profile: S.credit, applications: S.apps, repayment_plan: S.repay, consents: S.consents }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'prostack-my-data.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    document.getElementById('del').onclick = function () {
      if (!window.confirm('Delete your credit profile, tracker and repayment plans? This cannot be undone.')) return;
      var uid = S.user.id;
      Promise.all(['applications', 'user_cards', 'repayment_plans', 'credit_profiles'].map(function (t) { return sb.from(t).delete().eq('user_id', uid); })
        .concat([sb.from('profiles').update({ business_name: null, business_started_on: null, full_name: null, state: null, business_type: null }).eq('id', uid)]))
        .then(function (r) {
          var err = r.map(function (x) { return x.error; }).filter(Boolean)[0];
          if (err) fail(err); else flash('ok', 'Your data was deleted.');
          return loadAll();
        }).then(function () { S.form = formFromState(); renderAccount(); });
    };
  }


  /* ---------- staff dashboard ---------- */
  var CONF = [['high', 'high'], ['medium', 'medium'], ['low', 'low']];
  function numOrNull(v) { return v === '' || v == null ? null : Number(v); }
  function rpcMsg(code) {
    return { ok: 'Done.', no_such_user: 'No account with that email. They must sign up at the portal first.', cannot_remove_self: 'You cannot remove yourself.', cannot_demote_self: 'You cannot lower your own role.', not_found: 'That person is not staff.' }[code] || String(code);
  }
  function renderStaff() {
    if (!S.isStaff) { S.tab = 'plan'; return render(); }
    var fl = flashHtml();
    app.innerHTML = fl + '<div class="panel"><p>Loading dashboard…</p></div>';
    var none = Promise.resolve({ data: [] });
    Promise.all([
      sb.rpc('staff_overview'),
      sb.rpc('card_outcome_summary', { min_group: 5 }),
      sb.from('cards').select('*').order('issuer').order('name'),
      sb.from('issuer_rules').select('*').order('issuer').order('id'),
      S.isAdmin ? sb.rpc('staff_list') : none,
      sb.from('catalog_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
      sb.rpc('rules_stale', { max_days: 60 }),
      sb.from('rule_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(50)
    ]).then(function (r) {
      for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
      var o = r[0].data || {}, out = r[1].data || [], cat = r[2].data || [], rules = r[3].data || [], team = r[4].data || [], props = r[5].data || [], stale = r[6].data || [], rprops = r[7].data || [], st = o.by_status || {};
      function tile(label, val) { return '<div class="panel" style="margin:0"><div class="sub" style="margin:0">' + esc(label) + '</div><div style="font:600 28px var(--serif)">' + esc(val == null ? 0 : val) + '</div></div>'; }
      var decided = (st.approved || 0) + (st.denied || 0), rate = decided ? Math.round(100 * (st.approved || 0) / decided) + '%' : 'n/a';
      var h = fl + '<div class="panel"><h2>Staff dashboard</h2><p class="sub">Counts only. Individual client records are never shown here.</p>' +
        '<div class="grid">' + tile('Clients', o.clients) + tile('New this week', o.signups_7d) + tile('With a credit profile', o.with_credit_profile) +
        tile('Applications tracked', o.applications) + tile('Planned', st.planned) + tile('Applied', st.applied) + tile('Approved', st.approved) + tile('Denied', st.denied) + tile('Approval rate (decided)', rate) + '</div></div>';
      h += '<div class="panel"><h3>Outcomes by card and score band</h3><p class="sub">Groups with fewer than 5 decisions are hidden to protect privacy.</p>';
      if (!out.length) h += '<p>Not enough decisions yet. Rows appear once a card and score band has 5 or more.</p>';
      else {
        h += '<div class="tablewrap"><table><thead><tr><th>Card</th><th>Score band</th><th>Decisions</th><th>Approved</th><th>Denied</th><th>Approval rate</th><th>Avg limit</th></tr></thead><tbody>' +
          out.map(function (x) { return '<tr><td>' + esc(cardName(x.card_id)) + '</td><td>' + esc(x.score_band == null ? 'n/a' : x.score_band) + '</td><td>' + esc(x.decisions) + '</td><td>' + esc(x.approvals) + '</td><td>' + esc(x.denials) + '</td><td>' + (x.decisions ? Math.round(100 * x.approvals / x.decisions) + '%' : 'n/a') + '</td><td>' + (x.avg_limit == null ? 'n/a' : money(x.avg_limit)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }
      // proposals from the local checker
      h += '</div><div class="panel"><h3>Proposed catalog changes</h3><p class="sub">Filed by the checker that runs on your own computer with your local Hermes model. Nothing changes until you approve. Read the evidence before approving: a local model can misread a page.</p>';
      if (!props.length) h += '<p>No proposals waiting.</p>';
      else h += '<div class="tablewrap"><table><thead><tr><th>Card</th><th>Proposed change</th><th>Evidence</th><th>Filed</th><th></th></tr></thead><tbody id="propBody">' +
        props.map(function (p) {
          var cur = null; for (var i = 0; i < cat.length; i++) if (cat[i].id === p.card_id) cur = cat[i];
          var diff = Object.keys(p.changes || {}).map(function (k) { return '<div><b>' + esc(k) + '</b>: ' + esc(cur && cur[k] != null ? cur[k] : 'none') + ' \u2192 ' + esc(p.changes[k]) + '</div>'; }).join('');
          return '<tr data-id="' + esc(p.id) + '"><td><b>' + esc(cardName(p.card_id)) + '</b><div class="src">' + esc(p.model || '') + '</div></td><td>' + diff + '</td><td class="src">' + esc(p.evidence || '') + '</td><td>' + esc(fmt(p.created_at)) + '</td>' +
            '<td class="row"><button class="btn" data-act="approve">Approve</button><button class="btn alt" data-act="reject">Reject</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      // issuer rules: freshness + Hermes proposals
      h += '</div><div class="panel"><h3>Issuer rules to re-verify (' + stale.length + ')</h3><p class="sub">Rules not verified in 60 days. Hermes can draft a proposal from the source page; you decide.</p>';
      if (!stale.length) h += '<p>Every active rule was verified in the last 60 days.</p>';
      else h += '<div class="tablewrap"><table><thead><tr><th>Issuer</th><th>Rule</th><th>Last verified</th></tr></thead><tbody>' + stale.map(function (x) { return '<tr><td>' + esc(x.issuer) + '</td><td>' + esc(x.rule_name) + '</td><td>' + esc(x.verified_on ? fmt(x.verified_on) : 'never') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      h += '<h3>Proposed rule changes</h3>';
      if (!rprops.length) h += '<p>No rule proposals waiting.</p>';
      else h += '<div class="tablewrap"><table><thead><tr><th>Rule</th><th>Proposed change</th><th>Evidence</th><th></th></tr></thead><tbody id="rpBody">' + rprops.map(function (p) {
        var cur = rules.filter(function (x) { return x.id === p.rule_id; })[0] || {};
        return '<tr data-id="' + esc(p.id) + '"><td><b>' + esc(cur.issuer || '') + '</b> ' + esc(cur.rule_name || '') + '</td><td>' + Object.keys(p.changes || {}).map(function (k) { return '<div><b>' + esc(k) + '</b>: ' + esc(cur[k] == null ? 'none' : cur[k]) + ' \u2192 ' + esc(p.changes[k]) + '</div>'; }).join('') + '</td><td class="src">' + esc(p.evidence || '') + '</td>' +
          '<td class="row"><button class="btn" data-act="approve">Approve</button><button class="btn alt" data-act="still_current">Still current</button><button class="btn alt" data-act="reject">Reject</button></td></tr>';
      }).join('') + '</tbody></table></div>';
      h += '<div class="row"><button class="btn alt" id="bmRefresh">Refresh bureau map from outcomes</button></div>';
      // catalog editor
      h += '</div><div class="panel"><h3>Card catalog</h3><p class="sub">Edit terms as issuers change them. Update the verified date whenever you confirm them. Inactive cards are hidden from clients. Cards are never deleted; mark them inactive.</p><div class="tablewrap"><table><thead><tr><th>Card</th><th>Fee</th><th>0% mo</th><th>APR text</th><th>Welcome offer</th><th>Conf.</th><th>Verified</th><th>Active</th><th></th></tr></thead><tbody id="catBody">' +
        cat.map(function (c) {
          return '<tr data-id="' + esc(c.id) + '"><td><b>' + esc(c.name) + '</b><div class="src">' + esc(c.issuer) + '</div></td>' +
            '<td><input type="number" min="0" step="1" data-f="annual_fee" value="' + esc(c.annual_fee == null ? '' : c.annual_fee) + '" style="width:80px" aria-label="Annual fee"></td>' +
            '<td><input type="number" min="0" max="36" step="1" data-f="intro_months" value="' + esc(c.intro_months == null ? '' : c.intro_months) + '" style="width:70px" aria-label="Intro months"></td>' +
            '<td><input type="text" data-f="apr_text" value="' + esc(c.apr_text || '') + '" aria-label="APR text"></td>' +
            '<td><input type="text" data-f="welcome_bonus" value="' + esc(c.welcome_bonus || '') + '" aria-label="Welcome offer"></td>' +
            '<td><select data-f="confidence" aria-label="Confidence">' + opts(CONF, c.confidence) + '</select></td>' +
            '<td><input type="text" data-f="source_date" value="' + esc(c.source_date || '') + '" style="width:90px" aria-label="Verified date"></td>' +
            '<td><input type="checkbox" data-f="is_active"' + (c.is_active ? ' checked' : '') + ' aria-label="Active"></td>' +
            '<td><button class="btn" data-act="save">Save</button></td></tr>';
        }).join('') + '</tbody></table></div></div>';
      // add card
      h += '<div class="panel"><h3>Add a card</h3><p class="sub">New cards appear in clients\' plans straight away. Use the issuer\'s published terms and set confidence honestly.</p><details><summary>Open the form</summary><form id="newCard" style="margin-top:12px"><div class="grid">' +
        '<div class="field"><label for="nc_id">ID (lowercase letters, numbers, underscores)</label><input id="nc_id" type="text" pattern="[a-z0-9_]{3,60}" required></div>' +
        '<div class="field"><label for="nc_issuer">Issuer</label><input id="nc_issuer" type="text" required></div>' +
        '<div class="field"><label for="nc_name">Card name</label><input id="nc_name" type="text" required></div>' +
        '<div class="field"><label for="nc_type">Type</label><select id="nc_type">' + opts([['credit', 'Credit'], ['charge', 'Charge (pay in full)']], 'credit') + '</select></div>' +
        '<div class="field"><label for="nc_fee">Annual fee ($, blank if unknown)</label><input id="nc_fee" type="number" min="0" step="1"></div>' +
        '<div class="field"><label for="nc_intro">0% intro months (0 = none, blank = unknown)</label><input id="nc_intro" type="number" min="0" max="36" step="1"></div>' +
        '<div class="field"><label for="nc_aprlow">Regular APR low (%)</label><input id="nc_aprlow" type="number" min="0" max="99" step="0.01"></div>' +
        '<div class="field"><label for="nc_aprhigh">Regular APR high (%)</label><input id="nc_aprhigh" type="number" min="0" max="99" step="0.01"></div>' +
        '<div class="field"><label for="nc_aprtext">APR text</label><input id="nc_aprtext" type="text"></div>' +
        '<div class="field"><label for="nc_rewards">Rewards</label><input id="nc_rewards" type="text"></div>' +
        '<div class="field"><label for="nc_bonus">Welcome offer</label><input id="nc_bonus" type="text"></div>' +
        '<div class="field"><label for="nc_tier">Approval tier (1 easier, 3 harder)</label><select id="nc_tier">' + opts([[1, '1'], [2, '2'], [3, '3']], 2) + '</select></div>' +
        '<div class="field"><label for="nc_conf">Data confidence</label><select id="nc_conf">' + opts(CONF, 'medium') + '</select></div>' +
        '<div class="field"><label for="nc_fit_financing">Fit for financing (0-5)</label><input id="nc_fit_financing" type="number" min="0" max="5" step="1" value="0"></div>' +
        '<div class="field"><label for="nc_fit_cashback">Fit for cash back (0-5)</label><input id="nc_fit_cashback" type="number" min="0" max="5" step="1" value="0"></div>' +
        '<div class="field"><label for="nc_fit_travel">Fit for travel (0-5)</label><input id="nc_fit_travel" type="number" min="0" max="5" step="1" value="0"></div>' +
        '<div class="field"><label for="nc_src">Source URL (https://)</label><input id="nc_src" type="text"></div>' +
        '<div class="field"><label for="nc_date">Verified date (e.g. 2026-11)</label><input id="nc_date" type="text"></div>' +
        '</div><div class="field"><label for="nc_note">Note for clients</label><input id="nc_note" type="text"></div>' +
        '<div class="check"><input type="checkbox" id="nc_introverify"><label for="nc_introverify" style="font-weight:400">The intro period needs verification</label></div>' +
        '<div class="check"><input type="checkbox" id="nc_personal"><label for="nc_personal" style="font-weight:400">Can report to personal credit</label></div>' +
        '<button class="btn" type="submit">Add card</button></form></details></div>';
      // issuer rules
      h += '<div class="panel"><h3>Issuer rules</h3><p class="sub">The reported rules shown with each card. Mark a rule inactive to hide it.</p><div class="tablewrap"><table><thead><tr><th>Issuer</th><th>Rule</th><th>Description</th><th>Applies to</th><th>Conf.</th><th>Active</th><th></th></tr></thead><tbody id="ruleBody">' +
        rules.map(function (x) {
          return '<tr data-id="' + esc(x.id) + '"><td>' + esc(x.issuer) + '</td><td>' + esc(x.rule_name) + '</td>' +
            '<td><input type="text" data-f="description" value="' + esc(x.description) + '" aria-label="Description"></td>' +
            '<td><input type="text" data-f="applies_to" value="' + esc(x.applies_to || '') + '" aria-label="Applies to"></td>' +
            '<td><select data-f="confidence" aria-label="Confidence">' + opts(CONF, x.confidence) + '</select></td>' +
            '<td><input type="checkbox" data-f="is_active"' + (x.is_active ? ' checked' : '') + ' aria-label="Active"></td>' +
            '<td><button class="btn" data-act="save">Save</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<details style="margin-top:14px"><summary>Add a rule</summary><form id="newRule" style="margin-top:12px"><div class="grid">' +
        '<div class="field"><label for="nr_issuer">Issuer</label><input id="nr_issuer" type="text" required></div>' +
        '<div class="field"><label for="nr_name">Rule name</label><input id="nr_name" type="text" required></div>' +
        '<div class="field"><label for="nr_applies">Applies to</label><input id="nr_applies" type="text"></div>' +
        '<div class="field"><label for="nr_type">Rule type (published, unwritten, reported)</label><input id="nr_type" type="text"></div>' +
        '<div class="field"><label for="nr_conf">Confidence</label><select id="nr_conf">' + opts(CONF, 'medium') + '</select></div>' +
        '<div class="field"><label for="nr_src">Source URL</label><input id="nr_src" type="text"></div></div>' +
        '<div class="field"><label for="nr_desc">Description</label><input id="nr_desc" type="text" required></div><button class="btn" type="submit">Add rule</button></form></details></div>';
      // staff access (admins only)
      if (S.isAdmin) {
        h += '<div class="panel"><h3>Staff access</h3><p class="sub">Staff can see aggregate statistics and edit the catalog and rules. Admins can also manage staff. People must have signed up at the portal first. Every change is logged.</p>' +
          '<div class="tablewrap"><table><thead><tr><th>Email</th><th>Role</th><th>Since</th><th></th></tr></thead><tbody id="teamBody">' +
          team.map(function (m) {
            var me = m.user_id === S.user.id;
            return '<tr data-id="' + esc(m.user_id) + '"><td>' + esc(m.email) + (me ? ' (you)' : '') + '</td><td>' + esc(m.role) + '</td><td>' + esc(fmt(m.created_at)) + '</td><td class="row">' +
              (me ? '' : '<button class="btn alt" data-act="role" data-email="' + esc(m.email) + '" data-role="' + (m.role === 'admin' ? 'analyst' : 'admin') + '">Make ' + (m.role === 'admin' ? 'analyst' : 'admin') + '</button><button class="btn danger" data-act="remove">Remove</button>') + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<form id="addStaff" class="row" style="margin-top:14px"><div class="field" style="margin:0"><label for="as_email">Email</label><input id="as_email" type="email" required></div>' +
          '<div class="field" style="margin:0"><label for="as_role">Role</label><select id="as_role">' + opts([['analyst', 'Analyst'], ['admin', 'Admin']], 'analyst') + '</select></div>' +
          '<button class="btn" type="submit" style="align-self:flex-end">Add staff</button></form></div>';
      }
      app.innerHTML = h;
      wireStaff();
    }).catch(function (err) { fail(err); app.innerHTML = flashHtml() + '<div class="panel"><p>Could not load the dashboard.</p></div>'; });
  }
  function wireStaff() {
    function done(res, okText) {
      var err = res && res.error;
      if (err) fail(err); else flash('ok', okText);
      return loadAll().then(function () { renderStaff(); });
    }
    function afterRpc(res, okText) {
      if (res.error) fail(res.error); else if (res.data !== 'ok') flash('err', rpcMsg(res.data)); else flash('ok', okText);
      return loadAll().then(function () { renderStaff(); });
    }
    var rp = document.getElementById('rpBody');
    if (rp) rp.addEventListener('click', function (e) {
      var act = e.target.dataset.act; if (['approve', 'reject', 'still_current'].indexOf(act) < 0) return;
      sb.rpc('staff_review_rule_proposal', { p_id: +e.target.closest('tr').dataset.id, p_action: act }).then(function (res) {
        if (res.error) fail(res.error); else if (res.data !== 'ok') flash('err', String(res.data)); else flash('ok', 'Done. The rule was updated and its version history kept.');
        return loadAll().then(function () { renderStaff(); });
      });
    });
    var bm = document.getElementById('bmRefresh');
    if (bm) bm.addEventListener('click', function () {
      sb.rpc('bureau_map_refresh').then(function (res) {
        if (res.error) fail(res.error); else flash('ok', 'Bureau map refreshed for ' + res.data + ' issuer(s). Only issuers with 5+ outcomes are included.');
        renderStaff();
      });
    });
    var pb = document.getElementById('propBody');
    if (pb) pb.addEventListener('click', function (e) {
      var act = e.target.dataset.act; if (act !== 'approve' && act !== 'reject') return;
      var id = e.target.closest('tr').dataset.id;
      sb.rpc('staff_review_proposal', { p_id: +id, p_action: act }).then(function (res) {
        if (res.error) fail(res.error);
        else if (res.data !== 'ok') flash('err', { bad_field: 'That proposal has a field that cannot be changed this way.', already_reviewed: 'Someone already reviewed that one.', not_found: 'That proposal no longer exists.' }[res.data] || String(res.data));
        else flash('ok', act === 'approve' ? 'Approved. The catalog is updated.' : 'Rejected.');
        return loadAll().then(function () { renderStaff(); });
      });
    });
    document.getElementById('catBody').addEventListener('click', function (e) {
      if (e.target.dataset.act !== 'save') return;
      var tr = e.target.closest('tr'), id = tr.dataset.id;
      function f(k) { return tr.querySelector('[data-f=' + k + ']'); }
      var fee = f('annual_fee').value, mo = f('intro_months').value;
      var upd = { annual_fee: fee === '' ? null : Math.max(0, +fee), intro_months: mo === '' ? null : Math.max(0, Math.min(36, Math.round(+mo))),
        apr_text: f('apr_text').value.trim() || null, welcome_bonus: f('welcome_bonus').value.trim() || null, confidence: f('confidence').value,
        source_date: f('source_date').value.trim() || null, is_active: f('is_active').checked };
      sb.from('cards').update(upd).eq('id', id).then(function (res) { return done(res, 'Saved ' + id + '.'); });
    });
    document.getElementById('newCard').onsubmit = function (e) {
      e.preventDefault();
      function v(i) { return document.getElementById('nc_' + i).value.trim(); }
      var id = v('id');
      if (!/^[a-z0-9_]{3,60}$/.test(id)) { flash('err', 'ID must be 3 to 60 lowercase letters, numbers or underscores.'); return renderStaff(); }
      if (S.cards.some(function (c) { return c.id === id; })) { flash('err', 'A card with that ID already exists.'); return renderStaff(); }
      var src = v('src'); if (src && !/^https?:\/\//.test(src)) { flash('err', 'Source URL must start with http:// or https://'); return renderStaff(); }
      function fit(k) { return Math.max(0, Math.min(5, Math.round(+document.getElementById('nc_fit_' + k).value || 0))); }
      var intro = numOrNull(v('intro'));
      var row = { id: id, issuer: v('issuer'), name: v('name'), card_type: v('type'), annual_fee: numOrNull(v('fee')),
        intro_months: intro == null ? null : Math.max(0, Math.min(36, Math.round(intro))), intro_verify: document.getElementById('nc_introverify').checked,
        apr_low: numOrNull(v('aprlow')), apr_high: numOrNull(v('aprhigh')), apr_text: v('aprtext') || null, rewards: v('rewards') || null, welcome_bonus: v('bonus') || null,
        tier: +v('tier'), confidence: v('conf'), reports_personal: document.getElementById('nc_personal').checked,
        goal_fit: { financing: fit('financing'), cashback: fit('cashback'), travel: fit('travel') }, note: v('note') || null, source_url: src || null, source_date: v('date') || null, is_active: true };
      sb.from('cards').insert(row).then(function (res) { return done(res, 'Added ' + row.name + '.'); });
    };
    document.getElementById('ruleBody').addEventListener('click', function (e) {
      if (e.target.dataset.act !== 'save') return;
      var tr = e.target.closest('tr'), id = tr.dataset.id;
      function f(k) { return tr.querySelector('[data-f=' + k + ']'); }
      var desc = f('description').value.trim();
      if (!desc) { flash('err', 'Description cannot be empty.'); return renderStaff(); }
      sb.from('issuer_rules').update({ description: desc, applies_to: f('applies_to').value.trim() || null, confidence: f('confidence').value, is_active: f('is_active').checked }).eq('id', id)
        .then(function (res) { return done(res, 'Rule saved.'); });
    });
    document.getElementById('newRule').onsubmit = function (e) {
      e.preventDefault();
      function v(i) { return document.getElementById('nr_' + i).value.trim(); }
      var src = v('src'); if (src && !/^https?:\/\//.test(src)) { flash('err', 'Source URL must start with http:// or https://'); return renderStaff(); }
      sb.from('issuer_rules').insert({ issuer: v('issuer'), rule_name: v('name'), description: v('desc'), applies_to: v('applies') || null, rule_type: v('type') || null, confidence: v('conf'), source_url: src || null })
        .then(function (res) { return done(res, 'Rule added.'); });
    };
    var tb = document.getElementById('teamBody');
    if (tb) {
      tb.addEventListener('click', function (e) {
        var act = e.target.dataset.act; if (!act) return;
        var tr = e.target.closest('tr');
        if (act === 'role') return sb.rpc('staff_add', { target_email: e.target.dataset.email, target_role: e.target.dataset.role }).then(function (res) { return afterRpc(res, 'Role changed.'); });
        if (act === 'remove') {
          if (!window.confirm('Remove this person from staff?')) return;
          sb.rpc('staff_remove', { target: tr.dataset.id }).then(function (res) { return afterRpc(res, 'Removed from staff.'); });
        }
      });
      document.getElementById('addStaff').onsubmit = function (e) {
        e.preventDefault();
        var em = document.getElementById('as_email').value.trim(), role = document.getElementById('as_role').value;
        sb.rpc('staff_add', { target_email: em, target_role: role }).then(function (res) { return afterRpc(res, em + ' is now ' + role + '.'); });
      };
    }
  }

  /* ---------- shell ---------- */
  function render() {
    if (!S.user) return renderAuth('signin');
    if (S.recovery) return renderNewPassword();
    if (!hasAllConsents()) return renderConsent();
    nav.hidden = false;
    nav.querySelector('[data-tab=staff]').hidden = !S.isStaff;
    Array.prototype.forEach.call(nav.querySelectorAll('button'), function (b) { b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'); });
    ({ plan: renderPlan, tracker: renderTracker, repay: renderRepay, account: renderAccount, staff: renderStaff }[S.tab] || renderPlan)();
  }
  nav.addEventListener('click', function (e) { var t = e.target.dataset.tab; if (t) { S.tab = t; render(); window.scrollTo(0, 0); } });

  var booting = false;
  function onSession(session) {
    var user = session && session.user ? session.user : null;
    if (!user) { S.user = null; S.form = null; S.bv = null; S.imp = null; S.impMsg = ''; return render(); }
    if (S.user && S.user.id === user.id) return;
    S.user = user; booting = true;
    app.innerHTML = '<p>Loading…</p>';
    loadAll().then(function () { S.form = formFromState(); booting = false; render(); }, function (e) { booting = false; fail(e); render(); });
  }
  sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'PASSWORD_RECOVERY') S.recovery = true;
    setTimeout(function () { onSession(session); if (S.recovery && S.user) render(); }, 0);
  });
  sb.auth.getSession().then(function (r) { onSession(r.data.session); });
})();
