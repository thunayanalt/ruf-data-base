/* ============================================================
   RUF Workspace — application
   Single-file app, no build step. Firebase compat SDK.
   ============================================================ */
window.app = (() => {
  const CFG = window.RUF_CONFIG || {};
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
  function initFirebase() {
    firebase.initializeApp(CFG.firebase);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
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
  const col = name => db.collection(name);
  async function getAll(name, orderField) {
    let q = col(name); if (orderField) q = q.orderBy(orderField);
    const snap = await q.get(); return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function loadAll() {
    const [members, projects, meetings, notifs, checkups, responses, settings] = await Promise.all([
      getAll('members'), getAll('projects'), getAll('meetings'), col('notifications').where('to', '==', S.me.email).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
      getAll('checkups'), col('portalResponses').where('handled', '==', false).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
      col('settings').doc('lists').get(),
    ]);
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
    $('loginWrap').classList.remove('hidden'); $('sidebar').classList.add('hidden'); $('main').classList.add('hidden');
    const m = $('loginMsg'); m.textContent = msg || ''; m.classList.toggle('err', !!err);
  }
  async function sendLink() {
    const email = ($('loginEmail').value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { showLogin('Please enter a valid email address.', true); return; }
    try {
      await auth.sendSignInLinkToEmail(email, { url: publicUrl(), handleCodeInApp: true });
      localStorage.setItem('ruf_email', email);
      $('loginForm').classList.add('hidden');
      showLogin('Link sent to ' + email + '. Open it on this device to sign in. (Check spam if it takes more than a minute.)');
    } catch (e) { showLogin('Could not send the link: ' + e.message, true); }
  }
  function publicUrl() { return CFG.publicUrl || (location.origin + location.pathname); }
  async function completeLinkSignIn() {
    if (!auth.isSignInWithEmailLink(location.href)) return;
    let email = localStorage.getItem('ruf_email');
    if (!email) email = window.prompt('Confirm your email to finish signing in');
    if (!email) return;
    try { await auth.signInWithEmailLink(email.trim().toLowerCase(), location.href); history.replaceState(null, '', location.pathname + (location.hash || '#/dashboard')); }
    catch (e) { showLogin('Sign-in link problem: ' + e.message, true); }
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
      await auth.signOut();
      showLogin(email + ' is not a member of this workspace. Ask an admin to invite you from the Team tab.', true);
      return null;
    }
    return { id: snap.id, ...snap.data() };
  }
  async function signOut() { await auth.signOut(); location.hash = '#/dashboard'; }

  // ---------- boot ----------
  async function boot() {
    if (!CFG.firebase || CFG.firebase.apiKey === 'PASTE_HERE') { showLogin('Setup needed: open js/config.js and paste your Firebase config (see SETUP.md).', true); return; }
    initFirebase();
    $('loginLogo').textContent = CFG.companyName || 'RUF'; $('sbLogo').textContent = CFG.companyName || 'RUF';
    await completeLinkSignIn();
    auth.onAuthStateChanged(async user => {
      if (!user) { showLogin(); return; }
      S.user = user;
      const me = await resolveMember(user); if (!me) return;
      S.me = me;
      await loadAll();
      $('loginWrap').classList.add('hidden'); $('sidebar').classList.remove('hidden'); $('main').classList.remove('hidden');
      $('meAvatar').textContent = initials(me.name); $('meName').textContent = me.name; $('meRole').textContent = me.job + ' · ' + cap(me.role);
      $('newProjectBtn').classList.toggle('hidden', !canSeeAll());
      if (!location.hash || location.hash === '#/') location.hash = '#/dashboard';
      render();
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
  async function render() {
    if (!S.me) return;
    const r = route();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === r.view || (r.view === 'project' && n.dataset.nav === 'projects') || (r.view === 'new' && n.dataset.nav === 'projects')));
    closeDrawer(); closeModal();
    const v = $('view');
    try {
      if (r.view === 'dashboard') v.innerHTML = viewDashboard();
      else if (r.view === 'projects') v.innerHTML = viewProjects();
      else if (r.view === 'new') { if (!canSeeAll()) { location.hash = '#/projects'; return; } v.innerHTML = viewNewProject(); npUpdate(); }
      else if (r.view === 'project') { await openDetail(r.id, r.sub); }
      else if (r.view === 'gantt') { v.innerHTML = viewGantt(); renderGantt(); }
      else if (r.view === 'calendar') v.innerHTML = viewCalendar();
      else if (r.view === 'team') v.innerHTML = viewTeam();
      else v.innerHTML = viewDashboard();
    } catch (e) { console.error(e); v.innerHTML = '<div class="empty">Something went wrong: ' + esc(e.message) + '</div>'; }
    window.scrollTo(0, 0);
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
    boot, sendLink, signOut, render, route,
    openDrawer, closeDrawer, openModal, closeModal, confirmBox,
    openDatePicker, dpMove, dpPick, dpToday, dpClear, dateField,
    stageTrack, stagePill, tglRow, tgl, tglValues, addToggle, segSet, segVal, segPick,
    dueCheckups, markCheckup, markRead, markAllRead,
    registerViews, V,
    publicUrl,
  };
})();
