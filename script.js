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
const FIVE_MINUTES_MS = 5 * 1000 * 60;
const ONE_MINUTE_MS = 1000 * 60;

const BOSS_DATA_STRUCTURE = {
    'Comum': { name: 'Folkvangr Comum', bosses: ["Lancer", "Berserker", "Skald", "Mage"], type: 'Normal' },
    'Universal': { name: 'Folkvangr Universal', bosses: ["Lancer", "Berserker", "Skald", "Mage"], type: 'Universal' },
    'Myrk1': { name: 'Myrkheimr Canal 1', bosses: ["Trésá l", "Troll Veterano", "Jotun Truculento", "Jotun do Fogo Atroz"], type: 'Normal' },
    'Myrk2': { name: 'Myrkheimr Canal 2', bosses: ["Trésá l", "Troll Veterano", "Jotun Truculento", "Jotun do Fogo Atroz"], type: 'Normal' }
};

let BOSS_DATA = {};
let currentUser = null;
let isCompactView = false;
let userWebhookUrl = "";

window.scrollToBoss = (id) => {
    const element = document.getElementById('card-' + id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-flash');
        setTimeout(() => element.classList.remove('highlight-flash'), 2000);
    }
};

document.getElementById('toggle-view-btn').onclick = () => {
    isCompactView = !isCompactView;
    document.getElementById('toggle-view-btn').textContent = isCompactView ? "🎴 Modo Cards" : "📱 Modo Compacto";
    render();
};

document.getElementById('login-btn').onclick = () => signInWithPopup(auth, provider);
document.getElementById('logout-btn').onclick = () => signOut(auth);
document.getElementById('export-btn').onclick = () => exportReport();
document.getElementById('sync-comum-btn').onclick = () => sendReportToDiscord('Comum');
document.getElementById('sync-universal-btn').onclick = () => sendReportToDiscord('Universal');
document.getElementById('sync-myrk1-btn').onclick = () => sendReportToDiscord('Myrk1');
document.getElementById('sync-myrk2-btn').onclick = () => sendReportToDiscord('Myrk2');
document.getElementById('reset-all-btn').onclick = () => resetAllTimers();

document.getElementById('save-webhook-btn').onclick = async () => {
    const val = document.getElementById('webhook-url-input').value.trim();
    if (val && !val.startsWith("https://discord.com/api/webhooks/")) return alert("URL Inválida!");
    userWebhookUrl = val; await save(); alert("Webhook salvo!");
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('user-name').textContent = 'Olá, ' + user.displayName;
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
                    id: `${key.toLowerCase()}_${p}_${name.replace(/\s+/g, '_').toLowerCase()}`,
                    name: name, respawnTime: 0, lastRespawnTime: null, alerted: false,
                    floor: floorKey, type: config.type, notSure: false
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
            if (b) { b.respawnTime = s.time; b.alerted = s.alerted; b.notSure = s.notSure || false; }
        });
        userWebhookUrl = data.webhookUrl || "";
        document.getElementById('webhook-url-input').value = userWebhookUrl;
    }
    render();
}

async function save() {
    if (!currentUser) return;
    const list = [];
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                list.push({id: b.id, time: b.respawnTime, alerted: b.alerted, notSure: b.notSure});
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

function updateSingleCardDOM(id) {
    const b = findBossById(id);
    const card = document.getElementById('card-' + id);
    if (!card) return;
    const duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    card.querySelector('.label-morto span').textContent = b.respawnTime > 0 ? new Date(b.respawnTime - duration).toLocaleTimeString('pt-BR') : "--:--";
    card.querySelector('.label-nasce span').textContent = b.respawnTime > 0 ? new Date(b.respawnTime).toLocaleTimeString('pt-BR') : "--:--";
}

window.toggleNotSure = (id) => { const b = findBossById(id); b.notSure = document.getElementById('not-sure-' + id).checked; save(); };

window.killBoss = (id) => {
    const b = findBossById(id); b.lastRespawnTime = b.respawnTime;
    const duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    b.respawnTime = Date.now() + duration; b.alerted = false;
    save(); updateSingleCardDOM(id);
};

window.setManualTime = (id) => {
    const inputEl = document.getElementById('manual-input-' + id);
    if (!inputEl.value) return alert("Selecione o horário!");
    const b = findBossById(id); b.lastRespawnTime = b.respawnTime;
    const parts = inputEl.value.split(':').map(Number);
    const d = new Date(); d.setHours(parts[0], parts[1], parts[2] || 0, 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    const duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    b.respawnTime = d.getTime() + duration; b.alerted = false;
    inputEl.value = ""; save(); updateSingleCardDOM(id);
};

window.undoKill = (id) => {
    const b = findBossById(id);
    if (b.lastRespawnTime !== null) { b.respawnTime = b.lastRespawnTime; b.lastRespawnTime = null; b.alerted = false; save(); updateSingleCardDOM(id); }
};

window.resetBoss = (id) => {
    const b = findBossById(id); b.respawnTime = 0; b.alerted = false; b.notSure = false;
    const cb = document.getElementById('not-sure-' + id); if(cb) cb.checked = false;
    save(); updateSingleCardDOM(id);
};

window.resetAllTimers = async () => {
    if (!confirm("Resetar tudo?")) return;
    for (const t in BOSS_DATA) { for (const f in BOSS_DATA[t].floors) { BOSS_DATA[t].floors[f].bosses.forEach(b => { b.respawnTime = 0; b.notSure = false; }); } }
    await save(); render();
};

function updateBossTimers() {
    const now = Date.now();
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(boss => {
                const timerTxt = document.getElementById('timer-' + boss.id), bar = document.getElementById('bar-' + boss.id), card = document.getElementById('card-' + boss.id);
                if (!timerTxt || !bar || !card) return;
                if (boss.respawnTime === 0 || boss.respawnTime <= now) {
                    boss.respawnTime = 0; timerTxt.textContent = "DISPONÍVEL!"; timerTxt.style.color = "#2ecc71";
                    bar.style.width = "100%"; bar.style.backgroundColor = "#2ecc71"; card.classList.remove('alert', 'fire-alert');
                } else {
                    const duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                    const diff = boss.respawnTime - now, percent = (diff / duration) * 100;
                    bar.style.width = percent + '%';
                    if (diff <= ONE_MINUTE_MS) { card.classList.add('fire-alert'); timerTxt.style.color = "#ff8c00"; }
                    else if (diff <= FIVE_MINUTES_MS) {
                        card.classList.add('alert'); timerTxt.style.color = "#ff4d4d";
                        if (!boss.alerted) { document.getElementById('alert-sound').play().catch(() => {}); boss.alerted = true; save(); }
                    } else { card.classList.remove('alert', 'fire-alert'); timerTxt.style.color = "#f1c40f"; boss.alerted = false; }
                    const h = Math.floor(diff / 3600000).toString().padStart(2,'0'), m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0'), s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                    timerTxt.textContent = `${h}:${m}:${s}`;
                }
            });
        }
    }
}

