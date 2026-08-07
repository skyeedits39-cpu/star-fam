const socket = io();

let currentUser = null;
let currentRoom = 'global';

const authOverlay = document.getElementById('auth-overlay');
const loginTabBtn = document.getElementById('login-tab-btn');
const signupTabBtn = document.getElementById('signup-tab-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

function switchAuthTab(tab) {
  if (tab === 'login') {
    if (loginTabBtn) loginTabBtn.classList.add('active');
    if (signupTabBtn) signupTabBtn.classList.remove('active');
    if (loginForm) loginForm.classList.remove('hidden');
    if (signupForm) signupForm.classList.add('hidden');
  } else {
    if (signupTabBtn) signupTabBtn.classList.add('active');
    if (loginTabBtn) loginTabBtn.classList.remove('active');
    if (signupForm) signupForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
  }
}

const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
  loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const identifierEl = document.getElementById('login-username');
    const pinEl = document.getElementById('login-pin');
    
    const identifier = identifierEl ? identifierEl.value.trim() : '';
    const pin = pinEl ? pinEl.value.trim() : '';

    if (!identifier || !pin) {
      alert('Please enter both username/tag and PIN.');
      return;
    }

    socket.emit('auth:login', { identifier, pin }, (response) => {
      if (response && !response.success) {
        alert(response.message);
      }
    });
  });
}

const signupBtn = document.getElementById('signup-btn');
if (signupBtn) {
  signupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const usernameEl = document.getElementById('signup-username');
    const pinEl = document.getElementById('signup-pin');
    
    const username = usernameEl ? usernameEl.value.trim() : '';
    const pin = pinEl ? pinEl.value.trim() : '';

    if (!username || !pin) {
      alert('Please fill out all fields.');
      return;
    }

    socket.emit('auth:signup', { username, pin }, (response) => {
      if (response && !response.success) {
        alert(response.message);
      }
    });
  });
}

socket.on('auth:success', (user) => {
  currentUser = user;
  
  if (authOverlay) {
    authOverlay.style.display = 'none';
    authOverlay.classList.add('hidden');
  }

  const mainApp = document.getElementById('main-app') || document.querySelector('.app-container');
  if (mainApp) {
    mainApp.classList.remove('hidden');
    mainApp.style.display = 'flex';
  }
  
  const profileUsername = document.getElementById('profile-username');
  const profileHandle = document.getElementById('profile-handle');
  const profileBadge = document.getElementById('profile-badge');
  const profileAvatar = document.getElementById('profile-avatar');

  if (profileUsername) profileUsername.textContent = user.username;
  if (profileHandle) profileHandle.textContent = user.tag || `@${user.username}`;
  if (profileBadge) profileBadge.textContent = user.role;
  if (profileAvatar) profileAvatar.textContent = user.username.charAt(0).toUpperCase();
  
  loadRoomContent();
});

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = e.currentTarget;
    targetBtn.classList.add('active');
    
    currentRoom = targetBtn.dataset.room || 'global';
    const roomTitle = document.getElementById('current-room-title');
    if (roomTitle) roomTitle.textContent = targetBtn.textContent.trim();
    
    loadRoomContent();
  });
});

function loadRoomContent() {
  const container = document.getElementById('messages-container');
  if (!container) return;
  container.innerHTML = '';
  
  socket.emit('chat:fetch_history', { room: currentRoom }, (messages) => {
    socket.emit('poll:fetch', currentRoom, (polls) => {
      container.innerHTML = '';
      if (messages) messages.forEach(msg => renderMessage(msg));
      if (polls) polls.forEach(poll => renderMessage({ ...poll, type: 'poll', sender: poll.creator }));
    });
  });
}

function sendMessage() {
  const input = document.getElementById('message-input');
  if (!input) return;
  const text = input.value.trim();

  if (!text) return;

  socket.emit('chat:send', {
    targetRoom: currentRoom,
    text: text
  });

  input.value = '';
}

const sendBtn = document.getElementById('send-btn');
if (sendBtn) sendBtn.addEventListener('click', sendMessage);

