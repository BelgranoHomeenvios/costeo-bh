# Belgrano Cost

App interna de costos de Belgrano Home. Acceso exclusivo de Dirección.

Tres páginas, dos bases separadas, un solo login:

- **Entrada** (`index.html`) — conexión, login y elección de módulo.
- **Fábrica** (`fabrica/`) — qué cuesta producir cada mueble.
  Usa el esquema `public` de Supabase.
- **Proveedores** (`proveedores/`) — qué cuesta comprarlo y qué margen deja.
  Usa el esquema `rentabilidad` de Supabase.

Los dos módulos viven en el mismo proyecto de Supabase pero en esquemas
distintos: tocar uno no afecta al otro. La sesión es una sola y vale para
las tres páginas.

---

## Estructura

```
index.html              ENTRADA · login y elección de módulo

fabrica/                MÓDULO FÁBRICA · se toca sin abrir proveedores/
  index.html              Página del módulo
  fabrica.js              Motor de costeo de fabricación
  fabrica.css             Estilos propios, acotados a .mod-fab

proveedores/            MÓDULO PROVEEDORES · se toca sin abrir fabrica/
  index.html              Página del módulo
  datos-base.js           Categorías y terminaciones
  motor.js                Datos y motor de rentabilidad
  vistas.js               Resumen, Productos, Ficha, Simulador
  vistas-mas.js           Rentabilidad, Costos, Pendientes, Historial, Importar

acceso/                 ENTRADA · no pertenece a ningún módulo
  acceso.js               Conexión, login, guardián de sesión y arranque
  portada.js              Elección de módulo, con el estado de cada uno

comun/                  Infraestructura que comparten las tres páginas
  estilos.css             Diseño general
  utiles.js               Formato de números y navegación entre páginas
  layout.js               Header y estructura de pantalla
  supabase.js             Conexión y sesión
  ui.js                   Componentes (tablas, KPIs, modales) y navegación

sql/
  schema-proveedores.sql  Crea el esquema `rentabilidad` en Supabase

datos/
  costos-base.json        Tabla de costos (carga inicial)
  catalogo-costeado.json  Catálogo de productos (carga inicial)
```

**Para trabajar en un módulo, abrí solo su carpeta.** Los archivos de `comun/`
se tocan únicamente cuando el cambio afecta a más de una página.

---

## Cómo funciona

Cada página declara qué es antes de cargar los scripts:

```html
<script>window.PAGINA = 'fab';</script>
```

Con eso `acceso/acceso.js` sabe qué arrancar. Si alguien abre una página de
módulo sin sesión iniciada, vuelve sola a la entrada.

Cada página carga **solo lo que necesita**: la entrada no incluye el código de
los módulos, Fábrica no incluye el de Proveedores y viceversa.

El orden de los `<script>` importa: cada archivo usa lo que declararon los
anteriores. `acceso/acceso.js` va último, porque ahí está el arranque.

Toda la navegación entre páginas pasa por el objeto `Nav` en `comun/utiles.js`.
Si hay que cambiar rutas, se cambia ahí y en ningún otro lado.

No hace falta compilar nada: editás, guardás, recargás.

---

## Puesta en marcha (una sola vez)

1. Supabase → SQL Editor → ejecutar `sql/schema-proveedores.sql`.
2. Supabase → Settings → API → **Exposed schemas**: agregar `rentabilidad`.
3. Supabase → Authentication → Users: crear los usuarios de Dirección.
4. Abrir la app, pegar la URL del proyecto y la clave, e iniciar sesión.
5. En Proveedores → Importar: cargar **primero** `datos/costos-base.json` y
   **después** `datos/catalogo-costeado.json`.

Los datos quedan en Supabase: se cargan una sola vez y los ve cualquiera que
inicie sesión, desde cualquier computadora.

---

## Publicar en GitHub Pages

Subir todo el contenido de esta carpeta al repositorio respetando la estructura.
Después: **Settings → Pages → Source: Deploy from a branch → main / (root)**.

El repositorio puede ser público: **no hay costos ni precios en el código**.
Los datos viven en Supabase, protegidos por RLS — sin sesión iniciada, la base
no devuelve nada.
