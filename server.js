const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB Profil Resmi Desteği
});

// PostgreSQL Bağlantı Havuzu
// Render ortamında DATABASE_URL otomatik gelir. Yerelde test edecekseniz tırnak içine kendi URI'nizi yazabilirsiniz.
const connectionString = process.env.DATABASE_URL || "YOUR_POSTGRESQL_CONNECTION_STRING_HERE";
const pool = new Pool({
    connectionString: connectionString,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Render SSL gereksinimi için
});

// VERİTABANI TABLOLARINI OLUŞTURMA (SİBER ŞEMA mühürleniyor)
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(50) PRIMARY KEY,
                password TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'online',
                bio TEXT DEFAULT 'Qore kullanıcısı.',
                avatar_url TEXT DEFAULT ''
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                room VARCHAR(100) NOT NULL,
                username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
                message TEXT NOT NULL,
                time VARCHAR(10) NOT NULL,
                reactions JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("🛡️ PostgreSQL Siber Tablolar Hazır.");
    } catch (err) {
        console.error("❌ Veritabanı kurulum hatası:", err);
    } finally {
        client.release();
    }
}
initDB();

// Statik Dosyalar (Public klasörü dışarı açılıyor)
app.use(express.static(path.join(__dirname, 'public')));

// PWA Ve Logo Yönlendirmeleri (Kök dizindekiler)
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

const activeUsers = {}; // Anlık çevrimiçi siber kimlikler

