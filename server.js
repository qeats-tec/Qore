require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt'); // Şifreleme kütüphanesi

const PORT = process.env.PORT || 3000;
let db;

app.use(express.static('public'));

(async () => {
    db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });

    // Kullanıcılar tablosunu şifre (password) alanı ile güncelliyoruz
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            avatar_url TEXT DEFAULT '',
            bio TEXT DEFAULT 'Qore kullanıcısı.',
            status TEXT DEFAULT 'online'
        )
    `);

    await db.exec(`CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
    await db.run('INSERT OR IGNORE INTO rooms (name) VALUES ("Genel")');
    await db.exec(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT, username TEXT, message TEXT, time TEXT)`);
    
    console.log('🗄️ SQLite Şifreli Hesap Sistemi aktif.');
})();

let roomUsers = {};

io.on('connection', (socket) => {
    let currentRoom = "Genel";
    let myUsername = "";

    // HESAP KAYIT İŞLEMİ
    socket.on('register user', async ({ username, password }) => {
        const cleanName = username.trim();
        if (!cleanName || !password) {
            return socket.emit('auth error', 'Kullanıcı adı veya şifre boş olamaz.');
        }

        try {
            // Şifreyi 10 salt turu ile güvenli bir şekilde hashliyoruz
            const hashedPassword = await bcrypt.hash(password, 10);
            
            await db.run('INSERT INTO users (username, password) VALUES (?, ?)', cleanName, hashedPassword);
            socket.emit('auth success', { username: cleanName, message: 'Kayıt başarılı! Şimdi giriş yapabilirsiniz.' });
        } catch (err) {
            socket.emit('auth error', 'Bu kullanıcı adı zaten alınmış.');
        }
    });

    // HESAP GİRİŞ İŞLEMİ
    socket.on('login user', async ({ username, password }) => {
        const cleanName = username.trim();
        let user = await db.get('SELECT * FROM users WHERE username = ?', cleanName);

        if (!user) {
            return socket.emit('auth error', 'Kullanıcı bulunamadı.');
        }

        // Girilen şifre ile veritabanındaki hashli şifreyi karşılaştırıyoruz
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return socket.emit('auth error', 'Hatalı şifre saptandı!');
        }

        // Giriş Başarılı, Kullanıcıyı Odaya Bağla
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

        const rooms = await db.all('SELECT name FROM rooms');
        socket.emit('room list', rooms.map(r => r.name));

        const history = await db.all('SELECT username, message, time FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50', currentRoom);
        socket.emit('chat history', history);

        io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
    });

    // Profil Güncelleme
    socket.on('update profile', async (data) => {
        if (!myUsername) return;

        await db.run(
            'UPDATE users SET avatar_url = ?, bio = ?, status = ? WHERE username = ?',
            data.avatar_url, data.bio, data.status, myUsername
        );

        if (roomUsers[currentRoom] && roomUsers[currentRoom][socket.id]) {
            roomUsers[currentRoom][socket.id].avatar_url = data.avatar_url;
            roomUsers[currentRoom][socket.id].bio = data.bio;
            roomUsers[currentRoom][socket.id].status = data.status;

            io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
        }
    });

    // Oda Değiştirme
    socket.on('switch room', async (newRoom) => {
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

        const history = await db.all('SELECT username, message, time FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50', currentRoom);
        socket.emit('chat history', history);

        io.to(currentRoom).emit('user list', Object.values(roomUsers[currentRoom]));
    });

    socket.on('create room', async (roomName) => {
        const cleanedName = roomName.trim();
        if (!cleanedName) return;
        try {
            await db.run('INSERT INTO rooms (name) VALUES (?)', cleanedName);
            const rooms = await db.all('SELECT name FROM rooms');
            io.emit('room list', rooms.map(r => r.name));
        } catch (err) {
            socket.emit('room error', 'Bu oda zaten mevcut.');
        }
    });

    socket.on('chat message', async (data) => {
        if (!myUsername) return;
        await db.run('INSERT INTO messages (room, username, message, time) VALUES (?, ?, ?, ?)',
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