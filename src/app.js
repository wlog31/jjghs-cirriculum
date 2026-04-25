import { initAuth, signOut } from './auth.js';
import { fetchSemesterCourses, fetchUniversityRecommendations } from './sheets.js';
import { setAllCourses } from './utils/normalize.js';
import { renderSemesterFilterButtons, renderSemesters } from './components/semesterView.js';
import { renderFilterOptions, renderRecommendations, getFilteredCatalog, bindFilterEvents } from './components/recommendView.js';
import { initSelectionView, getSelectedMap } from './components/selectionView.js';
import { renderMyplan } from './components/myplanView.js';

let semesterCourses = [];
let universityCatalog = [];

function onLoginSuccess(user) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').classList.add('visible');
  document.getElementById('userAvatar').src = user.picture || '';
  document.getElementById('userName').textContent = user.given_name || user.name;
  loadData();
}

async function loadData() {
  showLoading(true);
  try {
    const [semesters, universities] = await Promise.all([
      fetchSemesterCourses(),
      fetchUniversityRecommendations(),
    ]);
    semesterCourses = semesters;
    universityCatalog = universities;

    const allCourses = semesters.flatMap(group =>
      group.courses.map(c => ({ ...c, semester: group.semester }))
    );
    setAllCourses(allCourses);

    showLoading(false);
    renderApp();
  } catch (err) {
    console.error('데이터 로드 실패:', err);
    showLoadError(err.message);
  }
}

function renderApp() {
  // 탭 + controls 표시
  document.getElementById('tabNav').style.display = '';
  document.getElementById('controlsBar').style.display = '';
  document.getElementById('mainContent').classList.add('visible');

  // 탐색 모드
  renderSemesterFilterButtons(semesterCourses);
  renderSemesters(semesterCourses, '');
  renderFilterOptions(universityCatalog);
  update();
  bindFilterEvents(update);

  document.getElementById('searchInput')?.addEventListener('input', e => {
    renderSemesters(semesterCourses, e.target.value);
  });

  document.getElementById('semesterToggle')?.addEventListener('click', () => {
    const panel = document.getElementById('semesterPanel');
    const toggle = document.getElementById('semesterToggle');
    const collapsed = panel.classList.toggle('is-collapsed');
    toggle.textContent = collapsed ? '펼치기' : '접기';
  });

  bindTabEvents();
}

let selectionInited = false;

function bindTabEvents() {
  document.getElementById('tabNav')?.addEventListener('click', async e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tabId = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('tabExplore').classList.toggle('active', tabId === 'explore');
    document.getElementById('tabSelect').classList.toggle('active', tabId === 'select');
    document.getElementById('tabMyplan').classList.toggle('active', tabId === 'myplan');

    // 탐색 탭일 때만 controls 표시
    document.getElementById('controlsBar').style.display = tabId === 'explore' ? '' : 'none';

    if (tabId === 'select' && !selectionInited) {
      selectionInited = true;
      await initSelectionView(semesterCourses, universityCatalog);
    }

    if (tabId === 'myplan') {
      renderMyplan(semesterCourses, getSelectedMap());
    }
  });
}

function update() {
  renderRecommendations(getFilteredCatalog(universityCatalog));
}

function inferArea(name) {
  const n = name.replace(/\s/g, '').toLowerCase();
  if (['대수','미적분ⅰ','미적분i','확률과통계','기하'].includes(n)) return 'math';
  if (n.includes('영어') || n.includes('영미')) return 'english';
  if (n.includes('문학') || n.includes('독서') || n.includes('화법') || n.includes('작문')) return 'korean';
  if (n.includes('사회') || n.includes('역사') || n.includes('경제') || n.includes('윤리') || n.includes('지리')) return 'social';
  if (n.includes('물리') || n.includes('화학') || n.includes('생명') || n.includes('지구') || n.includes('과학')) return 'science';
  return 'liberal';
}

function showLoading(visible) {
  document.getElementById('loadingScreen').classList.toggle('visible', visible);
  if (visible) document.getElementById('mainContent').classList.remove('visible');
}

function showLoadError(msg) {
  document.getElementById('loadingScreen').innerHTML = `
    <div style="text-align:center;padding:32px;">
      <div style="color:#d14a3a;font-weight:800;margin-bottom:8px;">데이터 로드 실패</div>
      <div style="color:#667085;font-size:0.85rem;">${msg}</div>
      <button onclick="location.reload()"
        style="margin-top:16px;padding:8px 16px;border:1.5px solid #d9dee8;border-radius:8px;background:#fff;cursor:pointer;font-weight:700;">
        새로고침
      </button>
    </div>
  `;
  document.getElementById('loadingScreen').classList.add('visible');
}

document.getElementById('logoutBtn').addEventListener('click', signOut);
initAuth(onLoginSuccess);