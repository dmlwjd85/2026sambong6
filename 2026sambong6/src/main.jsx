/**
 * 첫 화면은 로그인뿐입니다. 앱과 Firebase는 들어갈 때 불러옵니다.
 */
const shellUrl = new URL('./app-shell.html', import.meta.url).href;

function rememberedClass() {
    try {
        const list = JSON.parse(localStorage.getItem('sambong_recent_classes') || '[]');
        return Array.isArray(list) && list.length ? list[0] : null;
    } catch (_) {
        return null;
    }
}

function hasSavedLogin() {
    return !!(localStorage.getItem('sambong_student_id') && localStorage.getItem('sambong_student_pin'));
}

window.revealLoginForm = function() {
    document.documentElement.classList.remove('boot-resume');
    const sk = document.getElementById('bootSkeleton');
    const stack = document.getElementById('loginStack');
    if (sk) sk.hidden = true;
    if (stack) stack.hidden = false;
};

let appPromise = null;
function ensureApp() {
    if (!appPromise) {
        appPromise = (async () => {
            const html = await (await fetch(shellUrl)).text();
            const mount = document.getElementById('appMount');
            if (mount && !mount.firstElementChild) mount.innerHTML = html;
            await import('./app-entry.js');
        })().catch((error) => {
            appPromise = null;
            window.revealLoginForm();
            throw error;
        });
    }
    return appPromise;
}

window.setLoginMode = function(mode) {
    const isTeacher = mode === 'teacher';
    document.body.dataset.loginMode = isTeacher ? 'teacher' : 'student';
    const student = document.getElementById('loginPanelStudent');
    const teacher = document.getElementById('loginPanelTeacher');
    const btnS = document.getElementById('loginModeStudentBtn');
    const btnT = document.getElementById('loginModeTeacherBtn');
    if (student) student.classList.toggle('hidden', isTeacher);
    if (teacher) teacher.classList.toggle('hidden', !isTeacher);
    if (btnS) btnS.className = isTeacher ? 'oly-btn oly-btn-secondary oly-btn-md' : 'oly-btn oly-btn-primary oly-btn-md';
    if (btnT) btnT.className = isTeacher ? 'oly-btn oly-btn-primary oly-btn-md' : 'oly-btn oly-btn-secondary oly-btn-md';
    const hint = document.getElementById('loginRoleHint');
    if (hint) {
        hint.textContent = isTeacher
            ? '초대 코드로 우리 학급을 연 뒤 마스터 PIN을 넣으세요.'
            : '이름이 기억되어 있으면 비밀번호만 누르면 됩니다.';
    }
};

window.loginAsSomeoneElse = function() {
    localStorage.removeItem('sambong_student_id');
    localStorage.removeItem('sambong_student_pin');
    document.documentElement.classList.remove('boot-resume');
    location.reload();
};

function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
}

bind('loginModeStudentBtn', () => window.setLoginMode('student'));
bind('loginModeTeacherBtn', () => window.setLoginMode('teacher'));
bind('btnSwitchUserBoot', () => window.loginAsSomeoneElse());
bind('btnSwitchUserLogin', () => window.loginAsSomeoneElse());

bind('btnApplyClass', async () => {
    await ensureApp();
    if (typeof window.applyLoginClassCode === 'function') await window.applyLoginClassCode();
});
bind('btnLogin', async () => {
    await ensureApp();
    if (typeof window.submitStudentLogin === 'function') window.submitStudentLogin();
});
bind('btnLoginTeacher', async () => {
    await ensureApp();
    if (typeof window.submitTeacherLogin === 'function') window.submitTeacherLogin();
});
bind('btnTeacherJoin', async () => {
    await ensureApp();
    if (typeof window.applyTeacherJoinCode === 'function') await window.applyTeacherJoinCode();
});
bind('teacherSubJoinBtn', async () => {
    await ensureApp();
    if (typeof window.setTeacherSubMode === 'function') window.setTeacherSubMode('join');
});
bind('teacherSubCreateBtn', async () => {
    await ensureApp();
    if (typeof window.setTeacherSubMode === 'function') window.setTeacherSubMode('create');
});
bind('btnTeacherUnlock', async () => {
    await ensureApp();
    if (typeof window.verifyTeacherCreateUnlock === 'function') await window.verifyTeacherCreateUnlock();
});
bind('btnCreateClass', async () => {
    await ensureApp();
    if (typeof window.createClassFromLogin === 'function') await window.createClassFromLogin();
});
bind('btnGuest', async () => {
    window._guestDemoActive = true;
    document.body.classList.add('is-guest', 'is-guest-demo');
    await ensureApp();
    if (typeof window.loginAsGuest === 'function') await window.loginAsGuest();
});
bind('btnLoginHelp', async () => {
    await ensureApp();
    if (typeof window.switchTab === 'function') window.switchTab('help');
    if (typeof window.dismissLoginOverlay === 'function') window.dismissLoginOverlay();
});

const unlockInput = document.getElementById('teacherCreateUnlockInput');
if (unlockInput) {
    unlockInput.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        await ensureApp();
        if (typeof window.verifyTeacherCreateUnlock === 'function') await window.verifyTeacherCreateUnlock();
    });
}

const loginPin = document.getElementById('loginPin');
if (loginPin) {
    loginPin.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const btn = document.getElementById('btnLogin');
        if (btn) btn.click();
    });
}

const recent = rememberedClass();
const code = document.getElementById('loginClassCode');
const remembered = document.getElementById('loginRemembered');
if (recent && code && !code.value) code.value = recent.inviteCode || '';
if (recent && remembered) {
    remembered.hidden = false;
    remembered.textContent = `기억한 학급: ${recent.displayName || recent.inviteCode || '우리 반'}`;
}

document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (document.body.classList.contains('oly-app-in')) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (event.target && event.target.isContentEditable)) return;
    const overlay = document.getElementById('loginOverlay');
    if (!overlay || overlay.classList.contains('is-dismissed')) return;
    const items = [...overlay.querySelectorAll('button, a, summary')].filter((el) => {
        if (el.disabled || el.hidden || el.closest('.hidden,[hidden]')) return false;
        return el.getClientRects().length > 0;
    });
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (index < 0) {
        items[0].focus();
        event.preventDefault();
        return;
    }
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    items[(index + (forward ? 1 : items.length - 1)) % items.length].focus();
    event.preventDefault();
});

if (hasSavedLogin()) void ensureApp();
