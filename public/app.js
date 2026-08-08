// Global state variables
let socket = io();
let currentRoom = 'global';
let currentUser = null;
let activeUsersList = [];

// Initialize application socket listeners
socket.on('connect', () => {
  console.log('Connected to server via WebSocket');
  const savedUser = localStorage.getItem('star_fam_user');
  if (savedUser && !currentUser) {
    try {
      const userData = JSON.parse(savedUser);
      socket.emit('auth:login', { identifier: userData.username, pin: userData.pin }, (res) => {});
    } catch (e) {
      localStorage.removeItem('star_fam_user');
    }
  }
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

// Form Submission Listeners
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const identifier = document.getElementById('login-id').value.trim();
      const pin = document.getElementById('login-pin').value.trim();
      
      socket.emit('auth:login', { identifier, pin }, (res) => {
        if (!res.success) {
          alert(res.message);
        } else {
          localStorage.setItem('star_fam_user', JSON.stringify({ username: identifier, pin }));
        }
      });
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('signup-username').value.trim();
      const pin = document.getElementById('signup-pin').value.trim();
      const tag = document.getElementById('signup-tag').value.trim();
      const bio = document.getElementById('signup-bio').value.trim();
      const fileInput = document.getElementById('pfp-file-input');

      if (fileInput && fileInput.files[0]) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        fetch('/api/upload', { method: 'POST', body: formData })
          .then(res => res.json())
          .then(data => {
            socket.emit('auth:signup', { username, pin, tag, bio, pfp: data.url }, (res) => {
              if (res.success) {
                localStorage.setItem('star_fam_user', JSON.stringify({ username, pin }));
              } else {
                alert(res.message);
              }
            });
          })
          .catch(err => console.error('PFP Upload error:', err));
      } else {
        socket.emit('auth:signup', { username, pin, tag, bio, pfp: null }, (res) => {
          if (res.success) {
            localStorage.setItem('star_fam_user', JSON.stringify({ username, pin }));
          } else {
            alert(res.message);
          }
        });
      }
    });
  }
});

let attachedMediaUrl = null;
let attachedMediaType = null;

function handleMediaAttachment(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  fetch('/api/upload', { method: 'POST', body: formData })
    .then(res => res.json())
    .then(data => {
      attachedMediaUrl = data.url;
      attachedMediaType = file.type;
      const indicator = document.getElementById('media-indicator');
      if (indicator) indicator.innerText = `📎 Attached: ${data.originalName} (${data.size})`;
    })
    .catch(err => {
      console.error('Upload failed:', err);
      alert('Failed to attach media.');
    });
}

socket.on('chat:message', (data) => {
  if (currentRoom === data.targetRoom || currentRoom === data.room) {
    appendMessage(data);
    scrollToBottom();
  }
});

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
    
    document.getElementById('chat-active-area').classList.add('hidden');
    document.getElementById('support-section-view').classList.remove('hidden');
    return;
  }

  document.getElementById('chat-active-area').classList.remove('hidden');
  document.getElementById('support-section-view').classList.add('hidden');

  document.getElementById('messages-container').innerHTML = '';
  socket.emit('chat:fetch_history', { room: currentRoom }, (history) => {
    history.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });
}

function openDirectMessage(recipientUsername) {
  const cleanRecipient = recipientUsername.toLowerCase();
  currentRoom = `dm-${cleanRecipient}`;
  
  document.getElementById('room-title').innerText = `💬 DM with @${recipientUsername}`;
  document.getElementById('room-desc').innerText = `Private secure messaging thread`;
  
  document.getElementById('chat-active-area').classList.remove('hidden');
  document.getElementById('support-section-view').classList.add('hidden');

  document.getElementById('messages-container').innerHTML = '';
  socket.emit('chat:fetch_history', { room: currentRoom }, (history) => {
    history.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });
}

