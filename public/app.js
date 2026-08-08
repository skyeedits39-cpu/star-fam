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
      if (res && !res.success) {
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
      if (res && !res.success) {
        alert(res.message);
      }
    });
  });
}

// AUTH SUCCESS
socket.on('auth:success', (user) => {
  currentUser = user;

  if (authOverlay) authOverlay.classList.add('hidden');
  if (mainAppContainer) mainAppContainer.classList.remove('hidden');

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
    if (messages) messages.forEach(msg => renderMessage(msg));
  });
  
  socket.emit('poll:fetch', currentRoom, (polls) => {
    if (polls) polls.forEach(poll => renderMessage({ ...poll, type: 'poll', sender: poll.creator }));
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
  if (!container || !currentUser) return;
  
  const div = document.createElement('div');
  div.className = `message-row ${msg.sender === currentUser.username ? 'my-msg' : ''}`;

  if (msg.type === 'poll') {
    let optionsHtml = '';
    const totalVotes = msg.options ? msg.options.reduce((acc, opt) => acc + (opt.votes ? opt.votes.length : 0), 0) : 0;

    msg.options.forEach((opt, index) => {
      const voteCount = opt.votes ? opt.votes.length : 0;
      const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

      optionsHtml += `
        <div onclick="voteOnPoll('${msg.id}', ${index})" style="background: rgba(147, 51, 234, 0.15); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; margin-bottom: 4px; cursor: pointer; position: relative; overflow: hidden;">
          <div style="position: absolute; top:0; left:0; bottom:0; width: ${percentage}%; background: rgba(147, 51, 234, 0.3); z-index: 1;"></div>
          <div style="display: flex; justify-content: space-between; position: relative; z-index: 2; font-size: 0.8rem;">
            <span>${opt.text}</span>
            <span style="color: var(--accent-light);">${percentage}% (${voteCount})</span>
          </div>
        </div>
      `;
    });

    const canDeletePoll = currentUser.username === msg.sender || currentUser.role.includes('Owner');
    const deleteBtn = canDeletePoll ? `<button onclick="deletePoll('${msg.id}')" style="background:none; border:none; color:#ff8888; font-size:0.7rem; cursor:pointer; float:right;">🗑️ Delete</button>` : '';

    div.innerHTML = `
      <div class="msg-bubble glass-box" style="width: 280px; max-width: 90%; padding: 10px;">
        ${deleteBtn}
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">📊 Poll by @${msg.sender}</div>
        <div style="font-weight:bold; font-size:0.85rem; margin-bottom:8px;">${msg.question}</div>
        ${optionsHtml}
        <div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px; text-align:right;">Total Votes: ${totalVotes}</div>
      </div>
    `;
  } else {
    const canDelete = currentUser.username === msg.sender || currentUser.role.includes('Owner');
    const deleteBtn = canDelete ? `<button onclick="deleteMessage('${msg.id}')" style="background:none;border:none;color:#ff8888;cursor:pointer;font-size:0.7rem;float:right;">🗑️</button>` : '';

    div.innerHTML = `
      <div class="msg-bubble glass-box">
        ${deleteBtn}
        <div style="font-size:0.75rem; color:var(--text-muted);">@${msg.sender} (${msg.role})</div>
        <div>${msg.text}</div>
      </div>
    `;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function deleteMessage(msgId) {
  socket.emit('chat:delete', { msgId, room: currentRoom });
}

function voteOnPoll(pollId, optionIdx) {
  socket.emit('poll:vote', { pollId, optionIdx });
}

function deletePoll(pollId) {
  if (confirm('Delete this poll?')) {
    socket.emit('poll:delete', { pollId });
  }
}

socket.on('poll:updated', ({ room }) => {
  if (room === currentRoom) {
    loadRoomContent();
  }
});

socket.on('chat:refresh', () => {
  loadRoomContent();
});

// POLL CREATION
function openPollModal() {
  document.getElementById('poll-modal').classList.remove('hidden');
}

function closePollModal() {
  document.getElementById('poll-modal').classList.add('hidden');
}

function submitNewPoll() {
  const qEl = document.getElementById('poll-q-input');
  const optInputs = document.querySelectorAll('.poll-opt-input');
  
  if (!qEl) return;
  const question = qEl.value.trim();
  const options = [];
  optInputs.forEach(input => {
    if (input.value.trim()) options.push(input.value.trim());
  });

  if (!question || options.length < 2) {
    alert('Please enter a question and at least 2 options.');
    return;
  }

  socket.emit('poll:create', { room: currentRoom, question, options });
  qEl.value = '';
  optInputs.forEach(i => i.value = '');
  closePollModal();
}

// PROFILE & PAYMENTS
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

function saveProfileChanges() {
  const newTag = document.getElementById('edit-tag').value.trim();
  const newBio = document.getElementById('edit-bio').value.trim();
  const newPaypal = document.getElementById('edit-paypal').value.trim();

  socket.emit('profile:update', { tag: newTag, bio: newBio, paypalEmail: newPaypal }, (res) => {
    if (res && res.success) {
      currentUser.tag = newTag || currentUser.tag;
      currentUser.bio = newBio || currentUser.bio;
      currentUser.paypalEmail = newPaypal || currentUser.paypalEmail;
      document.getElementById('my-tag').textContent = currentUser.tag;
      alert('Profile updated successfully!');
      closeProfileModal();
    } else {
      alert(res?.message || 'Failed to update profile');
    }
  });
}

function processPayment(type) {
  const paypalEmail = currentUser.paypalEmail || 'starediter1@gmail.com';
  let amount = 3;
  let itemName = 'Personal Edit';

  if (type === 'donate') {
    const amtInput = document.getElementById('donate-amount');
    amount = amtInput ? parseFloat(amtInput.value) || 5 : 5;
    itemName = 'Creator Donation';
  } else if (type === 'velocity') {
    itemName = 'Velocity Edit ($3 USD)';
  } else if (type === 'tiktok') {
    itemName = 'TikTok Edit ($3 USD)';
  }

  alert(`Redirecting to PayPal for $${amount}. After payment, you will be directed to @starediter1's chat!`);
  const paypalUrl = `https://www.paypal.com/cgi-bin/websc?cmd=_xclick&business=${encodeURIComponent(paypalEmail)}&item_name=${encodeURIComponent(itemName)}&amount=${amount}&currency_code=USD`;
  window.open(paypalUrl, '_blank');
}

function logoutUser() {
  location.reload();
}

// LEADERBOARD
function openLeaderboardModal() {
  document.getElementById('leaderboard-modal').classList.remove('hidden');
  socket.emit('leaderboard:fetch', (list) => {
    const ul = document.getElementById('leaderboard-list');
    ul.innerHTML = '';
    if (!list || list.length === 0) {
      ul.innerHTML = `<li>#1 @${currentUser.username} (${currentUser.selectedApp || 'After Effects'}) - ${currentUser.score || 100} pts [${currentUser.level || 'Pro 🔥'}]</li>`;
      return;
    }
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

// TRIVIA ARCADE
function openTriviaModal() {
  document.getElementById('trivia-modal').classList.remove('hidden');
  document.getElementById('trivia-app-select').classList.remove('hidden');
  document.getElementById('trivia-game-box').classList.add('hidden');
}

function closeTriviaModal() {
  document.getElementById('trivia-modal').classList.add('hidden');
}

let triviaScore = 0;
function startTriviaGame() {
  const appDropdown = document.getElementById('selected-app-dropdown');
  const selectedApp = appDropdown ? appDropdown.value : 'After Effects';
  
  document.getElementById('trivia-app-select').classList.add('hidden');
  document.getElementById('trivia-game-box').classList.remove('hidden');
  
  document.getElementById('quiz-level-tag').textContent = `App: ${selectedApp}`;
  document.getElementById('quiz-score-tag').textContent = `Points: ${triviaScore}`;
  document.getElementById('trivia-question').textContent = `${selectedApp} specializes in what type of editing feature?`;
  
  const optionsContainer = document.getElementById('trivia-options');
  optionsContainer.innerHTML = `
    <button class="btn-secondary" onclick="answerTrivia(true)" style="width:100%; margin-bottom:6px; text-align:left;">3D Camera & Velocity</button>
    <button class="btn-secondary" onclick="answerTrivia(false)" style="width:100%; margin-bottom:6px; text-align:left;">Color Grading</button>
  `;
}

function answerTrivia(isCorrect) {
  if (isCorrect) {
    triviaScore += 20;
    alert('Correct! +20 points 🎉');
  } else {
    alert('Incorrect! Try the next question.');
  }
  document.getElementById('quiz-score-tag').textContent = `Points: ${triviaScore}`;
}

function submitTriviaAnswerAndNext() {
  startTriviaGame();
}

// ASSET VAULT
function openAssetsModal() {
  document.getElementById('assets-modal').classList.remove('hidden');
  fetchAssets();
}

function closeAssetsModal() {
  document.getElementById('assets-modal').classList.add('hidden');
}

function fetchAssets() {
  socket.emit('asset:fetch', (assets) => {
    const list = document.getElementById('asset-list');
    if (!list) return;
    list.innerHTML = '';
    assets.forEach(asset => {
      const div = document.createElement('div');
      div.className = 'glass-box';
      div.style.padding = '8px';
      div.style.marginBottom = '6px';
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
          <div>
            <strong>${asset.name}</strong><br>
            <span style="color:var(--text-muted); font-size:0.7rem;">Category: ${asset.category} | By @${asset.uploader}</span>
          </div>
          <a href="${asset.url}" target="_blank" style="color:var(--accent-light); text-decoration:none;">📥 Download</a>
        </div>
      `;
      list.appendChild(div);
    });
  });
}

async function uploadAssetToVault() {
  const name = document.getElementById('new-asset-name').value.trim();
  const category = document.getElementById('new-asset-cat').value;
  const fileInput = document.getElementById('new-asset-file');

  if (!name || !fileInput.files[0]) {
    alert('Please enter an asset title and choose a file.');
    return;
  }

  const url = await uploadFileToServer(fileInput.files[0]);
  socket.emit('asset:upload', { name, category, url }, () => {
    alert('Asset uploaded successfully!');
    document.getElementById('new-asset-name').value = '';
    fileInput.value = '';
    fetchAssets();
  });
}

// ANALYTICS & NOTIFICATIONS
function openAnalytics() {
  document.getElementById('analytics-modal').classList.remove('hidden');
  socket.emit('analytics:fetch', (data) => {
    document.getElementById('stat-registered').textContent = data.registeredCount || 1;
    document.getElementById('stat-online').textContent = data.activeOnline || 1;
    document.getElementById('stat-hours').textContent = data.hoursUsed || '0.00';
    document.getElementById('stat-revenue').textContent = data.revenue || '$0.00';
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
      if (!notifs || notifs.length === 0) {
        list.innerHTML = '<li style="font-size:0.75rem; color:var(--text-muted);">No new alerts</li>';
        return;
      }
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

socket.on('users:update', (users) => {
  const list = document.getElementById('user-list');
  if (!list) return;
  list.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.style.fontSize = '0.75rem';
    li.style.padding = '3px 0';
    li.textContent = `🟢 @${u.username}`;
    list.appendChild(li);
  });
});