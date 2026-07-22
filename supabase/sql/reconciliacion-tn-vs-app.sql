-- ============================================================
--  Reconciliación Tienda Nube vs app, por categoría de TN.
--  Responde: de cada categoría, cuántas variantes hay en TN,
--  cuántas ya están cargadas en `productos` (costeadas) y cuántas
--  faltan. Sirve para entender el misterio de los "faltantes" antes
--  de cargar nada (riesgo de duplicados).
--  Requiere haber corrido sync-catalogo (llena tn_catalogo).
-- ============================================================
select
  coalesce(c.categoria, '(sin categoría)')                       as categoria_tn,
  count(*)                                                        as variantes_en_tn,
  count(*) filter (where p.tn_variant_id is not null)            as ya_en_productos,
  count(*) filter (where p.tn_variant_id is null)                as faltan,
  count(distinct c.product_id)                                   as productos_tn
from rentabilidad.tn_catalogo c
left join rentabilidad.productos p on p.tn_variant_id = c.variant_id
group by 1
order by faltan desc;

-- Total global: cuántas variantes de TN todavía no están en `productos`.
select
  count(*)                                             as variantes_tn_total,
  count(*) filter (where p.tn_variant_id is not null)  as ya_en_productos,
  count(*) filter (where p.tn_variant_id is null)      as faltan
from rentabilidad.tn_catalogo c
left join rentabilidad.productos p on p.tn_variant_id = c.variant_id;
