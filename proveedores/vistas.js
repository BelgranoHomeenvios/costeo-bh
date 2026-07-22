/* ============================================================
   CAPA 5 · VIEWS  (cada pantalla responde una pregunta de negocio)
   ============================================================ */
const Views = (() => {

  /* filtros persistentes entre navegaciones */
  const F = {
    prod:{cat:'', modelo:'', estado:'', medidas:[], terms:[], vars:{}, q:'',
          soloAumentar:false, incompletos:false, revisar:false, sinCosto:false, hoy:false, soloNoVinc:false,
          menuCol:'', menuQ:'', expM:{},
          sort:'aumentoPct', dir:-1, page:0, per:50},
    rent:{cat:''},
    sim:{prodId:null, costo:null, precio:null, desc:null, target:null},
    pend:{tipo:'', cat:''}, prevN:150
  };
  let cacheCalc = null;
  const calcAll = () => (cacheCalc = Calc.todos());
  const invalidar = () => { cacheCalc = null; };

  /* ---------- helpers de vista ---------- */
  function selCat(id, val, extra){
    const cats = [...new Set(Data.s.productos.map(p=>p.categoriaId))]
      .map(c=>({id:c, nombre:Data.catNombre(c)}))
      .sort((a,b)=>a.nombre.localeCompare(b.nombre));
    return `<select class="inp" id="${id}" ${extra||''}>
      <option value="">Todas las categorías</option>
      ${cats.map(c=>`<option value="${c.id}" ${val===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}
    </select>`;
  }

  /** Para mostrar: si el modelo empieza repitiendo el nombre de su categoría
   *  ("Comoda Atlanta Big" bajo "Cómodas"), lo saca — ya se ve en la columna
   *  de al lado. Compara palabra por palabra, sin tildes y sin plural, así
   *  tolera "Mesas de Luz" → "Mesa De Luz X" o "Muebles TV" → "Mueble De Tv X". */
  function sinPrefijoCategoria(modelo, catNombre){
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    const singular = w => (w.length>3 && w.endsWith('S')) ? w.slice(0,-1) : w;
    const CONECTORES = new Set(['DE','DEL','LA','LOS','LAS']);
    const catWords = catNombre.split(/\s+/).map(norm).map(singular);
    const modWords = modelo.split(/\s+/);
    let i=0, j=0;
    while(i<catWords.length && j<modWords.length){
      const mw = norm(modWords[j]);
      if(mw===catWords[i] || singular(mw)===catWords[i]){ i++; j++; continue; }
      if(CONECTORES.has(mw)){ j++; continue; }
      break;
    }
    return (i===catWords.length && j>0) ? modWords.slice(j).join(' ') : modelo;
  }

  /** Valor "filtrable" de una fila para una columna dada. */
  function valorCol(p, k){
    if(k==='categoriaId') return Data.catNombre(p.categoriaId);
    if(k==='modelo') return p.modelo||'';
    if(k==='medida') return p.medida||'';
    if(k==='estructura') return (p.variantes||{}).Estructura||'';
    if(k==='variante2') return (Object.entries(p.variantes||{}).find(([kk])=>kk!=='Estructura')||['',''])[1]||'';
    if(k==='estado'){ return ''; }
    return '';
  }

  /** Menú de filtro que se abre bajo un título. Lista los valores reales de esa
   *  columna en el alcance actual, con buscador si son muchos. */
  function menuFiltroCol(k, alcance){
    const f = F.prod;
    if(k==='estado'){
      const opts = Object.entries(ESTADO);
      return `<div class="colmenu">
        ${opts.map(([id,v])=>`<div class="colmenu-item ${f.estado===id?'sel':''}"
          onclick="Views.setProd('estado','${id}');Views.cerrarMenuCol()">${esc(v.lbl)}</div>`).join('')}
        ${f.estado?`<div class="colmenu-item clear" onclick="Views.setProd('estado','');Views.cerrarMenuCol()">Quitar filtro</div>`:''}
      </div>`;
    }
    let vals = [...new Set(alcance.map(({p})=>valorCol(p,k)).filter(Boolean))];
    if(k==='medida') vals.sort((a,b)=>medSort(a)-medSort(b));
    else vals.sort((a,b)=>a.localeCompare(b));
    const q = (f.menuQ||'').toLowerCase();
    const filtradas = q ? vals.filter(v=>v.toLowerCase().includes(q)) : vals;
    const activo = k==='categoriaId' ? (f.cat?Data.catNombre(f.cat):'')
      : k==='modelo' ? f.modelo
      : k==='medida' ? f.medida
      : k==='estructura' ? (f.vars||{}).Estructura
      : k==='variante2' ? Object.entries(f.vars||{}).find(([kk])=>kk!=='Estructura')?.[1]
      : '';
    const setter = v => {
      if(k==='categoriaId'){ const id=[...new Set(Data.s.productos.map(p=>p.categoriaId))].find(c=>Data.catNombre(c)===v); return `Views.setProd('cat','${id||''}')`; }
      if(k==='modelo') return `Views.setProd('modelo','${escJs(v)}')`;
      if(k==='medida') return `Views.setProd('medida','${escJs(v)}')`;
      if(k==='estructura') return `Views.setVar('Estructura','${escJs(v)}')`;
      if(k==='variante2'){ const clave=[...new Set(alcance.map(({p})=>Object.keys(p.variantes||{}).find(kk=>kk!=='Estructura')).filter(Boolean))][0]||''; return `Views.setVar('${escJs(clave)}','${escJs(v)}')`; }
      return '';
    };
    return `<div class="colmenu">
      ${vals.length>8?`<input class="inp colmenu-q" placeholder="Buscar…" value="${esc(f.menuQ)}"
        oninput="Views.menuColBuscar(this.value)" onclick="event.stopPropagation()">`:''}
      <div class="colmenu-list">
        ${filtradas.length?filtradas.map(v=>`<div class="colmenu-item ${activo===v?'sel':''}"
          onclick="${setter(v)};Views.cerrarMenuCol()">${esc(v)}</div>`).join('')
          :`<div class="colmenu-empty">Sin coincidencias</div>`}
      </div>
      ${activo?`<div class="colmenu-item clear" onclick="${setter('')};Views.cerrarMenuCol()">Quitar filtro</div>`:''}
    </div>`;
  }

  /** IDs de productos con alguna edición registrada hoy (según historial). */
  function idsHoy(){
    const hoy = new Date().toDateString();
    const ids = new Set();
    (Data.s.historial||[]).forEach(h=>{
      if(h.productId && h.fecha && new Date(h.fecha).toDateString()===hoy) ids.add(h.productId);
    });
    return ids;
  }

  /** Productos "no vinculados": tienen costo manual que difiere del de la tabla
   *  (o la tabla no tiene su combinación). Son los que hay que revisar porque
   *  su costo no se actualiza cuando cambia la lista. */
  function noVinculados(){
    return Data.s.productos.filter(p=>{
      const cm = Number(p.costoManual)||0;
      if(cm<=0) return false;                       // deriva de tabla: OK
      const t = Calc.costoTabla(p.categoriaId, p.medidaCosteo, p.tier);
      return Math.abs(t - cm) >= 1;                 // manual != tabla → revisar
    });
  }

  function nPendientes(){
    return Data.s.productos.filter(p => !Calc.producto(p).tieneCosto).length
         + Data.s.sinCosto.length;
  }


  /* ============================================================
     1 · RESUMEN — ¿Cómo está hoy la rentabilidad del catálogo?
     ============================================================ */
  function resumen(){
    const rows = calcAll();
    if(!rows.length) return sinDatos();
    const t = Calc.resumen(rows);
    const cfg = Data.s.config;

    const margenBajo = rows.filter(({c}) => c.tieneCosto && c.margen < cfg.margenMinimo).length;
    const aumentar10 = rows.filter(({c}) => c.aumentoPct > 0.10).length;
    // Outlier: markup muy por encima del objetivo => o el precio está mal cargado
    // o el costo quedó desactualizado. En ambos casos el número no es confiable.
    const sospechosos = rows.filter(({c}) => c.tieneCosto && c.markup > cfg.umbralSospecha).length;

    const kpis = [
      UI.kpi({label:'Total productos', value:t.total.toLocaleString('es-AR'),
        sub:'Ver detalle', subColor:'var(--blue)', icon:'box', bg:'var(--blue-l)', color:'var(--blue)',
        onClick:"Views.irProductos({cat:'',estado:'',soloAumentar:false})"}),
      UI.kpi({label:'Costeados', value:t.costeados.toLocaleString('es-AR'),
        sub:`${(t.costeados/t.total*100).toFixed(1).replace('.',',')}% del total`, subColor:'var(--green)',
        icon:'check', bg:'var(--green-l)', color:'var(--green)',
        onClick:"Views.irProductos({estado:''})"}),
      UI.kpi({label:'Sin costo', value:t.sinCosto.toLocaleString('es-AR'),
        sub:`${(t.sinCosto/t.total*100).toFixed(1).replace('.',',')}% del total`, subColor:'var(--red)',
        icon:'x', bg:'var(--red-l)', color:'var(--red)',
        onClick:"Views.irProductos({estado:'sincosto'})"}),
      UI.kpi({label:'Para aumentar', value:t.paraAumentar.toLocaleString('es-AR'),
        sub:'por debajo del objetivo', subColor:'var(--amber)',
        icon:'trend', bg:'var(--amber-l)', color:'var(--amber)',
        onClick:"Views.irProductos({soloAumentar:true})"}),
      UI.kpi({label:'Margen promedio', value:pct1(t.margenProm),
        sub:`mínimo ${(cfg.margenMinimo*100).toFixed(0)}%`,
        subColor: t.margenProm>=cfg.margenMinimo?'var(--green)':'var(--red)',
        icon:'chart', bg:'#F3F0FF', color:'#7C3AED'}),
      UI.kpi({label:'Markup promedio', value:mk(t.markupProm),
        sub:`objetivo ${cfg.targetOtro.toFixed(2).replace('.',',')}`,
        subColor: t.markupProm>=cfg.targetOtro?'var(--green)':'var(--amber)',
        icon:'target', bg:'#FFF1F2', color:'#E11D48'})
    ].join('');

    const alertas = [
      {n:margenBajo, t:`margen menor a ${(cfg.margenMinimo*100).toFixed(0)}%`, c:'red', go:"Views.irProductos({estado:'rojo'})"},
      {n:t.rojo,     t:'rentabilidad baja (rojo)', c:'red',  go:"Views.irProductos({estado:'rojo'})"},
      {n:t.amarillo, t:'en zona de advertencia',   c:'amber',go:"Views.irProductos({estado:'amarillo'})"},
      {n:aumentar10, t:'deberían aumentar > 10%',  c:'amber',go:"Views.irProductos({soloAumentar:true})"},
      {n:sospechosos,t:`markup > ${cfg.umbralSospecha.toFixed(1).replace('.',',')}x · revisar precio o costo`, c:'amber', go:"Router.go('pendientes')"},
      {n:t.sinCosto, t:'sin costo cargado',        c:'gray', go:"Router.go('pendientes')"}
    ].map(a => `<button class="alert-c" onclick="${a.go}">
      <div class="alert-ico" style="background:var(--${a.c}-l,var(--gray-l));color:var(--${a.c},var(--sec))">
        ${Icon(a.c==='red'?'warn':a.c==='amber'?'clock':'empty')}</div>
      <div><div class="alert-n" style="color:var(--${a.c},var(--sec))">${a.n.toLocaleString('es-AR')} productos</div>
      <div class="alert-t">${a.t}</div></div></button>`).join('');

    /* --- resumen por categoría --- */
    const porCat = {};
    rows.forEach(({p,c}) => {
      const k = p.categoriaId;
      porCat[k] = porCat[k] || {n:0, cost:0, prec:0, mg:0, mkp:0, cn:0, aum:0, sin:0};
      const o = porCat[k]; o.n++;
      if(c.tieneCosto){ o.cn++; o.cost+=c.costoFinal; o.prec+=c.lista; o.mg+=c.margen; o.mkp+=c.markup;
        if(c.aumentoPct>0.001) o.aum++; } else o.sin++;
    });
    const catRows = Object.entries(porCat)
      .map(([id,o]) => ({id, nombre:Data.catNombre(id), ...o,
        costProm:o.cn?o.cost/o.cn:0, precProm:o.cn?o.prec/o.cn:0,
        mgProm:o.cn?o.mg/o.cn:0, mkpProm:o.cn?o.mkp/o.cn:0, cob:o.n?o.cn/o.n:0}))
      .sort((a,b)=>b.n-a.n);

    const catTbl = `<div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Categoría</th><th class="num">Productos</th><th class="num">Cobertura</th>
        <th class="num">Costo prom.</th><th class="num">Precio prom.</th>
        <th class="num">Margen prom.</th><th class="num">Markup prom.</th><th class="num">Para aumentar</th>
      </tr></thead><tbody>${catRows.map(r=>`
        <tr class="clickable" onclick="Views.irProductos({cat:'${r.id}'})">
          <td class="strong">${esc(r.nombre)}</td>
          <td class="num">${r.n.toLocaleString('es-AR')}</td>
          <td class="num"><div style="display:flex;align-items:center;gap:7px;justify-content:flex-end">
            <span class="${r.cob<0.5?'t-red':r.cob<0.9?'t-amber':'t-green'}">${(r.cob*100).toFixed(0)}%</span>
            ${UI.pbar(r.cob, r.cob<0.5?'var(--red)':r.cob<0.9?'var(--amber)':'var(--green)')}
          </div></td>
          <td class="num">${money(r.costProm)}</td>
          <td class="num">${money(r.precProm)}</td>
          <td class="num ${r.mgProm<cfg.margenMinimo?'t-red':''}">${pct1(r.mgProm)}</td>
          <td class="num">${mk(r.mkpProm)}</td>
          <td class="num">${r.aum?`<span class="badge b-amber"><span class="dot"></span>${r.aum}</span>`:'<span class="t-mut">—</span>'}</td>
        </tr>`).join('')}</tbody>
      <tfoot><tr>
        <td>Total general</td><td class="num">${t.total.toLocaleString('es-AR')}</td>
        <td class="num">${(t.costeados/t.total*100).toFixed(0)}%</td>
        <td class="num">${money(t.costoProm)}</td><td class="num">${money(t.precioProm)}</td>
        <td class="num">${pct1(t.margenProm)}</td><td class="num">${mk(t.markupProm)}</td>
        <td class="num">${t.paraAumentar}</td>
      </tr></tfoot></table></div>`;

    /* --- donut + críticos --- */
    const segs = [
      {label:'Rentabilidad OK',  n:t.verde,    color:'var(--green)'},
      {label:'Advertencia',      n:t.amarillo, color:'var(--amber)'},
      {label:'Rentabilidad baja',n:t.rojo,     color:'var(--red)'},
      {label:'Sin costo',        n:t.sinCosto, color:'var(--gray)'}
    ];
    const criticos = rows.filter(({c})=>c.tieneCosto)
      .sort((a,b)=>a.c.markup-b.c.markup).slice(0,7);

    return `
      <div class="page-head">
        <div><h2>Resumen general</h2>
          <div class="sub">Indicadores clave del catálogo</div></div>
        <div class="spacer"></div>
        <div style="text-align:right;margin-right:4px">
          <div class="hint">Última actualización</div>
          <div style="font-size:12.5px;font-weight:650">${
            Data.s.historial.length ? fecha(Data.s.historial[0].fecha) : 'sin cambios registrados'}</div>
        </div>
        <button class="btn" onclick="Views.invalidar();Router.refresh();UI.toast('Datos recalculados','ok')">
          ${Icon('refresh')}</button>
        <button class="btn btn-primary" onclick="Router.go('importar')">${Icon('imp')} Actualizar datos</button>
      </div>
      <div class="kpi-grid">${kpis}</div>
      <div class="card mb"><div class="card-head"><h3>Alertas principales</h3></div>
        <div class="card-body"><div class="alerts">${alertas}</div></div></div>
      <div class="card mb"><div class="card-head"><h3>Resumen por categoría</h3><div class="spacer"></div>
        <button class="btn btn-sm btn-ghost" onclick="Router.go('rentabilidad')">Ver análisis completo →</button>
      </div>${catTbl}</div>
      <div class="g2 mb">
        <div class="card"><div class="card-head"><h3>Rentabilidad del catálogo</h3></div>
          <div class="card-body">${UI.donut(segs, t.total, 'productos')}</div></div>
        <div class="card"><div class="card-head"><h3>Últimos cambios realizados</h3>
          <div class="spacer"></div>
          <button class="btn btn-sm btn-ghost" onclick="Router.go('historial')">Ver historial completo →</button></div>
          ${Data.s.historial.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>
            <th>Fecha / hora</th><th>Tipo</th><th>Objetivo</th><th>Cambio</th>
          </tr></thead><tbody>${Data.s.historial.slice(0,6).map(e=>`<tr>
            <td class="t-sec" style="white-space:nowrap">${fecha(e.fecha)}</td>
            <td><span class="badge b-blue"><span class="dot"></span>${esc(e.tipo)}</span></td>
            <td class="strong">${esc(e.objetivo)}</td>
            <td class="t-sec" style="font-size:11.5px">${esc(e.detalle)}</td>
          </tr>`).join('')}</tbody></table></div>`
          : `<div class="card-body">${UI.empty('Sin cambios todavía',
              'Cuando edites costos o precios, los movimientos aparecen acá.')}</div>`}
        </div>
      </div>

      <div class="card"><div class="card-head"><h3>Productos críticos</h3><div class="spacer"></div>
        <span class="hint">menor markup con costo cargado</span>
        <button class="btn btn-sm btn-ghost" onclick="Views.irProductos({estado:'rojo'})">Ver todos →</button></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Modelo</th><th>Categoría</th><th class="num">Costo</th><th class="num">P. lista</th>
          <th class="num">Markup</th><th class="num">Margen</th><th class="num">Aumento sug.</th><th>Estado</th>
        </tr></thead><tbody>${criticos.map(({p,c})=>`
          <tr class="clickable" onclick="Views.ficha('${p.id}')">
            <td class="strong">${esc(p.modelo)}<div class="hint">${esc(p.medida||'')}</div></td>
            <td class="t-sec">${esc(Data.catNombre(p.categoriaId))}</td>
            <td class="num">${money(c.costoFinal)}</td>
            <td class="num">${money(c.lista)}</td>
            <td class="num ${c.markup<cfg.umbralAmarillo?'t-red':'t-amber'} strong">${mk(c.markup)}</td>
            <td class="num ${c.margen<cfg.margenMinimo?'t-red':''}">${pct1(c.margen)}</td>
            <td class="num t-red strong">${c.aumentoPct>0?pctS(c.aumentoPct):'—'}</td>
            <td>${UI.badge(c.estado)}</td>
          </tr>`).join('')}</tbody></table></div>
      </div>`;
  }

  function sinDatos(){
    return `<div class="card"><div class="card-body">${UI.empty(
      'Todavía no hay catálogo cargado',
      'Importá el archivo catalogo-costeado.json para empezar a analizar la rentabilidad.',
      `<button class="btn btn-blue" onclick="Router.go('importar')">${Icon('imp')} Ir a Importar</button>`)}</div></div>`;
  }

  /* ============================================================
     2 · PRODUCTOS — ¿Qué está pasando con cada mueble?
     ============================================================ */
  function irProductos(f){ Object.assign(F.prod, {page:0}, f); Router.go('productos'); }

  /** Alcance actual: solo los filtros universales (categoría, estado, medida,
   *  terminación, variantes, búsqueda) — sin los botones de acción. Sirve tanto
   *  para armar la tabla como para calcular el resumen de arriba. */
  function alcanceProd(){
    const f = F.prod;
    let rows = calcAll();
    if(f.cat)    rows = rows.filter(({p})=>p.categoriaId===f.cat);
    if(f.modelo) rows = rows.filter(({p})=>p.modelo===f.modelo);
    if(f.estado) rows = rows.filter(({c})=>c.estado===f.estado);
    if(f.medidas&&f.medidas.length) rows = rows.filter(({p})=>f.medidas.includes(p.medida||''));
    if(f.terms&&f.terms.length)     rows = rows.filter(({p})=>f.terms.includes(p.tier));
    Object.entries(f.vars||{}).forEach(([k,v]) => {
      if(v) rows = rows.filter(({p}) => String((p.variantes||{})[k]||'') === v);
    });
    if(f.q){
      const q = f.q.toLowerCase();
      rows = rows.filter(({p}) => (p.modelo||'').toLowerCase().includes(q)
        || variantesTxt(p).toLowerCase().includes(q) || (p.medida||'').includes(q));
    }
    return rows;
  }

  function filtrarProd(){
    const f = F.prod;
    let rows = alcanceProd();
    if(f.soloAumentar) rows = rows.filter(({c})=>c.aumentoPct>0.001);
    if(f.incompletos)  rows = rows.filter(({c})=>!c.tieneCosto || !c.lista);
    if(f.sinCosto)     rows = rows.filter(({c})=>!c.tieneCosto);
    if(f.revisar)      rows = rows.filter(({c})=>c.tieneCosto && (c.markup>Data.s.config.umbralSospecha || c.ganancia<0));
    if(f.hoy){ const ids=idsHoy(); rows = rows.filter(({p})=>ids.has(p.id)); }
    if(f.soloNoVinc){ const nv=new Set(noVinculados().map(p=>p.id)); rows = rows.filter(({p})=>nv.has(p.id)); }
    const k = f.sort;
    rows.sort((a,b)=>{
      if(k==='categoriaId') return f.dir * Data.catNombre(a.p.categoriaId).localeCompare(Data.catNombre(b.p.categoriaId));
      if(k==='medida') return f.dir * (medSort(a.p.medida)-medSort(b.p.medida));
      if(k==='estructura') return f.dir * String((a.p.variantes||{}).Estructura||'').localeCompare(String((b.p.variantes||{}).Estructura||''));
      if(k==='variante2'){
        const v2 = p => (Object.entries(p.variantes||{}).find(([kk])=>kk!=='Estructura')||['',''])[1] || '';
        return f.dir * String(v2(a.p)).localeCompare(String(v2(b.p)));
      }
      const va = k in a.c ? a.c[k] : (a.p[k]||''), vb = k in b.c ? b.c[k] : (b.p[k]||'');
      if(typeof va === 'string') return f.dir * va.localeCompare(vb);
      return f.dir * ((va||0)-(vb||0));
    });
    return rows;
  }

  function productos(){
    if(!Data.s.productos.length) return sinDatos();
    const f = F.prod, cfg = Data.s.config;
    const rows = filtrarProd();

    /* Resumen de arriba: reacciona a los filtros universales */
    const alcance = alcanceProd();
    const alcCosteados = alcance.filter(({c})=>c.tieneCosto);
    const pctCosteado = alcance.length ? Math.round(alcCosteados.length/alcance.length*100) : 0;
    const margenProm = alcCosteados.length
      ? alcCosteados.reduce((s,{c})=>s+c.margen,0)/alcCosteados.length : 0;
    const rowsAum  = alcance.filter(({c})=>c.aumentoPct>0.001).length;
    const rowsSinC = alcance.filter(({c})=>!c.tieneCosto).length;
    const rowsRev  = alcance.filter(({c})=>c.tieneCosto && (c.markup>cfg.umbralSospecha || c.ganancia<0)).length;

    /* Opciones de filtros */
    const enCat = Data.s.productos.filter(p=>!f.cat||p.categoriaId===f.cat);
    const modelos = [...new Set(enCat.map(p=>p.modelo).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const medidasAll = [...new Set(enCat.map(p=>p.medida).filter(Boolean))].sort((a,b)=>medSort(a)-medSort(b));

    /* Agrupar las filas filtradas por modelo */
    const gmap = {};
    rows.forEach(({p,c})=>{
      const k = p.categoriaId+'::'+p.modelo;
      (gmap[k] = gmap[k] || {modelo:p.modelo, catId:p.categoriaId, items:[]}).items.push({p,c});
    });
    const modelosGrupos = Object.entries(gmap).map(([k,o])=>{
      const costeados = o.items.filter(x=>x.c.tieneCosto);
      const costoDesde = costeados.length ? Math.min(...costeados.map(x=>x.c.costoFinal)) : 0;
      const margenProm2 = costeados.length ? costeados.reduce((s,x)=>s+x.c.margen,0)/costeados.length : 0;
      const algunAum = o.items.some(x=>x.c.aumentoPct>0.001);
      const algunRojo = o.items.some(x=>x.c.estado==='rojo');
      const estado = algunRojo ? 'rojo' : (algunAum ? 'am' : 'ok');
      return {...o, k, n:o.items.length, costoDesde, margenProm:margenProm2, estado};
    }).sort((a,b)=>a.modelo.localeCompare(b.modelo));

    const badgeEstado = e => e==='rojo'
      ? '<span class="badge b-red"><span class="dot"></span>Rentab. baja</span>'
      : e==='am' ? '<span class="badge b-amber"><span class="dot"></span>Para aumentar</span>'
      : '<span class="badge b-green"><span class="dot"></span>OK</span>';

    const tbl = !modelosGrupos.length ? UI.empty('Sin resultados','Probá cambiando los filtros.')
      : `<div class="tbl-wrap">
        <div class="prodh">
          <span style="flex:2.4">Modelo</span><span style="flex:1;text-align:center">Variantes</span>
          <span style="flex:1.2;text-align:right">Costo desde</span><span style="flex:1;text-align:right">Margen</span>
          <span style="flex:1.3;text-align:right">Estado</span>
        </div>
        ${modelosGrupos.map(gr=>{
          const abierto = !!(f.expM||{})[gr.k];
          return `<div class="prod-grp ${abierto?'open':''}">
            <div class="prod-row" onclick="Views.toggleProdModelo('${escJs(gr.k)}')">
              <span style="flex:2.4;display:flex;align-items:center;gap:8px">
                <span class="chev">${abierto?'▾':'▸'}</span>
                <b>${esc(sinPrefijoCategoria(gr.modelo, Data.catNombre(gr.catId)))}</b></span>
              <span style="flex:1;text-align:center" class="t-sec">${gr.n}</span>
              <span style="flex:1.2;text-align:right">${gr.costoDesde?money(gr.costoDesde):'<span class="t-mut">—</span>'}</span>
              <span style="flex:1;text-align:right">${gr.margenProm?pct1(gr.margenProm):'<span class="t-mut">—</span>'}</span>
              <span style="flex:1.3;text-align:right">${badgeEstado(gr.estado)}</span>
            </div>
            ${abierto?`<div class="prod-detalle"><table class="tbl" style="font-size:11.5px"><thead><tr>
              <th>Medida</th><th>Variante</th><th class="num">Costo</th><th class="num">P. efectivo</th>
              <th class="num">Margen</th><th class="num">Markup</th><th class="num">Aum.</th><th></th>
            </tr></thead><tbody>${gr.items.sort((a,b)=>medSort(a.p.medida)-medSort(b.p.medida)).map(({p,c})=>{
              const vtxt = Object.entries(p.variantes||{}).filter(([,v])=>v!=null&&v!=='')
                .map(([k,v])=>`${esc(k)} ${esc(v)}`).join(' · ') || '—';
              return `<tr class="clickable" onclick="Views.ficha('${p.id}')">
                <td class="strong">${esc(p.medida||'—')}</td>
                <td class="t-sec">${vtxt}</td>
                <td class="num">${c.tieneCosto?money(c.costoFinal):'<span class="t-mut">sin costo</span>'}</td>
                <td class="num">${c.lista?money(c.efectivo):'<span class="t-mut">sin precio</span>'}</td>
                <td class="num ${c.tieneCosto&&c.margen<cfg.margenMinimo?'t-red':''}">${c.tieneCosto?pct1(c.margen):'—'}</td>
                <td class="num strong">${c.tieneCosto?mk(c.markup):'—'}</td>
                <td class="num ${c.aumentoPct>0.001?'t-red strong':'t-mut'}">${c.aumentoPct>0.001?pctS(c.aumentoPct):'—'}</td>
                <td class="num"><button class="icon-btn" title="Abrir ficha">${Icon('edit')}</button></td>
              </tr>`;}).join('')}</tbody></table></div>`:''}
          </div>`;
        }).join('')}
      </div>`;

    return `
      <div class="page-head">
        <div><h2>Productos</h2><div class="sub">${modelosGrupos.length.toLocaleString('es-AR')} modelos · ${rows.length.toLocaleString('es-AR')} variantes · clic en un modelo para ver sus variantes</div></div>
        <div class="spacer"></div>
        <span class="edit-hint">${Icon('check')} Costo y precio se editan en la tabla</span>
        <button class="btn" onclick="Views.exportarCSV()">${Icon('dl')} Exportar CSV</button>
      </div>
      <div class="card mb"><div class="card-body" style="padding:14px 16px">
        <div class="filters" style="margin-bottom:12px">
          ${selCat('fpCat', f.cat, 'onchange="Views.setProd(\'cat\',this.value)"')}
          <select class="inp" style="max-width:240px" onchange="Views.setProd('modelo',this.value)">
            <option value="">Todos los modelos</option>
            ${modelos.map(m=>`<option value="${esc(m)}" ${f.modelo===m?'selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <div class="ms-wrap">
            <button class="inp ms-btn" onclick="Views.toggleMenuCol('medidas')">
              Medida${f.medidas.length?`: ${f.medidas.length===1?esc(f.medidas[0]):f.medidas.length+' elegidas'}`:': todas'} ▾</button>
            ${f.menuCol==='medidas'?`<div class="colmenu">
              ${medidasAll.map(m=>`<label class="colmenu-item" onclick="event.stopPropagation()">
                <input type="checkbox" ${f.medidas.includes(m)?'checked':''} onchange="Views.toggleMulti('medidas','${escJs(m)}')"> ${esc(m)}</label>`).join('')}
              ${f.medidas.length?`<div class="colmenu-item clear" onclick="Views.clearMulti('medidas')">Quitar filtro</div>`:''}
            </div>`:''}
          </div>
          <div class="ms-wrap">
            <button class="inp ms-btn" onclick="Views.toggleMenuCol('terms')">
              Terminación${f.terms.length?`: ${f.terms.length===1?esc((TIERS.find(t=>t.key===f.terms[0])||{}).label):f.terms.length+' elegidas'}`:': todas'} ▾</button>
            ${f.menuCol==='terms'?`<div class="colmenu">
              ${TIERS.map(tr=>`<label class="colmenu-item" onclick="event.stopPropagation()">
                <input type="checkbox" ${f.terms.includes(tr.key)?'checked':''} onchange="Views.toggleMulti('terms','${tr.key}')"> ${esc(tr.label)}</label>`).join('')}
              ${f.terms.length?`<div class="colmenu-item clear" onclick="Views.clearMulti('terms')">Quitar filtro</div>`:''}
            </div>`:''}
          </div>
          <input class="inp" style="flex:1;min-width:180px" placeholder="Buscar modelo…"
            value="${esc(f.q)}" oninput="Views.setProd('q',this.value)">
        </div>
        ${(()=>{ const chips=[];
          if(f.cat) chips.push(['Categoría: '+Data.catNombre(f.cat), "Views.setProd('cat','')"]);
          if(f.modelo) chips.push(['Modelo: '+sinPrefijoCategoria(f.modelo, f.cat?Data.catNombre(f.cat):''), "Views.setProd('modelo','')"]);
          f.medidas.forEach(m=>chips.push(['Medida: '+m, `Views.toggleMulti('medidas','${escJs(m)}')`]));
          f.terms.forEach(t=>chips.push(['Terminación: '+((TIERS.find(x=>x.key===t)||{}).label||t), `Views.toggleMulti('terms','${t}')`]));
          if(f.estado) chips.push(['Estado: '+((ESTADO[f.estado]||{}).lbl||f.estado), "Views.setProd('estado','')"]);
          Object.entries(f.vars||{}).forEach(([k,v])=>{ if(v) chips.push([k+': '+v, `Views.setVar('${escJs(k)}','')`]); });
          if(f.soloAumentar) chips.push(['Para aumentar', "Views.toggleProd('soloAumentar')"]);
          if(f.sinCosto) chips.push(['Sin costo', "Views.toggleProd('sinCosto')"]);
          if(f.revisar) chips.push(['Por revisar', "Views.toggleProd('revisar')"]);
          return chips.length ? `<div class="chips">${chips.map(([l,acc])=>
            `<span class="chip">${esc(l)}<span class="chip-x" onclick="${acc}" title="Quitar">✕</span></span>`).join('')}
            <button class="btn btn-sm btn-ghost" onclick="Views.limpiarProd()">Limpiar todo</button></div>` : '';
        })()}
        <div class="acc-cards" style="margin-top:12px">
          ${[['','Productos totales', alcance.length, ''],
             ['soloAumentar','Para aumentar', rowsAum, 'am'],
             ['sinCosto','Sin costo / revisar', rowsSinC+rowsRev, 'gris'],
             ['__pct','% costeado', pctCosteado, 'ok', '%'],
             ['__margen','Margen promedio', Math.round(margenProm*100), 'ok', '%']]
            .map(([k,l,n,tono,suf])=>{
              const info = k==='__pct' || k==='__margen';
              const activo = k && !info ? f[k] : false;
              const acc = k && !info ? `Views.toggleProd('${k}')` : '';
              return `<div class="acc-card ${tono} ${activo?'activa':''} ${(k&&!info)?'click':''}"
                ${(k&&!info)?`onclick="${acc}"`:''}>
                <div class="acc-n">${(n||0).toLocaleString('es-AR')}${suf||''}</div>
                <div class="acc-l">${esc(l)}</div>
              </div>`;
            }).join('')}
        </div>
      </div></div>
      <div class="card">${tbl}</div>`;
  }

  /* ============================================================
     3 · FICHA DEL PRODUCTO (drawer lateral)
     ============================================================ */
  function ficha(id){
    const p = Data.s.productos.find(x=>x.id===id); if(!p) return;
    const c = Calc.producto(p), cfg = Data.s.config;
    const cat = Data.cat(p.categoriaId) || {};
    const term = (TIERS.find(t=>t.id===p.tier)||{}).label || '—';

    const similares = Data.s.productos
      .filter(x => x.categoriaId===p.categoriaId && x.modelo===p.modelo && x.id!==p.id)
      .slice(0,6).map(x => ({x, c:Calc.producto(x)}));
    const hist = Data.s.historial.filter(e => e.productId===p.id).slice(0,10);

    const html = `
      ${!c.tieneCosto?`<div class="warn-box mb"><b>Sin costo cargado.</b> Este producto no tiene
        costo en la tabla para su medida y terminación, así que no se puede calcular rentabilidad.
        Cargalo en <b>Actualización de costos</b> o en el Excel de pendientes.</div>`:''}

      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(132px,1fr));margin-bottom:15px">
        ${UI.kpi({label:'Costo final', value:c.tieneCosto?money(c.costoFinal):'—',
          icon:'box', bg:'var(--gray-l)', color:'var(--sec)'})}
        ${UI.kpi({label:'Precio efectivo', value:money(c.efectivo),
          sub:`lista ${money(c.lista)}`, icon:'tag', bg:'var(--blue-l)', color:'var(--blue)'})}
        ${UI.kpi({label:'Margen', value:c.tieneCosto?pct1(c.margen):'—',
          sub:c.tieneCosto?(c.margen>=cfg.margenMinimo?'sobre el mínimo':'bajo el mínimo'):'',
          subColor:c.margen>=cfg.margenMinimo?'var(--green)':'var(--red)',
          icon:'chart', bg:'var(--green-l)', color:'var(--green)'})}
        ${UI.kpi({label:'Markup', value:mk(c.markup),
          sub:`objetivo ${c.target.toFixed(2).replace('.',',')}`,
          subColor:c.markup>=c.target?'var(--green)':'var(--amber)',
          icon:'target', bg:'var(--amber-l)', color:'var(--amber)'})}
      </div>

      <div class="g2 mb">
        <div class="card"><div class="card-head"><h3>Datos generales</h3>
          <div class="spacer"></div><span class="hint">editable</span></div>
          <div class="card-body"><dl class="kv kv-edit">
            <dt>Categoría</dt><dd>
              <select class="inp inp-sm" id="fCat">
                ${Data.s.categorias.map(cc=>`<option value="${esc(cc.id)}" ${cc.id===p.categoriaId?'selected':''}>${esc(cc.nombre)}</option>`).join('')}
              </select></dd>
            <dt>Modelo</dt><dd><input class="inp inp-sm" id="fModelo" value="${esc(p.modelo||'')}"></dd>
            <dt>Medida comercial</dt><dd><input class="inp inp-sm" id="fMedida" value="${esc(p.medida||'')}"></dd>
            <dt>Medida de costeo</dt><dd><input class="inp inp-sm" id="fMedidaCosteo" value="${esc(p.medidaCosteo||'')}"></dd>
            <dt>Terminación</dt><dd>
              <select class="inp inp-sm" id="fTier">
                ${TIERS.map(tr=>`<option value="${esc(tr.key)}" ${tr.key===p.tier?'selected':''}>${esc(tr.label)}</option>`).join('')}
              </select></dd>
            ${Object.keys(p.variantes||{}).map((k,i)=>
              `<dt>${esc(k)}</dt><dd><input class="inp inp-sm" data-varkey="${esc(k)}" id="fVar${i}" value="${esc((p.variantes||{})[k]||'')}"></dd>`).join('')}
          </dl>
          <div class="hint" style="margin-top:4px">Categoría, medida de costeo y terminación recalculan el costo desde la tabla — al guardar te pido confirmación.</div>
          </div></div>
        <div class="card"><div class="card-head"><h3>Composición del costo</h3></div>
          <div class="card-body"><dl class="kv kv-edit">
            <dt>Costo base ${c.baseDeTabla?'(tabla)':'(manual)'}</dt><dd>${money(c.base)}</dd>
            <dt>Adicionales % <span class="hint" style="font-weight:400">(por reglas)</span></dt><dd>${c.adicPct?pct1(c.adicPct):'—'}</dd>
            <dt>Adicionales fijos <span class="hint" style="font-weight:400">(por reglas)</span></dt><dd>${c.adicFijo?money(c.adicFijo):'—'}</dd>
            ${c.costoHierro?`<dt>Hierro <span class="hint" style="font-weight:400">(largo ${c.hierro.largo})</span></dt><dd>${money(c.costoHierro)}</dd>`:''}
            <dt>Adicional de este producto</dt><dd><input class="inp inp-sm" type="number" id="fAdicional" value="${p.adicional||''}" placeholder="0"></dd>
            <dt>Ajuste manual</dt><dd><input class="inp inp-sm" type="number" id="fAjuste" value="${p.ajusteManual||''}" placeholder="0"></dd>
            <dt style="border-top:1px solid var(--line);padding-top:7px">Costo final</dt>
            <dd style="border-top:1px solid var(--line);padding-top:7px">${money(c.costoFinal)}</dd>
          </dl>
          <div style="margin-top:10px"><button class="btn btn-blue btn-sm" onclick="Views.guardarFicha('${p.id}')">Guardar cambios de la ficha</button></div>
          </div></div>
      </div>

      <details class="vermas">
        <summary>Ver más: rentabilidad, ajuste rápido, otras variantes, simulador, observaciones e historial</summary>

      <div class="card mb" style="margin-top:14px"><div class="card-head"><h3>Rentabilidad y precio recomendado</h3>
        <div class="spacer"></div>${UI.badge(c.estado)}</div>
        <div class="card-body">
          ${c.tieneCosto?`<div style="margin-bottom:18px">
            <div class="sec-lbl" style="display:flex;align-items:center;gap:6px">Markup contra objetivo
              ${UI.tip('La aguja es el markup real de este producto. La línea vertical oscura es el markup objetivo de su categoría. Las zonas son el semáforo: rojo, advertencia y OK.')}</div>
            ${UI.ruler(c.markup, c.target, true)}
          </div>`:''}
          <dl class="kv" style="margin-bottom:14px">
            <dt>Precio de lista actual</dt><dd>${money(c.lista)}</dd>
            <dt>Precio efectivo (−${(cfg.descuento*100).toFixed(0)}%)</dt><dd>${money(c.efectivo)}</dd>
            <dt>Ganancia por unidad</dt><dd class="${c.ganancia<0?'t-red':''}">${c.tieneCosto?money(c.ganancia):'—'}</dd>
          </dl>
          ${c.tieneCosto?`<div class="${c.aumentoPct>0.001?'warn-box':'info-box'}">
            <div style="display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap">
              <div><b>Precio de lista sugerido: ${money(c.sugerido)}</b>
                <div style="margin-top:2px">Para alcanzar el markup objetivo de ${c.target.toFixed(2).replace('.',',')}x
                ${Calc.llevaNegro(p)?'(lleva negro)':''}</div></div>
              <div style="font-size:19px;font-weight:700">${c.aumentoPct>0.001?pctS(c.aumentoPct):'ya está en objetivo'}</div>
            </div></div>`:''}
        </div>
      </div>

      <div class="card mb"><div class="card-head"><h3>Ajuste rápido</h3>
        <div class="spacer"></div><span class="hint">pisa el valor de la lista</span></div>
        <div class="card-body">
          ${Number(p.costoManual)>0?`<div class="warn-box" style="margin-bottom:12px">
            <b>El costo de este producto está cargado a mano.</b> No se actualiza cuando cambian los precios de la lista.
            Para volver a vincularlo, borrá el costo manual (dejalo vacío) y guardá.</div>`:''}
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:11px;align-items:end">
            <div><label class="inp-lbl">Costo manual ${Number(p.costoManual)>0?'<span class="t-red">(manual)</span>':'(pisa la tabla)'}</label>
              <input class="inp" type="number" id="fCosto" style="width:100%" value="${p.costoManual||''}" placeholder="${Math.round(c.base)||'0'}"></div>
            <div><label class="inp-lbl">Precio de lista</label>
              <input class="inp" type="number" id="fPrecio" style="width:100%" value="${p.precioLista||''}"></div>
            <button class="btn btn-blue" onclick="Views.guardarFicha('${p.id}')">Guardar</button>
          </div>
          <div class="hint" style="margin-top:9px">Los cambios quedan registrados en el Historial.</div>
        </div>
      </div>

      ${similares.length?`<div class="card mb"><div class="card-head"><h3>Otras variantes de este modelo</h3></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Variantes</th><th>Medida</th><th class="num">Costo</th>
          <th class="num">P. lista</th><th class="num">Markup</th><th>Estado</th>
        </tr></thead><tbody>${similares.map(({x,c:cc})=>`
          <tr class="clickable" onclick="Views.ficha('${x.id}')">
            <td style="font-size:11.5px">${esc(variantesTxt(x))}</td>
            <td class="t-sec">${esc(x.medida||'—')}</td>
            <td class="num">${cc.tieneCosto?money(cc.costoFinal):'—'}</td>
            <td class="num">${money(cc.lista)}</td>
            <td class="num strong">${mk(cc.markup)}</td>
            <td>${UI.badge(cc.estado)}</td>
          </tr>`).join('')}</tbody></table></div></div>`:''}

        <div class="card mb"><div class="card-head"><h3>Simular este producto</h3>
          <div class="spacer"></div><span class="hint">no modifica los datos reales</span></div>
          <div class="card-body">
            <div class="g2" style="gap:16px">
              <div><label class="inp-lbl">Costo <b id="simCostoL">${money(c.costoFinal)}</b></label>
                <input type="range" id="simCosto" min="-40" max="80" step="1" value="0"
                  oninput="Views.simFicha('${p.id}')"></div>
              <div><label class="inp-lbl">Precio de lista <b id="simPrecioL">${money(c.lista)}</b></label>
                <input type="range" id="simPrecio" min="-40" max="120" step="1" value="0"
                  oninput="Views.simFicha('${p.id}')"></div>
            </div>
            <div id="simOut" style="margin-top:16px"></div>
          </div>
        </div>

        <div class="card mb"><div class="card-head"><h3>Observaciones</h3></div>
          <div class="card-body">
            <textarea class="inp" id="fObs" rows="3" style="width:100%;resize:vertical"
              placeholder="Notas sobre este producto: acuerdos con el proveedor, por qué el precio es el que es, qué hay que revisar…">${esc(p.obs||'')}</textarea>
            <div style="margin-top:9px"><button class="btn btn-sm" onclick="Views.guardarObs('${p.id}')">Guardar observación</button></div>
          </div>
        </div>

        <div class="card"><div class="card-head"><h3>Historial de este producto</h3></div>
          ${hist.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr>
            <th style="width:150px">Fecha / hora</th><th style="width:160px">Tipo</th><th>Cambio</th>
          </tr></thead><tbody>${hist.map(e=>`<tr>
            <td class="t-sec">${fecha(e.fecha)}</td>
            <td><span class="badge b-blue"><span class="dot"></span>${esc(e.tipo)}</span></td>
            <td class="t-sec">${esc(e.detalle)}</td></tr>`).join('')}</tbody></table></div>`
          :`<div class="card-body"><div class="hint">Todavía no hubo cambios sobre este producto.</div></div>`}
        </div>
      </details>`;

    UI.drawer(esc(p.modelo),
      `${esc(Data.catNombre(p.categoriaId))} · ${esc(p.medida||'')} · ${esc(variantesTxt(p))}`, html);
    if(c.tieneCosto) simFicha(p.id);
  }

  /** Simulación en vivo dentro de la ficha (no toca datos reales). */
  function simFicha(id){
    const p = Data.s.productos.find(x=>x.id===id); if(!p) return;
    const c = Calc.producto(p), cfg = Data.s.config;
    const dc = (parseFloat(document.getElementById('simCosto').value)||0)/100;
    const dp = (parseFloat(document.getElementById('simPrecio').value)||0)/100;
    const costo2 = c.costoFinal*(1+dc), lista2 = c.lista*(1+dp);
    const efec2 = lista2*(1-cfg.descuento);
    const mk2 = costo2>0?efec2/costo2:0, gan2 = efec2-costo2;
    const mg2 = efec2>0?gan2/efec2:0;

    document.getElementById('simCostoL').textContent =
      money(costo2) + (dc?` (${pctS(dc)})`:'');
    document.getElementById('simPrecioL').textContent =
      money(lista2) + (dp?` (${pctS(dp)})`:'');

    const fila = (lbl, act, sim, fmt) => {
      const dif = sim-act;
      return `<dt>${lbl}</dt><dd><span class="t-mut" style="font-weight:500">${fmt(act)}</span>
        &nbsp;→&nbsp;<b>${fmt(sim)}</b>
        ${Math.abs(dif)>1e-9?`<span style="color:${dif>0?'var(--green)':'var(--red)'};font-size:11.5px">
          &nbsp;${dif>0?'▲':'▼'}</span>`:''}</dd>`;
    };
    document.getElementById('simOut').innerHTML = `
      ${c.tieneCosto?UI.ruler(mk2, c.target, true):''}
      <dl class="kv" style="margin-top:14px">
        ${fila('Markup', c.markup, mk2, mk)}
        ${fila('Margen', c.margen, mg2, pct1)}
        ${fila('Ganancia por unidad', c.ganancia, gan2, money)}
      </dl>`;
  }

  /** Enter guarda y pasa a la celda siguiente · Esc cancela. */
  function teclaCelda(ev, el){
    if(ev.key === 'Escape'){
      el.value = Number(el.dataset.orig) ? Number(el.dataset.orig).toLocaleString('es-AR') : '';
      el.blur(); return;
    }
    if(ev.key === 'Enter'){
      ev.preventDefault(); el.blur();
      const todas = [...document.querySelectorAll('.cell-inp')];
      const i = todas.indexOf(el);
      if(i > -1 && todas[i+2]) todas[i+2].focus(); // misma columna, fila siguiente
    }
  }

  /** Guarda el valor de una celda editada. Valida y registra en el historial. */
  function guardarCelda(el){
    const p = Data.s.productos.find(x=>x.id===el.dataset.id); if(!p) return;
    const campo = el.dataset.campo;
    const orig = Number(el.dataset.orig)||0;
    const nuevo = parseNum(el.value);

    if(nuevo === orig){ el.value = orig?orig.toLocaleString('es-AR'):''; return; }
    if(nuevo < 0){ UI.toast('El valor no puede ser negativo','err');
      el.value = orig?orig.toLocaleString('es-AR'):''; return; }

    const aplicar = () => {
      if(campo === 'costo') p.costoManual = nuevo;
      else if(campo === 'efectivo') p.precioLista = Math.round(nuevo / (1 - Data.s.config.descuento));
      else p.precioLista = nuevo;
      Data.saveProducto(p);
      Data.log('Edición manual', `${p.modelo} ${p.medida||''}`,
        `${campo==='costo'?'costo':campo==='efectivo'?'precio efectivo':'precio'} ${money(orig)} → ${money(nuevo)}`, p.id);
      invalidar();
      el.dataset.orig = nuevo;
      el.value = nuevo.toLocaleString('es-AR');
      el.classList.remove('vacio'); el.classList.add('guardado');
      // refrescar la fila para que markup, margen y estado se actualicen
      setTimeout(()=>{ const foco=document.activeElement; Router.refresh();
        if(foco && foco.classList && foco.classList.contains('cell-inp')) foco.focus(); }, 450);
      UI.toast(`${campo==='costo'?'Costo':'Precio'} actualizado`,'ok');
    };

    // Freno de mano: un cambio enorme suele ser un error de tipeo (un cero de más o de menos)
    const ratio = orig>0 ? nuevo/orig : 1;
    if(orig>0 && (ratio>5 || ratio<0.2)){
      UI.confirm('Confirmar cambio grande',
        `Estás cambiando el ${campo==='costo'?'costo':campo==='efectivo'?'precio efectivo':'precio'} de
         <b>${esc(p.modelo)} ${esc(p.medida||'')}</b><br><br>
         de <b>${money(orig)}</b> a <b>${money(nuevo)}</b>
         (${ratio>1?'×'+ratio.toFixed(1):'÷'+(1/ratio).toFixed(1)}).<br><br>
         Un salto así suele ser un cero de más o de menos. ¿Es correcto?`,
        aplicar, 'Sí, es correcto');
      el.value = orig.toLocaleString('es-AR');
      return;
    }
    aplicar();
  }

  function guardarObs(id){
    const p = Data.s.productos.find(x=>x.id===id); if(!p) return;
    const v = document.getElementById('fObs').value.trim();
    if(v === (p.obs||'')){ UI.toast('No hubo cambios'); return; }
    p.obs = v; Data.saveProducto(p);
    Data.log('Observación', `${p.modelo} ${p.medida||''}`, v?v.slice(0,90):'observación borrada', p.id);
    UI.toast('Observación guardada','ok');
  }

  function guardarFicha(id){
    const p = Data.s.productos.find(x=>x.id===id); if(!p) return;
    const val = gid => document.getElementById(gid);
    const num = gid => { const el=val(gid); return el ? (parseFloat(el.value)||0) : null; };
    const txt = gid => { const el=val(gid); return el ? el.value.trim() : null; };

    // Reunir los valores nuevos de todos los inputs presentes (los que no están, quedan igual)
    const nuevo = {
      costoManual: num('fCosto') ?? (Number(p.costoManual)||0),
      precioLista: num('fPrecio') ?? (Number(p.precioLista)||0),
      categoriaId: txt('fCat') ?? p.categoriaId,
      modelo: txt('fModelo') ?? p.modelo,
      medida: txt('fMedida') ?? p.medida,
      medidaCosteo: txt('fMedidaCosteo') ?? p.medidaCosteo,
      tier: txt('fTier') ?? p.tier,
      adicional: num('fAdicional') ?? (Number(p.adicional)||0),
      ajusteManual: num('fAjuste') ?? (Number(p.ajusteManual)||0),
      variantes: {...(p.variantes||{})}
    };
    document.querySelectorAll('[data-varkey]').forEach(el=>{ nuevo.variantes[el.dataset.varkey] = el.value.trim(); });

    // ¿Qué cambió?
    const cambios = [];
    const antesCat = p.categoriaId, antesMc = p.medidaCosteo, antesTier = p.tier;
    if(nuevo.categoriaId!==p.categoriaId) cambios.push(`categoría ${Data.catNombre(p.categoriaId)} → ${Data.catNombre(nuevo.categoriaId)}`);
    if(nuevo.modelo!==p.modelo) cambios.push(`modelo "${p.modelo}" → "${nuevo.modelo}"`);
    if(nuevo.medida!==(p.medida||'')) cambios.push(`medida ${p.medida||'—'} → ${nuevo.medida||'—'}`);
    if(nuevo.medidaCosteo!==(p.medidaCosteo||'')) cambios.push(`medida de costeo ${p.medidaCosteo||'—'} → ${nuevo.medidaCosteo||'—'}`);
    if(nuevo.tier!==p.tier) cambios.push(`terminación → ${(TIERS.find(t=>t.key===nuevo.tier)||{}).label||nuevo.tier}`);
    if((Number(p.adicional)||0)!==nuevo.adicional) cambios.push(`adicional propio ${money(p.adicional||0)} → ${money(nuevo.adicional)}`);
    if((Number(p.ajusteManual)||0)!==nuevo.ajusteManual) cambios.push(`ajuste manual ${money(p.ajusteManual||0)} → ${money(nuevo.ajusteManual)}`);
    if((Number(p.costoManual)||0)!==nuevo.costoManual) cambios.push(`costo ${money(p.costoManual||0)} → ${money(nuevo.costoManual)}`);
    if((Number(p.precioLista)||0)!==nuevo.precioLista) cambios.push(`precio ${money(p.precioLista||0)} → ${money(nuevo.precioLista)}`);
    const varCambios = Object.keys(nuevo.variantes).filter(k=>String((p.variantes||{})[k]||'')!==String(nuevo.variantes[k]||''));
    varCambios.forEach(k=>cambios.push(`${k}: ${nuevo.variantes[k]}`));

    if(!cambios.length){ UI.toast('No hubo cambios'); return; }

    // Cambios que recalculan el costo desde la tabla → confirmar mostrando el impacto
    const riesgoso = nuevo.categoriaId!==antesCat || nuevo.medidaCosteo!==(antesMc||'') || nuevo.tier!==antesTier;

    const aplicar = () => {
      Object.assign(p, {
        categoriaId:nuevo.categoriaId, modelo:nuevo.modelo, medida:nuevo.medida,
        medidaCosteo:nuevo.medidaCosteo, tier:nuevo.tier, adicional:nuevo.adicional,
        ajusteManual:nuevo.ajusteManual, costoManual:nuevo.costoManual,
        precioLista:nuevo.precioLista, variantes:nuevo.variantes
      });
      Data.saveProducto(p);
      Data.log('Edición de ficha', `${p.modelo} ${p.medida||''}`, cambios.join(' · '), p.id);
      invalidar(); UI.closeAll(); Router.refresh();
      UI.toast('Producto actualizado', 'ok');
    };

    if(riesgoso){
      const cOld = Calc.producto(p);
      const cNew = Calc.producto({...p, categoriaId:nuevo.categoriaId, medidaCosteo:nuevo.medidaCosteo, tier:nuevo.tier, adicional:nuevo.adicional, ajusteManual:nuevo.ajusteManual, costoManual:nuevo.costoManual});
      const aviso = cNew.costoFinal<=0
        ? `<b style="color:var(--red)">Ojo: con estos datos el producto queda SIN costo</b> (no hay una fila en la tabla para esa combinación de categoría, medida de costeo y terminación).`
        : `El costo pasa de <b>${money(cOld.costoFinal)}</b> a <b>${money(cNew.costoFinal)}</b>.`;
      UI.confirm('Confirmar cambio que recalcula el costo',
        `Estás cambiando datos que hacen que el costo se busque en otra parte de la tabla.<br><br>
         ${aviso}<br><br>¿Confirmás?`,
        aplicar, 'Sí, guardar');
      return;
    }
    aplicar();
  }

  /* ============================================================
     4 · SIMULADOR — ¿Qué pasa si modifico costos o precios?
     ============================================================ */
  function simulador(){
    if(!Data.s.productos.length) return sinDatos();
    const cfg = Data.s.config;
    const rows = calcAll();

    /* --- simulación global sobre el catálogo --- */
    const dCosto = F.sim.dCosto ?? 0, dPrecio = F.sim.dPrecio ?? 0;
    const desc = F.sim.desc ?? cfg.descuento;
    const target = F.sim.target ?? cfg.targetOtro;
    const adic = F.sim.adic ?? 0;

    let mkAct=0, mkSim=0, mgAct=0, mgSim=0, gAct=0, gSim=0, n=0;
    let vSim=0, aSim=0, rSim=0, bajoObj=0;
    rows.forEach(({p,c}) => {
      if(!c.tieneCosto) return; n++;
      const costo2 = c.costoFinal*(1+dCosto) + adic;
      const lista2 = c.lista*(1+dPrecio);
      const efec2 = lista2*(1-desc);
      const mk2 = costo2>0?efec2/costo2:0;
      const mg2 = efec2>0?(efec2-costo2)/efec2:0;
      mkAct+=c.markup; mkSim+=mk2; mgAct+=c.margen; mgSim+=mg2;
      gAct+=c.ganancia; gSim+=(efec2-costo2);
      if(mk2>=cfg.umbralVerde) vSim++; else if(mk2>=cfg.umbralAmarillo) aSim++; else rSim++;
      if(mk2 < target) bajoObj++;
    });
    const d = (a,b) => n?(b/n - a/n):0;

    const card = (t,act,sim,fmt,inv) => {
      const dif = sim-act, mejor = inv? dif<0 : dif>0;
      return `<div class="card"><div class="card-body">
        <div class="kpi-lbl">${t}</div>
        <div style="display:flex;align-items:baseline;gap:11px;margin-top:5px;flex-wrap:wrap">
          <span class="t-mut" style="font-size:14px;text-decoration:line-through">${fmt(act)}</span>
          <span style="font-size:22px;font-weight:700;letter-spacing:-.5px">${fmt(sim)}</span>
        </div>
        <div style="font-size:12px;font-weight:650;margin-top:3px;color:${
          Math.abs(dif)<1e-9?'var(--mut)':mejor?'var(--green)':'var(--red)'}">
          ${Math.abs(dif)<1e-9?'sin cambio':(dif>0?'▲ ':'▼ ')+fmt(Math.abs(dif))}</div>
      </div></div>`;
    };

    return `
      <div class="page-head">
        <div><h2>Simulador de precios</h2>
          <div class="sub">Probá escenarios sobre todo el catálogo sin tocar los datos reales</div></div>
      </div>
      <div class="info-box mb">Nada de lo que hagas acá se guarda. Es una simulación para
        decidir antes de aplicar un cambio real en <b>Actualización de costos</b>.</div>

      <div class="card mb"><div class="card-head"><h3>Escenario</h3><div class="spacer"></div>
        <button class="btn btn-sm" onclick="Views.resetSim()">Reiniciar</button></div>
        <div class="card-body"><div class="g3" style="gap:20px">
          <div><label class="inp-lbl">Variación de costos: <b>${pctS(dCosto)}</b></label>
            <input type="range" min="-30" max="60" step="1" value="${(dCosto*100).toFixed(0)}"
              oninput="Views.setSim('dCosto',this.value/100)">
            <div class="hint">Ej.: aumento de proveedor o de materia prima.</div></div>
          <div><label class="inp-lbl">Variación de precios de lista: <b>${pctS(dPrecio)}</b></label>
            <input type="range" min="-20" max="80" step="1" value="${(dPrecio*100).toFixed(0)}"
              oninput="Views.setSim('dPrecio',this.value/100)">
            <div class="hint">Aumento general que estés evaluando aplicar.</div></div>
          <div><label class="inp-lbl">Descuento de venta: <b>${(desc*100).toFixed(0)} %</b></label>
            <input type="range" min="0" max="60" step="1" value="${(desc*100).toFixed(0)}"
              oninput="Views.setSim('desc',this.value/100)">
            <div class="hint">Promo habitual sobre el precio de lista.</div></div>
          <div><label class="inp-lbl">Markup objetivo: <b>${target.toFixed(2).replace('.',',')}x</b></label>
            <input type="range" min="1.4" max="3" step="0.01" value="${target}"
              oninput="Views.setSim('target',this.value)">
            <div class="hint">Cuántos productos quedarían por debajo del objetivo.</div></div>
          <div><label class="inp-lbl">Adicional fijo por producto: <b>${money(adic)}</b></label>
            <input type="range" min="0" max="100000" step="1000" value="${adic}"
              oninput="Views.setSim('adic',this.value)">
            <div class="hint">Ej.: herrajes, flete o packaging que hoy no estás costeando.</div></div>
        </div></div></div>

      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(215px,1fr))">
        ${card('Markup promedio', mkAct/(n||1), mkSim/(n||1), mk)}
        ${card('Margen promedio', mgAct/(n||1), mgSim/(n||1), pct1)}
        ${card('Ganancia total del catálogo', gAct, gSim, money)}
        ${UI.kpi({label:'Quedarían bajo objetivo', value:bajoObj.toLocaleString('es-AR'),
          sub:`de ${n.toLocaleString('es-AR')} con costo`,
          subColor: bajoObj>n/2?'var(--red)':'var(--amber)',
          icon:'target', bg:'var(--amber-l)', color:'var(--amber)'})}
      </div>

      <div class="card"><div class="card-head"><h3>Cómo quedaría el semáforo</h3>
        <div class="spacer"></div><span class="hint">${n.toLocaleString('es-AR')} productos con costo</span></div>
        <div class="card-body">${UI.donut([
          {label:'Rentabilidad OK',  n:vSim, color:'var(--green)'},
          {label:'Advertencia',      n:aSim, color:'var(--amber)'},
          {label:'Rentabilidad baja',n:rSim, color:'var(--red)'}
        ], n, 'con costo')}
        <div class="hint" style="margin-top:14px">Hoy: ${rows.filter(r=>r.c.estado==='verde').length} OK ·
          ${rows.filter(r=>r.c.estado==='amarillo').length} advertencia ·
          ${rows.filter(r=>r.c.estado==='rojo').length} bajos.</div>
        </div></div>`;
  }

  return {
    F, calcAll, invalidar, nPendientes, noVinculados, selCat, sinDatos, sinPrefijoCat:sinPrefijoCategoria,
    resumen, productos, ficha, guardarFicha, guardarObs, simFicha, irProductos, simulador,
    teclaCelda, guardarCelda,
    setProd(k,v){
      F.prod[k]=v; F.prod.page=0;
      // Al cambiar un nivel superior, los de abajo dejan de tener sentido
      if(k==='cat'){ F.prod.modelo=''; F.prod.medidas=[]; F.prod.vars={}; }
      if(k==='modelo'){ F.prod.medidas=[]; F.prod.vars={}; }
      const foco = k==='q';
      Router.refresh();
      if(foco){ const i=document.querySelector('input[placeholder^="Buscar modelo"]');
        if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length);} } },
    toggleMulti(key, val){
      const arr = F.prod[key] = [...(F.prod[key]||[])];
      const i = arr.indexOf(val);
      if(i>=0) arr.splice(i,1); else arr.push(val);
      F.prod.page=0; Router.refresh(); },
    clearMulti(key){ F.prod[key]=[]; F.prod.menuCol=''; F.prod.page=0; Router.refresh(); },
    toggleMenuCol(k){ F.prod.menuCol = F.prod.menuCol===k?'':k; Router.refresh(); },
    toggleProdModelo(k){ F.prod.expM = {...(F.prod.expM||{})}; F.prod.expM[k]=!F.prod.expM[k]; Router.refresh(); },
    setVar(campo,val){
      F.prod.vars = {...F.prod.vars};
      if(val) F.prod.vars[campo]=val; else delete F.prod.vars[campo];
      F.prod.page=0; Router.refresh(); },
    sortProd(k){ if(F.prod.sort===k) F.prod.dir*=-1; else {F.prod.sort=k; F.prod.dir=-1;} Router.refresh(); },
    toggleProd(k){ F.prod[k] = !F.prod[k]; F.prod.page=0; Router.refresh(); },
    filtrarEstadoRojo(){ F.prod.estado = F.prod.estado==='rojo'?'':'rojo'; F.prod.page=0; Router.refresh(); },
    setRent(cat){ F.rent.cat = cat||''; Router.refresh(); window.scrollTo(0,0); },
    abrirMenuCol(k){ F.prod.menuCol = F.prod.menuCol===k?'':k; F.prod.menuQ=''; Router.refresh(); },
    cerrarMenuCol(){ F.prod.menuCol=''; F.prod.menuQ=''; F.prod.page=0; Router.refresh(); },
    menuColBuscar(v){ F.prod.menuQ=v; Router.refresh();
      const el=document.querySelector('.colmenu-q'); if(el){ el.focus(); el.setSelectionRange(el.value.length,el.value.length); } },
    limpiarProd(){ Object.assign(F.prod,{cat:'',modelo:'',estado:'',medidas:[],terms:[],vars:{},q:'',
      soloAumentar:false,incompletos:false,revisar:false,sinCosto:false,hoy:false,soloNoVinc:false,menuCol:'',menuQ:'',expM:{},page:0}); Router.refresh(); },
    pag(d){ F.prod.page+=d; Router.refresh(); window.scrollTo(0,0); },
    irPag(n){ F.prod.page=Math.max(0,n); Router.refresh(); window.scrollTo(0,0); },
    setSim(k,v){ F.sim[k]=parseFloat(v); Router.refresh(); },
    resetSim(){ F.sim={}; Router.refresh(); }
  };
})();
