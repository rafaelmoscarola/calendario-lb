import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  try {
    const db = initFirebase();
    const ahora = new Date();
    const subsSnap = await db.collection('cal_suscripciones').get();
    const suscripciones = subsSnap.docs.map(d => d.data().subscription);
    if (!suscripciones.length) return res.status(200).json({ ok: true, msg: 'Sin suscriptores' });

    const hoyStr = ahora.toISOString().slice(0,10);
    const en8 = new Date(ahora); en8.setDate(en8.getDate() + 8);
    const en8Str = en8.toISOString().slice(0,10);

    const snap = await db.collection('cal_eventos')
      .where('fecha', '>=', hoyStr)
      .where('fecha', '<=', en8Str)
      .where('cancelado', '==', false)
      .get();

    const eventos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const enviadas = [];

    for (const ev of eventos) {
      const [y,m,d] = ev.fecha.split('-').map(Number);
      const [hh,mm] = (ev.hora || '12:00').split(':').map(Number);
      const fechaEv = new Date(y, m-1, d, hh, mm);
      const diffMin = (fechaEv - ahora) / 60000;

      const ventanas = [
        { min: 7*24*60, label: '7 días', emoji: '📅' },
        { min: 24*60,   label: '1 día',  emoji: '⚠️' },
        { min: 3*60,    label: '3 horas', emoji: '🔔' },
        { min: 60,      label: '1 hora',  emoji: '🚨' },
      ];

      for (const v of ventanas) {
        if (diffMin < v.min - 30 || diffMin > v.min + 30) continue;
        const notifId = `${ev.id}-${v.min}`;
        const ya = await db.collection('cal_notif_log').doc(notifId).get().then(d => d.exists).catch(() => false);
        if (ya) continue;

        const payload = JSON.stringify({
          title: `${v.emoji} En ${v.label} — ${ev.titulo}`,
          body: ev.hora ? `${ev.hora} hs${ev.precio ? ` · $${ev.precio}` : ''}${ev.notas ? `\n${ev.notas.split('\n')[0]}` : ''}` : (ev.notas?.split('\n')[0] || ''),
          url: 'https://calendario-lb.vercel.app'
        });

        await Promise.allSettled(suscripciones.map(sub =>
          webpush.sendNotification(sub, payload).catch(async err => {
            if (err.statusCode === 410) {
              const k = Buffer.from(sub.endpoint).toString('base64').slice(-20);
              await db.collection('cal_suscripciones').doc(k).delete().catch(() => {});
            }
          })
        ));

        await db.collection('cal_notif_log').doc(notifId).set({
          enviadoEn: ahora.toISOString(), evento: ev.titulo, ventana: v.label
        });
        enviadas.push(`${ev.titulo} - ${v.label}`);
      }
    }
    res.status(200).json({ ok: true, enviadas });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
