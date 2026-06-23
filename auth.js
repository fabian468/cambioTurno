import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from 'firebase/auth';
import {
  doc, setDoc, getDocs, collection, serverTimestamp
} from 'firebase/firestore';

// Si ya está autenticado (sesión previa), redirigir directo a la app
let registrando = false;
onAuthStateChanged(auth, user => {
  if (user && !registrando) window.location.href = 'app.html';
});

// Convierte nombre de usuario a email interno (invisible para el usuario)
const toEmail = username =>
  `${username.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@shiftlog.local`;

function setError(id, msg) {
  document.getElementById(id).textContent = msg;
}

// ── Toggle entre login y registro ─────────────────────────────────────────
document.getElementById('goto-register').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-register').classList.remove('hidden');
});
document.getElementById('goto-login').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('view-register').classList.add('hidden');
  document.getElementById('view-login').classList.remove('hidden');
});

// ── LOGIN ─────────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const username = document.getElementById('login-user').value.trim();
  const pass     = document.getElementById('login-pass').value;
  setError('login-error', '');

  if (!username || !pass) return setError('login-error', 'Completa todos los campos.');

  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    await signInWithEmailAndPassword(auth, toEmail(username), pass);
  } catch {
    setError('login-error', 'Usuario o contraseña incorrectos.');
    btn.disabled = false;
    btn.textContent = 'INGRESAR';
  }
});

['login-user', 'login-pass'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
});

// ── REGISTRO ──────────────────────────────────────────────────────────────
document.getElementById('btn-register').addEventListener('click', async () => {
  const username = document.getElementById('reg-user').value.trim();
  const pass     = document.getElementById('reg-pass').value;
  const pass2    = document.getElementById('reg-pass2').value;
  setError('reg-error', '');

  if (!username || !pass || !pass2)
    return setError('reg-error', 'Completa todos los campos.');
  if (!/^[a-zA-Z0-9._-]+$/.test(username))
    return setError('reg-error', 'Solo letras, números, puntos y guiones.');
  if (pass.length < 6)
    return setError('reg-error', 'La contraseña debe tener al menos 6 caracteres.');
  if (pass !== pass2)
    return setError('reg-error', 'Las contraseñas no coinciden.');

  const btn = document.getElementById('btn-register');
  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const nameTaken = usersSnap.docs.some(
      d => d.data().username === username.toLowerCase()
    );
    if (nameTaken) {
      setError('reg-error', 'Ese nombre de usuario ya está en uso.');
      btn.disabled = false;
      btn.textContent = 'CREAR CUENTA';
      return;
    }

    const isFirstUser = usersSnap.empty;

    registrando = true;
    const credential = await createUserWithEmailAndPassword(
      auth, toEmail(username), pass
    );

    // Esperar que el perfil quede guardado antes de redirigir
    await setDoc(doc(db, 'users', credential.user.uid), {
      username:    username.toLowerCase(),
      displayName: username,
      role:        isFirstUser ? 'admin' : 'operador',
      activo:      true,
      createdAt:   serverTimestamp()
    });

    window.location.href = 'app.html';
  } catch (e) {
    registrando = false;
    if (e.code === 'auth/email-already-in-use') {
      setError('reg-error', 'Ese nombre de usuario ya está en uso.');
    } else {
      setError('reg-error', 'Error al crear la cuenta. Intenta de nuevo.');
    }
    btn.disabled = false;
    btn.textContent = 'CREAR CUENTA';
  }
});
