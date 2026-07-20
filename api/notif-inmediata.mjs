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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  try {
    const { titulo, cuerpo } = req.body;
    const db = initFirebase();
    const subsSnap = await db.collection('cal_suscripciones').get();
    const suscripciones = subsSnap.docs.map(d => d.data().subscription);
    if (!suscripciones.length) return res.status(200).json({ ok: true, msg: 'Sin suscriptores' });

    const payload = JSON.stringify({
      title: titulo || 'Calendario LB',
      body: cuerpo || '',
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

    res.status(200).json({ ok: true, enviadas: suscripciones.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
