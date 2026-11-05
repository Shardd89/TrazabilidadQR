-- ============================================================================
-- ENDURECIMIENTO RLS · TrazabilidadQR
-- ----------------------------------------------------------------------------
-- Migración para bases ya existentes. Los scripts base
-- (supabase_almacenes.sql y supabase_existencias_vista.sql) ya incluyen estos
-- cambios, así que este archivo se usa para aplicar el endurecimiento sobre
-- una base creada con versiones anteriores.
--
-- NO se ha ejecutado automáticamente: requiere revisión y ejecución manual.
-- Requisitos: public.is_staff() y public.is_admin() ya existen.
-- Ejecutar en el SQL Editor de Supabase, revisando antes cada bloque.
--
-- Los scripts base del repositorio ya incluyen este endurecimiento, así que
-- re-ejecutarlos mantiene las políticas. Si la base se creó con una copia
-- anterior de esos scripts, ejecute este archivo después de actualizarlos.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Altas de catálogo: solo administrador
-- ----------------------------------------------------------------------------
-- La UI ya oculta los formularios a staff:
--   almacenes:   renderAlmacenes()  -> form.hidden = !esAdmin
--   ubicaciones: renderUbicaciones() -> ubiGuardarBox.hidden = !esAdmin
-- La base, en cambio, permite INSERT a staff. Se alinea a admin.

drop policy if exists almacenes_staff_insert on public.almacenes;
drop policy if exists almacenes_admin_insert on public.almacenes;
create policy almacenes_admin_insert on public.almacenes
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists ubicaciones_staff_insert on public.ubicaciones;
drop policy if exists ubicaciones_admin_insert on public.ubicaciones;
create policy ubicaciones_admin_insert on public.ubicaciones
  for insert to authenticated
  with check (public.is_admin());

-- Se conservan:
--   almacenes_staff_select / ubicaciones_staff_select  (lectura staff/admin)
--   almacenes_admin_update / almacenes_admin_delete
--   ubicaciones_admin_update / ubicaciones_admin_delete

-- ----------------------------------------------------------------------------
-- 2. Despachos: la vía de staff debe ser registrar_salida()
-- ----------------------------------------------------------------------------
-- El cliente solo inserta directo en despachos desde subirLista(), que exige
-- esAdmin. El surtido normal usa public.registrar_salida() (SECURITY DEFINER).
-- Permitir INSERT directo a staff deja forjar surtidos por API y alterar la
-- existencia calculada por la vista.

drop policy if exists despachos_staff_insert on public.despachos;
drop policy if exists despachos_admin_insert on public.despachos;
create policy despachos_admin_insert on public.despachos
  for insert to authenticated
  with check (public.is_admin());

-- Se conservan:
--   despachos_staff_select (lectura staff/admin)
--   despachos_admin_update / despachos_admin_delete

-- ----------------------------------------------------------------------------
-- 3. Movimientos de ubicación: solo lectura desde el cliente
-- ----------------------------------------------------------------------------
-- Ningún flujo del cliente inserta directo en movimientos_ubicacion: las altas
-- las hacen las RPC SECURITY DEFINER asignar_inventario_ubicacion().
-- Se revocan escrituras directas para evitar falsificar el historial.

drop policy if exists movimientos_ubicacion_staff_insert on public.movimientos_ubicacion;
revoke insert, update, delete on public.movimientos_ubicacion from authenticated;
revoke all on sequence public.movimientos_ubicacion_id_seq from authenticated;
grant select on public.movimientos_ubicacion to authenticated;

-- Opcional: retirar también las políticas de escritura que ya no se usan.
-- drop policy if exists movimientos_ubicacion_admin_update on public.movimientos_ubicacion;
-- drop policy if exists movimientos_ubicacion_admin_delete on public.movimientos_ubicacion;

