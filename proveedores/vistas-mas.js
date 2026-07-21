/* ============================================================
   VIEWS (continuación) — se acopla al mismo módulo
   ============================================================ */
Object.assign(Views, {

  /* ============================================================
     5 · RENTABILIDAD — ¿Qué familia necesita revisión?
     ============================================================ */
  rentabilidad(){
    if(!Data.s.productos.length) return Views.sinDatos();
    const cfg = Data.s.config;
    const rows = Views.calcAll();
    const conCosto = rows.filter(r=>r.c.tieneCosto);

    const porCat = {};
    rows.forEach(({p,c}) => {
      const o = porCat[p.categoriaId] = porCat[p.categoriaId] ||
        {n:0, cn:0, mg:0, mkp:0, gan:0, aum:0, rojo:0};
      o.n++;
      if(c.tieneCosto){ o.cn++; o.mg+=c.margen; o.mkp+=c.markup; o.gan+=c.ganancia;
        if(c.aumentoPct>0.001) o.aum++; if(c.estado==='rojo') o.rojo++; }
    });
    const cats = Object.entries(porCat).map(([id,o])=>({
      id, nombre:Data.catNombre(id), ...o,
      mgProm:o.cn?o.mg/o.cn:0, mkpProm:o.cn?o.mkp/o.cn:0, cob:o.n?o.cn/o.n:0
    })).sort((a,b)=>a.mkpProm-b.mkpProm);

    const top = [...conCosto].sort((a,b)=>b.c.ganancia-a.c.ganancia).slice(0,10);
    const bot = [...conCosto].sort((a,b)=>a.c.ganancia-b.c.ganancia).slice(0,10);
    const sub = [...conCosto].filter(r=>r.c.aumentoPct>0.001)
      .sort((a,b)=>b.c.aumentoPct-a.c.aumentoPct).slice(0,10);

    const mini = (titulo, lista, campo, fmt, cls, nota) => `
      <div class="card"><div class="card-head"><h3>${titulo}</h3>
        <div class="spacer"></div><span class="hint">${nota||''}</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Modelo</th><th>Categoría</th><th class="num">${campo==='ganancia'?'Ganancia':'Aumento'}</th>
          <th class="num">Markup</th></tr></thead>
        <tbody>${lista.map(({p,c})=>`<tr class="clickable" onclick="Views.ficha('${p.id}')">
          <td class="strong">${esc(p.modelo)}<div class="hint">${esc(p.medida||'')}</div></td>
          <td class="t-sec">${esc(Data.catNombre(p.categoriaId))}</td>
          <td class="num strong ${cls}">${fmt(c[campo])}</td>
          <td class="num">${mk(c.markup)}</td></tr>`).join('')}
        </tbody></table></div></div>`;

    return `
      <div class="page-head">
        <div><h2>Análisis de rentabilidad</h2>
          <div class="sub">Dónde está la utilidad y qué familia necesita revisión</div></div>
      </div>

      <div class="card mb"><div class="card-head"><h3>Ranking de categorías</h3>
        <div class="spacer"></div><span class="hint">ordenado por markup promedio (peor primero)</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Categoría</th><th class="num">Productos</th><th class="num">Cobertura</th>
          <th class="num">Markup prom.</th><th class="num">Margen prom.</th>
          <th class="num">Ganancia total</th><th class="num">Bajo objetivo</th><th class="num">En rojo</th>
        </tr></thead><tbody>${cats.map(r=>`
          <tr class="clickable" onclick="Views.irProductos({cat:'${r.id}'})">
            <td class="strong">${esc(r.nombre)}</td>
            <td class="num">${r.n.toLocaleString('es-AR')}</td>
            <td class="num"><div style="display:flex;align-items:center;gap:7px;justify-content:flex-end">
              <span class="${r.cob<0.5?'t-red':r.cob<0.9?'t-amber':'t-green'}">${(r.cob*100).toFixed(0)}%</span>
              ${UI.pbar(r.cob, r.cob<0.5?'var(--red)':r.cob<0.9?'var(--amber)':'var(--green)')}</div></td>
            <td class="num strong ${r.mkpProm<cfg.umbralAmarillo?'t-red':r.mkpProm<cfg.umbralVerde?'t-amber':'t-green'}">${mk(r.mkpProm)}</td>
            <td class="num ${r.mgProm<cfg.margenMinimo?'t-red':''}">${pct1(r.mgProm)}</td>
            <td class="num">${money(r.gan)}</td>
            <td class="num">${r.aum||'<span class="t-mut">—</span>'}</td>
            <td class="num">${r.rojo?`<span class="badge b-red"><span class="dot"></span>${r.rojo}</span>`:'<span class="t-mut">—</span>'}</td>
          </tr>`).join('')}</tbody></table></div></div>

      <div class="g2 mb">
        ${mini('Mayor utilidad por unidad', top, 'ganancia', money, 't-green', 'top 10')}
        ${mini('Menor utilidad por unidad', bot, 'ganancia', money, 't-red', 'top 10')}
      </div>
      ${mini('Los que más necesitan aumento', sub, 'aumentoPct', pctS, 't-red', 'top 10 por % de aumento sugerido')}`;
  },

  /* ============================================================
     6 · ACTUALIZACIÓN DE COSTOS — masiva, con vista previa
     ============================================================ */
  costos(){
    if(!Data.s.productos.length) return Views.sinDatos();
    return `
      <div class="page-head">
        <div><h2>Actualización de costos</h2>
          <div class="sub">Aplicá aumentos por categoría con vista previa antes de guardar</div></div>
      </div>
      <div class="g2-13">
        <div class="card"><div class="card-head"><h3>Aplicar cambio</h3></div>
          <div class="card-body">
            <label class="inp-lbl">Alcance</label>
            ${Views.selCat('acCat','','onchange="Views.previewCostos()"')}
            <div style="height:12px"></div>
            <label class="inp-lbl">Tipo de cambio</label>
            <select class="inp" id="acTipo" style="width:100%" onchange="Views.previewCostos()">
              <option value="pct">Porcentaje sobre el costo</option>
              <option value="fijo">Monto fijo por producto</option>
              <option value="precio">Porcentaje sobre el precio de lista</option>
            </select>
            <div style="height:12px"></div>
            <label class="inp-lbl">Valor</label>
            <input class="inp" id="acVal" type="number" step="0.1" value="10" style="width:100%"
              oninput="Views.previewCostos()">
            <div class="hint" style="margin-top:5px">Para porcentajes usá el número (10 = 10%). Podés poner negativos.</div>
            <div style="height:16px"></div>
            <button class="btn btn-blue" style="width:100%" onclick="Views.aplicarCostos()">
              ${Icon('check')} Aplicar cambio</button>
            <div class="hint" style="margin-top:9px">Se pide confirmación y queda registrado en el Historial.</div>
          </div></div>
        <div class="card"><div class="card-head"><h3>Vista previa</h3>
          <div class="spacer"></div><span class="hint" id="acN"></span></div>
          <div id="acPrev"></div></div>
      </div>`;
  },
  costos_after(){ Views.previewCostos(); },

  previewCostos(){
    const cat = (document.getElementById('acCat')||{}).value || '';
    const tipo = (document.getElementById('acTipo')||{}).value || 'pct';
    const val = parseFloat((document.getElementById('acVal')||{}).value)||0;
    const objetivo = Data.s.productos.filter(p=>!cat||p.categoriaId===cat);
    const muestra = objetivo.slice(0, Views.F.prevN||150);

    const filas = muestra.map(p => {
      const c = Calc.producto(p);
      let costo2 = c.costoFinal, lista2 = c.lista;
      if(tipo==='pct')   costo2 = c.costoFinal*(1+val/100);
      if(tipo==='fijo')  costo2 = c.costoFinal + val;
      if(tipo==='precio')lista2 = c.lista*(1+val/100);
      const efec2 = lista2*(1-Data.s.config.descuento);
      const mk2 = costo2>0?efec2/costo2:0;
      return `<tr><td class="strong">${esc(p.modelo)}<div class="hint">${esc(p.medida||'')}</div></td>
        <td class="num">${UI.cellEdit(p.id,'costo',c.costoFinal,'sin costo')}</td>
        <td class="num strong">${costo2>0?money(costo2):'—'}</td>
        <td class="num t-mut">${mk(c.markup)}</td>
        <td class="num strong ${mk2<c.markup?'t-red':mk2>c.markup?'t-green':''}">${mk(mk2)}</td></tr>`;
    }).join('');

    const n = document.getElementById('acN');
    if(n) n.textContent = `${objetivo.length.toLocaleString('es-AR')} productos afectados` +
      (objetivo.length>(Views.F.prevN||150)?` · mostrando ${Views.F.prevN||150}`:'');
    const box = document.getElementById('acPrev');
    if(box) box.innerHTML = !objetivo.length
      ? UI.empty('Sin productos','No hay productos en ese alcance.')
      : `<div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Producto</th><th class="num">Costo actual (editable)</th><th class="num">Costo nuevo</th>
          <th class="num">Markup actual</th><th class="num">Markup nuevo</th>
        </tr></thead><tbody>${filas}</tbody></table></div>`;
  },

  aplicarCostos(){
    const cat = (document.getElementById('acCat')||{}).value || '';
    const tipo = (document.getElementById('acTipo')||{}).value || 'pct';
    const val = parseFloat((document.getElementById('acVal')||{}).value)||0;
    if(!val){ UI.toast('Poné un valor distinto de cero','err'); return; }
    const objetivo = Data.s.productos.filter(p=>!cat||p.categoriaId===cat);
    const alcance = cat? Data.catNombre(cat) : 'Todo el catálogo';
    const desc = tipo==='pct'? `${val>0?'+':''}${val}% sobre el costo`
      : tipo==='fijo'? `${val>0?'+':''}${money(val)} por producto`
      : `${val>0?'+':''}${val}% sobre el precio de lista`;

    UI.confirm('Confirmar actualización masiva',
      `Vas a aplicar <b>${desc}</b> a <b>${objetivo.length.toLocaleString('es-AR')} productos</b>
       de <b>${esc(alcance)}</b>.<br><br>Esta acción modifica los datos reales y queda registrada
       en el Historial. ¿Confirmás?`,
      () => {
        objetivo.forEach(p => {
          const c = Calc.producto(p);
          if(tipo==='precio'){ p.precioLista = Math.round((Number(p.precioLista)||0)*(1+val/100)); }
          else {
            const base = c.costoFinal;
            if(base>0) p.costoManual = Math.round(tipo==='pct'? base*(1+val/100) : base+val);
          }
        });
        UI.toast(`Guardando ${objetivo.length} productos…`);
        Data.saveProductos(objetivo).then(ok => {
          Data.log('Actualización masiva', alcance, `${desc} · ${objetivo.length} productos`);
          Views.invalidar(); Router.refresh();
          if(ok) UI.toast(`${objetivo.length} productos actualizados`, 'ok');
        });
      }, 'Aplicar cambio');
  },

  /* ============================================================
     7 · CATEGORÍAS Y REGLAS
     ============================================================ */
  categorias(){
    const cfg = Data.s.config;
    const usadas = new Set(Data.s.productos.map(p=>p.categoriaId));
    const cats = Data.s.categorias.filter(c=>usadas.has(c.id))
      .sort((a,b)=>a.nombre.localeCompare(b.nombre));

    return `
      <div class="page-head">
        <div><h2>Categorías y reglas</h2>
          <div class="sub">Objetivos de markup y tabla de costos por familia</div></div>
      </div>
      <div class="info-box mb">Cada categoría puede tener su propio markup objetivo. Los valores
        generales se definen en <b>Configuración</b> y se usan cuando la categoría no define uno propio.</div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>Categoría</th><th class="num">Productos</th><th class="num">Filas en tabla de costos</th>
        <th class="num">Markup obj. (negro)</th><th class="num">Markup obj. (resto)</th><th></th>
      </tr></thead><tbody>${cats.map(c => {
        const nP = Data.s.productos.filter(p=>p.categoriaId===c.id).length;
        const nCB = Data.s.costosBase.filter(x=>x.categoriaId===c.id).length;
        return `<tr>
          <td class="strong">${esc(c.nombre)}</td>
          <td class="num">${nP.toLocaleString('es-AR')}</td>
          <td class="num ${nCB?'':'t-red strong'}">${nCB||'sin tabla'}</td>
          <td class="num">${(c.targetNegro||cfg.targetNegro).toFixed(2).replace('.',',')}</td>
          <td class="num">${(c.targetOtro||cfg.targetOtro).toFixed(2).replace('.',',')}</td>
          <td class="num"><button class="btn btn-sm" onclick="Views.tablaCostos('${c.id}')">Ver tabla de costos</button></td>
        </tr>`; }).join('')}</tbody></table></div></div>`;
  },

  tablaCostos(catId){
    const cat = Data.cat(catId)||{};
    const filas = Data.s.costosBase.filter(x=>x.categoriaId===catId);
    const medidas = [...new Set(filas.map(f=>f.medida))].sort((a,b)=>medSort(a)-medSort(b));
    const get = (m,t) => (filas.find(f=>f.medida===m&&f.tier===t)||{}).costo || 0;

    /* medidas que usan los productos pero no están en la tabla */
    const usadas = [...new Set(Data.s.productos.filter(p=>p.categoriaId===catId)
      .map(p=>p.medidaCosteo).filter(Boolean))];
    const faltan = usadas.filter(m=>!medidas.includes(m)).sort((a,b)=>medSort(a)-medSort(b));

    const html = `
      ${faltan.length?`<div class="warn-box mb"><b>${faltan.length} medidas sin costo en la tabla.</b>
        Los productos con estas medidas quedan sin costear:<br>
        <span style="font-size:11.5px">${faltan.map(esc).join(' · ')}</span></div>`:''}
      ${!medidas.length?UI.empty('Sin tabla de costos','Esta categoría todavía no tiene costos base cargados.')
      :`<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>Medida</th>${TIERS.map(t=>`<th class="num">${esc(t.label)}</th>`).join('')}
      </tr></thead><tbody>${medidas.map(m=>`<tr>
        <td class="strong">${esc(m)}</td>
        ${TIERS.map(t=>{const v=get(m,t.id);
          return `<td class="num ${v?'':'t-mut'}">${v?money(v):'—'}</td>`;}).join('')}
      </tr>`).join('')}</tbody></table></div></div>`}`;

    UI.drawer(`Tabla de costos · ${esc(cat.nombre||catId)}`,
      `${medidas.length} medidas cargadas${faltan.length?` · ${faltan.length} faltantes`:''}`, html);
  },

  /* ============================================================
     8 · PENDIENTES — ¿Qué falta revisar?
     ============================================================ */
  pendientes(){
    const rows = Views.calcAll();
    const sinCosto = rows.filter(r=>!r.c.tieneCosto);
    const sinPrecio = rows.filter(r=>r.c.tieneCosto && !r.c.lista);
    const negativos = rows.filter(r=>r.c.tieneCosto && r.c.ganancia<0);
    const sosp = rows.filter(r=>r.c.tieneCosto && r.c.markup > Data.s.config.umbralSospecha)
      .sort((a,b)=>b.c.markup-a.c.markup);
    const f = Views.F.pend;

    /* agrupar sin costo por categoría + medida faltante */
    const porCat = {};
    sinCosto.forEach(({p}) => {
      const k = p.categoriaId;
      porCat[k] = porCat[k] || {n:0, medidas:new Set()};
      porCat[k].n++;
      if(p.medidaCosteo) porCat[k].medidas.add(p.medidaCosteo);
    });
    const grupos = Object.entries(porCat).map(([id,o])=>({
      id, nombre:Data.catNombre(id), n:o.n, medidas:[...o.medidas].sort((a,b)=>medSort(a)-medSort(b))
    })).sort((a,b)=>b.n-a.n);

    return `
      <div class="page-head">
        <div><h2>Pendientes</h2>
          <div class="sub">Todo lo que falta completar para tener el catálogo bajo control</div></div>
      </div>
      <div class="kpi-grid">
        ${UI.kpi({label:'Sin costo', value:sinCosto.length.toLocaleString('es-AR'),
          sub:'no se puede calcular rentabilidad', subColor:'var(--red)',
          icon:'x', bg:'var(--red-l)', color:'var(--red)'})}
        ${UI.kpi({label:'Sin precio de lista', value:sinPrecio.length.toLocaleString('es-AR'),
          sub:'tienen costo pero no precio', subColor:'var(--amber)',
          icon:'warn', bg:'var(--amber-l)', color:'var(--amber)'})}
        ${UI.kpi({label:'Ganancia negativa', value:negativos.length.toLocaleString('es-AR'),
          sub:'se venden por debajo del costo', subColor:'var(--red)',
          icon:'trend', bg:'var(--red-l)', color:'var(--red)'})}
        ${UI.kpi({label:'Markup sospechoso', value:sosp.length.toLocaleString('es-AR'),
          sub:`sobre ${Data.s.config.umbralSospecha.toFixed(1).replace('.',',')}x · revisar`, subColor:'var(--amber)',
          icon:'warn', bg:'var(--amber-l)', color:'var(--amber)'})}
        ${UI.kpi({label:'Fuera del catálogo costeado', value:Data.s.sinCosto.length.toLocaleString('es-AR'),
          sub:'productos de Tienda Nube sin vincular', icon:'empty', bg:'var(--gray-l)', color:'var(--sec)'})}
      </div>



      <div class="card mb"><div class="card-head"><h3>Qué falta, por categoría</h3>
        <div class="spacer"></div><span class="hint">las medidas listadas son las que faltan en la tabla de costos</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Categoría</th><th class="num">Sin costo</th><th>Medidas faltantes</th><th></th>
        </tr></thead><tbody>${grupos.length?grupos.map(g=>`<tr>
          <td class="strong">${esc(g.nombre)}</td>
          <td class="num"><span class="badge b-red"><span class="dot"></span>${g.n}</span></td>
          <td style="font-size:11.5px" class="t-sec">${g.medidas.slice(0,10).map(esc).join(' · ')}${
            g.medidas.length>10?` <span class="t-mut">+${g.medidas.length-10} más</span>`:''}</td>
          <td class="num"><button class="btn btn-sm" onclick="Views.tablaCostos('${g.id}')">Ver tabla</button></td>
        </tr>`).join(''):`<tr><td colspan="4">${UI.empty('Nada pendiente','Todos los productos tienen costo.')}</td></tr>`}
        </tbody></table></div></div>

      ${sosp.length?`<div class="card mb"><div class="card-head">
        <h3>Markup sospechosamente alto — revisar dato</h3><div class="spacer"></div>
        <span class="hint">precio mal cargado o costo desactualizado</span></div>
        <div class="card-body" style="padding-bottom:0"><div class="warn-box">
          Un markup muy por encima del objetivo casi nunca es rentabilidad real: suele ser un
          <b>precio de lista mal cargado</b> en Tienda Nube, un <b>costo desactualizado</b>, o un
          <b>producto compuesto</b> cuyo costo solo cubre una parte. Mientras no se revisen, estos
          números inflan el margen promedio del catálogo.</div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Modelo</th><th>Categoría</th><th class="num">Costo</th>
          <th class="num">P. lista</th><th class="num">Markup</th>
        </tr></thead><tbody>${sosp.slice(0,25).map(({p,c})=>`
          <tr class="clickable" onclick="Views.ficha('${p.id}')">
            <td class="strong">${esc(p.modelo)}<div class="hint">${esc(p.medida||'')}</div></td>
            <td class="t-sec">${esc(Data.catNombre(p.categoriaId))}</td>
            <td class="num">${money(c.costoFinal)}</td>
            <td class="num">${money(c.lista)}</td>
            <td class="num t-amber strong">${mk(c.markup)}</td>
          </tr>`).join('')}</tbody></table></div>
        ${sosp.length>25?`<div class="pag"><span class="t-sec">Mostrando 25 de ${sosp.length}</span></div>`:''}
      </div>`:''}

      ${negativos.length?`<div class="card"><div class="card-head">
        <h3>Productos con ganancia negativa</h3><div class="spacer"></div>
        <span class="hint">revisar con prioridad — se venden por debajo del costo</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Modelo</th><th>Categoría</th><th class="num">Costo</th>
          <th class="num">P. efectivo</th><th class="num">Pérdida</th><th class="num">Aumento nec.</th>
        </tr></thead><tbody>${negativos.slice(0,25).map(({p,c})=>`
          <tr class="clickable" onclick="Views.ficha('${p.id}')">
            <td class="strong">${esc(p.modelo)}<div class="hint">${esc(p.medida||'')}</div></td>
            <td class="t-sec">${esc(Data.catNombre(p.categoriaId))}</td>
            <td class="num">${money(c.costoFinal)}</td>
            <td class="num">${money(c.efectivo)}</td>
            <td class="num t-red strong">${money(c.ganancia)}</td>
            <td class="num t-red strong">${pctS(c.aumentoPct)}</td>
          </tr>`).join('')}</tbody></table></div></div>`:''}`;
  },

  /* ============================================================
     9 · HISTORIAL
     ============================================================ */
  historial(){
    const h = Data.s.historial;
    return `
      <div class="page-head">
        <div><h2>Historial</h2><div class="sub">Registro de cambios sobre costos, precios y configuración</div></div>
        <div class="spacer"></div>
        ${h.length?`<button class="btn" onclick="Views.limpiarHist()">Vaciar historial</button>`:''}
      </div>
      <div class="card">${!h.length
        ? UI.empty('Sin movimientos','Los cambios que hagas van a quedar registrados acá.')
        : `<div class="tbl-wrap"><table class="tbl"><thead><tr>
            <th style="width:150px">Fecha / hora</th><th style="width:170px">Tipo</th>
            <th>Objetivo</th><th>Detalle</th>
          </tr></thead><tbody>${h.map(e=>`<tr>
            <td class="t-sec">${fecha(e.fecha)}</td>
            <td><span class="badge b-blue"><span class="dot"></span>${esc(e.tipo)}</span></td>
            <td class="strong">${esc(e.objetivo)}</td>
            <td class="t-sec">${esc(e.detalle)}</td>
          </tr>`).join('')}</tbody></table></div>`}</div>`;
  },
  limpiarHist(){
    UI.confirm('Vaciar historial','Se van a borrar todos los registros de cambios. ¿Confirmás?',
      async ()=>{ await Supa.rent.from('historial').delete().neq('id',0);
        Data.s.historial=[]; Router.refresh(); UI.toast('Historial vaciado','ok'); },'Vaciar');
  },

  /* ============================================================
     10 · CONFIGURACIÓN
     ============================================================ */
  config(){
    const c = Data.s.config;
    const campo = (k,lbl,hint,step,suf) => `
      <div><label class="inp-lbl">${lbl}</label>
        <div style="display:flex;align-items:center;gap:7px">
          <input class="inp" type="number" step="${step}" id="cfg_${k}" value="${c[k]}" style="width:120px">
          <span class="t-sec">${suf||''}</span></div>
        <div class="hint" style="margin-top:4px">${hint}</div></div>`;

    return `
      <div class="page-head">
        <div><h2>Configuración</h2><div class="sub">Reglas generales de cálculo del catálogo</div></div>
      </div>
      <div class="warn-box mb">Cambiar estos valores <b>recalcula todo el catálogo</b>.
        No modifica costos ni precios guardados, solo cómo se evalúan.</div>
      <div class="card mb"><div class="card-head"><h3>Precios y objetivos</h3></div>
        <div class="card-body"><div class="g3" style="gap:20px">
          ${campo('descuento','Descuento habitual','Promo que aplicás sobre el precio de lista. 0,35 = 35%.','0.01')}
          ${campo('targetNegro','Markup objetivo (con negro)','Productos que llevan alguna terminación negra.','0.01')}
          ${campo('targetOtro','Markup objetivo (resto)','Todos los demás productos.','0.01')}
          ${campo('umbralVerde','Umbral verde','Markup desde el cual la rentabilidad es OK.','0.01')}
          ${campo('umbralAmarillo','Umbral amarillo','Markup desde el cual es advertencia.','0.01')}
          ${campo('margenMinimo','Margen mínimo','Margen por debajo del cual se marca alerta. 0,45 = 45%.','0.01')}
          ${campo('redondeo','Redondeo del precio sugerido','El precio recomendado se redondea hacia arriba a este múltiplo.','100','$')}
        </div>
        <div style="margin-top:20px;display:flex;gap:9px">
          <button class="btn btn-blue" onclick="Views.guardarCfg()">${Icon('check')} Guardar configuración</button>
          <button class="btn" onclick="Views.resetCfg()">Restaurar valores por defecto</button>
        </div></div></div>`;
  },
  guardarCfg(){
    const c = Data.s.config, antes = {...c}, cambios = [];
    Object.keys(Data.CFG_DEF).forEach(k => {
      const el = document.getElementById('cfg_'+k); if(!el) return;
      const v = parseFloat(el.value);
      if(!isNaN(v) && v !== antes[k]){ cambios.push(`${k}: ${antes[k]} → ${v}`); c[k] = v; }
    });
    if(!cambios.length){ UI.toast('No hubo cambios'); return; }
    Data.saveCfg(); Data.log('Configuración','Reglas generales', cambios.join(' · '));
    Views.invalidar(); Router.refresh(); UI.toast('Configuración guardada','ok');
  },
  resetCfg(){
    UI.confirm('Restaurar configuración','Se vuelven a los valores por defecto. ¿Confirmás?',
      ()=>{ Data.s.config = {...Data.CFG_DEF}; Data.saveCfg();
        Data.log('Configuración','Reglas generales','restaurado a valores por defecto');
        Views.invalidar(); Router.refresh(); UI.toast('Configuración restaurada','ok'); },'Restaurar');
  },

  /* ============================================================
     11 · IMPORTAR / EXPORTAR
     ============================================================ */
  importar(){
    return `
      <div class="page-head">
        <div><h2>Importar / Exportar</h2><div class="sub">Carga de catálogos y respaldo de datos</div></div>
      </div>
      <div class="info-box mb">Al importar un catálogo, las categorías que trae el archivo
        <b>se reemplazan</b> (no se duplican). Podés recargar el mismo archivo sin problema.</div>
      <div class="info-box mb"><b>Los datos viven en tu base de Supabase</b>, no en el código
        de la app ni en este navegador. Se cargan una sola vez: desde ahí los ve cualquiera
        que inicie sesión, desde cualquier computadora.</div>
      <div class="g3 mb">
        <div class="card"><div class="card-head"><h3>1 · Tabla de costos base</h3></div>
          <div class="card-body">
            <div class="hint" style="margin-bottom:11px">Archivo <b>costos-base.json</b> —
              los costos por categoría, medida y terminación. <b>Cargá este primero.</b></div>
            <input type="file" id="fCostos" accept=".json" style="display:none" onchange="Views.cargarCostos(this)">
            <button class="btn btn-blue" onclick="document.getElementById('fCostos').click()">
              ${Icon('imp')} Cargar tabla de costos</button>
            <div style="margin-top:13px" class="t-sec">
              Cargadas: <b>${Data.s.costosBase.length.toLocaleString('es-AR')}</b> filas de costo</div>
          </div></div>
        <div class="card"><div class="card-head"><h3>2 · Catálogo costeado</h3></div>
          <div class="card-body">
            <div class="hint" style="margin-bottom:11px">Archivo <b>catalogo-costeado.json</b> —
              productos vinculados con costo verificado.</div>
            <input type="file" id="fCat" accept=".json" style="display:none" onchange="Views.cargarCat(this)">
            <button class="btn btn-blue" onclick="document.getElementById('fCat').click()">
              ${Icon('imp')} Cargar catálogo</button>
            <div style="margin-top:13px" class="t-sec">
              Cargados: <b>${Data.s.productos.length.toLocaleString('es-AR')}</b> productos</div>
          </div></div>
        <div class="card"><div class="card-head"><h3>3 · Sin costear</h3></div>
          <div class="card-body">
            <div class="hint" style="margin-bottom:11px">Archivo <b>catalogo-sin-costo.json</b> —
              productos de Tienda Nube sin costo asociado. Opcional.</div>
            <input type="file" id="fSC" accept=".json" style="display:none" onchange="Views.cargarSC(this)">
            <button class="btn" onclick="document.getElementById('fSC').click()">
              ${Icon('imp')} Cargar sin costear</button>
            <div style="margin-top:13px" class="t-sec">
              Cargados: <b>${Data.s.sinCosto.length.toLocaleString('es-AR')}</b> productos</div>
          </div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Exportar</h3></div>
        <div class="card-body" style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn" onclick="Views.exportarCSV()">${Icon('dl')} Catálogo completo (CSV)</button>
          <button class="btn" onclick="Views.exportarJSON()">${Icon('dl')} Respaldo de datos (JSON)</button>
          <button class="btn" onclick="Views.exportarPend()">${Icon('dl')} Pendientes (CSV)</button>
          <button class="btn" onclick="Views.exportarCostos()">${Icon('dl')} Tabla de costos (JSON)</button>
        </div></div>`;
  },

  cargarCostos(input){
    const f = input.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = async e => {
      try{
        const d = JSON.parse(e.target.result);
        if(!Array.isArray(d)) throw new Error('el archivo no es una lista de costos');
        UI.toast('Subiendo costos a la base…');
        const res = await Data.importarCostos(d, (hecho,tot)=>UI.progreso(hecho,tot));
        Views.invalidar(); Router.refresh();
        UI.toast(`${res.n.toLocaleString('es-AR')} filas de costo guardadas en la base`, 'ok');
      }catch(err){ Views.errorCarga('tabla de costos', err); }
    };
    r.readAsText(f); input.value='';
  },

  /** Muestra el fallo con contexto y saca el cartel de progreso. */
  errorCarga(que, err){
    const p = document.getElementById('toastProg'); if(p) p.remove();
    const m = String(err && err.message || err);
    const pista = /schema|does not exist|not find/i.test(m)
      ? 'Revisá que "rentabilidad" esté en Settings → API → Exposed schemas.'
      : /JWT|session|not authenticated/i.test(m)
      ? 'Se cerró la sesión. Volvé a entrar.'
      : /JSON|Unexpected token/i.test(m)
      ? 'El archivo no parece un .json válido.'
      : '';
    UI.toast(`No pude cargar ${que}: ${m}${pista?' — '+pista:''}`, 'err');
    console.error('Carga fallida ·', que, err);
  },

  cargarCat(input){
    const f = input.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = async e => {
      try{
        const d = JSON.parse(e.target.result);
        if(!Array.isArray(d)) throw new Error('el archivo no es una lista de productos');
        UI.toast('Subiendo catálogo a la base… puede tardar un minuto');
        const res = await Data.importarCatalogo(d, (hecho,tot)=>UI.progreso(hecho,tot));
        Views.invalidar(); Router.refresh();
        UI.toast(`${res.n.toLocaleString('es-AR')} productos guardados · ${res.cats} categorías`, 'ok');
      }catch(err){ Views.errorCarga('el catálogo', err); }
    };
    r.readAsText(f); input.value='';
  },
  cargarSC(input){
    const f = input.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = async e => {
      try{
        const d = JSON.parse(e.target.result);
        if(!Array.isArray(d)) throw new Error('el archivo no es una lista de productos');
        UI.toast('Subiendo a la base…');
        const res = await Data.importarSinCosto(d, (hecho,tot)=>UI.progreso(hecho,tot));
        Router.refresh(); UI.toast(`${res.n.toLocaleString('es-AR')} productos sin costo guardados`, 'ok');
      }catch(err){ Views.errorCarga('los productos sin costear', err); }
    };
    r.readAsText(f); input.value='';
  },

  bajar(nombre, contenido, tipo){
    const b = new Blob([contenido], {type:tipo});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  },
  csv(filas){
    return '\uFEFF' + filas.map(f => f.map(v => {
      const s = String(v??'');
      return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
    }).join(';')).join('\n');
  },
  exportarCSV(){
    const rows = Views.calcAll();
    const out = [['Categoría','Modelo','Variantes','Medida','Medida costeo','Terminación',
      'Costo final','Precio lista','Precio efectivo','Ganancia','Margen','Markup',
      'Precio sugerido','Aumento sugerido','Estado']];
    rows.forEach(({p,c}) => out.push([
      Data.catNombre(p.categoriaId), p.modelo, variantesTxt(p), p.medida||'', p.medidaCosteo||'',
      (TIERS.find(t=>t.id===p.tier)||{}).label||'',
      Math.round(c.costoFinal)||'', Math.round(c.lista)||'', Math.round(c.efectivo)||'',
      Math.round(c.ganancia)||'', c.tieneCosto?(c.margen*100).toFixed(1):'',
      c.markup?c.markup.toFixed(2):'', Math.round(c.sugerido)||'',
      c.aumentoPct?(c.aumentoPct*100).toFixed(1):'', ESTADO[c.estado].lbl
    ]));
    Views.bajar('catalogo-rentabilidad.csv', Views.csv(out), 'text/csv;charset=utf-8');
    UI.toast('CSV exportado','ok');
  },
  exportarPend(){
    const rows = Views.calcAll().filter(r=>!r.c.tieneCosto);
    const out = [['Categoría','Modelo','Variantes','Medida','Medida costeo','Terminación','Precio lista','Motivo']];
    rows.forEach(({p,c}) => out.push([
      Data.catNombre(p.categoriaId), p.modelo, variantesTxt(p), p.medida||'', p.medidaCosteo||'',
      (TIERS.find(t=>t.id===p.tier)||{}).label||'', Math.round(c.lista)||'',
      p.tier? 'Medida sin fila en tabla de costos' : 'Sin terminación de madera asignada'
    ]));
    Views.bajar('pendientes.csv', Views.csv(out), 'text/csv;charset=utf-8');
    UI.toast('Pendientes exportados','ok');
  },
  exportarCostos(){
    Views.bajar('costos-base.json', JSON.stringify(Data.s.costosBase), 'application/json');
    UI.toast('Tabla de costos exportada','ok');
  },
  exportarJSON(){
    Views.bajar('respaldo-costeo-bh.json', JSON.stringify({
      productos:Data.s.productos, categorias:Data.s.categorias, costosBase:Data.s.costosBase,
      indices:Data.s.indices, modeloAdic:Data.s.modeloAdic, config:Data.s.config,
      historial:Data.s.historial, fecha:new Date().toISOString()
    }), 'application/json');
    UI.toast('Respaldo generado','ok');
  }
});

/* ============================================================
   INIT
   ============================================================ */
