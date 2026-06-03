const socket = io();

// Siber Renk Hafızası
const savedColor = localStorage.getItem('qore_theme_color') || '#00ff66';
document.documentElement.style.setProperty('--neon-color', savedColor);
document.documentElement.style.setProperty('--neon-glow', savedColor + '33');

// PWA Servis Kaydı
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('🛡️ Qore PWA Motoru Aktif.'))
        .catch((err) => console.log('PWA Hatası:', err));
}

// Element Bağlantıları
const setupContainer = document.getElementById('setup-container');
const mainWrapper = document.getElementById('main-wrapper');
const authSubtitle = document.getElementById('auth-subtitle');
const sidePanel = document.getElementById('side-panel');
const menuToggleBtn = document.getElementById('menu-toggle-btn');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginFormArea = document.getElementById('login-form-area');
const registerFormArea = document.getElementById('register-form-area');

const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');

const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const registerSubmitBtn = document.getElementById('register-submit-btn');

const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messagesDisplay = document.getElementById('messages-display');
const userList = document.getElementById('user-list');
const roomList = document.getElementById('room-list');
const typingIndicator = document.getElementById('typing-indicator');
const currentRoomTitle = document.getElementById('current-room-title');

const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsBio = document.getElementById('settings-bio');
const settingsStatus = document.getElementById('settings-status');
const settingsAvatarFile = document.getElementById('settings-avatar-file');
const avatarPreview = document.getElementById('avatar-preview');
const logoutBtn = document.getElementById('logout-btn');

const userProfileModal = document.getElementById('user-profile-modal');
const viewUserAvatar = document.getElementById('view-user-avatar');
const viewUserName = document.getElementById('view-user-name');
const viewUserStatus = document.getElementById('view-user-status');
const viewUserBio = document.getElementById('view-user-bio');
const closeUserModalBtn = document.getElementById('close-user-modal-btn');
const startDmBtn = document.getElementById('start-dm-btn');

let myUsername = "";
let activeRoom = "Genel"; 
let base64Avatar = ""; 
let selectedProfileUser = ""; 

// Otomatik Oturum Girişi
const savedUsername = localStorage.getItem('qore_username');
if (savedUsername) {
    socket.emit('auto auth', { username: savedUsername });
}

// Mobil Hamburger Menü Aç/Kapat
menuToggleBtn.addEventListener('click', () => {
    sidePanel.classList.toggle('open');
});

// Sekme Geçişleri
tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active'); tabRegister.classList.remove('active');
    loginFormArea.classList.remove('hidden'); registerFormArea.classList.add('hidden');
});
tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active'); tabLogin.classList.remove('active');
    registerFormArea.classList.remove('hidden'); loginFormArea.classList.add('hidden');
});

// Giriş & Kayıt Emirleri
registerSubmitBtn.addEventListener('click', () => {
    const user = registerUsernameInput.value.trim(); const pass = registerPasswordInput.value;
    if (user && pass) socket.emit('register user', { username: user, password: pass });
});
loginSubmitBtn.addEventListener('click', () => {
    const user = loginUsernameInput.value.trim(); const pass = loginPasswordInput.value;
    if (user && pass) socket.emit('login user', { username: user, password: pass });
});
logoutBtn.addEventListener('click', () => socket.emit('logout user'));

// Soket Yanıtları
socket.on('auth success', (data) => {
    alert(data.message); tabLogin.click();
    loginUsernameInput.value = data.username; loginPasswordInput.focus();
});

socket.on('login success', (data) => {
    myUsername = data.username;
    localStorage.setItem('qore_username', data.username);
    base64Avatar = data.userVeri.avatar_url || '';
    avatarPreview.src = base64Avatar || 'https://www.w3schools.com/howto/img_avatar.png';
    settingsBio.value = data.userVeri.bio || 'Qore kullanıcısı.';
    settingsStatus.value = data.userVeri.status || 'online';
    setupContainer.classList.add('hidden'); mainWrapper.classList.remove('hidden');
    messageInput.focus();
});

socket.on('logout success', () => {
    localStorage.removeItem('qore_username'); window.location.reload();
});
socket.on('auth error', (msg) => alert(`❌ HATA: ${msg}`));

// Profil Ayarları Yönetimi
openSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    sidePanel.classList.remove('open'); // Ayarlar açılınca mobilde paneli kapat
});
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
closeUserModalBtn.addEventListener('click', () => userProfileModal.classList.add('hidden'));

settingsAvatarFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) { base64Avatar = event.target.result; avatarPreview.src = base64Avatar; };
        reader.readAsDataURL(file);
    }
});

saveSettingsBtn.addEventListener('click', () => {
    const chosenColor = document.getElementById('settings-theme-color').value;
    localStorage.setItem('qore_theme_color', chosenColor);
    document.documentElement.style.setProperty('--neon-color', chosenColor);
    document.documentElement.style.setProperty('--neon-glow', chosenColor + '33');

    socket.emit('update profile', { avatar_url: base64Avatar, bio: settingsBio.value.trim(), status: settingsStatus.value });
    settingsModal.classList.add('hidden');
});

