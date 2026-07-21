/* ============================================================
   CAPA 0 · SUPABASE  (conexión, sesión y persistencia remota)

   La clave anon es pública a propósito: lo que protege los datos
   son las políticas RLS de la base, que exigen sesión iniciada.
   Sin login, la base devuelve vacío aunque tengan esta clave.
   ============================================================ */
const Supa = (() => {
  const CFG_KEY = 'bh-ccr-conexion';
  let cli = null, cfg = null, user = null;

  function leerCfg(){
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function guardarCfg(url, key){
    cfg = {url:url.trim().replace(/\/$/,''), key:key.trim()};
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  /** Cliente apuntando al esquema de rentabilidad (la fábrica usa public). */
  function rent(){ return cli.schema('rentabilidad'); }

  /** Trae TODAS las filas de una tabla paginando de a 1000
   *  (Supabase corta ahí por defecto y el catálogo tiene 5.527). */
  async function traerTodo(tabla, orden){
    const PASO = 1000; let desde = 0, out = [];
    for(;;){
      let q = rent().from(tabla).select('*').range(desde, desde+PASO-1);
      if(orden) q = q.order(orden, {ascending:false});
      const {data, error} = await q;
      if(error) throw error;
      out = out.concat(data);
      if(data.length < PASO) break;
      desde += PASO;
    }
    return out;
  }

  /** Sube filas en tandas para no pasarse del límite del request. */
  async function subirEnTandas(tabla, filas, onConflict, avisar){
    const PASO = 500;
    for(let i=0; i<filas.length; i+=PASO){
      const tanda = filas.slice(i, i+PASO);
      const q = rent().from(tabla).upsert(tanda, onConflict?{onConflict}:undefined);
      const {error} = await q;
      if(error) throw error;
      if(avisar) avisar(Math.min(i+PASO, filas.length), filas.length);
    }
  }

  return {
    get cliente(){ return cli; },
    get rent(){ return rent(); },   // esquema del módulo de rentabilidad
    get usuario(){ return user; },
    get config(){ return cfg; },
    configurado: () => !!cfg,
    conectado:   () => !!user,

    /** Inicializa el cliente con la config guardada (si existe). */
    async init(){
      cfg = leerCfg();
      if(!cfg || !window.supabase) return false;
      cli = window.supabase.createClient(cfg.url, cfg.key);
      const {data} = await cli.auth.getSession();
      user = data?.session?.user || null;
      return true;
    },

    async configurar(url, key){
      guardarCfg(url, key);
      cli = window.supabase.createClient(cfg.url, cfg.key);
      // prueba de conexión: pega a una tabla del esquema
      const {error} = await cli.schema('rentabilidad').from('config').select('id').limit(1);
      // 401/permiso denegado es esperable sin sesión; lo que no queremos es "no existe"
      if(error && /does not exist|schema|not find/i.test(error.message)){
        throw new Error('Conecté al proyecto, pero no encuentro el esquema "rentabilidad". '+
          'Revisá que hayas ejecutado schema-rentabilidad.sql y que "rentabilidad" esté en '+
          'Settings → API → Exposed schemas.');
      }
      return true;
    },

    olvidarConfig(){ localStorage.removeItem(CFG_KEY); cfg=null; cli=null; user=null; },

    async entrar(email, pass){
      const {data, error} = await cli.auth.signInWithPassword({email, password:pass});
      if(error) throw error;
      user = data.user;
      return user;
    },

    async salir(){ await cli.auth.signOut(); user = null; },

    traerTodo, subirEnTandas
  };
})();
