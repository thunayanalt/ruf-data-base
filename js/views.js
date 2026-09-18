/* ============================================================
   RUF Workspace — views (dashboard, projects, new project)
   ============================================================ */
(() => {
  const A = window.app, S = A.S, esc = A.esc, attr = A.attr, $ = A.$;

  // ---------- helpers ----------
  const PERIOD_DAYS = { '1w': 7, '1m': 30, '6m': 182, '1y': 365, '5y': 1826, 'all': 100000 };
  const PERIOD_TXT = { '1w': 'this week', '1m': 'this month', '6m': 'in 6 months', '1y': 'this year', '5y': 'in 5 years', 'all': 'all time' };
  const PERIOD_PAST = { '1w': 'this week', '1m': 'this month', '6m': 'last 6 months', '1y': 'this year', '5y': 'last 5 years', 'all': 'all time' };

  const productsOf = p => (p.products || []).join(' + ') || '—';
  const assignedNames = p => (p.assigned || []).map(A.firstName).join(', ') || 'Nobody yet';
  const go = h => { location.hash = h; };

  function projectCard(p, mode) {
    const isDone = p.status === 'done';
    const idx = isDone ? 5 : (p.stage || 0);
    const label = isDone ? 'Done' : A.STAGE_FULL[p.stage || 0];
    let meta;
    if (mode === 'due') meta = '<span class="due-txt">Due ' + A.fmtLong(p.handover) + '</span> · ' + esc(assignedNames(p));
    else if (isDone) meta = 'Completed ' + A.fmtLong((p.completedAt || '').slice(0, 10)) + ' · ' + esc(assignedNames(p));
    else meta = 'Updated ' + A.ago(p.updatedAt) + (p.waiting ? ' · <span class="waiting">' + esc(p.waiting) + '</span>' : '') + ' · ' + esc(assignedNames(p));
    return '<div class="project-card" onclick="location.hash=\'#/project/' + p.id + '\'">' +
      '<div class="project-info"><div class="project-top"><span class="project-name">' + esc(p.client) + '</span><span class="material-tag">' + esc(productsOf(p)) + '</span></div>' +
      '<div class="project-meta">' + meta + '</div></div>' +
      '<div class="stage-tracker"><div class="stage-current-label">' + label + '</div>' + A.stageTrack(idx) + '</div></div>';
  }

  // ============================================================
  //  DASHBOARD
  // ============================================================
  function dashSets() {
    const period = S.ui.dashPeriod, days = PERIOD_DAYS[period];
    const T = A.today(), pastStart = A.addDays(T, -days), futureEnd = A.addDays(T, days);
    const mine = A.myProjects();
    const active = mine.filter(p => p.status !== 'done');
    const doneIn = mine.filter(p => p.status === 'done' && p.completedAt && A.d0(p.completedAt.slice(0, 10)) >= pastStart)
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    const waiting = active.filter(p => p.waiting);
    const due = active.filter(p => p.handover && A.d0(p.handover) >= T && A.d0(p.handover) <= futureEnd).sort((a, b) => a.handover.localeCompare(b.handover));
    return { active: active.concat(doneIn), waiting, due, done: doneIn };
  }

  function viewDashboard() {
    const me = S.me, period = S.ui.dashPeriod, f = S.ui.dashFilter;
    const Sx = dashSets();
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const T = new Date();
    const dateTxt = A.DAYS_LONG[T.getDay()] + ', ' + T.getDate() + ' ' + A.MONTHS_LONG[T.getMonth()];
    const due = A.dueCheckups(), unread = S.notifs.filter(n => !n.read);
    const clientResp = S.responses.filter(r => A.myProjects().find(p => p.id === r.projectId));

    let html = '<div class="topbar"><div><div class="greeting">' + greet + ', ' + esc(me.name.split(' ')[0]) + '</div>' +
      '<div class="greeting-sub">' + dateTxt + ' — ' + (due.length + unread.length + clientResp.length) + ' things need your attention</div></div></div>';

    // Daily digest (admins & managers)
    if (A.canSeeAll()) {
      const since = Date.now() - 86400000;
      const lines = S.projects.filter(p => p.status !== 'done').map(p => {
        const recent = p.lastActivityAt && new Date(p.lastActivityAt).getTime() > since;
        const w = p.waiting ? p.waiting + (p.waitingSince ? ' — since ' + A.ago(p.waitingSince) : '') : null;
        if (!recent && !w) return null;
        return { p, text: recent ? p.lastActivity + ' (' + A.ago(p.lastActivityAt) + ')' : w };
      }).filter(Boolean);
      html += '<div class="digest-card"><div class="digest-top"><div class="digest-title">Daily update for management</div><div class="digest-meta">' +
        (A.CFG.n8nWebhookUrl ? '<span class="link" style="color:#E8E4DB" onclick="app.V.sendDigest()">Send to WhatsApp / email now</span> · ' : '') + 'Last 24 hours</div></div><div class="digest-list">' +
        (lines.length ? lines.map(l => '<div class="digest-row" onclick="location.hash=\'#/project/' + l.p.id + '\'"><span class="dname">' + esc(l.p.client) + '</span><span>' + esc(l.text) + '</span></div>').join('')
          : '<div class="digest-row"><span style="color:#B8B4AC">Nothing new in the last 24 hours.</span></div>') + '</div></div>';
    }

    // Notifications
    html += '<div class="section-heading">Your notifications' + (unread.length ? ' <span class="link" style="text-transform:none;letter-spacing:0;font-weight:500;margin-left:8px;" onclick="app.markAllRead()">mark all read</span>' : '') + '</div><div class="notif-list">';
    const calIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>';
    due.forEach(p => {
      html += '<div class="notif-row"><div class="notif-left" onclick="location.hash=\'#/project/' + p.id + '\'"><div class="notif-icon">' + calIco + '</div><div><div class="notif-text-name">Weekly checkup due — ' + esc(p.client) + '</div><div class="notif-text-sub">Assigned to you · ' + A.STAGE_FULL[p.stage || 0] + ' stage</div></div></div>' +
        '<div style="display:flex;gap:8px;align-items:center;"><span class="notif-status due">Due this week</span><button class="btn-secondary" style="height:28px;font-size:12px;" onclick="app.markCheckup(\'' + p.id + '\')">Mark done</button></div></div>';
    });
    clientResp.forEach(r => {
      const p = S.projects.find(x => x.id === r.projectId);
      html += '<div class="notif-row" onclick="location.hash=\'#/project/' + r.projectId + '/activity\'"><div class="notif-left"><div class="notif-icon">' + calIco + '</div><div><div class="notif-text-name">Client responded — ' + esc(p ? p.client : '') + '</div><div class="notif-text-sub">' + esc(responseSummary(r)) + '</div></div></div><span class="notif-status due">Needs review</span></div>';
    });
    unread.slice(0, 8).forEach(n => {
      html += '<div class="notif-row"><div class="notif-left" onclick="' + (n.projectId ? 'location.hash=\'#/project/' + n.projectId + '\'' : '') + '"><div class="notif-icon">' + calIco + '</div><div><div class="notif-text-name">' + esc(n.text) + '</div><div class="notif-text-sub">' + A.ago(n.at) + '</div></div></div><span class="link" style="font-size:12px" onclick="app.markRead(\'' + n.id + '\')">Dismiss</span></div>';
    });
    if (!due.length && !unread.length && !clientResp.length) html += '<div class="notif-row"><div class="notif-text-sub">You\'re all caught up.</div></div>';
    html += '</div>';

    // Period + tiles
    html += '<div class="period-row"><div class="section-heading" style="margin:0;">Overview</div><div class="view-switch">' +
      Object.keys(PERIOD_DAYS).map(p => '<div class="view-btn' + (p === period ? ' active' : '') + '" onclick="app.V.dashPeriod(\'' + p + '\')">' + ({ '1w': '1 week', '1m': '1 month', '6m': '6 months', '1y': '1 year', '5y': '5 years', 'all': 'All time' }[p]) + '</div>').join('') + '</div></div>';
    const tiles = [
      ['active', Sx.active.length, period === 'all' ? 'Active projects' : 'Active ' + PERIOD_PAST[period]],
      ['waiting', Sx.waiting.length, 'Waiting on client'],
      ['due', Sx.due.length, 'Due ' + PERIOD_TXT[period]],
      ['done', Sx.done.length, 'Completed ' + PERIOD_PAST[period]],
    ];
    html += '<div class="stats">' + tiles.map(t => '<div class="stat-card' + (f === t[0] ? ' sel' : '') + '" onclick="app.V.dashFilter(\'' + t[0] + '\')"><div class="stat-num">' + t[1] + '</div><div class="stat-label">' + t[2] + '</div></div>').join('') + '</div>';

    const titles = { active: 'Active projects', waiting: 'Waiting on client', due: 'Due ' + PERIOD_TXT[period], done: 'Completed ' + PERIOD_PAST[period] };
    const list = Sx[f];
    html += '<div class="list-head"><div class="list-title">' + titles[f] + '</div><div class="list-sub">' + list.length + (list.length === 1 ? ' project' : ' projects') + '</div></div>';
    html += '<div class="project-list">' + (list.length ? list.map(p => projectCard(p, f)).join('') : '<div class="empty">Nothing here for this period.' + (A.canSeeAll() && !S.projects.length ? ' <span class="link" onclick="location.hash=\'#/new\'">Create your first project</span>.' : '') + '</div>') + '</div>';
    return html;
  }
  function responseSummary(r) {
    if (r.type === 'checklist') return r.payload && r.payload.confirmed ? 'Checklist submitted and confirmed' : 'Checklist answers received';
    if (r.type === 'elevation') return 'Elevation ' + (r.payload && r.payload.decision === 'approved' ? 'approved' : 'declined') + (r.payload && r.payload.comment ? ' — "' + r.payload.comment + '"' : '');
    if (r.type === 'quote') return 'Quotation ' + (r.payload && r.payload.decision === 'accepted' ? 'accepted' : 'changes requested');
    return 'New response';
  }
  async function sendDigest() {
    const lines = S.projects.filter(p => p.status !== 'done').map(p => '• ' + p.client + ': ' + (p.waiting || p.lastActivity || A.STAGE_FULL[p.stage || 0])).join('\n');
    const to = S.members.filter(m => m.role !== 'worker').map(m => m.email);
    await A.notify(to, 'Daily update — ' + A.fmtLong(A.iso(A.today())) + '\n' + lines, null, 'digest');
    A.toast('Daily update sent');
  }
  const dashPeriod = p => { S.ui.dashPeriod = p; A.render(); };
  const dashFilter = f => { S.ui.dashFilter = f; A.render(); };

  // ============================================================
  //  PROJECTS LIST
  // ============================================================
  function viewProjects() {
    const q = S.ui.projQuery.toLowerCase(), chip = S.ui.projChip, tab = S.ui.projTab;
    const mine = A.myProjects();
    const chips = ['all', ...S.settings.products];
    const match = p => (!q || (p.client + ' ' + (p.products || []).join(' ') + ' ' + (p.description || '')).toLowerCase().includes(q)) && (chip === 'all' || (p.products || []).includes(chip));
    const active = mine.filter(p => p.status !== 'done' && match(p));
    const prev = mine.filter(p => p.status === 'done' && match(p)).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    const rows = (list, done) => list.length ? list.map(p => '<div class="dir-row" onclick="location.hash=\'#/project/' + p.id + '\'">' +
      '<div class="dir-project"><div class="dir-name">' + esc(p.client) + '</div><div class="dir-sub">' + esc(p.description || p.address || '') + '</div></div>' +
      '<div class="dir-desc">' + esc(productsOf(p)) + '</div><div>' + A.stagePill(p) + '</div><div class="dir-assignee">' + esc(assignedNames(p)) + '</div>' +
      '<div class="dir-updated">' + (done ? A.fmtLong((p.completedAt || '').slice(0, 10)) : A.ago(p.updatedAt)) + '</div></div>').join('')
      : '<div class="dir-row" style="cursor:default;grid-template-columns:1fr;"><div class="small">' + (done ? 'No completed projects yet.' : 'No active projects' + (q || chip !== 'all' ? ' match this search.' : '.')) + '</div></div>';

    return '<div class="topbar"><div><div class="greeting">Projects</div><div class="greeting-sub">' + mine.filter(p => p.status !== 'done').length + ' active · ' + mine.filter(p => p.status === 'done').length + ' completed</div></div>' +
      (A.canSeeAll() ? '<a class="new-project-btn" href="#/new" style="margin-top:0;text-decoration:none;">+ New project</a>' : '') + '</div>' +
      '<div class="dir-toolbar"><input class="dir-search" type="text" placeholder="Search by client, project, or description..." value="' + attr(S.ui.projQuery) + '" oninput="app.V.projSearch(this.value)"/>' +
      '<div class="chip-row">' + chips.map(c => '<div class="chip' + (c === chip ? ' active' : '') + '" onclick="app.V.projChip(\'' + attr(c) + '\')">' + (c === 'all' ? 'All types' : esc(c)) + '</div>').join('') + '</div></div>' +
      '<div class="tabs"><div class="tab' + (tab === 'active' ? ' active' : '') + '" onclick="app.V.projTab(\'active\')">Active projects</div><div class="tab' + (tab === 'previous' ? ' active' : '') + '" onclick="app.V.projTab(\'previous\')">Previous projects</div></div>' +
      '<div class="dir-table"><div class="dir-head"><div>Project</div><div>Description</div><div>Stage</div><div>Assigned to</div><div>' + (tab === 'active' ? 'Updated' : 'Completed') + '</div></div>' +
      (tab === 'active' ? rows(active, false) : rows(prev, true)) + '</div>';
  }
  let searchT;
  const projSearch = v => { S.ui.projQuery = v; clearTimeout(searchT); searchT = setTimeout(() => { const el = document.querySelector('.dir-search'); const pos = el ? el.selectionStart : 0; A.render(); const n = document.querySelector('.dir-search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); };
  const projChip = c => { S.ui.projChip = c; A.render(); };
  const projTab = t => { S.ui.projTab = t; A.render(); };

  // ============================================================
  //  NEW PROJECT
  // ============================================================
  function viewNewProject() {
    const prods = S.settings.products, mats = S.settings.materials;
    const team = S.members.filter(m => m.active !== false);
    return '<div class="detail-back" onclick="location.hash=\'#/projects\'">&larr; Back to projects</div>' +
      '<div class="topbar" style="margin-bottom:22px;"><div><div class="greeting">New project</div><div class="greeting-sub">Fill in the four steps below. The project starts in the Design stage.</div></div></div>' +
      '<div class="np-layout"><div class="np-form">' +
      // 1 client
      '<div class="np-card"><div class="np-step"><span class="np-num">1</span>Client</div>' +
      '<div class="fld-row"><div class="fld"><label>Client name</label><input type="text" id="npClient" placeholder="e.g. Al Sabah" oninput="app.V.npUpdate()"/></div>' +
      '<div class="fld"><label>WhatsApp number</label><input type="text" id="npPhone" placeholder="+965 …"/></div></div>' +
      '<div class="fld-row"><div class="fld"><label>Email (optional)</label><input type="text" id="npEmail" placeholder="client@email.com"/></div>' +
      '<div class="fld"><label>Site address</label><input type="text" id="npAddress" placeholder="Area, block, street, house"/></div></div></div>' +
      // 2 project
      '<div class="np-card"><div class="np-step"><span class="np-num">2</span>Project</div>' +
      '<div class="fld"><label>What are we making? <span class="lbl-note">pick one or more</span></label>' + A.tglRow('npProducts', prods, [], 'app.V.npUpdate') +
      '<div class="add-row"><input type="text" id="npProdInput" placeholder="Add something else, e.g. Shoe cabinet, Study desk, Bar unit…" onkeydown="if(event.key===\'Enter\'){app.addToggle(\'npProducts\',\'npProdInput\',app.V.npUpdate);event.preventDefault();}"/><button class="btn-secondary" onclick="app.addToggle(\'npProducts\',\'npProdInput\',app.V.npUpdate)">Add</button></div>' +
      '<div class="fld-hint">Each item you pick becomes its own line in the project, with its own drawings and checklist.</div></div>' +
      '<div class="fld"><label>Materials</label>' + A.tglRow('npMaterials', mats, [mats[0]], 'app.V.npUpdate') +
      '<div class="add-row"><input type="text" id="npMatInput" placeholder="Add another material, e.g. Brass, LED lighting, Leather…" onkeydown="if(event.key===\'Enter\'){app.addToggle(\'npMaterials\',\'npMatInput\',app.V.npUpdate);event.preventDefault();}"/><button class="btn-secondary" onclick="app.addToggle(\'npMaterials\',\'npMatInput\',app.V.npUpdate)">Add</button></div>' +
      '<div class="fld-hint">Anything you add here is saved as an option for future projects.</div></div>' +
      '<div class="fld"><label>Short description <span class="lbl-note">shows under the client name in lists</span></label><input type="text" id="npDescr" placeholder="e.g. Master bedroom, 10 sections"/></div>' +
      '<div class="fld"><label>Notes for the team (optional)</label><textarea id="npNotes" rows="3" placeholder="Anything the team should know from the first meeting — measurements taken, client preferences, access to the site…"></textarea></div></div>' +
      // 3 team & dates
      '<div class="np-card"><div class="np-step"><span class="np-num">3</span>Team &amp; dates</div>' +
      '<div class="fld"><label>Assign to</label><div class="check-list two-col" id="npTeam">' +
      team.map(m => '<label class="chk"><input type="checkbox" data-email="' + attr(m.email) + '" onchange="app.V.npUpdate()"' + (m.email === S.me.email ? ' checked' : '') + '/><span>' + esc(m.name) + ' — ' + esc(m.job || A.cap(m.role)) + '</span></label>').join('') + '</div></div>' +
      '<div class="fld-row">' + A.dateField('npStart', 'Start date', A.iso(A.today()), { cb: 'app.V.npUpdate' }) + A.dateField('npEnd', 'Target handover', '', { minFrom: 'npStart', cb: 'app.V.npUpdate', hint: '<span id="npDurHint"></span>' }) + '</div></div>' +
      // 4 setup
      '<div class="np-card"><div class="np-step"><span class="np-num">4</span>Setup</div><div class="check-list">' +
      '<label class="chk"><input type="checkbox" id="npFolders" checked/><span>Create folders: 2D Sketches &amp; Elevations, 3D Renders, Floor Plan</span></label>' +
      '<label class="chk"><input type="checkbox" id="npNotify" checked/><span>Notify the assigned team members</span></label>' +
      '<label class="chk"><input type="checkbox" id="npQuote" checked/><span>Open the Quotation tab right after creating, to prepare the client\'s quote</span></label>' +
      '</div><div class="fld-hint">The client portal link can be sent later, once the first elevations are ready.</div></div>' +
      '</div>' +
      // side
      '<div class="np-side"><div class="np-summary-card"><div class="ip-head">How it will appear</div><div class="np-sum-name" id="npSumName">Client name</div><div class="np-sum-desc" id="npSumDesc">What are we making?</div>' +
      '<div class="np-sum-row"><span>Stage</span><span class="stage-pill design">Design</span></div><div class="np-sum-row"><span>Items</span><span id="npSumItems">—</span></div>' +
      '<div class="np-sum-row"><span>Materials</span><span id="npSumMat">—</span></div><div class="np-sum-row"><span>Assigned to</span><span id="npSumTeam">—</span></div>' +
      '<div class="np-sum-row"><span>Start</span><span id="npSumStart">—</span></div><div class="np-sum-row"><span>Handover</span><span id="npSumEnd">—</span></div></div>' +
      '<button class="btn-primary np-create" id="npCreateBtn" onclick="app.V.createProject()">Create project</button>' +
      '<button class="btn-secondary np-cancel" onclick="location.hash=\'#/projects\'">Cancel</button></div></div>';
  }
  function npUpdate() {
    if (!$('npClient')) return;
    const c = $('npClient').value.trim() || 'Client name';
    const prods = A.tglValues('npProducts'), mats = A.tglValues('npMaterials');
    const team = [...document.querySelectorAll('#npTeam input:checked')].map(i => A.firstName(i.dataset.email));
    $('npSumName').textContent = c; $('npSumDesc').textContent = prods.length ? prods.join(' + ') : 'What are we making?';
    $('npSumItems').textContent = prods.length ? prods.length + (prods.length === 1 ? ' item' : ' items') : '—';
    $('npSumMat').textContent = mats.length ? mats.join(', ') : '—'; $('npSumTeam').textContent = team.length ? team.join(', ') : 'Nobody yet';
    const sEl = $('npStart'), eEl = $('npEnd');
    $('npSumStart').textContent = sEl.value || '—'; $('npSumEnd').textContent = eEl.value || '—';
    const hint = $('npDurHint');
    if (sEl.dataset.iso && eEl.dataset.iso) { const days = A.dayDiff(A.d0(sEl.dataset.iso), A.d0(eEl.dataset.iso)); hint.textContent = 'About ' + (days >= 14 ? Math.round(days / 7) + ' weeks' : days + ' days') + ' from start to handover.'; }
    else hint.textContent = '';
  }
  function defaultPhases(startISO, endISO) {
    const s = A.d0(startISO), e = endISO ? A.d0(endISO) : A.addDays(s, 56);
    const total = Math.max(8, A.dayDiff(s, e));
    let cursor = new Date(s); const ph = {};
    A.PHASES.forEach((k, i) => {
      const len = i === A.PHASES.length - 1 ? A.dayDiff(cursor, e) : Math.max(1, Math.round(total * A.PHASE_SHARE[k]));
      const end = i === A.PHASES.length - 1 ? new Date(e) : A.addDays(cursor, len);
      ph[k] = { start: A.iso(cursor), end: A.iso(end > cursor ? end : A.addDays(cursor, 1)) };
      cursor = A.d0(ph[k].end);
    });
    return ph;
  }
  async function createProject() {
    const client = $('npClient').value.trim();
    const products = A.tglValues('npProducts'), materials = A.tglValues('npMaterials');
    if (!client) { A.toast('Please enter the client name'); $('npClient').focus(); return; }
    if (!products.length) { A.toast('Pick at least one item to make'); return; }
    const start = $('npStart').dataset.iso || A.iso(A.today()), handover = $('npEnd').dataset.iso || '';
    const assigned = [...document.querySelectorAll('#npTeam input:checked')].map(i => i.dataset.email);
    $('npCreateBtn').disabled = true; $('npCreateBtn').textContent = 'Creating…';
    const now = A.nowISO();
    const doc = {
      client, phone: $('npPhone').value.trim(), email: $('npEmail').value.trim(), address: $('npAddress').value.trim(),
      products, materials, description: $('npDescr').value.trim(), notes: $('npNotes').value.trim(),
      assigned, start, handover, stage: 0, status: 'active', waiting: null, waitingSince: null,
      folders: $('npFolders').checked ? A.DEFAULT_FOLDERS.slice() : [],
      phases: defaultPhases(start, handover), checklist: null, quote: null,
      portalToken: A.uid() + A.uid(), createdAt: now, updatedAt: now, createdBy: S.me.email,
      lastActivity: 'Project created', lastActivityAt: now,
    };
    try {
      const ref = await A.col('projects').add(doc);
      await ref.collection('activity').add({ text: 'Project created', by: S.me.email, at: now, type: 'created' });
      // remember any new product / material options
      const newProds = [...new Set([...S.settings.products, ...products])], newMats = [...new Set([...S.settings.materials, ...materials])];
      if (newProds.length !== S.settings.products.length || newMats.length !== S.settings.materials.length) {
        S.settings.products = newProds; S.settings.materials = newMats;
        await A.col('settings').doc('lists').set({ products: newProds, materials: newMats }, { merge: true });
      }
      if ($('npNotify').checked) await A.notify(assigned.filter(e => e !== S.me.email), 'You were assigned to ' + client + ' — ' + products.join(' + '), ref.id, 'assigned');
      S.projects.unshift({ id: ref.id, ...doc });
      A.toast('Project created');
      location.hash = '#/project/' + ref.id + ($('npQuote').checked && A.canSeeAll() ? '/quote' : '');
    } catch (e) { A.toast('Could not create: ' + e.message); $('npCreateBtn').disabled = false; $('npCreateBtn').textContent = 'Create project'; }
  }

  Object.assign(A.V, { viewDashboard, viewProjects, viewNewProject, npUpdate, createProject, dashPeriod, dashFilter, sendDigest, projSearch, projChip, projTab, projectCard, productsOf, assignedNames, defaultPhases, responseSummary });
})();
