/* Family hub cloud sync (Firebase / Firestore).
   Pages keep using localStorage as a fast on-device cache. This file mirrors that data to Firestore at
     families/<passcode>/sync/<field>
   so every device that enters the same family passcode shares the same data.
   - Remote data wins when a device first connects; an empty family space is filled from the first device.
   - After that, local changes are pushed field by field and remote changes are applied and announced to the
     page with a "storage" event (every page already re-renders on that event). */
(function () {
  'use strict';
  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCHkT3w0KTiKuZIAD9imC4whmsBwdN0i88',
    authDomain: 'family-dashboard-4ddd4.firebaseapp.com',
    projectId: 'family-dashboard-4ddd4',
    messagingSenderId: '323609430236',
    appId: '1:323609430236:web:29b3897fefb3bb87dbcc19'
  };
  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var KEY = 'family-dashboard-rewards-v1', RKEY = 'family-dashboard-routines-v1', CODE_KEY = 'family-sync-code';
  var col = null, unsub = null, hydrated = false, applying = false, pushTimer = null, status = 'local', gen = 0;
  var last = {}, chain = {}, pill = null, ls = null;
  try { ls = window.localStorage; } catch (e) { ls = null; }

  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function readObj(k) { var v = ls ? parse(ls.getItem(k) || 'null') : null; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function cutoff() { var d = new Date(); d.setDate(d.getDate() - 400); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Serialise one field; old history and routine dates are trimmed to keep each document small.
  function pack(f, v) {
    if (f === 'history' && Array.isArray(v) && v.length > 300) v = v.slice(-300);
    if (f === 'routineLog' && v && typeof v === 'object') {
      var c = cutoff(), o = {};
      Object.keys(v).forEach(function (id) { var a = (v[id] || []).filter(function (d) { return d >= c; }); if (a.length) o[id] = a; });
      v = o;
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function localFields() {
    var out = {}, s = readObj(KEY);
    Object.keys(s).forEach(function (f) { if (/^[A-Za-z0-9_-]{1,60}$/.test(f)) out[f] = pack(f, s[f]); });
    if (ls && ls.getItem(RKEY) !== null) out.routineLog = pack('routineLog', readObj(RKEY));
    return out;
  }
  function applyField(f, json) {
    var v = parse(json);
    if (v === null && json !== 'null') return false;
    applying = true;
    try {
      if (f === 'routineLog') ls.setItem(RKEY, JSON.stringify(v || {}));
      else { var s = readObj(KEY); s[f] = v; ls.setItem(KEY, JSON.stringify(s)); }
    } catch (e) { applying = false; return false; }
    applying = false; return true;
  }
  function notify(keys) {
    keys.forEach(function (k) { try { window.dispatchEvent(new StorageEvent('storage', { key: k, storageArea: ls })); } catch (e) { } });
  }

  /* ---------- status pill (tap it to change the passcode) ---------- */
  var LABEL = {
    connecting: '☁ Connecting…', syncing: '☁ Saving…', synced: '☁ Synced', offline: '☁ Offline – saved on this device',
    needcode: '☁ Tap to enter family passcode', denied: '☁ Not allowed – check Firebase rules', autherr: '☁ Turn on Anonymous sign-in in Firebase',
    toolarge: '☁ Too much data to sync'
  };
  function setStatus(s) {
    status = s;
    if (!pill) return;
    pill.textContent = LABEL[s] || '';
    pill.style.display = LABEL[s] ? 'block' : 'none';
  }
  function makePill() {
    pill = document.createElement('div');
    pill.setAttribute('role', 'button');
    pill.style.cssText = 'position:fixed;top:4px;right:10px;z-index:30;font:600 11px/1 system-ui,sans-serif;padding:5px 10px;border-radius:99px;background:var(--card,#fff);color:var(--muted,#738195);border:1px solid var(--border,#e3e8f0);cursor:pointer;display:none';
    pill.onclick = function () { openOverlay(); };
    document.body.appendChild(pill);
    setStatus(status);
  }

  /* ---------- passcode dialog (built into the page; pop-up prompt() is not reliable on mobile) ---------- */
  function openOverlay() {
    if (document.getElementById('sync-overlay')) return;
    var cur = ls ? ls.getItem(CODE_KEY) : null;
    var o = document.createElement('div');
    o.id = 'sync-overlay';
    o.style.cssText = 'position:fixed;inset:0;z-index:100;background:#0008;display:grid;place-items:center;padding:16px';
    o.innerHTML = '<form style="background:var(--card,#fff);color:var(--text,#192230);border-radius:16px;padding:20px;max-width:340px;width:100%;font:15px system-ui,sans-serif;display:grid;gap:12px">' +
      '<strong style="font-size:17px">Family passcode</strong>' +
      '<span style="color:var(--muted,#738195);font-size:13px">Use the same passcode on every device to share your family data. Anyone with it can see and edit the data, so keep it private.</span>' +
      '<input id="sync-code" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. a long phrase" style="padding:11px;border:1px solid var(--border,#e3e8f0);border-radius:8px;font:inherit;background:var(--bg,#fff);color:inherit">' +
      '<div style="display:flex;gap:8px"><button type="submit" style="flex:1;padding:11px;border:0;border-radius:8px;background:var(--ink,#17243a);color:var(--bg,#fff);font:inherit;font-weight:700;cursor:pointer">Connect</button>' +
      (cur ? '<button type="button" id="sync-cancel" style="padding:11px 14px;border:1px solid var(--border,#e3e8f0);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer">Cancel</button>' : '') + '</div></form>';
    document.body.appendChild(o);
    var input = o.querySelector('#sync-code');
    if (cur) input.value = cur;
    input.focus();
    function close() { if (o.parentNode) o.parentNode.removeChild(o); }
    var cancel = o.querySelector('#sync-cancel');
    if (cancel) cancel.onclick = close;
    o.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var code = input.value.trim().toLowerCase();
      if (code.length < 6) { input.style.borderColor = '#d64545'; input.placeholder = 'At least 6 characters'; return; }
      try { ls.setItem(CODE_KEY, code); } catch (err) { }
      close(); start(code);
    };
  }

  /* ---------- remote -> local ---------- */
  function onSnap(snap) {
    var meta = snap.metadata || {}, docs = {}, changed = {};
    snap.docs.forEach(function (d) { var x = d.data(); if (x && typeof x.json === 'string') docs[d.id] = x.json; });
    if (!hydrated && meta.fromCache && snap.empty) return; // wait for the server's definitive answer
    Object.keys(docs).forEach(function (f) {
      if (last[f] === docs[f]) return;
      if (applyField(f, docs[f])) { last[f] = docs[f]; changed[f === 'routineLog' ? RKEY : KEY] = 1; }
    });
    if (!hydrated && !meta.fromCache) { hydrated = true; setStatus('synced'); pushLocal(); } // upload anything the space doesn't have yet
    notify(Object.keys(changed));
  }

  /* ---------- local -> remote (one write at a time per document, only when content changed) ---------- */
  function errStatus(e) {
    var c = e && e.code || '';
    if (c === 'permission-denied') return 'denied';
    return 'offline';
  }
  function pushLocal() {
    if (!hydrated || !col) return;
    var cur = localFields(), myGen = gen, myCol = col;
    Object.keys(cur).forEach(function (f) {
      var json = cur[f], prev = last[f];
      if (json === prev) return;
      if (json.length > 900000) { setStatus('toolarge'); return; }
      last[f] = json; setStatus('syncing');
      chain[f] = (chain[f] || Promise.resolve())
        .then(function () { if (myGen !== gen) return; return myCol.doc(f).set({ json: json }); })
        .then(function () { if (myGen === gen && status === 'syncing') setStatus('synced'); },
          function (e) { if (myGen !== gen) return; if (last[f] === json) last[f] = prev; setStatus(errStatus(e)); });
    });
  }
  function schedule() { if (!hydrated) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushLocal, 150); }

  if (ls && typeof Storage !== 'undefined') {
    var orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k) {
      var r = orig.apply(this, arguments);
      try { if (!applying && this === ls && (k === KEY || k === RKEY)) schedule(); } catch (e) { }
      return r;
    };
  }

  /* ---------- connect ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  var sdkReady = null;
  function loadSdk() {
    if (window.firebase && window.firebase.firestore && window.firebase.auth) return Promise.resolve();
    if (!sdkReady) sdkReady = loadScript(SDK + 'firebase-app-compat.js').then(function () { return loadScript(SDK + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(SDK + 'firebase-firestore-compat.js'); });
    return sdkReady;
  }
  function spaceId(code) { return 'f-' + encodeURIComponent(code).replace(/\./g, '%2E').replace(/\*/g, '%2A'); }

  function stop() { gen++; if (unsub) { try { unsub(); } catch (e) { } unsub = null; } col = null; hydrated = false; last = {}; chain = {}; }
  function start(code) {
    stop();
    var myGen = gen;
    setStatus('connecting');
    setTimeout(function () { if (myGen === gen && !hydrated && status === 'connecting') setStatus('offline'); }, 12000);
    loadSdk().then(function () {
      var fb = window.firebase;
      if (!fb.apps.length) fb.initializeApp(FIREBASE_CONFIG);
      return fb.auth().signInAnonymously().then(function () { return fb; }, function (e) { var x = new Error('auth'); x.auth = e; throw x; });
    }).then(function (fb) {
      if (myGen !== gen) return;
      col = fb.firestore().collection('families').doc(spaceId(code)).collection('sync');
      unsub = col.onSnapshot(onSnap, function (e) { if (myGen === gen) setStatus(errStatus(e)); });
    }).catch(function (e) {
      if (myGen !== gen) return;
      var c = e && e.auth && e.auth.code;
      setStatus(c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation' ? 'autherr' : 'offline');
    });
  }

  if (ls) {
    document.addEventListener('DOMContentLoaded', function () {
      makePill();
      var code = ls.getItem(CODE_KEY);
      if (code) start(code); else { setStatus('needcode'); openOverlay(); }
    });
    window.addEventListener('pagehide', function () { clearTimeout(pushTimer); pushLocal(); });
    window.addEventListener('focus', schedule);
    window.addEventListener('online', schedule);
  }
})();
