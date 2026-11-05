# Seguridad RLS · TrazabilidadQR

Documento de auditoría y operación de las políticas RLS, los permisos de tablas
y las RPC de Supabase.

> Las políticas de este documento son las definidas en los scripts del
> repositorio. No se verificaron contra la base viva porque no hay credenciales
> de Supabase en el proyecto. `is_staff()` y `ficha_publica()` no están
> versionadas; su definición real debe revisarse en Supabase.

## 1. Permisos por tabla

Leyenda: `staff` = `is_staff()`, `admin` = `is_admin()`, `—` = sin acceso.

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `materiales` | staff/admin | admin | admin | admin |
| `despachos` | staff/admin | **admin** | admin | admin |
| `almacenes` | staff/admin | **admin** | admin | admin |
| `ubicaciones` | staff/admin | **admin** | admin | admin |
| `ubicaciones_codigos_alias` | staff/admin | — | — | — |
| `movimientos_ubicacion` | staff/admin | — | admin | admin |
| `ajustes_inventario_ciclico` | staff/admin | — | — | — |
| `existencias_materiales` (vista) | — (revocado) | — | — | — |

- `anon` no tiene acceso directo a ninguna tabla.
- Los movimientos de ubicación se crean únicamente desde
  `asignar_inventario_ubicacion()` (`SECURITY DEFINER`).
- Los ajustes de inventario se crean únicamente desde
  `registrar_conteo_ciclico()` (`SECURITY DEFINER`, solo admin).
- La vista de existencias solo se consume a través de las RPC; su acceso
  directo está revocado.

## 2. Permisos por RPC

| RPC | EXECUTE | Chequeo interno | Efectivo |
|---|---|---|---|
| `is_admin()` | authenticated | email del JWT | cualquier auth (solo booleano) |
| `is_staff()` | no versionada | desconocido | desconocido |
| `obtener_existencias_materiales(text[])` | authenticated | staff/admin | staff/admin |
| `calcular_existencia_material(text)` | authenticated | staff/admin | staff/admin |
| `asignar_inventario_ubicacion(text,text,jsonb)` | authenticated | staff/admin | staff/admin |
| `registrar_conteo_ciclico(...)` | authenticated | admin | admin |
| `eliminar_ubicacion_vacia(text)` | authenticated | admin | admin |
| `eliminar_almacen_inventario(text)` | authenticated | admin | admin |
| `corregir_codigo_ubicacion(text,text,text)` | authenticated | admin | admin |
| `registrar_salida(text,jsonb)` | authenticated | staff/admin | staff/admin |
| `ficha_existencia_publica(text)` | anon, authenticated | público por diseño | cualquiera |
| `ficha_publica(text)` | no versionada | desconocido | anon |
| `factor_longitud(text)` | authenticated | ninguno | cualquier auth (inocuo) |

## 3. Cambios aplicados en el repositorio

### `supabase_almacenes.sql`

- `almacenes`: el INSERT pasa de staff/admin a **solo admin**.
- `ubicaciones`: el INSERT pasa de staff/admin a **solo admin**.
- `despachos`: el INSERT pasa de staff/admin a **solo admin**. El surtido de
  staff se hace por `registrar_salida()`.
- `movimientos_ubicacion`: se elimina la política de INSERT y se revocan
  `insert, update, delete` a `authenticated`. Solo escribe la RPC definer.
- Se revoca el uso de la secuencia `movimientos_ubicacion_id_seq` a
  `authenticated`.

### `supabase_existencias_vista.sql`

- `obtener_existencias_materiales()` y `calcular_existencia_material()` ahora
  son `plpgsql`, `SECURITY DEFINER` y lanzan `NO_AUTORIZADO` si el usuario no
  es staff/admin.

### `supabase_ubicaciones.sql`

- Se marca como script de instalación inicial y se niega a ejecutarse si
  `public.almacenes` ya existe.
- Se eliminan las políticas `FOR ALL` y se reemplazan por SELECT/INSERT de
  staff solo para el bootstrap.
- `asignar_inventario_ubicacion()` pasa a `SECURITY DEFINER` y se revoca su
  ejecución a `public`/`anon`.
- Los movimientos quedan solo de lectura para `authenticated`.

### `supabase_rls_endurecimiento.sql`

- Migración idempotente para bases existentes. Repite los cambios de políticas
  y RPC por si la base se creó con versiones anteriores.

## 4. Orden de ejecución

En una base existente, el endurecimiento va al final:

1. `supabase_almacenes.sql`
2. `supabase_existencias_vista.sql`
3. `supabase_surtido_atomico.sql`
4. `supabase_rls_endurecimiento.sql` ← último

En una instalación nueva:

