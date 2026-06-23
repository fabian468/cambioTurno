import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, doc, getDoc, getDocs,
  updateDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';

// ── CATEGORÍAS ────────────────────────────────────────────────────────────
function loadCategorias() {
  const q = query(collection(db, 'categorias'), orderBy('nombre'));
  onSnapshot(q, snap => {
    const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Actualizar select del formulario
    const select = document.getElementById('item-cat');
    const current = select.value;
    select.innerHTML = cats.length === 0
      ? '<option value="">Sin categorías</option>'
      : cats.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
    if (current) select.value = current;
    // Actualizar lista del modal
    renderCategorias(cats);
  });
}

function renderCategorias(cats) {
  const container = document.getElementById('categorias-list');
  container.innerHTML = cats.length === 0
    ? '<div class="empty-msg">No hay categorías todavía.</div>'
    : cats.map(c => `
        <div class="cat-item">
          <span class="cat-name">${c.nombre}</span>
          <button class="btn-cat-del" data-id="${c.id}" onclick="window.eliminarCategoria(this)">
            Eliminar
          </button>
        </div>
      `).join('');
}

document.getElementById('btn-open-categorias').addEventListener('click', () => {
  document.getElementById('modal-categorias').classList.remove('hidden');
});
document.getElementById('btn-close-modal').addEventListener('click', () => {
  document.getElementById('modal-categorias').classList.add('hidden');
});
document.getElementById('modal-categorias').addEventListener('click', e => {
  if (e.target === e.currentTarget)
    document.getElementById('modal-categorias').classList.add('hidden');
});

document.getElementById('btn-add-categoria').addEventListener('click', async () => {
  const input  = document.getElementById('nueva-categoria');
  const nombre = input.value.trim();
  const errEl  = document.getElementById('cat-error');
  errEl.textContent = '';

  if (!nombre) { errEl.textContent = 'Escribe un nombre.'; return; }

  const snap   = await getDocs(collection(db, 'categorias'));
  const existe = snap.docs.some(d => d.data().nombre.toLowerCase() === nombre.toLowerCase());
  if (existe) { errEl.textContent = 'Esa categoría ya existe.'; return; }

  await addDoc(collection(db, 'categorias'), { nombre, createdAt: serverTimestamp() });
  input.value = '';
});

document.getElementById('nueva-categoria').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-categoria').click();
});

window.eliminarCategoria = async btn => {
  if (!confirm('¿Eliminar esta categoría?')) return;
  await deleteDoc(doc(db, 'categorias', btn.dataset.id));
};

// ── Auth guard: solo admin ────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'index.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists() || snap.data().role !== 'admin') {
    window.location.href = 'app.html';
    return;
  }

  initAdmin();
});

document.getElementById('btn-back').addEventListener('click', () => {
  window.location.href = 'app.html';
});

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

function initAdmin() {
  loadCategorias();
  loadItems();
  loadUsers();
  loadHistorial();
}

