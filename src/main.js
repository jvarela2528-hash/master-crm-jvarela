import './style.css'
import { dbMaster, dbFather, dbAngel, functions } from './firebase-config'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, limit, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

// MODO HQ: Detectar si viene del HQ inmediatamente
const params = new URLSearchParams(window.location.search);
if (params.get('view') === 'hq') {
    sessionStorage.setItem('from-hq', 'true');
}

function checkHQButton() {
    const hqBtn = document.getElementById('hq-back-nav');
    if (hqBtn && sessionStorage.getItem('from-hq') === 'true') {
        hqBtn.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', checkHQButton);

// ====== MOBILE SIDEBAR TOGGLE ======
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const sidebar = document.querySelector('.sidebar');

if (menuToggleBtn && sidebar) {
    menuToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && 
            !sidebar.contains(e.target) && 
            !menuToggleBtn.contains(e.target) && 
            sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
            }
        });
    });
}

// UI References
const loginScreen = document.getElementById('login-screen')
const adminPanel = document.getElementById('admin-panel')
const loginBtn = document.getElementById('login-btn')
const adminPassInput = document.getElementById('admin-pass')
const logoutBtn = document.getElementById('logout-btn')
const exportBtn = document.getElementById('export-btn')
const archiveBody = document.getElementById('archive-body')

const bodies = {
    'Nuevo': document.getElementById('body-nuevo'),
    'Contactado': document.getElementById('body-seguimiento'),
    'Cita': document.getElementById('body-seguimiento'),
    'Venta/Seguimiento': document.getElementById('body-venta'),
    'No Califica: Renta': document.getElementById('body-renta'),
    'No Califica: Apartamento': document.getElementById('body-apartamento'),
    'Crédito Afectado': document.getElementById('body-credito')
}

const counts = {
    'Nuevo': document.getElementById('count-nuevo'),
    'Seguimiento': document.getElementById('count-seguimiento'),
    'Venta': document.getElementById('count-venta'),
    'Renta': document.getElementById('count-renta'),
    'Apartamento': document.getElementById('count-apartamento'),
    'Credito': document.getElementById('count-credito')
}

let currentClientFilter = 'clients_global';
const clientFilterSelect = document.getElementById('client-filter');
if (clientFilterSelect) {
    clientFilterSelect.addEventListener('change', (e) => {
        currentClientFilter = e.target.value;
        renderAllLeads();
    });
}

let leadsFromMaster = [];
let leadsFromFather = [];
let leadsFromAngel = [];
let allLeads = [];
let archiveList = [];
let initialLoadMap = { master: true, father: true, angel: true };
let currentAICommLead = null;
let chartInstances = { products: null, status: null };

window.realCopies = { fb: '', tiktok: '' };
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

// --- CRM Logic Centralizada ---
function loadLeads() {
    const qMaster = query(collection(dbMaster, 'leads'), orderBy('createdAt', 'desc'));
    const qFather = query(collection(dbFather, 'leads'), orderBy('createdAt', 'desc'));
    const qAngel = query(collection(dbAngel, 'leads'), orderBy('createdAt', 'desc'));

    onSnapshot(qMaster, (snapshot) => {
        leadsFromMaster = snapshot.docs.map(d => ({ id: d.id, ...d.data(), _db: 'master' }));
        if (initialLoadMap.master) {
            initialLoadMap.master = false;
        } else {
            handleNewLeadAlert(snapshot, "Master CRM HQ");
        }
        renderAllLeads();
        renderStats();
    });

    onSnapshot(qFather, (snapshot) => {
        leadsFromFather = snapshot.docs.map(d => ({ id: d.id, ...d.data(), _db: 'father' }));
        if (initialLoadMap.father) {
            initialLoadMap.father = false;
        } else {
            handleNewLeadAlert(snapshot, "Padre (Solar)");
        }
        renderAllLeads();
        renderStats();
    });

    onSnapshot(qAngel, (snapshot) => {
        leadsFromAngel = snapshot.docs.map(d => ({ id: d.id, ...d.data(), _db: 'angel' }));
        if (initialLoadMap.angel) {
            initialLoadMap.angel = false;
        } else {
            handleNewLeadAlert(snapshot, "Angel Curbelo");
        }
        renderAllLeads();
        renderStats();
    });
}

function handleNewLeadAlert(snapshot, source) {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            if (data.status === 'Nuevo') {
                showVisualAlert(`${data.name} de ${source} acaba de entrar.`, "¡Nuevo Lead!");
                notificationSound.play().catch(e => console.log("Interacción requerida"));
            }
        }
    });
}

function calculateLeadScore(lead) {
    let score = 0;
    const isOwner = lead.isOwner || lead.dueno || 'si';
    const consumo = (lead.factura || lead.consumo || lead.detalles || '').toString();
    const credit = lead.credit || '';

    if (credit === '750+' || credit === '700+' || credit?.includes('Excelente')) score += 40;
    if (isOwner === 'si' || isOwner === 'Sí' || isOwner === 'Dueño') score += 40;
    if (consumo.includes('$351') || consumo.includes('$300')) score += 20;

    if (score >= 70) return { label: '🔥 Hot', class: 'score-hot' };
    if (score >= 40) return { label: '☀️ Warm', class: 'score-warm' };
    return { label: '❄️ Cold', class: 'score-cold' };
}

