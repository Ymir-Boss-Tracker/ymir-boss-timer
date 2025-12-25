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
document.getElementById('reset-all-btn').onclick = () => resetAllTimers();

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
                    name: bossName, respawnTime: 0, alerted: false, floor: floorKey, type: type
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
            if (b) { b.respawnTime = s.time; b.alerted = s.alerted; }
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
                list.push({id: b.id, time: b.respawnTime, alerted: b.alerted});
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
    b.respawnTime = Date.now() + (id.includes('universal') ? TWO_HOURS_MS : EIGHT_HOURS_MS);
    b.alerted = false;
    save();
};

window.setManualTime = (id) => {
    const val = document.getElementById(`manual-input-${id}`).value;
    if (!val) return alert("Selecione um horário completo (HH:MM:SS)!");
    
    const parts = val.split(':').map(Number);
    const h = parts[0];
    const m = parts[1];
    const s = parts[2] || 0; 
    
    const d = new Date(); 
    d.setHours(h, m, s, 0); 
    
    if (d > new Date()) d.setDate(d.getDate() - 1);
    
    const b = findBossById(id);
    const duration = id.includes('universal') ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    b.respawnTime = d.getTime() + duration;
    b.alerted = false;
    save();
};

window.resetBoss = (id) => {
    const b = findBossById(id);
    b.respawnTime = 0; b.alerted = false;
    save();
};

window.resetAllTimers = async () => {
    if (!confirm("⚠️ ATENÇÃO: Deseja resetar TODOS os timers agora?")) return;
    ['Comum', 'Universal'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                boss.respawnTime = 0;
                boss.alerted = false;
            });
        }
    });
    await save();
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
                    boss.respawnTime = 0;
                    timerTxt.textContent = "DISPONÍVEL!";
                    card.classList.remove('alert');
                } else {
                    const diff = boss.respawnTime - now;
                    if (diff <= FIVE_MINUTES_MS && !boss.alerted) {
                        document.getElementById('alert-sound').play().catch(() => {});
                        boss.alerted = true;
                        save();
                    }
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    timerTxt.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
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
            let floorHtml = `<h3>${f}</h3><div class="boss-grid">`;
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                floorHtml += `
                    <div class="boss-card" id="card-${boss.id}">
                        <h4>${boss.name}</h4>
                        <div class="timer" id="timer-${boss.id}">DISPONÍVEL!</div>
                        <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                        <div class="manual-box">
                            <input type="time" id="manual-input-${boss.id}" step="1">
                            <button class="conf-btn" onclick="setManualTime('${boss.id}')">OK</button>
                        </div>
                        <button class="reset-btn" onclick="resetBoss('${boss.id}')">Resetar</button>
                    </div>`;
            });
            floorHtml += `</div>`;
            floorDiv.innerHTML = floorHtml;
            grid.appendChild(floorDiv);
        }
        section.appendChild(grid);
        container.appendChild(section);
    });
}

// NOVA FUNÇÃO DE EXPORTAÇÃO COM ORDEM CRESCENTE
function exportReport() {
    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR');
    const horaStr = agora.toLocaleTimeString('pt-BR');

    let allBosses = [];

    // 1. Coletar todos os bosses em uma lista plana
    ['Comum', 'Universal'].forEach(type => {
        for (const floorKey in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[floorKey].bosses.forEach(boss => {
                allBosses.push({...boss});
            });
        }
    });

    // 2. Separar bosses com timer e sem timer
    let activeBosses = allBosses.filter(b => b.respawnTime > 0);
    let inactiveBosses = allBosses.filter(b => b.respawnTime === 0);

    // 3. Ordenar os bosses ativos pelo tempo de respawn (crescente)
    activeBosses.sort((a, b) => a.respawnTime - b.respawnTime);

    let text = `=== RELATÓRIO CRONOLÓGICO DE BOSSES - YMIR ===\n`;
    text += `Gerado em: ${dataStr}, ${horaStr}\n`;
    text += `==============================================\n\n`;

    text += `>>> PRÓXIMOS RESPANS (ORDEM CRONOLÓGICA) <<<\n\n`;

    if (activeBosses.length === 0) {
        text += `Nenhum boss com timer ativo no momento.\n`;
    } else {
        activeBosses.forEach(boss => {
            const tempoRespawn = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
            const horaNasce = new Date(boss.respawnTime);
            const horaMorto = new Date(boss.respawnTime - tempoRespawn);
            
            const nasceTxt = horaNasce.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const mortoTxt = horaMorto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const label = `[${boss.type}] ${boss.floor} - ${boss.name}`;
            text += `${label.padEnd(30, ' ')} | Morto: ${mortoTxt} | NASCE: ${nasceTxt}\n`;
        });
    }

    text += `\n==============================================\n`;
    text += `>>> BOSSES SEM INFORMAÇÃO / DISPONÍVEIS <<<\n\n`;

    inactiveBosses.forEach(boss => {
        text += `[${boss.type}] ${boss.floor} - ${boss.name}\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Cronologico_Ymir.txt`;
    link.click();
}

setInterval(() => { if(currentUser) updateBossTimers(); }, 1000);
