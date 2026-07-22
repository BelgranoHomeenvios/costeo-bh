// ============================================================
//  Edge Function · sync-precios   (Tienda Nube → app)
//
//  Baja el catálogo de Tienda Nube por su API y hace upsert de los
//  precios en rentabilidad.tn_precios (pk = variant_id). La app la
//  invoca desde el botón "Actualizar datos" y después superpone esos
//  precios sobre productos.precioLista por tnVariantId.
//
//  Secrets que necesita (Supabase → Edge Functions → Secrets):
//    TN_TOKEN      · access_token de la app privada de Tiendanube
//    TN_STORE_ID   · id de la tienda (238796)
//  (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// La app corre en github.io y la función en supabase.co → distinto origen.
// El navegador exige estos headers y una respuesta al preflight OPTIONS.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  // Preflight de CORS: responder OK sin tocar nada.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const TN_TOKEN = Deno.env.get("TN_TOKEN");
    const TN_STORE_ID = Deno.env.get("TN_STORE_ID") ?? "238796";
    if (!TN_TOKEN) throw new Error("Falta el secret TN_TOKEN en la función.");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Tiendanube usa el header 'Authentication: bearer <token>' (no 'Authorization')
    // y exige un User-Agent que identifique a la app.
    const tnHeaders = {
      "Authentication": `bearer ${TN_TOKEN}`,
      "User-Agent": "Belgrano Cost (singer.brian1@gmail.com)",
      "Content-Type": "application/json",
    };

    const ahora = new Date().toISOString();
    const filas: Record<string, unknown>[] = [];
    const vistos = new Set<number>();

    // Paginado del catálogo. Pedimos solo id + variants para achicar el payload.
    let page = 1;
    for (; page <= 500; page++) {
      const url = `https://api.tiendanube.com/v1/${TN_STORE_ID}/products` +
        `?per_page=200&page=${page}&fields=id,variants`;
      const res = await fetch(url, { headers: tnHeaders });

      // TN devuelve 404 (o lista vacía) cuando te pasás de la última página.
      if (res.status === 404 && page > 1) break;
      if (!res.ok) {
        const cuerpo = await res.text();
        throw new Error(
          `Tienda Nube respondió ${res.status} en la página ${page}: ${cuerpo.slice(0, 300)}`,
        );
      }

      const productos = await res.json();
      if (!Array.isArray(productos) || productos.length === 0) break;

      for (const p of productos) {
        for (const v of (p.variants ?? [])) {
          if (v?.id == null || vistos.has(v.id)) continue;
          vistos.add(v.id);
          filas.push({
            variant_id: v.id,
            product_id: p.id,
            precio: Number(v.price) || 0,
            origen: "tiendanube",
            actualizado: ahora,
          });
        }
      }

      if (productos.length < 200) break; // era la última página
    }

    // Upsert en tandas a rentabilidad.tn_precios (con service role, saltea RLS).
    const db = createClient(SUPABASE_URL, SERVICE_KEY).schema("rentabilidad");
    for (let i = 0; i < filas.length; i += 500) {
      const tanda = filas.slice(i, i + 500);
      const { error } = await db
        .from("tn_precios")
        .upsert(tanda, { onConflict: "variant_id" });
      if (error) throw error;
    }

    return json({ ok: true, actualizadas: filas.length, paginas: page });
  } catch (e) {
    // Devolvemos 200 con ok:false a propósito: así el texto real del error
    // llega al toast de la app (invoke() esconde el body en los 4xx/5xx).
    console.error("sync-precios:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
