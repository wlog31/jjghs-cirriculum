// ─────────────────────────────────────────
//  sheets.js  —  Google Sheets API v4 연동
// ─────────────────────────────────────────
import { CONFIG } from './auth.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// 공개 시트 ID (학기별과목, 대학추천과목)
const publicId = () => CONFIG.SHEETS_ID;
// 비공개 시트 ID (학생선택) — 없으면 공개 ID 사용
const privateId = () => CONFIG.PRIVATE_SHEETS_ID || CONFIG.SHEETS_ID;

// ── 공통 fetch 헬퍼 ───────────────────────

async function sheetsGet(range, token = null, sheetId = null) {
  const id = sheetId || publicId();
  let url, headers = {};
  if (token) {
    url = `${BASE}/${id}/values/${encodeURIComponent(range)}`;
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    url = `${BASE}/${id}/values/${encodeURIComponent(range)}?key=${CONFIG.API_KEY}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Sheets API 오류 [${range}]: ${err.error?.message}`);
  }
  const data = await res.json();
  return data.values || [];
}

// 학생 데이터 쓰기용 (OAuth 토큰 필요)
async function sheetsAppend(range, values, token, sheetId = null) {
  const id = sheetId || publicId();
  const url = `${BASE}/${id}/values/${encodeURIComponent(range)}:append`
    + `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Sheets 쓰기 오류: ${err.error?.message}`);
  }
  return res.json();
}

async function sheetsUpdate(range, values, token, sheetId = null) {
  const id = sheetId || publicId();
  const url = `${BASE}/${id}/values/${encodeURIComponent(range)}`
    + `?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Sheets 업데이트 오류: ${err.error?.message}`);
  }
  return res.json();
}

// ── 행 → 객체 변환 헬퍼 ──────────────────

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  );
}

function splitPipe(str) {
  if (!str || str.trim() === '') return [];
  return str.split('|').map(s => s.trim()).filter(Boolean);
}

// ── 학기별 과목 ───────────────────────────

export async function fetchSemesterCourses() {
  const cached = sessionStorage.getItem('cache_semester');
  if (cached) return JSON.parse(cached);

  const rows = await sheetsGet('학기별과목!A:H');
  const objects = rowsToObjects(rows);

  // semester 기준으로 그룹핑
  const map = new Map();
  for (const obj of objects) {
    const sem = obj.semester;
    if (!map.has(sem)) {
      map.set(sem, {
        semester: sem,
        requiredSubjects: splitPipe(obj.requiredSubjects),
        courses: [],
      });
    }
    map.get(sem).courses.push({
      name: obj.name,
      area: obj.area,
      type: obj.type,
      group: obj.group,
      pick: Number(obj.pick),
      credit: Number(obj.credit),
    });
  }

  const result = [...map.values()];
  sessionStorage.setItem('cache_semester', JSON.stringify(result));
  return result;
}

// ── 대학 추천 과목 ────────────────────────

export async function fetchUniversityRecommendations() {
  const cached = sessionStorage.getItem('cache_univ');
  if (cached) return JSON.parse(cached);

  const rows = await sheetsGet('대학추천과목!A:J');
  const objects = rowsToObjects(rows);

  const result = objects.map(obj => ({
    university: obj.university,
    regionArea: obj.regionArea,
    series: obj.series,
    department: obj.department,
    detailDepartment: obj.detailDepartment,
    tags: splitPipe(obj.tags),
    core: splitPipe(obj.core),
    recommended: splitPipe(obj.recommended),
    reflected: splitPipe(obj.reflected),
    note: obj.note,
  }));

  sessionStorage.setItem('cache_univ', JSON.stringify(result));
  return result;
}

// ── 학생 선택 데이터 ──────────────────────

// 그룹별 열 매핑
const GROUP_MAP = [
  { semester: '2학년 1학기', group: '선택3', pick: 3 },
  { semester: '2학년 1학기', group: '선택4', pick: 1 },
  { semester: '2학년 2학기', group: '선택5', pick: 3 },
  { semester: '2학년 2학기', group: '선택6', pick: 1 },
  { semester: '3학년 1학기', group: '선택7', pick: 5 },
  { semester: '3학년 1학기', group: '선택8', pick: 2 },
  { semester: '3학년 1학기', group: '선택9', pick: 1 },
  { semester: '3학년 2학기', group: '선택10', pick: 8 },
  { semester: '3학년 2학기', group: '선택11', pick: 1 },
];

// selectedMap → 행 배열 변환
// 키 형식: 'semester::group::courseName'
function selectionToRow(selectedMap, email, name) {
  const now = new Date().toISOString();
  const row = [now, email, name];
  for (const { semester, group, pick } of GROUP_MAP) {
    const prefix = semester + '::' + group + '::';
    const selected = Object.keys(selectedMap)
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
    for (let i = 0; i < pick; i++) row.push(selected[i] || '');
  }
  return row;
}

// 행 배열 → selectedMap 변환
function rowToSelection(row) {
  const selectedMap = {};
  let col = 3;
  for (const { semester, group, pick } of GROUP_MAP) {
    for (let i = 0; i < pick; i++) {
      const courseName = row[col] || '';
      if (courseName) selectedMap[`${semester}::${group}::${courseName}`] = true;
      col++;
    }
  }
  return selectedMap;
}

export async function fetchStudentSelection(email, token) {
  const rows = await sheetsGet('학생선택!A:AB', token, privateId());
  if (rows.length < 2) return null;
  let lastRow = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === email) lastRow = rows[i];
  }
  if (!lastRow) return null;
  return rowToSelection(lastRow);
}

export async function saveStudentSelection(email, name, selectedMap, token) {
  const pid = privateId();
  const rows = await sheetsGet('학생선택!A:AB', token, pid);
  const newRow = selectionToRow(selectedMap, email, name);
  let existingRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === email) existingRowNum = i + 1;
  }
  if (existingRowNum > 0) {
    await sheetsUpdate(`학생선택!A${existingRowNum}:AB${existingRowNum}`, [newRow], token, pid);
  } else {
    await sheetsAppend('학생선택!A:AB', [newRow], token, pid);
  }
}

// ── 설정값 ────────────────────────────────

export async function fetchConfig() {
  const cached = sessionStorage.getItem('cache_config');
  if (cached) return JSON.parse(cached);

  const rows = await sheetsGet('설정!A:B');
  const obj = {};
  for (const row of rows.slice(1)) {
    if (row[0]) obj[row[0]] = row[1] ?? '';
  }

  sessionStorage.setItem('cache_config', JSON.stringify(obj));
  return obj;
}