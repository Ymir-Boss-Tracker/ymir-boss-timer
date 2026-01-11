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
const MYRK_MIN_MS = 50 * 60 * 1000;
const MYRK_PATROL_START_MS = 30 * 60 * 1000; 
const PATROL_INTERVAL_MS = 10 * 60 * 1000; 
const MYRK_MAX_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 1000 * 60;
const ONE_MINUTE_MS = 1000 * 60;

const BOSS_NAMES_FOLKVANGR = ["Lancer", "Berserker", "Skald", "Mage"];
const BOSS_NAMES_MYRKHEIMR = [
    "[Lv.66] Capitão Intruso <br>Trésá l",
    "[Lv.67] Capitão Intruso <br>Troll Veterano",
    "[Lv.68] Capitão Combatente <br>Jotun Truculento",
    "[Lv.68] Capitão Desordeiro <br>Jotun do Fogo Atroz"
];

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
document.getElementById('sync-myrk1-btn').onclick = () => sendReportToDiscord('Myrkheimr1');
document.getElementById('sync-myrk2-btn').onclick = () => sendReportToDiscord('Myrkheimr2');
document.getElementById('reset-all-btn').onclick = () => resetAllTimers();

document.getElementById('save-webhook-btn').onclick = async () => {
    const val = document.getElementById('webhook-url-input').value.trim();
    if (!val.startsWith("https://discord.com/api/webhooks/")) return alert("URL Inválida!");
    userWebhookUrl = val; await save(); alert("Salvo!");
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
    BOSS_DATA = { 
        'Comum': { name: 'Folkvangr Comum', floors: {} }, 
        'Universal': { name: 'Folkvangr Universal', floors: {} },
        'Myrkheimr1': { name: 'Myrkheimr Canal 1', floors: {} },
        'Myrkheimr2': { name: 'Myrkheimr Canal 2', floors: {} }
    };

    ['Comum', 'Universal', 'Myrkheimr1', 'Myrkheimr2'].forEach(type => {
        const isMyrk = type.includes('Myrkheimr');
        const totalFloors = isMyrk ? 1 : 4;
        const currentNames = isMyrk ? BOSS_NAMES_MYRKHEIMR : BOSS_NAMES_FOLKVANGR;

        for (let p = 1; p <= totalFloors; p++) {
            const floorKey = isMyrk ? 'Área Única' : 'Piso ' + p;
            BOSS_DATA[type].floors[floorKey] = { name: floorKey, bosses: [] };
            currentNames.forEach(bossName => {
                BOSS_DATA[type].floors[floorKey].bosses.push({
                    id: type.toLowerCase() + '_' + p + '_' + bossName.replace(/[\[\]\s\.<br>]+/g, '_').toLowerCase(),
                    name: bossName, respawnTime: 0, lastRespawnTime: null, alerted: false, 
                    floor: floorKey, type: type, image: BOSS_IMAGES[bossName] || "https://placehold.co/100x100/111/d4af37?text=Boss", notSure: false,
                    history: [], lastPatrolTime: 0
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
        (data.timers || []).forEach(s => {
            const b = findBossById(s.id);
            if (b) { 
                b.respawnTime = s.time; 
                b.alerted = s.alerted; 
                b.notSure = s.notSure || false; 
                b.history = s.history || [];
                b.lastPatrolTime = s.lastPatrolTime || 0;
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
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                list.push({
                    id: b.id, 
                    time: b.respawnTime, 
                    alerted: b.alerted, 
                    notSure: b.notSure,
                    history: b.history || [],
                    lastPatrolTime: b.lastPatrolTime || 0
                });
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
    
    let duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    if (b.type.includes('Myrkheimr')) duration = MYRK_MIN_MS;

    const mStr = b.respawnTime > 0 ? new Date(b.respawnTime - duration).toLocaleTimeString('pt-BR') : "--:--";
    const nStr = b.respawnTime > 0 ? new Date(b.respawnTime).toLocaleTimeString('pt-BR') : "--:--";
    
    const labelMorto = card.querySelector('.label-morto span');
    const labelNasce = card.querySelector('.label-nasce span');
    if(labelMorto) labelMorto.textContent = mStr;
    if(labelNasce) labelNasce.textContent = nStr;
    
    const cb = document.getElementById('not-sure-' + id);
    if(cb) cb.checked = b.notSure;

    updateBossTimers();
}

function updateNextBossHighlight() {
    let allActive = [];
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                if (b.respawnTime > Date.now()) allActive.push({ ...b, typeLabel: BOSS_DATA[t].name });
            });
        }
    }
    const highlightDiv = document.getElementById('next-boss-display');
    if (allActive.length > 0) {
        allActive.sort((a, b) => a.respawnTime - b.respawnTime);
        const next = allActive[0];
        const diff = next.respawnTime - Date.now();
        const h = Math.floor(diff / 3600000).toString().padStart(2,'0'), m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0'), s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
        highlightDiv.setAttribute('onclick', `scrollToBoss('${next.id}')`);
        highlightDiv.innerHTML = `<span>🎯 PRÓXIMO: <strong>${next.name.replace('<br>', ' ')}</strong> <small>(${next.typeLabel})</small></span><span class="next-boss-timer">${h}:${m}:${s}</span>`;
    } else {
        highlightDiv.removeAttribute('onclick'); highlightDiv.innerHTML = "<span>⚔️ Nenhum boss em contagem.</span>";
    }
}

window.toggleNotSure = (id) => { const b = findBossById(id); b.notSure = document.getElementById('not-sure-' + id).checked; save(); };

window.killBoss = (id) => {
    const b = findBossById(id); b.lastRespawnTime = b.respawnTime;
    let duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    const now = Date.now();

    if (b.type.includes('Myrkheimr')) {
        duration = MYRK_MIN_MS;
        if (!b.history) b.history = [];
        b.history.unshift(now);
        if (b.history.length > 3) b.history.pop();
        b.lastPatrolTime = 0; 
    }

    b.respawnTime = now + duration; b.alerted = false;
    save(); updateSingleCardDOM(id);
};

window.setManualTime = (id) => {
    const inputEl = document.getElementById('manual-input-' + id);
    if (!inputEl.value) return alert("Selecione o horário!");
    const b = findBossById(id); b.lastRespawnTime = b.respawnTime;
    const parts = inputEl.value.split(':').map(Number);
    const d = new Date(); d.setHours(parts[0], parts[1], parts[2] || 0, 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    
    let duration = b.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
    if (b.type.includes('Myrkheimr')) {
        duration = MYRK_MIN_MS;
        if (!b.history) b.history = [];
        b.history.unshift(d.getTime());
        if (b.history.length > 3) b.history.pop();
        b.lastPatrolTime = 0;
    }

    b.respawnTime = d.getTime() + duration; b.alerted = false;
    inputEl.value = ""; save(); updateSingleCardDOM(id);
};

window.checkPatrol = (id) => {
    const b = findBossById(id);
    b.lastPatrolTime = Date.now();
    save();
    updateSingleCardDOM(id);
};

window.undoKill = (id) => {
    const b = findBossById(id);
    if (b.lastRespawnTime) { 
        b.respawnTime = b.lastRespawnTime; 
        b.lastRespawnTime = null; 
        b.alerted = false;
        if (b.type.includes('Myrkheimr') && b.history && b.history.length > 0) {
            b.history.shift();
        }
        save(); 
        updateSingleCardDOM(id); 
    }
};

window.resetBoss = (id) => {
    const b = findBossById(id); b.respawnTime = 0; b.alerted = false; b.notSure = false;
    b.history = []; b.lastPatrolTime = 0;
    const cb = document.getElementById('not-sure-' + id); if(cb) cb.checked = false;
    save(); updateSingleCardDOM(id);
};

window.resetAllTimers = async () => {
    if (!confirm("Resetar tudo?")) return;
    for (const t in BOSS_DATA) { 
        for (const f in BOSS_DATA[t].floors) { 
            BOSS_DATA[t].floors[f].bosses.forEach(b => { 
                b.respawnTime = 0; 
                b.notSure = false; 
                b.history = []; 
                b.lastPatrolTime = 0;
            }); 
        } 
    }
    await save(); render();
};

function updateBossTimers() {
    const now = Date.now(); 
    updateNextBossHighlight();

    let allMyrkBosses = [];
    ['Myrkheimr1', 'Myrkheimr2'].forEach(type => {
        for (const f in BOSS_DATA[type].floors) {
            BOSS_DATA[type].floors[f].bosses.forEach(b => { 
                if(b.respawnTime > 0) allMyrkBosses.push(b); 
                const badge = document.getElementById('priority-' + b.id);
                if(badge) badge.textContent = "";
            });
        }
    });

    allMyrkBosses.sort((a, b) => a.respawnTime - b.respawnTime);
    allMyrkBosses.forEach((b, idx) => {
        const badge = document.getElementById('priority-' + b.id);
        if(badge) badge.textContent = (idx + 1) + "º ";
    });

    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(boss => {
                const timerTxt = document.getElementById('timer-' + boss.id), bar = document.getElementById('bar-' + boss.id), card = document.getElementById('card-' + boss.id);
                const patrolBox = card.querySelector('.patrol-timer-box'), patrolBtn = card.querySelector('.patrol-btn');
                if (!timerTxt || !bar || !card) return;

                if (boss.respawnTime === 0) {
                    timerTxt.textContent = "DISPONÍVEL!"; timerTxt.style.color = "#2ecc71";
                    bar.style.width = "100%"; bar.style.backgroundColor = "#2ecc71"; 
                    card.classList.remove('alert', 'fire-alert', 'patrol-alert');
                    if(patrolBox) patrolBox.style.display = 'none';
                    if(patrolBtn) patrolBtn.style.display = 'none';
                    return;
                }

                const isMyrk = boss.type.includes('Myrkheimr');
                const diff = boss.respawnTime - now;

                if (isMyrk) {
                    const deathTime = boss.respawnTime - MYRK_MIN_MS;
                    const timeSinceDeath = now - deathTime;
                    const windowEnd = boss.respawnTime + (MYRK_MAX_MS - MYRK_MIN_MS);

                    if (timeSinceDeath >= MYRK_PATROL_START_MS && now < windowEnd) {
                        card.classList.add('patrol-alert');
                        if(patrolBox) patrolBox.style.display = 'block';
                        if(patrolBtn) patrolBtn.style.display = 'block';

                        const lastPatrol = boss.lastPatrolTime || (deathTime + MYRK_PATROL_START_MS);
                        const nextPatrol = lastPatrol + PATROL_INTERVAL_MS;
                        const patrolDiff = nextPatrol - now;

                        if (patrolDiff > 0) {
                            const pM = Math.floor(patrolDiff / 60000).toString().padStart(2,'0'), pS = Math.floor((patrolDiff % 60000) / 1000).toString().padStart(2,'0');
                            patrolBox.textContent = `PRÓXIMA RONDA EM: ${pM}:${pS}`;
                            patrolBox.style.background = "#f1c40f";
                        } else {
                            patrolBox.textContent = "HORA DA RONDA!";
                            patrolBox.style.background = "#e67e22";
                        }
                    } else {
                        card.classList.remove('patrol-alert');
                        if(patrolBox) patrolBox.style.display = 'none';
                        if(patrolBtn) patrolBtn.style.display = 'none';
                    }

                    if (now >= boss.respawnTime && now <= windowEnd) {
                        timerTxt.textContent = "JANELA!"; timerTxt.style.color = "#e74c3c";
                        bar.style.width = "100%"; bar.style.backgroundColor = "#e74c3c";
                        card.classList.add('fire-alert'); 
                        if (!boss.alerted) { document.getElementById('alert-sound').play().catch(() => {}); boss.alerted = true; save(); }
                    } else if (now > windowEnd) {
                        boss.respawnTime = 0; save();
                    } else {
                        const percent = Math.max(0, Math.min(100, (diff / MYRK_MIN_MS) * 100));
                        bar.style.width = percent + '%'; bar.style.backgroundColor = "#3498db";
                        card.classList.remove('alert', 'fire-alert'); timerTxt.style.color = "#f1c40f"; boss.alerted = false;
                        const h = Math.floor(diff / 3600000).toString().padStart(2,'0'), m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0'), s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                        timerTxt.textContent = `${h}:${m}:${s}`;
                    }
                } else {
                    if (diff <= 0) { boss.respawnTime = 0; } 
                    else {
                        const duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                        updateCountdown(boss, diff, timerTxt, bar, card, duration);
                    }
                }
            });
        }
    }
}

function updateCountdown(boss, diff, timerTxt, bar, card, duration) {
    const percent = Math.max(0, Math.min(100, (diff / duration) * 100));
    bar.style.width = percent + '%'; bar.style.backgroundColor = "#3498db";
    if (diff <= ONE_MINUTE_MS) { card.classList.add('fire-alert'); timerTxt.style.color = "#ff8c00"; bar.style.backgroundColor = "#ff8c00"; } 
    else if (diff <= FIVE_MINUTES_MS) {
        card.classList.add('alert'); timerTxt.style.color = "#ff4d4d"; bar.style.backgroundColor = "#ff4d4d";
        if (!boss.alerted) { document.getElementById('alert-sound').play().catch(() => {}); boss.alerted = true; save(); }
    } else { card.classList.remove('alert', 'fire-alert'); timerTxt.style.color = "#f1c40f"; boss.alerted = false; }
    const h = Math.floor(diff / 3600000).toString().padStart(2,'0'), m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0'), s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
    timerTxt.textContent = `${h}:${m}:${s}`;
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
                let duration = boss.type === 'Universal' ? TWO_HOURS_MS : EIGHT_HOURS_MS;
                if (boss.type.includes('Myrkheimr')) duration = MYRK_MIN_MS;
                const mStr = boss.respawnTime > 0 ? new Date(boss.respawnTime - duration).toLocaleTimeString('pt-BR') : "--:--", nStr = boss.respawnTime > 0 ? new Date(boss.respawnTime).toLocaleTimeString('pt-BR') : "--:--";
                floorHtml += `<div class="boss-card" id="card-${boss.id}">
                    <div class="boss-header">
                        ${!isCompactView ? `<img src="${boss.image}" class="boss-thumb">` : ""}
                        <h4><span class="priority-badge" id="priority-${boss.id}"></span>${boss.name}</h4>
                    </div>
                    <div class="timer" id="timer-${boss.id}">DISPONÍVEL!</div>
                    <div class="patrol-timer-box">PRÓXIMA RONDA EM: 10:00</div>
                    <div class="boss-progress-container"><div class="boss-progress-bar" id="bar-${boss.id}"></div></div>
                    <div class="static-times"><p class="label-morto">Morto: <span>${mStr}</span></p><p class="label-nasce">Nasce: <span>${nStr}</span></p></div>
                    <label class="uncertainty-box"><input type="checkbox" id="not-sure-${boss.id}" ${boss.notSure ? 'checked' : ''} onchange="toggleNotSure('${boss.id}')"> Incerteza</label>
                    <button class="patrol-btn" onclick="checkPatrol('${boss.id}')">📢 Check Ronda OK</button>
                    <button class="kill-btn" onclick="killBoss('${boss.id}')">Derrotado AGORA</button>
                    <div class="manual-box"><input type="time" id="manual-input-${boss.id}" step="1" onkeydown="if(event.key==='Enter') setManualTime('${boss.id}')"><button class="conf-btn" onclick="setManualTime('${boss.id}')">OK</button></div>
                    <div class="action-footer"><button class="undo-btn" onclick="undoKill('${boss.id}')">↩ Desfazer</button><button class="reset-btn" onclick="resetBoss('${boss.id}')">Reset</button></div>
                </div>`;
            });
            floorDiv.innerHTML = floorHtml + '</div>'; grid.appendChild(floorDiv);
        }
        section.appendChild(grid); container.appendChild(section);
    }
}

async function sendReportToDiscord(filterType) {
    if (!userWebhookUrl) return alert("Configure o Webhook!");
    let btnId;
    switch(filterType) {
        case 'Comum': btnId = 'sync-comum-btn'; break;
        case 'Universal': btnId = 'sync-universal-btn'; break;
        case 'Myrkheimr1': btnId = 'sync-myrk1-btn'; break;
        case 'Myrkheimr2': btnId = 'sync-myrk2-btn'; break;
    }
    const btn = document.getElementById(btnId), originalText = btn.textContent;
    btn.textContent = "⌛..."; btn.disabled = true;
    let desc = `**⏳ PRÓXIMOS RESPAWNS (${BOSS_DATA[filterType].name.toUpperCase()})**\n`;
    let bossList = [];
    let globalMyrk = [];
    if(filterType.includes('Myrk')) {
        ['Myrkheimr1', 'Myrkheimr2'].forEach(t => {
            for (const f in BOSS_DATA[t].floors) {
                BOSS_DATA[t].floors[f].bosses.forEach(b => { if(b.respawnTime > 0) globalMyrk.push(b); });
            }
        });
        globalMyrk.sort((a, b) => a.respawnTime - b.respawnTime);
    }
    for (const f in BOSS_DATA[filterType].floors) {
        BOSS_DATA[filterType].floors[f].bosses.forEach(b => { if (b.respawnTime > 0) bossList.push(b); });
    }
    if (bossList.length === 0) {
        desc += "_Nenhum boss em contagem no momento._";
    } else {
        bossList.sort((a, b) => a.respawnTime - b.respawnTime);
        bossList.forEach((b) => {
            const cleanName = b.name.replace(/<br>/g, ' ');
            const timeStr = new Date(b.respawnTime).toLocaleTimeString('pt-BR');
            let uncertaintyStr = b.notSure ? " ⚠️ **(Incerteza)**" : "";
            if (b.type.includes('Myrkheimr')) {
                const globalIndex = globalMyrk.findIndex(gb => gb.id === b.id) + 1;
                const windowEnd = new Date(b.respawnTime + (MYRK_MAX_MS - MYRK_MIN_MS)).toLocaleTimeString('pt-BR');
                desc += `**${globalIndex}º** • **${cleanName}** -> Janela: **${timeStr} às ${windowEnd}**${uncertaintyStr}\n`;
            } else {
                desc += `• **${cleanName}** (${b.floor}) -> **${timeStr}**${uncertaintyStr}\n`;
            }
        });
    }
    try {
        const response = await fetch(userWebhookUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                embeds: [{ title: `⚔️ STATUS ${BOSS_DATA[filterType].name}`, description: desc, color: filterType.includes('Myrk') ? 10181046 : 3066993, timestamp: new Date().toISOString() }] 
            }) 
        });
        btn.textContent = response.ok ? "✅ OK" : "❌ Erro";
    } catch (err) { btn.textContent = "❌ Erro"; }
    finally { setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 3000); }
}

