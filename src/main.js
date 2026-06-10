import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";

// Tu configuración de Firebase (asegúrate de tenerla aquí)
const firebaseConfig = // Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBYyk46rga2kpsuYf6gAngRyIK7ryO7OrI",
  authDomain: "master-crm-jvarela.firebaseapp.com",
  projectId: "master-crm-jvarela",
  storageBucket: "master-crm-jvarela.firebasestorage.app",
  messagingSenderId: "558777018603",
  appId: "1:558777018603:web:0c03708e67c47315d676ae"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

// --- 1. LOGIN SEGURO ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-pass').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert("Acceso denegado: " + error.message);
    }
});

// --- 2. CONTROL DE ACCESO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'flex';
        loadLeads(); // Cargar datos solo si hay sesión activa
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('admin-panel').style.display = 'none';
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// --- 3. RENDERIZADO SEGURO (EVITA XSS) ---
function loadLeads() {
    const leadsRef = collection(db, "leads");
    onSnapshot(leadsRef, (snapshot) => {
        const tbody = document.getElementById('body-nuevo');
        tbody.innerHTML = ''; // Limpiar previo

        snapshot.forEach((doc) => {
            const lead = doc.data();
            const tr = document.createElement('tr');

            // Crear celdas de forma segura
            const tdCalidad = document.createElement('td');
            tdCalidad.textContent = lead.scoreLabel || 'VIP';
            
            const tdNombre = document.createElement('td');
            tdNombre.textContent = lead.name || 'Sin nombre'; // <--- SEGURIDAD AQUÍ
            
            const tdOrigen = document.createElement('td');
            tdOrigen.textContent = lead.source || 'N/A';

            tr.appendChild(tdCalidad);
            tr.appendChild(tdNombre);
            tr.appendChild(tdOrigen);
            tbody.appendChild(tr);
        });
    });
}