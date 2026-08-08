let socket = io();
let currentRoom = 'global';
let currentUser = null;
let activeUsersList = [];
let attachedMediaUrl = null;
let attachedMediaType = null;

const triviaQuestionsBank = {
  "After Effects": generateSuiteTrivia("After Effects"),
  "CapCut": generateSuiteTrivia("CapCut"),
  "Alight Motion": generateSuiteTrivia("Alight Motion"),
  "Blur": generateSuiteTrivia("Blur"),
  "Video Star": generateSuiteTrivia("Video Star")
};

function generateSuiteTrivia(suiteName) {
  let questions = [];
  for (let i = 1; i <= 40; i++) {
    questions.push({
      question: `[${suiteName}] Question ${i}: What is a core feature or technique used in professional timeline editing?`,
      options: ["Keyframe Graphing", "Spreadsheet calculation", "Database indexing", "BIOS configuration"],
      correctIndex: 0
    });
  }
  return questions;
}

let currentTriviaSuite = 'After Effects';
let currentTriviaIndex = 0;
let triviaScoreEarned = 0;
let lastAnswerResult = null;

socket.on('connect', () => {
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

socket.on('leaderboard:update', (list) => {
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) return;
  let html = '';
  list.forEach((u, i) => {
    html += `<li style="display:flex; justify-content:space-between; padding:6px 0; border-bottom: 1px solid var(--border-color);"><span>#${i+1} ${u.username}</span> <strong style="color: var(--accent-light);">${u.score} pts</strong></li>`;
  });
  listEl.innerHTML = html;
});

socket.on('notification:new', (notif) => {
  const notifBox = document.getElementById('notif-box');
  const notifText = document.getElementById('notif-text');
  if (notifBox && notifText) {
    notifText.innerText = notif.message;
    notifBox.classList.remove('hidden');
    setTimeout(() => notifBox.classList.add('hidden'), 6000);
  }
});

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

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const identifier = document.getElementById('login-id').value.trim();
      const pin = document.getElementById('login-pin').value.trim();
      socket.emit('auth:login', { identifier, pin }, (res) => {
        if (!res.success) alert(res.message);
        else localStorage.setItem('star_fam_user', JSON.stringify({ username: identifier, pin }));
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
              if (res.success) localStorage.setItem('star_fam_user', JSON.stringify({ username, pin }));
              else alert(res.message);
            });
          });
      } else {
        socket.emit('auth:signup', { username, pin, tag, bio, pfp: null }, (res) => {
          if (res.success) localStorage.setItem('star_fam_user', JSON.stringify({ username, pin }));
          else alert(res.message);
        });
      }
    });
  }

  if (!document.getElementById('sticker-drawer')) {
    const drawer = document.createElement('div');
    drawer.id = 'sticker-drawer';
    drawer.className = 'hidden';
    drawer.style.cssText = 'position: absolute; bottom: 70px; left: 20px; background: rgba(20, 20, 30, 0.95); border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; z-index: 1000; box-shadow: 0 8px 24px rgba(0,0,0,0.5); backdrop-filter: blur(10px); width: 260px;';
    
    const stickers = ['🔥', '✨', '😂', '💀', '💖', '🚀', '👑', '🏆', '🎉', '👀', '💯', '🎨', '⚡', '🌟', '🎬', '💎'];
    stickers.forEach(stk => {
      const btn = document.createElement('div');
      btn.innerText = stk;
      btn.style.cssText = 'font-size: 1.8rem; text-align: center; cursor: pointer; padding: 6px; border-radius: 8px; transition: background 0.2s;';
      btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.1)';
      btn.onmouseout = () => btn.style.background = 'transparent';
      btn.onclick = () => sendSticker(stk);
      drawer.appendChild(btn);
    });

    const chatInputArea = document.querySelector('.chat-input-area') || document.getElementById('message-input').parentNode;
    chatInputArea.style.position = 'relative';
    chatInputArea.appendChild(drawer);

    const stickerToggleBtn = document.createElement('button');
    stickerToggleBtn.id = 'sticker-toggle-btn';
    stickerToggleBtn.innerHTML = '🎨';
    stickerToggleBtn.title = 'Send Sticker';
    stickerToggleBtn.style.cssText = 'background: transparent; border: none; font-size: 1.2rem; cursor: pointer; padding: 4px 8px;';
    stickerToggleBtn.onclick = (e) => {
      e.stopPropagation();
      drawer.classList.toggle('hidden');
    };
    
    const inputField = document.getElementById('message-input');
    inputField.parentNode.insertBefore(stickerToggleBtn, inputField);
  }
});

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
    .catch(() => alert('Failed to attach media.'));
}

socket.on('chat:message', (data) => {
  if (currentRoom === data.targetRoom || currentRoom === data.room) {
    appendMessage(data);
    scrollToBottom();
  }
});