function renderAllLeads() {
    allLeads = [...leadsFromMaster, ...leadsFromFather, ...leadsFromAngel].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
    });

    Object.values(bodies).forEach(b => { if(b) b.innerHTML = '' });
    let countMap = { 'Nuevo': 0, 'Seguimiento': 0, 'Venta': 0, 'Renta': 0, 'Apartamento': 0, 'Credito': 0 };

    allLeads.forEach((data) => {
        if (currentClientFilter === 'clients_global' && data._db === 'master') return;
        if (currentClientFilter !== 'all' && currentClientFilter !== 'clients_global' && data._db !== currentClientFilter) return;

        const status = data.status || 'Nuevo';
        const clientLabel = data._db === 'master' ? 'Mi CRM Individual' : (data._db === 'angel' ? 'Angel Curbelo' : 'Sistema de Captación (Solar)');
        const clientColor = data._db === 'master' ? '#6366f1' : (data._db === 'angel' ? '#e67e22' : '#d4af37');
        
        const scoreData = calculateLeadScore(data);
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #1a1a1a";
        
        tr.innerHTML = `
            <td><span class="score-badge ${scoreData.class}">${scoreData.label}</span></td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong>${data.name}</strong>
                    <span style="font-size:0.65rem; background:${clientColor}22; color:${clientColor}; padding:2px 8px; border-radius:6px; border:1px solid ${clientColor}55; font-weight:700;">${clientLabel}</span>
                </div>
            </td>
            <td><small style="color:#aaa;">${data.source || (data.service ? `Web • ${data.service}` : 'Directo')}</small></td>
            <td>
                <div style="display:flex; gap:0.4rem; align-items:center;">
                    <a href="tel:${data.phone ? data.phone.replace(/\D/g, '') : ''}" class="btn-mini" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-weight:700; text-decoration:none;">📞</a>
                    <a href="https://wa.me/${data.phone?.replace(/\D/g,'')}?text=${encodeURIComponent(`Hola ${data.name}, le asiste ${clientLabel} en relación a su solicitud...`)}" target="_blank" class="btn-mini" style="background:#25d366; color:#000; border:none; padding:4px 8px; font-weight:800; text-decoration:none;">📱 WA</a>
                    <button class="btn-mini btn-ai-comm" data-id="${data.id}" data-db="${data._db}" style="background:linear-gradient(135deg, #d4af37, #f3e5ab); color:#000; border:none; padding:4px 8px; font-weight:800;">✨ IA</button>
                    <button class="btn-mini btn-appointment" data-id="${data.id}" style="background:#3498db; color:#fff; border:none; padding:4px 8px; font-weight:800;">📅 Cita</button>
                </div>
            </td>
            <td>
                <select class="status-select" data-id="${data.id}" data-db="${data._db}">
                    <option value="Nuevo" ${status === 'Nuevo' ? 'selected' : ''}>Nuevo</option>
                    <option value="Contactado" ${status === 'Contactado' ? 'selected' : ''}>Contactado</option>
                    <option value="Cita" ${status === 'Cita' ? 'selected' : ''}>Cita</option>
                    <option value="Venta/Seguimiento" ${status === 'Venta/Seguimiento' ? 'selected' : ''}>Venta/Seguimiento</option>
                    <option value="No Califica: Renta" ${status === 'No Califica: Renta' ? 'selected' : ''}>No Califica: Renta</option>
                    <option value="No Califica: Apartamento" ${status === 'No Califica: Apartamento' ? 'selected' : ''}>No Califica: Apartamento</option>
                    <option value="Crédito Afectado" ${status === 'Crédito Afectado' ? 'selected' : ''}>Crédito Afectado</option>
                </select>
            </td>
            <td><button class="btn-mini btn-delete-lead" data-id="${data.id}" data-db="${data._db}" style="background:transparent; border:none; font-size:1rem;">🗑️</button></td>
        `;

        if (status === 'Nuevo') { bodies['Nuevo'].appendChild(tr); countMap['Nuevo']++ }
        else if (status === 'Contactado' || status === 'Cita') { bodies['Contactado'].appendChild(tr); countMap['Seguimiento']++ }
        else if (status === 'Venta/Seguimiento') { bodies['Venta/Seguimiento'].appendChild(tr); countMap['Venta']++ }
        else if (status === 'No Califica: Renta') { bodies['No Califica: Renta'].appendChild(tr); countMap['Renta']++ }
        else if (status === 'No Califica: Apartamento') { bodies['No Califica: Apartamento'].appendChild(tr); countMap['Apartamento']++ }
        else if (status === 'Crédito Afectado') { bodies['Crédito Afectado'].appendChild(tr); countMap['Credito']++ }
    });

    Object.keys(countMap).forEach(key => { if (counts[key]) counts[key].innerText = countMap[key] });

    document.querySelectorAll('.status-select').forEach(s => s.addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        const dbType = e.target.getAttribute('data-db');
        const targetDb = dbType === 'master' ? dbMaster : (dbType === 'angel' ? dbAngel : dbFather);
        await updateDoc(doc(targetDb, 'leads', id), { status: e.target.value });
    }));

    document.querySelectorAll('.btn-delete-lead').forEach(b => b.addEventListener('click', async () => {
        if(confirm('¿Eliminar prospecto definitivamente?')) {
            const id = b.getAttribute('data-id');
            const dbType = b.getAttribute('data-db');
            const targetDb = dbType === 'master' ? dbMaster : (dbType === 'angel' ? dbAngel : dbFather);
            await deleteDoc(doc(targetDb, 'leads', id));
        }
    }));

    document.querySelectorAll('.btn-ai-comm').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const lead = allLeads.find(l => l.id === id);
        if (lead) openAICommModal(lead);
    }));

    document.querySelectorAll('.btn-appointment').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const lead = allLeads.find(l => l.id === id);
        if (lead) openAppointmentModal(lead);
    }));
}