// Chat Odası İletişimi
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (msg) {
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        socket.emit('chat message', { message: msg, time: timeStr });
        socket.emit('typing', false); messageInput.value = '';
    }
});

messageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => { socket.emit('typing', false); }, 2000);
});

// DM Başlatma Tetikleyicisi
startDmBtn.addEventListener('click', () => {
    if (selectedProfileUser) {
        socket.emit('start dm', selectedProfileUser);
        userProfileModal.classList.add('hidden');
    }
});

socket.on('dm started', (data) => {
    activeRoom = data.room;
    currentRoomTitle.textContent = `🔒 DM // ${data.target}`;
    messagesDisplay.innerHTML = '';
    data.history.forEach(msg => appendMessage(msg));
});

// Odaları Render Etme
socket.on('room list', (rooms) => {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = `# ${room}`;
        if (room === activeRoom) li.classList.add('active');
        li.addEventListener('click', () => {
            activeRoom = room;
            currentRoomTitle.textContent = `Qore // ${room}`;
            socket.emit('switch room', room);
            sidePanel.classList.remove('open'); // Mobilde oda seçince paneli kapat
        });
        roomList.appendChild(li);
    });
});

socket.on('chat history', (messages) => {
    messagesDisplay.innerHTML = '';
    messages.forEach(data => appendMessage(data));
});

socket.on('chat message', (data) => {
    if (data.room === activeRoom) {
        appendMessage(data);
    }
});

// GELİŞMİŞ MESAJ APPEND FONKSİYONU (Silme ve Emojiler)
function appendMessage(data) {
    const isSelf = data.username === myUsername;
    const msgBlock = document.createElement('div');
    msgBlock.id = `msg-${data.id}`;
    msgBlock.classList.add('msg-block', isSelf ? 'self' : 'other');

    let reactionsHtml = `<div class="reactions-shelf">`;
    const emojiler = ['🔥', '👍', '❤️', '💀'];
    emojiler.forEach(emoji => {
        const usersWhoReacted = data.reactions && data.reactions[emoji] ? data.reactions[emoji] : [];
        const count = usersWhoReacted.length;
        const activeClass = usersWhoReacted.includes(myUsername) ? 'active-react' : '';
        reactionsHtml += `<span class="react-badge ${activeClass}" onclick="sendReaction(${data.id}, '${emoji}')">${emoji} <sub>${count}</sub></span>`;
    });
    reactionsHtml += `</div>`;

    const deleteBtnHtml = isSelf ? `<span class="delete-msg-btn" onclick="deleteMessage(${data.id})">🗑️</span>` : '';

    msgBlock.innerHTML = `
        <div class="msg-meta">${escapeHTML(data.username)} • ${data.time} ${deleteBtnHtml}</div>
        <div class="msg-text">${escapeHTML(data.message)}</div>
        ${reactionsHtml}
    `;
    messagesDisplay.appendChild(msgBlock);
    messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
}

window.sendReaction = function(msgId, emoji) {
    socket.emit('add reaction', { msgId, emoji });
};

window.deleteMessage = function(msgId) {
    if(confirm("Bu siber veriyi kalıcı olarak silmek istediğinize emin misiniz?")) {
        socket.emit('delete message', msgId);
    }
};

socket.on('message deleted', (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.remove();
});

socket.on('reaction updated', (data) => {
    const el = document.getElementById(`msg-${data.msgId}`);
    if (!el) return;
    const badges = el.querySelectorAll('.react-badge');
    const emojiler = ['🔥', '👍', '❤️', '💀'];
    emojiler.forEach((emoji, index) => {
        const usersWhoReacted = data.reactions && data.reactions[emoji] ? data.reactions[emoji] : [];
        const count = usersWhoReacted.length;
        badges[index].querySelector('sub').textContent = count;
        if(usersWhoReacted.includes(myUsername)) {
            badges[index].classList.add('active-react');
        } else {
            badges[index].classList.remove('active-react');
        }
    });
});

// Aktif Kullanıcı Listesi
socket.on('user list', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        if(user.username === myUsername) return; // Kendimizi listede görmeyelim
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
            selectedProfileUser = user.username;
            viewUserName.textContent = user.username;
            viewUserAvatar.src = avatarSrc;
            viewUserBio.textContent = user.bio;
            viewUserStatus.className = `status-tag u-status ${user.status}`;
            viewUserStatus.textContent = user.status === 'online' ? 'Çevrimiçi' : user.status === 'idle' ? 'Boşta' : 'Meşgul';
            userProfileModal.classList.remove('hidden');
        });
        userList.appendChild(li);
    });
});

socket.on('user typing', (data) => {
    if (data.isTyping) {
        typingIndicator.textContent = `${data.username} yazıyor...`;
        typingIndicator.classList.remove('hidden');
    } else { typingIndicator.classList.add('hidden'); }
});

function escapeHTML(str) { return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }
