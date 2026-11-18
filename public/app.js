// MLIC CHALLENGE Platform Frontend Client
// Features: Confidential Submissions -> Direct to DB, Document Attachments, Lajna Jury Scoring, and Winner Podium

const state = {
  currentUser: null,
  token: localStorage.getItem('mlic_token') || localStorage.getItem('agrivers_token') || null,
  activeView: 'challenges',
  challenges: [],
  submissions: [],
  mySubmissions: [],
  leaderboard: [],
  winnersAnnounced: false,
  isLajnaOrAdmin: false,
  wizardStep: 1,
  wizardChallengeId: null,
  lang: localStorage.getItem('agrivers_lang') || 'ar',

  // Current uploaded document draft
  selectedDoc: null, // { filename, size, base64 }

  // Current submission form draft state
  form: {
    title: '',
    pitch: '',
    team_name: '',
    team_members: '',
    target_audience: {
      primary_segment: '',
      customer_pain_points: '',
      value_proposition: '',
      tam_sam_som: '',
      buyer_persona: ''
    },
    swot: {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: []
    },
    feasibility: {
      technical: {
        summary: '',
        readiness_level: 'TRL 5',
        infrastructure_needs: ''
      },
      market: {
        market_demand: '',
        competitive_advantage: '',
        marketing_channels: ''
      },
      financial: {
        currency: 'USD',
        capex: 15000,
        monthly_opex: 2500,
        unit_price: 1200,
        unit_cost: 700,
        break_even_months: 12,
        projected_year1_sales: 50,
        projected_year1_revenue: 60000,
        projected_year1_net_profit: 20000,
        roi_percentage: 133
      },
      operational_legal: {
        legal_permits: '',
        team_structure: '',
        implementation_phases: ''
      }
    }
  },

  viewingSubmission: null,
  evaluatingSubmission: null
};

// API Helper
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

// Notification Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupLanguage();
  await checkAuth();
  await loadInitialData();
  setupEventListeners();
  renderApp();
});

function setupLanguage() {
  document.documentElement.setAttribute('dir', state.lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', state.lang);
}

function toggleLanguage() {
  state.lang = state.lang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('agrivers_lang', state.lang);
  setupLanguage();
  renderApp();
}

async function checkAuth() {
  if (!state.token) return;
  try {
    const data = await api('/api/auth/me');
    state.currentUser = data.user;
    state.isLajnaOrAdmin = data.user && (data.user.role === 'lajna' || data.user.role === 'admin');
  } catch (e) {
    state.token = null;
    state.currentUser = null;
    state.isLajnaOrAdmin = false;
    localStorage.removeItem('agrivers_token');
  }
}

async function loadInitialData() {
  try {
    const [chData, subData, lbData] = await Promise.all([
      api('/api/challenges'),
      api('/api/submissions'),
      api('/api/leaderboard')
    ]);

    state.challenges = chData.challenges || [];
    state.submissions = subData.submissions || [];
    state.leaderboard = lbData.leaderboard || [];
    state.winnersAnnounced = !!lbData.winners_announced;
    state.isLajnaOrAdmin = !!lbData.is_lajna;

    // Fetch Lajna requests if Admin
    if (state.currentUser?.role === 'admin') {
      try {
        const lajnaData = await api('/api/admin/lajna-requests');
        state.lajnaRequests = lajnaData.lajna_users || [];
        state.pendingLajnaCount = lajnaData.pending_count || 0;
      } catch (e) {
        console.error('Failed to load lajna requests', e);
      }
    }
  } catch (err) {
    console.error('Failed to load initial data', err);
  }
}

// Auth Management
async function logout() {
  state.token = null;
  state.currentUser = null;
  state.isLajnaOrAdmin = false;
  localStorage.removeItem('agrivers_token');
  localStorage.removeItem('mlic_token');
  showToast('Logged out', 'info');
  await loadInitialData();
  renderApp();
}

function navigateTo(view) {
  state.activeView = view;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderApp();
}

function setWizardStep(step) {
  if (step < 1 || step > 5) return;
  state.wizardStep = step;
  renderSubmissionWizard();
}

function selectChallengeForSubmission(challengeId) {
  state.wizardChallengeId = challengeId;
  state.wizardStep = 1;
  navigateTo('submit');
  showToast('Challenge selected! Complete your proposal and attach your document below.', 'success');
}

// SWOT Helpers
function addSwotItem(type) {
  const input = document.getElementById(`swot-input-${type}`);
  if (!input || !input.value.trim()) return;
  state.form.swot[type].push(input.value.trim());
  input.value = '';
  renderSwotMatrix();
}

function removeSwotItem(type, index) {
  state.form.swot[type].splice(index, 1);
  renderSwotMatrix();
}

// Financial Feasibility Calculation
function updateFinancialCalc() {
  const capex = parseFloat(document.getElementById('fin-capex')?.value) || 0;
  const opex = parseFloat(document.getElementById('fin-opex')?.value) || 0;
  const price = parseFloat(document.getElementById('fin-price')?.value) || 0;
  const cost = parseFloat(document.getElementById('fin-cost')?.value) || 0;
  const sales = parseFloat(document.getElementById('fin-sales')?.value) || 0;

  const marginPerUnit = Math.max(0, price - cost);
  const annualOpex = opex * 12;
  const year1Rev = price * sales;
  const year1Gross = marginPerUnit * sales;
  const year1Net = year1Gross - annualOpex;

  let breakEvenMonths = 0;
  const monthlyGross = (sales / 12) * marginPerUnit;
  if (monthlyGross > opex) {
    const netPerMonth = monthlyGross - opex;
    breakEvenMonths = Math.ceil(capex / netPerMonth);
  } else {
    breakEvenMonths = 999;
  }

  const roi = capex > 0 ? Math.round((year1Net / capex) * 100) : 0;

  state.form.feasibility.financial = {
    currency: 'USD',
    capex,
    monthly_opex: opex,
    unit_price: price,
    unit_cost: cost,
    projected_year1_sales: sales,
    projected_year1_revenue: year1Rev,
    projected_year1_net_profit: year1Net,
    break_even_months: breakEvenMonths < 999 ? breakEvenMonths : 'N/A',
    roi_percentage: roi,
    payment_system: document.getElementById('fin-payment-system')?.value || state.form.feasibility.financial.payment_system || ''
  };

  const beEl = document.getElementById('calc-break-even');
  const netEl = document.getElementById('calc-net-profit');
  const roiEl = document.getElementById('calc-roi');

  if (beEl) beEl.textContent = breakEvenMonths < 999 ? `${breakEvenMonths} mo` : 'N/A';
  if (netEl) netEl.textContent = `$${year1Net.toLocaleString()}`;
  if (roiEl) roiEl.textContent = `${roi}%`;
}

// Document File Handler
function handleDocFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 20 * 1024 * 1024) {
    showToast('File size exceeds 20MB limit', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    state.selectedDoc = {
      filename: file.name,
      size: file.size,
      base64: e.target.result
    };
    renderAttachedDocBadge();
    showToast(`✓ Attached: ${file.name} (${Math.round(file.size / 1024)} KB)`, 'success');
  };
  reader.readAsDataURL(file);
}

function renderAttachedDocBadge() {
  const container = document.getElementById('attached-doc-display');
  if (!container) return;

  if (!state.selectedDoc) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="doc-attached-card">
      <div class="doc-name">
        <span>📄</span>
        <span>${state.selectedDoc.filename}</span>
        <span style="font-size:0.75rem; color:var(--text-dim);">(${Math.round(state.selectedDoc.size / 1024)} KB)</span>
      </div>
      <button class="btn btn-outline btn-sm" onclick="removeAttachedDoc()" style="color:var(--danger); border-color:rgba(239,68,68,0.3);">
        ✕ إلغاء الملف
      </button>
    </div>
  `;
}

function removeAttachedDoc() {
  state.selectedDoc = null;
  const input = document.getElementById('doc-file-input');
  if (input) input.value = '';
  renderAttachedDocBadge();
}

// Submit Proposal Directly to Database (Confidential - for Lajna review)
async function postProposal() {
  if (!state.currentUser) {
    openAuthModal('login');
    showToast('Please sign in or register to submit your project to the database', 'info');
    return;
  }

  const challengeId = state.wizardChallengeId || document.getElementById('wizard-challenge-select')?.value;
  const title = document.getElementById('wiz-title')?.value.trim();
  const pitch = document.getElementById('wiz-pitch')?.value.trim();
  const teamName = document.getElementById('wiz-team-name')?.value.trim();
  const teamMembers = document.getElementById('wiz-team-members')?.value.trim();

  if (!challengeId) {
    showToast('Please select a Challenge Track', 'error');
    setWizardStep(1);
    return;
  }
  if (!title || !pitch) {
    showToast('Title and Elevator Pitch are required', 'error');
    setWizardStep(1);
    return;
  }

  let docPath = '';
  let docName = '';
  let docSize = 0;

  // Upload document if attached
  if (state.selectedDoc) {
    try {
      showToast('Uploading document to database store...', 'info');
      const uploadRes = await api('/api/upload-doc', {
        method: 'POST',
        body: JSON.stringify({
          filename: state.selectedDoc.filename,
          base64: state.selectedDoc.base64
        })
      });
      docPath = uploadRes.document_path;
      docName = uploadRes.document_name;
      docSize = uploadRes.document_size;
    } catch (e) {
      showToast('Failed to upload document', 'error');
      return;
    }
  }

  // Collect Target Audience
  state.form.target_audience = {
    primary_segment: document.getElementById('aud-segment')?.value || '',
    customer_pain_points: document.getElementById('aud-pains')?.value || '',
    value_proposition: document.getElementById('aud-value')?.value || '',
    tam_sam_som: document.getElementById('aud-market-size')?.value || '',
    buyer_persona: document.getElementById('aud-persona')?.value || ''
  };

  // Collect Feasibility
  state.form.feasibility.technical = {
    summary: document.getElementById('feas-tech-summary')?.value || '',
    readiness_level: document.getElementById('feas-tech-trl')?.value || 'TRL 5',
    infrastructure_needs: document.getElementById('feas-tech-infra')?.value || ''
  };

  state.form.feasibility.market = {
    market_demand: document.getElementById('feas-mkt-demand')?.value || '',
    competitive_advantage: document.getElementById('feas-mkt-edge')?.value || '',
    marketing_channels: document.getElementById('feas-mkt-channels')?.value || ''
  };

  state.form.feasibility.operational_legal = {
    legal_permits: document.getElementById('feas-ops-permits')?.value || '',
    team_structure: document.getElementById('feas-ops-team')?.value || '',
    implementation_phases: document.getElementById('feas-ops-phases')?.value || ''
  };

  state.form.feasibility.financial.payment_system = document.getElementById('fin-payment-system')?.value || '';

  const payload = {
    challenge_id: challengeId,
    title,
    pitch,
    team_name: teamName || state.currentUser.name,
    team_members: teamMembers || state.currentUser.name,
    target_audience: state.form.target_audience,
    swot: state.form.swot,
    feasibility: state.form.feasibility,
    document_path: docPath,
    document_name: docName,
    document_size: docSize,
    status: 'submitted'
  };

  try {
    const res = await api('/api/submissions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast('🔒 تم إرسال وحفظ دراسة الجدوى في قاعدة البيانات بنجاح لتحكيم اللجنة!', 'success');
    state.selectedDoc = null;
    await loadInitialData();
    navigateTo('my-submission');
  } catch (err) {
    console.error(err);
  }
}

// Lajna Evaluation Submission
async function submitLajnaEvaluation() {
  if (!state.currentUser || (state.currentUser.role !== 'lajna' && state.currentUser.role !== 'admin')) {
    showToast('Only Lajna Jury members can score projects', 'error');
    return;
  }

  const subId = state.evaluatingSubmission?.id;
  if (!subId) return;

  const payload = {
    submission_id: subId,
    score_problem_audience: parseInt(document.getElementById('rubric-audience')?.value, 10) || 0,
    score_swot: parseInt(document.getElementById('rubric-swot')?.value, 10) || 0,
    score_feasibility_tech: parseInt(document.getElementById('rubric-tech')?.value, 10) || 0,
    score_feasibility_financial: parseInt(document.getElementById('rubric-financial')?.value, 10) || 0,
    score_innovation: parseInt(document.getElementById('rubric-innovation')?.value, 10) || 0,
    feedback: document.getElementById('eval-feedback')?.value || '',
    strengths_observed: document.getElementById('eval-strengths')?.value || '',
    recommendations: document.getElementById('eval-recommendations')?.value || ''
  };

  try {
    const res = await api('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(`✓ تم تسجيل تقييم اللجنة بنجاح! النتيجة: ${res.total_score}/100`, 'success');
    closeModal('eval-modal');
    await loadInitialData();
    renderApp();
  } catch (err) {
    console.error(err);
  }
}

// Toggle Official Winners Announcement
async function toggleWinnersAnnouncement() {
  if (!state.currentUser || (state.currentUser.role !== 'lajna' && state.currentUser.role !== 'admin')) {
    showToast('Only Lajna Jury or Admin can announce official winners', 'error');
    return;
  }

  try {
    const res = await api('/api/admin/toggle-winners', { method: 'POST' });
    state.winnersAnnounced = res.winners_announced;
    showToast(
      res.winners_announced ? '🏆 تم اعتماد وإعلان الفائزين رسمياً!' : 'تم إخفاء النتائج عن المشاركين',
      'success'
    );
    await loadInitialData();
    renderApp();
  } catch (err) {
    console.error(err);
  }
}

// Add or Edit Challenge Idea ("ill give the ideas")
async function saveChallengeIdea() {
  const id = document.getElementById('modal-idea-id')?.value;
  const title = document.getElementById('modal-idea-title')?.value.trim();
  const category = document.getElementById('modal-idea-category')?.value.trim();
  const summary = document.getElementById('modal-idea-summary')?.value.trim();
  const problem = document.getElementById('modal-idea-problem')?.value.trim();
  const outcomes = document.getElementById('modal-idea-outcomes')?.value.trim();
  const reward = document.getElementById('modal-idea-reward')?.value.trim();

  if (!title || !problem) {
    showToast('Title and Problem Statement are required', 'error');
    return;
  }

  const payload = {
    title,
    category: category || 'AgriTech Innovation',
    summary,
    problem_statement: problem,
    expected_outcomes: outcomes,
    reward_or_grant: reward
  };

  try {
    if (id) {
      await api(`/api/challenges/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('✓ Challenge Idea updated!', 'success');
    } else {
      await api('/api/challenges', { method: 'POST', body: JSON.stringify(payload) });
      showToast('✓ New Challenge Idea added!', 'success');
    }
    closeModal('idea-modal');
    await loadInitialData();
    renderApp();
  } catch (e) {
    console.error(e);
  }
}

function openAddIdeaModal() {
  document.getElementById('modal-idea-id').value = '';
  document.getElementById('modal-idea-title').value = '';
  document.getElementById('modal-idea-category').value = '';
  document.getElementById('modal-idea-summary').value = '';
  document.getElementById('modal-idea-problem').value = '';
  document.getElementById('modal-idea-outcomes').value = '';
  document.getElementById('modal-idea-reward').value = '';
  document.getElementById('modal-idea-heading').textContent = state.lang === 'ar' ? '💡 إضافة فكرة جديدة للمسابقة' : 'Add New Competition Idea';
  openModal('idea-modal');
}

function openEditIdeaModal(challengeId) {
  const ch = state.challenges.find(c => c.id === challengeId);
  if (!ch) return;

  document.getElementById('modal-idea-id').value = ch.id;
  document.getElementById('modal-idea-title').value = ch.title;
  document.getElementById('modal-idea-category').value = ch.category;
  document.getElementById('modal-idea-summary').value = ch.summary;
  document.getElementById('modal-idea-problem').value = ch.problem_statement;
  document.getElementById('modal-idea-outcomes').value = ch.expected_outcomes;
  document.getElementById('modal-idea-reward').value = ch.reward_or_grant;
  document.getElementById('modal-idea-heading').textContent = state.lang === 'ar' ? '✏️ تعديل بيانات فكرة التحدي' : 'Edit Challenge Idea';
  openModal('idea-modal');
}

// Modals
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function openAuthModal(mode = 'login') {
  const loginForm = document.getElementById('modal-login-form');
  const regForm = document.getElementById('modal-register-form');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabReg = document.getElementById('auth-tab-reg');

  if (mode === 'login') {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
  }
  openModal('auth-modal');
}

function openDetailModal(submissionId) {
  const sub = state.submissions.find(s => s.id === submissionId);
  if (!sub) return;
  state.viewingSubmission = sub;
  renderDetailModalContent(sub);
  openModal('detail-modal');
}

