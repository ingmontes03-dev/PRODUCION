/*
 * PLANTA OP · Gestión integral de Órdenes de Producción (maquila, marcación, inventario, finanzas y KPIs)
 *
 * Persistencia: 100% Supabase (sin localStorage ni fila única de estado).
 *
 * INSTALACIÓN (Vite + React):
 *   npm i lucide-react @supabase/supabase-js
 *   Tailwind CSS configurado (content: ./src/**\/*.{js,jsx})
 *   .env  ->  VITE_SUPABASE_URL=...   VITE_SUPABASE_ANON_KEY=...
 *
 * ESQUEMA: sus 4 tablas (profiles, ordenes_produccion, inventario, configuracion_precios)
 * cubren perfiles, datos base de OP, inventario y precios. Los módulos de maquila, nómina,
 * facturas/finanzas, calidad y logística necesitan columnas y tablas adicionales — corra este
 * SQL una sola vez en el SQL Editor de Supabase antes de usar la app:
 *
 *   alter table ordenes_produccion
 *     add column if not exists codigo text,
 *     add column if not exists producto text,
 *     add column if not exists cantidad integer default 0,
 *     add column if not exists fecha_prometida date,
 *     add column if not exists fecha_cierre date,
 *     add column if not exists presupuesto_marcacion numeric default 0,
 *     add column if not exists presupuesto_maquila numeric default 0,
 *     add column if not exists presupuesto_empaque numeric default 0,
 *     add column if not exists presupuesto_transporte numeric default 0,
 *     add column if not exists presupuesto_aprobado boolean default false,
 *     add column if not exists margen numeric default 30,
 *     add column if not exists ficha_ubicacion text,
 *     add column if not exists ficha_temperatura text,
 *     add column if not exists ficha_tiempo text,
 *     add column if not exists ficha_presion text,
 *     add column if not exists ficha_insumos text,
 *     add column if not exists ficha_cuidados text,
 *     add column if not exists empaque_cajas integer default 0,
 *     add column if not exists empaque_por_caja integer default 0;
 *
 *   create table if not exists maquila_registros (
 *     id bigint generated always as identity primary key,
 *     orden_id bigint references ordenes_produccion(id) on delete cascade,
 *     operario text not null, fecha date not null default current_date,
 *     horas numeric not null default 0, tarifa numeric not null default 0
 *   );
 *   create table if not exists facturas (
 *     id bigint generated always as identity primary key,
 *     orden_id bigint references ordenes_produccion(id) on delete cascade,
 *     categoria text not null check (categoria in ('marcacion','maquila','empaque','transporte')),
 *     tecnica text, proveedor text, numero text,
 *     valor numeric not null default 0, fecha date not null default current_date
 *   );
 *   create table if not exists no_conformidades (
 *     id bigint generated always as identity primary key,
 *     orden_id bigint references ordenes_produccion(id) on delete cascade,
 *     tipo text, operario text, descripcion text, fecha date not null default current_date
 *   );
 *   create table if not exists traslados (
 *     id bigint generated always as identity primary key,
 *     orden_id bigint references ordenes_produccion(id) on delete cascade,
 *     origen text, destino text, comprobante_url text, fecha date not null default current_date
 *   );
 *   create table if not exists gastos (
 *     id bigint generated always as identity primary key,
 *     orden_id bigint references ordenes_produccion(id) on delete cascade,
 *     concepto text, valor numeric not null default 0, fecha date not null default current_date
 *   );
 *   create table if not exists consumos_insumos (
 *     id bigint generated always as identity primary key,
 *     orden_id bigint references ordenes_produccion(id) on delete cascade,
 *     insumo_id bigint references inventario(id) on delete set null,
 *     cantidad numeric not null default 0, fecha date not null default current_date, rol text
 *   );
 *
 *   alter table ordenes_produccion enable row level security;
 *   alter table inventario enable row level security;
 *   alter table configuracion_precios enable row level security;
 *   alter table maquila_registros enable row level security;
 *   alter table facturas enable row level security;
 *   alter table no_conformidades enable row level security;
 *   alter table traslados enable row level security;
 *   alter table gastos enable row level security;
 *   alter table consumos_insumos enable row level security;
 *   alter table profiles enable row level security;
 *   create policy "acceso_app" on ordenes_produccion for all using (true) with check (true);
 *   create policy "acceso_app" on inventario for all using (true) with check (true);
 *   create policy "acceso_app" on configuracion_precios for all using (true) with check (true);
 *   create policy "acceso_app" on maquila_registros for all using (true) with check (true);
 *   create policy "acceso_app" on facturas for all using (true) with check (true);
 *   create policy "acceso_app" on no_conformidades for all using (true) with check (true);
 *   create policy "acceso_app" on traslados for all using (true) with check (true);
 *   create policy "acceso_app" on gastos for all using (true) with check (true);
 *   create policy "acceso_app" on consumos_insumos for all using (true) with check (true);
 *   create policy "acceso_app" on profiles for all using (true) with check (true);
 *   -- Estas policies quedan abiertas para desarrollo; en producción restrinja con Supabase Auth.
 *
 * Nota: configuracion_precios debe tener una fila con tipo_material='textil' y otra con 'uv'
 * (la calculadora las crea si no existen, con precio_metro en 0, para que usted los edite).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LayoutDashboard, ClipboardList, Users, Package, DollarSign, Calculator, Truck,
  ShieldCheck, Factory, AlertTriangle, Plus, Trash2, Lock, CheckCircle2, XCircle,
  LogOut, Wrench, Clock, FileText, Image as ImageIcon, Loader2, UserPlus,
} from 'lucide-react';

/* ───────────── Supabase ───────────── */
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
// Valores por defecto = su proyecto real de Supabase (el .env, si existe, tiene prioridad).
// Nota: la URL del cliente JS es la raíz del proyecto, sin el sufijo /rest/v1/ que trae la API REST.
const SUPA_URL = env.VITE_SUPABASE_URL || 'https://bqpcbslqgvimxscfbhwt.supabase.co';
const SUPA_KEY = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_kYoU51Sx3mtt-lQfPKzByQ_rqhdvpSD';
const supabase = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;

