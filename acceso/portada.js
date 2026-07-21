/* ============================================================
   ACCESO · PORTADA
   Elección de módulo, posterior al login.

   No carga el código de Fábrica ni de Proveedores: pide los
   conteos directo a la base. Así la entrada es liviana y no
   depende de ninguno de los dos módulos.
   ============================================================ */
const Portada = (() => {

  /** Cuenta filas sin traerlas. */
  async function contar(cliente, tabla, filtro){
    let q = cliente.from(tabla).select('*', {count:'exact', head:true});
    if(filtro) q = filtro(q);
    const {count, error} = await q;
    if(error) throw error;
    return count || 0;
  }

  function tarjeta(id, url, ico, bg, color, nombre, desc){
    return `
      <a class="mod-card" href="${url}">
        <div class="mod-card-ico" style="background:${bg};color:${color}">${Icon(ico)}</div>
        <div>
          <div class="mod-card-nom">${nombre}</div>
          <div class="mod-card-desc">${desc}</div>
        </div>
        <div class="mod-card-datos" id="datos-${id}">
          <div class="mod-card-dato"><div class="n t-mut">&hellip;</div><div class="l">cargando</div></div>
        </div>
        <div class="mod-card-entrar">Entrar &rarr;</div>
      </a>`;
  }

  function render(){
    return `
      <div class="portada">
        <div class="portada-tit">Belgrano Cost</div>
        <div class="portada-sub">¿Con qué costo vas a trabajar hoy?</div>
        <div class="portada-grid">
          ${tarjeta('fab','fabrica/','box','var(--green-l)','var(--green)','Fábrica',
            'Qué te cuesta producir cada mueble: materiales, mano de obra y recetas.')}
          ${tarjeta('prov','proveedores/','tag','var(--blue-l)','var(--blue)','Proveedores',
            'Qué te cuesta comprarlo y qué margen deja venderlo.')}
        </div>
      </div>`;
  }

  const dato = (n, l, cls) =>
    `<div class="mod-card-dato"><div class="n ${cls||''}">${n}</div><div class="l">${l}</div></div>`;
  const nodisp = `<div class="mod-card-dato"><div class="n t-mut">&mdash;</div><div class="l">no disponible</div></div>`;

  /** Completa las dos tarjetas sin bloquear la pantalla. */
  async function after(){
    const cli = Supa.cliente;

    /* --- Fábrica: esquema public --- */
    (async () => {
      const caja = document.getElementById('datos-fab'); if(!caja) return;
      try{
        const [fam, mat, ins, matSin, insSin] = await Promise.all([
          contar(cli,'familias'), contar(cli,'materiales'), contar(cli,'insumos'),
          contar(cli,'materiales', q=>q.or('precio.is.null,precio.eq.0')),
          contar(cli,'insumos',    q=>q.or('precio.is.null,precio.eq.0'))
        ]);
        const sinPrecio = matSin + insSin;
        caja.innerHTML = dato(fam.toLocaleString('es-AR'),'familias')
          + dato((mat+ins).toLocaleString('es-AR'),'insumos')
          + dato(sinPrecio.toLocaleString('es-AR'),'sin precio', sinPrecio?'t-red':'t-green');
      }catch(e){ caja.innerHTML = nodisp; }
    })();

    /* --- Proveedores: esquema rentabilidad --- */
    (async () => {
      const caja = document.getElementById('datos-prov'); if(!caja) return;
      try{
        const rent = Supa.rent;
        const [total, conCosto] = await Promise.all([
          contar(rent,'productos'),
          contar(rent,'productos', q=>q.gt('costo_manual', 0))
        ]);
        caja.innerHTML = total
          ? dato(total.toLocaleString('es-AR'),'productos')
            + dato(Math.round(conCosto/total*100)+'%','con costo')
            + dato((total-conCosto).toLocaleString('es-AR'),'pendientes',
                   (total-conCosto)?'t-amber':'t-green')
          : dato('&mdash;','sin datos cargados');
      }catch(e){ caja.innerHTML = nodisp; }
    })();
  }

  return {render, after};
})();
