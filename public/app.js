const socket = io();

let currentUser = null;
let currentRoom = 'dm-starediter1';
let replyToMessage = null;
let pendingMediaFile = null;

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

const signupFormEl = document.getElementById('signup-form');
if (signupFormEl) {
  signupFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const pin = document.getElementById('signup-pin').value.trim();
    const tag = document.getElementById('signup-tag').value.trim();
    const bio = document.getElementById('signup-bio').value.trim();
    let pfp = '';

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

socket.on('auth:success', (user) => {
  currentUser = user;
  localStorage.setItem('star_fam_user', JSON.stringify(user));

  if (authOverlay) authOverlay.classList.add('hidden');
  if (mainAppContainer) mainAppContainer.classList.remove('hidden');

  document.getElementById('my-name').textContent = user.username;
  document.getElementById('my-tag').textContent = user.tag;
  document.getElementById('my-role').textContent = user.role;
  
  const avatarEl = document.getElementById('my-avatar');
  if (user.pfp) {
    avatarEl.innerHTML = `<img src="${user.pfp}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  } else {
    avatarEl.textContent = user.username.charAt(0).toUpperCase();
  }

  if (user.username.toLowerCase() === 'starediter1' || user.role.includes('Owner')) {
    document.getElementById('btn-analytics').classList.remove('hidden');
    document.getElementById('btn-notif-bell').classList.remove('hidden');
  }

  const defaultStartRoom = user.username.toLowerCase() === 'starediter1' ? 'dm-renedits' : 'dm-starediter1';
  switchRoom(defaultStartRoom);
  loadDMsList();
});

window.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('star_fam_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      socket.emit('auth:login', { identifier: parsed.username, pin: parsed.pin }, (res) => {});
    } catch(e) {}
  }
});

function switchRoom(room) {
  currentRoom = room.toLowerCase();
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#user-list li').forEach(li => li.style.background = 'transparent');
  
  document.getElementById('support-section-view').classList.add('hidden');
  document.getElementById('chat-active-area').classList.remove('hidden');

  if (currentRoom === 'global') {
    document.getElementById('btn-global').classList.add('active');
    document.getElementById('room-title').textContent = '🌐 Community Lounge';
    document.getElementById('room-desc').textContent = 'Public lounge for presets, edits & polls';
    document.getElementById('btn-create-poll').classList.remove('hidden');
    loadRoomContent();
  } else if (currentRoom === 'editing-comp') {
    document.getElementById('btn-comp').classList.add('active');
    document.getElementById('room-title').textContent = '🏆 Editing Comp';
    document.getElementById('room-desc').textContent = 'Official Editing Competition channel!';
    document.getElementById('btn-create-poll').classList.remove('hidden');
    loadRoomContent();
  } else if (currentRoom === 'support-hub') {
    document.getElementById('btn-support').classList.add('active');
    document.getElementById('chat-active-area').classList.add('hidden');
    document.getElementById('support-section-view').classList.remove('hidden');
  } else if (currentRoom.startsWith('dm-')) {
    const targetUser = currentRoom.replace('dm-', '');
    document.getElementById('room-title').textContent = `💬 Direct Chat with @${targetUser}`;
    document.getElementById('room-desc').textContent = `Private messaging with @${targetUser}`;
    document.getElementById('btn-create-poll').classList.add('hidden');
    loadRoomContent();
  }

  if (window.innerWidth <= 768) {
    toggleMobileView('chat');
  }
}

function toggleMobileView(view) {
  const sidebar = document.querySelector('.sidebar');
  const chatMain = document.querySelector('.chat-main');
  const toggleBtn = document.getElementById('mobile-toggle-btn');

  if (view === 'sidebar') {
    sidebar.classList.remove('mobile-hidden');
    chatMain.classList.add('mobile-hidden');
    if (toggleBtn) toggleBtn.textContent = '💬 Open Chat';
  } else {
    sidebar.classList.add('mobile-hidden');
    chatMain.classList.remove('mobile-hidden');
    if (toggleBtn) toggleBtn.textContent = '☰ Menu';
  }
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

function loadDMsList() {
  socket.emit('dms:fetch_list', (dms) => {
    const userList = document.getElementById('user-list');
    if (!userList) return;
    userList.innerHTML = '';
    
    if (!dms || dms.length === 0) {
      userList.innerHTML = '<li style="font-size:0.75rem; color:var(--text-muted); padding:3px 0;">No active DMs</li>';
      return;
    }

    const seenNames = new Set();

    dms.forEach(dm => {
      const lowerName = dm.username.toLowerCase();
      if (lowerName === currentUser.username.toLowerCase() || seenNames.has(lowerName)) return;
      seenNames.add(lowerName);

      const targetDmRoom = `dm-${lowerName}`;
      const li = document.createElement('li');
      li.style.fontSize = '0.8rem';
      li.style.padding = '6px 8px';
      li.style.borderRadius = '6px';
      li.style.cursor = 'pointer';
      li.style.margin = '2px 0';
      li.style.color = currentRoom === targetDmRoom ? 'var(--accent-light)' : 'var(--text-main)';
      li.style.background = currentRoom === targetDmRoom ? 'rgba(147, 51, 234, 0.25)' : 'transparent';
      li.innerHTML = `🟢 @${dm.username}`;
      li.onclick = () => switchRoom(targetDmRoom);
      userList.appendChild(li);
    });
  });
}

async function handleMediaAttachment(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const indicator = document.getElementById('media-indicator');
  if (indicator) indicator.textContent = `📎 Attached: ${file.name} (Uploading...)`;
  
  const mediaUrl = await uploadFileToServer(file);
  pendingMediaFile = {
    url: mediaUrl,
    type: file.type.startsWith('video') ? 'video' : 'image'
  };

  if (indicator) indicator.textContent = `📎 Ready: ${file.name}`;
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text && !pendingMediaFile) return;

  socket.emit('chat:send', { 
    targetRoom: currentRoom, 
    text,
    mediaUrl: pendingMediaFile ? pendingMediaFile.url : null,
    mediaType: pendingMediaFile ? pendingMediaFile.type : null,
    replyTo: replyToMessage ? { id: replyToMessage.id, sender: replyToMessage.sender, text: replyToMessage.text } : null
  });

  input.value = '';
  pendingMediaFile = null;
  const indicator = document.getElementById('media-indicator');
  if (indicator) indicator.textContent = '';
  cancelReply();
}

function handleKeyPress(e) {
  if (e.key === 'Enter') sendMessage();
}

socket.on('chat:message', (msg) => {
  const msgRoom = (msg.targetRoom || msg.room || '').toLowerCase();
  if (msgRoom === currentRoom) {
    renderMessage(msg);
  }
  loadDMsList();
});

function setReplyTo(id, sender, text) {
  replyToMessage = { id, sender, text };
  let previewBar = document.getElementById('reply-preview-bar');
  if (!previewBar) {
    previewBar = document.createElement('div');
    previewBar.id = 'reply-preview-bar';
    previewBar.style.cssText = 'background: rgba(147, 51, 234, 0.2); padding: 4px 8px; font-size: 0.75rem; border-left: 3px solid var(--accent-light); margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;';
    const inputArea = document.querySelector('.chat-input-area');
    inputArea.insertBefore(previewBar, inputArea.firstChild);
  }
  previewBar.innerHTML = `<span>Replying to <strong>@${sender}</strong>: ${(text || 'Media').substring(0, 30)}...</span> <button onclick="cancelReply()" style="background:none; border:none; color:#ff8888; cursor:pointer;">✕</button>`;
}

function cancelReply() {
  replyToMessage = null;
  const previewBar = document.getElementById('reply-preview-bar');
  if (previewBar) previewBar.remove();
}

function renderMessage(msg) {
  const container = document.getElementById('messages-container');
  if (!container || !currentUser) return;
  
  const div = document.createElement('div');
  div.className = `message-row ${msg.sender.toLowerCase() === currentUser.username.toLowerCase() ? 'my-msg' : ''}`;

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

    const canDeletePoll = currentUser.username.toLowerCase() === msg.sender.toLowerCase() || currentUser.role.includes('Owner') || currentUser.username.toLowerCase() === 'starediter1';
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
    const isOwnerUser = currentUser.username.toLowerCase() === 'starediter1' || currentUser.role.includes('Owner');
    const canDelete = currentUser.username.toLowerCase() === msg.sender.toLowerCase() || isOwnerUser;
    const deleteBtn = canDelete ? `<button onclick="deleteMessage('${msg.id}')" title="Delete message" style="background:none; border:none; color:#ff8888; cursor:pointer; font-size:0.75rem; padding:0 4px; vertical-align:middle;">🗑️</button>` : '';
    const replyBtn = `<button onclick="setReplyTo('${msg.id}', '${msg.sender}', \`${(msg.text || '').replace(/`/g, '')}\`)" title="Reply" style="background:none; border:none; color:var(--accent-light); cursor:pointer; font-size:0.75rem; padding:0 4px; vertical-align:middle;">↩️</button>`;

    let replyContextHtml = '';
    if (msg.replyTo) {
      replyContextHtml = `<div style="font-size:0.7rem; background:rgba(0,0,0,0.2); padding:3px 6px; border-left:2px solid var(--accent-light); margin-bottom:4px; color:var(--text-muted);">Replying to @${msg.replyTo.sender}: ${msg.replyTo.text}</div>`;
    }

    let mediaHtml = '';
    if (msg.mediaUrl) {
      if (msg.mediaType === 'video') {
        mediaHtml = `<div style="margin-top:6px;"><video src="${msg.mediaUrl}" controls style="max-width:100%; max-height:300px; border-radius:8px;"></video></div>`;
      } else {
        mediaHtml = `<div style="margin-top:6px;"><img src="${msg.mediaUrl}" style="max-width:100%; max-height:300px; border-radius:8px; object-fit:cover;"></div>`;
      }
    }

    const avatarHtml = msg.pfp ? `<img src="${msg.pfp}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; vertical-align:middle; margin-right:4px;">` : '';

    div.innerHTML = `
      <div class="msg-bubble glass-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div style="font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center;">
            ${avatarHtml}
            <span>@${msg.sender} (${msg.role})</span>
          </div>
          <div>
            ${replyBtn}
            ${deleteBtn}
          </div>
        </div>
        ${replyContextHtml}
        ${msg.text ? `<div style="margin-top:2px;">${msg.text}</div>` : ''}
        ${mediaHtml}
      </div>
    `;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function deleteMessage(msgId) {
  if (confirm('Delete this message?')) {
    socket.emit('chat:delete', { msgId, room: currentRoom });
  }
}

socket.on('chat:refresh', () => {
  loadRoomContent();
});

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

function openMyProfile() {
  document.getElementById('profile-modal').classList.remove('hidden');
  document.getElementById('modal-username').textContent = currentUser.username;
  document.getElementById('modal-tag').textContent = currentUser.tag;
  document.getElementById('modal-role').textContent = currentUser.role;
  document.getElementById('modal-bio').textContent = currentUser.bio;
  
  const avatarEl = document.getElementById('modal-avatar');
  if (currentUser.pfp) {
    avatarEl.innerHTML = `<img src="${currentUser.pfp}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  } else {
    avatarEl.textContent = currentUser.username.charAt(0).toUpperCase();
  }

  document.getElementById('edit-tag').value = currentUser.tag;
  document.getElementById('edit-bio').value = currentUser.bio;
  document.getElementById('edit-profile-section').classList.add('hidden');

  const isOwnerUser = currentUser.username.toLowerCase() === 'starediter1' || currentUser.role.includes('Owner');
  const paypalFieldContainer = document.getElementById('owner-paypal-field-container');

  if (isOwnerUser) {
    if (paypalFieldContainer) paypalFieldContainer.classList.remove('hidden');
    document.getElementById('edit-paypal').value = currentUser.paypalEmail || '';
  } else {
    if (paypalFieldContainer) paypalFieldContainer.classList.add('hidden');
  }
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.add('hidden');
}

function toggleEditProfileMode() {
  const section = document.getElementById('edit-profile-section');
  section.classList.toggle('hidden');
}

async function saveProfileChanges() {
  const newTag = document.getElementById('edit-tag').value.trim();
  const newBio = document.getElementById('edit-bio').value.trim();
  const isOwnerUser = currentUser.username.toLowerCase() === 'starediter1' || currentUser.role.includes('Owner');
  const newPaypal = isOwnerUser ? document.getElementById('edit-paypal').value.trim() : currentUser.paypalEmail;
  const fileInput = document.getElementById('edit-pfp-file');

  let newPfp = currentUser.pfp;
  if (fileInput && fileInput.files[0]) {
    newPfp = await uploadFileToServer(fileInput.files[0]);
  }

  socket.emit('profile:update', { tag: newTag, bio: newBio, paypalEmail: newPaypal, pfp: newPfp }, (res) => {
    if (res && res.success) {
      currentUser.tag = newTag || currentUser.tag;
      currentUser.bio = newBio || currentUser.bio;
      currentUser.paypalEmail = newPaypal || currentUser.paypalEmail;
      currentUser.pfp = newPfp;
      localStorage.setItem('star_fam_user', JSON.stringify(currentUser));
      
      document.getElementById('my-tag').textContent = currentUser.tag;
      document.getElementById('modal-tag').textContent = currentUser.tag;
      document.getElementById('modal-bio').textContent = currentUser.bio;

      if (newPfp) {
        document.getElementById('my-avatar').innerHTML = `<img src="${newPfp}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        document.getElementById('modal-avatar').innerHTML = `<img src="${newPfp}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      }
      
      alert('Profile updated successfully!');
      closeProfileModal();
    } else {
      alert(res?.message || 'Failed to update profile');
    }
  });
}

function processPayment(type) {
  socket.emit('owner:paypal:fetch', (data) => {
    const ownerPaypal = data.paypalEmail || 'starediter1@gmail.com';
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

    const customData = JSON.stringify({ username: currentUser.username });
    const returnUrl = window.location.origin;

    const paypalUrl = `https://www.paypal.com/cgi-bin/websc?cmd=_xclick&business=${encodeURIComponent(ownerPaypal)}&item_name=${encodeURIComponent(itemName)}&amount=${amount}&currency_code=USD&custom=${encodeURIComponent(customData)}&return=${encodeURIComponent(returnUrl)}&notify_url=${encodeURIComponent(window.location.origin + '/paypal/ipn')}`;
    
    window.location.href = paypalUrl;
  });
}

function logoutUser() {
  localStorage.removeItem('star_fam_user');
  location.reload();
}

function openLeaderboardModal() {
  document.getElementById('leaderboard-modal').classList.remove('hidden');
  socket.emit('leaderboard:fetch', (list) => {
    const ul = document.getElementById('leaderboard-list');
    ul.innerHTML = '';
    if (!list || list.length === 0) {
      ul.innerHTML = `<li>#1 @${currentUser.username} (${currentUser.selectedApp || 'After Effects'}) - ${currentUser.score || 0} pts [${currentUser.level || 'Novice'}]</li>`;
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

let currentSelectedApp = 'After Effects';
let currentTriviaQuestion = null;
let selectedAnswerIndex = null;
let sessionTriviaScore = 0;

const triviaBank = {
  "After Effects": [
    { q: "What tool is primarily used for 3D camera tracking in After Effects?", options: ["Camera Tracker", "Pen Tool", "Hand Tool", "Puppet Pin"], correct: 0 },
    { q: "Which key shortcut opens the Position property of a layer?", options: ["S", "T", "P", "R"], correct: 2 },
    { q: "What layer type is used to apply effects to multiple layers underneath it?", options: ["Solid Layer", "Adjustment Layer", "Shape Layer", "Text Layer"], correct: 1 },
    { q: "What file extension is standard for an After Effects project file?", options: [".aep", ".mp4", ".mov", ".prproj"], correct: 0 },
    { q: "Which property controls the transparency of a layer in After Effects?", options: ["Opacity", "Scale", "Rotation", "Position"], correct: 0 },
    { q: "What expression language is used in After Effects for automated motion?", options: ["JavaScript / Expressions", "Python", "C++", "HTML"], correct: 0 },
    { q: "Which panel allows you to keyframe and ease animation curves?", options: ["Graph Editor", "Timeline Panel", "Effect Controls", "Project Panel"], correct: 0 },
    { q: "What does rotoscoping allow you to do in video editing?", options: ["Cut out moving subjects frame by frame", "Add background music", "Export to MP4", "Change resolution"], correct: 0 },
    { q: "Which effect creates glowing visual highlights based on luminance?", options: ["Glow / CC Glow", "Gaussian Blur", "Mosaic", "Tint"], correct: 0 },
    { q: "What is the shortcut to RAM preview your composition in real-time?", options: ["Numpad 0 / Spacebar", "Ctrl + C", "Alt + Shift", "F5"], correct: 0 }
  ],
  "CapCut": [
    { q: "What feature is popular in CapCut for smooth slow-motion velocity edits?", options: ["Curve Speed", "Chroma Key", "Keyframing", "Masking"], correct: 0 },
    { q: "Which tool removes a solid background color in CapCut?", options: ["Mask", "Chroma Key", "Split", "Blend Mode"], correct: 1 },
    { q: "What type of effect creates glowing edge outlines in CapCut edits?", options: ["Edge Glow / Blur", "Crop", "Canvas", "Reverse"], correct: 0 },
    { q: "How do you split a clip at the playhead position?", options: ["Split / Cut Button", "Delete", "Export", "Speed Up"], correct: 0 },
    { q: "What feature matches professional beats automatically in CapCut?", options: ["Auto Beat Sync", "Canvas", "Reverse", "Chroma Key"], correct: 0 },
    { q: "Which CapCut setting adjusts clip color grading profiles and filters?", options: ["Adjust / Filters", "Audio Mute", "Aspect Ratio", "Speed Ramp"], correct: 0 },
    { q: "What tool allows tracking text or stickers to a moving object?", options: ["Motion Tracking", "Split", "Keyframe", "Canvas"], correct: 0 },
    { q: "How do you reverse video playback direction in CapCut?", options: ["Reverse Tool", "Crop", "Freeze", "Delete"], correct: 0 },
    { q: "Which option lets you isolate audio from a video track easily?", options: ["Extract Audio", "Mute", "Volume Boost", "Fade In"], correct: 0 },
    { q: "What feature adds dynamic camera shake effects to edits?", options: ["Camera Shake / Shake Effect", "Invert", "Blur", "Monochrome"], correct: 0 }
  ],
  "Alight Motion": [
    { q: "Alight Motion is widely recognized as a powerful editor for which device platform?", options: ["Mobile (iOS/Android)", "Cinema Projectors", "Consoles Only", "VR Headsets"], correct: 0 },
    { q: "What feature allows smooth transitions using math curves in Alight Motion?", options: ["Graph / Keyframe Curves", "Filters", "Audio Beats", "Watermark"], correct: 0 },
    { q: "What effect bends or distorts layers smoothly in Alight Motion?", options: ["Warp / Wave Warp", "Crop", "Solid Fill", "Volume Boost"], correct: 0 },
    { q: "How do you duplicate a selected layer quickly?", options: ["Layer Duplicate Button", "Reinstall App", "Clear Cache", "Mute Audio"], correct: 0 },
    { q: "Which element lets you group multiple elements into one animation container?", options: ["Group / Ungroup", "Split", "Delete", "Export"], correct: 0 },
    { q: "What blending mode is commonly used for glowing overlays in Alight Motion?", options: ["Screen / Linear Dodge", "Normal", "Darken", "Dissolve"], correct: 0 },
    { q: "How do you add vector shapes to your composition?", options: ["Shape Element Button", "Audio Track", "Export Menu", "Background Color"], correct: 0 },
    { q: "Which feature lets you copy effect settings between different layers?", options: ["Copy Effects / Paste Effects", "Delete Layer", "Lock Track", "Split Clip"], correct: 0 },
    { q: "What format supports exporting vector animations with transparency?", options: ["XML / Alight Package / GIF", "TXT", "EXE", "DOCX"], correct: 0 },
    { q: "How do you adjust timing length of keyframes across a timeline?", options: ["Extending layer duration / Retiming", "Rebooting phone", "Changing theme", "Turning off GPS"], correct: 0 }
  ],
  "Blur": [
    { q: "What is Blur app primarily utilized for by edit creators?", options: ["Smooth velocity and transition edits", "Spreadsheet management", "Vector logo design", "Coding websites"], correct: 0 },
    { q: "Keyframes in Blur help control what property over time?", options: ["Motion, scale, and opacity", "Battery percentage", "File size", "Storage limit"], correct: 0 },
    { q: "What type of clips benefit most from Blur's optical flow motion effects?", options: ["Fast-paced anime or cinematic clips", "Static pictures", "Plain text", "Audio waveforms"], correct: 0 },
    { q: "How do you fine-tune timing in Blur?", options: ["Trimming and splitting timelines", "Restarting phone", "Changing wallpaper", "Turning off Wi-Fi"], correct: 0 },
    { q: "What format do users usually export finished edits from Blur in?", options: ["MP4 / Video File", "TXT", "HTML", "EXE"], correct: 0 },
    { q: "Which effect creates directional motion streaks in Blur?", options: ["Motion Blur", "Invert Color", "Crop Tool", "Volume Control"], correct: 0 },
    { q: "How do you match clip cuts perfectly to audio drops in Blur?", options: ["Audio beat markers & cutting", "Random deletion", "Exporting project", "Locking screen"], correct: 0 },
    { q: "What layer adjustment improves overall contrast and vibrance?", options: ["Color Grading / Saturation", "Mute Track", "Rename File", "Clear Data"], correct: 0 },
    { q: "Why do creators use optical flow interpolation?", options: ["To generate smooth ultra slow-motion frames", "To compress file size", "To add subtitles", "To create polls"], correct: 0 },
    { q: "How do you duplicate clips to maintain consistent pacing?", options: ["Duplicate Clip Feature", "Re-download App", "Reset Phone", "Unplug Charger"], correct: 0 }
  ],
  "Video Star": [
    { q: "Video Star is legendary for editing music videos on which operating system?", options: ["iOS / iPhone", "Windows 95", "Linux Ubuntu", "MS-DOS"], correct: 0 },
    { q: "What coloring feature lets you color grade clips frame-by-frame in Video Star?", options: ["Multi-Layer / Coloring Effects", "Calculator", "Notes", "Contacts"], correct: 0 },
    { q: "What makes Video Star transitions seamless when timed right?", options: ["Beat markers and keyframes", "Random cutting", "Muting audio", "Deleting clips"], correct: 0 },
    { q: "Which subscription tier unlocks advanced multi-layer effects in Video Star?", options: ["All Access Pass", "Free Trial Forever", "Basic Mode", "Offline Pass"], correct: 0 },
    { q: "What tool lets you re-time actions precisely inside Video Star?", options: ["Re-time Tool", "Delete Tool", "Brightness Slider", "Volume Muter"], correct: 0 },
    { q: "What feature allows you to stack clips and apply masking in Video Star?", options: ["Multi-Layer Tool", "Single Track", "Audio Mixer", "Text Generator"], correct: 0 },
    { q: "How do you create custom flashing color effects (flash transitions)?", options: ["Color Flash / Quick Effect presets", "Deleting app", "Muting sound", "Restarting device"], correct: 0 },
    { q: "What effect bends video frames into 3D shapes inside Video Star?", options: ["3D Transforms / Scene", "Crop Tool", "Blur Slider", "Volume Gauge"], correct: 0 },
    { q: "How do you save your completed Video Star masterpiece to camera roll?", options: ["Export to Camera Roll", "Email to Friend", "Delete Project", "Clear Cache"], correct: 0 },
    { q: "What is essential for timing complex keyframe movements in Video Star?", options: ["Accurate beat placement", "Random tapping", "Closing app", "Changing device language"], correct: 0 }
  ]
};

function openTriviaModal() {
  document.getElementById('trivia-modal').classList.remove('hidden');
  document.getElementById('trivia-app-select').classList.remove('hidden');
  document.getElementById('trivia-game-box').classList.add('hidden');
  sessionTriviaScore = 0;
}

function closeTriviaModal() {
  document.getElementById('trivia-modal').classList.add('hidden');
}

function startTriviaGame() {
  const appDropdown = document.getElementById('selected-app-dropdown');
  currentSelectedApp = appDropdown ? appDropdown.value : 'After Effects';
  
  document.getElementById('trivia-app-select').classList.add('hidden');
  document.getElementById('trivia-game-box').classList.remove('hidden');
  
  loadNextTriviaQuestion();
}

function loadNextTriviaQuestion() {
  selectedAnswerIndex = null;
  const questions = triviaBank[currentSelectedApp] || triviaBank["After Effects"];
  currentTriviaQuestion = questions[Math.floor(Math.random() * questions.length)];

  document.getElementById('quiz-level-tag').textContent = `App: ${currentSelectedApp}`;
  document.getElementById('quiz-score-tag').textContent = `Points: ${sessionTriviaScore}`;
  document.getElementById('trivia-question').textContent = currentTriviaQuestion.q;

  const optionsContainer = document.getElementById('trivia-options');
  optionsContainer.innerHTML = '';

  currentTriviaQuestion.options.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.className = 'btn-secondary';
    btn.style.cssText = 'width: 100%; margin-bottom: 6px; text-align: left; display: block;';
    btn.textContent = opt;
    btn.onclick = () => selectTriviaOption(index, btn);
    optionsContainer.appendChild(btn);
  });
}

function selectTriviaOption(index, btnElement) {
  document.querySelectorAll('#trivia-options button').forEach(b => {
    b.style.borderColor = 'var(--border-color)';
    b.style.background = 'rgba(147, 51, 234, 0.15)';
  });
  selectedAnswerIndex = index;
  btnElement.style.borderColor = 'var(--accent-light)';
  btnElement.style.background = 'rgba(147, 51, 234, 0.4)';
}

function submitTriviaAnswerAndNext() {
  if (selectedAnswerIndex === null) {
    alert('Please select an option before moving to the next question!');
    return;
  }

  const isCorrect = (selectedAnswerIndex === currentTriviaQuestion.correct);
  if (isCorrect) {
    sessionTriviaScore += 5;
  }

  socket.emit('trivia:submit', { score: isCorrect ? 5 : 0, selectedApp: currentSelectedApp }, (res) => {
    if (res && res.success) {
      currentUser.score = res.totalScore;
      currentUser.level = res.level;
    }
  });

  loadNextTriviaQuestion();
}

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
  loadDMsList();
});