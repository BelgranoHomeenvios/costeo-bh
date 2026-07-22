/* ============================================================
   CAPA 5 · VIEWS  (cada pantalla responde una pregunta de negocio)
   ============================================================ */
const Views = (() => {

  /* filtros persistentes entre navegaciones */
  const F = {
    prod:{cat:'', modelo:'', estado:'', medida:'', term:'', vars:{}, q:'',
          soloAumentar:false, incompletos:false, revisar:false,
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
    if(f.medida) rows = rows.filter(({p})=>(p.medida||'')===f.medida);
    if(f.term)   rows = rows.filter(({p})=>p.tier===f.term);
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
    if(f.revisar)      rows = rows.filter(({c})=>c.tieneCosto && (c.markup>Data.s.config.umbralSospecha || c.ganancia<0));
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
    const t = Calc.resumen(rows);
    const pag = rows.slice(f.page*f.per, (f.page+1)*f.per);
    const nPag = Math.ceil(rows.length/f.per);

    /* Resumen de arriba: reacciona a los 5 filtros universales (categoría,
       estado, medida, terminación, búsqueda), no a los botones de acción. */
    const alcance = alcanceProd();
    const alcCosteados = alcance.filter(({c})=>c.tieneCosto);
    const pctCosteado = alcance.length ? Math.round(alcCosteados.length/alcance.length*100) : 0;
    const margenProm = alcCosteados.length
      ? alcCosteados.reduce((s,{c})=>s+c.margen,0)/alcCosteados.length : 0;
    const rowsAum  = alcance.filter(({c})=>c.aumentoPct>0.001).length;
    const rowsInc  = alcance.filter(({c})=>!c.tieneCosto || !c.lista).length;
    const rowsRev  = alcance.filter(({c})=>c.tieneCosto && (c.markup>cfg.umbralSospecha || c.ganancia<0)).length;
    const nombreAlcance = f.cat ? Data.catNombre(f.cat) : 'todas las categorías';

    /* --- Opciones en cascada: cada filtro se calcula sobre lo que dejan pasar
       los anteriores, así nunca ofrece una combinación que no existe. --- */
    const enCat = Data.s.productos.filter(p=>!f.cat||p.categoriaId===f.cat);
    const enMod = enCat.filter(p=>!f.modelo||p.modelo===f.modelo);
    const medidas = [...new Set(enMod.map(p=>p.medida).filter(Boolean))].sort((a,b)=>medSort(a)-medSort(b));
    const enMed = enMod.filter(p=>!f.medida||(p.medida||'')===f.medida);

    /* Campos de variante presentes en el alcance actual, con sus valores reales */
    const varMap = {};
    enMed.forEach(p => Object.entries(p.variantes||{}).forEach(([k,v]) => {
      if(v==null || v==='') return;
      (varMap[k] = varMap[k] || new Set()).add(String(v));
    }));
    const varSel = Object.entries(varMap)
      .filter(([,vals]) => vals.size > 1)   // si hay un solo valor, filtrar no aporta
      .map(([k,vals]) => `<select class="inp" onchange="Views.setVar('${esc(k)}',this.value)">
          <option value="">${esc(k)}: todas</option>
          ${[...vals].sort((a,b)=>a.localeCompare(b)).map(v=>
            `<option value="${esc(v)}" ${(f.vars||{})[k]===v?'selected':''}>${esc(k)}: ${esc(v)}</option>`).join('')}
        </select>`).join('');

    const tbl = !pag.length ? UI.empty('Sin resultados','Probá cambiando los filtros.')
      : `<div class="tbl-wrap"><table class="tbl"><thead><tr>
        ${[['categoriaId','Categoría',0],['modelo','Modelo',0],['medida','Medida',0],
           ['estructura','Estructura',0],['variante2','Variante 2',0],
           ['costoFinal','Costo',1],['efectivo','P. efectivo',1],
           ['ganancia','Ganancia',1],['margen','Margen',1],['markup','Markup vs objetivo',1],
           ['aumentoPct','Aum. sugerido',1],['estado','Estado',0]]
          .map(([k,l,n])=>`<th class="${n?'num ':''}sortable ${k===f.sort?'sorted':''}"
            onclick="Views.sortProd('${k}')">${l}<span class="arr">${
            k===f.sort?(f.dir>0?'↑':'↓'):'↕'}</span></th>`).join('')}
      </tr></thead><tbody>${pag.map(({p,c})=>{
        const est = (p.variantes||{}).Estructura || '';
        const [clave2,val2] = Object.entries(p.variantes||{}).find(([k])=>k!=='Estructura') || ['',''];
        return `
        <tr class="clickable" onclick="Views.ficha('${p.id}')">
          <td class="t-sec">${esc(Data.catNombre(p.categoriaId))}</td>
          <td class="strong"><a href="#" onclick="event.stopPropagation();Views.setProd('modelo','${esc(p.modelo)}');return false"
            title="Filtrar por este modelo">${esc(p.modelo)}</a></td>
          <td class="t-sec">${esc(p.medida||'—')}</td>
          <td class="t-sec">${est?`<a href="#" onclick="event.stopPropagation();Views.setVar('Estructura','${esc(est)}');return false"
            title="Filtrar por esta estructura">${esc(est)}</a>`:'—'}</td>
          <td class="t-sec" style="font-size:11.5px">${val2?`<a href="#" onclick="event.stopPropagation();Views.setVar('${esc(clave2)}','${esc(val2)}');return false"
            title="Filtrar por ${esc(clave2)}: ${esc(val2)}">${esc(clave2)}: ${esc(val2)}</a>`:'—'}</td>
          <td class="num">${UI.cellEdit(p.id,'costo',c.costoFinal, c.baseDeTabla?'de tabla':'sin costo')}</td>
          <td class="num">${UI.cellEdit(p.id,'efectivo',c.efectivo,'sin precio')}</td>
          <td class="num ${c.ganancia<0?'t-red':''}">${c.tieneCosto?money(c.ganancia):'<span class="t-mut">—</span>'}</td>
          <td class="num ${c.tieneCosto&&c.margen<cfg.margenMinimo?'t-red':''}">${c.tieneCosto?pct1(c.margen):'<span class="t-mut">—</span>'}</td>
          <td class="num strong">${c.tieneCosto?mk(c.markup):'<span class="t-mut">—</span>'}</td>
          <td class="num ${c.aumentoPct>0.001?'t-red strong':'t-mut'}">${c.aumentoPct>0.001?pctS(c.aumentoPct):'—'}</td>
          <td>${UI.badge(c.estado)}</td>
        </tr>`;}).join('')}</tbody>
        <tfoot><tr>
          <td colspan="5">${rows.length.toLocaleString('es-AR')} productos filtrados</td>
          <td class="num">${money(t.costoProm)}</td>
          <td class="num">${money(t.precioProm*(1-cfg.descuento))}</td>
          <td class="num">${money(t.gananciaTotal)}</td>
          <td class="num">${pct1(t.margenProm)}</td>
          <td class="num">${mk(t.markupProm)}</td>
          <td class="num">${t.paraAumentar} a subir</td><td></td>
        </tr></tfoot></table></div>`;

    return `
      <div class="page-head">
        <div><h2>Productos</h2><div class="sub">${rows.length.toLocaleString('es-AR')} de ${Data.s.productos.length.toLocaleString('es-AR')} productos · clic en una fila para ver la ficha</div></div>
        <div class="spacer"></div>
        <span class="edit-hint">${Icon('check')} Costo y precio se editan en la tabla</span>
        <button class="btn" onclick="Views.exportarCSV()">${Icon('dl')} Exportar CSV</button>
      </div>
      <div class="card mb"><div class="card-body" style="padding:14px 16px">
        <div class="filters" style="margin-bottom:14px">
          ${selCat('fpCat', f.cat, 'onchange="Views.setProd(\'cat\',this.value)"')}
          <select class="inp" onchange="Views.setProd('estado',this.value)">
            <option value="">Todos los estados</option>
            ${Object.entries(ESTADO).map(([k,v])=>`<option value="${k}" ${f.estado===k?'selected':''}>${v.lbl}</option>`).join('')}
          </select>
          <select class="inp" onchange="Views.setProd('medida',this.value)">
            <option value="">Todas las medidas</option>
            ${medidas.map(m=>`<option value="${esc(m)}" ${f.medida===m?'selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <select class="inp" onchange="Views.setProd('term',this.value)">
            <option value="">Todas las terminaciones</option>
            ${TIERS.map(tr=>`<option value="${tr.id}" ${f.term===tr.id?'selected':''}>${esc(tr.label)}</option>`).join('')}
          </select>
          <input class="inp" style="flex:1;min-width:180px" placeholder="Buscar producto…"
            value="${esc(f.q)}" oninput="Views.setProd('q',this.value)">
          <select class="inp" onchange="Views.setProd('per',+this.value)" title="Filas por página">
            ${[50,100,200,500,1000].map(n=>`<option value="${n}" ${f.per===n?'selected':''}>${n} por página</option>`).join('')}
          </select>
          ${(f.cat||f.modelo||f.estado||f.medida||f.term||f.q||f.soloAumentar||f.incompletos
             ||f.revisar||Object.keys(f.vars||{}).length)
            ?`<button class="btn btn-sm btn-ghost" onclick="Views.limpiarProd()">Limpiar filtros</button>`:''}
        </div>
        ${f.cat && varSel ? `<div class="filters" style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line2)">
          <span class="hint" style="align-self:center">Atributos de ${esc((Data.cat(f.cat)||{}).nombre||'')}:</span>
          ${varSel}
        </div>` : ''}
        <div class="hint" style="margin-bottom:6px">Estado general — ${esc(nombreAlcance)}</div>
        <div class="filters" style="margin-bottom:14px">
          <div class="card" style="flex:1;min-width:150px;padding:11px 14px">
            <div class="hint">Productos cargados</div>
            <div style="font-size:19px;font-weight:700">${alcance.length.toLocaleString('es-AR')}</div>
          </div>
          <div class="card" style="flex:1;min-width:150px;padding:11px 14px">
            <div class="hint">% costeado</div>
            <div style="font-size:19px;font-weight:700">${pctCosteado}%</div>
          </div>
          <div class="card" style="flex:1;min-width:150px;padding:11px 14px">
            <div class="hint">Margen promedio</div>
            <div style="font-size:19px;font-weight:700">${pct1(margenProm)}</div>
          </div>
        </div>
        <div class="hint" style="margin-bottom:6px">Necesita tu atención en ${esc(nombreAlcance)} — clic para filtrar</div>
        <div class="filters">
          ${[['soloAumentar','Requieren aumentar', rowsAum],
             ['incompletos','Incompletos', rowsInc],
             ['revisar','Por revisar', rowsRev]]
            .map(([k,l,n])=>`<button class="btn btn-sm ${f[k]?'btn-blue':''}"
              onclick="Views.toggleProd('${k}')">${esc(l)}
              <span style="opacity:.75">${n.toLocaleString('es-AR')}</span></button>`).join('')}
        </div>
      </div></div>
      <div class="card">${tbl}
        ${nPag>1?`<div class="pag">
          <span class="t-sec">Mostrando <b>${(f.page*f.per+1).toLocaleString('es-AR')}–${
            Math.min((f.page+1)*f.per, rows.length).toLocaleString('es-AR')}</b>
            de ${rows.length.toLocaleString('es-AR')}</span>
          <div class="spacer"></div>
          <button class="btn btn-sm" ${f.page===0?'disabled':''} onclick="Views.irPag(0)">« Primera</button>
          <button class="btn btn-sm" ${f.page===0?'disabled':''} onclick="Views.pag(-1)">← Anterior</button>
          <select class="inp" style="padding:5px 24px 5px 9px;font-size:11.5px"
            onchange="Views.irPag(+this.value)">
            ${Array.from({length:nPag},(_,i)=>`<option value="${i}" ${i===f.page?'selected':''}>Página ${i+1} de ${nPag}</option>`).join('')}
          </select>
          <button class="btn btn-sm" ${f.page>=nPag-1?'disabled':''} onclick="Views.pag(1)">Siguiente →</button>
          <button class="btn btn-sm" ${f.page>=nPag-1?'disabled':''} onclick="Views.irPag(${nPag-1})">Última »</button>
        </div>`:''}
      </div>`;
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

      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:15px">
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
        <div class="card"><div class="card-head"><h3>Datos generales</h3></div>
          <div class="card-body"><dl class="kv">
            <dt>Categoría</dt><dd>${esc(cat.nombre||p.categoriaId)}</dd>
            <dt>Modelo</dt><dd>${esc(p.modelo)}</dd>
            <dt>Medida comercial</dt><dd>${esc(p.medida||'—')}</dd>
            <dt>Medida de costeo</dt><dd>${esc(p.medidaCosteo||'—')}</dd>
            <dt>Terminación</dt><dd>${esc(term)}</dd>
            ${Object.entries(p.variantes||{}).map(([k,v])=>
              `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
          </dl></div></div>
        <div class="card"><div class="card-head"><h3>Composición del costo</h3></div>
          <div class="card-body"><dl class="kv">
            <dt>Costo base ${c.baseDeTabla?'(tabla)':'(manual)'}</dt><dd>${money(c.base)}</dd>
            <dt>Adicionales %</dt><dd>${c.adicPct?pct1(c.adicPct):'—'}</dd>
            <dt>Adicionales fijos</dt><dd>${c.adicFijo?money(c.adicFijo):'—'}</dd>
            <dt>Ajuste manual</dt><dd>${p.ajusteManual?money(p.ajusteManual):'—'}</dd>
            <dt style="border-top:1px solid var(--line);padding-top:7px">Costo final</dt>
            <dd style="border-top:1px solid var(--line);padding-top:7px">${money(c.costoFinal)}</dd>
          </dl></div></div>
      </div>

      <div class="card mb"><div class="card-head"><h3>Rentabilidad y precio recomendado</h3>
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

      <div class="card mb"><div class="card-head"><h3>Ajuste rápido</h3></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:11px;align-items:end">
            <div><label class="inp-lbl">Costo manual (pisa la tabla)</label>
              <input class="inp" type="number" id="fCosto" style="width:100%" value="${p.costoManual||''}" placeholder="${Math.round(c.base)||'0'}"></div>
            <div><label class="inp-lbl">Precio de lista</label>
              <input class="inp" type="number" id="fPrecio" style="width:100%" value="${p.precioLista||''}"></div>
            <button class="btn btn-blue" onclick="Views.guardarFicha('${p.id}')">Guardar</button>
          </div>
          <div class="hint" style="margin-top:9px">Los cambios quedan registrados en el Historial.</div>
        </div>
      </div>

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

      <div class="card mb"><div class="card-head"><h3>Historial de este producto</h3></div>
        ${hist.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th style="width:150px">Fecha / hora</th><th style="width:160px">Tipo</th><th>Cambio</th>
        </tr></thead><tbody>${hist.map(e=>`<tr>
          <td class="t-sec">${fecha(e.fecha)}</td>
          <td><span class="badge b-blue"><span class="dot"></span>${esc(e.tipo)}</span></td>
          <td class="t-sec">${esc(e.detalle)}</td></tr>`).join('')}</tbody></table></div>`
        :`<div class="card-body"><div class="hint">Todavía no hubo cambios sobre este producto.</div></div>`}
      </div>

      ${similares.length?`<div class="card"><div class="card-head"><h3>Otras variantes de este modelo</h3></div>
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
          </tr>`).join('')}</tbody></table></div></div>`:''}`;

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
    const nc = parseFloat(document.getElementById('fCosto').value)||0;
    const np = parseFloat(document.getElementById('fPrecio').value)||0;
    const cambios = [];
    if(nc !== (Number(p.costoManual)||0)){
      cambios.push(`costo ${money(p.costoManual||0)} → ${money(nc)}`); p.costoManual = nc; }
    if(np !== (Number(p.precioLista)||0)){
      cambios.push(`precio ${money(p.precioLista||0)} → ${money(np)}`); p.precioLista = np; }
    if(!cambios.length){ UI.toast('No hubo cambios'); return; }
    Data.saveProducto(p);
    Data.log('Edición manual', `${p.modelo} ${p.medida||''}`, cambios.join(' · '), p.id);
    invalidar(); UI.closeAll(); Router.refresh();
    UI.toast('Producto actualizado', 'ok');
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
    F, calcAll, invalidar, nPendientes, selCat, sinDatos,
    resumen, productos, ficha, guardarFicha, guardarObs, simFicha, irProductos, simulador,
    teclaCelda, guardarCelda,
    setProd(k,v){
      F.prod[k]=v; F.prod.page=0;
      // Al cambiar un nivel superior, los de abajo dejan de tener sentido
      if(k==='cat'){ F.prod.modelo=''; F.prod.medida=''; F.prod.vars={}; }
      if(k==='modelo'){ F.prod.medida=''; F.prod.vars={}; }
      const foco = k==='q';
      Router.refresh();
      if(foco){ const i=document.querySelector('input[placeholder^="Buscar modelo"]');
        if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length);} } },
    setVar(campo,val){
      F.prod.vars = {...F.prod.vars};
      if(val) F.prod.vars[campo]=val; else delete F.prod.vars[campo];
      F.prod.page=0; Router.refresh(); },
    sortProd(k){ if(F.prod.sort===k) F.prod.dir*=-1; else {F.prod.sort=k; F.prod.dir=-1;} Router.refresh(); },
    toggleProd(k){ F.prod[k] = !F.prod[k]; F.prod.page=0; Router.refresh(); },
    limpiarProd(){ Object.assign(F.prod,{cat:'',modelo:'',estado:'',medida:'',term:'',vars:{},q:'',
      soloAumentar:false,incompletos:false,revisar:false,page:0}); Router.refresh(); },
    pag(d){ F.prod.page+=d; Router.refresh(); window.scrollTo(0,0); },
    irPag(n){ F.prod.page=Math.max(0,n); Router.refresh(); window.scrollTo(0,0); },
    setSim(k,v){ F.sim[k]=parseFloat(v); Router.refresh(); },
    resetSim(){ F.sim={}; Router.refresh(); }
  };
})();
