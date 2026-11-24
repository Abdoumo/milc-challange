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
  activeCompetitionFilter: 'all',
  wizardCompetitionType: 'marketing_strategy',
  lajnaCompetitionFilter: 'all',
  leaderboardCompetitionTab: 'marketing_strategy',
  postAuthRedirectToSubmit: false,

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
  localStorage.removeItem('agrivers_lang');
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'ar');
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

// Shared helper to parse & deduplicate group members
function parseGroupMembersList(rawMembers, leaderName = '') {
  const list = [];
  if (Array.isArray(rawMembers)) {
    list.push(...rawMembers);
  } else if (typeof rawMembers === 'string') {
    list.push(...rawMembers.split(/[,،;؛\n]+/));
  }

  const seen = new Set();
  const result = [];
  const addUnique = (val) => {
    const clean = String(val || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  };

  if (leaderName) addUnique(leaderName);
  for (const item of list) addUnique(item);

  return {
    members: result,
    formatted: result.join('، '),
    count: result.length
  };
}

// Auth Management
async function logout() {
  state.token = null;
  state.currentUser = null;
  state.isLajnaOrAdmin = false;
  state.postAuthRedirectToSubmit = false;
  localStorage.removeItem('agrivers_token');
  localStorage.removeItem('mlic_token');
  const wizTeamName = document.getElementById('wiz-team-name');
  const wizTeamMembers = document.getElementById('wiz-team-members');
  if (wizTeamName) wizTeamName.value = '';
  if (wizTeamMembers) wizTeamMembers.value = '';
  showToast('تم تسجيل الخروج', 'info');
  await loadInitialData();
  renderApp();
}

function navigateTo(view) {
  state.activeView = view;
  toggleMobileMenu(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderApp();
}

function setWizardStep(step) {
  if (step < 1 || step > 5) return;
  if (state.wizardStep === 1 && step > 1) {
    if (!state.currentUser || state.currentUser.role === 'lajna') {
      showToast('🔒 يجب تسجيل الدخول بحساب مجموعة (2+ أعضاء) للمتابعة', 'error');
      return;
    }
    const teamName = document.getElementById('wiz-team-name')?.value.trim();
    const teamMembers = document.getElementById('wiz-team-members')?.value.trim();
    const parsed = parseGroupMembersList(teamMembers);
    if (!teamName || parsed.count < 2) {
      showToast('⚠️ المشاركة للمجموعات فقط: أدخل اسم المجموعة وأسماء عضوين (2) مختلفين على الأقل مفصولين بفاصلة', 'error');
      updateWizardGroupStatus();
      return;
    }
  }
  state.wizardStep = step;
  renderSubmissionWizard();
  const wizCard = document.querySelector('#view-submit .wizard-card');
  if (wizCard) {
    const rect = wizCard.getBoundingClientRect();
    if (rect.top < 70 || rect.top > window.innerHeight * 0.6) {
      wizCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function getCompetitionMeta(type) {
  const isTheme = type === 'theme_idea';
  if (isTheme) {
    return {
      type: 'theme_idea',
      cssClass: 'comp-badge-theme',
      shortLabel: '🌿 المسابقة 2 • أفضل فكرة في المحور',
      title: 'المسابقة 2: أفضل فكرة مشروع ضمن محور',
      desc: 'تطرح الإدارة محوراً عاماً (مثل: الطبيعة...)، ويتنافس المشاركون على ابتكار أفضل فكرة مشروع أصلية تخدم هذا المحور.'
    };
  }
  return {
    type: 'marketing_strategy',
    cssClass: 'comp-badge-marketing',
    shortLabel: '🎯 المسابقة 1 • استراتيجية تسويق',
    title: 'المسابقة 1: أفضل استراتيجية تسويق ودراسة جدوى',
    desc: 'تطرح الإدارة فكرة مشروع متكاملة، ويتنافس المشاركون على تقديم أفضل استراتيجية تسويق ودراسة جدوى لإنجاحها.'
  };
}

function setCompetitionFilter(type) {
  state.activeCompetitionFilter = type;
  renderChallengesView();
}

function selectWizardCompetition(type) {
  state.wizardCompetitionType = type === 'theme_idea' ? 'theme_idea' : 'marketing_strategy';
  const current = state.challenges.find(c => c.id === state.wizardChallengeId);
  if (current && current.competition_type !== state.wizardCompetitionType) {
    state.wizardChallengeId = null;
  }
  renderSubmissionWizard();
}

function setLajnaFilter(type) {
  state.lajnaCompetitionFilter = type;
  renderLajnaView();
}

function setLeaderboardCompetition(type) {
  state.leaderboardCompetitionTab = type === 'theme_idea' ? 'theme_idea' : 'marketing_strategy';
  renderLeaderboardView();
}

function selectChallengeForSubmission(challengeId) {
  const ch = state.challenges.find(c => c.id === challengeId);
  if (ch && ch.is_open === 0) {
    showToast('⏳ محور المسابقة الثانية بانتظار الإعلان الرسمي من الإدارة قريباً.', 'info');
    return;
  }
  state.wizardCompetitionType = ch?.competition_type || 'marketing_strategy';
  state.wizardChallengeId = challengeId;
  state.wizardStep = 1;

  if (!state.currentUser) {
    state.postAuthRedirectToSubmit = true;
    navigateTo('submit');
    openAuthModal('register');
    showToast('🔒 المشاركة مخصصة للمجموعات المسجلة فقط (2+ أعضاء). سجّل مجموعتك أو سجّل الدخول للمتابعة!', 'info');
    return;
  }

  if (state.currentUser.role === 'lajna') {
    navigateTo('submit');
    showToast('⚖️ حسابات لجنة التحكيم مخصصة للتقييم فقط. للمشاركة يُرجى التسجيل بحساب مجموعة.', 'info');
    return;
  }

  navigateTo('submit');
  showToast(
    state.wizardCompetitionType === 'theme_idea'
      ? 'تم اختيار المحور! اكتب فكرتك المبتكرة وأكمل الدراسة أدناه.'
      : 'تم اختيار الفكرة! قدّم استراتيجية التسويق ودراسة الجدوى أدناه.',
    'success'
  );
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
  reader.onload = function (e) {
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
    state.postAuthRedirectToSubmit = true;
    openAuthModal('login');
    showToast('🔒 يرجى تسجيل الدخول بحساب مجموعة لتقديم الدراسة إلى قاعدة البيانات', 'info');
    return;
  }

  if (state.currentUser.role === 'lajna') {
    showToast('⚖️ حسابات لجنة التحكيم مخصصة للتقييم فقط ولا يمكنها المشاركة كمتسابق.', 'error');
    return;
  }

  const challengeId = document.getElementById('wizard-challenge-select')?.value || state.wizardChallengeId;
  const title = document.getElementById('wiz-title')?.value.trim();
  const pitch = document.getElementById('wiz-pitch')?.value.trim();
  const teamName = (document.getElementById('wiz-team-name')?.value || state.currentUser.group_name || '').trim();
  const teamMembersRaw = (document.getElementById('wiz-team-members')?.value || state.currentUser.group_members || '').trim();
  const parsedGroup = parseGroupMembersList(teamMembersRaw);

  if (!challengeId) {
    showToast('يرجى اختيار الفكرة أو المحور من القائمة', 'error');
    setWizardStep(1);
    return;
  }
  if (!title || !pitch) {
    showToast('يرجى إدخال عنوان المشروع والملخص التنفيذي', 'error');
    setWizardStep(1);
    return;
  }
  if (!teamName || parsedGroup.count < 2) {
    showToast('⚠️ المشاركة مخصصة للمجموعات فقط: أدخل اسم المجموعة وأسماء عضوين (2) مختلفين على الأقل.', 'error');
    setWizardStep(1);
    return;
  }

  let docPath = '';
  let docName = '';
  let docSize = 0;

  // Upload document if attached
  if (state.selectedDoc) {
    try {
      showToast('جاري رفع المستند إلى قاعدة البيانات...', 'info');
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
      showToast('فشل رفع المستند المرفق', 'error');
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
    team_name: teamName,
    team_members: parsedGroup.formatted,
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

    showToast('🔒 تم إرسال وحفظ دراسة المجموعة في قاعدة البيانات بنجاح لتحكيم اللجنة!', 'success');
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

// Add or Edit Challenge Idea or Competition 2 Theme
function updateIdeaModalLabels() {
  const type = document.getElementById('modal-idea-type')?.value || 'marketing_strategy';
  const isTheme = type === 'theme_idea';

  const lblTitle = document.getElementById('modal-idea-label-title');
  const lblCat = document.getElementById('modal-idea-label-category');
  const lblSum = document.getElementById('modal-idea-label-summary');
  const lblProb = document.getElementById('modal-idea-label-problem');
  const lblOut = document.getElementById('modal-idea-label-outcomes');

  if (lblTitle) lblTitle.textContent = isTheme
    ? 'اسم المحور الرسمي (Theme) *'
    : 'عنوان فكرة المشروع / التحدي *';
  if (lblCat) lblCat.textContent = isTheme
    ? 'مجال المحور أو وسومه'
    : 'التصنيف أو المجال';
  if (lblSum) lblSum.textContent = isTheme
    ? 'نبذة عن محور المسابقة الثانية'
    : 'نبذة ملخصة عن الفكرة';
  if (lblProb) lblProb.textContent = isTheme
    ? 'وصف المحور ومتطلبات الأفكار المقبولة *'
    : 'المشكلة المطروحة والمطلوب حلها *';
  if (lblOut) lblOut.textContent = isTheme
    ? 'معايير التقييم والمستندات المطلوبة'
    : 'مخرجات استراتيجية التسويق والجدوى المطلوبة';
}

async function saveChallengeIdea() {
  const id = document.getElementById('modal-idea-id')?.value;
  const competition_type = document.getElementById('modal-idea-type')?.value || 'marketing_strategy';
  const is_open = parseInt(document.getElementById('modal-idea-is-open')?.value ?? '1', 10);
  const title = document.getElementById('modal-idea-title')?.value.trim();
  const category = document.getElementById('modal-idea-category')?.value.trim();
  const summary = document.getElementById('modal-idea-summary')?.value.trim();
  const problem = document.getElementById('modal-idea-problem')?.value.trim();
  const outcomes = document.getElementById('modal-idea-outcomes')?.value.trim();
  const reward = document.getElementById('modal-idea-reward')?.value.trim();

  if (!title || !problem) {
    showToast('العنوان والوصف مطلوبان', 'error');
    return;
  }

  const payload = {
    competition_type,
    is_open,
    title,
    category: category || (competition_type === 'theme_idea' ? 'Theme Challenge' : 'Marketing Strategy'),
    summary,
    problem_statement: problem,
    expected_outcomes: outcomes,
    reward_or_grant: reward
  };

  try {
    if (id) {
      await api(`/api/challenges/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast(competition_type === 'theme_idea' ? '✓ تم تحديث محور المسابقة الثانية بنجاح!' : '✓ تم تحديث فكرة المسابقة الأولى!', 'success');
    } else {
      await api('/api/challenges', { method: 'POST', body: JSON.stringify(payload) });
      showToast(competition_type === 'theme_idea' ? '✓ تم إضافة محور جديد للمسابقة الثانية!' : '✓ تم إضافة فكرة جديدة للمسابقة الأولى!', 'success');
    }
    closeModal('idea-modal');
    await loadInitialData();
    renderApp();
  } catch (e) {
    console.error(e);
  }
}

function openAddIdeaModal(defaultType = 'marketing_strategy') {
  const compType = defaultType === 'theme_idea' ? 'theme_idea' : 'marketing_strategy';
  document.getElementById('modal-idea-id').value = '';
  document.getElementById('modal-idea-type').value = compType;
  document.getElementById('modal-idea-is-open').value = '1';
  document.getElementById('modal-idea-title').value = '';
  document.getElementById('modal-idea-category').value = '';
  document.getElementById('modal-idea-summary').value = '';
  document.getElementById('modal-idea-problem').value = '';
  document.getElementById('modal-idea-outcomes').value = '';
  document.getElementById('modal-idea-reward').value = '';
  document.getElementById('modal-idea-heading').textContent = compType === 'theme_idea'
    ? '🌿 إضافة محور جديد (المسابقة الثانية)'
    : '🎯 إضافة فكرة جديدة (المسابقة الأولى)';
  updateIdeaModalLabels();
  openModal('idea-modal');
}

function openEditIdeaModal(challengeId) {
  const ch = state.challenges.find(c => c.id === challengeId);
  if (!ch) return;

  const compType = ch.competition_type === 'theme_idea' ? 'theme_idea' : 'marketing_strategy';
  document.getElementById('modal-idea-id').value = ch.id;
  document.getElementById('modal-idea-type').value = compType;
  document.getElementById('modal-idea-is-open').value = ch.is_open === 0 ? '0' : '1';
  document.getElementById('modal-idea-title').value = ch.title;
  document.getElementById('modal-idea-category').value = ch.category;
  document.getElementById('modal-idea-summary').value = ch.summary;
  document.getElementById('modal-idea-problem').value = ch.problem_statement;
  document.getElementById('modal-idea-outcomes').value = ch.expected_outcomes;
  document.getElementById('modal-idea-reward').value = ch.reward_or_grant;
  document.getElementById('modal-idea-heading').textContent = compType === 'theme_idea'
    ? '🌿 تعديل / تعيين محور المسابقة الثانية'
    : '✏️ تعديل فكرة المسابقة الأولى';
  updateIdeaModalLabels();
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

function toggleRegisterRoleUI() {
  const role = document.getElementById('reg-role')?.value || 'participant';
  const groupFields = document.getElementById('reg-group-fields');
  const orgField = document.getElementById('reg-org-field');
  const nameLabel = document.getElementById('reg-name-label');
  const groupNameInput = document.getElementById('reg-group-name');
  const member2Input = document.getElementById('reg-member-2');

  const isGroup = role === 'participant';
  if (groupFields) groupFields.style.display = isGroup ? 'block' : 'none';
  if (orgField) orgField.style.display = isGroup ? 'none' : 'block';
  if (nameLabel) {
    nameLabel.textContent = isGroup ? 'اسم قائد المجموعة (العضو الأول) *' : 'الاسم الكامل *';
  }
  if (groupNameInput) groupNameInput.required = isGroup;
  if (member2Input) member2Input.required = isGroup;
  if (isGroup) updateRegMembersCount();
}

function addRegisterMemberInput() {
  const list = document.getElementById('reg-extra-members-list');
  if (!list) return;
  const count = list.querySelectorAll('.reg-member-row').length + 2;
  const row = document.createElement('div');
  row.className = 'reg-member-row';
  row.innerHTML = `
    <input type="text" class="form-control reg-member-input" placeholder="اسم العضو رقم ${count}" oninput="updateRegMembersCount()">
    <button type="button" class="btn-remove-member" onclick="removeRegisterMemberInput(this)" title="حذف العضو">×</button>
  `;
  list.appendChild(row);
  updateRegMembersCount();
}

function removeRegisterMemberInput(btn) {
  const row = btn.closest('.reg-member-row');
  if (row) row.remove();
  updateRegMembersCount();
}

function getRegisterExtraMembers() {
  return Array.from(document.querySelectorAll('#reg-extra-members-list .reg-member-input'))
    .map(el => el.value.trim())
    .filter(Boolean);
}

function updateRegMembersCount() {
  const badge = document.getElementById('reg-members-count-badge');
  if (!badge) return;
  const leaderName = document.getElementById('reg-name')?.value.trim() || '';
  const parsed = parseGroupMembersList(getRegisterExtraMembers(), leaderName);
  const valid = parsed.count >= 2;
  badge.classList.toggle('valid', valid);
  badge.textContent = valid
    ? `✓ المجموعة مكتملة (${parsed.count} أعضاء)`
    : `👥 الأعضاء: ${parsed.count} / 2 كحد أدنى`;
}

function resetRegisterGroupForm() {
  const form = document.getElementById('modal-register-form');
  if (form) form.reset();
  const list = document.getElementById('reg-extra-members-list');
  if (list) {
    list.innerHTML = `
      <div class="reg-member-row">
        <input type="text" class="form-control reg-member-input" id="reg-member-2" required placeholder="اسم العضو الثاني (إلزامي) *" oninput="updateRegMembersCount()">
      </div>
    `;
  }
  toggleRegisterRoleUI();
}

function renderProfileModalContent() {
  const container = document.getElementById('modal-profile-view');
  if (!container || !state.currentUser) return;
  const u = state.currentUser;
  const roleLabel = u.role === 'admin' ? 'منظم المسابقة (Admin)' : u.role === 'lajna' ? 'عضو لجنة التحكيم (Lajna)' : 'مجموعة مشاركة (Group)';
  const groupName = u.group_name || u.organization || '';
  const parsedMembers = parseGroupMembersList(u.group_members || '');

  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-row">
        <div class="profile-row-label">نوع الحساب</div>
        <div style="font-weight:700;">${roleLabel}</div>
      </div>
      <div class="profile-row">
        <div class="profile-row-label">${u.role === 'participant' ? 'قائد المجموعة والبريد' : 'الاسم والبريد الإلكتروني'}</div>
        <div style="font-weight:700;">${u.name}</div>
        <div style="font-size:0.84rem; color:var(--text-muted);">${u.email}</div>
      </div>
      ${groupName ? `
        <div class="profile-row">
          <div class="profile-row-label">${u.role === 'participant' ? 'اسم المجموعة المسجلة' : 'الجهة / المؤسسة'}</div>
          <div style="font-weight:700; color:#34d399;">👥 ${groupName}</div>
          ${parsedMembers.count > 0 ? `
            <div class="profile-members-chips">
              ${parsedMembers.members.map(m => `<span class="profile-member-chip">👤 ${m}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;">
        ${u.role !== 'lajna' ? `
          <button type="button" class="btn btn-primary" style="flex:1;" onclick="closeModal('auth-modal'); navigateTo('submit');">
            🚀 تقديم دراسة باسم المجموعة
          </button>
        ` : ''}
        <button type="button" class="btn btn-secondary" onclick="logout(); closeModal('auth-modal');">
          تسجيل الخروج
        </button>
      </div>
    </div>
  `;
}

function openAuthModal(mode = 'login') {
  const loginForm = document.getElementById('modal-login-form');
  const regForm = document.getElementById('modal-register-form');
  const profileView = document.getElementById('modal-profile-view');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabReg = document.getElementById('auth-tab-reg');
  const tabProfile = document.getElementById('auth-tab-profile');

  if (tabProfile) {
    tabProfile.style.display = state.currentUser ? 'inline-flex' : 'none';
  }

  const effectiveMode = mode === 'profile' && !state.currentUser ? 'login' : mode;

  if (loginForm) loginForm.style.display = effectiveMode === 'login' ? 'block' : 'none';
  if (regForm) regForm.style.display = effectiveMode === 'register' ? 'block' : 'none';
  if (profileView) profileView.style.display = effectiveMode === 'profile' ? 'block' : 'none';

  tabLogin?.classList.toggle('active', effectiveMode === 'login');
  tabReg?.classList.toggle('active', effectiveMode === 'register');
  tabProfile?.classList.toggle('active', effectiveMode === 'profile');

  if (effectiveMode === 'register') {
    toggleRegisterRoleUI();
  } else if (effectiveMode === 'profile') {
    renderProfileModalContent();
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

  ['challenges', 'submit', 'my-submission', 'lajna', 'admin-lajna', 'leaderboard'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = state.activeView === v ? 'block' : 'none';
  });

  if (state.activeView === 'challenges') renderChallengesView();
  if (state.activeView === 'submit') renderSubmissionWizard();
  if (state.activeView === 'my-submission') renderMySubmissionView();
  if (state.activeView === 'lajna') renderLajnaView();
  if (state.activeView === 'admin-lajna') renderAdminLajnaView();
  if (state.activeView === 'leaderboard') renderLeaderboardView();
}

function renderNavbar() {
  const userContainer = document.getElementById('nav-user-container');
  if (!userContainer) return;

  // Ensure Arabic Nav Labels
  const navLabels = {
    'challenges': 'المسابقتان',
    'submit': 'تقديم دراسة',
    'my-sub': 'مشاركاتي',
    'lajna': 'لجنة التحكيم',
    'leaderboard': 'الفائزون',
    'admin-approvals': 'اعتماد المحكمين'
  };

  for (const [key, text] of Object.entries(navLabels)) {
    const el = document.getElementById(`nav-label-${key}`);
    if (el) el.textContent = text;
  }

  // Brand Tagline
  const taglineEl = document.getElementById('brand-tagline-text');
  if (taglineEl) {
    taglineEl.textContent = 'منصة دراسات الجدوى والتحكيم الرسمي';
  }

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

  const mobileUserDrawer = document.getElementById('mobile-drawer-user');

  if (state.currentUser) {
    const displayTitle = state.currentUser.role === 'participant' && state.currentUser.group_name
      ? state.currentUser.group_name
      : state.currentUser.name;
    const initial = (displayTitle || 'U').charAt(0).toUpperCase();
    const role = state.currentUser.role;
    const roleBg = role === 'admin' ? 'role-admin-bg' : role === 'lajna' ? 'role-lajna-bg' : 'role-participant-bg';
    const roleLabel = role === 'admin' ? 'المنظم' : role === 'lajna' ? 'محكّم' : 'مجموعة';
    const shortDisplay = displayTitle.split(' ')[0];
    userContainer.innerHTML = `
      <div class="user-pill" onclick="openAuthModal('profile')" title="${displayTitle} (${roleLabel})">
        <div class="user-avatar-circle ${roleBg}">${initial}</div>
        <div class="user-pill-info">
          <span class="user-pill-name">${shortDisplay}</span>
          <span class="role-badge role-${role}">${roleLabel}</span>
        </div>
      </div>
      <button class="nav-logout-btn" onclick="logout()" title="تسجيل الخروج">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/></svg>
      </button>
    `;
    if (mobileUserDrawer) {
      mobileUserDrawer.innerHTML = `
        <div class="mobile-user-card">
          <div class="mobile-user-main" onclick="openAuthModal('profile'); toggleMobileMenu(false);">
            <div class="user-avatar-circle ${roleBg}">${initial}</div>
            <div class="mobile-user-text">
              <span class="mobile-user-name">${displayTitle}</span>
              <span class="role-badge role-${role}">${roleLabel}</span>
            </div>
          </div>
          <button type="button" class="mobile-logout-btn" onclick="logout(); toggleMobileMenu(false);">
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/></svg>
            <span>خروج</span>
          </button>
        </div>
      `;
    }
  } else {
    userContainer.innerHTML = `
      <button class="nav-btn-ghost" onclick="openAuthModal('login')">
        تسجيل الدخول
      </button>
      <button class="nav-btn-glow" onclick="openAuthModal('register')">
        <span>تسجيل مجموعة</span>
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>
    `;
    if (mobileUserDrawer) {
      mobileUserDrawer.innerHTML = `
        <div class="mobile-auth-actions">
          <button type="button" class="btn btn-secondary btn-sm mobile-auth-btn" onclick="openAuthModal('login'); toggleMobileMenu(false);">
            تسجيل الدخول
          </button>
          <button type="button" class="btn btn-primary btn-sm mobile-auth-btn" onclick="openAuthModal('register'); toggleMobileMenu(false);">
            تسجيل مجموعة جديدة
          </button>
        </div>
      `;
    }
  }
}

// 1. Competitions & Challenges View (Competition 1 Ideas + Competition 2 Themes)
function renderChallengesView() {
  const grid = document.getElementById('challenges-grid-content');
  const overviewGrid = document.getElementById('competitions-overview-grid');
  const filterBar = document.getElementById('competition-filter-bar');
  const adminBar = document.getElementById('admin-ideas-bar');

  const comp1List = state.challenges.filter(c => (c.competition_type || 'marketing_strategy') === 'marketing_strategy');
  const comp2List = state.challenges.filter(c => c.competition_type === 'theme_idea');
  const comp2OpenCount = comp2List.filter(c => c.is_open !== 0).length;

  const heroIdeasEl = document.getElementById('hero-ideas-count');
  const heroThemesEl = document.getElementById('hero-themes-count');
  if (heroIdeasEl) heroIdeasEl.textContent = `🎯 ${comp1List.length} أفكار`;
  if (heroThemesEl) heroThemesEl.textContent = comp2OpenCount > 0 ? `🌿 ${comp2OpenCount} محور متاح` : '🌿 قريباً';

  if (!grid) return;

  if (adminBar) {
    adminBar.style.display = (state.currentUser?.role === 'admin' || state.currentUser?.role === 'lajna') ? 'flex' : 'none';
  }

  if (overviewGrid) {
    overviewGrid.innerHTML = `
      <div class="comp-overview-card comp-overview-1 ${state.activeCompetitionFilter === 'marketing_strategy' ? 'selected' : ''}" onclick="setCompetitionFilter('${state.activeCompetitionFilter === 'marketing_strategy' ? 'all' : 'marketing_strategy'}')">
        <div class="comp-overview-top">
          <span class="comp-pill comp-pill-1">🎯 المسابقة الأولى</span>
          <span class="comp-count-tag">${comp1List.length} أفكار مطروحة</span>
        </div>
        <h3>أفضل استراتيجية تسويق ودراسة جدوى</h3>
        <p>نطرح لكم فكرة المشروع، وتتنافسون على تقديم أقوى خطة تسويق ونموذج ربحي ودراسة جدوى لتحويلها لنجاح حقيقي.</p>
      </div>

      <div class="comp-overview-card comp-overview-2 ${state.activeCompetitionFilter === 'theme_idea' ? 'selected' : ''}" onclick="setCompetitionFilter('${state.activeCompetitionFilter === 'theme_idea' ? 'all' : 'theme_idea'}')">
        <div class="comp-overview-top">
          <span class="comp-pill comp-pill-2">🌿 المسابقة الثانية</span>
          <span class="comp-count-tag ${comp2OpenCount === 0 ? 'tag-tba' : ''}">
            ${comp2OpenCount > 0 ? `${comp2OpenCount} محور مفتوح` : '⏳ المحور قريباً'}
          </span>
        </div>
        <h3>أفضل فكرة مشروع ضمن محور الإدارة</h3>
        <p>تحدّد الإدارة محوراً عاماً (مثل: الطبيعة والاستدامة...)، وتبتكرون أفضل فكرة مشروع تخدم هذا المحور.</p>
      </div>
    `;
  }

  if (filterBar) {
    filterBar.innerHTML = `
      <button type="button" class="filter-chip ${state.activeCompetitionFilter === 'all' ? 'active' : ''}" onclick="setCompetitionFilter('all')">
        عرض المسابقتين (${state.challenges.length})
      </button>
      <button type="button" class="filter-chip ${state.activeCompetitionFilter === 'marketing_strategy' ? 'active' : ''}" onclick="setCompetitionFilter('marketing_strategy')">
        🎯 المسابقة 1: استراتيجية التسويق (${comp1List.length})
      </button>
      <button type="button" class="filter-chip ${state.activeCompetitionFilter === 'theme_idea' ? 'active' : ''}" onclick="setCompetitionFilter('theme_idea')">
        🌿 المسابقة 2: أفكار المحاور (${comp2List.length})
      </button>
    `;
  }

  const visibleChallenges = state.challenges.filter(c => {
    const cType = c.competition_type || 'marketing_strategy';
    if (state.activeCompetitionFilter === 'all') return true;
    return cType === state.activeCompetitionFilter;
  });

  grid.innerHTML = visibleChallenges.map((c) => {
    const isTheme = c.competition_type === 'theme_idea';
    const isOpen = c.is_open !== 0;
    const isAdminOrLajna = state.currentUser?.role === 'admin' || state.currentUser?.role === 'lajna';
    const meta = getCompetitionMeta(c.competition_type);

    return `
    <div class="challenge-card ${isTheme ? 'challenge-card-theme' : ''} ${!isOpen ? 'challenge-card-tba' : ''}">
      <div>
        <div class="challenge-card-top">
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            <span class="comp-type-badge ${meta.cssClass}">${meta.shortLabel}</span>
            <span class="status-pill ${isOpen ? 'status-open' : 'status-tba'}">
              ${isOpen ? '🟢 مفتوح للتقديم' : '⏳ سيتم تحديد المحور لاحقاً'}
            </span>
          </div>
          ${isAdminOrLajna ? `
            <button class="btn btn-outline btn-sm" onclick="openEditIdeaModal('${c.id}')" title="تعديل">
              ✏️ ${!isOpen && isTheme ? 'تعيين وفتح المحور' : 'تعديل'}
            </button>
          ` : ''}
        </div>

        <div class="challenge-badge" style="margin-bottom:10px;">
          <span>${isTheme ? '🌿' : '💡'} ${c.category}</span>
        </div>

        <h3 class="challenge-title">${c.title}</h3>
        <p class="challenge-summary">${c.summary}</p>

        <div class="challenge-details-box">
          <strong>${isTheme ? '🌿 تفاصيل المحور والمطلوب من الأفكار:' : '⚠️ المشكلة المطروحة والمطلوب تسويقه:'}</strong>
          <div style="white-space:pre-line;">${c.problem_statement}</div>
        </div>

        <div class="challenge-details-box">
          <strong>🎯 المخرجات والمستند المطلوب:</strong>
          <div style="white-space:pre-line;">${c.expected_outcomes}</div>
        </div>
      </div>

      <div class="challenge-footer">
        <span class="privacy-badge">
          🔒 للمجموعات المسجلة (2+ أعضاء) • سري للجنة
        </span>
        ${isOpen ? `
          <button class="btn ${isTheme ? 'btn-lajna' : 'btn-primary'} btn-sm" onclick="selectChallengeForSubmission('${c.id}')">
            ${!state.currentUser
          ? '🔑 سجّل مجموعتك للمشاركة'
          : (isTheme ? '🚀 قدّم فكرتك في هذا المحور' : '🚀 قدّم استراتيجية التسويق والجدوى')}
          </button>
        ` : `
          <button class="btn btn-secondary btn-sm" disabled style="opacity:0.7; cursor:not-allowed;">
            ⏳ بانتظار تحديد المحور من الإدارة
          </button>
        `}
      </div>
    </div>
  `;
  }).join('');
}

function updateWizardGroupStatus() {
  const banner = document.getElementById('wizard-group-banner');
  if (!banner) return;
  const teamName = document.getElementById('wiz-team-name')?.value.trim() || '';
  const teamMembersRaw = document.getElementById('wiz-team-members')?.value.trim() || '';
  const parsed = parseGroupMembersList(teamMembersRaw);

  banner.style.display = 'flex';
  if (teamName && parsed.count >= 2) {
    banner.className = 'wizard-group-banner valid';
    banner.innerHTML = `
      <span>✓ المشاركة باسم المجموعة: <strong>${teamName}</strong> (${parsed.count} أعضاء مسجلين)</span>
      <span style="font-size:0.78rem; opacity:0.9;">👥 ${parsed.formatted}</span>
    `;
  } else {
    banner.className = 'wizard-group-banner warning';
    banner.innerHTML = `
      <span>⚠️ المشاركة للمجموعات المسجلة فقط: أدخل <strong>اسم المجموعة</strong> و<strong>عضوين (2) مختلفين على الأقل</strong> مفصولين بفاصلة (،).</span>
      <span style="font-size:0.78rem;">الأعضاء الحاليون: ${parsed.count} / 2</span>
    `;
  }
}

// 2. Submission Wizard
function renderSubmissionWizard() {
  const gateEl = document.getElementById('wizard-auth-gate');
  const mainCard = document.getElementById('wizard-main-card');

  if (!state.currentUser) {
    if (mainCard) mainCard.style.display = 'none';
    if (gateEl) {
      gateEl.style.display = 'block';
      gateEl.innerHTML = `
        <div class="empty-state-card wizard-auth-gate-card">
          <div style="font-size:3rem; margin-bottom:12px;">🔒👥</div>
          <h2>المشاركة مخصصة للمجموعات المسجلة فقط</h2>
          <p style="color:var(--text-muted); max-width:540px; margin:12px auto 0 auto; line-height:1.8;">
            يمكن لأي فريق التسجيل مجاناً وبشكل فوري (دون انتظار موافقة مسبقة)، بشرط تكوين <strong>مجموعة من عضوين (2) على الأقل</strong>. سجّل دخول مجموعتك أو أنشئ حساب مجموعة جديدة الآن للمتابعة في تقديم الدراسة.
          </p>
          <div class="wizard-gate-actions">
            <button type="button" class="btn btn-primary btn-lg" onclick="state.postAuthRedirectToSubmit = true; openAuthModal('register')">
              👥 تسجيل مجموعة جديدة (متاح للجميع)
            </button>
            <button type="button" class="btn btn-secondary btn-lg" onclick="state.postAuthRedirectToSubmit = true; openAuthModal('login')">
              🔑 تسجيل الدخول بحساب مجموعة
            </button>
          </div>
        </div>
      `;
    }
    return;
  }

  if (state.currentUser.role === 'lajna') {
    if (mainCard) mainCard.style.display = 'none';
    if (gateEl) {
      gateEl.style.display = 'block';
      gateEl.innerHTML = `
        <div class="empty-state-card">
          <div style="font-size:3rem; margin-bottom:12px;">⚖️</div>
          <h2>حسابك مسجل كعضو في لجنة التحكيم (Lajna)</h2>
          <p style="color:var(--text-muted); max-width:520px; margin:12px auto 0 auto;">
            حسابات لجنة التحكيم مخصصة لمراجعة وتقييم الدراسات فقط. للمشاركة كمتسابق في المسابقة، يرجى تسجيل الخروج وإنشاء حساب <strong>مجموعة مشاركة</strong> (2+ أعضاء).
          </p>
          <div class="wizard-gate-actions">
            <button type="button" class="btn btn-lajna" onclick="navigateTo('lajna')">⚖️ الذهاب للوحة التحكيم</button>
            <button type="button" class="btn btn-secondary" onclick="logout().then(() => { state.postAuthRedirectToSubmit = true; openAuthModal('register'); })">
              👥 التسجيل بحساب مجموعة للمشاركة
            </button>
          </div>
        </div>
      `;
    }
    return;
  }

  if (gateEl) gateEl.style.display = 'none';
  if (mainCard) mainCard.style.display = 'block';

  // Auto-fill registered Group info when entering Step 1
  const teamNameInput = document.getElementById('wiz-team-name');
  const teamMembersInput = document.getElementById('wiz-team-members');
  if (teamNameInput && !teamNameInput.value.trim()) {
    teamNameInput.value = state.currentUser.group_name || state.currentUser.organization || '';
  }
  if (teamMembersInput && !teamMembersInput.value.trim()) {
    teamMembersInput.value = state.currentUser.group_members || '';
  }
  updateWizardGroupStatus();

  const isTheme = state.wizardCompetitionType === 'theme_idea';

  const steps = isTheme
    ? [
      { step: 1, label: 'فكرتك في المحور' },
      { step: 2, label: 'الجمهور والأثر' },
      { step: 3, label: 'تحليل SWOT' },
      { step: 4, label: 'دراسة الجدوى' },
      { step: 5, label: 'المستند والإرسال' }
    ]
    : [
      { step: 1, label: 'استراتيجية التسويق' },
      { step: 2, label: 'الجمهور المستهدف' },
      { step: 3, label: 'تحليل SWOT' },
      { step: 4, label: 'الخطة والجدوى' },
      { step: 5, label: 'المستند والإرسال' }
    ];

  const stepsEl = document.getElementById('wizard-steps-container');
  if (stepsEl) {
    stepsEl.innerHTML = steps.map(s => `
      <div class="wizard-step ${state.wizardStep === s.step ? 'active' : state.wizardStep > s.step ? 'completed' : ''}" onclick="setWizardStep(${s.step})">
        <div class="step-circle">${state.wizardStep > s.step ? '✓' : s.step}</div>
        <div class="step-label">${s.label}</div>
      </div>
    `).join('');
  }

  const captionEl = document.getElementById('wizard-mobile-caption');
  if (captionEl) {
    const activeObj = steps.find(s => s.step === state.wizardStep) || steps[0];
    captionEl.innerHTML = `
      <span class="wizard-mobile-step-pill">الخطوة ${activeObj.step} من 5</span>
      <span class="wizard-mobile-step-title">${activeObj.label}</span>
    `;
  }

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`wizard-step-${i}`);
    if (el) el.style.display = state.wizardStep === i ? 'block' : 'none';
  }

  // Render Competition Selector in Step 1
  const compSelectorEl = document.getElementById('wizard-comp-selector');
  if (compSelectorEl) {
    compSelectorEl.innerHTML = `
      <button type="button" class="wiz-comp-btn ${!isTheme ? 'active' : ''}" onclick="selectWizardCompetition('marketing_strategy')">
        <span class="wiz-comp-title">🎯 المسابقة 1: استراتيجية تسويق</span>
        <span class="wiz-comp-sub">اختر فكرة مطروحة وقدّم أفضل استراتيجية تسويق وجدوى</span>
      </button>
      <button type="button" class="wiz-comp-btn wiz-comp-btn-theme ${isTheme ? 'active' : ''}" onclick="selectWizardCompetition('theme_idea')">
        <span class="wiz-comp-title">🌿 المسابقة 2: فكرة ضمن محور</span>
        <span class="wiz-comp-sub">قدّم أفضل فكرة مشروع مبتكرة ضمن المحور الذي تحدده الإدارة</span>
      </button>
    `;
  }

  // Filter open challenges by selected competition type
  const openTracks = state.challenges.filter(c =>
    (c.competition_type || 'marketing_strategy') === state.wizardCompetitionType && c.is_open !== 0
  );

  const closedNoticeEl = document.getElementById('wizard-comp2-closed-notice');
  const fieldsWrapper = document.getElementById('wizard-step1-fields');
  const isAdminOrLajna = state.currentUser?.role === 'admin' || state.currentUser?.role === 'lajna';

  if (openTracks.length === 0) {
    if (fieldsWrapper) fieldsWrapper.style.display = 'none';
    if (closedNoticeEl) {
      closedNoticeEl.style.display = 'block';
      closedNoticeEl.innerHTML = `
        <div class="empty-state-card" style="border-color:rgba(139,92,246,0.35); margin-top:12px;">
          <div style="font-size:2.6rem; margin-bottom:10px;">⏳</div>
          <h3>محور المسابقة الثانية قيد الإعداد من الإدارة</h3>
          <p style="color:var(--text-muted); max-width:500px; margin:10px auto 18px auto; font-size:0.92rem;">
            ستقوم الإدارة بنشر المحور الرسمي قريباً (مثل: الطبيعة والاستدامة أو محور آخر). يمكنك حالياً المشاركة في المسابقة الأولى أو العودة فور فتح المحور.
          </p>
          <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="selectWizardCompetition('marketing_strategy')">
              🎯 الانتقال للمسابقة 1 (استراتيجية التسويق)
            </button>
            ${isAdminOrLajna ? `
              <button type="button" class="btn btn-lajna btn-sm" onclick="openAddIdeaModal('theme_idea')">
                🌿 إضافة وفتح محور الآن (Admin)
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }
  } else {
    if (closedNoticeEl) closedNoticeEl.style.display = 'none';
    if (fieldsWrapper) fieldsWrapper.style.display = 'block';

    // Always sync select options with selected competition tracks
    const select = document.getElementById('wizard-challenge-select');
    if (select) {
      const currentVal = state.wizardChallengeId || select.value;
      const defaultOpt = isTheme
        ? '-- اختر المحور المتاح --'
        : '-- اختر الفكرة من التحديات المتاحة --';
      select.innerHTML = `<option value="">${defaultOpt}</option>` +
        openTracks.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
      if (openTracks.some(c => c.id === currentVal)) {
        select.value = currentVal;
        state.wizardChallengeId = currentVal;
      } else if (openTracks.length === 1) {
        select.value = openTracks[0].id;
        state.wizardChallengeId = openTracks[0].id;
      }
    }
  }

  // Adapt Step 1 headings & placeholders dynamically
  const step1Heading = document.getElementById('wiz-step1-heading');
  const lblTrack = document.getElementById('wiz-label-track');
  const lblTitle = document.getElementById('wiz-label-title');
  const lblPitch = document.getElementById('wiz-label-pitch');
  const inputTitle = document.getElementById('wiz-title');
  const inputPitch = document.getElementById('wiz-pitch');

  if (step1Heading) step1Heading.textContent = isTheme
    ? '1. اختيار المحور وبيانات فكرتك المبتكرة'
    : '1. اختيار الفكرة وملخص استراتيجية التسويق';
  if (lblTrack) lblTrack.textContent = isTheme
    ? 'محور المسابقة الثانية (Theme) *'
    : 'فكرة التحدي المطروحة (المسابقة 1) *';
  if (lblTitle) lblTitle.textContent = isTheme
    ? 'عنوان فكرتك المبتكرة *'
    : 'عنوان خطة التسويق / المشروع *';
  if (lblPitch) lblPitch.textContent = isTheme
    ? 'شرح فكرتك والمشكلة التي تحلها ضمن المحور *'
    : 'الملخص التنفيذي لاستراتيجية التسويق والجدوى *';
  if (inputTitle) inputTitle.placeholder = isTheme
    ? 'مثال: EcoGuard — منصة ذكية لحماية الغابات...'
    : 'مثال: خطة إطلاق وتوسيع Omni AI للشركات';
  if (inputPitch) inputPitch.placeholder = isTheme
    ? 'اشرح فكرتك الإبداعية وكيف تخدم المحور المحدد والقيمة المضافة...'
    : 'اشرح استراتيجيتك التسويقية للوصول للعملاء، التموضع، وخطة النمو...';

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
      ? '<li style="font-size:0.8rem; color:var(--text-dim); padding:6px;">لم تتم إضافة عناصر بعد</li>'
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

  const challengeId = document.getElementById('wizard-challenge-select')?.value || state.wizardChallengeId;
  const challenge = state.challenges.find(c => c.id === challengeId);
  const title = document.getElementById('wiz-title')?.value || state.form.title;
  const pitch = document.getElementById('wiz-pitch')?.value || state.form.pitch;
  const team = document.getElementById('wiz-team-name')?.value || state.form.team_name;

  container.innerHTML = `
    <div class="wizard-review-card">
      <div style="font-size:0.82rem; color:#38bdf8; font-weight:700; margin-bottom:6px;">
        🎯 ${challenge ? challenge.title : 'No track selected'}
      </div>
      <h3 style="font-size:1.25rem; margin-bottom:8px;">${title || 'Untitled Project'}</h3>
      <p style="color:var(--text-muted); margin-bottom:14px; font-size:0.92rem;">${pitch || 'No pitch provided'}</p>
      <div style="font-size:0.85rem; color:var(--text-dim); margin-bottom:14px;">
        👥 الفريق: <strong>${team || (state.currentUser ? state.currentUser.name : 'Anonymous')}</strong>
      </div>

      <div class="wizard-review-grid">
        <div class="wizard-review-item">
          <h5 style="color:#34d399; margin-bottom:6px;">✓ عناصر مصفوفة SWOT</h5>
          <span style="font-size:0.85rem; color:var(--text-muted);">
            نقاط القوة: ${state.form.swot.strengths.length} | الضعف: ${state.form.swot.weaknesses.length} | الفرص: ${state.form.swot.opportunities.length} | التهديدات: ${state.form.swot.threats.length}
          </span>
        </div>
        <div class="wizard-review-item">
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
      <div class="empty-state-card">
        <h3>يرجى تسجيل الدخول لعرض دراستك</h3>
        <button class="btn btn-primary" onclick="openAuthModal('login')" style="margin-top:16px;">تسجيل الدخول</button>
      </div>
    `;
    return;
  }

  if (state.submissions.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <div style="font-size:3rem; margin-bottom:12px;">📁</div>
        <h3>لم تقم بتقديم أي دراسة جدوى بعد</h3>
        <p style="color:var(--text-muted); margin:12px auto 20px auto; max-width:480px;">
          اختر إحدى أفكار المسابقة وأعد دراسة الجدوى وأرفق مستندك لإرساله إلى لجنة التحكيم.
        </p>
        <button class="btn btn-primary" onclick="navigateTo('submit')">🚀 إعداد دراسة الجدوى الآن</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.submissions.map(s => {
    const meta = getCompetitionMeta(s.competition_type);
    return `
    <div class="wizard-card" style="margin-bottom:24px;">
      <div class="submission-status-header">
        <div style="min-width:0; flex:1;">
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            <span class="comp-type-badge ${meta.cssClass}">${meta.shortLabel}</span>
            <span class="privacy-badge">🔒 محفوظة ومؤمنة في قاعدة البيانات (DB)</span>
          </div>
          <h2 class="submission-item-title">${s.title}</h2>
          <div style="color:#38bdf8; font-size:0.88rem; font-weight:600;">${s.competition_type === 'theme_idea' ? '🌿 المحور:' : '🎯 الفكرة:'} ${s.challenge_title}</div>
        </div>
        <div class="sub-score-badge" style="background:#0284c7;">
          ⏳ الحالة: قيد التحكيم لدى اللجنة
        </div>
      </div>

      <p style="font-size:0.98rem; color:var(--text-muted); margin-bottom:20px;">${s.pitch}</p>

      ${s.document_path ? `
        <div class="doc-attached-card" style="margin-bottom:20px;">
          <div class="doc-name">
            <span style="font-size:1.5rem; flex-shrink:0;">📄</span>
            <div style="min-width:0;">
              <div style="font-weight:700; word-break:break-word;">المستند المرفق بالدراسة: ${s.document_name || 'ملف دراسة الجدوى'}</div>
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

      <div class="submission-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openDetailModal('${s.id}')">
          🔍 استعراض دراسة الجدوى وسوات
        </button>
      </div>
    </div>
  `;
  }).join('');
}

// 4. Lajna (Jury) Suite View (Confidential Review)
function renderLajnaView() {
  const container = document.getElementById('lajna-view-content');
  if (!container) return;

  const isLajnaOrAdmin = state.currentUser && (state.currentUser.role === 'lajna' || state.currentUser.role === 'admin');

  if (!isLajnaOrAdmin) {
    container.innerHTML = `
      <div class="empty-state-card">
        <div style="font-size:3rem; margin-bottom:16px;">⚖️</div>
        <h2>بوابة لجنة التحكيم السرية (Lajna Jury Portal)</h2>
        <p style="color:var(--text-muted); max-width:540px; margin:12px auto 24px auto;">
          المشاريع ودراسات الجدوى غير منشورة علناً، بل تُحفظ مباشرة في قاعدة البيانات ليطلع عليها أعضاء لجنة التحكيم المعتمدون حصرياً.
        </p>
        <button class="btn btn-lajna btn-lg" onclick="openAuthModal('login')">
          🔑 تسجيل الدخول كـ عضو لجنة تحكيم
        </button>
      </div>
    `;
    return;
  }

  // Check if Lajna is pending approval ("Only Admin can approve Lajna")
  if (state.currentUser.role === 'lajna' && !state.currentUser.is_approved) {
    container.innerHTML = `
      <div class="empty-state-card approval-pending-card">
        <div style="font-size:3.2rem; margin-bottom:16px;">⏳</div>
        <div class="privacy-badge" style="background:rgba(245, 158, 11, 0.15); color:#fbbf24; border-color:rgba(245, 158, 11, 0.4); margin-bottom:16px;">
          بانتظار اعتماد مدير المسابقة (Admin Approval Required)
        </div>
        <h2 style="font-size:clamp(1.25rem, 3vw, 1.75rem); margin-bottom:12px;">طلب عضويتك في لجنة التحكيم قيد المراجعة</h2>
        <p style="color:var(--text-muted); line-height:1.8; margin-bottom:24px;">
          مرحباً بك <strong>${state.currentUser.name}</strong>. في مسابقة <strong>MLIC CHALLENGE</strong>، 
          <span style="color:#fbbf24; font-weight:700;">مدير المسابقة (Admin) هو الوحيد المخول باعتماد أعضاء لجنة التحكيم</span> حفاظاً على سرية المشاريع ونزاهة التحكيم. 
          بمجرد قيام الإدارة باعتماد حسابك، ستتمكن فوراً من فحص دراسات الجدوى، تحميل المستندات المرفقة، ورصد درجات التقييم.
        </p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-secondary" onclick="checkAuth(); renderApp();">
            🔄 إعادة التحقق من حالة الاعتماد
          </button>
        </div>
      </div>
    `;
    return;
  }

  const filteredSubs = state.submissions.filter(s => {
    const cType = s.competition_type || 'marketing_strategy';
    if (state.lajnaCompetitionFilter === 'all') return true;
    return cType === state.lajnaCompetitionFilter;
  });

  const comp1Count = state.submissions.filter(s => (s.competition_type || 'marketing_strategy') === 'marketing_strategy').length;
  const comp2Count = state.submissions.filter(s => s.competition_type === 'theme_idea').length;

  container.innerHTML = `
    <div class="lajna-banner">
      <div>
        <h3 style="color:#ffffff; margin-bottom:6px;">
          ⚖️ لوحة تحكيم دراسات الجدوى والمستندات (Lajna Jury Panel)
        </h3>
        <p style="color:#e9d5ff; font-size:0.9rem;">
          المحكّم: ${state.currentUser.name} • المشاريع مستلمة مباشرة من قاعدة البيانات، اضغط على أي مشروع لقراءة دراسته وتحميل مستنده وتقييمه.
        </p>
      </div>
      <div style="display:flex; gap:12px;">
        <button class="btn ${state.winnersAnnounced ? 'btn-secondary' : 'btn-primary'}" onclick="toggleWinnersAnnouncement()">
          🏆 ${state.winnersAnnounced ? 'إخفاء النتائج عن المشاركين' : 'إعلان الفائزين رسمياً!'}
        </button>
      </div>
    </div>

    <div class="competition-filter-bar" style="margin-bottom:20px;">
      <button type="button" class="filter-chip ${state.lajnaCompetitionFilter === 'all' ? 'active' : ''}" onclick="setLajnaFilter('all')">
        الكل (${state.submissions.length})
      </button>
      <button type="button" class="filter-chip ${state.lajnaCompetitionFilter === 'marketing_strategy' ? 'active' : ''}" onclick="setLajnaFilter('marketing_strategy')">
        🎯 المسابقة 1: استراتيجية التسويق (${comp1Count})
      </button>
      <button type="button" class="filter-chip ${state.lajnaCompetitionFilter === 'theme_idea' ? 'active' : ''}" onclick="setLajnaFilter('theme_idea')">
        🌿 المسابقة 2: أفكار المحاور (${comp2Count})
      </button>
    </div>

    <div class="section-header">
      <div>
        <h3 style="font-size:1.3rem;">📋 دراسات الجدوى المحفوظة في قاعدة البيانات</h3>
        <p class="section-subtitle">${filteredSubs.length} مشاركة مسجلة قيد التحكيم</p>
      </div>
    </div>

    ${filteredSubs.length === 0 ? `
      <div class="empty-state-card">
        <div style="font-size:2.4rem; margin-bottom:8px;">📭</div>
        <p style="color:var(--text-muted);">لا توجد مشاركات في هذه المسابقة بعد.</p>
      </div>
    ` : `
      <div class="submissions-grid">
        ${filteredSubs.map(s => {
    const meta = getCompetitionMeta(s.competition_type);
    return `
          <div class="submission-card">
            <div>
              <div class="sub-header">
                <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-start;">
                  <span class="comp-type-badge ${meta.cssClass}">${meta.shortLabel}</span>
                  <span style="font-size:0.75rem; color:#a78bfa; font-weight:700;">${s.competition_type === 'theme_idea' ? '🌿' : '🎯'} ${s.challenge_title}</span>
                </div>
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
                📄 فحص الجدوى والمستند
              </button>
              <button class="btn btn-lajna btn-sm" onclick="openEvaluationModal('${s.id}')">
                ✍️ منح الدرجات والتقييم
              </button>
            </div>
          </div>
        `;
  }).join('')}
      </div>
    `}
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
    <div class="admin-banner">
      <div class="admin-banner-text">
        <h3 style="color:#fbbf24; margin-bottom:4px;">👑 لوحة تحكم الأدمن: اعتماد أعضاء لجنة التحكيم</h3>
        <p style="color:#fef3c7; font-size:0.88rem;">
          حفاظاً على نزاهة وسرية مسابقة MLIC CHALLENGE، لا يستطيع أي محكّم الاطلاع على المشاريع أو تقييمها حتى يتم اعتماده رسمياً من قبلك هنا.
        </p>
      </div>
      <div class="admin-pending-box">
        <div style="font-size:1.6rem; font-weight:800; color:#fbbf24;">${pending.length}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">بانتظار الاعتماد</div>
      </div>
    </div>

    <div class="table-scroll-hint">↔️ اسحب الجدول أفقياً لعرض جميع الأعمدة</div>
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

// 5. Leaderboard & Winner Podium View (Per Competition)
function renderLeaderboardView() {
  const container = document.getElementById('leaderboard-view-content');
  if (!container) return;

  const activeTab = state.leaderboardCompetitionTab || 'marketing_strategy';
  const filteredLeaderboard = state.leaderboard.filter(item =>
    (item.competition_type || 'marketing_strategy') === activeTab
  );
  const top3 = filteredLeaderboard.slice(0, 3);

  container.innerHTML = `
    <div class="leaderboard-header">
      <div class="hero-pill" style="border-color:rgba(245, 158, 11, 0.4); color:#fbbf24; background:rgba(245, 158, 11, 0.1);">
        🏆 ${state.winnersAnnounced ? 'تم اعتماد وإعلان الفائزين رسمياً!' : 'النتائج قيد التحكيم والفرز لدى اللجنة'}
      </div>
      <h2 class="leaderboard-title">
        منصة تتويج الفائزين وجدول الترتيب النهائي
      </h2>
      <p class="leaderboard-subtitle">
        تحديد الفائزين في كل مسابقة بناءً على مجموع درجات لجنة التحكيم لمصفوفة SWOT ودراسة الجدوى والمستند المرفق.
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
      <div class="empty-state-card">
        <div style="font-size:3rem; margin-bottom:12px;">⏳</div>
        <h3>جلسة التحكيم جارية الآن</h3>
        <p style="color:var(--text-muted); max-width:500px; margin:10px auto;">
          تقوم لجنة التحكيم (Lajna) حالياً بتقييم دراسات الجدوى والمستندات المرفقة في قاعدة البيانات. سيتم إعلان الفائزين هنا بمجرد اعتماد النتائج.
        </p>
      </div>
    ` : `
      <!-- Competition Switcher Tabs -->
      <div class="competition-filter-bar" style="justify-content:center; margin-bottom:24px;">
        <button type="button" class="filter-chip ${activeTab === 'marketing_strategy' ? 'active' : ''}" onclick="setLeaderboardCompetition('marketing_strategy')">
          🎯 فائزو المسابقة 1: استراتيجية التسويق
        </button>
        <button type="button" class="filter-chip ${activeTab === 'theme_idea' ? 'active' : ''}" onclick="setLeaderboardCompetition('theme_idea')">
          🌿 فائزو المسابقة 2: أفضل فكرة في المحور
        </button>
      </div>

      ${filteredLeaderboard.length === 0 ? `
        <div class="empty-state-card">
          <div style="font-size:2.6rem; margin-bottom:10px;">🏆</div>
          <h3>لا توجد نتائج مسجلة في هذه المسابقة بعد</h3>
          <p style="color:var(--text-muted); margin-top:8px;">
            ${activeTab === 'theme_idea'
        ? 'ستظهر نتائج المسابقة الثانية هنا بعد فتح المحور وتقييم المشاركات.'
        : 'لم تُقيّم أي مشاركة في المسابقة الأولى بعد.'}
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
              <span class="podium-rank-tag">المركز الثاني</span>
              <h4 style="font-size:1.05rem; margin:8px 0 4px 0;">${top3[1].title}</h4>
              <div style="font-size:0.8rem; color:var(--text-muted);">${top3[1].team_name}</div>
              <div class="podium-score">${top3[1].avg_score || 0}<span style="font-size:1rem; color:var(--text-dim);">/100</span></div>
            </div>
          ` : ''}

          <!-- 1st Place (Champion) -->
          ${top3[0] ? `
            <div class="podium-card podium-1st" onclick="openDetailModal('${top3[0].id}')" style="cursor:pointer;">
              <div class="podium-trophy">🏆</div>
              <span class="podium-rank-tag">🥇 الفائز بالمركز الأول</span>
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
              <span class="podium-rank-tag">المركز الثالث</span>
              <h4 style="font-size:1.05rem; margin:8px 0 4px 0;">${top3[2].title}</h4>
              <div style="font-size:0.8rem; color:var(--text-muted);">${top3[2].team_name}</div>
              <div class="podium-score">${top3[2].avg_score || 0}<span style="font-size:1rem; color:var(--text-dim);">/100</span></div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Leaderboard Table -->
      <div class="table-scroll-hint" style="margin-top:28px;">↔️ اسحب الجدول أفقياً لعرض جميع الأعمدة</div>
      <div class="leaderboard-table-container">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>المشروع والفريق</th>
              <th>${activeTab === 'theme_idea' ? 'المحور' : 'فكرة التحدي'}</th>
              <th>المستند المرفق</th>
              <th>الجمهور (/20)</th>
              <th>SWOT (/20)</th>
              <th>الجدوى الفنية (/25)</th>
              <th>الجدوى المالية (/25)</th>
              <th>المجموع النهائي</th>
            </tr>
          </thead>
          <tbody>
            ${filteredLeaderboard.map((item, index) => `
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
    `}
  `;
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

  const meta = getCompetitionMeta(sub.competition_type);

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <div class="detail-header-row">
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
          <span class="comp-type-badge ${meta.cssClass}">${meta.shortLabel}</span>
          <span class="privacy-badge">🔒 مستند ودراسة محفوظة في قاعدة البيانات (DB)</span>
        </div>
        <span style="font-size:0.8rem; color:#38bdf8; font-weight:700;">${sub.competition_type === 'theme_idea' ? '🌿' : '🎯'} ${sub.challenge_title}</span>
      </div>
      <h2 class="detail-title">${sub.title}</h2>
      <p style="font-size:1rem; color:var(--text-muted);">${sub.pitch}</p>
      <div class="detail-meta-row">
        <span>👥 الفريق: <strong>${sub.team_name}</strong></span>
        <span>👤 الأعضاء: ${sub.team_members}</span>
      </div>
    </div>

    <!-- Attached Document Download Box (If present) -->
    ${sub.document_path ? `
      <div class="doc-attached-card" style="margin-bottom:24px; padding:16px;">
        <div class="doc-name" style="font-size:1rem;">
          <span style="font-size:1.7rem; flex-shrink:0;">📄</span>
          <div style="min-width:0;">
            <div style="word-break:break-word;">${sub.document_name || 'ملف دراسة الجدوى المرفق'}</div>
            <div style="font-size:0.78rem; color:var(--text-dim);">${Math.round((sub.document_size || 0) / 1024)} KB • مرفوع ومحفوظ في السيرفر</div>
          </div>
        </div>
        <a href="${sub.document_path}" target="_blank" download class="btn btn-primary btn-sm">
          📥 تحميل وفتح المستند المرفق (Download Doc)
        </a>
      </div>
    ` : ''}

    <!-- Target Audience -->
    <div class="rubric-card detail-audience-card">
      <h3 style="color:#38bdf8; margin-bottom:12px; font-size:1.15rem;">
        🎯 دراسة الجمهور المستهدف (Target Audience & Market Fit)
      </h3>
      <div style="font-size:0.92rem; line-height:1.7;">
        <p><strong>الشريحة المستهدفة الأساسية:</strong> ${target.primary_segment || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>نقاط الألم والمشكلات:</strong> ${target.customer_pain_points || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>القيمة المقترحة:</strong> ${target.value_proposition || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>حجم السوق (TAM/SAM/SOM):</strong> ${target.tam_sam_som || 'N/A'}</p>
        <p style="margin-top:6px;"><strong>شخصية العميل المشتري (Persona):</strong> ${target.buyer_persona || 'N/A'}</p>
      </div>
    </div>

    <!-- SWOT Matrix -->
    <h3 style="margin-bottom:12px; font-size:1.15rem;">
      🧭 مصفوفة تحليل سوات الرباعي (SWOT Analysis)
    </h3>
    <div class="swot-grid">
      <div class="swot-quadrant swot-s">
        <h4 style="color:#34d399;">🟢 Strengths (نقاط القوة)</h4>
        <ul class="detail-swot-list">
          ${(swot.strengths || []).map(s => `<li>${s}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
      <div class="swot-quadrant swot-w">
        <h4 style="color:#fbbf24;">🟡 Weaknesses (نقاط الضعف)</h4>
        <ul class="detail-swot-list">
          ${(swot.weaknesses || []).map(w => `<li>${w}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
      <div class="swot-quadrant swot-o">
        <h4 style="color:#38bdf8;">🔵 Opportunities (الفرص)</h4>
        <ul class="detail-swot-list">
          ${(swot.opportunities || []).map(o => `<li>${o}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
      <div class="swot-quadrant swot-t">
        <h4 style="color:#f87171;">🔴 Threats (التهديدات)</h4>
        <ul class="detail-swot-list">
          ${(swot.threats || []).map(t => `<li>${t}</li>`).join('') || '<li>N/A</li>'}
        </ul>
      </div>
    </div>

    <!-- Feasibility Study -->
    <h3 style="margin:24px 0 12px 0; font-size:1.15rem;">
      📈 دراسة الجدوى الشاملة (Dirasat Jadwa)
    </h3>
    <div class="feasibility-grid">
      <div class="feasibility-box">
        <h4>🛠️ الجدوى الفنية والتكنولوجية</h4>
        <p style="font-size:0.88rem;"><strong>مستوى الجاهزية:</strong> ${feas.technical?.readiness_level || 'TRL 5'}</p>
        <p style="font-size:0.88rem; margin-top:6px;">${feas.technical?.summary || 'N/A'}</p>
        <p style="font-size:0.82rem; color:var(--text-dim); margin-top:6px;"><strong>البنية التحتية:</strong> ${feas.technical?.infrastructure_needs || 'N/A'}</p>
      </div>

      <div class="feasibility-box">
        <h4>🛍️ الجدوى التسويقية والتجارية</h4>
        <p style="font-size:0.88rem;">${feas.market?.market_demand || 'N/A'}</p>
        <p style="font-size:0.88rem; margin-top:6px;"><strong>الميزة التنافسية:</strong> ${feas.market?.competitive_advantage || 'N/A'}</p>
        <p style="font-size:0.82rem; color:var(--text-dim); margin-top:6px;"><strong>قنوات التوزيع:</strong> ${feas.market?.marketing_channels || 'N/A'}</p>
      </div>

      <div class="feasibility-box feasibility-box-full">
        <h4>💰 الجدوى المالية والمؤشرات الاستثمارية</h4>
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
            <strong>💳 نظام المدفوعات والفوترة:</strong> ${fin.payment_system}
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Jury Evaluations -->
    ${evals.length > 0 ? `
      <h3 style="margin:24px 0 12px 0; font-size:1.15rem;">
        ⚖️ تقييمات وملاحظات لجنة التحكيم (Lajna Reviews)
      </h3>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${evals.map(ev => `
          <div class="eval-item-card">
            <div class="eval-item-header">
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

  const isTheme = sub.competition_type === 'theme_idea';
  const meta = getCompetitionMeta(sub.competition_type);

  const labels = isTheme
    ? {
      aud: '1. ملاءمة الفكرة للمحور والجمهور المستهدف (Theme Fit & Audience)',
      swot: '2. عمق وواقعية تحليل سوات (SWOT Analysis Rigor)',
      tech: '3. قابلية التنفيذ والجدوى الفنية والمستند (Execution & Doc)',
      fin: '4. الجدوى المالية والاستدامة (Financial Viability & ROI)',
      inn: '5. الإبداع والأصالة في المحور (Creativity & Innovation)'
    }
    : {
      aud: '1. وضوح الجمهور المستهدف واستراتيجية التسويق (Marketing & Audience)',
      swot: '2. عمق وواقعية تحليل سوات (SWOT Analysis Rigor)',
      tech: '3. الجدوى الفنية والتسويقية والمستند (Strategy Execution & Doc)',
      fin: '4. الجدوى المالية ونظام المدفوعات والعائد (Financial Viability & ROI)',
      inn: '5. تميز الخطة وجودة العرض والمستند (Strategy Differentiation & Pitch)'
    };

  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:6px;">
        <span class="comp-type-badge ${meta.cssClass}">${meta.shortLabel}</span>
        <span style="font-size:0.75rem; color:#a78bfa; font-weight:700;">${isTheme ? '🌿' : '🎯'} ${sub.challenge_title}</span>
      </div>
      <h3 style="font-size:1.35rem; margin-top:4px;">${sub.title}</h3>
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
        <label class="form-label" style="margin:0;">${labels.aud}</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-aud">18 / 20</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-audience" min="0" max="20" value="18" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">${labels.swot}</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-swot">17 / 20</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-swot" min="0" max="20" value="17" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">${labels.tech}</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-tech">22 / 25</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-tech" min="0" max="25" value="22" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">${labels.fin}</label>
        <span style="font-weight:700; color:#38bdf8;" id="val-fin">20 / 25</span>
      </div>
      <input type="range" class="rubric-slider" id="rubric-financial" min="0" max="25" value="20" oninput="updateRubricTotal()">
    </div>

    <div class="rubric-card">
      <div class="rubric-header">
        <label class="form-label" style="margin:0;">${labels.inn}</label>
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
    showToast('يرجى إدخال البريد الإلكتروني وكلمة المرور', 'error');
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

    const wizTeamName = document.getElementById('wiz-team-name');
    const wizTeamMembers = document.getElementById('wiz-team-members');
    if (wizTeamName) wizTeamName.value = '';
    if (wizTeamMembers) wizTeamMembers.value = '';

    showToast(`مرحباً بك، ${data.user.group_name || data.user.name}!`, 'success');
    closeModal('auth-modal');
    await loadInitialData();
    if (state.postAuthRedirectToSubmit) {
      state.activeView = 'submit';
      state.postAuthRedirectToSubmit = false;
    }
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
  const groupName = document.getElementById('reg-group-name')?.value.trim() || '';

  if (!name || !email || !pass) {
    showToast('يرجى تعبئة جميع الحقول الإلزامية', 'error');
    return false;
  }

  const payload = {
    name,
    email,
    password: pass,
    role,
    organization: org
  };

  if (role === 'participant') {
    if (!groupName) {
      showToast('يرجى إدخال اسم المجموعة المشاركة', 'error');
      return false;
    }
    const extraMembers = getRegisterExtraMembers();
    const parsedGroup = parseGroupMembersList(extraMembers, name);
    if (parsedGroup.count < 2) {
      showToast('يشترط تسجيل مجموعة مكونة من عضوين (2) مختلفين على الأقل (لا يُسمح بالمشاركة الفردية).', 'error');
      return false;
    }
    payload.group_name = groupName;
    payload.group_members = parsedGroup.members;
    payload.organization = groupName;
  }

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    state.token = data.token;
    state.currentUser = data.user;
    state.isLajnaOrAdmin = data.user.role === 'lajna' || data.user.role === 'admin';
    localStorage.setItem('mlic_token', data.token);
    localStorage.setItem('agrivers_token', data.token);

    const wizTeamName = document.getElementById('wiz-team-name');
    const wizTeamMembers = document.getElementById('wiz-team-members');
    if (wizTeamName) wizTeamName.value = '';
    if (wizTeamMembers) wizTeamMembers.value = '';

    resetRegisterGroupForm();
    showToast(data.message || 'تم تسجيل المجموعة بنجاح!', 'success');
    closeModal('auth-modal');
    await loadInitialData();
    if (state.postAuthRedirectToSubmit) {
      state.activeView = 'submit';
      state.postAuthRedirectToSubmit = false;
    }
    renderApp();
  } catch (err) {
    console.error('Register error:', err);
  }
  return false;
}

// Mobile Hamburger Navigation Toggle
function toggleMobileMenu(forceState) {
  const hamburger = document.getElementById('nav-hamburger');
  const menu = document.querySelector('.nav-menu');
  const backdrop = document.getElementById('nav-backdrop');

  const isOpen = forceState !== undefined ? forceState : !menu?.classList.contains('open');

  if (hamburger) {
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  if (menu) {
    menu.classList.toggle('open', isOpen);
  }
  if (backdrop) {
    backdrop.classList.toggle('active', isOpen);
  }
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

// Setup Event Listeners
function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      navigateTo(view);
    });
  });

  const wizardSelect = document.getElementById('wizard-challenge-select');
  wizardSelect?.addEventListener('change', (e) => {
    state.wizardChallengeId = e.target.value || null;
  });

  const loginForm = document.getElementById('modal-login-form') || document.getElementById('form-login');
  loginForm?.addEventListener('submit', handleLoginSubmit);

  const regForm = document.getElementById('modal-register-form') || document.getElementById('form-register');
  regForm?.addEventListener('submit', handleRegisterSubmit);

  // Close mobile menu on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleMobileMenu(false);
    }
  });

  // Auto-close mobile menu if resized to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 960) {
      toggleMobileMenu(false);
    }
  });
}
