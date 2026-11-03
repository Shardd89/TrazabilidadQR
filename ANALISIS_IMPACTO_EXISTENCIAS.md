# Análisis de Impacto: Existencias en la Base de Datos

## 📋 Resumen

Propuesta para mover el cálculo de existencias desde el cliente JavaScript al servidor PostgreSQL mediante una **vista materializada** + **índices optimizados** + **funciones RPC**.

---

## 🎯 Objetivos

1. **Reducir tráfico de red** - Evitar descargar todos los despachos y ajustes al cliente
2. **Mejorar rendimiento** - Cálculos precalculados en servidor con índices
3. **Centralizar lógica** - Una sola fuente de verdad para existencias
4. **Facilitar consultas** - APIs simples para obtener existencias
5. **Preparar escalabilidad** - Cuando haya miles de materiales/despachos

---

## 📦 Componentes Propuestos

### 1. **Índices** (Sin impacto funcional)
```sql
-- Acelera consultas de despachos por material
CREATE INDEX despachos_codigo_idx ON despachos(codigo);

-- Acelera consultas de ajustes por material
CREATE INDEX ajustes_inventario_ciclico_codigo_material_idx 
  ON ajustes_inventario_ciclico(codigo_material);

-- Acelera filtros por material + unidad
CREATE INDEX ajustes_inventario_ciclico_codigo_unidad_idx 
  ON ajustes_inventario_ciclico(codigo_material, unidad);
```

**Impacto:**
- ✅ Mejora velocidad de consultas (especialmente `registrar_salida`)
- ✅ Bajo costo de mantenimiento (PostgreSQL los actualiza automáticamente)
- ⚠️ Ocupa espacio adicional en disco (~5-10% del tamaño de las tablas)
- ⚠️ INSERT/UPDATE ligeramente más lentos (negligible con volúmenes bajos)

---

### 2. **Función `calcular_existencia_material(codigo)`**
Calcula existencia de UN material específico en tiempo real.

**Uso:**
```sql
SELECT calcular_existencia_material('MAT-0001');
```

**Retorna (ejemplo):**
```json
{
  "codigo": "MAT-0001",
  "modo": "piezas",
  "cantidad_inicial": 100,
  "surtido": 45,
  "ajustes": -2,
  "existencia": 53
}
```

**Impacto:**
- ✅ Útil para verificaciones puntuales
- ✅ Siempre devuelve datos actualizados
- ⚠️ No optimizado para consultas masivas (usa la vista materializada para eso)

---

### 3. **Vista Materializada `existencias_materiales`**
Precalcula existencias de TODOS los materiales y las almacena.

**Estructura:**
| Columna | Tipo | Descripción |
|---------|------|-------------|
| codigo | text | Código del material |
| cantidad_inicial | numeric | Cantidad registrada inicialmente |
| modo | text | 'longitud' o 'piezas' |
| surtido_piezas | numeric | Total surtido en PZ |
| surtido_mm | numeric | Total surtido en mm (MP) |
| ajustes_piezas | numeric | Suma de ajustes en PZ |
| ajustes_mm | numeric | Suma de ajustes en mm |
| existencia_disponible | numeric | **Existencia final calculada** |

**Impacto:**
- ✅ Consultas ultrarrápidas (datos precalculados con índice)
- ✅ Reduce carga del servidor (no recalcula en cada consulta)
- ⚠️ **Requiere refresh manual** después de cambios:
  - Después de `registrar_salida()` → llamar `refrescar_existencias()`
  - Después de `registrar_conteo_ciclico()` → llamar `refrescar_existencias()`
  - Después de editar material (cantidad) → llamar `refrescar_existencias()`
- ⚠️ Datos pueden estar "levemente desactualizados" entre refresh y cambios
- ⚠️ Ocupa espacio adicional (~igual al tamaño de la tabla materiales)

---

### 4. **Función `refrescar_existencias()`**
Actualiza la vista materializada.

**Uso:**
```javascript
await sb.rpc('refrescar_existencias');
```

**Impacto:**
- ⚠️ Tarda ~50-200ms con 100-500 materiales
- ⚠️ Bloquea lectura durante refresh (usa `CONCURRENTLY` para evitarlo)
- ✅ Debe llamarse después de operaciones que afecten existencias

---

### 5. **Función `obtener_existencias_materiales(codigos[])`**
API simple para consultar existencias desde la vista materializada.

**Uso:**
```javascript
// Todos los materiales
const { data } = await sb.rpc('obtener_existencias_materiales');

// Materiales específicos
const { data } = await sb.rpc('obtener_existencias_materiales', {
  p_codigos: ['MAT-0001', 'MAT-0023']
});
```

**Retorna:**
```json
[
  {
    "codigo": "MAT-0001",
    "modo": "piezas",
    "cantidad_inicial": 100,
    "surtido": 45,
    "ajustes": -2,
    "existencia": 53
  }
]
```