socket.on('chat:refresh', () => {
  loadChatHistory(currentRoom);
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
  loadChatHistory(currentRoom);
}

function openDirectMessage(recipientUsername) {
  const cleanRecipient = recipientUsername.toLowerCase();
  currentRoom = `dm-${cleanRecipient}`;
  document.getElementById('room-title').innerText = `💬 DM with @${recipientUsername}`;
  document.getElementById('room-desc').innerText = `Private secure messaging thread`;
  document.getElementById('chat-active-area').classList.remove('hidden');
  document.getElementById('support-section-view').classList.add('hidden');
  loadChatHistory(currentRoom);
}

function loadChatHistory(room) {
  document.getElementById('messages-container').innerHTML = '';
  socket.emit('chat:fetch_history', { room }, (history) => {
    history.forEach(msg => appendMessage(msg));
    scrollToBottom();
  });
}

function appendMessage(msg) {
  const container = document.getElementById('messages-container');
  const div = document.createElement('div');
  
  const isMe = currentUser && msg.sender.toLowerCase() === currentUser.username.toLowerCase();
  const isOwner = currentUser && (currentUser.role.includes('Owner') || currentUser.username.toLowerCase() === 'starediter1');
  const canDelete = isMe || isOwner;

  div.className = 'chat-message';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  div.style.alignItems = isMe ? 'flex-end' : 'flex-start';
  div.style.marginBottom = '12px';

  let contentHtml = '';
  if (msg.isSticker) {
    contentHtml = `<div style="font-size: 3.5rem; line-height: 1;">${msg.text}</div>`;
  } else {
    let mediaHtml = '';
    if (msg.mediaUrl) {
      if (msg.mediaType && msg.mediaType.startsWith('video')) {
        mediaHtml = `<br><video src="${msg.mediaUrl}" controls preload="metadata" playsinline style="max-width: 260px; border-radius: 8px; margin-top: 6px;"></video>`;
      } else {
        mediaHtml = `<br><img src="${msg.mediaUrl}" style="max-width: 260px; border-radius: 8px; margin-top: 6px;">`;
      }
    }
    contentHtml = `<div style="font-size: 0.85rem; color: var(--text-main);">${msg.text || ''}${mediaHtml}</div>`;
  }

  const bubbleColor = msg.isSticker ? 'transparent' : (isMe ? 'rgba(138, 43, 226, 0.25)' : 'rgba(255, 255, 255, 0.05)');
  const borderColor = msg.isSticker ? 'transparent' : (isMe ? 'rgba(138, 43, 226, 0.4)' : 'rgba(255, 255, 255, 0.1)');
  const paddingStyle = msg.isSticker ? '4px' : '10px 14px';

  let avatarHtml = msg.pfp ? 
    `<img src="${msg.pfp}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 6px;">` : 
    `<span style="display: inline-block; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); text-align: center; line-height: 22px; font-size: 0.65rem; color: #fff; margin-right: 6px;">${msg.sender.charAt(0).toUpperCase()}</span>`;

  let actionButtons = `<div style="display: flex; gap: 10px; font-size: 0.65rem; margin-top: 4px; opacity: 0.8;">`;
  actionButtons += `<span style="cursor: pointer; color: var(--text-muted);" onclick="forwardMessage('${encodeURIComponent(msg.text || '')}')">Forward ↗</span>`;
  if (!msg.isSticker) {
    actionButtons += `<span style="cursor: pointer; color: var(--accent-light);" onclick="replyToMessage('${encodeURIComponent(msg.text || '')}', '${msg.sender}')">Reply ↩️</span>`;
  }
  if (canDelete) {
    actionButtons += `<span style="cursor: pointer; color: #ff8888;" onclick="deleteMessage('${msg.id}')">Delete 🗑️</span>`;
  }
  actionButtons += `</div>`;

  div.innerHTML = `
    <div style="max-width: 75%; background: ${bubbleColor}; border: 1px solid ${borderColor}; padding: ${paddingStyle}; border-radius: 12px; word-break: break-word;">
      <div style="display: flex; justify-content: space-between; gap: 15px; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px; align-items: center;">
        <span>${avatarHtml}<strong style="color: var(--text-main);">${msg.sender}</strong> <span style="color: var(--accent-light);">${msg.tag || ''}</span></span>
        <span>${msg.timestamp}</span>
      </div>
      ${contentHtml}
      ${actionButtons}
    </div>
  `;
  container.appendChild(div);
}

function sendSticker(stickerEmoji) {
  socket.emit('chat:send', {
    targetRoom: currentRoom,
    text: stickerEmoji,
    isSticker: true
  });
  const drawer = document.getElementById('sticker-drawer');
  if (drawer) drawer.classList.add('hidden');
}

function startTriviaSession() {
  currentTriviaSuite = document.getElementById('trivia-suite-select').value;
  currentTriviaIndex = 0;
  triviaScoreEarned = 0;
  lastAnswerResult = null;

  document.getElementById('trivia-setup-screen').classList.add('hidden');
  document.getElementById('trivia-game-screen').classList.remove('hidden');
  loadTriviaQuestion();
}

function loadTriviaQuestion() {
  const questions = triviaQuestionsBank[currentTriviaSuite];
  if (currentTriviaIndex >= questions.length) {
    socket.emit('trivia:submit', { points: triviaScoreEarned }, () => {
      alert(`Trivia Completed! You earned ${triviaScoreEarned} total points.`);
      closeTriviaModal();
    });
    return;
  }

  const q = questions[currentTriviaIndex];
  document.getElementById('trivia-progress').innerText = `Question ${currentTriviaIndex + 1} of 40 (${currentTriviaSuite})`;
  document.getElementById('trivia-question-text').innerText = q.question;

  const banner = document.getElementById('trivia-feedback-banner');
  if (lastAnswerResult === 'right') {
    banner.innerText = '✅ Your answer was right!';
    banner.style.background = 'rgba(46, 204, 113, 0.2)';
    banner.style.color = '#2ecc71';
    banner.classList.remove('hidden');
  } else if (lastAnswerResult === 'wrong') {
    banner.innerText = '❌ Your answer was wrong!';
    banner.style.background = 'rgba(231, 76, 60, 0.2)';
    banner.style.color = '#e74c3c';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  const container = document.getElementById('trivia-options-container');
  container.innerHTML = '';
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'footer-btn';
    btn.style.textAlign = 'left';
    btn.style.padding = '12px 16px';
    btn.innerText = opt;
    btn.onclick = () => submitTriviaChoice(idx === q.correctIndex);
    container.appendChild(btn);
  });
}

