// ─────────────────────────────────────────
//  components/selectionView.js  —  학생 과목 선택 모드
// ─────────────────────────────────────────
import { escapeHtml, areaLabels, areaClass } from '../utils/normalize.js';
import { saveStudentSelection, fetchStudentSelection } from '../sheets.js';
import { getUser, requestAccessToken, CONFIG } from '../auth.js';

// 선택 상태: { 'semester::courseName': true }
let selectedMap = {};
let semesterCourses = [];
let universityCatalog = [];
let isDirty = false;

// ── 초기화 ───────────────────────────────
export async function initSelectionView(semesters, catalog) {
  semesterCourses = semesters;
  universityCatalog = catalog;

  // 저장된 선택 내역 복원 (토큰 발급 후 Sheets에서 불러오기)
  const user = getUser();
  if (user) {
    try {
      const token = await requestAccessToken();
      if (token) {
        const saved = await fetchStudentSelection(user.email, token);
        if (saved && Object.keys(saved).length > 0) {
          selectedMap = saved;
          console.log('선택 내역 복원 완료:', Object.keys(saved).length, '과목');
        }
      }
    } catch (e) {
      console.warn('선택 내역 복원 실패:', e);
    }
  }

  renderSelectionGrid();
  updateSummary();
  bindSelectionEvents();
}

