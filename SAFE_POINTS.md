# Puntos Seguros de Desarrollo

## 📌 Commit e68ccbb - 6 Correcciones Completadas
**Fecha**: 2026-04-10  
**Tag**: `6-correcciones-ui-archivos-completadas`

### ✅ Correcciones Implementadas y Verificadas:

1. **Ocultar folio interno (CP-2026)** en CuentasTable
   - Tabla ahora muestra solo `cotizacion_id` (SH001)
   - Folio interno (CP-2026-00003) completamente oculto de UI

2. **Fila clickeable en CuentasTable**
   - Click en cualquier lugar de la fila abre modal de detalle
   - Botón "Ver Detalle" eliminado
   - Tests E2E actualizados

3. **Badge de folio en tarjetas de proyectos**
   - Cada proyecto muestra badge con folio de cotización
   - Badge en color naranja (#ff8000), separado del título

4. **Preservar nombres originales de archivos**
   - Facturas, comprobantes, complementos mantienen nombre original
   - No se renombran a "factura_proveedor.pdf" o timestamp

5. **Cambiar folder Drive a formato SH001-Proyecto**
   - Antes: `/Por Pagar/CP-2026-00003`
   - Ahora: `/Por Pagar/SH001-Show Monterrey`
   - Aplica a: cuentas-cobrar y cuentas-pagar

6. **Corregir error "Generar Orden de Pago"**
   - Error: `column proyectos_1.nombre does not exist`
   - Solución: Cambiar `proyectos(nombre)` → `proyectos(proyecto)`
   - Error logging mejorado para futuros debugs

### 🔍 Cómo hacer rollback (si es necesario):
```bash
git checkout 6-correcciones-ui-archivos-completadas
```

### 📝 Archivos Modificados:
- `app/components/cuentas/CuentasTable.tsx`
- `app/proyectos/page.tsx`
- `app/api/cuentas-pagar/[id]/subir-factura/route.ts`
- `app/api/cuentas-pagar/[id]/registrar-pago/route.ts`
- `app/api/cuentas-cobrar/[id]/subir-factura/route.ts`
- `app/api/cuentas-cobrar/[id]/registrar-pago/route.ts`
- `app/api/cuentas-pagar/generar-orden-pago/route.ts`
- `lib/db.ts`
- `tests/e2e/critical/cuentas-cobrar.spec.ts`
- `tests/e2e/critical/cuentas-pagar.spec.ts`

### ✨ Status: LISTO PARA AUDITORÍA
Todas las correcciones priorizadas completadas y testeadas.
