/* ============================================================
   MÓDULO · COSTOS DE FÁBRICA
   Motor de costeo original, intacto. Aislado en su propio
   ámbito para que no choque con el módulo de rentabilidad.
   Usa el esquema public de Supabase.
   ============================================================ */
const Fabrica = (function(){

/* ══════════════════════════════════════════════════════════════
   ⬇️  PEGÁ ACÁ TUS CREDENCIALES DE SUPABASE  ⬇️
   Settings → API → Project URL y anon public key.
   (La anon key es pública por diseño: lo que protege es el RLS.
    NUNCA pegues acá la service_role.)
   ══════════════════════════════════════════════════════════════ */
/* La conexión ahora viene del shell (login compartido). */
const SUPABASE_URL = "(compartida)";
const SUPABASE_ANON = "(compartida)";
/* ══════════════════════════════════════════════════════════════ */

let sb = null; // lo inyecta el shell en boot()

let state = {
  user:null, ready:false,
  tab:'familias', materialsSubtab:'placas', familiaFilter:'',
  materiales:[], insumos:[], kits:[], roles:[], categorias:[], productos:[], familias:[],
  config:{carga_laboral_pct:38, unidades:['ud','m','litro','kg','par','juego','plancha'],
          variantes_material:[], espejo_material_id:null},
  historial:[],
  modal:null, productDetail:null, search:'',
  modeloSel:null,           // modelo activo en la barra lateral
  espejoSel:0,              // 0 | 1 | 2 puertas espejadas
  variante:{mat:0, esp:0},  // variante que se está viendo en el detalle (mat = índice en config.variantes_material)
  famDraft:null,            // borrador de la familia en edición (modelo nuevo)
  medIx:null,               // índice de la medida abierta en ficha
  modOpen:{},               // qué modelos están desplegados en la lista
  modVarsAll:{},            // qué modelos muestran TODAS sus variantes
  modCat:'todos',           // tab de categoría activa en la lista
  catClosed:{},             // (legacy) categorías cerradas en la lista
  famOpen:1,                // qué módulo del editor está abierto (uno por vez)
  preview:null              // variante que muestra el panel de costo en vivo
};

/* ---------- VARIANTES ----------
   El ancho es una receta base (cada uno consume distinto).
   El material es un swap. El espejo saca melamina y mete espejo.
   Las variantes de material y el material de espejo se configuran en
   Configuración (por ID de material/insumo real, no por nombre escrito a mano). */
const variantesMat = () => state.config.variantes_material||[];

// Corredizo = tiene puertas corredizas. Solo esos admiten espejo.
function esCorredizo(p){ return (p.puertas||0) > 0; }
// Área de UNA hoja: el ancho se reparte entre las puertas, + 5cm de solape
function areaPuerta(p){
  const n = p.puertas||0;
  if(!n || !p.ancho || !p.alto) return 0;
  return ((p.ancho/n + 5)/100) * (p.alto/100);
}
// Devuelve una copia del producto con la variante aplicada
function aplicarVariante(p, v){
  const q = JSON.parse(JSON.stringify(p));
  q.materiales = q.materiales||[]; q.insumos = q.insumos||[];
  const list = variantesMat();
  const base = list[0]||{}, sel = list[v.mat]||base;

  if(sel.placa_id && base.placa_id && sel.placa_id!==base.placa_id){
    q.materiales.forEach(l=>{ if(l.material_id===base.placa_id) l.material_id = sel.placa_id; });
  }
  if(sel.tapa_id && base.tapa_id && sel.tapa_id!==base.tapa_id){
    q.insumos.forEach(l=>{ if(l.insumo_id===base.tapa_id) l.insumo_id = sel.tapa_id; });
  }
  if(v.esp>0 && esCorredizo(p)){
    const espId = state.config.espejo_material_id;
    const area = +(areaPuerta(p) * v.esp).toFixed(2);
    const linea = sel.placa_id ? q.materiales.find(l=>l.material_id===sel.placa_id) : null;
    if(linea) linea.m2 = Math.max(0, +(linea.m2 - area).toFixed(2));
    if(espId) q.materiales.push({material_id:espId, m2:area});
  }
  return q;
}
// Avisa si falta configurar el material de espejo o las variantes antes de confiar en el cálculo
function variantesIncompletas(p, v){
  const out = [];
  if(v.esp>0 && esCorredizo(p) && !state.config.espejo_material_id) out.push('Falta configurar el material de Espejo en Configuración.');
  const list = variantesMat();
  if(!list.length) out.push('Todavía no configuraste las variantes de material en Configuración.');
  else if(v.mat>0 && !(list[v.mat]||{}).placa_id) out.push('Esa variante de material no tiene placa asignada en Configuración.');
  return out;
}
const varLabel = v => {
  const m = (variantesMat()[v.mat]||{}).label || '';
  return m + (v.esp>0 ? ` · ${v.esp} espejo${v.esp>1?'s':''}` : '');
};

const fmt  = n => (isFinite(n)?n:0).toLocaleString('es-AR',{maximumFractionDigits:0});
const fmt2 = n => (isFinite(n)?n:0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const val  = id => { const e=document.getElementById(id); return e?e.value.trim():''; };
const numVal = id => { const e=document.getElementById(id); return e?(parseFloat(e.value)||0):0; };
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- AUTH ---------- */
async function initAuth(){
  const {data:{session}} = await sb.auth.getSession();
  state.user = session?.user || null;
  if(state.user){ await loadAll(); } else { state.ready=true; render(); }
  sb.auth.onAuthStateChange((_e,s)=>{
    const was = !!state.user;
    state.user = s?.user || null;
    if(state.user && !was) loadAll();
    if(!state.user) render();
  });
}
async function doLogin(){
  const btn = document.getElementById('btn-login');
  const err = document.getElementById('login-err');
  btn.disabled = true; btn.textContent = 'Entrando…';
  const {error} = await sb.auth.signInWithPassword({
    email: val('login-email'), password: document.getElementById('login-pass').value
  });
  if(error){
    err.textContent = 'Email o contraseña incorrectos.';
    err.classList.add('show');
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}
async function doLogout(){ await sb.auth.signOut(); state.ready=true; render(); }

/* ---------- DATA ---------- */
async function loadAll(){
  state.ready = false; render();
  const [mat,ins,kit,rol,cat,pro,cfg,his,fam] = await Promise.all([
    sb.from('materiales').select('*').order('nombre'),
    sb.from('insumos').select('*').order('nombre'),
    sb.from('kits').select('*').order('nombre'),
    sb.from('roles_mano_obra').select('*').order('nombre'),
    sb.from('categorias').select('*').order('nombre'),
    sb.from('productos').select('*').order('nombre'),
    sb.from('config').select('*').eq('id',1).single(),
    sb.from('historial_precios').select('*').order('fecha',{ascending:false}).limit(100),
    sb.from('familias').select('*').order('nombre'),
  ]);
  state.materiales = mat.data||[];  state.insumos = ins.data||[];
  state.kits       = kit.data||[];
  state.roles      = rol.data||[];  state.categorias = cat.data||[];
  state.productos  = pro.data||[];  state.historial  = his.data||[];
  state.familias   = fam.data||[];
  if(cfg.data) state.config = cfg.data;
  state.ready = true; render();
}

async function save(tabla, id, data){
  try{
    const q = id ? sb.from(tabla).update(data).eq('id',id) : sb.from(tabla).insert(data);
    const {error} = await q;
    if(error) throw error;
    state.modal = null;
    await loadAll();
    return true;
  }catch(e){
    alert('No se pudo guardar: ' + (e.message || e));
    return false;   // el botón se re-habilita en bindSave
  }
}
async function del(tabla, id){
  if(!confirm('¿Borrar este ítem?')) return;
  const {error} = await sb.from(tabla).delete().eq('id',id);
  if(error){ alert('No se puede borrar: puede estar en uso por un producto.'); return; }
  await loadAll();
}

/* ---------- MOTOR DE COSTEO ---------- */
function costPerM2(m){
  const area = (m.ancho/100)*(m.alto/100)*(1-(m.desperdicio||0)/100);
  const neto = (m.precio||0)*(1-(m.descuento_pct||0)/100);
  return area>0 ? neto/area : 0;
}
function costPerUnit(i){
  const neto = (i.precio_compra||0)*(1-(i.descuento_pct||0)/100);
  return i.contenido>0 ? neto/i.contenido : 0;
}
function kitCost(k){
  return (k.items||[]).reduce((s,li)=>{
    const i = state.insumos.find(x=>x.id===li.insumo_id);
    return s + (i ? costPerUnit(i)*li.cantidad : 0);
  },0);
}
function productCost(p){
  const materiales = (p.materiales||[]).reduce((s,l)=>{
    const m = state.materiales.find(x=>x.id===l.material_id);
    return s + (m ? costPerM2(m)*l.m2 : 0);
  },0);
  let insumos = (p.insumos||[]).reduce((s,l)=>{
    const i = state.insumos.find(x=>x.id===l.insumo_id);
    return s + (i ? costPerUnit(i)*l.cantidad : 0);
  },0);
  if(p.kit_id){
    const k = state.kits.find(x=>x.id===p.kit_id);
    if(k) insumos += kitCost(k);
  }
  insumos += (p.sueltos||[]).reduce((s,l)=>{
    const i = state.insumos.find(x=>x.id===l.insumo_id);
    return s + (i ? costPerUnit(i)*l.cantidad : 0);
  },0);
  const moBase = (p.horas||[]).reduce((s,l)=>{
    const r = state.roles.find(x=>x.id===l.rol_id);
    return s + (r ? r.tarifa*l.horas : 0);
  },0);
  const carga = state.config.carga_laboral_pct||0;
  const manoDeObra = moBase*(1+carga/100);
  const otros = p.otros||0;
  return {materiales,insumos,manoDeObra,moBase,otros,
          total: materiales+insumos+manoDeObra+otros};
}
// Detecta si el costo está incompleto por precios en $0
function faltantes(p){
  const out = [];
  (p.materiales||[]).forEach(l=>{ const m=state.materiales.find(x=>x.id===l.material_id); if(m&&!m.precio) out.push(m.nombre); });
  (p.insumos||[]).forEach(l=>{ const i=state.insumos.find(x=>x.id===l.insumo_id); if(i&&!i.precio_compra) out.push(i.nombre); });
  (p.sueltos||[]).forEach(l=>{ const i=state.insumos.find(x=>x.id===l.insumo_id); if(i&&!i.precio_compra) out.push(i.nombre); });
  if(p.kit_id){ const k=state.kits.find(x=>x.id===p.kit_id);
    (k?.items||[]).forEach(li=>{ const i=state.insumos.find(x=>x.id===li.insumo_id); if(i&&!i.precio_compra) out.push(i.nombre); }); }
  (p.horas||[]).forEach(l=>{ const r=state.roles.find(x=>x.id===l.rol_id); if(r&&!r.tarifa&&l.horas>0) out.push(r.nombre+' (tarifa)'); });
  return [...new Set(out)];
}

/* ---------- RENDER ---------- */
function render(){
  const root = document.getElementById('fabRoot');
  if(!root) return;                       // el módulo no está en pantalla
  if(!state.ready){ root.innerHTML = '<div class="loading">Cargando datos…</div>'; return; }
  root.innerHTML = shell() + (state.modal?modalHtml():'');
  bindEvents();
}

function loginPage(){
  const noConfig = SUPABASE_URL.includes('TU-PROYECTO');
  return `
  <div class="login-wrap"><div class="login-card">
    <div class="login-brand">
      <div class="brand-badge" style="background:var(--blue);color:#fff;">BH</div>
      <div class="login-title">Costeo</div>
    </div>
    <div class="login-sub">Belgrano Home · acceso restringido</div>
    ${noConfig?`<div class="warn-box">Falta configurar Supabase. Abrí este archivo y pegá tu <strong>Project URL</strong> y <strong>anon key</strong> en el bloque de arriba de todo.</div>`:''}
    <div class="login-err" id="login-err"></div>
    <div class="field"><label>Email</label><input id="login-email" type="email" autocomplete="username"></div>
    <div class="field"><label>Contraseña</label><input id="login-pass" type="password" autocomplete="current-password"></div>
    <button class="btn-primary" id="btn-login" style="width:100%;margin-top:6px;">Entrar</button>
  </div></div>`;
}

function shell(){
  return `<main class="main">${page()}</main>`;
}

function page(){
  if(state.tab==='familias')    return state.famDraft!==null ? familiaEditor() : familiasPage();
  if(state.tab==='products')    return state.productDetail ? productDetail() : productsPage();
  if(state.tab==='materiales')  return materialesHub();
  if(state.tab==='labor')       return laborPage();
  if(state.tab==='variaciones') return variacionesPage();
  if(state.tab==='config')      return configPage();
  return '';
}
const head = (eyebrow,title,desc) =>
  `<div class="page-eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="page-desc">${desc}</p>`;
const empty = t => `<div class="empty">${t}</div>`;

/* ---------- MATERIALES HUB ---------- */
function materialesHub(){
  const subs = [['placas','Placas'],['insumos','Insumos'],['kits','Kits']];
  const src = {placas:'materiales',insumos:'insumos'}[state.materialsSubtab];
  const familias = src ? [...new Set(state[src].map(x=>x.familia).filter(Boolean))] : [];
  const bar = familias.length ? `<div class="familia-bar">
      <button class="chip ${!state.familiaFilter?'chip-on':''}" data-familia="">Todas</button>
      ${familias.map(f=>`<button class="chip ${state.familiaFilter===f?'chip-on':''}" data-familia="${esc(f)}">${esc(f)}</button>`).join('')}
    </div>` : '';
  const body = {placas:placasTable,insumos:insumosTable,kits:kitsTable}[state.materialsSubtab]();
  return head('01 · Datos maestros','Materiales',
    'Todo lo que compone un mueble, en un solo lugar. Cambiá de solapa y filtrá por familia para encontrar rápido.')
    + `<nav class="subtabbar">${subs.map(([id,l])=>
        `<button class="subtab ${state.materialsSubtab===id?'active':''}" data-subtab="${id}">${l}</button>`).join('')}</nav>`
    + bar + body;
}
const hoy = () => new Date().toISOString().slice(0,10);
const fechaCorta = f => f ? `<div class="price-date">${new Date(f+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div>` : '<div class="price-date" style="opacity:.6;">sin fecha</div>';
const descTag = pct => pct>0 ? `<div class="price-date">-${pct}% desc.</div>` : '';
const otrosProvTag = it => (it.proveedores_alt||[]).length ? `<div class="price-date">+${it.proveedores_alt.length} cotización(es) más</div>` : '';
const badge = it => {
  const h = state.historial.find(x=>x.item_id===it.id);
  if(!h) return '';
  const p = h.precio_anterior ? ((h.precio_nuevo-h.precio_anterior)/h.precio_anterior*100) : 0;
  const d = new Date(h.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'});
  return `<div class="var-badge ${p>=0?'var-up':'var-down'}">${p>=0?'▲':'▼'} ${Math.abs(p).toFixed(1)}% · ${d}</div>`;
};
const flt = arr => arr.filter(x=>!state.familiaFilter||x.familia===state.familiaFilter);

function placasTable(){
  const l = flt(state.materiales);
  return `<div class="card">
    <div class="card-title">Placas cargadas<button class="btn-primary btn-sm" data-new="material">+ Agregar placa</button></div>
    ${l.length?`<table><thead><tr><th>Nombre</th><th>Familia</th><th>Proveedor</th><th class="num">Precio plancha</th>
      <th class="num">Medidas</th><th class="num">Desperdicio</th><th class="num">Costo/m²</th><th></th></tr></thead>
      <tbody>${l.map(m=>`<tr>
        <td>${esc(m.nombre)}${!m.precio?'<span class="missing-tag">falta precio</span>':''}</td>
        <td>${esc(m.familia)||'—'}</td>
        <td>${esc(m.proveedor)||'—'}${otrosProvTag(m)}</td>
        <td class="num">$${fmt(m.precio)}${descTag(m.descuento_pct)}${fechaCorta(m.fecha_precio)}</td>
        <td class="num">${m.ancho}×${m.alto}cm</td>
        <td class="num">${m.desperdicio}%</td>
        <td class="num">$${fmt2(costPerM2(m))}${badge(m)}</td>
        <td class="num"><button class="icon-btn" data-edit="material:${m.id}">Editar</button>
          <button class="icon-btn" data-del="materiales:${m.id}">Borrar</button></td>
      </tr>`).join('')}</tbody></table>`:empty('No hay placas en esta familia.')}
  </div>`;
}
function insumosTable(){
  const l = flt(state.insumos);
  return `<div class="card">
    <div class="card-title">Insumos cargados<button class="btn-primary btn-sm" data-new="insumo">+ Agregar insumo</button></div>
    <div class="helper">Todo lo que comprás para el mueble, salvo placas: laca, sellador, diluyente, cola, tapacantos, correderas, bisagras, tiradores y demás herrajes. Si lo comprás por unidad (ej. una corredera), cargá contenido = 1. Cargás lo que dice la factura y el costo por unidad se calcula solo.</div>
    ${l.length?`<table><thead><tr><th>Nombre</th><th>Familia</th><th>Proveedor</th><th class="num">Precio de compra</th>
      <th class="num">Contenido</th><th class="num">Costo por unidad</th><th></th></tr></thead>
      <tbody>${l.map(i=>`<tr>
        <td>${esc(i.nombre)}${!i.precio_compra?'<span class="missing-tag">falta precio</span>':''}</td>
        <td>${esc(i.familia)||'—'}</td>
        <td>${esc(i.proveedor)||'—'}${otrosProvTag(i)}</td>
        <td class="num">$${fmt(i.precio_compra)}${descTag(i.descuento_pct)}${fechaCorta(i.fecha_precio)}</td>
        <td class="num">${fmt2(i.contenido)} ${esc(i.unidad)}</td>
        <td class="num">$${fmt2(costPerUnit(i))}/${esc(i.unidad)}${badge(i)}</td>
        <td class="num"><button class="icon-btn" data-edit="insumo:${i.id}">Editar</button>
          <button class="icon-btn" data-del="insumos:${i.id}">Borrar</button></td>
      </tr>`).join('')}</tbody></table>`:empty('No hay insumos en esta familia.')}
  </div>`;
}
function kitsTable(){
  return `<div class="card">
    <div class="card-title">Kits armados<button class="btn-primary btn-sm" data-new="kit">+ Agregar kit</button></div>
    <div class="helper">Agrupá los herrajes que se repiten por tipo de mueble para asignarlos en un clic al cargar productos.</div>
    ${state.kits.length?`<table><thead><tr><th>Nombre</th><th class="num">Contenido</th>
      <th class="num">Costo del kit</th><th></th></tr></thead>
      <tbody>${state.kits.map(k=>`<tr>
        <td>${esc(k.nombre)}</td>
        <td class="num">${(k.items||[]).length} ítems</td>
        <td class="num">$${fmt(kitCost(k))}</td>
        <td class="num"><button class="icon-btn" data-edit="kit:${k.id}">Editar</button>
          <button class="icon-btn" data-del="kits:${k.id}">Borrar</button></td>
      </tr>`).join('')}</tbody></table>`:empty('Todavía no armaste kits.')}
  </div>`;
}

/* ---------- MANO DE OBRA ---------- */
function laborPage(){
  const c = state.config.carga_laboral_pct||0;
  return head('01 · Datos maestros','Mano de obra',
    'Cargá la tarifa nominal por rol. El % de carga laboral (cargas sociales, aguinaldo) se aplica global desde Configuración, igual para todos.')
  + `<div class="card">
    <div class="card-title">Roles cargados
      <span style="font-size:12px;color:var(--ink-soft);font-weight:500;">Carga laboral: <strong>${c}%</strong></span></div>
    <div style="margin-bottom:12px;"><button class="btn-primary btn-sm" data-new="rol">+ Agregar rol</button></div>
    ${state.roles.length?`<table><thead><tr><th>Rol</th><th class="num">Tarifa nominal</th>
      <th class="num">Hora cargada real</th><th></th></tr></thead>
      <tbody>${state.roles.map(r=>`<tr>
        <td>${esc(r.nombre)}${!r.tarifa?'<span class="missing-tag">falta tarifa</span>':''}</td>
        <td class="num">$${fmt(r.tarifa)}/h${fechaCorta(r.fecha_precio)}</td>
        <td class="num"><strong>$${fmt(r.tarifa*(1+c/100))}/h</strong></td>
        <td class="num"><button class="icon-btn" data-edit="rol:${r.id}">Editar</button>
          <button class="icon-btn" data-del="roles_mano_obra:${r.id}">Borrar</button></td>
      </tr>`).join('')}</tbody></table>`:empty('Todavía no cargaste roles.')}
  </div>`;
}

/* ---------- CONFIGURACIÓN ---------- */
function variantesLines(){
  const list = draft.variantes_material||[];
  if(!list.length) return '<div class="helper">Todavía no cargaste ninguna variante. La primera que agregues es la <strong>variante base</strong> (la que ya usan tus recetas hoy, normalmente Mel blanco): no se hace swap para esa.</div>';
  return list.map((vr,ix)=>`<div class="line-item-row" style="grid-template-columns:0.9fr 1.3fr 1.3fr 34px;">
    <input data-vln="${ix}" data-f="label" value="${esc(vr.label||'')}" placeholder="${ix===0?'ej: Mel blanco (base)':'ej: Mel madera'}">
    <select data-vln="${ix}" data-f="placa_id">
      <option value="">— Elegir placa —</option>
      ${state.materiales.map(m=>`<option value="${m.id}" ${m.id===vr.placa_id?'selected':''}>${esc(m.nombre)}</option>`).join('')}
    </select>
    <select data-vln="${ix}" data-f="tapa_id">
      <option value="">— Sin tapacanto —</option>
      ${state.insumos.map(i=>`<option value="${i.id}" ${i.id===vr.tapa_id?'selected':''}>${esc(i.nombre)}</option>`).join('')}
    </select>
    <button class="icon-btn" data-rmvln="${ix}">✕</button>
  </div>`).join('');
}
function configPage(){
  const cfg = state.config;
  if(!Array.isArray(draft.variantes_material)) draft.variantes_material = JSON.parse(JSON.stringify(cfg.variantes_material||[]));
  return head('04 · Configuración','Configuración','Parámetros globales. Lo que cambies acá afecta a todos los productos.')
  + `<div class="card">
    <div class="card-title">Carga laboral</div>
    <div class="helper">Porcentaje que se suma a la tarifa horaria de <strong>todos</strong> los roles: cargas sociales, aguinaldo, ART, vacaciones. Referencia en Argentina: ~38% (26% cargas + 8,33% aguinaldo + colchón). Con menos de eso no cubrís ni el aguinaldo.</div>
    <div class="row-2" style="max-width:420px;">
      <div class="field"><label>% de carga laboral</label><input id="cfg-carga" type="number" value="${cfg.carga_laboral_pct||0}"></div>
      <div class="field" style="align-self:end;"><button class="btn-primary" id="save-carga">Guardar</button></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Variantes de material y espejo</div>
    <div class="helper">Acá definís, eligiendo tus propios materiales e insumos (no por nombre escrito, por ID real), qué placa y tapacanto corresponden a cada variante — y cuál material usás para las puertas espejadas. Esto es lo que hace que la matriz de Productos y el selector "Puertas espejadas" calculen solos, restando la placa y sumando el espejo.</div>
    <div id="ln-variantes">${variantesLines()}</div>
    <button type="button" class="add-line-btn" id="add-variante">+ Agregar variante de material</button>
    <div class="row-2" style="max-width:480px;margin-top:16px;">
      <div class="field"><label>Material para puertas espejadas</label>
        <select id="cfg-espejo">
          <option value="">— Sin definir —</option>
          ${state.materiales.map(m=>`<option value="${m.id}" ${m.id===cfg.espejo_material_id?'selected':''}>${esc(m.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="align-self:end;"><button class="btn-primary" id="save-variantes">Guardar variantes</button></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Unidades de medida</div>
    <div class="helper">Las que aparecen en los desplegables al cargar insumos.</div>
    <div class="familia-bar">${(cfg.unidades||[]).map(u=>
      `<span class="chip chip-static">${esc(u)} <button class="chip-x" data-delu="${esc(u)}">✕</button></span>`).join('')}</div>
    <div class="row-2" style="max-width:420px;">
      <div class="field"><label>Nueva unidad</label><input id="cfg-unidad" placeholder="ej: rollo, m², kit"></div>
      <div class="field" style="align-self:end;"><button class="btn-primary" id="add-unidad">Agregar</button></div>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Categorías de producto<button class="btn-primary btn-sm" data-new="categoria">+ Agregar categoría</button></div>
    <div class="helper">Horas estándar por rol para cada tipo de mueble. Al cargar un producto se autocompletan y las podés pisar.</div>
    ${state.categorias.length?`<table><thead><tr><th>Categoría</th><th>Horas estándar</th><th></th></tr></thead>
      <tbody>${state.categorias.map(c=>`<tr>
        <td>${esc(c.nombre)}</td>
        <td>${Object.entries(c.horas||{}).map(([rid,h])=>{
          const r = state.roles.find(x=>x.id===rid);
          return r?`<span class="pill" style="margin-right:6px;">${esc(r.nombre)}: ${h}h</span>`:'';
        }).join('')||'—'}</td>
        <td class="num"><button class="icon-btn" data-edit="categoria:${c.id}">Editar</button>
          <button class="icon-btn" data-del="categorias:${c.id}">Borrar</button></td>
      </tr>`).join('')}</tbody></table>`:empty('Todavía no cargaste categorías.')}
  </div>`;
}

/* ---------- VARIACIONES ---------- */
function variacionesPage(){
  return head('03 · Seguimiento','Variaciones de precio',
    'Cada cambio de precio queda registrado con fecha y con quién lo hizo. Las correcciones de datos mal cargados no aparecen acá.')
  + `<div class="card">
    ${state.historial.length?`<table><thead><tr><th>Fecha</th><th>Quién</th><th>Tipo</th><th>Ítem</th>
      <th class="num">Antes</th><th class="num">Después</th><th class="num">Variación</th></tr></thead>
      <tbody>${state.historial.map(h=>{
        const p = h.precio_anterior ? ((h.precio_nuevo-h.precio_anterior)/h.precio_anterior*100) : 0;
        const tipos = {materiales:'Placa',insumos:'Insumo'};
        return `<tr>
          <td>${new Date(h.fecha).toLocaleDateString('es-AR')}</td>
          <td>${esc((h.usuario_email||'').split('@')[0])}</td>
          <td><span class="pill">${tipos[h.tabla]||h.tabla}</span></td>
          <td>${esc(h.item_nombre)}</td>
          <td class="num">$${fmt(h.precio_anterior)}</td>
          <td class="num">$${fmt(h.precio_nuevo)}</td>
          <td class="num ${p>=0?'var-up':'var-down'}"><strong>${p>=0?'▲':'▼'} ${Math.abs(p).toFixed(1)}%</strong></td>
        </tr>`;}).join('')}</tbody></table>`
      :empty('Todavía no hay cambios de precio registrados.')}
  </div>`;
}

/* ==================================================================
   FAMILIAS — plantilla con ejes medida × color × combinación de puertas
   La carcasa y las puertas se cuentan por separado.
   Las puertas "de placa" heredan el color del cuerpo.
   ================================================================== */

/* ---- Combinaciones de puertas ----
   Con n puertas y k tipos, devuelve todas las repartijas posibles.
   Ej: 2 puertas, tipos [Placa, Espejo] → [2,0] [1,1] [0,2] */
function combosPuertas(nTipos, nPuertas){
  const out = [];
  if(nTipos<1 || nPuertas<1) return [[]];
  (function rec(ix, resto, acc){
    if(ix === nTipos-1){ out.push([...acc, resto]); return; }
    for(let c=resto; c>=0; c--) rec(ix+1, resto-c, [...acc, c]);
  })(0, nPuertas, []);
  return out;
}
function comboLabel(fam, counts){
  const tipos = fam.puerta_tipos||[];
  const parts = counts.map((c,i)=> c>0 ? `${c} ${(tipos[i]&&tipos[i].label)||'?'}` : null).filter(Boolean);
  return parts.join(' + ') || 'sin puertas';
}

/* ---- Costo de una variante concreta ---- */
function costoVariante(fam, med, colorIx, counts){
  const color = (fam.colores||[])[colorIx] || {};
  const rf = fam.receta_fija || {};

  const placaColor = state.materiales.find(m=>m.id===color.placa_id);
  const tapaColor  = state.insumos.find(i=>i.id===color.tapacanto_id);
  const cM2  = placaColor ? costPerM2(placaColor) : 0;
  const cTap = tapaColor  ? costPerUnit(tapaColor) : 0;

  // Carcasa: el mueble sin las puertas
  const carcasa = cM2*(med.carcasa_m2||0) + cTap*(med.carcasa_tapacanto_m||0);

  // Puertas: cada tipo con su material; la de placa hereda el color del cuerpo
  let puertas = 0;
  (fam.puerta_tipos||[]).forEach((t,i)=>{
    const c = (counts&&counts[i])||0; if(!c) return;
    const mat = t.hereda ? placaColor : state.materiales.find(m=>m.id===t.material_id);
    if(mat) puertas += c * costPerM2(mat) * (med.puerta_m2||0);
    // Filo/tapacanto de la puerta: metros definidos en el tipo (tapacanto_m); si no, por medida.
    if(t.lleva_tapacanto !== false) puertas += c * cTap * (t.tapacanto_m || med.puerta_tapacanto_m || 0);
  });

  // Fondo (fijo, no cambia con el color)
  const fondoMat = rf.fondo && rf.fondo.material_id ? state.materiales.find(m=>m.id===rf.fondo.material_id) : null;
  const fondo = fondoMat ? costPerM2(fondoMat)*(med.fondo_m2||0) : 0;

  // Combos + sueltos
  let herrajes = 0;
  const kitsList = rf.kits && rf.kits.length ? rf.kits : (rf.kit_id ? [{kit_id:rf.kit_id,cantidad:1}] : []);
  kitsList.forEach(kl=>{ const k=state.kits.find(x=>x.id===kl.kit_id); if(k) herrajes += kitCost(k)*(kl.cantidad||1); });
  // Sueltos: la cantidad puede ser por medida (med.cant[insumo_id]); si no, usa la default del suelto.
  (rf.sueltos||[]).forEach(s=>{
    const i=state.insumos.find(x=>x.id===s.insumo_id); if(!i) return;
    const cant = (med && med.cant && med.cant[s.insumo_id]!==undefined) ? med.cant[s.insumo_id] : (s.cantidad||0);
    herrajes += costPerUnit(i)*(cant||0);
  });

  // Mano de obra
  const carga = state.config.carga_laboral_pct||0;
  let moBase = 0;
  Object.entries(med.horas||{}).forEach(([rid,h])=>{
    const r = state.roles.find(x=>x.id===rid); if(r) moBase += (r.tarifa||0)*(h||0);
  });
  const manoObra = moBase*(1+carga/100);
  const otros = +(med.otros||0);

  return {carcasa, puertas, fondo, herrajes, manoObra, otros,
          total: carcasa+puertas+fondo+herrajes+manoObra+otros};
}
function faltantesFam(fam, med, colorIx, counts){
  const color=(fam.colores||[])[colorIx]||{}, rf=fam.receta_fija||{}, out=[];
  const pc=state.materiales.find(m=>m.id===color.placa_id); if(pc&&!pc.precio) out.push(pc.nombre);
  const tp=state.insumos.find(i=>i.id===color.tapacanto_id); if(tp&&!tp.precio_compra) out.push(tp.nombre);
  (fam.puerta_tipos||[]).forEach((t,i)=>{ if(!((counts&&counts[i])||0)||t.hereda) return;
    const m=state.materiales.find(x=>x.id===t.material_id); if(m&&!m.precio) out.push(m.nombre); });
  const fm=rf.fondo&&state.materiales.find(m=>m.id===rf.fondo.material_id); if(fm&&!fm.precio) out.push(fm.nombre);
  (rf.sueltos||[]).forEach(s=>{ const i=state.insumos.find(x=>x.id===s.insumo_id); if(i&&!i.precio_compra) out.push(i.nombre); });
  Object.entries(med.horas||{}).forEach(([rid,h])=>{ const r=state.roles.find(x=>x.id===rid); if(r&&!r.tarifa&&h>0) out.push(r.nombre+' (tarifa)'); });
  return [...new Set(out)];
}
const nVariantes = fam => (fam.medidas||[]).length
  * Math.max(1,(fam.colores||[]).length)
  * combosPuertas((fam.puerta_tipos||[]).length, fam.n_puertas||0).length;

/* ---- Listado de modelos (KPIs + tabs + variantes con costo) ---- */
function costoRep(f, combos){
  const meds=f.medidas||[];
  if(!meds.length || !(f.colores||[]).length || !combos.length) return 0;
  return costoVariante(f, meds[0], 0, combos[0]).total;
}
function variantesDeModelo(f){
  const combos = combosPuertas((f.puerta_tipos||[]).length, f.n_puertas||0);
  const out = [];
  (f.medidas||[]).forEach(m=>(f.colores||[]).forEach((col,ci)=>combos.forEach(cmb=>{
    out.push({med:`${m.ancho||'?'} × ${m.alto||'?'}`, color:col.label||'—',
              puertas:comboLabel(f,cmb), costo:costoVariante(f,m,ci,cmb).total});
  })));
  return out;
}
function filaModelo(f){
  const combos = combosPuertas((f.puerta_tipos||[]).length, f.n_puertas||0);
  const abierto = !!state.modOpen[f.id];
  const rep = costoRep(f, combos);
  const nv = nVariantes(f);
  const disenio = `${esc(f.apertura||'—')}${f.n_puertas?` · ${f.n_puertas} puertas`:''} · ${nv} variante${nv!==1?'s':''}`;
  let detalle = '';
  if(abierto){
    const vars = variantesDeModelo(f);
    const verTodas = !!state.modVarsAll[f.id];
    const vis = verTodas ? vars : vars.slice(0,6);
    const tabla = vars.length ? `<table class="mini vars"><thead><tr>
        <th>Medida</th><th>Color</th><th>Puertas</th><th class="num">Costo directo</th></tr></thead>
      <tbody>${vis.map(v=>`<tr>
        <td><strong>${esc(v.med)}</strong></td><td>${esc(v.color)}</td>
        <td>${esc(v.puertas)}</td><td class="num">$${fmt(v.costo)}</td></tr>`).join('')}</tbody></table>
      ${(vars.length>6 && !verTodas)?`<button class="ver-mas" data-modmore="${f.id}">
        Ver las ${vars.length-6} variantes restantes ▾</button>`:''}`
      : '<div class="helper" style="margin:0;">Sin variantes todavía. Abrí el modelo y cargá medidas, colores y puertas.</div>';
    detalle = `<tr class="mod-detail"><td colspan="3"><div class="mod-detail-in">
        ${tabla}
        <div class="mod-detail-foot">
          <button class="btn-primary btn-sm" data-editfam="${f.id}">Abrir para editar</button>
          <button class="icon-btn" data-delfam="${f.id}">Borrar modelo</button>
        </div>
      </div></td></tr>`;
  }
  return `<tr class="mod-row ${abierto?'on':''}" data-modtog="${f.id}">
      <td class="mod-caret"><span class="caret">▶</span><strong>${esc(f.nombre)}</strong></td>
      <td class="mod-dis">${disenio}</td>
      <td class="num mod-costo">${rep?`desde $${fmt(rep)}`:'—'}</td>
    </tr>${detalle}`;
}
function familiasPage(){
  const fams = state.familias;
  state.modCat = state.modCat || 'todos';
  const catName = id => (state.categorias.find(c=>c.id===id)||{}).nombre || 'Sin categoría';

  // KPIs
  const totVar = fams.reduce((s,f)=>s+nVariantes(f),0);
  const reps = fams.map(f=>costoRep(f, combosPuertas((f.puerta_tipos||[]).length,f.n_puertas||0))).filter(x=>x>0);
  const costoProm = reps.length ? Math.round(reps.reduce((a,b)=>a+b,0)/reps.length) : 0;
  const nCats = new Set(fams.map(f=>f.categoria_id||'__none')).size;
  const kpi = (lbl,val,sub)=>`<div class="kpi"><div class="kpi-l">${lbl}</div>
     <div class="kpi-v">${val}</div><div class="kpi-s">${sub||''}</div></div>`;
  const kpis = `<div class="kpi-row">
    ${kpi('Modelos', fams.length, 'plantillas')}
    ${kpi('Variantes', fmt(totVar), 'combinaciones')}
    ${kpi('Costo promedio', costoProm?('$'+fmt(costoProm)):'—', 'costo directo')}
    ${kpi('Categorías', nCats, 'con modelos')}
  </div>`;

  // Tabs por categoría
  const conteo = {}; fams.forEach(f=>{ const k=f.categoria_id||'__none'; conteo[k]=(conteo[k]||0)+1; });
  const tabDefs = [['todos','Todos',fams.length]]
    .concat(Object.keys(conteo).sort((a,b)=>catName(a).localeCompare(catName(b)))
      .map(k=>[k,catName(k),conteo[k]]));
  const tabs = `<div class="subtabbar">${tabDefs.map(([k,n,c])=>
    `<button class="subtab ${state.modCat===k?'active':''}" data-modcat="${esc(k)}">${esc(n)} <span class="subtab-n">${c}</span></button>`).join('')}
    <button class="btn-primary btn-sm" style="margin-left:auto" data-newfam>+ Nuevo modelo</button></div>`;

  // Lista filtrada
  const list = (state.modCat==='todos' ? fams : fams.filter(f=>(f.categoria_id||'__none')===state.modCat))
    .slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));

  const tabla = list.length ? `<div class="card" style="padding:0;overflow:hidden;">
    <table class="mod-tbl"><thead><tr>
      <th>Modelo</th><th>Diseño</th><th class="num">Costo</th>
    </tr></thead><tbody>${list.map(filaModelo).join('')}</tbody></table></div>`
    : empty(fams.length ? 'No hay modelos en esta categoría.' : 'Todavía no cargaste ningún modelo. Empezá con "+ Nuevo modelo".');

  return head('01 · Modelos','Modelos de fábrica',
      'Cada modelo se carga una vez y se despliega en todas sus variantes. Tocá un modelo para ver sus variantes y el costo de cada una.')
    + kpis + tabs + tabla;
}

/* ---- Draft nuevo ---- */
function nuevaFamiliaDraft(){
  return {nombre:'', categoria_id:state.categorias[0]?.id||null, apertura:'corrediza', n_puertas:2,
          colores:[{label:'',placa_id:'',tapacanto_id:''}],
          puerta_tipos:[{label:'Placa', hereda:true, lleva_tapacanto:true}],
          receta_fija:{fondo:{material_id:''}, kits:[], sueltos:[]},
          roles:[], medidas:[], notas:''};
}
function nuevaMedida(base){
  if(base) return JSON.parse(JSON.stringify({...base, ancho:'', notas:''}));
  return {ancho:'',alto:'',prof:60,carcasa_m2:'',carcasa_tapacanto_m:'',
          puerta_m2:'',puerta_tapacanto_m:'',fondo_m2:'',horas:{},cant:{},otros:0,notas:''};
}

/* ---- Filas auxiliares ---- */
function kitsRows(d){
  const list=(d.receta_fija&&d.receta_fija.kits)||[];
  if(!list.length) return '<div class="helper" style="margin:0;">Sin combos. Un combo agrupa insumos que siempre van juntos.</div>';
  return list.map((kl,ix)=>`<div class="fam-suelto-row">
    <select data-fk="${ix}" data-f="kit_id"><option value="">— combo —</option>
      ${state.kits.map(k=>`<option value="${k.id}" ${k.id===kl.kit_id?'selected':''}>${esc(k.nombre)} ($${fmt(kitCost(k))})</option>`).join('')}</select>
    <input data-fk="${ix}" data-f="cantidad" type="number" step="0.01" value="${kl.cantidad||1}" style="text-align:right;">
    <button class="icon-btn" data-rmfk="${ix}">✕</button></div>`).join('');
}
function sueltosRows(d){
  const list=(d.receta_fija&&d.receta_fija.sueltos)||[];
  if(!list.length) return '<div class="helper" style="margin:0;">Sin insumos sueltos. Agregá correderas, pitutos, cola, tiradores.</div>';
  return list.map((s,ix)=>`<div class="fam-suelto-row">
    <select data-fs="${ix}" data-f="insumo_id"><option value="">— insumo / herraje —</option>
      ${state.insumos.map(i=>`<option value="${i.id}" ${i.id===s.insumo_id?'selected':''}>${esc(i.nombre)}</option>`).join('')}</select>
    <input data-fs="${ix}" data-f="cantidad" type="number" step="0.01" value="${s.cantidad||''}" placeholder="cant." style="text-align:right;">
    <button class="icon-btn" data-rmfs="${ix}">✕</button></div>`).join('');
}

/* ---- Ficha de una medida ---- */
function medidaFicha(d){
  const ix = state.medIx;
  const m = d.medidas[ix];
  if(!m) return '';
  const roles = (d.roles||[]).map(rid=>{
    const r = state.roles.find(x=>x.id===rid);
    return `<div><label>${esc(r?r.nombre:'?')}</label>
      <input data-mh="${rid}" type="number" step="0.5" value="${(m.horas&&m.horas[rid])||''}" style="text-align:right;"></div>`;
  }).join('');
  const bloque = (titulo,sub,icono,campos)=>`
    <div class="med-bloque">
      <div class="med-bloque-tit">${titulo}${sub?`<span class="med-bloque-sub">· ${sub}</span>`:''}</div>
      <div class="med-bloque-grid" style="grid-template-columns:repeat(${campos.length},1fr);">${campos.join('')}</div>
    </div>`;
  const campo = (label,key,step)=>`<div><label>${label}</label>
    <input data-mf="${key}" type="number" step="${step||'0.01'}" value="${m[key]!==''&&m[key]!==undefined?m[key]:''}" style="text-align:right;"></div>`;

  return `<div class="card med-ficha">
    <div class="med-ficha-head">
      <span class="med-ficha-tit">${m.ancho&&m.alto?`Medida ${m.ancho} × ${m.alto}`:'Medida nueva'}</span>
      ${m._dup?`<span class="pill">duplicada</span>`:''}
    </div>
    <div class="med-bloque-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px;">
      <div><label>Ancho (cm)</label><input data-mf="ancho" type="number" value="${m.ancho||''}"></div>
      <div><label>Alto (cm)</label><input data-mf="alto" type="number" value="${m.alto||''}"></div>
      <div><label>Prof. (cm)</label><input data-mf="prof" type="number" value="${m.prof||''}"></div>
    </div>

    ${bloque('Carcasa','el mueble sin las puertas','',[campo('m² de placa','carcasa_m2'),campo('tapacanto (m)','carcasa_tapacanto_m')])}
    ${bloque('Puerta — una hoja','se multiplica por las puertas que elijas','',[campo('m² de placa','puerta_m2'),campo('tapacanto (m)','puerta_tapacanto_m')])}
    ${bloque('Fondo','no cambia con el color','',[campo('m²','fondo_m2')])}
    ${(d.roles||[]).length?`<div class="med-bloque">
      <div class="med-bloque-tit">Horas por rol</div>
      <div class="med-bloque-grid" style="grid-template-columns:repeat(${(d.roles||[]).length},1fr);">${roles}</div>
    </div>`:'<div class="helper">Marcá roles de mano de obra en la cabecera para cargar horas.</div>'}

    <div class="med-bloque">
      <div class="med-bloque-tit">Adicionales</div>
      <div class="med-bloque-grid" style="grid-template-columns:150px 1fr;">
        <div><label>Otros costos ($)</label><input data-mf="otros" type="number" value="${m.otros||0}" style="text-align:right;"></div>
        <div><label>Notas de esta medida</label><input data-mnotas value="${esc(m.notas||'')}" placeholder="ej: lleva refuerzo central"></div>
      </div>
    </div>

    <div class="med-ficha-foot">
      <button class="icon-btn" data-medcancel>Cancelar</button>
      <button class="btn-primary" data-medok>Listo</button>
    </div>
  </div>`;
}

/* ---- Sección colapsable del editor ---- */
function fsec(n, title, sub, meta, inner){
  const abierta = state.famOpen === n;
  return `<section class="fsec ${abierta?'open':''}">
    <div class="fsec-h" data-sec="${n}">
      <div class="fsec-n">${n}</div>
      <div class="fsec-tt"><div class="fsec-t">${title}</div>${sub?`<div class="fsec-d">${sub}</div>`:''}</div>
      <div class="fsec-meta">${meta?`<span>${meta}</span>`:''}<span class="caret">▶</span></div>
    </div>
    <div class="fsec-b">${inner}</div>
  </section>`;
}

/* ---- Panel de costo en vivo (al costado del editor) ---- */
function ensurePreview(d, combos){
  const pv = state.preview || {};
  const clamp = (v,max)=> Math.min(Math.max(0, v|0), Math.max(0, max-1));
  const out = {
    medIx:   clamp(pv.medIx,   (d.medidas||[]).length),
    colorIx: clamp(pv.colorIx, (d.colores||[]).length),
    comboIx: clamp(pv.comboIx, combos.length)
  };
  state.preview = out;
  return out;
}
function famCostPanel(d){
  const combos = combosPuertas((d.puerta_tipos||[]).length, d.n_puertas||0);
  const pv = ensurePreview(d, combos);
  const opt = (arr,cur,fn)=>arr.map((x,i)=>`<option value="${i}" ${i===cur?'selected':''}>${fn(x,i)}</option>`).join('')||'<option>—</option>';
  const sel = `<div class="cp-sel">
      <div class="field"><label>Medida</label><select data-pv="medIx">
        ${opt(d.medidas||[], pv.medIx, m=>`${esc(m.ancho||'?')} × ${esc(m.alto||'?')}`)}</select></div>
      <div class="field"><label>Color</label><select data-pv="colorIx">
        ${opt(d.colores||[], pv.colorIx, (c,i)=>esc(c.label||('Color '+(i+1))))}</select></div>
      <div class="field"><label>Puertas</label><select data-pv="comboIx">
        ${opt(combos, pv.comboIx, c=>esc(comboLabel(d,c)))}</select></div>
    </div>`;
  const has = (d.medidas||[]).length && (d.colores||[]).length && combos.length;
  if(!has) return `<div class="card cp-card"><div class="cp-h">Costo en vivo</div>
    <div class="cp-b">${sel}<div class="helper" style="margin-top:12px;">Cargá al menos una medida, un color y las puertas para ver el costo de la variante.</div></div></div>`;
  const med = d.medidas[pv.medIx];
  const c = costoVariante(d, med, pv.colorIx, combos[pv.comboIx]);
  const falt = faltantesFam(d, med, pv.colorIx, combos[pv.comboIx]);
  const filas = [
    ['Carcasa + filo', c.carcasa, 'var(--blue)'],
    ['Puertas',        c.puertas, '#7C9CF5'],
    ['Fondo',          c.fondo,   'var(--gray)'],
    ['Herrajes e insumos', c.herrajes, 'var(--amber)'],
    ['Mano de obra',   c.manoObra,'var(--red)'],
    ['Otros',          c.otros,   '#A78BFA']
  ].filter(r=>r[1]>0);
  const tot = c.total||1;
  return `<div class="card cp-card"><div class="cp-h">Costo en vivo <span class="pill">variante</span></div>
    <div class="cp-b">
      ${sel}
      <div class="cp-big"><div class="cp-lbl">Costo directo</div><div class="cp-val">$${fmt(c.total)}</div></div>
      <div class="cp-bar">${filas.map(r=>`<span style="width:${(r[1]/tot*100).toFixed(1)}%;background:${r[2]}"></span>`).join('')}</div>
      <div class="cp-brk">${filas.map(r=>`<div class="cp-row">
        <span class="cp-dot" style="background:${r[2]}"></span>
        <span class="cp-nm">${r[0]}</span>
        <span class="cp-pc">${(r[1]/tot*100).toFixed(0)}%</span>
        <span class="cp-am">$${fmt(r[1])}</span></div>`).join('')}</div>
      ${falt.length?`<div class="warn-box" style="margin-top:12px;">Faltan precios: ${esc(falt.join(', '))}</div>`:''}
    </div></div>`;
}

/* ---- Grilla de medidas (tabla editable tipo ingeniería) ---- */
function medidasGrid(d){
  const roles = (d.roles||[]).map(rid=>({rid, nom:(state.roles.find(x=>x.id===rid)||{}).nombre||'?'}));
  if(!(d.medidas||[]).length)
    return '<div class="helper" style="margin:0 0 8px;">Todavía no cargaste ninguna medida. Tocá “+ Agregar medida”.</div>';
  const cel = (ix,key,val,step)=>`<td><input class="gcell" data-row="${ix}" data-gmf="${key}"
      type="number" step="${step||'0.01'}" value="${(val!==''&&val!==undefined&&val!==null)?val:''}"></td>`;
  const rows = d.medidas.map((m,ix)=>`<tr>
      <td><input class="gcell w-med" data-row="${ix}" data-gmf="ancho" type="number" step="1" value="${m.ancho||''}"></td>
      ${cel(ix,'alto',m.alto,'1')}${cel(ix,'prof',m.prof,'1')}
      ${cel(ix,'carcasa_m2',m.carcasa_m2)}${cel(ix,'puerta_m2',m.puerta_m2)}
      ${cel(ix,'fondo_m2',m.fondo_m2)}${cel(ix,'carcasa_tapacanto_m',m.carcasa_tapacanto_m)}
      ${roles.map(r=>`<td><input class="gcell" data-row="${ix}" data-gmh="${r.rid}" type="number" step="0.5"
          value="${(m.horas&&m.horas[r.rid])||''}"></td>`).join('')}
      <td class="gact">
        <button class="iconbtn" data-gmdup="${ix}" title="Duplicar">⧉</button>
        <button class="iconbtn danger" data-gmrm="${ix}" title="Eliminar">✕</button></td>
    </tr>`).join('');
  return `<div class="med-grid-wrap"><table class="med-grid"><thead><tr>
      <th>Medida</th><th>Alto</th><th>Prof</th><th>Carcasa m²</th><th>Puerta m²</th>
      <th>Fondo m²</th><th>Filo m</th>${roles.map(r=>`<th>${esc(r.nom)} h</th>`).join('')}<th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* Refresca SOLO el panel de costo (sin re-render total) para no perder
   el foco mientras se tipea en la grilla de medidas / herrajes. */
function refrescarPanel(){
  const host = document.getElementById('fam-side');
  if(!host || !state.famDraft) return;
  host.innerHTML = famCostPanel(state.famDraft);
  host.querySelectorAll('[data-pv]').forEach(e=>e.onchange=()=>{
    state.preview = state.preview||{}; state.preview[e.dataset.pv] = +e.value||0; render(); });
}

/* ---- Módulo Herrajes e insumos (cantidades por medida) ---- */
function herrajesModulo(d){
  const rf = d.receta_fija||{};
  const meds = d.medidas||[];
  const mi = Math.min((state.preview||{}).medIx||0, Math.max(0, meds.length-1));
  const med = meds[mi];
  const cat = (state.categorias.find(c=>c.id===d.categoria_id)||{}).nombre||'';
  const singular = cat ? cat.toLowerCase().replace(/s$/,'') : 'modelo';
  const medSel = `<div class="medbar">
      <span class="medbar-lb">Insumos para ${esc(singular)} de</span>
      <select id="fam-med-activa">${meds.map((m,i)=>`<option value="${i}" ${i===mi?'selected':''}>${esc(m.ancho||'?')} × ${esc(m.alto||'?')}</option>`).join('')||'<option>— sin medidas —</option>'}</select>
      <button class="btn-sm" data-copiartodas>⧉ Copiar a todas</button>
    </div>`;
  const filas = (rf.sueltos||[]).map((s,ix)=>{
    const i  = state.insumos.find(x=>x.id===s.insumo_id);
    const cu = i ? costPerUnit(i) : 0;
    const cant = (med && med.cant && med.cant[s.insumo_id]!==undefined) ? med.cant[s.insumo_id] : (s.cantidad||0);
    return `<tr>
      <td><select class="gsel" data-fs="${ix}" data-f="insumo_id"><option value="">— insumo / herraje —</option>
        ${state.insumos.map(x=>`<option value="${x.id}" ${x.id===s.insumo_id?'selected':''}>${esc(x.nombre)}</option>`).join('')}</select></td>
      <td class="num"><input class="gcell" data-hcant="${ix}" type="number" step="0.01" value="${(cant!==''&&cant!==undefined)?cant:''}"></td>
      <td class="num">${fmt(cu)}</td>
      <td class="num" data-hsub="${ix}">$${fmt(cu*(cant||0))}</td>
      <td class="num"><button class="iconbtn danger" data-rmfs="${ix}">✕</button></td>
    </tr>`;
  }).join('');
  const tabla = `<div class="med-grid-wrap"><table class="med-grid herr">
      <thead><tr><th>Ítem</th><th>Cant.</th><th>Costo unit.</th><th>Subtotal</th><th></th></tr></thead>
      <tbody>${filas||'<tr><td colspan="5"><div class="helper" style="margin:0;padding:8px;">Sin herrajes. Agregá con el botón de abajo.</div></td></tr>'}</tbody></table></div>`;
  return `${meds.length?medSel:'<div class="helper" style="margin:0 0 10px;">Primero cargá medidas en el módulo Medidas.</div>'}
    ${tabla}
    <button class="add-line-btn" data-addsuelto style="margin-top:8px;">+ Agregar herraje</button>
    <div class="helper" style="margin-top:10px;">Los que no cambian (tornillos, pitutos) cargalos una vez y tocá <b>“Copiar a todas”</b>. Los que cambian con la medida (el barral) editalos entrando a cada medida.</div>`;
}

/* ---- Editor de familia ---- */
function familiaEditor(){
  const d = state.famDraft;
  const placas = state.materiales;
  const roles  = state.roles;
  const rf = d.receta_fija||{};
  const combos = combosPuertas((d.puerta_tipos||[]).length, d.n_puertas||0);

  const coloresRows = (d.colores||[]).map((c,ix)=>{
    const placa = state.materiales.find(m=>m.id===c.placa_id);
    const pm2 = placa ? costPerM2(placa) : 0;
    return `<div class="fam-color-row">
      <input data-fc="${ix}" data-f="label" value="${esc(c.label)}" placeholder="ej: Mel Blanco">
      <select data-fc="${ix}" data-f="placa_id"><option value="">— placa cuerpo —</option>
        ${placas.map(m=>`<option value="${m.id}" ${m.id===c.placa_id?'selected':''}>${esc(m.nombre)}</option>`).join('')}</select>
      <select data-fc="${ix}" data-f="tapacanto_id"><option value="">— tapacanto —</option>
        ${state.insumos.map(i=>`<option value="${i.id}" ${i.id===c.tapacanto_id?'selected':''}>${esc(i.nombre)}</option>`).join('')}</select>
      <div class="fam-color-cost">${pm2?('$'+fmt(pm2)):'—'}</div>
      <button class="icon-btn" data-rmfc="${ix}" ${(d.colores.length===1)?'style="visibility:hidden;"':''}>✕</button>
    </div>`;}).join('');

  const tiposRows = `<div class="med-grid-wrap"><table class="med-grid herr">
    <thead><tr><th>Tipo</th><th>Material</th><th>¿Lleva filo?</th><th class="num">Metros de filo</th><th></th></tr></thead>
    <tbody>${(d.puerta_tipos||[]).map((t,ix)=>{
      const lleva = t.lleva_tapacanto !== false;
      const mat = t.hereda ? 'hereda el color del cuerpo' : ((state.materiales.find(m=>m.id===t.material_id)||{}).nombre||'—');
      return `<tr>
        <td><b>${esc(t.label)}</b></td>
        <td>${esc(mat)}</td>
        <td><button class="tgl ${lleva?'on':'off'}" data-pttap="${ix}">${lleva?'Sí':'No'}</button></td>
        <td class="num">${lleva?`<input class="gcell" data-ptm="${ix}" type="number" step="0.01" value="${(t.tapacanto_m!==undefined&&t.tapacanto_m!=='')?t.tapacanto_m:''}" placeholder="m">`:'—'}</td>
        <td class="num"><button class="iconbtn danger" data-rmpt="${ix}">✕</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;

  const medRows = (d.medidas||[]).length ? (d.medidas||[]).map((m,ix)=>`
    <div class="med-item ${state.medIx===ix?'med-item-on':''}">
      <div class="med-item-main">
        <div class="med-item-tit">${m.ancho&&m.alto?`${m.ancho} × ${m.alto}`:'(sin medida)'}</div>
        <div class="med-item-sub">carcasa ${m.carcasa_m2||0} m² · puerta ${m.puerta_m2||0} m² c/u · fondo ${m.fondo_m2||0} m²</div>
      </div>
      <button class="icon-btn" data-meddup="${ix}">Duplicar</button>
      <button class="icon-btn" data-meded="${ix}">Editar</button>
      <button class="icon-btn" data-medrm="${ix}">✕</button>
    </div>`).join('') : '<div class="helper" style="margin:0;">Todavía no cargaste ninguna medida.</div>';

  const catNombre = (state.categorias.find(c=>c.id===d.categoria_id)||{}).nombre||'';
  const esCama = /cama/i.test(catNombre);
  const frenteLbl = esCama ? 'Frente / Respaldo' : 'Puertas';

  // 1 · Identidad
  const s1 = fsec(1,'Identidad','Categoría y nombre del modelo',
    `${esc(catNombre||'Sin categoría')} · ${esc(d.nombre||'—')}`,
    `<div class="row-2">
        <div class="field"><label>Categoría</label>
          <input id="fam-cat-txt" list="fam-cat-list" value="${esc(catNombre)}" placeholder="escribí o elegí una categoría…" autocomplete="off">
          <datalist id="fam-cat-list">${state.categorias.map(c=>`<option value="${esc(c.nombre)}"></option>`).join('')}</datalist></div>
        <div class="field"><label>Nombre del modelo</label><input id="fam-nombre" value="${esc(d.nombre)}" placeholder="ej: Oliver"></div>
      </div>
      <div class="helper">Podés <b>escribir</b> una categoría nueva o elegir una existente. La apertura y el nº de ${esCama?'frentes':'puertas'} están en el módulo <b>${frenteLbl}</b>.</div>`);

  // 2 · Medidas (con roles de mano de obra foldeados acá)
  const s2 = fsec(2,'Medidas','Cargás la medida y completás sus m² + horas, todo junto',
    `${(d.medidas||[]).length} medida(s)`,
    `<div class="fam-block-lbl">Roles de mano de obra <span style="color:var(--mut);font-weight:500;">(arman las columnas de horas)</span></div>
      <div class="fam-roles-pick">${roles.map(r=>`<label class="fam-role-chip"><input type="checkbox" data-famrole="${r.id}" ${(d.roles||[]).includes(r.id)?'checked':''}> ${esc(r.nombre)}</label>`).join('')||'<span style="color:var(--mut);">Cargá roles en la pestaña “Mano de obra” primero.</span>'}</div>
      <div class="fam-block-lbl" style="margin-top:14px">Medidas</div>
      ${medidasGrid(d)}
      <button class="add-line-btn" data-addmed style="margin-top:8px;">+ Agregar medida</button>`);

  // 3 · Colores y terminación (+ fondo material fijo)
  const s3 = fsec(3,'Colores y terminación','Color → placa → filo/tapacanto → $/m²',
    `${(d.colores||[]).length} color${(d.colores||[]).length!==1?'es':''}`,
    `<div class="fam-row-head cols"><span>Color</span><span>Placa (cuerpo)</span><span>Tapacanto</span><span style="text-align:right">$/m²</span><span></span></div>
     ${coloresRows}<button class="add-line-btn" data-addfc>+ Agregar color</button>
     <div class="fam-block-lbl" style="margin-top:16px">Fondo <span style="color:var(--mut);font-weight:500;">(material fijo)</span></div>
     <select id="fam-fondo" style="max-width:420px"><option value="">— sin fondo —</option>
        ${placas.map(m=>`<option value="${m.id}" ${m.id===(rf.fondo&&rf.fondo.material_id)?'selected':''}>${esc(m.nombre)}</option>`).join('')}</select>`);

  // 4 · Puertas / Frente (apertura + nº + tipos)
  const s4 = fsec(4, frenteLbl,'Apertura, cantidad y tipos que generan las variantes',
    `${esc(d.apertura||'—')} · ${d.n_puertas||0} · ${(d.puerta_tipos||[]).length} tipo(s)`,
    `<div class="row-2">
        <div class="field"><label>Apertura</label><select id="fam-apertura">
          <option value="corrediza" ${d.apertura==='corrediza'?'selected':''}>Corrediza</option>
          <option value="abrir" ${d.apertura==='abrir'?'selected':''}>De abrir</option>
        </select></div>
        <div class="field"><label>Nº de ${esCama?'frentes':'puertas'}</label>
          <input id="fam-npuertas" type="number" min="0" max="6" value="${d.n_puertas}"></div>
      </div>
      <div class="fam-block-lbl">Tipos</div>
      ${tiposRows}
      <div class="fam-tipo-new">
        <input id="fam-npt-label" placeholder="ej: Espejo">
        <select id="fam-npt-mat"><option value="">— material —</option>
          ${placas.map(m=>`<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select>
        <label class="fam-role-chip"><input type="checkbox" id="fam-npt-tap"> lleva tapacanto</label>
        <button class="icon-btn" data-addpt>+ tipo</button>
      </div>
      ${combos.length?`<div class="fam-combos">
        <div class="fam-combos-tit">Combinaciones que se generan solas (${combos.length})</div>
        ${combos.map(c=>`<span class="chip chip-static">${esc(comboLabel(d,c))}</span>`).join(' ')}
      </div>`:''}`);

  // 5 · Herrajes e insumos (por medida)
  const s5 = fsec(5,'Herrajes e insumos','Cantidades por medida — elegí la medida y editá',
    `${(rf.sueltos||[]).length} ítem(s)`,
    herrajesModulo(d));

  // 6 · Observaciones
  const s6 = fsec(6,'Observaciones','Notas internas del modelo','',
    `<input id="fam-notas" value="${esc(d.notas||'')}" placeholder="observaciones generales de este modelo">`);

  // Módulos futuros (deshabilitados)
  const futSec = (n,tit,desc)=>`<section class="fsec fsec-fut"><div class="fsec-h" style="cursor:default">
      <div class="fsec-n">${n}</div><div class="fsec-tt"><div class="fsec-t">${tit}</div><div class="fsec-d">${desc}</div></div>
      <div class="fsec-meta"><span class="pill">Próximamente</span></div></div></section>`;
  const sFut = futSec(7,'Procesos externos','Laqueado, CNC, terceros…') + futSec(8,'Otros / Indirectos','Reglas y costos indirectos');

  return `<div class="fam-editor">
    <div class="fam-editor-head">
      <button class="icon-btn" data-famback>← Volver</button>
      <div style="flex:1;min-width:0;">
        <h1 class="page-title" style="margin:2px 0 0;">${esc(d.nombre)||(d.id?'Editar modelo':'Nuevo modelo')}</h1>
        <div class="page-desc" style="margin:2px 0 0;">${esc(catNombre||'Sin categoría')} · ${esc(d.apertura||'')}${d.n_puertas?` · ${d.n_puertas} ${esCama?'frentes':'puertas'}`:''} · ${nVariantes(d)} variantes</div>
      </div>
      <button class="btn-primary" data-savefam>Guardar modelo</button>
    </div>

    <div class="fam-grid">
      <div class="fam-secs">${s1}${s2}${s3}${s4}${s5}${s6}${sFut}</div>
      <div class="fam-side" id="fam-side">${famCostPanel(d)}</div>
    </div>

    <div class="fam-editor-foot">
      <span class="fam-count">${nVariantes(d)} variantes</span>
      <button class="btn-primary" data-savefam>Guardar modelo</button>
    </div>
  </div>`;
}

/* ---------- PRODUCTOS: modelos + matriz de variantes ---------- */
function productsPage(){
  const modelos = [...new Set(state.productos.map(p=>p.modelo).filter(Boolean))].sort();
  const sueltos = state.productos.filter(p=>!p.modelo);
  if(!state.modeloSel && modelos.length) state.modeloSel = modelos[0];

  const lista = state.productos
    .filter(p => p.modelo===state.modeloSel)
    .sort((a,b)=>(a.ancho||0)-(b.ancho||0));

  const maxPuertas = Math.max(0, ...lista.map(p=>p.puertas||0));
  if(state.espejoSel > maxPuertas) state.espejoSel = 0;

  const nav = `
    <aside class="modelo-nav">
      ${modelos.map(m=>{
        const n = state.productos.filter(p=>p.modelo===m).length;
        return `<button class="modelo-btn ${state.modeloSel===m?'active':''}" data-modelo="${esc(m)}">
          ${esc(m)} <span class="modelo-n">${n}</span></button>`;
      }).join('')}
      ${sueltos.length?`<button class="modelo-btn ${state.modeloSel==='__otros'?'active':''}" data-modelo="__otros">
        Otros <span class="modelo-n">${sueltos.length}</span></button>`:''}
      <button class="add-line-btn" style="margin-top:10px;" data-new="producto">+ Producto</button>
    </aside>`;

  const vlist = variantesMat();
  const sinVariantes = !vlist.length ? `<div class="warn-box">Todavía no configuraste las <strong>variantes de material</strong> (ej. Mel blanco / Mel madera) ni el material de <strong>Espejo</strong>. Andá a Configuración → "Variantes de material y espejo" para poder calcular estas combinaciones.</div>` : '';

  const espejoBar = maxPuertas>0 ? `
    <div class="espejo-bar">
      <span class="espejo-lbl">Puertas espejadas <span class="espejo-de">de ${maxPuertas}</span></span>
      ${Array.from({length:maxPuertas+1},(_,n)=>`<button class="chip ${state.espejoSel===n?'chip-on':''}" data-espejo="${n}">
        ${n===0?'Ninguna':n===1?'1 puerta':n+' puertas'}</button>`).join('')}
    </div>` : '';

  const cuerpo = lista.length ? `
    <table class="matriz">
      <thead><tr>
        <th style="width:26%;">Medida</th>
        ${vlist.map(m=>`<th class="num">${esc(m.label)}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${lista.map(p=>`<tr>
          <td>
            <strong>${p.ancho}×${p.alto}</strong>
            <span class="dim-prof">prof ${p.profundidad||'—'}${p.puertas?` · ${p.puertas} puertas`:''}</span>
          </td>
          ${vlist.map((m,ix)=>{
            const v = {mat:ix, esp:state.espejoSel};
            const q = aplicarVariante(p, v);
            const c = productCost(q);
            const f = faltantes(q);
            return `<td class="num celda" data-cell="${p.id}|${ix}|${state.espejoSel}">
              <span class="celda-costo">$${fmt(c.total)}</span>
              ${f.length?`<span class="celda-warn">${f.length} sin precio</span>`:''}
            </td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>` : empty('No hay productos en este modelo.');

  return head('02 · Productos','Productos',
    'Cada medida es una receta. El material y el espejo son variantes: cambian el costo sin duplicar el producto.')
    + sinVariantes
    + `<div class="prod-layout">${nav}
        <section>
          ${espejoBar}
          <div class="card" style="padding:0;overflow:hidden;">${cuerpo}</div>
        </section>
      </div>`;
}

/* ---------- OTROS (productos sin modelo) ---------- */
function otrosPage(){
  const l = state.productos.filter(p=>!p.modelo);
  return l.map(p=>{
    const c = productCost(p);
    return `<div class="prod-card" data-view="${p.id}">
      <div class="prod-name">${esc(p.nombre)}</div>
      <div class="prod-cost">$${fmt(c.total)}</div></div>`;
  }).join('');
}

function productDetail(){
  const base = state.productos.find(x=>x.id===state.productDetail);
  if(!base) return empty('Producto no encontrado.');
  const v = state.variante;
  const p = aplicarVariante(base, v);          // receta con la variante aplicada
  const c = productCost(p);
  const f = faltantes(p);
  const vi = variantesIncompletas(base, v);
  const cat = state.categorias.find(x=>x.id===base.categoria_id);
  const corr = esCorredizo(base);
  const vlist = variantesMat();

  const selector = `
    <div class="var-selector">
      <div class="var-group">
        <span class="var-lbl">Material</span>
        ${vlist.map((m,ix)=>`<button class="chip ${v.mat===ix?'chip-on':''}" data-vmat="${ix}">${esc(m.label)}</button>`).join('')}
      </div>
      ${corr?`<div class="var-group">
        <span class="var-lbl">Espejo</span>
        ${Array.from({length:(base.puertas||0)+1},(_,n)=>`<button class="chip ${v.esp===n?'chip-on':''}" data-vesp="${n}">${n===0?'Ninguno':n===1?'1 puerta':n+' puertas'}</button>`).join('')}
      </div>`:''}
    </div>`;
  const pct = v => c.total ? (v/c.total*100).toFixed(0) : 0;
  const row = (label,v) => `<div class="breakdown-row"><span class="label">${label}</span>
    <span><span class="amt">$${fmt(v)}</span><span class="pct">${pct(v)}%</span></span></div>`;
  return `<button class="back-link" id="back">← Volver a productos</button>
  ${vi.length?`<div class="warn-box"><strong>Variantes sin configurar.</strong> ${vi.map(esc).join(' ')}</div>`:''}
  ${f.length?`<div class="warn-box"><strong>Costo incompleto.</strong> Estos ítems están en $0 y no suman al total:
     ${f.map(esc).join(', ')}. Cargales el precio antes de usar este número para cotizar.</div>`:''}
  <div class="page-eyebrow">${esc(cat?.nombre||'Sin categoría')}${base.modelo?' · '+esc(base.modelo):''}</div>
  <h1 class="page-title">${esc(base.nombre)}</h1>
  <p class="page-desc">${base.ancho||'—'} × ${base.alto||'—'} × ${base.profundidad||'—'} cm · <strong>${varLabel(v)}</strong></p>
  ${selector}
  <div class="detail-grid">
    <div class="ticket">
      <div class="card-title">Desglose de costo</div>
      ${row('Materiales',c.materiales)}
      ${row('Insumos (pintura, cola, herrajes…)',c.insumos)}
      ${row(`Mano de obra <span style="font-size:11px;color:var(--ink-soft);">(base $${fmt(c.moBase)} + ${state.config.carga_laboral_pct}% carga)</span>`,c.manoDeObra)}
      ${row('Otros',c.otros)}
      <div class="total-row"><span class="label">Costo directo total</span><span class="amt">$${fmt(c.total)}</span></div>
      <div class="helper" style="margin-top:14px;">Este es el <strong>costo directo</strong>. Todavía no incluye la estructura del taller (alquiler, luz, amortización), así que no es el costo total: no le pongas margen como si lo fuera.</div>
      <div style="margin-top:14px;"><button class="btn-primary" data-edit="producto:${base.id}">Editar receta base</button>
      <button class="icon-btn" data-del="productos:${base.id}" style="color:var(--red);margin-left:8px;">Borrar</button></div>
    </div>
    <div class="card">
      <div class="card-title">Receta</div>
      <div class="section-label">Materiales</div>
      ${(p.materiales||[]).map(l=>{const m=state.materiales.find(x=>x.id===l.material_id);
        return `<div class="breakdown-row" style="font-size:13px;"><span class="label">${esc(m?.nombre||'—')}</span>
        <span class="amt">${l.m2} m² · $${fmt(m?costPerM2(m)*l.m2:0)}</span></div>`;}).join('')||'<div class="helper">Sin materiales.</div>'}
      <div class="section-label">Insumos</div>
      ${(p.insumos||[]).map(l=>{const i=state.insumos.find(x=>x.id===l.insumo_id);
        return `<div class="breakdown-row" style="font-size:13px;"><span class="label">${esc(i?.nombre||'—')}</span>
        <span class="amt">${l.cantidad} ${esc(i?.unidad||'')} · $${fmt(i?costPerUnit(i)*l.cantidad:0)}</span></div>`;}).join('')||'<div class="helper">Sin insumos.</div>'}
      <div class="section-label">Herrajes (kit + sueltos)</div>
      ${p.kit_id?(()=>{const k=state.kits.find(x=>x.id===p.kit_id);
        return `<div class="breakdown-row" style="font-size:13px;"><span class="label">${esc(k?.nombre||'—')} <span class="pill">kit</span></span>
        <span class="amt">$${fmt(k?kitCost(k):0)}</span></div>`;})():''}
      ${(p.sueltos||[]).map(l=>{const i=state.insumos.find(x=>x.id===l.insumo_id);
        return `<div class="breakdown-row" style="font-size:13px;"><span class="label">${esc(i?.nombre||'—')}</span>
        <span class="amt">${l.cantidad} × $${fmt2(i?costPerUnit(i):0)}</span></div>`;}).join('')}
      ${!p.kit_id&&!(p.sueltos||[]).length?'<div class="helper">Sin herrajes.</div>':''}
      <div class="section-label">Mano de obra</div>
      ${(p.horas||[]).map(l=>{const r=state.roles.find(x=>x.id===l.rol_id);
        return `<div class="breakdown-row" style="font-size:13px;"><span class="label">${esc(r?.nombre||'—')}</span>
        <span class="amt">${l.horas}h × $${fmt(r?.tarifa||0)}</span></div>`;}).join('')||'<div class="helper">Sin horas.</div>'}
    </div>
  </div>`;
}

/* ---------- MODALES ---------- */
let draft = {};   // líneas dinámicas en edición

function modalHtml(){
  const {type,id} = state.modal;
  const titles = {material:'placa',insumo:'insumo',kit:'kit',rol:'rol',
                  categoria:'categoría',producto:'producto'};
  const forms  = {material:materialForm,insumo:insumoForm,kit:kitForm,
                  rol:rolForm,categoria:categoriaForm,producto:productoForm};
  const wide = (type==='material'||type==='insumo') ? ' modal-wide' : '';
  return `<div class="modal-backdrop" id="backdrop"><div class="modal${wide}">
    <div class="modal-head">
      <div class="modal-title">${id?'Editar':'Agregar'} ${titles[type]}</div>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    ${forms[type](id)}
  </div></div>`;
}

const familiaField = (cur,key)=>{
  const list = [...new Set(state[key].map(x=>x.familia).filter(Boolean))];
  return `<div class="field"><label>Familia (agrupá para filtrar más rápido)</label>
    <input id="f-familia" value="${esc(cur)}" list="fam-list" placeholder="ej: Melaminas, Correderas, Pinturas">
    <datalist id="fam-list">${list.map(f=>`<option value="${esc(f)}">`).join('')}</datalist></div>`;
};
const proveedorNames = () => {
  const set = new Set();
  [...state.materiales,...state.insumos].forEach(x=>{
    if(x.proveedor) set.add(x.proveedor);
    (x.proveedores_alt||[]).forEach(p=>p.proveedor&&set.add(p.proveedor));
  });
  return [...set];
};
// draft.provs = lista unificada de proveedores; draft.provActivo = índice del elegido
function proveedoresLines(precioLabel){
  const list = draft.provs||[];
  if(!list.length) return '<div class="helper">Todavía no cargaste ningún proveedor para este ítem. Agregá al menos uno con el botón de abajo.</div>';
  const multi = list.length>1;
  return `<div class="prov-head">
      <span>${multi?'Usar':''}</span><span>Proveedor</span><span>${precioLabel}</span><span>Desc. %</span><span>Fecha</span><span></span>
    </div>` + list.map((pv,ix)=>`<div class="prov-row ${ix===draft.provActivo?'prov-active':''}">
    <span>${multi?`<input type="radio" name="prov-activo" data-provsel="${ix}" ${ix===draft.provActivo?'checked':''}>`:''}</span>
    <input data-pl="${ix}" data-f="proveedor" value="${esc(pv.proveedor||'')}" placeholder="Proveedor" list="prov-list">
    <input data-pl="${ix}" data-f="precio" type="number" value="${pv.precio||0}" placeholder="Precio">
    <input data-pl="${ix}" data-f="descuento_pct" type="number" value="${pv.descuento_pct||0}" placeholder="0">
    <input data-pl="${ix}" data-f="fecha_precio" type="date" value="${pv.fecha_precio||hoy()}">
    <button class="icon-btn" data-rmpl="${ix}" ${list.length===1?'style="visibility:hidden;"':''}>✕</button></div>`).join('');
}
function proveedoresBlock(precioLabel){
  return `<datalist id="prov-list">${proveedorNames().map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
    <div class="section-label">Proveedores</div>
    <div class="helper">Cargá uno o más proveedores para este ítem con su precio, descuento y fecha. Si tenés dos o más, marcá con el <strong>check de la izquierda</strong> cuál usás para costear — ese es el que entra en el cálculo. Los demás quedan guardados para comparar.</div>
    <div id="ln-provs">${proveedoresLines(precioLabel)}</div>
    <button type="button" class="add-line-btn" id="add-prov">+ Agregar proveedor</button>`;
}
// Toma el proveedor activo del draft y lo devuelve como campos para guardar en la fila principal
function proveedorActivoData(){
  const list = draft.provs||[];
  const a = list[draft.provActivo] || list[0] || {proveedor:'',precio:0,descuento_pct:0,fecha_precio:hoy()};
  const alt = list.filter((_,i)=>i!==(draft.provActivo??0));
  return {proveedor:a.proveedor||'', precio:+a.precio||0, descuento_pct:+a.descuento_pct||0,
          fecha_precio:a.fecha_precio||hoy(), alt};
}
const unidadSelect = cur => `<select id="f-unidad">${(state.config.unidades||['ud'])
  .map(u=>`<option value="${esc(u)}" ${u===cur?'selected':''}>${esc(u)}</option>`).join('')}</select>`;
const correccion = id => id ? `<label class="check-row"><input type="checkbox" id="f-corr">
  Esto es una <strong>corrección</strong> de un dato mal cargado, no un cambio de precio real (no se registra en Variaciones)</label>` : '';

// Arma draft.provs uniendo el proveedor activo actual + los alternativos guardados
function initProvs(it, precioKey){
  const activo = {proveedor:it.proveedor||'', precio:+(it[precioKey]||0),
                  descuento_pct:+(it.descuento_pct||0), fecha_precio:it.fecha_precio||hoy()};
  const alt = JSON.parse(JSON.stringify(it.proveedores_alt||[]));
  draft.provs = [activo, ...alt];
  draft.provActivo = 0;
}
function materialForm(id){
  const m = id ? state.materiales.find(x=>x.id===id) : {nombre:'',familia:'',precio:0,proveedor:'',descuento_pct:0,ancho:183,alto:275,desperdicio:12,fecha_precio:hoy()};
  initProvs(m,'precio');
  return `<div class="row-2">
      <div class="field"><label>Nombre (ej: Melamina blanco 18mm)</label><input id="f-nombre" value="${esc(m.nombre)}"></div>
      ${familiaField(m.familia,'materiales')}
    </div>
    <div class="field-row" style="grid-template-columns:1fr 1fr 1fr;">
      <div class="field"><label>Ancho de plancha (cm)</label><input id="f-ancho" type="number" value="${m.ancho}"></div>
      <div class="field"><label>Alto de plancha (cm)</label><input id="f-alto" type="number" value="${m.alto}"></div>
      <div class="field"><label>Desperdicio (%)</label><input id="f-desp" type="number" value="${m.desperdicio}"></div>
    </div>
    <div class="helper">Estándar de mercado: 183×275cm o 180×250cm según proveedor. El costo por m² se recalcula solo, ya con el descuento del proveedor activo aplicado.</div>
    ${proveedoresBlock('Precio plancha $')}
    ${correccion(id)}
    <button class="btn-primary" id="save" data-id="${id||''}">Guardar</button>`;
}
function insumoForm(id){
  const i = id ? state.insumos.find(x=>x.id===id) : {nombre:'',familia:'',unidad:'litro',precio_compra:0,descuento_pct:0,contenido:'',proveedor:'',fecha_precio:hoy()};
  initProvs(i,'precio_compra');
  return `<div class="row-2">
      <div class="field"><label>Nombre (ej: Laca blanca, Sellador, Diluyente)</label><input id="f-nombre" value="${esc(i.nombre)}"></div>
      ${familiaField(i.familia,'insumos')}
    </div>
    <div class="field-row" style="grid-template-columns:1fr 1fr;">
      <div class="field"><label>Unidad de uso</label>${unidadSelect(i.unidad)}</div>
      <div class="field"><label>Contenido de esa compra (cuánto trae)</label><input id="f-contenido" type="number" step="0.01" value="${i.contenido}"></div>
    </div>
    <div class="helper">Ejemplo: la lata de laca sale $180.000, con 10% de descuento pagás $162.000, y trae 4 litros → el costo por litro sale solo ($40.500). Después, en cada producto, ponés cuántos litros lleva.</div>
    ${proveedoresBlock('Precio compra $')}
    ${correccion(id)}
    <button class="btn-primary" id="save" data-id="${id||''}">Guardar</button>`;
}
function rolForm(id){
  const r = id ? state.roles.find(x=>x.id===id) : {nombre:'',tarifa:'',fecha_precio:hoy()};
  const c = state.config.carga_laboral_pct||0;
  return `<div class="field"><label>Rol (ej: Cortador, Armador, Laqueador)</label><input id="f-nombre" value="${esc(r.nombre)}"></div>
    <div class="row-2">
      <div class="field"><label>Tarifa horaria nominal ($/h)</label><input id="f-tarifa" type="number" value="${r.tarifa}"></div>
      <div class="field"><label>Fecha del precio</label><input id="f-fecha" type="date" value="${r.fecha_precio||hoy()}"></div>
    </div>
    <div class="helper">Poné lo que le pagás por hora, sin cargas. La app le suma el <strong>${c}%</strong> de carga laboral que definiste en Configuración.</div>
    <button class="btn-primary" id="save" data-id="${id||''}">Guardar</button>`;
}
function categoriaForm(id){
  const c = id ? state.categorias.find(x=>x.id===id) : {nombre:'',horas:{}};
  draft.horas = {...(c.horas||{})};
  return `<div class="field"><label>Nombre (ej: Placard, Cama, Cómoda)</label><input id="f-nombre" value="${esc(c.nombre)}"></div>
    <div class="section-label">Horas estándar por rol</div>
    ${state.roles.length?state.roles.map(r=>`<div class="row-2" style="align-items:center;margin-bottom:8px;">
      <label style="margin:0;font-size:13px;">${esc(r.nombre)}</label>
      <input type="number" step="0.5" data-cat-rol="${r.id}" value="${draft.horas[r.id]||0}"></div>`).join('')
      :'<div class="helper">Primero cargá roles en Mano de obra.</div>'}
    <button class="btn-primary" id="save" data-id="${id||''}" style="margin-top:12px;">Guardar</button>`;
}
function kitForm(id){
  const k = id ? state.kits.find(x=>x.id===id) : {nombre:'',items:[]};
  draft.items = JSON.parse(JSON.stringify(k.items||[]));
  return `<div class="field"><label>Nombre del kit (ej: Kit placard 2 puertas)</label><input id="f-nombre" value="${esc(k.nombre)}"></div>
    <div class="section-label">Ítems del kit</div>
    <div id="kit-lines">${kitLines()}</div>
    <button type="button" class="add-line-btn" id="add-kit">+ Agregar ítem</button>
    <div style="margin-top:16px;"><button class="btn-primary" id="save" data-id="${id||''}">Guardar</button></div>`;
}
function kitLines(){
  if(!state.insumos.length) return '<div class="helper">Primero cargá insumos.</div>';
  return draft.items.map((li,ix)=>`<div class="line-item-row">
    <select data-kl="${ix}" data-f="insumo_id">${state.insumos.map(i=>
      `<option value="${i.id}" ${i.id===li.insumo_id?'selected':''}>${esc(i.nombre)}</option>`).join('')}</select>
    <input type="number" data-kl="${ix}" data-f="cantidad" value="${li.cantidad}" placeholder="cant.">
    <button class="icon-btn" data-rmkl="${ix}">✕</button></div>`).join('');
}

function productoForm(id){
  const p = id ? state.productos.find(x=>x.id===id)
    : {nombre:'',modelo:'',puertas:0,categoria_id:'',ancho:'',alto:'',profundidad:'',color:'',materiales:[],insumos:[],kit_id:'',sueltos:[],horas:[],otros:0};
  draft = JSON.parse(JSON.stringify({materiales:p.materiales||[],insumos:p.insumos||[],
                                     sueltos:p.sueltos||[],horas:p.horas||[]}));
  const modelos = [...new Set(state.productos.map(x=>x.modelo).filter(Boolean))];
  return `<div class="field"><label>Nombre del producto</label><input id="f-nombre" value="${esc(p.nombre)}" placeholder="ej: Placard Oliver 140×240"></div>
    <div class="row-2">
      <div class="field"><label>Modelo (familia)</label>
        <input id="f-modelo" value="${esc(p.modelo)}" list="mod-list" placeholder="ej: Oliver, Ryan, Benito">
        <datalist id="mod-list">${modelos.map(m=>`<option value="${esc(m)}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Puertas corredizas</label>
        <select id="f-puertas">
          ${[0,1,2,3,4].map(n=>`<option value="${n}" ${n===(p.puertas||0)?'selected':''}>${n===0?'Sin corredizas':n+(n>1?' puertas':' puerta')}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="helper">Las puertas definen el área de cada hoja — y con eso, cuánto espejo entra y cuánta melamina sale en las variantes espejadas. Sin corredizas = no admite espejo.</div>
    <div class="row-2">
      <div class="field"><label>Categoría</label><select id="f-cat">
        <option value="">— Sin categoría —</option>
        ${state.categorias.map(c=>`<option value="${c.id}" ${c.id===p.categoria_id?'selected':''}>${esc(c.nombre)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Color / terminación</label><input id="f-color" value="${esc(p.color)}" placeholder="mel blanco, laqueado…"></div>
    </div>
    <div class="row-2" style="grid-template-columns:1fr 1fr 1fr;">
      <div class="field"><label>Ancho (cm)</label><input id="f-ancho" type="number" value="${p.ancho||''}"></div>
      <div class="field"><label>Alto (cm)</label><input id="f-alto" type="number" value="${p.alto||''}"></div>
      <div class="field"><label>Prof. (cm)</label><input id="f-prof" type="number" value="${p.profundidad||''}"></div>
    </div>

    <div class="section-label">Materiales</div>
    <div id="ln-materiales">${lineRows('materiales')}</div>
    <button type="button" class="add-line-btn" data-add="materiales">+ Agregar material</button>

    <div class="section-label">Insumos (pintura, laca, cola)</div>
    <div class="helper">Cuánto lleva este producto en su unidad (ej: 1.5 litros de laca). Incluí el diluyente — es plata que casi siempre se olvida.</div>
    <div id="ln-insumos">${lineRows('insumos')}</div>
    <button type="button" class="add-line-btn" data-add="insumos">+ Agregar insumo</button>

    <div class="section-label">Herrajes (kit + sueltos, se cargan como Insumos)</div>
    <div class="field"><label>Kit de herrajes</label><select id="f-kit">
      <option value="">— Ninguno —</option>
      ${state.kits.map(k=>`<option value="${k.id}" ${k.id===p.kit_id?'selected':''}>${esc(k.nombre)} ($${fmt(kitCost(k))})</option>`).join('')}
    </select></div>
    <div id="ln-sueltos">${lineRows('sueltos')}</div>
    <button type="button" class="add-line-btn" data-add="sueltos">+ Agregar ítem suelto</button>

    <div class="section-label">Mano de obra (horas por rol)</div>
    <div id="ln-horas">${lineRows('horas')}</div>
    <button type="button" class="add-line-btn" data-add="horas">+ Agregar rol</button>

    <div class="section-label">Otros costos</div>
    <div class="field"><input id="f-otros" type="number" value="${p.otros||0}"></div>
    <button class="btn-primary" id="save" data-id="${id||''}">Guardar producto</button>`;
}

// Config de cada tipo de línea dinámica: de dónde saca opciones y cómo se llama el campo
const LN = {
  materiales:{src:'materiales', fk:'material_id', qty:'m2',       ph:'m²',    label:'placas en Materiales'},
  insumos:   {src:'insumos',    fk:'insumo_id',   qty:'cantidad', ph:'cant.', label:'insumos'},
  sueltos:   {src:'insumos',    fk:'insumo_id',   qty:'cantidad', ph:'cant.', label:'insumos'},
  horas:     {src:'roles',      fk:'rol_id',      qty:'horas',    ph:'horas', label:'roles en Mano de obra'},
};
function lineRows(kind){
  const cfg = LN[kind];
  if(!state[cfg.src].length) return `<div class="helper">Primero cargá ${cfg.label}.</div>`;
  return (draft[kind]||[]).map((l,ix)=>`<div class="line-item-row">
    <select data-ln="${kind}" data-ix="${ix}" data-f="${cfg.fk}">
      ${state[cfg.src].map(o=>`<option value="${o.id}" ${o.id===l[cfg.fk]?'selected':''}>${esc(o.nombre)}</option>`).join('')}
    </select>
    <input type="number" step="0.01" data-ln="${kind}" data-ix="${ix}" data-f="${cfg.qty}" value="${l[cfg.qty]}" placeholder="${cfg.ph}">
    <button class="icon-btn" data-rmln="${kind}:${ix}">✕</button></div>`).join('');
}

/* ---------- EVENTS ---------- */
function bindLogin(){
  const b = document.getElementById('btn-login');
  if(b) b.onclick = doLogin;
  const p = document.getElementById('login-pass');
  if(p) p.onkeydown = e => { if(e.key==='Enter') doLogin(); };
}

function bindFamilias(){
  // ----- Listado -----
  const nf = document.querySelector('[data-newfam]');
  if(nf) nf.onclick = ()=>{ state.famDraft = nuevaFamiliaDraft(); state.medIx = null; state.famOpen = 1; render(); };
  document.querySelectorAll('[data-editfam]').forEach(e=>e.onclick=()=>{
    const f = state.familias.find(x=>x.id===e.dataset.editfam);
    if(f){ state.famDraft = JSON.parse(JSON.stringify(f)); state.famOpen = 1;
           state.famDraft.receta_fija = state.famDraft.receta_fija||{fondo:{},kits:[],sueltos:[]};
           state.famDraft.receta_fija.kits = state.famDraft.receta_fija.kits||[];
           state.famDraft.receta_fija.sueltos = state.famDraft.receta_fija.sueltos||[];
           state.medIx = null; render(); }});
  document.querySelectorAll('[data-delfam]').forEach(e=>e.onclick=async(ev)=>{
    ev.stopPropagation();
    if(!confirm('¿Borrar este modelo? No se puede deshacer.')) return;
    await sb.from('familias').delete().eq('id',e.dataset.delfam); await loadAll();});
  document.querySelectorAll('[data-editfam]').forEach(e=>e.addEventListener('click',ev=>ev.stopPropagation()));
  document.querySelectorAll('[data-modtog]').forEach(e=>e.onclick=(ev)=>{
    if(ev.target.closest('[data-editfam],[data-delfam],[data-modmore]')) return;
    const id=e.dataset.modtog; state.modOpen[id]=!state.modOpen[id]; render();});
  document.querySelectorAll('[data-modcat]').forEach(e=>e.onclick=()=>{
    state.modCat=e.dataset.modcat; render();});
  document.querySelectorAll('[data-modmore]').forEach(e=>e.onclick=(ev)=>{
    ev.stopPropagation(); state.modVarsAll[e.dataset.modmore]=true; render();});
  document.querySelectorAll('[data-cattog]').forEach(e=>e.onclick=()=>{
    const k=e.dataset.cattog; state.catClosed[k]=!state.catClosed[k]; render();});

  const d = state.famDraft;
  if(!d) return;

  // ----- Módulos acordeón (uno abierto por vez) + panel de costo en vivo -----
  document.querySelectorAll('[data-sec]').forEach(e=>e.onclick=()=>{
    const n=+e.dataset.sec; state.famOpen = (state.famOpen===n) ? null : n; render();});
  document.querySelectorAll('[data-pv]').forEach(e=>e.onchange=()=>{
    state.preview=state.preview||{}; state.preview[e.dataset.pv]=+e.value||0; render();});
  d.receta_fija = d.receta_fija||{fondo:{},kits:[],sueltos:[]};
  d.receta_fija.kits = d.receta_fija.kits||[];
  d.receta_fija.sueltos = d.receta_fija.sueltos||[];

  const back = document.querySelector('[data-famback]');
  if(back) back.onclick = ()=>{ if(confirm('¿Salir sin guardar? Se pierden los cambios no guardados.')){ state.famDraft=null; state.medIx=null; render(); } };

  const bindVal = (id,fn)=>{ const el=document.getElementById(id); if(el) el.onchange=()=>fn(el.value); };
  // Categoría escribible: si el texto coincide con una existente usa su id;
  // si es nueva, la guarda en _catNueva y se crea al Guardar.
  const ctx = document.getElementById('fam-cat-txt');
  if(ctx) ctx.onchange = ()=>{
    const nom = (ctx.value||'').trim();
    const found = state.categorias.find(c=>(c.nombre||'').toLowerCase()===nom.toLowerCase());
    if(found){ d.categoria_id=found.id; d._catNueva=null; }
    else { d.categoria_id=null; d._catNueva=nom||null; }
    render();
  };
  bindVal('fam-nombre', v=>d.nombre=v);
  bindVal('fam-apertura', v=>d.apertura=v);
  bindVal('fam-notas', v=>d.notas=v);
  bindVal('fam-npuertas', v=>{ d.n_puertas=+v||0; render(); });

  // ----- Colores -----
  document.querySelectorAll('[data-fc]').forEach(e=>e.onchange=()=>{ d.colores[+e.dataset.fc][e.dataset.f]=e.value; render(); });
  const afc = document.querySelector('[data-addfc]');
  if(afc) afc.onclick = ()=>{ d.colores.push({label:'',placa_id:'',tapacanto_id:''}); render(); };
  document.querySelectorAll('[data-rmfc]').forEach(e=>e.onclick=()=>{ d.colores.splice(+e.dataset.rmfc,1); render(); });

  // ----- Tipos de puerta -----
  const apt = document.querySelector('[data-addpt]');
  if(apt) apt.onclick = ()=>{
    const label=(document.getElementById('fam-npt-label').value||'').trim();
    const mat=document.getElementById('fam-npt-mat').value;
    const tap=document.getElementById('fam-npt-tap').checked;
    if(!label||!mat){ alert('Poné un nombre y elegí el material del tipo de puerta.'); return; }
    d.puerta_tipos.push({label, material_id:mat, lleva_tapacanto:tap}); render();};
  document.querySelectorAll('[data-rmpt]').forEach(e=>e.onclick=()=>{ d.puerta_tipos.splice(+e.dataset.rmpt,1); render(); });
  document.querySelectorAll('[data-pttap]').forEach(e=>e.onclick=()=>{
    const t=d.puerta_tipos[+e.dataset.pttap]; t.lleva_tapacanto = (t.lleva_tapacanto===false); render();});
  document.querySelectorAll('[data-ptm]').forEach(e=>e.onchange=()=>{
    const t=d.puerta_tipos[+e.dataset.ptm]; const v=parseFloat(e.value);
    t.tapacanto_m = isNaN(v)?'':v; refrescarPanel();});

  // ----- Siempre lleva -----
  bindVal('fam-fondo', v=>{ d.receta_fija.fondo={material_id:v}; });
  const akit = document.querySelector('[data-addkit]');
  if(akit) akit.onclick = ()=>{ d.receta_fija.kits.push({kit_id:'',cantidad:1}); render(); };
  document.querySelectorAll('[data-fk]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.fk, f=e.dataset.f;
    d.receta_fija.kits[ix][f]= e.type==='number'?(parseFloat(e.value)||0):e.value;});
  document.querySelectorAll('[data-rmfk]').forEach(e=>e.onclick=()=>{ d.receta_fija.kits.splice(+e.dataset.rmfk,1); render(); });

  const asu = document.querySelector('[data-addsuelto]');
  if(asu) asu.onclick = ()=>{ d.receta_fija.sueltos.push({insumo_id:'',cantidad:1}); render(); };
  document.querySelectorAll('[data-fs]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.fs, f=e.dataset.f;
    d.receta_fija.sueltos[ix][f]= e.type==='number'?(parseFloat(e.value)||0):e.value; render();});
  document.querySelectorAll('[data-rmfs]').forEach(e=>e.onclick=()=>{ d.receta_fija.sueltos.splice(+e.dataset.rmfs,1); render(); });

  // ----- Herrajes por medida -----
  const fma = document.getElementById('fam-med-activa');
  if(fma) fma.onchange = ()=>{ state.preview=state.preview||{}; state.preview.medIx=+fma.value||0; render(); };
  document.querySelectorAll('[data-hcant]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.hcant, s=d.receta_fija.sueltos[ix]; if(!s||!s.insumo_id) return;
    const mi=(state.preview||{}).medIx||0, med=d.medidas[mi];
    if(!med){ alert('Primero cargá una medida en el módulo Medidas.'); return; }
    med.cant = med.cant||{};
    const v=parseFloat(e.value); med.cant[s.insumo_id]=isNaN(v)?0:v;
    const i=state.insumos.find(x=>x.id===s.insumo_id), cu=i?costPerUnit(i):0;
    const cell=document.querySelector('[data-hsub="'+ix+'"]'); if(cell) cell.textContent='$'+fmt(cu*(med.cant[s.insumo_id]||0));
    refrescarPanel();});
  const ct = document.querySelector('[data-copiartodas]');
  if(ct) ct.onclick = ()=>{
    const mi=(state.preview||{}).medIx||0, med=d.medidas[mi];
    if(!med){ alert('No hay medida activa.'); return; }
    (d.receta_fija.sueltos||[]).forEach(s=>{
      if(!s.insumo_id) return;
      const eff=(med.cant&&med.cant[s.insumo_id]!==undefined)?med.cant[s.insumo_id]:(s.cantidad||0);
      s.cantidad=eff;
      (d.medidas||[]).forEach(m=>{ if(m.cant) delete m.cant[s.insumo_id]; });
    });
    UI.toast ? UI.toast('Cantidades copiadas a todas las medidas','ok') : alert('Cantidades copiadas a todas las medidas.');
    render();};

  // ----- Roles -----
  document.querySelectorAll('[data-famrole]').forEach(e=>e.onchange=()=>{
    const rid=e.dataset.famrole; d.roles=d.roles||[];
    if(e.checked){ if(!d.roles.includes(rid)) d.roles.push(rid); }
    else d.roles=d.roles.filter(x=>x!==rid);
    render();});

  // ----- Medidas (grilla editable) -----
  const amed = document.querySelector('[data-addmed]');
  if(amed) amed.onclick = ()=>{ d.medidas.push(nuevaMedida()); render(); };
  document.querySelectorAll('[data-gmf]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.row, k=e.dataset.gmf, v=parseFloat(e.value);
    d.medidas[ix][k] = isNaN(v) ? '' : v; refrescarPanel();});
  document.querySelectorAll('[data-gmh]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.row, rid=e.dataset.gmh;
    d.medidas[ix].horas = d.medidas[ix].horas||{};
    d.medidas[ix].horas[rid] = parseFloat(e.value)||0; refrescarPanel();});
  document.querySelectorAll('[data-gmdup]').forEach(e=>e.onclick=()=>{
    d.medidas.push(JSON.parse(JSON.stringify(d.medidas[+e.dataset.gmdup]))); render();});
  document.querySelectorAll('[data-gmrm]').forEach(e=>e.onclick=()=>{
    if(!confirm('¿Borrar esta medida?')) return;
    d.medidas.splice(+e.dataset.gmrm,1); render();});

  // ----- Guardar -----
  const sv = document.querySelector('[data-savefam]');
  if(sv) sv.onclick = async()=>{
    d.nombre=(document.getElementById('fam-nombre').value||'').trim();
    if(!d.nombre){ alert('Poné un nombre de modelo.'); return; }
    // Categoría: texto → id (crea la categoría si es nueva)
    const catNom=((document.getElementById('fam-cat-txt')||{}).value||'').trim();
    let catId=null;
    if(catNom){
      const found=state.categorias.find(c=>(c.nombre||'').toLowerCase()===catNom.toLowerCase());
      if(found) catId=found.id;
      else{
        try{
          const {data,error}=await sb.from('categorias').insert({nombre:catNom,horas:{}}).select().single();
          if(error) throw error; catId=data.id;
        }catch(err){ alert('No pude crear la categoría “'+catNom+'”: '+(err.message||err)); return; }
      }
    }
    d.categoria_id=catId;
    const ap=document.getElementById('fam-apertura'); if(ap) d.apertura=ap.value;
    const np=document.getElementById('fam-npuertas'); if(np) d.n_puertas=+np.value||0;
    const fo=document.getElementById('fam-fondo'); if(fo) d.receta_fija.fondo={material_id:fo.value||''};
    const nt=document.getElementById('fam-notas'); if(nt) d.notas=nt.value;
    d.receta_fija.kits=(d.receta_fija.kits||[]).filter(k=>k.kit_id);
    d.receta_fija.sueltos=(d.receta_fija.sueltos||[]).filter(s=>s.insumo_id);
    delete d.receta_fija.kit_id;
    d.medidas=(d.medidas||[]).map(m=>{ const c={...m}; delete c._dup; return c; });
    const payload={nombre:d.nombre, categoria_id:d.categoria_id||null, apertura:d.apertura,
      n_puertas:d.n_puertas, colores:d.colores, puerta_tipos:d.puerta_tipos,
      receta_fija:d.receta_fija, roles:d.roles, medidas:d.medidas, notas:d.notas||''};
    try{
      const q = d.id ? sb.from('familias').update(payload).eq('id',d.id) : sb.from('familias').insert(payload);
      const {error} = await q; if(error) throw error;
      state.famDraft=null; state.medIx=null; await loadAll();
    }catch(err){ alert('No se pudo guardar: '+(err.message||err)); }
  };
}

function bindEvents(){
  // El logout y la navegación ahora los maneja el shell unificado.
  const btnSalir = document.getElementById('btn-logout');
  if(btnSalir) btnSalir.onclick = doLogout;
  document.querySelectorAll('[data-nav]').forEach(e=>e.onclick=()=>{
    state.tab=e.dataset.nav; state.productDetail=null; state.familiaFilter=''; state.famDraft=null; render();});
  bindFamilias();
  document.querySelectorAll('[data-subtab]').forEach(e=>e.onclick=()=>{
    state.materialsSubtab=e.dataset.subtab; state.familiaFilter=''; render();});
  document.querySelectorAll('[data-familia]').forEach(e=>e.onclick=()=>{
    state.familiaFilter=e.dataset.familia; render();});
  document.querySelectorAll('[data-new]').forEach(e=>e.onclick=()=>{
    state.modal={type:e.dataset.new,id:null}; render();});
  document.querySelectorAll('[data-edit]').forEach(e=>e.onclick=(ev)=>{
    ev.stopPropagation();
    const [t,i]=e.dataset.edit.split(':'); state.modal={type:t,id:i}; render();});
  document.querySelectorAll('[data-del]').forEach(e=>e.onclick=(ev)=>{
    ev.stopPropagation();
    const [t,i]=e.dataset.del.split(':'); del(t,i);});
  document.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>{
    state.productDetail=e.dataset.view; state.variante={mat:0,esp:0}; render();});
  document.querySelectorAll('[data-modelo]').forEach(e=>e.onclick=()=>{
    state.modeloSel=e.dataset.modelo; state.espejoSel=0; render();});
  document.querySelectorAll('[data-espejo]').forEach(e=>e.onclick=()=>{
    state.espejoSel=+e.dataset.espejo; render();});
  document.querySelectorAll('[data-cell]').forEach(e=>e.onclick=()=>{
    const [id,mat,esp]=e.dataset.cell.split('|');
    state.productDetail=id; state.variante={mat:+mat, esp:+esp}; render();});
  document.querySelectorAll('[data-vmat]').forEach(e=>e.onclick=()=>{
    state.variante={...state.variante, mat:+e.dataset.vmat}; render();});
  document.querySelectorAll('[data-vesp]').forEach(e=>e.onclick=()=>{
    state.variante={...state.variante, esp:+e.dataset.vesp}; render();});
  document.querySelectorAll('[data-dup]').forEach(e=>e.onclick=async(ev)=>{
    ev.stopPropagation();
    const p = state.productos.find(x=>x.id===e.dataset.dup);
    const {id,created_at,updated_at,updated_by,...copy} = p;
    copy.nombre += ' (copia)';
    await save('productos',null,copy);});

  const back = document.getElementById('back');
  if(back) back.onclick=()=>{state.productDetail=null; render();};
  const s = document.getElementById('search');
  if(s) s.oninput = e => { state.search=e.target.value; render();
    const el=document.getElementById('search'); el.focus(); el.selectionStart=el.value.length; };

  // Config
  const sc = document.getElementById('save-carga');
  if(sc) sc.onclick = async()=>{
    await sb.from('config').update({carga_laboral_pct:numVal('cfg-carga')}).eq('id',1);
    await loadAll();};
  const au = document.getElementById('add-unidad');
  if(au) au.onclick = async()=>{
    const v = val('cfg-unidad');
    if(!v || state.config.unidades.includes(v)) return;
    await sb.from('config').update({unidades:[...state.config.unidades,v]}).eq('id',1);
    await loadAll();};
  document.querySelectorAll('[data-delu]').forEach(e=>e.onclick=async()=>{
    await sb.from('config').update({unidades:state.config.unidades.filter(u=>u!==e.dataset.delu)}).eq('id',1);
    await loadAll();});

  const sv = document.getElementById('save-variantes');
  if(sv) sv.onclick = async()=>{
    await sb.from('config').update({variantes_material:draft.variantes_material||[],
      espejo_material_id: val('cfg-espejo')||null}).eq('id',1);
    draft.variantes_material = undefined;
    await loadAll();};

  // Modal — solo se cierra con la X (para no perder lo cargado por un click accidental afuera)
  const bd = document.getElementById('backdrop');
  if(bd){
    document.getElementById('modal-close').onclick = ()=>{state.modal=null; render();};
  }
  bindLines();
  bindSave();
}

function bindLines(){
  // líneas dinámicas del producto
  document.querySelectorAll('[data-add]').forEach(e=>e.onclick=()=>{
    const k = e.dataset.add, cfg = LN[k];
    draft[k] = draft[k]||[];
    draft[k].push({[cfg.fk]: state[cfg.src][0]?.id||'', [cfg.qty]:0});
    document.getElementById('ln-'+k).innerHTML = lineRows(k);
    bindLines();});
  document.querySelectorAll('[data-ln]').forEach(e=>e.onchange=()=>{
    const k=e.dataset.ln, ix=+e.dataset.ix, f=e.dataset.f;
    draft[k][ix][f] = e.type==='number' ? (parseFloat(e.value)||0) : e.value;});
  document.querySelectorAll('[data-rmln]').forEach(e=>e.onclick=()=>{
    const [k,ix]=e.dataset.rmln.split(':');
    draft[k].splice(+ix,1);
    document.getElementById('ln-'+k).innerHTML = lineRows(k);
    bindLines();});
  // líneas del kit
  const ak = document.getElementById('add-kit');
  if(ak) ak.onclick = ()=>{
    draft.items.push({insumo_id:state.insumos[0]?.id||'', cantidad:0});
    document.getElementById('kit-lines').innerHTML = kitLines();
    bindLines();};
  document.querySelectorAll('[data-kl]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.kl, f=e.dataset.f;
    draft.items[ix][f] = e.type==='number' ? (parseFloat(e.value)||0) : e.value;});
  document.querySelectorAll('[data-rmkl]').forEach(e=>e.onclick=()=>{
    draft.items.splice(+e.dataset.rmkl,1);
    document.getElementById('kit-lines').innerHTML = kitLines();
    bindLines();});
  // proveedores (materiales/insumos): lista unificada + radio para elegir el activo
  const precioLabelActual = state.modal && state.modal.type==='material' ? 'Precio plancha $' : 'Precio compra $';
  const apv = document.getElementById('add-prov');
  if(apv) apv.onclick = ()=>{
    draft.provs = draft.provs||[];
    draft.provs.push({proveedor:'',precio:0,descuento_pct:0,fecha_precio:hoy()});
    document.getElementById('ln-provs').innerHTML = proveedoresLines(precioLabelActual);
    bindLines();};
  document.querySelectorAll('[data-pl]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.pl, f=e.dataset.f;
    draft.provs[ix][f] = e.type==='number' ? (parseFloat(e.value)||0) : e.value;});
  document.querySelectorAll('[data-provsel]').forEach(e=>e.onchange=()=>{
    draft.provActivo = +e.dataset.provsel;
    document.getElementById('ln-provs').innerHTML = proveedoresLines(precioLabelActual);
    bindLines();});
  document.querySelectorAll('[data-rmpl]').forEach(e=>e.onclick=()=>{
    const ix = +e.dataset.rmpl;
    draft.provs.splice(ix,1);
    if(draft.provActivo>=draft.provs.length) draft.provActivo = 0;
    else if(ix<draft.provActivo) draft.provActivo--;
    document.getElementById('ln-provs').innerHTML = proveedoresLines(precioLabelActual);
    bindLines();});
  // Variantes de material / espejo (Configuración)
  const avar = document.getElementById('add-variante');
  if(avar) avar.onclick = ()=>{
    draft.variantes_material = draft.variantes_material||[];
    draft.variantes_material.push({label:'',placa_id:'',tapa_id:''});
    document.getElementById('ln-variantes').innerHTML = variantesLines();
    bindLines();};
  document.querySelectorAll('[data-vln]').forEach(e=>e.onchange=()=>{
    const ix=+e.dataset.vln, f=e.dataset.f;
    draft.variantes_material[ix][f] = e.value;});
  document.querySelectorAll('[data-rmvln]').forEach(e=>e.onclick=()=>{
    draft.variantes_material.splice(+e.dataset.rmvln,1);
    document.getElementById('ln-variantes').innerHTML = variantesLines();
    bindLines();});
}

function bindSave(){
  const btn = document.getElementById('save');
  if(!btn) return;
  const id = btn.dataset.id || null;
  const corr = ()=>{ const e=document.getElementById('f-corr'); return e?e.checked:false; };
  btn.onclick = async()=>{
    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Guardando…';
    let ok = false;
    try{
      const t = state.modal.type;
      if(t==='material'){
        const pa = proveedorActivoData();
        ok = await save('materiales',id,{nombre:val('f-nombre'),familia:val('f-familia'),
          proveedor:pa.proveedor,precio:pa.precio,descuento_pct:pa.descuento_pct,
          ancho:numVal('f-ancho'),alto:numVal('f-alto'),desperdicio:numVal('f-desp'),
          fecha_precio:pa.fecha_precio,proveedores_alt:pa.alt,es_correccion:corr()});
      }
      if(t==='insumo'){
        const pa = proveedorActivoData();
        ok = await save('insumos',id,{nombre:val('f-nombre'),familia:val('f-familia'),
          proveedor:pa.proveedor,precio_compra:pa.precio,descuento_pct:pa.descuento_pct,
          unidad:val('f-unidad'),contenido:numVal('f-contenido'),
          fecha_precio:pa.fecha_precio,proveedores_alt:pa.alt,es_correccion:corr()});
      }
      if(t==='kit')       ok = await save('kits',id,{nombre:val('f-nombre'),items:draft.items});
      if(t==='rol')       ok = await save('roles_mano_obra',id,{nombre:val('f-nombre'),tarifa:numVal('f-tarifa'),
          fecha_precio:val('f-fecha')||hoy()});
      if(t==='categoria'){
        const horas={};
        document.querySelectorAll('[data-cat-rol]').forEach(e=>{ const v=parseFloat(e.value)||0; if(v) horas[e.dataset.catRol]=v; });
        ok = await save('categorias',id,{nombre:val('f-nombre'),horas});
      }
      if(t==='producto'){
        ok = await save('productos',id,{nombre:val('f-nombre'),modelo:val('f-modelo')||null,
          puertas:parseInt(val('f-puertas'))||0,
          categoria_id:val('f-cat')||null,color:val('f-color'),
          ancho:numVal('f-ancho'),alto:numVal('f-alto'),profundidad:numVal('f-prof'),
          materiales:draft.materiales,insumos:draft.insumos,kit_id:val('f-kit')||null,
          sueltos:draft.sueltos,horas:draft.horas,otros:numVal('f-otros')});
        if(ok) state.productDetail = null;
      }
    }catch(e){
      alert('No se pudo guardar: ' + (e.message || e));
    }
    // Si falló, devolvemos el botón para que puedas reintentar
    if(!ok){ btn.disabled = false; btn.textContent = txt; }
  };
}



  /* ---- interfaz con la app unificada ---- */
  const TABS = [['familias','Familias'],['products','Productos'],['materiales','Materiales'],
                ['labor','Mano de obra'],['variaciones','Variaciones'],['config','Configuración']];
  let cargado = false;

  return {
    TABS,
    get state(){ return state; },
    cargado: () => cargado,
    /** Conecta el módulo al cliente compartido y trae sus datos. */
    async boot(cliente, usuario){
      sb = cliente;
      state.user = usuario;
      if(!cargado){ await loadAll(); cargado = true; }
    },
    irA(tab){ state.tab = tab; state.familiaFilter=null; render(); },
    render
  };
})();
