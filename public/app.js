const socket = io();

let currentUser = null;
let currentRoom = 'creator';

const authOverlay = document.getElementById('auth-overlay');
const mainAppContainer = document.getElementById('app');

function setAuthMode(mode) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const recoveryForm = document.getElementById('recovery-form');
  const btnLogin = document.getElementById('btn-toggle-login');
  const btnSignup = document.getElementById('btn-toggle-signup');

  if (!loginForm || !signupForm || !recoveryForm) return;

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

// LOGIN SUBMISSION
const loginFormEl = document.getElementById('login-form');
if (loginFormEl) {
  loginFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-id').value.trim();
    const pin = document.getElementById('login-pin').value.trim();

    socket.emit('auth:login', { identifier, pin }, (res) => {
      if (!res.success) {
        alert(res.message);
      }
    });
  });
}

// SIGNUP SUBMISSION
const signupFormEl = document.getElementById('signup-form');
if (signupFormEl) {
  signupFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const pin = document.getElementById('signup-pin').value.trim();
    const tag = document.getElementById('signup-tag').value.trim();
    const bio = document.getElementById('signup-bio').value.trim();
    let pfp = document.getElementById('signup-pfp').value.trim();

    const fileInput = document.getElementById('pfp-file-input');
    if (fileInput && fileInput.files[0]) {
      pfp = await uploadFileToServer(fileInput.files[0]);
    }

    socket.emit('auth:signup', { username, pin, tag, bio, pfp }, (res) => {
      if (!res.success) {
        alert(res.message);
      }
    });
  });
}

// AUTH SUCCESS: Hides login overlay and reveals main app
socket.on('auth:success', (user) => {
  currentUser = user;

  if (authOverlay) authOverlay.classList.add('hidden');
  if (mainAppContainer) mainAppContainer.classList.remove('hidden');

  // Update profile block in sidebar
  document.getElementById('my-name').textContent = user.username;
  document.getElementById('my-tag').textContent = user.tag;
  document.getElementById('my-role').textContent = user.role;
  document.getElementById('my-avatar').textContent = user.username.charAt(0).toUpperCase();

  if (user.username.toLowerCase() === 'starediter1' || user.role.includes('Owner')) {
    document.getElementById('btn-analytics').classList.remove('hidden');
    document.getElementById('btn-notif-bell').classList.remove('hidden');
  }

  loadRoomContent();
});

function switchRoom(room) {
  currentRoom = room;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  if (room === 'creator') {
    document.getElementById('btn-creator').classList.add('active');
    document.getElementById('room-title').textContent = '👑 Creator Direct Chat';
    document.getElementById('room-desc').textContent = 'Direct private communication line with @starediter1';
    document.getElementById('btn-create-poll').classList.add('hidden');
  } else if (room === 'global') {
    document.getElementById('btn-global').classList.add('active');
    document.getElementById('room-title').textContent = '🌐 Community Lounge';
    document.getElementById('room-desc').textContent = 'Public lounge for presets, edits & polls';
    document.getElementById('btn-create-poll').classList.remove('hidden');
  } else if (room === 'editing-comp') {
    document.getElementById('btn-comp').classList.add('active');
    document.getElementById('room-title').textContent = '🏆 Editing Comp';
    document.getElementById('room-desc').textContent = 'Official Editing Competition channel!';
    document.getElementById('btn-create-poll').classList.remove('hidden');
  }

  loadRoomContent();
}

function loadRoomContent() {
  socket.emit('chat:fetch_history', { room: currentRoom }, (messages) => {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    messages.forEach(msg => renderMessage(msg));
  });
  
  socket.emit('poll:fetch', currentRoom, (polls) => {
    renderPolls(polls);
  });
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text) return;

  socket.emit('chat:send', { targetRoom: currentRoom, text });
  input.value = '';
}

function handleKeyPress(e) {
  if (e.key === 'Enter') sendMessage();
}

socket.on('chat:message', (msg) => {
  if (msg.targetRoom === currentRoom) {
    renderMessage(msg);
  }
});

