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

const BOSS_IMAGES = {
    "Berserker": "https://gcdn.wemade.games/prod/lygl/official/api/upload/newsRelease/1762757175011-95b45f9b-463c-4e00-ae29-ea0016f20ba5.jpg",
    "Mage": "https://gcdn.wemade.games/prod/lygl/official/api/upload/newsRelease/1763969733136-719e6516-79a9-49e6-a2e8-6861adb04d3a.jpg",
    "Skald": "https://gcdn.wemade.games/prod/lygl/official/api/upload/newsRelease/1763363391089-56e517dd-bee0-4800-abac-c20e7842ef40.jpg",
    "Lancer": "https://gcdn.wemade.games/prod/lygl/official/api/upload/newsRelease/1764576949332-e37b5d55-84e8-4a2e-848d-36fe090aa086.jpg" 
};

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 1000 * 60;
const ONE_MINUTE_MS = 1000 * 60;
const BOSS_NAMES = ["Lancer", "Berserker", "Skald", "Mage"];
let BOSS_DATA = { 'Comum': { name: 'Folkvangr Comum', floors: {} }, 'Universal': { name: 'Folkvangr Universal', floors: {} } };
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
document.getElementById('reset-all-btn').onclick = () => resetAllTimers();

document.getElementById('save-webhook-btn').onclick = async () => {
    const val = document.getElementById('webhook-url-input').value.trim();
    if (!val.startsWith("https://discord.com/api/webhooks/")) {
        return alert("Por favor, insira uma URL de Webhook válida do Discord!");
    }
    userWebhookUrl = val;
    await save();
    alert("Webhook salvo com sucesso!");
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
    BOSS_DATA = { 'Comum': { name: 'Folkvangr Comum', floors: {} }, 'Universal': { name: 'Folkvangr Universal', floors: {} } };
    ['Comum', 'Universal'].forEach(type => {
        for (let p = 1; p <= 4; p++) {
            const floorKey = 'Piso ' + p;
            BOSS_DATA[type].floors[floorKey] = { name: floorKey, bosses: [] };
            BOSS_NAMES.forEach(bossName => {
                BOSS_DATA[type].floors[floorKey].bosses.push({
                    id: type.toLowerCase() + '_' + p + '_' + bossName.toLowerCase(),
                    name: bossName, respawnTime: 0, lastRespawnTime: null, alerted: false, floor: floorKey, type: type,
                    image: BOSS_IMAGES[bossName], notSure: false
                });
            });
        }
    });
}

async function loadUserData() {
    initializeBossData();
    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (docSnap.exists()) {
        const data = docSnap.data();
        const saved = data.timers || [];
        saved.forEach(s => {
            const b = findBossById(s.id);
            if (b) { 
                b.respawnTime = s.time; 
                b.alerted = s.alerted;
                b.notSure = s.notSure || false;
            }
        });
        if (data.webhookUrl) {
            userWebhookUrl = data.webhookUrl;
            document.getElementById('webhook-url-input').value = userWebhookUrl;
        }
    }
    render();
}

async function save() {
    if (!currentUser) return;
    const list = [];
    ['Comum', 'Universal'].forEach(t => {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                list.push({id: b.id, time: b.respawnTime, alerted: b.alerted, notSure: b.notSure});
            });
        }
    });
    await setDoc(doc(db, "users", currentUser.uid), { 
        timers: list,
        webhookUrl: userWebhookUrl 
    });
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
    const mStr = b.respawnTime > 0 ? new Date(b.respawnTime - duration).toLocaleTimeString('pt-BR') : "--:--";
    const nStr = b.respawnTime > 0 ? new Date(b.respawnTime).toLocaleTimeString('pt-BR') : "--:--";
    const mortoSpan = card.querySelector('.label-morto span');
    const nasceSpan = card.querySelector('.label-nasce span');
    if (mortoSpan) mortoSpan.textContent = mStr;
    if (nasceSpan) nasceSpan.textContent = nStr;
}

function updateNextBossHighlight() {
    let allActive = [];
    ['Comum', 'Universal'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(b => {
                if (b.respawnTime > Date.now()) allActive.push({ ...b, typeLabel: type });
            });
        }
    });
    const highlightDiv = document.getElementById('next-boss-display');
    if (allActive.length > 0) {
        allActive.sort((a, b) => a.respawnTime - b.respawnTime);
        const next = allActive[0];
        const diff = next.respawnTime - Date.now();
        const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
        highlightDiv.setAttribute('onclick', `scrollToBoss('${next.id}')`);
        highlightDiv.innerHTML = `<div class="next-boss-info">
            <span>🎯 PRÓXIMO: <strong>${next.name}</strong> <small>(${next.typeLabel} - ${next.floor})</small></span>
            <span class="next-boss-timer">${h}:${m}:${s}</span>
            <small style="color: #d4af37; display:block; margin-top:5px;">(Clique para localizar)</small>
        </div>`;
    } else {
        highlightDiv.removeAttribute('onclick');
        highlightDiv.innerHTML = "<span>⚔️ Nenhum boss em contagem no momento.</span>";
    }
}

