const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
  maxHttpBufferSize: 500 * 1024 * 1024 * 1024 
});

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const mongoUrl = 'mongodb+srv://skyeadmin:StarEdit2026@cluster0.ldbytls.mongodb.net/?appName=Cluster0';
const dbName = 'star_fam_db';

let db = null;

async function startServer() {
  try {
    const client = new MongoClient(mongoUrl, {
      tls: true,
      tlsAllowInvalidCertificates: true
    });
    await client.connect();
    db = client.db(dbName);
    console.log('✨ Connected successfully to MongoDB Atlas Cloud Database');

    const usersCol = db.collection('users');
    const ownerExists = await usersCol.findOne({ username: 'starediter1' });
    if (!ownerExists) {
      await usersCol.insertOne({
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
      });
    }
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
  }
}

startServer();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 * 1024 } });

app.use(express.json({ limit: '500gb' }));
app.use(express.urlencoded({ limit: '500gb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let sizeText = (req.file.size / (1024 * 1024)).toFixed(2) + ' MB';
  if (req.file.size > 1024 * 1024 * 1024) {
    sizeText = (req.file.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  res.json({ url: `/uploads/${req.file.filename}`, originalName: req.file.originalname, size: sizeText });
});

app.post('/paypal/ipn', async (req, res) => {
  res.status(200).send('OK');
  if (!db) return;
  const body = req.body;
  body.cmd = '_notify-validate';

  const queryString = Object.keys(body)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`)
    .join('&');

  const options = {
    hostname: 'ipnpb.paypal.com',
    method: 'POST',
    path: '/cgi-bin/webscr',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(queryString)
    }
  };

  const reqVerify = https.request(options, (resVerify) => {
    let data = '';
    resVerify.on('data', chunk => { data += chunk; });
    resVerify.on('end', async () => {
      if (data.trim() === 'VERIFIED') {
        const paymentStatus = body.payment_status;
        const itemName = body.item_name || 'Personal Edit';
        const amount = parseFloat(body.mc_gross || '3.00');
        const customPayload = body.custom ? JSON.parse(body.custom) : null;
        const username = customPayload ? customPayload.username : null;

        if (paymentStatus === 'Completed' && username) {
          const analyticsCol = db.collection('analytics');
          const notifsCol = db.collection('notifications');
          const dmsCol = db.collection('privateDMs');

          await analyticsCol.updateOne({ id: 'stats' }, { $inc: { totalRevenue: amount } }, { upsert: true });
          const notifText = `💰 @${username} automatically purchased "${itemName}" ($${amount} USD)!`;
          await notifCol.insertOne({ id: Date.now(), text: notifText, timestamp: new Date().toLocaleTimeString() });

          const cleanUserLower = username.toLowerCase();
          const threadKey = [cleanUserLower, OWNER_USERNAME].sort().join('_');
          const autoMsg = {
            id: 'msg-' + Date.now(),
            sender: username, tag: '@' + username, role: 'Editor', pfp: null,
            targetRoom: `dm-${cleanUserLower}`, text: `Hi! I successfully completed payment for "${itemName}" ($${amount}). Ready to get started!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          await dmsCol.updateOne({ threadKey }, { $push: { messages: autoMsg } }, { upsert: true });

          io.sockets.sockets.forEach(s => {
            const client = activeSockets[s.id];
            if (client && (client.username.toLowerCase() === OWNER_USERNAME || client.username.toLowerCase() === cleanUserLower)) {
              s.emit('chat:message', { ...autoMsg, room: `dm-${cleanUserLower}`, targetRoom: `dm-${cleanUserLower}` });
            }
          });
        }
      }
    });
  });

  reqVerify.on('error', e => console.error('IPN Verification Error:', e));
  reqVerify.write(queryString);
  reqVerify.end();
});

const DEFAULT_PAYPAL_EMAIL = 'starediter1@gmail.com';
const OWNER_USERNAME = 'starediter1';
const OWNER_PIN = '2030';
const activeSockets = {};

