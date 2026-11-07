# Trazabilidad de Material · QR

Sistema de trazabilidad de materiales y materia prima: registro con QR, etiquetas
(impresión Brother y PNG), surtido por escaneo, inventario con conteo cíclico,
almacenes y ubicaciones.

- **Frontend:** HTML + JavaScript clásico (sin build), servido como sitio estático.
- **Datos y auth:** Supabase (cliente en el navegador, protegido con RLS).
- **Librerías vendorizadas:** `qrcode` y `jsQR` en `public/assets/vendor/`.
- **Librerías por CDN:** `@supabase/supabase-js` y `xlsx` (versiones fijas en `index.html`).

## Estructura

```
public/                     ← único directorio que se publica
  index.html                ← marcado + orden de carga de scripts
  assets/css/app.css
  assets/vendor/qrcode.js
  assets/vendor/jsqr.js
  js/*.js                   ← lógica de la aplicación, por módulo
  supabase_almacenes.sql    ← migración que la UI ofrece descargar
supabase_*.sql              ← migraciones (no se publican)
SEGURIDAD_RLS.md
ANALISIS_IMPACTO_EXISTENCIAS.md
vercel.json                 ← outputDirectory: public
```

## Módulos

El antiguo `index.html` (17 827 líneas) se dividió en 11 archivos. El contenido de
cada uno es **exactamente** el bloque que tenía en el archivo original: no se
reescribió ninguna línea de lógica.

| Archivo | Responsabilidad | Líneas |
| --- | --- | --- |
| `00-nucleo.js` | Helpers, estado global, cliente Supabase, normalización de material | 37 |
| `10-datos.js` | Carga de datos, existencias de servidor y realtime incremental | 215 |
| `20-sesion.js` | Login, roles, migración de datos locales y arranque de sesión | 59 |
| `30-formulario.js` | Formulario de registro/edición y campos «No aplica» | 81 |
| `40-etiquetas.js` | QR, ficha imprimible, impresión Brother y PNG/ZIP | 170 |
| `50-materiales.js` | Tabla de materiales, inventario y conteo cíclico | 308 |
| `54-ubicaciones.js` | Almacenes, ubicaciones, QR de ubicación y asignación | 354 |
| `58-lote-importacion.js` | Importación/exportación masiva, selección y edición | 341 |
| `70-surtido.js` | Surtido: escaneo, piezas, confirmación y folios | 402 |
| `80-inicio-historial.js` | Inicio con alertas e historial de surtidos | 121 |
| `90-ficha-navegacion.js` | Ficha pública, navegación por hash y arranque | 71 |

## Por qué esto no altera el comportamiento

Los archivos se cargan como **scripts clásicos** (no `type="module"`), en el mismo
orden en que estaban dentro del `<script>` original. Todos comparten el mismo
ámbito global, igual que antes: las funciones y variables siguen viéndose entre
sí sin `import`/`export`, sin modo estricto añadido y sin diferir la ejecución.

Reglas al mover código entre módulos:

1. **Cortar en límites de función de nivel superior.** Nunca dentro de una
   función, objeto o IIFE.
2. **Mantener el orden** de las etiquetas `<script>` en `index.html`. Una
   declaración `const`/`let` movida antes de su uso produce un error de TDZ.
3. **No cambiar nombres** de funciones o variables globales: el HTML usa
   `onclick`/`id` y los módulos se llaman entre sí por nombre.
4. Verificar con `node --check public/js/*.js` y abrir la app: la consola debe
   quedar vacía y el login debe aparecer.

## Desarrollo local

No requiere instalar dependencias ni compilar:

```bash
cd public && python3 -m http.server 3000
# o: npx serve public
```

Abrir <http://localhost:3000>.

## Despliegue en Vercel

El proyecto es estático: no hay `buildCommand` ni `package.json`.

```bash
npx vercel            # primera vez: vincula el proyecto
npx vercel --prod     # publica producción
```

En el panel de Vercel:

- **Framework Preset:** Other
- **Root Directory:** la raíz del repositorio
- **Build Command:** vacío
- **Output Directory:** `public` (ya viene en `vercel.json`)

Solo se publica `public/`; las migraciones SQL y la documentación quedan fuera
del sitio.

## Antes de publicar: dominio de los QR

El QR grabado en cada etiqueta contiene una URL absoluta. Hoy es

```
https://shardd89.github.io/TrazabilidadQR/
```

definida en `public/js/40-etiquetas.js` (`BASE`) y configurable con la etiqueta
`<meta name="qr-base">` de `public/index.html`:

```html
<meta name="qr-base" content="https://TU-PROYECTO.vercel.app/">
```

Decide antes del despliegue:

- **Dejar GitHub Pages activo** (lo más seguro): no cambies nada; las etiquetas
  ya impresas y las nuevas siguen resolviendo.
- **Pasar todo a Vercel:** actualiza `qr-base` a la URL de Vercel, pero las
  etiquetas **ya impresas** seguirán apuntando a GitHub Pages: mantenlo en línea
  mientras esas etiquetas estén en uso.

## Siguientes pasos sugeridos

Ninguno es necesario para desplegar; son mejoras incrementales, un módulo por vez
y con la app verificada después de cada cambio.

1. **Capa de datos:** concentrar las llamadas `sb.from(...)` / `sb.rpc(...)` en un
   módulo para que el resto del código no dependa del esquema directamente.
2. **Módulos ES:** convertir un archivo a `type="module"` con `import` explícito
   (empezando por los de pocas dependencias, p. ej. `40-etiquetas.js`). Al ser
   modo estricto, revisar asignaciones implícitas antes de convertir.
3. **Fijar las librerías CDN** en `assets/vendor/` para eliminar la dependencia de
   jsDelivr y poder aplicar una CSP estricta.
4. **Pruebas de humo** con Playwright sobre la pantalla de login y el alta de un
   material, para detectar regresiones en refactors futuros.

## Verificación aplicada

- La concatenación de los 11 módulos es **byte-idéntica** al `<script>` original.
- `app.css`, `qrcode.js` y `jsqr.js` son byte-idénticos a sus bloques originales.
- `node --check` sobre los 11 módulos: sin errores de sintaxis.
- La app cargada en navegador: login visible, 4 pestañas, 4 tarjetas de inicio,
  consola sin mensajes y misma salida de `qrTexto` que antes del cambio.
