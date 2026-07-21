/* ============================================================
   CAPA 6 · ACCESO  (configuración de la base, login y arranque)
   ============================================================ */
const Acceso = (() => {

  function pantalla(titulo, sub, cuerpo, pie){
    document.body.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;background:var(--navy-900);padding:20px">
        <div style="width:100%;max-width:430px">
          <div style="display:flex;align-items:center;gap:11px;margin-bottom:22px;justify-content:center">
            <div class="brand-logo" style="width:38px;height:38px;font-size:14px">BH</div>
            <div>
              <div style="color:#fff;font-weight:700;font-size:15px;letter-spacing:.2px">Belgrano Cost</div>
              <div style="color:#8DA5C0;font-size:11.5px">Costos de fábrica y de proveedores</div>
            </div>
          </div>
          <div class="card" style="box-shadow:var(--sh-lg)">
            <div class="card-body" style="padding:24px">
              <h2 style="font-size:17px;font-weight:700;margin-bottom:4px">${titulo}</h2>
              <div class="hint" style="margin-bottom:18px">${sub}</div>
              ${cuerpo}
            </div>
          </div>
          ${pie?`<div style="text-align:center;margin-top:16px;color:#7E96B4;font-size:11.5px;line-height:1.6">${pie}</div>`:''}
        </div>
      </div>
      <div class="toasts" id="toasts"></div>`;
  }

  /* ---------- 1 · Conectar con la base ---------- */
  function verConexion(err, url, key){
    pantalla('Conectar con la base',
      'Pegá los datos de tu proyecto de Supabase. Se guardan en este navegador, una sola vez.',
      `${err?`<div class="warn-box mb">${esc(err)}</div>`:''}
       <label class="inp-lbl">URL del proyecto</label>
       <input class="inp" id="cxUrl" style="width:100%;margin-bottom:13px" value="${esc(url||'')}"
         placeholder="https://xxxxxxxx.supabase.co" autocomplete="off">
       <label class="inp-lbl">Clave anon / publishable</label>
       <input class="inp" id="cxKey" style="width:100%;margin-bottom:16px" value="${esc(key||'')}"
         placeholder="eyJhbGciOi… o sb_publishable_…" autocomplete="off">
       <button class="btn btn-blue" style="width:100%" onclick="Acceso.guardarConexion()">
         Conectar</button>
       <div class="info-box" style="margin-top:16px">
         <b>Antes de conectar</b>, en Supabase: 1) ejecutá <b>schema-proveedores.sql</b> en el
         SQL Editor, y 2) agregá <b>rentabilidad</b> en Settings → API → Exposed schemas.
       </div>`,
      'La clave anon es pública por diseño. Lo que protege los datos son las<br>políticas RLS: sin sesión iniciada, la base no devuelve nada.');
    setTimeout(()=>document.getElementById('cxUrl').focus(), 60);
  }

  async function guardarConexion(){
    const url = document.getElementById('cxUrl').value.trim();
    const key = document.getElementById('cxKey').value.trim();
    if(!url || !key){ UI.toast('Completá los dos campos','err'); return; }
    if(!/^https:\/\/.+\.supabase\.co/.test(url)){
      UI.toast('La URL debería verse como https://xxxx.supabase.co','err'); return; }
    try{
      await Supa.configurar(url, key);
      verLogin();
    }catch(e){ verConexion(e.message, url, key); }   // no perder lo tipeado
  }

  /* ---------- 2 · Iniciar sesión ---------- */
  function verLogin(err){
    pantalla('Iniciar sesión',
      'Acceso exclusivo de Dirección.',
      `${err?`<div class="warn-box mb">${esc(err)}</div>`:''}
       <label class="inp-lbl">Email</label>
       <input class="inp" id="lgMail" type="email" style="width:100%;margin-bottom:13px"
         autocomplete="username" onkeydown="if(event.key==='Enter')document.getElementById('lgPass').focus()">
       <label class="inp-lbl">Contraseña</label>
       <input class="inp" id="lgPass" type="password" style="width:100%;margin-bottom:16px"
         autocomplete="current-password" onkeydown="if(event.key==='Enter')Acceso.entrar()">
       <button class="btn btn-blue" style="width:100%" id="lgBtn" onclick="Acceso.entrar()">
         Entrar</button>`,
      `Conectado a ${esc((Supa.config||{}).url||'')}<br>
       <a href="#" onclick="Acceso.cambiarConexion();return false" style="color:#8DA5C0">cambiar de base</a>`);
    setTimeout(()=>document.getElementById('lgMail').focus(), 60);
  }

  async function entrar(){
    const mail = document.getElementById('lgMail').value.trim();
    const pass = document.getElementById('lgPass').value;
    if(!mail || !pass){ UI.toast('Completá email y contraseña','err'); return; }
    const btn = document.getElementById('lgBtn');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try{
      await Supa.entrar(mail, pass);
      await arrancarApp();
    }catch(e){
      const msg = /Invalid login/i.test(e.message)
        ? 'Email o contraseña incorrectos.' : e.message;
      verLogin(msg);
    }
  }

  function cambiarConexion(){
    const c = Supa.config || {};
    Supa.olvidarConfig();
    verConexion(null, c.url, c.key);
  }

  /* ---------- 3 · Cargando ---------- */
  function verCargando(txt){
    pantalla('Cargando datos', 'Un momento.',
      `<div style="display:flex;align-items:center;gap:12px">
         <div style="width:20px;height:20px;border:2.5px solid var(--line);
           border-top-color:var(--blue);border-radius:50%;animation:giro .8s linear infinite"></div>
         <span id="cargaTxt" class="t-sec">${esc(txt||'Conectando…')}</span>
       </div>
       <style>@keyframes giro{to{transform:rotate(360deg)}}</style>`);
  }
  const avisar = txt => {
    const el = document.getElementById('cargaTxt');
    if(el) el.textContent = txt;
  };

  /* ---------- 4 · Arranque de la app ---------- */
  /* La app son tres páginas. Cada una declara qué es antes de cargar
     este archivo, con window.PAGINA = 'portada' | 'fab' | 'prov'. */
  const pagina = () => window.PAGINA || 'portada';

  async function arrancarApp(){
    document.body.innerHTML = LAYOUT;

    if(pagina() === 'portada'){
      Router.go('portada');
      return;
    }

    if(pagina() === 'fab'){
      Router.go('fab.familias');
      return;
    }

    /* Proveedores: necesita traer su catálogo antes de mostrar nada. */
    verCargando('Trayendo datos…');
    try{
      await Data.load(avisar);
      document.body.innerHTML = LAYOUT;
      Router.go('resumen');
    }catch(e){
      const msg = e.message || String(e);
      pantalla('No pude cargar Proveedores', 'Revisá la conexión o el esquema de la base.',
        `<div class="warn-box mb">${esc(msg)}</div>
         <button class="btn btn-blue" style="width:100%" onclick="location.reload()">Reintentar</button>
         <a class="btn" style="width:100%;margin-top:9px" href="../">Volver a la portada</a>`);
    }
  }

  async function salir(){
    await Supa.salir();
    location.reload();
  }

  /* ---------- Punto de entrada ---------- */
  async function iniciar(){
    if(!window.supabase){
      pantalla('Sin conexión a internet',
        'Esta app necesita internet para conectarse a la base.',
        `<button class="btn btn-blue" style="width:100%" onclick="location.reload()">Reintentar</button>`);
      return;
    }

    const hayCfg = await Supa.init();
    const enEntrada = pagina() === 'portada';

    /* Las páginas de módulo no muestran login: si no hay sesión,
       vuelven a la entrada. La sesión es la misma para las tres. */
    if(!hayCfg || !Supa.conectado()){
      if(!enEntrada){ Nav.volverAEntrada(); return; }
      if(!hayCfg){ verConexion(); return; }
      verLogin(); return;
    }

    await arrancarApp();
  }

  return {iniciar, guardarConexion, entrar, salir, cambiarConexion, verLogin, verConexion};
})();

/* ============================================================
   ARRANQUE
   Las tres páginas cargan este archivo. Espera a que estén todos
   los scripts y recién ahí arranca lo que corresponda según
   window.PAGINA.
   ============================================================ */
(function(){
  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', Acceso.iniciar);
  else Acceso.iniciar();
})();
