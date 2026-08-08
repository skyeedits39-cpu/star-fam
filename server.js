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
      score: 0,
      level: "Novice",
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
const activeSockets = {};

io.on('connection', (socket) => {
  socket.on('auth:signup', ({ username, pin, tag, bio, pfp }, callback) => {
    const cleanUser = username.trim().toLowerCase();
    const cleanTag = (tag || `@${username}`).trim();

    if (cleanUser === OWNER_USERNAME && pin !== OWNER_PIN) {
      if (typeof callback === 'function') callback({ success: false, message: '⛔ Reserved for Owner! Incorrect PIN (Use 2030).' });
      return;
    }

    if (cleanUser === OWNER_USERNAME) {
      if (!db.registeredUsers[cleanUser]) {
        db.registeredUsers[cleanUser] = {
          username: 'starediter1',
          pin: OWNER_PIN,
          tag: cleanTag || '@starediter1',
          bio: bio || 'VFX Motion Editor & Owner',
          pfp: pfp || null,
          paypalEmail: DEFAULT_PAYPAL_EMAIL,
          role: 'Owner 👑',
          score: 0,
          level: 'Novice',
          selectedApp: 'After Effects',
          createdAt: new Date()
        };
      } else if (pfp) {
        db.registeredUsers[cleanUser].pfp = pfp;
      }
    } else {
      if (db.registeredUsers[cleanUser]) {
        if (typeof callback === 'function') callback({ success: false, message: '❌ Account username already exists! Please Log In.' });
        return;
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
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('auth:login', ({ identifier, pin }, callback) => {
    const cleanId = identifier.trim().toLowerCase();
    
    if (cleanId === OWNER_USERNAME && pin === OWNER_PIN && !db.registeredUsers[OWNER_USERNAME]) {
      db.registeredUsers[OWNER_USERNAME] = {
        username: 'starediter1',
        pin: OWNER_PIN,
        tag: '@starediter1',
        bio: 'VFX Motion Editor & Owner',
        pfp: null,
        paypalEmail: DEFAULT_PAYPAL_EMAIL,
        role: 'Owner 👑',
        score: 0,
        level: 'Novice',
        selectedApp: 'After Effects',
        createdAt: new Date()
      };
      saveDB();
    }

    const userKey = Object.keys(db.registeredUsers).find(k => {
      const u = db.registeredUsers[k];
      return k === cleanId || u.tag.toLowerCase() === cleanId;
    });

    if (!userKey) {
      if (typeof callback === 'function') callback({ success: false, message: '❌ Account not found!' });
      return;
    }
    const userData = db.registeredUsers[userKey];
    
    if (userData.pin !== pin) {
      if (typeof callback === 'function') callback({ success: false, message: '❌ Incorrect PIN!' });
      return;
    }

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
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('profile:update', ({ tag, bio, paypalEmail, pfp }, callback) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanKey = user.username.toLowerCase();
    if (db.registeredUsers[cleanKey]) {
      if (tag) db.registeredUsers[cleanKey].tag = tag;
      if (bio) db.registeredUsers[cleanKey].bio = bio;
      if (paypalEmail && (cleanKey === OWNER_USERNAME)) {
        db.registeredUsers[cleanKey].paypalEmail = paypalEmail;
      }
      if (pfp !== undefined) db.registeredUsers[cleanKey].pfp = pfp;
      saveDB();

      user.tag = db.registeredUsers[cleanKey].tag;
      user.bio = db.registeredUsers[cleanKey].bio;
      user.pfp = db.registeredUsers[cleanKey].pfp;

      io.emit('users:update', Object.values(activeSockets));
      if (typeof callback === 'function') callback({ success: true });
    } else {
      if (typeof callback === 'function') callback({ success: false, message: 'User not found' });
    }
  });

  socket.on('trivia:submit', ({ score, selectedApp }, callback) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanKey = user.username.toLowerCase();
    if (db.registeredUsers[cleanKey]) {
      db.registeredUsers[cleanKey].score = (db.registeredUsers[cleanKey].score || 0) + score;
      db.registeredUsers[cleanKey].selectedApp = selectedApp;
      if (db.registeredUsers[cleanKey].score >= 100) {
        db.registeredUsers[cleanKey].level = 'Pro 🔥';
      } else if (db.registeredUsers[cleanKey].score >= 50) {
        db.registeredUsers[cleanKey].level = 'Expert ⚡';
      }
      saveDB();
      if (typeof callback === 'function') callback({ success: true, totalScore: db.registeredUsers[cleanKey].score, level: db.registeredUsers[cleanKey].level });
    }
  });

  socket.on('trivia:reset', (callback) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanKey = user.username.toLowerCase();
    if (db.registeredUsers[cleanKey]) {
      db.registeredUsers[cleanKey].score = 0;
      db.registeredUsers[cleanKey].level = 'Novice';
      saveDB();
      if (typeof callback === 'function') callback({ success: true, totalScore: 0, level: 'Novice' });
    }
  });

  socket.on('leaderboard:fetch', (callback) => {
    const usersList = Object.values(db.registeredUsers).map(u => ({
      username: u.username,
      score: u.score || 0,
      level: u.level || 'Novice',
      selectedApp: u.selectedApp || 'After Effects'
    }));
    usersList.sort((a, b) => b.score - a.score);
    if (typeof callback === 'function') callback(usersList);
  });

  socket.on('payment:completed', ({ type, amount, itemName }, callback) => {
    const user = activeSockets[socket.id];
    if (!user) return;

    db.analytics.totalRevenue = (db.analytics.totalRevenue || 0) + amount;
    
    const notifText = `💰 @${user.username} purchased "${itemName}" ($${amount} USD)!`;
    db.notifications.unshift({ id: Date.now(), text: notifText, timestamp: new Date().toLocaleTimeString() });

    const threadKey = [user.username.toLowerCase(), OWNER_USERNAME].sort().join('_');
    const autoMsg = {
      id: 'msg-' + Date.now(),
      sender: user.username, tag: user.tag, role: user.role, pfp: user.pfp,
      targetRoom: 'creator', text: `Hi! I just purchased a "${itemName}" for $${amount}. Let's get started!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    if (!db.privateDMs[threadKey]) db.privateDMs[threadKey] = [];
    db.privateDMs[threadKey].push(autoMsg);

    saveDB();

    io.sockets.sockets.forEach(s => {
      const client = activeSockets[s.id];
      if (client && (client.username.toLowerCase() === OWNER_USERNAME || client.username.toLowerCase() === user.username.toLowerCase())) {
        s.emit('chat:message', { ...autoMsg, room: 'creator' });
      }
    });

    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('chat:send', (data) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    const payload = {
      id: 'msg-' + Date.now() + '-' + Math.round(Math.random()*1000),
      sender: user.username, tag: user.tag, role: user.role, pfp: user.pfp,
      targetRoom: data.targetRoom, text: data.text || '', replyTo: data.replyTo || null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (data.targetRoom === 'global') {
      db.chatHistory.global.push(payload);
      io.emit('chat:message', payload);
    } else if (data.targetRoom === 'editing-comp') {
      db.chatHistory['editing-comp'].push(payload);
      io.emit('chat:message', payload);
    } else if (data.targetRoom === 'creator' || data.targetRoom.startsWith('dm-')) {
      const recipient = data.targetRoom === 'creator' ? OWNER_USERNAME : data.targetRoom.replace('dm-', '');
      const threadKey = [user.username.toLowerCase(), recipient.toLowerCase()].sort().join('_');
      if (!db.privateDMs[threadKey]) db.privateDMs[threadKey] = [];
      db.privateDMs[threadKey].push(payload);
      
      io.sockets.sockets.forEach(s => {
        const client = activeSockets[s.id];
        if (client && (client.username.toLowerCase() === user.username.toLowerCase() || client.username.toLowerCase() === recipient.toLowerCase())) {
          s.emit('chat:message', { ...payload, room: data.targetRoom });
        }
      });
    }
    saveDB();
  });

  socket.on('chat:delete', ({ msgId, room }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    let list = room === 'global' ? db.chatHistory.global : room === 'editing-comp' ? db.chatHistory['editing-comp'] : (db.chatHistory.creator[user.username] || []);
    const idx = list.findIndex(m => m.id === msgId);
    if (idx !== -1 && (list[idx].sender === user.username || user.isOwner || user.isMod)) {
      list.splice(idx, 1);
      saveDB();
      io.emit('chat:refresh', { room });
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

  socket.on('asset:upload', ({ name, category, url }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    if (!Array.isArray(db.assets)) db.assets = [];
    const newAsset = { id: Date.now(), name, category, url, uploader: user.username };
    db.assets.push(newAsset);
    saveDB();
    io.emit('asset:updated');
  });

  socket.on('asset:delete', ({ assetId }) => {
    const user = activeSockets[socket.id];
    if (!user) return;
    if (!Array.isArray(db.assets)) db.assets = [...defaultDB.assets];
    const idx = db.assets.findIndex(a => a.id === assetId || a.id.toString() === assetId.toString());
    if (idx !== -1) {
      const asset = db.assets[idx];
      if (user.isOwner || asset.uploader === user.username) {
        db.assets.splice(idx, 1);
        saveDB();
        io.emit('asset:updated');
      }
    }
  });

  socket.on('chat:fetch_history', ({ room }, callback) => {
    const user = activeSockets[socket.id];
    if (!user || typeof callback !== 'function') return;
    if (room === 'global') callback(db.chatHistory.global || []);
    else if (room === 'editing-comp') callback(db.chatHistory['editing-comp'] || []);
    else if (room === 'creator') {
      if (user.isOwner) {
        const allMsgs = [];
        Object.keys(db.privateDMs).forEach(key => {
          if (key.includes(OWNER_USERNAME)) {
            allMsgs.push(...db.privateDMs[key]);
          }
        });
        callback(allMsgs);
      } else {
        const threadKey = [user.username.toLowerCase(), OWNER_USERNAME].sort().join('_');
        callback(db.privateDMs[threadKey] || []);
      }
    } else if (room.startsWith('dm-')) {
      const recipient = room.replace('dm-', '');
      const threadKey = [user.username.toLowerCase(), recipient.toLowerCase()].sort().join('_');
      callback(db.privateDMs[threadKey] || []);
    }
  });

  socket.on('dms:fetch_list', (callback) => {
    const user = activeSockets[socket.id];
    if (!user || typeof callback !== 'function') return;
    const dms = [];
    Object.keys(db.privateDMs).forEach(key => {
      if (key.includes(user.username.toLowerCase())) {
        const parts = key.split('_');
        const other = parts[0] === user.username.toLowerCase() ? parts[1] : parts[0];
        if (other !== OWNER_USERNAME || user.isOwner) {
          dms.push({ username: other });
        }
      }
    });
    callback(dms);
  });

  socket.on('analytics:fetch', (callback) => {
    if (typeof callback === 'function') {
      callback({
        registeredCount: Object.keys(db.registeredUsers).length,
        activeOnline: Object.keys(activeSockets).length,
        hoursUsed: (db.analytics.totalSecondsUsed / 3600).toFixed(2),
        revenue: '$' + db.analytics.totalRevenue.toFixed(2)
      });
    }
  });

  socket.on('notifications:fetch', (callback) => {
    if (typeof callback === 'function') callback(db.notifications || []);
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    io.emit('users:update', Object.values(activeSockets));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✨ Star Fam active on http://localhost:${PORT}`));