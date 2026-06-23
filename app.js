import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, doc, getDoc, serverTimestamp
} from 'firebase/firestore';

let currentUser    = null;
let userProfile    = null;
let checklistItems = [];

// ── Auth guard ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }

  currentUser = user;

  let snap;
  try {
    snap = await getDoc(doc(db, 'users', user.uid));
  } catch (e) {
    console.error('Error leyendo perfil de Firestore:', e);
    return;
  }

  if (!snap.exists()) {
    console.error('Perfil no encontrado en Firestore para uid:', user.uid);
    await signOut(auth);
    return;
  }

  userProfile = snap.data();
  document.getElementById('user-name').textContent =
    userProfile.displayName || userProfile.username;

  if (userProfile.role === 'admin') {
    document.getElementById('btn-admin').classList.remove('hidden');
  }

  initChecklist();
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
document.getElementById('btn-admin').addEventListener('click', () => {
  window.location.href = 'admin.html';
});

// ── Semana + reloj ────────────────────────────────────────────────────────
function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function getWeekRange(d) {
  const diff = (d.getDay() - 3 + 7) % 7;
  const wed  = new Date(d); wed.setDate(d.getDate() - diff);
  const tue  = new Date(wed); tue.setDate(wed.getDate() + 6);
  const fmt  = x => x.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  return `${fmt(wed)} – ${fmt(tue)}`;
}

const now = new Date();
document.getElementById('semana-badge').textContent = `S–${String(getISOWeek(now)).padStart(2, '0')}`;
document.getElementById('semana-dates').textContent = getWeekRange(now);

const DIAS  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function tick() {
  const n = new Date();
  document.getElementById('clock').textContent = n.toTimeString().slice(0, 5);
  document.getElementById('clock-date').textContent =
    `${DIAS[n.getDay()]} ${n.getDate()} ${MESES[n.getMonth()]}`;
}
tick(); setInterval(tick, 1000);

// ── Checklist desde Firestore ─────────────────────────────────────────────
const CHECK_SVG = `<svg width="13" height="10" viewBox="0 0 13 10" fill="none">
  <path d="M1.5 5L5 8.5L11.5 1.5" stroke="#0d1117" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function initChecklist() {
  const q = query(collection(db, 'checklist_items'), orderBy('orden'));
  onSnapshot(q, snap => {
    checklistItems = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.activo !== false);
    renderChecklist();
  });
}

function renderChecklist() {
  const container = document.getElementById('checklist');

  if (checklistItems.length === 0) {
    container.innerHTML =
      '<div class="empty-msg">No hay ítems en el checklist.<br>El administrador debe agregar algunos.</div>';
    updateProgress();
    return;
  }

  container.innerHTML = checklistItems.map(item => `
    <div class="checklist-item" data-id="${item.id}">
      <div class="ci-check">${CHECK_SVG}</div>
      <div class="ci-body">
        <div class="ci-text">${item.texto}</div>
        <div class="ci-tag">
          ${item.categoria} &nbsp;
          <span class="ci-required ${item.prioridad === 'OBLIGATORIO' ? 'req-ob' : 'req-rec'}">
            ${item.prioridad}
          </span>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.checklist-item').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('done');
      updateProgress();
    });
  });

  resetConfirmBtn();
  updateProgress();
}

function updateProgress() {
  const total = document.querySelectorAll('.checklist-item').length;
  const done  = document.querySelectorAll('.checklist-item.done').length;
  document.getElementById('prog-count').textContent = `${done} / ${total}`;
  document.getElementById('prog-fill').style.width =
    total > 0 ? Math.round(done / total * 100) + '%' : '0%';
}

function resetConfirmBtn() {
  const btn = document.getElementById('btn-confirm');
  btn.classList.remove('error', 'success');
  btn.disabled = false;
  btn.textContent = 'CONFIRMAR TRASPASO';
}

// ── Confirmar traspaso ────────────────────────────────────────────────────
document.getElementById('btn-confirm').addEventListener('click', async () => {
  const pending = document.querySelectorAll('.checklist-item:not(.done)');
  const btn     = document.getElementById('btn-confirm');

  if (pending.length > 0) {
    btn.classList.add('error');
    btn.textContent = `FALTAN ${pending.length} ÍTEM${pending.length > 1 ? 'S' : ''}`;
    pending.forEach(el => {
      el.style.borderColor = 'var(--danger)';
      setTimeout(() => { el.style.borderColor = ''; }, 2500);
    });
    setTimeout(resetConfirmBtn, 2500);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const completados = [...document.querySelectorAll('.checklist-item.done')]
      .map(el => el.dataset.id);

    await addDoc(collection(db, 'confirmaciones'), {
      uid:               currentUser.uid,
      username:          userProfile.username,
      displayName:       userProfile.displayName || userProfile.username,
      timestamp:         serverTimestamp(),
      semana_iso:        getISOWeek(new Date()),
      items_completados: completados.length,
      total_items:       checklistItems.length,
      items_ids:         completados
    });

    btn.classList.add('success');
    btn.textContent = '✓ TRASPASO CONFIRMADO';
  } catch {
    resetConfirmBtn();
    alert('Error al guardar el traspaso. Intenta de nuevo.');
  }
});
