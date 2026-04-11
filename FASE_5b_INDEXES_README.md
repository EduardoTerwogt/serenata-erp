# Fase 5b: Crear índices en Supabase

## Instrucciones para ejecutar Fase 5b

El archivo `db/migrations/20260411_performance_indexes_fase5b.sql` contiene los índices necesarios para optimizar las búsquedas de catálogos.

### Paso 1: Acceder a Supabase

1. Ir a https://supabase.com/dashboard
2. Seleccionar el proyecto Serenata ERP
3. Ir a "SQL Editor" en el menú izquierdo

### Paso 2: Ejecutar la migración

Opción A (automática): Si tu proyecto usa Supabase CLI, ejecutar:
```bash
supabase migration up
```

Opción B (manual): Copiar todo el contenido de `db/migrations/20260411_performance_indexes_fase5b.sql` y pegarlo en el SQL Editor, luego hacer click en "Run".

### Paso 3: Verificar que los índices fueron creados

En el SQL Editor, ejecutar:
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('clientes', 'productos', 'responsables', 'cotizaciones')
ORDER BY indexname;
```

Deberías ver:
- `idx_clientes_nombre`
- `idx_clientes_activo`
- `idx_cotizaciones_id`
- `idx_productos_activo`
- `idx_productos_descripcion`
- `idx_responsables_activo`
- `idx_responsables_nombre`

## Impacto esperado

- `/api/clientes?q=`: **1.43s → 300-400ms** (reducción ~70%)
- `/api/productos?q=`: **457ms → 150-200ms** (reducción ~60%)
- `/api/responsables`: **455ms → 150-200ms** (reducción ~60%)
- **Total: 3.1s → ~800ms** (reducción ~74%)

## Verificación en DevTools

Después de ejecutar la migración:

1. Abrir DevTools (F12)
2. Ir a "Network" tab
3. Navegar a Cotizaciones → Nueva Cotización
4. Observar los tiempos de:
   - `/api/clientes?q=` (debe ser ~300-400ms)
   - `/api/productos?q=` (debe ser ~150-200ms)
   - `/api/responsables` (debe ser ~150-200ms)

Si los tiempos siguen siendo altos, es posible que:
- La migración no se ejecutó correctamente
- La tabla tiene muchos registros y necesita análisis adicional
- Hay queries lentas en el lado de la aplicación
