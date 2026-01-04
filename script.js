import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCjWmsnTIA8hJDw-rJC5iJhPhwbK-U1_YU",
  authDomain: "ymir-boss-tracker.firebaseapp.com",
  projectId: "ymir-boss-tracker",
  storageBucket: "ymir-boss-tracker.firebasestorage.app",
  messagingSenderId: "302224766558",
  appId: "1:302224766558:web:03ed0efc7473e64aa1a6cf"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MYRK_MIN_MS = 50 * 60 * 1000; // Janela inicia em 50min
const MYRK_MAX_MS = 60 * 60 * 1000; // Janela fecha em 60min
const FIVE_MINUTES_MS = 5 * 1000 * 60;

const BOSS_DATA_STRUCTURE = {
    'Comum': { name: 'Folkvangr Comum', bosses: ["Lancer", "Berserker", "Skald", "Mage"], duration: EIGHT_HOURS_MS },
    'Universal': { name: 'Folkvangr Universal', bosses: ["Lancer", "Berserker", "Skald", "Mage"], duration: TWO_HOURS_MS },
    'Myrk1': { 
        name: 'Myrkheimr Canal 1', 
        bosses: ["[Lv.66] Capitão Intruso Trésá l", "[Lv.67] Capitão Intruso Troll Veterano", "[Lv.68] Capitão Combatente Jotun Truculento", "[Lv.68] Capitão Desordeiro Jotun do Fogo Atroz"], 
        isWindowed: true 
    },
    'Myrk2': { 
        name: 'Myrkheimr Canal 2', 
        bosses: ["[Lv.66] Capitão Intruso Trésá l", "[Lv.67] Capitão Intruso Troll Veterano", "[Lv.68] Capitão Combatente Jotun Truculento", "[Lv.68] Capitão Desordeiro Jotun do Fogo Atroz"], 
        isWindowed: true 
    }
};

let BOSS_DATA = {};
let currentUser = null;
let isCompactView = false;
let userWebhookUrl = "";

document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => signOut(auth);
document.getElementById('save-webhook-btn').onclick = async () => {
    userWebhookUrl = document.getElementById('webhook-url-input').value.trim();
    await save(); alert("Webhook salvo!");
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-controls').style.display = 'block';
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('user-name').textContent = 'Olá, ' + user.displayName;
        document.getElementById('app-content').style.display = 'block';
        loadUserData();
    }
});

function initializeBossData() {
    BOSS_DATA = {};
    for (const key in BOSS_DATA_STRUCTURE) {
        const config = BOSS_DATA_STRUCTURE[key];
        BOSS_DATA[key] = { name: config.name, floors: {} };
        const totalFloors = (key === 'Comum' || key === 'Universal') ? 4 : 1;
        for (let p = 1; p <= totalFloors; p++) {
            const floorKey = totalFloors > 1 ? 'Piso ' + p : 'Área Única';
            BOSS_DATA[key].floors[floorKey] = { name: floorKey, bosses: [] };
            config.bosses.forEach(name => {
                BOSS_DATA[key].floors[floorKey].bosses.push({
                    id: `${key.toLowerCase()}_${p}_${name.replace(/[\[\]\.\s]+/g, '_').toLowerCase()}`,
                    name: name, respawnTime: 0, maxRespawnTime: 0, lastRespawnTime: null, alerted: false,
                    floor: floorKey, isWindowed: config.isWindowed || false, duration: config.duration || 0
                });
            });
        }
    }
}

async function loadUserData() {
    initializeBossData();
    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (docSnap.exists()) {
        const data = docSnap.data();
        (data.timers || []).forEach(s => {
            const b = findBossById(s.id);
            if (b) { b.respawnTime = s.time; b.maxRespawnTime = s.maxTime || 0; b.alerted = s.alerted; }
        });
        userWebhookUrl = data.webhookUrl || "";
        document.getElementById('webhook-url-input').value = userWebhookUrl;
    }
    render();
}

async function save() {
    const list = [];
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                list.push({id: b.id, time: b.respawnTime, maxTime: b.maxRespawnTime, alerted: b.alerted});
            });
        }
    }
    await setDoc(doc(db, "users", currentUser.uid), { timers: list, webhookUrl: userWebhookUrl });
}

function findBossById(id) {
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            const b = BOSS_DATA[t].floors[f].bosses.find(x => x.id === id);
            if (b) return b;
        }
    }
}

window.killBoss = (id) => {
    const b = findBossById(id);
    b.lastRespawnTime = b.respawnTime;
    if (b.isWindowed) {
        b.respawnTime = Date.now() + MYRK_MIN_MS;
        b.maxRespawnTime = Date.now() + MYRK_MAX_MS;
    } else {
        b.respawnTime = Date.now() + b.duration;
    }
    b.alerted = false; save(); render();
};

function updateBossTimers() {
    const now = Date.now();
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(boss => {
                const timerTxt = document.getElementById('timer-' + boss.id), card = document.getElementById('card-' + boss.id);
                if (!timerTxt || !card) return;

                if (boss.respawnTime === 0) {
                    timerTxt.textContent = "DISPONÍVEL!";
                } else if (boss.isWindowed && now >= boss.respawnTime && now < boss.maxRespawnTime) {
                    // JANELA ABERTA
                    const diff = boss.maxRespawnTime - now;
                    card.classList.add('window-open');
                    const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
                    timerTxt.innerHTML = `<span class="window-status">JANELA ABERTA</span>${m}:${s.toString().padStart(2,'0')}`;
                    timerTxt.style.color = "#2ecc71";
                } else if (now >= (boss.isWindowed ? boss.maxRespawnTime : boss.respawnTime)) {
                    boss.respawnTime = 0; boss.maxRespawnTime = 0;
                    card.classList.remove('window-open', 'alert');
                    render();
                } else {
                    const diff = boss.respawnTime - now;
                    const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
                    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0');
                    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                    timerTxt.textContent = `${h}:${m}:${s}`;
                    if (diff <= FIVE_MINUTES_MS && !boss.alerted) {
                        document.getElementById('alert-sound').play(); boss.alerted = true; save();
                    }
                }
            });
        }
    }
}

function render() {
    const container = document.getElementById('boss-list-container'); container.innerHTML = '';
    for (const type in BOSS_DATA) {
        const section = document.createElement('section'); section.className = 'type-section';
        section.innerHTML = `<h2>${BOSS_DATA[type].name}</h2>`;
        for (const f in BOSS_DATA[type].floors) {
            const grid = document.createElement('div'); grid.className = 'boss-grid';
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                grid.innerHTML += `<div class="boss-card" id="card-${boss.id}">
                    <h4>${boss.name}</h4>
                    <div class="timer" id="timer-${boss.id}">DISPONÍVEL!</div>
                    <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                    <div class="action-footer">
                        <button class="reset-btn" onclick="resetBoss('${boss.id}')">Reset</button>
                    </div>
                </div>`;
            });
            section.appendChild(grid);
        }
        container.appendChild(section);
    }
}

setInterval(updateBossTimers, 1000);
