import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, orderBy, getDocs, serverTimestamp, doc, deleteDoc, setDoc, getDoc } from "firebase/firestore";

// --- KONFIGURASI DAN VARIABEL ---
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
let allMaterials = [];
let currentUser = null;

// --- EVENT LISTENER UTAMA (SAAT WEB DIMUAT) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplikasi dimulai...");
    
    // 1. Load Data
    loadMaterials();
    setupAuthListener();
    checkAndTriggerAI(); 

    // 2. Setup Tombol Filter (Event Listener)
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Hapus kelas active dari semua tombol
            filterBtns.forEach(b => b.classList.remove('active'));
            // Tambah kelas active ke tombol yang diklik
            e.target.classList.add('active');
            // Jalankan filter
            const filterType = e.target.getAttribute('data-filter');
            filterMaterials(filterType);
        });
    });

    // 3. Setup Klik Kartu (Event Delegation)
    document.body.addEventListener('click', (e) => {
        const card = e.target.closest('.featured-card, .material-card');
        if (card && card.dataset.id) {
            if (!e.target.closest('.action-btn')) {
                openDetail(card.dataset.id);
            }
        }
    });

    // 4. Setup Tombol Navigasi Lainnya
    const refreshBtn = document.getElementById('logo-refresh');
    if(refreshBtn) refreshBtn.addEventListener('click', () => location.reload());
    
    const closeDetailBtn = document.getElementById('btn-close-detail');
    if(closeDetailBtn) closeDetailBtn.addEventListener('click', () => {
        document.getElementById('detail-view').classList.add('hidden');
        document.getElementById('public-view').classList.remove('hidden');
        window.scrollTo(0,0);
    });

    const closeArchiveBtn = document.getElementById('btn-close-archive');
    if(closeArchiveBtn) closeArchiveBtn.addEventListener('click', () => {
        document.getElementById('archive-view').classList.add('hidden');
        document.getElementById('public-view').classList.remove('hidden');
    });

    const hideAdminBtn = document.getElementById('hide-admin-panel');
    if(hideAdminBtn) hideAdminBtn.addEventListener('click', () => {
        document.getElementById('admin-panel').style.display = 'none';
    });

    const openArchiveBtn = document.getElementById('btn-open-archive');
    if(openArchiveBtn) openArchiveBtn.addEventListener('click', openArchive);
});

// --- FUNGSI LOGIKA UTAMA ---

async function loadMaterials() {
    console.log("Mengambil data dari Firebase...");
    try {
        const q = query(collection(db, 'materials'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            console.log("Tidak ada data ditemukan di database.");
            allMaterials = [];
        } else {
            allMaterials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log(`Berhasil memuat ${allMaterials.length} materi.`);
        }
        
        renderPage();
    } catch (e) {
        console.error("Gagal memuat data (Error Kritis):", e);
        // Tampilkan pesan error di layar agar user tahu
        const errorMsg = `<div style="text-align:center; padding: 40px; color: var(--danger);">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 10px;"></i><br>
            Gagal memuat data.<br>
            <small>Cek koneksi internet atau konfigurasi API Key di .env</small><br>
            <small style="color:#999;">Error: ${e.message}</small>
        </div>`;
        
        const featContainer = document.getElementById('featured-container');
        if(featContainer) featContainer.innerHTML = errorMsg;
        
        const libContainer = document.getElementById('library-container');
        if(libContainer) libContainer.innerHTML = errorMsg;
    }
}

function renderPage() {
    const articles = allMaterials.filter(m => m.category === 'Artikel').slice(0, 3);
    const container = document.getElementById('featured-container');
    
    if(!container) return;

    // CEK: Jika tidak ada artikel, tampilkan pesan kosong, JANGAN biarkan kosong/freeze
    if (articles.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-light); background: #fff; border-radius: 12px; border: 1px dashed #ccc;">
                <i class="fa-regular fa-folder-open" style="font-size: 2rem; margin-bottom: 10px;"></i><br>
                Belum ada kabar terbaru hari ini.
            </div>
        `;
    } else {
        container.innerHTML = articles.map(item => `
            <div class="featured-card" data-id="${item.id}">
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
    }
    
    // Default filter
    filterMaterials('all');
}

