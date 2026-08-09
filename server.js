const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route for APK download
app.get('/starfam.apk', (req, res) => {
    const apkPath = path.join(__dirname, 'public', 'starfam.apk');
    if (fs.existsSync(apkPath)) {
        res.download(apkPath, 'starfam.apk');
    } else {
        res.status(404).send('APK file not found on server.');
    }
});

// Multer storage for media and profile uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname,
        size: `${(req.file.size / 1024).toFixed(1)} KB`
    });
});

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/starfam';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Schemas & Models
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    pin: { type: String, required: true },
    tag: { type: String, default: '' },
    bio: { type: String, default: '' },
    pfp: { type: String, default: '' },
    role: { type: String, default: 'Editor' },
    score: { type: Number, default: 0 },
    paypalEmail: { type: String, default: 'starediter1@gmail.com' }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    room: { type: String, required: true },
    sender: { type: String, required: true },
    tag: { type: String, default: '' },
    pfp: { type: String, default: '' },
    text: { type: String, default: '' },
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, default: null },
    isSticker: { type: Boolean, default: false },
    timestamp: { type: String, default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
});
const Message = mongoose.model('Message', messageSchema);

const pollSchema = new mongoose.Schema({
    targetRoom: { type: String, required: true },
    sender: { type: String, required: true },
    question: { type: String, required: true },
    options: [String],
    votes: [[String]] // Array of user arrays per option index
});
const Poll = mongoose.model('Poll', pollSchema);

const analyticsSchema = new mongoose.Schema({
    hoursUsed: { type: Number, default: 124 },
    completedRevenue: { type: Number, default: 0 }
});
const Analytics = mongoose.model('Analytics', analyticsSchema);

