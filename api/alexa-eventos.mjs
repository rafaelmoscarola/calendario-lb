import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Reutiliza las mismas credenciales que ya usa cron-notif.mjs
function initFirebase() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })});
  }
  return getFirestore();
}

const TIPOS_VALIDOS = ['evento', 'alquiler', 'reunion'];

export default async function handler(req, res) {
  // Seguridad: solo el Lambda de Alexa conoce esta clave
  if (req.headers['authorization'] !== `Bearer ${process.env.ALEXA_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const db = initFirebase();
  const { accion } = req.body || {};

  try {
    switch (accion) {

      // ── CREAR (evento / alquiler / reunion) ──────────────────────────
      case 'crear': {
        const { tipo, titulo, fecha, hora, creadoPor } = req.body;
        if (!TIPOS_VALIDOS.includes(tipo)) {
          return res.status(400).json({ error: 'Tipo inválido' });
        }
        if (!titulo || !fecha) {
          return res.status(400).json({ error: 'Falta título o fecha' });
        }
        const ref = await db.collection('cal_eventos').add({
          tipo, titulo, fecha, hora: hora || '',
          precio: '', notas: '',
          creadoPor: creadoPor || 'Alexa',
          creadoEn: new Date().toISOString(),
          cancelado: false,
        });
        return res.status(200).json({ ok: true, id: ref.id });
      }

      // ── BUSCAR (por fecha y/o título, para cancelar/modificar) ───────
      case 'buscar': {
        const { fecha, titulo } = req.body;
        let query = db.collection('cal_eventos').where('cancelado', '==', false);
        if (fecha) query = query.where('fecha', '==', fecha);
        const snap = await query.get();
        let candidatos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (titulo) {
          const t = titulo.toLowerCase();
          candidatos = candidatos.filter(e => e.titulo.toLowerCase().includes(t));
        }
        return res.status(200).json({ ok: true, eventos: candidatos });
      }

      // ── CANCELAR ──────────────────────────────────────────────────────
      case 'cancelar': {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Falta id' });
        await db.collection('cal_eventos').doc(id).update({ cancelado: true });
        return res.status(200).json({ ok: true });
      }

      // ── MODIFICAR (fecha, hora y/o titulo) ───────────────────────────
      case 'modificar': {
        const { id, titulo, fecha, hora, modificadoPor } = req.body;
        if (!id) return res.status(400).json({ error: 'Falta id' });
        const cambios = { modificadoPor: modificadoPor || 'Alexa', modificadoEn: new Date().toISOString() };
        if (titulo) cambios.titulo = titulo;
        if (fecha) cambios.fecha = fecha;
        if (hora) cambios.hora = hora;
        await db.collection('cal_eventos').doc(id).update(cambios);
        return res.status(200).json({ ok: true });
      }

      // ── CONSULTAR SEMANA ──────────────────────────────────────────────
      case 'semana': {
        const hoy = new Date();
        const hoyStr = hoy.toISOString().slice(0, 10);
        const en7 = new Date(hoy); en7.setDate(en7.getDate() + 7);
        const en7Str = en7.toISOString().slice(0, 10);
        const snap = await db.collection('cal_eventos')
          .where('fecha', '>=', hoyStr)
          .where('fecha', '<=', en7Str)
          .where('cancelado', '==', false)
          .orderBy('fecha')
          .get();
        const eventos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return res.status(200).json({ ok: true, eventos });
      }

      default:
        return res.status(400).json({ error: 'Acción desconocida' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
