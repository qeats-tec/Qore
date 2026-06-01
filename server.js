// --- JSONBin Paketsiz Kurulum (Render Karakter Temizlemeli) ---
// Render panelinden gelebilecek gizli tırnak işaretlerini veya boşlukları regex ile temizliyoruz
const JSONBIN_API_KEY = (process.env.JSONBIN_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
const JSONBIN_SECRET = (process.env.JSONBIN_SECRET || '').trim().replace(/^['"]|['"]$/g, '');
const USER_DATA_BIN_ID = (process.env.JSONBIN_ID || '').trim().replace(/^['"]|['"]$/g, '');

// Function to fetch user data from JSONBin (Paketsiz)
async function getUserData() {
    if (!USER_DATA_BIN_ID) {
        console.error('USER_DATA_BIN_ID not set in environment.');
        return { users: [] };
    }
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${USER_DATA_BIN_ID}/latest`, {
            method: 'GET',
            headers: {
                'X-Master-Key': JSONBIN_API_KEY,
                'X-Access-Key': JSONBIN_SECRET || JSONBIN_API_KEY
            }
        });
        if (!response.ok) throw new Error(`JSONBin hatası: ${response.statusText}`);
        const data = await response.json();
        return data.record;
    } catch (error) {
        console.error('Error accessing JSONBin for user data:', error);
        return { users: [] };
    }
}

// Function to save user data to JSONBin (Paketsiz)
async function saveUserData(data) {
    if (!USER_DATA_BIN_ID) {
        console.error('USER_DATA_BIN_ID not set in environment.');
        return;
    }
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${USER_DATA_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`JSONBin kaydetme hatası: ${response.statusText}`);
    } catch (error) {
        console.error('Error saving to JSONBin for user data:', error);
    }
}