-- ----------------------------------------------------------------------------
-- 4. Existencias: exigir staff/admin dentro de las RPC
-- ----------------------------------------------------------------------------
-- Las RPC son SECURITY DEFINER y hoy no validan rol. Cualquier cuenta
-- authenticated (aunque no sea staff) puede leer todas las existencias.
-- Se recrean con la misma firma y un guard explícito.

drop function if exists public.obtener_existencias_materiales(text[]);

create function public.obtener_existencias_materiales(
  p_codigos text[] default null
)
returns table (
  codigo text,
  modo text,
  unidad text,
  cantidad_inicial numeric,
  longitud_base numeric,
  total numeric,
  surtido numeric,
  ajustes numeric,
  existencia numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_staff() or public.is_admin()) then
    raise exception 'NO_AUTORIZADO';
  end if;

  return query
  select
    e.codigo,
    e.modo,
    e.unidad,
    e.cantidad_inicial,
    e.longitud_base,
    e.total,
    e.surtido,
    e.ajustes,
    e.existencia
  from public.existencias_materiales e
  where p_codigos is null or e.codigo = any (p_codigos)
  order by e.codigo;
end;
$$;

revoke all on function public.obtener_existencias_materiales(text[])
  from public, anon;
grant execute on function public.obtener_existencias_materiales(text[])
  to authenticated;

comment on function public.obtener_existencias_materiales(text[]) is
  'Consulta de existencias para staff/admin. Rechaza NO_AUTORIZADO al resto.';

drop function if exists public.calcular_existencia_material(text);

create function public.calcular_existencia_material(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_staff() or public.is_admin()) then
    raise exception 'NO_AUTORIZADO';
  end if;

  return coalesce(
    (
      select to_jsonb(e)
      from public.existencias_materiales e
      where e.codigo = p_codigo
    ),
    jsonb_build_object('codigo', p_codigo, 'error', 'MATERIAL_NO_ENCONTRADO')
  );
end;
$$;

revoke all on function public.calcular_existencia_material(text)
  from public, anon;
grant execute on function public.calcular_existencia_material(text)
  to authenticated;

comment on function public.calcular_existencia_material(text) is
  'Diagnóstico de existencia para staff/admin. Rechaza NO_AUTORIZADO al resto.';

-- ----------------------------------------------------------------------------
-- 5. Limpiar políticas heredadas de supabase_ubicaciones.sql
-- ----------------------------------------------------------------------------
-- Ese script crea políticas FOR ALL para staff. Si se ejecuta después de
-- supabase_almacenes.sql, las políticas se suman (OR) y staff recupera
-- UPDATE/DELETE sobre ubicaciones y movimientos_ubicacion.
-- No volver a ejecutar supabase_ubicaciones.sql después de este archivo.

drop policy if exists ubicaciones_staff_access on public.ubicaciones;
drop policy if exists movimientos_ubicacion_staff_access on public.movimientos_ubicacion;

-- ----------------------------------------------------------------------------
-- 6. (Opcional) Vista de existencias con security_invoker
-- ----------------------------------------------------------------------------
-- No sustituye al guard de las RPC: dentro de una función SECURITY DEFINER
-- la vista se evalúa con el dueño de la función. Solo ayuda si algún día se
-- concede SELECT directo sobre la vista.
--
-- alter view public.existencias_materiales set (security_invoker = true);

commit;

