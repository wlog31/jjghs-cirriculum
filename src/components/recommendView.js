// ─────────────────────────────────────────
//  components/recommendView.js  —  대학별 추천 카드
// ─────────────────────────────────────────
import { escapeHtml, isCourseOpened, ensureArray } from '../utils/normalize.js';

function subjectTag(name, tone = '') {
  const opened = isCourseOpened(name);
  const cls = opened && tone ? tone : '';
  return `<span class="tag ${cls}">${escapeHtml(name)}</span>`;
}

// ── 필터 상태 ─────────────────────────────
export const filterState = {
  search: '',
  regionArea: new Set(),
  series: new Set(),
  department: new Set(),
  sort: 'name',
};

// ── 필터 옵션 렌더링 ──────────────────────
export function renderFilterOptions(catalog) {
  renderMultiFilter('regionOptions', 'regionSummary', 'regionArea',
    [...new Set(catalog.map(i => i.regionArea).filter(Boolean))].sort(), catalog);
  renderMultiFilter('seriesOptions', 'seriesSummary', 'series',
    [...new Set(catalog.map(i => i.series).filter(Boolean))].sort(), catalog);
  renderMultiFilter('departmentOptions', 'departmentSummary', 'department',
    [...new Set(catalog.map(i => i.department).filter(Boolean))].sort(), catalog);
}

function renderMultiFilter(optionsId, summaryId, key, values, catalog) {
  const container = document.getElementById(optionsId);
  const summary = document.getElementById(summaryId);
  if (!container) return;

  container.innerHTML = values.map(val => {
    const count = catalog.filter(i => i[key] === val).length;
    const checked = filterState[key].has(val);
    return `
      <label class="filter-option">
        <input type="checkbox" data-filter-key="${key}" value="${escapeHtml(val)}" ${checked ? 'checked' : ''}>
        <div class="filter-option-text">
          <div class="filter-option-name">${escapeHtml(val)}</div>
          <div class="filter-option-count">${count}개</div>
        </div>
      </label>
    `;
  }).join('');

  updateFilterSummary(summaryId, key);
}

function updateFilterSummary(summaryId, key) {
  const el = document.getElementById(summaryId);
  if (!el) return;
  const sel = filterState[key];
  el.textContent = sel.size === 0 ? '전체' : [...sel].join(', ');
}

// ── 필터 적용 ─────────────────────────────
export function getFilteredCatalog(catalog) {
  const query = filterState.search.replace(/\s/g, '').toLowerCase();
  return catalog.filter(item => {
    if (filterState.regionArea.size && !filterState.regionArea.has(item.regionArea)) return false;
    if (filterState.series.size && !filterState.series.has(item.series)) return false;
    if (filterState.department.size && !filterState.department.has(item.department)) return false;
    if (query) {
      const text = [item.university, item.regionArea, item.series, item.department,
        ...item.core, ...item.recommended, ...item.reflected, item.note
      ].join('').replace(/\s/g, '').toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (filterState.sort === 'core') return b.core.length - a.core.length;
    if (filterState.sort === 'match') {
      const openedA = [...a.core, ...a.recommended, ...a.reflected].filter(isCourseOpened).length;
      const openedB = [...b.core, ...b.recommended, ...b.reflected].filter(isCourseOpened).length;
      return openedB - openedA;
    }
    return (a.university + a.series + a.department).localeCompare(
      b.university + b.series + b.department, 'ko');
  });
}

// ── 대학 카드 렌더링 ──────────────────────
export function renderRecommendations(items) {
  const grid = document.getElementById('recommendGrid');
  const stats = document.getElementById('recommendStats');
  if (!grid) return;

  if (stats) stats.textContent = `${items.length}개 대학 반영과목 블록 표시 중`;

  if (!items.length) {
    grid.innerHTML = `<div class="empty">조건에 맞는 계열·모집단위 반영과목 블록이 없습니다.</div>`;
    return;
  }

  grid.innerHTML = items.map(item => {
    const allSubjects = [...new Set([...item.core, ...item.recommended, ...item.reflected])];
    const missing = allSubjects.filter(s => !isCourseOpened(s));

    return `
      <article class="recommend-card">
        <div class="recommend-header">
          <div class="recommend-title">
            <h3>${escapeHtml(item.university)}</h3>
            <div class="division-line">권역-지역: ${escapeHtml(item.regionArea || '-')}</div>
          </div>
          <div class="department-name">계열-학과: ${escapeHtml(item.series || '-')}-${escapeHtml(item.department || '-')}</div>
        </div>
        <div class="recommend-body">
          ${item.core.length ? `
            <div class="info-row">
              <span class="label">핵심과목</span>
              <span class="value subject-cloud">
                ${item.core.map(s => subjectTag(s, isCourseOpened(s) ? 'core' : '')).join('')}
              </span>
            </div>` : ''}
          ${item.recommended.length ? `
            <div class="info-row">
              <span class="label">권장과목</span>
              <span class="value subject-cloud">
                ${item.recommended.map(s => subjectTag(s, isCourseOpened(s) ? 'recommended' : '')).join('')}
              </span>
            </div>` : ''}
          ${item.reflected.length ? `
            <div class="info-row">
              <span class="label">반영과목</span>
              <span class="value subject-cloud">
                ${item.reflected.map(s => subjectTag(s, isCourseOpened(s) ? 'reflected' : '')).join('')}
              </span>
            </div>` : ''}
          <div class="match-note">
            ${escapeHtml(item.note || '노트 없음')}
            ${missing.length ? ` 추가 확인: ${missing.slice(0, 4).map(escapeHtml).join(', ')}` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// ── 필터 이벤트 바인딩 ────────────────────
export function bindFilterEvents(onUpdate) {
  document.getElementById('searchInput')?.addEventListener('input', e => {
    filterState.search = e.target.value;
    onUpdate();
  });

  document.getElementById('sortSelect')?.addEventListener('change', e => {
    filterState.sort = e.target.value;
    onUpdate();
  });

  document.getElementById('multiFilterGroups')?.addEventListener('change', e => {
    const input = e.target.closest('input[type="checkbox"][data-filter-key]');
    if (!input) return;
    const key = input.dataset.filterKey;
    if (!filterState[key]) return;
    input.checked ? filterState[key].add(input.value) : filterState[key].delete(input.value);
    updateFilterSummary(
      { regionArea: 'regionSummary', series: 'seriesSummary', department: 'departmentSummary' }[key], key
    );
    onUpdate();
  });

  document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
    filterState.regionArea.clear();
    filterState.series.clear();
    filterState.department.clear();
    filterState.search = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    onUpdate();
  });

  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('.multi-filter')) {
      document.querySelectorAll('.multi-filter[open]').forEach(el => el.removeAttribute('open'));
    }
  });
}
