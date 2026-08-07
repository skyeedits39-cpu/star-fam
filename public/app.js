/* ==========================================
   STAR FAM 💜 - MAIN CLIENT APPLICATION JAVASCRIPT
   ================================---------- */

const socket = io();

let currentUser = null;
let currentRoom = 'global';

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const loginTabBtn = document.getElementById('login-tab-btn');
const signupTabBtn = document.getElementById('signup-tab-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

// Switch Auth Tabs
function switchAuthTab(tab) {
  if (tab === 'login') {
    loginTabBtn.classList.add('active');
    signupTabBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  } else {
    signupTabBtn.classList.add('active');
    loginTabBtn.classList.remove('active');
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }
}

// Robust Login Handler (Handles browser autofill safely)
document.getElementById('login-btn').addEventListener('click', (e) => {
  e.preventDefault();
  
  const identifierInput = document.getElementById('login-username');
  const pinInput = document.getElementById('login-pin');
  
  const identifier = identifierInput.value.trim() || identifierInput.getAttribute('value') || '';
  const pin = pinInput.value.trim() || pinInput.getAttribute('value') || '';

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

// Robust Signup Handler
document.getElementById('signup-btn').addEventListener('click', (e) => {
  e.preventDefault();
  
  const usernameInput = document.getElementById('signup-username');
  const pinInput = document.getElementById('signup-pin');
  
  const username = usernameInput.value.trim();
  const pin = pinInput.value.trim();

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

// Auth Success listener
socket.on('auth:success', (user) => {
  currentUser = user;
  authOverlay.classList.add('hidden');
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-handle').textContent = user.tag || `@${user.username}`;
  document.getElementById('profile-badge').textContent = user.role;
  document.getElementById('profile-avatar').textContent = user.username.charAt(0).toUpperCase();
  
  loadRoomContent();
});

// Navigation Rooms / Tabs
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = e.currentTarget;
    targetBtn.classList.add('active');
    
    currentRoom = targetBtn.dataset.room || 'global';
    document.getElementById('current-room-title').textContent = targetBtn.textContent.trim();
    
    loadRoomContent();
  });
});

function loadRoomContent() {
  const container = document.getElementById('messages-container');
  container.innerHTML = '';
  
  socket.emit('chat:fetch_history', { room: currentRoom }, (messages) => {
    socket.emit('poll:fetch', currentRoom, (polls) => {
      container.innerHTML = '';
      if (messages) messages.forEach(msg => renderMessage(msg));
      if (polls) polls.forEach(poll => renderMessage({ ...poll, type: 'poll', sender: poll.creator }));
    });
  });
}

// Send Message
function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();

  if (!text) return;

  socket.emit('chat:send', {
    targetRoom: currentRoom,
    text: text
  });

  input.value = '';
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Incoming Messages
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

// --- RENDER MESSAGES & POLLS WITH CLICK-TO-VOTE & PROPER PERMISSIONS ---
function renderMessage(msg) {
  const container = document.getElementById('messages-container');
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
  document.getElementById('poll-modal').classList.remove('hidden');
}

function closePollModal() {
  document.getElementById('poll-modal').classList.add('hidden');
}

function submitPoll() {
  const question = document.getElementById('poll-question').value.trim();
  const opt1 = document.getElementById('poll-opt1').value.trim();
  const opt2 = document.getElementById('poll-opt2').value.trim();

  if (!question || !opt1 || !opt2) {
    alert('Please enter a question and at least 2 options.');
    return;
  }

  const options = [opt1, opt2];
  const opt3 = document.getElementById('poll-opt3').value.trim();
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
    if (!listContainer) return;
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