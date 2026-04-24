// ─────────────────────────────────────────
//  sheets.js  —  Google Sheets API v4 연동
// ─────────────────────────────────────────
import { CONFIG } from './auth.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// ── 공통 fetch 헬퍼 ───────────────────────

async function sheetsGet(range) {
  const url = `${BASE}/${CONFIG.SHEETS_ID}/values/${encodeURIComponent(range)}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Sheets API 오류 [${range}]: ${err.error?.message}`);
  }
  const data = await res.json();
  return data.values || [];
}

// 학생 데이터 쓰기용 (OAuth 토큰 필요)
async function sheetsAppend(range, values, token) {
  const url = `${BASE}/${CONFIG.SHEETS_ID}/values/${encodeURIComponent(range)}:append`
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

async function sheetsUpdate(range, values, token) {
  const url = `${BASE}/${CONFIG.SHEETS_ID}/values/${encodeURIComponent(range)}`
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

/**
 * 해당 학생의 선택 데이터 불러오기
 * 학생선택 시트에서 email 일치하는 마지막 행 반환
 */
export async function fetchStudentSelection(email, token) {
  const rows = await sheetsGet('학생선택!A:F');
  if (rows.length < 2) return null;

  const headers = rows[0];
  const emailIdx = headers.indexOf('email');
  const dataIdx = headers.indexOf('selectedSubjects');

  // 해당 이메일의 마지막 행 찾기
  let lastRow = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][emailIdx] === email) {
      lastRow = rows[i];
    }
  }

  if (!lastRow) return null;

  try {
    return JSON.parse(lastRow[dataIdx] || '{}');
  } catch {
    return {};
  }
}

/**
 * 학생 선택 데이터 저장
 * 기존 행이 있으면 업데이트, 없으면 새 행 추가
 */
export async function saveStudentSelection(email, name, selectedSubjects, token) {
  const rows = await sheetsGet('학생선택!A:F');
  const headers = rows[0] || [];
  const emailIdx = headers.indexOf('email');

  const now = new Date().toISOString();
  const newRow = [
    now,                                    // timestamp
    email,                                  // email
    name,                                   // name
    '',                                     // semester (미사용)
    JSON.stringify(selectedSubjects),       // selectedSubjects
    now,                                    // updatedAt
  ];

  // 기존 행 찾기
  let existingRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][emailIdx] === email) {
      existingRowNum = i + 1; // Sheets는 1-based
    }
  }

  if (existingRowNum > 0) {
    // 기존 행 업데이트
    await sheetsUpdate(`학생선택!A${existingRowNum}:F${existingRowNum}`, [newRow], token);
  } else {
    // 새 행 추가
    await sheetsAppend('학생선택!A:F', [newRow], token);
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