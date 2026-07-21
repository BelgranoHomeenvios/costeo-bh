/* ============================================================
   UTILIDADES
   ============================================================ */
function uid(){
  return (crypto.randomUUID ? crypto.randomUUID()
    : 'id-'+Math.random().toString(36).slice(2)+Date.now().toString(36));
}
const money = n => (!n && n!==0) ? '—' : '$ ' + Math.round(n).toLocaleString('es-AR');
/** Parsea números escritos como los escribe un argentino: "272.440" o "1.234,50".
 *  Sin esto, parseFloat("272.440") devolvería 272,44 y arruinaría el costo. */
function parseNum(txt){
  if(txt==null) return 0;
  let s = String(txt).replace(/[$\s]/g,'').trim();
  if(!s) return 0;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if(coma > -1 && coma > punto)      s = s.replace(/\./g,'').replace(',','.');  // 1.234,50
  else if(punto > -1 && coma > -1)   s = s.replace(/,/g,'');                    // 1,234.50
  else if(punto > -1){
    const dec = s.length - punto - 1;
    // 3 decimales exactos y sin coma => es separador de miles (272.440)
    if(dec === 3) s = s.replace(/\./g,'');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const pct1  = n => (n||n===0) ? (n*100).toFixed(1).replace('.',',')+' %' : '—';
const pctS  = n => { const v=(n*100); return (v>0?'+':'')+v.toFixed(1).replace('.',',')+' %'; };
const mk    = n => n>0 ? n.toFixed(2).replace('.',',')+'x' : '—';
const esc   = s => String(s??'').replace(/[&<>"']/g, m =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fecha = iso => { const d=new Date(iso);
  return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+
         d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}); };
const variantesTxt = p => Object.entries(p.variantes||{})
  .map(([k,v])=>`${k}: ${v}`).join(' · ');
const medSort = m => { const n=String(m).match(/[\d.]+/g); return n?parseFloat(n[0]):0; };

const ESTADO = {
  verde:   {lbl:'Rentabilidad OK', cls:'b-green', color:'var(--green)'},
  amarillo:{lbl:'Advertencia',     cls:'b-amber', color:'var(--amber)'},
  rojo:    {lbl:'Rentabilidad baja',cls:'b-red',  color:'var(--red)'},
  sincosto:{lbl:'Sin costo',       cls:'b-gray',  color:'var(--gray)'}
};

/* ============================================================
   NAVEGACIÓN ENTRE PÁGINAS
   Un solo lugar donde la app cambia de página. Centralizarlo
   permite probarlo y evita repartir location.href por el código.
   ============================================================ */
const Nav = {
  /** Desde una página de módulo, la entrada está un nivel arriba. */
  raiz: () => (window.PAGINA && window.PAGINA !== 'portada') ? '../' : '',
  ir(url){ window.location.href = url; },
  volverAEntrada(){ window.location.replace(Nav.raiz()); }
};
