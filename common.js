/* Shared helpers for the family hub pages: data, routines, points, missed-task penalties, theme and the bottom tab bar.
   Loaded after sync.js on every page. Everything lives in the same localStorage object that sync.js mirrors to Firebase. */
(function () {
  'use strict';
  var KEY = 'family-dashboard-rewards-v1', RKEY = 'family-dashboard-routines-v1', THEME_KEY = 'family-dashboard-theme';
  var MEMBERS = [
    { name: 'Arun', color: '#4f72be', status: 'Parent', mood: '🙂' },
    { name: 'Jaisy', color: '#d55f91', status: 'Parent', mood: '😊' },
    { name: 'Joanna', color: '#2f9d72', status: 'Home', mood: '😄' },
    { name: 'Joshua', color: '#d97706', status: 'School', mood: '😎' }
  ];
  var SECTIONS = ['Morning', 'Afternoon', 'Evening', 'Jobs'];
  var byName = {}; MEMBERS.forEach(function (m) { byName[m.name] = m; });

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function signed(n) { n = Number(n) || 0; return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }

  /* ---------- starter data (used only when the shared data has none yet) ---------- */
  var KID = {
    Morning: [['Brush Teeth', '🪥'], ['Make Bed', '🛏️'], ['Get Dressed', '👕']],
    Afternoon: [['Homework', '📓', 'tap to log min'], ['Piano', '🎹', 'tap to log min'], ['Chinese', '🀄', 'tap to log min'], ['Soccer', '⚽', 'tap to log min']],
    Evening: [['Reading', '📖', 'tap for your book'], ['Journaling', '✏️'], ['Shower', '🚿'], ['Brush Teeth', '🪥']]
  };
  var SEED_ROUT = {
    Arun: { Morning: [['Brush Teeth', '🪥'], ['Make Bed', '🛏️']], Afternoon: [['Exercise', '🏃', 'tap to log min']], Evening: [['Reading', '📖', 'tap for your book'], ['Shower', '🚿'], ['Brush Teeth', '🪥']], Jobs: [] },
    Jaisy: { Morning: [['Brush Teeth', '🪥'], ['Make Bed', '🛏️']], Afternoon: [['Exercise', '🧘', 'tap to log min']], Evening: [['Reading', '📖', 'tap for your book'], ['Journaling', '✏️'], ['Shower', '🚿'], ['Brush Teeth', '🪥']], Jobs: [] },
    Joanna: { Morning: KID.Morning, Afternoon: KID.Afternoon, Evening: KID.Evening, Jobs: [['Feed the Dog', '🐶', 'Any day', 3]] },
    Joshua: { Morning: KID.Morning.slice(0, 2), Afternoon: KID.Afternoon, Evening: KID.Evening, Jobs: [['Empty dishwasher', '🍽️', 'Any day', 3]] }
  };
  function seedRoutines() {
    var out = [];
    MEMBERS.forEach(function (m) { SECTIONS.forEach(function (sec) { (SEED_ROUT[m.name][sec] || []).forEach(function (x) {
      out.push({ id: m.name + '|' + sec + '|' + x[0], member: m.name, section: sec, name: x[0], icon: x[1], sub: x[2] || '', points: x[3] || 1, penalty: 0, created: '' });
    }); }); });
    return out;
  }
  var SEED_REWARDS = [['dessert', '🍦', 'Choose Dessert', 30], ['screen', '🎮', '30 min Extra Screen Time', 40], ['movie', '🎬', 'Pick Family Movie Night', 60], ['late', '🌙', 'Stay Up 30 min Late', 80], ['outing', '🚗', 'One-on-One Outing', 120], ['toy', '🧸', '$10 Toy Budget', 150]];
  var SEED_ACTIONS = [['a-dinner', '🍳', 'Helped with dinner', 5], ['a-reading', '📚', 'Extra reading time', 3], ['a-kind', '💛', 'Kind to a sibling', 2], ['a-fight', '😠', 'Fighting with a sibling', -3]];

  /* ---------- state ---------- */
  function readState() { try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; } catch (e) { return {}; } }
  var state = readState();
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function ensure(s) { // returns true if it had to add anything
    var ch = false;
    if (!isObj(s.points)) { s.points = {}; ch = true; }
    MEMBERS.forEach(function (m) { s.points[m.name] = Number(s.points[m.name]) || 0; });
    if (!isObj(s.tasks)) { s.tasks = {}; ch = true; }
    if (!Array.isArray(s.history)) { s.history = []; ch = true; }
    if (!isObj(s.rewards)) { s.rewards = {}; ch = true; }
    MEMBERS.forEach(function (m) { if (!Array.isArray(s.rewards[m.name])) { s.rewards[m.name] = SEED_REWARDS.map(function (r) { return { id: r[0], icon: r[1], name: r[2], stars: r[3] }; }); ch = true; } });
    if (!isObj(s.goals)) { s.goals = {}; ch = true; }
    if (!Array.isArray(s.routines)) { s.routines = seedRoutines(); ch = true; }
    if (!Array.isArray(s.pointActions)) { s.pointActions = SEED_ACTIONS.map(function (a) { return { id: a[0], icon: a[1], name: a[2], points: a[3] }; }); ch = true; }
    return ch;
  }
  function save() {
    if (state.history && state.history.length > 400) state.history = state.history.slice(-400);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
  }
  function logRead() { try { var l = JSON.parse(localStorage.getItem(RKEY) || '{}'); return l && typeof l === 'object' ? l : {}; } catch (e) { return {}; } }
  function logSave(l) { try { localStorage.setItem(RKEY, JSON.stringify(l)); } catch (e) { console.warn(e); } }

  function addPoints(member, delta) { state.points[member] = (Number(state.points[member]) || 0) + (Number(delta) || 0); }
  function routine(id) { return state.routines.filter(function (r) { return r.id === id; })[0]; }
  function doneToday(id, l) { return ((l || logRead())[id] || []).indexOf(today()) >= 0; }
  function streak(id, l) {
    var set = {}; ((l || logRead())[id] || []).forEach(function (d) { set[d] = 1; });
    var d = today(); if (!set[d]) d = addDays(d, -1);
    var n = 0; while (set[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  // Tick or untick a routine for today: gives (or takes back) its "when done" points.
  function toggleRoutine(id) {
    var r = routine(id); if (!r) return;
    var l = logRead(), d = l[id] || (l[id] = []), t = today(), i = d.indexOf(t);
    if (i >= 0) { d.splice(i, 1); addPoints(r.member, -(Number(r.points) || 0)); }
    else { d.push(t); addPoints(r.member, Number(r.points) || 0); }
    logSave(l); save();
  }
  // Manual points for a person (negative removes points). Logged in the activity list.
  function adjust(member, delta, reason) {
    delta = Number(delta) || 0; if (!delta) return;
    addPoints(member, delta);
    state.history.push({ type: 'adjust', member: member, reason: reason || '', delta: delta, date: new Date().toISOString() });
    save();
  }

  /* Missed-task penalties.
     - Routines: at the start of a new day, every routine with "points lost if not done" that wasn't ticked yesterday
       (up to the last 7 days) takes those points off, once per day.
     - One-off tasks: when the due date/time passes without the task being done, the penalty is taken off once;
       completing it later gives the penalty back and awards the "when done" points. */
  function settle() {
    var s = state, td = today(), yest = addDays(td, -1), now = new Date(), changed = false;
    if (!s.settledThrough) { s.settledThrough = yest; changed = true; }
    else if (s.settledThrough < yest) {
      var l = logRead(), start = addDays(s.settledThrough, 1), floor = addDays(td, -7);
      if (start < floor) start = floor;
      for (var d = start; d <= yest; d = addDays(d, 1)) {
        (function (day) {
          s.routines.forEach(function (r) {
            var pen = Number(r.penalty) || 0;
            if (pen <= 0 || (r.created && r.created > day)) return;
            if ((l[r.id] || []).indexOf(day) >= 0) return;
            var hid = 'pen|' + day + '|' + r.id;
            if (s.history.some(function (h) { return h.id === hid; })) return;
            addPoints(r.member, -pen);
            s.history.push({ id: hid, type: 'penalty', member: r.member, reason: 'Missed ' + r.name, delta: -pen, date: day + 'T23:59:00' });
          });
        })(d);
      }
      s.settledThrough = yest; changed = true;
    }
    Object.keys(s.tasks).forEach(function (id) {
      var t = s.tasks[id], pen = Number(t.penalty) || 0;
      if (pen > 0 && !t.completed && !t.penaltyApplied && t.date && new Date(t.date + 'T' + (t.time || '23:59')) < now) {
        addPoints(t.assignee, -pen); t.penaltyApplied = true;
        s.history.push({ type: 'penalty', member: t.assignee, reason: 'Overdue: ' + t.title, delta: -pen, date: now.toISOString() });
        changed = true;
      }
    });
    if (changed) save();
  }
  function load() { state = readState(); if (ensure(state)) save(); settle(); return state; }

  function describe(h) {
    var n = Number(h.delta) || 0, when = h.date ? new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    var text = (h.type === 'adjust' || h.type === 'penalty')
      ? h.member + ' ' + signed(n) + ' ★ · ' + (h.reason || (h.type === 'penalty' ? 'Penalty' : 'Adjustment'))
      : h.member + ' redeemed “' + h.reward + '” for ' + h.cost + ' stars';
    return text + (when ? ' · ' + when : '');
  }

  // Re-run cb when another tab or device changes the data (sync.js fires the same event), and when the page regains focus.
  function onChange(cb) {
    window.addEventListener('storage', function (e) { if (!e.key || e.key === KEY || e.key === RKEY) cb(); });
    window.addEventListener('focus', function () { cb(); });
  }
  // Two-tap delete: first tap arms the button, a second tap within 3 s runs fn (pop-up confirm() is blocked in some hosts).
  function ask(btn, fn) {
    if (btn.dataset.armed) { fn(); return; }
    btn.dataset.armed = '1'; var old = btn.textContent;
    btn.textContent = 'Delete?'; btn.style.color = '#d64545'; btn.style.fontWeight = '700';
    setTimeout(function () { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; btn.style.color = ''; btn.style.fontWeight = ''; } }, 3000);
  }

  /* ---------- theme + bottom tab bar ---------- */
  function applyTheme(dark) { document.body.classList.toggle('dark', dark); var b = document.getElementById('theme'); if (b) b.textContent = dark ? '☀️' : '🌙'; }
  var css = document.createElement('style');
  css.textContent =
    '.tabbar{position:fixed;z-index:20;left:50%;transform:translateX(-50%);bottom:max(12px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:3px;padding:6px;background:var(--card,#fff);border:1px solid var(--border,#e3e8f0);border-radius:20px;box-shadow:0 8px 28px #1b2a4a30;width:min(640px,calc(100% - 16px))}' +
    '.tabbar a{flex:1;min-width:0;display:grid;justify-items:center;gap:2px;padding:7px 2px;border-radius:14px;color:var(--muted,#8592a5);text-decoration:none;font-size:10.5px;font-weight:600}' +
    '.tabbar a span{font-size:18px;line-height:1}.tabbar a.active{background:#17243a;color:#fff}' +
    '.tabbar .moon{flex:none;width:38px;height:40px;border:0;background:transparent;font-size:20px;cursor:pointer;border-radius:12px;padding:0}' +
    '.tabbar .plus{flex:none;width:44px;height:44px;border-radius:14px;background:#c8553d;color:#fff;border:0;font-size:26px;cursor:pointer;padding:0}';
  document.head.appendChild(css);
  var TABS = [['today', 'index.html', '◫', 'Today'], ['calendar', 'calendar.html', '▦', 'Calendar'], ['routines', 'tasks.html', '✓', 'Routines'], ['meals', 'recipes.html', '🍽', 'Meals'], ['rewards', 'rewards.html', '★', 'Rewards']];
  function mountTabbar(active, opts) {
    opts = opts || {};
    var nav = document.getElementById('tabbar');
    if (!nav) { nav = document.createElement('nav'); nav.id = 'tabbar'; document.body.appendChild(nav); }
    nav.className = 'tabbar'; nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = TABS.map(function (t) { return '<a href="' + t[1] + '"' + (t[0] === active ? ' class="active"' : '') + '><span>' + t[2] + '</span>' + t[3] + '</a>'; }).join('') +
      '<button class="moon" id="theme" type="button" aria-label="Toggle dark mode">🌙</button>' +
      (opts.plus ? '<button class="plus" id="plus" type="button" aria-label="' + esc(opts.plusLabel || 'Add') + '">+</button>' : '');
    var dark = false; try { dark = localStorage.getItem(THEME_KEY) === 'dark'; } catch (e) { }
    applyTheme(dark);
    document.getElementById('theme').onclick = function () { var d = !document.body.classList.contains('dark'); applyTheme(d); try { localStorage.setItem(THEME_KEY, d ? 'dark' : 'light'); } catch (e) { } };
    if (opts.plus) document.getElementById('plus').onclick = opts.plus;
  }

  load();
  var FH = {
    KEY: KEY, RKEY: RKEY, MEMBERS: MEMBERS, SECTIONS: SECTIONS, byName: byName,
    ymd: ymd, today: today, addDays: addDays, esc: esc, uid: uid, signed: signed,
    load: load, save: save, settle: settle, logRead: logRead, logSave: logSave, addPoints: addPoints, routine: routine,
    doneToday: doneToday, streak: streak, toggleRoutine: toggleRoutine, adjust: adjust, describe: describe,
    onChange: onChange, ask: ask, mountTabbar: mountTabbar
  };
  Object.defineProperty(FH, 'state', { get: function () { return state; } });
  window.FH = FH;
})();
