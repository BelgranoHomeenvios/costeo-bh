-- ============================================================
--  Staging del catálogo completo de Tienda Nube.
--  Espejo crudo de TN (nombre, categoría, atributos, precio, publicado).
--  Es la materia prima para: (1) reconciliar TN vs la app y detectar
--  duplicados/faltantes, y (2) generar las filas de productos_sin_costo.
--  Lo llena la Edge Function sync-catalogo.
-- ============================================================
create table if not exists rentabilidad.tn_catalogo (
  variant_id   bigint primary key,
  product_id   bigint not null,
  nombre       text,          -- name.es del producto
  categoria    text,          -- name.es de la 1ª categoría TN
  categoria_id bigint,        -- id de esa categoría TN
  atributos    jsonb,         -- opciones del producto, ej: ["Color","Medida"]
  valores      jsonb,         -- valores de ESTA variante, ej: ["Blanco","1.80"]
  sku          text,
  precio       numeric,
  publicado    boolean,
  actualizado  timestamptz
);

create index if not exists tn_catalogo_product_id_idx on rentabilidad.tn_catalogo (product_id);
create index if not exists tn_catalogo_categoria_idx  on rentabilidad.tn_catalogo (categoria);
