import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, orderBy, getDocs, serverTimestamp, doc, deleteDoc, setDoc, getDoc } from "firebase/firestore";

// Ambil API Key Gemini dari environment variable agar aman di Github
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

let allMaterials = [];
let currentUser = null;

// --- INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    loadMaterials();
    setupAuthListener();
    checkAndTriggerAI(); 
});

// --- EXPORT FUNCTIONS TO WINDOW (Agar bisa dipanggil via onclick HTML) ---
window.filterMaterials = filterMaterials;
window.openDetail = openDetail;
window.closeDetail = () => {
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('public-view').classList.remove('hidden');
};
window.closeArchive = () => {
    document.getElementById('archive-view').classList.add('hidden');
    document.getElementById('public-view').classList.remove('hidden');
};
window.deleteMaterial = async (id) => {
    if(confirm('Hapus materi?')) {
        try {
            await deleteDoc(doc(db, 'materials', id));
            location.reload();
        } catch (e) {
            alert('Gagal menghapus: ' + e.message);
        }
    }
};
window.editMaterial = (id) => {
    // Fitur edit sederhana (bisa dikembangkan lagi)
    alert("Fitur edit ID: " + id + " belum diimplementasikan penuh di versi ini.");
};

// --- AUTHENTICATION LISTENERS ---
function setupAuthListener() {
    onAuthStateChanged(auth, user => {
        currentUser = user;
        const panel = document.getElementById('admin-panel');
        const authSection = document.getElementById('auth-section');

        if (user && user.email.endsWith('@ac.id')) {
            panel.style.display = 'block';
            authSection.innerHTML = `<div class="admin-trigger" id="logout-btn">Keluar (${user.email})</div>`;
            document.getElementById('logout-btn').addEventListener('click', () => {
                signOut(auth).then(()=>location.reload());
            });
        } else {
            panel.style.display = 'none';
            authSection.innerHTML = `<div class="admin-trigger" id="login-modal-trigger"><i class="fa-solid fa-lock"></i> Akses Pengajar</div>`;
            document.getElementById('login-modal-trigger').addEventListener('click', () => {
                document.getElementById('login-modal').classList.add('show');
            });
        }
        renderPage();
    });
}

// --- FORM HANDLERS ---
const loginForm = document.getElementById('login-form');
if(loginForm) {
    loginForm.onsubmit = async e => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
            document.getElementById('login-modal').classList.remove('show');
        } catch (err) { alert("Login Gagal: " + err.message); }
    };
}

const materialForm = document.getElementById('material-form');
if(materialForm) {
    materialForm.onsubmit = async e => {
        e.preventDefault();
        const payload = {
            title: document.getElementById('input-title').value,
            category: document.getElementById('input-category').value,
            topic: document.getElementById('input-topic').value,
            videoUrl: document.getElementById('input-youtube').value,
            imageUrl: document.getElementById('input-image').value,
            content: document.getElementById('editor-area').innerHTML,
            authorEmail: currentUser.email,
            createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'materials'), payload);
        alert("Materi Manual Berhasil Terbit!");
        location.reload();
    };
}

const btnAiManual = document.getElementById('btn-ai-manual');
if(btnAiManual) {
    btnAiManual.onclick = async function() {
        const topicInput = document.getElementById('ai-manual-topic');
        const topic = topicInput.value.trim();
        if (!topic) { alert("Masukkan topik dulu ya, Kak!"); return; }

        this.disabled = true;
        this.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Memerintah Aksa...`;
        
        const statusBox = document.getElementById('ai-status-container');
        statusBox.innerHTML = `<div class="ai-indicator"><i class="fa-solid fa-robot fa-bounce"></i> Menjalankan perintah Kakak: Membedah topik "${topic}"...</div>`;

        await callGeminiAI(topic, false);

        this.disabled = false;
        this.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Terbitkan via Aksa AI`;
        topicInput.value = '';
    };
}

document.getElementById('input-category').onchange = function() { 
    document.getElementById('video-url-group').style.display = this.value === 'Video' ? 'block' : 'none'; 
};

document.getElementById('btn-open-archive').onclick = () => {
    const groups = {};
    allMaterials.filter(m => m.category === 'Artikel').forEach(a => {
        const date = a.createdAt ? new Date(a.createdAt.seconds * 1000) : new Date();
        const key = date.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
    });
    document.getElementById('archive-content').innerHTML = Object.keys(groups).map(k => `
        <div style="margin-bottom:30px;"><h3 style="color:var(--primary); border-bottom:1px solid #ddd;">${k}</h3>
        <div class="featured-grid">${groups[k].map(i => `<div class="featured-card" onclick="openDetail('${i.id}')"><div class="featured-content"><h3>${i.title}</h3></div></div>`).join('')}</div></div>
    `).join('');
    document.getElementById('public-view').classList.add('hidden');
    document.getElementById('archive-view').classList.remove('hidden');
};

document.getElementById('hide-admin-panel').onclick = () => document.getElementById('admin-panel').style.display = 'none';

// --- LOGIC AI & DATA ---

async function checkAndTriggerAI() {
    const statusBox = document.getElementById('ai-status-container');
    const today = new Date().toLocaleDateString('en-CA');
    const now = new Date();
    if (now.getHours() < 9) return; 

    const aiLogRef = doc(db, 'system', 'ai_publish_log');
    const aiLogSnap = await getDoc(aiLogRef);
    if (aiLogSnap.exists() && aiLogSnap.data().lastDate === today) return;

    statusBox.innerHTML = `<div class="ai-indicator"><i class="fa-solid fa-feather fa-bounce"></i> Aksa AI sedang membedah sebuah novel untuk materi pagi ini...</div>`;
    await callGeminiAI("Teknik menulis novel secara umum untuk pemula", true);
    await setDoc(aiLogRef, { lastDate: today });
}

