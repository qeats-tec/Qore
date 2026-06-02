require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const Database = require('better-sqlite3'); // Yeni ve sorunsuz kütüphane
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Veritabanı bağlantısı ve tablolar (Senkron ve aşırı hızlı)
const db = new Database('./database.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        avatar_url TEXT DEFAULT '',
        bio TEXT DEFAULT 'Qore kullanıcısı.',
        status TEXT DEFAULT 'online'
    )
`);

db.exec(`CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
db.prepare('INSERT OR IGNORE INTO rooms (name) VALUES ("Genel")').run();
db.exec(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT, username TEXT, message TEXT, time TEXT)`);

console.log('🗄️ Better-SQLite3 Şifreli Hesap Sistemi Render üzerinde aktif.');

let roomUsers = {};

io.on('connection', (socket) => {
    let currentRoom = "Genel";
    let myUsername = "";

    // OTOMATİK OTURUM DOĞRULAMA (SAYFA YENİLENİNCE)
    socket.on('auto auth', ({ username }) => {
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (user) {
            myUsername = user.username;
            socket.join(currentRoom);

            if (!roomUsers[currentRoom]) roomUsers[currentRoom] = {};
            roomUsers[currentRoom][socket.id] = {
                username: user.username,
                avatar_url: user.avatar_url,
                status: user.status,
                bio: user.bio
            };

            socket.emit('login success', { username: user.username, userVeri: user });

            const rooms = db.prepare('SELECT name FROM rooms').all();
            socket.emit('room list', rooms.map(r => r.name));

            const history = db.prepare('SELECT username, message, time FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50').all(currentRoom);
            socket.emit('chat history', history);

            io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
        }
    });

    // HESAP KAYIT İŞLEMİ
    socket.on('register user', async ({ username, password }) => {
        const cleanName = username.trim();
        if (!cleanName || !password) {
            return socket.emit('auth error', 'Kullanıcı adı veya şifre boş olamaz.');
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(cleanName, hashedPassword);
            socket.emit('auth success', { username: cleanName, message: 'Kayıt başarılı! Şimdi giriş yapabilirsiniz.' });
        } catch (err) {
            socket.emit('auth error', 'Bu kullanıcı adı zaten alınmış.');
        }
    });

    // HESAP GİRİŞ İŞLEMİ
    socket.on('login user', async ({ username, password }) => {
        const cleanName = username.trim();
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanName);

        if (!user) {
            return socket.emit('auth error', 'Kullanıcı bulunamadı.');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return socket.emit('auth error', 'Hatalı şifre saptandı!');
        }

        myUsername = cleanName;
        socket.join(currentRoom);

        if (!roomUsers[currentRoom]) roomUsers[currentRoom] = {};
        roomUsers[currentRoom][socket.id] = {
            username: user.username,
            avatar_url: user.avatar_url,
            status: user.status,
            bio: user.bio
        };

        socket.emit('login success', { username: user.username, userVeri: user });

        const rooms = db.prepare('SELECT name FROM rooms').all();
        socket.emit('room list', rooms.map(r => r.name));

        const history = db.prepare('SELECT username, message, time FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50').all(currentRoom);
        socket.emit('chat history', history);

        io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
    });

    // Profil Güncelleme
    socket.on('update profile', (data) => {
        if (!myUsername) return;

        db.prepare('UPDATE users SET avatar_url = ?, bio = ?, status = ? WHERE username = ?')
          .run(data.avatar_url, data.bio, data.status, myUsername);

        if (roomUsers[currentRoom] && roomUsers[currentRoom][socket.id]) {
            roomUsers[currentRoom][socket.id].avatar_url = data.avatar_url;
            roomUsers[currentRoom][socket.id].bio = data.bio;
            roomUsers[currentRoom][socket.id].status = data.status;

            io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
        }
    });

    // Oda Değiştirme
    socket.on('switch room', (newRoom) => {
        if (!myUsername) return;
        let myUserData = roomUsers[currentRoom]?.[socket.id];

        socket.leave(currentRoom);
        if (roomUsers[currentRoom]) {
            delete roomUsers[currentRoom][socket.id];
            io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
        }

        currentRoom = newRoom;
        socket.join(currentRoom);

        if (!roomUsers[currentRoom]) roomUsers[currentRoom] = {};
        if (myUserData) roomUsers[currentRoom][socket.id] = myUserData;

        const history = db.prepare('SELECT username, message, time FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50').all(currentRoom);
        socket.emit('chat history', history);

        io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
    });

    socket.on('create room', (roomName) => {
        const cleanedName = roomName.trim();
        if (!cleanedName) return;
        try {
            db.prepare('INSERT INTO rooms (name) VALUES (?)').run(cleanedName);
            const rooms = db.prepare('SELECT name FROM rooms').all();
            io.emit('room list', rooms.map(r => r.name));
        } catch (err) {
            socket.emit('room error', 'Bu oda zaten mevcut.');
        }
    });

    socket.on('chat message', (data) => {
        if (!myUsername) return;
        db.prepare('INSERT INTO messages (room, username, message, time) VALUES (?, ?, ?, ?)').run(
            currentRoom, data.username, data.message, data.time
        );
        io.to(currentRoom).emit('chat message', data);
    });

    socket.on('typing', (isTyping) => {
        if(roomUsers[currentRoom]?.[socket.id]) {
            socket.broadcast.emit('user typing', {
                username: roomUsers[currentRoom][socket.id].username,
                isTyping: isTyping
            });
        }
    });

    socket.on('disconnect', () => {
        if (roomUsers[currentRoom] && roomUsers[currentRoom][socket.id]) {
            delete roomUsers[currentRoom][socket.id];
            io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
        }
    });
});

http.listen(PORT, () => {
    console.log(`🚀 Qore Sunucusu http://localhost:${PORT} adresinde aktif!`);
});