// ── ITEMS ─────────────────────────────────────────────────────────────────
function loadItems() {
  const q = query(collection(db, 'checklist_items'), orderBy('orden'));
  onSnapshot(q, snap => {
    renderItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderItems(items) {
  const container = document.getElementById('items-list');

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-msg">No hay ítems todavía.<br>Agrega el primero arriba.</div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="admin-item ${item.activo === false ? 'inactive' : ''}">
      <div class="admin-item-info">
        <span class="admin-item-text">${item.texto}</span>
        <span class="admin-item-meta">
          ${item.categoria} ·
          <span class="ci-required ${item.prioridad === 'OBLIGATORIO' ? 'req-ob' : 'req-rec'}">
            ${item.prioridad}
          </span>
          ${item.activo === false ? ' · <em>inactivo</em>' : ''}
        </span>
      </div>
      <div class="admin-item-actions">
        <button
          class="btn-small ${item.activo === false ? 'btn-small-on' : 'btn-small-off'}"
          data-id="${item.id}"
          data-activo="${item.activo !== false}"
          onclick="window.toggleActivo(this)">
          ${item.activo === false ? 'Activar' : 'Desactivar'}
        </button>
        <button
          class="btn-small btn-small-del"
          data-id="${item.id}"
          onclick="window.eliminarItem(this)">
          Eliminar
        </button>
      </div>
    </div>
  `).join('');
}

document.getElementById('btn-add-item').addEventListener('click', async () => {
  const texto     = document.getElementById('item-texto').value.trim();
  const categoria = document.getElementById('item-cat').value;
  const prioridad = document.getElementById('item-prio').value;
  const errEl     = document.getElementById('item-error');

  errEl.textContent = '';
  if (!texto) { errEl.textContent = 'Escribe una descripción.'; return; }

  const btn = document.getElementById('btn-add-item');
  btn.disabled = true;

  try {
    const snap     = await getDocs(collection(db, 'checklist_items'));
    const maxOrden = snap.docs.reduce((max, d) => Math.max(max, d.data().orden ?? 0), 0);

    await addDoc(collection(db, 'checklist_items'), {
      texto, categoria, prioridad,
      orden:     maxOrden + 1,
      activo:    true,
      createdAt: serverTimestamp()
    });

    document.getElementById('item-texto').value = '';
  } catch {
    errEl.textContent = 'Error al guardar. Intenta de nuevo.';
  } finally {
    btn.disabled = false;
  }
});

window.toggleActivo = async btn => {
  const activo = btn.dataset.activo === 'true';
  await updateDoc(doc(db, 'checklist_items', btn.dataset.id), { activo: !activo });
};

window.eliminarItem = async btn => {
  if (!confirm('¿Eliminar este ítem del checklist?')) return;
  await deleteDoc(doc(db, 'checklist_items', btn.dataset.id));
};

// ── USUARIOS ──────────────────────────────────────────────────────────────
function loadUsers() {
  const q = query(collection(db, 'users'), orderBy('createdAt'));
  onSnapshot(q, snap => {
    renderUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderUsers(users) {
  const container = document.getElementById('users-list');

  container.innerHTML = users.length === 0
    ? '<div class="empty-msg">Sin usuarios registrados.</div>'
    : users.map(u => `
        <div class="admin-item">
          <div class="admin-item-info">
            <span class="admin-item-text">${u.displayName || u.username}</span>
            <span class="admin-item-meta">
              @${u.username} ·
              <span class="role-badge role-${u.role}">${u.role}</span>
            </span>
          </div>
          <div class="admin-item-actions">
            <button
              class="btn-small btn-small-role"
              data-id="${u.id}"
              data-role="${u.role}"
              onclick="window.cambiarRol(this)">
              ${u.role === 'admin' ? '→ Operador' : '→ Admin'}
            </button>
          </div>
        </div>
      `).join('');
}

window.cambiarRol = async btn => {
  const nuevoRol = btn.dataset.role === 'admin' ? 'operador' : 'admin';
  if (!confirm(`¿Cambiar rol a "${nuevoRol}"?`)) return;
  await updateDoc(doc(db, 'users', btn.dataset.id), { role: nuevoRol });
};

// ── HISTORIAL ─────────────────────────────────────────────────────────────
function loadHistorial() {
  const q = query(collection(db, 'confirmaciones'), orderBy('timestamp', 'desc'));
  onSnapshot(q, snap => {
    renderHistorial(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderHistorial(items) {
  const container = document.getElementById('historial-list');

  container.innerHTML = items.length === 0
    ? '<div class="empty-msg">Sin confirmaciones todavía.</div>'
    : items.map(c => {
        const ts    = c.timestamp?.toDate();
        const fecha = ts
          ? ts.toLocaleDateString('es-CL', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
          : '—';
        return `
          <div class="historial-item">
            <span class="historial-user">${c.displayName || c.username}</span>
            <span class="historial-meta">
              ${fecha} · S–${String(c.semana_iso).padStart(2, '0')} ·
              ${c.items_completados}/${c.total_items} ítems completados
            </span>
          </div>
        `;
      }).join('');
}
