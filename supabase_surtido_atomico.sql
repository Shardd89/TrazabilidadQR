-- Función RPC para registrar salidas (surtido) de forma atómica
-- Bloquea filas, valida existencias en el servidor y rechaza si hay insuficiencia o piezas duplicadas

create or replace function public.registrar_salida(
  p_folio text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_codigo text;
  v_material public.materiales%rowtype;
  v_despacho record;
  v_t bigint;
  v_piezas integer[];
  v_modo text;
  v_cantidad numeric;
  v_longitud numeric;
  v_unidad text;
  v_es_mp boolean;
  v_longitud_individual numeric;
  v_longitud_base numeric;
  v_unidad_longitud text;
  v_total_longitud numeric;
  v_total_piezas numeric;
  v_surtido_longitud numeric;
  v_surtido_piezas numeric;
  v_ajustes numeric;
  v_existencia_longitud numeric;
  v_existencia_piezas numeric;
  v_piezas_surtidas integer[];
  v_insertados integer := 0;
  v_factor numeric;
begin
  -- Verificar autorización
  if not (public.is_staff() or public.is_admin()) then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Validar parámetros
  if coalesce(trim(p_folio), '') = ''
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'DATOS_DE_SALIDA_INVALIDOS';
  end if;

  -- Procesar cada item
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_codigo := nullif(trim(v_item->>'codigo'), '');
    v_t := (v_item->>'t')::bigint;
    v_piezas := case 
      when jsonb_typeof(v_item->'piezas') = 'array' 
      then (select array_agg(value::integer) from jsonb_array_elements_text(v_item->'piezas'))
      else '{}'::integer[]
    end;

    if v_codigo is null or v_t is null then
      raise exception 'DATOS_DE_ITEM_INVALIDOS';
    end if;

    -- Bloquear el material para actualización
    select * into v_material
    from public.materiales
    where codigo = v_codigo
    for update;

    if not found then
      raise exception 'MATERIAL_NO_ENCONTRADO: %', v_codigo;
    end if;

    -- Extraer datos del material
    v_es_mp := lower(coalesce(v_material.data->>'tipoRegistro', '')) in ('mp', 'materia prima')
      or lower(coalesce(v_material.data->>'esMP', 'false')) = 'true';
    v_total_piezas := coalesce(nullif(v_material.data->>'cantidad', '')::numeric, 0);
    v_longitud_individual := coalesce(nullif(v_material.data->>'longitudIndividual', '')::numeric, 0);
    v_longitud_base := coalesce(nullif(v_material.data->>'longitud', '')::numeric, 0);
    v_unidad_longitud := coalesce(
      nullif(v_material.data->>'longU', ''),
      nullif(v_material.data->>'longitudUnidad', ''),
      'mm'
    );
    if v_unidad_longitud not in ('mm', 'cm', 'm', 'in') then
      v_unidad_longitud := 'mm';
    end if;

    -- Determinar modo y unidad base (mismo criterio que existencia() del cliente):
    -- si hay longitudIndividual la base es mm; si no, se usa longU/longitudUnidad.
    if v_es_mp and v_longitud_individual > 0 then
      v_modo := 'longitud';
      v_longitud_base := v_longitud_individual;
      v_factor := 1;
    elsif v_es_mp and v_longitud_base > 0 then
      v_modo := 'longitud';
      v_factor := case v_unidad_longitud
        when 'cm' then 10
        when 'm' then 1000
        when 'in' then 25.4
        else 1
      end;
    else
      v_modo := 'piezas';
      v_factor := 1;
    end if;

    -- Calcular existencia actual
    if v_modo = 'longitud' then
      -- Total en unidad base
      v_total_longitud := v_total_piezas * v_longitud_base;

      -- Surtido acumulado convertido a la unidad base
      select coalesce(sum(
        coalesce(nullif(d.data->>'longitud', '')::numeric, 0)
        * (case
            when coalesce(d.data->>'unidad', '') in ('mm', 'cm', 'm', 'in')
            then case d.data->>'unidad'
              when 'cm' then 10
              when 'm' then 1000
              when 'in' then 25.4
              else 1
            end
            else v_factor
          end)
        / v_factor
      ), 0)
      into v_surtido_longitud
      from public.despachos d
      where d.codigo = v_codigo;

      -- Ajustes: registrar_conteo_ciclico guarda la diferencia en unidad base
      select coalesce(sum((a.diferencia)::numeric), 0)
      into v_ajustes
      from public.ajustes_inventario_ciclico a
      where a.codigo_material = v_codigo
        and a.unidad in ('mm', 'cm', 'm', 'in');

      v_existencia_longitud := v_total_longitud - v_surtido_longitud + v_ajustes;

      -- Validar que la longitud solicitada no exceda la existencia
      v_longitud := coalesce(nullif(v_item->'data'->>'longitud', '')::numeric, 0);
      v_unidad := coalesce(
        nullif(v_item->'data'->>'unidad', ''),
        case when v_longitud_individual > 0 then 'mm' else v_unidad_longitud end
      );
      if v_unidad not in ('mm', 'cm', 'm', 'in') then
        v_unidad := case when v_longitud_individual > 0 then 'mm' else v_unidad_longitud end;
      end if;

      if (v_longitud * (case v_unidad
            when 'cm' then 10
            when 'm' then 1000
            when 'in' then 25.4
            else 1
          end) / v_factor) > v_existencia_longitud + 0.0001 then
        raise exception 'EXISTENCIA_INSUFICIENTE: % · Disponible: % % · Solicitado: % %',
          v_codigo,
          round(v_existencia_longitud, 4),
          case when v_factor = 1 then 'mm' else v_unidad_longitud end,
          round(v_longitud, 4),
          v_unidad;
      end if;

    else
      -- Modo piezas
      -- Calcular surtido acumulado
      select coalesce(sum((d.data->>'cantidad')::numeric), 0)
      into v_surtido_piezas
      from public.despachos d
      where d.codigo = v_codigo;

      -- Calcular ajustes de inventario
      select coalesce(sum((a.diferencia)::numeric), 0)
      into v_ajustes
      from public.ajustes_inventario_ciclico a
      where a.codigo_material = v_codigo
        and a.unidad = 'PZ';

      v_existencia_piezas := v_total_piezas - v_surtido_piezas + v_ajustes;

      -- Validar cantidad
      v_cantidad := (v_item->'data'->>'cantidad')::numeric;
      if v_cantidad > v_existencia_piezas + 0.0001 then
        raise exception 'EXISTENCIA_INSUFICIENTE: % · Disponible: % PZ · Solicitado: %',
          v_codigo,
          round(v_existencia_piezas, 4),
          round(v_cantidad, 4);
      end if;

      -- Si hay piezas individuales, validar que no estén ya surtidas
      if cardinality(v_piezas) > 0 then
        -- Obtener piezas ya surtidas
        select array_agg(distinct pieza_num)
        into v_piezas_surtidas
        from public.despachos d,
             lateral unnest(d.piezas) as pieza_num
        where d.codigo = v_codigo;

        -- Validar duplicados
        if exists (
          select 1
          from unnest(v_piezas) as nueva_pieza
          where nueva_pieza = any(coalesce(v_piezas_surtidas, '{}'::integer[]))
        ) then
          raise exception 'PIEZA_YA_SURTIDA: % · Piezas duplicadas en: %',
            v_codigo,
            (select array_agg(p) from unnest(v_piezas) p where p = any(coalesce(v_piezas_surtidas, '{}'::integer[])));
        end if;
      end if;
    end if;

    -- Insertar el despacho
    insert into public.despachos (codigo, t, data, piezas)
    values (
      v_codigo,
      v_t,
      v_item->'data',
      coalesce(v_piezas, '{}'::integer[])
    );

    v_insertados := v_insertados + 1;
  end loop;

  return jsonb_build_object(
    'folio', p_folio,
    'registrados', v_insertados
  );
end;
$$;

revoke all on function public.registrar_salida(text, jsonb) from public, anon;
grant execute on function public.registrar_salida(text, jsonb) to authenticated;

comment on function public.registrar_salida(text, jsonb) is 
'Registra salidas de material de forma atómica. Bloquea filas (FOR UPDATE), recalcula existencias en el servidor, y rechaza con EXISTENCIA_INSUFICIENTE o PIEZA_YA_SURTIDA si no es válido.';