function appendMessage(msg) {
  const container = document.getElementById('messages-container');
  const div = document.createElement('div');
  
  const isMe = currentUser && msg.sender.toLowerCase() === currentUser.username.toLowerCase();
  
  div.className = 'chat-message';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  div.style.alignItems = isMe ? 'flex-end' : 'flex-start';
  div.style.marginBottom = '12px';

  let mediaHtml = '';
  if (msg.mediaUrl) {
    if (msg.mediaType && msg.mediaType.startsWith('video')) {
      mediaHtml = `<br><video src="${msg.mediaUrl}" controls playsinline style="max-width: 240px; border-radius: 8px; margin-top: 6px;"></video>`;
    } else {
      mediaHtml = `<br><img src="${msg.mediaUrl}" style="max-width: 240px; border-radius: 8px; margin-top: 6px;">`;
    }
  }

  const bubbleColor = isMe ? 'rgba(138, 43, 226, 0.25)' : 'rgba(255, 255, 255, 0.05)';
  const borderColor = isMe ? 'rgba(138, 43, 226, 0.4)' : 'rgba(255, 255, 255, 0.1)';

  // Render user avatar thumbnail inside the message header
  let avatarHtml = '';
  if (msg.pfp) {
    avatarHtml = `<img src="${msg.pfp}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 6px;">`;
  } else {
    avatarHtml = `<span style="display: inline-block; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); text-align: center; line-height: 22px; font-size: 0.65rem; color: #fff; margin-right: 6px;">${msg.sender.charAt(0).toUpperCase()}</span>`;
  }

  div.innerHTML = `
    <div style="max-width: 75%; background: ${bubbleColor}; border: 1px solid ${borderColor}; padding: 10px 14px; border-radius: 12px; word-break: break-word;">
      <div style="display: flex; justify-content: space-between; gap: 15px; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px; align-items: center;">
        <span>${avatarHtml}<strong style="color: var(--text-main);">${msg.sender}</strong> <span style="color: var(--accent-light);">${msg.tag || ''}</span></span>
        <span>${msg.timestamp}</span>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-main);">${msg.text || ''}${mediaHtml}</div>
    </div>
  `;
  container.appendChild(div);
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text && !attachedMediaUrl) return;

  socket.emit('chat:send', {
    targetRoom: currentRoom,
    text: text,
    mediaUrl: attachedMediaUrl,
    mediaType: attachedMediaType
  });

  input.value = '';
  attachedMediaUrl = null;
  attachedMediaType = null;
  const indicator = document.getElementById('media-indicator');
  if (indicator) indicator.innerText = '';
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

function openMyProfile() {
  if (!currentUser) return;
  document.getElementById('modal-username').innerText = currentUser.username;
  document.getElementById('modal-tag').innerText = currentUser.tag || `@${currentUser.username}`;
  document.getElementById('modal-role').innerText = currentUser.role || 'Editor';
  document.getElementById('modal-bio').innerText = currentUser.bio || 'VFX Motion Editor';
  
  if (currentUser.pfp) {
    document.getElementById('modal-avatar').innerHTML = `<img src="${currentUser.pfp}" style="width:100%; height:100%; object-fit:cover;">`;
  } else {
    document.getElementById('modal-avatar').innerText = currentUser.username.charAt(0).toUpperCase();
  }

  if (currentUser.username.toLowerCase() === 'starediter1') {
    document.getElementById('owner-paypal-field-container').classList.remove('hidden');
    document.getElementById('edit-paypal').value = currentUser.paypalEmail || '';
  }

  document.getElementById('profile-modal').classList.remove('hidden');
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.add('hidden');
}

function toggleEditProfileMode() {
  const sec = document.getElementById('edit-profile-section');
  sec.classList.toggle('hidden');
  if (!sec.classList.contains('hidden')) {
    document.getElementById('edit-tag').value = currentUser.tag || '';
    document.getElementById('edit-bio').value = currentUser.bio || '';
  }
}

function saveProfileChanges() {
  const tag = document.getElementById('edit-tag').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const paypalEmail = document.getElementById('edit-paypal') ? document.getElementById('edit-paypal').value.trim() : null;
  const fileInput = document.getElementById('edit-pfp-file');

  const executeUpdate = (pfpUrl) => {
    socket.emit('profile:update', { tag, bio, paypalEmail, pfp: pfpUrl }, () => {
      currentUser.tag = tag;
      currentUser.bio = bio;
      if (paypalEmail) currentUser.paypalEmail = paypalEmail;
      if (pfpUrl !== undefined) currentUser.pfp = pfpUrl;
      
      document.getElementById('my-tag').innerText = currentUser.tag;
      if (currentUser.pfp) {
        document.getElementById('my-avatar').innerHTML = `<img src="${currentUser.pfp}" style="width:100%; height:100%; object-fit:cover;">`;
      }
      closeProfileModal();
      alert('✨ Profile updated successfully!');
    });
  };

  if (fileInput && fileInput.files[0]) {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    fetch('/api/upload', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => executeUpdate(data.url))
      .catch(err => alert('Failed to upload picture'));
  } else {
    executeUpdate(undefined);
  }
}

