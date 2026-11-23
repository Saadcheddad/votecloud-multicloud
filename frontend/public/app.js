/**
 * VoteCloud - Application Frontend (hébergée sur PaaS #2 : Render)
 * Interagit via la passerelle HTTPS BFF avec :
 *   - IaaS #1 : GCP Compute Engine (/api/auth/*, /api/elections*)
 *   - FaaS #1 : AWS Lambda (/api/vote)
 *   - IaaS #2 : AWS EC2 (/api/audit/*)
 */
const state = {
  token: localStorage.getItem('votecloud_token') || null,
  user: JSON.parse(localStorage.getItem('votecloud_user') || 'null'),
  elections: [],
  selectedElectionForVote: null,
  selectedCandidateId: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 5500);
}

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const resp = await fetch(url, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// 1. Gestion Authentification (GCP IaaS #1)
// ============================================================================
function renderAuthState() {
  const userZone = $('userZone');
  const authSection = $('authSection');
  const adminLock = $('adminLockNotice');
  const adminWork = $('adminWorkspace');

  if (state.user && state.token) {
    authSection.classList.add('hidden');
    userZone.innerHTML = `
      <div class="user-badge">
        <span><strong>${escapeHtml(state.user.fullName)}</strong></span>
        <span class="muted">${escapeHtml(state.user.nationalId)} · ${state.user.role === 'admin' ? 'Admin' : 'Électeur'}</span>
      </div>
      <button class="btn-secondary btn-sm" id="btnLogout">Déconnexion</button>
    `;
    $('btnLogout').addEventListener('click', logout);

    if (state.user.role === 'admin') {
      adminLock.classList.add('hidden');
      adminWork.classList.remove('hidden');
    } else {
      adminLock.classList.remove('hidden');
      adminWork.classList.add('hidden');
    }
  } else {
    authSection.classList.remove('hidden');
    userZone.innerHTML = `<span class="user-guest">Non connecté</span>`;
    adminLock.classList.remove('hidden');
    adminWork.classList.add('hidden');
  }
}

function setSession(accessToken, user) {
  state.token = accessToken;
  state.user = user;
  localStorage.setItem('votecloud_token', accessToken);
  localStorage.setItem('votecloud_user', JSON.stringify(user));
  renderAuthState();
  loadElections();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('votecloud_token');
  localStorage.removeItem('votecloud_user');
  renderAuthState();
  loadElections();
  showToast('Session fermée.', 'info');
}

// ============================================================================
// 2. Scrutins & Processus de Vote Multicloud
// ============================================================================
async function loadElections() {
  const { ok, data } = await apiFetch('/api/elections');
  if (!ok) {
    $('electionsList').innerHTML = `<div class="card warning-card">Impossible de charger les scrutins (${escapeHtml(data.message || 'GCP IaaS hors ligne')}).</div>`;
    return;
  }

  state.elections = data.elections || [];
  renderElections();
  renderTallySelector();
  renderAdminElections();
}

function renderElections() {
  const container = $('electionsList');
  if (state.elections.length === 0) {
    container.innerHTML = '<div class="card muted">Aucun scrutin disponible.</div>';
    return;
  }

  container.innerHTML = state.elections
    .map((e) => {
      const canVoteNormally = e.windowState === 'OPEN' && !e.hasVoted;
      const firstCandId = e.candidates[0]?.id || '';
      const receiptHtml = e.hasVoted
        ? `<div class="muted" style="color:#34d399;margin-top:6px;">✓ Déjà voté — Reçu : <code class="mono">${escapeHtml(e.myReceipt?.receiptCode)}</code></div>`
        : '';

      let actionsHtml = '';
      if (!state.token) {
        actionsHtml = `<span class="muted">Connectez-vous pour voter.</span>`;
      } else if (canVoteNormally) {
        actionsHtml = `<button class="btn-primary btn-sm" data-action="open-vote" data-id="${e.id}">Voter</button>`;
      } else if (e.hasVoted) {
        actionsHtml = `
          <button class="btn-danger btn-sm" data-action="test-double-vote" data-id="${e.id}" data-cand="${firstCandId}">
            Simuler double vote (409)
          </button>`;
      } else {
        actionsHtml = `
          <button class="btn-warning btn-sm" data-action="test-out-window" data-id="${e.id}" data-cand="${firstCandId}">
            Tester hors période (403)
          </button>`;
      }

      return `
        <article class="card election-card">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
              <span class="status-badge status-${e.windowState}">${e.windowState}</span>
              <span class="muted">${e.totalVotes} bulletin(s)</span>
            </div>
            <h3>${escapeHtml(e.title)}</h3>
            <p class="muted" style="margin-bottom:10px;">${escapeHtml(e.description)}</p>
            <div class="election-meta">
              <span>Ouverture : ${formatDate(e.startsAt)}</span>
              <span>Clôture : ${formatDate(e.endsAt)}</span>
            </div>
            ${receiptHtml}
            <div class="cand-preview" style="margin-top:10px;">
              ${e.candidates.map((c) => `<span class="cand-tag" style="border-left:3px solid ${escapeHtml(c.color)}">${escapeHtml(c.name)}</span>`).join('')}
            </div>
          </div>
          <div class="election-actions">
            ${actionsHtml}
            <button class="btn-secondary btn-sm" data-action="view-results" data-id="${e.id}">Résultats</button>
          </div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const electionId = btn.dataset.id;
      const candId = btn.dataset.cand;
      if (action === 'open-vote') openVoteModal(electionId);
      if (action === 'test-double-vote') executeVoteFlow(electionId, candId, 'double-vote');
      if (action === 'test-out-window') executeVoteFlow(electionId, candId, 'out-of-window');
      if (action === 'view-results') {
        switchTab('results');
        $('tallyElectionSelect').value = electionId;
        loadTally(electionId);
      }
    });
  });
}

function openVoteModal(electionId) {
  const election = state.elections.find((e) => e.id === electionId);
  if (!election) return;
  state.selectedElectionForVote = election;
  state.selectedCandidateId = election.candidates[0]?.id || null;

  $('modalElectionTitle').textContent = election.title;
  $('modalCandidates').innerHTML = election.candidates
    .map(
      (c, idx) => `
      <label class="cand-option ${idx === 0 ? 'selected' : ''}" data-cand-id="${c.id}">
        <input type="radio" name="voteCandidate" value="${c.id}" ${idx === 0 ? 'checked' : ''} />
        <div>
          <strong style="color:${escapeHtml(c.color)}">${escapeHtml(c.name)}</strong>
          <div class="muted" style="font-size:0.8rem;">${escapeHtml(c.party)}</div>
          <div class="muted" style="font-size:0.82rem;margin-top:4px;">${escapeHtml(c.program)}</div>
        </div>
      </label>`
    )
    .join('');

  $('modalCandidates').querySelectorAll('.cand-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      $('modalCandidates').querySelectorAll('.cand-option').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      state.selectedCandidateId = opt.dataset.candId;
    });
  });

  $('voteModal').classList.remove('hidden');
}

function closeVoteModal() {
  $('voteModal').classList.add('hidden');
}

/**
 * Flux complet multicloud d'un vote :
 * Étape 1 : Demande d'un Jeton de Vote anonymisé signé à IaaS #1 (GCP Compute Engine)
 * Étape 2 : Envoi du bulletin + Jeton à FaaS #1 (AWS Lambda) -> Supabase PaaS #1 -> AWS EC2 IaaS #2
 */
async function executeVoteFlow(electionId, candidateId, mode = 'normal') {
  if (!state.token) {
    showToast('Veuillez vous connecter d\'abord.', 'error');
    return;
  }

  // Étape 1 : GCP IaaS #1 génère le Jeton de Vote anonymisé (voter_hash HMAC-SHA256)
  const tokenResp = await apiFetch('/api/auth/vote-token', {
    method: 'POST',
    body: JSON.stringify({ electionId }),
  });

  if (!tokenResp.ok) {
    showToast(`GCP IaaS a refusé le jeton : ${tokenResp.data.message || tokenResp.status}`, 'error');
    return;
  }

  // Étape 2 : AWS Lambda (FaaS #1) valide le jeton, la fenêtre temporelle, l'unicité et écrit dans Supabase + AWS EC2
  const voteResp = await apiFetch('/api/vote', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenResp.data.voteToken}` },
    body: JSON.stringify({ electionId, candidateId }),
  });

  if (voteResp.ok && voteResp.status === 201) {
    closeVoteModal();
    showToast('Vote validé par le FaaS Vercel et scellé dans OCI Audit.', 'success');
    renderReceiptBanner(voteResp.data);
    loadElections();
    loadAuditLogs();
  } else if (voteResp.status === 409) {
    showToast(
      `[HTTP 409 - FaaS] ${voteResp.data.message} (Alerte journalisée sur OCI Audit bloc #${voteResp.data.auditBlockIndex || '?'})`,
      'error'
    );
    loadAuditLogs();
  } else if (voteResp.status === 403) {
    showToast(
      `[HTTP 403 - FaaS] ${voteResp.data.message} (Alerte journalisée sur OCI Audit bloc #${voteResp.data.auditBlockIndex || '?'})`,
      'error'
    );
    loadAuditLogs();
  } else {
    showToast(`Erreur HTTP ${voteResp.status} : ${voteResp.data.message || 'Échec du vote'}`, 'error');
  }
}