**Impacto:**
- ✅ Reemplaza el cálculo del cliente (`existencia(m)`)
- ✅ Consulta rápida incluso con miles de materiales
- ⚠️ Datos provienen de vista materializada (pueden estar desactualizados)

---

## 🔄 Flujo de Actualización Propuesto

### Opción A: **Refresh Manual** (RECOMENDADO)
```javascript
// Después de confirmarSur()
await sb.rpc('registrar_salida', { p_folio, p_items });
await sb.rpc('refrescar_existencias');  // ⬅️ Agregar esto
await cargar();  // Ya no necesita descargar todos los despachos

// Después de conteo cíclico
await sb.rpc('registrar_conteo_ciclico', { ... });
await sb.rpc('refrescar_existencias');  // ⬅️ Agregar esto
```

**Pros:**
- ✅ Control total sobre cuándo refrescar
- ✅ Sin overhead en operaciones que no afectan existencias
- ✅ Más eficiente en operaciones batch

**Contras:**
- ⚠️ Requiere modificar código cliente
- ⚠️ Si se olvida el refresh, datos quedan desactualizados

---

### Opción B: **Triggers Automáticos** (NO RECOMENDADO para producción)
Refrescar automáticamente después de cada INSERT/UPDATE/DELETE.

**Pros:**
- ✅ Sin cambios en el cliente
- ✅ Siempre actualizado

**Contras:**
- ❌ Mucho overhead (refresh después de CADA cambio)
- ❌ Bloqueos frecuentes
- ❌ No escalable con alto volumen

---

### Opción C: **Cron Job** (Para futuro)
Refrescar cada 5-10 minutos con un job programado.

**Pros:**
- ✅ Sin impacto en transacciones
- ✅ Escalable

**Contras:**
- ⚠️ Datos pueden estar desactualizados hasta 10 min
- ⚠️ Requiere configurar cron en Supabase

---

## 📊 Comparación: Cliente vs Servidor

### Situación Actual (Cliente JavaScript)

```javascript
function existencia(m) {
  const ds = m.despachos || [];
  const ajustes = (m.ajustesInventario || []).reduce((s,a) => s + a.diferencia, 0);
  
  if (modoLong(m)) {
    const {L, u} = longBase(m);
    const total = m.cantidad * L;
    const surtido = ds.reduce((s, d) => s + longitudEnBase(d, u), 0);
    const rest = total - surtido + ajustes;
    return { modo: "long", u, L, total, rest, qty: rest/L };
  }
  
  return {
    modo: "pz",
    u: m.um,
    rest: m.cantidad - ds.reduce((s,d) => s + d.cantidad, 0) + ajustes
  };
}
```

**Carga de datos actual:**
```javascript
// Al cargar la app
const materiales = await leerTodo("materiales", "codigo,data", ["codigo"]);     // ~50KB con 100 mats
const despachos = await leerTodo("despachos", "codigo,t,data,piezas", ["t"]);  // ~200KB con 1000 despachos
const ajustes = await leerTodo("ajustes_inventario_ciclico", "...", ["id"]);   // ~10KB con 50 ajustes
// TOTAL: ~260KB de descarga inicial
```

---

### Situación Propuesta (Servidor)

```javascript
async function cargar() {
  // Opción 1: Cargar materiales + existencias precalculadas
  const [matsRaw, existencias] = await Promise.all([
    leerTodo("materiales", "codigo,data", ["codigo"]),
    sb.rpc('obtener_existencias_materiales')
  ]);
  
  // Crear índice de existencias
  const existMap = new Map(existencias.data.map(e => [e.codigo, e]));
  
  // Los materiales ahora tienen existencia desde servidor
  mats = matsRaw.map(m => ({
    ...m.data,
    codigo: m.codigo,
    existenciaServer: existMap.get(m.codigo)
  }));
  
  // Ya NO se necesitan los despachos ni ajustes en el cliente
}

function existencia(m) {
  if (m.existenciaServer) {
    // Datos del servidor (precalculados)
    const e = m.existenciaServer;
    if (e.modo === 'longitud') {
      return {
        modo: 'long',
        rest: e.existencia,
        u: 'mm',
        total: e.cantidad_inicial * ...
      };
    }
    return { modo: 'pz', rest: e.existencia, u: 'PZ' };
  }
  
  // Fallback al cálculo local (si no hay datos del servidor)
  return existenciaLocal(m);
}
```

**Carga de datos propuesta:**
```javascript
const materiales = await leerTodo("materiales", "codigo,data", ["codigo"]);  // ~50KB
const existencias = await sb.rpc('obtener_existencias_materiales');         // ~5KB con 100 mats
// TOTAL: ~55KB de descarga inicial ✅ (80% menos)
```

---

## ⚡ Impacto en Rendimiento

### Escenario 1: App con 100 materiales, 500 despachos

