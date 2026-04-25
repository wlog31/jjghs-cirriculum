// ─────────────────────────────────────────
//  components/semesterView.js  —  학기별 과목 카드
// ─────────────────────────────────────────
import { escapeHtml, areaLabels, areaClass, isCourseOpened, getCourseMatches, normalize } from '../utils/normalize.js';

const semesterFilterState = { activeFilter: '전체' };

// ── 학기 필터 버튼 렌더링 ─────────────────
export function renderSemesterFilterButtons(semesterCourses) {
  const container = document.getElementById('semesterFilterButtons');
  if (!container) return;

  const allAreas = ['전체', ...new Set(
    semesterCourses.flatMap(s => s.courses.map(c => areaLabels[c.area] || c.area))
  )];

  container.innerHTML = allAreas.map(area => `
    <button class="semester-filter-btn${area === semesterFilterState.activeFilter ? ' active' : ''}"
      data-area="${escapeHtml(area)}" type="button">${escapeHtml(area)}</button>
  `).join('');

  container.addEventListener('click', e => {
    const btn = e.target.closest('.semester-filter-btn');
    if (!btn) return;
    semesterFilterState.activeFilter = btn.dataset.area;
    container.querySelectorAll('.semester-filter-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.area === semesterFilterState.activeFilter)
    );
    renderSemesters(semesterCourses, document.getElementById('searchInput')?.value || '');
  });
}

// ── 학기 카드 렌더링 ──────────────────────
export function renderSemesters(semesterCourses, searchQuery = '') {
  const grid = document.getElementById('semesterGrid');
  if (!grid) return;

  const query = normalize(searchQuery);
  const activeFilter = semesterFilterState.activeFilter;

  grid.innerHTML = semesterCourses.map(group => {
    const allCourses = [
      ...(group.requiredSubjects || []).map(name => ({ name, area: 'required', type: '필수', group: '필수' })),
      ...group.courses
    ];

    // 필터링
    const filtered = allCourses.filter(course => {
      const areaLabel = areaLabels[course.area] || course.area;
      const areaMatch = activeFilter === '전체' || areaLabel === activeFilter || course.area === 'required';
      const searchMatch = !query || normalize(course.name).includes(query);
      return areaMatch && searchMatch;
    });

    if (filtered.length === 0) return '';

    // 그룹별 분류
    const groupMap = new Map();
    filtered.forEach(course => {
      const g = course.group || '필수';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(course);
    });

    const totalCredits = group.courses.reduce((sum, c) => sum + (c.credit || 0), 0);
    const openedCount = group.courses.filter(c => isCourseOpened(c.name)).length;

    return `
      <div class="semester-card">
        <header>
          <h3>${escapeHtml(group.semester)}</h3>
          <div class="semester-meta">
            ${(group.requiredSubjects || []).map(s =>
              `<span class="mini-stat">필수: ${escapeHtml(s)}</span>`
            ).join('')}
            <span class="mini-stat">총 ${totalCredits}학점</span>
            <span class="mini-stat">개설 ${openedCount}/${group.courses.length}</span>
          </div>
        </header>
        <div class="semester-body">
          ${[...groupMap.entries()].map(([groupName, courses]) => `
            <div class="course-table-group">
              <div class="course-table-group-title">
                <span>${escapeHtml(groupName)}</span>
                <span style="font-size:0.74rem;color:var(--muted);">${
                  courses[0]?.pick ? `${courses[0].pick}과목 선택` : ''
                }</span>
              </div>
              <div class="course-table-wrap">
                <table class="course-table">
                  <thead>
                    <tr><th>영역</th><th>과목명</th><th>유형</th><th>학점</th></tr>
                  </thead>
                  <tbody>
                    ${courses.map(course => {
                      const matches = getCourseMatches(course.name);
                      const heat = matches.length > 3 ? 'heat-high' : matches.length > 1 ? 'heat-mid' : matches.length > 0 ? 'heat-low' : '';
                      return `
                        <tr class="heat-row ${heat}">
                          <td><span class="tag ${areaClass[course.area] || ''}">${
                            escapeHtml(areaLabels[course.area] || course.area)
                          }</span></td>
                          <td>${escapeHtml(course.name)}</td>
                          <td>${escapeHtml(course.type || '')}</td>
                          <td>${course.credit || '-'}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}
