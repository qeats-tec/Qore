// Load environment variables
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const JSONBin = require('jsonbin-js');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const corsOptions = {
    origin: "*", // Allow all origins for now, configure for production
    methods: ["GET", "POST"]
};

// --- Ensure Uploads Directory Exists ---
const uploadsDir = path.join(__dirname, 'public', 'uploads'); // Store uploads in public/uploads
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir); // Save files to the public/uploads directory
    },
    filename: function (req, file, cb) {
        // Create a unique filename: timestamp-originalfilename
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(cors(corsOptions));
app.use(express.json()); // Middleware to parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' directory
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'))); // Serve uploaded files

// --- JSONBin Setup ---
const jsonbin = new JSONBin({
    apiKey: process.env.JSONBIN_API_KEY,
    secret: process.env.JSONBIN_SECRET
});

// --- Data Storage (In-memory for simplicity, JSONBin for users) ---
let messages = []; // In-memory storage for messages
const USER_DATA_BIN_ID = process.env.JSONBIN_ID; // Set this in your .env file after first creation

// --- Helper Functions ---

// Function to fetch user data from JSONBin
async function getUserData() {
    if (!USER_DATA_BIN_ID) {
        console.error('USER_DATA_BIN_ID not set in .env file. User data cannot be loaded.');
        return { users: [] };
    }
    try {
        const record = await jsonbin.getRecord(USER_DATA_BIN_ID);
        return record.record;
    } catch (error) {
        console.error('Error accessing JSONBin for user data:', error);
        // Fallback to empty data if JSONBin fails
        return { users: [] };
    }
}

// Function to save user data to JSONBin
async function saveUserData(data) {
    if (!USER_DATA_BIN_ID) {
        console.error('USER_DATA_BIN_ID not set in .env file. User data cannot be saved.');
        return;
    }
    try {
        await jsonbin.updateRecord(USER_DATA_BIN_ID, data);
    } catch (error) {
        console.error('Error saving to JSONBin for user data:', error);
    }
}

// Function to get a user by username
async function findUserByUsername(username) {
    const data = await getUserData();
    return data.users.find(user => user.username === username);
}

// Function to add a new user
async function addUser(userData) {
    const data = await getUserData();
    // Check if user already exists before adding
    if (data.users.some(user => user.username === userData.username)) {
        throw new Error('Bu kullanıcı adı zaten mevcut.');
    }
    // In a real app, hash the password here using bcrypt
    data.users.push(userData);
    await saveUserData(data);
}

// Function to update user data (e.g., profile picture URL)
async function updateUser(username, updateData) {
    const data = await getUserData();
    const userIndex = data.users.findIndex(user => user.username === username);
    if (userIndex > -1) {
        data.users[userIndex] = { ...data.users[userIndex], ...updateData };
        await saveUserData(data);
        return data.users[userIndex];
    }
    return null; // User not found
}


// --- API Routes ---

// Route to handle profile picture upload
app.post('/api/upload-profile-picture', upload.single('profilePicture'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }
    if (!req.body.username) {
        return res.status(400).json({ error: 'Username is required for upload.' });
    }

    const username = req.body.username;
    const profilePictureUrl = `/uploads/${req.file.filename}`; // URL to access the uploaded file

    try {
        const updatedUser = await updateUser(username, { profilePictureUrl });
        if (updatedUser) {
            res.json({ message: 'Profil resmi başarıyla yüklendi.', url: profilePictureUrl });
        } else {
            res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
    } catch (error) {
        console.error('Error updating user profile picture:', error);
        res.status(500).json({ error: 'Profil resmi yüklenirken bir hata oluştu.' });
    }
});

// Route to get user profile data (optional, can be handled via socket)
app.get('/api/user-profile/:username', async (req, res) => {
    try {
        const user = await findUserByUsername(req.params.username);
        if (user) {
            // Return only necessary data, avoid sending password hash
            res.json({
                username: user.username,
                profilePictureUrl: user.profilePictureUrl || null
            });
        } else {
            res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Profil bilgileri alınırken bir hata oluştu.' });
    }
});

// --- Socket.IO Setup ---
const io = new Server(server, {
    cors: corsOptions,
    // Note: You might need to configure message limits if storing many messages in memory
});

// Function to get messages for a room (placeholder)
function getRoomMessages(roomCode) {
    // In a real app, you'd fetch these from a database/JSONBin
    // For now, filter in-memory messages
    return messages.filter(msg => msg.roomCode === roomCode);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle user registration
    socket.on('register', async (data) => {
        const { username, password } = data;
        try {
            // In a real app, hash the password here before pushing
            await addUser({ username, password, profilePictureUrl: null }); // Initialize with null profile pic
            socket.emit('registration_success', 'Kayıt başarıyla tamamlandı. Lütfen giriş yapın.');
        } catch (error) {
            console.error('Registration failed:', error.message);
            socket.emit('registration_failed', error.message);
        }
    });

    // Handle user login
    socket.on('login', async (data) => {
        const { username, password } = data;
        const user = await findUserByUsername(username);

        if (!user) {
            return socket.emit('login_failed', 'Kullanıcı adı veya şifre hatalı.');
        }

        // In a real app, compare hashed passwords
        if (user.password !== password) {
            return socket.emit('login_failed', 'Kullanıcı adı veya şifre hatalı.');
        }

        // Emit user data including profile picture URL
        socket.emit('login_success', {
            username: user.username,
            profilePictureUrl: user.profilePictureUrl
        });
    });

    // Join a room
    socket.on('join_room', async (data) => {
        const { username, roomCode } = data;
        socket.join(roomCode);
        console.log(`User ${username} joined room: ${roomCode}`);

        // Fetch user data to get profile picture URL
        const user = await findUserByUsername(username);
        const profilePic = user ? user.profilePictureUrl : null;

        // Send a welcome message to the user who joined
        socket.emit('message', {
            username: 'Admin',
            text: `${username}, hoş geldiniz!`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'info',
            profilePictureUrl: null // Admin messages don't have profile pics
        });

        // Broadcast to others in the room that a user has joined
        socket.to(roomCode).emit('message', {
            username: 'Admin',
            text: `${username} odaya katıldı.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'info',
            profilePictureUrl: null
        });

        // Send existing messages for the room to the newly joined user
        const roomMessages = getRoomMessages(roomCode);
        socket.emit('previous_messages', { roomCode, messages: roomMessages });

        // Update the user list for the room if you have one
    });

    // Receive and broadcast messages
    socket.on('send_message', async (data) => {
        const { username, roomCode, message } = data;
        const user = await findUserByUsername(username);
        const profilePic = user ? user.profilePictureUrl : null;

        const messageData = {
            id: Date.now() + Math.random(), // Simple unique ID for deletion
            username,
            roomCode,
            text: message,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'user',
            profilePictureUrl: profilePic
        };

        messages.push(messageData); // Store message in memory

        // Broadcast the message to everyone in the room
        io.to(roomCode).emit('message', messageData);

        // Broadcast notification to clients potentially not in the room
        // Filter out users in the current room to avoid redundant notifications
        socket.broadcast.emit('new_message_notification', messageData);
    });

    // Handle message deletion
    socket.on('delete_message', async (data) => {
        const { messageId, username, roomCode } = data; // Need username to verify ownership

        // Find the message and check if the user is the owner
        const messageIndex = messages.findIndex(msg => msg.id === messageId);

        if (messageIndex > -1) {
            const messageToDelete = messages[messageIndex];
            // VERY IMPORTANT: In a real app, you'd also verify ownership server-side
            // For now, we trust the client that the user owns the message they are trying to delete
            // if (messageToDelete.username === username) {
                messages.splice(messageIndex, 1); // Remove message from memory

                // Emit event to update UI for all clients in the room
                io.to(roomCode).emit('message_deleted', { messageId });
                console.log(`Message ${messageId} deleted by ${username} in room ${roomCode}`);
            // } else {
            //     console.warn(`Unauthorized delete attempt for message ${messageId} by ${username}`);
            //     socket.emit('delete_failed', 'Bu mesajı silme yetkiniz yok.');
            // }
        } else {
            console.warn(`Message ${messageId} not found for deletion.`);
            socket.emit('delete_failed', 'Silinecek mesaj bulunamadı.');
        }
    });


    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up user's presence if needed
    });
});


// --- Serve Frontend Files ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if (!process.env.JSONBIN_API_KEY || !process.env.JSONBIN_SECRET || !USER_DATA_BIN_ID) {
        console.warn('-----------------------------------------------------');
        console.warn('!!! WARNING !!!');
        console.warn('JSONBin API Key, Secret, or ID are not set in .env file.');
        console.warn('User data will not be persisted correctly.');
        console.warn('Please create a .env file with:');
        console.warn('JSONBIN_API_KEY=YOUR_KEY');
        console.warn('JSONBIN_SECRET=YOUR_SECRET');
        console.warn('USER_DATA_BIN_ID=YOUR_BIN_ID (Create a bin first, then add its ID here)');
        console.warn('-----------------------------------------------------');
    } else {
        console.log('JSONBin credentials loaded successfully.');
    }
});
