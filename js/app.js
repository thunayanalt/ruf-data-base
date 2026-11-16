/* ============================================================
   RUF Workspace — application
   Single-file app, no build step. Firebase compat SDK.
   ============================================================ */
window.app = (() => {
  const CFG = window.RUF_CONFIG || {};
  const APP_VERSION = '2026.11.13';

  // ---------- diagnostics (small ring buffer in localStorage; shown at #/diagnostics) ----------
  const T0 = performance.now();
  function dlog(kind, info) {
    try {
      const rec = { t: new Date().toISOString(), ms: Math.round(performance.now() - T0), kind, info: info == null ? '' : String(info).slice(0, 300) };
      const arr = JSON.parse(localStorage.getItem('ruf_diag') || '[]'); arr.push(rec); while (arr.length > 150) arr.shift();
      localStorage.setItem('ruf_diag', JSON.stringify(arr));
    } catch (e) { }
  }
  function diagList() { try { return JSON.parse(localStorage.getItem('ruf_diag') || '[]'); } catch (e) { return []; } }
  window.addEventListener('error', e => dlog('js-error', (e.message || '') + ' @' + ((e.filename || '').split('/').pop()) + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => dlog('promise-error', (e.reason && (e.reason.code || e.reason.message)) || e.reason));
  document.addEventListener('visibilitychange', () => dlog('visibility', document.visibilityState));
  window.addEventListener('online', () => dlog('network', 'online')); window.addEventListener('offline', () => dlog('network', 'offline'));
  try { const nav = performance.getEntriesByType('navigation')[0]; dlog('page-load', (nav ? nav.type : 'unknown') + ' · ' + navigator.userAgent.slice(0, 120)); } catch (e) { }
  const STAGES = ['Design', 'Review', 'Production', 'Install', 'Done'];
  const STAGE_FULL = ['Design', 'Client Review', 'Production', 'Installation', 'Done'];
  const PHASES = ['design', 'review', 'production', 'install'];
  const PHASE_LABEL = { design: 'Design', review: 'Client review', production: 'Production', install: 'Installation' };
  const PHASE_SHARE = { design: 0.2, review: 0.2, production: 0.45, install: 0.15 };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const DEFAULT_FOLDERS = [
    { id: '2d', name: '2D Sketches & Elevations' },
    { id: '3d', name: '3D Renders' },
    { id: 'plan', name: 'Floor Plan' },
  ];
  const DEFAULT_PRODUCTS = ['Walk-in closet', 'Wardrobe', 'Kitchen cabinets', 'TV wall & cladding', 'Feature wall', 'Bookshelf wall', 'Vanity unit', 'Reception desk'];
  const DEFAULT_MATERIALS = ['Joinery', 'Marble', 'Glass', 'Wallpaper'];
  const CHECKLIST_OPTIONS = ['Double hanging', 'Single hanging', 'Single hanging + shelves', 'Single hanging + drawers', 'Shelves only', 'Drawers only', 'Shoe rack', 'Open display'];

  // ---------- state ----------
  const S = {
    user: null, me: null,
    members: [], projects: [], meetings: [], notifs: [], checkups: [], responses: [],
    settings: { products: DEFAULT_PRODUCTS, materials: DEFAULT_MATERIALS },
    ui: { dashPeriod: 'all', dashFilter: 'active', ganttZoom: 'all', ganttAnchor: null, calMonth: null, projTab: 'active', projQuery: '', projChip: 'all' },
    detail: { project: null, files: [], activity: [], tab: 'files', folder: null },
  };

  // ---------- firebase ----------
  let auth, db, storage;
  let persistenceOn = false;
  async function initFirebase() {
    firebase.initializeApp(CFG.firebase);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    // Networks that block streaming (some mobile carriers / office proxies) make Firestore hang; auto-detect switches to long-polling.
    try { db.settings({ experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true }); } catch (e) { dlog('fs-settings', e.message); }
    // Keep a local copy of the data so reloads are fast and the app keeps working on a flaky connection.
    try { await db.enablePersistence({ synchronizeTabs: true }); persistenceOn = true; dlog('fs-persistence', 'on'); }
    catch (e) { dlog('fs-persistence', (e && e.code) || e); }
  }

  // ---------- tiny utils ----------
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = s => esc(s);
  function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function d0(s) { if (!s) return null; if (s instanceof Date) return s; return new Date(s + 'T00:00:00'); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function dayDiff(a, b) { return Math.round((b - a) / 86400000); }
  function fmt(s) { const d = d0(s); return d ? d.getDate() + ' ' + MONTHS[d.getMonth()] : '—'; }
  function fmtLong(s) { const d = d0(s); return d ? d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : '—'; }
  function fmtDate(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function nowISO() { return new Date().toISOString(); }
  function ago(isoStr) {
    if (!isoStr) return '—';
    const ms = Date.now() - new Date(isoStr).getTime();
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (h < 24) return h + ' h ago';
    if (d === 1) return 'yesterday'; if (d < 7) return d + ' days ago'; if (d < 30) return Math.floor(d / 7) + ' w ago';
    return fmtLong(isoStr.slice(0, 10));
  }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function weekKey(d) { const s = addDays(d, -d.getDay()); return iso(s); }
  function kwd(n) { return (Number(n) || 0).toLocaleString('en-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' KWD'; }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  function memberName(email) { const m = S.members.find(x => x.email === email); return m ? m.name : (email || '—'); }
  function firstName(email) { return memberName(email).split(' ')[0]; }
  function pcOf(d, start, span) { return Math.max(0, Math.min(100, (d - start) / span * 100)); }

  // ---------- toast ----------
  let toastT;
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2600);
  }

  // ---------- roles ----------
  const isAdmin = () => S.me && S.me.role === 'admin';
  const canSeeAll = () => S.me && (S.me.role === 'admin' || S.me.role === 'manager');
  const canEditProject = p => canSeeAll() || (p && (p.assigned || []).includes(S.me.email));
  const myProjects = () => canSeeAll() ? S.projects : S.projects.filter(p => (p.assigned || []).includes(S.me.email));

  // ---------- firestore helpers ----------
  const loadWarnings = [];
  const col = name => db.collection(name);
  async function timed(label, p) {
    const t = performance.now(); const slow = setTimeout(() => dlog('slow', label + ' > 6s'), 6000);
    try { return await p; } finally { clearTimeout(slow); const ms = Math.round(performance.now() - t); if (ms > 1500) dlog('timing', label + ' ' + ms + 'ms'); }
  }
  async function getAll(name, orderField) {
    let q = col(name); if (orderField) q = q.orderBy(orderField);
    const snap = await timed('get ' + name, q.get()); return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function loadAll() {
    const soft = (p, what) => p.catch(e => { console.warn('Could not load ' + what, e); loadWarnings.push(what); return []; });
    loadWarnings.length = 0;
    const [members, projects, meetings, notifs, checkups, responses, settings] = await Promise.all([
      getAll('members'),                       // required — if this fails the error surfaces
      soft(getAll('projects'), 'projects'), soft(getAll('meetings'), 'meetings'),
      soft(col('notifications').where('to', '==', S.me.email).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))), 'notifications'),
      soft(getAll('checkups'), 'checkups'), soft(col('portalResponses').where('handled', '==', false).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))), 'client responses'),
      col('settings').doc('lists').get().catch(e => { console.warn('Could not load settings', e); return { exists: false }; }),
    ]);
    if (loadWarnings.length) setTimeout(() => toast('Some data could not be loaded: ' + loadWarnings.join(', ') + '. Ask your admin to check the database rules.', 6000), 500);
    S.members = members.sort((a, b) => a.name.localeCompare(b.name));
    S.projects = projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    S.meetings = meetings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    S.notifs = notifs.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    S.checkups = checkups; S.responses = responses;
    if (settings.exists) S.settings = { ...S.settings, ...settings.data() };
    updateBadge();
  }
  async function reloadProjects() { S.projects = (await getAll('projects')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }

  async function saveProject(p, patch) {
    patch.updatedAt = nowISO();
    await col('projects').doc(p.id).update(patch);
    Object.assign(p, patch);
    const inList = S.projects.find(x => x.id === p.id);
    if (inList && inList !== p) Object.assign(inList, patch);
  }
  async function logActivity(p, text, type) {
    const entry = { text, by: S.me.email, at: nowISO(), type: type || 'info' };
    await col('projects').doc(p.id).collection('activity').add(entry);
    if (S.detail.project && S.detail.project.id === p.id) S.detail.activity.unshift({ id: uid(), ...entry });
    await col('projects').doc(p.id).update({ lastActivity: text, lastActivityAt: entry.at });
    p.lastActivity = text; p.lastActivityAt = entry.at;
  }
  async function notify(emails, text, projectId, type) {
    const list = [...new Set(emails.filter(Boolean))];
    if (!list.length) return;
    const batch = db.batch();
    list.forEach(e => batch.set(col('notifications').doc(), { to: e, text, projectId: projectId || null, type: type || 'info', read: false, at: nowISO() }));
    await batch.commit();
    if (CFG.n8nWebhookUrl) {
      const to = list.map(e => S.members.find(m => m.email === e)).filter(Boolean).map(m => ({ name: m.name, phone: m.phone || '', email: m.email, channels: m.notify || {} }));
      fetch(CFG.n8nWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type || 'notification', to, text, projectId: projectId || null }) }).catch(() => {});
    }
  }
  function updateBadge() {
    const n = S.notifs.filter(x => !x.read).length + dueCheckups().length;
    const b = $('navBadge'); b.textContent = n; b.classList.toggle('hidden', n === 0);
  }

  // ---------- auth ----------
  function showLogin(msg, err) {
    const sp = $('splash'); if (sp) sp.classList.add('hidden');
    $('loginWrap').classList.remove('hidden'); $('sidebar').classList.add('hidden'); $('main').classList.add('hidden');
    const f = $('loginForm'); if (f) f.classList.remove('hidden');
    const m = $('loginMsg'); m.textContent = msg || ''; m.classList.toggle('err', !!err);
  }
  function showSplash(text) {
    const sp = $('splash'); if (!sp) return;
    sp.classList.remove('hidden'); const t = $('splashText'); if (t && text) t.textContent = text;
    $('loginWrap').classList.add('hidden');
  }
  function publicUrl() { return CFG.publicUrl || (location.origin + location.pathname); }
  function loginFields() {
    const email = ($('loginEmail').value || '').trim().toLowerCase();
    const pw = $('loginPassword').value || '';
    return { email, pw };
  }
  let signingIn = false;
  function loginBusy(on, label) { signingIn = on; const b = $('loginBtn'); if (b) { b.disabled = on; b.textContent = on ? (label || 'Signing in…') : 'Sign in'; } }
  function authMessage(e) {
    const c = (e && e.code) || '';
    if (c === 'auth/invalid-email') return 'That email address doesn\'t look right.';
    if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials' || c === 'auth/user-not-found')
      return 'Wrong password — or no password has been created for this email yet. First time here? Use "Create your password" below.';
    if (c === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again, or use "Forgot password".';
    if (c === 'auth/email-already-in-use') return 'A password already exists for this email. Use Sign in, or "Forgot password" to reset it.';
    if (c === 'auth/weak-password') return 'Please choose a longer password (at least 8 characters).';
    if (c === 'auth/network-request-failed') return 'No internet connection. Check your network and try again.';
    return 'Something went wrong: ' + ((e && e.message) || e);
  }
  async function signIn() {
    if (signingIn) return;                                   // ignore a second click while the first is working
    const { email, pw } = loginFields();
    if (!email.includes('@')) { showLogin('Please enter your work email.', true); return; }
    if (!pw) { showLogin('Please enter your password.', true); return; }
    loginBusy(true); $('loginMsg').textContent = ''; dlog('auth', 'sign-in start');
    try {
      await timed('signIn', auth.signInWithEmailAndPassword(email, pw));
      try { localStorage.setItem('ruf_email', email); } catch (e) { }
      loginBusy(true, 'Loading your workspace…');            // stays busy until enterApp shows the app
      dlog('auth', 'sign-in ok');
    } catch (e) { dlog('auth', 'sign-in failed ' + (e.code || e.message)); loginBusy(false); showLogin(authMessage(e), true); }
  }
  async function createPassword() {
    if (signingIn) return;
    const { email, pw } = loginFields();
    if (!email.includes('@')) { showLogin('Enter your work email first, then choose a password.', true); return; }
    if (pw.length < 8) { showLogin('Type the password you want to use (at least 8 characters), then press "Create your password" again.', true); $('loginPassword').focus(); return; }
    loginBusy(true, 'Creating…'); $('loginMsg').textContent = '';
    try {
      await auth.createUserWithEmailAndPassword(email, pw);
      try { localStorage.setItem('ruf_email', email); } catch (e) { }
      loginBusy(true, 'Loading your workspace…');
    } catch (e) { loginBusy(false); showLogin(authMessage(e), true); }
  }
  async function forgotPassword() {
    const { email } = loginFields();
    if (!email.includes('@')) { showLogin('Enter your work email first, then press "Forgot password".', true); return; }
    try { await auth.sendPasswordResetEmail(email, { url: publicUrl() }); showLogin('Reset email sent to ' + email + '. Open the link in it, choose a new password, then come back here and sign in. (Check spam if it takes more than a minute.)'); }
    catch (e) { showLogin(authMessage(e), true); }
  }
  async function resolveMember(user) {
    const email = (user.email || '').toLowerCase();
    const ref = col('members').doc(email);
    let snap = await ref.get();
    if (!snap.exists && email === (CFG.ownerEmail || '').toLowerCase()) {
      await ref.set({ email, name: user.displayName || email.split('@')[0], job: 'Owner', role: 'admin', phone: '', notify: { app: true, whatsapp: true, email: true }, checkupDay: 'Sunday', active: true, createdAt: nowISO() });
      snap = await ref.get();
    }
    if (!snap.exists || snap.data().active === false) {
      dlog('auth', 'not a member: ' + email);
      await auth.signOut(); loginBusy(false);
      showLogin(email + ' is not a member of this workspace. Ask an admin to invite you from the Team tab.', true);
      return null;
    }
    return { id: snap.id, ...snap.data() };
  }
  async function signOut() { await auth.signOut(); location.hash = '#/dashboard'; }

  // ---------- boot ----------
  function showLoading(on) {
    const f = $('loginForm'), l = $('loginLoading');
    if (f) f.classList.toggle('hidden', on);
    if (l) l.classList.toggle('hidden', !on);
  }
  let entering = false;
  async function enterApp(user) {
    if (entering) { dlog('auth', 'enterApp skipped (already entering)'); return; }
    entering = true;
    try {
      S.user = user;
      const me = await timed('resolveMember', resolveMember(user)); if (!me) return;
      S.me = me;
      await timed('loadAll', loadAll());
      const sp = $('splash'); if (sp) sp.classList.add('hidden');
      $('loginWrap').classList.add('hidden'); $('sidebar').classList.remove('hidden'); $('main').classList.remove('hidden');
      $('meAvatar').textContent = initials(me.name); $('meName').textContent = me.name; $('meRole').textContent = (me.job || '') + ' · ' + cap(me.role);
      $('newProjectBtn').classList.toggle('hidden', !canSeeAll());
      const v = $('appVersion'); if (v) v.textContent = 'v' + APP_VERSION;
      if (!location.hash || location.hash === '#/') location.hash = '#/dashboard';
      loginBusy(false);
      await render();
      dlog('auth', 'app ready for ' + me.email);
    } finally { entering = false; }
  }
  async function boot() {
    if (!CFG.firebase || CFG.firebase.apiKey === 'PASTE_HERE') { showLogin('Setup needed: open js/config.js and paste your Firebase config (see SETUP.md).', true); return; }
    showSplash('Loading…');
    await initFirebase();
    $('loginLogo').textContent = CFG.companyName || 'RUF'; $('sbLogo').textContent = CFG.companyName || 'RUF';
    try { const remembered = localStorage.getItem('ruf_email'); if (remembered && $('loginEmail')) $('loginEmail').value = remembered; } catch (e) { }
    // Stay signed in across refreshes and browser restarts (falls back to session-only in private browsing).
    try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }
    catch (e) { dlog('auth', 'persistence LOCAL failed: ' + (e.code || e.message)); try { await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION); } catch (e2) { } }
    // If Firebase takes unusually long to restore the session, say so instead of looking frozen.
    const slowSplash = setTimeout(() => { const t = $('splashText'); if (t && !$('splash').classList.contains('hidden')) t.textContent = 'Still loading — slow connection…'; dlog('slow', 'auth restore > 8s'); }, 8000);
    auth.onAuthStateChanged(async user => {
      clearTimeout(slowSplash);
      dlog('auth', user ? 'state: signed in (' + user.email + ')' : 'state: signed out');
      if (!user) {
        const wasIn = !!S.me; S.me = null; S.user = null; loginBusy(false);
        showLogin(wasIn ? 'You were signed out. Please sign in again.' : '');
        return;
      }
      if (S.me && S.me.email === (user.email || '').toLowerCase()) return;   // same user (token refresh) — nothing to do
      if (!$('splash').classList.contains('hidden')) showSplash('Loading your workspace…');
      try { await enterApp(user); }
      catch (e) {
        dlog('boot-error', (e && (e.code || e.message)) || e); console.error('Could not load workspace', e);
        loginBusy(false);
        showLogin('Signed in as ' + user.email + ', but the workspace could not be loaded: ' + ((e && e.message) || e) + ' — check your connection and try again.', true);
        const f = $('loginForm'); if (f) f.classList.add('hidden');
        const r = $('loginRetry'); if (r) { r.classList.remove('hidden'); r.onclick = () => location.reload(); }
      }
    });
    window.addEventListener('hashchange', render);
    setupTooltip(); setupDatePickerClose();
  }
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

  // ---------- router ----------
  function route() {
    const parts = (location.hash || '#/dashboard').slice(2).split('/');
    return { view: parts[0] || 'dashboard', id: parts[1] || null, sub: parts[2] || null };
  }
  let renderSeq = 0;
  async function render() {
    if (!S.me) return;
    const r = route(); const seq = ++renderSeq; const t = performance.now();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === r.view || (r.view === 'project' && n.dataset.nav === 'projects') || (r.view === 'new' && n.dataset.nav === 'projects')));
    closeDrawer(); closeModal();
    const v = $('view');
    try {
      if (r.view === 'dashboard') v.innerHTML = viewDashboard();
      else if (r.view === 'projects') v.innerHTML = viewProjects();
      else if (r.view === 'new') { if (!canSeeAll()) { location.hash = '#/projects'; return; } v.innerHTML = viewNewProject(); npUpdate(); }
      else if (r.view === 'project') {
        const cached = S.detail.project && S.detail.project.id === r.id;
        if (!cached) v.innerHTML = '<div class="detail-back" onclick="location.hash=\'#/projects\'">&larr; Back to projects</div><div class="skeleton"><div class="sk-line w40"></div><div class="sk-line w70"></div><div class="sk-box"></div><div class="sk-box"></div></div>';
        await timed('openDetail', openDetail(r.id, r.sub, () => seq === renderSeq));   // paints only if the user is still on this page
        if (seq !== renderSeq) return;                     // user navigated elsewhere while loading
      }
      else if (r.view === 'gantt') { v.innerHTML = viewGantt(); renderGantt(); }
      else if (r.view === 'calendar') v.innerHTML = viewCalendar();
      else if (r.view === 'team') v.innerHTML = viewTeam();
      else if (r.view === 'diagnostics') v.innerHTML = viewDiagnostics();
      else v.innerHTML = viewDashboard();
    } catch (e) {
      console.error(e); dlog('render-error', r.view + ': ' + (e.code || e.message));
      v.innerHTML = '<div class="empty">Something went wrong loading this page: ' + esc(e.message) + '<br><br><span class="link" onclick="app.render()">Try again</span></div>';
    }
    const ms = Math.round(performance.now() - t); if (ms > 800) dlog('timing', 'render ' + r.view + ' ' + ms + 'ms');
    window.scrollTo(0, 0);
  }
  function viewDiagnostics() {
    const rows = diagList().slice().reverse();
    const txt = 'RUF Workspace v' + APP_VERSION + ' · ' + navigator.userAgent + '\n' + rows.map(r => r.t.slice(11, 19) + ' +' + r.ms + 'ms ' + r.kind + ' ' + r.info).join('\n');
    return '<div class="topbar"><div><div class="greeting">Diagnostics</div><div class="greeting-sub">App v' + APP_VERSION + ' · Firestore cache ' + (persistenceOn ? 'on' : 'off') + ' · ' + (navigator.onLine ? 'online' : 'offline') + '</div></div>' +
      '<div style="display:flex;gap:8px;"><button class="btn-secondary" onclick="navigator.clipboard.writeText(' + JSON.stringify(txt).replace(/"/g, '&quot;') + ').then(()=>app.toast(\'Copied — paste it to Claude\'))">Copy log</button><button class="btn-secondary" onclick="localStorage.removeItem(\'ruf_diag\'); app.render()">Clear</button></div></div>' +
      '<div class="small" style="margin-bottom:10px;">Newest first. If the app misbehaves, open this page and press Copy log.</div>' +
      '<div class="timeline">' + (rows.length ? rows.map(r => '<div class="tl-item"><div class="tl-dot ' + (/error|slow/.test(r.kind) ? 'wait' : '') + '"></div><div class="tl-body"><div class="tl-text">' + esc(r.kind) + ' — ' + esc(r.info) + '</div><div class="tl-meta">' + esc(r.t.replace('T', ' ').slice(0, 19)) + ' · +' + r.ms + ' ms</div></div></div>').join('') : '<div class="small" style="padding:14px 0;">Nothing logged yet.</div>') + '</div>';
  }

  // ---------- shared UI: drawer / modal ----------
  function openDrawer(html) { $('drawer').innerHTML = html; $('drawer').classList.add('open'); $('drawerBackdrop').classList.add('open'); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawerBackdrop').classList.remove('open'); }
  function openModal(html) { $('modal').innerHTML = html; $('modal').classList.add('open'); $('modalBackdrop').classList.add('open'); }
  function closeModal() { $('modal').classList.remove('open'); $('modalBackdrop').classList.remove('open'); }
  function confirmBox(title, text, okLabel, onOk, danger) {
    openModal('<div class="drawer-head"><div class="member-name">' + esc(title) + '</div></div>' +
      '<div class="drawer-body"><div style="font-size:13.5px;color:var(--muted);line-height:1.5;">' + text + '</div></div>' +
      '<div class="drawer-foot"><button class="btn-secondary" onclick="app.closeModal()">Cancel</button>' +
      '<button class="btn-primary' + (danger ? ' danger-btn' : '') + '" id="confirmOk">' + esc(okLabel) + '</button></div>');
    $('confirmOk').onclick = async () => { closeModal(); await onOk(); };
  }

  // ---------- shared UI: date picker ----------
  let dpInput = null, dpView = null, dpCb = null;
  function openDatePicker(input, cb) {
    dpInput = input; dpCb = cb || null;
    const cur = input.dataset.iso ? d0(input.dataset.iso) : today();
    dpView = new Date(cur.getFullYear(), cur.getMonth(), 1);
    dpRender();
    const pop = $('datePicker'); const r = input.getBoundingClientRect();
    pop.classList.add('open'); const pr = pop.getBoundingClientRect();
    let x = r.left, y = r.bottom + 6;
    if (x + pr.width > window.innerWidth - 12) x = window.innerWidth - 12 - pr.width;
    if (y + pr.height > window.innerHeight - 12) y = r.top - pr.height - 6;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function dpClose() { $('datePicker').classList.remove('open'); dpInput = null; }
  function dpMove(n) { dpView = addMonths(dpView, n); dpRender(); }
  function dpRender() {
    $('dpTitle').textContent = MONTHS_LONG[dpView.getMonth()] + ' ' + dpView.getFullYear();
    const first = new Date(dpView.getFullYear(), dpView.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    const sel = dpInput && dpInput.dataset.iso ? dpInput.dataset.iso : null;
    let min = null;
    if (dpInput && dpInput.dataset.minFrom) { const src = $(dpInput.dataset.minFrom); if (src && src.dataset.iso) min = d0(src.dataset.iso); }
    const tISO = iso(today());
    let out = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), s = iso(d); const cls = ['dp-day'];
      if (d.getMonth() !== dpView.getMonth()) cls.push('other');
      if (s === tISO) cls.push('today'); if (sel === s) cls.push('sel');
      if (d.getDay() === 5 || d.getDay() === 6) cls.push('we');
      const dis = min && d < min; if (dis) cls.push('dis');
      out += '<div class="' + cls.join(' ') + '"' + (dis ? '' : ' onclick="app.dpPick(\'' + s + '\')"') + '>' + d.getDate() + '</div>';
    }
    $('dpGrid').innerHTML = out;
  }
  function dpPick(s) {
    if (!dpInput) return;
    dpInput.dataset.iso = s; dpInput.value = fmtLong(s);
    document.querySelectorAll('[data-min-from="' + dpInput.id + '"]').forEach(dep => { if (dep.dataset.iso && d0(dep.dataset.iso) < d0(s)) { dep.dataset.iso = ''; dep.value = ''; } });
    const cb = dpCb; dpClose(); if (cb) cb(s);
  }
  function dpToday() { dpPick(iso(today())); }
  function dpClear() { if (dpInput) { dpInput.dataset.iso = ''; dpInput.value = ''; } const cb = dpCb; dpClose(); if (cb) cb(''); }
  function setupDatePickerClose() {
    document.addEventListener('mousedown', e => { const pop = $('datePicker'); if (!pop.classList.contains('open')) return; if (pop.contains(e.target) || e.target.classList.contains('date-input')) return; dpClose(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { dpClose(); closeModal(); closeDrawer(); } });
  }
  function dateField(id, label, value, opts) {
    opts = opts || {};
    return '<div class="fld"><label>' + esc(label) + '</label><div class="date-wrap">' +
      '<input type="text" class="date-input" id="' + id + '" value="' + attr(value ? fmtLong(value) : '') + '" data-iso="' + attr(value || '') + '"' +
      (opts.minFrom ? ' data-min-from="' + opts.minFrom + '"' : '') + ' placeholder="' + attr(opts.placeholder || 'Pick a date') + '" readonly onclick="app.openDatePicker(this' + (opts.cb ? ',' + opts.cb : '') + ')"/>' +
      '<svg class="date-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg></div>' +
      (opts.hint ? '<div class="fld-hint">' + opts.hint + '</div>' : '') + '</div>';
  }

  // ---------- shared UI: tooltip ----------
  function setupTooltip() {
    const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
    let active = null;
    function show(t) {
      if (t === active) return; active = t; tip.innerHTML = '';
      if (t.dataset.tipTitle) { const h = document.createElement('div'); h.className = 'tip-title'; h.textContent = t.dataset.tipTitle; tip.appendChild(h); }
      const b = document.createElement('div'); b.className = 'tip-body'; b.textContent = t.dataset.tip; tip.appendChild(b);
      tip.classList.add('on'); place(t);
    }
    function place(t) {
      const r = t.getBoundingClientRect(), tr = tip.getBoundingClientRect(); let x = r.left, y = r.bottom + 8;
      if (x + tr.width > window.innerWidth - 12) x = window.innerWidth - 12 - tr.width; if (x < 12) x = 12;
      if (y + tr.height > window.innerHeight - 12) y = r.top - tr.height - 8;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    function hide() { active = null; tip.classList.remove('on'); }
    document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (t) show(t); else if (active) hide(); });
    document.addEventListener('mouseout', e => { if (!active) return; const to = e.relatedTarget; if (to && (active.contains(to) || (to.closest && to.closest('[data-tip]') === active))) return; hide(); });
    window.addEventListener('scroll', () => { if (active) place(active); }, true);
  }

  // ---------- shared UI: stage tracker ----------
  function stageTrack(idx) {
    let t = '<div class="stage-track">';
    STAGES.forEach((s, i) => { const cls = i < idx ? 'done' : (i === idx ? 'current' : ''); t += '<div class="stage-col ' + cls + '"><div class="dot ' + cls + '"></div><span>' + s + '</span></div>'; });
    return t + '</div>';
  }
  function stagePill(p) {
    const map = ['design', 'review', 'production', 'install', 'done'];
    const i = p.status === 'done' ? 4 : (p.stage || 0);
    return '<span class="stage-pill ' + map[i] + '">' + (i === 4 ? 'Complete' : STAGE_FULL[i]) + '</span>';
  }
  function tglRow(id, values, selected, onclick) {
    return '<div class="toggle-row" id="' + id + '">' + values.map(v => '<div class="tgl' + (selected.includes(v) ? ' active' : '') + '" data-v="' + attr(v) + '" onclick="app.tgl(this' + (onclick ? ',' + onclick : '') + ')">' + esc(v) + '</div>').join('') + '</div>';
  }
  function tgl(el, cb) { el.classList.toggle('active'); if (cb) cb(); }
  function tglValues(id) { return [...document.querySelectorAll('#' + id + ' .tgl.active')].map(t => t.dataset.v); }
  function addToggle(rowId, inputId, cb) {
    const inp = $(inputId); const v = (inp.value || '').trim(); if (!v) return;
    const row = $(rowId); const ex = [...row.querySelectorAll('.tgl')].find(t => t.dataset.v.toLowerCase() === v.toLowerCase());
    if (ex) ex.classList.add('active'); else { const t = document.createElement('div'); t.className = 'tgl active custom'; t.dataset.v = v; t.textContent = v; t.onclick = () => { t.classList.toggle('active'); if (cb) cb(); }; row.appendChild(t); }
    inp.value = ''; if (cb) cb();
  }
  function segSet(id, v) { document.querySelectorAll('#' + id + ' .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.v === v)); }
  function segVal(id) { const b = document.querySelector('#' + id + ' .seg-btn.active'); return b ? b.dataset.v : null; }
  function segPick(btn, cb) { segSet(btn.parentElement.id, btn.dataset.v); if (cb) cb(btn.dataset.v); }

  // ---------- Google Calendar (per-user OAuth, invites sent to attendees) ----------
  const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
  let gcalToken = null, gcalExp = 0, gcalClient = null;
  function gcalKey() { return 'ruf_gcal_' + (S.me ? S.me.email : ''); }
  function gcalLoad() { try { const j = JSON.parse(sessionStorage.getItem(gcalKey()) || 'null'); if (j && j.exp > Date.now()) { gcalToken = j.token; gcalExp = j.exp; } } catch (e) { } }
  const gcal = {
    enabled: () => !!(CFG.googleClientId && window.google && google.accounts && google.accounts.oauth2),
    configured: () => !!CFG.googleClientId,
    connected: () => { if (!gcalToken) gcalLoad(); return !!gcalToken && Date.now() < gcalExp - 30000; },
    connect(interactive) {
      return new Promise((resolve, reject) => {
        if (!gcal.enabled()) return reject(new Error('Google Calendar is not set up yet (googleClientId missing).'));
        if (gcal.connected()) return resolve(gcalToken);
        gcalClient = google.accounts.oauth2.initTokenClient({
          client_id: CFG.googleClientId, scope: GCAL_SCOPE, hint: S.me ? S.me.email : undefined,
          callback: r => {
            if (r && r.access_token) { gcalToken = r.access_token; gcalExp = Date.now() + (r.expires_in || 3600) * 1000; try { sessionStorage.setItem(gcalKey(), JSON.stringify({ token: gcalToken, exp: gcalExp })); } catch (e) { } resolve(gcalToken); }
            else reject(new Error((r && (r.error_description || r.error)) || 'Google sign-in was cancelled'));
          },
          error_callback: e => reject(new Error(e && e.type === 'popup_closed' ? 'Google sign-in window was closed' : (e && e.message) || 'Google sign-in failed')),
        });
        gcalClient.requestAccessToken({ prompt: interactive ? '' : '' });
      });
    },
    disconnect() { const t = gcalToken; gcalToken = null; gcalExp = 0; try { sessionStorage.removeItem(gcalKey()); } catch (e) { } if (t && window.google) try { google.accounts.oauth2.revoke(t, () => { }); } catch (e) { } },
    async api(method, path, body) {
      const token = await gcal.connect(true);
      const r = await fetch('https://www.googleapis.com/calendar/v3/' + path + (path.includes('?') ? '&' : '?') + 'sendUpdates=all', { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 401) { gcal.disconnect(); throw new Error('Google Calendar session expired — press Save again to reconnect.'); }
      if (!r.ok) { let msg = r.statusText; try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) { } throw new Error('Google Calendar: ' + msg); }
      return r.status === 204 ? null : r.json();
    },
    toEvent(m) {
      const tz = CFG.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kuwait';
      const norm = t => { const x = /^(\d{1,2})[:.](\d{2})$/.exec((t || '').trim()); return x ? String(x[1]).padStart(2, '0') + ':' + x[2] : null; };
      const st = norm(m.time); let en = norm(m.end);
      if (st && !en) { const [h, mi] = st.split(':').map(Number); en = String(Math.min(23, h + 1)).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); }
      const p = S.projects.find(x => x.id === m.projectId);
      const ev = {
        summary: m.title, location: m.location || '',
        description: [(m.agenda ? 'Agenda: ' + m.agenda : ''), (p ? 'Project: ' + p.client + ' — ' + (p.products || []).join(' + ') : ''), 'Created from ' + (CFG.companyName || 'RUF') + ' Workspace'].filter(Boolean).join('\n'),
        attendees: [...new Set((m.attendees || []).filter(Boolean))].map(e => ({ email: e })),
        reminders: { useDefault: true },
      };
      if (st) { ev.start = { dateTime: m.date + 'T' + st + ':00', timeZone: tz }; ev.end = { dateTime: m.date + 'T' + (en > st ? en : st) + ':00', timeZone: tz }; if (en <= st) ev.end.dateTime = m.date + 'T' + String(Math.min(23, Number(st.slice(0, 2)) + 1)).padStart(2, '0') + st.slice(2) + ':00'; }
      else { ev.start = { date: m.date }; ev.end = { date: iso(addDays(d0(m.date), 1)) }; }
      return ev;
    },
    async createEvent(m) { const r = await gcal.api('POST', 'calendars/primary/events', gcal.toEvent(m)); return { eventId: r.id, owner: S.me.email, link: r.htmlLink || '' }; },
    async updateEvent(m) { if (!m.gcal || !m.gcal.eventId) return gcal.createEvent(m); const r = await gcal.api('PATCH', 'calendars/primary/events/' + encodeURIComponent(m.gcal.eventId), gcal.toEvent(m)); return { eventId: r.id, owner: m.gcal.owner, link: r.htmlLink || m.gcal.link || '' }; },
    async deleteEvent(m) { if (!m.gcal || !m.gcal.eventId) return; try { await gcal.api('DELETE', 'calendars/primary/events/' + encodeURIComponent(m.gcal.eventId)); } catch (e) { if (!/404|410|deleted|not found/i.test(e.message)) throw e; } },
  };

  // ---------- checkups (weekly) ----------
  function dueCheckups() {
    if (!S.me) return [];
    const wk = weekKey(today());
    return myProjects().filter(p => p.status !== 'done' && (p.assigned || []).includes(S.me.email))
      .filter(p => !S.checkups.find(c => c.projectId === p.id && c.by === S.me.email && c.week === wk));
  }
  async function markCheckup(projectId) {
    const wk = weekKey(today());
    const doc = { projectId, by: S.me.email, week: wk, at: nowISO() };
    await col('checkups').add(doc); S.checkups.push(doc);
    const p = S.projects.find(x => x.id === projectId); if (p) await logActivity(p, 'Weekly checkup completed', 'checkup');
    updateBadge(); render(); toast('Checkup marked as done');
  }
  async function markRead(id) { await col('notifications').doc(id).update({ read: true }); const n = S.notifs.find(x => x.id === id); if (n) n.read = true; updateBadge(); render(); }
  async function markAllRead() { const b = db.batch(); S.notifs.filter(n => !n.read).forEach(n => { b.update(col('notifications').doc(n.id), { read: true }); n.read = true; }); await b.commit(); updateBadge(); render(); }

  // ============================================================
  //  VIEWS are appended below (dashboard, projects, new, detail,
  //  gantt, calendar, team) — see app.views.js section
  // ============================================================
  const V = {}; // view functions register here

  // placeholder references resolved after views load
  let viewDashboard, viewProjects, viewNewProject, npUpdate, openDetail, viewGantt, renderGantt, viewCalendar, viewTeam;

  function registerViews(fns) {
    ({ viewDashboard, viewProjects, viewNewProject, npUpdate, openDetail, viewGantt, renderGantt, viewCalendar, viewTeam } = fns);
  }

  return {
    // exposed for views + inline handlers
    S, CFG, STAGES, STAGE_FULL, PHASES, PHASE_LABEL, PHASE_SHARE, MONTHS, MONTHS_LONG, DAYS_LONG, DAY_LETTERS, DEFAULT_FOLDERS, CHECKLIST_OPTIONS,
    $, esc, attr, today, d0, iso, addDays, addMonths, dayDiff, fmt, fmtLong, fmtDate, nowISO, ago, uid, weekKey, kwd, initials, memberName, firstName, pcOf, cap,
    toast, isAdmin, canSeeAll, canEditProject, myProjects,
    col, getAll, loadAll, reloadProjects, saveProject, logActivity, notify, updateBadge,
    db: () => db, storage: () => storage, auth: () => auth,
    boot, signIn, createPassword, forgotPassword, signOut, render, route,
    openDrawer, closeDrawer, openModal, closeModal, confirmBox,
    openDatePicker, dpMove, dpPick, dpToday, dpClear, dateField,
    stageTrack, stagePill, tglRow, tgl, tglValues, addToggle, segSet, segVal, segPick,
    dueCheckups, markCheckup, markRead, markAllRead,
    registerViews, V,
    publicUrl, gcal, dlog, APP_VERSION,
  };
})();
