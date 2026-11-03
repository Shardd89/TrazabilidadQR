-- ============================================================================
-- EXISTENCIAS EN LA BASE DE DATOS
-- ============================================================================
-- Propuesta: Vista materializada + índices para calcular existencias en el servidor
-- Esta implementación optimiza el cálculo de existencias y permite consultas eficientes

-- ----------------------------------------------------------------------------
-- PASO 1: Crear índices para optimizar consultas
-- ----------------------------------------------------------------------------

-- Índice en despachos por código de material (acelera sum de despachos)
create index if not exists despachos_codigo_idx 
  on public.despachos (codigo);

-- Índice en ajustes_inventario_ciclico por código de material
create index if not exists ajustes_inventario_ciclico_codigo_material_idx 
  on public.ajustes_inventario_ciclico (codigo_material);

-- Índice compuesto para filtrar ajustes por material y unidad (usado en cálculos de longitud)
create index if not exists ajustes_inventario_ciclico_codigo_unidad_idx 
  on public.ajustes_inventario_ciclico (codigo_material, unidad);

-- ----------------------------------------------------------------------------
-- PASO 2: Función para calcular existencia de un material específico
-- ----------------------------------------------------------------------------

create or replace function public.calcular_existencia_material(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_material record;
  v_es_mp boolean;
  v_longitud_individual numeric;
  v_unidad_longitud text;
  v_cantidad_inicial numeric;
  v_total_longitud numeric;
  v_surtido_longitud numeric;
  v_surtido_piezas numeric;
  v_ajustes_longitud numeric;
  v_ajustes_piezas numeric;
  v_existencia_longitud numeric;
  v_existencia_piezas numeric;
  v_factor numeric;
  v_modo text;
begin
  -- Obtener datos del material
  select 
    codigo,
    (data->>'esMP')::boolean as es_mp,
    (data->>'longitudIndividual')::numeric as longitud_individual,
    coalesce(data->>'longU', data->>'longitudUnidad', 'mm') as unidad_longitud,
    (data->>'cantidad')::numeric as cantidad
  into v_material
  from public.materiales
  where codigo = p_codigo;

  if not found then
    return jsonb_build_object(
      'codigo', p_codigo,
      'error', 'MATERIAL_NO_ENCONTRADO'
    );
  end if;

  v_es_mp := coalesce(v_material.es_mp, false);
  v_longitud_individual := v_material.longitud_individual;
  v_unidad_longitud := v_material.unidad_longitud;
  v_cantidad_inicial := coalesce(v_material.cantidad, 0);

  -- Determinar modo: longitud o piezas
  if v_es_mp and v_longitud_individual is not null and v_longitud_individual > 0 then
    v_modo := 'longitud';
    
    -- Factor de conversión a mm (base)
    v_factor := case v_unidad_longitud
      when 'cm' then 10
      when 'm' then 1000
      when 'in' then 25.4
      else 1  -- 'mm'
    end;
    
    v_total_longitud := v_cantidad_inicial * v_longitud_individual * v_factor;

    -- Calcular surtido acumulado en mm
    select coalesce(sum(
      case 
        when (data->>'modo') = 'longitud' then
          (data->>'longitud')::numeric * 
          case coalesce(data->>'unidad', 'mm')
            when 'cm' then 10
            when 'm' then 1000
            when 'in' then 25.4
            else 1
          end
        else 0
      end
    ), 0)
    into v_surtido_longitud
    from public.despachos
    where codigo = p_codigo;

    -- Calcular ajustes de inventario en mm
    select coalesce(sum(
      diferencia::numeric * 
      case unidad
        when 'cm' then 10
        when 'm' then 1000
        when 'in' then 25.4
        when 'mm' then 1
        else 0
      end
    ), 0)
    into v_ajustes_longitud
    from public.ajustes_inventario_ciclico
    where codigo_material = p_codigo
      and unidad in ('mm', 'cm', 'm', 'in');

    v_existencia_longitud := v_total_longitud - v_surtido_longitud + v_ajustes_longitud;

    return jsonb_build_object(
      'codigo', p_codigo,
      'modo', 'longitud',
      'cantidad_inicial', v_cantidad_inicial,
      'longitud_individual', v_longitud_individual,
      'unidad_longitud', v_unidad_longitud,
      'total_mm', round(v_total_longitud, 4),
      'surtido_mm', round(v_surtido_longitud, 4),
      'ajustes_mm', round(v_ajustes_longitud, 4),
      'existencia_mm', round(v_existencia_longitud, 4),
      'existencia_piezas', round(v_existencia_longitud / (v_longitud_individual * v_factor), 4)
    );
  else
    v_modo := 'piezas';

    -- Calcular surtido acumulado en piezas
    select coalesce(sum((data->>'cantidad')::numeric), 0)
    into v_surtido_piezas
    from public.despachos
    where codigo = p_codigo;

    -- Calcular ajustes de inventario en piezas
    select coalesce(sum(diferencia::numeric), 0)
    into v_ajustes_piezas
    from public.ajustes_inventario_ciclico
    where codigo_material = p_codigo
      and unidad = 'PZ';

    v_existencia_piezas := v_cantidad_inicial - v_surtido_piezas + v_ajustes_piezas;

    return jsonb_build_object(
      'codigo', p_codigo,
      'modo', 'piezas',
      'cantidad_inicial', v_cantidad_inicial,
      'surtido', round(v_surtido_piezas, 4),
      'ajustes', round(v_ajustes_piezas, 4),
      'existencia', round(v_existencia_piezas, 4)
    );
  end if;
end;
$$;

revoke all on function public.calcular_existencia_material(text) from public, anon;
grant execute on function public.calcular_existencia_material(text) to authenticated;

comment on function public.calcular_existencia_material(text) is 
'Calcula la existencia disponible de un material específico considerando cantidad inicial, despachos y ajustes de inventario. Soporta modo longitud (MP) y modo piezas.';

-- ----------------------------------------------------------------------------
-- PASO 3: Vista materializada para existencias de todos los materiales
-- ----------------------------------------------------------------------------

create materialized view if not exists public.existencias_materiales as
select 
  m.codigo,
  (m.data->>'cantidad')::numeric as cantidad_inicial,
  (m.data->>'esMP')::boolean as es_mp,
  (m.data->>'longitudIndividual')::numeric as longitud_individual,
  coalesce(m.data->>'longU', m.data->>'longitudUnidad', 'mm') as unidad_longitud,
  
  -- Modo del material
  case 
    when coalesce((m.data->>'esMP')::boolean, false) 
         and (m.data->>'longitudIndividual')::numeric > 0 
    then 'longitud'
    else 'piezas'
  end as modo,
  
  -- Surtido en piezas
  coalesce((
    select sum((d.data->>'cantidad')::numeric)
    from public.despachos d
    where d.codigo = m.codigo
  ), 0) as surtido_piezas,
  
  -- Surtido en mm (para materiales con longitud)
  coalesce((
    select sum(
      case 
        when (d.data->>'modo') = 'longitud' then
          (d.data->>'longitud')::numeric * 
          case coalesce(d.data->>'unidad', 'mm')
            when 'cm' then 10
            when 'm' then 1000
            when 'in' then 25.4
            else 1
          end
        else 0
      end
    )
    from public.despachos d
    where d.codigo = m.codigo
  ), 0) as surtido_mm,
  
  -- Ajustes en piezas
  coalesce((
    select sum(a.diferencia::numeric)
    from public.ajustes_inventario_ciclico a
    where a.codigo_material = m.codigo
      and a.unidad = 'PZ'
  ), 0) as ajustes_piezas,
  
  -- Ajustes en mm (convertidos a base)
  coalesce((
    select sum(
      a.diferencia::numeric * 
      case a.unidad
        when 'cm' then 10
        when 'm' then 1000
        when 'in' then 25.4
        when 'mm' then 1
        else 0
      end
    )
    from public.ajustes_inventario_ciclico a
    where a.codigo_material = m.codigo
      and a.unidad in ('mm', 'cm', 'm', 'in')
  ), 0) as ajustes_mm,
  
  -- Existencia calculada según el modo
  case 
    when coalesce((m.data->>'esMP')::boolean, false) 
         and (m.data->>'longitudIndividual')::numeric > 0 then
      -- Modo longitud: existencia en mm
      (m.data->>'cantidad')::numeric * 
      (m.data->>'longitudIndividual')::numeric * 
      case coalesce(m.data->>'longU', m.data->>'longitudUnidad', 'mm')
        when 'cm' then 10
        when 'm' then 1000
        when 'in' then 25.4
        else 1
      end -
      coalesce((
        select sum(
          case 
            when (d.data->>'modo') = 'longitud' then
              (d.data->>'longitud')::numeric * 
              case coalesce(d.data->>'unidad', 'mm')
                when 'cm' then 10
                when 'm' then 1000
                when 'in' then 25.4
                else 1
              end
            else 0
          end
        )
        from public.despachos d
        where d.codigo = m.codigo
      ), 0) +
      coalesce((
        select sum(
          a.diferencia::numeric * 
          case a.unidad
            when 'cm' then 10
            when 'm' then 1000
            when 'in' then 25.4
            when 'mm' then 1
            else 0
          end
        )
        from public.ajustes_inventario_ciclico a
        where a.codigo_material = m.codigo
          and a.unidad in ('mm', 'cm', 'm', 'in')
      ), 0)
    else
      -- Modo piezas: existencia en PZ
      (m.data->>'cantidad')::numeric -
      coalesce((
        select sum((d.data->>'cantidad')::numeric)
        from public.despachos d
        where d.codigo = m.codigo
      ), 0) +
      coalesce((
        select sum(a.diferencia::numeric)
        from public.ajustes_inventario_ciclico a
        where a.codigo_material = m.codigo
          and a.unidad = 'PZ'
      ), 0)
  end as existencia_disponible

from public.materiales m;

-- Índice único en la vista materializada
create unique index if not exists existencias_materiales_codigo_uidx 
  on public.existencias_materiales (codigo);

-- Índice para búsquedas por existencia
create index if not exists existencias_materiales_disponible_idx 
  on public.existencias_materiales (existencia_disponible);

-- Permisos
alter materialized view public.existencias_materiales owner to postgres;
grant select on public.existencias_materiales to authenticated;

comment on materialized view public.existencias_materiales is 
'Vista materializada que precalcula existencias de todos los materiales. Se debe refrescar después de cambios en materiales, despachos o ajustes.';

-- ----------------------------------------------------------------------------
-- PASO 4: Función para refrescar la vista materializada
-- ----------------------------------------------------------------------------

create or replace function public.refrescar_existencias()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.existencias_materiales;
end;
$$;

revoke all on function public.refrescar_existencias() from public, anon;
grant execute on function public.refrescar_existencias() to authenticated;

comment on function public.refrescar_existencias() is 
'Refresca la vista materializada de existencias. Llamar después de insertar/actualizar materiales, despachos o ajustes.';

-- ----------------------------------------------------------------------------
-- PASO 5: Trigger para auto-refresh (opcional, evaluar impacto)
-- ----------------------------------------------------------------------------

-- Nota: Los triggers en vistas materializadas pueden tener impacto en rendimiento.
-- Se recomienda refrescar manualmente o con un cron job en producción.
-- Descomentar solo si el volumen de transacciones es bajo.

/*
create or replace function public.trigger_refrescar_existencias()
returns trigger
language plpgsql
as $$
begin
  perform public.refrescar_existencias();
  return null;
end;
$$;

create trigger after_despachos_change
  after insert or update or delete on public.despachos
  for each statement
  execute function public.trigger_refrescar_existencias();

create trigger after_ajustes_change
  after insert or update or delete on public.ajustes_inventario_ciclico
  for each statement
  execute function public.trigger_refrescar_existencias();

create trigger after_materiales_cantidad_change
  after update of data on public.materiales
  for each statement
  execute function public.trigger_refrescar_existencias();
*/

-- ----------------------------------------------------------------------------
-- PASO 6: Función de consulta rápida (usa la vista materializada)
-- ----------------------------------------------------------------------------

create or replace function public.obtener_existencias_materiales(
  p_codigos text[] default null
)
returns table (
  codigo text,
  modo text,
  cantidad_inicial numeric,
  surtido numeric,
  ajustes numeric,
  existencia numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_codigos is null then
    -- Todos los materiales
    return query
    select 
      e.codigo,
      e.modo,
      e.cantidad_inicial,
      case when e.modo = 'longitud' then e.surtido_mm else e.surtido_piezas end,
      case when e.modo = 'longitud' then e.ajustes_mm else e.ajustes_piezas end,
      e.existencia_disponible
    from public.existencias_materiales e
    order by e.codigo;
  else
    -- Materiales específicos
    return query
    select 
      e.codigo,
      e.modo,
      e.cantidad_inicial,
      case when e.modo = 'longitud' then e.surtido_mm else e.surtido_piezas end,
      case when e.modo = 'longitud' then e.ajustes_mm else e.ajustes_piezas end,
      e.existencia_disponible
    from public.existencias_materiales e
    where e.codigo = any(p_codigos)
    order by e.codigo;
  end if;
end;
$$;

revoke all on function public.obtener_existencias_materiales(text[]) from public, anon;
grant execute on function public.obtener_existencias_materiales(text[]) to authenticated;

comment on function public.obtener_existencias_materiales(text[]) is 
'Consulta rápida de existencias usando la vista materializada. Devuelve existencias de materiales específicos o todos si no se especifican códigos.';

-- ----------------------------------------------------------------------------
-- REFRESH INICIAL
-- ----------------------------------------------------------------------------

refresh materialized view public.existencias_materiales;
