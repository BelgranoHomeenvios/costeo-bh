/* ============================================================
   CAPA 1 · DATA  (estado en memoria + persistencia en Supabase)

   El motor de cálculo sigue trabajando sobre los mismos arrays en
   memoria que antes. Lo único que cambió es de dónde se llenan y
   a dónde se guardan.
   ============================================================ */
const Data = (() => {

  const CFG_DEF = {
    descuento:0.35,          // promo habitual sobre precio de lista
    targetNegro:2.08,        // markup objetivo si lleva negro
    targetOtro:2.00,         // markup objetivo resto
    umbralVerde:1.90,        // semáforo
    umbralAmarillo:1.60,
    margenMinimo:0.45,       // margen mínimo aceptable
    umbralSospecha:3.5,      // markup por encima del cual el dato es sospechoso
    redondeo:1000,           // redondeo del precio sugerido
    adicionales:[],          // extras por modelo: {id,nombre,tipo:'pct'|'fijo',valor,tiersDefault:[]}
    modeloReglas:{},         // regla por modelo: 'catId::modelo' → {fuente,adicionales:[{id,tiers}]}
    hierros:[],              // lista única: {id,largo,alto,prof,precio,categorias:[],modelos:[]}
    hierrosPendientes:[]     // modelos que llevan hierro pero falta cargar el precio
  };

  const s = {
    productos:[], sinCosto:[], categorias:[], costosBase:[],
    indices:{}, modeloAdic:[], config:{...CFG_DEF}, historial:[]
  };

  /* ---- traducción entre la base (snake_case) y la app (camelCase) ---- */
  const deDB = r => ({
    id:r.id, categoriaId:r.categoria_id, modelo:r.modelo, variantes:r.variantes||{},
    medida:r.medida, medidaCosteo:r.medida_costeo, tier:r.tier, atributo:r.atributo,
    costoManual:Number(r.costo_manual)||0, adicional:Number(r.adicional)||0,
    ajusteManual:Number(r.ajuste_manual)||0, precioLista:Number(r.precio_lista)||0,
    obs:r.obs||''
  });
  const aDB = p => ({
    id:p.id, categoria_id:p.categoriaId, modelo:p.modelo, variantes:p.variantes||{},
    medida:p.medida||null, medida_costeo:p.medidaCosteo||null, tier:p.tier||null,
    atributo:p.atributo||null, costo_manual:Number(p.costoManual)||0,
    adicional:Number(p.adicional)||0, ajuste_manual:Number(p.ajusteManual)||0,
    precio_lista:Number(p.precioLista)||0, obs:p.obs||null
  });

  function mergeCats(){
    const todas = DEFAULT_CATEGORIAS.concat(EXTRA_CATEGORIAS);
    const vistas = new Set(), unicas = [];
    for(const c of todas){ if(!vistas.has(c.id)){ vistas.add(c.id); unicas.push(c); } }
    return unicas;
  }

  return {
    s, CFG_DEF, deDB, aDB,

    /** Carga todo desde Supabase a memoria. Requiere sesión iniciada. */
    async load(avisar){
      s.categorias = mergeCats();
      s.indices    = {...DEFAULT_INDICES};
      s.modeloAdic = DEFAULT_MODELO_ADIC.slice();

      avisar && avisar('Trayendo tabla de costos…');
      const cb = await Supa.traerTodo('costos_base');
      s.costosBase = cb.map(r=>({categoriaId:r.categoria_id, medida:r.medida,
                                 tier:r.tier, costo:Number(r.costo)||0}));

      avisar && avisar('Trayendo catálogo…');
      const pr = await Supa.traerTodo('productos');
      s.productos = pr.map(deDB);

      avisar && avisar('Trayendo configuración e historial…');
      const {data:cfgRow} = await Supa.rent.from('config').select('valores').eq('id',1).maybeSingle();
      s.config = {...CFG_DEF, ...((cfgRow||{}).valores||{})};

      const {data:hist} = await Supa.rent.from('historial')
        .select('*').order('fecha',{ascending:false}).limit(300);
      s.historial = (hist||[]).map(h=>({id:h.id, fecha:h.fecha, tipo:h.tipo,
        objetivo:h.objetivo, detalle:h.detalle, productId:h.product_id, usuario:h.usuario}));

      const {data:sc} = await Supa.rent.from('productos_sin_costo').select('*').limit(1000);
      s.sinCosto = (sc||[]).map(r=>({id:r.id, categoriaId:r.categoria_id, modelo:r.modelo,
        variantes:r.variantes||{}, medida:r.medida, precioLista:Number(r.precio_lista)||0}));
    },

    /** Guarda UN producto (edición puntual). No toca los otros 5.526. */
    async saveProducto(p){
      const {error} = await Supa.rent.from('productos').upsert(aDB(p));
      if(error){ UI.toast('No pude guardar: '+error.message,'err'); return false; }
      return true;
    },

    /** Guarda muchos productos (actualización masiva). */
    async saveProductos(arr, avisar){
      try{ await Supa.subirEnTandas('productos', arr.map(aDB), 'id', avisar); return true; }
      catch(e){ UI.toast('No pude guardar: '+e.message,'err'); return false; }
    },

    async saveCB(){
      try{
        await Supa.subirEnTandas('costos_base',
          s.costosBase.map(x=>({categoria_id:x.categoriaId, medida:x.medida,
                                tier:x.tier, costo:x.costo})),
          'categoria_id,medida,tier');
        return true;
      }catch(e){ UI.toast('No pude guardar los costos: '+e.message,'err'); return false; }
    },

    async saveCfg(){
      const {error} = await Supa.rent.from('config')
        .upsert({id:1, valores:s.config});
      if(error) UI.toast('No pude guardar la configuración: '+error.message,'err');
    },

    /** Guarda la lista de adicionales (viven dentro de la configuración). */
    async saveAdicionales(){
      const {error} = await Supa.rent.from('config').upsert({id:1, valores:s.config});
      if(error){ UI.toast('No pude guardar los adicionales: '+error.message,'err'); return false; }
      return true;
    },

    /** Guarda la regla de un modelo (fuente + adicionales con sus terminaciones). */
    async saveModeloRegla(catId, modelo, regla){
      if(!s.config.modeloReglas) s.config.modeloReglas = {};
      const key = catId + '::' + String(modelo||'').toLowerCase();
      if(regla) s.config.modeloReglas[key] = regla;
      else delete s.config.modeloReglas[key];
      const {error} = await Supa.rent.from('config').upsert({id:1, valores:s.config});
      if(error){ UI.toast('No pude guardar la regla del modelo: '+error.message,'err'); return false; }
      return true;
    },

    /** Guarda la lista de hierros (viven dentro de la configuración). */
    async saveHierros(){
      const {error} = await Supa.rent.from('config').upsert({id:1, valores:s.config});
      if(error){ UI.toast('No pude guardar los hierros: '+error.message,'err'); return false; }
      return true;
    },

    /** Edita/crea una fila de la tabla de costos (una celda: categoría+medida+tier). */
    async guardarCostoCelda(categoriaId, medida, tier, costo){
      const fila = {categoria_id:categoriaId, medida, tier, costo:Number(costo)||0};
      const {error} = await Supa.rent.from('costos_base')
        .upsert(fila, {onConflict:'categoria_id,medida,tier'});
      if(error){ UI.toast('No pude guardar el costo: '+error.message,'err'); return false; }
      const k = x => `${x.categoriaId}|${x.medida}|${x.tier}`;
      const nueva = {categoriaId, medida, tier, costo:Number(costo)||0};
      s.costosBase = s.costosBase.filter(x=>k(x)!==k(nueva)).concat([nueva]);
      return true;
    },

    /** Registra un cambio. Queda con el email de quien lo hizo. */
    async log(tipo, objetivo, detalle, productId){
      const fila = {tipo, objetivo, detalle, product_id:productId||null,
                    usuario:(Supa.usuario||{}).email||'—'};
      s.historial.unshift({...fila, id:Date.now(), fecha:new Date().toISOString(),
                           productId:productId||null, usuario:fila.usuario});
      if(s.historial.length>300) s.historial.length = 300;
      const {error} = await Supa.rent.from('historial').insert(fila);
      if(error) console.warn('historial:', error.message);
    },

    cat: id => s.categorias.find(c=>c.id===id),
    catNombre: id => (Data.cat(id)||{}).nombre || id,

    /* ---------- IMPORTACIONES (suben a Supabase) ---------- */

    async importarCostos(arr, avisar){
      const filas = arr.map(x=>({categoria_id:x.categoriaId, medida:x.medida,
                                 tier:x.tier, costo:Number(x.costo)||0}));
      await Supa.subirEnTandas('costos_base', filas, 'categoria_id,medida,tier', avisar);
      const k = x => `${x.categoriaId}|${x.medida}|${x.tier}`;
      const nuevos = new Map(arr.map(x=>[k(x), x]));
      s.costosBase = s.costosBase.filter(x=>!nuevos.has(k(x))).concat([...nuevos.values()]);
      await Data.log('Importación','Tabla de costos base', `${arr.length} filas de costo`);
      return {n:arr.length};
    },

    /** Sube el catálogo. Reemplaza las categorías que trae el archivo. */
    async importarCatalogo(arr, avisar){
      const cats = [...new Set(arr.map(p=>p.categoriaId))];
      avisar && avisar('Borrando versión anterior de esas categorías…');
      for(const c of cats){
        const {error} = await Supa.rent.from('productos').delete().eq('categoria_id', c);
        if(error) throw error;
      }
      const filas = arr.map(p => aDB({...p, id:p.id && /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : uid()}));
      avisar && avisar('Subiendo productos…');
      await Supa.subirEnTandas('productos', filas, 'id', avisar);

      s.productos = s.productos.filter(p=>!cats.includes(p.categoriaId))
                               .concat(filas.map(deDB));
      await Data.log('Importación','Catálogo costeado',
        `${arr.length} productos · ${cats.length} categorías`);
      return {n:arr.length, cats:cats.length};
    },

    async importarSinCosto(arr, avisar){
      await Supa.rent.from('productos_sin_costo').delete().neq('id','00000000-0000-0000-0000-000000000000');
      const filas = arr.map(p=>({categoria_id:p.categoriaId, modelo:p.modelo,
        variantes:p.variantes||{}, medida:p.medida||null,
        precio_lista:Number(p.precioLista)||0}));
      await Supa.subirEnTandas('productos_sin_costo', filas, null, avisar);
      s.sinCosto = arr.map(p=>({...p, id:p.id||uid()}));
      await Data.log('Importación','Productos sin costo', `${arr.length} productos`);
      return {n:arr.length};
    }
  };
})();