// Active Online Users tracking
let activeUsers = new Map(); // socket.id -> user object

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('auth:login', async ({ identifier, pin }, callback) => {
        try {
            const cleanId = identifier.trim().toLowerCase();
            const user = await User.findOne({
                $or: [
                    { username: { $regex: new RegExp(`^${cleanId}$`, 'i') } },
                    { tag: { $regex: new RegExp(`^${cleanId}$`, 'i') } }
                ]
            });

            if (!user || user.pin !== pin) {
                return callback({ success: false, message: 'Invalid credentials or security PIN.' });
            }

            activeUsers.set(socket.id, user);
            socket.join('global');
            socket.emit('auth:success', user);
            broadcastActiveUsers();
            callback({ success: true });
        } catch (err) {
            callback({ success: false, message: 'Server login error.' });
        }
    });

    socket.on('auth:signup', async ({ username, pin, tag, bio, pfp }, callback) => {
        try {
            const existing = await User.findOne({ username: username.trim() });
            if (existing) {
                return callback({ success: false, message: 'Username already taken.' });
            }

            const newUser = new User({
                username: username.trim(),
                pin: pin.trim(),
                tag: tag ? tag.trim() : `@${username.trim()}`,
                bio: bio ? bio.trim() : 'VFX Motion Editor',
                pfp: pfp || '',
                role: username.toLowerCase() === 'starediter1' ? 'Owner / Developer' : 'Editor'
            });

            await newUser.save();
            activeUsers.set(socket.id, newUser);
            socket.join('global');
            socket.emit('auth:success', newUser);
            broadcastActiveUsers();
            callback({ success: true });
        } catch (err) {
            callback({ success: false, message: 'Server registration error.' });
        }
    });

    socket.on('auth:recover', async ({ identifier, code, newPin }, callback) => {
        if (code !== '1111') {
            return callback({ success: false, message: 'Incorrect master recovery code.' });
        }
        try {
            const cleanId = identifier.trim().toLowerCase();
            const user = await User.findOne({
                $or: [
                    { username: { $regex: new RegExp(`^${cleanId}$`, 'i') } },
                    { tag: { $regex: new RegExp(`^${cleanId}$`, 'i') } }
                ]
            });
            if (!user) {
                return callback({ success: false, message: 'User not found.' });
            }
            user.pin = newPin.trim();
            await user.save();
            callback({ success: true });
        } catch (err) {
            callback({ success: false, message: 'Recovery error.' });
        }
    });

    socket.on('chat:fetch_history', async ({ room }, callback) => {
        try {
            let messages = [];
            if (room.startsWith('dm-')) {
                messages = await Message.find({ room }).sort({ _id: 1 }).limit(50);
                const polls = await Poll.find({ targetRoom: room });
                messages = [...messages, ...polls].sort((a, b) => a._id - b._id);
            } else {
                messages = await Message.find({ room }).sort({ _id: 1 }).limit(50);
                const polls = await Poll.find({ targetRoom: room });
                messages = [...messages, ...polls].sort((a, b) => a._id - b._id);
            }
            callback(messages);
        } catch (err) {
            callback([]);
        }
    });

    socket.on('chat:send', async (data) => {
        try {
            const user = activeUsers.get(socket.id);
            if (!user) return;

            const newMsg = new Message({
                room: data.targetRoom,
                sender: user.username,
                tag: user.tag,
                pfp: user.pfp,
                text: data.text || '',
                mediaUrl: data.mediaUrl || null,
                mediaType: data.mediaType || null,
                isSticker: data.isSticker || false
            });

            await newMsg.save();
            io.to(data.targetRoom).emit('chat:message', newMsg);
            
            // If it's a DM, make sure both parties receive it if joined
            if (data.targetRoom.startsWith('dm-')) {
                io.emit('chat:refresh');
            }
        } catch (err) {
            console.error('Error sending message:', err);
        }
    });

    socket.on('chat:delete', async ({ msgId, room }) => {
        try {
            const user = activeUsers.get(socket.id);
            if (!user) return;
            const msg = await Message.findById(msgId);
            if (!msg) return;

            if (msg.sender.toLowerCase() === user.username.toLowerCase() || user.role.includes('Owner') || user.username.toLowerCase() === 'starediter1') {
                await Message.findByIdAndDelete(msgId);
                io.to(room).emit('chat:refresh');
            }
        } catch (err) {
            console.error('Error deleting message:', err);
        }
    });

    socket.on('poll:create', async (data) => {
        try {
            const user = activeUsers.get(socket.id);
            if (!user) return;

            const newPoll = new Poll({
                targetRoom: data.targetRoom,
                sender: user.username,
                question: data.question,
                options: data.options,
                votes: data.options.map(() => [])
            });

            await newPoll.save();
            io.to(data.targetRoom).emit('poll:new', newPoll);
        } catch (err) {
            console.error('Error creating poll:', err);
        }
    });

    socket.on('poll:vote', async ({ pollId, optionIndex, room }) => {
        try {
            const user = activeUsers.get(socket.id);
            if (!user) return;
            const poll = await Poll.findById(pollId);
            if (!poll) return;

            // Remove previous vote by this user across options
            poll.votes.forEach((votedArr) => {
                const idx = votedArr.indexOf(user.username);
                if (idx !== -1) votedArr.splice(idx, 1);
            });

            if (poll.votes[optionIndex]) {
                poll.votes[optionIndex].push(user.username);
                await poll.save();
                io.to(room).emit('chat:refresh');
            }
        } catch (err) {
            console.error('Error voting poll:', err);
        }
    });

    socket.on('poll:delete', async ({ pollId, room }) => {
        try {
            const user = activeUsers.get(socket.id);
            if (!user) return;
            const poll = await Poll.findById(pollId);
            if (!poll) return;

            if (poll.sender.toLowerCase() === user.username.toLowerCase() || user.role.includes('Owner') || user.username.toLowerCase() === 'starediter1') {
                await Poll.findByIdAndDelete(pollId);
                io.to(room).emit('chat:refresh');
            }
        } catch (err) {
            console.error('Error deleting poll:', err);
        }
    });

    socket.on('trivia:submit', async ({ points }, callback) => {
        try {
            const user = activeUsers.get(socket.id);
            if (!user) return;
            user.score += points;
            await User.findByIdAndUpdate(user._id, { score: user.score });
            broadcastLeaderboard();
            callback();
        } catch (err) {
            console.error('Error submitting trivia:', err);
        }
    });

    socket.on('leaderboard:fetch', async (callback) => {
        try {
            const topUsers = await User.find().sort({ score: -1 }).limit(10);
            callback(topUsers);
        } catch (err) {
            callback([]);
        }
    });

    socket.on('dms:fetch_list', async (callback) => {
        try {
            const allUsers = await User.find({}, 'username tag pfp role');
            callback(allUsers);
        } catch (err) {
            callback([]);
        }
    });

    socket.on('profile:update', async (data, callback) => {
        try {
            const user = activeUsers.get(socket.id);
            if (!user) return;

            if (data.tag !== undefined) user.tag = data.tag;
            if (data.bio !== undefined) user.bio = data.bio;
            if (data.paypalEmail !== undefined) user.paypalEmail = data.paypalEmail;
            if (data.pfp !== undefined) user.pfp = data.pfp;

            await User.findByIdAndUpdate(user._id, {
                tag: user.tag,
                bio: user.bio,
                paypalEmail: user.paypalEmail,
                pfp: user.pfp
            });

            callback();
        } catch (err) {
            console.error('Error updating profile:', err);
        }
    });

    socket.on('owner:paypal:fetch', async (callback) => {
        try {
            const owner = await User.findOne({ username: 'starediter1' });
            callback({ paypalEmail: owner ? owner.paypalEmail : 'starediter1@gmail.com' });
        } catch (err) {
            callback({ paypalEmail: 'starediter1@gmail.com' });
        }
    });

    socket.on('analytics:fetch', async (callback) => {
        try {
            const registeredCount = await User.countDocuments();
            let analyticsDoc = await Analytics.findOne();
            if (!analyticsDoc) {
                analyticsDoc = new Analytics({ hoursUsed: 124, completedRevenue: 0 });
                await analyticsDoc.save();
            }
            callback({
                registeredCount,
                activeOnline: activeUsers.size,
                hoursUsed: analyticsDoc.hoursUsed,
                revenue: `$${analyticsDoc.completedRevenue.toFixed(2)}`
            });
        } catch (err) {
            callback({ registeredCount: 0, activeOnline: 1, hoursUsed: 0, revenue: '$0.00' });
        }
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
        broadcastActiveUsers();
        console.log('Client disconnected:', socket.id);
    });
});

function broadcastActiveUsers() {
    const users = Array.from(activeUsers.values());
    io.emit('users:update', users);
}

async function broadcastLeaderboard() {
    const topUsers = await User.find().sort({ score: -1 }).limit(10);
    io.emit('leaderboard:update', topUsers);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`StarFam server running on port ${PORT}`);
});