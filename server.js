const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
  maxHttpBufferSize: 100 * 1024 * 1024 * 1024 
});

const uploadDir = path.join(__dirname, 'public/uploads');
const dataFilePath = path.join(__dirname, 'db.json');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const defaultDB = {
  registeredUsers: {
    "starediter1": {
      username: "starediter1",
      pin: "2030",
      tag: "@starediter1",
      bio: "VFX Motion Editor & Owner",
      pfp: null,
      paypalEmail: "starediter1@gmail.com",
      role: "Owner 👑",
      score: 100,
      level: "Pro 🔥",
      selectedApp: "After Effects",
      createdAt: new Date()
    }
  },
  chatHistory: { global: [], creator: {}, 'editing-comp': [] },
  privateDMs: {},
  polls: [],
  assets: [
    { id: 1, name: "Cinematic Whoosh", category: "Audio FX", url: "https://www.soundjay.com/free-music/sounds/barn-beat-01.mp3", uploader: "starediter1" },
    { id: 2, name: "Sub Bass Drop", category: "Audio FX", url: "https://www.soundjay.com/button/sounds/button-1.mp3", uploader: "starediter1" },
    { id: 3, name: "Film Grain Texture", category: "Overlays", url: "https://www.w3schools.com/html/mov_bbb.mp4", uploader: "starediter1" }
  ],
  analytics: { totalSecondsUsed: 0, totalRevenue: 0 },
  notifications: []
};

let db = { ...defaultDB };

