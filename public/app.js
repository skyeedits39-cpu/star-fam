/* ==========================================
   STAR FAM 💜 - MAIN CLIENT APPLICATION JAVASCRIPT
   ================================---------- */

const socket = io();

let currentUser = null;
let currentRoom = 'Community Lounge';

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

// Login Handler
document.getElementById('login-btn').addEventListener('click', () => {
  const username = document.getElementById('login-username').value.trim();
  const pin = document.getElementById('login-pin').value.trim();

  if (!username || !pin) {
    alert('Please enter both username and PIN.');
    return;
  }

  socket.emit('login_user', { username, pin });
});

// Signup Handler
document.getElementById('signup-btn').addEventListener('click', () => {
  const username = document.getElementById('signup-username').value.trim();
  const pin = document.getElementById('signup-pin').value.trim();
  const role = document.getElementById('signup-role').value;

  if (!username || !pin) {
    alert('Please fill out all fields.');
    return;
  }

  socket.emit('register_user', { username, pin, role });
});

socket.on('auth_success', (user) => {
  currentUser = user;
  authOverlay.classList.add('hidden');
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-handle').textContent = `@${user.username}`;
  document.getElementById('profile-badge').textContent = user.role === 'Owner' ? 'Owner 👑' : user.role;
  document.getElementById('profile-avatar').textContent = user.username.charAt(0).toUpperCase();
  
  socket.emit('join_room', currentRoom);
});

socket.on('auth_error', (err) => {
  alert(err);
});

// Navigation Rooms / Tabs
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = e.currentTarget;
    targetBtn.classList.add('active');
    
    currentRoom = targetBtn.dataset.room;
    document.getElementById('current-room-title').textContent = targetBtn.textContent.trim();
    
    document.getElementById('messages-container').innerHTML = '';
    socket.emit('join_room', currentRoom);
  });
});

// Send Message
function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();

  if (!text) return;

  socket.emit('send_message', {
    room: currentRoom,
    sender: currentUser.username,
    text: text,
    type: 'text'
  });

  input.value = '';
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Incoming Messages & Polls
socket.on('load_messages', (messages) => {
  const container = document.getElementById('messages-container');
  container.innerHTML = '';
  messages.forEach(msg => renderMessage(msg));
});

socket.on('new_message', (msg) => {
  renderMessage(msg);
});

// --- RENDER POLLS & MESSAGES WITH CLICK-TO-VOTE & PROPER PERMISSIONS ---
function renderMessage(msg) {
  const container = document.getElementById('messages-container');
  const row = document.createElement('div');
  row.className = `message-row ${msg.sender === currentUser.username ? 'my-msg' : ''}`;

  if (msg.type === 'poll') {
    let optionsHtml = '';
    const totalVotes = msg.votes ? Object.values(msg.votes).reduce((a, b) => a + b, 0) : 0;

    msg.options.forEach((opt, index) => {
      const voteCount = msg.votes && msg.votes[index] ? msg.votes[index] : 0;
      const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

      optionsHtml += `
        <div onclick="voteOnPoll('${msg.id}', ${index})" style="background: rgba(147, 51, 234, 0.15); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; margin-bottom: 4px; cursor: pointer; position: relative; overflow: hidden;">
          <div style="position: absolute; top:0; left:0; bottom:0; width: ${percentage}%; background: rgba(147, 51, 234, 0.3); z-index: 1;"></div>
          <div style="display: flex; justify-content: space-between; position: relative; z-index: 2; font-size: 0.8rem;">
            <span>${opt}</span>
            <span style="color: var(--accent-light);">${percentage}% (${voteCount})</span>
          </div>
        </div>
      `;
    });

    const canDeletePoll = currentUser.username === msg.sender || currentUser.role === 'Owner';
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
    row.innerHTML = `
      <div class="msg-bubble glass-box">
        <div style="font-size:0.7rem; color:var(--text-muted);">@${msg.sender}</div>
        <div>${msg.text}</div>
      </div>
    `;
  }

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

// Vote action
function voteOnPoll(pollId, optionIndex) {
  socket.emit('vote_poll', { pollId, optionIndex, username: currentUser.username, room: currentRoom });
}

// Delete Poll action
function deletePoll(pollId) {
  if (confirm('Are you sure you want to delete this poll?')) {
    socket.emit('delete_poll', { pollId, room: currentRoom });
  }
}

// Create Poll Modal Handling
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

  socket.emit('create_poll', {
    room: currentRoom,
    sender: currentUser.username,
    question,
    options
  });

  closePollModal();
}

// Online users sync
socket.on('update_online_users', (users) => {
  const list = document.getElementById('online-users-list');
  list.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.style.fontSize = '0.75rem';
    li.style.padding = '3px 0';
    li.style.color = 'var(--text-main)';
    li.textContent = `🟢 @${user}`;
    list.appendChild(li);
  });
});