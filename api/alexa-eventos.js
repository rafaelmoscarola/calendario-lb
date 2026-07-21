// Reemplazá este archivo completo en tu backend de Vercel
import { db } from '../src/firebase.js'; // Asegúrate de que la ruta a tu firebase.js sea la correcta

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Verificar la clave secreta
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (token !== process.env.ALEXA_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { accion, id, tipo, titulo, fecha, hora, creadoPor, modificadoPor, periodo } = req.body;

  try {
    // ── 1. CREAR EVENTO ──────────────────────────────────────────────────────
    if (accion === 'crear') {
      const nuevoRef = db.collection('eventos').doc();
      await nuevoRef.set({
        tipo: tipo || 'evento',
        titulo,
        fecha,
        hora: hora || '',
        creadoPor: creadoPor || 'Alexa',
        creadoEn: new Date().toISOString(),
      });
      return res.json({ ok: true, id: nuevoRef.id });
    }

    // ── 2. CANCELAR / BORRAR EVENTO ─────────────────────────────────────────
    if (accion === 'cancelar') {
      if (!id) return res.status(400).json({ ok: false, error: 'Falta el ID' });
      await db.collection('eventos').doc(id).delete();
      return res.json({ ok: true });
    }

    // ── 3. BUSCAR EVENTO ─────────────────────────────────────────────────────
    if (accion === 'buscar') {
      const snapshot = await db.collection('eventos').get();
      let eventos = [];

      snapshot.forEach((doc) => {
        eventos.push({ id: doc.id, ...doc.data() });
      });

      if (fecha) {
        eventos = eventos.filter((e) => e.fecha === fecha);
      } else if (titulo) {
        const busq = titulo.toLowerCase();
        eventos = eventos.filter((e) => e.titulo && e.titulo.toLowerCase().includes(busq));
      }

      return res.json({ ok: true, eventos });
    }

    // ── 4. CONSULTAR AGENDA (Soporta Meses completos, Días o Rangos) ─────────
    if (accion === 'semana' || accion === 'consultar') {
      const snapshot = await db.collection('eventos').get();
      let eventos = [];

      snapshot.forEach((doc) => {
        eventos.push({ id: doc.id, ...doc.data() });
      });

      // Filtro según el período que mandó Alexa
      if (periodo) {
        // Si Alexa manda formato de mes (Ej: "2026-08")
        if (/^\d{4}-\d{2}$/.test(periodo)) {
          eventos = eventos.filter((e) => e.fecha && e.fecha.startsWith(periodo));
        }
        // Si Alexa manda una fecha exacta (Ej: "2026-08-15")
        else if (/^\d{4}-\d{2}-\d{2}$/.test(periodo)) {
          eventos = eventos.filter((e) => e.fecha === periodo);
        }
        // Si manda otro rango
        else {
          eventos = eventos.filter((e) => e.fecha && e.fecha >= periodo);
        }
      } else {
        // Por defecto, muestra todo lo que hay de hoy en adelante
        const hoyISO = new Date().toISOString().split('T')[0];
        eventos = eventos.filter((e) => e.fecha && e.fecha >= hoyISO);
      }

      // Ordenar los eventos por fecha y hora para que Alexa los lea en orden
      eventos.sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));

      return res.json({ ok: true, eventos });
    }

    // ── 5. MODIFICAR EVENTO ──────────────────────────────────────────────────
    if (accion === 'modificar') {
      if (!id) return res.status(400).json({ ok: false, error: 'Falta el ID' });
      const cambios = { modificadoPor: modificadoPor || 'Alexa' };
      if (titulo) cambios.titulo = titulo;
      if (fecha) cambios.fecha = fecha;
      if (hora !== undefined) cambios.hora = hora;

      await db.collection('eventos').doc(id).update(cambios);
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Acción no válida' });
  } catch (error) {
    console.error('Error en API Alexa:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}