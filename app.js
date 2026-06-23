import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, updateDoc, doc, getDoc, serverTimestamp
} from 'firebase/firestore';

let currentUser    = null;
let userProfile    = null;
let checklistItems = [];
let personalItems  = [];

// contadores de comentarios por ítem { itemId: count }
let commentCounts  = {};
// unsuscribers activos de comentarios
let comentariosUnsub = null;

// estado modal comentarios
let activeItemId   = null;
let activeItemTipo = 'global'; // 'global' | 'personal'

// ── Auth guard ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }

  currentUser = user;

  let snap;
  try {
    snap = await getDoc(doc(db, 'users', user.uid));
  } catch (e) {
    console.error('Error leyendo perfil:', e);
    return;
  }

  if (!snap.exists()) {
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
  initPersonalItems();
  initCommentCounts();

  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 400);
  }, 500);
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

// ── Checklist principal ───────────────────────────────────────────────────
const CHECK_SVG = `<svg width="13" height="10" viewBox="0 0 13 10" fill="none">
  <path d="M1.5 5L5 8.5L11.5 1.5" stroke="#0d1117" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const COMMENT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
</svg>`;

function initChecklist() {
  const q = query(collection(db, 'checklist_items'), orderBy('orden'));
  onSnapshot(q, snap => {
    checklistItems = snap.docs
      .map(d => ({ id: d.id, tipo: 'principal', ...d.data() }))
      .filter(i => i.activo !== false);
    renderChecklist();
  });
}

function initPersonalItems() {
  const q = query(
    collection(db, 'personal_items'),
    where('uid', '==', currentUser.uid)
  );
  onSnapshot(q, snap => {
    personalItems = snap.docs.map(d => ({ id: d.id, tipo: 'personal', ...d.data() }));
    renderChecklist();
  });
}

// Escucha comentarios globales para contar badges
function initCommentCounts() {
  const qGlobal = query(
    collection(db, 'comentarios'),
    where('tipo', '==', 'global')
  );
  onSnapshot(qGlobal, snap => {
    commentCounts = {};
    snap.docs.forEach(d => {
      const id = d.data().itemId;
      commentCounts[id] = (commentCounts[id] || 0) + 1;
    });
    updateCommentBadges();
  });
}

function updateCommentBadges() {
  document.querySelectorAll('.btn-comment').forEach(btn => {
    const id    = btn.dataset.id;
    const count = commentCounts[id] || 0;
    btn.querySelector('.comment-count').textContent = count > 0 ? count : '';
  });
}

// ── Render unificado ──────────────────────────────────────────────────────
function renderChecklist() {
  const container = document.getElementById('checklist');
  const todos     = [...checklistItems, ...personalItems];

  if (todos.length === 0) {
    container.innerHTML =
      '<div class="empty-msg">No hay ítems en el checklist.<br>El administrador debe agregar algunos.</div>';
    updateProgress();
    return;
  }

  container.innerHTML = todos.map(item => {
    const esPersonal = item.tipo === 'personal';
    const tagHtml = esPersonal
      ? `<span class="ci-required req-personal">PERSONAL</span>`
      : `${item.categoria} &nbsp;<span class="ci-required ${item.prioridad === 'OBLIGATORIO' ? 'req-ob' : 'req-rec'}">${item.prioridad}</span>`;

    const deleteBtn = esPersonal
      ? `<button class="ci-delete" data-id="${item.id}" title="Eliminar">✕</button>`
      : '';

    return `
      <div class="checklist-item" data-id="${item.id}" data-tipo="${item.tipo}">
        <div class="ci-main">
          <div class="ci-check">${CHECK_SVG}</div>
          <div class="ci-body">
            <div class="ci-text">${item.texto}</div>
            <div class="ci-tag">${tagHtml}</div>
          </div>
          <button class="btn-comment" data-id="${item.id}" data-texto="${item.texto.replace(/"/g, '&quot;')}">
            ${COMMENT_ICON}
            <span class="comment-count"></span>
          </button>
          ${deleteBtn}
        </div>
      </div>
    `;
  }).join('');

  // Toggle al hacer clic en ci-main
  container.querySelectorAll('.ci-main').forEach(main => {
    main.addEventListener('click', e => {
      if (e.target.closest('.ci-delete')) return;
      main.closest('.checklist-item').classList.toggle('done');
      updateProgress();
    });
  });

  // Eliminar ítem personal
  container.querySelectorAll('.ci-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await deleteDoc(doc(db, 'personal_items', btn.dataset.id));
    });
  });

  // Abrir modal de comentarios
  container.querySelectorAll('.btn-comment').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openComentarios(btn.dataset.id, btn.dataset.texto);
    });
  });

  updateCommentBadges();
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