function renderReceiptBanner(payload) {
  const r = payload.receipt;
  $('receiptDetails').innerHTML = `
    <div class="receipt-item"><span>Code Reçu Vérifiable</span><code>${escapeHtml(r.receiptCode)}</code></div>
    <div class="receipt-item"><span>Empreinte SHA-256 du Bulletin</span><code>${escapeHtml(r.receiptHash)}</code></div>
    <div class="receipt-item"><span>Identifiant Invocation FaaS (Vercel)</span><code>${escapeHtml(r.lambdaRequestId)}</code></div>
    <div class="receipt-item"><span>Bloc Chaîne d'Audit OCI (IaaS #2)</span><code>#${escapeHtml(r.auditBlockIndex)} — ${escapeHtml((r.auditBlockHash || '').slice(0, 20))}...</code></div>
  `;
  $('receiptTrace').innerHTML = (payload.cloudTrace || [])
    .map((step, i) => `<span class="trace-step">${i + 1}. ${escapeHtml(step)}</span>`)
    .join('');
  $('receiptBanner').classList.remove('hidden');
  $('receiptCodeInput').value = r.receiptCode;
}

// ============================================================================
// 3. Résultats Temps Réel & Vérification Reçu (AWS EC2 IaaS #2)
// ============================================================================
function renderTallySelector() {
  const sel = $('tallyElectionSelect');
  const prev = sel.value;
  sel.innerHTML = state.elections
    .map((e) => `<option value="${e.id}">[${e.windowState}] ${escapeHtml(e.title)}</option>`)
    .join('');
  if (prev && state.elections.some((e) => e.id === prev)) {
    sel.value = prev;
  }
  if (sel.value) loadTally(sel.value);
}

async function loadTally(electionId) {
  if (!electionId) return;
  const { ok, data } = await apiFetch(`/api/audit/tally/${electionId}`);
  if (!ok) {
    $('tallyContainer').innerHTML = `<div class="warning-card card">Erreur AWS EC2 : ${escapeHtml(data.message || 'Service indisponible')}</div>`;
    return;
  }

  const recon = data.crossCloudReconciliation;
  const barsHtml = data.results
    .map(
      (r) => `
      <div class="bar-item">
        <div class="bar-head">
          <span><strong>${escapeHtml(r.name)}</strong> <span class="muted">${escapeHtml(r.party)}</span></span>
          <span><strong>${r.votes}</strong> voix (${r.percentage}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.max(r.percentage, r.votes > 0 ? 3 : 0)}%;background:${escapeHtml(r.color)}"></div>
        </div>
      </div>`
    )
    .join('');

  $('tallyContainer').innerHTML = `
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-val">${data.totalVotes}</div><div class="kpi-lbl">Votes exprimés</div></div>
      <div class="kpi"><div class="kpi-val">${data.turnoutPercentage}%</div><div class="kpi-lbl">Participation (${data.registeredVoters} inscrits)</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#f87171">${data.securityMetrics.blockedDoubleVotes}</div><div class="kpi-lbl">Doubles votes bloqués</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#fbbf24">${data.securityMetrics.blockedOutOfWindow}</div><div class="kpi-lbl">Hors période bloqués</div></div>
    </div>
    ${barsHtml}
    <div class="reconcile-box ${recon.reconciled ? '' : 'warn'}">
      <strong>${recon.reconciled ? 'Réconciliation Inter-Cloud Validée' : 'Écart détecté entre Clouds'}</strong><br />
      Urne Supabase (PaaS #1) : <strong>${recon.supabaseBallotCount}</strong> bulletin(s) ·
      Registre indépendant OCI Audit (IaaS #2) : <strong>${recon.awsEc2AuditCount}</strong> preuve(s) scellée(s).
    </div>
  `;
}

// ============================================================================
// 4. Journal d'Audit & Intégrité SHA-256 (AWS EC2 IaaS #2)
// ============================================================================
async function loadAuditLogs() {
  const { ok, data } = await apiFetch('/api/audit/logs?limit=50');
  const tbody = $('auditTableBody');
  if (!ok) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Impossible de joindre AWS EC2 (${escapeHtml(data.message || '')}).</td></tr>`;
    return;
  }

  const logs = data.logs || [];
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Aucun événement d'audit pour le moment. Connectez-vous ou votez pour générer les premiers blocs SHA-256 !</td></tr>`;
    return;
  }

  tbody.innerHTML = logs
    .map(
      (b) => `
      <tr>
        <td><strong>#${b.blockIndex}</strong></td>
        <td>${formatDate(b.timestamp)}</td>
        <td><span class="ev-badge ev-${escapeHtml(b.eventType)}">${escapeHtml(b.eventType)}</span></td>
        <td><span class="tag-cloud ${b.sourceCloud.includes('OCI') || b.sourceCloud.includes('GCP') ? 'tag-oci' : 'tag-vercel'}">${escapeHtml(b.sourceCloud)}</span></td>
        <td class="mono">${escapeHtml(b.actorHash || '-')}</td>
        <td class="mono">${escapeHtml(b.prevHash.slice(0, 10))}… → <strong>${escapeHtml(b.blockHash.slice(0, 14))}…</strong></td>
        <td class="mono" style="color:#cbd5e1;max-width:260px;word-break:break-word;">${escapeHtml(JSON.stringify(b.details))}</td>
      </tr>`
    )
    .join('');
}

async function verifyAuditChain() {
  const { ok, data } = await apiFetch('/api/audit/verify');
  const banner = $('chainVerifyBanner');
  banner.classList.remove('hidden', 'verify-ok', 'verify-err');

  if (!ok) {
    banner.classList.add('verify-err');
    banner.innerHTML = `❌ Erreur lors de la vérification : ${escapeHtml(data.message)}`;
    return;
  }

  if (data.overallValid) {
    banner.classList.add('verify-ok');
    banner.innerHTML = `
      <strong>CHAÎNE D'AUDIT INTÈGRE (VÉRIFIÉE PAR OCI AUDIT IaaS #2)</strong><br />
      Blocs recalculés &amp; validés (SHA-256) : <strong>${data.localEbsLedger.blocksVerified}</strong> ·
      Empreinte sommet (Tip Hash) : <code class="mono">${escapeHtml(data.localEbsLedger.tipHash)}</code><br />
      Synchronisation OCI Audit ↔ Supabase PaaS : <strong>${data.crossCloudMirror.awsEc2Blocks} / ${data.crossCloudMirror.supabaseBlocks}</strong>
    `;
  } else {
    banner.classList.add('verify-err');
    banner.innerHTML = `<strong>ALTÉRATION DÉTECTÉE :</strong> ${escapeHtml(data.localEbsLedger.reason)}`;
  }
}