| Métrica | Actual (Cliente) | Propuesto (Servidor) | Mejora |
|---------|------------------|----------------------|--------|
| Descarga inicial | ~260KB | ~55KB | **-79%** ✅ |
| Tiempo de carga | ~800ms | ~200ms | **-75%** ✅ |
| Cálculo existencias | ~50ms (cliente) | <1ms (índice) | **-98%** ✅ |
| Memoria cliente | Alta (todos los datos) | Baja (solo agregados) | **-80%** ✅ |

---

### Escenario 2: App con 500 materiales, 5000 despachos

| Métrica | Actual (Cliente) | Propuesto (Servidor) | Mejora |
|---------|------------------|----------------------|--------|
| Descarga inicial | ~2.5MB | ~250KB | **-90%** ✅ |
| Tiempo de carga | ~5s | ~500ms | **-90%** ✅ |
| Cálculo existencias | ~500ms | <5ms | **-99%** ✅ |
| Uso CPU cliente | Alto | Mínimo | **-95%** ✅ |

---

## ⚠️ Consideraciones de Implementación

### 1. **Cuándo refrescar la vista**
```javascript
// Después de registrar salida
await sb.rpc('registrar_salida', { p_folio, p_items });
await sb.rpc('refrescar_existencias');  // ⬅️ CRÍTICO

// Después de conteo cíclico
await sb.rpc('registrar_conteo_ciclico', { ... });
await sb.rpc('refrescar_existencias');  // ⬅️ CRÍTICO

// Después de editar cantidad de material
await sb.from('materiales').update({ data: matData(m) }).eq('codigo', cod);
await sb.rpc('refrescar_existencias');  // ⬅️ CRÍTICO
```

---

### 2. **Manejo de errores**
```javascript
try {
  const { data, error } = await sb.rpc('obtener_existencias_materiales');
  if (error) throw error;
  
  // Usar datos del servidor
  actualizarExistenciasDesdeServidor(data);
} catch (err) {
  console.warn('No se pudieron cargar existencias del servidor, usando cálculo local', err);
  // Fallback: usar cálculo local existente
}
```

---

### 3. **Migración gradual**
```javascript
// Mantener ambos métodos durante transición
function existencia(m) {
  // Priorizar datos del servidor
  if (m.existenciaServer) {
    return convertirExistenciaServer(m.existenciaServer);
  }
  
  // Fallback a cálculo local
  return existenciaLocal(m);
}
```

---

## 📝 Cambios Requeridos en el Cliente

### Mínimos (solo para probar):
1. Llamar `refrescar_existencias()` después de `registrar_salida()`
2. Llamar `refrescar_existencias()` después de `registrar_conteo_ciclico()`

### Completos (para aprovechar al máximo):
1. Modificar `cargar()` para obtener existencias precalculadas
2. Modificar `existencia(m)` para usar datos del servidor cuando estén disponibles
3. **Eliminar descarga de `despachos`** (ya no se necesitan en el cliente)
4. **Eliminar descarga de `ajustes_inventario_ciclico`** (ya no se necesitan)
5. Actualizar `renderInventario()` y tablas que muestren existencias

---

## 🎯 Recomendación

### **FASE 1: Implementar SQL + Refresh Manual** (Esta semana)
- ✅ Aplicar `supabase_existencias_vista.sql` en Supabase
- ✅ Agregar `refrescar_existencias()` después de salidas y conteos
- ✅ Probar que funciona sin romper nada

### **FASE 2: Migrar Cliente a Usar Servidor** (Próxima iteración)
- ✅ Modificar `cargar()` para usar `obtener_existencias_materiales()`
- ✅ Modificar `existencia(m)` para priorizar datos del servidor
- ✅ Eliminar carga de despachos y ajustes del cliente
- ✅ Probar y validar

### **FASE 3: Optimizar Refresh** (Futuro)
- ✅ Evaluar cron job si el volumen crece
- ✅ Considerar refresh selectivo (solo materiales modificados)

---

## ❓ Preguntas para Decidir

1. **¿Prefieres refresh manual o automático?**
   - Manual = Control + Eficiencia
   - Automático = Sin cambios en cliente pero más lento

2. **¿Cuándo implementar la migración completa del cliente?**
   - Ahora = Beneficio inmediato pero más cambios
   - Después = Implementación gradual

3. **¿Qué tan importante es tener existencias al milisegundo?**
   - Crítico = Refresh después de cada cambio
   - Aceptable 1-5 min desfase = Cron job

---

## 📋 Checklist de Aprobación

Marca lo que apruebas:

- [ ] ✅ Aplicar índices (`despachos_codigo_idx`, etc.)
- [ ] ✅ Crear función `calcular_existencia_material(codigo)`
- [ ] ✅ Crear vista materializada `existencias_materiales`
- [ ] ✅ Crear función `refrescar_existencias()`
- [ ] ✅ Crear función `obtener_existencias_materiales(codigos[])`
- [ ] ⏸️ Modificar cliente para usar existencias del servidor (después)
- [ ] ❌ NO usar triggers automáticos (demasiado overhead)

---

**¿Apruebas que aplique el SQL en `supabase_existencias_vista.sql` y agregue las llamadas a `refrescar_existencias()` en el código?**
