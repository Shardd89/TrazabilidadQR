-- ============================================================================
-- EXISTENCIAS EN LA BASE DE DATOS
-- ============================================================================
-- Implementación: vista normal (siempre actualizada) + funciones RPC.
--
-- Por qué NO una vista materializada:
--   * REFRESH MATERIALIZED VIEW CONCURRENTLY no se puede ejecutar dentro de
--     una función/transacción, por lo que no se puede exponer vía RPC.
--   * Un refresh normal bloquea las lecturas mientras dura.
--   * Con el volumen actual (cientos de materiales / miles de despachos) una
--     vista normal con índices responde en milisegundos y nunca queda
--     desactualizada, sin necesidad de refrescos manuales ni cron.
--
-- Contrato único (mismo que usa index.html):
--   * modo = 'longitud': unidad es la unidad base del material (mm si tiene
--     longitudIndividual; si no, longU/longitudUnidad). total/surtido/ajustes/
--     existencia están en esa unidad.
--   * modo = 'piezas': unidad = 'PZ'; los valores están en piezas.
--
-- Este script es idempotente: se puede ejecutar varias veces.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 0: Limpiar objetos de la propuesta anterior (vista materializada)
-- ----------------------------------------------------------------------------

drop function if exists public.obtener_existencias_materiales(text[]);
drop function if exists public.refrescar_existencias();
drop function if exists public.calcular_existencia_material(text);

do $$
declare
  v_kind "char";
begin
  select c.relkind into v_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'existencias_materiales';

  if v_kind = 'm' then
    execute 'drop materialized view public.existencias_materiales';
  elsif v_kind = 'v' then
    execute 'drop view public.existencias_materiales';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- PASO 1: Índices para acelerar el cálculo
-- ----------------------------------------------------------------------------
-- despachos ya tiene un índice único por (codigo, t), que cubre los filtros
-- por codigo. El índice simple sobre codigo era redundante.

drop index if exists public.despachos_codigo_idx;
drop index if exists public.ajustes_inventario_ciclico_codigo_material_idx;

-- Índice compuesto: cubre búsquedas por material y por (material, unidad).
create index if not exists ajustes_inventario_ciclico_codigo_unidad_idx
  on public.ajustes_inventario_ciclico (codigo_material, unidad);

-- ----------------------------------------------------------------------------
-- PASO 2: Factor de conversión de unidades de longitud a mm
-- ----------------------------------------------------------------------------

create or replace function public.factor_longitud(p_unidad text)
returns numeric
language sql
immutable
as $$
  select case lower(coalesce(p_unidad, ''))
    when 'cm' then 10
    when 'm' then 1000
    when 'in' then 25.4
    else 1
  end;
$$;

comment on function public.factor_longitud(text) is
  'Convierte una unidad de longitud (mm, cm, m, in) a milímetros. Unidades desconocidas se tratan como mm.';

revoke all on function public.factor_longitud(text) from public, anon;
grant execute on function public.factor_longitud(text) to authenticated;

-- ----------------------------------------------------------------------------
-- PASO 3: Vista de existencias (siempre actualizada)
-- ----------------------------------------------------------------------------