/* ───────────── Utilidades ───────────── */
const today = () => new Date().toISOString().slice(0, 10);
const cop = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const num = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const daysTo = (d) => (d ? Math.ceil((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null);
const cx = (...a) => a.filter(Boolean).join(' ');
const CATS = { marcacion: 'Marcación', maquila: 'Maquila', empaque: 'Empaque', transporte: 'Transporte' };
const presTotal = (o) => num(o.presupuesto_marcacion) + num(o.presupuesto_maquila) + num(o.presupuesto_empaque) + num(o.presupuesto_transporte);
const opLabel = (rows, id) => rows.find((o) => o.id === id)?.codigo || '—';

/* Costos reales de una OP por categoría, a partir de facturas / maquila / gastos */
function costos(store, op) {
  const f = (c) => store.facturas.rows.filter((x) => x.orden_id === op.id && x.categoria === c).reduce((s, x) => s + num(x.valor), 0);
  const maq = store.maquila.rows.filter((m) => m.orden_id === op.id).reduce((s, m) => s + num(m.horas) * num(m.tarifa), 0);
  const tr = store.gastos.rows.filter((g) => g.orden_id === op.id).reduce((s, g) => s + num(g.valor), 0);
  const c = { marcacion: f('marcacion'), maquila: maq + f('maquila'), empaque: f('empaque'), transporte: tr + f('transporte') };
  c.total = c.marcacion + c.maquila + c.empaque + c.transporte;
  return c;
}

/* ───────────── Hook genérico de tabla Supabase (fetch + CRUD + realtime) ───────────── */
function useTable(table, { orderBy = 'id', ascending = true } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending });
    if (error) setError(error.message); else { setRows(data || []); setError(null); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  const insert = async (row) => {
    const { data, error } = await supabase.from(table).insert(row).select();
    if (error) { setError(error.message); return { error }; }
    setRows((r) => [...r, ...data]);
    return { data };
  };
  const update = async (id, patch) => {
    const { data, error } = await supabase.from(table).update(patch).eq('id', id).select();
    if (error) { setError(error.message); return { error }; }
    setRows((r) => r.map((x) => (x.id === id ? data[0] : x)));
    return { data };
  };
  const remove = async (id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { setError(error.message); return { error }; }
    setRows((r) => r.filter((x) => x.id !== id));
    return {};
  };
  return { rows, loading, error, insert, update, remove, reload: load };
}

function useStore() {
  const profiles = useTable('profiles', { orderBy: 'nombre' });
  const ordenes = useTable('ordenes_produccion', { orderBy: 'id' });
  const inventario = useTable('inventario', { orderBy: 'item' });
  const precios = useTable('configuracion_precios', { orderBy: 'tipo_material' });
  const maquila = useTable('maquila_registros', { orderBy: 'fecha' });
  const facturas = useTable('facturas', { orderBy: 'fecha' });
  const nc = useTable('no_conformidades', { orderBy: 'fecha' });
  const traslados = useTable('traslados', { orderBy: 'fecha' });
  const gastos = useTable('gastos', { orderBy: 'fecha' });
  const consumos = useTable('consumos_insumos', { orderBy: 'fecha' });
  const all = { profiles, ordenes, inventario, precios, maquila, facturas, nc, traslados, gastos, consumos };
  const loading = Object.values(all).some((t) => t.loading);
  const errors = Object.entries(all).filter(([, t]) => t.error).map(([k, t]) => `${k}: ${t.error}`);
  return { ...all, loading, errors };
}

/* ───────────── UI kit ───────────── */
const ic = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';
const Card = ({ title, icon: I, right, children, className }) => (
  <section className={cx('rounded-lg border border-slate-300 bg-white', className)}>
    {title && (
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">{I && <I size={17} className="text-amber-600" />}{title}</h3>{right}
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);
const Btn = ({ children, onClick, v = 'pri', disabled, className }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={cx('inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
      v === 'pri' && 'bg-[#12343B] text-white hover:bg-[#1d4b55]', v === 'acc' && 'bg-amber-500 text-slate-900 hover:bg-amber-400',
      v === 'red' && 'bg-red-600 text-white hover:bg-red-500', v === 'ghost' && 'border border-slate-300 hover:bg-slate-100', className)}>
    {children}
  </button>
);
const Field = ({ label, children }) => <label className="block text-xs font-medium text-slate-600">{label}<div className="mt-1">{children}</div></label>;
const Inp = ({ label, ...p }) => <Field label={label}><input className={ic} {...p} /></Field>;
const Sel = ({ label, children, ...p }) => <Field label={label}><select className={ic} {...p}>{children}</select></Field>;
const Area = ({ label, ...p }) => <Field label={label}><textarea rows={2} className={ic} {...p} /></Field>;
const Table = ({ heads, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">{heads.map((h) => <th key={h} className="whitespace-nowrap py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
    {React.Children.count(children) === 0 && <p className="py-4 text-center text-sm text-slate-400">{empty || 'Sin registros todavía.'}</p>}
  </div>
);
const Pill = ({ ok, children }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', ok === true && 'bg-emerald-100 text-emerald-800', ok === false && 'bg-red-100 text-red-800', ok == null && 'bg-slate-100 text-slate-600')}>{children}</span>
);
const OpSel = ({ ordenes, value, onChange, onlyOpen }) => (
  <Sel label="Orden de producción" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">Seleccione una OP</option>
    {ordenes.filter((o) => !onlyOpen || o.estado === 'Abierta').map((o) => <option key={o.id} value={o.id}>{o.codigo || `OP #${o.id}`} · {o.cliente}</option>)}
  </Sel>
);
const useForm = (init) => {
  const [f, setF] = useState(init);
  return [f, (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value })), () => setF(init), setF];
};
const ErrBanner = ({ errors }) => !errors.length ? null : (
  <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
    <AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><b>Error de Supabase:</b> {errors.join(' · ')}</div>
  </div>
);

/* ───────────── Dashboard + KPIs ───────────── */
function Dashboard({ store }) {
  const rows = store.ordenes.rows.map((o) => {
    const ncCount = store.nc.rows.filter((n) => n.orden_id === o.id).length;
    const cerr = o.estado === 'Cerrada';
    const d = daysTo(o.fecha_prometida);
    return { o, ncCount, cal: ncCount === 0 ? 100 : 0, otif: cerr ? (o.fecha_cierre && o.fecha_prometida && o.fecha_cierre <= o.fecha_prometida ? 100 : 0) : null, d };
  });
  const cerradas = rows.filter((r) => r.otif !== null);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const low = store.inventario.rows.filter((i) => num(i.cantidad) < num(i.minimo));
  const Kpi = ({ label, val, sub }) => (
    <div className="rounded-lg border border-slate-300 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{val}</p><p className="text-xs text-slate-500">{sub}</p></div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="OPs abiertas" val={rows.filter((r) => r.o.estado === 'Abierta').length} sub={`${cerradas.length} cerradas`} />
        <Kpi label="Calidad promedio (cero defectos)" val={avg(rows.map((r) => r.cal)) === null ? '—' : avg(rows.map((r) => r.cal)) + '%'} sub="Sobre todas las OPs" />
        <Kpi label="Cumplimiento de entrega (OTIF)" val={avg(cerradas.map((r) => r.otif)) === null ? '—' : avg(cerradas.map((r) => r.otif)) + '%'} sub="Sobre OPs cerradas" />
        <Kpi label="Insumos en stock bajo" val={low.length} sub={low.map((i) => i.item).slice(0, 2).join(', ') || 'Todo en orden'} />
      </div>
      <Card title="Indicadores por orden de producción" icon={LayoutDashboard}>
        <Table heads={['OP', 'Cliente', 'Entrega pactada', 'Días', 'Calidad', 'Entrega (OTIF)', 'Estado']}>
          {rows.map(({ o, ncCount, cal, otif, d }) => (
            <tr key={o.id}>
              <td className="py-2 pr-4 font-semibold">{o.codigo || `OP #${o.id}`}</td><td className="pr-4">{o.cliente}</td><td className="pr-4">{o.fecha_prometida || '—'}</td>
              <td className={cx('pr-4', o.estado === 'Abierta' && d !== null && d <= 2 && 'font-bold text-red-600')}>{o.estado === 'Abierta' ? (d ?? '—') : '—'}</td>
              <td className="pr-4">{cal === 100 ? <Pill ok>🟢 100% · Aprobado</Pill> : <Pill ok={false}>🔴 0% · En revisión ({ncCount})</Pill>}</td>
              <td className="pr-4">{otif === null ? <Pill>Pendiente de cierre</Pill> : otif === 100 ? <Pill ok>🟢 100% · A tiempo</Pill> : <Pill ok={false}>🔴 0% · Atrasado</Pill>}</td>
              <td><Pill ok={o.estado === 'Cerrada' ? true : null}>{o.estado}</Pill></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* ───────────── Órdenes de producción, montajes y ficha técnica ───────────── */
function Ops({ store, can, perfil }) {
  const [sel, setSel] = useState('');
  const [f, set, reset] = useForm({ cliente: '', producto: '', cantidad: '', fecha_prometida: today(), marcacion: '', maquila: '', empaque: '', transporte: '', margen: 30 });
  const crear = async () => {
    if (!can || !f.cliente || !f.producto) return;
    const codigo = 'OP-' + String(store.ordenes.rows.length + 1).padStart(3, '0');
    const { data, error } = await store.ordenes.insert({
      codigo, cliente: f.cliente, producto: f.producto, cantidad: num(f.cantidad), estado: 'Abierta',
      fecha_prometida: f.fecha_prometida, presupuesto_marcacion: num(f.marcacion), presupuesto_maquila: num(f.maquila),
      presupuesto_empaque: num(f.empaque), presupuesto_transporte: num(f.transporte), presupuesto_aprobado: false,
      margen: num(f.margen), creado_por: perfil?.id ?? null,
    });
    if (!error) { setSel(data[0].id); reset(); }
  };
  const op = store.ordenes.rows.find((o) => o.id === sel);
  return (
    <div className="space-y-4">
      <Card title="Nueva orden de producción" icon={Plus}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Inp label="Cliente" value={f.cliente} onChange={set('cliente')} />
          <Inp label="Producto" value={f.producto} onChange={set('producto')} />
          <Inp label="Cantidad" type="number" value={f.cantidad} onChange={set('cantidad')} />
          <Inp label="Fecha prometida de entrega" type="date" value={f.fecha_prometida} onChange={set('fecha_prometida')} />
          {Object.entries(CATS).map(([k, l]) => <Inp key={k} label={`Presupuesto ${l.toLowerCase()} (COP)`} type="number" value={f[k]} onChange={set(k)} />)}
          <Inp label="Margen de utilidad (%)" type="number" value={f.margen} onChange={set('margen')} />
          <div className="flex items-end"><Btn onClick={crear} disabled={!can}><Plus size={15} />Crear OP</Btn></div>
        </div>
        {!can && <p className="mt-2 text-xs text-slate-400">Solo el Admin / Líder de planta crea nuevas OPs.</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        {store.ordenes.rows.map((o) => (
          <button key={o.id} onClick={() => setSel(o.id)} className={cx('rounded-md border px-3 py-1.5 text-sm', sel === o.id ? 'border-[#12343B] bg-[#12343B] text-white' : 'border-slate-300 bg-white hover:bg-slate-100')}>
            {o.codigo || `OP #${o.id}`} · {o.cliente} {o.estado === 'Cerrada' && '🔒'}
          </button>
        ))}
      </div>
      {op && <OpDetail key={op.id} op={op} store={store} can={can} />}
    </div>
  );
}

function OpDetail({ op, store, can }) {
  const patch = (p) => store.ordenes.update(op.id, p);
  const fp = (k) => (e) => patch({ [k]: e.target.value });
  const cerr = op.estado === 'Cerrada';
  const ro = !can || cerr;
  const isPdf = /\.pdf(\?|$)/i.test(op.link_diseno || '');
  const cerrar = () => {
    if (!can) return;
    if (window.confirm(`¿Cerrar y finalizar ${op.codigo}? Esta acción registra la fecha real de cierre.`)) patch({ estado: 'Cerrada', fecha_cierre: today() });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`${op.codigo || `OP #${op.id}`} · ${op.producto || ''}`} icon={ClipboardList}
        right={cerr ? <Pill ok>Cerrada el {op.fecha_cierre}</Pill> : can
          ? <Btn v="acc" onClick={cerrar}><CheckCircle2 size={15} />Cerrar y finalizar OP</Btn>
          : <Pill><Lock size={12} />Solo el líder cierra</Pill>}>
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Cliente" value={op.cliente || ''} disabled={ro} onChange={fp('cliente')} />
          <Inp label="Cantidad" type="number" value={op.cantidad || 0} disabled={ro} onChange={(e) => patch({ cantidad: num(e.target.value) })} />
          <Inp label="Fecha prometida" type="date" value={op.fecha_prometida || ''} disabled={ro} onChange={fp('fecha_prometida')} />
          <Inp label="Margen de utilidad (%)" type="number" value={op.margen ?? 30} disabled={ro} onChange={(e) => patch({ margen: num(e.target.value) })} />
          {Object.entries(CATS).map(([k, l]) => <Inp key={k} label={`Presupuesto ${l.toLowerCase()}`} type="number" value={op[`presupuesto_${k}`] || 0} disabled={ro} onChange={(e) => patch({ [`presupuesto_${k}`]: num(e.target.value) })} />)}
          <div className="col-span-2"><Area label="Notas" value={op.notas || ''} disabled={ro} onChange={fp('notas')} /></div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm">
          <span>Presupuesto total: <b>{cop(presTotal(op))}</b></span>
          <Btn v={op.presupuesto_aprobado ? 'ghost' : 'acc'} disabled={ro} onClick={() => patch({ presupuesto_aprobado: !op.presupuesto_aprobado })}>
            {op.presupuesto_aprobado ? '✔ Aprobado (revocar)' : 'Aprobar presupuesto'}
          </Btn>
        </div>
      </Card>
      <Card title="Montaje del producto" icon={ImageIcon}>
        <Inp label="URL de la imagen o PDF del plano, boceto o plantilla (Drive, Canva…)" placeholder="https://" value={op.link_diseno || ''} disabled={ro} onChange={fp('link_diseno')} />
        <div className="mt-3 flex min-h-[180px] items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50">
          {!op.link_diseno ? <p className="text-sm text-slate-400">Pegue un enlace para ver la vista previa.</p>
            : isPdf ? <iframe title="Montaje PDF" src={op.link_diseno} className="h-72 w-full" />
            : <img src={op.link_diseno} alt={`Montaje ${op.codigo}`} className="max-h-72 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        </div>
        {op.link_diseno && <a href={op.link_diseno} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-amber-700 underline">Abrir montaje en una pestaña nueva</a>}
        <p className="mt-1 text-xs text-slate-400">Los enlaces de Drive o Canva deben tener acceso público de lectura y apuntar directo al archivo para mostrarse aquí.</p>
      </Card>
      <Card title="Ficha técnica de especificaciones" icon={FileText} className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2"><Area label="Ubicación exacta de la marcación (distancia, centrado, posición)" value={op.ficha_ubicacion || ''} disabled={ro} onChange={fp('ficha_ubicacion')} /></div>
          <Inp label="Temperatura (°C)" value={op.ficha_temperatura || ''} disabled={ro} onChange={fp('ficha_temperatura')} />
          <Inp label="Tiempo (s)" value={op.ficha_tiempo || ''} disabled={ro} onChange={fp('ficha_tiempo')} />
          <Inp label="Presión" value={op.ficha_presion || ''} disabled={ro} onChange={fp('ficha_presion')} />
          <div className="sm:col-span-3"><Area label="Insumos específicos requeridos" value={op.ficha_insumos || ''} disabled={ro} onChange={fp('ficha_insumos')} /></div>
          <div className="sm:col-span-4"><Area label="Cuidados especiales y restricciones de manipulación" value={op.ficha_cuidados || ''} disabled={ro} onChange={fp('ficha_cuidados')} /></div>
        </div>
      </Card>
    </div>
  );
}

/* ───────────── Maquila diaria ───────────── */
function Maquila({ store }) {
  const [f, set, reset] = useForm({ orden_id: '', operario: '', fecha: today(), horas: '', tarifa: '' });
  const add = async () => {
    if (!f.orden_id || !f.operario.trim() || num(f.horas) <= 0) return;
    const { error } = await store.maquila.insert({ orden_id: num(f.orden_id), operario: f.operario.trim(), fecha: f.fecha, horas: num(f.horas), tarifa: num(f.tarifa) });
    if (!error) reset();
  };
  const opsConMaquila = store.ordenes.rows.filter((o) => store.maquila.rows.some((m) => m.orden_id === o.id));
  return (
    <div className="space-y-4">
      <Card title="Registro diario de maquila" icon={Users}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} onlyOpen />
          <Inp label="Operario" value={f.operario} onChange={set('operario')} />
          <Inp label="Fecha" type="date" value={f.fecha} onChange={set('fecha')} />
          <Inp label="Horas" type="number" step="0.25" value={f.horas} onChange={set('horas')} />
          <Inp label="Tarifa por hora (COP)" type="number" value={f.tarifa} onChange={set('tarifa')} />
          <div className="flex items-end"><Btn onClick={add}><Plus size={15} />Registrar</Btn></div>
        </div>
      </Card>
      {opsConMaquila.map((o) => {
        const rows = store.maquila.rows.filter((m) => m.orden_id === o.id);
        const dias = {}; rows.forEach((m) => { dias[m.fecha] = (dias[m.fecha] || 0) + m.horas * m.tarifa; });
        return (
          <Card key={o.id} title={`${o.codigo || `OP #${o.id}`} · gasto acumulado ${cop(rows.reduce((s, m) => s + m.horas * m.tarifa, 0))}`} icon={Clock}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Table heads={['Fecha', 'Operario', 'Horas', 'Tarifa', 'Subtotal', '']}>
                {rows.map((m) => (
                  <tr key={m.id}><td className="py-1.5 pr-4">{m.fecha}</td><td className="pr-4">{m.operario}</td><td className="pr-4">{m.horas}</td><td className="pr-4">{cop(m.tarifa)}</td><td className="pr-4">{cop(m.horas * m.tarifa)}</td>
                    <td><button aria-label="Eliminar registro" onClick={() => store.maquila.remove(m.id)}><Trash2 size={14} className="text-slate-400 hover:text-red-600" /></button></td></tr>
                ))}
              </Table>
              <Table heads={['Día', 'Gasto del día']}>
                {Object.entries(dias).sort().map(([d, v]) => <tr key={d}><td className="py-1.5 pr-4">{d}</td><td>{cop(v)}</td></tr>)}
              </Table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ───────────── Nómina de maquila (tabla dinámica por operario) ───────────── */
function Nomina({ store }) {
  const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState(''); const [open, setOpen] = useState('');
  const grupos = useMemo(() => {
    const g = {};
    store.maquila.rows.filter((m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta)).forEach((m) => {
      const k = m.operario.toLowerCase();
      const x = (g[k] = g[k] || { nombre: m.operario, horas: 0, monto: 0, ops: new Set(), dias: {} });
      x.horas += m.horas; x.monto += m.horas * m.tarifa; x.ops.add(m.orden_id);
      const d = (x.dias[m.fecha] = x.dias[m.fecha] || { horas: 0, monto: 0, ops: new Set() });
      d.horas += m.horas; d.monto += m.horas * m.tarifa; d.ops.add(m.orden_id);
    });
    return Object.entries(g).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
  }, [store.maquila.rows, desde, hasta]);
  const total = grupos.reduce((s, [, x]) => s + x.monto, 0);
  return (
    <Card title="Liquidación por operario" icon={DollarSign} right={<b className="text-sm">Total a pagar: {cop(total)}</b>}>
      <div className="mb-3 grid max-w-md grid-cols-2 gap-3"><Inp label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /><Inp label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      <Table heads={['Operario', 'Horas trabajadas', 'OPs intervenidas', 'Monto a pagar', '']} empty="No hay registros de maquila en el rango.">
        {grupos.map(([k, x]) => (
          <React.Fragment key={k}>
            <tr><td className="py-2 pr-4 font-semibold">{x.nombre}</td><td className="pr-4">{x.horas}</td><td className="pr-4">{[...x.ops].map((i) => opLabel(store.ordenes.rows, i)).join(', ')}</td><td className="pr-4 font-semibold">{cop(x.monto)}</td>
              <td><Btn v="ghost" onClick={() => setOpen(open === k ? '' : k)}>{open === k ? 'Ocultar' : 'Ver desglose diario'}</Btn></td></tr>
            {open === k && Object.entries(x.dias).sort().map(([d, v]) => (
              <tr key={d} className="bg-slate-50 text-slate-600"><td className="py-1.5 pl-4 pr-4">{d}</td><td className="pr-4">{v.horas}</td><td className="pr-4">{[...v.ops].map((i) => opLabel(store.ordenes.rows, i)).join(', ')}</td><td className="pr-4">{cop(v.monto)}</td><td /></tr>
            ))}
          </React.Fragment>
        ))}
      </Table>
    </Card>
  );
}

/* ───────────── Inventario y descuento automático ───────────── */
function Inventario({ store, canEdit }) {
  const [f, set, reset] = useForm({ item: '', unidad: 'und', cantidad: '', minimo: '' });
  const add = async () => { if (!f.item) return; const { error } = await store.inventario.insert({ item: f.item, unidad: f.unidad, cantidad: num(f.cantidad), minimo: num(f.minimo) }); if (!error) reset(); };
  const low = store.inventario.rows.filter((i) => num(i.cantidad) < num(i.minimo));
  return (
    <div className="space-y-4">
      {low.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /><span><b>Stock bajo:</b> {low.map((i) => `${i.item} (${i.cantidad} ${i.unidad}, mínimo ${i.minimo})`).join(' · ')}</span>
        </div>
      )}
      <Card title="Catálogo de insumos" icon={Package}>
        <Table heads={['Insumo', 'Unidad', 'Stock actual', 'Stock mínimo', 'Estado', '']}>
          {store.inventario.rows.map((i) => (
            <tr key={i.id}>
              <td className="py-1.5 pr-4 font-medium">{i.item}</td><td className="pr-4">{i.unidad}</td>
              <td className="pr-4"><input className={cx(ic, 'w-24')} type="number" disabled={!canEdit} value={i.cantidad} onChange={(e) => store.inventario.update(i.id, { cantidad: num(e.target.value) })} /></td>
              <td className="pr-4"><input className={cx(ic, 'w-24')} type="number" disabled={!canEdit} value={i.minimo} onChange={(e) => store.inventario.update(i.id, { minimo: num(e.target.value) })} /></td>
              <td className="pr-4">{num(i.cantidad) < num(i.minimo) ? <Pill ok={false}>Stock bajo</Pill> : <Pill ok>Suficiente</Pill>}</td>
              <td>{canEdit && <button aria-label="Eliminar insumo" onClick={() => store.inventario.remove(i.id)}><Trash2 size={14} className="text-slate-400 hover:text-red-600" /></button>}</td>
            </tr>
          ))}
        </Table>
        {canEdit && (
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Inp label="Nuevo insumo" value={f.item} onChange={set('item')} /><Inp label="Unidad de medida" value={f.unidad} onChange={set('unidad')} />
            <Inp label="Stock inicial" type="number" value={f.cantidad} onChange={set('cantidad')} /><Inp label="Stock mínimo" type="number" value={f.minimo} onChange={set('minimo')} />
            <div className="flex items-end"><Btn onClick={add}><Plus size={15} />Agregar</Btn></div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Empaque({ store, role }) {
  const [ordenId, setOp] = useState(''); const [cajas, setCajas] = useState(''); const [porCaja, setPorCaja] = useState('');
  const [q, setQ] = useState({}); const [msg, setMsg] = useState(null);
  const confirmar = async () => {
    if (!ordenId) return setMsg({ e: true, t: 'Seleccione una OP.' });
    const usados = store.inventario.rows.filter((i) => num(q[i.id]) > 0);
    if (!usados.length) return setMsg({ e: true, t: 'Ingrese al menos un insumo consumido.' });
    const falta = usados.find((i) => num(q[i.id]) > num(i.cantidad));
    if (falta) return setMsg({ e: true, t: `Stock insuficiente de ${falta.item}: hay ${falta.cantidad} ${falta.unidad}.` });
    for (const i of usados) {
      await store.inventario.update(i.id, { cantidad: num(i.cantidad) - num(q[i.id]) });
      await store.consumos.insert({ orden_id: num(ordenId), insumo_id: i.id, cantidad: num(q[i.id]), fecha: today(), rol: role });
    }
    if (num(cajas) > 0) await store.ordenes.update(num(ordenId), { empaque_cajas: num(cajas), empaque_por_caja: num(porCaja) });
    setQ({}); setMsg({ e: false, t: 'Insumos descontados del inventario.' });
  };
  const op = store.ordenes.rows.find((o) => o.id === num(ordenId));
  return (
    <Card title="Empaque y descuento de insumos" icon={Package}>
      <div className="grid gap-3 sm:grid-cols-3">
        <OpSel ordenes={store.ordenes.rows} value={ordenId} onChange={setOp} onlyOpen />
        <Inp label="Cajas empacadas" type="number" value={cajas} onChange={(e) => setCajas(e.target.value)} />
        <Inp label="Unidades por caja" type="number" value={porCaja} onChange={(e) => setPorCaja(e.target.value)} />
      </div>
      {op && op.empaque_cajas > 0 && <p className="mt-2 text-xs text-slate-500">Último desglose: {op.empaque_cajas} cajas × {op.empaque_por_caja} und.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {store.inventario.rows.map((i) => <Inp key={i.id} label={`${i.item} (stock ${i.cantidad} ${i.unidad})`} type="number" min="0" value={q[i.id] || ''} onChange={(e) => setQ({ ...q, [i.id]: e.target.value })} />)}
      </div>
      <div className="mt-3 flex items-center gap-3"><Btn v="acc" onClick={confirmar}>Descontar insumos</Btn>{msg && <span className={cx('text-sm', msg.e ? 'text-red-600' : 'text-emerald-700')}>{msg.t}</span>}</div>
    </Card>
  );
}

/* ───────────── Calidad ───────────── */
function Calidad({ store, role }) {
  const [f, set, reset] = useForm({ orden_id: '', tipo: 'Defecto de marcación', operario: '', descripcion: '' });
  const add = async () => { if (!f.orden_id || !f.descripcion) return; const { error } = await store.nc.insert({ orden_id: num(f.orden_id), tipo: f.tipo, operario: f.operario, descripcion: f.descripcion, fecha: today() }); if (!error) reset(); };
  return (
    <div className="space-y-4">
      <Card title="Reporte de no conformidades" icon={ShieldCheck}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} onlyOpen />
          <Sel label="Tipo" value={f.tipo} onChange={set('tipo')}>{['Defecto de marcación', 'Defecto de confección', 'Mancha o daño', 'Talla o color errado', 'Otro'].map((t) => <option key={t}>{t}</option>)}</Sel>
          <Inp label="Operario involucrado" value={f.operario} onChange={set('operario')} />
          <div className="sm:col-span-2 lg:col-span-3"><Area label="Descripción" value={f.descripcion} onChange={set('descripcion')} /></div>
          <div className="flex items-end"><Btn v="red" onClick={add}><XCircle size={15} />Reportar</Btn></div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Un solo reporte lleva la calidad de la OP a 0% (en revisión).</p>
        <div className="mt-3">
          <Table heads={['Fecha', 'OP', 'Tipo', 'Operario', 'Descripción', '']}>
            {store.nc.rows.map((n) => (
              <tr key={n.id}><td className="py-1.5 pr-4">{n.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, n.orden_id)}</td><td className="pr-4">{n.tipo}</td><td className="pr-4">{n.operario || '—'}</td><td className="pr-4">{n.descripcion}</td>
                <td><button aria-label="Eliminar reporte" onClick={() => store.nc.remove(n.id)}><Trash2 size={14} className="text-slate-400 hover:text-red-600" /></button></td></tr>
            ))}
          </Table>
        </div>
      </Card>
      <Empaque store={store} role={role} />
    </div>
  );
}

/* ───────────── Logística ───────────── */
function Logistica({ store }) {
  const [t, setT, resetT] = useForm({ orden_id: '', origen: '', destino: '', comprobante_url: '', fecha: today() });
  const [g, setG, resetG] = useForm({ orden_id: '', concepto: 'Flete', valor: '', fecha: today() });
  return (
    <div className="space-y-4">
      <Card title="Registrar traslado" icon={Truck}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OpSel ordenes={store.ordenes.rows} value={t.orden_id} onChange={(v) => setT('orden_id')({ target: { value: v } })} onlyOpen />
          <Inp label="Origen (taller o cliente)" value={t.origen} onChange={setT('origen')} /><Inp label="Destino" value={t.destino} onChange={setT('destino')} />
          <Inp label="URL del comprobante de entrega" placeholder="https://" value={t.comprobante_url} onChange={setT('comprobante_url')} />
          <Inp label="Fecha" type="date" value={t.fecha} onChange={setT('fecha')} />
          <div className="flex items-end"><Btn onClick={async () => { if (t.orden_id && t.origen && t.destino) { const { error } = await store.traslados.insert({ ...t, orden_id: num(t.orden_id) }); if (!error) resetT(); } }}><Plus size={15} />Registrar traslado</Btn></div>
        </div>
        <div className="mt-3"><Table heads={['Fecha', 'OP', 'Origen', 'Destino', 'Comprobante']}>
          {store.traslados.rows.map((x) => <tr key={x.id}><td className="py-1.5 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{x.origen}</td><td className="pr-4">{x.destino}</td>
            <td>{x.comprobante_url ? <a className="text-amber-700 underline" href={x.comprobante_url} target="_blank" rel="noreferrer">Ver</a> : '—'}</td></tr>)}
        </Table></div>
      </Card>
      <Card title="Gastos de fletes y transporte" icon={DollarSign}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <OpSel ordenes={store.ordenes.rows} value={g.orden_id} onChange={(v) => setG('orden_id')({ target: { value: v } })} onlyOpen />
          <Sel label="Concepto" value={g.concepto} onChange={setG('concepto')}>{['Flete', 'Taxi o moto', 'Peaje', 'Parqueadero', 'Otro'].map((c) => <option key={c}>{c}</option>)}</Sel>
          <Inp label="Valor (COP)" type="number" value={g.valor} onChange={setG('valor')} /><Inp label="Fecha" type="date" value={g.fecha} onChange={setG('fecha')} />
          <div className="flex items-end"><Btn onClick={async () => { if (g.orden_id && num(g.valor) > 0) { const { error } = await store.gastos.insert({ ...g, orden_id: num(g.orden_id), valor: num(g.valor) }); if (!error) resetG(); } }}><Plus size={15} />Registrar gasto</Btn></div>
        </div>
        <div className="mt-3"><Table heads={['Fecha', 'OP', 'Concepto', 'Valor']}>
          {store.gastos.rows.map((x) => <tr key={x.id}><td className="py-1.5 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{x.concepto}</td><td>{cop(x.valor)}</td></tr>)}
        </Table></div>
      </Card>
    </div>
  );
}

/* ───────────── Portal de taller externo ───────────── */
function Taller({ store }) {
  const [f, set, reset] = useForm({ orden_id: '', tecnica: 'DTF', proveedor: '', numero: '', valor: '', fecha: today() });
  const add = async () => {
    if (!f.orden_id || !f.numero || !f.proveedor || num(f.valor) <= 0) return;
    const { error } = await store.facturas.insert({ ...f, orden_id: num(f.orden_id), categoria: 'marcacion', valor: num(f.valor) });
    if (!error) reset();
  };
  return (
    <Card title="Costo real de marcación y factura emitida" icon={Wrench}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} onlyOpen />
        <Sel label="Técnica" value={f.tecnica} onChange={set('tecnica')}>{['DTF', 'Tampografía', 'UV', 'Vinilo'].map((t) => <option key={t}>{t}</option>)}</Sel>
        <Inp label="Taller o proveedor" value={f.proveedor} onChange={set('proveedor')} /><Inp label="Número de factura" value={f.numero} onChange={set('numero')} />
        <Inp label="Costo real (COP)" type="number" value={f.valor} onChange={set('valor')} /><Inp label="Fecha de factura" type="date" value={f.fecha} onChange={set('fecha')} />
      </div>
      <div className="mt-3"><Btn onClick={add}><Plus size={15} />Radicar factura</Btn></div>
      <div className="mt-4"><Table heads={['Fecha', 'OP', 'Técnica', 'Proveedor', 'Factura', 'Valor']}>
        {store.facturas.rows.filter((x) => x.categoria === 'marcacion').map((x) => <tr key={x.id}><td className="py-1.5 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{x.tecnica}</td><td className="pr-4">{x.proveedor}</td><td className="pr-4">{x.numero}</td><td>{cop(x.valor)}</td></tr>)}
      </Table></div>
    </Card>
  );
}

/* ───────────── Finanzas ───────────── */
function Finanzas({ store }) {
  const [f, set, reset] = useForm({ orden_id: '', categoria: 'marcacion', proveedor: '', numero: '', valor: '', fecha: today() });
  const add = async () => { if (!f.orden_id || !f.numero || num(f.valor) <= 0) return; const { error } = await store.facturas.insert({ ...f, orden_id: num(f.orden_id), valor: num(f.valor) }); if (!error) reset(); };
  return (
    <div className="space-y-4">
      <Card title="Comparativo: presupuesto, costo real y precio sugerido" icon={DollarSign}>
        <Table heads={['OP', 'Categoría', 'Presupuesto', 'Costo real', 'Diferencia']}>
          {store.ordenes.rows.flatMap((o) => {
            const c = costos(store, o);
            const filas = Object.entries(CATS).map(([k, l]) => (
              <tr key={o.id + k}><td className="py-1.5 pr-4">{o.codigo || `OP #${o.id}`}</td><td className="pr-4">{l}</td><td className="pr-4">{cop(o[`presupuesto_${k}`])}</td><td className="pr-4">{cop(c[k])}</td>
                <td className={cx('pr-4', c[k] > num(o[`presupuesto_${k}`]) ? 'text-red-600' : 'text-emerald-700')}>{cop(num(o[`presupuesto_${k}`]) - c[k])}</td></tr>
            ));
            const sug = c.total * (1 + num(o.margen) / 100);
            filas.push(
              <tr key={o.id + 't'} className="bg-slate-50 font-semibold"><td className="py-2 pr-4">{o.codigo || `OP #${o.id}`}</td><td className="pr-4">Total</td><td className="pr-4">{cop(presTotal(o))}</td><td className="pr-4">{cop(c.total)}</td>
                <td className="pr-4">Precio sugerido al cliente ({o.margen ?? 30}% de margen): {cop(sug)}</td></tr>,
            );
            return filas;
          })}
        </Table>
      </Card>
      <Card title="Relación de facturas de proveedores" icon={FileText}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OpSel ordenes={store.ordenes.rows} value={f.orden_id} onChange={(v) => set('orden_id')({ target: { value: v } })} />
          <Sel label="Categoría" value={f.categoria} onChange={set('categoria')}>{Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
          <Inp label="Proveedor" value={f.proveedor} onChange={set('proveedor')} /><Inp label="Número de factura" value={f.numero} onChange={set('numero')} />
          <Inp label="Valor (COP)" type="number" value={f.valor} onChange={set('valor')} /><Inp label="Fecha" type="date" value={f.fecha} onChange={set('fecha')} />
          <div className="flex items-end"><Btn onClick={add}><Plus size={15} />Vincular factura</Btn></div>
        </div>
        <div className="mt-4"><Table heads={['Fecha', 'OP', 'Categoría', 'Proveedor', 'Factura', 'Valor', '']}>
          {store.facturas.rows.map((x) => (
            <tr key={x.id}><td className="py-1.5 pr-4">{x.fecha}</td><td className="pr-4">{opLabel(store.ordenes.rows, x.orden_id)}</td><td className="pr-4">{CATS[x.categoria]}</td><td className="pr-4">{x.proveedor}</td><td className="pr-4">{x.numero}</td><td className="pr-4">{cop(x.valor)}</td>
              <td><button aria-label="Eliminar factura" onClick={() => store.facturas.remove(x.id)}><Trash2 size={14} className="text-slate-400 hover:text-red-600" /></button></td></tr>
          ))}
        </Table></div>
      </Card>
    </div>
  );
}

/* ───────────── Calculadora DTF textil y UV (usa configuracion_precios) ───────────── */
function Calc({ store }) {
  const [tipo, setTipo] = useState('textil'); const [modo, setModo] = useState('dim');
  const [p, setP] = useState({ alto: 10, ancho: 10, cant: 100, ml: 5, merma: 5, sep: 1 });
  const [ordenId, setOp] = useState('');
  const s = (k) => (e) => setP({ ...p, [k]: num(e.target.value) });

  const filaPrecio = store.precios.rows.find((x) => x.tipo_material === tipo);
  useEffect(() => {
    if (!store.precios.loading && !['textil', 'uv'].every((t) => store.precios.rows.some((x) => x.tipo_material === t))) {
      ['textil', 'uv'].forEach((t) => { if (!store.precios.rows.some((x) => x.tipo_material === t)) store.precios.insert({ tipo_material: t, precio_metro: 0 }); });
    }
  }, [store.precios.loading]); // eslint-disable-line

  const precio = num(filaPrecio?.precio_metro);
  const m = 1 + p.merma / 100;
  const porFila = Math.max(1, Math.floor(60 / (p.ancho + p.sep)));
  const mlAcomodo = Math.ceil(p.cant / porFila) * ((p.alto + p.sep) / 100);
  const mlArea = (p.alto * p.ancho * p.cant) / 6000;
  const res = modo === 'ml'
    ? { ml: p.ml * m, costo: p.ml * m * precio }
    : { ml: mlAcomodo * m, costo: mlAcomodo * m * precio, area: mlArea * m * precio };
  const enviar = () => store.ordenes.update(num(ordenId), { presupuesto_marcacion: Math.round(res.costo) });

  return (
    <Card title="Cotizador de marcación DTF" icon={Calculator}>
      <div className="mb-3 flex flex-wrap gap-2">
        {[['textil', 'DTF textil'], ['uv', 'DTF UV']].map(([k, l]) => <Btn key={k} v={tipo === k ? 'pri' : 'ghost'} onClick={() => setTipo(k)}>{l}</Btn>)}
        <span className="mx-2 border-l" />
        {[['dim', 'Por dimensiones (alto × ancho)'], ['ml', 'Por metros lineales']].map(([k, l]) => <Btn key={k} v={modo === k ? 'pri' : 'ghost'} onClick={() => setModo(k)}>{l}</Btn>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {modo === 'dim' ? (<>
          <Inp label="Alto (cm)" type="number" value={p.alto} onChange={s('alto')} /><Inp label="Ancho (cm)" type="number" value={p.ancho} onChange={s('ancho')} />
          <Inp label="Cantidad de piezas" type="number" value={p.cant} onChange={s('cant')} /><Inp label="Separación (cm)" type="number" value={p.sep} onChange={s('sep')} />
        </>) : <Inp label="Metros lineales (bobina de 60 cm)" type="number" value={p.ml} onChange={s('ml')} />}
        <Inp label="Desperdicio o merma (%)" type="number" value={p.merma} onChange={s('merma')} />
        <Inp label={`Precio por metro lineal (COP) · configuracion_precios: ${tipo}`} type="number" value={filaPrecio?.precio_metro ?? 0}
          onChange={(e) => filaPrecio && store.precios.update(filaPrecio.id, { precio_metro: num(e.target.value) })} disabled={!filaPrecio} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">Metros lineales con merma</p><p className="text-xl font-bold">{res.ml.toFixed(2)} m</p></div>
        <div className="rounded-md bg-amber-50 p-3"><p className="text-xs text-slate-500">Costo estimado</p><p className="text-xl font-bold">{cop(res.costo)}</p></div>
        {modo === 'dim' && <div className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">Por pieza · por área pura</p><p className="text-xl font-bold">{cop(res.costo / Math.max(p.cant, 1))} · {cop(res.area)}</p></div>}
      </div>
      {modo === 'dim' && <p className="mt-2 text-xs text-slate-500">Se acomodan {porFila} piezas por fila en la bobina de 60 cm.</p>}
      <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2"><OpSel ordenes={store.ordenes.rows} value={ordenId} onChange={setOp} onlyOpen /><div className="flex items-end"><Btn v="acc" disabled={!ordenId} onClick={enviar}>Usar como presupuesto de marcación</Btn></div></div>
    </Card>
  );
}

/* ───────────── Selección de perfil (tabla profiles) ───────────── */
const ROLES = {
  admin: { label: 'Admin / Líder de planta', desc: 'Control total, presupuestos, nómina y cierre de OPs', tabs: [['dashboard', 'Indicadores', LayoutDashboard], ['ops', 'Órdenes', ClipboardList], ['maquila', 'Maquila', Users], ['nomina', 'Nómina', DollarSign], ['inventario', 'Inventario', Package], ['finanzas', 'Finanzas', DollarSign], ['calc', 'Calculadora', Calculator]] },
  mensajero: { label: 'Mensajero / Logística', desc: 'Traslados, comprobantes y gastos de transporte', tabs: [['logistica', 'Traslados y gastos', Truck]] },
  calidad: { label: 'Inspector de calidad', desc: 'No conformidades, maquila, empaque e insumos', tabs: [['calidad', 'Calidad y empaque', ShieldCheck], ['maquila', 'Maquila', Users], ['inventario', 'Inventario', Package]] },
  taller: { label: 'Taller externo / Proveedor', desc: 'Costos reales de marcación y facturas', tabs: [['taller', 'Costos y facturas', Wrench]] },
};
const normalizeRol = (r) => (r || '').toString().trim().toLowerCase();

function LoginPerfil({ store, onSelect }) {
  const [f, set, reset] = useForm({ nombre: '', rol: 'admin' });
  const crear = async () => { if (!f.nombre.trim()) return; const { data, error } = await store.profiles.insert({ nombre: f.nombre.trim(), rol: f.rol }); if (!error) { onSelect(data[0]); reset(); } };
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="flex items-center gap-2 text-3xl font-bold text-[#12343B]"><Factory /> Planta OP</h1>
      <p className="mt-1 text-slate-600">Órdenes de producción, maquila, inventario y finanzas. Seleccione su perfil (tabla <code>profiles</code>) para entrar.</p>
      {store.profiles.rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Todavía no hay perfiles registrados. Cree el primero:</p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {store.profiles.rows.map((p) => {
            const rk = normalizeRol(p.rol);
            const R = ROLES[rk];
            return (
              <button key={p.id} onClick={() => onSelect(p)} className="rounded-lg border border-slate-300 bg-white p-4 text-left hover:border-amber-500 hover:shadow">
                <p className="font-semibold">{p.nombre}</p><p className="mt-1 text-sm text-slate-500">{R ? R.label : `Rol "${p.rol}" no reconocido — se abrirá en modo restringido`}</p>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><UserPlus size={15} />Crear perfil nuevo</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Inp label="Nombre" value={f.nombre} onChange={set('nombre')} />
          <Sel label="Rol" value={f.rol} onChange={set('rol')}>{Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</Sel>
          <div className="flex items-end"><Btn onClick={crear}><Plus size={15} />Crear e ingresar</Btn></div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── App ───────────── */
export default function App() {
  const store = useStore();
  const [perfil, setPerfil] = useState(null);
  const [tab, setTab] = useState(null);

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: "'Barlow', system-ui, sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&display=swap');"}</style>
      {children}
    </div>
  );

  if (!supabase) return (
    <Shell><div className="mx-auto max-w-lg px-4 py-16 text-center">
      <AlertTriangle className="mx-auto mb-3 text-red-600" size={32} />
      <h1 className="text-lg font-semibold">Falta configurar Supabase</h1>
      <p className="mt-2 text-sm text-slate-600">Defina <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en su archivo <code>.env</code>. La aplicación ya no usa almacenamiento local.</p>
    </div></Shell>
  );

  if (store.loading) return (
    <Shell><div className="grid min-h-screen place-items-center gap-2 text-slate-500"><Loader2 className="animate-spin" />Cargando datos de Supabase…</div></Shell>
  );

  if (!perfil) return <Shell><ErrBanner errors={store.errors} /><LoginPerfil store={store} onSelect={setPerfil} /></Shell>;

  const rk = normalizeRol(perfil.rol);
  const R = ROLES[rk] || { label: `Rol "${perfil.rol}"`, tabs: [['dashboard', 'Indicadores', LayoutDashboard]] };
  const cur = tab || R.tabs[0][0];
  const urgentes = store.ordenes.rows.filter((o) => o.estado === 'Abierta' && daysTo(o.fecha_prometida) !== null && daysTo(o.fecha_prometida) <= 2);
  const views = {
    dashboard: <Dashboard store={store} />, ops: <Ops store={store} can={rk === 'admin'} perfil={perfil} />, maquila: <Maquila store={store} />, nomina: <Nomina store={store} />,
    inventario: <Inventario store={store} canEdit={rk === 'admin'} />, finanzas: <Finanzas store={store} />, calc: <Calc store={store} />,
    logistica: <Logistica store={store} />, calidad: <Calidad store={store} role={rk} />, taller: <Taller store={store} />,
  };
  return (
    <Shell>
      {urgentes.length > 0 && (
        <div role="alert" className="animate-pulse bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          <AlertTriangle size={16} className="mr-1 inline" />
          Entrega crítica: {urgentes.map((o) => { const d = daysTo(o.fecha_prometida); return `${o.codigo || `OP #${o.id}`} (${d < 0 ? `atrasada ${-d} d` : d + ' d'})`; }).join(' · ')}
        </div>
      )}
      <header className="bg-[#12343B] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 font-bold"><Factory size={20} className="text-amber-400" />Planta OP <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs font-medium">{perfil.nombre} · {R.label}</span></div>
          <button onClick={() => { setPerfil(null); setTab(null); }} className="flex items-center gap-1 rounded border border-white/30 px-2 py-1 text-xs hover:bg-white/10"><LogOut size={14} />Cambiar perfil</button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {R.tabs.map(([id, label, I]) => (
            <button key={id} onClick={() => setTab(id)} className={cx('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm', cur === id ? 'border-amber-400 text-white' : 'border-transparent text-white/60 hover:text-white')}><I size={15} />{label}</button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4"><ErrBanner errors={store.errors} />{views[cur]}</main>
    </Shell>
  );
}