const messageInput = document.getElementById('message-input');
if (messageInput) {
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

socket.on('chat:message', (msg) => {
  if (msg.targetRoom === currentRoom) {
    renderMessage(msg);
  }
});

socket.on('chat:refresh', ({ room }) => {
  if (room === currentRoom) {
    loadRoomContent();
  }
});

function renderMessage(msg) {
  const container = document.getElementById('messages-container');
  if (!container || !currentUser) return;
  
  const row = document.createElement('div');
  row.className = `message-row ${msg.sender === currentUser.username ? 'my-msg' : ''}`;

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

    row.innerHTML = `
      <div class="msg-bubble glass-box" style="width: 260px; max-width: 90%; padding: 10px;">
        ${deleteBtn}
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">📊 Poll by @${msg.sender}</div>
        <div style="font-weight:bold; font-size:0.85rem; margin-bottom:8px;">${msg.question}</div>
        ${optionsHtml}
        <div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px; text-align:right;">Total Votes: ${totalVotes}</div>
      </div>
    `;
  } else {
    const canDeleteMsg = currentUser.username === msg.sender || currentUser.role.includes('Owner');
    const deleteMsgBtn = canDeleteMsg ? `<button onclick="deleteMessage('${msg.id}')" style="background:none; border:none; color:#ff8888; font-size:0.65rem; cursor:pointer; float:right; margin-left:6px;">🗑️</button>` : '';

    row.innerHTML = `
      <div class="msg-bubble glass-box">
        ${deleteMsgBtn}
        <div style="font-size:0.7rem; color:var(--text-muted);">@${msg.sender}</div>
        <div>${msg.text}</div>
      </div>
    `;
  }

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function deleteMessage(msgId) {
  socket.emit('chat:delete', { msgId, room: currentRoom });
}

function voteOnPoll(pollId, optionIdx) {
  socket.emit('poll:vote', { pollId, optionIdx });
}

function deletePoll(pollId) {
  if (confirm('Are you sure you want to delete this poll?')) {
    socket.emit('poll:delete', { pollId });
  }
}

socket.on('poll:updated', ({ room }) => {
  if (room === currentRoom) {
    loadRoomContent();
  }
});

function openPollModal() {
  const modal = document.getElementById('poll-modal');
  if (modal) modal.classList.remove('hidden');
}

function closePollModal() {
  const modal = document.getElementById('poll-modal');
  if (modal) modal.classList.add('hidden');
}

function submitPoll() {
  const qEl = document.getElementById('poll-question');
  const o1El = document.getElementById('poll-opt1');
  const o2El = document.getElementById('poll-opt2');
  
  if (!qEl || !o1El || !o2El) return;
  const question = qEl.value.trim();
  const opt1 = o1El.value.trim();
  const opt2 = o2El.value.trim();

  if (!question || !opt1 || !opt2) {
    alert('Please enter a question and at least 2 options.');
    return;
  }

  const options = [opt1, opt2];
  const opt3El = document.getElementById('poll-opt3');
  const opt3 = opt3El ? opt3El.value.trim() : '';
  if (opt3) options.push(opt3);

  socket.emit('poll:create', {
    room: currentRoom,
    question,
    options
  });

  closePollModal();
}

function fetchAssets() {
  socket.emit('asset:fetch', (assets) => {
    const listContainer = document.getElementById('assets-list-container');
    if (!listContainer || !currentUser) return;
    listContainer.innerHTML = '';
    assets.forEach(asset => {
      const canDeleteAsset = currentUser.username === asset.uploader || currentUser.role.includes('Owner');
      const deleteAssetBtn = canDeleteAsset ? `<button onclick="deleteAsset(${asset.id})" style="background:none; border:none; color:#ff8888; cursor:pointer; font-size:0.8rem;">🗑️ Delete</button>` : '';
      
      const item = document.createElement('div');
      item.className = 'glass-box';
      item.style.padding = '10px';
      item.style.marginBottom = '8px';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight:bold; font-size:0.85rem;">${asset.name}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Category: ${asset.category} | By @${asset.uploader}</div>
          </div>
          <div>
            <a href="${asset.url}" target="_blank" style="color:var(--accent-light); font-size:0.8rem; margin-right:10px; text-decoration:none;">📥 Download</a>
            ${deleteAssetBtn}
          </div>
        </div>
      `;
      listContainer.appendChild(item);
    });
  });
}

function deleteAsset(assetId) {
  if (confirm('Are you sure you want to delete this asset?')) {
    socket.emit('asset:delete', { assetId });
  }
}

socket.on('asset:updated', () => {
  fetchAssets();
});

socket.on('users:update', (users) => {
  const list = document.getElementById('online-users-list');
  if (!list) return;
  list.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.style.fontSize = '0.75rem';
    li.style.padding = '3px 0';
    li.style.color = 'var(--text-main)';
    li.textContent = `🟢 @${user.username}`;
    list.appendChild(li);
  });
});