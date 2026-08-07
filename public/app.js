document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    let currentUserData = null;
    let currentRoom = 'creator';
    let targetDMUser = null;
    let activePollsData = [];

    const savedUser = localStorage.getItem('starFamUser') || sessionStorage.getItem('starFamUser');
    const authOverlay = document.getElementById('auth-overlay');
    const appContainer = document.getElementById('app');

    if (savedUser) {
        try {
            const userData = JSON.parse(savedUser);
            socket.emit('auth:login', { identifier: userData.username, pin: userData.pin }, (res) => {
                if (res.success) {
                    // Success handled in socket listener
                } else {
                    localStorage.removeItem('starFamUser');
                    sessionStorage.removeItem('starFamUser');
                }
            });
        } catch (e) {
            localStorage.removeItem('starFamUser');
        }
    }

    socket.on('auth:success', (user) => {
        currentUserData = user;
        authOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');

        document.getElementById('my-name').innerText = user.username;
        document.getElementById('my-tag').innerText = user.tag;
        document.getElementById('my-role').innerText = user.role;
        if (user.pfp) {
            document.getElementById('my-avatar').innerHTML = `<img src="${user.pfp}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }

        // Populate profile modal details matching video
        document.getElementById('modal-username').innerText = user.username;
        document.getElementById('modal-tag').innerText = user.tag;
        document.getElementById('modal-role').innerText = user.role;
        document.getElementById('modal-bio').innerText = user.bio;
        if (user.pfp) {
            document.getElementById('modal-pfp').innerHTML = `<img src="${user.pfp}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }

        if (user.isOwner || user.username.toLowerCase() === 'starediter1') {
            document.getElementById('btn-analytics').classList.remove('hidden');
            document.getElementById('btn-notif-bell').classList.remove('hidden');
            document.getElementById('edit-profile-section').classList.remove('hidden');
            document.getElementById('edit-tag').value = user.tag;
            document.getElementById('edit-bio').value = user.bio;
            document.getElementById('edit-paypal').value = user.paypalEmail || '';
        } else {
            document.getElementById('creator-options').classList.remove('hidden');
        }

        switchRoom('creator');
    });

    // Form Handling: Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const identifier = document.getElementById('login-id').value.trim();
            const pin = document.getElementById('login-pin').value.trim();

            socket.emit('auth:login', { identifier, pin }, (res) => {
                if (!res.success) {
                    alert(res.message || 'Login failed.');
                }
            });
        });
    }

    // Form Handling: Sign Up
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
                } else {
                    alert(res.message || 'Sign up failed.');
                }
            });
        });
    }

    // Chat / Messages Sync Listeners
    socket.on('chat:message', (msg) => {
        if (currentRoom === msg.targetRoom) {
            appendMessage(msg);
        }
    });

    socket.on('chat:creator_sync', (msg) => {
        if (currentRoom === 'creator') {
            appendMessage(msg);
        }
    });

    socket.on('chat:dm_sync', ({ dmKey, payload }) => {
        if (currentRoom.startsWith('dm:') && currentRoom.split('dm:')[1] === targetDMUser) {
            appendMessage(payload);
        }
    });

    socket.on('chat:refresh', ({ room }) => {
        if (currentRoom === room) {
            loadChatHistory();
        }
    });

    socket.on('users:update', (users) => {
        const list = document.getElementById('user-list');
        if (!list) return;
        list.innerHTML = '';
        users.forEach(u => {
            if (currentUserData && u.username === currentUserData.username) return;
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.style.padding = '6px';
            li.innerHTML = `🟢 ${u.username} <small style="color:var(--text-muted);">${u.tag}</small>`;
            li.onclick = () => startDM(u.username);
            list.appendChild(li);
        });
    });

    socket.on('poll:updated', ({ room }) => {
        if (currentRoom === room) {
            fetchPollsForRoom(room);
        }
    });

    window.switchRoom = function(room, dmUser = null) {
        currentRoom = room;
        targetDMUser = dmUser;

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        if (room === 'creator') document.getElementById('btn-creator').classList.add('active');
        if (room === 'global') document.getElementById('btn-global').classList.add('active');
        if (room === 'editing-comp') document.getElementById('btn-comp').classList.add('active');

        const roomTitle = document.getElementById('room-title');
        const roomDesc = document.getElementById('room-desc');
        const pollBtn = document.getElementById('btn-create-poll');

        if (room === 'creator') {
            roomTitle.innerText = '👑 Creator Direct Chat';
            roomDesc.innerText = 'Direct private communication line with @starediter1';
            pollBtn.classList.add('hidden');
        } else if (room === 'global') {
            roomTitle.innerText = '🌐 Community Lounge';
            roomDesc.innerText = 'Public lounge for presets, edits & polls';
            pollBtn.classList.remove('hidden');
        } else if (room === 'editing-comp') {
            roomTitle.innerText = '🏆 Editing Comp';
            roomDesc.innerText = 'Official Editing competition channel!';
            pollBtn.classList.remove('hidden');
        } else if (room.startsWith('dm:')) {
            roomTitle.innerText = `💬 Private Chat with @${dmUser}`;
            roomDesc.innerText = 'Secure end-to-end direct message';
            pollBtn.classList.add('hidden');
        }

        loadChatHistory();
        fetchPollsForRoom(room === 'creator' ? 'creator' : room);
    };

    function loadChatHistory() {
        const container = document.getElementById('messages-container');
        container.innerHTML = '';
        socket.emit('chat:fetch_history', { room: currentRoom, targetUser: targetDMUser }, (history) => {
            if (Array.isArray(history)) {
                history.forEach(m => appendMessage(m));
            }
        });
    }

    function appendMessage(msg) {
        const container = document.getElementById('messages-container');
        const div = document.createElement('div');
        div.className = `message-row ${msg.sender === (currentUserData ? currentUserData.username : '') ? 'my-msg' : ''}`;
        
        let attachmentHtml = '';
        if (msg.attachment) {
            if (msg.attachment.type === 'image') {
                attachmentHtml = `<br><img src="${msg.attachment.url}" style="max-width:200px;border-radius:6px;margin-top:6px;">`;
            } else {
                attachmentHtml = `<br><a href="${msg.attachment.url}" target="_blank" style="color:var(--accent-light);">📎 ${msg.attachment.name}</a>`;
            }
        }

        div.innerHTML = `
            <div class="msg-bubble glass-box">
                <div style="display:flex; justify-content:space-between; gap:10px;">
                    <strong>${msg.sender}</strong>
                    <span style="font-size:0.65rem; color:var(--text-muted);">${msg.timestamp}</span>
                </div>
                <div style="margin-top:4px;">${msg.text}</div>
                ${attachmentHtml}
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    window.sendMessage = function() {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        if (!text) return;

        socket.emit('chat:send', {
            targetRoom: currentRoom.startsWith('dm:') ? `dm:${targetDMUser}` : currentRoom,
            text
        });
        input.value = '';
    };

    window.fetchPollsForRoom = function(room) {
        socket.emit('poll:fetch', room, (polls) => {
            activePollsData = polls;
            renderActivePoll();
        });
    };

    function renderActivePoll() {
        const display = document.getElementById('active-poll-display');
        if (!display) return;
        if (!activePollsData || activePollsData.length === 0) {
            display.innerHTML = '';
            display.classList.remove('active');
            return;
        }

        display.classList.add('active');
        const poll = activePollsData[activePollsData.length - 1]; // Show latest poll
        let optionsHtml = '';
        poll.options.forEach((opt, idx) => {
            const votesCount = opt.votes ? opt.votes.length : 0;
            optionsHtml += `
                <button class="poll-option-btn glass-box" onclick="votePoll('${poll.id}', ${idx})" style="width:150%; margin:4px 0; text-align:left; padding:8px; cursor:pointer;">
                    ${opt.text} <span style="float:right; color:var(--accent-light);">${votesCount} votes</span>
                </button>
            `;
        });

        display.innerHTML = `
            <div class="poll-card glass-panel" style="padding:10px; margin-bottom:10px; border:1px solid var(--accent);">
                <h4 style="color:var(--accent-light);">📊 Poll by @${poll.creator}: ${poll.question}</h4>
                <div style="margin-top:6px;">${optionsHtml}</div>
            </div>
        `;
    }

    window.votePoll = function(pollId, optionIdx) {
        socket.emit('poll:vote', { pollId, optionIdx });
    };

    window.submitNewPoll = function() {
        const q = document.getElementById('poll-q-input').value.trim();
        const optInputs = document.querySelectorAll('.poll-opt-input');
        const options = Array.from(optInputs).map(i => i.value.trim()).filter(v => v !== '');

        if (!q || options.length < 2) {
            alert('Please enter a question and at least 2 options.');
            return;
        }

        socket.emit('poll:create', { room: currentRoom, question: q, options });
        closePollModal();
    };

    window.startDM = function(username) {
        switchRoom(`dm:${username}`, username);
    };

    window.saveProfileChanges = function() {
        const tag = document.getElementById('edit-tag').value.trim();
        const bio = document.getElementById('edit-bio').value.trim();
        const paypalEmail = document.getElementById('edit-paypal').value.trim();

        socket.emit('profile:update', { tag, bio, paypalEmail }, (res) => {
            if (res.success) {
                alert('Profile updated successfully!');
                window.location.reload();
            } else {
                alert(res.message || 'Update failed.');
            }
        });
    };

    window.processPayment = function(type) {
        const amount = type === 'donate' ? document.getElementById('donate-amount').value : 3;
        const note = type === 'donate' ? document.getElementById('donate-msg').value : `${type} edit commission`;
        
        socket.emit('payment:notify', { type, amount, note, username: currentUserData ? currentUserData.username : 'Guest' });
        alert(`Redirecting to PayPal for $${amount}... After payment, you will be directed to @starediter1's chat!`);
        window.open(`https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=starediter1@gmail.com&item_name=Star+Fam+Payment&amount=${amount}&currency_code=USD`, '_blank');
    };
});

