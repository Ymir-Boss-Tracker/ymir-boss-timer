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
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const BOSS_NAMES = ["Lancer", "Berserker", "Skald", "Mage"];
let BOSS_DATA = { 'Comum': { name: 'Folkvangr Comum', floors: {} }, 'Universal': { name: 'Folkvangr Universal', floors: {} } };
let currentUser = null;

document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => signOut(auth);
document.getElementById('export-btn').onclick = () => exportReport();

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('user-name').textContent = `Olá, ${user.displayName}`;
        document.getElementById('app-content').style.display = 'block';
        loadUserData();
    } else {
        currentUser = null;
        document.getElementById('login-btn').style.display = 'inline-block';
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('app-content').style.display = 'none';
    }
});

function initializeBossData() {
    ['Comum', 'Universal'].forEach(type => {
        for (let p = 1; p <= 4; p++) {
            const floorKey = `Piso ${p}`;
            BOSS_DATA[type].floors[floorKey] = { name: floorKey, bosses: [] };
            BOSS_NAMES.forEach(bossName => {
                BOSS_DATA[type].floors[floorKey].bosses.push({
                    id: `${type.toLowerCase()}_${p}_${bossName.toLowerCase()}`,
                    name: bossName, respawnTime: 0, alerted: false,
                    lastKilled: "", nextSpawn: "" 
                });
            });
        }
    });
}

async function loadUserData() {
    initializeBossData();
    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (docSnap.exists()) {
        const saved = docSnap.data().timers;
        saved.forEach(s => {
            const b = findBossById(s.id);
            if (b) { 
                b.respawnTime = s.time; 
                b.alerted = s.alerted;
                b.lastKilled = s.lastKilled || ""; 
                b.nextSpawn = s.nextSpawn || "";
            }
        });
    }
    render();
}

async function save() {
    if (!currentUser) return;
    const list = [];
    ['Comum', 'Universal'].forEach(t => {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                list.push({
                    id: b.id, time: b.respawnTime, alerted: b.alerted,
                    lastKilled: b.lastKilled, nextSpawn: b.nextSpawn
                });
            });
        }
    });
    await setDoc(doc(db, "users", currentUser.uid), { timers: list });
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
    const agora = new Date();
    const duration = id.includes('universal') ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    const spawnDate = new Date(agora.getTime() + duration);
    
    b.respawnTime = spawnDate.getTime();
    b.alerted = false;
    b.lastKilled = agora.toLocaleTimeString('pt-BR');
    b.nextSpawn = spawnDate.toLocaleTimeString('pt-BR');
    save();
    render();
};

window.setManualTime = (id) => {
    const input = document.getElementById(`manual-input-${id}`);
    const val = input.value;
    if (!val) return alert("Insira o horário HH:MM:SS");
    
    const parts = val.split(':').map(Number);
    const d = new Date(); 
    d.setHours(parts[0], parts[1], parts[2] || 0, 0); 
    if (d > new Date()) d.setDate(d.getDate() - 1);
    
    const b = findBossById(id);
    const duration = id.includes('universal') ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    const spawnDate = new Date(d.getTime() + duration);

    b.respawnTime = spawnDate.getTime();
    b.alerted = false;
    b.lastKilled = d.toLocaleTimeString('pt-BR');
    b.nextSpawn = spawnDate.toLocaleTimeString('pt-BR');
    
    save();
    input.value = ""; 
    render();
};

window.resetBoss = (id) => {
    const b = findBossById(id);
    b.respawnTime = 0; b.alerted = false;
    b.lastKilled = ""; b.nextSpawn = "";
    const input = document.getElementById(`manual-input-${id}`);
    if (input) input.value = ""; 
    save();
    render();
};

function updateBossTimers() {
    const now = Date.now();
    ['Comum', 'Universal'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const timerTxt = document.getElementById(`timer-${boss.id}`);
                const card = document.getElementById(`card-${boss.id}`);
                if (!timerTxt || !card) return;

                if (boss.respawnTime === 0 || boss.respawnTime <= now) {
                    timerTxt.textContent = "DISPONÍVEL!";
                    card.classList.remove('alert');
                } else {
                    const diff = boss.respawnTime - now;
                    if (diff <= FIVE_MINUTES_MS && !boss.alerted) {
                        document.getElementById('alert-sound').play().catch(() => {});
                        boss.alerted = true;
                        save();
                    }
                    const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
                    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0');
                    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                    timerTxt.textContent = `${h}:${m}:${s}`;
                    card.classList.toggle('alert', diff <= FIVE_MINUTES_MS);
                }
            });
        }
    });
}

function render() {
    const container = document.getElementById('boss-list-container');
    container.innerHTML = '';
    ['Comum', 'Universal'].forEach(type => {
        const section = document.createElement('section');
        section.className = 'type-section';
        section.innerHTML = `<h2>${BOSS_DATA[type].name}</h2>`;
        const grid = document.createElement('div');
        grid.className = 'floors-container';
        for (const f in BOSS_DATA[type].floors) {
            const floorDiv = document.createElement('div');
            floorDiv.className = 'floor-section';
            floorDiv.innerHTML = `<h3>${f}</h3>`;
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const infoMorte = boss.lastKilled ? `<div class="info-line">Morto: ${boss.lastKilled}</div>` : '';
                const infoNasce = boss.nextSpawn ? `<div class="info-line">Nasce: ${boss.nextSpawn}</div>` : '';
                
                floorDiv.innerHTML += `
                    <div class="boss-card" id="card-${boss.id}">
                        <h4>${boss.name}</h4>
                        <div class="timer" id="timer-${boss.id}">DISPONÍVEL!</div>
                        <div class="log-info">
                            ${infoMorte}
                            ${infoNasce}
                        </div>
                        <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                        <div class="manual-box">
                            <input type="time" id="manual-input-${boss.id}" step="1">
                            <button class="conf-btn" onclick="setManualTime('${boss.id}')">OK</button>
                        </div>
                        <button class="reset-btn" onclick="resetBoss('${boss.id}')">Resetar</button>
                    </div>`;
            });
            grid.appendChild(floorDiv);
        }
        section.appendChild(grid);
        container.appendChild(section);
    });
}

function exportReport() {
    const agora = new Date();
    let text = `=== RELATÓRIO DE BOSSES - YMIR ===\nGerado em: ${agora.toLocaleString('pt-BR')}\n==================================\n\n`;
    ['Comum', 'Universal'].forEach(type => {
        text += `>>> ${type.toUpperCase()} <<<\n`;
        for (const f in BOSS_DATA[type].floors) {
            text += `[${f}]\n`;
            BOSS_DATA[type].floors[f].bosses.forEach(b => {
                const nome = b.name.padEnd(10, ' ');
                if (b.lastKilled) {
                    text += `${nome} | Morto: ${b.lastKilled} | Nasce: ${b.nextSpawn}\n`;
                } else {
                    text += `${nome} | DISPONÍVEL\n`;
                }
            });
            text += `\n`;
        }
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Ymir.txt`;
    link.click();
}

setInterval(() => { if(currentUser) updateBossTimers(); }, 1000);