async function callGeminiAI(topic, isDaily = false) {
    const prompt = `Buatlah satu artikel edukatif mendalam tentang teknik menulis NOVEL untuk penulis pemula dengan TOPIK: ${topic}. 
    Struktur Jawaban WAJIB:
    Baris 1: Judul Menarik (Tanpa tanda bintang atau #)
    Baris Berikutnya: Isi materi dalam format HTML (gunakan p, h3, blockquote untuk kutipan novel, ul, li).
    Berikan contoh 'Bedah Kutipan' dari sebuah novel terkenal. Penulis: Aksa AI.`;
    
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: "Anda adalah Aksa, ahli kurasi novel di Cendekia Aksara." }] }
            })
        });
        
        const data = await res.json();
        const result = data.candidates[0].content.parts[0].text;
        const lines = result.split('\n');
        const title = lines[0].replace(/#|\*/g, '').trim();
        const content = lines.slice(1).join('\n');

        await addDoc(collection(db, 'materials'), {
            title, category: 'Artikel', topic: isDaily ? 'Harian AI' : 'Pesanan Khusus', content,
            createdAt: serverTimestamp(), authorEmail: 'aksa-ai@cendekia.aksara',
            imageUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=1000'
        });

        if (!isDaily) alert("Berhasil! Aksa AI baru saja menerbitkan artikel tentang: " + topic);
        loadMaterials();
    } catch (err) {
        console.error("AI Error:", err);
        if (!isDaily) alert("Gagal memanggil Aksa AI.");
    } finally {
        const statusBox = document.getElementById('ai-status-container');
        if(statusBox) statusBox.innerHTML = '';
    }
}

async function loadMaterials() {
    const q = query(collection(db, 'materials'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allMaterials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPage();
}

function renderPage() {
    const articles = allMaterials.filter(m => m.category === 'Artikel').slice(0, 3);
    const container = document.getElementById('featured-container');
    
    if(!container) return;

    container.innerHTML = articles.map(item => `
        <div class="featured-card" onclick="openDetail('${item.id}')">
            ${renderAdminActions(item)}
            <div class="featured-img" style="background-image: url('${item.imageUrl || ''}')">
                ${!item.imageUrl ? '<div class="featured-icon-fallback"><i class="fa-solid fa-feather"></i></div>' : ''}
                <span class="badge">${item.topic || 'Sastra'}</span>
            </div>
            <div class="featured-content">
                <div class="featured-date">${formatDate(item.createdAt)}</div>
                <h3 class="featured-title">${item.title}</h3>
            </div>
        </div>
    `).join('');
    filterMaterials('all');
}

function renderAdminActions(item) {
    if (!currentUser) return '';
    return `<div class="admin-actions">
        <button class="action-btn" style="background:white; color:var(--primary)" onclick="event.stopPropagation(); editMaterial('${item.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="action-btn" style="background:white; color:var(--danger)" onclick="event.stopPropagation(); deleteMaterial('${item.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

function filterMaterials(f) {
    let items = allMaterials.filter(m => m.category !== 'Artikel');
    if (f !== 'all') items = items.filter(m => m.category === f);

    const libContainer = document.getElementById('library-container');
    if(!libContainer) return;

    libContainer.innerHTML = items.map(item => `
        <div class="material-card" onclick="openDetail('${item.id}')">
            ${renderAdminActions(item)}
            <div class="material-thumb">
                ${item.category === 'Video' ? `<img src="https://img.youtube.com/vi/${getYoutubeID(item.videoUrl)}/hqdefault.jpg">` : (item.imageUrl ? `<img src="${item.imageUrl}">` : '<i class="fa-solid fa-book-open" style="font-size:2rem; color:#ccc;"></i>')}
            </div>
            <div class="material-info">
                <div class="material-type">${item.category} • ${item.topic || 'Novel'}</div>
                <h3 class="material-title">${item.title}</h3>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        if(b.innerText.includes(f === 'all' ? 'Semua' : (f === 'Video' ? 'Video' : 'Analisis'))) b.classList.add('active');
    });
}

function openDetail(id) {
    const item = allMaterials.find(m => m.id === id);
    if(!item) return;

    document.getElementById('view-content-rendered').innerHTML = `
        <div style="border-bottom: 2px solid #eee; margin-bottom: 25px; padding-bottom: 15px;">
            <span class="badge" style="position:static; margin-bottom:10px;">${item.topic || 'Materi'}</span>
            <h1 class="detail-title">${item.title}</h1>
            <p style="color:#888; font-size:0.9rem;">Diterbitkan pada ${formatDate(item.createdAt)} • Penulis: ${item.authorEmail}</p>
        </div>
        ${item.category === 'Video' ? `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${getYoutubeID(item.videoUrl)}"></iframe></div>` : ''}
        <div class="detail-content">${item.content}</div>
    `;
    document.getElementById('public-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    window.scrollTo(0,0);
}

function formatDate(ts) { return ts ? new Date(ts.seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Baru saja'; }
function getYoutubeID(u) { const m = u?.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/); return (m && m[2].length === 11) ? m[2] : null; }