// ============================================================================
// 5. Administration des Scrutins (GCP IaaS #1)
// ============================================================================
function renderAdminElections() {
  const container = $('adminElectionsList');
  container.innerHTML = state.elections
    .map(
      (e) => `
      <div class="admin-item">
        <div>
          <strong>${escapeHtml(e.title)}</strong>
          <div class="muted">Statut DB : <span class="status-badge status-${e.status}">${e.status}</span> · ${e.totalVotes} vote(s)</div>
        </div>
        <div class="btn-group">
          <button class="btn-secondary btn-xs" data-set-status="OPEN" data-id="${e.id}">Ouvrir</button>
          <button class="btn-warning btn-xs" data-set-status="UPCOMING" data-id="${e.id}">À venir</button>
          <button class="btn-danger btn-xs" data-set-status="CLOSED" data-id="${e.id}">Clôturer</button>
        </div>
      </div>`
    )
    .join('');

  container.querySelectorAll('button[data-set-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.setStatus;
      const resp = await apiFetch(`/api/elections/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (resp.ok) {
        showToast(resp.data.message, 'success');
        loadElections();
        loadAuditLogs();
      } else {
        showToast(resp.data.message || 'Erreur de mise à jour', 'error');
      }
    });
  });
}

function addCandidateRow(name = '', party = '') {
  const row = document.createElement('div');
  row.className = 'cand-row';
  row.innerHTML = `
    <input type="text" class="cand-name" placeholder="Nom du candidat / liste" value="${escapeHtml(name)}" required />
    <input type="text" class="cand-party" placeholder="Affiliation / programme" value="${escapeHtml(party)}" />
    <button type="button" class="btn-danger btn-xs">✕</button>
  `;
  row.querySelector('button').addEventListener('click', () => {
    if ($('candidateInputs').children.length > 2) row.remove();
  });
  $('candidateInputs').appendChild(row);
}

// ============================================================================
// 6. Topologie Multicloud Live (5 Services)
// ============================================================================
async function loadTopology() {
  const { ok, data } = await apiFetch('/api/topology');
  if (!ok) return;

  const services = data.services || {};
  document.querySelectorAll('.cloud-pill[data-service]').forEach((pill) => {
    const svc = services[pill.dataset.service];
    pill.classList.remove('up', 'down');
    pill.classList.add(svc && svc.status === 'UP' ? 'up' : 'down');
  });

  const orderedKeys = ['iaas1_gcp', 'iaas2_aws', 'paas1_supabase', 'paas2_render', 'faas1_lambda'];
  $('topologyGrid').innerHTML = orderedKeys
    .map((key) => {
      const s = services[key];
      if (!s) return '';
      const isUp = s.status === 'UP';
      return `
        <div class="topo-card ${isUp ? 'up' : 'down'}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(s.model)} · ${escapeHtml(s.provider)}</strong>
            <span class="status-badge ${isUp ? 'status-OPEN' : 'status-CLOSED'}">${isUp ? 'EN LIGNE' : 'HORS LIGNE'}</span>
          </div>
          <div style="font-weight:700;color:#0f3d3e;">${escapeHtml(s.service)}</div>
          <p class="muted" style="font-size:0.8rem;">${escapeHtml(s.role)}</p>
          <div class="topo-kv"><span>Région</span><code>${escapeHtml(s.region || '-')}</code></div>
          ${s.hostname ? `<div class="topo-kv"><span>Hôte / Instance</span><code>${escapeHtml(s.hostname)}</code></div>` : ''}
          ${s.version ? `<div class="topo-kv"><span>Moteur DB</span><code>${escapeHtml(s.version)}</code></div>` : ''}
          ${s.awsRequestId ? `<div class="topo-kv"><span>ID Invocation FaaS</span><code>${escapeHtml(s.awsRequestId)}</code></div>` : ''}
          ${s.latencyMs !== undefined ? `<div class="topo-kv"><span>Latence sonde</span><code>${s.latencyMs} ms</code></div>` : ''}
          ${s.auditChain ? `<div class="topo-kv"><span>Chaîne d'audit</span><code>${s.auditChain.blocksCount} blocs (${s.auditChain.valid ? 'INTÈGRE' : 'ERREUR'})</code></div>` : ''}
          ${s.counts?.votes !== undefined ? `<div class="topo-kv"><span>Données PaaS</span><code>${s.counts.voters} électeurs · ${s.counts.elections} scrutins · ${s.counts.votes} votes</code></div>` : ''}
          ${s.error ? `<div class="topo-kv"><span>Erreur</span><code style="color:#fca5a5">${escapeHtml(s.error)}</code></div>` : ''}
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// Navigation & Event Listeners
// ============================================================================
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tabName}`));
  if (tabName === 'results') loadTally($('tallyElectionSelect').value);
  if (tabName === 'audit') loadAuditLogs();
  if (tabName === 'topology') loadTopology();
}

function initEventListeners() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Switch Connexion / Inscription
  $('btnModeLogin').addEventListener('click', () => {
    $('btnModeLogin').classList.add('active');
    $('btnModeRegister').classList.remove('active');
    $('loginForm').classList.remove('hidden');
    $('demoChips').classList.remove('hidden');
    $('registerForm').classList.add('hidden');
  });
  $('btnModeRegister').addEventListener('click', () => {
    $('btnModeRegister').classList.add('active');
    $('btnModeLogin').classList.remove('active');
    $('registerForm').classList.remove('hidden');
    $('loginForm').classList.add('hidden');
    $('demoChips').classList.add('hidden');
  });

  // Raccourcis comptes démo
  document.querySelectorAll('.chip[data-email]').forEach((chip) => {
    chip.addEventListener('click', () => {
      $('loginEmail').value = chip.dataset.email;
      $('loginPassword').value = chip.dataset.pass;
      $('loginForm').requestSubmit();
    });
  });

  // Login
  $('loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const resp = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('loginEmail').value,
        password: $('loginPassword').value,
      }),
    });
    if (resp.ok) {
      setSession(resp.data.accessToken, resp.data.user);
      showToast(`Connecté via ${resp.data.issuedBy || 'GCP IaaS'} !`, 'success');
      loadAuditLogs();
    } else {
      showToast(resp.data.message || 'Échec de connexion', 'error');
    }
  });

  // Register
  $('registerForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const resp = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nationalId: $('regNationalId').value,
        fullName: $('regFullName').value,
        email: $('regEmail').value,
        password: $('regPassword').value,
      }),
    });
    if (resp.ok) {
      setSession(resp.data.accessToken, resp.data.user);
      showToast('Inscription réussie sur GCP IaaS + Supabase PaaS !', 'success');
    } else {
      showToast(resp.data.message || 'Erreur inscription', 'error');
    }
  });

  // Modale de vote
  $('btnCancelVote').addEventListener('click', closeVoteModal);
  $('voteModalBackdrop').addEventListener('click', closeVoteModal);
  $('btnConfirmVote').addEventListener('click', () => {
    if (state.selectedElectionForVote && state.selectedCandidateId) {
      executeVoteFlow(state.selectedElectionForVote.id, state.selectedCandidateId, 'normal');
    }
  });
  $('btnCloseReceipt').addEventListener('click', () => $('receiptBanner').classList.add('hidden'));

  // Résultats & Reçu
  $('tallyElectionSelect').addEventListener('change', (ev) => loadTally(ev.target.value));
  $('btnRefreshTally').addEventListener('click', () => loadTally($('tallyElectionSelect').value));
  $('receiptVerifyForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const code = $('receiptCodeInput').value.trim();
    const box = $('receiptVerifyResult');
    const resp = await apiFetch(`/api/audit/receipt/${encodeURIComponent(code)}`);
    box.classList.remove('hidden', 'verify-ok', 'verify-err');
    if (resp.ok && resp.data.found) {
      const r = resp.data.receipt;
      box.classList.add('verify-ok');
      box.innerHTML = `
        <strong>Bulletin trouvé et vérifié</strong><br />
        Scrutin : <strong>${escapeHtml(r.electionTitle)}</strong><br />
        Horodatage : ${formatDate(r.castAt)}<br />
        ID Invocation FaaS (Vercel) : <code class="mono">${escapeHtml(r.lambdaRequestId)}</code><br />
        Présent dans le registre OCI Audit (IaaS #2) : <strong>${resp.data.verifiedCrossCloud ? `Oui (Bloc #${r.awsAuditBlockIndex})` : 'En cours de synchro'}</strong><br />
        <span class="muted">${escapeHtml(resp.data.note)}</span>
      `;
    } else {
      box.classList.add('verify-err');
      box.innerHTML = `❌ ${escapeHtml(resp.data.message || 'Reçu introuvable.')}`;
    }
  });

  // Audit
  $('btnVerifyChain').addEventListener('click', verifyAuditChain);
  $('btnReloadAudit').addEventListener('click', loadAuditLogs);

  // Admin : création de scrutin
  addCandidateRow('Candidat A', 'Liste Innovation');
  addCandidateRow('Candidat B', 'Liste Sécurité');
  $('btnAddCandidateRow').addEventListener('click', () => addCandidateRow());

  const now = new Date();
  const in7d = new Date(Date.now() + 7 * 86400000);
  $('newStartsAt').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $('newEndsAt').value = new Date(in7d.getTime() - in7d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  $('createElectionForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const candidates = Array.from($('candidateInputs').querySelectorAll('.cand-row')).map((row) => ({
      name: row.querySelector('.cand-name').value.trim(),
      party: row.querySelector('.cand-party').value.trim(),
    }));

    const resp = await apiFetch('/api/elections', {
      method: 'POST',
      body: JSON.stringify({
        title: $('newTitle').value,
        description: $('newDesc').value,
        startsAt: new Date($('newStartsAt').value).toISOString(),
        endsAt: new Date($('newEndsAt').value).toISOString(),
        status: $('newStatus').value,
        candidates,
      }),
    });

    if (resp.ok) {
      showToast(resp.data.message, 'success');
      $('newTitle').value = '';
      $('newDesc').value = '';
      loadElections();
      loadAuditLogs();
    } else {
      showToast(resp.data.message || 'Erreur lors de la création', 'error');
    }
  });

  // Boutons refresh globaux
  $('btnReloadElections').addEventListener('click', loadElections);
  $('btnRefreshCloud').addEventListener('click', loadTopology);
  $('btnRefreshTopology').addEventListener('click', loadTopology);
}

// Initialisation
initEventListeners();
renderAuthState();
loadTopology();
loadElections();
