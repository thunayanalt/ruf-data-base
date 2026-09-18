/* ============================================================
   RUF Workspace — Gantt, Calendar, Team
   ============================================================ */
(() => {
  const A = window.app, S = A.S, esc = A.esc, attr = A.attr, $ = A.$;

  // ============================================================
  //  GANTT (all active projects, zoomable)
  // ============================================================
  function viewGantt() {
    const z = S.ui.ganttZoom;
    return '<div class="topbar"><div><div class="greeting">Gantt chart</div><div class="greeting-sub">All active projects</div></div>' +
      '<div class="gantt-legend"><span><i class="lg design"></i>Design</span><span><i class="lg review"></i>Client review</span><span><i class="lg production"></i>Production</span><span><i class="lg install"></i>Installation</span><span><i class="lg milestone"></i>Update / milestone</span></div></div>' +
      '<div class="gantt-controls"><div class="cal-nav"><span id="ganttPrev" onclick="app.V.ganttShift(-1)">&lsaquo;</span><span class="cal-month" id="ganttRangeLabel" style="min-width:180px;"></span><span id="ganttNext" onclick="app.V.ganttShift(1)">&rsaquo;</span></div>' +
      '<div class="view-switch">' + [['1d', '1 day'], ['1w', '1 week'], ['1m', '1 month'], ['6m', '6 months'], ['1y', '1 year'], ['all', 'All']].map(x => '<div class="view-btn' + (z === x[0] ? ' active' : '') + '" onclick="app.V.setGanttZoom(\'' + x[0] + '\')">' + x[1] + '</div>').join('') + '</div></div>' +
      '<div class="gantt" id="gantt"></div><div class="gantt-hint">Hover any bar or diamond for details</div>';
  }
  function ganttRange() {
    const T = A.today(); const a = S.ui.ganttAnchor || T; const z = S.ui.ganttZoom;
    const fd = A.fmtDate;
    switch (z) {
      case '1d': return { start: a, end: A.addDays(a, 1), top: 'date', ticks: 'hour', label: A.DAYS_LONG[a.getDay()] + ' ' + fd(a) + ' ' + a.getFullYear() };
      case '1w': { const s = A.addDays(a, -a.getDay()), e = A.addDays(s, 7); return { start: s, end: e, top: 'month', ticks: 'dayname', label: fd(s) + ' – ' + fd(A.addDays(e, -1)) + ' ' + s.getFullYear() }; }
      case '1m': { const s = new Date(a.getFullYear(), a.getMonth(), 1), e = A.addMonths(s, 1); return { start: s, end: e, top: 'month', ticks: 'daynum', label: A.MONTHS_LONG[s.getMonth()] + ' ' + s.getFullYear() }; }
      case '6m': { const s = new Date(a.getFullYear(), a.getMonth(), 1), e = A.addMonths(s, 6); return { start: s, end: e, top: 'month', ticks: 'weekline', label: A.MONTHS[s.getMonth()] + ' – ' + A.MONTHS[(e.getMonth() + 11) % 12] + ' ' + s.getFullYear() }; }
      case '1y': { const s = new Date(a.getFullYear(), 0, 1), e = new Date(a.getFullYear() + 1, 0, 1); return { start: s, end: e, top: 'month', ticks: 'quarter', label: String(s.getFullYear()) }; }
      default: {
        let mn = null, mx = null;
        activeGantt().forEach(p => A.PHASES.forEach(k => { const ph = p.phases && p.phases[k]; if (!ph) return; const s = A.d0(ph.start), e = A.d0(ph.end); if (!mn || s < mn) mn = s; if (!mx || e > mx) mx = e; }));
        if (!mn) { mn = T; mx = A.addDays(T, 56); }
        const s = A.addDays(mn, -mn.getDay()), e = A.addDays(mx, 7 - mx.getDay());
        return { start: s, end: e, top: 'month', ticks: 'week', label: 'All projects · ' + fd(s) + ' – ' + fd(A.addDays(e, -1)) };
      }
    }
  }
  const activeGantt = () => A.myProjects().filter(p => p.status !== 'done' && p.phases);
  function setGanttZoom(z) { S.ui.ganttZoom = z; S.ui.ganttAnchor = A.today(); A.render(); }
  function ganttShift(dir) {
    const z = S.ui.ganttZoom, a = S.ui.ganttAnchor || A.today(); if (z === 'all') return;
    S.ui.ganttAnchor = z === '1d' ? A.addDays(a, dir) : z === '1w' ? A.addDays(a, 7 * dir) : z === '1m' ? A.addMonths(a, dir) : z === '6m' ? A.addMonths(a, 6 * dir) : new Date(a.getFullYear() + dir, 0, 1);
    renderGantt();
  }
  function renderGantt() {
    const el = $('gantt'); if (!el) return; const R = ganttRange(); const span = R.end - R.start; const T = A.today();
    const pct = d => Math.max(0, Math.min(100, (d - R.start) / span * 100)); const inRange = d => d >= R.start && d < R.end; const z = S.ui.ganttZoom;
    $('ganttRangeLabel').textContent = R.label; $('ganttPrev').style.visibility = z === 'all' ? 'hidden' : 'visible'; $('ganttNext').style.visibility = z === 'all' ? 'hidden' : 'visible';
    let out = '<div class="g-row g-head"><div class="g-label g-corner">Project</div><div class="g-track">';
    if (R.top === 'date') out += '<div class="g-month" style="left:0;width:100%">' + esc(R.label) + '</div>';
    else { let m = new Date(R.start.getFullYear(), R.start.getMonth(), 1); while (m < R.end) { const mE = A.addMonths(m, 1); const l = pct(m < R.start ? R.start : m), r = pct(mE > R.end ? R.end : mE); if (r > l) out += '<div class="g-month" style="left:' + l + '%;width:' + (r - l) + '%">' + A.MONTHS[m.getMonth()] + ' ' + m.getFullYear() + '</div>'; m = mE; } }
    const grid = [];
    if (R.ticks === 'hour') { for (let h = 0; h < 24; h++) { const p = h / 24 * 100; grid.push(p); if (h % 2 === 0) out += '<div class="g-week" style="left:' + p + '%">' + String(h).padStart(2, '0') + ':00</div>'; } }
    else if (R.ticks === 'dayname' || R.ticks === 'daynum') { for (let d = new Date(R.start); d < R.end; d = A.addDays(d, 1)) { const p = pct(d); grid.push(p); const lab = R.ticks === 'dayname' ? A.DAYS_LONG[d.getDay()] + ' ' + d.getDate() : String(d.getDate()); out += '<div class="g-week' + ((d.getDay() === 5 || d.getDay() === 6) ? ' we' : '') + '" style="left:' + p + '%">' + lab + '</div>'; } }
    else if (R.ticks === 'week' || R.ticks === 'weekline') { let d = A.addDays(R.start, (7 - R.start.getDay()) % 7); for (; d < R.end; d = A.addDays(d, 7)) { const p = pct(d); grid.push(p); out += R.ticks === 'week' ? '<div class="g-week" style="left:' + p + '%">' + d.getDate() + '</div>' : '<div class="g-week g-tick" style="left:' + p + '%"></div>'; } }
    else if (R.ticks === 'quarter') { for (let q = 0; q < 4; q++) { const p = pct(new Date(R.start.getFullYear(), q * 3, 1)); grid.push(p); out += '<div class="g-week" style="left:' + p + '%">Q' + (q + 1) + '</div>'; } }
    const showToday = inRange(T), todayPct = pct(T);
    if (showToday) out += '<div class="g-today-flag" style="left:' + todayPct + '%">Today</div>';
    out += '</div></div>';
    const list = activeGantt();
    if (!list.length) out += '<div class="g-row"><div class="g-label"><div class="g-sub">No active projects with a schedule yet.</div></div><div class="g-track"></div></div>';
    list.forEach(p => {
      const cur = A.PHASES.find(k => p.phases[k] && A.d0(p.phases[k].start) <= T && A.d0(p.phases[k].end) > T);
      const stageTxt = cur ? A.PHASE_LABEL[cur] : A.STAGE_FULL[p.stage || 0];
      out += '<div class="g-row"><div class="g-label" style="cursor:pointer" onclick="location.hash=\'#/project/' + p.id + '/schedule\'"><div class="g-name">' + esc(p.client) + '</div><div class="g-sub">' + esc(A.V.productsOf(p)) + ' · <b>' + esc(stageTxt) + '</b></div></div><div class="g-track">';
      grid.forEach(g => { out += '<div class="g-grid" style="left:' + g + '%"></div>'; });
      let any = false;
      A.PHASES.forEach(k => { const ph = p.phases[k]; if (!ph) return; const s = A.d0(ph.start), e = A.d0(ph.end); if (e <= R.start || s >= R.end) return; const l = pct(s), r = pct(e); if (r <= l) return; any = true; out += '<div class="g-bar ' + k + '" style="left:' + l + '%;width:' + (r - l) + '%" data-tip-title="' + attr(A.PHASE_LABEL[k]) + '" data-tip="' + attr(A.fmt(ph.start) + ' – ' + A.fmt(ph.end)) + '"><span>' + A.PHASE_LABEL[k] + '</span></div>'; });
      const ms = [];
      if (p.createdAt) ms.push([p.createdAt.slice(0, 10), 'Project created']);
      if (p.checklist && p.checklist.sentAt) ms.push([p.checklist.sentAt.slice(0, 10), 'Checklist sent to client']);
      if (p.checklist && p.checklist.clientConfirmedAt) ms.push([p.checklist.clientConfirmedAt.slice(0, 10), 'Client confirmed checklist']);
      if (p.quote && p.quote.sentAt) ms.push([p.quote.sentAt.slice(0, 10), 'Quotation sent']);
      if (p.lastActivityAt) ms.push([p.lastActivityAt.slice(0, 10), p.lastActivity]);
      ms.forEach(u => { const d = A.d0(u[0]); if (!inRange(d)) return; out += '<div class="g-ms" style="left:' + (z === '1d' ? 50 : pct(d)) + '%" data-tip-title="' + attr(u[1]) + '" data-tip="' + attr(A.fmt(u[0])) + '"></div>'; });
      if (!any) out += '<div class="g-none">Nothing scheduled in this range</div>';
      if (showToday) out += '<div class="g-today" style="left:' + todayPct + '%"></div>';
      out += '</div></div>';
    });
    el.innerHTML = out;
  }

  // ============================================================
  //  CALENDAR (meetings)
  // ============================================================
  function viewCalendar() {
    const m = S.ui.calMonth || new Date(A.today().getFullYear(), A.today().getMonth(), 1); S.ui.calMonth = m;
    const first = new Date(m.getFullYear(), m.getMonth(), 1), start = A.addDays(first, -first.getDay()); const T = A.iso(A.today());
    const byDay = {}; S.meetings.forEach(x => { (byDay[x.date] = byDay[x.date] || []).push(x); });
    let grid = '<div class="cal-grid"><div class="cal-header-row">' + A.DAYS_LONG.map(d => '<div>' + d + '</div>').join('') + '</div>';
    for (let w = 0; w < 6; w++) {
      grid += '<div class="cal-row">';
      for (let i = 0; i < 7; i++) {
        const d = A.addDays(start, w * 7 + i), s = A.iso(d); const other = d.getMonth() !== m.getMonth();
        grid += '<div class="cal-cell' + (other ? ' faded' : '') + (s === T ? ' today' : '') + '" ondblclick="app.V.newMeeting(\'' + s + '\')">' + (s === T ? '<span class="cal-today-num">' + d.getDate() + '</span>' : d.getDate()) +
          (byDay[s] || []).map(x => '<div class="cal-dot-event' + (x.type === 'client' ? ' wait' : '') + '" onclick="app.V.editMeeting(\'' + x.id + '\')" data-tip-title="' + attr(x.title) + '" data-tip="' + attr(meetingTip(x)) + '">' + esc((x.time ? x.time + ' ' : '') + x.title) + '</div>').join('') + '</div>';
      }
      grid += '</div>';
    }
    grid += '</div>';
    const upcoming = S.meetings.filter(x => x.date >= T).slice(0, 8);
    return '<div class="topbar"><div><div class="greeting">Calendar</div><div class="greeting-sub">Meetings only — client meetings, review calls, site visits, team check-ins. Double-click a day to add one.</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;"><div class="cal-nav"><span onclick="app.V.calMove(-1)">&lsaquo;</span><span class="cal-month">' + A.MONTHS_LONG[m.getMonth()] + ' ' + m.getFullYear() + '</span><span onclick="app.V.calMove(1)">&rsaquo;</span></div><button class="btn-primary" onclick="app.V.newMeeting()">+ New meeting</button></div></div>' +
      '<div class="cal-layout"><div>' + grid + '<div class="cal-legend"><span><i class="cl-dot"></i>Internal / site</span><span><i class="cl-dot wait"></i>Client</span></div></div>' +
      '<div class="upcoming"><div class="section-heading" style="margin-top:0;">Upcoming</div>' + (upcoming.length ? upcoming.map(x => { const d = A.d0(x.date); return '<div class="up-item ' + (x.type === 'client' ? 'client' : 'internal') + '" onclick="app.V.editMeeting(\'' + x.id + '\')" data-tip-title="' + attr(x.title) + '" data-tip="' + attr(meetingTip(x)) + '"><div class="up-date"><div class="up-day">' + d.getDate() + '</div><div class="up-mon">' + A.MONTHS[d.getMonth()] + '</div></div><div><div class="up-title">' + esc(x.title) + '</div><div class="up-meta">' + esc([x.time && (x.time + (x.end ? ' – ' + x.end : '')), x.location, (x.attendees || []).map(A.firstName).join(', ')].filter(Boolean).join(' · ')) + '</div><span class="up-type">' + (x.type === 'client' ? 'Client' : 'Internal / site') + '</span></div></div>'; }).join('') : '<div class="small">No upcoming meetings.</div>') + '</div></div>';
  }
  function meetingTip(x) { const p = S.projects.find(q => q.id === x.projectId); return [x.time ? x.time + (x.end ? ' – ' + x.end : '') + (x.location ? ' · ' + x.location : '') : x.location, (x.attendees || []).length ? 'With: ' + x.attendees.map(A.firstName).join(', ') : '', p ? 'Project: ' + p.client : '', x.agenda ? 'Agenda: ' + x.agenda : ''].filter(Boolean).join('\n'); }
  const calMove = n => { S.ui.calMonth = A.addMonths(S.ui.calMonth, n); A.render(); };
  function meetingForm(x) {
    x = x || {}; const team = S.members.filter(m => m.active !== false); const projs = S.projects.filter(p => p.status !== 'done');
    return '<div class="drawer-head"><div class="member-name">' + (x.id ? 'Edit meeting' : 'New meeting') + '</div><div class="drawer-close" onclick="app.closeModal()">&times;</div></div><div class="drawer-body">' +
      '<div class="fld"><label>Title</label><input type="text" id="mtTitle" value="' + attr(x.title || '') + '" placeholder="e.g. Client meeting — Al Sabah"/></div>' +
      '<div class="fld"><label>Type</label><div class="seg" id="mtType"><div class="seg-btn' + (x.type !== 'client' ? ' active' : '') + '" data-v="internal" onclick="app.segPick(this)">Internal / site</div><div class="seg-btn' + (x.type === 'client' ? ' active' : '') + '" data-v="client" onclick="app.segPick(this)">Client</div></div></div>' +
      '<div class="fld-row">' + A.dateField('mtDate', 'Date', x.date || A.iso(A.today())) + '<div class="fld"><label>Time</label><div class="fld-row" style="gap:8px;"><input type="text" id="mtTime" value="' + attr(x.time || '') + '" placeholder="10:30"/><input type="text" id="mtEnd" value="' + attr(x.end || '') + '" placeholder="11:30"/></div></div></div>' +
      '<div class="fld-row"><div class="fld"><label>Location</label><input type="text" id="mtLoc" value="' + attr(x.location || '') + '" placeholder="Showroom, on site, phone…"/></div><div class="fld"><label>Project</label><select id="mtProject"><option value="">— none —</option>' + projs.map(p => '<option value="' + p.id + '"' + (x.projectId === p.id ? ' selected' : '') + '>' + esc(p.client) + '</option>').join('') + '</select></div></div>' +
      '<div class="fld"><label>Attendees</label><div class="check-list two-col" id="mtWho">' + team.map(m => '<label class="chk"><input type="checkbox" data-email="' + attr(m.email) + '"' + ((x.attendees || [S.me.email]).includes(m.email) ? ' checked' : '') + '/><span>' + esc(m.name) + '</span></label>').join('') + '</div></div>' +
      '<div class="fld"><label>Agenda</label><textarea id="mtAgenda" rows="2">' + esc(x.agenda || '') + '</textarea></div>' +
      (x.id ? '<div class="small"><a class="link" target="_blank" rel="noopener" href="' + attr(gcalLink(x)) + '">Add to Google Calendar</a></div>' : '') + '</div>' +
      '<div class="drawer-foot">' + (x.id ? '<button class="btn-secondary danger" onclick="app.V.deleteMeeting(\'' + x.id + '\')">Delete</button>' : '') + '<button class="btn-secondary" onclick="app.closeModal()">Cancel</button><button class="btn-primary" onclick="app.V.saveMeeting(\'' + (x.id || '') + '\')">Save</button></div>';
  }
  function gcalLink(x) { const d = x.date.replace(/-/g, ''); const t = (x.time || '09:00').replace(':', '') + '00', e = (x.end || x.time || '10:00').replace(':', '') + '00'; return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(x.title) + '&dates=' + d + 'T' + t + '/' + d + 'T' + e + '&details=' + encodeURIComponent(x.agenda || '') + '&location=' + encodeURIComponent(x.location || ''); }
  const newMeeting = date => { A.openModal(meetingForm({ date })); setTimeout(() => { const el = $('mtTitle'); if (el) el.focus(); }, 100); };
  const editMeeting = id => { const x = S.meetings.find(m => m.id === id); if (x) A.openModal(meetingForm(x)); };
  async function saveMeeting(id) {
    const title = $('mtTitle').value.trim(); if (!title) { A.toast('Give the meeting a title'); return; }
    const doc = { title, type: A.segVal('mtType') || 'internal', date: $('mtDate').dataset.iso || A.iso(A.today()), time: $('mtTime').value.trim(), end: $('mtEnd').value.trim(), location: $('mtLoc').value.trim(), projectId: $('mtProject').value || null, attendees: [...document.querySelectorAll('#mtWho input:checked')].map(i => i.dataset.email), agenda: $('mtAgenda').value.trim(), updatedAt: A.nowISO(), by: S.me.email };
    if (id) { await A.col('meetings').doc(id).update(doc); Object.assign(S.meetings.find(m => m.id === id), doc); }
    else { const ref = await A.col('meetings').add(doc); S.meetings.push({ id: ref.id, ...doc }); await A.notify(doc.attendees.filter(e => e !== S.me.email), 'Meeting: ' + title + ' — ' + A.fmtLong(doc.date) + (doc.time ? ' ' + doc.time : ''), doc.projectId, 'meeting'); }
    S.meetings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); A.closeModal(); A.render(); A.toast('Meeting saved');
  }
  async function deleteMeeting(id) { await A.col('meetings').doc(id).delete(); S.meetings = S.meetings.filter(m => m.id !== id); A.closeModal(); A.render(); }

  // ============================================================
  //  TEAM
  // ============================================================
  function viewTeam() {
    const T = A.today(), wk = A.weekKey(T); const admin = A.isAdmin();
    const counts = S.members.reduce((a, m) => { a[m.role] = (a[m.role] || 0) + 1; return a; }, {});
    let html = '<div class="topbar"><div><div class="greeting">Team</div><div class="greeting-sub">' + S.members.length + ' members · ' + (counts.admin || 0) + ' admin, ' + (counts.manager || 0) + ' manager, ' + (counts.worker || 0) + ' worker</div></div>' + (admin ? '<button class="btn-primary" onclick="app.V.inviteMember()">+ Invite member</button>' : '') + '</div>';
    html += '<div class="team-grid">' + S.members.map(m => {
      const mine = S.projects.filter(p => p.status !== 'done' && (p.assigned || []).includes(m.email));
      const done = mine.filter(p => S.checkups.find(c => c.projectId === p.id && c.by === m.email && c.week === wk)).length;
      const sees = m.role === 'worker' ? mine.length : S.projects.filter(p => p.status !== 'done').length;
      const ch = (m.notify || {}); const chans = [ch.app && 'app', ch.whatsapp && 'WhatsApp', ch.email && 'email'].filter(Boolean).join(' & ') || 'none';
      return '<div class="member-card' + (m.active === false ? ' inactive' : '') + '" onclick="app.V.editMember(\'' + attr(m.email) + '\')"><div class="member-top"><div class="avatar">' + A.initials(m.name) + '</div><div><div class="member-name">' + esc(m.name) + (m.email === S.me.email ? ' <span class="small">(you)</span>' : '') + '</div><div class="member-role">' + esc(m.job || '') + '</div></div><span class="role-pill ' + m.role + '">' + A.cap(m.role) + '</span></div>' +
        '<div class="member-stats"><div><div class="ms-num">' + (m.role === 'worker' ? mine.length : sees) + '</div><div class="ms-label">' + (m.role === 'worker' ? 'Assigned projects' : 'Projects visible') + '</div></div><div><div class="ms-num">' + (mine.length ? '<span class="' + (done === mine.length ? 'ok' : 'warn') + '">' + done + '</span> / ' + mine.length : '—') + '</div><div class="ms-label">Checkups this week</div></div></div>' +
        (mine.length ? '<div class="member-projects">' + mine.map(p => '<span class="mp">' + esc(p.client) + '</span>').join('') + '</div>' : '') +
        '<div class="member-foot">' + (m.active === false ? '<span class="danger-text">Deactivated</span> · ' : '') + (mine.length && done < mine.length ? '<span class="due">' + (mine.length - done) + ' checkup' + (mine.length - done === 1 ? '' : 's') + ' due</span> · ' : '') + 'Notifications: ' + chans + '</div></div>';
    }).join('') + '</div>';
    html += '<div class="section-heading" style="margin-top:28px;">What each role can do</div><div class="role-table"><div class="role-head"><div></div><div>Admin</div><div>Manager</div><div>Worker</div></div>' +
      [['See all projects', 1, 1, 'Only assigned'], ['Create projects and assign people', 1, 1, 0], ['Upload files and update stages', 1, 1, 1], ['Send checklists, files and quotations to clients', 1, 1, 0], ['Confirm client checklist and start production', 1, 1, 0], ['Receive the daily management update', 1, 1, 0], ['Get weekly checkup reminders', 1, 1, 1], ['Invite, edit, or deactivate team members', 1, 0, 0]].map(r => '<div class="role-row"><div>' + r[0] + '</div>' + r.slice(1).map(v => v === 1 ? '<div class="yes">Yes</div>' : v === 0 ? '<div class="no">No</div>' : '<div class="no">' + v + '</div>').join('') + '</div>').join('') + '</div>';
    return html;
  }
  function memberDrawer(m, invite) {
    const admin = A.isAdmin(); const ro = !admin && !invite; const self = m && m.email === S.me.email;
    const projs = S.projects.filter(p => p.status !== 'done');
    return '<div class="drawer-head"><div class="member-top" style="flex:1;"><div class="avatar">' + (invite ? '+' : A.initials(m.name)) + '</div><div><div class="member-name">' + (invite ? 'New member' : esc(m.name)) + '</div><div class="member-role">' + (invite ? 'Invite to ' + esc(A.CFG.companyName || 'RUF') + ' workspace' : (admin ? 'Edit member' : 'Member')) + '</div></div></div><div class="drawer-close" onclick="app.closeDrawer()">&times;</div></div>' +
      '<div class="drawer-body">' +
      '<div class="fld"><label>Name</label><input type="text" id="mdName" value="' + attr(m ? m.name : '') + '"' + (ro ? ' readonly' : '') + '/></div>' +
      '<div class="fld"><label>Work email <span class="lbl-note">they sign in with this</span></label><input type="text" id="mdEmail" value="' + attr(m ? m.email : '') + '"' + (invite ? '' : ' readonly') + ' placeholder="name@company.com"/></div>' +
      '<div class="fld"><label>Job title</label><input type="text" id="mdJob" value="' + attr(m ? m.job || '' : '') + '"' + (ro ? ' readonly' : '') + ' placeholder="e.g. Production & installation"/></div>' +
      '<div class="fld"><label>Role</label><div class="seg" id="mdRole">' + ['admin', 'manager', 'worker'].map(r => '<div class="seg-btn' + ((m ? m.role : 'worker') === r ? ' active' : '') + '" data-v="' + r + '" onclick="' + (ro || self ? '' : 'app.segPick(this, app.V.roleHint)') + '">' + A.cap(r) + '</div>').join('') + '</div><div class="fld-hint" id="mdRoleHint"></div></div>' +
      '<div class="fld"><label>Assigned projects</label><div class="check-list" id="mdProjects">' + (projs.length ? projs.map(p => '<label class="chk"><input type="checkbox" data-id="' + p.id + '"' + (m && (p.assigned || []).includes(m.email) ? ' checked' : '') + (ro ? ' disabled' : '') + '/><span>' + esc(p.client) + ' — ' + esc(A.V.productsOf(p)) + '</span></label>').join('') : '<div class="chk small">No active projects yet.</div>') + '</div></div>' +
      '<div class="fld"><label>Weekly checkup reminder</label><select id="mdDay"' + (ro ? ' disabled' : '') + '>' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(d => '<option' + ((m ? m.checkupDay : 'Sunday') === d ? ' selected' : '') + '>' + d + '</option>').join('') + '</select><div class="fld-hint">They\'ll get a reminder every week on this day for each assigned project.</div></div>' +
      '<div class="fld"><label>Notifications</label>' + A.tglRow('mdNotif', ['Through the app', 'WhatsApp', 'Email'], [(m ? m.notify : { app: true, whatsapp: true }) || {}].flatMap(n => [n.app && 'Through the app', n.whatsapp && 'WhatsApp', n.email && 'Email']).filter(Boolean)) + '</div>' +
      '<div class="fld"><label>WhatsApp number</label><input type="text" id="mdPhone" value="' + attr(m ? m.phone || '' : '') + '"' + (ro ? ' readonly' : '') + ' placeholder="+965 …"/></div>' +
      (invite ? '<div class="invite-preview"><div class="ip-head">How they sign in</div><div class="ip-body">Send them the workspace link <b>' + esc(A.publicUrl()) + '</b>. They open it, enter this email, press <b>First time here? Create your password</b>, choose a password, and they\'re in.</div></div>' : '') +
      (admin && !invite && !self ? '<div class="fld" style="margin-top:18px;"><label>Access</label><div class="access-row">' + (m.active === false ? '<button class="btn-secondary" onclick="app.V.setActive(\'' + attr(m.email) + '\', true)">Reactivate</button>' : '<button class="btn-secondary danger" onclick="app.V.setActive(\'' + attr(m.email) + '\', false)">Deactivate</button>') + '<button class="btn-secondary danger" onclick="app.V.removeMember(\'' + attr(m.email) + '\')">Remove</button></div><div class="fld-hint">Deactivating keeps their history but blocks sign-in. Removing deletes them from the team list.</div></div>' : '') +
      '</div><div class="drawer-foot"><button class="btn-secondary" onclick="app.closeDrawer()">' + (ro ? 'Close' : 'Cancel') + '</button>' + (ro ? '' : '<button class="btn-primary" onclick="app.V.saveMember(' + (invite ? 'true' : 'false') + ')">' + (invite ? 'Add member' : 'Save changes') + '</button>') + '</div>';
  }
  function roleHint(v) { const h = { admin: 'Admins see every project, manage the team, and can send things to clients.', manager: 'Managers see every project and can send things to clients, but cannot manage the team.', worker: 'Workers only see the projects assigned to them.' }; const el = $('mdRoleHint'); if (el) el.textContent = h[v || A.segVal('mdRole')]; }
  const editMember = email => { const m = S.members.find(x => x.email === email); if (!m) return; A.openDrawer(memberDrawer(m, false)); roleHint(); };
  const inviteMember = () => { A.openDrawer(memberDrawer(null, true)); roleHint(); setTimeout(() => { const el = $('mdName'); if (el) el.focus(); }, 250); };
  async function saveMember(invite) {
    const name = $('mdName').value.trim(), email = $('mdEmail').value.trim().toLowerCase(), job = $('mdJob').value.trim();
    if (!name || !email.includes('@')) { A.toast('Name and a valid email are required'); return; }
    const notif = A.tglValues('mdNotif'); const role = A.segVal('mdRole') || 'worker';
    const doc = { name, email, job, role, phone: $('mdPhone').value.trim(), checkupDay: $('mdDay').value, notify: { app: notif.includes('Through the app'), whatsapp: notif.includes('WhatsApp'), email: notif.includes('Email') }, updatedAt: A.nowISO() };
    const existing = S.members.find(x => x.email === email);
    if (invite && existing) { A.toast('That email is already a member'); return; }
    if (invite) { doc.active = true; doc.createdAt = A.nowISO(); doc.invitedBy = S.me.email; }
    await A.col('members').doc(email).set(doc, { merge: true });
    if (existing) Object.assign(existing, doc); else S.members.push({ id: email, ...doc });
    // assigned projects
    const wanted = [...document.querySelectorAll('#mdProjects input:checked')].map(i => i.dataset.id);
    for (const p of S.projects.filter(p => p.status !== 'done')) {
      const has = (p.assigned || []).includes(email), want = wanted.includes(p.id);
      if (has !== want) { const assigned = want ? [...(p.assigned || []), email] : p.assigned.filter(e => e !== email); await A.saveProject(p, { assigned }); await A.logActivity(p, (want ? 'Assigned ' : 'Unassigned ') + name, 'info'); if (want && email !== S.me.email) await A.notify([email], 'You were assigned to ' + p.client, p.id, 'assigned'); }
    }
    if (email === S.me.email) { Object.assign(S.me, doc); $('meName').textContent = S.me.name; $('meRole').textContent = S.me.job + ' · ' + A.cap(S.me.role); }
    S.members.sort((a, b) => a.name.localeCompare(b.name)); A.closeDrawer(); A.render(); A.toast(invite ? name + ' added — they can now create their password with ' + email : 'Saved');
  }
  async function setActive(email, active) { await A.col('members').doc(email).update({ active, updatedAt: A.nowISO() }); S.members.find(x => x.email === email).active = active; A.closeDrawer(); A.render(); A.toast(active ? 'Reactivated' : 'Deactivated'); }
  function removeMember(email) {
    const m = S.members.find(x => x.email === email);
    A.confirmBox('Remove ' + m.name + ' from the team?', 'They will be removed from all projects and can no longer sign in. Their past activity stays in the project history.', 'Remove', async () => {
      for (const p of S.projects.filter(p => (p.assigned || []).includes(email))) await A.saveProject(p, { assigned: p.assigned.filter(e => e !== email) });
      await A.col('members').doc(email).delete(); S.members = S.members.filter(x => x.email !== email); A.closeDrawer(); A.render(); A.toast('Removed');
    }, true);
  }

  Object.assign(A.V, { viewGantt, renderGantt, setGanttZoom, ganttShift, viewCalendar, calMove, newMeeting, editMeeting, saveMeeting, deleteMeeting, viewTeam, editMember, inviteMember, saveMember, setActive, removeMember, roleHint });

  // ---------- register + boot ----------
  A.registerViews({ viewDashboard: A.V.viewDashboard, viewProjects: A.V.viewProjects, viewNewProject: A.V.viewNewProject, npUpdate: A.V.npUpdate, openDetail: A.V.openDetail, viewGantt, renderGantt, viewCalendar, viewTeam });
  document.addEventListener('DOMContentLoaded', () => A.boot());
})();
