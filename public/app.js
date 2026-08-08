// Global state variables
let socket = io();
let currentRoom = 'global';
let currentUser = null;
let activeUsersList = [];

// Initialize application socket listeners
socket.on('connect', () => {
  console.log('Connected to server via WebSocket');
});

// Authentication handling
function setAuthMode(mode) {
  if (mode === 'login') {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('recovery-form').classList.add('hidden');
    document.getElementById('btn-toggle-login').classList.add('active');
    document.getElementById('btn-toggle-signup').classList.remove('active');
  } else if (mode === 'signup') {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('recovery-form').classList.add('hidden');
    document.getElementById('btn-toggle-signup').classList.add('active');
    document.getElementById('btn-toggle-login').classList.remove('active');
  }
}

function openRecoveryScreen() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('recovery-form').classList.remove('hidden');
}

// Listen for real-time messages across all rooms including direct messages
socket.on('chat:message', (data) => {
  // If the message belongs to the current active room or active DM thread, append it instantly
  if (currentRoom === data.targetRoom || currentRoom === data.room) {
    appendMessage(data);
    scrollToBottom();
  }
});

// Handler when switching rooms or opening a direct message room
function switchRoom(roomName) {
  currentRoom = roomName;
  
  if (roomName === 'global') {
    document.getElementById('room-title').innerText = '🌐 Community Lounge';
    document.getElementById('room-desc').innerText = 'General community discussions & sharing';
  } else if (roomName === 'editing-comp') {
    document.getElementById('room-title').innerText = '🏆 Editing Comp';
    document.getElementById('room-desc').innerText = 'Share edits, get feedback, and compete';
  } else if (roomName === 'support-hub') {
    document.getElementById('room-title').innerText = '💖 Donations & Edits';
    document.getElementById('room-desc').innerText = 'Support the creator and order custom personal edits';
    
    // Toggle views
    document.getElementById('chat-active-area').classList.add('hidden');
    document.getElementById('support-section-view').classList.remove('hidden');
    return;
  }

  document.getElementById('chat-active-area').classList.remove('hidden');
  document.getElementById('support-section-view').classList.add('hidden');

  // Load chat history for the room
  document.getElementById('messages-container').innerHTML = '';
  socket.emit('chat:fetch_history', { room: currentRoom }, (history) => {
    history.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });
}

function openDirectMessage(recipientUsername) {
  const cleanRecipient = recipientUsername.toLowerCase();
  currentRoom = `dm-${cleanRecipient}`;
  
  // Update UI headers
  document.getElementById('room-title').innerText = `💬 DM with @${recipientUsername}`;
  document.getElementById('room-desc').innerText = `Private secure messaging thread`;
  
  document.getElementById('chat-active-area').classList.remove('hidden');
  document.getElementById('support-section-view').classList.add('hidden');

  // Clear messages container and fetch history for this specific DM thread
  document.getElementById('messages-container').innerHTML = '';
  socket.emit('chat:fetch_history', { room: currentRoom }, (history) => {
    history.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });
}

function appendMessage(msg) {
  const container = document.getElementById('messages-container');
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.style.marginBottom = '10px';
  div.style.padding = '8px';
  div.style.borderRadius = '6px';
  div.style.background = 'rgba(255, 255, 255, 0.03)';

  let mediaHtml = '';
  if (msg.mediaUrl) {
    if (msg.mediaType && msg.mediaType.startsWith('video')) {
      mediaHtml = `<br><video src="${msg.mediaUrl}" controls style="max-width: 200px; border-radius: 6px; margin-top: 5px;"></video>`;
    } else {
      mediaHtml = `<br><img src="${msg.mediaUrl}" style="max-width: 200px; border-radius: 6px; margin-top: 5px;">`;
    }
  }

  div.innerHTML = `
    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">
      <span><strong style="color: var(--text-main);">${msg.sender}</strong> <span style="color: var(--accent-light);">${msg.tag || ''}</span></span>
      <span>${msg.timestamp}</span>
    </div>
    <div style="font-size: 0.85rem; word-break: break-word;">${msg.text || ''}${mediaHtml}</div>
  `;
  container.appendChild(div);
}

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

function handleKeyPress(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  container.scrollTop = container.scrollHeight;
}

// Listen for list of users and DMs update
socket.on('users:update', (users) => {
  activeUsersList = users;
  renderUserList();
});

function renderUserList() {
  const listEl = document.getElementById('user-list');
  if (!listEl) return;
  
  socket.emit('dms:fetch_list', (dmsList) => {
    let html = '';
    dmsList.forEach(u => {
      if (currentUser && u.username.toLowerCase() !== currentUser.username.toLowerCase()) {
        html += `<li onclick="openDirectMessage('${u.username}')" style="padding: 6px 8px; cursor: pointer; border-radius: 4px; font-size: 0.8rem; margin-bottom: 2px; background: rgba(255,255,255,0.02);">💬 @${u.username}</li>`;
      }
    });
    listEl.innerHTML = html;
  });
}

// Authentication Success Hook
socket.on('auth:success', (user) => {
  currentUser = user;
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  
  document.getElementById('my-name').innerText = user.username;
  document.getElementById('my-tag').innerText = user.tag || `@${user.username}`;
  document.getElementById('my-role').innerText = user.role || 'Editor';
  
  switchRoom('global');
  renderUserList();
});