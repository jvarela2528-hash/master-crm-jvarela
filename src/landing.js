import './style.css';
import { dbMaster } from './firebase-config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('hq-lead-form');
    const successBox = document.getElementById('form-success-box');
    const submitBtn = document.getElementById('btn-submit-lead');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('lead-name')?.value.trim();
            const phone = document.getElementById('lead-phone')?.value.trim();
            const email = document.getElementById('lead-email')?.value.trim();
            const service = document.getElementById('lead-service')?.value;
            const details = document.getElementById('lead-details')?.value.trim() || 'Sin comentarios adicionales';

            if (!name || !phone) {
                alert('Por favor, ingresa tu nombre y número de WhatsApp.');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Procesando Solicitud...';

            try {
                await addDoc(collection(dbMaster, 'leads'), {
                    name,
                    phone,
                    email,
                    service,
                    detalles: details,
                    status: 'Nuevo',
                    source: 'Landing Master HQ',
                    createdAt: serverTimestamp()
                });

                contactForm.style.display = 'none';
                if (successBox) successBox.style.display = 'block';

                // Enviar confirmación directa por WhatsApp a Julio Varela
                const waText = encodeURIComponent(`Hola Julio Varela, acabo de solicitar información en Master CRM HQ.\n\nNombre: ${name}\nServicio: ${service}\nTeléfono: ${phone}\nDetalles: ${details}`);
                const waLink = `https://wa.me/17874596147?text=${waText}`;
                
                const btnConnect = document.getElementById('btn-wa-connect');
                if (btnConnect) {
                    btnConnect.onclick = () => window.open(waLink, '_blank');
                }

            } catch (err) {
                console.error('Error al guardar prospecto:', err);
                alert('Hubo un error al enviar tu solicitud. Intenta nuevamente.');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '🚀 Solicitar Evaluación y Propuesta';
            }
        });
    }

    // Scroll suave a secciones
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
