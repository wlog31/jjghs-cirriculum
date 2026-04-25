// ─────────────────────────────────────────
//  components/myplanView.js  —  내 교육과정 수형도
// ─────────────────────────────────────────
import { escapeHtml, areaLabels } from '../utils/normalize.js';
import { openCourseModal } from './courseModal.js';

const SEMESTERS = ['2학년 1학기', '2학년 2학기', '3학년 1학기', '3학년 2학기'];

const AREA_ORDER = ['korean', 'math', 'english', 'social', 'science', 'info', 'language', 'liberal', 'arts'];

const AREA_LABEL = {
  korean: '국어', math: '수학', english: '영어',
  social: '사회', science: '과학', info: '정보',
  language: '제2외국어\n한문', liberal: '교양', arts: '예술'
};

export function renderMyplan(semesterCourses, selectedMap) {
  const el = document.getElementById('myplanContent');
  if (!el) return;

  // 선택된 과목만 추출 (지정 과목 포함)
  const myCoursesMap = buildMyCoursesMap(semesterCourses, selectedMap);

  // 사용된 교과군만 필터
  const usedAreas = AREA_ORDER.filter(area =>
    SEMESTERS.some(sem => myCoursesMap[sem]?.[area]?.length > 0)
  );

  if (usedAreas.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--muted);">
        <div style="font-size:2rem;margin-bottom:12px;">📋</div>
        <div style="font-weight:800;margin-bottom:6px;">선택한 과목이 없습니다</div>
        <div style="font-size:0.84rem;">"내 과목 선택" 탭에서 과목을 선택하고 저장하면 여기에 표시됩니다.</div>
      </div>
    `;
    return;
  }

  // 요약 통계
  const totalSelected = Object.keys(selectedMap).length;
  const totalCredit = calcTotalCredit(semesterCourses, selectedMap);

  // 범례
  const legend = `
    <div class="myplan-legend">
      ${['지정','일반','진로','융합'].map(t => `
        <div class="myplan-legend-item">
          <div class="myplan-legend-dot type-${t}"></div>
          ${t}
        </div>
      `).join('')}
    </div>
  `;

  // 수형도 그리드
  const headerRow = `
    <div class="myplan-col-head area-head">교과군</div>
    ${SEMESTERS.map(sem => `<div class="myplan-col-head">${escapeHtml(sem)}</div>`).join('')}
  `;

  const areaRows = usedAreas.map(area => {
    const cells = SEMESTERS.map(sem => {
      const courses = myCoursesMap[sem]?.[area] || [];
      if (!courses.length) {
        return `<div class="myplan-cell"><div class="myplan-empty">—</div></div>`;
      }
      return `
        <div class="myplan-cell">
          ${courses.map(c => `
            <div class="myplan-course type-${escapeHtml(c.type)}"
              data-course="${escapeHtml(c.name)}"
              data-area="${escapeHtml(areaLabels[area] || '')}">
              <span class="myplan-course-name">${escapeHtml(c.name)}</span>
              ${c.credit ? `<span class="myplan-credit">${c.credit}학점</span>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

    return `
      <div class="myplan-area-label">${escapeHtml(AREA_LABEL[area] || areaLabels[area] || area)}</div>
      ${cells}
    `;
  }).join('');

  // 요약 카드
  const summary = `
    <div class="myplan-summary">
      <div class="myplan-summary-card">
        <div class="myplan-summary-num">${totalSelected}</div>
        <div class="myplan-summary-label">선택 과목 수</div>
      </div>
      <div class="myplan-summary-card">
        <div class="myplan-summary-num">${totalCredit}</div>
        <div class="myplan-summary-label">총 이수 학점</div>
      </div>
      <div class="myplan-summary-card">
        <div class="myplan-summary-num">${usedAreas.length}</div>
        <div class="myplan-summary-label">이수 교과군</div>
      </div>
      <div class="myplan-summary-card">
        <div class="myplan-summary-num">${SEMESTERS.length}</div>
        <div class="myplan-summary-label">학기</div>
      </div>
    </div>
  `;

  el.innerHTML = `
    ${legend}
    <div class="myplan-grid">
      ${headerRow}
      ${areaRows}
    </div>
    ${summary}
  `;

  // 과목 클릭 → 모달
  el.addEventListener('click', e => {
    const box = e.target.closest('.myplan-course');
    if (!box) return;
    openCourseModal(box.dataset.course, box.dataset.area);
  });
}

// ── 내가 선택한 과목을 학기별·교과군별로 정리 ──
function buildMyCoursesMap(semesterCourses, selectedMap) {
  const map = {};

  for (const group of semesterCourses) {
    const sem = group.semester;
    if (!map[sem]) map[sem] = {};

    for (const c of group.courses) {
      // 지정 과목은 항상 포함, 선택 과목은 selectedMap 확인
      const isSelected = c.group === '지정' ||
        Object.keys(selectedMap).some(key => key === `${sem}::${c.group}::${c.name}`);

      if (!isSelected) continue;

      const area = c.area || 'liberal';
      if (!map[sem][area]) map[sem][area] = [];
      map[sem][area].push(c);
    }
  }

  return map;
}

function calcTotalCredit(semesterCourses, selectedMap) {
  let total = 0;
  for (const group of semesterCourses) {
    for (const c of group.courses) {
      const isSelected = c.group === '지정' ||
        Object.keys(selectedMap).some(key => key === `${group.semester}::${c.group}::${c.name}`);
      if (isSelected) total += c.credit || 0;
    }
  }
  return total;
}