function filterMaterials(f) {
    let items = allMaterials.filter(m => m.category !== 'Artikel');
    if (f !== 'all') items = items.filter(m => m.category === f);

    const libContainer = document.getElementById('library-container');
    if(!libContainer) return;

    if (items.length === 0) {
        libContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-light);">
                Tidak ada materi untuk kategori ini.
            </div>
        `;
        return;
    }

    libContainer.innerHTML = items.map(item => `
        <div class="material-card" data-id="${item.id}">
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

function openArchive() {
    const groups = {};
    allMaterials.filter(m => m.category === 'Artikel').forEach(a => {
        const date = a.createdAt ? new Date(a.createdAt.seconds * 1000) : new Date();
        const key = date.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
    });
    
    const archiveContent = document.getElementById('archive-content');
    if (Object.keys(groups).length === 0) {
        archiveContent.innerHTML = '<p style="text-align:center; color:#666;">Belum ada arsip artikel.</p>';
    } else {
        archiveContent.innerHTML = Object.keys(groups).map(k => `
            <div style="margin-bottom:30px;"><h3 style="color:var(--primary); border-bottom:1px solid #ddd;">${k}</h3>
            <div class="featured-grid">${groups[k].map(i => `
                <div class="featured-card" data-id="${i.id}">
                    <div class="featured-content"><h3>${i.title}</h3></div>
                </div>`).join('')}
            </div></div>
        `).join('');
    }
    
    document.getElementById('public-view').classList.add('hidden');
    document.getElementById('archive-view').classList.remove('hidden');
}

// --- FUNGSI ADMIN & TOMBOL ---

function renderAdminActions(item) {
    if (!currentUser) return '';
    // Tambahkan class khusus untuk tombol delete/edit
    return `<div class="admin-actions">
        <button class="action-btn btn-edit" style="background:white; color:var(--primary)"><i class="fa-solid fa-pen"></i></button>
        <button class="action-btn btn-delete" style="background:white; color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

// Logic untuk menangani klik tombol edit/delete
document.body.addEventListener('click', async (e) => {
    // Handle Delete
    if (e.target.closest('.btn-delete')) {
        const card = e.target.closest('.featured-card, .material-card');
        const id = card.dataset.id;
        if(confirm('Hapus materi ini?')) {
            try {
                await deleteDoc(doc(db, 'materials', id));
                location.reload();
            } catch (err) { alert(err.message); }
        }
    }
    // Handle Edit (Placeholder)
    if (e.target.closest('.btn-edit')) {
        const card = e.target.closest('.featured-card, .material-card');
        alert("Edit ID: " + card.dataset.id + " (Fitur edit akan segera hadir)");
    }
});

// --- AUTHENTICATION ---
function setupAuthListener() {
    onAuthStateChanged(auth, user => {
        currentUser = user;
        const panel = document.getElementById('admin-panel');
        const authSection = document.getElementById('auth-section');

        if (user && user.email.endsWith('@ac.id')) {
            panel.style.display = 'block';
            authSection.innerHTML = `<div class="admin-trigger" id="logout-btn">Keluar (${user.email})</div>`;
            const logoutBtn = document.getElementById('logout-btn');
            if(logoutBtn) logoutBtn.addEventListener('click', () => {
                signOut(auth).then(()=>location.reload());
            });
        } else {
            panel.style.display = 'none';
            authSection.innerHTML = `<div class="admin-trigger" id="login-modal-trigger"><i class="fa-solid fa-lock"></i> Akses Pengajar</div>`;
            const loginTrigger = document.getElementById('login-modal-trigger');
            if(loginTrigger) loginTrigger.addEventListener('click', () => {
                document.getElementById('login-modal').classList.add('show');
            });
        }
        // Re-render page to show admin buttons
        if(allMaterials.length > 0) renderPage();
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

const catInput = document.getElementById('input-category');
if(catInput) {
    catInput.onchange = function() { 
        document.getElementById('video-url-group').style.display = this.value === 'Video' ? 'block' : 'none'; 
    };
}

// --- LOGIC AI ---

async function checkAndTriggerAI() {
    const statusBox = document.getElementById('ai-status-container');
    const today = new Date().toLocaleDateString('en-CA');
    const now = new Date();
    // if (now.getHours() < 9) return; // Komentari ini dulu untuk test

    try {
        const aiLogRef = doc(db, 'system', 'ai_publish_log');
        const aiLogSnap = await getDoc(aiLogRef);
        if (aiLogSnap.exists() && aiLogSnap.data().lastDate === today) return;

        // Cek jika API Key ada
        if (!GEMINI_API_KEY) {
            console.warn("AI Daily Skip: API Key tidak ditemukan.");
            return;
        }

        statusBox.innerHTML = `<div class="ai-indicator"><i class="fa-solid fa-feather fa-bounce"></i> Aksa AI sedang membedah sebuah novel untuk materi pagi ini...</div>`;
        await callGeminiAI("Teknik menulis novel secara umum untuk pemula", true);
        await setDoc(aiLogRef, { lastDate: today });
    } catch (e) {
        console.log("Sistem AI harian: ", e.message);
    }
}

async function callGeminiAI(topic, isDaily = false) {
    if(!GEMINI_API_KEY) {
        alert("API Key AI belum disetting di .env!");
        return;
    }

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
        if (!isDaily) alert("Gagal memanggil Aksa AI: " + err.message);
    } finally {
        const statusBox = document.getElementById('ai-status-container');
        if(statusBox) statusBox.innerHTML = '';
    }
}

function formatDate(ts) { return ts ? new Date(ts.seconds * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Baru saja'; }
function getYoutubeID(u) { const m = u?.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/); return (m && m[2].length === 11) ? m[2] : null; }