function logoutUser() {
  localStorage.removeItem('star_fam_user');
  window.location.reload();
}

function openPollModal() { document.getElementById('poll-modal').classList.remove('hidden'); }
function closePollModal() { document.getElementById('poll-modal').classList.add('hidden'); }

function openLeaderboardModal() {
  document.getElementById('leaderboard-modal').classList.remove('hidden');
  socket.emit('leaderboard:fetch', (list) => {
    const listEl = document.getElementById('leaderboard-list');
    let html = '';
    list.forEach((u, index) => {
      html += `<li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>#${index + 1} <strong>${u.username}</strong> (${u.selectedApp})</span> <span style="color: var(--accent-light);">${u.score} pts (${u.level})</span></li>`;
    });
    listEl.innerHTML = html;
  });
}
function closeLeaderboardModal() { document.getElementById('leaderboard-modal').classList.add('hidden'); }

function openTriviaModal() { document.getElementById('trivia-modal').classList.remove('hidden'); }
function closeTriviaModal() { document.getElementById('trivia-modal').classList.add('hidden'); }

function openAnalytics() {
  document.getElementById('analytics-modal').classList.remove('hidden');
  socket.emit('analytics:fetch', (stats) => {
    document.getElementById('stat-registered').innerText = stats.registeredCount;
    document.getElementById('stat-online').innerText = stats.activeOnline;
    document.getElementById('stat-hours').innerText = stats.hoursUsed;
    document.getElementById('stat-revenue').innerText = stats.revenue;
  });
}
function closeAnalytics() { document.getElementById('analytics-modal').classList.add('hidden'); }

function toggleNotifBox() {
  const box = document.getElementById('notif-box');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    socket.emit('notifications:fetch', (notifs) => {
      const list = document.getElementById('notif-list');
      let html = '';
      notifs.forEach(n => {
        html += `<li style="font-size: 0.7rem; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">${n.text} <span style="color: var(--text-muted); display:block;">${n.timestamp}</span></li>`;
      });
      list.innerHTML = html || '<li style="font-size: 0.7rem;">No notifications</li>';
    });
  }
}

function toggleMobileView(view) {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('mobile-open');
}

function processPayment(type) {
  let amt = '3.00';
  let itemName = 'Personal Edit';
  if (type === 'donate') {
    amt = document.getElementById('donate-amount').value || '5';
    itemName = 'Creator Donation';
  }
  socket.emit('owner:paypal:fetch', (res) => {
    const receiver = res.paypalEmail || 'starediter1@gmail.com';
    const customData = JSON.stringify({ username: currentUser.username });
    const url = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(receiver)}&item_name=${encodeURIComponent(itemName)}&amount=${amt}&currency_code=USD&custom=${encodeURIComponent(customData)}`;
    window.open(url, '_blank');
  });
}

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

socket.on('auth:success', (user) => {
  currentUser = user;
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  
  document.getElementById('my-name').innerText = user.username;
  document.getElementById('my-tag').innerText = user.tag || `@${user.username}`;
  document.getElementById('my-role').innerText = user.role || 'Editor';
  
  if (user.pfp) {
    document.getElementById('my-avatar').innerHTML = `<img src="${user.pfp}" style="width:100%; height:100%; object-fit:cover;">`;
  } else {
    document.getElementById('my-avatar').innerText = user.username.charAt(0).toUpperCase();
  }

  if (user.username.toLowerCase() === 'starediter1') {
    document.getElementById('btn-create-poll').classList.remove('hidden');
    document.getElementById('btn-analytics').classList.remove('hidden');
    document.getElementById('btn-notif-bell').classList.remove('hidden');
  }

  switchRoom('global');
  renderUserList();
});