create or replace view public.existencias_materiales as
with base as (
  select
    m.codigo,
    coalesce(nullif(m.data->>'cantidad', '')::numeric, 0) as cantidad_inicial,
    (
      lower(coalesce(m.data->>'tipoRegistro', '')) in ('mp', 'materia prima')
      or lower(coalesce(m.data->>'esMP', 'false')) = 'true'
    ) as es_mp,
    coalesce(nullif(m.data->>'longitudIndividual', '')::numeric, 0) as longitud_individual,
    coalesce(nullif(m.data->>'longitud', '')::numeric, 0) as longitud,
    case
      when coalesce(nullif(m.data->>'longU', ''), nullif(m.data->>'longitudUnidad', ''), 'mm')
           in ('mm', 'cm', 'm', 'in')
      then coalesce(nullif(m.data->>'longU', ''), nullif(m.data->>'longitudUnidad', ''), 'mm')
      else 'mm'
    end as unidad_longitud
  from public.materiales m
),
calc as (
  select
    b.*,
    case
      when b.es_mp and (b.longitud_individual > 0 or b.longitud > 0)
      then 'longitud'
      else 'piezas'
    end as modo,
    case
      when b.es_mp and b.longitud_individual > 0 then 'mm'
      when b.es_mp and b.longitud > 0 then b.unidad_longitud
      else 'PZ'
    end as unidad,
    case
      when b.es_mp and b.longitud_individual > 0 then b.longitud_individual
      when b.es_mp and b.longitud > 0 then b.longitud
      else null
    end as longitud_base,
    case
      when b.es_mp and b.longitud_individual > 0 then b.cantidad_inicial * b.longitud_individual
      when b.es_mp and b.longitud > 0 then b.cantidad_inicial * b.longitud
      else b.cantidad_inicial
    end as total
  from base b
),
surtido as (
  select
    c.codigo,
    sum(coalesce(nullif(d.data->>'cantidad', '')::numeric, 0)) as piezas,
    sum(
      coalesce(nullif(d.data->>'longitud', '')::numeric, 0)
      * public.factor_longitud(
          case
            when coalesce(d.data->>'unidad', '') in ('mm', 'cm', 'm', 'in') then d.data->>'unidad'
            else c.unidad
          end
        )
      / public.factor_longitud(c.unidad)
    ) as base
  from calc c
  join public.despachos d on d.codigo = c.codigo
  group by c.codigo, c.unidad
),
ajustes as (
  select
    c.codigo,
    sum(case when a.unidad = 'PZ' then a.diferencia else 0 end) as piezas,
    sum(
      case
        when a.unidad in ('mm', 'cm', 'm', 'in')
        then a.diferencia * public.factor_longitud(a.unidad) / public.factor_longitud(c.unidad)
        else 0
      end
    ) as base
  from calc c
  join public.ajustes_inventario_ciclico a on a.codigo_material = c.codigo
  group by c.codigo, c.unidad
)
select
  c.codigo,
  c.modo,
  c.unidad,
  c.cantidad_inicial,
  c.longitud_base,
  round(c.total, 4) as total,
  round(
    case when c.modo = 'longitud' then coalesce(s.base, 0) else coalesce(s.piezas, 0) end,
    4
  ) as surtido,
  round(
    case when c.modo = 'longitud' then coalesce(a.base, 0) else coalesce(a.piezas, 0) end,
    4
  ) as ajustes,
  round(
    c.total
    - case when c.modo = 'longitud' then coalesce(s.base, 0) else coalesce(s.piezas, 0) end
    + case when c.modo = 'longitud' then coalesce(a.base, 0) else coalesce(a.piezas, 0) end,
    4
  ) as existencia
from calc c
left join surtido s on s.codigo = c.codigo
left join ajustes a on a.codigo = c.codigo;

comment on view public.existencias_materiales is
  'Existencias calculadas en el servidor. Siempre actualizada (sin refresco). Unidad: PZ o unidad base de longitud (mm/cm/m/in).';

-- La vista solo se consume a través de los RPC (security definer).
-- Se revoca el acceso directo para no saltarse las políticas RLS de materiales.
revoke all on public.existencias_materiales from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- PASO 4: Función de consulta para el cliente
-- ----------------------------------------------------------------------------

create or replace function public.obtener_existencias_materiales(
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
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.obtener_existencias_materiales(text[]) from public, anon;
grant execute on function public.obtener_existencias_materiales(text[]) to authenticated;

comment on function public.obtener_existencias_materiales(text[]) is
  'Consulta rápida de existencias. Devuelve todos los materiales o solo los códigos indicados. Misma semántica que existencia() del cliente.';

-- ----------------------------------------------------------------------------
-- PASO 5: Cálculo puntual de un material (diagnóstico / verificaciones)
-- ----------------------------------------------------------------------------

create or replace function public.calcular_existencia_material(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select to_jsonb(e) from public.existencias_materiales e where e.codigo = p_codigo),
    jsonb_build_object('codigo', p_codigo, 'error', 'MATERIAL_NO_ENCONTRADO')
  );
$$;

revoke all on function public.calcular_existencia_material(text) from public, anon;
grant execute on function public.calcular_existencia_material(text) to authenticated;

comment on function public.calcular_existencia_material(text) is
  'Devuelve la existencia de un material con el mismo contrato que obtener_existencias_materiales().';

-- ----------------------------------------------------------------------------
-- PASO 6: Verificación rápida (opcional, solo lectura)
-- ----------------------------------------------------------------------------
-- Ejecuta estas consultas para validar contra el cálculo del cliente:
--
--   select * from public.obtener_existencias_materiales();
--   select public.calcular_existencia_material('MAT-0001');
--
-- Prueba al menos: material en piezas, MP con longitudIndividual y MP con
-- longU distinto de mm.
