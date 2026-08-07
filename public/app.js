document.addEventListener('DOMContentLoaded', () => {
    // 1. Socket.io Connection Setup
    const socket = io();

    // 2. Check Local/Session Storage for Existing Session
    const savedUser = localStorage.getItem('starFamUser') || sessionStorage.getItem('starFamUser');
    const authOverlay = document.getElementById('auth-overlay');
    const appContainer = document.getElementById('app');

    if (savedUser) {
        try {
            const userData = JSON.parse(savedUser);
            // Attempt auto-login with stored identifier/pin
            socket.emit('auth:login', { identifier: userData.username, pin: userData.pin }, (res) => {
                if (res.success) {
                    authOverlay.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                } else {
                    localStorage.removeItem('starFamUser');
                    sessionStorage.removeItem('starFamUser');
                }
            });
        } catch (e) {
            localStorage.removeItem('starFamUser');
        }
    }

    // 3. Form Handling: Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const identifier = document.getElementById('login-id').value.trim();
            const pin = document.getElementById('login-pin').value.trim();

            socket.emit('auth:login', { identifier, pin }, (res) => {
                if (res.success) {
                    localStorage.setItem('starFamUser', JSON.stringify({ username: identifier, pin }));
                    authOverlay.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                    window.location.reload();
                } else {
                    alert(res.message || 'Login failed.');
                }
            });
        });
    }

    // 4. Form Handling: Sign Up
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('signup-username').value.trim();
            const pin = document.getElementById('signup-pin').value.trim();
            const tag = document.getElementById('signup-tag').value.trim();
            const bio = document.getElementById('signup-bio').value.trim();
            const pfp = document.getElementById('signup-pfp').value.trim();

            socket.emit('auth:signup', { username, pin, tag, bio, pfp }, (res) => {
                if (res.success) {
                    localStorage.setItem('starFamUser', JSON.stringify({ username, pin }));
                    authOverlay.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                    window.location.reload();
                } else {
                    alert(res.message || 'Sign up failed.');
                }
            });
        });
    }

    // 5. Form Handling: Recovery
    const recoveryForm = document.getElementById('recovery-form');
    if (recoveryForm) {
        recoveryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const recoveryCode = document.getElementById('rec-code').value.trim();
            const targetTag = document.getElementById('rec-tag').value.trim();
            const newPin = document.getElementById('rec-new-pin').value.trim();
            const newUsername = document.getElementById('rec-new-username').value.trim();

            socket.emit('auth:recover', { recoveryCode, targetTag, newUsername, newPin }, (res) => {
                alert(res.message);
                if (res.success) {
                    setAuthMode('login');
                }
            });
        });
    }

    console.log("✨ Star Fam client initialized successfully.");
});

// Global Helper Functions referenced in index.html
function setAuthMode(mode) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const recoveryForm = document.getElementById('recovery-form');
    const btnLogin = document.getElementById('btn-toggle-login');
    const btnSignup = document.getElementById('btn-toggle-signup');

    loginForm.classList.add('hidden');
    signupForm.classList.add('hidden');
    recoveryForm.classList.add('hidden');
    if (btnLogin) btnLogin.classList.remove('active');
    if (btnSignup) btnSignup.classList.remove('active');

    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        if (btnLogin) btnLogin.classList.add('active');
    } else if (mode === 'signup') {
        signupForm.classList.remove('hidden');
        if (btnSignup) btnSignup.classList.add('active');
    }
}

function openRecoveryScreen() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('recovery-form').classList.remove('hidden');
}

function closeLeaderboardModal() {
    document.getElementById('leaderboard-modal').classList.add('hidden');
}

function openLeaderboardModal() {
    document.getElementById('leaderboard-modal').classList.remove('hidden');
}

function closeTriviaModal() {
    document.getElementById('trivia-modal').classList.add('hidden');
}

function openTriviaModal() {
    document.getElementById('trivia-modal').classList.remove('hidden');
}

function closeAssetsModal() {
    document.getElementById('assets-modal').classList.add('hidden');
}

function openAssetsModal() {
    document.getElementById('assets-modal').classList.remove('hidden');
}

function closePollModal() {
    document.getElementById('poll-modal').classList.add('hidden');
}

function openPollModal() {
    document.getElementById('poll-modal').classList.remove('hidden');
}

function closeAnalytics() {
    document.getElementById('analytics-modal').classList.add('hidden');
}

function openAnalytics() {
    document.getElementById('analytics-modal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}

function openMyProfile() {
    document.getElementById('profile-modal').classList.remove('hidden');
}

function toggleNotifBox() {
    const box = document.getElementById('notif-box');
    if (box) box.classList.toggle('hidden');
}

function switchRoom(room) {
    // Room switching logic handler placeholder
}

function sendMessage() {
    // Message sending handler placeholder
}

function handleKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}