// ── MODAL COMENTARIOS ─────────────────────────────────────────────────────
function openComentarios(itemId, itemTexto) {
  activeItemId   = itemId;
  activeItemTipo = 'global';

  document.getElementById('comentarios-titulo').textContent =
    itemTexto.length > 30 ? itemTexto.slice(0, 30) + '…' : itemTexto;

  // Reset tabs
  document.querySelectorAll('[data-ctab]').forEach(t => {
    t.classList.toggle('active', t.dataset.ctab === 'global');
  });

  document.getElementById('modal-comentarios').classList.remove('hidden');
  document.getElementById('comentario-texto').focus();

  loadComentarios();
}

function loadComentarios() {
  if (comentariosUnsub) comentariosUnsub();

  const lista = document.getElementById('comentarios-list');
  lista.innerHTML = '<div class="loading-msg">Cargando...</div>';

  let q;
  if (activeItemTipo === 'global') {
    q = query(
      collection(db, 'comentarios'),
      where('itemId', '==', activeItemId),
      where('tipo', '==', 'global'),
      orderBy('createdAt')
    );
  } else {
    q = query(
      collection(db, 'comentarios'),
      where('itemId', '==', activeItemId),
      where('tipo', '==', 'personal'),
      where('uid', '==', currentUser.uid),
      orderBy('createdAt')
    );
  }

  comentariosUnsub = onSnapshot(q, snap => {
    const comentarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderComentarios(comentarios);
  });
}

function renderComentarios(comentarios) {
  const lista = document.getElementById('comentarios-list');

  if (comentarios.length === 0) {
    lista.innerHTML = '<div class="empty-msg">Sin comentarios todavía.</div>';
    return;
  }

  lista.innerHTML = comentarios.map(c => {
    const esPropio = c.uid === currentUser.uid;
    const ts       = c.createdAt?.toDate();
    const fecha    = ts
      ? ts.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    const editado  = c.editedAt ? '<span class="editado-badge">(editado)</span>' : '';

    const acciones = esPropio ? `
      <div class="comentario-actions" id="actions-${c.id}">
        <button class="btn-comment-action btn-comment-edit" data-id="${c.id}">Editar</button>
        <button class="btn-comment-action btn-comment-del"  data-id="${c.id}">Eliminar</button>
      </div>` : '';

    return `
      <div class="comentario-item ${esPropio ? 'propio' : ''}" id="com-${c.id}">
        <div class="comentario-header">
          <span class="comentario-autor">${c.displayName || c.username}</span>
          <span class="comentario-fecha">${fecha} ${editado}</span>
        </div>
        <div class="comentario-texto" id="texto-${c.id}">${c.texto}</div>
        <input class="comentario-edit-input hidden" id="input-${c.id}" value="${c.texto.replace(/"/g, '&quot;')}">
        ${acciones}
      </div>
    `;
  }).join('');

  // Editar
  lista.querySelectorAll('.btn-comment-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.id;
      const textoEl = document.getElementById(`texto-${id}`);
      const inputEl = document.getElementById(`input-${id}`);
      const actions = document.getElementById(`actions-${id}`);

      textoEl.classList.add('editando');
      inputEl.classList.remove('hidden');
      inputEl.focus();

      actions.innerHTML = `
        <button class="btn-comment-action btn-comment-save"   data-id="${id}">Guardar</button>
        <button class="btn-comment-action btn-comment-cancel" data-id="${id}">Cancelar</button>
      `;

      actions.querySelector('.btn-comment-save').addEventListener('click', async () => {
        const nuevoTexto = inputEl.value.trim();
        if (!nuevoTexto) return;
        await updateDoc(doc(db, 'comentarios', id), {
          texto: nuevoTexto, editedAt: serverTimestamp()
        });
      });

      actions.querySelector('.btn-comment-cancel').addEventListener('click', () => {
        textoEl.classList.remove('editando');
        inputEl.classList.add('hidden');
        actions.innerHTML = `
          <button class="btn-comment-action btn-comment-edit" data-id="${id}">Editar</button>
          <button class="btn-comment-action btn-comment-del"  data-id="${id}">Eliminar</button>
        `;
        // Re-bind
        actions.querySelector('.btn-comment-del').addEventListener('click', () => eliminarComentario(id));
        actions.querySelector('.btn-comment-edit').addEventListener('click', btn.onclick);
      });
    });
  });

  // Eliminar
  lista.querySelectorAll('.btn-comment-del').forEach(btn => {
    btn.addEventListener('click', () => eliminarComentario(btn.dataset.id));
  });

  // Scroll al final
  lista.scrollTop = lista.scrollHeight;
}

