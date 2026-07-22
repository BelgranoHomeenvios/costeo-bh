// ============================================================
//  Edge Function · sync-precios   (Tienda Nube → app)
//
//  Baja el catálogo de Tienda Nube y hace upsert de los precios en
//  rentabilidad.tn_precios (pk = variant_id). El botón "Actualizar
//  datos" la invoca SIN body → solo precios (rápido).
//
//  Si se la invoca con { catalogo: true }, además llena
//  rentabilidad.tn_catalogo con la metadata completa (nombre, categoría,
//  atributos, valores, sku, publicado). Se fusionó acá para no depender
//  de una segunda función (cuyo toggle de Verify JWT daba 401).
//
//  Secrets: TN_TOKEN, TN_STORE_ID (SUPABASE_* los inyecta Supabase).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// TN devuelve los textos como {es:"...", pt:"..."}; nos quedamos con es (o el 1º).
const txt = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, string>;
    return o.es ?? Object.values(o)[0] ?? null;
  }
  return String(v);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Body opcional. { catalogo:true } → además del precio, llena tn_catalogo.
    const body = await req.json().catch(() => ({}));
    const conCatalogo = body?.catalogo === true;

    const TN_TOKEN = Deno.env.get("TN_TOKEN");
    const TN_STORE_ID = Deno.env.get("TN_STORE_ID") ?? "238796";
    if (!TN_TOKEN) throw new Error("Falta el secret TN_TOKEN en la función.");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Tiendanube: header 'Authentication: bearer <token>' (no 'Authorization') + User-Agent.
    const tnHeaders = {
      "Authentication": `bearer ${TN_TOKEN}`,
      "User-Agent": "Belgrano Cost (singer.brian1@gmail.com)",
      "Content-Type": "application/json",
    };

    const ahora = new Date().toISOString();
    const precios: Record<string, unknown>[] = [];
    const catalogo: Record<string, unknown>[] = [];
    const vistos = new Set<number>();

    // Pedimos la metadata completa igual (es barato); solo la ESCRIBIMOS si conCatalogo.
    let page = 1;
    for (; page <= 500; page++) {
      const url = `https://api.tiendanube.com/v1/${TN_STORE_ID}/products` +
        `?per_page=200&page=${page}&fields=id,name,published,categories,attributes,variants`;
      const res = await fetch(url, { headers: tnHeaders });

      if (res.status === 404 && page > 1) break;
      if (!res.ok) {
        const cuerpo = await res.text();
        throw new Error(`Tienda Nube respondió ${res.status} en la página ${page}: ${cuerpo.slice(0, 300)}`);
      }

      const productos = await res.json();
      if (!Array.isArray(productos) || productos.length === 0) break;

      for (const p of productos) {
        const nombre = txt(p.name);
        const cat = Array.isArray(p.categories) && p.categories.length ? p.categories[0] : null;
        const categoria = cat ? txt(cat.name) : null;
        const categoria_id = cat?.id ?? null;
        const atributos = Array.isArray(p.attributes) ? p.attributes.map(txt) : [];

        for (const v of (p.variants ?? [])) {
          if (v?.id == null || vistos.has(v.id)) continue;
          vistos.add(v.id);

          precios.push({
            variant_id: v.id,
            product_id: p.id,
            precio: Number(v.price) || 0,
            origen: "tiendanube",
            actualizado: ahora,
          });

          if (conCatalogo) {
            catalogo.push({
              variant_id: v.id,
              product_id: p.id,
              nombre,
              categoria,
              categoria_id,
              atributos,
              valores: Array.isArray(v.values) ? v.values.map(txt) : [],
              sku: v.sku ?? null,
              precio: Number(v.price) || 0,
              publicado: p.published ?? null,
              actualizado: ahora,
            });
          }
        }
      }

      if (productos.length < 200) break;
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY).schema("rentabilidad");

    for (let i = 0; i < precios.length; i += 500) {
      const { error } = await db
        .from("tn_precios")
        .upsert(precios.slice(i, i + 500), { onConflict: "variant_id" });
      if (error) throw error;
    }

    if (conCatalogo) {
      for (let i = 0; i < catalogo.length; i += 500) {
        const { error } = await db
          .from("tn_catalogo")
          .upsert(catalogo.slice(i, i + 500), { onConflict: "variant_id" });
        if (error) throw error;
      }
    }

    return json({
      ok: true,
      actualizadas: precios.length,
      catalogo: conCatalogo ? catalogo.length : undefined,
      paginas: page,
    });
  } catch (e) {
    console.error("sync-precios:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