-- ============================================================================
-- VERIFICACIÓN (solo lectura, ejecutar después del bloque anterior)
-- ============================================================================
--
-- 1) Políticas resultantes:
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'materiales', 'despachos', 'almacenes', 'ubicaciones',
--     'ubicaciones_codigos_alias', 'movimientos_ubicacion',
--     'ajustes_inventario_ciclico'
--   )
-- order by tablename, policyname;
--
-- 2) Confirmar que las RPC que escriben son SECURITY DEFINER y su dueño:
-- select p.proname,
--        p.prosecdef as security_definer,
--        pg_get_userbyid(p.proowner) as function_owner
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in (
--     'registrar_salida', 'registrar_conteo_ciclico',
--     'asignar_inventario_ubicacion', 'eliminar_ubicacion_vacia',
--     'eliminar_almacen_inventario', 'corregir_codigo_ubicacion',
--     'obtener_existencias_materiales', 'calcular_existencia_material'
--   )
-- order by p.proname;
--
-- 3) Confirmar el dueño de las tablas (debe coincidir con el de las RPC):
-- select c.relname, pg_get_userbyid(c.relowner) as table_owner,
--        c.relrowsecurity as rls_enabled,
--        c.relforcerowsecurity as force_rls
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname in (
--     'materiales', 'despachos', 'almacenes', 'ubicaciones',
--     'movimientos_ubicacion', 'ajustes_inventario_ciclico'
--   )
-- order by c.relname;
--
-- 4) Prueba funcional con una cuenta staff (no admin):
--    - debe poder leer materiales/despachos/almacenes/ubicaciones;
--    - debe poder surtir (registrar_salida) y traspasar (asignar_inventario_ubicacion);
--    - NO debe poder insertar directo en despachos/almacenes/ubicaciones;
--    - NO debe poder insertar en movimientos_ubicacion;
--    - debe poder consultar existencias por RPC.
--
-- 5) Prueba con una cuenta authenticated sin rol:
--    - las RPC de existencias deben responder NO_AUTORIZADO.
-- ============================================================================
-- ANEXO OPCIONAL · Endurecer is_admin() (identidad)
-- ============================================================================
-- Riesgo actual: is_admin() confía en auth.jwt()->>'email'. Si el proyecto
-- permite registro abierto y no exige confirmación de correo, alguien podría
-- crear una cuenta con el correo del administrador y obtener sus privilegios.
--
-- Mitigación inmediata (configuración, no SQL):
--   Authentication > Providers > Email:
--     - desactivar "Allow new users to sign up" si no se usa registro público;
--     - exigir "Confirm email";
--     - revisar si se permite cambiar el correo sin confirmación.
--
-- Mitigación recomendada (allowlist por user_id, no por email):
--
-- create table if not exists public.app_admins (
--   user_id uuid primary key references auth.users(id) on delete cascade,
--   created_at timestamptz not null default now()
-- );
-- alter table public.app_admins enable row level security;
-- revoke all on public.app_admins from public, anon, authenticated;
--
-- -- Insertar el user_id real del administrador (Authentication > Users):
-- -- insert into public.app_admins(user_id) values ('<uuid-del-admin>');
--
-- create or replace function public.is_admin()
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = pg_catalog, public, auth
-- as $$
--   select exists (
--     select 1 from public.app_admins a where a.user_id = auth.uid()
--   );
-- $$;
-- revoke all on function public.is_admin() from public, anon;
-- grant execute on function public.is_admin() to authenticated;
--
-- Nota: al quitar la comparación por email hay que insertar el user_id antes
-- de reemplazar la función, o el administrador perderá el acceso.
--
-- is_staff() no está versionada en el repositorio. Revisar su definición real:
--   select pg_get_functiondef('public.is_staff()'::regprocedure);
-- Si usa raw_user_meta_data (user_metadata), cualquier usuario puede
-- autoasignarse el rol con auth.updateUser({ data: ... }). Debe usar
-- raw_app_meta_data (app_metadata, solo modificable desde el servidor) o una
-- tabla allowlist como app_admins.
--
-- ficha_publica() tampoco está versionada. Revisar que:
--   - sea SECURITY DEFINER con search_path fijo;
--   - devuelva solo campos de la etiqueta pública (sin proveedor, costo, PO,
--     orden de compra ni datos internos);
--   - no permita enumerar más de lo necesario;
--   - ficha_existencia_publica() no exponga ajustes que no deban ser públicos.
-- ============================================================================
