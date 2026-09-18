/* ============================================================
   RUF Workspace — project detail
   ============================================================ */
(() => {
  const A = window.app, S = A.S, esc = A.esc, attr = A.attr, $ = A.$, D = S.detail;
  const go = h => { location.hash = h; };
  const project = () => D.project;
  const TABS = [['files', 'Files'], ['checklist', 'Client checklist'], ['activity', 'Activity'], ['schedule', 'Schedule & Gantt'], ['quote', 'Quotation', true], ['settings', 'Settings', true]];

  // ---------- load + render ----------
  async function openDetail(id, sub) {
    const listed = S.projects.find(x => x.id === id);
    if (D.project && D.project.id === id && listed && listed !== D.project) D.project = listed;   // keep pointing at the live list object
    if (!D.project || D.project.id !== id) {
      const p = listed;
      if (!p || !A.canEditProject(p) && !A.canSeeAll()) { $('view').innerHTML = '<div class="empty">Project not found or not assigned to you.</div>'; return; }
      D.project = p; D.folder = null;
      const [files, act] = await Promise.all([
        A.col('projects').doc(id).collection('files').get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
        A.col('projects').doc(id).collection('activity').orderBy('at', 'desc').limit(200).get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
      ]);
      D.files = files.sort((a, b) => (a.name || '').localeCompare(b.name || '')); D.activity = act;
    }
    D.tab = sub || 'files';
    if ((D.tab === 'quote' || D.tab === 'settings') && !A.canSeeAll()) D.tab = 'files';
    $('view').innerHTML = renderDetail();
    if (D.tab === 'schedule') renderProjectGantt();
    if (D.tab === 'quote') qCalc();
  }
  function refresh() { $('view').innerHTML = renderDetail(); if (D.tab === 'schedule') renderProjectGantt(); if (D.tab === 'quote') qCalc(); }

  function renderDetail() {
    const p = project(), done = p.status === 'done', idx = done ? 5 : (p.stage || 0);
    const edit = A.canEditProject(p);
    let actions = '';
    if (edit && !done) {
      if (p.stage < 4) actions += '<button class="btn-primary" onclick="app.V.nextStage()">' + (p.stage === 3 ? 'Mark complete' : 'Move to ' + A.STAGE_FULL[p.stage + 1]) + '</button>';
      actions += '<button class="btn-secondary" onclick="app.V.waitingModal()">' + (p.waiting ? 'Change waiting note' : 'Waiting on client…') + '</button>';
    }
    let html = '<div class="detail-back" onclick="location.hash=\'#/projects\'">&larr; Back to projects</div>' +
      '<div class="detail-header"><div><div class="detail-title">' + esc(p.client) + '</div><div class="detail-sub">' + esc(A.V.productsOf(p)) + (p.description ? ' · ' + esc(p.description) : '') + ' · Assigned to ' + esc(A.V.assignedNames(p)) + '</div>' +
      (p.waiting ? '<div class="project-meta" style="margin-top:6px;"><span class="waiting">' + esc(p.waiting) + '</span>' + (p.waitingSince ? ' · since ' + A.ago(p.waitingSince) : '') + '</div>' : '') + '</div>' +
      '<div><div class="stage-tracker" style="align-items:flex-end;"><div class="stage-current-label">' + (done ? 'Done' : A.STAGE_FULL[p.stage || 0]) + '</div>' + A.stageTrack(idx) + '</div><div class="stage-actions">' + actions + '</div></div></div>';
    html += '<div class="detail-tabs">' + TABS.filter(t => !t[2] || A.canSeeAll()).map(t => '<div class="dtab' + (D.tab === t[0] ? ' active' : '') + '" onclick="location.hash=\'#/project/' + p.id + '/' + t[0] + '\'">' + t[1] + (t[2] ? ' <span class="dtab-lock">Admin</span>' : '') + '</div>').join('') + '</div>';
    html += { files: tabFiles, checklist: tabChecklist, activity: tabActivity, schedule: tabSchedule, quote: tabQuote, settings: tabSettings }[D.tab]();
    return html;
  }

  // ---------- stage ----------
  function nextStage() {
    const p = project(); const next = p.stage + 1;
    A.confirmBox(next === 4 ? 'Mark this project complete?' : 'Move to ' + A.STAGE_FULL[next] + '?',
      next === 4 ? 'It will move to Previous projects and stop appearing in weekly checkups.' : 'The stage tracker and Gantt chart will update for everyone.', next === 4 ? 'Mark complete' : 'Move', async () => {
        const patch = { stage: next, waiting: null, waitingSince: null };
        if (next === 4) { patch.status = 'done'; patch.completedAt = A.nowISO(); }
        await A.saveProject(p, patch);
        await A.logActivity(p, next === 4 ? 'Project completed' : 'Moved to ' + A.STAGE_FULL[next], 'stage');
        await A.notify((p.assigned || []).filter(e => e !== S.me.email), p.client + ' moved to ' + A.STAGE_FULL[next], p.id, 'stage');
        await syncPortal(p); refresh(); A.toast('Updated');
      });
  }
  function waitingModal() {
    const p = project();
    A.openModal('<div class="drawer-head"><div class="member-name">Waiting on client</div></div><div class="drawer-body">' +
      '<div class="fld"><label>What are we waiting for?</label><input type="text" id="wNote" value="' + attr(p.waiting || '') + '" placeholder="e.g. Approval of elevation 3, checklist sections 8–10"/></div>' +
      '<div class="fld-hint">This shows on the dashboard and in the daily update until you clear it.</div></div>' +
      '<div class="drawer-foot">' + (p.waiting ? '<button class="btn-secondary" onclick="app.V.setWaiting(\'\')">Clear</button>' : '') + '<button class="btn-secondary" onclick="app.closeModal()">Cancel</button><button class="btn-primary" onclick="app.V.setWaiting(document.getElementById(\'wNote\').value)">Save</button></div>');
    setTimeout(() => { const el = $('wNote'); if (el) el.focus(); }, 100);
  }
  async function setWaiting(note) {
    const p = project(); note = (note || '').trim();
    A.closeModal();
    await A.saveProject(p, { waiting: note || null, waitingSince: note ? (p.waiting ? p.waitingSince : A.nowISO()) : null });
    await A.logActivity(p, note ? 'Waiting on client: ' + note : 'No longer waiting on client', 'waiting');
    refresh();
  }

  // ============================================================
  //  FILES
  // ============================================================
  function tabFiles() {
    const p = project(), edit = A.canEditProject(p);
    if (D.folder) return folderView(D.folder, edit);
    const folders = p.folders || [];
    let html = '<div class="folder-list">' + folders.map(f => {
      const files = D.files.filter(x => x.folderId === f.id);
      const waiting = files.filter(x => x.status === 'awaiting').length;
      return '<div class="folder-card" onclick="app.V.openFolder(\'' + f.id + '\')"><div class="folder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg></div>' +
        '<div class="folder-name">' + esc(f.name) + '</div><div class="folder-count">' + files.length + (files.length === 1 ? ' file' : ' files') + (waiting ? ' · ' + waiting + ' awaiting client' : '') + '</div></div>';
    }).join('');
    if (edit) html += '<div class="folder-card add-folder" id="addFolderCard" onclick="app.V.startNewFolder()"><div class="add-folder-plus">+</div><div class="folder-name" style="color:var(--muted);">New folder</div><div class="folder-count">e.g. Site photos, Material samples</div></div>' +
      '<div class="folder-card new-folder-form hidden" id="newFolderForm"><div class="folder-name" style="margin-bottom:10px;">Name the folder</div><input type="text" id="newFolderName" placeholder="e.g. Site photos" onkeydown="if(event.key===\'Enter\'){app.V.createFolder();} if(event.key===\'Escape\'){app.V.cancelNewFolder();}"/>' +
      '<div class="quick-row" style="margin-top:8px;">' + ['Site photos', 'Material samples', 'Client documents', 'Installation photos'].map(n => '<span class="quick" onclick="document.getElementById(\'newFolderName\').value=\'' + n + '\'; app.V.createFolder()">' + n + '</span>').join('') + '</div>' +
      '<div class="nf-actions"><button class="btn-secondary" onclick="app.V.cancelNewFolder()">Cancel</button><button class="btn-primary" onclick="app.V.createFolder()">Create</button></div></div>';
    html += '</div>';
    if (!folders.length) html += '<div class="empty" style="margin-top:14px;">No folders yet.</div>';
    return html;
  }
  function folderView(fid, edit) {
    const p = project(), f = (p.folders || []).find(x => x.id === fid); if (!f) { D.folder = null; return tabFiles(); }
    const files = D.files.filter(x => x.folderId === fid);
    const isElev = fid === '2d';
    let html = '<div class="detail-back" onclick="app.V.closeFolder()">&larr; Files</div>' +
      '<div class="folder-head"><div class="folder-title">' + esc(f.name) + ' <span class="small">' + files.length + (files.length === 1 ? ' file' : ' files') + '</span></div>' +
      (edit ? '<div style="display:flex;gap:8px;"><input type="file" id="fileInput" multiple class="hidden" onchange="app.V.uploadFiles(this.files)"/><button class="upload-btn" onclick="document.getElementById(\'fileInput\').click()">+ Upload</button>' +
        (A.canSeeAll() && !['2d', '3d', 'plan'].includes(fid) ? '<button class="btn-secondary" onclick="app.V.deleteFolder(\'' + fid + '\')">Delete folder</button>' : '') + '</div>' : '') + '</div>' +
      '<div class="progress hidden" id="upProgress"><div></div></div><div class="small hidden" id="upStatus" style="margin-top:6px;"></div>';
    if (!files.length) html += '<div class="folder-empty" style="margin-top:14px;">No files yet.' + (edit ? ' Upload the first one.' : '') + '</div>';
    else html += '<div class="file-grid" style="margin-top:14px;">' + files.map(x => {
      const img = /\.(png|jpe?g|gif|webp)$/i.test(x.name || '');
      const st = x.status === 'approved' ? 'approved' : x.status === 'awaiting' ? 'awaiting client' : x.status === 'declined' ? 'declined' : '';
      return '<div class="file-card"><div class="file-thumb' + (x.status === 'awaiting' ? ' wait' : '') + '">' + (img ? '<img src="' + attr(x.url) + '" alt=""/>' : esc((x.name || '').split('.').pop().toUpperCase())) + '</div>' +
        '<div class="file-name"><a href="' + attr(x.url) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a>' + (st ? ' — ' + st : '') + '<br><span class="small">' + A.firstName(x.uploadedBy) + ' · ' + A.ago(x.uploadedAt) + '</span></div>' +
        (edit ? '<div class="file-actions">' +
          '<button class="mini' + (x.shared ? ' on' : '') + '" onclick="app.V.toggleShare(\'' + x.id + '\')" data-tip="Clients see shared files in their portal">' + (x.shared ? 'Shared with client' : 'Share with client') + '</button>' +
          (isElev ? '<button class="mini' + (x.status === 'awaiting' ? ' on' : '') + '" onclick="app.V.setFileStatus(\'' + x.id + '\',\'awaiting\')">Awaiting</button><button class="mini' + (x.status === 'approved' ? ' on' : '') + '" onclick="app.V.setFileStatus(\'' + x.id + '\',\'approved\')">Approved</button>' : '') +
          '<button class="mini" onclick="app.V.deleteFile(\'' + x.id + '\')">Delete</button></div>' : '') + '</div>';
    }).join('') + '</div>';
    return html;
  }
  const openFolder = id => { D.folder = id; refresh(); };
  const closeFolder = () => { D.folder = null; refresh(); };
  function startNewFolder() { $('addFolderCard').classList.add('hidden'); $('newFolderForm').classList.remove('hidden'); setTimeout(() => { const el = $('newFolderName'); if (el) el.focus(); }, 50); }
  function cancelNewFolder() { $('newFolderForm').classList.add('hidden'); $('addFolderCard').classList.remove('hidden'); }
  async function createFolder() {
    const name = ($('newFolderName').value || '').trim(); if (!name) return;
    const p = project(); const folders = (p.folders || []).concat([{ id: 'f' + A.uid(), name }]);
    await A.saveProject(p, { folders }); await A.logActivity(p, 'Folder created: ' + name, 'file'); refresh();
  }
  function deleteFolder(fid) {
    const p = project(); const f = p.folders.find(x => x.id === fid); const n = D.files.filter(x => x.folderId === fid).length;
    A.confirmBox('Delete folder "' + f.name + '"?', n ? 'It contains ' + n + ' file(s). They will be deleted too.' : 'The folder is empty.', 'Delete', async () => {
      for (const x of D.files.filter(x => x.folderId === fid)) await removeFileDoc(x);
      await A.saveProject(p, { folders: p.folders.filter(x => x.id !== fid) }); D.folder = null; refresh();
    }, true);
  }
  async function uploadFiles(list) {
    const p = project(), files = [...list]; if (!files.length) return;
    const prog = $('upProgress'), bar = prog.firstElementChild, st = $('upStatus'); prog.classList.remove('hidden'); st.classList.remove('hidden');
    let i = 0;
    for (const file of files) {
      i++; st.textContent = 'Uploading ' + i + ' of ' + files.length + ': ' + file.name;
      const path = 'projects/' + p.id + '/' + D.folder + '/' + Date.now() + '_' + file.name.replace(/[^\w.\-]+/g, '_');
      const task = A.storage().ref(path).put(file);
      await new Promise((res, rej) => task.on('state_changed', s => { bar.style.width = Math.round(s.bytesTransferred / s.totalBytes * 100) + '%'; }, rej, res));
      const url = await task.snapshot.ref.getDownloadURL();
      const doc = { folderId: D.folder, name: file.name, path, url, size: file.size, uploadedBy: S.me.email, uploadedAt: A.nowISO(), status: D.folder === '2d' ? 'awaiting' : null, shared: false };
      const ref = await A.col('projects').doc(p.id).collection('files').add(doc);
      D.files.push({ id: ref.id, ...doc });
    }
    await A.logActivity(p, files.length === 1 ? 'Uploaded ' + files[0].name : 'Uploaded ' + files.length + ' files', 'file');
    A.toast('Upload complete'); refresh();
  }
  async function removeFileDoc(x) {
    try { await A.storage().ref(x.path).delete(); } catch (e) { /* already gone */ }
    await A.col('projects').doc(project().id).collection('files').doc(x.id).delete();
    D.files = D.files.filter(f => f.id !== x.id);
  }
  function deleteFile(id) {
    const x = D.files.find(f => f.id === id);
    A.confirmBox('Delete "' + x.name + '"?', 'This cannot be undone.', 'Delete', async () => { await removeFileDoc(x); await A.logActivity(project(), 'Deleted ' + x.name, 'file'); await syncPortal(project()); refresh(); }, true);
  }
  async function setFileStatus(id, status) {
    const x = D.files.find(f => f.id === id); const p = project();
    const s = x.status === status ? null : status;
    await A.col('projects').doc(p.id).collection('files').doc(id).update({ status: s }); x.status = s;
    await A.logActivity(p, x.name + (s === 'approved' ? ' marked approved' : s === 'awaiting' ? ' awaiting client approval' : ' status cleared'), 'file');
    await syncPortal(p); refresh();
  }
  async function toggleShare(id) {
    const x = D.files.find(f => f.id === id); const p = project();
    await A.col('projects').doc(p.id).collection('files').doc(id).update({ shared: !x.shared }); x.shared = !x.shared;
    await A.logActivity(p, x.name + (x.shared ? ' shared with client' : ' hidden from client'), 'file');
    await syncPortal(p); refresh();
  }

  // ============================================================
  //  CLIENT CHECKLIST
  // ============================================================
  function tabChecklist() {
    const p = project(), c = p.checklist, edit = A.canEditProject(p);
    if (!c) return '<div class="empty">No checklist yet.' + (edit ? '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;align-items:center;"><span class="small">Sections:</span><input type="text" id="clCount" value="10" style="width:60px;height:32px;border:1px solid var(--border);border-radius:6px;text-align:center;font-family:var(--font);"/><button class="btn-primary" onclick="app.V.createChecklist()">Create checklist</button></div><div class="small" style="margin-top:10px;">One row per section of the wardrobe or cabinet. The client tells you what goes in each.</div>' : '') + '</div>';
    const filled = c.sections.filter(s => s.choice).length;
    const canConfirm = edit && !c.teamConfirmedAt && (c.clientConfirmedAt || A.canSeeAll());
    let status = c.teamConfirmedAt ? 'Confirmed by the team on ' + A.fmtLong(c.teamConfirmedAt.slice(0, 10)) + ' — production started'
      : c.clientConfirmedAt ? 'Client confirmed on ' + A.fmtLong(c.clientConfirmedAt.slice(0, 10)) + ' · ' + filled + ' of ' + c.sections.length + ' sections filled'
        : c.sentAt ? 'Sent to client on ' + A.fmtLong(c.sentAt.slice(0, 10)) + ' · ' + filled + ' of ' + c.sections.length + ' sections filled' : 'Not sent yet · ' + filled + ' of ' + c.sections.length + ' sections filled';
    let sub = c.teamConfirmedAt ? 'Any change from here goes through a change request.' : c.clientConfirmedAt ? 'Review the answers, then confirm to start production.' : c.sentAt ? 'Client hasn\'t confirmed yet' + (c.deadline ? ' · Deadline ' + A.fmtLong(c.deadline) : '') + (c.reminderAt ? ' · Last reminder ' + A.ago(c.reminderAt) : '') : 'Fill in what you already know, then send the link to the client.';
    let html = '<div class="cl-status"><div><div class="cl-status-title">' + esc(status) + '</div><div class="cl-status-sub">' + esc(sub) + '</div></div><div class="cl-actions">' +
      (edit && !c.teamConfirmedAt ? '<button class="btn-secondary" onclick="app.V.saveChecklist()">Save</button>' : '') +
      (edit && !c.teamConfirmedAt ? '<button class="btn-secondary" onclick="app.V.sendChecklist()">' + (c.sentAt ? 'Send reminder' : 'Send to client') + '</button>' : '') +
      (edit && !c.teamConfirmedAt ? '<button class="btn-primary"' + (canConfirm ? '' : ' disabled') + ' onclick="app.V.confirmChecklist()">Confirm &amp; start production</button>' : '') + '</div></div>' +
      '<div class="cl-note">Production can only start once the client confirms (an admin can confirm on their behalf after a call). Confirming freezes the choices.</div>';
    const locked = c.teamConfirmedAt || !edit;
    const opts = (c.options || A.CHECKLIST_OPTIONS);
    html += '<div class="cl-table"><div class="cl-head"><div>Section</div><div>Client\'s choice</div><div>Note</div><div>Status</div></div>' + c.sections.map((s, i) =>
      '<div class="cl-row"><div class="cl-sec">' + (locked ? esc(s.label) : '<input type="text" value="' + attr(s.label) + '" oninput="app.V.clEdit(' + i + ',\'label\',this.value)"/>') + '</div>' +
      '<div>' + (locked ? '<span class="' + (s.custom ? 'cl-custom' : '') + '">' + esc(s.choice || 'Not filled') + '</span>'
        : '<select onchange="app.V.clChoice(' + i + ',this.value)"><option value="">— choose —</option>' + opts.map(o => '<option' + (s.choice === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '<option value="__custom"' + (s.custom ? ' selected' : '') + '>Custom…</option></select>' +
          (s.custom ? '<input type="text" style="margin-top:4px;" value="' + attr(s.choice) + '" placeholder="Describe it" oninput="app.V.clEdit(' + i + ',\'choice\',this.value)"/>' : '')) + '</div>' +
      '<div>' + (locked ? '<span class="cl-muted">' + esc(s.note || '—') + '</span>' : '<input type="text" value="' + attr(s.note || '') + '" placeholder="—" oninput="app.V.clEdit(' + i + ',\'note\',this.value)"/>') + '</div>' +
      '<div><span class="cl-pill ' + (s.choice ? 'filled' : 'empty') + '">' + (s.choice ? 'Filled' : 'Empty') + '</span></div></div>').join('') + '</div>';
    if (!locked) html += '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;"><span class="q-add" onclick="app.V.clAddSection()">+ Add section</span><span class="small">·</span><span class="q-add" onclick="app.V.clRemoveSection()">− Remove last</span>' +
      '<span class="small" style="margin-left:auto;">Deadline:</span><div class="date-wrap" style="width:160px;"><input type="text" class="date-input" id="clDeadline" value="' + attr(c.deadline ? A.fmtLong(c.deadline) : '') + '" data-iso="' + attr(c.deadline || '') + '" placeholder="Pick a date" readonly onclick="app.openDatePicker(this, app.V.clDeadline)"/></div></div>';
    return html;
  }
  async function createChecklist() {
    const n = Math.max(1, Math.min(40, parseInt($('clCount').value, 10) || 10)); const p = project();
    const c = { sections: Array.from({ length: n }, (_, i) => ({ n: i + 1, label: 'Section ' + (i + 1), choice: '', note: '', custom: false })), options: A.CHECKLIST_OPTIONS, sentAt: null, deadline: null, clientConfirmedAt: null, teamConfirmedAt: null, reminderAt: null };
    await A.saveProject(p, { checklist: c }); await A.logActivity(p, 'Checklist created — ' + n + ' sections', 'checklist'); refresh();
  }
  function clEdit(i, k, v) { project().checklist.sections[i][k] = v; }
  function clChoice(i, v) { const s = project().checklist.sections[i]; if (v === '__custom') { s.custom = true; s.choice = ''; } else { s.custom = false; s.choice = v; } refresh(); }
  function clAddSection() { const c = project().checklist; c.sections.push({ n: c.sections.length + 1, label: 'Section ' + (c.sections.length + 1), choice: '', note: '', custom: false }); refresh(); }
  function clRemoveSection() { const c = project().checklist; if (c.sections.length > 1) c.sections.pop(); refresh(); }
  function clDeadline(v) { project().checklist.deadline = v || null; }
  async function saveChecklist(silent) { const p = project(); await A.saveProject(p, { checklist: p.checklist }); if (!silent) A.toast('Checklist saved'); }
  async function sendChecklist() {
    const p = project(), c = p.checklist; const first = !c.sentAt;
    if (first) c.sentAt = A.nowISO(); else c.reminderAt = A.nowISO();
    await A.saveProject(p, { checklist: c, waiting: 'Waiting on client checklist', waitingSince: p.waitingSince || A.nowISO() });
    await A.logActivity(p, first ? 'Checklist sent to client' : 'Checklist reminder sent to client', 'checklist');
    await syncPortal(p);
    shareLinkModal('Checklist ' + (first ? 'sent' : 'reminder'), 'Send this link to ' + p.client + ' on WhatsApp. They open it, fill in each section, and press Confirm — no app or login needed.');
    refresh();
  }
  function confirmChecklist() {
    const p = project();
    A.confirmBox('Confirm and start production?', 'This freezes the client\'s choices and moves the project to <b>Production</b>. Any change after this goes through a change request.', 'Confirm & start', async () => {
      p.checklist.teamConfirmedAt = A.nowISO();
      await A.saveProject(p, { checklist: p.checklist, stage: Math.max(p.stage, 2), waiting: null, waitingSince: null });
      await A.logActivity(p, 'Checklist confirmed by ' + S.me.name + ' — production started', 'stage');
      await A.notify((p.assigned || []).filter(e => e !== S.me.email), p.client + ': checklist confirmed, production started', p.id, 'stage');
      await syncPortal(p); refresh();
    });
  }

  // ============================================================
  //  ACTIVITY + client responses
  // ============================================================
  function tabActivity() {
    const p = project(); const resp = S.responses.filter(r => r.projectId === p.id);
    let html = '';
    if (resp.length) html += '<div class="resp-panel"><div class="rp-title">Client responses waiting for review</div>' + resp.map(r =>
      '<div class="resp-row"><div>' + esc(A.V.responseSummary(r)) + '<div class="small">' + A.ago(r.at) + '</div></div><div style="display:flex;gap:6px;"><button class="btn-primary" style="height:30px;font-size:12px;" onclick="app.V.applyResponse(\'' + r.id + '\')">Apply</button><button class="btn-secondary" style="height:30px;font-size:12px;" onclick="app.V.dismissResponse(\'' + r.id + '\')">Dismiss</button></div></div>').join('') + '</div>';
    const dot = t => t === 'stage' || t === 'created' ? 'done' : (t === 'checklist' || t === 'waiting' || t === 'client' ? 'wait' : '');
    html += '<div class="timeline">' + (D.activity.length ? D.activity.map(a => '<div class="tl-item"><div class="tl-dot ' + dot(a.type) + '"></div><div class="tl-body"><div class="tl-text">' + esc(a.text) + '</div><div class="tl-meta">' + esc(a.by === 'client' ? 'Client' : A.firstName(a.by)) + ' · ' + A.fmtLong(a.at.slice(0, 10)) + ' · ' + A.ago(a.at) + '</div></div></div>').join('') : '<div class="small" style="padding:14px 0;">No activity yet.</div>') + '</div>';
    return html;
  }
  async function applyResponse(id) {
    const r = S.responses.find(x => x.id === id); const p = project(); const pl = r.payload || {};
    if (r.type === 'elevation') {
      const f = D.files.find(x => x.id === pl.fileId);
      if (f) { await A.col('projects').doc(p.id).collection('files').doc(f.id).update({ status: pl.decision === 'approved' ? 'approved' : 'declined' }); f.status = pl.decision === 'approved' ? 'approved' : 'declined'; }
      await A.logActivity(p, 'Client ' + (pl.decision === 'approved' ? 'approved ' : 'declined ') + (f ? f.name : 'an elevation') + (pl.comment ? ' — "' + pl.comment + '"' : ''), 'client');
      const shared = D.files.filter(x => x.shared && x.folderId === '2d');
      if (shared.length && shared.every(x => x.status === 'approved') && p.waiting && /elevation/i.test(p.waiting)) await A.saveProject(p, { waiting: null, waitingSince: null });
    } else if (r.type === 'checklist' && p.checklist) {
      (pl.sections || []).forEach(s => { const t = p.checklist.sections.find(x => x.n === s.n); if (t) { t.choice = s.choice || ''; t.note = s.note || ''; t.custom = !!s.custom; } });
      if (pl.confirmed) { p.checklist.clientConfirmedAt = r.at; }
      await A.saveProject(p, { checklist: p.checklist, waiting: pl.confirmed ? null : p.waiting, waitingSince: pl.confirmed ? null : p.waitingSince });
      await A.logActivity(p, pl.confirmed ? 'Client confirmed the checklist' : 'Client filled in checklist answers', 'client');
    } else if (r.type === 'quote' && p.quote) {
      p.quote.status = pl.decision === 'accepted' ? 'accepted' : 'changes';
      (p.quote.history = p.quote.history || []).unshift({ text: 'Version ' + p.quote.version + ' — ' + (pl.decision === 'accepted' ? 'accepted by client' : 'client requested changes') + (pl.comment ? ': ' + pl.comment : ''), by: 'client', at: r.at });
      await A.saveProject(p, { quote: p.quote });
      await A.logActivity(p, 'Quotation ' + (pl.decision === 'accepted' ? 'accepted by client' : 'changes requested by client') + (pl.comment ? ' — "' + pl.comment + '"' : ''), 'client');
    }
    await A.col('portalResponses').doc(id).update({ handled: true, handledBy: S.me.email, handledAt: A.nowISO() });
    S.responses = S.responses.filter(x => x.id !== id); A.updateBadge(); await syncPortal(p); refresh(); A.toast('Applied');
  }
  async function dismissResponse(id) { await A.col('portalResponses').doc(id).update({ handled: true, handledBy: S.me.email, handledAt: A.nowISO() }); S.responses = S.responses.filter(x => x.id !== id); A.updateBadge(); refresh(); }

  // ============================================================
  //  SCHEDULE + per-project Gantt
  // ============================================================
  function tabSchedule() {
    const p = project(), edit = A.canEditProject(p), ph = p.phases || {};
    let html = '<div class="sched-grid">' + A.PHASES.map(k => '<div class="sched-card ' + k + '"><div class="np-step" style="font-size:13.5px;margin-bottom:10px;">' + A.PHASE_LABEL[k] + '</div>' +
      (edit ? A.dateField('ph_' + k + '_s', 'Start', ph[k] ? ph[k].start : '', { cb: 'app.V.phaseChanged' }) + A.dateField('ph_' + k + '_e', 'End', ph[k] ? ph[k].end : '', { minFrom: 'ph_' + k + '_s', cb: 'app.V.phaseChanged' })
        : '<div class="small">' + (ph[k] ? A.fmtLong(ph[k].start) + ' → ' + A.fmtLong(ph[k].end) : '—') + '</div>') + '</div>').join('') + '</div>';
    html += '<div class="pg-toolbar"><div class="gantt-legend"><span><i class="lg design"></i>Design</span><span><i class="lg review"></i>Client review</span><span><i class="lg production"></i>Production</span><span><i class="lg install"></i>Installation</span><span><i class="lg milestone"></i>Milestone</span></div>' +
      '<div class="pg-hint">Click a phase name to collapse it · Fri–Sat shaded · vertical line is today</div></div><div class="pg-wrap" id="projectGantt"></div>';
    return html;
  }
  async function phaseChanged() {
    const p = project(); const ph = {};
    A.PHASES.forEach(k => { const s = $('ph_' + k + '_s'), e = $('ph_' + k + '_e'); if (s && e && s.dataset.iso && e.dataset.iso) ph[k] = { start: s.dataset.iso, end: e.dataset.iso }; else if (p.phases && p.phases[k]) ph[k] = p.phases[k]; });
    await A.saveProject(p, { phases: ph }); renderProjectGantt(); A.toast('Schedule saved');
  }
  const SUBTASKS = { design: [['Site measurement', 0.2], ['2D layout & floor plan', 0.4], ['Elevations', 0.4]], production: [['Material ordering & cutting', 0.35], ['Assembly', 0.4], ['Finishing & QC', 0.25]], install: [['Delivery to site', 0.3], ['Installation', 0.5], ['Handover', 0.2]] };
  function buildTasks(p) {
    const rows = [], ph = p.phases || {};
    A.PHASES.forEach(k => {
      if (!ph[k]) return; const ps = A.d0(ph[k].start), pe = A.d0(ph[k].end); const key = k;
      rows.push({ level: 0, key, name: A.PHASE_LABEL[k], phase: k, start: ps, end: pe });
      if (k === 'review') {
        const ev = [];
        if (p.checklist && p.checklist.sentAt) ev.push([p.checklist.sentAt.slice(0, 10), 'Checklist sent to client']);
        if (p.checklist && p.checklist.clientConfirmedAt) ev.push([p.checklist.clientConfirmedAt.slice(0, 10), 'Client confirmed checklist']);
        D.activity.filter(a => a.type === 'client').forEach(a => ev.push([a.at.slice(0, 10), a.text]));
        if (!ev.length) ev.push([ph[k].start, 'Planned: send to client']);
        ev.sort((a, b) => a[0].localeCompare(b[0])).forEach(e => rows.push({ level: 1, key, name: e[1], phase: 'review', start: A.d0(e[0]), end: A.d0(e[0]), milestone: true }));
        return;
      }
      const total = Math.max(1, A.dayDiff(ps, pe)); let cursor = new Date(ps); const subs = SUBTASKS[k];
      subs.forEach((st, i) => { const len = Math.max(1, Math.round(total * st[1])); const s = new Date(cursor); let e = i === subs.length - 1 ? new Date(pe) : A.addDays(s, len); if (e <= s) e = A.addDays(s, 1); rows.push({ level: 1, key, name: st[0], phase: k, start: s, end: e, milestone: st[0] === 'Handover' }); cursor = e; });
    });
    return rows;
  }
  function renderProjectGantt() {
    const el = $('projectGantt'); if (!el) return; const p = project();
    const tasks = buildTasks(p); if (!tasks.length) { el.innerHTML = '<div class="pg-empty">Set the phase dates above to see the chart.</div>'; return; }
    const first = tasks[0].start, last = tasks[tasks.length - 1].end;
    const projStart = A.addDays(first, -first.getDay()), projEnd = A.addDays(last, 7 - last.getDay());
    const nDays = Math.max(7, A.dayDiff(projStart, projEnd)); const avail = Math.max(0, el.clientWidth - 401); const DAY_W = Math.max(14, avail / nDays); const width = nDays * DAY_W; const showDay = DAY_W >= 20;
    const T = A.today();
    let left = '<div class="pg-left"><div class="pg-lhead"><div>Task</div><div>Duration</div><div>Start</div><div>End</div></div>';
    tasks.forEach(t => { const attrs = t.level === 0 ? ' data-parent="' + t.key + '" onclick="app.V.toggleGroup(\'' + t.key + '\')"' : ' data-group="' + t.key + '"'; left += '<div class="pg-lrow lvl' + t.level + '"' + attrs + '><div class="pg-tname">' + (t.level === 0 ? '<span class="pg-caret">&#9662;</span>' : '') + esc(t.name) + '</div><div>' + (t.milestone ? '—' : A.dayDiff(t.start, t.end) + ' d') + '</div><div>' + A.fmtDate(t.start) + '</div><div>' + (t.milestone ? '—' : A.fmtDate(t.end)) + '</div></div>'; });
    left += '</div>';
    let right = '<div class="pg-right"><div class="pg-inner" style="width:' + width + 'px"><div class="pg-rhead">'; let wk = '', dr = '';
    for (let i = 0; i < nDays; i++) { const d = A.addDays(projStart, i), wd = d.getDay(); if (wd === 0) wk += '<div class="pg-week" style="left:' + (i * DAY_W) + 'px">' + A.fmtDate(d) + '</div>'; dr += '<div class="pg-day' + ((wd === 5 || wd === 6) ? ' we' : '') + '" style="left:' + (i * DAY_W) + 'px;width:' + DAY_W + 'px">' + (showDay ? A.DAY_LETTERS[wd] : '') + '</div>'; }
    right += '<div class="pg-weekrow">' + wk + '</div><div class="pg-dayrow">' + dr + '</div></div><div class="pg-body"><div class="pg-cols">';
    for (let i = 0; i < nDays; i++) { const wd = A.addDays(projStart, i).getDay(); right += '<div class="pg-col' + ((wd === 5 || wd === 6) ? ' we' : '') + '" style="left:' + (i * DAY_W) + 'px;width:' + DAY_W + 'px"></div>'; }
    const ti = A.dayDiff(projStart, T); if (ti >= 0 && ti <= nDays) right += '<div class="pg-today" style="left:' + (ti * DAY_W + DAY_W / 2) + 'px"></div>';
    right += '</div>';
    tasks.forEach(t => {
      const l = A.dayDiff(projStart, t.start) * DAY_W, w = Math.max(DAY_W, A.dayDiff(t.start, t.end) * DAY_W); const attrs = t.level === 0 ? ' data-parent="' + t.key + '"' : ' data-group="' + t.key + '"';
      right += '<div class="pg-rrow"' + attrs + '>';
      if (t.level === 0) right += '<div class="pg-sum" style="left:' + l + 'px;width:' + w + 'px" data-tip="' + attr(t.name + ' · ' + A.fmtDate(t.start) + ' – ' + A.fmtDate(t.end)) + '"></div>';
      else if (t.milestone) right += '<div class="pg-mile' + (t.phase === 'review' ? ' review' : '') + '" style="left:' + (t.phase === 'review' ? l + DAY_W / 2 : l + w) + 'px" data-tip="' + attr(t.name + ' · ' + A.fmtDate(t.start)) + '"></div>';
      else right += '<div class="pg-bar ' + t.phase + '" style="left:' + l + 'px;width:' + w + 'px" data-tip="' + attr(t.name + ' · ' + A.fmtDate(t.start) + ' – ' + A.fmtDate(t.end)) + '"></div>';
      right += '</div>';
    });
    right += '</div></div></div>'; el.innerHTML = left + right; el.querySelector('.pg-right').scrollLeft = 0;
  }
  function toggleGroup(key) { const parents = document.querySelectorAll('[data-parent="' + key + '"]'), children = document.querySelectorAll('[data-group="' + key + '"]'); const c = parents[0].classList.toggle('collapsed'); parents.forEach(x => x.classList.toggle('collapsed', c)); children.forEach(x => x.classList.toggle('hidden', c)); }

  // ============================================================
  //  QUOTATION (admins & managers)
  // ============================================================
  function newQuote(p) {
    const yr = new Date().getFullYear(); const n = S.projects.filter(x => x.quote).length + 1;
    return { number: (A.CFG.companyName || 'RUF') + '-Q-' + yr + '-' + String(n).padStart(3, '0'), version: 1, status: 'draft', validUntil: A.iso(A.addDays(A.today(), 14)), duration: '6 weeks from deposit',
      items: (p.products || []).map(x => ({ desc: x, qty: 1, unit: 'unit', price: '' })).concat([{ desc: 'Delivery & installation', qty: 1, unit: 'lot', price: '' }]),
      discount: 0, depositPct: 50, balanceTerms: 'On installation', included: 'Site measurement, 2D & 3D design, materials as specified, fabrication, delivery and installation, 1-year workmanship warranty.', excluded: 'Electrical work, painting of surrounding walls, removal of existing furniture unless listed above.', note: '', history: [], sentAt: null };
  }
  function tabQuote() {
    const p = project(); if (!p.quote) { p.quote = newQuote(p); }
    const q = p.quote; const locked = q.status === 'accepted';
    const st = { draft: ['draft', 'Draft'], sent: ['sent', 'Sent · waiting for client'], accepted: ['accepted', 'Accepted by client'], changes: ['sent', 'Client requested changes'] }[q.status] || ['draft', q.status];
    let html = '<div class="q-layout"><div class="q-main"><div class="q-head"><div><div class="q-title">Quotation <span>' + esc(q.number) + '</span></div><div class="q-sub">Version ' + q.version + ' · ' + (q.sentAt ? 'Sent ' + A.fmtLong(q.sentAt.slice(0, 10)) : 'Not sent') + '</div></div><span class="q-status ' + st[0] + '">' + st[1] + '</span></div>';
    html += '<div class="np-card"><div class="np-step" style="font-size:14px;margin-bottom:14px;">Details</div><div class="fld-row"><div class="fld"><label>Client</label><input type="text" value="' + attr(p.client) + '" readonly/></div><div class="fld"><label>Project</label><input type="text" value="' + attr(A.V.productsOf(p)) + '" readonly/></div></div>' +
      '<div class="fld-row">' + A.dateField('qValid', 'Valid until', q.validUntil, { cb: 'app.V.qValid' }) + '<div class="fld"><label>Estimated duration</label><input type="text" value="' + attr(q.duration) + '" oninput="app.V.qSet(\'duration\',this.value)"/></div></div></div>';
    html += '<div class="np-card"><div class="np-step" style="font-size:14px;margin-bottom:14px;">Items</div><div class="q-table"><div class="q-thead"><div>Description</div><div>Qty</div><div>Unit</div><div>Unit price (KWD)</div><div>Total</div><div></div></div><div id="qRows">' +
      q.items.map((it, i) => '<div class="q-row"><input type="text" class="q-desc" value="' + attr(it.desc) + '" placeholder="Describe the item" oninput="app.V.qItem(' + i + ',\'desc\',this.value)"' + (locked ? ' readonly' : '') + '/><input type="text" class="q-qty" value="' + attr(it.qty) + '" oninput="app.V.qItem(' + i + ',\'qty\',this.value)"' + (locked ? ' readonly' : '') + '/><input type="text" class="q-unit" value="' + attr(it.unit) + '" oninput="app.V.qItem(' + i + ',\'unit\',this.value)"' + (locked ? ' readonly' : '') + '/><input type="text" class="q-price" value="' + attr(it.price) + '" placeholder="0.000" oninput="app.V.qItem(' + i + ',\'price\',this.value)"' + (locked ? ' readonly' : '') + '/><div class="q-line-total">0.000</div>' + (locked ? '<div></div>' : '<div class="q-del" onclick="app.V.qRemove(' + i + ')" title="Remove">&times;</div>') + '</div>').join('') + '</div></div>' + (locked ? '' : '<div class="q-add" onclick="app.V.qAdd()">+ Add item</div>') + '</div>';
    html += '<div class="np-card"><div class="np-step" style="font-size:14px;margin-bottom:14px;">Terms &amp; notes</div><div class="fld-row"><div class="fld"><label>Deposit on approval</label><select onchange="app.V.qSet(\'depositPct\',parseInt(this.value,10)); app.V.qCalc()">' + [30, 40, 50, 60, 70].map(v => '<option value="' + v + '"' + (q.depositPct === v ? ' selected' : '') + '>' + v + '%</option>').join('') + '</select></div>' +
      '<div class="fld"><label>Balance</label><select onchange="app.V.qSet(\'balanceTerms\',this.value)">' + ['On installation', 'Before delivery', '50% before delivery, 50% on handover'].map(v => '<option' + (q.balanceTerms === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div></div>' +
      '<div class="fld"><label>Included</label><textarea rows="2" oninput="app.V.qSet(\'included\',this.value)">' + esc(q.included) + '</textarea></div><div class="fld"><label>Not included</label><textarea rows="2" oninput="app.V.qSet(\'excluded\',this.value)">' + esc(q.excluded) + '</textarea></div>' +
      '<div class="fld"><label>Note to client (optional)</label><textarea rows="2" placeholder="A short personal message that appears at the top of the quotation" oninput="app.V.qSet(\'note\',this.value)">' + esc(q.note || '') + '</textarea></div></div>';
    html += '<div class="np-card"><div class="np-step" style="font-size:14px;margin-bottom:14px;">History</div><div class="timeline" style="border:none;padding:0;">' + ((q.history || []).length ? q.history.map(h => '<div class="tl-item"><div class="tl-dot ' + (h.by === 'client' ? 'wait' : 'done') + '"></div><div class="tl-body"><div class="tl-text">' + esc(h.text) + '</div><div class="tl-meta">' + (h.by === 'client' ? 'Client' : A.firstName(h.by)) + ' · ' + A.fmtLong(h.at.slice(0, 10)) + '</div></div></div>').join('') : '<div class="small" style="padding:6px 0;">Nothing sent yet.</div>') + '</div></div></div>';
    html += '<div class="q-side"><div class="np-summary-card"><div class="ip-head">Summary</div><div class="np-sum-row"><span>Subtotal</span><span id="qSubtotal">—</span></div><div class="np-sum-row"><span>Discount</span><span class="q-disc"><input type="text" id="qDiscount" value="' + attr(q.discount || 0) + '" oninput="app.V.qSet(\'discount\',this.value); app.V.qCalc()"' + (locked ? ' readonly' : '') + '/> KWD</span></div><div class="np-sum-row q-total"><span>Total</span><span id="qTotal">—</span></div><div class="np-sum-row"><span>Deposit (<span id="qDepPct">' + q.depositPct + '</span>%)</span><span id="qDepositAmt">—</span></div><div class="np-sum-row"><span>Balance</span><span id="qBalance">—</span></div></div>' +
      '<div class="np-summary-card"><div class="ip-head">Send to client</div><div class="small" style="margin-bottom:10px;line-height:1.5;">Sending publishes it to the client\'s portal link. They can accept or ask for changes there, and you\'ll see it under Activity.</div>' +
      (locked ? '<div class="small">Accepted — to change anything, create a new version.</div>' : '') + '</div>' +
      (locked ? '<button class="btn-primary np-create" onclick="app.V.qNewVersion()">New version</button>' : '<button class="btn-primary np-create" onclick="app.V.qSend()">' + (q.status === 'draft' ? 'Send quotation' : 'Re-send (new version)') + '</button>') +
      '<button class="btn-secondary np-cancel" onclick="app.V.qPrint()">Preview / PDF</button>' + (locked ? '' : '<button class="btn-secondary np-cancel" onclick="app.V.qSave()">Save draft</button>') + '</div></div>';
    return html;
  }
  const qSet = (k, v) => { project().quote[k] = v; };
  const qValid = v => { project().quote.validUntil = v; };
  const qItem = (i, k, v) => { project().quote.items[i][k] = v; qCalc(); };
  const qAdd = () => { project().quote.items.push({ desc: '', qty: 1, unit: 'unit', price: '' }); refresh(); setTimeout(() => { const r = document.querySelectorAll('#qRows .q-desc'); if (r.length) r[r.length - 1].focus(); }, 50); };
  const qRemove = i => { project().quote.items.splice(i, 1); refresh(); };
  function qTotals(q) { let sub = 0; q.items.forEach(it => { sub += (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0); }); const disc = parseFloat(q.discount) || 0; const total = Math.max(0, sub - disc); return { sub, disc, total, deposit: total * (q.depositPct || 0) / 100 }; }
  function qCalc() {
    const p = project(); if (!p || !p.quote || !$('qSubtotal')) return; const q = p.quote; const t = qTotals(q);
    document.querySelectorAll('#qRows .q-row').forEach((row, i) => { const it = q.items[i]; row.querySelector('.q-line-total').textContent = ((parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0)).toLocaleString('en-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); });
    $('qSubtotal').textContent = A.kwd(t.sub); $('qTotal').textContent = A.kwd(t.total); $('qDepPct').textContent = q.depositPct; $('qDepositAmt').textContent = A.kwd(t.deposit); $('qBalance').textContent = A.kwd(t.total - t.deposit);
  }
  async function qSave(silent) { const p = project(); await A.saveProject(p, { quote: p.quote }); if (!silent) A.toast('Quotation saved'); }
  async function qSend() {
    const p = project(), q = p.quote;
    if (q.status !== 'draft') q.version += 1;
    q.status = 'sent'; q.sentAt = A.nowISO();
    (q.history = q.history || []).unshift({ text: 'Version ' + q.version + ' — sent to client', by: S.me.email, at: q.sentAt });
    await A.saveProject(p, { quote: q, waiting: 'Waiting on quotation decision', waitingSince: p.waitingSince || A.nowISO() });
    await A.logActivity(p, 'Quotation v' + q.version + ' sent to client — total ' + A.kwd(qTotals(q).total), 'checklist');
    await syncPortal(p);
    shareLinkModal('Quotation sent', 'Send this link to ' + p.client + '. They can review the quotation and accept it or request changes.');
    refresh();
  }
  async function qNewVersion() { const p = project(); p.quote.status = 'draft'; p.quote.version += 1; await qSave(true); refresh(); }
  function qPrint() {
    const p = project(), q = p.quote, t = qTotals(q); const co = A.CFG.companyName || 'RUF';
    const w = window.open('', '_blank');
    w.document.write('<html><head><title>' + esc(q.number) + '</title><style>body{font-family:Helvetica,Arial,sans-serif;color:#1D1918;padding:40px;max-width:800px;margin:auto}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border-bottom:1px solid #E4E0D8;padding:8px;text-align:left;font-size:13px}th{font-size:11px;text-transform:uppercase;color:#8B8680}.r{text-align:right}.tot td{font-weight:700;border-top:2px solid #1D1918}.muted{color:#8B8680;font-size:12px}h3{font-size:13px;margin:22px 0 6px}</style></head><body>' +
      '<div style="display:flex;justify-content:space-between"><div><h1>' + esc(co) + '</h1><div class="muted">Quotation ' + esc(q.number) + ' · Version ' + q.version + '</div></div><div class="muted" style="text-align:right">Date ' + A.fmtLong(A.iso(A.today())) + '<br>Valid until ' + A.fmtLong(q.validUntil) + '</div></div>' +
      '<h3>Client</h3><div>' + esc(p.client) + (p.address ? '<br><span class="muted">' + esc(p.address) + '</span>' : '') + '</div><h3>Project</h3><div>' + esc(A.V.productsOf(p)) + (p.description ? ' — ' + esc(p.description) : '') + '</div>' + (q.note ? '<p>' + esc(q.note) + '</p>' : '') +
      '<table><tr><th>Description</th><th class="r">Qty</th><th>Unit</th><th class="r">Unit price</th><th class="r">Total</th></tr>' + q.items.map(it => '<tr><td>' + esc(it.desc) + '</td><td class="r">' + esc(it.qty) + '</td><td>' + esc(it.unit) + '</td><td class="r">' + A.kwd(it.price) + '</td><td class="r">' + A.kwd((parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0)) + '</td></tr>').join('') +
      '<tr><td colspan="4" class="r">Subtotal</td><td class="r">' + A.kwd(t.sub) + '</td></tr>' + (t.disc ? '<tr><td colspan="4" class="r">Discount</td><td class="r">− ' + A.kwd(t.disc) + '</td></tr>' : '') + '<tr class="tot"><td colspan="4" class="r">Total</td><td class="r">' + A.kwd(t.total) + '</td></tr></table>' +
      '<h3>Payment</h3><div>Deposit ' + q.depositPct + '% on approval: <b>' + A.kwd(t.deposit) + '</b> · Balance ' + esc(q.balanceTerms) + ': <b>' + A.kwd(t.total - t.deposit) + '</b></div><div class="muted">Estimated duration: ' + esc(q.duration) + '</div>' +
      '<h3>Included</h3><div>' + esc(q.included) + '</div><h3>Not included</h3><div>' + esc(q.excluded) + '</div><script>window.print()</script></body></html>');
    w.document.close();
  }

  // ============================================================
  //  SETTINGS (admins & managers)
  // ============================================================
  function tabSettings() {
    const p = project(); const team = S.members.filter(m => m.active !== false);
    const link = portalLink(p);
    return '<div class="np-layout"><div class="np-form">' +
      '<div class="np-card"><div class="np-step" style="font-size:14px;">Client</div><div class="fld-row"><div class="fld"><label>Client name</label><input type="text" id="stClient" value="' + attr(p.client) + '"/></div><div class="fld"><label>WhatsApp number</label><input type="text" id="stPhone" value="' + attr(p.phone || '') + '"/></div></div>' +
      '<div class="fld-row"><div class="fld"><label>Email</label><input type="text" id="stEmail" value="' + attr(p.email || '') + '"/></div><div class="fld"><label>Site address</label><input type="text" id="stAddress" value="' + attr(p.address || '') + '"/></div></div></div>' +
      '<div class="np-card"><div class="np-step" style="font-size:14px;">Project</div><div class="fld"><label>Items</label>' + A.tglRow('stProducts', [...new Set([...S.settings.products, ...(p.products || [])])], p.products || []) + '</div>' +
      '<div class="fld"><label>Materials</label>' + A.tglRow('stMaterials', [...new Set([...S.settings.materials, ...(p.materials || [])])], p.materials || []) + '</div>' +
      '<div class="fld"><label>Short description</label><input type="text" id="stDescr" value="' + attr(p.description || '') + '"/></div><div class="fld"><label>Notes for the team</label><textarea id="stNotes" rows="3">' + esc(p.notes || '') + '</textarea></div></div>' +
      '<div class="np-card"><div class="np-step" style="font-size:14px;">Team &amp; dates</div><div class="fld"><label>Assigned to</label><div class="check-list two-col" id="stTeam">' + team.map(m => '<label class="chk"><input type="checkbox" data-email="' + attr(m.email) + '"' + ((p.assigned || []).includes(m.email) ? ' checked' : '') + '/><span>' + esc(m.name) + ' — ' + esc(m.job || A.cap(m.role)) + '</span></label>').join('') + '</div></div>' +
      '<div class="fld-row">' + A.dateField('stStart', 'Start date', p.start) + A.dateField('stEnd', 'Target handover', p.handover, { minFrom: 'stStart' }) + '</div></div>' +
      '<div class="np-card"><div class="np-step" style="font-size:14px;">Client portal link</div><div class="small" style="line-height:1.5;">Send this link to the client on WhatsApp. It shows their project stage, shared files, the checklist, and the quotation — no login needed.</div>' +
      '<div class="add-row"><input type="text" value="' + attr(link) + '" readonly onclick="this.select()"/><button class="btn-secondary" onclick="navigator.clipboard.writeText(\'' + attr(link) + '\'); app.toast(\'Link copied\')">Copy</button><a class="btn-secondary" href="https://wa.me/' + attr((p.phone || '').replace(/[^\d]/g, '')) + '?text=' + encodeURIComponent('Hello ' + p.client + ', here is your ' + (A.CFG.companyName || 'RUF') + ' project page: ' + link) + '" target="_blank" rel="noopener" style="text-decoration:none;">WhatsApp</a></div>' +
      '<div class="fld-hint">Generate a new link if the old one was shared with the wrong person. <span class="link" onclick="app.V.newPortalLink()">Generate new link</span></div></div>' +
      (A.isAdmin() ? '<div class="np-card"><div class="np-step" style="font-size:14px;">Danger zone</div><div style="display:flex;gap:8px;">' + (p.status === 'done' ? '<button class="btn-secondary" onclick="app.V.reopenProject()">Reopen project</button>' : '') + '<button class="btn-secondary danger" onclick="app.V.deleteProject()">Delete project</button></div></div>' : '') +
      '</div><div class="np-side"><button class="btn-primary np-create" onclick="app.V.saveSettings()">Save changes</button><button class="btn-secondary np-cancel" onclick="location.hash=\'#/project/' + p.id + '\'">Back to files</button></div></div>';
  }
  async function saveSettings() {
    const p = project();
    const patch = { client: $('stClient').value.trim() || p.client, phone: $('stPhone').value.trim(), email: $('stEmail').value.trim(), address: $('stAddress').value.trim(), products: A.tglValues('stProducts'), materials: A.tglValues('stMaterials'), description: $('stDescr').value.trim(), notes: $('stNotes').value.trim(), assigned: [...document.querySelectorAll('#stTeam input:checked')].map(i => i.dataset.email), start: $('stStart').dataset.iso || p.start, handover: $('stEnd').dataset.iso || '' };
    const newly = patch.assigned.filter(e => !(p.assigned || []).includes(e) && e !== S.me.email);
    await A.saveProject(p, patch); await A.logActivity(p, 'Project details updated', 'info');
    if (newly.length) await A.notify(newly, 'You were assigned to ' + p.client, p.id, 'assigned');
    await syncPortal(p); A.toast('Saved'); refresh();
  }
  async function newPortalLink() { const p = project(); await A.saveProject(p, { portalToken: A.uid() + A.uid() }); await syncPortal(p); refresh(); A.toast('New link generated'); }
  function deleteProject() { const p = project(); A.confirmBox('Delete ' + p.client + '?', 'The project, its files and history will be permanently deleted.', 'Delete', async () => { for (const x of D.files) { try { await A.storage().ref(x.path).delete(); } catch (e) { } } await A.col('projects').doc(p.id).delete(); S.projects = S.projects.filter(x => x.id !== p.id); D.project = null; location.hash = '#/projects'; A.toast('Deleted'); }, true); }
  async function reopenProject() { const p = project(); await A.saveProject(p, { status: 'active', stage: 3, completedAt: null }); await A.logActivity(p, 'Project reopened', 'stage'); refresh(); }

  // ============================================================
  //  CLIENT PORTAL SYNC
  // ============================================================
  function portalLink(p) { const base = A.publicUrl().replace(/index\.html$/, ''); return base + (base.endsWith('/') ? '' : '/') + 'client.html?t=' + p.portalToken; }
  async function syncPortal(p) {
    if (!p.portalToken) return;
    const q = p.quote && p.quote.status !== 'draft' ? { number: p.quote.number, version: p.quote.version, status: p.quote.status, validUntil: p.quote.validUntil, duration: p.quote.duration, items: p.quote.items, discount: p.quote.discount, depositPct: p.quote.depositPct, balanceTerms: p.quote.balanceTerms, included: p.quote.included, excluded: p.quote.excluded, note: p.quote.note || '', totals: qTotals(p.quote) } : null;
    const snap = {
      projectId: p.id, company: A.CFG.companyName || 'RUF', client: p.client, products: p.products || [], description: p.description || '', stage: p.status === 'done' ? 4 : (p.stage || 0), status: p.status,
      files: (D.project && D.project.id === p.id ? D.files : []).filter(f => f.shared).map(f => ({ id: f.id, name: f.name, url: f.url, folder: (p.folders.find(x => x.id === f.folderId) || {}).name || '', status: f.status || null, isElevation: f.folderId === '2d' })),
      checklist: p.checklist && p.checklist.sentAt ? { sections: p.checklist.sections, options: p.checklist.options || A.CHECKLIST_OPTIONS, deadline: p.checklist.deadline, clientConfirmedAt: p.checklist.clientConfirmedAt, teamConfirmedAt: p.checklist.teamConfirmedAt } : null,
      quote: q, updatedAt: A.nowISO(),
    };
    await A.col('portal').doc(p.portalToken).set(snap);
  }
  function shareLinkModal(title, text) {
    const p = project(), link = portalLink(p);
    A.openModal('<div class="drawer-head"><div class="member-name">' + esc(title) + '</div></div><div class="drawer-body"><div style="font-size:13.5px;color:var(--muted);line-height:1.5;margin-bottom:12px;">' + esc(text) + '</div>' +
      '<div class="add-row"><input type="text" value="' + attr(link) + '" readonly onclick="this.select()"/><button class="btn-secondary" onclick="navigator.clipboard.writeText(\'' + attr(link) + '\'); app.toast(\'Link copied\')">Copy</button></div></div>' +
      '<div class="drawer-foot"><button class="btn-secondary" onclick="app.closeModal()">Close</button><a class="btn-primary" style="text-decoration:none;" href="https://wa.me/' + attr((p.phone || '').replace(/[^\d]/g, '')) + '?text=' + encodeURIComponent('Hello ' + p.client + ', please open your ' + (A.CFG.companyName || 'RUF') + ' project page: ' + link) + '" target="_blank" rel="noopener">Open in WhatsApp</a></div>');
  }

  Object.assign(A.V, { openDetail, refresh, nextStage, waitingModal, setWaiting, openFolder, closeFolder, startNewFolder, cancelNewFolder, createFolder, deleteFolder, uploadFiles, deleteFile, setFileStatus, toggleShare,
    createChecklist, clEdit, clChoice, clAddSection, clRemoveSection, clDeadline, saveChecklist, sendChecklist, confirmChecklist, applyResponse, dismissResponse, phaseChanged, toggleGroup, renderProjectGantt,
    qSet, qValid, qItem, qAdd, qRemove, qCalc, qSave, qSend, qNewVersion, qPrint, saveSettings, newPortalLink, deleteProject, reopenProject, syncPortal, portalLink });
})();
