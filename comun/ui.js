/* ============================================================
   CAPA 3 · UI  (componentes reutilizables — nada de negocio acá)
   ============================================================ */
const Icon = (() => {
  const P = {
    home:'M3 10.2L12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    box:'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5L12 12m0 0l9-4.5M12 12v9',
    chart:'M3 3v18h18M7 15l3.5-4 3 2.5L21 7',
    sim:'M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    refresh:'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
    tag:'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9zM7.5 7.5h.01',
    edit:'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    hist:'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l4 2',
    gear:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.8H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    imp:'M12 3v12m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2',
    check:'M9 12l2 2 4-4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    x:'M15 9l-6 6M9 9l6 6M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    warn:'M12 8v4m0 4h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    trend:'M3 17l6-6 4 4 8-8M21 7v5h-5',
    target:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    close:'M18 6L6 18M6 6l12 12',
    search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    dl:'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
    empty:'M9 3h6l1 3h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4z'
  };
  return (n, cls) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
    class="${cls||''}"><path d="${P[n]||''}"/></svg>`;
})();

const UI = (() => {
  const $ = id => document.getElementById(id);

  return {
    /* --- KPI card --- */
    kpi({label, value, sub, subColor, icon, bg, color, onClick}){
      return `<div class="kpi ${onClick?'clickable':''}" ${onClick?`onclick="${onClick}"`:''}>
        <div class="kpi-ico" style="background:${bg};color:${color}">${Icon(icon)}</div>
        <div style="min-width:0">
          <div class="kpi-lbl">${esc(label)}</div>
          <div class="kpi-val">${value}</div>
          ${sub?`<div class="kpi-sub" style="color:${subColor||'var(--mut)'}">${sub}</div>`:''}
        </div>
      </div>`;
    },

    badge(estado){
      const e = ESTADO[estado] || ESTADO.sincosto;
      return `<span class="badge ${e.cls}"><span class="dot"></span>${e.lbl}</span>`;
    },

    pbar(pct, color){
      return `<div class="pbar"><i style="width:${Math.min(100,pct*100)}%;background:${color}"></i></div>`;
    },

    /** Regla de markup: posición real vs objetivo, sobre las zonas del semáforo.
     *  Escala 1,0x–3,0x (los valores fuera de rango se fijan al extremo). */
    ruler(markup, target, grande){
      if(!markup) return '<span class="t-mut">—</span>';
      const cfg = Data.s.config, MIN=1, MAX=3;
      const pos = v => Math.max(0, Math.min(100, ((v-MIN)/(MAX-MIN))*100));
      const zR = pos(cfg.umbralAmarillo), zA = pos(cfg.umbralVerde);
      const p = pos(markup), tg = pos(target);
      const color = markup>=cfg.umbralVerde?'var(--green)'
        : markup>=cfg.umbralAmarillo?'var(--amber)':'var(--red)';
      const fuera = markup>MAX;
      return `<div class="ruler ${grande?'ruler-lg':''}"
        title="Markup ${mk(markup)} · objetivo ${target.toFixed(2).replace('.',',')}x">
        <div class="track">
          <i class="z-red" style="width:${zR}%"></i>
          <i class="z-amb" style="width:${zA-zR}%"></i>
          <i class="z-grn" style="width:${100-zA}%"></i>
        </div>
        <div class="tgt" style="left:${tg}%"></div>
        <div class="pin" style="left:${p}%;background:${color}"></div>
        ${grande?`
          <div class="tick" style="left:0">1,00x</div>
          <div class="tick" style="left:${zR}%">${cfg.umbralAmarillo.toFixed(2).replace('.',',')}x</div>
          <div class="tick" style="left:${zA}%">${cfg.umbralVerde.toFixed(2).replace('.',',')}x</div>
          <div class="tick" style="left:100%;transform:translateX(-100%)">${fuera?'3,00x +':'3,00x'}</div>
          <div class="tick tgt-lbl" style="left:${tg}%">objetivo ${target.toFixed(2).replace('.',',')}x</div>
        `:''}
      </div>`;
    },

    /** Tooltip: explica un dato sin abrir un popup. */
    tip(texto){
      return `<span class="tip" tabindex="0"><span class="tip-i">?</span>
        <span class="tip-body">${esc(texto)}</span></span>`;
    },

    /** Celda editable en línea. Guarda al salir del campo o con Enter. */
    cellEdit(prodId, campo, valor, placeholder){
      const v = valor ? Math.round(valor).toLocaleString('es-AR') : '';
      return `<input class="cell-inp ${v?'':'vacio'}" value="${v}"
        placeholder="${placeholder||'—'}"
        data-id="${prodId}" data-campo="${campo}" data-orig="${Math.round(valor||0)}"
        onclick="event.stopPropagation()"
        onkeydown="Views.teclaCelda(event,this)"
        onblur="Views.guardarCelda(this)">`;
    },

    empty(titulo, sub, accion){
      return `<div class="empty">${Icon('empty')}
        <div class="t">${esc(titulo)}</div>
        ${sub?`<div class="s">${esc(sub)}</div>`:''}
        ${accion?`<div style="margin-top:13px">${accion}</div>`:''}</div>`;
    },

    /* --- Drawer lateral --- */
    drawer(titulo, sub, html){
      $('drawer').innerHTML = `
        <div class="drawer-head">
          <div style="flex:1;min-width:0">
            <h3>${titulo}</h3>${sub?`<div class="sub">${sub}</div>`:''}
          </div>
          <button class="x-btn" onclick="UI.closeAll()">${Icon('close')}</button>
        </div>
        <div class="drawer-body">${html}</div>`;
      $('drawer').classList.add('on'); $('scrim').classList.add('on');
    },

    /* --- Modal --- */
    modal(titulo, html, footer){
      $('modal').innerHTML = `
        <div class="modal-head">
          <h3 style="flex:1">${titulo}</h3>
          <button class="x-btn" onclick="UI.closeAll()">${Icon('close')}</button>
        </div>
        <div class="modal-body">${html}</div>
        ${footer?`<div class="modal-foot">${footer}</div>`:''}`;
      $('modal').classList.add('on'); $('scrim').classList.add('on');
    },

    /* --- Confirmación --- */
    confirm(titulo, texto, onOk, okLabel){
      window.__ok = onOk;
      UI.modal(titulo, `<div style="font-size:13px;line-height:1.55">${texto}</div>`,
        `<button class="btn" onclick="UI.closeAll()">Cancelar</button>
         <button class="btn btn-blue" onclick="const f=window.__ok;UI.closeAll();f&&f()">${okLabel||'Confirmar'}</button>`);
    },

    closeAll(){
      $('drawer').classList.remove('on');
      $('modal').classList.remove('on');
      $('scrim').classList.remove('on');
    },

    /** Aviso de progreso reutilizable (una sola línea, se va reemplazando).
     *  Acepta dos formas: progreso(hecho, total) con números, o
     *  progreso('texto') para avisar en qué paso va. */
    progreso(hecho, total){
      let d = document.getElementById('toastProg');
      if(!d){
        d = document.createElement('div'); d.className='toast'; d.id='toastProg';
        document.getElementById('toasts').appendChild(d);
      }
      const numeros = typeof hecho === 'number' && typeof total === 'number';
      d.textContent = numeros
        ? `Subiendo ${hecho.toLocaleString('es-AR')} de ${total.toLocaleString('es-AR')}…`
        : String(hecho);
      if(numeros && hecho >= total) setTimeout(()=>d.remove(), 900);
    },

    toast(msg, tipo){
      const d = document.createElement('div');
      d.className = 'toast ' + (tipo||'');
      d.innerHTML = (tipo==='ok'?Icon('check'):tipo==='err'?Icon('x'):'') + `<span>${esc(msg)}</span>`;
      $('toasts').appendChild(d);
      setTimeout(()=>d.remove(), 3200);
    },

    /* --- Tabla genérica ordenable --- */
    table({cols, rows, sortKey, sortDir, onSort, onRow, foot, empty}){
      if(!rows.length) return empty || UI.empty('Sin resultados','Probá cambiando los filtros.');
      const th = cols.map(c => {
        const on = c.key===sortKey;
        return `<th class="${c.num?'num ':''}${c.key&&onSort?'sortable ':''}${on?'sorted':''}"
          ${c.key&&onSort?`onclick="${onSort}('${c.key}')"`:''}
          ${c.w?`style="width:${c.w}"`:''}>${c.label}${
            c.key&&onSort?`<span class="arr">${on?(sortDir>0?'↑':'↓'):'↕'}</span>`:''}</th>`;
      }).join('');
      const tb = rows.map((r,i) => `<tr class="${onRow?'clickable':''}"
        ${onRow?`onclick="${onRow}(${i})"`:''}>${
        cols.map(c=>`<td class="${c.num?'num ':''}${c.cls||''}">${r[c.key===undefined?c.f:c.key]!==undefined&&c.render?c.render(r):(c.render?c.render(r):esc(r[c.key]))}</td>`).join('')
      }</tr>`).join('');
      return `<div class="tbl-wrap"><table class="tbl">
        <thead><tr>${th}</tr></thead><tbody>${tb}</tbody>
        ${foot?`<tfoot>${foot}</tfoot>`:''}</table></div>`;
    },

    donut(segs, total, label){
      const R=68, C=2*Math.PI*R; let off=0;
      const arcs = segs.filter(s=>s.n>0).map(s => {
        const frac = total? s.n/total : 0;
        const el = `<circle r="${R}" cx="84" cy="84" fill="none" stroke="${s.color}"
          stroke-width="26" stroke-dasharray="${frac*C} ${C}"
          stroke-dashoffset="${-off*C}" transform="rotate(-90 84 84)"/>`;
        off += frac; return el;
      }).join('');
      const leg = segs.map(s => `<div class="legend-i">
        <span class="sw" style="background:${s.color}"></span>
        <span class="nm">${esc(s.label)}</span>
        <span class="vl">${s.n.toLocaleString('es-AR')}</span>
        <span class="pc">${total?((s.n/total)*100).toFixed(1).replace('.',',')+'%':'—'}</span>
      </div>`).join('');
      return `<div class="donut-wrap">
        <div class="donut"><svg width="168" height="168" viewBox="0 0 168 168">
          <circle r="${R}" cx="84" cy="84" fill="none" stroke="var(--line2)" stroke-width="26"/>
          ${arcs}</svg>
          <div class="donut-mid"><div>
            <div class="n">${total.toLocaleString('es-AR')}</div>
            <div class="l">${esc(label||'')}</div>
          </div></div>
        </div>
        <div class="legend">${leg}</div>
      </div>`;
    }
  };
})();

/* ============================================================
   CAPA 4 · ROUTER + NAVEGACIÓN
   ============================================================ */
const Router = (() => {
  /* Dos solapas, dos bases separadas, un solo login. */
  const MODULOS = [
    {id:'fab',  pill:'Fábrica', url:'fabrica/',
     nombre:'Fábrica',
     desc:'Qué cuesta producir cada mueble',
     inicio:'fab.familias',
     paginas:[
       {id:'fab.familias',    label:'Familias',      icon:'box'},
       {id:'fab.products',    label:'Productos',     icon:'tag'},
       {id:'fab.materiales',  label:'Materiales',    icon:'imp'},
       {id:'fab.labor',       label:'Mano de obra',  icon:'clock'},
       {id:'fab.variaciones', label:'Variaciones',   icon:'sim'},
       {id:'fab.config',      label:'Configuración', icon:'gear'}
     ]},
    {id:'prov', pill:'Proveedores', url:'proveedores/',
     nombre:'Proveedores',
     desc:'Qué cuesta comprarlo y qué margen deja',
     inicio:'resumen',
     paginas:[
       {id:'resumen',      label:'Resumen',                 icon:'home'},
       {id:'productos',    label:'Productos',               icon:'box'},
       {id:'cotizar',      label:'Por cotizar',             icon:'tag'},
       {id:'rentabilidad', label:'Análisis de rentabilidad',icon:'chart'},
       {id:'simulador',    label:'Simulador de precios',    icon:'sim'},
       {id:'costos',       label:'Actualización de costos', icon:'refresh'},
       {id:'listaCostos',  label:'Lista de costos',         icon:'tag'},
       {id:'categorias',   label:'Categorías y reglas',     icon:'tag'},
       {id:'modelos',      label:'Modelos',                 icon:'box', oculto:true},
       {id:'pendientes',   label:'Pendientes',              icon:'clock', badge:()=>(typeof Views!=='undefined'?Views.nPendientes():0)},
       {id:'historial',    label:'Historial',               icon:'hist'},
       {id:'config',       label:'Configuración',           icon:'gear'},
       {id:'importar',     label:'Importar / Exportar',     icon:'imp'}
     ]}
  ];
  const PAGES = MODULOS.flatMap(m=>m.paginas);
  const MEM = 'bh-cost-ultimo-modulo';
  let actual = 'portada';
  const esFab = id => String(id).startsWith('fab.');
  const esPortada = id => id === 'portada';
  const moduloDe = id => esFab(id) ? MODULOS[0] : MODULOS[1];

  function nav(){
    const enPortada = esPortada(actual);
    const mod = enPortada ? null : moduloDe(actual);

    /* La portada se muestra sin barra lateral */
    const app = document.querySelector('.app');
    if(app) app.classList.toggle('en-portada', enPortada);

    /* --- Solapas del header: recién aparecen dentro de un módulo --- */
    const pills = document.getElementById('bhPills');
    if(pills) pills.innerHTML = enPortada ? '' : MODULOS.map(m =>
      `<button class="bh-pill ${m.id===mod.id?'on':''}" onclick="Router.abrirModulo('${m.id}')">${m.pill}</button>`).join('');

    /* --- Usuario --- */
    const mail = (Supa.usuario||{}).email || '';
    const tu = document.getElementById('topUser');
    if(tu) tu.textContent = mail ? mail.split('@')[0] : '—';
    const av = document.getElementById('topAvatar');
    if(av) av.textContent = (mail.slice(0,2) || 'BH').toUpperCase();

    if(enPortada){
      const n = document.getElementById('nav'); if(n) n.innerHTML = '';
      const p = document.getElementById('sideFoot'); if(p) p.innerHTML = '';
      return;
    }

    /* --- Cabecera del módulo en la barra lateral --- */
    const cab = document.getElementById('moduloCabecera');
    if(cab) cab.innerHTML = `<div class="nom">${mod.nombre}</div><div class="desc">${mod.desc}</div>`;

    /* --- Solo las pantallas del módulo activo --- */
    document.getElementById('nav').innerHTML = mod.paginas.filter(p=>!p.oculto).map(p => {
      const n = p.badge ? p.badge() : 0;
      return `<button class="nav-item ${p.id===actual?'active':''}" onclick="Router.go('${p.id}')">
        ${Icon(p.icon)}<span>${p.label}</span>
        ${n?`<span class="badge-n">${n>999?'999+':n}</span>`:''}
      </button>`;
    }).join('');

    /* --- Pie del sidebar: solo tiene sentido en Proveedores --- */
    const pie = document.getElementById('sideFoot');
    if(!pie) return;
    if(mod.id === 'fab'){ pie.innerHTML = ''; return; }
    const cfg = Data.s.config;
    pie.innerHTML = `
      <div class="side-card">
        <div style="display:flex;align-items:center"><div class="lbl">Descuento habitual</div>
        <button onclick="Router.go('config')" style="margin-left:auto;color:#8DA5C0;width:20px;height:20px;display:grid;place-items:center">${Icon('gear')}</button></div>
        <div class="val">${(cfg.descuento*100).toFixed(0)} %</div></div>
      <div class="side-card"><div class="lbl">Markup objetivo general</div>
        <div class="val">${cfg.targetOtro.toFixed(2).replace('.',',')}</div></div>
      <div class="side-card"><div class="lbl">Margen mínimo general</div>
        <div class="val">${(cfg.margenMinimo*100).toFixed(0)} %</div></div>`;
  }

  return {
    PAGES, MODULOS,

    /** Cambiar de solapa es ir a la página del otro módulo.
     *  La sesión se mantiene: la guarda Supabase para todo el sitio. */
    abrirModulo(idMod){
      const m = MODULOS.find(x=>x.id===idMod); if(!m) return;
      if(m.id === (window.PAGINA||'')) return;      // ya estás ahí
      Nav.ir(Nav.raiz() + m.url);
    },
    ultimoModulo(){
      try{ return localStorage.getItem(MEM) || 'prov'; }catch(e){ return 'prov'; }
    },
    /** Configuración del módulo en el que estés parado. */
    irAConfig(){
      /* Desde la entrada no hay pantalla de configuración: se entra al módulo. */
      if((window.PAGINA||'portada') === 'portada'){ Nav.ir(Nav.raiz() + 'proveedores/'); return; }
      Router.go(esFab(actual) ? 'fab.config' : 'config');
    },
    /** Volver a la elección de módulo (es la página de entrada). */
    inicio(){
      if((window.PAGINA||'portada') === 'portada') Router.go('portada');
      else Nav.ir(Nav.raiz());
    },

    async go(id){
      actual = id; UI.closeAll(); nav();
      const v = document.getElementById('view');

      if(esPortada(id)){
        v.innerHTML = Portada.render();
        Portada.after();
        window.scrollTo(0,0);
        return;
      }

      if(esFab(id)){
        v.innerHTML = `<div class="mod-fab" id="fabRoot">
          <div class="loading" style="padding:40px;text-align:center;color:var(--sec)">Cargando datos de fábrica…</div></div>`;
        try{
          await Fabrica.boot(Supa.cliente, Supa.usuario);
          Fabrica.irA(id.slice(4));
        }catch(e){
          v.innerHTML = `<div class="card"><div class="card-body">
            <div class="warn-box"><b>No pude cargar el módulo de Fábrica.</b><br>${esc(e.message||e)}</div>
          </div></div>`;
        }
      } else {
        v.innerHTML = (Views[id] ? Views[id]() : '<div class="card"><div class="card-body">Sección en construcción.</div></div>');
        if(Views[id+'_after']) Views[id+'_after']();
      }
      window.scrollTo(0,0);
    },
    refresh(){ Router.go(actual); },
    actual: () => actual,
    esFab, esPortada, nav
  };
})();
