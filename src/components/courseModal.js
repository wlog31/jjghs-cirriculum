// ─────────────────────────────────────────
//  components/courseModal.js  —  과목 소개 모달
// ─────────────────────────────────────────

let modalEl = null;
let overlayEl = null;

// ── 초기화 (최초 1회) ─────────────────────
export function initCourseModal() {
  if (modalEl) return;

  // 오버레이
  overlayEl = document.createElement('div');
  overlayEl.id = 'courseModalOverlay';
  overlayEl.addEventListener('click', closeModal);

  // 모달
  modalEl = document.createElement('div');
  modalEl.id = 'courseModal';
  modalEl.innerHTML = `
    <div class="cm-header">
      <div class="cm-title-wrap">
        <span class="cm-badge" id="cmBadge"></span>
        <h2 class="cm-title" id="cmTitle"></h2>
      </div>
      <button class="cm-close" id="cmClose" type="button" aria-label="닫기">✕</button>
    </div>
    <div class="cm-body" id="cmBody">
      <div class="cm-loading">
        <div class="cm-spinner"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);
  document.body.appendChild(modalEl);

  document.getElementById('cmClose').addEventListener('click', closeModal);

  // ESC 키로 닫기
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── 모달 열기 ─────────────────────────────
export async function openCourseModal(courseName, area = '') {
  initCourseModal();

  // 제목 세팅
  document.getElementById('cmTitle').textContent = courseName;
  document.getElementById('cmBadge').textContent = area || '';
  document.getElementById('cmBadge').style.display = area ? '' : 'none';

  // 로딩 표시
  document.getElementById('cmBody').innerHTML = `
    <div class="cm-loading">
      <div class="cm-spinner"></div>
      <span>불러오는 중...</span>
    </div>
  `;

  // 모달 표시
  overlayEl.classList.add('visible');
  modalEl.classList.add('visible');
  document.body.style.overflow = 'hidden';

  // 과목 HTML 파일 로드 (교과군_과목명.html 형식)
  const areaPrefix = area ? area.replace(/\s/g, '') + '_' : '';
  const filename = areaPrefix + courseName.replace(/\s/g, '') + '.html';
  const basePath = getBasePath();

  try {
    const res = await fetch(`${basePath}data/courses/${filename}`);
    if (!res.ok) throw new Error('not found');
    const html = await res.text();
    document.getElementById('cmBody').innerHTML = html;
  } catch {
    document.getElementById('cmBody').innerHTML = `
      <div class="cm-empty">
        <div class="cm-empty-icon">📋</div>
        <div class="cm-empty-title">${courseName}</div>
        <div class="cm-empty-desc">아직 과목 소개 자료가 준비되지 않았습니다.<br>
          <code>data/courses/${areaPrefix}${courseName.replace(/\s/g, '')}.html</code> 파일을 추가하면 표시됩니다.
        </div>
      </div>
    `;
  }
}

// ── 모달 닫기 ─────────────────────────────
function closeModal() {
  overlayEl?.classList.remove('visible');
  modalEl?.classList.remove('visible');
  document.body.style.overflow = '';
}

// ── GitHub Pages 경로 대응 ─────────────────
function getBasePath() {
  const path = window.location.pathname;
  // /jjghs-curriculum/ 같은 서브 경로 처리
  const match = path.match(/^(\/[^/]+\/)/);
  return match ? match[1] : '/';
}