async function eliminarComentario(id) {
  if (!confirm('¿Eliminar este comentario?')) return;
  await deleteDoc(doc(db, 'comentarios', id));
}

// Tabs Global / Personal
document.querySelectorAll('[data-ctab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-ctab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeItemTipo = tab.dataset.ctab;
    loadComentarios();
  });
});

// Cerrar modal
document.getElementById('btn-close-comentarios').addEventListener('click', () => {
  document.getElementById('modal-comentarios').classList.add('hidden');
  if (comentariosUnsub) { comentariosUnsub(); comentariosUnsub = null; }
});
document.getElementById('modal-comentarios').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    document.getElementById('modal-comentarios').classList.add('hidden');
    if (comentariosUnsub) { comentariosUnsub(); comentariosUnsub = null; }
  }
});

// Enviar comentario
async function enviarComentario() {
  const input  = document.getElementById('comentario-texto');
  const texto  = input.value.trim();
  if (!texto || !activeItemId) return;

  input.value = '';
  await addDoc(collection(db, 'comentarios'), {
    itemId:      activeItemId,
    tipo:        activeItemTipo,
    texto,
    uid:         currentUser.uid,
    username:    userProfile.username,
    displayName: userProfile.displayName || userProfile.username,
    createdAt:   serverTimestamp(),
    editedAt:    null
  });
}

document.getElementById('btn-send-comentario').addEventListener('click', enviarComentario);
document.getElementById('comentario-texto').addEventListener('keydown', e => {
  if (e.key === 'Enter') enviarComentario();
});

// ── Modal ítem personal ───────────────────────────────────────────────────
document.getElementById('btn-personal').addEventListener('click', () => {
  document.getElementById('modal-personal').classList.remove('hidden');
  document.getElementById('personal-texto').focus();
});
document.getElementById('btn-close-personal').addEventListener('click', () => {
  document.getElementById('modal-personal').classList.add('hidden');
});
document.getElementById('modal-personal').addEventListener('click', e => {
  if (e.target === e.currentTarget)
    document.getElementById('modal-personal').classList.add('hidden');
});
document.getElementById('btn-add-personal').addEventListener('click', async () => {
  const input  = document.getElementById('personal-texto');
  const texto  = input.value.trim();
  const errEl  = document.getElementById('personal-error');
  errEl.textContent = '';
  if (!texto) { errEl.textContent = 'Escribe una descripción.'; return; }
  const btn = document.getElementById('btn-add-personal');
  btn.disabled = true;
  try {
    await addDoc(collection(db, 'personal_items'), {
      texto, uid: currentUser.uid,
      username: userProfile.username, createdAt: serverTimestamp()
    });
    input.value = '';
    document.getElementById('modal-personal').classList.add('hidden');
  } catch {
    errEl.textContent = 'Error al guardar. Intenta de nuevo.';
  } finally {
    btn.disabled = false;
  }
});
document.getElementById('personal-texto').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-personal').click();
});

// ── PDF ───────────────────────────────────────────────────────────────────
document.getElementById('btn-print').addEventListener('click', () => {
  const container = document.getElementById('checklist');
  const meta = document.createElement('div');
  meta.className = 'print-meta';
  meta.id = 'print-meta';
  const nombre = userProfile.displayName || userProfile.username;
  const fecha  = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  meta.textContent = `Operador: ${nombre}   ·   ${fecha}   ·   S–${String(getISOWeek(new Date())).padStart(2,'0')}`;
  container.prepend(meta);
  window.print();
  setTimeout(() => { meta.remove(); }, 500);
});

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
      total_items:       document.querySelectorAll('.checklist-item').length,
      items_ids:         completados
    });

    btn.classList.add('success');
    btn.textContent = '✓ TRASPASO CONFIRMADO';
  } catch {
    resetConfirmBtn();
    alert('Error al guardar el traspaso. Intenta de nuevo.');
  }
});