function openEvaluationModal(submissionId) {
  const sub = state.submissions.find(s => s.id === submissionId);
  if (!sub) return;
  state.evaluatingSubmission = sub;
  renderEvaluationModalContent(sub);
  openModal('eval-modal');
}

// Main View Rendering
function renderApp() {
  renderNavbar();

  ['challenges', 'submit', 'my-submission', 'lajna', 'admin-lajna', 'leaderboard', 'db-info'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = state.activeView === v ? 'block' : 'none';
  });

  if (state.activeView === 'challenges') renderChallengesView();
  if (state.activeView === 'submit') renderSubmissionWizard();
  if (state.activeView === 'my-submission') renderMySubmissionView();
  if (state.activeView === 'lajna') renderLajnaView();
  if (state.activeView === 'admin-lajna') renderAdminLajnaView();
  if (state.activeView === 'leaderboard') renderLeaderboardView();
  if (state.activeView === 'db-info') renderDbStatusView();
}

function renderNavbar() {
  const userContainer = document.getElementById('nav-user-container');
  if (!userContainer) return;

  document.querySelectorAll('.nav-item').forEach(el => {
    const view = el.getAttribute('data-view');
    if (view === state.activeView) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update Lajna count badge
  const lajnaBadge = document.getElementById('nav-lajna-badge');
  if (lajnaBadge) {
    lajnaBadge.textContent = state.submissions.length;
  }

  // Show/Hide Admin Approvals nav based on Admin role
  const adminApprovalsNav = document.getElementById('nav-admin-approvals');
  const pendingBadge = document.getElementById('nav-pending-badge');
  if (adminApprovalsNav) {
    adminApprovalsNav.style.display = state.currentUser?.role === 'admin' ? 'flex' : 'none';
    if (pendingBadge) {
      pendingBadge.textContent = state.pendingLajnaCount || 0;
      pendingBadge.style.display = state.pendingLajnaCount > 0 ? 'inline-block' : 'none';
    }
  }

  // Show/Hide My Submission nav based on login
  const mySubNav = document.getElementById('nav-my-sub');
  if (mySubNav) {
    mySubNav.style.display = state.currentUser ? 'flex' : 'none';
  }

  if (state.currentUser) {
    userContainer.innerHTML = `
      <div class="user-badge" onclick="openAuthModal('profile')">
        <span class="role-tag role-${state.currentUser.role}">${state.currentUser.role}</span>
        <span style="font-weight:600;">${state.currentUser.name}</span>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="logout()">
        ${state.lang === 'ar' ? 'خروج' : 'Logout'}
      </button>
    `;
  } else {
    userContainer.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="openAuthModal('login')">
        ${state.lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
      </button>
      <button class="btn btn-primary btn-sm" onclick="openAuthModal('register')">
        ${state.lang === 'ar' ? 'إنشاء حساب' : 'Register'}
      </button>
    `;
  }
}

// 1. Challenges View ("ill give the ideas")
function renderChallengesView() {
  const grid = document.getElementById('challenges-grid-content');
  const adminBar = document.getElementById('admin-ideas-bar');
  if (!grid) return;

  if (adminBar) {
    adminBar.style.display = (state.currentUser?.role === 'admin' || state.currentUser?.role === 'lajna') ? 'flex' : 'none';
  }

  grid.innerHTML = state.challenges.map((c, idx) => `
    <div class="challenge-card">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="challenge-badge">
            <span>💡 ${state.lang === 'ar' ? `فكرة التحدي ${idx + 1}` : `Challenge Idea ${idx + 1}`}</span> • ${c.category}
          </div>
          ${(state.currentUser?.role === 'admin' || state.currentUser?.role === 'lajna') ? `
            <button class="btn btn-outline btn-sm" onclick="openEditIdeaModal('${c.id}')" title="تعديل فكرة التحدي">
              ✏️ ${state.lang === 'ar' ? 'تعديل الفكرة' : 'Edit'}
            </button>
          ` : ''}
        </div>

        <h3 class="challenge-title">${c.title}</h3>
        <p class="challenge-summary">${c.summary}</p>

        <div class="challenge-details-box">
          <strong>⚠️ ${state.lang === 'ar' ? 'المشكلة المطروحة والمطلوب حلها:' : 'The Problem Statement:'}</strong>
          ${c.problem_statement}
        </div>

        <div class="challenge-details-box">
          <strong>🎯 ${state.lang === 'ar' ? 'مخرجات دراسة الجدوى وسوات والمستند المطلوب:' : 'Expected Deliverables & Doc:'}</strong>
          <div style="white-space:pre-line;">${c.expected_outcomes}</div>
        </div>

        ${c.reward_or_grant ? `
          <div style="font-size:0.85rem; color:#fbbf24; margin-bottom:12px; font-weight:600;">
            🏆 ${c.reward_or_grant}
          </div>
        ` : ''}
      </div>

      <div class="challenge-footer">
        <span class="privacy-badge">
          🔒 ${state.lang === 'ar' ? 'التقديم سري ويذهب للجنة فقط' : 'Private to Lajna DB'}
        </span>
        <button class="btn btn-primary btn-sm" onclick="selectChallengeForSubmission('${c.id}')">
          🚀 ${state.lang === 'ar' ? 'تقديم دراسة الجدوى لهذا التحدي' : 'Apply & Submit Study'}
        </button>
      </div>
    </div>
  `).join('');
}

// 2. Submission Wizard
function renderSubmissionWizard() {
  const stepsEl = document.getElementById('wizard-steps-container');
  if (stepsEl) {
    stepsEl.innerHTML = [
      { step: 1, label: state.lang === 'ar' ? '1. بيانات المشروع' : '1. Project Info' },
      { step: 2, label: state.lang === 'ar' ? '2. الجمهور المستهدف' : '2. Target Audience' },
      { step: 3, label: state.lang === 'ar' ? '3. تحليل SWOT' : '3. SWOT Matrix' },
      { step: 4, label: state.lang === 'ar' ? '4. دراسة الجدوى' : '4. Dirasat Jadwa' },
      { step: 5, label: state.lang === 'ar' ? '5. إرفاق المستند والإرسال' : '5. Attach Doc & Submit' }
    ].map(s => `
      <div class="wizard-step ${state.wizardStep === s.step ? 'active' : state.wizardStep > s.step ? 'completed' : ''}" onclick="setWizardStep(${s.step})">
        <div class="step-circle">${state.wizardStep > s.step ? '✓' : s.step}</div>
        <div class="step-label">${s.label}</div>
      </div>
    `).join('');
  }

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`wizard-step-${i}`);
    if (el) el.style.display = state.wizardStep === i ? 'block' : 'none';
  }

  const select = document.getElementById('wizard-challenge-select');
  if (select && select.options.length <= 1) {
    select.innerHTML = `<option value="">-- ${state.lang === 'ar' ? 'اختر فكرة التحدي' : 'Select Challenge'} --</option>` +
      state.challenges.map(c => `<option value="${c.id}" ${state.wizardChallengeId === c.id ? 'selected' : ''}>${c.title}</option>`).join('');
  }

  if (state.wizardStep === 3) renderSwotMatrix();
  if (state.wizardStep === 4) updateFinancialCalc();
  if (state.wizardStep === 5) {
    renderWizardReview();
    renderAttachedDocBadge();
  }
}

function renderSwotMatrix() {
  ['strengths', 'weaknesses', 'opportunities', 'threats'].forEach(type => {
    const listEl = document.getElementById(`swot-list-${type}`);
    if (!listEl) return;
    const items = state.form.swot[type] || [];
    listEl.innerHTML = items.length === 0 
      ? `<li style="font-size:0.8rem; color:var(--text-dim); padding:6px;">${state.lang === 'ar' ? 'لم تتم إضافة عناصر بعد' : 'No points added yet'}</li>`
      : items.map((item, idx) => `
        <li class="swot-item">
          <span>${item}</span>
          <span class="swot-item-remove" onclick="removeSwotItem('${type}', ${idx})">✕</span>
        </li>
      `).join('');
  });
}

function renderWizardReview() {
  const container = document.getElementById('wizard-review-summary');
  if (!container) return;

  const challengeId = state.wizardChallengeId || document.getElementById('wizard-challenge-select')?.value;
  const challenge = state.challenges.find(c => c.id === challengeId);
  const title = document.getElementById('wiz-title')?.value || state.form.title;
  const pitch = document.getElementById('wiz-pitch')?.value || state.form.pitch;
  const team = document.getElementById('wiz-team-name')?.value || state.form.team_name;

  container.innerHTML = `
    <div style="background:rgba(15,23,42,0.6); padding:20px; border-radius:12px; border:1px solid var(--border);">
      <div style="font-size:0.8rem; color:#38bdf8; font-weight:700; margin-bottom:6px;">
        🎯 ${challenge ? challenge.title : 'No track selected'}
      </div>
      <h3 style="font-size:1.4rem; margin-bottom:8px;">${title || 'Untitled Project'}</h3>
      <p style="color:var(--text-muted); margin-bottom:16px;">${pitch || 'No pitch provided'}</p>
      <div style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">
        👥 ${state.lang === 'ar' ? 'الفريق:' : 'Team:'} <strong>${team || (state.currentUser ? state.currentUser.name : 'Anonymous')}</strong>
      </div>

      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:16px; margin-top:16px; border-top:1px solid var(--border); padding-top:16px;">
        <div>
          <h5 style="color:#34d399; margin-bottom:6px;">✓ عناصر مصفوفة SWOT</h5>
          <span style="font-size:0.85rem; color:var(--text-muted);">
            نقاط القوة: ${state.form.swot.strengths.length} | الضعف: ${state.form.swot.weaknesses.length} | الفرص: ${state.form.swot.opportunities.length} | التهديدات: ${state.form.swot.threats.length}
          </span>
        </div>
        <div>
          <h5 style="color:#38bdf8; margin-bottom:6px;">💰 ملخص الجدوى المالية</h5>
          <span style="font-size:0.85rem; color:var(--text-muted);">
            CAPEX: $${state.form.feasibility.financial.capex} | نقطة التعادل: ${state.form.feasibility.financial.break_even_months} شهر | ROI: ${state.form.feasibility.financial.roi_percentage}%
          </span>
        </div>
      </div>
    </div>
  `;
}

// 3. My Submissions View (Participant Private View)
function renderMySubmissionView() {
  const container = document.getElementById('my-submission-content');
  if (!container) return;

  if (!state.currentUser) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <h3>${state.lang === 'ar' ? 'يرجى تسجيل الدخول لعرض دراستك' : 'Please sign in to view your submission'}</h3>
        <button class="btn btn-primary" onclick="openAuthModal('login')" style="margin-top:16px;">تسجيل الدخول</button>
      </div>
    `;
    return;
  }

  if (state.submissions.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border-radius:16px; border:1px solid var(--border);">
        <div style="font-size:3rem; margin-bottom:12px;">📁</div>
        <h3>${state.lang === 'ar' ? 'لم تقم بتقديم أي دراسة جدوى بعد' : 'No submitted studies yet'}</h3>
        <p style="color:var(--text-muted); margin:12px 0 20px 0;">
          ${state.lang === 'ar' ? 'اختر إحدى أفكار المسابقة وأعد دراسة الجدوى وأرفق مستندك لإرساله إلى لجنة التحكيم.' : 'Pick a challenge idea, complete your feasibility study, and attach your document.'}
        </p>
        <button class="btn btn-primary" onclick="navigateTo('submit')">🚀 ${state.lang === 'ar' ? 'إعداد دراسة الجدوى الآن' : 'Start Submission'}</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.submissions.map(s => `
    <div class="wizard-card" style="margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div>
          <span class="privacy-badge">🔒 محفوظة ومؤمنة في قاعدة البيانات (DB)</span>
          <h2 style="font-size:1.6rem; margin-top:8px;">${s.title}</h2>
          <div style="color:#38bdf8; font-size:0.88rem; font-weight:600;">🎯 فكرة التحدي: ${s.challenge_title}</div>
        </div>
        <div class="sub-score-badge" style="background:#0284c7;">
          ⏳ ${state.lang === 'ar' ? 'الحالة: قيد التحكيم لدى اللجنة' : 'Status: Under Lajna Review'}
        </div>
      </div>

      <p style="font-size:1rem; color:var(--text-muted); margin-bottom:20px;">${s.pitch}</p>

      ${s.document_path ? `
        <div class="doc-attached-card" style="margin-bottom:20px;">
          <div class="doc-name">
            <span style="font-size:1.5rem;">📄</span>
            <div>
              <div style="font-weight:700;">المستند المرفق بالدراسة: ${s.document_name || 'ملف دراسة الجدوى'}</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${Math.round((s.document_size || 0) / 1024)} KB • تم حفظه في قاعدة بيانات المسابقة</div>
            </div>
          </div>
          <a href="${s.document_path}" target="_blank" class="btn btn-primary btn-sm" download>
            📥 تحميل / معاينة المستند
          </a>
        </div>
      ` : `
        <div style="padding:10px 14px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:0.85rem; color:var(--text-dim); margin-bottom:20px;">
          ℹ️ لم يتم إرفاق ملف مستند خارجي مع هذه الدراسة.
        </div>
      `}

      <div style="display:flex; justify-content:flex-end; gap:12px;">
        <button class="btn btn-secondary btn-sm" onclick="openDetailModal('${s.id}')">
          🔍 استعراض دراسة الجدوى وسوات
        </button>
      </div>
    </div>
  `).join('');
}

// 4. Lajna (Jury) Suite View (Confidential Review)
function renderLajnaView() {
  const container = document.getElementById('lajna-view-content');
  if (!container) return;

  const isLajnaOrAdmin = state.currentUser && (state.currentUser.role === 'lajna' || state.currentUser.role === 'admin');

  if (!isLajnaOrAdmin) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border-radius:18px; border:1px solid var(--border);">
        <div style="font-size:3rem; margin-bottom:16px;">⚖️</div>
        <h2>${state.lang === 'ar' ? 'بوابة لجنة التحكيم السرية (Lajna Jury Portal)' : 'Confidential Lajna Jury Suite'}</h2>
        <p style="color:var(--text-muted); max-width:540px; margin:12px auto 24px auto;">
          ${state.lang === 'ar' 
            ? 'المشاريع ودراسات الجدوى غير منشورة علناً، بل تُحفظ مباشرة في قاعدة البيانات ليطلع عليها أعضاء لجنة التحكيم المعتمدون حصرياً.' 
            : 'Submissions are strictly confidential and stored directly in the database for approved Lajna jurors only.'}
        </p>
        <button class="btn btn-lajna btn-lg" onclick="openAuthModal('login')">
          🔑 ${state.lang === 'ar' ? 'تسجيل الدخول كـ عضو لجنة تحكيم' : 'Sign In as Lajna Juror'}
        </button>
      </div>
    `;
    return;
  }

  // Check if Lajna is pending approval ("Only Admin can approve Lajna")
  if (state.currentUser.role === 'lajna' && !state.currentUser.is_approved) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 24px; background:var(--bg-card); border-radius:18px; border:1px solid rgba(245, 158, 11, 0.4); max-width:760px; margin:20px auto;">
        <div style="font-size:3.5rem; margin-bottom:16px;">⏳</div>
        <div class="privacy-badge" style="background:rgba(245, 158, 11, 0.15); color:#fbbf24; border-color:rgba(245, 158, 11, 0.4); margin-bottom:16px;">
          بانتظار اعتماد مدير المسابقة (Admin Approval Required)
        </div>
        <h2 style="font-size:1.8rem; margin-bottom:12px;">طلب عضويتك في لجنة التحكيم قيد المراجعة</h2>
        <p style="color:var(--text-muted); line-height:1.8; margin-bottom:24px;">
          مرحباً بك <strong>${state.currentUser.name}</strong>. في مسابقة <strong>MLIC CHALLENGE</strong>، 
          <span style="color:#fbbf24; font-weight:700;">مدير المسابقة (Admin) هو الوحيد المخول باعتماد أعضاء لجنة التحكيم</span> حفاظاً على سرية المشاريع ونزاهة التحكيم. 
          بمجرد قيام الإدارة باعتماد حسابك، ستتمكن فوراً من فحص دراسات الجدوى، تحميل المستندات المرفقة، ورصد درجات التقييم.
        </p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-secondary" onclick="checkAuth(); renderApp();">
            🔄 ${state.lang === 'ar' ? 'إعادة التحقق من حالة الاعتماد' : 'Recheck Approval Status'}
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="lajna-banner">
      <div>
        <h3 style="color:#ffffff; margin-bottom:6px;">
          ⚖️ ${state.lang === 'ar' ? 'لوحة تحكيم دراسات الجدوى والمستندات (Lajna Jury Panel)' : 'Live Lajna Evaluation Suite'}
        </h3>
        <p style="color:#e9d5ff; font-size:0.9rem;">
          ${state.lang === 'ar' 
            ? `المحكّم: ${state.currentUser.name} • المشاريع مستلمة مباشرة من قاعدة البيانات، اضغط على أي مشروع لقراءة دراسته وتحميل مستنده وتقييمه.`
            : `Juror: ${state.currentUser.name} • Submissions loaded from database. Click any study to inspect, download doc, and score.`}
        </p>
      </div>
      <div style="display:flex; gap:12px;">
        <button class="btn ${state.winnersAnnounced ? 'btn-secondary' : 'btn-primary'}" onclick="toggleWinnersAnnouncement()">
          🏆 ${state.winnersAnnounced 
            ? (state.lang === 'ar' ? 'إخفاء النتائج عن المشاركين' : 'Unpublish Winners') 
            : (state.lang === 'ar' ? 'إعلان الفائزين رسمياً!' : 'Announce Official Winners!')}
        </button>
      </div>
    </div>

    <div class="section-header">
      <div>
        <h3 style="font-size:1.3rem;">📋 ${state.lang === 'ar' ? 'دراسات الجدوى المحفوظة في قاعدة البيانات' : 'Studies Stored in Database'}</h3>
        <p class="section-subtitle">${state.submissions.length} ${state.lang === 'ar' ? 'مشروع مسجل قيد التحكيم' : 'projects in database'}</p>
      </div>
    </div>

    <div class="submissions-grid">
      ${state.submissions.map(s => `
        <div class="submission-card">
          <div>
            <div class="sub-header">
              <span style="font-size:0.75rem; color:#a78bfa; font-weight:700;">🎯 ${s.challenge_title}</span>
              <span class="sub-score-badge">
                ${s.average_score > 0 ? `⭐ ${s.average_score}/100 (${s.evaluations_count} تقييم)` : '⏳ لم يقيّم بعد'}
              </span>
            </div>
            <h4 style="font-size:1.15rem; margin-bottom:8px;">${s.title}</h4>
            <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:12px;">${s.pitch}</p>
            
            <div style="font-size:0.82rem; color:var(--text-dim); margin-bottom:12px;">
              👥 ${s.team_name} • 💰 CAPEX: $${s.feasibility?.financial?.capex || 'N/A'} • ⏱️ التعادل: ${s.feasibility?.financial?.break_even_months || 'N/A'} mo
            </div>

            ${s.document_path ? `
              <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(16,185,129,0.12); color:#34d399; padding:4px 10px; border-radius:6px; font-size:0.78rem; font-weight:700; margin-bottom:16px;">
                📄 مرفق مستند: ${s.document_name || 'ملف دراسة'}
              </div>
            ` : ''}
          </div>

          <div class="sub-footer">
            <button class="btn btn-secondary btn-sm" onclick="openDetailModal('${s.id}')">
              📄 ${state.lang === 'ar' ? 'فحص الجدوى والمستند' : 'Inspect Study & Doc'}
            </button>
            <button class="btn btn-lajna btn-sm" onclick="openEvaluationModal('${s.id}')">
              ✍️ ${state.lang === 'ar' ? 'منح الدرجات والتقييم' : 'Evaluate & Score'}
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 4.5 Admin Lajna Approval View ("make the admin the only one can approve lajna")
function renderAdminLajnaView() {
  const container = document.getElementById('admin-lajna-content');
  if (!container) return;

  if (state.currentUser?.role !== 'admin') {
    container.innerHTML = `<div style="text-align:center; padding:50px;">⛔ هذه الصفحة مخصصة لمدير المسابقة (Admin) فقط.</div>`;
    return;
  }

  const users = state.lajnaRequests || [];
  const pending = users.filter(u => !u.is_approved);
  const approved = users.filter(u => u.is_approved);

  container.innerHTML = `
    <div style="background:linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.15)); border:1px solid rgba(245, 158, 11, 0.3); border-radius:14px; padding:20px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h3 style="color:#fbbf24; margin-bottom:4px;">👑 لوحة تحكم الأدمن: اعتماد أعضاء لجنة التحكيم</h3>
        <p style="color:#fef3c7; font-size:0.88rem;">
          حفاظاً على نزاهة وسرية مسابقة MLIC CHALLENGE، لا يستطيع أي محكّم الاطلاع على المشاريع أو تقييمها حتى يتم اعتماده رسمياً من قبلك هنا.
        </p>
      </div>
      <div style="text-align:center; background:rgba(0,0,0,0.3); padding:8px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:1.6rem; font-weight:800; color:#fbbf24;">${pending.length}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">بانتظار الاعتماد</div>
      </div>
    </div>

    <div class="leaderboard-table-container">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>عضو لجنة التحكيم</th>
            <th>البريد الإلكتروني</th>
            <th>الجهة / التخصص</th>
            <th>تاريخ التسجيل</th>
            <th>الحالة الحالية</th>
            <th>إجراء المدير (Admin Action)</th>
          </tr>
        </thead>
        <tbody>
          ${users.length === 0 ? `
            <tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-dim);">لا يوجد أعضاء مسجلون في لجنة التحكيم حالياً.</td></tr>
          ` : users.map(u => `
            <tr>
              <td>
                <div style="font-weight:700; font-size:1rem;">${u.name}</div>
                <div style="font-size:0.78rem; color:var(--text-dim);">${u.bio || 'لا توجد نبذة'}</div>
              </td>
              <td style="font-size:0.88rem;">${u.email}</td>
              <td style="font-size:0.85rem;">${u.organization || '-'}</td>
              <td style="font-size:0.82rem; color:var(--text-dim);">${new Date(u.created_at).toLocaleDateString()}</td>
              <td>
                ${u.is_approved ? `
                  <span class="privacy-badge" style="background:rgba(16,185,129,0.15); color:#34d399; border-color:rgba(16,185,129,0.3);">
                    ✅ معتمد رسمي (${u.evaluations_count || 0} تقييم)
                  </span>
                ` : `
                  <span class="privacy-badge" style="background:rgba(245,158,11,0.15); color:#fbbf24; border-color:rgba(245,158,11,0.3);">
                    ⏳ بانتظار اعتماد الأدمن
                  </span>
                `}
              </td>
              <td>
                ${u.is_approved ? `
                  <button class="btn btn-outline btn-sm" onclick="toggleApproveLajna('${u.id}', false)" style="color:#ef4444; border-color:rgba(239,68,68,0.4);" title="تجميد صلاحية التحكيم">
                    ⏸️ تجميد الصلاحية
                  </button>
                ` : `
                  <button class="btn btn-primary btn-sm" onclick="toggleApproveLajna('${u.id}', true)">
                    ✅ اعتماد كـ محكّم رسمي
                  </button>
                `}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function toggleApproveLajna(userId, approve) {
  try {
    const res = await api('/api/admin/approve-lajna', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, approve })
    });
    showToast(res.message, 'success');
    await loadInitialData();
    renderApp();
  } catch (e) {
    console.error(e);
  }
}

// 5. Leaderboard & Winner Podium View ("will see as lajna who won later")
function renderLeaderboardView() {
  const container = document.getElementById('leaderboard-view-content');
  if (!container) return;

  const top3 = state.leaderboard.slice(0, 3);

  container.innerHTML = `
    <div style="text-align:center; margin-bottom:30px;">
      <div class="hero-pill" style="border-color:rgba(245, 158, 11, 0.4); color:#fbbf24; background:rgba(245, 158, 11, 0.1);">
        🏆 ${state.winnersAnnounced ? (state.lang === 'ar' ? 'تم اعتماد وإعلان الفائزين رسمياً!' : 'Official Winners Announced!') : (state.lang === 'ar' ? 'النتائج قيد التحكيم والفرز لدى اللجنة' : 'Deliberation in Progress')}
      </div>
      <h2 style="font-size:2.2rem; margin-top:8px;">
        ${state.lang === 'ar' ? 'منصة تتويج الفائزين وجدول الترتيب النهائي' : 'Winners Podium & Final Standings'}
      </h2>
      <p style="color:var(--text-muted); max-width:600px; margin:8px auto;">
        ${state.lang === 'ar' 
          ? 'تحديد الفائزين بناءً على مجموع درجات لجنة التحكيم لمصفوفة SWOT ودراسة الجدوى الفنية والمالية والمستند المرفق.'
          : 'Determined by the Lajna committee scores across SWOT, feasibility study, and attached documentation.'}
      </p>

      ${(state.isLajnaOrAdmin) ? `
        <div style="margin-top:16px;">
          <button class="btn ${state.winnersAnnounced ? 'btn-secondary' : 'btn-primary'}" onclick="toggleWinnersAnnouncement()">
            ${state.winnersAnnounced ? '🔒 حجب النتائج مؤقتاً' : '📢 إعلان الفائزين رسمياً للمشاركين!'}
          </button>
        </div>
      ` : ''}
    </div>

    ${!state.winnersAnnounced && !state.isLajnaOrAdmin ? `
      <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border-radius:18px; border:1px solid var(--border);">
        <div style="font-size:3rem; margin-bottom:12px;">⏳</div>
        <h3>${state.lang === 'ar' ? 'جلسة التحكيم جارية الآن' : 'Jury Deliberation in Progress'}</h3>
        <p style="color:var(--text-muted); max-width:500px; margin:10px auto;">
          ${state.lang === 'ar' ? 'تقوم لجنة التحكيم (Lajna) حالياً بتقييم دراسات الجدوى والمستندات المرفقة في قاعدة البيانات. سيتم إعلان الفائزين هنا بمجرد اعتماد النتائج.' : 'The Lajna committee is evaluating proposals and documents in the database. Winners will be announced here soon!'}
        </p>
      </div>
    ` : `
      <!-- Podium -->
      ${top3.length > 0 ? `
        <div class="podium-stage">
          <!-- 2nd Place -->
          ${top3[1] ? `
            <div class="podium-card podium-2nd" onclick="openDetailModal('${top3[1].id}')" style="cursor:pointer;">
              <div class="podium-trophy">🥈</div>
              <span class="podium-rank-tag">${state.lang === 'ar' ? 'المركز الثاني' : '2nd Place'}</span>
              <h4 style="font-size:1.05rem; margin:8px 0 4px 0;">${top3[1].title}</h4>
              <div style="font-size:0.8rem; color:var(--text-muted);">${top3[1].team_name}</div>
              <div class="podium-score">${top3[1].avg_score || 0}<span style="font-size:1rem; color:var(--text-dim);">/100</span></div>
            </div>
          ` : ''}

          <!-- 1st Place (Champion) -->
          ${top3[0] ? `
            <div class="podium-card podium-1st" onclick="openDetailModal('${top3[0].id}')" style="cursor:pointer;">
              <div class="podium-trophy">🏆</div>
              <span class="podium-rank-tag">${state.lang === 'ar' ? '🥇 الفائز بالمركز الأول' : '🥇 Champion - 1st'}</span>
              <h3 style="font-size:1.25rem; margin:8px 0 4px 0; color:#fbbf24;">${top3[0].title}</h3>
              <div style="font-size:0.85rem; color:var(--text-muted);">${top3[0].team_name}</div>
              <div class="podium-score" style="color:#fbbf24;">${top3[0].avg_score || 0}<span style="font-size:1.1rem; color:var(--text-dim);">/100</span></div>
              <div style="font-size:0.75rem; color:#34d399; margin-top:8px;">★ أعلى تقييم من لجنة التحكيم</div>
            </div>
          ` : ''}

          <!-- 3rd Place -->
          ${top3[2] ? `
            <div class="podium-card podium-3rd" onclick="openDetailModal('${top3[2].id}')" style="cursor:pointer;">
              <div class="podium-trophy">🥉</div>
              <span class="podium-rank-tag">${state.lang === 'ar' ? 'المركز الثالث' : '3rd Place'}</span>
              <h4 style="font-size:1.05rem; margin:8px 0 4px 0;">${top3[2].title}</h4>
              <div style="font-size:0.8rem; color:var(--text-muted);">${top3[2].team_name}</div>
              <div class="podium-score">${top3[2].avg_score || 0}<span style="font-size:1rem; color:var(--text-dim);">/100</span></div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Leaderboard Table -->
      <div class="leaderboard-table-container" style="margin-top:36px;">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>${state.lang === 'ar' ? 'المشروع والفريق' : 'Project & Team'}</th>
              <th>${state.lang === 'ar' ? 'فكرة التحدي' : 'Track'}</th>
              <th>${state.lang === 'ar' ? 'المستند المرفق' : 'Doc'}</th>
              <th>${state.lang === 'ar' ? 'الجمهور (/20)' : 'Audience (/20)'}</th>
              <th>${state.lang === 'ar' ? 'SWOT (/20)' : 'SWOT (/20)'}</th>
              <th>${state.lang === 'ar' ? 'الجدوى الفنية (/25)' : 'Tech (/25)'}</th>
              <th>${state.lang === 'ar' ? 'الجدوى المالية (/25)' : 'Finance (/25)'}</th>
              <th>${state.lang === 'ar' ? 'المجموع النهائي' : 'Total (/100)'}</th>
            </tr>
          </thead>
          <tbody>
            ${state.leaderboard.map((item, index) => `
              <tr onclick="openDetailModal('${item.id}')" style="cursor:pointer;">
                <td style="font-weight:800; color:${index === 0 ? '#fbbf24' : index === 1 ? '#cbd5e1' : index === 2 ? '#d97706' : 'var(--text-muted)'};">
                  ${index === 0 ? '🥇 1' : index === 1 ? '🥈 2' : index === 2 ? '🥉 3' : index + 1}
                </td>
                <td>
                  <div style="font-weight:700;">${item.title}</div>
                  <div style="font-size:0.8rem; color:var(--text-dim);">${item.team_name}</div>
                </td>
                <td><span style="font-size:0.82rem; color:#38bdf8;">${item.challenge_category}</span></td>
                <td>${item.document_path ? '📄 مرفق' : '-'}</td>
                <td>${item.avg_audience || '-'}</td>
                <td>${item.avg_swot || '-'}</td>
                <td>${item.avg_tech || '-'}</td>
                <td>${item.avg_financial || '-'}</td>
                <td>
                  <span class="sub-score-badge" style="background:${index === 0 ? '#b45309' : '#4c1d95'};">
                    ${item.avg_score || 0} / 100
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

// 6. Database & PostgreSQL Status View
async function renderDbStatusView() {
  const container = document.getElementById('db-view-content');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:40px;">Checking Database & PostgreSQL status...</div>`;

  try {
    const data = await api('/api/db/status');

    container.innerHTML = `
      <div style="max-width:820px; margin:0 auto; background:var(--bg-card); border-radius:18px; border:1px solid var(--border); padding:32px;">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
          <div style="font-size:2.8rem;">🐘</div>
          <div>
            <h2 style="font-size:1.6rem;">PostgreSQL Architecture & Confidential Storage</h2>
            <p style="color:var(--text-muted); font-size:0.9rem;">
              Submissions, attached documents, and SWOT/feasibility studies are stored directly in the database for the Lajna jury committee.
            </p>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:18px; margin-bottom:24px;">
          <div style="background:rgba(15,23,42,0.8); padding:18px; border-radius:12px; border:1px solid var(--border);">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); margin-bottom:4px;">Active Storage Engine</div>
            <div style="font-size:1.15rem; font-weight:700; color:#34d399;">⚡ ${data.active_engine}</div>
            <div style="font-size:0.82rem; color:var(--text-muted); margin-top:6px;">Direct to DB storage with document links and encrypted records.</div>
          </div>

          <div style="background:rgba(15,23,42,0.8); padding:18px; border-radius:12px; border:1px solid var(--border);">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); margin-bottom:4px;">PostgreSQL Port 5432 Status</div>
            <div style="font-size:1.15rem; font-weight:700; color:${data.postgres.online ? '#34d399' : '#f59e0b'};">
              ${data.postgres.online ? '🟢 Online & Connected' : '🟡 Ready (Connects when PostgreSQL starts)'}
            </div>
            <div style="font-size:0.82rem; color:var(--text-muted); margin-top:6px;">${data.postgres.status_message}</div>
          </div>
        </div>

        <h4 style="margin-bottom:12px;">📊 Records Stored in Database</h4>
        <div style="display:flex; gap:18px; margin-bottom:28px;">
          <div class="stat-item"><div class="stat-value">${data.counts.users}</div><div class="stat-label">Users</div></div>
          <div class="stat-item"><div class="stat-value">${data.counts.challenges}</div><div class="stat-label">Challenges</div></div>
          <div class="stat-item"><div class="stat-value">${data.counts.submissions}</div><div class="stat-label">Submissions</div></div>
          <div class="stat-item"><div class="stat-value">${data.counts.evaluations}</div><div class="stat-label">Evaluations</div></div>
        </div>

        <h4 style="margin-bottom:12px;">🛠️ PostgreSQL DDL & Live Data Export</h4>
        <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:16px;">
          Download the latest PostgreSQL schema and full database SQL file with one click:
        </p>
        <div style="display:flex; gap:12px;">
          <a href="/api/db/export-postgres" download="agrivers_postgres.sql" class="btn btn-primary">
            📥 Download PostgreSQL Dump (agrivers_postgres.sql)
          </a>
          <button class="btn btn-secondary" onclick="renderDbStatusView()">
            🔄 Recheck Status
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger); text-align:center;">Failed to load DB status</div>`;
  }
}

// Detail Modal Content
function renderDetailModalContent(sub) {
  const container = document.getElementById('detail-modal-body');
  if (!container) return;

  const target = sub.target_audience || {};
  const swot = sub.swot || {};
  const feas = sub.feasibility || {};
  const fin = feas.financial || {};
  const evals = sub.evaluations || [];

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="privacy-badge">🔒 مستند ودراسة محفوظة في قاعدة البيانات (DB)</span>
        <span style="font-size:0.8rem; color:#38bdf8; font-weight:700;">🎯 ${sub.challenge_title}</span>
      </div>
      <h2 style="font-size:1.8rem; margin:10px 0 8px 0;">${sub.title}</h2>
      <p style="font-size:1.05rem; color:var(--text-muted);">${sub.pitch}</p>
      <div style="display:flex; gap:16px; font-size:0.85rem; color:var(--text-dim); margin-top:10px;">
        <span>👥 ${state.lang === 'ar' ? 'الفريق:' : 'Team:'} <strong>${sub.team_name}</strong></span>
        <span>👤 ${state.lang === 'ar' ? 'الأعضاء:' : 'Members:'} ${sub.team_members}</span>
      </div>
    </div>

    <!-- Attached Document Download Box (If present) -->
    ${sub.document_path ? `
      <div class="doc-attached-card" style="margin-bottom:24px; padding:16px;">
        <div class="doc-name" style="font-size:1.05rem;">
          <span style="font-size:1.8rem;">📄</span>
          <div>
            <div>${sub.document_name || 'ملف دراسة الجدوى المرفق'}</div>
            <div style="font-size:0.78rem; color:var(--text-dim);">${Math.round((sub.document_size || 0) / 1024)} KB • مرفوع ومحفوظ في السيرفر</div>
          </div>
        </div>
        <a href="${sub.document_path}" target="_blank" download class="btn btn-primary">
          📥 تحميل وفتح المستند المرفق (Download Doc)
        </a>
      </div>
    ` : ''}

    <!-- Target Audience -->
    <div class="rubric-card" style="border-left:4px solid #38bdf8; margin-bottom:20px;">
      <h3 style="color:#38bdf8; margin-bottom:12px; font-size:1.2rem;">
        🎯 ${state.lang === 'ar' ? 'دراسة الجمهور المستهدف (Target Audience & Market Fit)' : 'Target Audience & Market Fit'}
      </h3>
      <div style="font-size:0.92rem; line-height:1.7;">
        <p><strong>${state.lang === 'ar' ? 'الشريحة المستهدفة الأساسية:' : 'Primary Segment:'}</strong> ${target.primary_segment || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>${state.lang === 'ar' ? 'نقاط الألم والمشكلات:' : 'Customer Pain Points:'}</strong> ${target.customer_pain_points || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>${state.lang === 'ar' ? 'القيمة المقترحة:' : 'Value Proposition:'}</strong> ${target.value_proposition || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>${state.lang === 'ar' ? 'حجم السوق (TAM/SAM/SOM):' : 'Market Size:'}</strong> ${target.tam_sam_som || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>${state.lang === 'ar' ? 'شخصية العميل المشتري (Persona):' : 'Buyer Persona:'}</strong> ${target.buyer_persona || 'N/A'}</p>
      </div>
    </div>

    <!-- SWOT Matrix -->
    <h3 style="margin-bottom:12px; font-size:1.2rem;">
      🧭 ${state.lang === 'ar' ? 'مصفوفة تحليل سوات الرباعي (SWOT Analysis)' : 'SWOT Analysis Matrix'}
    </h3>
    <div class="swot-grid">
      <div class="swot-quadrant swot-s">
        <h4 style="color:#34d399;">🟢 Strengths (نقاط القوة)</h4>
        <ul style="list-style:disc; margin-left:20px; font-size:0.88rem; margin-top:8px;">
          ${(swot.strengths || []).map(s => `<li>${s}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
      <div class="swot-quadrant swot-w">
        <h4 style="color:#fbbf24;">🟡 Weaknesses (نقاط الضعف)</h4>
        <ul style="list-style:disc; margin-left:20px; font-size:0.88rem; margin-top:8px;">
          ${(swot.weaknesses || []).map(w => `<li>${w}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
      <div class="swot-quadrant swot-o">
        <h4 style="color:#38bdf8;">🔵 Opportunities (الفرص)</h4>
        <ul style="list-style:disc; margin-left:20px; font-size:0.88rem; margin-top:8px;">
          ${(swot.opportunities || []).map(o => `<li>${o}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
      <div class="swot-quadrant swot-t">
        <h4 style="color:#f87171;">🔴 Threats (التهديدات)</h4>
        <ul style="list-style:disc; margin-left:20px; font-size:0.88rem; margin-top:8px;">
          ${(swot.threats || []).map(t => `<li>${t}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
    </div>

    <!-- Feasibility Study -->
    <h3 style="margin:24px 0 12px 0; font-size:1.2rem;">
      📈 ${state.lang === 'ar' ? 'دراسة الجدوى الشاملة (Dirasat Jadwa)' : 'Comprehensive Feasibility Study'}
    </h3>
    <div class="feasibility-grid">
      <div class="feasibility-box">
        <h4>🛠️ ${state.lang === 'ar' ? 'الجدوى الفنية والتكنولوجية' : 'Technical Feasibility'}</h4>
        <p style="font-size:0.88rem;"><strong>${state.lang === 'ar' ? 'مستوى الجاهزية:' : 'Readiness:'}</strong> ${feas.technical?.readiness_level || 'TRL 5'}</p>
        <p style="font-size:0.88rem; margin-top:6px;">${feas.technical?.summary || 'N/A'}</p>
        <p style="font-size:0.82rem; color:var(--text-dim); margin-top:6px;"><strong>${state.lang === 'ar' ? 'البنية التحتية:' : 'Infrastructure:'}</strong> ${feas.technical?.infrastructure_needs || 'N/A'}</p>
      </div>

      <div class="feasibility-box">
        <h4>🛍️ ${state.lang === 'ar' ? 'الجدوى التسويقية والتجارية' : 'Market Feasibility'}</h4>
        <p style="font-size:0.88rem;">${feas.market?.market_demand || 'N/A'}</p>
        <p style="font-size:0.88rem; margin-top:6px;"><strong>${state.lang === 'ar' ? 'الميزة التنافسية:' : 'Edge:'}</strong> ${feas.market?.competitive_advantage || 'N/A'}</p>
        <p style="font-size:0.82rem; color:var(--text-dim); margin-top:6px;"><strong>${state.lang === 'ar' ? 'قنوات التوزيع:' : 'Channels:'}</strong> ${feas.market?.marketing_channels || 'N/A'}</p>
      </div>

      <div class="feasibility-box" style="grid-column:1/-1;">
        <h4>💰 ${state.lang === 'ar' ? 'الجدوى المالية والمؤشرات الاستثمارية' : 'Financial Feasibility & Metrics'}</h4>
        <div class="calc-result-box" style="margin-top:8px;">
          <div class="calc-item"><div class="val">$${(fin.capex || 0).toLocaleString()}</div><div class="lbl">رأس المال التأسيسي (CAPEX)</div></div>
          <div class="calc-item"><div class="val">$${(fin.monthly_opex || 0).toLocaleString()}</div><div class="lbl">التشغيل الشهري (OPEX)</div></div>
          <div class="calc-item"><div class="val">${fin.break_even_months || 'N/A'} شهور</div><div class="lbl">نقطة التعادل (Break-even)</div></div>
        </div>
        <div class="calc-result-box" style="margin-top:10px; background:rgba(56, 189, 248, 0.1); border-color:rgba(56, 189, 248, 0.3);">
          <div class="calc-item"><div class="val" style="color:#38bdf8;">$${(fin.projected_year1_revenue || 0).toLocaleString()}</div><div class="lbl">إيرادات السنة الأولى</div></div>
          <div class="calc-item"><div class="val" style="color:#34d399;">$${(fin.projected_year1_net_profit || 0).toLocaleString()}</div><div class="lbl">صافي أرباح السنة الأولى</div></div>
          <div class="calc-item"><div class="val" style="color:#fbbf24;">${fin.roi_percentage || 0}%</div><div class="lbl">العائد على الاستثمار (ROI)</div></div>
        </div>
        ${fin.payment_system ? `
          <div style="margin-top:12px; padding:10px 14px; background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.3); border-radius:8px; font-size:0.88rem;">
            <strong>💳 ${state.lang === 'ar' ? 'نظام المدفوعات والفوترة:' : 'Payment & Billing System:'}</strong> ${fin.payment_system}
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Jury Evaluations -->
    ${evals.length > 0 ? `
      <h3 style="margin:24px 0 12px 0; font-size:1.2rem;">
        ⚖️ ${state.lang === 'ar' ? 'تقييمات وملاحظات لجنة التحكيم (Lajna Reviews)' : 'Lajna Jury Evaluations'}
      </h3>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${evals.map(ev => `
          <div style="background:rgba(15,23,42,0.8); border:1px solid var(--border); border-radius:10px; padding:16px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <strong>${ev.judge_name} <span style="font-size:0.8rem; color:var(--text-dim);">(${ev.judge_org || 'Lajna'})</span></strong>
              <span class="sub-score-badge">⭐ ${ev.total_score} / 100</span>
            </div>
            <p style="font-size:0.88rem; color:var(--text-muted);">${ev.feedback}</p>
            ${ev.strengths_observed ? `<p style="font-size:0.82rem; color:#34d399; margin-top:6px;">✓ <strong>نقاط القوة:</strong> ${ev.strengths_observed}</p>` : ''}
            ${ev.recommendations ? `<p style="font-size:0.82rem; color:#fbbf24; margin-top:4px;">💡 <strong>توصيات:</strong> ${ev.recommendations}</p>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

// Lajna Evaluation Modal Content
function renderEvaluationModalContent(sub) {
  const container = document.getElementById('eval-modal-body');
  if (!container) return;

  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <span style="font-size:0.75rem; color:#a78bfa; font-weight:700;">🎯 ${sub.challenge_title}</span>
      <h3 style="font-size:1.4rem; margin-top:4px;">${sub.title}</h3>
      <p style="color:var(--text-muted); font-size:0.9rem;">${sub.pitch}</p>
      
      ${sub.document_path ? `
        <div class="doc-attached-card" style="margin-top:12px;">
          <div class="doc-name">
            <span>📄</span>
            <span>المستند المرفق: ${sub.document_name || 'ملف الدراسة'}</span>
          </div>
          <a href="${sub.document_path}" target="_blank" download class="btn btn-primary btn-sm">
            📥 تحميل / معاينة المستند
          </a>
        </div>
      ` : ''}
    </div>

    <div class="total-score-display">
      <div>
        <div style="font-size:0.8rem; text-transform:uppercase; color:#c084fc; font-weight:700;">المجموع الكلي لتقييم اللجنة</div>
        <div style="font-size:0.85rem; color:var(--text-muted);">سلم درجات التحكيم المعتمد (0-100)</div>
      </div>
      <div class="total-score-number" id="rubric-total-score">85<span style="font-size:1.2rem; color:var(--text-dim);">/100</span></div>
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">1. وضوح المشكلة والجمهور المستهدف (Target Audience Fit)</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-aud">18 / 20</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-audience" min="0" max="20" value="18" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">2. عمق وواقعية تحليل سوات (SWOT Analysis Rigor)</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-swot">17 / 20</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-swot" min="0" max="20" value="17" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">3. الجدوى الفنية والتكنولوجية والمستند (Technical Feasibility & Doc)</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-tech">22 / 25</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-tech" min="0" max="25" value="22" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">4. الجدوى المالية ونقطة التعادل (Financial Viability & ROI)</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-fin">20 / 25</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-financial" min="0" max="25" value="20" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">5. الابتكار وجودة العرض والمستند (Innovation & Pitch)</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-inn">8 / 10</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-innovation" min="0" max="10" value="8" oninput="updateRubricTotal()">
    </div>

    <div class="form-group" style="margin-top:20px;">
      <label class="form-label">📝 تقرير وملاحظات عضو لجنة التحكيم</label>
      <textarea class="form-control" id="eval-feedback" placeholder="اكتب تقييمك للمشروع ولدراسة الجدوى والمستند..."></textarea>
    </div>

    <div class="form-group">
      <label class="form-label">💡 أهم التوصيات لتطوير المشروع</label>
      <input type="text" class="form-control" id="eval-recommendations" placeholder="مثال: تعزيز الجانب التسويقي...">
    </div>
  `;

  updateRubricTotal();
}

function updateRubricTotal() {
  const aud = parseInt(document.getElementById('rubric-audience')?.value, 10) || 0;
  const swot = parseInt(document.getElementById('rubric-swot')?.value, 10) || 0;
  const tech = parseInt(document.getElementById('rubric-tech')?.value, 10) || 0;
  const fin = parseInt(document.getElementById('rubric-financial')?.value, 10) || 0;
  const inn = parseInt(document.getElementById('rubric-innovation')?.value, 10) || 0;

  const total = aud + swot + tech + fin + inn;

  const elAud = document.getElementById('val-aud');
  const elSwot = document.getElementById('val-swot');
  const elTech = document.getElementById('val-tech');
  const elFin = document.getElementById('val-fin');
  const elInn = document.getElementById('val-inn');
  const elTotal = document.getElementById('rubric-total-score');

  if (elAud) elAud.textContent = `${aud} / 20`;
  if (elSwot) elSwot.textContent = `${swot} / 20`;
  if (elTech) elTech.textContent = `${tech} / 25`;
  if (elFin) elFin.textContent = `${fin} / 25`;
  if (elInn) elInn.textContent = `${inn} / 10`;
  if (elTotal) elTotal.innerHTML = `${total}<span style="font-size:1.2rem; color:var(--text-dim);">/100</span>`;
}

async function handleLoginSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  const email = emailInput ? emailInput.value.trim() : '';
  const pass = passInput ? passInput.value : '';

  if (!email || !pass) {
    showToast(state.lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Email and password are required', 'error');
    return false;
  }

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });
    state.token = data.token;
    state.currentUser = data.user;
    state.isLajnaOrAdmin = data.user.role === 'lajna' || data.user.role === 'admin';
    localStorage.setItem('mlic_token', data.token);
    localStorage.setItem('agrivers_token', data.token);
    showToast(state.lang === 'ar' ? `مرحباً بك، ${data.user.name}!` : `Welcome back, ${data.user.name}!`, 'success');
    closeModal('auth-modal');
    await loadInitialData();
    renderApp();
  } catch (err) {
    console.error('Login error:', err);
  }
  return false;
}

async function handleRegisterSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const name = document.getElementById('reg-name')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const pass = document.getElementById('reg-password')?.value;
  const role = document.getElementById('reg-role')?.value || 'participant';
  const org = document.getElementById('reg-org')?.value.trim() || '';

  if (!name || !email || !pass) {
    showToast(state.lang === 'ar' ? 'يرجى تعبئة الحقول الإلزامية' : 'All required fields must be filled', 'error');
    return false;
  }

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass, role, organization: org })
    });
    state.token = data.token;
    state.currentUser = data.user;
    state.isLajnaOrAdmin = data.user.role === 'lajna' || data.user.role === 'admin';
    localStorage.setItem('mlic_token', data.token);
    localStorage.setItem('agrivers_token', data.token);
    showToast(data.message || 'Account created successfully!', 'success');
    closeModal('auth-modal');
    await loadInitialData();
    renderApp();
  } catch (err) {
    console.error('Register error:', err);
  }
  return false;
}

// Setup Event Listeners
function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      navigateTo(view);
    });
  });

  const loginForm = document.getElementById('modal-login-form') || document.getElementById('form-login');
  loginForm?.addEventListener('submit', handleLoginSubmit);

  const regForm = document.getElementById('modal-register-form') || document.getElementById('form-register');
  regForm?.addEventListener('submit', handleRegisterSubmit);
}
