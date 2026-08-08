const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'star_fam';
const OWNER_USERNAME = 'starediter1';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname,
    size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB'
  });
});

let db;
MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB database');
  })
  .catch(err => console.error('MongoDB connection error:', err));

const activeSockets = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('auth:login', async ({ identifier, pin }, callback) => {
    if (!db) return callback({ success: false, message: 'Database connecting...' });
    const usersCol = db.collection('users');
    const user = await usersCol.findOne({
      $or: [{ username: new RegExp(`^${identifier}$`, 'i') }, { tag: new RegExp(`^${identifier}$`, 'i') }]
    });

    if (!user || user.pin !== pin) {
      return callback({ success: false, message: 'Invalid credentials or PIN.' });
    }

    activeSockets[socket.id] = user;
    socket.join('global');
    io.emit('users:update', Object.values(activeSockets));
    callback({ success: true });
    socket.emit('auth:success', user);
  });

  socket.on('auth:signup', async ({ username, pin, tag, bio, pfp }, callback) => {
    if (!db) return callback({ success: false, message: 'Database connecting...' });
    const usersCol = db.collection('users');
    const existing = await usersCol.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (existing) {
      return callback({ success: false, message: 'Username is already taken.' });
    }

    const isOwner = username.toLowerCase() === OWNER_USERNAME;
    const newUser = {
      username,
      pin,
      tag: tag || `@${username}`,
      bio: bio || 'VFX Motion Editor',
      role: isOwner ? '👑 Owner & Creator' : 'Editor',
      pfp: pfp || null,
      isOwner
    };

    await usersCol.insertOne(newUser);
    activeSockets[socket.id] = newUser;
    socket.join('global');
    io.emit('users:update', Object.values(activeSockets));
    callback({ success: true });
    socket.emit('auth:success', newUser);
  });

  socket.on('auth:recover', async ({ identifier, recoveryCode, newPin }, callback) => {
    if (recoveryCode !== '1111') {
      return callback({ success: false, message: 'Invalid recovery code. Enter 1111.' });
    }
    const usersCol = db.collection('users');
    const user = await usersCol.findOne({
      $or: [{ username: new RegExp(`^${identifier}$`, 'i') }, { tag: new RegExp(`^${identifier}$`, 'i') }]
    });
    if (!user) {
      return callback({ success: false, message: 'User not found.' });
    }
    await usersCol.updateOne({ _id: user._id }, { $set: { pin: newPin } });
    callback({ success: true, message: 'PIN successfully reset! Please log in.' });
  });

  socket.on('chat:fetch_history', async ({ room }, callback) => {
    if (!db) return callback([]);
    const cleanRoom = room.toLowerCase();
    if (cleanRoom === 'global' || cleanRoom === 'editing-comp') {
      const chatCol = db.collection('chatHistory');
      const doc = await chatCol.findOne({ room: cleanRoom });
      callback(doc ? doc.messages : []);
    } else if (cleanRoom.startsWith('dm-')) {
      const user = activeSockets[socket.id];
      if (!user) return callback([]);
      const recipientLower = cleanRoom.replace('dm-', '');
      const threadKey = [user.username.toLowerCase(), recipientLower].sort().join('_');
      const dmsCol = db.collection('privateDMs');
      const doc = await dmsCol.findOne({ threadKey });
      callback(doc ? doc.messages : []);
    } else {
      callback([]);
    }
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
      targetRoom: targetRoom, text: data.text || '', mediaUrl: data.mediaUrl || null, mediaType: data.mediaType || null,
      isSticker: data.isSticker || false,
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
        if (msg && (msg.sender.toLowerCase() === user.username.toLowerCase() || isOwnerUser)) {
          await chatCol.updateOne({ room: cleanRoom }, { $pull: { messages: { id: msgId } } });
          io.emit('chat:refresh', { room: cleanRoom });
        }
      }
    } else {
      const dmsDocs = await dmsCol.find({}).toArray();
      for (let doc of dmsDocs) {
        if (doc.messages) {
          const msg = doc.messages.find(m => m.id === msgId);
          if (msg && (msg.sender.toLowerCase() === user.username.toLowerCase() || isOwnerUser)) {
            await dmsCol.updateOne({ threadKey: doc.threadKey }, { $pull: { messages: { id: msgId } } });
            io.emit('chat:refresh', cleanRoom);
          }
        }
      }
    }
  });

  socket.on('dms:fetch_list', async (callback) => {
    if (!db) return callback([]);
    const usersCol = db.collection('users');
    const users = await usersCol.find({}, { projection: { username: 1, tag: 1, pfp: 1 } }).toArray();
    callback(users);
  });

  socket.on('profile:update', async (data, callback) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const usersCol = db.collection('users');
    const updateFields = { tag: data.tag, bio: data.bio };
    if (data.pfp !== undefined) updateFields.pfp = data.pfp;
    if (data.paypalEmail && user.username.toLowerCase() === OWNER_USERNAME) {
      updateFields.paypalEmail = data.paypalEmail;
    }
    await usersCol.updateOne({ username: user.username }, { $set: updateFields });
    Object.assign(user, updateFields);
    callback();
  });

  socket.on('trivia:submit', async ({ points }, callback) => {
    if (!db) return;
    const user = activeSockets[socket.id];
    if (!user) return;
    const triviaCol = db.collection('triviaScores');
    
    await triviaCol.updateOne(
      { username: user.username },
      { $inc: { score: points }, $set: { tag: user.tag } },
      { upsert: true }
    );

    const list = await triviaCol.find({}).sort({ score: -1 }).limit(10).toArray();
    io.emit('leaderboard:update', list);
    callback({ success: true });
  });

  socket.on('leaderboard:fetch', async (callback) => {
    if (!db) return callback([]);
    const triviaCol = db.collection('triviaScores');
    const list = await triviaCol.find({}).sort({ score: -1 }).limit(10).toArray();
    callback(list);
  });

  socket.on('payment:completed', async ({ amount, type }) => {
    if (!db) return;
    const revCol = db.collection('revenueLogs');
    await revCol.insertOne({ amount: parseFloat(amount), type, timestamp: new Date() });

    io.emit('notification:new', {
      title: 'New Payment Received!',
      message: `Received $${parseFloat(amount).toFixed(2)} for ${type}!`
    });
  });

  socket.on('analytics:fetch', async (callback) => {
    if (!db) return callback({});
    const usersCol = db.collection('users');
    const revCol = db.collection('revenueLogs');
    const count = await usersCol.countDocuments();
    
    const revDocs = await revCol.find({}).toArray();
    const totalRev = revDocs.reduce((acc, curr) => acc + curr.amount, 0);

    callback({
      registeredCount: count,
      activeOnline: Object.keys(activeSockets).length,
      hoursUsed: (process.uptime() / 3600).toFixed(2),
      revenue: `$${totalRev.toFixed(2)}`
    });
  });

  socket.on('owner:paypal:fetch', async (callback) => {
    if (!db) return callback({});
    const usersCol = db.collection('users');
    const owner = await usersCol.findOne({ username: OWNER_USERNAME });
    callback({ paypalEmail: owner ? owner.paypalEmail : 'starediter1@gmail.com' });
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    io.emit('users:update', Object.values(activeSockets));
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});