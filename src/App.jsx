import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase.js';
import {
  collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  query, orderBy, where, Timestamp
} from 'firebase/firestore';

// ── FERIADOS ARGENTINA 2025-2026 ─────────────────────────────────────────────
const FERIADOS = [
  '2025-01-01','2025-03-03','2025-03-04','2025-03-24','2025-04-02',
  '2025-04-17','2025-04-18','2025-05-01','2025-05-25','2025-06-20',
  '2025-07-09','2025-08-17','2025-10-12','2025-11-20','2025-12-08','2025-12-25',
  '2026-01-01','2026-02-16','2026-02-17','2026-03-24','2026-04-02',
  '2026-04-03','2026-04-04','2026-05-01','2026-05-25','2026-06-15','2026-06-20',
  '2026-07-09','2026-08-17','2026-10-12','2026-11-20','2026-12-08','2026-12-25',
];

// ── TOKENS DE ACCESO ──────────────────────────────────────────────────────────
const TOKENS_VALIDOS = ['1417'];
const ADMINS = ['1417'];

// ── COLORES POR TIPO ──────────────────────────────────────────────────────────
const TIPOS = {
  evento:    { label: 'Evento',     color: '#2d6a4f', bg: '#2d6a4f', emoji: '🎉' },
  alquiler:  { label: 'Alquiler',   color: '#40916c', bg: '#40916c', emoji: '📦' },
  reunion:   { label: 'Reunión',    color: '#1d3557', bg: '#1d3557', emoji: '🤝' },
  vacacion:  { label: 'Vacaciones', color: '#c1121f', bg: '#c1121f', emoji: '🏖️' },
  otro:      { label: 'Otro',       color: '#6a0572', bg: '#6a0572', emoji: '📌' },
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const dateKey = (y, m, d) =>
  `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['D','L','M','X','J','V','S'];

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('cal_token') || '');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState(false);

  if (!TOKENS_VALIDOS.includes(token)) {
    return <LoginScreen
      value={tokenInput}
      onChange={setTokenInput}
      onSubmit={() => {
        if (TOKENS_VALIDOS.includes(tokenInput.trim())) {
          localStorage.setItem('cal_token', tokenInput.trim());
          setToken(tokenInput.trim());
        } else {
          setTokenError(true);
          setTimeout(() => setTokenError(false), 2000);
        }
      }}
      error={tokenError}
    />;
  }

  return <Calendario token={token} esAdmin={ADMINS.includes(token)} onLogout={() => {
    localStorage.removeItem('cal_token');
    setToken('');
  }} />;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ value, onChange, onSubmit, error }) {
  return (
    <div style={{ minHeight:'100dvh', background:'#0f0f0f', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px' }}>
      <div style={{ fontSize:'3rem', marginBottom:'16px' }}>📅</div>
      <div style={{ fontFamily:'Georgia, serif', fontSize:'1.6rem', color:'#c5a059', marginBottom:'6px', textAlign:'center' }}>
        Luisina Bagnaroli
      </div>
      <div style={{ fontSize:'0.85rem', color:'rgba(255,255,255,0.4)', marginBottom:'40px', letterSpacing:'2px', textTransform:'uppercase' }}>
        Calendario del equipo
      </div>
      <input
        type="text"
        placeholder="Ingresá tu código de acceso"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit()}
        style={{
          width:'100%', maxWidth:'320px', padding:'16px 20px', borderRadius:'16px',
          background: error ? 'rgba(193,18,31,0.15)' : 'rgba(255,255,255,0.06)',
          border: error ? '1.5px solid #c1121f' : '1.5px solid rgba(197,160,89,0.3)',
          color:'#fff', fontSize:'1rem', textAlign:'center', marginBottom:'14px',
          transition:'all 0.2s'
        }}
      />
      <button
        onClick={onSubmit}
        style={{
          width:'100%', maxWidth:'320px', padding:'16px', borderRadius:'16px',
          background:'linear-gradient(135deg, #c5a059, #a3844a)',
          color:'#111', fontWeight:800, fontSize:'1rem', letterSpacing:'1px'
        }}
      >
        Ingresar
      </button>
      {error && <div style={{ color:'#ff6b6b', fontSize:'0.85rem', marginTop:'12px' }}>Código incorrecto</div>}
    </div>
  );
}

// ── CALENDARIO PRINCIPAL ──────────────────────────────────────────────────────
function Calendario({ token, esAdmin, onLogout }) {
  const hoyStr = hoy();
  const hoyDate = new Date();
  const [anio, setAnio] = useState(hoyDate.getFullYear());
  const [mes, setMes] = useState(hoyDate.getMonth());
  const [eventos, setEventos] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [pantalla, setPantalla] = useState('calendario'); // calendario | ver | crear | editar | productos
  const [productos, setProductos] = useState([]);
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [swipeStart, setSwipeStart] = useState(null);
  const [dirAnim, setDirAnim] = useState(''); // slideInRight | slideInLeft

  // Suscribirse a notificaciones push
  useEffect(() => {
    const suscribirse = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const existente = await reg.pushManager.getSubscription();
        if (existente) return; // Ya suscripto

        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY
        });

        await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub })
        });
      } catch(e) {}
    };
    setTimeout(suscribirse, 2000);
  }, []);

  // Cargar productos de alquiler
  useEffect(() => {
    return onSnapshot(collection(db, 'productos_alquiler'), snap => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Cargar eventos del calendario (colección propia)
  useEffect(() => {
    const haceUnAnioMedio = new Date();
    haceUnAnioMedio.setMonth(haceUnAnioMedio.getMonth() - 18);
    const q = query(
      collection(db, 'cal_eventos'),
      where('fecha', '>=', haceUnAnioMedio.toISOString().slice(0,10)),
      orderBy('fecha')
    );
    return onSnapshot(q, snap => {
      setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Cargar propuestas (de la app principal)
  useEffect(() => {
    return onSnapshot(collection(db, 'propuestas'), snap => {
      setPropuestas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Borrar eventos con más de 18 meses
  useEffect(() => {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 18);
    eventos.forEach(ev => {
      if (ev.fecha < limite.toISOString().slice(0,10)) {
        deleteDoc(doc(db, 'cal_eventos', ev.id)).catch(() => {});
      }
    });
  }, [eventos]);

  // Swipe para cambiar de mes
  const handleTouchStart = e => setSwipeStart(e.touches[0].clientX);
  const handleTouchEnd = e => {
    if (swipeStart === null) return;
    const diff = swipeStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 60) {
      if (diff > 0) cambiarMes(1);
      else cambiarMes(-1);
    }
    setSwipeStart(null);
  };

  const cambiarMes = (dir) => {
    setDirAnim(dir > 0 ? 'slideInRight' : 'slideInLeft');
    setTimeout(() => setDirAnim(''), 350);
    if (dir > 0) {
      if (mes === 11) { setMes(0); setAnio(a => a+1); }
      else setMes(m => m+1);
    } else {
      if (mes === 0) { setMes(11); setAnio(a => a-1); }
      else setMes(m => m-1);
    }
  };

  // Construir grilla del mes
  const primerDia = new Date(anio, mes, 1).getDay();
  const diasEnMes = new Date(anio, mes+1, 0).getDate();
  const diasAnterior = new Date(anio, mes, 0).getDate();
  const totalCeldas = Math.ceil((primerDia + diasEnMes) / 7) * 7;

  // Indexar eventos por fecha
  const eventosPorFecha = {};
  eventos.forEach(ev => {
    if (!eventosPorFecha[ev.fecha]) eventosPorFecha[ev.fecha] = [];
    eventosPorFecha[ev.fecha].push(ev);
  });

  // Propuestas por fecha
  propuestas.forEach(p => {
    if (p.fecha) {
      if (!eventosPorFecha[p.fecha]) eventosPorFecha[p.fecha] = [];
      eventosPorFecha[p.fecha].push({ ...p, _esPropuesta: true });
    }
  });

  const abrirDia = (key, evs) => {
    setDiaSeleccionado(key);
    if (evs && evs.length === 1) {
      setEventoSeleccionado(evs[0]);
      setPantalla('ver');
    } else if (evs && evs.length > 1) {
      setEventoSeleccionado(evs[0]);
      setPantalla('ver');
    } else {
      setEventoSeleccionado(null);
      setPantalla('crear');
    }
  };

  // Próximos eventos (solo del calendario propio, desde hoy)
  const proximos = eventos
    .filter(ev => ev.fecha >= hoyStr && !ev.cancelado)
    .slice(0, 5);

  if (pantalla === 'productos') {
    return <PantallaProductos productos={productos} onVolver={() => setPantalla('calendario')} />;
  }

  if (pantalla === 'ver' && eventoSeleccionado) {
    return <VerEvento
      evento={eventoSeleccionado}
      esAdmin={esAdmin}
      onVolver={() => setPantalla('calendario')}
      onEditar={() => setPantalla('editar')}
      onCancelar={async () => {
        await updateDoc(doc(db, 'cal_eventos', eventoSeleccionado.id), { cancelado: true });
        setPantalla('calendario');
      }}
      onEliminar={async () => {
        if (window.confirm('¿Eliminar este evento?')) {
          await deleteDoc(doc(db, 'cal_eventos', eventoSeleccionado.id));
          setPantalla('calendario');
        }
      }}
    />;
  }

  if (pantalla === 'crear') {
    return <FormEvento
      fechaInicial={diaSeleccionado || hoyStr}
      productos={productos}
      onVolver={() => setPantalla('calendario')}
      onGuardar={async (datos) => {
        await addDoc(collection(db, 'cal_eventos'), {
          ...datos,
          creadoPor: token,
          creadoEn: new Date().toISOString(),
          cancelado: false,
        });
        setPantalla('calendario');
      }}
    />;
  }

  if (pantalla === 'editar' && eventoSeleccionado) {
    return <FormEvento
      evento={eventoSeleccionado}
      fechaInicial={eventoSeleccionado.fecha}
      productos={productos}
      onVolver={() => setPantalla('ver')}
      onGuardar={async (datos) => {
        await updateDoc(doc(db, 'cal_eventos', eventoSeleccionado.id), {
          ...datos,
          modificadoPor: token,
          modificadoEn: new Date().toISOString(),
        });
        setEventoSeleccionado({ ...eventoSeleccionado, ...datos });
        setPantalla('ver');
      }}
    />;
  }

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#0f0f0f', overflow:'hidden' }}>

      {/* HEADER */}
      <div style={{ padding:'44px 20px 10px', background:'#0f0f0f', borderBottom:'1px solid rgba(197,160,89,0.15)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:'10px', letterSpacing:'3px', color:'#c5a059', fontWeight:700, textTransform:'uppercase', marginBottom:'2px' }}>Luisina Bagnaroli</div>
          <div style={{ fontSize:'22px', fontWeight:900, color:'#fff', letterSpacing:'-0.5px' }}>Calendario</div>
        </div>
        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
          <button
            onClick={() => { setDiaSeleccionado(hoyStr); setEventoSeleccionado(null); setPantalla('crear'); }}
            style={{ background:'linear-gradient(135deg, #c5a059, #a3844a)', border:'none', borderRadius:'12px', padding:'8px 16px', color:'#111', fontWeight:800, fontSize:'0.9rem', display:'flex', alignItems:'center', gap:'6px' }}
          >
            + Crear
          </button>
          <button
            onClick={() => setPantalla('productos')}
            style={{ background:'rgba(197,160,89,0.12)', border:'1px solid rgba(197,160,89,0.3)', borderRadius:'12px', padding:'8px 12px', color:'#c5a059', fontWeight:700, fontSize:'0.85rem' }}
          >
            📦
          </button>
          <button onClick={onLogout} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'10px', padding:'8px 10px', color:'rgba(255,255,255,0.4)', fontSize:'0.75rem' }}>
            Salir
          </button>
        </div>
      </div>

      {/* MES NAVEGACIÓN */}
      <div style={{ padding:'8px 20px 6px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <button onClick={() => cambiarMes(-1)} style={{ background:'rgba(197,160,89,0.12)', border:'1px solid rgba(197,160,89,0.25)', borderRadius:'50%', width:'38px', height:'38px', color:'#c5a059', fontSize:'1.1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'26px', fontWeight:900, color:'#fff', letterSpacing:'-1px', lineHeight:1 }}>{MESES[mes]}</div>
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.35)', fontWeight:500 }}>{anio}</div>
        </div>
        <button onClick={() => cambiarMes(1)} style={{ background:'rgba(197,160,89,0.12)', border:'1px solid rgba(197,160,89,0.25)', borderRadius:'50%', width:'38px', height:'38px', color:'#c5a059', fontSize:'1.1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
      </div>

      {/* LEYENDA */}
      <div style={{ padding:'0 20px 4px', display:'flex', gap:'12px', flexWrap:'wrap', flexShrink:0 }}>
        {[['#2d6a4f','Evento'],['#457b9d','Reunión'],['#6c757d','Propuesta'],['#c1121f','Feriado'],['#e9c46a','Notas']].map(([c,l]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
            <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:c }}/>
            <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.4)', fontWeight:600 }}>{l}</span>
          </div>
        ))}
      </div>

      {/* GRILLA CALENDARIO */}
      <div
        style={{ flex:1, padding:'0 10px 4px', overflow:'hidden', display:'flex', flexDirection:'column', animation: dirAnim ? `${dirAnim} 0.35s ease` : 'none' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Días de la semana */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:'4px' }}>
          {DIAS_SEMANA.map(d => (
            <div key={d} style={{ textAlign:'center', fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.25)', letterSpacing:'1px', padding:'4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Días */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px', gridAutoRows:'1fr' }}>
          {Array.from({ length: totalCeldas }, (_, i) => {
            let diaNum, esMes = true;
            if (i < primerDia) { diaNum = diasAnterior - primerDia + i + 1; esMes = false; }
            else if (i >= primerDia + diasEnMes) { diaNum = i - primerDia - diasEnMes + 1; esMes = false; }
            else diaNum = i - primerDia + 1;

            const key = esMes ? dateKey(anio, mes, diaNum) : null;
            const esHoy = key === hoyStr;
            const esFeriado = key && FERIADOS.includes(key);
            const evsDia = key ? eventosPorFecha[key] : null;
            const tieneEventoConfirmado = evsDia?.some(e => !e._esPropuesta && (e.tipo === 'evento' || e.tipo === 'alquiler') && !e.cancelado);
            const tieneReunion = evsDia?.some(e => !e._esPropuesta && e.tipo === 'reunion' && !e.cancelado);
            const tienePropuesta = evsDia?.some(e => e._esPropuesta);
            const tieneNotas = evsDia?.some(e => e.notas && e.notas.trim());
            const tieneCancelado = evsDia?.some(e => e.cancelado);

            let bgColor = 'transparent';
            let borderStyle = 'none';
            let numColor = esMes ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.12)';

            if (tieneEventoConfirmado) { bgColor = '#2d6a4f'; numColor = '#fff'; }
            else if (tieneReunion) { bgColor = '#1d3557'; numColor = '#90caf9'; }
            else if (tienePropuesta) { bgColor = 'rgba(108,117,125,0.2)'; borderStyle = '1px dashed rgba(108,117,125,0.5)'; numColor = 'rgba(255,255,255,0.45)'; }

            if (esHoy && !tieneEventoConfirmado && !tieneReunion) {
              bgColor = 'rgba(197,160,89,0.12)';
              borderStyle = '1.5px solid #c5a059';
              numColor = '#c5a059';
            }

            return (
              <div
                key={i}
                onClick={() => key && esMes && abrirDia(key, evsDia)}
                style={{
                  borderRadius:'10px',
                  background: bgColor,
                  border: borderStyle,
                  display:'flex',
                  flexDirection:'column',
                  alignItems:'center',
                  justifyContent:'center',
                  cursor: esMes ? 'pointer' : 'default',
                  position:'relative',
                  minHeight:'0',
                  transition:'transform 0.1s ease',
                }}
              >
                <span style={{
                  fontSize: tieneEventoConfirmado ? '15px' : '13px',
                  fontWeight: (esHoy || tieneEventoConfirmado) ? 900 : 600,
                  color: esFeriado && !tieneEventoConfirmado ? '#ff6b6b' : numColor,
                  textDecoration: tieneCancelado && !tieneEventoConfirmado ? 'line-through' : 'none',
                  lineHeight:1,
                }}>
                  {diaNum}
                </span>
                {/* Puntos indicadores */}
                {esMes && (tieneNotas || esFeriado) && (
                  <div style={{ display:'flex', gap:'2px', marginTop:'2px' }}>
                    {tieneNotas && <div style={{ width:'3px', height:'3px', borderRadius:'50%', background:'#e9c46a' }}/>}
                    {esFeriado && !tieneEventoConfirmado && <div style={{ width:'3px', height:'3px', borderRadius:'50%', background:'#ff6b6b' }}/>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PRÓXIMOS EVENTOS */}
      {proximos.length > 0 && (
        <div style={{ padding:'12px 16px', background:'#111', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0, maxHeight:'200px', overflowY:'auto' }}>
          <div style={{ fontSize:'10px', letterSpacing:'2px', color:'#c5a059', fontWeight:700, textTransform:'uppercase', marginBottom:'10px' }}>Próximos</div>
          {proximos.map(ev => {
            const tipo = TIPOS[ev.tipo] || TIPOS.otro;
            const [, m, d] = ev.fecha.split('-');
            return (
              <div
                key={ev.id}
                onClick={() => { setEventoSeleccionado(ev); setPantalla('ver'); }}
                style={{ display:'flex', gap:'12px', alignItems:'center', marginBottom:'10px', cursor:'pointer' }}
              >
                <div style={{ width:'42px', height:'42px', borderRadius:'12px', background:tipo.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:'16px', fontWeight:900, color:'#fff', lineHeight:1 }}>{d}</span>
                  <span style={{ fontSize:'9px', color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{MESES[parseInt(m)-1].slice(0,3)}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'9px', color:tipo.color === '#2d6a4f' ? '#40916c' : tipo.color === '#1d3557' ? '#90caf9' : '#c5a059', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'2px' }}>{tipo.emoji} {tipo.label}</div>
                  <div style={{ fontSize:'14px', fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ev.titulo}</div>
                  {ev.precio && <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)' }}>${ev.precio}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ── VER EVENTO ────────────────────────────────────────────────────────────────
function VerEvento({ evento, esAdmin, onVolver, onEditar, onCancelar, onEliminar }) {
  const tipo = TIPOS[evento.tipo] || TIPOS.otro;
  const [,m,d] = (evento.fecha || '').split('-');

  return (
    <div style={{ height:'100dvh', background:'#0f0f0f', display:'flex', flexDirection:'column', animation:'slideInUp 0.3s ease' }}>

      {/* Header */}
      <div style={{ padding:'52px 20px 16px', display:'flex', alignItems:'center', gap:'12px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <button onClick={onVolver} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'10px', padding:'10px 14px', color:'#fff', fontSize:'1.1rem' }}>‹</button>
        <div>
          <div style={{ fontSize:'10px', letterSpacing:'2px', color:tipo.color === '#2d6a4f' ? '#40916c' : tipo.color === '#1d3557' ? '#90caf9' : '#c5a059', fontWeight:700, textTransform:'uppercase' }}>{tipo.emoji} {tipo.label}</div>
          <div style={{ fontSize:'20px', fontWeight:900, color:'#fff' }}>Detalle del evento</div>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>

        {/* Fecha destacada */}
        <div style={{ background:tipo.bg, borderRadius:'20px', padding:'20px', marginBottom:'20px', display:'flex', alignItems:'center', gap:'16px' }}>
          <div style={{ textAlign:'center', minWidth:'60px' }}>
            <div style={{ fontSize:'42px', fontWeight:900, color:'#fff', lineHeight:1 }}>{d}</div>
            <div style={{ fontSize:'14px', color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'1px' }}>{MESES[parseInt(m)-1]}</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'22px', fontWeight:900, color:'#fff', lineHeight:1.2, textDecoration: evento.cancelado ? 'line-through' : 'none' }}>{evento.titulo}</div>
            {evento.cancelado && <div style={{ fontSize:'11px', color:'#ff6b6b', fontWeight:700, marginTop:'4px' }}>● CANCELADO</div>}
            {evento.hora && <div style={{ fontSize:'14px', color:'rgba(255,255,255,0.7)', marginTop:'6px' }}>🕐 {evento.hora}</div>}
          </div>
        </div>

        {/* Precio */}
        {evento.precio && (
          <Campo label="Precio" valor={`$${evento.precio}`} />
        )}

        {/* Notas */}
        {evento.notas && (
          <div style={{ background:'rgba(233,196,106,0.1)', border:'1px solid rgba(233,196,106,0.3)', borderRadius:'16px', padding:'16px', marginBottom:'14px' }}>
            <div style={{ fontSize:'10px', letterSpacing:'2px', color:'#e9c46a', fontWeight:700, textTransform:'uppercase', marginBottom:'8px' }}>🟡 Notas</div>
            <div style={{ fontSize:'15px', color:'#fff', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{evento.notas}</div>
          </div>
        )}

        <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.2)', marginTop:'16px' }}>
          Creado por {evento.creadoPor} · {evento.creadoEn?.slice(0,10)}
        </div>
      </div>

      {/* Botones */}
      {!evento._esPropuesta && (
        <div style={{ padding:'16px 20px 32px', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', flexDirection:'column', gap:'10px', flexShrink:0 }}>
          <button
            onClick={onEditar}
            style={{ padding:'16px', borderRadius:'16px', background:'linear-gradient(135deg, #c5a059, #a3844a)', color:'#111', fontWeight:800, fontSize:'1rem', letterSpacing:'0.5px' }}
          >
            ✏️ Modificar
          </button>
          {!evento.cancelado && (
            <button
              onClick={onCancelar}
              style={{ padding:'14px', borderRadius:'16px', background:'rgba(193,18,31,0.15)', border:'1px solid rgba(193,18,31,0.4)', color:'#ff6b6b', fontWeight:700, fontSize:'0.9rem' }}
            >
              Marcar como cancelado
            </button>
          )}
          {esAdmin && (
            <button
              onClick={onEliminar}
              style={{ padding:'14px', borderRadius:'16px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.3)', fontWeight:600, fontSize:'0.85rem' }}
            >
              Eliminar definitivamente
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:'14px', padding:'14px 16px', marginBottom:'12px' }}>
      <div style={{ fontSize:'10px', letterSpacing:'2px', color:'rgba(255,255,255,0.35)', fontWeight:700, textTransform:'uppercase', marginBottom:'4px' }}>{label}</div>
      <div style={{ fontSize:'16px', color:'#fff', fontWeight:600 }}>{valor}</div>
    </div>
  );
}

// ── FORMULARIO CREAR / EDITAR ─────────────────────────────────────────────────
function FormEvento({ evento, fechaInicial, productos = [], onVolver, onGuardar }) {
  const [tipo, setTipo] = useState(evento?.tipo || 'evento');
  const [titulo, setTitulo] = useState(evento?.titulo || '');
  const [fecha, setFecha] = useState(evento?.fecha || fechaInicial || hoy());
  const [hora, setHora] = useState(evento?.hora || '');
  const [precio, setPrecio] = useState(evento?.precio || '');
  const [notas, setNotas] = useState(evento?.notas || '');
  const [guardando, setGuardando] = useState(false);
  const [itemsAlquiler, setItemsAlquiler] = useState(evento?.itemsAlquiler || []);
  const [descuentoAlquiler, setDescuentoAlquiler] = useState(evento?.descuentoAlquiler || '');
  const [envioAlquiler, setEnvioAlquiler] = useState(evento?.envioAlquiler || '');

  const esEdicion = !!evento;

  const guardar = async () => {
    if (!titulo.trim() || !fecha) return;
    setGuardando(true);
    await onGuardar({ tipo, titulo: titulo.trim(), fecha, hora, precio: precio.trim(), notas: notas.trim(), itemsAlquiler: tipo === 'alquiler' ? itemsAlquiler : [], descuentoAlquiler, envioAlquiler });
    setGuardando(false);
  };

  const tipoActual = TIPOS[tipo];

  return (
    <div style={{ height:'100dvh', background:'#0f0f0f', display:'flex', flexDirection:'column', animation:'slideInUp 0.3s ease' }}>

      {/* Header */}
      <div style={{ padding:'52px 20px 16px', display:'flex', alignItems:'center', gap:'12px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <button onClick={onVolver} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'10px', padding:'10px 14px', color:'#fff', fontSize:'1.1rem' }}>‹</button>
        <div style={{ fontSize:'22px', fontWeight:900, color:'#fff' }}>{esEdicion ? 'Modificar' : 'Nuevo evento'}</div>
      </div>

      {/* Form */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>

        {/* Tipo */}
        <div style={{ marginBottom:'24px' }}>
          <div style={{ fontSize:'11px', letterSpacing:'2px', color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', marginBottom:'12px' }}>Tipo de evento</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {Object.entries(TIPOS).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setTipo(key)}
                style={{
                  padding:'16px 20px',
                  borderRadius:'16px',
                  background: tipo === key ? t.bg : 'rgba(255,255,255,0.04)',
                  border: tipo === key ? `2px solid ${t.color}` : '2px solid transparent',
                  color: '#fff',
                  fontWeight: tipo === key ? 800 : 500,
                  fontSize:'1rem',
                  textAlign:'left',
                  display:'flex',
                  alignItems:'center',
                  gap:'12px',
                  transition:'all 0.2s'
                }}
              >
                <span style={{ fontSize:'1.4rem' }}>{t.emoji}</span>
                <span>{t.label}</span>
                {tipo === key && <span style={{ marginLeft:'auto', fontSize:'1.2rem' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Título */}
        <CampoInput label="Título" placeholder={`Ej: ${tipo === 'alquiler' ? 'Alquiler García' : tipo === 'reunion' ? 'Reunión con Municipio' : 'Casamiento López'}`} value={titulo} onChange={setTitulo} />

        {/* Fecha */}
        <CampoInput label="Fecha" type="date" value={fecha} onChange={setFecha} />

        {/* Hora */}
        <CampoInput label="Hora (opcional)" type="time" value={hora} onChange={setHora} />

        {/* Selector productos alquiler */}
        {tipo === 'alquiler' && (
          <SelectorProductosAlquilerDark
            productos={productos}
            items={itemsAlquiler}
            setItems={setItemsAlquiler}
            descuento={descuentoAlquiler}
            setDescuento={setDescuentoAlquiler}
            envio={envioAlquiler}
            setEnvio={setEnvioAlquiler}
            onAplicar={(texto, total) => {
              setNotas(prev => texto || prev);
              setPrecio(String(total));
            }}
          />
        )}

        {/* Precio */}
        {(tipo === 'evento' || tipo === 'alquiler') && (
          <CampoInput label="Precio (informativo)" placeholder="Ej: 75000" value={precio} onChange={setPrecio} type="number" />
        )}

        {/* Notas */}
        <div style={{ marginBottom:'20px' }}>
          <div style={{ fontSize:'11px', letterSpacing:'2px', color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', marginBottom:'10px' }}>Notas</div>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Ej: 2 mesas&#10;6 sillas&#10;Manteles verdes&#10;Deco floral"
            style={{
              width:'100%', minHeight:'140px', padding:'16px', borderRadius:'16px',
              background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)',
              color:'#fff', fontSize:'1rem', lineHeight:1.6, resize:'none'
            }}
          />
        </div>

      </div>

      {/* Botón guardar */}
      <div style={{ padding:'16px 20px 32px', flexShrink:0 }}>
        <button
          onClick={guardar}
          disabled={!titulo.trim() || !fecha || guardando}
          style={{
            width:'100%', padding:'18px', borderRadius:'18px',
            background: !titulo.trim() || !fecha ? 'rgba(197,160,89,0.3)' : 'linear-gradient(135deg, #c5a059, #a3844a)',
            color: !titulo.trim() || !fecha ? 'rgba(255,255,255,0.3)' : '#111',
            fontWeight:900, fontSize:'1.1rem', letterSpacing:'0.5px',
            transition:'all 0.2s'
          }}
        >
          {guardando ? 'Guardando...' : esEdicion ? '✓ Guardar cambios' : '+ Crear evento'}
        </button>
      </div>
    </div>
  );
}

function CampoInput({ label, placeholder, value, onChange, type = 'text' }) {
  return (
    <div style={{ marginBottom:'20px' }}>
      <div style={{ fontSize:'11px', letterSpacing:'2px', color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', marginBottom:'10px' }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width:'100%', padding:'16px 18px', borderRadius:'16px',
          background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)',
          color:'#fff', fontSize:'1rem',
        }}
      />
    </div>
  );
}


// ── PANTALLA PRODUCTOS ────────────────────────────────────────────────────────
function PantallaProductos({ productos, onVolver }) {
  const [vista, setVista] = useState('lista');
  const [productoEditar, setProductoEditar] = useState(null);
  const [pctAumento, setPctAumento] = useState('');
  const [selPdf, setSelPdf] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const productosFiltrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    await deleteDoc(doc(db, 'productos_alquiler', id)).catch(() => {});
  };

  const aumentarPrecios = async () => {
    const pct = parseFloat(pctAumento);
    if (!pct || isNaN(pct)) return alert('Ingresá un porcentaje válido');
    if (!window.confirm(`¿Aumentar todos los precios un ${pct}%?`)) return;
    setGuardando(true);
    for (const p of productos) {
      const nuevo = Math.ceil((p.precio * (1 + pct/100)) / 100) * 100;
      await updateDoc(doc(db, 'productos_alquiler', p.id), { precio: nuevo }).catch(() => {});
    }
    setPctAumento('');
    setGuardando(false);
    alert('Precios actualizados');
  };

  const toggleSelPdf = (id) => {
    setSelPdf(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const generarPdf = () => {
    const sel = productos.filter(p => selPdf.includes(p.id));
    if (!sel.length) return alert('Seleccioná al menos un producto');
    (() => {
      const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPDF) { alert('Error al generar PDF'); return; }
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const dorado = [197, 160, 89];
      const negro = [15, 15, 15];

      pdf.setFillColor(...negro);
      pdf.rect(0, 0, 210, 40, 'F');
      pdf.setTextColor(...dorado);
      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Luisina Bagnaroli', 105, 18, { align: 'center' });
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('DISEÑO Y PRODUCCIÓN DE EVENTOS', 105, 26, { align: 'center' });
      pdf.setFontSize(9);
      pdf.setTextColor(180, 150, 80);
      pdf.text('Lista de productos para alquiler', 105, 33, { align: 'center' });

      pdf.setTextColor(...negro);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      let y = 52;
      pdf.text('Estimado/a cliente,', 20, y);
      y += 7;
      pdf.text('A continuación encontrará el detalle de los artículos disponibles para su evento.', 20, y, { maxWidth: 170 });
      y += 14;

      pdf.setDrawColor(...dorado);
      pdf.setLineWidth(0.5);
      pdf.line(20, y, 190, y);
      y += 8;

      pdf.setFillColor(...dorado);
      pdf.rect(20, y, 170, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Producto', 23, y + 5.5);
      pdf.text('Detalle', 90, y + 5.5);
      pdf.text('Precio unit.', 188, y + 5.5, { align: 'right' });
      y += 10;

      sel.forEach((p, i) => {
        if (y > 265) { pdf.addPage(); y = 20; }
        if (i % 2 === 0) { pdf.setFillColor(252, 249, 244); pdf.rect(20, y-1, 170, 9, 'F'); }
        pdf.setTextColor(...negro);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(p.nombre || '', 23, y + 5);
        const detalle = [p.material, p.color, p.medidas, p.otro].filter(Boolean).join(' · ');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(detalle, 90, y + 5, { maxWidth: 65 });
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...dorado);
        pdf.text(`$${Number(p.precio || 0).toLocaleString('es-AR')}`, 188, y + 5, { align: 'right' });
        y += 10;
      });

      y += 4;
      pdf.setDrawColor(...dorado);
      pdf.line(20, y, 190, y);
      y += 12;

      pdf.setTextColor(...negro);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.text('Luisina Bagnaroli', 105, y, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(130, 110, 70);
      pdf.text('Diseño y Producción de Eventos', 105, y + 6, { align: 'center' });

      pdf.setFillColor(...negro);
      pdf.rect(0, 282, 210, 15, 'F');
      pdf.setTextColor(...dorado);
      pdf.setFontSize(8);
      pdf.text('luisinabagnaroli.com.ar', 105, 291, { align: 'center' });

      pdf.save('lista-productos-lb.pdf');
    })();
  };

  if (vista === 'nuevo' || vista === 'editar') {
    return <FormProducto
      producto={productoEditar}
      onVolver={() => { setVista('lista'); setProductoEditar(null); }}
    />;
  }

  return (
    <div style={{ height:'100dvh', background:'#0f0f0f', display:'flex', flexDirection:'column', animation:'slideInUp 0.3s ease' }}>
      <div style={{ padding:'44px 20px 12px', borderBottom:'1px solid rgba(197,160,89,0.15)', display:'flex', alignItems:'center', gap:'12px', flexShrink:0 }}>
        <button onClick={onVolver} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'10px', padding:'10px 14px', color:'#fff', fontSize:'1.1rem' }}>‹</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'10px', letterSpacing:'3px', color:'#c5a059', fontWeight:700, textTransform:'uppercase' }}>Luisina Bagnaroli</div>
          <div style={{ fontSize:'20px', fontWeight:900, color:'#fff' }}>📦 Productos para alquiler</div>
        </div>
        <button onClick={() => { setProductoEditar(null); setVista('nuevo'); }}
          style={{ background:'linear-gradient(135deg, #c5a059, #a3844a)', border:'none', borderRadius:'10px', padding:'8px 14px', color:'#111', fontWeight:800, fontSize:'0.85rem' }}>
          + Nuevo
        </button>
      </div>

      <div style={{ padding:'12px 20px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', gap:'8px', alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
        <input value={pctAumento} onChange={e => setPctAumento(e.target.value)}
          placeholder="% aumento" type="number"
          style={{ width:'90px', padding:'8px 10px', borderRadius:'10px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:'0.85rem' }}
        />
        <button onClick={aumentarPrecios} disabled={guardando}
          style={{ padding:'8px 12px', borderRadius:'10px', background:'rgba(197,160,89,0.15)', border:'1px solid rgba(197,160,89,0.3)', color:'#c5a059', fontWeight:700, fontSize:'0.8rem' }}>
          Aplicar aumento
        </button>
        <button onClick={() => { setVista(vista === 'pdf' ? 'lista' : 'pdf'); setSelPdf([]); }}
          style={{ padding:'8px 12px', borderRadius:'10px', background: vista === 'pdf' ? 'rgba(197,160,89,0.2)' : 'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color: vista === 'pdf' ? '#c5a059' : 'rgba(255,255,255,0.6)', fontWeight:700, fontSize:'0.8rem', marginLeft:'auto' }}>
          📄 PDF cliente
        </button>
      </div>

      {vista === 'pdf' && (
        <div style={{ padding:'10px 20px', background:'rgba(197,160,89,0.06)', borderBottom:'1px solid rgba(197,160,89,0.15)', flexShrink:0 }}>
          <div style={{ fontSize:'11px', color:'#c5a059', marginBottom:'8px' }}>Seleccioná los productos para el PDF:</div>
          <button onClick={generarPdf}
            style={{ width:'100%', padding:'10px', borderRadius:'12px', background:'linear-gradient(135deg, #c5a059, #a3844a)', color:'#111', fontWeight:800, fontSize:'0.9rem' }}>
            Generar PDF ({selPdf.length} seleccionados)
          </button>
        </div>
      )}

      <div style={{ padding:'10px 20px 0', flexShrink:0 }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          style={{ width:'100%', padding:'10px 14px', borderRadius:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', color:'#fff', fontSize:'0.9rem' }}
        />
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'12px 20px' }}>
        {productosFiltrados.length === 0 && (
          <div style={{ textAlign:'center', color:'rgba(255,255,255,0.3)', padding:'40px 0', fontSize:'0.9rem' }}>
            No hay productos cargados
          </div>
        )}
        {productosFiltrados.map(p => (
          <div key={p.id}
            style={{ background: vista === 'pdf' && selPdf.includes(p.id) ? 'rgba(197,160,89,0.12)' : '#111', borderRadius:'14px', padding:'14px 16px', marginBottom:'10px', border: vista === 'pdf' && selPdf.includes(p.id) ? '1.5px solid #c5a059' : '1px solid rgba(255,255,255,0.05)', cursor: vista === 'pdf' ? 'pointer' : 'default' }}
            onClick={() => vista === 'pdf' && toggleSelPdf(p.id)}
          >
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                  {vista === 'pdf' && (
                    <div style={{ width:'18px', height:'18px', borderRadius:'4px', border:'1.5px solid #c5a059', background: selPdf.includes(p.id) ? '#c5a059' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:'#111', flexShrink:0 }}>
                      {selPdf.includes(p.id) ? '✓' : ''}
                    </div>
                  )}
                  <div style={{ fontSize:'15px', fontWeight:800, color:'#fff' }}>{p.nombre}</div>
                </div>
                <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>
                  {[p.material, p.color, p.medidas, p.otro].filter(Boolean).join(' · ')}
                </div>
                <div style={{ display:'flex', gap:'16px', marginTop:'6px' }}>
                  <span style={{ fontSize:'13px', color:'#c5a059', fontWeight:700 }}>${Number(p.precio || 0).toLocaleString('es-AR')}</span>
                  <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.3)' }}>Stock: {p.stock}</span>
                </div>
              </div>
              {vista !== 'pdf' && (
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  <button onClick={() => { setProductoEditar(p); setVista('editar'); }}
                    style={{ padding:'6px 10px', borderRadius:'8px', background:'rgba(197,160,89,0.12)', border:'1px solid rgba(197,160,89,0.3)', color:'#c5a059', fontSize:'0.75rem', fontWeight:700 }}>
                    Editar
                  </button>
                  <button onClick={() => eliminar(p.id)}
                    style={{ padding:'6px 10px', borderRadius:'8px', background:'rgba(193,18,31,0.1)', border:'1px solid rgba(193,18,31,0.3)', color:'#ff6b6b', fontSize:'0.75rem', fontWeight:700 }}>
                    Borrar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FORMULARIO PRODUCTO ───────────────────────────────────────────────────────
function FormProducto({ producto, onVolver }) {
  const [nombre, setNombre] = useState(producto?.nombre || '');
  const [stock, setStock] = useState(producto?.stock || '');
  const [precio, setPrecio] = useState(producto?.precio || '');
  const [color, setColor] = useState(producto?.color || '');
  const [medidas, setMedidas] = useState(producto?.medidas || '');
  const [material, setMaterial] = useState(producto?.material || '');
  const [otro, setOtro] = useState(producto?.otro || '');
  const [guardando, setGuardando] = useState(false);
  const esEdicion = !!producto;

  const precioRedondeado = precio ? Math.ceil(Number(precio) / 100) * 100 : null;

  const guardar = async () => {
    if (!nombre.trim() || !precio) return;
    setGuardando(true);
    const datos = {
      nombre: nombre.trim(),
      stock: Number(stock) || 0,
      precio: precioRedondeado,
      color: color.trim(),
      medidas: medidas.trim(),
      material: material.trim(),
      otro: otro.trim(),
      actualizado: new Date().toISOString()
    };
    if (esEdicion) {
      await updateDoc(doc(db, 'productos_alquiler', producto.id), datos).catch(() => {});
    } else {
      await addDoc(collection(db, 'productos_alquiler'), { ...datos, creadoEn: new Date().toISOString() }).catch(() => {});
    }
    setGuardando(false);
    onVolver();
  };

  const campos = [
    { label:'Nombre *', val:nombre, set:setNombre, ph:'Ej: Silla Tiffany' },
    { label:'Stock total', val:String(stock), set:setStock, ph:'Ej: 10', type:'number' },
    { label:'Precio unitario *', val:String(precio), set:setPrecio, ph:'Ej: 2500', type:'number' },
    { label:'Color', val:color, set:setColor, ph:'Ej: Blanca' },
    { label:'Medidas', val:medidas, set:setMedidas, ph:'Ej: 45x45x90 cm' },
    { label:'Material', val:material, set:setMaterial, ph:'Ej: Resina reforzada' },
    { label:'Otro', val:otro, set:setOtro, ph:'Ej: Adulto' },
  ];

  return (
    <div style={{ height:'100dvh', background:'#0f0f0f', display:'flex', flexDirection:'column', animation:'slideInUp 0.3s ease' }}>
      <div style={{ padding:'44px 20px 16px', display:'flex', alignItems:'center', gap:'12px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <button onClick={onVolver} style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'10px', padding:'10px 14px', color:'#fff', fontSize:'1.1rem' }}>‹</button>
        <div style={{ fontSize:'20px', fontWeight:900, color:'#fff' }}>{esEdicion ? 'Editar producto' : 'Nuevo producto'}</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
        {campos.map(({ label, val, set, ph, type = 'text' }) => (
          <div key={label} style={{ marginBottom:'18px' }}>
            <div style={{ fontSize:'10px', letterSpacing:'2px', color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', marginBottom:'8px' }}>{label}</div>
            <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
              style={{ width:'100%', padding:'14px 16px', borderRadius:'14px', background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:'1rem' }}
            />
          </div>
        ))}
        {precioRedondeado && Number(precio) !== precioRedondeado && (
          <div style={{ fontSize:'12px', color:'#c5a059', marginTop:'-10px', marginBottom:'16px' }}>
            Se guardará como: ${precioRedondeado.toLocaleString('es-AR')}
          </div>
        )}
      </div>
      <div style={{ padding:'16px 20px 32px', flexShrink:0 }}>
        <button onClick={guardar} disabled={!nombre.trim() || !precio || guardando}
          style={{ width:'100%', padding:'18px', borderRadius:'18px', background: !nombre.trim() || !precio ? 'rgba(197,160,89,0.3)' : 'linear-gradient(135deg, #c5a059, #a3844a)', color: !nombre.trim() || !precio ? 'rgba(255,255,255,0.3)' : '#111', fontWeight:900, fontSize:'1.1rem' }}>
          {guardando ? 'Guardando...' : esEdicion ? '✓ Guardar cambios' : '+ Crear producto'}
        </button>
      </div>
    </div>
  );
}

// ── SELECTOR PRODUCTOS ALQUILER (dark) ───────────────────────────────────────
function SelectorProductosAlquilerDark({ productos, items, setItems, descuento, setDescuento, envio, setEnvio, onAplicar }) {
  const [abierto, setAbierto] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState('');

  const agregarProducto = (prod) => {
    if (items.find(i => i.id === prod.id)) return;
    setItems(prev => [...prev, {
      id: prod.id,
      nombre: prod.nombre,
      material: prod.material,
      color: prod.color,
      medidas: prod.medidas,
      otro: prod.otro,
      precio: prod.precio,
      precioCustom: prod.precio,
      cantidad: 1,
      disponible: prod.stock || 0
    }]);
  };

  const actualizarItem = (id, campo, valor) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [campo]: valor } : i));
  };

  const quitarItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const subtotal = items.reduce((acc, i) => acc + (Number(i.precioCustom)||0) * (Number(i.cantidad)||1), 0);
  const descuentoNum = Number(descuento) || 0;
  const envioNum = Number(envio) || 0;
  const total = subtotal - descuentoNum + envioNum;

  const aplicar = () => {
    const lineas = items.map(i => {
      const cant = Number(i.cantidad) || 1;
      const precio = Number(i.precioCustom) || 0;
      const detalle = [i.material, i.color, i.medidas, i.otro].filter(Boolean).join(' · ');
      return `${cant}x ${i.nombre}${detalle ? ` (${detalle})` : ''} — $${(precio * cant).toLocaleString('es-AR')}`;
    });
    if (descuentoNum > 0) lineas.push(`Descuento — -$${descuentoNum.toLocaleString('es-AR')}`);
    if (envioNum > 0) lineas.push(`Envío — $${envioNum.toLocaleString('es-AR')}`);
    lineas.push(`TOTAL: $${total.toLocaleString('es-AR')}`);
    onAplicar(lineas.join('\n'), total);
  };

  const productosFiltrados = productos.filter(p =>
    !items.find(i => i.id === p.id) &&
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={{ marginBottom: '20px', border: '1.5px solid rgba(197,160,89,0.3)', borderRadius: '16px', overflow: 'hidden' }}>
      <div onClick={() => setAbierto(p => !p)}
        style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'rgba(197,160,89,0.1)' }}>
        <div style={{ fontWeight: 700, color: '#c5a059', fontSize: '0.9rem' }}>
          📦 Productos para alquiler {items.length > 0 ? `(${items.length})` : ''}
        </div>
        <div style={{ color: '#c5a059' }}>{abierto ? '▲' : '▼'}</div>
      </div>

      {abierto && (
        <div style={{ padding: '16px 18px' }}>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem', marginBottom: '10px', boxSizing: 'border-box' }}
          />

          {productosFiltrados.length > 0 && (
            <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {productosFiltrados.map(p => (
                <div key={p.id} onClick={() => agregarProducto(p)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fff' }}>{p.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{[p.material, p.color, p.medidas, p.otro].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#c5a059', fontWeight: 700, fontSize: '0.85rem' }}>${Number(p.precio||0).toLocaleString('es-AR')}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>Stock: {p.stock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {items.map(item => (
            <div key={item.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px', marginBottom: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>{item.nombre}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{[item.material, item.color, item.medidas, item.otro].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => quitarItem(item.id)}
                  style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: '3px' }}>CANTIDAD (máx {item.disponible})</div>
                  <input type="number" min="1" max={item.disponible} value={item.cantidad}
                    onChange={e => actualizarItem(item.id, 'cantidad', Math.min(Number(e.target.value), item.disponible))}
                    style={{ width: '75px', padding: '7px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: '3px' }}>PRECIO UNIT.</div>
                  <input type="number" value={item.precioCustom}
                    onChange={e => actualizarItem(item.id, 'precioCustom', Number(e.target.value))}
                    style={{ width: '105px', padding: '7px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem' }}
                  />
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Subtotal</div>
                  <div style={{ fontWeight: 800, color: '#c5a059' }}>${((Number(item.precioCustom)||0)*(Number(item.cantidad)||1)).toLocaleString('es-AR')}</div>
                </div>
              </div>
            </div>
          ))}

          {items.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', color: '#ff6b6b', fontWeight: 800, marginBottom: '4px' }}>DESCUENTO</div>
                  <input type="number" value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="0"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: 'rgba(193,18,31,0.1)', border: '1.5px solid rgba(193,18,31,0.4)', color: '#ff6b6b', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', color: '#40916c', fontWeight: 800, marginBottom: '4px' }}>ENVÍO</div>
                  <input type="number" value={envio} onChange={e => setEnvio(e.target.value)} placeholder="0"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: 'rgba(45,106,79,0.15)', border: '1.5px solid rgba(45,106,79,0.4)', color: '#40916c', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                  <span>Subtotal</span><span>${subtotal.toLocaleString('es-AR')}</span>
                </div>
                {descuentoNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#ff6b6b', fontWeight: 700, marginBottom: '4px' }}>
                    <span>— Descuento</span><span>-${descuentoNum.toLocaleString('es-AR')}</span>
                  </div>
                )}
                {envioNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#40916c', fontWeight: 700, marginBottom: '4px' }}>
                    <span>+ Envío</span><span>${envioNum.toLocaleString('es-AR')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: '#c5a059', fontWeight: 900, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', marginTop: '6px' }}>
                  <span>TOTAL</span><span>${total.toLocaleString('es-AR')}</span>
                </div>
              </div>

              <button onClick={aplicar}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg, #c5a059, #a3844a)', border: 'none', color: '#111', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                ✓ Aplicar a notas y precio
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