try {
  if (fs.existsSync(dataFilePath)) {
    const raw = fs.readFileSync(dataFilePath);
    const parsed = JSON.parse(raw);
    db = {
      registeredUsers: parsed.registeredUsers || defaultDB.registeredUsers,
      chatHistory: parsed.chatHistory || { global: [], creator: {}, 'editing-comp': [] },
      privateDMs: parsed.privateDMs || {},
      polls: parsed.polls || [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : defaultDB.assets,
      analytics: parsed.analytics || { totalSecondsUsed: 0, totalRevenue: 0 },
      notifications: parsed.notifications || []
    };
    // Ensure owner always exists
    if (!db.registeredUsers["starediter1"]) {
      db.registeredUsers["starediter1"] = defaultDB.registeredUsers["starediter1"];
    }
  } else {
    fs.writeFileSync(dataFilePath, JSON.stringify(defaultDB, null, 2));
  }
} catch (err) {
  db = { ...defaultDB };
  fs.writeFileSync(dataFilePath, JSON.stringify(defaultDB, null, 2));
}

function saveDB() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Failed to save DB:", e);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 * 1024 } });

app.use(express.json({ limit: '100gb' }));
app.use(express.urlencoded({ limit: '100gb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let sizeText = (req.file.size / (1024 * 1024)).toFixed(2) + ' MB';
  if (req.file.size > 1024 * 1024 * 1024) {
    sizeText = (req.file.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  res.json({ url: `/uploads/${req.file.filename}`, originalName: req.file.originalname, size: sizeText });
});

const DEFAULT_PAYPAL_EMAIL = 'starediter1@gmail.com';
const OWNER_USERNAME = 'starediter1';
const OWNER_PIN = '2030';
const RECOVERY_CODE = '1111';
const activeSockets = {};

setInterval(() => {
  const activeCount = Object.keys(activeSockets).length;
  if (activeCount > 0) {
    db.analytics.totalSecondsUsed = (db.analytics.totalSecondsUsed || 0) + activeCount;
    saveDB();
  }
}, 5000);

io.on('connection', (socket) => {
  socket.on('auth:signup', ({ username, pin, tag, bio, pfp }, callback) => {
    const cleanUser = username.trim().toLowerCase();
    const cleanTag = (tag || `@${username}`).trim();

    if (cleanUser === OWNER_USERNAME && pin !== OWNER_PIN) {
      return callback({ success: false, message: '⛔ Reserved for Owner! Incorrect PIN (Use 2030).' });
    }

    if (cleanUser === OWNER_USERNAME) {
      db.registeredUsers[cleanUser] = {
        username: 'starediter1',
        pin: OWNER_PIN,
        tag: cleanTag || '@starediter1',
        bio: bio || 'VFX Motion Editor & Owner',
        pfp: pfp || null,
        paypalEmail: DEFAULT_PAYPAL_EMAIL,
        role: 'Owner 👑',
        score: 100,
        level: 'Pro 🔥',
        selectedApp: 'After Effects',
        createdAt: new Date()
      };
    } else {
      if (db.registeredUsers[cleanUser]) {
        return callback({ success: false, message: '❌ Account username already exists! Please Log In.' });
      }
      db.registeredUsers[cleanUser] = {
        username: username.trim(),
        pin,
        tag: cleanTag,
        bio: bio || 'VFX Motion Editor',
        pfp: pfp || null,
        paypalEmail: '',
        role: 'Editor',
        score: 0,
        level: 'Novice',
        selectedApp: 'After Effects',
        createdAt: new Date()
      };
    }

    saveDB();
    const userData = db.registeredUsers[cleanUser];
    activeSockets[socket.id] = {
      socketId: socket.id, username: userData.username, tag: userData.tag,
      bio: userData.bio, pfp: userData.pfp, role: userData.role,
      isOwner: userData.username.toLowerCase() === OWNER_USERNAME,
      isMod: userData.role.includes('Mod') || userData.username.toLowerCase() === OWNER_USERNAME
    };

    socket.emit('auth:success', {
      ...userData,
      paypalEmail: userData.paypalEmail || DEFAULT_PAYPAL_EMAIL,
      notifications: userData.username.toLowerCase() === OWNER_USERNAME ? db.notifications : []
    });
    io.emit('users:update', Object.values(activeSockets));
    callback({ success: true });
  });

  socket.on('auth:login', ({ identifier, pin }, callback) => {
    const cleanId = identifier.trim().toLowerCase();
    
    if (cleanId === OWNER_USERNAME && pin === OWNER_PIN) {
      if (!db.registeredUsers[OWNER_USERNAME]) {
        db.registeredUsers[OWNER_USERNAME] = defaultDB.registeredUsers["starediter1"];
        saveDB();
      }
    }

    const userKey = Object.keys(db.registeredUsers).find(k => {
      const u = db.registeredUsers[k];
      return k === cleanId || u.tag.toLowerCase() === cleanId;
    });

    if (!userKey) return callback({ success: false, message: '❌ Account not found!' });
    const userData = db.registeredUsers[userKey];
    
    if (userData.pin !== pin) return callback({ success: false, message: '❌ Incorrect PIN!' });

    if (userKey === OWNER_USERNAME) {
      userData.role = 'Owner 👑';
      userData.pin = OWNER_PIN;
    }

    activeSockets[socket.id] = {
      socketId: socket.id, username: userData.username, tag: userData.tag,
      bio: userData.bio, pfp: userData.pfp, role: userData.role,
      isOwner: userData.username.toLowerCase() === OWNER_USERNAME,
      isMod: userData.role.includes('Mod') || userData.username.toLowerCase() === OWNER_USERNAME
    };

    socket.emit('auth:success', {
      ...userData,
      paypalEmail: userData.paypalEmail || DEFAULT_PAYPAL_EMAIL,
      notifications: userData.username.toLowerCase() === OWNER_USERNAME ? db.notifications : []
    });
    io.emit('users:update', Object.values(activeSockets));
    callback({ success: true });
  });

  socket.on('auth:recover', ({ recoveryCode, targetTag, newUsername, newPin }, callback) => {
    if (recoveryCode !== RECOVERY_CODE) return callback({ success: false, message: '⛔ Invalid Passcode! Type 1111.' });
    const cleanTag = targetTag.trim().toLowerCase();
    const userKey = Object.keys(db.registeredUsers).find(k => {
      const u = db.registeredUsers[k];
      return k === cleanTag || u.tag.toLowerCase() === cleanTag;
    });
    if (!userKey) return callback({ success: false, message: '❌ Account Tag not found.' });

    const userData = db.registeredUsers[userKey];
    if (newPin && newPin.length === 4) userData.pin = newPin;
    if (newUsername && newUsername.trim() !== '') {
      const cleanNewUser = newUsername.trim().toLowerCase();
      delete db.registeredUsers[userKey];
      userData.username = newUsername.trim();
      db.registeredUsers[cleanNewUser] = userData;
    }
    saveDB();
    callback({ success: true, message: '✨ Account reset successfully!' });
  });

  socket.on('profile:update', ({ tag, bio, pfp, paypalEmail }, callback) => {
    const session = activeSockets[socket.id];
    if (!session) return callback({ success: false, message: 'Not logged in' });
    const clean = session.username.toLowerCase();
    if (db.registeredUsers[clean]) {
      db.registeredUsers[clean].tag = tag || db.registeredUsers[clean].tag;
      db.registeredUsers[clean].bio = bio || db.registeredUsers[clean].bio;
      if (pfp) db.registeredUsers[clean].pfp = pfp;
      if (paypalEmail !== undefined) db.registeredUsers[clean].paypalEmail = paypalEmail;
      session.tag = db.registeredUsers[clean].tag;
      session.bio = db.registeredUsers[clean].bio;
      session.pfp = db.registeredUsers[clean].pfp;
      saveDB();
      io.emit('users:update', Object.values(activeSockets));
      callback({ success: true, user: db.registeredUsers[clean] });
    }
  });

  socket.on('chat:send', (data) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    const payload = {
      id: 'msg-' + Date.now() + '-' + Math.round(Math.random()*1000),
      sender: user.username, tag: user.tag, role: user.role, pfp: user.pfp,
      targetRoom: data.targetRoom, text: data.text || '',
      attachment: data.attachment || null, replyTo: data.replyTo || null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (data.targetRoom === 'global') {
      db.chatHistory.global.push(payload);
      io.emit('chat:message', payload);
    } else if (data.targetRoom === 'editing-comp') {
      db.chatHistory['editing-comp'].push(payload);
      io.emit('chat:message', payload);
    } else if (data.targetRoom === 'creator') {
      if (!db.chatHistory.creator[user.username]) db.chatHistory.creator[user.username] = [];
      db.chatHistory.creator[user.username].push(payload);
      io.emit('chat:creator_sync', payload);
    } else if (data.targetRoom.startsWith('dm:')) {
      const targetUser = data.targetRoom.split('dm:')[1];
      const dmKey = [user.username, targetUser].sort().join(':');
      if (!db.privateDMs[dmKey]) db.privateDMs[dmKey] = [];
      db.privateDMs[dmKey].push(payload);
      io.emit('chat:dm_sync', { dmKey, payload });
    }
    saveDB();
  });

  socket.on('chat:delete', ({ msgId, room, targetUser }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    let list = [];
    if (room === 'global') list = db.chatHistory.global;
    else if (room === 'editing-comp') list = db.chatHistory['editing-comp'];
    else if (room === 'creator') list = db.chatHistory.creator[targetUser || user.username] || [];
    else if (room === 'dm') {
      const dmKey = [user.username, targetUser].sort().join(':');
      list = db.privateDMs[dmKey] || [];
    }
    const idx = list.findIndex(m => m.id === msgId);
    if (idx !== -1 && (list[idx].sender === user.username || user.isOwner || user.isMod)) {
      list.splice(idx, 1);
      saveDB();
      io.emit('chat:refresh', { room, targetUser });
    }
  });

  socket.on('poll:create', ({ room, question, options }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    if (!Array.isArray(db.polls)) db.polls = [];
    const poll = {
      id: 'poll-' + Date.now(), room, question,
      creator: user.username, options: options.map(opt => ({ text: opt, votes: [] }))
    };
    db.polls.push(poll);
    saveDB();
    io.emit('poll:updated', { room });
  });

  socket.on('poll:vote', ({ pollId, optionIdx }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    if (!Array.isArray(db.polls)) db.polls = [];
    const poll = db.polls.find(p => p.id === pollId);
    if (poll) {
      poll.options.forEach(opt => { opt.votes = opt.votes.filter(u => u !== user.username); });
      poll.options[optionIdx].votes.push(user.username);
      saveDB();
      io.emit('poll:updated', { room: poll.room });
    }
  });

  socket.on('poll:delete', ({ pollId }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    if (!Array.isArray(db.polls)) db.polls = [];
    const idx = db.polls.findIndex(p => p.id === pollId);
    if (idx !== -1) {
      const p = db.polls[idx];
      if (user.isOwner || p.creator === user.username) {
        const room = p.room;
        db.polls.splice(idx, 1);
        saveDB();
        io.emit('poll:updated', { room });
      }
    }
  });

  socket.on('poll:fetch', (room, callback) => {
    if (!Array.isArray(db.polls)) db.polls = [];
    const active = db.polls.filter(p => p.room === room);
    if (typeof callback === 'function') callback(active);
  });

  socket.on('asset:fetch', (callback) => { 
    if (!Array.isArray(db.assets)) db.assets = [...defaultDB.assets];
    if (typeof callback === 'function') callback(db.assets); 
  });

  socket.on('asset:add', ({ name, category, url }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    if (!Array.isArray(db.assets)) db.assets = [...defaultDB.assets];
    const newAsset = { id: Date.now(), name, category, url, uploader: user.username };
    db.assets.push(newAsset);
    saveDB();
    io.emit('asset:updated', db.assets);
  });

  socket.on('asset:delete', ({ assetId }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    if (!Array.isArray(db.assets)) db.assets = [...defaultDB.assets];
    const idx = db.assets.findIndex(a => a.id === assetId);
    if (idx !== -1) {
      const asset = db.assets[idx];
      if (user.isOwner || asset.uploader === user.username) {
        db.assets.splice(idx, 1);
        saveDB();
        io.emit('asset:updated', db.assets);
      }
    }
  });

  socket.on('trivia:submit_score', ({ appName, pointsAdded }, callback) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    const clean = user.username.toLowerCase();
    const account = db.registeredUsers[clean];
    if (account) {
      account.score = (account.score || 0) + pointsAdded;
      account.selectedApp = appName;
      if (account.score >= 100) account.level = 'Pro 🔥';
      else if (account.score >= 50) account.level = 'Intermediate ⭐';
      else if (account.score >= 20) account.level = 'Beginner 🌟';
      else account.level = 'Novice';
      saveDB();
      if (typeof callback === 'function') callback({ success: true, score: account.score, level: account.level });
    }
  });

  socket.on('leaderboard:get', (callback) => {
    const sorted = Object.values(db.registeredUsers)
      .map(u => ({ username: u.username, score: u.score || 0, level: u.level || 'Novice', selectedApp: u.selectedApp || 'AE' }))
      .sort((a, b) => b.score - a.score);
    if (typeof callback === 'function') callback(sorted);
  });

  socket.on('payment:notify', ({ type, amount, note, username }) => {
    if (!Array.isArray(db.notifications)) db.notifications = [];
    const notif = { id: Date.now(), type, amount, note: note || '', username, timestamp: new Date().toLocaleTimeString() };
    db.notifications.unshift(notif);
    db.analytics.totalRevenue = (db.analytics.totalRevenue || 0) + parseFloat(amount);
    saveDB();
    io.emit('owner:notification', notif);
  });

  socket.on('chat:fetch_history', ({ room, targetUser }, callback) => {
    const user = activeSockets[socket.id];
    if (!user || typeof callback !== 'function') return;
    if (room === 'global') callback(db.chatHistory.global || []);
    else if (room === 'editing-comp') callback(db.chatHistory['editing-comp'] || []);
    else if (room === 'creator') callback((db.chatHistory.creator && db.chatHistory.creator[targetUser || user.username]) || []);
    else if (room === 'dm') {
      const dmKey = [user.username, targetUser].sort().join(':');
      callback(db.privateDMs[dmKey] || []);
    }
  });

  socket.on('analytics:get', (callback) => {
    const user = activeSockets[socket.id];
    if (!user || !user.isOwner) return callback({ error: 'Unauthorized access.' });
    const totalHours = ((db.analytics.totalSecondsUsed || 0) / 3600).toFixed(2);
    if (typeof callback === 'function') {
      callback({
        totalRegistered: Object.keys(db.registeredUsers).length,
        activeOnline: Object.keys(activeSockets).length,
        totalHoursUsed: totalHours,
        totalRevenue: db.analytics.totalRevenue || 0
      });
    }
  });

  socket.on('user:get_profile', (targetUsername, callback) => {
    if (typeof callback !== 'function') return;
    const clean = targetUsername.toLowerCase();
    const user = db.registeredUsers[clean];
    if (!user) return callback({ error: 'User not found' });
    callback({
      username: user.username, tag: user.tag, bio: user.bio, pfp: user.pfp,
      role: user.role, score: user.score || 0, level: user.level || 'Novice',
      paypalEmail: user.paypalEmail || DEFAULT_PAYPAL_EMAIL,
      isOwner: user.username.toLowerCase() === OWNER_USERNAME
    });
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    io.emit('users:update', Object.values(activeSockets));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✨ Star Fam active on http://localhost:${PORT}`));