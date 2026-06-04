const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB Dosya ve Profil Resmi Desteği
});

app.use(express.static(path.join(__dirname, 'public')));

// Yerel JSON Dosya Altyapısı
const DATA_FILE = path.join(__dirname, 'database.json');

// Eğer dosya yoksa sıfırdan şemayı oluştur
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, messages: [] }, null, 2));
}

function readData() {
    try { 
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); 
    } catch (e) { 
        return { users: {}, messages: [] }; 
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// PWA Ve Logo Yönlendirmeleri
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'sw.js'));
});
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'manifest.json'));
});
app.get('/qore.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'qore.png'));
});

const activeUsers = {}; // Anlık çevrimiçi kullanıcılar listesi

io.on('connection', (socket) => {
    let currentUsername = "";
    let currentRoom = "Genel";

    // 1. OTOMATİK GİRİŞ (AUTO AUTH)
    socket.on('auto auth', (data) => {
        const db = readData();
        if (db.users[data.username]) {
            currentUsername = data.username;
            activeUsers[currentUsername] = {
                username: currentUsername,
                status: db.users[currentUsername].status || 'online',
                bio: db.users[currentUsername].bio || 'Qore kullanıcısı.',
                avatar_url: db.users[currentUsername].avatar_url || '',
                socketId: socket.id
            };
            socket.join(currentRoom);
            
            socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
            
            // Mevcut odaları topla (DM olmayanlar)
            let roomsSet = new Set(["Genel", "Yazılım", "Sohbet"]);
            db.messages.forEach(m => {
                if (m.room && !m.room.startsWith('DM_')) {
                    roomsSet.add(m.room);
                }
            });
            
            io.emit('room list', Array.from(roomsSet));
            
            // Oda geçmişini gönder (Son 100 mesaj)
            const roomMessages = db.messages.filter(m => m.room === currentRoom).slice(-100);
            socket.emit('chat history', roomMessages);
            io.emit('user list', Object.values(activeUsers));
        }
    });

    // 2. KAYIT OLMA (REGISTER)
    socket.on('register user', async (data) => {
        const db = readData();
        if (db.users[data.username]) {
            return socket.emit('auth error', 'Bu kullanıcı adı zaten alınmış!');
        }
        try {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            db.users[data.username] = { 
                password: hashedPassword, 
                status: 'online', 
                bio: 'Qore kullanıcısı.', 
                avatar_url: '' 
            };
            writeData(db);
            socket.emit('auth success', { message: 'Kayıt başarılı! Giriş yapabilirsiniz.', username: data.username });
        } catch (err) {
            socket.emit('auth error', 'Kayıt sırasında bir hata oluştu.');
        }
    });

    // 3. GİRİŞ YAPMA (LOGIN)
    socket.on('login user', async (data) => {
        const db = readData();
        if (!db.users[data.username]) {
            return socket.emit('auth error', 'Kullanıcı adı veya şifre hatalı!');
        }
        
        try {
            const match = await bcrypt.compare(data.password, db.users[data.username].password);
            if (match) {
                currentUsername = data.username;
                activeUsers[currentUsername] = {
                    username: currentUsername,
                    status: db.users[currentUsername].status || 'online',
                    bio: db.users[currentUsername].bio || 'Qore kullanıcısı.',
                    avatar_url: db.users[currentUsername].avatar_url || '',
                    socketId: socket.id
                };
                socket.join(currentRoom);
                
                socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
                
                let roomsSet = new Set(["Genel", "Yazılım", "Sohbet"]);
                db.messages.forEach(m => {
                    if (m.room && !m.room.startsWith('DM_')) {
                        roomsSet.add(m.room);
                    }
                });
                io.emit('room list', Array.from(roomsSet));
                
                const roomMessages = db.messages.filter(m => m.room === currentRoom).slice(-100);
                socket.emit('chat history', roomMessages);
                io.emit('user list', Object.values(activeUsers));
            } else {
                socket.emit('auth error', 'Kullanıcı adı veya şifre hatalı!');
            }
        } catch (err) {
            socket.emit('auth error', 'Giriş yapılırken siber hata oluştu.');
        }
    });

    // 4. MESAJ GÖNDERME (CHAT MESSAGE)
    socket.on('chat message', (data) => {
        if (!currentUsername) return;
        const db = readData();
        
        const newMsg = {
            id: Date.now() + Math.floor(Math.random() * 1000), // Benzersiz ID
            room: currentRoom,
            username: currentUsername,
            message: data.message,
            time: data.time,
            reactions: {} // Boş reaksiyon şeması
        };
        
        db.messages.push(newMsg);
        writeData(db);
        
        io.to(currentRoom).emit('chat message', newMsg);
    });

    // 5. ODA DEĞİŞTİRME (SWITCH ROOM)
    socket.on('switch room', (newRoom) => {
        socket.leave(currentRoom);
        currentRoom = newRoom;
        socket.join(currentRoom);
        
        const db = readData();
        const roomMessages = db.messages.filter(m => m.room === currentRoom).slice(-100);
        socket.emit('chat history', roomMessages);
    });

    // 6. GİZLİ ÖZEL MESAJ BAŞLATMA (START DM)
    socket.on('start dm', (targetUser) => {
        if (!currentUsername || !activeUsers[targetUser]) return;
        
        // Çakışmayı önlemek için isimleri alfabetik sıralayıp oda ID'si yapıyoruz
        const dmRoom = [currentUsername, targetUser].sort().join('_');
        const dmRoomName = `DM_${dmRoom}`;
        
        currentRoom = dmRoomName;
        socket.join(currentRoom);
        
        // Karşı taraf aktifse onun soketini de bu özel odaya bağlıyoruz
        const targetSocketId = activeUsers[targetUser].socketId;
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.join(currentRoom);
        }

        const db = readData();
        const dmHistory = db.messages.filter(m => m.room === currentRoom).slice(-100);
        
        socket.emit('dm started', { room: currentRoom, target: targetUser, history: dmHistory });
    });

    // 7. MESAJ SİLME MEKANİĞİ (DELETE MESSAGE)
    socket.on('delete message', (msgId) => {
        if (!currentUsername) return;
        const db = readData();
        
        // Güvenlik kontrolü: Sadece mesajı atan silebilir
        const msgIndex = db.messages.findIndex(m => m.id === msgId);
        if (msgIndex !== -1 && db.messages[msgIndex].username === currentUsername) {
            db.messages.splice(msgIndex, 1);
            writeData(db);
            io.to(currentRoom).emit('message deleted', msgId);
        }
    });

    // 8. TEPKİ / EMOJİ EKLEME MEKANİĞİ (ADD REACTION)
    socket.on('add reaction', (data) => {
        if (!currentUsername) return;
        const db = readData();
        
        const msgIndex = db.messages.findIndex(m => m.id === data.msgId);
        if (msgIndex !== -1) {
            let msg = db.messages[msgIndex];
            if (!msg.reactions) msg.reactions = {};
            if (!msg.reactions[data.emoji]) msg.reactions[data.emoji] = [];
            
            // Eğer kullanıcı bu emojiyi zaten verdiyse kaldır (Toggle mantığı)
            if (msg.reactions[data.emoji].includes(currentUsername)) {
                msg.reactions[data.emoji] = msg.reactions[data.emoji].filter(u => u !== currentUsername);
            } else {
                msg.reactions[data.emoji].push(currentUsername);
            }
            
            // Boş kalan emojileri temizle
            if (msg.reactions[data.emoji].length === 0) {
                delete msg.reactions[data.emoji];
            }
            
            db.messages[msgIndex] = msg;
            writeData(db);
            
            io.to(currentRoom).emit('reaction updated', { msgId: data.msgId, reactions: msg.reactions });
        }
    });

    // 9. PROFİL GÜNCELLEME (UPDATE PROFILE)
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

    // 10. OTURUMU KAPATMA (LOGOUT)
    socket.on('logout user', () => {
        if (currentUsername) {
            delete activeUsers[currentUsername];
            io.emit('user list', Object.values(activeUsers));
            socket.leave(currentRoom);
            currentUsername = "";
            socket.emit('logout success');
        }
    });

    // 11. YAZIYOR... İNDİKATÖRÜ
    socket.on('typing', (isTyping) => {
        socket.to(currentRoom).emit('user typing', { username: currentUsername, isTyping });
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        if (currentUsername) {
            delete activeUsers[currentUsername];
            io.emit('user list', Object.values(activeUsers));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🛡️ Qore Network sunucusu port ${PORT} üzerinde tam kapasite aktif.`));