// --- Inteligencia y Estadísticas ---
function renderStats() {
    const statsSection = document.getElementById('stats-section');
    if (!statsSection || !statsSection.classList.contains('active')) return;

    const filterVal = document.getElementById('stats-filter')?.value || 'clients_global';
    let filtered = allLeads;
    if (filterVal === 'clients_global') {
        filtered = allLeads.filter(l => l._db !== 'master');
    } else if (filterVal !== 'all') {
        filtered = allLeads.filter(l => l._db === filterVal);
    }

    const total = filtered.length;
    document.getElementById('stat-total').innerText = total;

    const ventas = filtered.filter(l => l.status === 'Venta/Seguimiento').length;
    const conv = total > 0 ? ((ventas / total) * 100).toFixed(1) : 0;
    document.getElementById('stat-conv').innerText = `${conv}%`;

    const origins = { 'Solar': 0, 'Bienestar': 0, 'Rainbow': 0, 'Zendure': 0, 'CRM HQ': 0 };
    const statuses = { 'Nuevo': 0, 'Seguimiento': 0, 'Venta': 0, 'Archivo': 0 };

    filtered.forEach(l => {
        const src = (l.source || l.service || '').toString();
        if (src.includes('hh') || src.includes('Bienestar')) origins['Bienestar']++;
        else if (src.includes('rainbow')) origins['Rainbow']++;
        else if (src.includes('zendure')) origins['Zendure']++;
        else if (src.includes('crm') || src.includes('hq') || src.includes('Master')) origins['CRM HQ']++;
        else origins['Solar']++;

        const st = l.status || 'Nuevo';
        if (st === 'Nuevo') statuses['Nuevo']++;
        else if (st === 'Contactado' || st === 'Cita') statuses['Seguimiento']++;
        else if (st === 'Venta/Seguimiento') statuses['Venta']++;
        else statuses['Archivo']++;
    });

    const topOrigin = Object.keys(origins).reduce((a, b) => origins[a] > origins[b] ? a : b);
    document.getElementById('stat-top').innerText = topOrigin;

    const ctxProd = document.getElementById('chart-products')?.getContext('2d');
    if (ctxProd) {
        if (chartInstances.products) chartInstances.products.destroy();
        chartInstances.products = new Chart(ctxProd, {
            type: 'doughnut',
            data: {
                labels: Object.keys(origins),
                datasets: [{
                    data: Object.values(origins),
                    backgroundColor: ['#d4af37', '#00e5ff', '#9b59b6', '#2ecc71', '#e74c3c'],
                    borderWidth: 0
                }]
            },
            options: { plugins: { legend: { position: 'bottom', labels: { color: '#888', font: { family: 'Inter', weight: 'bold' } } } }, maintainAspectRatio: false }
        });
    }

    const ctxStatus = document.getElementById('chart-status')?.getContext('2d');
    if (ctxStatus) {
        if (chartInstances.status) chartInstances.status.destroy();
        chartInstances.status = new Chart(ctxStatus, {
            type: 'bar',
            data: {
                labels: Object.keys(statuses),
                datasets: [{
                    label: 'Prospectos',
                    data: Object.values(statuses),
                    backgroundColor: 'rgba(212, 175, 55, 0.25)',
                    borderColor: '#d4af37',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: { 
                scales: { 
                    y: { beginAtZero: true, grid: { color: '#222' }, ticks: { color: '#888', font: { family: 'Inter', weight: 'bold' } } },
                    x: { grid: { display: false }, ticks: { color: '#888', font: { family: 'Inter', weight: 'bold' } } }
                },
                plugins: { legend: { display: false } },
                maintainAspectRatio: false
            }
        });
    }
}

document.getElementById('stats-filter')?.addEventListener('change', renderStats);

// --- Asistente IA de Comunicación Modal ---
function openAICommModal(lead) {
    currentAICommLead = lead;
    const modal = document.getElementById('ai-comm-modal');
    const nameEl = document.getElementById('ai-comm-lead-name');
    const resultBox = document.getElementById('ai-comm-result-box');
    const btnRun = document.getElementById('btn-run-ai-comm');

    if (!modal) return;
    nameEl.innerText = `Destinatario: ${lead.name} • ${lead.phone || 'Sin teléfono'}`;
    resultBox.style.display = 'none';
    btnRun.innerHTML = '🚀 Redactar Mensaje Inteligente';
    btnRun.disabled = false;
    modal.style.display = 'flex';
}

document.getElementById('btn-run-ai-comm')?.addEventListener('click', async () => {
    if (!currentAICommLead) return;
    const btnRun = document.getElementById('btn-run-ai-comm');
    const resultBox = document.getElementById('ai-comm-result-box');
    const resultText = document.getElementById('ai-comm-result-text');
    const obj = document.getElementById('ai-comm-objective').value;
    const tone = document.getElementById('ai-comm-tone').value;
    const modelSelect = document.getElementById('ai-comm-model');
    const selectedModel = modelSelect ? modelSelect.value : 'gemini';

    btnRun.innerHTML = '✨ Redactando con IA...';
    btnRun.disabled = true;

    try {
        const generateComm = httpsCallable(functions, 'generateAIAsset');
        const res = await generateComm({ 
            prompt: `Destinatario: ${currentAICommLead.name}. Objetivo: ${obj}. Tono: ${tone}`, 
            type: 'text', 
            clientId: 'master',
            model: selectedModel
        });
        if (res.data?.error) {
            alert(`Error: ${res.data.error}`);
            btnRun.innerHTML = '🚀 Redactar Mensaje Inteligente';
            btnRun.disabled = false;
            return;
        }
        resultText.value = res.data?.result || res.data;
        resultBox.style.display = 'block';
        btnRun.innerHTML = '✅ Mensaje Creado Exitosamente';
    } catch (err) {
        alert(`Fallo de conexión: ${err.message}`);
        btnRun.innerHTML = '🚀 Redactar Mensaje Inteligente';
        btnRun.disabled = false;
    }
});

document.getElementById('btn-wa-ai-comm')?.addEventListener('click', () => {
    if (!currentAICommLead || !currentAICommLead.phone) return alert('El destinatario no tiene un número de teléfono válido.');
    const txt = document.getElementById('ai-comm-result-text').value;
    window.open(`https://wa.me/${currentAICommLead.phone.replace(/\D/g,'')}?text=${encodeURIComponent(txt)}`, '_blank');
});

document.getElementById('btn-copy-ai-comm')?.addEventListener('click', () => {
    const txt = document.getElementById('ai-comm-result-text').value;
    navigator.clipboard.writeText(txt);
    showVisualAlert('El mensaje ha sido copiado al portapapeles.', '¡Copiado!');
});

// --- Agendador de Citas & Sincronización de Calendario ---
let currentAppointmentLead = null;

window.openAppointmentModal = (lead) => {
    currentAppointmentLead = lead;
    const modal = document.getElementById('appointment-modal');
    const infoEl = document.getElementById('appointment-lead-info');
    const dtEl = document.getElementById('appointment-datetime');
    const locEl = document.getElementById('appointment-location');
    const notesEl = document.getElementById('appointment-notes');

    if (!modal) return;
    infoEl.innerText = `Prospecto: ${lead.name} • Tel: ${lead.phone || 'N/A'} • Proyecto: ${lead._db === 'angel' ? 'Angel Curbelo' : (lead._db === 'master' ? 'Mi CRM Individual' : 'Sistema de Captación')}`;
    
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(10, 0, 0, 0);
    const tzoffset = tmrw.getTimezoneOffset() * 60000;
    const localISO = new Date(tmrw.getTime() - tzoffset).toISOString().slice(0, 16);
    dtEl.value = localISO;

    locEl.value = 'Llamada Telefónica';
    notesEl.value = `Cita agendada con ${lead.name}.\nTeléfono: ${lead.phone || 'N/A'}.\nDetalles de solicitud: ${lead.detalles || lead.consumo || lead.factura || lead.service || 'Sin información'}.`;
    
    modal.style.display = 'flex';
};

document.querySelectorAll('.tag-btn-appointment').forEach(btn => {
    btn.addEventListener('click', () => {
        const headerEl = document.getElementById('appointment-header');
        if (headerEl) headerEl.value = btn.getAttribute('data-tag');
    });
});

document.getElementById('btn-gcal-sync')?.addEventListener('click', () => {
    if (!currentAppointmentLead) return;
    const header = document.getElementById('appointment-header').value || '[CITA] Reunión con Cliente';
    const dtVal = document.getElementById('appointment-datetime').value;
    const loc = document.getElementById('appointment-location').value || 'Teléfono';
    const notes = document.getElementById('appointment-notes').value || '';

    if (!dtVal) return alert('Selecciona fecha y hora para la cita.');

    const dt = new Date(dtVal);
    const formatDt = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
    const start = formatDt(dt);
    const endDt = new Date(dt.getTime() + 60*60*1000);
    const end = formatDt(endDt);

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `${header} - ${currentAppointmentLead.name}`,
        dates: `${start}/${end}`,
        details: notes,
        location: loc
    });

    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
});

document.getElementById('btn-ical-sync')?.addEventListener('click', () => {
    if (!currentAppointmentLead) return;
    const header = document.getElementById('appointment-header').value || '[CITA] Reunión con Cliente';
    const dtVal = document.getElementById('appointment-datetime').value;
    const loc = document.getElementById('appointment-location').value || 'Teléfono';
    const notes = document.getElementById('appointment-notes').value || '';

    if (!dtVal) return alert('Selecciona fecha y hora para la cita.');

    const dt = new Date(dtVal);
    const start = dt.toISOString().replace(/-|:|\.\d+/g, '');
    const end = new Date(dt.getTime() + 60*60*1000).toISOString().replace(/-|:|\.\d+/g, '');

    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Master CRM HQ//ES
BEGIN:VEVENT
UID:${Date.now()}@mastercrm.hq
DTSTAMP:${start}
DTSTART:${start}
DTEND:${end}
SUMMARY:${header} - ${currentAppointmentLead.name}
DESCRIPTION:${notes.replace(/\n/g, '\\n')}
LOCATION:${loc}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cita_${currentAppointmentLead.name.replace(/\s+/g,'_')}_${Date.now()}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById('btn-save-appointment')?.addEventListener('click', async () => {
    if (!currentAppointmentLead) return;
    const header = document.getElementById('appointment-header').value || '[CITA]';
    const dtVal = document.getElementById('appointment-datetime').value;
    const loc = document.getElementById('appointment-location').value || 'Teléfono';

    if (!dtVal) return alert('Selecciona fecha y hora para la cita.');

    const targetDb = currentAppointmentLead._db === 'master' ? dbMaster : (currentAppointmentLead._db === 'angel' ? dbAngel : dbFather);
    const formattedDate = new Date(dtVal).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

    try {
        await updateDoc(doc(targetDb, 'leads', currentAppointmentLead.id), {
            status: 'Cita',
            appointmentDate: dtVal,
            appointmentHeader: header,
            appointmentLocation: loc
        });

        document.getElementById('appointment-modal').style.display = 'none';
        showVisualAlert(`Cita agendada exitosamente para el ${formattedDate}`, '¡Cita Guardada en CRM!');

        if (currentAppointmentLead.phone) {
            const waMsg = `Hola ${currentAppointmentLead.name}, le confirmamos su cita agendada para el ${formattedDate} (${header}). Medio: ${loc}. ¡Le esperamos!`;
            window.open(`https://wa.me/${currentAppointmentLead.phone.replace(/\D/g,'')}?text=${encodeURIComponent(waMsg)}`, '_blank');
        }
    } catch (e) {
        alert('Error al guardar cita: ' + e.message);
    }
});

// --- Motor de Marketing & Creativos IA ---
const adContent = {
    'Master CRM HQ': {
        fb: [
            { hook: "¿Escalando tu empresa pero perdiendo prospectos en hojas de Excel? 📊", body: "Desarrollamos sistemas CRM a la medida con Inteligencia Artificial integrada. Embudos automatizados, notificaciones instantáneas a WhatsApp y control total de tus ventas." },
            { hook: "Convierte tu WhatsApp en una máquina autónoma de ventas 24/7. 🤖", body: "Creamos Agentes de IA multimodales capaces de atender clientes, calificar leads y agendar citas en piloto automático. Agenda tu demostración VIP." },
            { hook: "¿Tu equipo comercial tarda horas en responder a un nuevo prospecto? ⏳", body: "Conecta tus campañas con automatizaciones de Make y Twilio. Alertas en menos de 5 segundos a tu teléfono. Escalabilidad garantizada." }
        ],
        tiktok: [
            { hook: "POV: Mientras duermes, tu Agente IA cerró 3 citas para tu negocio... 🚀", body: "La automatización con Inteligencia Artificial ya no es el futuro, es el presente. Da clic para construir tu ecosistema." },
            { hook: "El error #1 de las empresas en crecimiento: no tener un CRM propio. ❌", body: "Olvídate de pagar suscripciones costosas por usuario. Ten tu propio sistema a la medida con tu marca." }
        ]
    },
    'direct': {
        fb: [
            { hook: "¿Cansado de que se vaya la luz justo cuando más la necesitas? 🔌", body: "Protege a tu familia con SolarFlow Pro. Sistema de respaldo inteligente que se activa al instante. Califica hoy mismo." },
            { hook: "Tu factura de luz no tiene por qué ser un dolor de cabeza mensual. ☀️", body: "Cámbiate al sol y recupera tu independencia energética con sistemas de primer nivel y financiamiento disponible." }
        ],
        tiktok: [
            { hook: "POV: Mi vecino paga $400 de luz y yo pago $5... 💸", body: "¿Quieres saber el secreto? Dale clic al link abajo para ver si tu casa califica en menos de 1 minuto." }
        ]
    },
    'hh-integral': {
        fb: [
            { hook: "¿Cansado de lidiar con los efectos dañinos del agua dura? 🚿", body: "H&H Distributors presenta el suavizador 'Triple Treated Water'. Remueve químicos ahorrando hasta un 24% de energía. Llama para orientación GRATIS." }
        ],
        tiktok: [
            { hook: "POV: Dejas de cargar botellones de agua para siempre. 💧", body: "Ahorra dinero y cuida tu salud con purificación alcalina en casa. Instalación gratis." }
        ]
    },
    'rainbow-pr': {
        fb: [
            { hook: "Elimina el polvo y los alérgenos de raíz con el poder del agua. ✨", body: "Rainbow utiliza el poder del agua para lavar el aire de tu hogar. Ideal para familias con asma o alergias. ¡Pide tu demo!" }
        ],
        tiktok: [
            { hook: "POV: Ves lo que sale de tu colchón... 😱", body: "No vas a creer lo que tu aspiradora normal está dejando atrás. Solicita tu demo gratis ahora." }
        ]
    },
    'zendure-pr': {
        fb: [
            { hook: "Prepárate para la temporada de huracanes con Zendure. 🔋", body: "Baterías inteligentes Plug & Play. Sin instalaciones costosas, energía segura para tus enseres críticos." }
        ],
        tiktok: [
            { hook: "Se fue la luz... ¿y qué? 🔋", body: "Con Zendure mi nevera y mi internet nunca se apagan. Portátil, potente y sin ruidos." }
        ]
    }
};

const imageBank = {
    'Master CRM HQ': {
        fb: ['https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1000&auto=format&fit=crop', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1000&auto=format&fit=crop'],
        tiktok: ['https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1000&auto=format&fit=crop']
    },
    'direct': {
        fb: ['/ads/fb_1.png'], tiktok: ['/ads/tk_1.png']
    },
    'hh-integral': {
        fb: ['/ads/fb_1.png'], tiktok: ['/ads/tk_1.png']
    },
    'rainbow-pr': {
        fb: ['/ads/fb_1.png'], tiktok: ['/ads/tk_1.png']
    },
    'zendure-pr': {
        fb: ['/ads/fb_1.png'], tiktok: ['/ads/tk_1.png']
    }
};

window.generateIdea = (platform) => {
    const catSelect = document.getElementById('ad-category-select')?.value || 'Master CRM HQ';
    const texts = adContent[catSelect] || adContent['Master CRM HQ'];
    const imgs = imageBank[catSelect] || imageBank['Master CRM HQ'];
    const item = texts[platform][Math.floor(Math.random() * texts[platform].length)];
    const imgUrl = imgs[platform][Math.floor(Math.random() * imgs[platform].length)];

    const textEl = document.getElementById(`text-${platform}`);
    const imgEl = document.getElementById(`img-preview-${platform}`);

    if (textEl) {
        textEl.innerHTML = `<strong>${item.hook}</strong><br><br>${item.body}<br><br>👉 <a href="https://master-crm-jvarela.web.app/" target="_blank" style="color:#d4af37; font-weight:700;">Cotiza Gratis Aquí</a>`;
        window.realCopies[platform] = `${item.hook}\n\n${item.body}\n\n👉 Info aquí: https://master-crm-jvarela.web.app/`;
    }
    if (imgEl) {
        imgEl.src = imgUrl;
    }
};

window.generateAIIdea = async (platform) => {
    const catSelect = document.getElementById('ad-category-select')?.value || 'Master CRM HQ';
    const names = { 'Master CRM HQ': 'Master CRM HQ', 'direct': 'Energía Solar', 'hh-integral': 'H&H Bienestar', 'rainbow-pr': 'Rainbow', 'zendure-pr': 'Zendure' };
    const label = names[catSelect] || 'Master CRM HQ';

    const userPrompt = prompt(`¿Sobre qué aspecto de ${label} quieres enfocar el anuncio? (Ej: Embudos de venta automatizados con IA, Creación de Agentes para WhatsApp, Oferta VIP)`);
    if (!userPrompt) return;

    const modelSelect = document.getElementById('ai-model-select');
    const selectedModel = modelSelect ? modelSelect.value : 'gemini';

    const enrichedPrompt = `[Categoría: ${label}] [Link: https://master-crm-jvarela.web.app/] ${userPrompt}`;
    showVisualAlert(`Generando anuncio de ${label} con IA...`, "Motor Creativo IA");

    const textEl = document.getElementById(`text-${platform}`);
    const imgEl = document.getElementById(`img-preview-${platform}`);

    if (textEl) { textEl.innerText = "✨ Creando copy viral con IA..."; textEl.classList.add('ai-pulse'); }
    if (imgEl) { imgEl.classList.add('shimmer'); imgEl.style.opacity = '0.5'; }

    try {
        const genAI = httpsCallable(functions, 'generateAIAsset');
        const resText = await genAI({ prompt: enrichedPrompt, type: 'text', clientId: 'master', model: selectedModel });
        if (resText.data?.result && textEl) {
            const formatted = resText.data.result.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#d4af37; font-weight:bold; text-decoration:underline; display:inline-block; margin-top:6px;">🔗 Cotiza Gratis Aquí</a>');
            textEl.innerHTML = formatted;
            window.realCopies[platform] = resText.data.result;
        }

        const resImg = await genAI({ prompt: enrichedPrompt, type: 'image', clientId: 'master', model: selectedModel });
        if (resImg.data?.result && imgEl) {
            imgEl.src = resImg.data.result;
            imgEl.onload = () => { imgEl.classList.remove('shimmer'); imgEl.style.opacity = '1'; };
        }
    } catch (e) {
        alert(`Error en generación IA: ${e.message}`);
    } finally {
        if (textEl) textEl.classList.remove('ai-pulse');
        if (imgEl) { imgEl.classList.remove('shimmer'); imgEl.style.opacity = '1'; }
    }
};

window.downloadMedia = (platform) => {
    const img = document.getElementById(`img-preview-${platform}`);
    if (!img || !img.src) return alert("No hay imagen cargada");
    const link = document.createElement('a');
    link.href = img.src;
    link.download = `creativo_${platform}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.prepareAd = (platform) => {
    if (!window.realCopies[platform]) {
        window.generateIdea(platform);
        setTimeout(() => window.prepareAd(platform), 250);
        return;
    }
    const txt = window.realCopies[platform];
    window.downloadMedia(platform);
    navigator.clipboard.writeText(txt);
    showVisualAlert('Texto copiado y recurso gráfico descargado con éxito.', '¡Campaña Lista!');
};

// --- Generador de Documentos Corporativos (Facturas, Propuestas, Contratos) ---
function renderVisualDocument(jsonObj, docType, clientName) {
    const visualBox = document.getElementById('doc-visual-preview');
    if (!visualBox) return;

    let itemsHtml = '';
    if (jsonObj.items && Array.isArray(jsonObj.items)) {
        itemsHtml = `
            <table style="width:100%; border-collapse:collapse; margin-bottom:2.5rem; font-size:0.95rem;">
                <thead>
                    <tr style="border-bottom:2px solid #cbd5e1; color:#475569; text-align:left;">
                        <th style="padding:1rem 0;">Descripción del Servicio / Concepto</th>
                        <th style="padding:1rem 0; text-align:right;">Inversión (USD)</th>
                    </tr>
                </thead>
                <tbody>
                    ${jsonObj.items.map(item => `
                        <tr style="border-bottom:1px solid #e2e8f0;">
                            <td style="padding:1.2rem 0; color:#1e293b; font-weight:600;">${item.description || item.concepto || ''}</td>
                            <td style="padding:1.2rem 0; color:#0f172a; font-weight:800; text-align:right;">$${Number(item.total || item.unitPrice || item.precio || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    let clausesHtml = '';
    if (jsonObj.clauses && Array.isArray(jsonObj.clauses)) {
        clausesHtml = `
            <div style="margin-bottom:2.5rem;">
                ${jsonObj.clauses.map(clause => `
                    <div style="margin-bottom:1.5rem;">
                        <h4 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin-bottom:0.5rem;">${clause.title || ''}</h4>
                        <p style="color:#334155; font-size:0.95rem; line-height:1.6; margin:0; white-space:pre-line;">${clause.text || clause.content || ''}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }

    let scopeHtml = '';
    if (jsonObj.scope && Array.isArray(jsonObj.scope)) {
        scopeHtml = `
            <div style="margin-bottom:2.5rem;">
                <h4 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin-bottom:0.8rem;">Alcance de la Solución</h4>
                <ul style="padding-left:1.5rem; color:#334155; font-size:0.95rem; line-height:1.6;">
                    ${jsonObj.scope.map(s => `<li style="margin-bottom:0.5rem;">${s}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    const totalAmount = jsonObj.total || jsonObj.subtotal || 0;
    const formattedTotal = Number(totalAmount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

    visualBox.innerHTML = `
        <div style="font-family:'Inter', sans-serif; color:#0f172a;">
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #e2e8f0; padding-bottom:2rem; margin-bottom:2.5rem;">
                <div>
                    <img src="/logo_jvarela.jpg" alt="Master CRM HQ Logo" style="height:85px; width:auto; object-fit:contain; margin-bottom:1rem;">
                    <h2 style="font-size:1.8rem; font-weight:900; color:#0f172a; margin:0; letter-spacing:-0.5px;">MASTER CRM HQ</h2>
                    <a href="https://master-crm-jvarela.web.app/" target="_blank" style="color:#2563eb; font-weight:600; text-decoration:none; font-size:0.95rem;">https://master-crm-jvarela.web.app/</a>
                </div>
                <div style="text-align:right; font-size:0.95rem; color:#475569; line-height:1.6;">
                    <strong style="color:#0f172a; font-size:1.15rem; display:block;">Julio A Varela Rodriguez</strong>
                    📞 Tel: 787-459-6147<br>
                    ✉️ Email: iavarelaj@gmail.com<br>
                    📍 Puerto Rico, USA
                </div>
            </div>

            <!-- Doc Info -->
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:1.5rem 2rem; border-radius:12px; margin-bottom:2.5rem;">
                <div>
                    <span style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; display:block;">Documento Oficial</span>
                    <h3 style="font-size:1.5rem; font-weight:900; color:#0f172a; margin:0;">${jsonObj.title || docType.toUpperCase()}</h3>
                    <span style="font-size:0.85rem; color:#64748b; font-weight:600;">N°: ${jsonObj.docNumber || 'DOC-2026-001'}</span>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; display:block;">Fecha de Emisión</span>
                    <strong style="font-size:1.1rem; color:#0f172a;">${jsonObj.date || new Date().toLocaleDateString('es-ES', { dateStyle: 'long' })}</strong>
                </div>
            </div>

            <!-- Bill To / Client Info -->
            <div style="margin-bottom:2.5rem;">
                <span style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:0.5rem;">Preparado Para:</span>
                <strong style="font-size:1.25rem; color:#0f172a; display:block;">${jsonObj.clientName || clientName || 'Cliente VIP'}</strong>
            </div>

            <!-- Main Content -->
            ${jsonObj.objectives ? `<div style="margin-bottom:2rem;"><h4 style="font-size:1.1rem; font-weight:800; color:#0f172a; margin-bottom:0.5rem;">Objetivo Ejecutivo</h4><p style="color:#334155; font-size:0.95rem; line-height:1.6;">${jsonObj.objectives}</p></div>` : ''}
            ${scopeHtml}
            ${clausesHtml}
            ${itemsHtml}

            <!-- Summary / Financial Totals -->
            <div style="display:flex; justify-content:flex-end; border-top:2px solid #e2e8f0; padding-top:1.5rem; margin-bottom:3rem;">
                <div style="width:350px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.8rem; font-size:1.05rem; color:#475569;">
                        <span>Subtotal:</span>
                        <strong>$${formattedTotal} USD</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding-top:1rem; border-top:2px dashed #cbd5e1; font-size:1.4rem; font-weight:900; color:#0f172a;">
                        <span>Inversión Total:</span>
                        <span style="color:#2563eb;">$${formattedTotal} USD</span>
                    </div>
                </div>
            </div>

            <!-- Notes & Terms -->
            ${jsonObj.notes || jsonObj.terms || jsonObj.nextSteps ? `
                <div style="background:#f1f5f9; padding:1.5rem; border-radius:12px; margin-bottom:3rem; font-size:0.9rem; color:#475569; line-height:1.6;">
                    <strong style="color:#0f172a; display:block; margin-bottom:0.5rem;">Términos y Notas Comerciales:</strong>
                    <div style="white-space:pre-line;">${jsonObj.notes || jsonObj.terms || jsonObj.nextSteps}</div>
                </div>
            ` : ''}

            <!-- Signatures -->
            <div style="display:flex; justify-content:space-between; border-top:1px solid #e2e8f0; padding-top:3rem; margin-top:3rem; color:#64748b; font-size:0.85rem;">
                <div style="width:45%; text-align:center;">
                    <div style="border-bottom:1px solid #94a3b8; height:40px; margin-bottom:10px;"></div>
                    <strong style="color:#0f172a; font-size:1rem;">Julio A Varela Rodriguez</strong><br>
                    <span>Master CRM HQ</span>
                </div>
                <div style="width:45%; text-align:center;">
                    <div style="border-bottom:1px solid #94a3b8; height:40px; margin-bottom:10px;"></div>
                    <strong style="color:#0f172a; font-size:1rem;">${jsonObj.clientName || clientName || 'Cliente VIP'}</strong><br>
                    <span>Aceptación y Conformidad</span>
                </div>
            </div>
        </div>
    `;
    document.getElementById('tab-visual').click();
}

document.getElementById('btn-run-doc-gen')?.addEventListener('click', async () => {
    const docType = document.getElementById('doc-gen-type').value;
    const clientName = document.getElementById('doc-gen-client').value;
    const details = document.getElementById('doc-gen-details').value;
    const resultBox = document.getElementById('doc-gen-result');
    const badge = document.getElementById('doc-status-badge');
    const btn = document.getElementById('btn-run-doc-gen');

    if (!clientName || !details) return alert('Por favor ingresa el nombre del cliente y los detalles de los servicios.');

    btn.innerHTML = '✨ Generando con Inteligencia Artificial...';
    btn.disabled = true;
    badge.innerText = 'Generando...';
    badge.style.background = '#e67e22';
    badge.style.color = '#fff';

    try {
        const genDoc = httpsCallable(functions, 'generateAIAsset');
        const res = await genDoc({ prompt: `Cliente: ${clientName}. Detalles: ${details}`, type: 'document', docType, clientId: 'master' });
        
        if (res.data?.error) {
            alert(`Error: ${res.data.error}`);
            badge.innerText = 'Error';
            badge.style.background = '#e74c3c';
        } else if (res.data?.result || res.data) {
            const rawText = res.data.result || res.data;
            resultBox.value = typeof rawText === 'object' ? JSON.stringify(rawText, null, 2) : rawText;
            
            let jsonObj = {};
            try {
                jsonObj = typeof rawText === 'object' ? rawText : JSON.parse(rawText);
            } catch (err) {
                const jsonMatch = rawText.match(/```json([\s\S]*?)```/);
                if (jsonMatch) {
                    try { jsonObj = JSON.parse(jsonMatch[1].trim()); } catch(e){}
                }
            }

            if (Object.keys(jsonObj).length > 0) {
                renderVisualDocument(jsonObj, docType, clientName);
            } else {
                document.getElementById('doc-visual-preview').innerHTML = `<div style="padding: 2rem; color: #111; white-space: pre-wrap; font-family: monospace;">${rawText}</div>`;
                document.getElementById('tab-visual').click();
            }

            badge.innerText = 'Completado';
            badge.style.background = '#2ecc71';
            showVisualAlert('El documento ha sido redactado profesionalmente por la IA.', '¡Documento Listo!');
        }
    } catch (e) {
        alert('Fallo al generar documento: ' + e.message);
        badge.innerText = 'Borrador';
        badge.style.background = '#333';
    } finally {
        btn.innerHTML = '✨ Generar Documento IA';
        btn.disabled = false;
    }
});

document.getElementById('btn-copy-doc')?.addEventListener('click', () => {
    const txt = document.getElementById('doc-gen-result')?.value;
    if (!txt) return alert('No hay documento para copiar');
    navigator.clipboard.writeText(txt);
    showVisualAlert('Documento copiado al portapapeles');
});

document.getElementById('btn-download-doc')?.addEventListener('click', () => {
    const txt = document.getElementById('doc-gen-result')?.value;
    const docType = document.getElementById('doc-gen-type')?.value || 'doc';
    const clientName = document.getElementById('doc-gen-client')?.value || 'cliente';
    if (!txt) return alert('No hay documento para descargar');
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${docType}_${clientName.replace(/\s+/g,'_')}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById('btn-save-doc')?.addEventListener('click', async () => {
    const docType = document.getElementById('doc-gen-type')?.value;
    const clientName = document.getElementById('doc-gen-client')?.value;
    const details = document.getElementById('doc-gen-details')?.value;
    const content = document.getElementById('doc-gen-result')?.value;

    if (!content || content.trim() === '') return alert('Primero genera un documento válido.');

    try {
        await addDoc(collection(dbAngel, 'doc_archive'), {
            docType,
            clientName,
            details,
            content,
            createdAt: new Date()
        });
        showVisualAlert('El documento ha sido archivado en el repositorio histórico.', '¡Archivado Exitosamente!');
    } catch (e) {
        alert('Error al guardar documento: ' + e.message);
    }
});

function loadDocArchive() {
    const q = query(collection(dbAngel, 'doc_archive'), orderBy('createdAt', 'desc'));
    const docArchiveBody = document.getElementById('doc-archive-body');
    onSnapshot(q, (snapshot) => {
        if (!docArchiveBody) return;
        docArchiveBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement('div');
            card.className = 'ad-card';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <span style="font-size:0.75rem; background:#d4af3722; color:#d4af37; padding:4px 10px; border-radius:6px; font-weight:800; text-transform:uppercase;">${data.docType || 'Documento'}</span>
                    <small style="color:#777;">${data.createdAt?.toDate().toLocaleDateString() || ''}</small>
                </div>
                <h3 style="color:#fff; margin:0 0 0.5rem 0; font-size:1.4rem; font-weight:800;">${data.clientName || 'Sin Cliente'}</h3>
                <p style="color:#888; font-size:0.85rem; margin:0 0 1rem 0; line-height:1.4;">${data.details ? data.details.substring(0,80)+'...' : ''}</p>
                <div style="background:#000; padding:1.2rem; border-radius:12px; font-size:0.85rem; color:#ddd; line-height:1.5; font-family:monospace; height:180px; overflow-y:auto; margin-bottom:1.2rem; border:1px solid #222; white-space:pre-wrap;">${data.content}</div>
                <div style="display:flex; gap:10px; margin-top:auto;">
                    <button class="btn-mini primary copy-btn-doc-archive" data-text="${data.content.replace(/"/g, '&quot;')}" style="flex:1; justify-content:center; padding:0.8rem; font-size:0.85rem;">📋 Copiar</button>
                    <button class="btn-mini download-btn-doc-archive" data-type="${data.docType}" data-client="${data.clientName}" data-text="${data.content.replace(/"/g, '&quot;')}" style="background:#25d366; color:#000; font-weight:800; border:none; padding:0.8rem; font-size:0.85rem;">📥 TXT</button>
                    <button class="btn-mini delete-btn-doc-archive" data-id="${id}" style="background:transparent; border:1px solid #ff4d4d; color:#ff4d4d; padding:0.8rem;">🗑️</button>
                </div>
            `;
            docArchiveBody.appendChild(card);
        });

        document.querySelectorAll('.copy-btn-doc-archive').forEach(b => b.addEventListener('click', () => {
            navigator.clipboard.writeText(b.getAttribute('data-text'));
            showVisualAlert('Contenido del documento copiado a tu portapapeles');
        }));
        document.querySelectorAll('.download-btn-doc-archive').forEach(b => b.addEventListener('click', () => {
            const blob = new Blob([b.getAttribute('data-text')], { type: 'text/plain;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${b.getAttribute('data-type')}_${(b.getAttribute('data-client')||'doc').replace(/\s+/g,'_')}_${Date.now()}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }));
        document.querySelectorAll('.delete-btn-doc-archive').forEach(b => b.addEventListener('click', async () => {
            if (confirm('¿Eliminar documento del archivo histórico?')) await deleteDoc(doc(dbAngel, 'doc_archive', b.getAttribute('data-id')));
        }));
    });
}

// --- Gestión de Clientes & Comunicación ---
function loadClients() {
    onSnapshot(collection(dbFather, 'clientes'), (snapshot) => {
        const clientsList = document.getElementById('clients-list');
        if (!clientsList) return;
        clientsList.innerHTML = '';
        snapshot.forEach((docSnapshot) => {
            const client = docSnapshot.data();
            const id = docSnapshot.id;
            const card = document.createElement('div');
            card.className = 'ad-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1rem;">
                    <div><h3 style="color:#d4af37; margin:0; font-size:1.4rem; font-weight:800;">${client.nombre}</h3><small style="color:#888;">ID: ${id}</small></div>
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <span style="font-size:0.75rem; font-weight:800; color:${client.notificacionesActivas ? '#2ecc71' : '#e74c3c'}">${client.notificacionesActivas ? 'ACTIVO' : 'PAUSADO'}</span>
                        <input type="checkbox" class="client-toggle" data-id="${id}" ${client.notificacionesActivas ? 'checked' : ''}>
                    </label>
                </div>
                <div style="background:#000; padding:1.5rem; border-radius:16px; border:1px solid #333; margin-bottom:1.5rem;">
                    <label style="font-size:0.75rem; font-weight:700; color:#888; display:block; margin-bottom:0.8rem;">📱 WHATSAPP DE NOTIFICACIÓN</label>
                    <div style="display:flex; gap:12px;">
                        <input type="text" class="client-phone" data-id="${id}" value="${client.adminWhatsApp || ''}" style="flex:1; background:#111; border:1px solid #333; color:#fff; padding:12px; border-radius:12px; font-weight:600;">
                        <button class="btn-mini primary btn-save-client" data-id="${id}" style="padding:0 1.5rem; font-size:0.9rem;">Guardar</button>
                    </div>
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <a href="tel:${client.adminWhatsApp ? client.adminWhatsApp.replace(/\D/g, '') : ''}" class="btn-mini" style="background:#10b981; color:#fff; border:none; padding:10px 12px; font-weight:700; text-decoration:none; flex:1; text-align:center; justify-content:center;">📞 Llamar</a>
                    <a href="https://wa.me/${client.adminWhatsApp ? client.adminWhatsApp.replace(/\D/g, '') : ''}?text=${encodeURIComponent(`Hola ${client.nombre}, le saludo desde Master CRM HQ...`)}" target="_blank" class="btn-mini" style="background:#25d366; color:#000; border:none; padding:10px 12px; font-weight:800; text-decoration:none; flex:1; text-align:center; justify-content:center;">📱 WhatsApp</a>
                    <button class="btn-mini btn-ai-client" data-name="${client.nombre}" data-phone="${client.adminWhatsApp}" style="background:linear-gradient(135deg, #d4af37, #f3e5ab); color:#000; border:none; padding:10px 12px; font-weight:800; flex:1; justify-content:center;">✨ IA</button>
                </div>
            `;
            clientsList.appendChild(card);
        });

        document.querySelectorAll('.client-toggle').forEach(t => t.addEventListener('change', async (e) => {
            await updateDoc(doc(dbFather, 'clientes', t.getAttribute('data-id')), { notificacionesActivas: e.target.checked });
        }));
        document.querySelectorAll('.btn-save-client').forEach(b => b.addEventListener('click', async () => {
            const id = b.getAttribute('data-id');
            const phone = document.querySelector(`.client-phone[data-id="${id}"]`).value;
            await updateDoc(doc(dbFather, 'clientes', id), { adminWhatsApp: phone.replace(/\D/g,'') });
            showVisualAlert("Número de WhatsApp guardado exitosamente");
        }));
        document.querySelectorAll('.btn-ai-client').forEach(b => b.addEventListener('click', () => {
            const fakeLead = {
                name: b.getAttribute('data-name'),
                phone: b.getAttribute('data-phone') || '',
                _db: 'master'
            };
            openAICommModal(fakeLead);
        }));
    });
}

document.getElementById('btn-create-client')?.addEventListener('click', async () => {
    const name = document.getElementById('new-client-name')?.value;
    const phone = document.getElementById('new-client-phone')?.value;

    if (!name || !phone) return alert('Por favor ingresa el nombre y el teléfono.');

    try {
        await addDoc(collection(dbFather, 'clientes'), {
            nombre: name,
            adminWhatsApp: phone.replace(/\D/g, ''),
            notificacionesActivas: true,
            createdAt: new Date()
        });
        document.getElementById('add-client-modal').style.display = 'none';
        document.getElementById('new-client-name').value = '';
        document.getElementById('new-client-phone').value = '';
        showVisualAlert('Nuevo cliente registrado exitosamente en la plataforma.', '¡Cliente Agregado!');
    } catch (e) {
        alert('Error al registrar cliente: ' + e.message);
    }
});

// --- Archivo de Creativos ---
function loadArchive() {
    const q = query(collection(dbAngel, 'ad_archive'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        if (!archiveBody) return;
        archiveBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement('div');
            card.className = 'ad-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.75rem; color:#d4af37; font-weight:800; text-transform:uppercase;">${data.platform || 'Anuncio'}</span>
                    <small style="color:#777;">${data.createdAt?.toDate().toLocaleDateString() || ''}</small>
                </div>
                <div style="height:220px; background:#000; border-radius:16px; overflow:hidden; border:1px solid #333;"><img src="${data.imageUrl}" style="width:100%; height:100%; object-fit:contain;"></div>
                <div style="background:#111; padding:1.2rem; border-radius:12px; font-size:0.85rem; color:#ddd; line-height:1.5;">${data.content}</div>
                <div style="display:flex; gap:10px;">
                    <button class="btn-mini primary copy-btn-archive" data-text="${data.content.replace(/"/g, '&quot;')}" style="flex:1; justify-content:center; padding:0.8rem; font-size:0.85rem;">📋 Copiar Copy</button>
                    <button class="btn-mini delete-btn-archive" data-id="${id}" style="background:transparent; border:1px solid #ff4d4d; color:#ff4d4d; padding:0.8rem;">🗑️ Eliminar</button>
                </div>
            `;
            archiveBody.appendChild(card);
        });

        document.querySelectorAll('.copy-btn-archive').forEach(b => b.addEventListener('click', () => {
            navigator.clipboard.writeText(b.getAttribute('data-text'));
            showVisualAlert('Copy guardado en tu portapapeles');
        }));
        document.querySelectorAll('.delete-btn-archive').forEach(b => b.addEventListener('click', async () => {
            if(confirm('¿Eliminar del archivo histórico?')) await deleteDoc(doc(dbAngel, 'ad_archive', b.getAttribute('data-id')));
        }));
    });
}

document.querySelectorAll('.btn-save-archive').forEach(btn => {
    btn.addEventListener('click', async () => {
        const platform = btn.getAttribute('data-platform');
        const platformKey = platform === 'Facebook' ? 'fb' : 'tiktok';
        const imageUrl = document.getElementById(`img-preview-${platformKey}`)?.src;
        const contentToSave = window.realCopies[platformKey];
        if (!contentToSave) return alert('Primero genera o redacta un anuncio');
        try {
            await addDoc(collection(dbAngel, 'ad_archive'), { platform, content: contentToSave, imageUrl, createdAt: new Date() });
            showVisualAlert('Campaña agregada a tu archivo de creativos', '¡Guardado!');
        } catch (e) { alert('Error al guardar en archivo: ' + e.message); }
    });
});

document.querySelectorAll('.hidden-file').forEach(input => {
    input.addEventListener('change', (e) => {
        const platform = input.getAttribute('data-platform');
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => { document.getElementById(`img-preview-${platform}`).src = ev.target.result; };
            reader.readAsDataURL(file);
        }
    });
});

exportBtn?.addEventListener('click', () => {
    if (allLeads.length === 0) return alert('No hay prospectos en la base para exportar');
    const headers = ['Fecha', 'Nombre', 'Teléfono', 'Origen / Proyecto', 'Estado'];
    const rows = allLeads.map(l => [
        l.createdAt?.toDate ? l.createdAt.toDate().toLocaleDateString() : '',
        `"${l.name || ''}"`,
        `"${l.phone || ''}"`,
        `"${l._db === 'angel' ? 'Angel Curbelo' : (l._db === 'master' ? 'Mi CRM Individual' : 'Sistema de Captación')}"`,
        `"${l.status || 'Nuevo'}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `prospectos_master_crm_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

function showVisualAlert(msg, title = "Notificación") {
    const alertBox = document.createElement('div');
    alertBox.style = "position:fixed; top:25px; right:25px; background:linear-gradient(135deg, #d4af37, #f3e5ab); color:#000; padding:20px 30px; border-radius:16px; z-index:999999; box-shadow:0 20px 50px rgba(0,0,0,0.8); font-weight:600; border:1px solid #fff3;";
    alertBox.innerHTML = `<strong style="font-size:1.1rem; font-weight:800;">🔥 ${title}</strong><br><span style="font-size:0.95rem; margin-top:5px; display:block;">${msg}</span>`;
    document.body.appendChild(alertBox);
    setTimeout(() => alertBox.remove(), 4500);
}

// Navigation and Initial Setup
loginBtn.addEventListener('click', () => {
    if (adminPassInput.value === 'JVarela2026') {
        sessionStorage.setItem('admin-auth', 'true');
        showPanel();
    } else {
        alert('Contraseña Incorrecta');
    }
});

logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('admin-auth');
    location.reload();
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        const targetSec = document.getElementById(item.getAttribute('data-section'));
        if (targetSec) targetSec.classList.add('active');
        if (item.getAttribute('data-section') === 'stats-section') renderStats();
    });
});

function showPanel() {
    loginScreen.style.display = 'none';
    adminPanel.style.display = 'flex';
    loadLeads();
    loadClients();
    loadArchive();
    loadDocArchive();
    checkHQButton();
    window.generateIdea('fb');
    window.generateIdea('tiktok');

    const params = new URLSearchParams(window.location.search);
    const secParam = params.get('section');
    if (secParam) {
        setTimeout(() => {
            const targetTab = document.querySelector(`.nav-item[data-section="${secParam}-section"]`) || document.querySelector(`.nav-item[data-section="${secParam}"]`);
            if (targetTab) targetTab.click();
        }, 100);
    }
}

if (sessionStorage.getItem('admin-auth') === 'true') {
    showPanel();
}
