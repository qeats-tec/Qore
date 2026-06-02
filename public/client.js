const socket = io();

// =========================================
// PWA SERVICE WORKER AKTİVASYONU
// =========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('🛡️ Qore PWA Motoru Aktif.'))
        .catch((err) => console.log('PWA Hatası:', err));
}

// KİMLİK DOĞRULAMA ELEMENTLERİ
const setupContainer = document.getElementById('setup-container');
const mainWrapper = document.getElementById('main-wrapper');
const authSubtitle = document.getElementById('auth-subtitle');

// Sekme Butonları
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

// Form Alanları
const loginFormArea = document.getElementById('login-form-area');
const registerFormArea = document.getElementById('register-form-area');

// Inputlar ve Tetikleyiciler
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');

const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const registerSubmitBtn = document.getElementById('register-submit-btn');

// CHAT PANELİ ELEMENTLERİ
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messagesDisplay = document.getElementById('messages-display');
const userList = document.getElementById('user-list');
const roomList = document.getElementById('room-list');
const typingIndicator = document.getElementById('typing-indicator');

const newRoomInput = document.getElementById('new-room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const currentRoomTitle = document.getElementById('current-room-title');

// KENDİ PROFİL MODAL ELEMENTLERİ
const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsBio = document.getElementById('settings-bio');
const settingsStatus = document.getElementById('settings-status');
const settingsAvatarFile = document.getElementById('settings-avatar-file');
const avatarPreview = document.getElementById('avatar-preview');

// BAŞKASININ PROFİL MODAL ELEMENTLERİ
const userProfileModal = document.getElementById('user-profile-modal');
const viewUserAvatar = document.getElementById('view-user-avatar');
const viewUserName = document.getElementById('view-user-name');
const viewUserStatus = document.getElementById('view-user-status');
const viewUserBio = document.getElementById('view-user-bio');
const closeUserModalBtn = document.getElementById('close-user-modal-btn');

let myUsername = "";
let activeRoom = "Genel"; 
let base64Avatar = ""; 

// =========================================
// OTOMATİK OTURUM KORUMA (SAYFA YENİLENİNCE)
// =========================================
const savedUsername = localStorage.getItem('qore_username');
if (savedUsername) {
    socket.emit('auto auth', { username: savedUsername });
}

// =========================================
// ANLIK BİLDİRİM İZNİ
// =========================================
if (Notification.permission === "default") {
    Notification.requestPermission();
}

// GİRİŞ / KAYIT SEKMELERİ ARASI GEÇİŞ MANTIĞI
tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginFormArea.classList.remove('hidden');
    registerFormArea.classList.add('hidden');
    authSubtitle.textContent = "Sisteme erişim sağlamak için kimlik doğrulaması yapın.";
});

tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerFormArea.classList.remove('hidden');
    loginFormArea.classList.add('hidden');
    authSubtitle.textContent = "Yeni bir siber kimlik oluşturun ve veritabanına işleyin.";
});

// SUNUCUYA KAYIT VE GİRİŞ EMİRLERİ
registerSubmitBtn.addEventListener('click', () => {
    const user = registerUsernameInput.value.trim();
    const pass = registerPasswordInput.value;
    if (user && pass) {
        socket.emit('register user', { username: user, password: pass });
    } else {
        alert('Lütfen kullanıcı adı ve şifre alanlarını doldurun.');
    }
});

loginSubmitBtn.addEventListener('click', () => {
    const user = loginUsernameInput.value.trim();
    const pass = loginPasswordInput.value;
    if (user && pass) {
        socket.emit('login user', { username: user, password: pass });
    } else {
        alert('Lütfen kimlik bilgilerinizi eksiksiz girin.');
    }
});

// SOKET DOĞRULAMA CEVAPLARI
socket.on('auth success', (data) => {
    alert(data.message);
    tabLogin.click();
    loginUsernameInput.value = data.username;
    loginPasswordInput.focus();
});

socket.on('login success', (data) => {
    myUsername = data.username;
    
    // İsmi yerel hafızaya kaydet (Sayfa yenilenince düşmesin)
    localStorage.setItem('qore_username', data.username);

    base64Avatar = data.userVeri.avatar_url || '';
    avatarPreview.src = base64Avatar || 'https://www.w3schools.com/howto/img_avatar.png';
    settingsBio.value = data.userVeri.bio || 'Qore kullanıcısı.';
    settingsStatus.value = data.userVeri.status || 'online';

    setupContainer.classList.add('hidden');
    mainWrapper.classList.remove('hidden');
    messageInput.focus();
});