// ── 학기별 선택 그리드 렌더링 ─────────────
function renderSelectionGrid() {
  const grid = document.getElementById('selSemesterGrid');
  if (!grid) return;

  grid.innerHTML = semesterCourses.map(group => {
    // 필수 과목 먼저
    const requiredHtml = (group.requiredSubjects || []).map(name => `
      <div class="sel-course-item required">
        <input type="checkbox" class="sel-course-cb" checked disabled>
        <span class="sel-course-name">${escapeHtml(name)}</span>
        <span class="sel-course-meta tag">필수</span>
      </div>
    `).join('');

    // 그룹별 선택 과목
    const groupMap = new Map();
    group.courses.forEach(c => {
      if (!groupMap.has(c.group)) groupMap.set(c.group, []);
      groupMap.get(c.group).push(c);
    });

    const groupsHtml = [...groupMap.entries()].map(([groupName, courses]) => {
      const pick = courses[0]?.pick || 0;
      const selectedCount = courses.filter(c => isSelected(group.semester, c.name)).length;
      const countClass = selectedCount === pick ? 'valid' : selectedCount > pick ? 'over' : '';

      return `
        <div class="sel-group-block">
          <div class="sel-group-title">
            <span>${escapeHtml(groupName)} — ${pick}과목 선택</span>
            <span class="sel-group-count ${countClass}" id="count-${groupKey(group.semester, groupName)}">
              ${selectedCount}/${pick}
            </span>
          </div>
          <div class="sel-course-list">
            ${courses.map(c => {
              const sel = isSelected(group.semester, c.name);
              return `
                <label class="sel-course-item ${sel ? 'selected' : ''}"
                  data-semester="${escapeHtml(group.semester)}"
                  data-course="${escapeHtml(c.name)}"
                  data-group="${escapeHtml(groupName)}"
                  data-pick="${pick}">
                  <input type="checkbox" class="sel-course-cb"
                    ${sel ? 'checked' : ''}
                    data-semester="${escapeHtml(group.semester)}"
                    data-course="${escapeHtml(c.name)}"
                    data-group="${escapeHtml(groupName)}"
                    data-pick="${pick}">
                  <span class="sel-course-name">${escapeHtml(c.name)}</span>
                  <span class="sel-course-meta">
                    <span class="tag ${areaClass[c.area] || ''}">${escapeHtml(areaLabels[c.area] || c.area)}</span>
                    ${c.credit}학점
                  </span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="sel-semester-card">
        <div class="sel-semester-header">
          <h3>${escapeHtml(group.semester)}</h3>
        </div>
        <div class="sel-semester-body">
          ${requiredHtml ? `
            <div class="sel-group-block">
              <div class="sel-group-title"><span>공통 필수 과목</span></div>
              <div class="sel-course-list">${requiredHtml}</div>
            </div>` : ''}
          ${groupsHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ── 이벤트 바인딩 ─────────────────────────
function bindSelectionEvents() {
  // 과목 체크박스
  document.getElementById('selSemesterGrid')?.addEventListener('change', e => {
    const cb = e.target.closest('input.sel-course-cb[data-course]');
    if (!cb) return;

    const { semester, course, group, pick } = cb.dataset;
    const pickNum = Number(pick);

    if (cb.checked) {
      // pick 수 초과 방지
      const groupSelected = countGroupSelected(semester, group);
      if (groupSelected >= pickNum) {
        cb.checked = false;
        showPickWarning(semester, group, pickNum);
        return;
      }
      selectedMap[selKey(semester, course)] = true;
    } else {
      delete selectedMap[selKey(semester, course)];
    }

    // UI 즉시 반영
    const label = cb.closest('.sel-course-item');
    label?.classList.toggle('selected', cb.checked);
    updateGroupCount(semester, group, pickNum);
    updateSummary();
    setDirty(true);
  });

  // 저장 버튼
  document.getElementById('saveSelectionBtn')?.addEventListener('click', saveSelection);

  // 진로 변경 시 요약 갱신
  document.getElementById('careerSeries')?.addEventListener('change', updateSummary);
  document.getElementById('careerRegion')?.addEventListener('change', updateSummary);
}

// ── 저장 ─────────────────────────────────
async function saveSelection() {
  const user = getUser();
  if (!user) return;

  const btn = document.getElementById('saveSelectionBtn');
  const status = document.getElementById('saveStatus');
  btn.disabled = true;
  status.textContent = '권한 확인 중...';
  status.className = 'save-status';

  try {
    // Sheets 쓰기용 액세스 토큰 요청 (최초 1회 동의 팝업)
    const token = await requestAccessToken();
    if (!token) throw new Error('토큰 발급 실패');

    status.textContent = '저장 중...';
    await saveStudentSelection(user.email, user.name, selectedMap, token);

    // 저장 성공 후 기존 내역 복원 시도
    try {
      const saved = await fetchStudentSelection(user.email, token);
      if (saved) {
        selectedMap = saved;
        renderSelectionGrid();
        updateSummary();
      }
    } catch (e) {
      console.warn('복원 실패:', e);
    }

    status.textContent = '저장 완료 ✓';
    status.className = 'save-status success';
    setDirty(false);
  } catch (err) {
    console.error('저장 실패:', err);
    status.textContent = '저장 실패. 다시 시도하세요.';
    status.className = 'save-status error';
    btn.disabled = false;
  }
}

// ── 선택 현황 요약 업데이트 ───────────────
function updateSummary() {
  const selected = Object.keys(selectedMap);
  const totalCount = selected.length;

  let totalCredit = 0;
  semesterCourses.forEach(group => {
    group.courses.forEach(c => {
      if (isSelected(group.semester, c.name)) totalCredit += c.credit || 0;
    });
    (group.requiredSubjects || []).forEach(() => { totalCredit += 4; });
  });

  document.getElementById('statTotalCount').textContent = totalCount;
  document.getElementById('statTotalCredit').textContent = totalCredit;

  const series = document.getElementById('careerSeries')?.value;
  const region = document.getElementById('careerRegion')?.value;
  updateCoreMatch(series, region);
  updateAnalysis(series, region);
}

function updateCoreMatch(series, region) {
  const el = document.getElementById('statCoreMatch');
  if (!el) return;
  if (!series) { el.textContent = '계열 선택 필요'; return; }

  const targets = universityCatalog.filter(u =>
    u.series === series && (!region || u.regionArea === region)
  );
  if (!targets.length) { el.textContent = '-'; return; }

  const allCore = [...new Set(targets.flatMap(u => u.core))];
  if (!allCore.length) { el.textContent = '-'; return; }

  const matched = allCore.filter(subj => isSubjectSelected(subj)).length;
  el.textContent = `${matched}/${allCore.length}`;
}

// ── 진로 매칭 분석 ────────────────────────
function isSubjectSelected(subj) {
  return Object.keys(selectedMap).some(key => key.endsWith('::' + subj));
}

function updateAnalysis(series, region) {
  const card = document.getElementById('analysisCard');
  if (!card) return;

  if (!series) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const targets = universityCatalog.filter(u =>
    u.series === series && (!region || u.regionArea === region)
  );

  // ① 핵심과목 충족률 바
  const allCore = [...new Set(targets.flatMap(u => u.core))];
  const matchedCore = allCore.filter(s => isSubjectSelected(s));
  const pct = allCore.length ? Math.round(matchedCore.length / allCore.length * 100) : 0;

  const bar = document.getElementById('coreBar');
  const barText = document.getElementById('coreBarText');
  if (bar) bar.style.width = pct + '%';
  if (barText) barText.textContent =
    allCore.length ? `${matchedCore.length}/${allCore.length} (${pct}%)` : '-';

  // ② 미선택 핵심과목
  const missing = allCore.filter(s => !isSubjectSelected(s));
  const missingSection = document.getElementById('missingSection');
  const missingList = document.getElementById('missingList');
  if (missingSection && missingList) {
    if (missing.length) {
      missingSection.style.display = '';
      missingList.innerHTML = missing.slice(0, 8).map(s =>
        `<span class="missing-tag">${escapeHtml(s)}</span>`
      ).join('');
      if (missing.length > 8) {
        missingList.innerHTML += `<span class="missing-tag">+${missing.length - 8}개</span>`;
      }
    } else {
      missingSection.style.display = 'none';
    }
  }

  // ③ 대학별 매칭 점수 TOP 5
  // 점수: core 일치 ×3 + recommended 일치 ×2 + reflected 일치 ×1
  const scored = targets.map(u => {
    const coreHit = u.core.filter(s => isSubjectSelected(s)).length;
    const recHit = u.recommended.filter(s => isSubjectSelected(s)).length;
    const refHit = u.reflected.filter(s => isSubjectSelected(s)).length;
    const total = u.core.length * 3 + u.recommended.length * 2 + u.reflected.length;
    const score = coreHit * 3 + recHit * 2 + refHit * 1;
    const pct = total ? Math.round(score / total * 100) : 0;
    return { u, score, pct };
  })
  .filter(({ u }) => u.core.length + u.recommended.length + u.reflected.length > 0)
  .sort((a, b) => b.pct - a.pct)
  .slice(0, 5);

  const rankList = document.getElementById('univRankList');
  if (rankList) {
    if (!scored.length) {
      rankList.innerHTML = '<div style="color:var(--muted);font-size:0.78rem;">해당 계열 데이터 없음</div>';
    } else {
      rankList.innerHTML = scored.map(({ u, pct }, i) => `
        <div class="univ-rank-item ${i === 0 ? 'rank-1' : ''}">
          <div>
            <div class="univ-rank-name">${escapeHtml(u.university)}</div>
            <div class="univ-rank-dept">${escapeHtml(u.department || u.series)}</div>
          </div>
          <div class="univ-rank-score">${pct}%</div>
        </div>
      `).join('');
    }
  }
}

// ── 유틸 ──────────────────────────────────
function selKey(semester, course) { return `${semester}::${course}`; }
function groupKey(semester, group) { return `${semester}_${group}`.replace(/\s/g, '_'); }
function isSelected(semester, course) { return !!selectedMap[selKey(semester, course)]; }

function countGroupSelected(semester, group) {
  return semesterCourses
    .find(s => s.semester === semester)?.courses
    .filter(c => c.group === group && isSelected(semester, c.name)).length || 0;
}

function updateGroupCount(semester, group, pick) {
  const el = document.getElementById(`count-${groupKey(semester, group)}`);
  if (!el) return;
  const count = countGroupSelected(semester, group);
  el.textContent = `${count}/${pick}`;
  el.className = `sel-group-count ${count === pick ? 'valid' : count > pick ? 'over' : ''}`;
}

function showPickWarning(semester, group, pick) {
  const el = document.getElementById(`count-${groupKey(semester, group)}`);
  if (!el) return;
  const orig = el.textContent;
  el.textContent = `최대 ${pick}과목`;
  el.className = 'sel-group-count over';
  setTimeout(() => {
    el.textContent = orig;
    updateGroupCount(semester, group, pick);
  }, 1500);
}

function setDirty(dirty) {
  isDirty = dirty;
  const btn = document.getElementById('saveSelectionBtn');
  if (btn) btn.disabled = !dirty;
}

// 외부에서 선택 데이터 접근용
export function getSelectedMap() { return { ...selectedMap }; }