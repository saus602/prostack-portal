/* ProStack: security (idle logoff, two-factor), status timeline, notifications. Loaded after features3.js. */
(function () {
  'use strict';
  var P = window.ProApp, sb = P.sb, S = P.S, esc = P.esc;
  var X = window.ProExtra = window.ProExtra || {};
  var IDLE_MS = 15 * 60 * 1000, WARN_MS = 60 * 1000, idleT = null, warnT = null, banner = null;

  /* ---------- idle logoff (15 minutes) ---------- */
  function clearTimers() { clearTimeout(idleT); clearTimeout(warnT); if (banner) { banner.remove(); banner = null; } }
  function arm() {
    clearTimers();
    if (!S.user) return;
    warnT = setTimeout(function () {
      if (!S.user) return;
      banner = document.createElement('div');
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:var(--warn-soft);color:var(--ink);padding:12px 16px;border-top:2px solid var(--gold-fill);z-index:50;text-align:center';
      banner.textContent = 'You will be signed out in 1 minute because of inactivity. Move the mouse or press a key to stay signed in.';
      document.body.appendChild(banner);
    }, IDLE_MS - WARN_MS);
    idleT = setTimeout(function () { clearTimers(); try { sb.auth.signOut(); } catch (e) {} }, IDLE_MS);
  }
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(function (ev) {
    var last = 0;
    window.addEventListener(ev, function () { var n = Date.now(); if (n - last > 5000) { last = n; arm(); } }, { passive: true });
  });
  try { sb.auth.onAuthStateChange(function (e, s) { if (s) arm(); else clearTimers(); }); } catch (e) {}
  arm();

  /* ---------- notifications ---------- */
  X.notes = [];
  function loadNotes() {
    if (!S.user) return Promise.resolve();
    return sb.from('notifications').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(50)
      .then(function (r) { X.notes = (r && r.data) || []; }, function () { X.notes = []; });
  }
  var prevLoadBureau = X.loadBureau;
  X.loadBureau = function () { return (prevLoadBureau ? prevLoadBureau() : Promise.resolve()).then(loadNotes); };

  var prevBanner = X.banner;
  X.banner = function () {
    if (prevBanner) prevBanner();
    var unread = (X.notes || []).filter(function (n) { return !n.read_at; });
    if (!unread.length) return;
    var d = document.createElement('div'); d.className = 'msg info';
    d.innerHTML = '<b>' + unread.length + ' new message' + (unread.length > 1 ? 's' : '') + ' from your advisor.</b> <a href="#" id="openTl">Open Timeline</a>';
    P.app.insertBefore(d, P.app.firstChild);
    d.querySelector('#openTl').onclick = function (e) { e.preventDefault(); S.tab = 'timeline'; syncNav(); P.rerender(); };
  };
  function syncNav() {
    var nav = document.getElementById('nav'); if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll('button'), function (b) { if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }

  /* ---------- status timeline ---------- */
  function q(table, cols) {
    return sb.from(table).select(cols || '*').eq('user_id', S.user.id).then(function (r) { return (r && r.data) || []; }, function () { return []; });
  }
  X.timeline = function () {
    var app = P.app;
    app.innerHTML = '<div class="panel"><h2>Timeline</h2><p class="sub">Everything that has happened on your file, newest first, plus messages from your advisor.</p><div id="tlBody">Loading…</div></div>';
    Promise.all([q('applications'), q('client_documents'), Promise.resolve([]), q('credit_scores_log'), q('disputes'), loadNotes()]).then(function (r) {
      var ev = [];
      r[0].forEach(function (a) { ev.push({ t: a.applied_on || a.created_at, k: 'Application', s: (P.cardName ? P.cardName(a.card_id) : 'Card') + ' — ' + (a.status || 'planned') }); });
      r[1].forEach(function (d) { ev.push({ t: d.uploaded_at, k: 'Document', s: (d.category || 'Document') + ' uploaded' + (d.status ? ' (' + d.status + ')' : '') }); });
      
      r[3].forEach(function (c) { ev.push({ t: c.created_at || c.logged_on, k: 'Credit', s: 'Credit check recorded' }); });
      r[4].forEach(function (d) { ev.push({ t: d.created_at, k: 'Dispute', s: (d.bureau || '') + ' ' + (d.status || 'opened') }); });
      (X.notes || []).forEach(function (n) { ev.push({ t: n.created_at, k: 'Message', s: n.title + (n.body ? ': ' + n.body : ''), id: n.id, unread: !n.read_at }); });
      ev = ev.filter(function (e) { return e.t; }).sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); });
      var el = document.getElementById('tlBody'); if (!el) return;
      if (!ev.length) { el.innerHTML = '<p class="sub">Nothing yet. Items appear here as you add applications, upload documents, and your advisor sends messages.</p>'; return; }
      el.innerHTML = '<ol class="steps">' + ev.map(function (e) {
        return '<li><div class="when">' + esc(String(e.t).slice(0, 10)) + '</div><div><span class="pill">' + esc(e.k) + '</span> ' + (e.unread ? '<b>' : '') + esc(e.s) + (e.unread ? '</b>' : '') + '</div></li>';
      }).join('') + '</ol>';
      var ids = ev.filter(function (e) { return e.unread; }).map(function (e) { return e.id; });
      if (ids.length) sb.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).then(function () { loadNotes(); }, function () {});
    });
  };

  /* ---------- two-factor authentication (Account tab) ---------- */
  var prevAcct = X.afterAccount;
  X.afterAccount = function () {
    if (prevAcct) prevAcct();
    var d = document.createElement('div'); d.className = 'panel';
    d.innerHTML = '<h3>Two-factor sign-in</h3><p class="sub">Add an authenticator app (Google Authenticator, Authy, 1Password) so a stolen password alone cannot open your account.</p><div id="mfaBody">Checking…</div>';
    P.app.appendChild(d);
    var body = d.querySelector('#mfaBody');
    if (!sb.auth || !sb.auth.mfa) { body.textContent = 'Two-factor sign-in is not available in this version of the portal.'; return; }
    function show() {
      sb.auth.mfa.listFactors().then(function (r) {
        var f = ((r.data && r.data.totp) || []).filter(function (x) { return x.status === 'verified'; });
        if (f.length) {
          body.innerHTML = '<div class="msg ok">Two-factor sign-in is ON.</div><button class="btn danger" id="mfaOff">Turn off</button>';
          body.querySelector('#mfaOff').onclick = function () {
            if (!confirm('Turn off two-factor sign-in?')) return;
            sb.auth.mfa.unenroll({ factorId: f[0].id }).then(function (x) { if (x.error) body.insertAdjacentHTML('afterbegin', '<div class="msg err">' + esc(x.error.message) + '</div>'); else show(); });
          };
        } else {
          body.innerHTML = '<button class="btn" id="mfaOn">Set up two-factor</button>';
          body.querySelector('#mfaOn').onclick = enroll;
        }
      }, function () { body.textContent = 'Could not check two-factor status.'; });
    }
    function enroll() {
      sb.auth.mfa.enroll({ factorType: 'totp' }).then(function (r) {
        if (r.error) { body.innerHTML = '<div class="msg err">' + esc(r.error.message) + '</div>'; return; }
        var id = r.data.id, totp = r.data.totp || {};
        body.innerHTML = '<p>1. In your authenticator app, add an account by scanning this code, or by typing the key.</p>' +
          '<div style="background:#fff;display:inline-block;padding:8px">' + (totp.qr_code ? '<img alt="Two-factor QR code" width="180" height="180" src="' + esc(totp.qr_code) + '">' : '') + '</div>' +
          '<p class="sub">Key: <code>' + esc(totp.secret || '') + '</code></p>' +
          '<p>2. Enter the 6-digit code the app shows.</p><div class="row"><input type="text" id="mfaCode" inputmode="numeric" maxlength="6" style="max-width:140px" autocomplete="one-time-code"><button class="btn" id="mfaGo">Confirm</button></div><div id="mfaErr"></div>';
        body.querySelector('#mfaGo').onclick = function () {
          var code = body.querySelector('#mfaCode').value.trim();
          sb.auth.mfa.challengeAndVerify({ factorId: id, code: code }).then(function (x) {
            if (x.error) body.querySelector('#mfaErr').innerHTML = '<div class="msg err">' + esc(x.error.message) + '</div>'; else show();
          });
        };
      });
    }
    show();
  };

  /* ---------- sign-in second step (if a factor is enrolled) ---------- */
  // After password sign-in the session is at assurance level aal1. If a verified factor exists, ask for the code.
  function needMfa() {
    if (!sb.auth || !sb.auth.mfa || !S.user) return Promise.resolve(false);
    return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      return !!(r.data && r.data.nextLevel === 'aal2' && r.data.currentLevel !== 'aal2');
    }, function () { return false; });
  }
  X.mfaGate = function (done) {
    needMfa().then(function (need) {
      if (!need) return done();
      sb.auth.mfa.listFactors().then(function (r) {
        var f = ((r.data && r.data.totp) || []).filter(function (x) { return x.status === 'verified'; })[0];
        if (!f) return done();
        P.app.innerHTML = '<div class="panel auth"><h2>Two-factor code</h2><p class="sub">Enter the 6-digit code from your authenticator app.</p><div class="field"><input type="text" id="mfaC" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><div id="mfaE"></div><div class="row"><button class="btn" id="mfaV">Verify</button><button class="btn alt" id="mfaX">Sign out</button></div></div>';
        document.getElementById('mfaX').onclick = function () { sb.auth.signOut(); };
        document.getElementById('mfaV').onclick = function () {
          sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: document.getElementById('mfaC').value.trim() }).then(function (x) {
            if (x.error) document.getElementById('mfaE').innerHTML = '<div class="msg err">' + esc(x.error.message) + '</div>'; else done();
          });
        };
      });
    });
  };
  /* ---------- staff: send a message to a client who shared with the advisor ---------- */
  X.messages = function () {
    var app = P.app;
    if (!S.isStaff) { app.innerHTML = '<div class="panel"><p>Staff only.</p></div>'; return; }
    app.innerHTML = '<div class="panel"><h2>Messages</h2><p class="sub">Send a message to a client. Only clients who turned on "share with advisor" appear. The message shows in their Timeline. Email delivery is not connected yet.</p><div id="msgBody">Loading…</div></div>';
    sb.rpc('staff_clients').then(function (r) {
      var rows = (r && r.data) || [], el = document.getElementById('msgBody');
      if (!el) return;
      if (!rows.length) { el.innerHTML = '<p class="sub">No clients have shared with the advisor yet.</p>'; return; }
      el.innerHTML = '<div class="field"><label for="mc">Client</label><select id="mc">' + rows.map(function (c) { return '<option value="' + esc(c.user_id) + '">' + esc(c.full_name || c.email || c.user_id) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="mk">Type</label><select id="mk"><option value="info">Message</option><option value="document_request">Document request</option><option value="offer">Offer update</option><option value="status">Status update</option><option value="reminder">Reminder</option></select></div>' +
        '<div class="field"><label for="mt">Title</label><input type="text" id="mt" maxlength="140"></div>' +
        '<div class="field"><label for="mb">Details</label><textarea id="mb" rows="4" maxlength="2000"></textarea></div>' +
        '<button class="btn" id="ms">Send</button><div id="mr" style="margin-top:10px"></div>';
      document.getElementById('ms').onclick = function () {
        var title = document.getElementById('mt').value.trim();
        if (!title) { document.getElementById('mr').innerHTML = '<div class="msg err">Enter a title.</div>'; return; }
        sb.rpc('staff_notify', { p_client: document.getElementById('mc').value, p_kind: document.getElementById('mk').value, p_title: title, p_body: document.getElementById('mb').value.trim() || null }).then(function (x) {
          document.getElementById('mr').innerHTML = x.error ? '<div class="msg err">' + esc(x.error.message) + '</div>' : '<div class="msg ok">Sent.</div>';
          if (!x.error) { document.getElementById('mt').value = ''; document.getElementById('mb').value = ''; }
        });
      };
    });
  };
})();