io.on('connection', (socket) => {
  socket.on('auth:signup', async ({ username, pin, tag, bio, pfp }, callback) => {
    if (!db) return;
    const cleanUser = username.trim().toLowerCase();
    const cleanTag = (tag || `@${username}`).trim();
    const usersCol = db.collection('users');

    if (cleanUser === OWNER_USERNAME && pin !== OWNER_PIN) {
      if (typeof callback === 'function') callback({ success: false, message: '⛔ Reserved for Owner! Incorrect PIN (Use 2030).' });
      return;
    }

    const existing = await usersCol.findOne({ username: { $regex: new RegExp(`^${cleanUser}$`, 'i') } });

    if (cleanUser === OWNER_USERNAME) {
      if (!existing) {
        await usersCol.insertOne({
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
        });
      } else if (pfp) {
        await usersCol.updateOne({ username: 'starediter1' }, { $set: { pfp } });
      }
    } else {
      if (existing) {
        if (typeof callback === 'function') callback({ success: false, message: '❌ Account username already exists! Please Log In.' });
        return;
      }
      await usersCol.insertOne({
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
      });
    }

    const userData = await usersCol.findOne({ username: { $regex: new RegExp(`^${cleanUser}$`, 'i') } });
    activeSockets[socket.id] = {
      socketId: socket.id, username: userData.username, tag: userData.tag,
      bio: userData.bio, pfp: userData.pfp, role: userData.role,
      isOwner: userData.username.toLowerCase() === OWNER_USERNAME,
      isMod: userData.role.includes('Mod') || userData.username.toLowerCase() === OWNER_USERNAME
    };

    const notifsCol = db.collection('notifications');
    const allNotifs = userData.username.toLowerCase() === OWNER_USERNAME ? await notifsCol.find({}).toArray() : [];

    socket.emit('auth:success', {
      ...userData,
      paypalEmail: userData.paypalEmail || DEFAULT_PAYPAL_EMAIL,
      notifications: allNotifs
    });
    io.emit('users:update', Object.values(activeSockets));
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('auth:login', async ({ identifier, pin }, callback) => {
    if (!db) return;
    const cleanId = identifier.trim().toLowerCase();
    const usersCol = db.collection('users');

    let userData = await usersCol.findOne({ 
      $or: [
        { username: { $regex: new RegExp(`^${cleanId}$`, 'i') } },
        { tag: { $regex: new RegExp(`^${cleanId}$`, 'i') } }
      ]
    });

    if (!userData && cleanId === OWNER_USERNAME && pin === OWNER_PIN) {
      userData = {
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
      await usersCol.insertOne(userData);
    }

    if (!userData) {
      if (typeof callback === 'function') callback({ success: false, message: '❌ Account not found!' });
      return;
    }
    
    if (userData.pin !== pin) {
      if (typeof callback === 'function') callback({ success: false, message: '❌ Incorrect PIN!' });
      return;
    }

    if (userData.username.toLowerCase() === OWNER_USERNAME) {
      userData.role = 'Owner 👑';
      userData.pin = OWNER_PIN;
    }

    activeSockets[socket.id] = {
      socketId: socket.id, username: userData.username, tag: userData.tag,
      bio: userData.bio, pfp: userData.pfp, role: userData.role,
      isOwner: userData.username.toLowerCase() === OWNER_USERNAME,
      isMod: userData.role.includes('Mod') || userData.username.toLowerCase() === OWNER_USERNAME
    };

    const notifsCol = db.collection('notifications');
    const allNotifs = userData.username.toLowerCase() === OWNER_USERNAME ? await notifsCol.find({}).toArray() : [];

    socket.emit('auth:success', {
      ...userData,
      paypalEmail: userData.paypalEmail || DEFAULT_PAYPAL_EMAIL,
      notifications: allNotifs
    });
    io.emit('users:update', Object.values(activeSockets));
    if (typeof callback === 'function') callback({ success: true });
  });

  // Instant PIN Recovery via code 1111
  socket.on('auth:recover', async ({ identifier, recoveryCode, newPin }, callback) => {
    if (!db) return;
    const cleanId = identifier.trim().toLowerCase();
    const usersCol = db.collection('users');

    if (recoveryCode !== '1111') {
      if (typeof callback === 'function') callback({ success: false, message: '❌ Invalid recovery code! Type 1111 to reset.' });
      return;
    }

    const userData = await usersCol.findOne({ 
      $or: [
        { username: { $regex: new RegExp(`^${cleanId}$`, 'i') } },
        { tag: { $regex: new RegExp(`^${cleanId}$`, 'i') } }
      ]
    });

    if (!userData) {
      if (typeof callback === 'function') callback({ success: false, message: '❌ Account not found!' });
      return;
    }

    await usersCol.updateOne({ _id: userData._id }, { $set: { pin: newPin } });
    if (typeof callback === 'function') callback({ success: true, message: '✨ PIN successfully reset!' });
  });

  socket.on('profile:update', async ({ tag, bio, paypalEmail, pfp }, callback) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanKey = user.username.toLowerCase();
    const usersCol = db.collection('users');

    const updateFields = {};
    if (tag) updateFields.tag = tag;
    if (bio) updateFields.bio = bio;
    if (paypalEmail && cleanKey === OWNER_USERNAME) updateFields.paypalEmail = paypalEmail;
    if (pfp !== undefined) updateFields.pfp = pfp;

    await usersCol.updateOne({ username: { $regex: new RegExp(`^${cleanKey}$`, 'i') } }, { $set: updateFields });
    const updated = await usersCol.findOne({ username: { $regex: new RegExp(`^${cleanKey}$`, 'i') } });

    user.tag = updated.tag;
    user.bio = updated.bio;
    user.pfp = updated.pfp;

    io.emit('users:update', Object.values(activeSockets));
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('owner:paypal:fetch', async (callback) => {
    if (!db) return;
    const usersCol = db.collection('users');
    const ownerData = await usersCol.findOne({ username: { $regex: new RegExp(`^${OWNER_USERNAME}$`, 'i') } });
    const email = ownerData ? (ownerData.paypalEmail || DEFAULT_PAYPAL_EMAIL) : DEFAULT_PAYPAL_EMAIL;
    if (typeof callback === 'function') callback({ paypalEmail: email });
  });

  socket.on('trivia:submit', async ({ score, selectedApp }, callback) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanKey = user.username.toLowerCase();
    const usersCol = db.collection('users');

    const uData = await usersCol.findOne({ username: { $regex: new RegExp(`^${cleanKey}$`, 'i') } });
    if (uData) {
      const newScore = (uData.score || 0) + score;
      let newLevel = uData.level || 'Novice';
      if (newScore >= 100) newLevel = 'Pro 🔥';
      else if (newScore >= 50) newLevel = 'Expert ⚡';

      await usersCol.updateOne({ username: { $regex: new RegExp(`^${cleanKey}$`, 'i') } }, { $set: { score: newScore, level: newLevel, selectedApp } });
      if (typeof callback === 'function') callback({ success: true, totalScore: newScore, level: newLevel });
    }
  });

  socket.on('leaderboard:fetch', async (callback) => {
    if (!db) return;
    const usersCol = db.collection('users');
    const allUsers = await usersCol.find({}).toArray();
    const usersList = allUsers.map(u => ({
      username: u.username,
      score: u.score || 0,
      level: u.level || 'Novice',
      selectedApp: u.selectedApp || 'After Effects'
    }));
    usersList.sort((a, b) => b.score - a.score);
    if (typeof callback === 'function') callback(usersList);
  });

  socket.on('chat:send', async (data) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanSenderLower = user.username.toLowerCase();
    const targetRoom = data.targetRoom.toLowerCase();

    const payload = {
      id: 'msg-' + Date.now() + '-' + Math.round(Math.random()*1000),
      sender: user.username, tag: user.tag, role: user.role, pfp: user.pfp,
      targetRoom: targetRoom, text: data.text || '', mediaUrl: data.mediaUrl || null, mediaType: data.mediaType || null, replyTo: data.replyTo || null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const chatCol = db.collection('chatHistory');

    if (targetRoom === 'global' || targetRoom === 'editing-comp') {
      await chatCol.updateOne({ room: targetRoom }, { $push: { messages: payload } }, { upsert: true });
      io.emit('chat:message', { ...payload, room: targetRoom });
    } else if (targetRoom.startsWith('dm-')) {
      const recipientLower = targetRoom.replace('dm-', '');
      const threadKey = [cleanSenderLower, recipientLower].sort().join('_');
      const dmsCol = db.collection('privateDMs');
      await dmsCol.updateOne({ threadKey }, { $push: { messages: payload } }, { upsert: true });
      
      io.sockets.sockets.forEach(s => {
        const client = activeSockets[s.id];
        if (client && (client.username.toLowerCase() === cleanSenderLower || client.username.toLowerCase() === recipientLower)) {
          s.emit('chat:message', { ...payload, room: targetRoom, targetRoom: targetRoom });
        }
      });
    }
  });

  socket.on('chat:delete', async ({ msgId, room }) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const isOwnerUser = user.isOwner || user.username.toLowerCase() === OWNER_USERNAME;
    const cleanRoom = room.toLowerCase();

    const chatCol = db.collection('chatHistory');
    const dmsCol = db.collection('privateDMs');

    if (cleanRoom === 'global' || cleanRoom === 'editing-comp') {
      const chatDoc = await chatCol.findOne({ room: cleanRoom });
      if (chatDoc && chatDoc.messages) {
        const msg = chatDoc.messages.find(m => m.id === msgId);
        if (msg && (msg.sender === user.username || isOwnerUser)) {
          await chatCol.updateOne({ room: cleanRoom }, { $pull: { messages: { id: msgId } } });
          io.emit('chat:refresh', { room: cleanRoom });
        }
      }
    } else {
      const dmsDocs = await dmsCol.find({}).toArray();
      for (let doc of dmsDocs) {
        if (doc.messages) {
          const msg = doc.messages.find(m => m.id === msgId);
          if (msg && (msg.sender === user.username || isOwnerUser)) {
            await dmsCol.updateOne({ threadKey: doc.threadKey }, { $pull: { messages: { id: msgId } } });
            io.emit('chat:refresh', { room: cleanRoom });
          }
        }
      }
    }
  });

  socket.on('poll:create', async ({ room, question, options }) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const cleanRoom = room.toLowerCase();
    const pollsCol = db.collection('polls');

    const poll = {
      id: 'poll-' + Date.now(), room: cleanRoom, question,
      creator: user.username, options: options.map(opt => ({ text: opt, votes: [] }))
    };
    await pollsCol.insertOne(poll);
    io.emit('poll:updated', { room: cleanRoom });
  });

  socket.on('poll:vote', async ({ pollId, optionIdx }) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const pollsCol = db.collection('polls');

    const poll = await pollsCol.findOne({ id: pollId });
    if (poll) {
      poll.options.forEach(opt => { opt.votes = opt.votes.filter(u => u !== user.username); });
      poll.options[optionIdx].votes.push(user.username);
      await pollsCol.updateOne({ id: pollId }, { $set: { options: poll.options } });
      io.emit('poll:updated', { room: poll.room });
    }
  });

  socket.on('poll:delete', async ({ pollId }) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const pollsCol = db.collection('polls');

    const poll = await pollsCol.findOne({ id: pollId });
    if (poll) {
      if (user.isOwner || poll.creator === user.username) {
        const room = poll.room;
        await pollsCol.deleteOne({ id: pollId });
        io.emit('poll:updated', { room });
      }
    }
  });

  socket.on('poll:fetch', async (room, callback) => {
    if (!db) return;
    const cleanRoom = room.toLowerCase();
    const pollsCol = db.collection('polls');
    const active = await pollsCol.find({ room: cleanRoom }).toArray();
    if (typeof callback === 'function') callback(active);
  });

  socket.on('chat:fetch_history', async ({ room }, callback) => {
    if (!db || typeof callback !== 'function') return;
    const cleanRoom = room.toLowerCase();

    const chatCol = db.collection('chatHistory');
    const dmsCol = db.collection('privateDMs');

    if (cleanRoom === 'global' || cleanRoom === 'editing-comp') {
      const doc = await chatCol.findOne({ room: cleanRoom });
      callback(doc ? doc.messages || [] : []);
    } else if (cleanRoom.startsWith('dm-')) {
      const recipientLower = cleanRoom.replace('dm-', '');
      const threadKey = [socket.handshake ? socket.handshake.auth?.username : '', recipientLower].sort().join('_');
      
      const allDms = await dmsCol.find({}).toArray();
      const match = allDms.find(d => d.threadKey.includes(recipientLower) && d.threadKey.includes(activeSockets[socket.id]?.username.toLowerCase()));
      callback(match ? match.messages || [] : []);
    }
  });

  socket.on('dms:fetch_list', async (callback) => {
    if (!db || typeof callback !== 'function') return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const userLower = user.username.toLowerCase();
    const uniqueMap = new Map();

    const dmsCol = db.collection('privateDMs');
    const usersCol = db.collection('users');

    const allDms = await dmsCol.find({}).toArray();
    allDms.forEach(doc => {
      if (doc.threadKey.includes(userLower)) {
        const parts = doc.threadKey.split('_');
        const otherLower = parts[0] === userLower ? parts[1] : parts[0];
        if (otherLower && otherLower !== userLower) {
          uniqueMap.set(otherLower, otherLower);
        }
      }
    });

    const allUsers = await usersCol.find({}).toArray();
    allUsers.forEach(u => {
      const uKey = u.username.toLowerCase();
      if (uKey !== userLower) {
        uniqueMap.set(uKey, u.username);
      }
    });

    const dmsList = Array.from(uniqueMap.values()).map(username => ({ username }));
    callback(dmsList);
  });

  socket.on('analytics:fetch', async (callback) => {
    if (!db) return;
    const usersCol = db.collection('users');
    const analyticsCol = db.collection('analytics');
    const registeredCount = await usersCol.countDocuments();
    const stats = await analyticsCol.findOne({ id: 'stats' }) || { totalRevenue: 0 };

    if (typeof callback === 'function') {
      callback({
        registeredCount,
        activeOnline: Object.keys(activeSockets).length,
        hoursUsed: '0.00',
        revenue: '$' + (stats.totalRevenue || 0).toFixed(2)
      });
    }
  });

  socket.on('notifications:fetch', async (callback) => {
    if (!db) return;
    const notifsCol = db.collection('notifications');
    const notifs = await notifsCol.find({}).sort({ id: -1 }).toArray();
    if (typeof callback === 'function') callback(notifs || []);
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    io.emit('users:update', Object.values(activeSockets));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✨ Star Fam active on http://localhost:${PORT}`));