window.toggleNotSure = (id) => {
    const b = findBossById(id);
    b.notSure = document.getElementById('not-sure-' + id).checked;
    save();
};

window.undoKill = (id) => {
    const b = findBossById(id);
    if (b.lastRespawnTime !== null) {
        b.respawnTime = b.lastRespawnTime; b.lastRespawnTime = null; b.alerted = false;
        save(); updateSingleCardDOM(id);
    } else { alert("Nada para desfazer!"); }
};

window.killBoss = (id) => {
    const b = findBossById(id);
    b.lastRespawnTime = b.respawnTime;
    const duration = id.includes('universal') ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    b.respawnTime = Date.now() + duration;
    b.alerted = false;
    save(); updateSingleCardDOM(id);
};

window.setManualTime = (id) => {
    const inputEl = document.getElementById('manual-input-' + id);
    const val = inputEl.value;
    if (!val) return alert("Selecione o horário!");
    const b = findBossById(id);
    b.lastRespawnTime = b.respawnTime;
    const parts = val.split(':').map(Number);
    const d = new Date(); d.setHours(parts[0], parts[1], parts[2] || 0, 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    const duration = id.includes('universal') ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    b.respawnTime = d.getTime() + duration;
    b.alerted = false;
    inputEl.value = "";
    save(); updateSingleCardDOM(id);
};

window.resetBoss = (id) => {
    const b = findBossById(id);
    b.respawnTime = 0; b.alerted = false; b.lastRespawnTime = null; b.notSure = false;
    const cb = document.getElementById('not-sure-' + id);
    if(cb) cb.checked = false;
    save(); updateSingleCardDOM(id);
};

window.resetAllTimers = async () => {
    if (!confirm("Resetar tudo?")) return;
    ['Comum', 'Universal'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(boss => { 
                boss.respawnTime = 0; boss.alerted = false; boss.notSure = false; 
            });
        }
    });
    await save(); render();
};

function updateBossTimers() {
    const now = Date.now();
    updateNextBossHighlight();
    ['Comum', 'Universal'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const timerTxt = document.getElementById('timer-' + boss.id);
                const bar = document.getElementById('bar-' + boss.id);
                const card = document.getElementById('card-' + boss.id);
                if (!timerTxt || !bar || !card) return;
                if (boss.respawnTime === 0 || boss.respawnTime <= now) {
                    boss.respawnTime = 0; timerTxt.textContent = "DISPONÍVEL!"; timerTxt.style.color = "#2ecc71";
                    bar.style.width = "100%"; bar.style.backgroundColor = "#2ecc71";
                    card.classList.remove('alert', 'fire-alert');
                } else {
                    const duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                    const diff = boss.respawnTime - now;
                    const percent = (diff / duration) * 100;
                    bar.style.width = percent + '%';
                    if (diff <= ONE_MINUTE_MS) {
                        card.classList.add('fire-alert'); card.classList.remove('alert');
                        timerTxt.style.color = "#ff8c00"; bar.style.backgroundColor = "#ff4500";
                    } else if (diff <= FIVE_MINUTES_MS) {
                        timerTxt.style.color = "#ff4d4d"; bar.style.backgroundColor = "#ff4d4d";
                        card.classList.add('alert'); card.classList.remove('fire-alert');
                        if (!boss.alerted) { document.getElementById('alert-sound').play().catch(() => {}); boss.alerted = true; save(); }
                    } else {
                        timerTxt.style.color = "#f1c40f"; bar.style.backgroundColor = "#f1c40f";
                        card.classList.remove('alert', 'fire-alert'); boss.alerted = false;
                    }
                    const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
                    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0');
                    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                    timerTxt.textContent = `${h}:${m}:${s}`;
                }
            });
        }
    });
}

