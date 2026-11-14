/* ProStack: Personal profile and Business profile tabs, application answer sheet. Loaded after features2.js. */
(function () {
  'use strict';
  var P = window.ProApp, E = window.Engine, sb = P.sb, S = P.S, esc = P.esc;
  var X = window.ProExtra = window.ProExtra || {};
  var STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  var STATE_OPTS = [['', 'Select']].concat(STATES.map(function (s) { return [s, s]; }));
  var IDV = 'identity-v1';
  var IDV_TEXT = 'I agree that ProStack stores the personal and business details I enter here (name, date of birth, address, phone, income, employment, business details and EIN, plus only the last 4 digits of my SSN) so it can prepare my application answers. I understand ProStack never stores my full SSN, a full credit report, or card or bank account numbers, and that I can delete this information any time from Account.';

  var PERSONAL = [
    ['Name', [['first_name', 'Legal first name', 'text', null, 1], ['middle_name', 'Middle name', 'text'], ['last_name', 'Legal last name', 'text', null, 1], ['suffix', 'Suffix (Jr, Sr, III)', 'text']]],
    ['Identity', [['dob', 'Date of birth', 'date', null, 1, 'secret'], ['ssn_last4', 'SSN: last 4 digits only', 'text', null, 0, 'secret'], ['citizenship', 'Citizenship status', 'select', [['', 'Select'], ['us_citizen', 'U.S. citizen'], ['permanent_resident', 'Permanent resident'], ['other', 'Other']]]]],
    ['Contact', [['email', 'Email', 'email', null, 1], ['phone', 'Mobile phone', 'tel', null, 1]]],
    ['Home address', [['address1', 'Street address', 'text', null, 1], ['address2', 'Apt, suite or unit', 'text'], ['city', 'City', 'text', null, 1], ['state', 'State', 'select', STATE_OPTS, 1], ['zip', 'ZIP code', 'text', null, 1], ['years_at_address', 'Years at this address', 'number'], ['housing_status', 'Housing', 'select', [['', 'Select'], ['own', 'Own'], ['rent', 'Rent'], ['family', 'Live with family'], ['other', 'Other']], 1], ['monthly_housing', 'Monthly rent or mortgage ($)', 'number']]],
    ['Employment and income', [['employment_status', 'Employment status', 'select', [['', 'Select'], ['self_employed', 'Self-employed / business owner'], ['employed', 'Employed'], ['retired', 'Retired'], ['student', 'Student'], ['unemployed', 'Not employed'], ['other', 'Other']], 1], ['occupation', 'Occupation or title', 'text'], ['employer', 'Employer (or your business)', 'text'], ['annual_income', 'Total annual personal income ($)', 'number', null, 1], ['other_income', 'Other annual income ($)', 'number']]]
  ];
  var BUSINESS = [
    ['Business identity', [['legal_name', 'Legal business name', 'text', null, 1], ['dba', 'DBA / trade name', 'text'], ['entity_type', 'Entity type', 'select', [['', 'Select'], ['llc', 'LLC'], ['sole_proprietor', 'Sole proprietor'], ['s_corp', 'S corporation'], ['c_corp', 'C corporation'], ['partnership', 'Partnership'], ['nonprofit', 'Nonprofit'], ['other', 'Other']], 1], ['state_formed', 'State of formation', 'select', STATE_OPTS], ['formation_date', 'Date business started', 'date', null, 1]]],
    ['Taxpayer ID', [['tax_id_path', 'Taxpayer ID you use on applications', 'select', [['', 'Select'], ['ein', 'EIN (employer ID number)'], ['ssn', 'My SSN (sole proprietor)']], 1], ['ein', 'EIN (format 12-3456789)', 'text', null, 0, 'secret']]],
    ['Business address and contact', [['address1', 'Street address', 'text', null, 1], ['address2', 'Suite or unit', 'text'], ['city', 'City', 'text', null, 1], ['state', 'State', 'select', STATE_OPTS, 1], ['zip', 'ZIP code', 'text', null, 1], ['phone', 'Business phone', 'tel', null, 1], ['email', 'Business email', 'email'], ['website', 'Website', 'text']]],
    ['Operations and financials', [['industry', 'Industry or business type', 'text', null, 1], ['naics', 'NAICS code (2 to 6 digits, optional)', 'text'], ['employees', 'Number of employees', 'number'], ['annual_revenue', 'Annual business revenue ($)', 'number', null, 1], ['monthly_revenue', 'Average monthly revenue ($)', 'number'], ['annual_expenses', 'Annual business expenses ($)', 'number'], ['ownership_pct', 'Your ownership (%)', 'number'], ['owner_title', 'Your title (Owner, Member, President)', 'text'], ['bank_name', 'Business bank (name only)', 'text']]]
  ];
  X.pp = null; X.bp = null;

  function load() {
    var uid = S.user.id;
    return Promise.all([sb.from('personal_profiles').select('*').eq('user_id', uid).maybeSingle(), sb.from('business_profiles').select('*').eq('user_id', uid).maybeSingle()]).then(function (r) { X.pp = r[0].data || null; X.bp = r[1].data || null; X._idLoaded = true; X._idUser = uid; });
  }
  // Tabs that need this data load it themselves if it is missing or belongs to someone else.
  function gate(name) {
    var orig = X[name]; if (!orig) return;
    X[name] = function () {
      var a = arguments;
      if (X._idLoaded && X._idUser === S.user.id) return orig.apply(null, a);
      return load().catch(function () {}).then(function () { orig.apply(null, a); });
    };
  }
  var prevLoad = X.loadBureau;
  X.loadBureau = function () { return (prevLoad ? prevLoad() : Promise.resolve()).then(function () { return load().catch(function () {}); }); };

  function field(f, v, pre) {
    var k = f[0], id = pre + k, type = f[2], val = v == null ? '' : v, req = f[4] ? ' required' : '', sec = f[5] === 'secret';
    var lab = '<label for="' + id + '">' + esc(f[1]) + (f[4] ? ' *' : '') + '</label>';
    if (type === 'select') return '<div class="field">' + lab + '<select id="' + id + '"' + req + '>' + P.opts(f[3], val) + '</select></div>';
    var inp = '<input id="' + id + '" type="' + (sec && k !== 'dob' ? 'password' : type) + '" value="' + esc(val) + '"' + req + (type === 'number' ? ' min="0" step="1"' : '') + (sec ? ' autocomplete="off"' : '') + (k === 'ssn_last4' ? ' maxlength="4" inputmode="numeric"' : '') + (k === 'zip' ? ' maxlength="10"' : '') + ' maxlength="200">';
    if (k === 'ssn_last4' || k === 'ein') inp = '<div style="display:flex;gap:8px;align-items:center">' + inp + '<label style="font-weight:400;white-space:nowrap"><input type="checkbox" data-show="' + id + '"> Show</label></div>';
    return '<div class="field">' + lab + inp + '</div>';
  }
  function section(defs, rec, pre) {
    return defs.map(function (s) { return '<div class="panel"><h3>' + esc(s[0]) + '</h3><div class="grid">' + s[1].map(function (f) { return field(f, rec && rec[f[0]], pre); }).join('') + '</div></div>'; }).join('');
  }
  function collect(defs, pre) {
    var o = {};
    defs.forEach(function (s) { s[1].forEach(function (f) {
      var el = document.getElementById(pre + f[0]), v = el ? el.value.trim() : '';
      if (f[2] === 'number') o[f[0]] = v === '' ? null : +v; else o[f[0]] = v === '' ? null : v;
    }); });
    return o;
  }
  function complete(defs, rec) {
    var need = [], have = 0; defs.forEach(function (s) { s[1].forEach(function (f) { if (f[4]) { need.push(f); if (rec && rec[f[0]] != null && rec[f[0]] !== '') have++; } }); });
    return { have: have, total: need.length, pct: need.length ? Math.round(100 * have / need.length) : 0 };
  }
  function wireShow() { P.app.querySelectorAll('[data-show]').forEach(function (c) { c.onchange = function () { document.getElementById(c.dataset.show).type = c.checked ? 'text' : 'password'; }; }); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function hasIdentityConsent() { return S.consents.some(function (c) { return c.consent_type === 'identity_data'; }); }
  function ensureConsent() {
    if (hasIdentityConsent()) return Promise.resolve(true);
    var cb = document.getElementById('idc');
    if (!cb || !cb.checked) { P.flash('err', 'Please accept the identity-data agreement at the top of the page first.'); return Promise.resolve(false); }
    return sb.from('consents').insert({ user_id: S.user.id, consent_type: 'identity_data', version: IDV }).then(function (r) { if (r.error) { P.fail(r.error); return false; } S.consents.push({ consent_type: 'identity_data', version: IDV }); return true; });
  }
  function consentBox() {
    if (hasIdentityConsent()) return '';
    return '<div class="panel"><h3>Before you enter personal details</h3><div class="check"><input type="checkbox" id="idc"><label for="idc" style="font-weight:400">' + esc(IDV_TEXT) + '</label></div></div>';
  }
  var NOTE = '<div class="callout" style="margin:0 0 14px">ProStack never asks for your full Social Security number. You type it directly on each issuer\'s secure application. Only the last 4 digits are kept here, if you choose to add them. Fields marked * are the ones most applications ask for.</div>';

  /* ---------- PERSONAL ---------- */
  X.personal = function () {
    var r = X.pp || {}, c = complete(PERSONAL, r), p = S.profile || {};
    if (!X.pp && !r.email) r.email = S.user.email;
    P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Personal profile</h2><p class="sub">The details every application asks for, kept in one place. ' + c.have + ' of ' + c.total + ' key fields complete (' + c.pct + '%).</p>' + NOTE +
      '<div style="background:var(--soft);border-radius:99px;height:10px"><div style="width:' + c.pct + '%;background:var(--gold-fill);height:10px;border-radius:99px"></div></div></div>' + consentBox() +
      '<form id="ppf">' + section(PERSONAL, r, 'pp_') + '<div class="row"><button class="btn" type="submit">Save personal profile</button></div></form>';
    wireShow();
    document.getElementById('ppf').onsubmit = function (e) {
      e.preventDefault(); var o = collect(PERSONAL, 'pp_');
      if (o.ssn_last4 && !/^\d{4}$/.test(o.ssn_last4)) { P.flash('err', 'Enter only the last 4 digits of your SSN, or leave it blank.'); return X.personal(); }
      if (o.dob) { var dob = new Date(o.dob + 'T00:00:00'), min = new Date(); min.setFullYear(min.getFullYear() - 18); if (dob > min) { P.flash('err', 'You must be 18 or older to apply for credit.'); return X.personal(); } }
      if (o.zip && !/^\d{5}(-?\d{4})?$/.test(o.zip)) { P.flash('err', 'ZIP code must be 5 or 9 digits.'); return X.personal(); }
      if (o.phone) { var d = digits(o.phone); if (d.length < 10 || d.length > 11) { P.flash('err', 'Enter a 10-digit phone number.'); return X.personal(); } }
      ensureConsent().then(function (ok) {
        if (!ok) return X.personal();
        o.user_id = S.user.id; o.updated_at = new Date().toISOString();
        return sb.from('personal_profiles').upsert(o, { onConflict: 'user_id' }).then(function (u) {
          if (u.error) { P.fail(u.error); return X.personal(); }
          var full = [o.first_name, o.last_name].filter(Boolean).join(' ');
          return (full ? sb.from('profiles').update({ full_name: full, state: o.state || null }).eq('id', S.user.id) : Promise.resolve({})).then(function () {
            if (S.form && full) S.form.full_name = full;
            P.flash('ok', 'Personal profile saved.'); return load().then(function () { return P.loadAll(); }).then(function () { X.personal(); });
          });
        });
      });
    };
  };

  /* ---------- BUSINESS ---------- */
  X.business = function () {
    var r = X.bp || {}, c = complete(BUSINESS, r), pp = X.pp || {};
    if (!X.bp) { r = { state: pp.state, phone: pp.phone, email: pp.email, owner_title: 'Owner', ownership_pct: 100, tax_id_path: 'ein' }; if (S.profile) { r.legal_name = S.profile.business_name || ''; r.formation_date = S.profile.business_started_on || ''; } }
    P.app.innerHTML = P.flashHtml() + '<div class="panel"><h2>Business profile</h2><p class="sub">Your business details for every application. ' + c.have + ' of ' + c.total + ' key fields complete (' + c.pct + '%).</p>' + NOTE +
      '<div style="background:var(--soft);border-radius:99px;height:10px"><div style="width:' + c.pct + '%;background:var(--gold-fill);height:10px;border-radius:99px"></div></div></div>' + consentBox() +
      '<form id="bpf">' + section(BUSINESS, r, 'bp_') + '<div class="row"><button class="btn" type="submit">Save business profile</button></div></form>';
    wireShow();
    document.getElementById('bpf').onsubmit = function (e) {
      e.preventDefault(); var o = collect(BUSINESS, 'bp_');
      if (o.ein) { var d = digits(o.ein); if (d.length !== 9) { P.flash('err', 'An EIN has 9 digits (12-3456789).'); return X.business(); } o.ein = d.slice(0, 2) + '-' + d.slice(2); }
      if (o.tax_id_path === 'ein' && !o.ein) { P.flash('err', 'Enter your EIN, or choose "My SSN (sole proprietor)" as your taxpayer ID.'); return X.business(); }
      if (o.tax_id_path === 'ssn') o.ein = o.ein || null;
      if (o.zip && !/^\d{5}(-?\d{4})?$/.test(o.zip)) { P.flash('err', 'ZIP code must be 5 or 9 digits.'); return X.business(); }
      if (o.naics && !/^\d{2,6}$/.test(o.naics)) { P.flash('err', 'NAICS is 2 to 6 digits.'); return X.business(); }
      if (o.ownership_pct != null && (o.ownership_pct < 0 || o.ownership_pct > 100)) { P.flash('err', 'Ownership must be 0 to 100.'); return X.business(); }
      if (o.website && !/^https?:\/\//i.test(o.website)) o.website = 'https://' + o.website;
      ensureConsent().then(function (ok) {
        if (!ok) return X.business();
        o.user_id = S.user.id; o.updated_at = new Date().toISOString();
        return sb.from('business_profiles').upsert(o, { onConflict: 'user_id' }).then(function (u) {
          if (u.error) { P.fail(u.error); return X.business(); }
          return sb.from('profiles').update({ business_name: o.legal_name || null, business_started_on: o.formation_date || null }).eq('id', S.user.id).then(function () {
            if (S.form) { S.form.business_name = o.legal_name || ''; if (o.formation_date) S.form.biz = E.bizFromDate(o.formation_date); }
            P.flash('ok', 'Business profile saved.'); return load().then(function () { return P.loadAll(); }).then(function () { X.business(); });
          });
        });
      });
    };
  };

  /* ---------- application answer sheet (used by Coach) ---------- */
  function mask(v) { return v ? '••••••' : ''; }
  function addr(o) { return o ? [o.address1, o.address2, [o.city, o.state].filter(Boolean).join(', ') + (o.zip ? ' ' + o.zip : '')].filter(function (x) { return x && x.trim(); }).join(', ') : ''; }
  function money(n) { return n == null || n === '' ? '' : '$' + Math.round(+n).toLocaleString('en-US'); }
  X.answerRows = function () {
    var p = X.pp || {}, b = X.bp || {}, none = 'Add in Personal profile', nob = 'Add in Business profile';
    return [
      ['Your legal name', [p.first_name, p.middle_name, p.last_name, p.suffix].filter(Boolean).join(' ') || none],
      ['Date of birth', p.dob || none, 1], ['SSN', 'Type it yourself on the issuer\'s site (only last 4 stored: ' + (p.ssn_last4 ? '••••' : 'none') + ')'],
      ['Home address', addr(p) || none], ['Phone', p.phone || none], ['Email', p.email || none],
      ['Housing', (p.housing_status || '') + (p.monthly_housing != null ? ', ' + money(p.monthly_housing) + '/mo' : '') || none],
      ['Employment', [p.employment_status, p.occupation, p.employer].filter(Boolean).join(' · ') || none],
      ['Annual personal income', p.annual_income != null ? money(p.annual_income) : none],
      ['Legal business name', b.legal_name || nob], ['Entity type / state', [b.entity_type, b.state_formed].filter(Boolean).join(' · ') || nob],
      ['Taxpayer ID', b.tax_id_path === 'ssn' ? 'Your SSN (sole proprietor): type it on the issuer\'s site' : (b.ein ? b.ein : nob), b.ein ? 1 : 0],
      ['Business address', addr(b) || nob], ['Business phone', b.phone || nob],
      ['Business started', b.formation_date || nob], ['Industry', b.industry || nob], ['Employees', b.employees != null ? b.employees : nob],
      ['Annual business revenue', b.annual_revenue != null ? money(b.annual_revenue) : nob], ['Your ownership / title', b.ownership_pct != null ? b.ownership_pct + '% · ' + (b.owner_title || '') : nob]
    ];
  };
  X.answerTable = function () {
    var rows = X.answerRows();
    return '<div class="tablewrap"><table><tbody>' + rows.map(function (r, i) {
      return '<tr><th>' + esc(r[0]) + '</th><td>' + (r[2] ? '<span data-val="' + esc(r[1]) + '">' + mask(r[1]) + '</span> <button class="btn alt" data-reveal="1" style="padding:2px 8px">Show</button>' : esc(r[1])) + '</td></tr>';
    }).join('') + '</tbody></table></div><div class="row" style="margin-top:10px"><button class="btn alt" id="copyAns">Copy these answers</button></div>' +
      '<p class="sub">Copying puts your date of birth and EIN on your clipboard. Clear it afterward and only paste into the issuer\'s own application.</p>';
  };
  if (!X._ansWired) {
    X._ansWired = true;
    P.app.addEventListener('click', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.reveal) { var sp = t.previousElementSibling; if (!sp) return; var on = sp.dataset.on === '1'; sp.textContent = on ? mask(sp.dataset.val) : sp.dataset.val; sp.dataset.on = on ? '0' : '1'; t.textContent = on ? 'Show' : 'Hide'; }
      if (t.id === 'copyAns') { var txt = X.answerRows().map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'); try { navigator.clipboard.writeText(txt).then(function () { t.textContent = 'Copied'; }, function () { t.textContent = 'Copy failed'; }); } catch (err) { t.textContent = 'Copy failed'; } }
    });
  }

  gate('personal'); gate('business'); gate('coach');

  /* ---------- account: export identity data ---------- */
  var prevAcct = X.afterAccount;
  X.afterAccount = function () {
    if (prevAcct) prevAcct();
    var d = document.createElement('div'); d.className = 'panel';
    d.innerHTML = '<h3>My personal and business profile data</h3><p class="sub">Download a copy of what is stored in your Personal and Business profiles. Delete my data in this page removes it.</p><button class="btn alt" id="expId">Download profile data (JSON)</button>';
    P.app.appendChild(d);
    document.getElementById('expId').onclick = function () {
      var blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), personal_profile: X.pp, business_profile: X.bp }, null, 2)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'prostack-profile-data.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
  };
})();