// Global Helper UI Functions
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

function closeLeaderboardModal() { document.getElementById('leaderboard-modal').classList.add('hidden'); }
function openLeaderboardModal() { 
    document.getElementById('leaderboard-modal').classList.remove('hidden');
    const socket = io();
    socket.emit('leaderboard:get', (list) => {
        const ul = document.getElementById('leaderboard-list');
        ul.innerHTML = '';
        list.forEach((u, idx) => {
            const li = document.createElement('li');
            li.style.padding = '6px';
            li.innerHTML = `#${idx + 1} **${u.username}** (${u.selectedApp}) - ${u.score} pts [${u.level}]`;
            ul.appendChild(li);
        });
    });
}

function closeTriviaModal() { document.getElementById('trivia-modal').classList.add('hidden'); }
function openTriviaModal() { document.getElementById('trivia-modal').classList.remove('hidden'); }
function closeAssetsModal() { document.getElementById('assets-modal').classList.add('hidden'); }
function openAssetsModal() { 
    document.getElementById('assets-modal').classList.remove('hidden');
    const socket = io();
    socket.emit('asset:fetch', (assets) => {
        const box = document.getElementById('asset-list');
        box.innerHTML = '';
        assets.forEach(a => {
            const div = document.createElement('div');
            div.style.padding = '6px';
            div.innerHTML = `🎵 <strong>${a.name}</strong> (${a.category}) - <a href="${a.url}" target="_blank" style="color:var(--accent-light);">Download / Play</a>`;
            box.appendChild(div);
        });
    });
}
function closePollModal() { document.getElementById('poll-modal').classList.add('hidden'); }
function openPollModal() { document.getElementById('poll-modal').classList.remove('hidden'); }
function closeAnalytics() { document.getElementById('analytics-modal').classList.add('hidden'); }
function openAnalytics() { 
    document.getElementById('analytics-modal').classList.remove('hidden');
    const socket = io();
    socket.emit('analytics:get', (stats) => {
        if (!stats.error) {
            document.getElementById('stat-registered').innerText = stats.totalRegistered;
            document.getElementById('stat-online').innerText = stats.activeOnline;
            document.getElementById('stat-hours').innerText = stats.totalHoursUsed;
            document.getElementById('stat-revenue').innerText = `$${stats.totalRevenue.toFixed(2)}`;
        }
    });
}
function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); }
function openMyProfile() { document.getElementById('profile-modal').classList.remove('hidden'); }
function toggleNotifBox() { document.getElementById('notif-box').classList.toggle('hidden'); }

function logoutUser() {
    localStorage.removeItem('starFamUser');
    sessionStorage.removeItem('starFamUser');
    window.location.reload();
}

function handleKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}