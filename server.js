const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Client } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // Resim yüklemeleri için boyutu 10MB yaptık
});

app.use(express.static(path.join(__dirname, 'public')));

// =========================================
// SUPABASE POSTGRESQL BAĞLANTISI
// =========================================
const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Render ile Supabase arası güvenli SSL bağlantısı
});

db.connect()
    .then(() => console.log('🚀 SUPABASE: Siber veri ağı kalıcı olarak bağlandı!'))
    .catch(err => console.error('❌ VERİTABANI BAĞLANTI HATASI:', err));

// Aktif soketleri takip etmek için hafıza kartı
const activeUsers = {}; 

io.on('connection', (socket) => {
    let currentUsername = "";
    let currentRoom = "Genel";

    // 1. OTOMATİK GİRİŞ (AUTO AUTH)
    socket.on('auto auth', async (data) => {
        try {
            const res = await db.query('SELECT * FROM users WHERE username = $1', [data.username]);
            if (res.rows.length > 0) {
                currentUsername = res.rows[0].username;
                activeUsers[currentUsername] = {
                    username: currentUsername,
                    status: res.rows[0].status,
                    bio: res.rows[0].bio,
                    avatar_url: res.rows[0].avatar_url
                };
                socket.join(currentRoom);
                
                socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
                
                // Odaları ve geçmişi gönder
                sendRoomList();
                sendChatHistory(socket, currentRoom);
                sendUserList();
            }
        } catch (err) { console.error(err); }
    });

    // 2. KAYIT OLMA (REGISTER)
    socket.on('register user', async (data) => {
        try {
            const res = await db.query('SELECT * FROM users WHERE username = $1', [data.username]);
            if (res.rows.length > 0) {
                socket.emit('auth error', 'Bu siber kimlik veritabanında zaten kayıtlı!');
            } else {
                await db.query('INSERT INTO users (username, password) VALUES ($1, $2)', [data.username, data.password]);
                socket.emit('auth success', { message: 'Kimlik başarıyla işlendi. Giriş yapabilirsiniz.', username: data.username });
            }
        } catch (err) {
            socket.emit('auth error', 'Sistem hatası meydana geldi.');
        }
    });

    // 3. GİRİŞ YAPMA (LOGIN)
    socket.on('login user', async (data) => {
        try {
            const res = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [data.username, data.password]);
            if (res.rows.length > 0) {
                currentUsername = res.rows[0].username;
                activeUsers[currentUsername] = {
                    username: currentUsername,
                    status: res.rows[0].status,
                    bio: res.rows[0].bio,
                    avatar_url: res.rows[0].avatar_url
                };
                socket.join(currentRoom);

                socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
                
                sendRoomList();
                sendChatHistory(socket, currentRoom);
                sendUserList();
            } else {
                socket.emit('auth error', 'Erişim anahtarı veya kimlik tanımı geçersiz!');
            }
        } catch (err) {
            socket.emit('auth error', 'Giriş sırasında sistem hatası.');
        }
    });

    // 4. MESAJ GÖNDERME
    socket.on('chat message', async (data) => {
        if (!currentUsername) return;
        try {
            await db.query('INSERT INTO messages (room, username, message, time) VALUES ($1, $2, $3, $4)', 
                [currentRoom, currentUsername, data.message, data.time]);
            
            io.to(currentRoom).emit('chat message', {
                username: currentUsername,
                message: data.message,
                time: data.time
            });
        } catch (err) { console.error(err); }
    });

    // 5. ODA DEĞİŞTİRME
    socket.on('switch room', async (newRoom) => {
        socket.leave(currentRoom);
        currentRoom = newRoom;
        socket.join(currentRoom);
        sendChatHistory(socket, currentRoom);
    });

    // 6. YENİ ODA OLUŞTURMA
    socket.on('create room', async (roomName) => {
        const safeRoom = roomName.replace(/[#]/g, '').trim();
        if (!safeRoom) return;
        try {
            const res = await db.query('SELECT * FROM rooms WHERE room_name = $1', [safeRoom]);
            if (res.rows.length > 0) {
                socket.emit('room error', 'Bu kanal zaten aktif.');
            } else {
                await db.query('INSERT INTO rooms (room_name) VALUES ($1)', [safeRoom]);
                sendRoomList();
            }
        } catch (err) { console.error(err); }
    });

    // 7. PROFİL GÜNCELLEME
    socket.on('update profile', async (data) => {
        if (!currentUsername) return;
        try {
            await db.query('UPDATE users SET avatar_url = $1, bio = $2, status = $3 WHERE username = $4',
                [data.avatar_url, data.bio, data.status, currentUsername]);
            
            activeUsers[currentUsername].avatar_url = data.avatar_url;
            activeUsers[currentUsername].bio = data.bio;
            activeUsers[currentUsername].status = data.status;

            sendUserList();
        } catch (err) { console.error(err); }
    });

    // YAZIYOR SİNYALİ
    socket.on('typing', (isTyping) => {
        socket.to(currentRoom).emit('user typing', { username: currentUsername, isTyping });
    });

    // BAĞLANTI KOPUNCA
    socket.on('disconnect', () => {
        if (currentUsername) {
            delete activeUsers[currentUsername];
            sendUserList();
        }
    });
});

// YARDIMCI FONKSİYONLAR (BULUTTAN VERİ ÇEKME)
async function sendRoomList() {
    try {
        const res = await db.query('SELECT room_name FROM rooms');
        const rooms = res.rows.map(r => r.room_name);
        io.emit('room list', rooms);
    } catch (err) { console.error(err); }
}

async function sendChatHistory(socket, room) {
    try {
        const res = await db.query('SELECT username, message, time FROM messages WHERE room = $1 ORDER BY id ASC LIMIT 100', [room]);
        socket.emit('chat history', res.rows);
    } catch (err) { console.error(err); }
}

function sendUserList() {
    io.emit('user list', Object.values(activeUsers));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🛡️ Qore Core Terminal active on port ${PORT}`));