function exportReport() {
    let text = "⚔️ RELATÓRIO DE BOSSES ⚔️\n\n";
    for (const t in BOSS_DATA) {
        for (const f in BOSS_DATA[t].floors) {
            BOSS_DATA[t].floors[f].bosses.forEach(b => {
                const cleanName = b.name.replace(/<br>/g, ' ');
                if (b.respawnTime > 0) {
                    const timeStr = new Date(b.respawnTime).toLocaleTimeString('pt-BR');
                    if (b.type.includes('Myrkheimr')) {
                        const windowEnd = new Date(b.respawnTime + (MYRK_MAX_MS - MYRK_MIN_MS)).toLocaleTimeString('pt-BR');
                        text += `${BOSS_DATA[t].name} - ${cleanName}: JANELA ${timeStr} - ${windowEnd}${b.notSure ? " [INCERTO]" : ""}\n`;
                        if (b.history && b.history.length > 0) text += `   ↳ Histórico (Últimas mortes): ${b.history.map(h => new Date(h).toLocaleTimeString('pt-BR')).join(' | ')}\n`;
                    } else {
                        text += `${BOSS_DATA[t].name} - ${cleanName}: ${timeStr}${b.notSure ? " [INCERTO]" : ""}\n`;
                    }
                }
            });
        }
    }
    const blob = new Blob([text], { type: 'text/plain' }), link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'Relatorio_Ymir.txt'; link.click();
}

setInterval(() => { if(currentUser) updateBossTimers(); }, 1000);
