/* ============================================================
   VIEWS (continuación) — se acopla al mismo módulo
   ============================================================ */
Object.assign(Views, {

  /* ============================================================
     MODELOS — nivel intermedio: vincula lista de costos + adicionales
     ============================================================ */
  verModelos(catId){ Views.F.modelos = {cat:catId, expandido:{}}; Router.go('modelos'); },

  modelos(){
    const st = Views.F.modelos || {cat:'', expandido:{}};
    const catId = st.cat;
    if(!catId) return `<div class="card"><div class="card-body">Elegí una categoría desde <b>Categorías y reglas</b>.</div></div>`;
    const cat = Data.cat(catId) || {};
    const prods = Data.s.productos.filter(p=>p.categoriaId===catId);

    const porModelo = {};
    prods.forEach(p=>{ (porModelo[p.modelo] = porModelo[p.modelo]||[]).push(p); });
    const modelos = Object.keys(porModelo).sort((a,b)=>a.localeCompare(b));

    const reglas = Data.s.config.modeloReglas || {};
    const defs = Data.s.config.adicionales || [];
    const reglaDe = m => reglas[catId+'::'+m.toLowerCase()] || {fuente:'lista', adicionales:[]};

    let nLista=0, nAdic=0, nPropio=0;
    modelos.forEach(m=>{ const r=reglaDe(m);
      if(r.fuente==='propio') nPropio++;
      else if((r.adicionales||[]).length) nAdic++;
      else nLista++; });

    const filas = modelos.map(m=>{
      const r = reglaDe(m);
      const abierto = st.expandido && st.expandido[m];
      const links = r.adicionales||[];
      const etiqueta = r.fuente==='propio' ? `<span class="t-sec">● Precio propio</span>`
        : links.length ? `<span class="t-amber">● Lista + ${links.map(l=>esc((defs.find(d=>d.id===l.id)||{}).nombre||'?')).join(', ')}</span>`
        : `<span class="t-green">● Lista de costos</span>`;

      let detalle = '';
      if(abierto){
        const vs = porModelo[m];
        const medidas = [...new Set(vs.map(p=>p.medidaCosteo))].sort((a,b)=>medSort(a)-medSort(b));
        const tierDe = {};
        links.forEach(l=>{ const a=defs.find(d=>d.id===l.id); if(!a) return;
          const ts = (l.tiers&&l.tiers.length)?l.tiers:(a.tiersDefault&&a.tiersDefault.length?a.tiersDefault:TIERS.map(t=>t.key));
          ts.forEach(t=>tierDe[t]=true); });

        const selFuente = `<select class="inp inp-sm" onchange="Views.setModeloFuente('${escJs(m)}',this.value)">
          <option value="lista" ${r.fuente!=='propio'?'selected':''}>Lista de costos</option>
          <option value="propio" ${r.fuente==='propio'?'selected':''}>Precio propio</option></select>`;

        const selAdic = r.fuente==='propio' ? '' : `
          <span class="t-sec" style="margin-left:6px">+ adicional:</span>
          <select class="inp inp-sm" onchange="Views.addModeloAdic('${escJs(m)}',this.value)">
            <option value="">— agregar —</option>
            ${defs.filter(a=>!links.some(l=>l.id===a.id)).map(a=>`<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}
          </select>`;

        const linksHTML = links.map(l=>{
          const a = defs.find(d=>d.id===l.id); if(!a) return '';
          const ts = (l.tiers&&l.tiers.length)?l.tiers:(a.tiersDefault&&a.tiersDefault.length?a.tiersDefault:TIERS.map(t=>t.key));
          return `<div style="margin:8px 0;padding:8px 10px;border:1px solid var(--line);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <b style="font-size:12px">${esc(a.nombre)} ${a.tipo==='pct'?'+'+a.valor+'%':'+'+money(a.valor)}</b>
              <button class="icon-btn" onclick="Views.delModeloAdic('${escJs(m)}','${a.id}')" title="Quitar">${Icon('close')}</button>
            </div>
            <div style="font-size:11.5px;color:var(--sec);margin-bottom:5px">¿A qué terminaciones se le suma?</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px">
              ${TIERS.map(t=>`<label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="checkbox" ${ts.includes(t.key)?'checked':''}
                  onchange="Views.toggleModeloTier('${escJs(m)}','${a.id}','${t.key}')"> ${esc(t.label)}</label>`).join('')}
            </div>
          </div>`;
        }).join('');

        const tablaVar = r.fuente==='propio' ? `<div class="hint" style="padding:8px 0">Este modelo tiene precio propio: el costo se carga a mano en cada producto.</div>`
          : `<table class="tbl" style="font-size:11.5px"><thead><tr><th>Medida</th>
            ${TIERS.map(t=>`<th class="num ${tierDe[t.key]?'t-amber':''}">${esc(t.label)}${tierDe[t.key]?' +':''}</th>`).join('')}
          </tr></thead><tbody>${medidas.map(med=>{
            return `<tr><td class="strong">${esc(med)}</td>${TIERS.map(t=>{
              const pv = porModelo[m].find(p=>p.medidaCosteo===med && p.tier===t.key);
              const cost = pv ? Calc.producto(pv).costoFinal : Calc.costoTabla(catId, med, t.key);
              return `<td class="num ${tierDe[t.key]?'cell-adic':''}">${cost?money(cost):'—'}</td>`;
            }).join('')}</tr>`;
          }).join('')}</tbody></table>`;

        detalle = `<div style="padding:4px 15px 14px 39px;background:var(--bg)">
          <div class="filters" style="margin-bottom:10px;align-items:center">
            <span class="t-sec" style="font-size:12px">Precio:</span> ${selFuente} ${selAdic}
          </div>
          ${linksHTML}
          <div class="tbl-wrap" style="margin-top:8px">${tablaVar}</div>
        </div>`;
      }

      return `<div style="border-top:1px solid var(--line)">
        <div class="modelo-row" onclick="Views.toggleModeloExp('${escJs(m)}')">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="chev">${abierto?'▾':'▸'}</span>
            <b style="font-size:13px">${esc(Views.sinPrefijoCat?Views.sinPrefijoCat(m, cat.nombre||catId):m)}</b>
            <span class="hint">${porModelo[m].length} variantes</span>
          </div>
          <div style="font-size:12px">${etiqueta}</div>
        </div>
        ${detalle}
      </div>`;
    }).join('');

    // Pendientes de esta categoría (de Tienda Nube, sin costear todavía)
    const modelosCosteados = new Set(modelos.map(m=>m.toUpperCase()));
    const pend = (Data.s.sinCosto||[]).filter(p=>p.categoriaId===catId);
    // detectar duplicados: pendientes cuyo nombre ya está costeado
    const pendReales = [], pendDup = [];
    pend.forEach(p=>{ (modelosCosteados.has((p.modelo||'').toUpperCase()) ? pendDup : pendReales).push(p); });

    const filasPend = pendReales.length ? `
      <div style="padding:8px 15px;background:var(--amber-l);font-size:11px;font-weight:700;color:var(--amber);border-top:1px solid var(--line)">
        FALTA COSTEAR — están en Tienda Nube pero no tienen costo asignado</div>
      ${pendReales.map(p=>`<div style="border-top:1px solid var(--line);background:var(--amber-l)">
        <div class="modelo-row">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="chev"></span>
            <b style="font-size:13px">${esc(Views.sinPrefijoCat?Views.sinPrefijoCat(p.modelo, cat.nombre||catId):p.modelo)}</b>
            <span class="hint">en Tienda Nube${p.precioLista?` · vende a ${money(p.precioLista)}`:''}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="t-amber" style="font-size:12px">● Falta costear</span>
            <button class="btn btn-sm btn-blue" onclick="Views.completarPendiente('${escJs(p.modelo)}')">Completar</button>
          </div>
        </div>
      </div>`).join('')}` : '';

    const avisoDup = pendDup.length ? `<div class="warn-box mb">
      <b>${pendDup.length} posibles duplicados.</b> Estos modelos figuran como pendientes pero ya tienen productos costeados con el mismo nombre: ${
        pendDup.map(p=>esc(p.modelo)).join(', ')}. Revisá si son el mismo (conviene borrar el pendiente).</div>` : '';

    return `
      <div class="page-head">
        <div>
          <div class="hint" style="margin-bottom:2px">
            <a href="#" onclick="Router.go('categorias');return false" style="color:var(--sec)">Categorías y reglas</a> › ${esc(cat.nombre||catId)}</div>
          <h2>Modelos de ${esc(cat.nombre||catId)}</h2>
          <div class="sub">Cómo toma el precio cada modelo. Por defecto derivan de la lista; marcás las excepciones.</div>
        </div>
      </div>

      ${avisoDup}

      <div class="filters mb">
        <div class="card" style="padding:10px 14px"><div class="hint">Modelos</div><div style="font-size:18px;font-weight:700">${modelos.length+pendReales.length}</div></div>
        <div class="card" style="padding:10px 14px"><div class="hint">Costeados</div><div style="font-size:18px;font-weight:700;color:var(--green)">${modelos.length}</div></div>
        ${pendReales.length?`<div class="card" style="padding:10px 14px;border-color:var(--amber);background:var(--amber-l)"><div class="hint">Falta costear</div><div style="font-size:18px;font-weight:700;color:var(--amber)">${pendReales.length}</div></div>`:''}
        <div class="card" style="padding:10px 14px"><div class="hint">Con adicional</div><div style="font-size:18px;font-weight:700;color:var(--amber)">${nAdic}</div></div>
      </div>

      <div class="card">${(filas||'') + filasPend || '<div class="card-body"><div class="hint">Esta categoría no tiene productos cargados.</div></div>'}</div>`;
  },

  completarPendiente(modelo){
    UI.modal(`Completar: ${esc(modelo)}`,
      `<div class="hint" style="line-height:1.6">Para costear este modelo necesitás cargar sus productos (medidas × terminaciones) con costo.
        Por ahora esto se hace desde <b>Importar / Exportar → Catálogo costeado</b>, subiendo el modelo con sus datos.
        <br><br>Próximamente vas a poder completarlo directo acá.</div>`,
      `<button class="btn" onclick="UI.closeAll()">Entendido</button>`);
  },

  toggleModeloExp(m){ const st=Views.F.modelos; st.expandido=st.expandido||{}; st.expandido[m]=!st.expandido[m]; Router.refresh(); },

  async setModeloFuente(m, fuente){
    const st=Views.F.modelos; const r = (Data.s.config.modeloReglas||{})[st.cat+'::'+m.toLowerCase()] || {fuente:'lista',adicionales:[]};
    r.fuente = fuente;
    await Data.saveModeloRegla(st.cat, m, r);
    Views.invalidar(); Router.refresh();
  },
  async addModeloAdic(m, adicId){
    if(!adicId) return;
    const st=Views.F.modelos; const key=st.cat+'::'+m.toLowerCase();
    const r = (Data.s.config.modeloReglas||{})[key] || {fuente:'lista',adicionales:[]};
    if(!r.adicionales.some(l=>l.id===adicId)) r.adicionales.push({id:adicId});
    await Data.saveModeloRegla(st.cat, m, r);
    Views.invalidar(); Router.refresh();
  },
  async delModeloAdic(m, adicId){
    const st=Views.F.modelos; const key=st.cat+'::'+m.toLowerCase();
    const r = (Data.s.config.modeloReglas||{})[key]; if(!r) return;
    r.adicionales = r.adicionales.filter(l=>l.id!==adicId);
    await Data.saveModeloRegla(st.cat, m, r);
    Views.invalidar(); Router.refresh();
  },
  async toggleModeloTier(m, adicId, tier){
    const st=Views.F.modelos; const key=st.cat+'::'+m.toLowerCase();
    const r = (Data.s.config.modeloReglas||{})[key]; if(!r) return;
    const link = r.adicionales.find(l=>l.id===adicId); if(!link) return;
    const a = (Data.s.config.adicionales||[]).find(d=>d.id===adicId);
    let ts = (link.tiers&&link.tiers.length) ? link.tiers.slice()
      : ((a&&a.tiersDefault&&a.tiersDefault.length) ? a.tiersDefault.slice() : TIERS.map(t=>t.key));
    ts = ts.includes(tier) ? ts.filter(t=>t!==tier) : ts.concat([tier]);
    link.tiers = ts;
    await Data.saveModeloRegla(st.cat, m, r);
    Views.invalidar(); Router.refresh();
  },

  /* ============================================================
     LISTA DE COSTOS — tabla editable (fuente de los costos) + adicionales
     ============================================================ */
  listaCostos(){
    if(!Views.F.lista) Views.F.lista = {cat:'', tipo:'carp'};
    const cat = Views.F.lista.cat || '';
    const tipo = Views.F.lista.tipo || 'carp';
    const esHierros = tipo === 'hierros';
    if(esHierros) return Views.listaHierros();
    // columnas según la lista activa
    const COLS = TIERS;
    const tierSet = new Set(COLS.map(c=>c.key));

    const cb = Data.s.costosBase.filter(x=>(!cat || x.categoriaId===cat) && tierSet.has(x.tier));
    const grupos = {};
    cb.forEach(x=>{
      const g = grupos[x.categoriaId] = grupos[x.categoriaId] || {};
      (g[x.medida] = g[x.medida] || {})[x.tier] = x.costo;
    });

    const catsOrden = Object.keys(grupos).sort((a,b)=>Data.catNombre(a).localeCompare(Data.catNombre(b)));
    const hayFilas = catsOrden.length>0;

    const filasHTML = catsOrden.map(cid=>{
      const meds = Object.keys(grupos[cid]).sort((a,b)=>medSort(a)-medSort(b));
      return meds.map(m=>`<tr>
        ${!cat?`<td class="t-sec">${esc(Data.catNombre(cid))}</td>`:''}
        <td class="strong">${esc(m)}</td>
        ${COLS.map(t=>{
          const v = grupos[cid][m][t.key];
          return `<td class="num"><input class="cell-inp celda-costo" inputmode="numeric"
            value="${v?Number(v).toLocaleString('es-AR'):''}" placeholder="—"
            data-cat="${esc(cid)}" data-medida="${escJs(m)}" data-tier="${t.key}"
            onblur="Views.guardarCostoBase(this)"
            onkeydown="if(event.key==='Enter'){this.blur()}"></td>`;
        }).join('')}
      </tr>`).join('');
    }).join('');

    /* --- Adicionales (solo en carpintería) --- */
    const adics = Data.s.config.adicionales || [];
    const adicHTML = adics.length ? adics.map((a,i)=>`
      <div class="adic-row">
        <div>
          <span class="adic-nom">${esc(a.nombre)}</span>
          <span class="adic-mods">${a.tipo==='pct'?'porcentaje':'monto fijo'} · terminaciones por defecto: ${
            (a.tiersDefault&&a.tiersDefault.length?a.tiersDefault:TIERS.map(t=>t.key)).map(k=>esc((TIERS.find(t=>t.key===k)||{}).label||k)).join(', ')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="adic-val">${a.tipo==='pct'?'+'+(Number(a.valor)||0)+'%':'+'+money(a.valor)}</span>
          <button class="icon-btn" onclick="Views.editarAdicional(${i})" title="Editar">${Icon('edit')}</button>
          <button class="icon-btn" onclick="Views.borrarAdicional(${i})" title="Borrar">${Icon('close')}</button>
        </div>
      </div>`).join('')
      : `<div class="hint" style="padding:10px 0">Todavía no cargaste adicionales. Con "+ nuevo adicional" agregás extras como ranurado o patas.</div>`;

    const tabTxt = esHierros ? 'Hierros' : 'Carpintería';

    return `
      <div class="page-head">
        <div><h2>Lista de costos</h2>
          <div class="sub">La fuente de la que salen los costos. Editás acá y todos los muebles se recalculan.</div></div>
        <div class="spacer"></div>
        <button class="btn" onclick="Views.imprimirLista()">${Icon('imp')} Imprimir / PDF</button>
      </div>

      <div class="segmented mb">
        <button class="seg ${!esHierros?'on':''}" onclick="Views.setListaTipo('carp')">Carpintería</button>
        <button class="seg ${esHierros?'on':''}" onclick="Views.setListaTipo('hierros')">Hierros</button>
      </div>

      ${!esHierros ? (()=>{ const nv = Views.noVinculados();
        return nv.length ? `<div class="warn-box mb" style="display:flex;justify-content:space-between;align-items:center;gap:14px">
          <div><b>${nv.length} productos no están vinculados a la lista.</b>
            Tienen un costo cargado a mano que no coincide con la tabla, así que <b>no se actualizan</b> cuando cambiás los precios. Conviene revisarlos.</div>
          <button class="btn btn-sm" onclick="Views.irProductos({soloNoVinc:true})">Ver cuáles</button>
        </div>` : '';
      })() : ''}
      ${!esHierros ? (()=>{
        const aum = (Data.s.config.aumentos||[]).filter(a=>a.lista!=='hierros');
        if(!aum.length) return '';
        const acum = {}; TIERS.forEach(t=>acum[t.key]=1);
        let ultimo = {};
        aum.forEach(a=>{
          const keys = a.tier==='all' ? TIERS.map(t=>t.key) : [a.tier];
          keys.forEach(k=>{ if(acum[k]==null)return; acum[k]*=(1+a.pct/100); ultimo[k]=a.pct; });
        });
        const prom = TIERS.reduce((s,t)=>s+acum[t.key],0)/TIERS.length;
        const anio = new Date().getFullYear();
        return `<div class="card mb"><div class="card-body" style="padding:12px 16px">
          <div class="hint" style="margin-bottom:8px">Aumentos aplicados ${anio}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div class="card" style="min-width:150px;padding:10px 14px">
              <div class="hint">Acumulado general</div>
              <div style="font-size:20px;font-weight:700;color:var(--red)">+${((prom-1)*100).toFixed(1).replace('.',',')}%</div>
            </div>
            <div class="card" style="flex:1;min-width:280px;padding:10px 14px">
              <div class="hint" style="margin-bottom:6px">Por terminación · acumulado (último)</div>
              <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
                ${TIERS.map(t=>`<span>${esc(t.label)}
                  <b class="t-red">+${((acum[t.key]-1)*100).toFixed(0)}%</b>
                  ${ultimo[t.key]!=null?`<span class="t-mut">(últ +${ultimo[t.key]})</span>`:''}</span>`).join('')}
              </div>
            </div>
          </div>
        </div></div>`;
      })() : ''}

      <div class="card mb" style="border-color:var(--blue)"><div class="card-body" style="padding:12px 16px">
        <div class="sec-lbl" style="margin-bottom:10px">Aplicar aumento · ${tabTxt}</div>
        <div class="filters" style="align-items:flex-end">
          <div><label class="inp-lbl">Categoría</label>
            ${Views.selCat('aumCat', cat, '')}</div>
          ${esHierros ? '' : `<div><label class="inp-lbl">Terminación</label>
            <select class="inp" id="aumTier">
              <option value="all">Todas las terminaciones</option>
              ${TIERS.map(t=>`<option value="${t.key}">Solo ${esc(t.label)}</option>`).join('')}
            </select></div>`}
          <div><label class="inp-lbl">%</label>
            <input class="inp" id="aumPct" type="number" step="0.1" placeholder="Ej: 8" style="width:80px"></div>
          <button class="btn btn-blue" onclick="Views.verImpactoAumento()">Ver impacto y aplicar</button>
        </div>
        <div class="hint" style="margin-top:8px">${esHierros
          ? 'Aumenta la lista de hierros de la categoría elegida (o todas).'
          : 'Elegís categoría (o todas) y qué terminación aumentar (o todas). Te muestra el impacto antes de confirmar.'}</div>
      </div></div>

      <div class="card mb"><div class="card-body" style="padding:12px 16px">
        <div class="filters">
          <span class="hint" style="align-self:center">Ver categoría:</span>
          ${Views.selCat('listaCat', cat, 'onchange="Views.setListaCat(this.value)"')}
          <div class="spacer"></div>
          <button class="btn btn-sm" onclick="Views.pegarExcel()">${Icon('imp')} Pegar desde Excel</button>
        </div>
      </div></div>

      <div class="card mb">
        ${!hayFilas ? `<div class="card-body">${UI.empty(esHierros?'Sin hierros cargados':'Sin filas en la tabla',
          esHierros?'Esta categoría no tiene hierros. Elegí una categoría y usá "Pegar desde Excel".':'Esta categoría no tiene costos cargados. Usá "Pegar desde Excel" para cargarlos.')}</div>`
        : `<div class="tbl-wrap"><table class="tbl"><thead><tr>
          ${!cat?'<th>Categoría</th>':''}<th>Medida</th>
          ${COLS.map(t=>`<th class="num">${esc(t.label)}</th>`).join('')}
        </tr></thead><tbody>${filasHTML}</tbody></table></div>`}
      </div>

      ${esHierros ? '' : `<div class="card"><div class="card-head"><h3>Adicionales</h3>
        <div class="spacer"></div>
        <button class="btn btn-sm btn-blue" onclick="Views.editarAdicional(-1)">+ nuevo adicional</button></div>
        <div class="card-body">
          <div class="hint" style="margin-bottom:8px">Extras porcentuales o fijos que se suman en los modelos que los llevan. El vínculo con cada modelo se hace en <b>Categorías › Ver modelos</b>.</div>
          ${adicHTML}
        </div>
      </div>`}`;
  },

  setListaCat(cat){ Views.F.lista = {...Views.F.lista, cat:cat||''}; Router.refresh(); },
  setListaTipo(tipo){ Views.F.lista = {...Views.F.lista, tipo}; Router.refresh(); },

  /* ---------- LISTA ÚNICA DE HIERROS ---------- */
  listaHierros(){
    const st = Views.F.hierros = Views.F.hierros || {fCat:'', fAlto:'', q:'', form:null};
    const hierros = Data.s.config.hierros || [];

    // alturas disponibles para el filtro
    const alturas = [...new Set(hierros.map(h=>Number(h.alto)).filter(Boolean))].sort((a,b)=>a-b);

    // aplicar filtros
    const q = (st.q||'').toLowerCase().replace(/\s/g,'');
    const filtrados = hierros.filter(h=>{
      if(st.fCat && !(h.categorias||[]).includes(st.fCat) && !(h.modelos||[]).length) return false;
      if(st.fAlto && Number(h.alto)!==Number(st.fAlto)) return false;
      if(q){
        const txt = `${h.largo}x${h.alto}${h.prof?'x'+h.prof:''}`.toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=> (Number(a.alto)-Number(b.alto)) || (Number(a.largo)-Number(b.largo)));

    const chipsAplica = h => {
      const cats = (h.categorias||[]).map(c=>`<span class="chip">${esc(Data.catNombre(c))}</span>`);
      const mods = (h.modelos||[]).map(m=>`<span class="chip chip-mod">◆ ${esc(m)}</span>`);
      const all = cats.concat(mods);
      return all.length ? all.join(' ') : '<span class="t-mut">sin asignar</span>';
    };

    const filas = filtrados.length ? filtrados.map(h=>{
      const i = hierros.indexOf(h);
      return `<tr>
        <td class="strong">${esc(h.largo)}</td>
        <td>${esc(h.alto)}</td>
        <td class="${h.prof?'':'t-mut'}">${h.prof?esc(h.prof):'—'}</td>
        <td class="num strong">${money(h.precio)}</td>
        <td>${chipsAplica(h)}</td>
        <td class="num" style="white-space:nowrap">
          <button class="icon-btn" onclick="Views.editarHierro(${i})" title="Editar">${Icon('edit')}</button>
          <button class="icon-btn" onclick="Views.borrarHierro(${i})" title="Borrar">${Icon('close')}</button>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="6"><div class="hint" style="padding:14px">${
      hierros.length ? 'Ningún hierro coincide con el filtro.' : 'Todavía no cargaste hierros. Usá "+ nuevo hierro" para empezar.'}</div></td></tr>`;

    return `
      <div class="page-head">
        <div><h2>Lista de costos</h2>
          <div class="sub">La fuente de la que salen los costos. Editás acá y todos los muebles se recalculan.</div></div>
        <div class="spacer"></div>
        <button class="btn" onclick="Views.imprimirLista()">${Icon('imp')} Imprimir / PDF</button>
      </div>

      <div class="segmented mb">
        <button class="seg" onclick="Views.setListaTipo('carp')">Carpintería</button>
        <button class="seg on" onclick="Views.setListaTipo('hierros')">Hierros</button>
      </div>

      <div class="card mb"><div class="card-body" style="padding:12px 16px">
        <div class="filters">
          <div><label class="inp-lbl">Categoría</label>
            <select class="inp inp-sm" onchange="Views.setHierroFiltro('fCat',this.value)">
              <option value="">Todas</option>
              ${Data.s.categorias.map(c=>`<option value="${c.id}" ${st.fCat===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}
            </select></div>
          <div><label class="inp-lbl">Altura</label>
            <select class="inp inp-sm" onchange="Views.setHierroFiltro('fAlto',this.value)">
              <option value="">Todas</option>
              ${alturas.map(a=>`<option value="${a}" ${Number(st.fAlto)===a?'selected':''}>${a} cm</option>`).join('')}
            </select></div>
          <div style="flex:1"><label class="inp-lbl">Buscar medida</label>
            <input class="inp inp-sm" style="max-width:none" placeholder="Ej: 100x20" value="${esc(st.q)}"
              oninput="Views.setHierroFiltro('q',this.value)"></div>
          <div style="align-self:flex-end">
          <div style="align-self:flex-end;display:flex;gap:6px">
            <button class="btn btn-sm" onclick="Views.pegarHierros()">${Icon('imp')} Pegar</button>
            <button class="btn btn-blue btn-sm" onclick="Views.editarHierro(-1)">+ nuevo hierro</button></div>
        </div>
      </div></div>

      ${st.form!=null ? Views.formHierro() : ''}

      ${(()=>{ const pend = Data.s.config.hierrosPendientes||[];
        return `<div class="card mb" ${pend.length?'style="border-color:var(--amber)"':''}>
          <div class="card-body" style="padding:12px 16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <b class="${pend.length?'t-amber':''}" style="font-size:13px">${pend.length
                ? `⚠ ${pend.length} modelos llevan hierro pero falta cargar el precio`
                : 'Modelos que llevan hierro sin precio cargado'}</b>
            </div>
            ${pend.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
              ${pend.map((m,i)=>`<span class="chip chip-mod">◆ ${esc(m)}
                <span style="cursor:pointer" onclick="Views.quitarHierroPendiente(${i})">✕</span></span>`).join(' ')}
            </div>`:''}
            <input class="inp inp-sm" style="max-width:none" placeholder="Agregar modelos pendientes (separados por coma) y Enter"
              onkeydown="if(event.key==='Enter'){Views.agregarHierroPendiente(this.value);this.value=''}">
          </div></div>`;
      })()}

      <div class="card">
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Largo</th><th>Alto</th><th>Prof.</th><th class="num">Precio</th><th>Aplica a</th><th></th>
        </tr></thead><tbody>${filas}</tbody></table></div>
      </div>`;
  },

  setHierroFiltro(campo, val){
    Views.F.hierros = {...Views.F.hierros, [campo]:val};
    // el buscador no debe re-renderizar en cada tecla si pierde foco; refrescamos igual
    Router.refresh();
  },

  formHierro(){
    const st = Views.F.hierros;
    const f = st.form || {largo:'', alto:'', prof:'', precio:'', categorias:[], modelos:[]};
    const esNuevo = st.form && st.form.idx==null;
    const catChips = (f.categorias||[]).map(c=>`<span class="chip">${esc(Data.catNombre(c))}
      <span style="cursor:pointer" onclick="Views.formHierroQuita('cat','${c}')">✕</span></span>`).join(' ');
    const modChips = (f.modelos||[]).map(m=>`<span class="chip chip-mod">◆ ${esc(m)}
      <span style="cursor:pointer" onclick="Views.formHierroQuita('mod','${escJs(m)}')">✕</span></span>`).join(' ');
    return `<div class="card mb" style="border-color:var(--blue)"><div class="card-body">
      <div class="sec-lbl" style="margin-bottom:12px">${esNuevo?'Nuevo hierro':'Editar hierro'}</div>
      <div class="filters" style="align-items:flex-end;margin-bottom:12px">
        <div><label class="inp-lbl">Largo</label>
          <input class="inp inp-sm" id="hLargo" type="number" style="width:80px" value="${f.largo||''}"></div>
        <div style="align-self:center;padding-top:16px;color:var(--mut)">×</div>
        <div><label class="inp-lbl">Alto</label>
          <input class="inp inp-sm" id="hAlto" type="number" style="width:80px" value="${f.alto||''}"></div>
        <div style="align-self:center;padding-top:16px;color:var(--mut)">×</div>
        <div><label class="inp-lbl">Prof. (opcional)</label>
          <input class="inp inp-sm" id="hProf" type="number" style="width:90px" value="${f.prof||''}"></div>
        <div><label class="inp-lbl">Precio</label>
          <input class="inp inp-sm" id="hPrecio" type="number" style="width:110px" value="${f.precio||''}"></div>
      </div>
      <div style="margin-bottom:10px">
        <label class="inp-lbl">Aplica a (categorías o modelos) — opcional</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px">
          ${catChips} ${modChips}
          <select class="inp inp-sm" style="max-width:200px" onchange="Views.formHierroAgrega('cat',this.value);this.value=''">
            <option value="">+ categoría…</option>
            ${Data.s.categorias.filter(c=>!(f.categorias||[]).includes(c.id)).map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
          </select>
          <input class="inp inp-sm" style="max-width:180px" placeholder="+ modelo (texto)"
            onkeydown="if(event.key==='Enter'){Views.formHierroAgrega('mod',this.value);this.value=''}">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-sm" onclick="Views.cerrarFormHierro()">Cancelar</button>
        <button class="btn btn-blue btn-sm" onclick="Views.guardarHierro()">Guardar hierro</button>
      </div>
    </div></div>`;
  },

  editarHierro(idx){
    const hierros = Data.s.config.hierros || [];
    const h = idx>=0 ? {...hierros[idx], idx} : {largo:'',alto:'',prof:'',precio:'',categorias:[],modelos:[],idx:null};
    Views.F.hierros = {...Views.F.hierros, form:h};
    Router.refresh();
  },
  cerrarFormHierro(){ Views.F.hierros = {...Views.F.hierros, form:null}; Router.refresh(); },

  // leer inputs actuales del form al vuelo (para no perder lo tipeado al agregar chips)
  _leerFormHierro(){
    const g = id => (document.getElementById(id)||{}).value;
    const f = Views.F.hierros.form || {};
    return {...f, largo:g('hLargo')??f.largo, alto:g('hAlto')??f.alto,
      prof:g('hProf')??f.prof, precio:g('hPrecio')??f.precio};
  },
  formHierroAgrega(tipo, val){
    if(!val) return;
    const f = Views._leerFormHierro();
    if(tipo==='cat'){ f.categorias=[...(f.categorias||[]), val]; }
    else { const m=val.trim(); if(m) f.modelos=[...(f.modelos||[]), m]; }
    Views.F.hierros = {...Views.F.hierros, form:f}; Router.refresh();
  },
  formHierroQuita(tipo, val){
    const f = Views._leerFormHierro();
    if(tipo==='cat') f.categorias=(f.categorias||[]).filter(c=>c!==val);
    else f.modelos=(f.modelos||[]).filter(m=>m!==val);
    Views.F.hierros = {...Views.F.hierros, form:f}; Router.refresh();
  },

  async guardarHierro(){
    const f = Views._leerFormHierro();
    const largo = parseNum(f.largo), alto = parseNum(f.alto);
    const prof = f.prof ? parseNum(f.prof) : null;
    const precio = parseNum(f.precio);
    if(!largo || !alto){ UI.toast('Poné largo y alto','err'); return; }
    if(!precio){ UI.toast('Poné el precio','err'); return; }
    if(!Data.s.config.hierros) Data.s.config.hierros = [];
    const rec = {id: f.idx!=null?(Data.s.config.hierros[f.idx].id||Date.now()):Date.now(),
      largo, alto, prof, precio, categorias:f.categorias||[], modelos:f.modelos||[]};
    if(f.idx!=null) Data.s.config.hierros[f.idx] = rec;
    else Data.s.config.hierros.push(rec);
    const ok = await Data.saveHierros();
    if(ok){ Data.log('Hierro', `${largo}x${alto}${prof?'x'+prof:''}`, `${money(precio)} · ${(rec.categorias.length+rec.modelos.length)||'sin'} asignaciones`);
      Views.invalidar(); Views.F.hierros = {...Views.F.hierros, form:null}; Router.refresh(); UI.toast('Hierro guardado','ok'); }
  },

  async agregarHierroPendiente(txt){
    const nuevos = (txt||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!nuevos.length) return;
    if(!Data.s.config.hierrosPendientes) Data.s.config.hierrosPendientes = [];
    nuevos.forEach(m=>{ if(!Data.s.config.hierrosPendientes.includes(m)) Data.s.config.hierrosPendientes.push(m); });
    await Data.saveHierros();
    Router.refresh(); UI.toast('Pendiente agregado','ok');
  },
  async quitarHierroPendiente(idx){
    const pend = Data.s.config.hierrosPendientes||[]; if(!pend[idx]) return;
    pend.splice(idx,1);
    await Data.saveHierros();
    Router.refresh();
  },

  borrarHierro(idx){
    const h = (Data.s.config.hierros||[])[idx]; if(!h) return;
    UI.confirm('Borrar hierro', `¿Borrar el hierro <b>${esc(h.largo)}×${esc(h.alto)}${h.prof?'×'+esc(h.prof):''}</b>?
      Los productos que lo sumaban van a recalcular su costo sin él.`,
      async ()=>{
        Data.s.config.hierros.splice(idx,1);
        await Data.saveHierros();
        Views.invalidar(); Router.refresh(); UI.toast('Hierro borrado','ok');
      }, 'Sí, borrar');
  },

  /** Pegar varios hierros de una: tabla (largo, alto, precio) + a qué
   *  modelos/categorías aplican todos. El match final es por largo. */
  pegarHierros(){
    UI.modal('Pegar hierros',
      `<div class="hint" style="margin-bottom:10px">Pegá una fila por hierro con <b>Largo · Alto · Precio</b>
        (separados por tab, coma o punto y coma). El alto es informativo — el match con el producto es por largo.</div>
       <textarea id="phTA" class="inp" rows="8" style="width:100%;font-family:monospace;font-size:12px"
         placeholder="100	65	90000&#10;120	65	100000&#10;140	65	110000"></textarea>
       <div style="margin-top:12px">
         <label class="inp-lbl">Aplica a MODELOS (separados por coma)</label>
         <input id="phMods" class="inp" style="width:100%" placeholder="Colombia, Honduras, Paraguay, Cuba"></div>
       <div style="margin-top:10px">
         <label class="inp-lbl">…o a CATEGORÍAS enteras (opcional)</label>
         <select id="phCat" class="inp" style="width:100%">
           <option value="">— ninguna —</option>
           ${Data.s.categorias.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
         </select></div>`,
      `<button class="btn" onclick="UI.closeAll()">Cancelar</button>
       <button class="btn btn-blue" onclick="Views.procesarPegarHierros()">Cargar hierros</button>`);
  },

  async procesarPegarHierros(){
    const txt = (document.getElementById('phTA')||{}).value || '';
    const mods = (document.getElementById('phMods').value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const catSel = document.getElementById('phCat').value || '';
    const cats = catSel ? [catSel] : [];
    if(!mods.length && !cats.length){ UI.toast('Asigná al menos un modelo o categoría','err'); return; }
    const lineas = txt.split('\n').map(l=>l.trim()).filter(Boolean);
    const nuevos = [];
    for(const ln of lineas){
      const c = ln.split(/\t|;|,/).map(x=>x.trim());
      if(c.length < 3) continue;
      const largo = parseNum(c[0]), alto = parseNum(c[1]), precio = parseNum(c[2]);
      if(!largo || !precio) continue;
      nuevos.push({id:Date.now()+Math.floor(Math.random()*10000), largo, alto:alto||null, prof:null,
        precio, categorias:cats.slice(), modelos:mods.slice()});
    }
    if(!nuevos.length){ UI.toast('No encontré hierros válidos','err'); return; }
    if(!Data.s.config.hierros) Data.s.config.hierros = [];
    Data.s.config.hierros.push(...nuevos);
    const ok = await Data.saveHierros();
    if(ok){ Data.log('Hierros', `${nuevos.length} cargados`, `${mods.join(', ')||Data.catNombre(catSel)}`);
      Views.invalidar(); UI.closeAll(); Router.refresh(); UI.toast(`${nuevos.length} hierros cargados`,'ok'); }
  },

  /** Abre una ventana lista para imprimir o guardar como PDF, con las 4
   *  terminaciones, encabezado y fecha. Respeta la categoría elegida. */
  imprimirLista(){
    const cat = Views.F.lista ? Views.F.lista.cat : '';
    const carpTiers = new Set(TIERS.map(t=>t.key));
    const cb = Data.s.costosBase.filter(x=>(!cat || x.categoriaId===cat) && carpTiers.has(x.tier));
    if(!cb.length){ UI.toast('No hay precios para imprimir','err'); return; }

    // agrupar cat -> medida -> tier
    const grupos = {};
    cb.forEach(x=>{ const g = grupos[x.categoriaId] = grupos[x.categoriaId]||{};
      (g[x.medida] = g[x.medida]||{})[x.tier] = x.costo; });
    const cats = Object.keys(grupos).sort((a,b)=>Data.catNombre(a).localeCompare(Data.catNombre(b)));

    const hoy = new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'});
    const fmt = n => n ? '$ '+Math.round(n).toLocaleString('es-AR') : '—';

    const bloques = cats.map(cid=>{
      const meds = Object.keys(grupos[cid]).sort((a,b)=>medSort(a)-medSort(b));
      return `<table class="pt">
        <thead>
          <tr class="cat"><th colspan="5">${esc(Data.catNombre(cid))}</th></tr>
          <tr class="hd"><th>Medida</th>${TIERS.map(t=>`<th>${esc(t.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>${meds.map(m=>`<tr>
          <td class="med">${esc(m)}</td>
          ${TIERS.map(t=>`<td class="pr">${fmt(grupos[cid][m][t.key])}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table>`;
    }).join('');

    const titulo = cat ? `BELGRANO HOME · ${Data.catNombre(cat)}` : 'BELGRANO HOME';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
      <title>Lista de precios · Belgrano Home</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
        .head{display:flex;justify-content:space-between;align-items:flex-end;
          border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:16px}
        .head h1{font-size:18px;margin:0;letter-spacing:.5px}
        .head .fecha{font-size:12px;color:#444}
        .pt{width:100%;border-collapse:collapse;margin-bottom:14px;
          break-inside:avoid;page-break-inside:avoid}
        .pt .cat th{text-align:left;background:#1F3864;color:#fff;font-size:13px;
          padding:6px 8px;border:1px solid #1F3864}
        .pt .hd th{background:#EEF1F6;font-size:11px;padding:5px 8px;border:1px solid #ccc;text-align:right}
        .pt .hd th:first-child{text-align:left}
        .pt td{padding:4px 8px;border:1px solid #ddd}
        .pt td.med{font-weight:bold;text-align:left}
        .pt td.pr{text-align:right;font-variant-numeric:tabular-nums}
        @media print{ body{margin:12mm} .pt{break-inside:avoid} }
      </style></head><body>
      <div class="head"><h1>${esc(titulo)}</h1><div class="fecha">Lista de precios · ${esc(hoy)}</div></div>
      ${bloques}
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if(!w){ UI.toast('Permití las ventanas emergentes para imprimir','err'); return; }
    w.document.write(html); w.document.close();
  },

  /** Guarda el costo de una celda al salir del input. */
  async guardarCostoBase(el){
    const cat = el.dataset.cat, medida = el.dataset.medida, tier = el.dataset.tier;
    const nuevo = parseNum(el.value);
    const actual = (Data.s.costosBase.find(x=>x.categoriaId===cat&&x.medida===medida&&x.tier===tier)||{}).costo || 0;
    if(nuevo === actual){ el.value = actual?actual.toLocaleString('es-AR'):''; return; }
    if(nuevo < 0){ UI.toast('El costo no puede ser negativo','err'); el.value = actual?actual.toLocaleString('es-AR'):''; return; }
    const ok = await Data.guardarCostoCelda(cat, medida, tier, nuevo);
    if(ok){
      Data.log('Edición de costo', `${Data.catNombre(cat)} ${medida}`,
        `${(TIERS.find(t=>t.key===tier)||{}).label}: ${money(actual)} → ${money(nuevo)}`);
      Views.invalidar();
      el.value = nuevo.toLocaleString('es-AR');
      el.classList.add('guardado');
      UI.toast('Costo actualizado','ok');
    }
  },

  /** Modal para pegar una tabla desde Excel (TSV). */
  pegarExcel(){
    const cat = Views.F.lista ? Views.F.lista.cat : '';
    const esHierros = (Views.F.lista&&Views.F.lista.tipo)==='hierros';
    if(!cat){
      UI.modal('Pegar desde Excel',
        `<div class="hint" style="margin-bottom:10px">Primero elegí una categoría arriba (no "Todas"),
         así sé a cuál cargarle los precios.</div>`,
        `<button class="btn" onclick="UI.closeAll()">Entendido</button>`);
      return;
    }
    const cols = esHierros ? '<b>Medida · Precio del hierro</b> (una fila por medida)'
      : '<b>Medida · Laqueado · Comb. blanco · Comb. paraíso · Paraíso</b> (una fila por medida)';
    const ph = esHierros ? '100\t90000&#10;120\t100000' : '120x40x30\t123710\t129270\t136770\t149460&#10;150x40x30\t...';
    UI.modal(`Pegar desde Excel · ${esHierros?'Hierros · ':''}${esc(Data.catNombre(cat))}`,
      `<div class="hint" style="margin-bottom:10px">Copiá de tu Excel las columnas en este orden: ${cols} y pegalas acá.
        Las que dejes vacías se ignoran.</div>
       <textarea id="pegarTA" class="inp" rows="10" style="width:100%;font-family:monospace;font-size:12px"
         placeholder="${ph}"></textarea>`,
      `<button class="btn" onclick="UI.closeAll()">Cancelar</button>
       <button class="btn btn-blue" onclick="Views.procesarPegado('${cat}')">Cargar filas</button>`);
  },

  async procesarPegado(cat){
    const esHierros = (Views.F.lista&&Views.F.lista.tipo)==='hierros';
    const COLS = esHierros ? [{key:'hierro'}] : TIERS;
    const txt = (document.getElementById('pegarTA')||{}).value || '';
    const lineas = txt.split('\n').map(l=>l.trim()).filter(Boolean);
    const filas = [];
    for(const ln of lineas){
      const cols = ln.split(/\t|;|,/).map(c=>c.trim());
      if(cols.length < 2) continue;
      const medida = cols[0].toLowerCase().replace(/\s/g,'').replace(/×/g,'x');
      COLS.forEach((t,i)=>{
        const raw = cols[i+1];
        if(raw==null || raw==='') return;
        const costo = parseNum(raw);
        if(costo>0) filas.push({categoriaId:cat, medida, tier:t.key, costo});
      });
    }
    if(!filas.length){ UI.toast('No encontré filas válidas','err'); return; }
    UI.closeAll();
    const res = await Data.importarCostos(filas, (h,t)=>UI.progreso&&UI.progreso(h,t));
    Views.invalidar(); Router.refresh();
    UI.toast(`${filas.length} ${esHierros?'hierros':'precios'} cargados en ${Data.catNombre(cat)}`,'ok');
  },

  /** Lee el panel inline y muestra el impacto antes de aplicar. */
  verImpactoAumento(){
    const esHierros = (Views.F.lista&&Views.F.lista.tipo)==='hierros';
    const cat = document.getElementById('aumCat').value || '';
    const tier = esHierros ? 'hierro' : (document.getElementById('aumTier').value || 'all');
    const pct = parseFloat(document.getElementById('aumPct').value);
    if(!pct || pct===0){ UI.toast('Poné un porcentaje','err'); return; }
    const factor = 1 + pct/100;
    const carpTiers = new Set(TIERS.map(t=>t.key));
    const afectadas = Data.s.costosBase.filter(x=>{
      if(cat && x.categoriaId!==cat) return false;
      if(esHierros) return x.tier==='hierro';
      // carpintería: excluir hierros
      if(!carpTiers.has(x.tier)) return false;
      return tier==='all' || x.tier===tier;
    });
    if(!afectadas.length){ UI.toast('No hay precios para ese alcance','err'); return; }
    const alcCat = cat ? Data.catNombre(cat) : 'todas las categorías';
    const alcTier = esHierros ? 'hierros' : (tier==='all' ? 'todas las terminaciones' : (TIERS.find(t=>t.key===tier)||{}).label);
    UI.confirm('Confirmar aumento',
      `Vas a aumentar <b>${pct}%</b> · <b>${esc(alcCat)}</b> · <b>${esc(alcTier)}</b>.<br><br>
       Afecta <b>${afectadas.length}</b> precios. Ejemplo: ${money(100000)} pasa a ${money(Math.round(100000*factor))}.<br><br>
       Recalcula el costo de todos los productos afectados. ¿Confirmás?`,
      async ()=>{
        const filas = afectadas.map(x=>({categoriaId:x.categoriaId, medida:x.medida, tier:x.tier,
          costo:Math.round(x.costo*factor)}));
        await Data.importarCostos(filas);
        if(!Data.s.config.aumentos) Data.s.config.aumentos = [];
        Data.s.config.aumentos.push({fecha:new Date().toISOString(), pct, categoriaId:cat||'', tier,
          lista:esHierros?'hierros':'carp', n:filas.length});
        await Data.saveAdicionales();
        Data.log('Aumento', `${esHierros?'Hierros · ':''}${alcCat} · ${alcTier}`, `+${pct}% sobre ${filas.length} precios`);
        Views.invalidar(); Router.refresh();
        UI.toast(`Aumento de ${pct}% aplicado`,'ok');
      }, 'Sí, aumentar');
  },

  /** Modal para crear/editar un adicional (idx=-1 => nuevo). */
  editarAdicional(idx){
    const adics = Data.s.config.adicionales || [];
    const a = idx>=0 ? adics[idx] : {nombre:'', tipo:'pct', valor:5, tiersDefault:TIERS.map(t=>t.key)};
    const tsDef = a.tiersDefault && a.tiersDefault.length ? a.tiersDefault : TIERS.map(t=>t.key);
    UI.modal(idx>=0?'Editar adicional':'Nuevo adicional',
      `<div style="display:grid;gap:12px">
        <div><label class="inp-lbl">Nombre</label>
          <input id="adNom" class="inp" style="width:100%" value="${esc(a.nombre)}" placeholder="Ranurado, Patas paraíso, Hierros…"></div>
        <div style="display:flex;gap:12px">
          <div style="flex:1"><label class="inp-lbl">Tipo</label>
            <select id="adTipo" class="inp" style="width:100%" onchange="document.getElementById('adValLbl').textContent=this.value==='pct'?'Porcentaje (%)':'Monto fijo ($)'">
              <option value="pct" ${a.tipo==='pct'?'selected':''}>Porcentaje (%)</option>
              <option value="fijo" ${a.tipo==='fijo'?'selected':''}>Monto fijo ($)</option>
            </select></div>
          <div style="flex:1"><label class="inp-lbl" id="adValLbl">${a.tipo==='pct'?'Porcentaje (%)':'Monto fijo ($)'}</label>
            <input id="adVal" class="inp" type="number" step="0.1" style="width:100%" value="${a.valor||''}"></div>
        </div>
        <div><label class="inp-lbl">Terminaciones por defecto</label>
          <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-top:4px">
            ${TIERS.map(t=>`<label style="display:flex;align-items:center;gap:5px;cursor:pointer">
              <input type="checkbox" class="adTierChk" value="${t.key}" ${tsDef.includes(t.key)?'checked':''}> ${esc(t.label)}</label>`).join('')}
          </div>
          <div class="hint" style="margin-top:5px">A qué terminaciones se suma por defecto. Después, en cada modelo, podés cambiarlo.</div></div>
      </div>`,
      `<button class="btn" onclick="UI.closeAll()">Cancelar</button>
       <button class="btn btn-blue" onclick="Views.guardarAdicional(${idx})">Guardar</button>`);
  },

  async guardarAdicional(idx){
    const nombre = (document.getElementById('adNom').value||'').trim();
    const tipo = document.getElementById('adTipo').value;
    const valor = parseFloat(document.getElementById('adVal').value)||0;
    const tiersDefault = [...document.querySelectorAll('.adTierChk:checked')].map(c=>c.value);
    if(!nombre){ UI.toast('Poné un nombre','err'); return; }
    if(!valor){ UI.toast('Poné un valor','err'); return; }
    if(!tiersDefault.length){ UI.toast('Elegí al menos una terminación','err'); return; }
    if(!Data.s.config.adicionales) Data.s.config.adicionales = [];
    const rec = {id: idx>=0?(Data.s.config.adicionales[idx].id||Date.now()):Date.now(),
      nombre, tipo, valor, tiersDefault};
    if(idx>=0) Data.s.config.adicionales[idx] = rec;
    else Data.s.config.adicionales.push(rec);
    const ok = await Data.saveAdicionales();
    if(ok){ Data.log('Adicional', nombre, `${tipo==='pct'?valor+'%':money(valor)}`);
      Views.invalidar(); UI.closeAll(); Router.refresh(); UI.toast('Adicional guardado','ok'); }
  },

  borrarAdicional(idx){
    const a = (Data.s.config.adicionales||[])[idx]; if(!a) return;
    UI.confirm('Borrar adicional', `¿Seguro que querés borrar <b>${esc(a.nombre)}</b>?
      Los productos que lo llevaban van a recalcular su costo sin él.`,
      async ()=>{
        Data.s.config.adicionales.splice(idx,1);
        await Data.saveAdicionales();
        Views.invalidar(); Router.refresh(); UI.toast('Adicional borrado','ok');
      }, 'Sí, borrar');
  },

  /* ============================================================
     5 · RENTABILIDAD — ¿Qué familia necesita revisión?
     ============================================================ */
  rentabilidad(){
    if(!Data.s.productos.length) return Views.sinDatos();
    const cfg = Data.s.config;
    const catFoco = Views.F.rent.cat || '';
    const rows = Views.calcAll();

    // Ranking de categorías: SIEMPRE todas (es el índice)
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
      mgProm:o.cn?o.mg/o.cn:0, mkpProm:o.cn?o.mkp/o.cn:0,
      ganProm:o.cn?o.gan/o.cn:0, cob:o.n?o.cn/o.n:0
    })).sort((a,b)=>a.mkpProm-b.mkpProm);

    // Mayor/menor utilidad y aumento: respetan el foco de categoría
    const enFoco = rows.filter(({p,c}) => c.tieneCosto && (!catFoco || p.categoriaId===catFoco));
    const top = [...enFoco].sort((a,b)=>b.c.ganancia-a.c.ganancia).slice(0,10);
    const bot = [...enFoco].sort((a,b)=>a.c.ganancia-b.c.ganancia).slice(0,10);
    const sub = [...enFoco].filter(r=>r.c.aumentoPct>0.001)
      .sort((a,b)=>b.c.aumentoPct-a.c.aumentoPct).slice(0,10);
    const nombreFoco = catFoco ? Data.catNombre(catFoco) : 'todas las categorías';

    const mini = (titulo, lista, campo, fmt, cls, nota) => `
      <div class="card"><div class="card-head"><h3>${titulo}</h3>
        <div class="spacer"></div><span class="hint">${nota||''}</span></div>
        ${lista.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Modelo</th>${catFoco?'':'<th>Categoría</th>'}<th class="num">${campo==='ganancia'?'Ganancia/unidad':'Aumento'}</th>
          <th class="num">Markup</th></tr></thead>
        <tbody>${lista.map(({p,c})=>`<tr class="clickable" onclick="Views.ficha('${p.id}')">
          <td class="strong">${esc(Views.sinPrefijoCat?Views.sinPrefijoCat(p.modelo,Data.catNombre(p.categoriaId)):p.modelo)}<div class="hint">${esc(p.medida||'')}</div></td>
          ${catFoco?'':`<td class="t-sec">${esc(Data.catNombre(p.categoriaId))}</td>`}
          <td class="num strong ${cls}">${fmt(c[campo])}</td>
          <td class="num">${mk(c.markup)}</td></tr>`).join('')}
        </tbody></table></div>`
        :`<div class="card-body"><div class="hint">No hay productos con costo en ${esc(nombreFoco)}.</div></div>`}</div>`;

    return `
      <div class="page-head">
        <div><h2>Análisis de rentabilidad</h2>
          <div class="sub">Dónde está la utilidad y qué familia necesita revisión</div></div>
      </div>

      <div class="card mb"><div class="card-body" style="padding:12px 16px">
        <div class="filters">
          <span class="hint" style="align-self:center">Enfocar en:</span>
          ${Views.selCat('rentCat', catFoco, 'onchange="Views.setRent(this.value)"')}
          ${catFoco?`<button class="btn btn-sm btn-ghost" onclick="Views.setRent('')">Ver todas</button>`:''}
        </div>
      </div>

      <div class="card mb"><div class="card-head"><h3>Ranking de categorías</h3>
        <div class="spacer"></div><span class="hint">peor markup primero · tocá una para enfocar</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th>Categoría</th><th class="num">Productos</th><th class="num">Costeado real</th>
          <th class="num">Markup prom.</th><th class="num">Margen prom.</th>
          <th class="num">Ganancia prom./unidad</th><th class="num">En rojo</th>
        </tr></thead><tbody>${cats.map(r=>`
          <tr class="clickable ${r.id===catFoco?'sel-row':''}" onclick="Views.setRent('${r.id}')">
            <td class="strong">${esc(r.nombre)}</td>
            <td class="num">${r.n.toLocaleString('es-AR')}</td>
            <td class="num"><div style="display:flex;align-items:center;gap:7px;justify-content:flex-end">
              <span class="${r.cob<0.5?'t-red':r.cob<0.9?'t-amber':'t-green'}">${(r.cob*100).toFixed(0)}%</span>
              ${UI.pbar(r.cob, r.cob<0.5?'var(--red)':r.cob<0.9?'var(--amber)':'var(--green)')}</div></td>
            <td class="num strong ${r.mkpProm<cfg.umbralAmarillo?'t-red':r.mkpProm<cfg.umbralVerde?'t-amber':'t-green'}">${r.cn?mk(r.mkpProm):'<span class="t-mut">sin costo</span>'}</td>
            <td class="num ${r.mgProm<cfg.margenMinimo?'t-red':''}">${r.cn?pct1(r.mgProm):'<span class="t-mut">—</span>'}</td>
            <td class="num">${r.cn?money(r.ganProm):'<span class="t-mut">—</span>'}</td>
            <td class="num">${r.rojo?`<span class="badge b-red clickable" onclick="event.stopPropagation();Views.irProductos({cat:'${r.id}',estado:'rojo'})"><span class="dot"></span>${r.rojo}</span>`:'<span class="t-mut">—</span>'}</td>
          </tr>`).join('')}</tbody></table></div></div>

      <div class="hint" style="margin-bottom:8px">Detalle de productos — ${esc(nombreFoco)}</div>
      <div class="g2 mb">
        ${mini(catFoco?'Las que más convienen':'Que más convienen', top, 'ganancia', money, 't-green', 'top 10 · por ganancia/unidad')}
        ${mini(catFoco?'Las que menos convienen':'Que menos convienen', bot, 'ganancia', money, 't-red', 'top 10 · por ganancia/unidad')}
      </div>
      ${mini(catFoco?`${esc(nombreFoco)}: necesitan aumento`:'Los que más necesitan aumento', sub, 'aumentoPct', pctS, 't-red', 'top 10 por % de aumento sugerido')}`;
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
        const nCB = Data.s.costosBase.filter(x=>x.categoriaId===c.id && x.tier!=='hierro').length;
        return `<tr>
          <td class="strong">${esc(c.nombre)}</td>
          <td class="num">${nP.toLocaleString('es-AR')}</td>
          <td class="num ${nCB?'':'t-red strong'}">${nCB||'sin tabla'}</td>
          <td class="num">${(c.targetNegro||cfg.targetNegro).toFixed(2).replace('.',',')}</td>
          <td class="num">${(c.targetOtro||cfg.targetOtro).toFixed(2).replace('.',',')}</td>
          <td class="num" style="white-space:nowrap">
            <button class="btn btn-sm" onclick="Views.verModelos('${c.id}')">Ver modelos</button>
            <button class="btn btn-sm" onclick="Views.tablaCostos('${c.id}')">Ver tabla de costos</button></td>
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
        ${TIERS.map(t=>{const v=get(m,t.key);
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
  },

  /* ============================================================
     POR COTIZAR — catálogo de Tienda Nube todavía sin costo.
     Vista aparte de los costeados: qué muebles hay que cotizar.
     ============================================================ */
  cotizar(){
    const scs = Data.s.sinCosto || [];
    const f = Views.F.cotizar || (Views.F.cotizar = {cat:'', q:''});
    if(!scs.length) return `
      <div class="page-head"><div><h2>Por cotizar</h2>
        <div class="sub">Productos de Tienda Nube todavía sin costo cargado</div></div></div>
      <div class="card"><div class="card-body">Todavía no hay productos sin costo cargados.</div></div>`;

    const catList = [...new Set(scs.map(p=>p.categoriaId))]
      .map(id=>({id, nombre:Data.catNombre(id), n:scs.filter(p=>p.categoriaId===id).length}))
      .sort((a,b)=>b.n-a.n);

    const q = (f.q||'').trim().toLowerCase();
    let sel = scs;
    if(f.cat) sel = sel.filter(p=>p.categoriaId===f.cat);
    if(q)     sel = sel.filter(p=>(p.modelo||'').toLowerCase().includes(q));

    const gmap = {};
    sel.forEach(p=>{ const k=p.categoriaId+'::'+p.modelo;
      (gmap[k]=gmap[k]||{modelo:p.modelo, catId:p.categoriaId, items:[]}).items.push(p); });
    const grupos = Object.values(gmap).sort((a,b)=>
      a.catId===b.catId ? String(a.modelo||'').localeCompare(String(b.modelo||''))
                        : Data.catNombre(a.catId).localeCompare(Data.catNombre(b.catId)));

    const filas = grupos.map(g=>{
      const precios = g.items.map(x=>Number(x.precioLista)||0).filter(v=>v>0);
      const min = precios.length?Math.min(...precios):0, max = precios.length?Math.max(...precios):0;
      const medidas = [...new Set(g.items.map(x=>x.medida).filter(Boolean))];
      return `<tr>
        <td class="strong">${esc(g.modelo||'—')}</td>
        <td>${esc(Data.catNombre(g.catId))}</td>
        <td class="num">${g.items.length}</td>
        <td class="t-sec">${medidas.slice(0,6).map(esc).join(', ')}${medidas.length>6?'…':''}</td>
        <td class="num">${min?(min===max?money(min):money(min)+'–'+money(max)):'—'}</td>
      </tr>`;
    }).join('');

    return `
      <div class="page-head">
        <div><h2>Por cotizar</h2>
          <div class="sub">${scs.length.toLocaleString('es-AR')} variantes de Tienda Nube sin costo cargado</div></div>
      </div>
      <div class="kpi-grid">
        ${UI.kpi({label:'Variantes por cotizar', value:scs.length.toLocaleString('es-AR'),
          icon:'box', bg:'var(--gray-l)', color:'var(--sec)'})}
        ${UI.kpi({label:'Modelos distintos',
          value:[...new Set(scs.map(p=>p.categoriaId+'::'+p.modelo))].length.toLocaleString('es-AR'),
          icon:'tag', bg:'var(--blue-l)', color:'var(--blue)'})}
        ${UI.kpi({label:'Categorías', value:catList.length,
          icon:'chart', bg:'var(--green-l)', color:'var(--green)'})}
      </div>
      <div class="card mb"><div class="card-body" style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <select class="inp" style="max-width:280px" onchange="Views.setCotizar('cat', this.value)">
          <option value="">Todas las categorías (${scs.length.toLocaleString('es-AR')})</option>
          ${catList.map(c=>`<option value="${esc(c.id)}" ${f.cat===c.id?'selected':''}>${esc(c.nombre)} (${c.n.toLocaleString('es-AR')})</option>`).join('')}
        </select>
        <input class="inp" style="max-width:240px" placeholder="Buscar modelo…" value="${esc(f.q||'')}"
          oninput="Views.setCotizar('q', this.value)">
        <div class="spacer"></div><span class="hint">${grupos.length.toLocaleString('es-AR')} modelos</span>
      </div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>Modelo</th><th>Categoría</th><th class="num">Variantes</th><th>Medidas</th><th class="num">Precio TN</th>
      </tr></thead><tbody>${filas || '<tr><td colspan="5" class="t-sec">Sin resultados.</td></tr>'}</tbody></table></div></div>`;
  },

  setCotizar(k, v){
    Views.F.cotizar = {...(Views.F.cotizar||{cat:'',q:''}), [k]:v};
    const foco = k==='q';
    Router.refresh();
    if(foco){ const i=document.querySelector('#view input[placeholder^="Buscar modelo"]');
      if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } }
  }
});

/* ============================================================
   INIT
   ============================================================ */