function submitTriviaChoice(isCorrect) {
  if (isCorrect) {
    triviaScoreEarned += 5;
    lastAnswerResult = 'right';
  } else {
    lastAnswerResult = 'wrong';
  }
  currentTriviaIndex++;
  loadTriviaQuestion();
}

function replyToMessage(encodedText, sender) {
  const text = decodeURIComponent(encodedText);
  const input = document.getElementById('message-input');
  input.value = `@${sender} replied: "${text}" - `;
  input.focus();
}

function deleteMessage(msgId) {
  socket.emit('chat:delete', { msgId, room: currentRoom });
}

function forwardMessage(text) {
  const decoded = decodeURIComponent(text);
  const input = document.getElementById('message-input');
  input.value = decoded;
  input.focus();
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text && !attachedMediaUrl) return;

  socket.emit('chat:send', {
    targetRoom: currentRoom,
    text: text,
    mediaUrl: attachedMediaUrl,
    mediaType: attachedMediaType,
    isSticker: false
  });

  input.value = '';
  attachedMediaUrl = null;
  attachedMediaType = null;
  const indicator = document.getElementById('media-indicator');
  if (indicator) indicator.innerText = '';
}

function handleKeyPress(e) {
  if (e.key === 'Enter') sendMessage();
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

function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); }
function toggleEditProfileMode() { document.getElementById('edit-profile-section').classList.toggle('hidden'); }

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
      closeProfileModal();
    });
  };

  if (fileInput && fileInput.files[0]) {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    fetch('/api/upload', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => executeUpdate(data.url));
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
    let html = '';
    list.forEach((u, i) => {
      html += `<li style="display:flex; justify-content:space-between; padding:6px 0; border-bottom: 1px solid var(--border-color);"><span>#${i+1} ${u.username}</span> <strong style="color: var(--accent-light);">${u.score} pts</strong></li>`;
    });
    document.getElementById('leaderboard-list').innerHTML = html;
  });
}
function closeLeaderboardModal() { document.getElementById('leaderboard-modal').classList.add('hidden'); }

function openTriviaModal() {
  document.getElementById('trivia-setup-screen').classList.remove('hidden');
  document.getElementById('trivia-game-screen').classList.add('hidden');
  document.getElementById('trivia-modal').classList.remove('hidden');
}

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
function toggleNotifBox() { document.getElementById('notif-box').classList.toggle('hidden'); }
function toggleMobileView() { document.querySelector('.sidebar').classList.toggle('mobile-open'); }

function processPayment(type) {
  let amt = type === 'donate' ? (document.getElementById('donate-amount').value || '5') : '3.00';
  let itemName = type === 'donate' ? 'Creator Donation' : 'Personal Edit';

  socket.emit('owner:paypal:fetch', (res) => {
    const receiver = res.paypalEmail || 'starediter1@gmail.com';
    const customData = JSON.stringify({ username: currentUser.username });
    const url = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(receiver)}&item_name=${encodeURIComponent(itemName)}&amount=${amt}&currency_code=USD&custom=${encodeURIComponent(customData)}`;
    window.open(url, '_blank');
  });
}

socket.on('users:update', (users) => {
  activeUsersList = users;
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
});

socket.on('auth:success', (user) => {
  currentUser = user;
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('my-name').innerText = user.username;
  document.getElementById('my-tag').innerText = user.tag || `@${user.username}`;
  document.getElementById('my-role').innerText = user.role || 'Editor';
  if (user.pfp) {
    document.getElementById('my-avatar').innerHTML = `<img src="${user.pfp}" style="width:100%; height:100%; object-fit:cover;">`;
  }
  if (user.username.toLowerCase() === 'starediter1') {
    document.getElementById('btn-create-poll').classList.remove('hidden');
    document.getElementById('btn-analytics').classList.remove('hidden');
    document.getElementById('btn-notif-bell').classList.remove('hidden');
  }
  switchRoom('global');
});