function render() {
    const container = document.getElementById('boss-list-container');
    container.innerHTML = '';
    const viewClass = isCompactView ? 'compact-mode' : '';
    ['Comum', 'Universal'].forEach(type => {
        const section = document.createElement('section');
        section.className = `type-section ${viewClass}`;
        section.innerHTML = `<h2>${BOSS_DATA[type].name}</h2>`;
        const grid = document.createElement('div');
        grid.className = 'floors-container';
        for (const f in BOSS_DATA[type].floors) {
            const floorDiv = document.createElement('div');
            floorDiv.className = 'floor-section';
            let floorHtml = `<h3>${f}</h3><div class="boss-grid">`;
            BOSS_DATA[type].floors[f].bosses.forEach(boss => {
                const duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                const mStr = boss.respawnTime > 0 ? new Date(boss.respawnTime - duration).toLocaleTimeString('pt-BR') : "--:--";
                const nStr = boss.respawnTime > 0 ? new Date(boss.respawnTime).toLocaleTimeString('pt-BR') : "--:--";
                const bossImgHtml = !isCompactView ? `<div class="thumb-container"><img src="${boss.image}" class="boss-thumb" alt="${boss.name}"></div>` : "";
                floorHtml += `<div class="boss-card" id="card-${boss.id}">
                        <div class="boss-header">${bossImgHtml}<h4>${boss.name}</h4></div>
                        <div class="timer" id="timer-${boss.id}">DISPONÍVEL!</div>
                        <div class="boss-progress-container"><div class="boss-progress-bar" id="bar-${boss.id}"></div></div>
                        <div class="static-times">
                            <p class="label-morto">Morto: <span>${mStr}</span></p>
                            <p class="label-nasce">Nasce: <span>${nStr}</span></p>
                        </div>
                        <label class="uncertainty-box">
                            <input type="checkbox" id="not-sure-${boss.id}" ${boss.notSure ? 'checked' : ''} onchange="toggleNotSure('${boss.id}')">
                            Não tenho certeza do time
                        </label>
                        <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                        <div class="manual-box">
                            <input type="time" id="manual-input-${boss.id}" step="1" onkeydown="if(event.key==='Enter') setManualTime('${boss.id}')">
                            <button class="conf-btn" onclick="setManualTime('${boss.id}')">OK</button>
                        </div>
                        <div class="action-footer">
                            <button class="undo-btn" onclick="undoKill('${boss.id}')">↩ Desfazer</button>
                            <button class="reset-btn" onclick="resetBoss('${boss.id}')">Resetar</button>
                        </div>
                    </div>`;
            });
            floorDiv.innerHTML = floorHtml + '</div>';
            grid.appendChild(floorDiv);
        }
        section.appendChild(grid); container.appendChild(section);
    });
}

async function sendReportToDiscord(filterType) {
    if (!userWebhookUrl) return alert("Configure seu Webhook do Discord primeiro!");
    const btnId = filterType === 'Comum' ? 'sync-comum-btn' : 'sync-universal-btn';
    const btn = document.getElementById(btnId);
    const originalText = btn.textContent;
    btn.textContent = "⌛..."; btn.disabled = true;
    let filtered = [];
    for (const f in BOSS_DATA[filterType].floors) {
        BOSS_DATA[filterType].floors[f].bosses.forEach(b => { filtered.push({ ...b, typeLabel: filterType }); });
    }
    const active = filtered.filter(b => b.respawnTime > 0).sort((a, b) => a.respawnTime - b.respawnTime);
    let desc = `**⏳ PRÓXIMOS RESPAWNS (${filterType.toUpperCase()})**\n`;
    if (active.length > 0) {
        active.forEach(b => { 
            const note = b.notSure ? " ⚠️ *Não tenho certeza*" : "";
            desc += `• **${b.name}** (${b.floor}) -> **${new Date(b.respawnTime).toLocaleTimeString('pt-BR')}**${note}\n`; 
        });
    } else { desc += "Nenhum no momento.\n"; }
    const payload = {
        embeds: [{
            title: `⚔️ STATUS ${filterType.toUpperCase()} - LEGEND OF YMIR`,
            description: desc.substring(0, 4000),
            color: filterType === 'Comum' ? 3066993 : 5814783,
            footer: { text: 'Enviado por: ' + (currentUser ? currentUser.displayName : 'Sistema') },
            timestamp: new Date().toISOString()
        }]
    };
    try {
        const response = await fetch(userWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        btn.textContent = response.ok ? "✅ Sincronizado!" : "❌ Erro";
    } catch (err) { btn.textContent = "❌ Erro"; }
    finally { setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 3000); }
}

function exportReport() {
    let allBosses = [];
    ['Comum', 'Universal'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(b => { allBosses.push({ ...b, typeLabel: type }); });
        }
    });
    const active = allBosses.filter(b => b.respawnTime > 0).sort((a, b) => a.respawnTime - b.respawnTime);
    let text = "⚔️ RELATÓRIO DE BOSSES - YMIR ⚔️\n\n⏳ PRÓXIMOS RESPAWNS:\n" + 
        active.map(b => {
            const note = b.notSure ? " [Não tenho certeza]" : "";
            return `${b.typeLabel} - ${b.floor} - ${b.name}: ${new Date(b.respawnTime).toLocaleTimeString('pt-BR')}${note}`;
        }).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Relatorio_Ymir.txt';
    link.click();
}

setInterval(() => { if(currentUser) updateBossTimers(); }, 1000);
