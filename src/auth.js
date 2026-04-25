// ─────────────────────────────────────────
//  auth.js  —  Google OAuth 2.0 로그인 처리
//  ID 토큰(로그인) + 액세스 토큰(Sheets 쓰기) 분리 처리
// ─────────────────────────────────────────

import { CONFIG } from './config.js';
export { CONFIG };

// Sheets 쓰기에 필요한 scope
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let currentUser = null;
let accessToken = null;       // Sheets 쓰기용 액세스 토큰
let tokenClient = null;       // GIS OAuth2 토큰 클라이언트
let onLoginSuccess = null;
let pendingWriteResolve = null;

// ── 초기화 ───────────────────────────────
export function initAuth(onSuccess) {
  onLoginSuccess = onSuccess;

  window.addEventListener('load', () => {
    if (!window.google) {
      console.error('Google Identity Services 로드 실패');
      return;
    }

    // 1) ID 토큰용 (로그인 버튼)
    google.accounts.id.initialize({
      client_id: CONFIG.CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
    });

    google.accounts.id.renderButton(
      document.getElementById('googleLoginBtn'),
      { theme: 'outline', size: 'large', locale: 'ko', width: 280 }
    );

    google.accounts.id.prompt();

    // 2) 액세스 토큰용 (Sheets 쓰기)
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: SHEETS_SCOPE,
      callback: handleTokenResponse,
    });

    // 세션 복원
    const saved = sessionStorage.getItem('jjghs_user');
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
        onLoginSuccess?.(currentUser);
      } catch {
        sessionStorage.removeItem('jjghs_user');
      }
    }
  });
}

// ── ID 토큰 수신 (로그인) ─────────────────
function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);

  if (!payload.email.endsWith('@' + CONFIG.SCHOOL_DOMAIN)) {
    showLoginError(`학교 계정(@${CONFIG.SCHOOL_DOMAIN})으로만 로그인할 수 있습니다.`);
    return;
  }

  currentUser = {
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
    given_name: payload.given_name,
  };

  sessionStorage.setItem('jjghs_user', JSON.stringify(currentUser));
  hideLoginError();
  onLoginSuccess?.(currentUser);
}

// ── 액세스 토큰 수신 (Sheets 쓰기) ────────
function handleTokenResponse(response) {
  if (response.error) {
    console.error('액세스 토큰 발급 실패:', response.error);
    pendingWriteResolve?.(null);
    pendingWriteResolve = null;
    return;
  }
  accessToken = response.access_token;
  pendingWriteResolve?.(accessToken);
  pendingWriteResolve = null;
}

/**
 * Sheets 쓰기용 액세스 토큰 요청
 * 이미 발급된 토큰이 있으면 바로 반환,
 * 없으면 Google 동의 팝업을 띄우고 토큰을 기다림
 */
export function requestAccessToken() {
  return new Promise(resolve => {
    if (accessToken) {
      resolve(accessToken);
      return;
    }
    pendingWriteResolve = resolve;
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

// ── 로그아웃 ─────────────────────────────
export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
    accessToken = null;
  }
  currentUser = null;
  sessionStorage.removeItem('jjghs_user');
  google.accounts.id.disableAutoSelect();

  document.getElementById('appScreen').classList.remove('visible');
  document.getElementById('loginScreen').style.display = 'flex';
}

export function getUser() { return currentUser; }

// ── 유틸 ──────────────────────────────────
function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(
    atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')
  ));
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.add('visible');
}

function hideLoginError() {
  document.getElementById('loginError').classList.remove('visible');
}