function render() {
    const container = document.getElementById('boss-list-container'); container.innerHTML = '';
    const viewClass = isCompactView ? 'compact-mode' : '';
    for (const type in BOSS_DATA) {
        const section = document.createElement('section'); section.className = `type-section ${viewClass}`;
        section.innerHTML = `<h2>${BOSS_DATA[type].name}</h2>`;
        const grid = document.createElement('div'); grid.className = 'floors-container';
        for (const f in BOSS_DATA[type].floors) {
            const floorDiv = document.createElement('div'); floorDiv.className = 'floor-section';
            let floorHtml = `<h3>${f}</h3><div class="boss-grid">`;
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                const mStr = boss.respawnTime > 0 ? new Date(boss.respawnTime - duration).toLocaleTimeString('pt-BR') : "--:--", nStr = boss.respawnTime > 0 ? new Date(boss.respawnTime).toLocaleTimeString('pt-BR') : "--:--";
                floorHtml += `<div class="boss-card" id="card-${boss.id}">
                    <h4>${boss.name}</h4>
                    <div class="timer" id="timer-${boss.id}">DISPONÍVEL!</div>
                    <div class="boss-progress-container"><div class="boss-progress-bar" id="bar-${boss.id}"></div></div>
                    <div class="static-times"><p class="label-morto">Morto: <span>${mStr}</span></p><p class="label-nasce">Nasce: <span>${nStr}</span></p></div>
                    <label class="uncertainty-box"><input type="checkbox" id="not-sure-${boss.id}" ${boss.notSure ? 'checked' : ''} onchange="toggleNotSure('${boss.id}')"> Horário Incerto</label>
                    <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                    <div class="manual-box"><input type="time" id="manual-input-${boss.id}" step="1"><button class="conf-btn" onclick="setManualTime('${boss.id}')">OK</button></div>
                    <div class="action-footer"><button class="undo-btn" onclick="undoKill('${boss.id}')">↩ Desfazer</button><button class="reset-btn" onclick="resetBoss('${boss.id}')">Reset</button></div>
                </div>`;
            });
            floorDiv.innerHTML = floorHtml + '</div>'; grid.appendChild(floorDiv);
        }
        section.appendChild(grid); container.appendChild(section);
    }
}

async function sendReportToDiscord(filterType) {
    if (!userWebhookUrl) return alert("Configure o seu Webhook no painel abaixo!");
    const btnId = `sync-${filterType.toLowerCase()}-btn`, btn = document.getElementById(btnId), originalText = btn.textContent;
    btn.textContent = "⌛..."; btn.disabled = true;
    let desc = `**⏳ PRÓXIMOS RESPAWNS (${BOSS_DATA[filterType].name})**\n`;
    for (const f in BOSS_DATA[filterType].floors) {
        BOSS_DATA[filterType].floors[f].bosses.forEach(b => { 
            if (b.respawnTime > 0) desc += `• **${b.name}** (${b.floor}) -> **${new Date(b.respawnTime).toLocaleTimeString('pt-BR')}**${b.notSure ? " ⚠️" : ""}\n`;
        });
    }
    try {
        const response = await fetch(userWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [{ title: `⚔️ STATUS ${filterType.toUpperCase()}`, description: desc, color: 3066993, timestamp: new Date().toISOString() }] }) });
        btn.textContent = response.ok ? "✅ OK" : "❌ Erro";
    } catch (err) { btn.textContent = "❌ Erro"; }
    finally { setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 3000); }
}

function exportReport() {
    let text = "⚔️ RELATÓRIO DE BOSSES ⚔️\n\n";
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                if (b.respawnTime > 0) text += `${BOSS_DATA[t].name} - ${b.name}: ${new Date(b.respawnTime).toLocaleTimeString('pt-BR')}${b.notSure ? " [INCERTO]" : ""}\n`;
            });
        }
    }
    const blob = new Blob([text], { type: 'text/plain' }), link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'Relatorio_Ymir.txt'; link.click();
}

setInterval(() => { if(currentUser) updateBossTimers(); }, 1000);