io.on('connection', (socket) => {
    let currentUsername = "";
    let currentRoom = "Genel";

    // 1. OTOMATİK GİRİŞ
    socket.on('auto auth', async (data) => {
        try {
            const resUser = await pool.query("SELECT username, status, bio, avatar_url FROM users WHERE username = $1", [data.username]);
            if (resUser.rows.length > 0) {
                const user = resUser.rows[0];
                currentUsername = user.username;
                activeUsers[currentUsername] = {
                    username: currentUsername,
                    status: user.status || 'online',
                    bio: user.bio || 'Qore kullanıcısı.',
                    avatar_url: user.avatar_url || '',
                    socketId: socket.id
                };
                socket.join(currentRoom);
                
                socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
                
                // Odaları getir (Mesaj atılmış tüm benzersiz odalar + Genel)
                const resRooms = await pool.query("SELECT DISTINCT room FROM messages");
                let roomsList = resRooms.rows.map(r => r.room).filter(r => !r.startsWith('DM_'));
                if (!roomsList.includes("Genel")) roomsList.unshift("Genel");
                
                io.emit('room list', roomsList);
                
                // Mesaj geçmişi
                const resMsgs = await pool.query("SELECT id, room, username, message, time, reactions FROM messages WHERE room = $1 ORDER BY id ASC LIMIT 100", [currentRoom]);
                socket.emit('chat history', resMsgs.rows);
                io.emit('user list', Object.values(activeUsers));
            }
        } catch (err) {
            console.error(err);
        }
    });

    // 2. KAYIT OLMA
    socket.on('register user', async (data) => {
        try {
            const checkUser = await pool.query("SELECT username FROM users WHERE username = $1", [data.username]);
            if (checkUser.rows.length > 0) {
                return socket.emit('auth error', 'Bu siber kimlik zaten kayıtlı!');
            }
            const hashedPassword = await bcrypt.hash(data.password, 10);
            await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [data.username, hashedPassword]);
            socket.emit('auth success', { message: 'Kayıt başarılı! Giriş yapabilirsiniz.', username: data.username });
        } catch (err) {
            socket.emit('auth error', 'Kayıt hatası.');
        }
    });

    // 3. GİRİŞ YAPMA
    socket.on('login user', async (data) => {
        try {
            const resUser = await pool.query("SELECT * FROM users WHERE username = $1", [data.username]);
            if (resUser.rows.length === 0) {
                return socket.emit('auth error', 'Kimlik bilgileri geçersiz!');
            }
            const user = resUser.rows[0];
            const match = await bcrypt.compare(data.password, user.password);
            if (match) {
                currentUsername = user.username;
                activeUsers[currentUsername] = {
                    username: currentUsername,
                    status: user.status,
                    bio: user.bio,
                    avatar_url: user.avatar_url,
                    socketId: socket.id
                };
                socket.join(currentRoom);

                socket.emit('login success', { username: currentUsername, userVeri: activeUsers[currentUsername] });
                
                const resRooms = await pool.query("SELECT DISTINCT room FROM messages");
                let roomsList = resRooms.rows.map(r => r.room).filter(r => !r.startsWith('DM_'));
                if (!roomsList.includes("Genel")) roomsList.unshift("Genel");
                
                io.emit('room list', roomsList);
                
                const resMsgs = await pool.query("SELECT id, room, username, message, time, reactions FROM messages WHERE room = $1 ORDER BY id ASC LIMIT 100", [currentRoom]);
                socket.emit('chat history', resMsgs.rows);
                io.emit('user list', Object.values(activeUsers));
            } else {
                socket.emit('auth error', 'Kimlik bilgileri geçersiz!');
            }
        } catch (err) {
            socket.emit('auth error', 'Giriş sırasında siber hata.');
        }
    });

    // 4. MESAJ GÖNDERME
    socket.on('chat message', async (data) => {
        if (!currentUsername) return;
        try {
            const resMsg = await pool.query(
                "INSERT INTO messages (room, username, message, time) VALUES ($1, $2, $3, $4) RETURNING id, room, username, message, time, reactions",
                [currentRoom, currentUsername, data.message, data.time]
            );
            io.to(currentRoom).emit('chat message', resMsg.rows[0]);
        } catch (err) {
            console.error(err);
        }
    });

    // 5. ODA DEĞİŞTİRME
    socket.on('switch room', async (newRoom) => {
        socket.leave(currentRoom);
        currentRoom = newRoom;
        socket.join(currentRoom);
        try {
            const resMsgs = await pool.query("SELECT id, room, username, message, time, reactions FROM messages WHERE room = $1 ORDER BY id ASC LIMIT 100", [currentRoom]);
            socket.emit('chat history', resMsgs.rows);
        } catch (err) {
            console.error(err);
        }
    });

    // 6. DM BAŞLATMA (Özel Mesaj Mekaniği)
    socket.on('start dm', async (targetUser) => {
        if (!currentUsername || !activeUsers[targetUser]) return;
        
        // Benzersiz, sıralı bir DM oda adı üretiyoruz (Alfabetik sıra çakışmayı önler)
        const dmRoom = [currentUsername, targetUser].sort().join('_');
        const dmRoomName = `DM_${dmRoom}`;
        
        currentRoom = dmRoomName;
        socket.join(currentRoom);
        
        // Eğer hedef kullanıcı aktifse onun soketini de bu gizli odaya alıyoruz
        const targetSocketId = activeUsers[targetUser].socketId;
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.join(currentRoom);
        }

        try {
            const resMsgs = await pool.query("SELECT id, room, username, message, time, reactions FROM messages WHERE room = $1 ORDER BY id ASC LIMIT 100", [currentRoom]);
            socket.emit('dm started', { room: currentRoom, target: targetUser, history: resMsgs.rows });
        } catch (err) {
            console.error(err);
        }
    });

    // 7. MESAJ SİLME MEKANİĞİ
    socket.on('delete message', async (msgId) => {
        if (!currentUsername) return;
        try {
            // Güvenlik: Sadece mesajı yazan silebilir
            const check = await pool.query("SELECT username FROM messages WHERE id = $1", [msgId]);
            if (check.rows.length > 0 && check.rows[0].username === currentUsername) {
                await pool.query("DELETE FROM messages WHERE id = $1", [msgId]);
                io.to(currentRoom).emit('message deleted', msgId);
            }
        } catch (err) {
            console.error(err);
        }
    });

    // 8. TEPKİ (REACTION) EKLEME MEKANİĞİ
    socket.on('add reaction', async (data) => {
        if (!currentUsername) return;
        try {
            const resMsg = await pool.query("SELECT reactions FROM messages WHERE id = $1", [data.msgId]);
            if (resMsg.rows.length > 0) {
                let currentReactions = resMsg.rows[0].reactions || {};
                
                if (!currentReactions[data.emoji]) {
                    currentReactions[data.emoji] = [];
                }
                
                // Eğer kullanıcı zaten bu tepkiyi verdiyse geri çeksin (Toggle)
                if (currentReactions[data.emoji].includes(currentUsername)) {
                    currentReactions[data.emoji] = currentReactions[data.emoji].filter(u => u !== currentUsername);
                } else {
                    currentReactions[data.emoji].push(currentUsername);
                }
                
                // Boş kalan emojileri temizle
                if (currentReactions[data.emoji].length === 0) {
                    delete currentReactions[data.emoji];
                }

                await pool.query("UPDATE messages SET reactions = $1 WHERE id = $2", [JSON.stringify(currentReactions), data.msgId]);
                io.to(currentRoom).emit('reaction updated', { msgId: data.msgId, reactions: currentReactions });
            }
        } catch (err) {
            console.error(err);
        }
    });

    // 9. PROFIL GÜNCELLEME
    socket.on('update profile', async (data) => {
        if (!currentUsername) return;
        try {
            await pool.query("UPDATE users SET avatar_url = $1, bio = $2, status = $3 WHERE username = $4", [data.avatar_url, data.bio, data.status, currentUsername]);
            
            if (activeUsers[currentUsername]) {
                activeUsers[currentUsername].avatar_url = data.avatar_url;
                activeUsers[currentUsername].bio = data.bio;
                activeUsers[currentUsername].status = data.status;
            }
            io.emit('user list', Object.values(activeUsers));
        } catch (err) {
            console.error(err);
        }
    });

    // 10. SİSTEMDEN ÇIKIŞ
    socket.on('logout user', () => {
        if (currentUsername) {
            delete activeUsers[currentUsername];
            io.emit('user list', Object.values(activeUsers));
            socket.leave(currentRoom);
            currentUsername = "";
            socket.emit('logout success');
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
