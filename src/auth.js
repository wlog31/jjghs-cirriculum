// ─────────────────────────────────────────
//  auth.js  —  Google OAuth 2.0 로그인 처리
// ─────────────────────────────────────────

// ★ 아래 두 값을 본인 것으로 교체하세요
export const CONFIG = {
  CLIENT_ID: '76969551904-et7o3qbghitv8og2dq1apk3r1jv6gebo.apps.googleusercontent.com',
  SCHOOL_DOMAIN: 'jjg.hs.kr',   // 학교 이메일 도메인 (확인 후 수정)
  SHEETS_ID: '1NoX-0BNOApHWXV8D431grYy8U7ZF2bULgfAqfTvFviU',
  API_KEY: 'AIzaSyA1Kop8RL_EJyeW1r40f72cVD1W1VkwZTU',        // Sheets 읽기용 (나중에 추가)
};

// 현재 로그인된 사용자 정보
let currentUser = null;

// 로그인 성공 콜백 (app.js에서 주입)
let onLoginSuccess = null;

/**
 * Google Identity Services 초기화
 * index.html의 #googleLoginBtn 안에 버튼을 렌더링합니다.
 */
export function initAuth(onSuccess) {
  onLoginSuccess = onSuccess;

  // GIS 라이브러리 로드 완료 대기
  window.addEventListener('load', () => {
    if (!window.google) {
      console.error('Google Identity Services 로드 실패');
      return;
    }

    google.accounts.id.initialize({
      client_id: CONFIG.CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
    });

    // 로그인 버튼 렌더링
    google.accounts.id.renderButton(
      document.getElementById('googleLoginBtn'),
      {
        theme: 'outline',
        size: 'large',
        locale: 'ko',
        width: 280,
      }
    );

    // 이전에 로그인한 적 있으면 자동 로그인 시도
    google.accounts.id.prompt();

    // 저장된 세션 확인
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

/**
 * Google로부터 credential(JWT) 수신 후 처리
 */
function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);

  // 학교 도메인 검사
  if (!payload.email.endsWith('@' + CONFIG.SCHOOL_DOMAIN)) {
    showLoginError(`학교 계정(@${CONFIG.SCHOOL_DOMAIN})으로만 로그인할 수 있습니다.`);
    return;
  }

  currentUser = {
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
    given_name: payload.given_name,
    token: response.credential,
  };

  // 세션 저장 (새로고침 시 유지)
  sessionStorage.setItem('jjghs_user', JSON.stringify(currentUser));

  hideLoginError();
  onLoginSuccess?.(currentUser);
}

/**
 * 로그아웃
 */
export function signOut() {
  currentUser = null;
  sessionStorage.removeItem('jjghs_user');

  if (window.google) {
    google.accounts.id.disableAutoSelect();
  }

  // 로그인 화면으로 복귀
  document.getElementById('appScreen').classList.remove('visible');
  document.getElementById('loginScreen').style.display = 'flex';
}

/**
 * 현재 사용자 반환
 */
export function getUser() {
  return currentUser;
}

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