function renderMessage(msg) {
  const container = document.getElementById('messages-container');
  const div = document.createElement('div');
  div.className = `message-row ${msg.sender === currentUser.username ? 'my-msg' : ''}`;
  
  const canDelete = currentUser.username === msg.sender || currentUser.role.includes('Owner');
  const deleteBtn = canDelete ? `<button onclick="deleteMessage('${msg.id}')" style="background:none;border:none;color:#ff8888;cursor:pointer;font-size:0.7rem;float:right;">🗑️</button>` : '';

  div.innerHTML = `
    <div class="msg-bubble glass-box">
      ${deleteBtn}
      <div style="font-size:0.75rem; color:var(--text-muted);">@${msg.sender} (${msg.role})</div>
      <div>${msg.text}</div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function deleteMessage(msgId) {
  socket.emit('chat:delete', { msgId, room: currentRoom });
}

socket.on('chat:refresh', () => {
  loadRoomContent();
});

// Modals
function openMyProfile() {
  document.getElementById('profile-modal').classList.remove('hidden');
  document.getElementById('modal-username').textContent = currentUser.username;
  document.getElementById('modal-tag').textContent = currentUser.tag;
  document.getElementById('modal-role').textContent = currentUser.role;
  document.getElementById('modal-bio').textContent = currentUser.bio;
  document.getElementById('modal-pfp').textContent = currentUser.username.charAt(0).toUpperCase();
  document.getElementById('edit-profile-section').classList.remove('hidden');
  document.getElementById('edit-tag').value = currentUser.tag;
  document.getElementById('edit-bio').value = currentUser.bio;
  document.getElementById('edit-paypal').value = currentUser.paypalEmail || '';
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.add('hidden');
}

function logoutUser() {
  location.reload();
}

function openLeaderboardModal() {
  document.getElementById('leaderboard-modal').classList.remove('hidden');
  socket.emit('leaderboard:fetch', (list) => {
    const ul = document.getElementById('leaderboard-list');
    ul.innerHTML = '';
    list.forEach((u, i) => {
      const li = document.createElement('li');
      li.textContent = `#${i+1} @${u.username} (${u.selectedApp}) - ${u.score} pts [${u.level}]`;
      ul.appendChild(li);
    });
  });
}

function closeLeaderboardModal() {
  document.getElementById('leaderboard-modal').classList.add('hidden');
}

function openTriviaModal() {
  document.getElementById('trivia-modal').classList.remove('hidden');
  document.getElementById('trivia-app-select').classList.remove('hidden');
  document.getElementById('trivia-game-box').classList.add('hidden');
}

function closeTriviaModal() {
  document.getElementById('trivia-modal').classList.add('hidden');
}

function openAssetsModal() {
  document.getElementById('assets-modal').classList.remove('hidden');
  fetchAssets();
}

function closeAssetsModal() {
  document.getElementById('assets-modal').classList.add('hidden');
}

function openPollModal() {
  document.getElementById('poll-modal').classList.remove('hidden');
}

function closePollModal() {
  document.getElementById('poll-modal').classList.add('hidden');
}

function openAnalytics() {
  document.getElementById('analytics-modal').classList.remove('hidden');
  socket.emit('analytics:fetch', (data) => {
    document.getElementById('stat-registered').textContent = data.registeredCount;
    document.getElementById('stat-online').textContent = data.activeOnline;
    document.getElementById('stat-hours').textContent = data.hoursUsed;
    document.getElementById('stat-revenue').textContent = data.revenue;
  });
}

function closeAnalytics() {
  document.getElementById('analytics-modal').classList.add('hidden');
}

function toggleNotifBox() {
  const box = document.getElementById('notif-box');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    socket.emit('notifications:fetch', (notifs) => {
      const list = document.getElementById('notif-list');
      list.innerHTML = '';
      notifs.forEach(n => {
        const li = document.createElement('li');
        li.textContent = n.text;
        list.appendChild(li);
      });
    });
  }
}

async function uploadFileToServer(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  return data.url;
}