/* ============================================================
   CAPA 2 · CALC  (motor de costeo y rentabilidad — sin UI)
   ============================================================ */
const Calc = (() => {

  /** Costo base de tabla para (categoría, medida, terminación). */
  function costoTabla(catId, medida, tier){
    if(!catId || !medida || !tier) return 0;
    const r = Data.s.costosBase.find(x =>
      x.categoriaId===catId && x.medida===medida && x.tier===tier);
    return r ? Number(r.costo)||0 : 0;
  }

  /** Adicionales que aplican a un producto, según la regla de su modelo y la
   *  terminación (tier) del producto. Estructura:
   *  - Definición del adicional: {id, nombre, tipo:'pct'|'fijo', valor, tiersDefault:[...]}
   *  - Regla por modelo (config.modeloReglas['catId::modelo']):
   *      {fuente:'lista'|'propio', adicionales:[{id, tiers:[...] (opcional, pisa el default)}]}
   *  Un adicional solo suma si la terminación del producto está en sus tiers.
   *  Los tiers vacíos o ausentes = aplica a todas. */
  function adicionales(p){
    let pct = 0, fijo = 0;
    const defs = Data.s.config.adicionales || [];
    const todasTier = TIERS.map(t=>t.key);
    const sumar = (a, tiers) => {
      const t = (tiers && tiers.length) ? tiers : (a.tiersDefault && a.tiersDefault.length ? a.tiersDefault : todasTier);
      if(!t.includes(p.tier)) return;
      if(a.tipo === 'pct') pct += (Number(a.valor)||0)/100;
      else fijo += Number(a.valor)||0;
    };
    const key = p.categoriaId + '::' + (p.modelo||'').toLowerCase();
    const regla = (Data.s.config.modeloReglas||{})[key];
    if(regla && regla.adicionales){
      regla.adicionales.forEach(link=>{
        const a = defs.find(d=>d.id===link.id); if(a) sumar(a, link.tiers);
      });
    } else {
      // fallback: adicionales viejos que matchean por nombre de modelo
      const modelo = (p.modelo||'').toLowerCase();
      defs.forEach(a=>{
        if(!a.modelos) return;
        if(a.categoriaId && a.categoriaId !== p.categoriaId) return;
        if(!(a.modelos||[]).some(m => m && modelo.includes(String(m).toLowerCase()))) return;
        sumar(a, a.tiers);
      });
    }
    return {pct, fijo};
  }

  /** ¿El producto lleva alguna terminación negra? (define markup objetivo) */
  function llevaNegro(p){
    const v = Object.values(p.variantes||{}).join(' ').toLowerCase();
    return v.includes('negr');
  }

  /** Extrae [largo, alto] de una medida de texto tipo "100x40x30".
   *  Asume largo = primer número, alto = último número. */
  function largoAlto(med){
    const ns = String(med||'').toLowerCase().replace(/×/g,'x').match(/[\d.]+/g);
    if(!ns || !ns.length) return [null, null];
    const nums = ns.map(Number);
    return [nums[0], nums[nums.length-1]];
  }

  /** Hierro que le corresponde a un producto: debe estar asignado a su
   *  categoría o modelo, y coincidir el LARGO con la medida del producto.
   *  El alto del hierro es informativo (no se usa para el match), porque
   *  el hierro es una pieza aparte cuya altura no es la del mueble. */
  function hierroDe(p){
    const hierros = Data.s.config.hierros || [];
    if(!hierros.length) return null;
    const [lp] = largoAlto(p.medidaCosteo || p.medida);
    if(lp==null) return null;
    const modelo = (p.modelo||'').toLowerCase();
    return hierros.find(h=>{
      const aplicaCat = (h.categorias||[]).includes(p.categoriaId);
      const aplicaMod = (h.modelos||[]).some(m => m && modelo.includes(String(m).toLowerCase()));
      if(!aplicaCat && !aplicaMod) return false;
      return Number(h.largo)===lp;
    }) || null;
  }

  /** Cálculo completo de un producto. Devuelve todos los indicadores. */
  function producto(p){
    const cfg = Data.s.config;
    const base = Number(p.costoManual)>0
      ? Number(p.costoManual)
      : costoTabla(p.categoriaId, p.medidaCosteo, p.tier);
    const {pct, fijo} = adicionales(p);
    const ajuste = Number(p.ajusteManual)||0;
    const hierro = hierroDe(p);
    const costoHierro = hierro ? Number(hierro.precio)||0 : 0;
    const costoFinal = base>0 ? base*(1+pct) + fijo + costoHierro + Number(p.adicional||0) + ajuste : 0;

    const lista = Number(p.precioLista)||0;
    const efectivo = lista * (1 - cfg.descuento);
    const markup  = costoFinal>0 ? efectivo/costoFinal : 0;
    const ganancia = costoFinal>0 ? efectivo - costoFinal : 0;
    const margen  = efectivo>0 && costoFinal>0 ? ganancia/efectivo : 0;

    const target = llevaNegro(p) ? cfg.targetNegro : cfg.targetOtro;
    // Precio de lista que haría falta para alcanzar el markup objetivo
    let sugerido = costoFinal>0 ? (costoFinal*target)/(1-cfg.descuento) : 0;
    if(cfg.redondeo>0 && sugerido>0) sugerido = Math.ceil(sugerido/cfg.redondeo)*cfg.redondeo;
    const aumentoPct = (lista>0 && sugerido>0) ? (sugerido/lista - 1) : 0;

    let estado = 'sincosto';
    if(costoFinal>0 && lista>0){
      if(markup >= cfg.umbralVerde) estado = 'verde';
      else if(markup >= cfg.umbralAmarillo) estado = 'amarillo';
      else estado = 'rojo';
    }
    return {
      base, costoFinal, lista, efectivo, markup, ganancia, margen,
      target, sugerido, aumentoPct, estado, tieneCosto: costoFinal>0,
      baseDeTabla: Number(p.costoManual)>0 ? false : base>0,
      adicPct: pct, adicFijo: fijo
    };
  }

  /** Calcula un producto con overrides temporales (para el simulador). */
  function simular(p, over){
    const cfg = {...Data.s.config, ...(over.config||{})};
    const backupCfg = Data.s.config;
    Data.s.config = cfg;
    const p2 = {...p};
    if(over.costoManual != null) p2.costoManual = over.costoManual;
    if(over.precioLista != null) p2.precioLista = over.precioLista;
    if(over.adicional  != null) p2.adicional  = over.adicional;
    const r = producto(p2);
    Data.s.config = backupCfg;
    return r;
  }

  /** Agrega una lista de productos calculados en KPIs. */
  function resumen(rows){
    const t = {
      total: rows.length, costeados:0, sinCosto:0,
      verde:0, amarillo:0, rojo:0,
      margenProm:0, markupProm:0, costoProm:0, precioProm:0,
      paraAumentar:0, gananciaTotal:0
    };
    let sm=0, sk=0, sc=0, sp=0, n=0;
    rows.forEach(({c}) => {
      if(c.tieneCosto){
        t.costeados++; n++;
        sm+=c.margen; sk+=c.markup; sc+=c.costoFinal; sp+=c.lista;
        t.gananciaTotal += c.ganancia;
        if(c.aumentoPct > 0.001) t.paraAumentar++;
      } else t.sinCosto++;
      if(c.estado==='verde') t.verde++;
      else if(c.estado==='amarillo') t.amarillo++;
      else if(c.estado==='rojo') t.rojo++;
    });
    if(n){ t.margenProm=sm/n; t.markupProm=sk/n; t.costoProm=sc/n; t.precioProm=sp/n; }
    return t;
  }

  /** Calcula todo el catálogo (o un subconjunto). */
  function todos(prods){
    return (prods||Data.s.productos).map(p => ({p, c: producto(p)}));
  }

  return {costoTabla, adicionales, producto, simular, resumen, todos, llevaNegro, hierroDe};
})();