socket.on('auth error', (msg) => {
    alert(`❌ HATA: ${msg}`);
});

// MODALLAR VE PROFIL GÜNCELLEME MANTIĞI
openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
closeUserModalBtn.addEventListener('click', () => userProfileModal.classList.add('hidden'));

settingsAvatarFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.match('image/png') && !file.type.match('image/jpeg')) {
            alert('Lütfen sadece PNG veya JPG formatında bir resim seçin!');
            settingsAvatarFile.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(event) {
            base64Avatar = event.target.result;
            avatarPreview.src = base64Avatar;
        };
        reader.readAsDataURL(file);
    }
});

saveSettingsBtn.addEventListener('click', () => {
    const data = {
        avatar_url: base64Avatar,
        bio: settingsBio.value.trim() || 'Qore kullanıcısı.',
        status: settingsStatus.value
    };
    socket.emit('update profile', data);
    settingsModal.classList.add('hidden');
});

// SOHBET VE ODA FONKSİYONLARI
createRoomBtn.addEventListener('click', () => {
    const rName = newRoomInput.value.trim();
    if (rName) { socket.emit('create room', rName); newRoomInput.value = ''; }
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (msg) {
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        socket.emit('chat message', { username: myUsername, message: msg, time: timeStr });
        socket.emit('typing', false);
        messageInput.value = '';
    }
});

let typingTimeout;
messageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { socket.emit('typing', false); }, 2000);
});

socket.on('room list', (rooms) => {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = `# ${room}`;
        if (room === activeRoom) li.classList.add('active');
        li.addEventListener('click', () => {
            if (room === activeRoom) return;
            activeRoom = room;
            currentRoomTitle.textContent = `Qore // ${room}`;
            socket.emit('switch room', room);
        });
        roomList.appendChild(li);
    });
});

socket.on('chat history', (messages) => {
    messagesDisplay.innerHTML = '';
    messages.forEach(data => appendMessage(data));
});

socket.on('chat message', (data) => {
    appendMessage(data);

    // ANLIK BİLDİRİM MOTORU
    // Mesajı atan biz değilsek ve sayfa arka plandaysa bildirim fırlat
    if (data.username !== myUsername && document.hidden) {
        if (Notification.permission === "granted") {
            const notification = new Notification(`QORE // Yeni Mesaj`, {
                body: `${data.username}: ${data.message}`,
                icon: '/foto.png',
                tag: 'qore-msg'
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
            };
        }
    }
});

function appendMessage(data) {
    const isSelf = data.username === myUsername;
    const msgBlock = document.createElement('div');
    msgBlock.classList.add('msg-block', isSelf ? 'self' : 'other');
    msgBlock.innerHTML = `
        <div class="msg-meta">${escapeHTML(data.username)} • ${data.time}</div>
        <div class="msg-text">${escapeHTML(data.message)}</div>
    `;
    messagesDisplay.appendChild(msgBlock);
    messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
}

socket.on('user list', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        const avatarSrc = user.avatar_url || 'https://www.w3schools.com/howto/img_avatar.png';
        
        li.innerHTML = `
            <div class="u-status ${user.status}"></div>
            <img class="user-avatar" src="${escapeHTML(avatarSrc)}" alt="pp">
            <div class="user-info-wrapper">
                <span class="user-name-text">${escapeHTML(user.username)}</span>
                <span class="user-bio-text">${escapeHTML(user.bio)}</span>
            </div>
        `;

        li.addEventListener('click', () => {
            viewUserName.textContent = user.username;
            viewUserAvatar.src = avatarSrc;
            viewUserBio.textContent = user.bio;
            viewUserStatus.className = `status-tag u-status ${user.status}`;
            viewUserStatus.textContent = user.status === 'online' ? 'Çevrimiçi' : user.status === 'idle' ? 'Boşta' : 'Meşgul';
            viewUserStatus.style.color = '#000'; 
            userProfileModal.classList.remove('hidden');
        });

        userList.appendChild(li);
    });
});

socket.on('user typing', (data) => {
    if (data.isTyping) {
        typingIndicator.textContent = `${data.username} yazıyor...`;
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
});

socket.on('room error', (msg) => alert(msg));
function escapeHTML(str) { return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }
