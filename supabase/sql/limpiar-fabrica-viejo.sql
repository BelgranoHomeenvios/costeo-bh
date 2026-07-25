-- ============================================================
--  LIMPIEZA · datos viejos del módulo Fábrica
--  Pegar en Supabase → SQL Editor → Run.
--
--  Borra los PRODUCTOS viejos de Fábrica (Agustín, Benito, Ryan, etc.)
--  que estaban en la pantalla "Productos" (ahora oculta). A partir de
--  ahora todo se carga como MODELOS.
--
--  ⚠️ IMPORTANTE — esto SOLO toca el esquema `public` (Fábrica).
--     NO toca `rentabilidad.productos` (el catálogo de Proveedores, 12k).
-- ============================================================

-- Productos viejos de Fábrica (esquema public)
delete from public.productos;

-- (Opcional) Si también querés arrancar los MODELOS de cero y cargarlos
-- de nuevo con Claude, descomentá esta línea:
-- delete from public.familias;

-- Verificación (deberían dar 0, o solo los modelos que quieras conservar)
select 'public.productos' as tabla, count(*) as filas from public.productos
union all
select 'public.familias',  count(*) from public.familias;