1. `supabase_ubicaciones.sql` (bootstrap; se niega a correr si ya existe
   `almacenes`)
2. `supabase_almacenes.sql`
3. `supabase_existencias_vista.sql`
4. `supabase_surtido_atomico.sql`
5. `supabase_rls_endurecimiento.sql`

### Advertencia

- Los scripts base del repositorio ya incluyen el endurecimiento, así que
  volver a ejecutarlos **mantiene** las políticas y el guard de las RPC.
- La advertencia aplica solo si se ejecuta una copia antigua de esos scripts:
  en ese caso hay que volver a ejecutar `supabase_rls_endurecimiento.sql`
  inmediatamente después.
- No volver a ejecutar `supabase_ubicaciones.sql` después de
  `supabase_almacenes.sql`: el script se niega con `SCRIPT_OBSOLETO`.

## 5. Verificación antes de ejecutar

Confirmar que las funciones que escriben son `SECURITY DEFINER`, que su dueño
es el mismo de las tablas y que `FORCE RLS` está desactivado:

```sql
select p.proname,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as function_owner,
       p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin','is_staff','registrar_salida',
    'asignar_inventario_ubicacion','registrar_conteo_ciclico',
    'eliminar_ubicacion_vacia','eliminar_almacen_inventario',
    'corregir_codigo_ubicacion','obtener_existencias_materiales',
    'calcular_existencia_material','ficha_existencia_publica',
    'ficha_publica'
  )
order by p.proname;

select c.relname,
       pg_get_userbyid(c.relowner) as table_owner,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'materiales','despachos','almacenes','ubicaciones',
    'movimientos_ubicacion','ajustes_inventario_ciclico'
  )
order by c.relname;
```

Si `force_rls = true` o los dueños no coinciden, no aplicar los cambios de
escritura sin rediseñar el flujo: las RPC definer podrían dejar de escribir.

## 6. Pruebas después de ejecutar

| Prueba | Admin | Staff | Auth sin rol | Anónimo |
|---|---|---|---|---|
| Leer materiales/despachos/almacenes/ubicaciones | ✅ | ✅ | ❌ | ❌ |
| Consultar existencias por RPC | ✅ | ✅ | ❌ `NO_AUTORIZADO` | ❌ |
| Surtir (`registrar_salida`) | ✅ | ✅ | ❌ | ❌ |
| Traspasar (`asignar_inventario_ubicacion`) | ✅ | ✅ | ❌ | ❌ |
| Conteo cíclico | ✅ | ❌ | ❌ | ❌ |
| Crear almacén/ubicación directo | ✅ | ❌ | ❌ | ❌ |
| Insertar despacho directo | ✅ | ❌ | ❌ | ❌ |
| Insertar movimiento directo | ❌ | ❌ | ❌ | ❌ |
| Eliminar almacén/ubicación | ✅ | ❌ | ❌ | ❌ |
| Anular surtido | ✅ | ❌ | ❌ | ❌ |
| Ficha QR pública | ✅ | ✅ | ✅ | ✅ |

## 7. Riesgos pendientes de revisar en Supabase

1. **`is_admin()` basado en email.** Si el proyecto permite registro abierto y
   no exige confirmación de correo, se puede intentar suplantar al
   administrador. Recomendación: desactivar altas públicas, exigir
   confirmación y migrar a una allowlist por `user_id` o a `app_metadata`.
   El anexo de `supabase_rls_endurecimiento.sql` incluye una propuesta.
2. **`is_staff()` no versionada.** Revisar que no use `raw_user_meta_data`
   (`user_metadata`), porque el usuario puede modificarlo. Debe usar
   `raw_app_meta_data` (`app_metadata`) o una tabla allowlist.
3. **`ficha_publica()` no versionada.** Revisar que devuelva solo campos
   públicos de la etiqueta y que no exponga proveedor, costos, PO ni datos
   internos.
4. **`ficha_existencia_publica()`.** Es pública por diseño para la ficha QR,
   pero devuelve la suma de ajustes de inventario. No usarla como existencia
   autoritativa y revisar si ese dato debe ser público.
5. **Configuración de Auth.** Desactivar registro público si no se usa, exigir
   confirmación de correo y revisar el cambio seguro de correo.

## 8. Rollback

- Si la migración falla dentro de la transacción: `rollback;`.
- Si ya se confirmó y algo se rompe, restaurar las políticas y funciones desde
  el respaldo obtenido con `pg_policies` y `pg_get_functiondef` antes de
  ejecutar.
- Como respaldo rápido de las RPC de existencias se puede re-ejecutar
  `supabase_existencias_vista.sql`, pero eso vuelve a dejar las RPC sin guard
  de rol; úsalo solo como rollback temporal y vuelve a aplicar el
  endurecimiento.
