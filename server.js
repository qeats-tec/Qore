const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB Profil Resmi Desteği
});

app.use(express.static(path.join(__dirname, 'public')));

// Local JSON Veritabanı (Sunucu içinde saklanır, harici link istemez)
const DATA_FILE = path.join(__dirname, 'database.json');

// Eğer dosya yoksa sıfırdan siber şema oluştur
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, messages: [], rooms: ["Genel"] }, null, 2));
}

// Veriyi okuma fonksiyonu
function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return { users: {}, messages: [], rooms: ["Genel"] };
    }
}

// Veriyi yazma fonksiyonu
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const activeUsers = {}; 

io.on('connection', (socket) => {
    let currentUsername = "";
    let currentRoom = "Genel";

    // 1. OTOMATİK GİRİŞ
    socket.on('auto auth', (data) => {
        const db = readData();
        if (db.users[data.username]) {
            currentUsername = data.username;
            activeUsers[currentUsername] = {
                username: currentUsername,
                status: db.users[currentUsername].status || 'online',
                bio: db.users[currentUsername].bio || 'Qore kullanıcısı.',
                avatar_url: db.users[currentUsername].avatar_url || ''
            };
            socket.join(currentRoom);
            
            socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
            
            io.emit('room list', db.rooms);
            socket.emit('chat history', db.messages.filter(m => m.room === currentRoom).slice(-100));
            io.emit('user list', Object.values(activeUsers));
        }
    });

    // 2. KAYIT OLMA (GÜVENLİ ŞİFRELEME)
    socket.on('register user', async (data) => {
        const db = readData();
        if (db.users[data.username]) {
            return socket.emit('auth error', 'Bu siber kimlik zaten kayıtlı!');
        }

        try {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            db.users[data.username] = {
                username: data.username,
                password: hashedPassword,
                status: 'online',
                bio: 'Qore kullanıcısı.',
                avatar_url: ''
            };
            writeData(db);
            socket.emit('auth success', { message: 'Kayıt başarılı! Giriş yapabilirsiniz.', username: data.username });
        } catch (err) {
            socket.emit('auth error', 'Kayıt sırasında siber hata oluştu.');
        }
    });

    // 3. GİRİŞ YAPMA
    socket.on('login user', async (data) => {
        const db = readData();
        const user = db.users[data.username];

        if (!user) {
            return socket.emit('auth error', 'Erişim anahtarı veya kimlik tanımı geçersiz!');
        }

        const match = await bcrypt.compare(data.password, user.password);
        if (match) {
            currentUsername = data.username;
            activeUsers[currentUsername] = {
                username: currentUsername,
                status: user.status,
                bio: user.bio,
                avatar_url: user.avatar_url
            };
            socket.join(currentRoom);

            socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
            
            io.emit('room list', db.rooms);
            socket.emit('chat history', db.messages.filter(m => m.room === currentRoom).slice(-100));
            io.emit('user list', Object.values(activeUsers));
        } else {
            socket.emit('auth error', 'Erişim anahtarı veya kimlik tanımı geçersiz!');
        }
    });

    // 4. MESAJ GÖNDERME
    socket.on('chat message', (data) => {
        if (!currentUsername) return;
        const db = readData();
        
        const newMsg = {
            room: currentRoom,
            username: currentUsername,
            message: data.message,
            time: data.time
        };
        
        db.messages.push(newMsg);
        writeData(db);
        
        io.to(currentRoom).emit('chat message', {
            username: currentUsername,
            message: data.message,
            time: data.time
        });
    });

    // 5. ODA DEĞİŞTİRME
    socket.on('switch room', (newRoom) => {
        socket.leave(currentRoom);
        currentRoom = newRoom;
        socket.join(currentRoom);
        
        const db = readData();
        socket.emit('chat history', db.messages.filter(m => m.room === currentRoom).slice(-100));
    });

    // 6. YENİ ODA OLUŞTURMA
    socket.on('create room', (roomName) => {
        const safeRoom = roomName.replace(/[#]/g, '').trim();
        if (!safeRoom) return;
        
        const db = readData();
        if (db.rooms.includes(safeRoom)) {
            socket.emit('room error', 'Bu kanal zaten aktif.');
        } else {
            db.rooms.push(safeRoom);
            writeData(db);
            io.emit('room list', db.rooms);
        }
    });

    // 7. PROFİL GÜNCELLEME
    socket.on('update profile', (data) => {
        if (!currentUsername) return;
        const db = readData();
        
        if (db.users[currentUsername]) {
            db.users[currentUsername].avatar_url = data.avatar_url;
            db.users[currentUsername].bio = data.bio;
            db.users[currentUsername].status = data.status;
            writeData(db);
            
            activeUsers[currentUsername].avatar_url = data.avatar_url;
            activeUsers[currentUsername].bio = data.bio;
            activeUsers[currentUsername].status = data.status;

            io.emit('user list', Object.values(activeUsers));
        }
    });

    socket.on('typing', (isTyping) => {
        socket.to(currentRoom).emit('user typing', { username: currentUsername, isTyping });
    });

    socket.on('disconnect', () => {
        if (currentUsername) {
            delete activeUsers[currentUsername];
            io.emit('user list', Object.values(activeUsers));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🛡️ Qore Core Terminal active on port ${PORT}`));
