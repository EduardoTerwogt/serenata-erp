# Plan de remediación y cierre real — Cuentas

**Fecha base:** 2026-04-09
**Repo:** `EduardoTerwogt/serenata-erp`
**Rama objetivo:** `main`
**Propósito:** cerrar los pendientes reales de Cuentas por Cobrar / Cuentas por Pagar y dejar un checklist final verificable end-to-end.

---

## 1. Estado actual resumido

### 1.1 Ya existe
- Hooks base de cuentas (`useCuentasCobrar`, `useCuentasPagar`, `useFileUpload`)
- Tabs base (`TabInformacion`, `TabDocumentos`, `TabRegistrarPago`)
- Endpoints nuevos de documentos y pagos para cobrar/pagar
- Endpoints de órdenes (`generar-orden-pago`, `ordenes-historial`)
- Tipos nuevos en `lib/types.ts`
- Funciones de soporte en `lib/db.ts`
- Upload genérico a Drive con creación de carpetas
- Generador HTML de orden de pago

### 1.2 Pendientes críticos detectados
- La UI real `/app/cuentas/page.tsx` todavía usa el flujo viejo y bypass de pagos directos
- Faltan componentes principales de la UI nueva (tabla/modales/página integrada)
- Inconsistencia de estado inicial en cuentas por cobrar (`PENDIENTE` vs `FACTURA_PENDIENTE`)
- Orden de pago no genera PDF real; hoy sube HTML a Drive
- Registrar pago en cuentas por pagar no completa la orden cuando todas las cuentas quedan pagadas
- Alertas de cobrar son informativas, pero no consolidan estado `VENCIDO` en BD
- Complemento XML se almacena, pero no se parsea ni valida
- Falta endurecer validaciones / transiciones / trazabilidad

---

## 2. Principios de ejecución

1. **No romper cotizaciones, proyectos ni cálculos existentes.**
2. **No dejar doble flujo activo** al finalizar: la UI vieja de cuentas debe ser reemplazada o quedar deshabilitada.
3. **Toda transición financiera importante debe pasar por endpoint explícito** y no por `PUT` genérico desde la UI.
4. **No se considera terminado** si solo existe el endpoint pero la UI real no lo usa.
5. **No se considera terminado** si una funcionalidad solo está “guardando archivos” pero no cumple la regla de negocio prometida.

---

## 3. Fases de implementación

## Fase A — Corrección de base y contratos

### Objetivo
Dejar estable el dominio y cerrar inconsistencias antes de conectar toda la UI final.

### Tareas
- [ ] Corregir estado inicial de cuentas por cobrar para usar `FACTURA_PENDIENTE`
- [ ] Revisar y endurecer contratos de tipos para cobrar/pagar/órdenes/documentos
- [ ] Agregar helpers puntuales `getCuentaCobrarById`, `getCuentaPagarById` y evitar traer listas completas para luego hacer `.find()`
- [ ] Revisar transiciones válidas de estados:
  - cobrar: `FACTURA_PENDIENTE -> FACTURADO -> PARCIALMENTE_PAGADO -> PAGADO | VENCIDO`
  - pagar: `PENDIENTE -> EN_PROCESO_PAGO -> PAGADO`
- [ ] Quitar dependencia operativa de `PUT` genérico de la UI actual para marcar pagado/cobrado

### Check real de cierre
- [ ] Ningún flujo visible de cuentas usa `PUT` directo para “Marcar Pagado” desde la UI principal
- [ ] Las cuentas nuevas por cobrar nacen con `FACTURA_PENDIENTE`
- [ ] Los endpoints dejan de hacer `getCuentas*()` + `.find()` cuando necesitan solo una cuenta

---

## Fase B — Órdenes de pago reales

### Objetivo
Convertir la orden de pago de “HTML guardado” a documento real y cerrar su ciclo completo.

### Tareas
- [ ] Elegir estrategia real de PDF server-side compatible con deploy actual (Puppeteer/Playwright/chromium serverless o alternativa robusta)
- [ ] Generar PDF real de orden de pago
- [ ] Guardar PDF real en Drive con nombre y extensión correctos
- [ ] Mantener agrupación por responsable -> evento -> items
- [ ] Al generar orden, marcar cuentas elegibles como `EN_PROCESO_PAGO`
- [ ] Al registrar pago de una cuenta con `orden_pago_id`, validar si todas las cuentas de la orden ya están pagadas
- [ ] Si todas las cuentas quedan pagadas, actualizar `ordenes_pago.estado = COMPLETADA`
- [ ] Si solo algunas quedan pagadas, usar `PARCIALMENTE_PAGADA` cuando aplique

### Check real de cierre
- [ ] La URL guardada en `ordenes_pago.pdf_url` apunta a un archivo PDF real, no HTML
- [ ] `ordenes-historial` devuelve órdenes reales utilizables
- [ ] Registrar el último pago pendiente de una orden cambia la orden a `COMPLETADA`

---

## Fase C — UI final integrada de cuentas

### Objetivo
Reemplazar la pantalla actual por una interfaz que sí use el backend nuevo.

### Tareas
- [ ] Crear `CuentasTable.tsx`
- [ ] Crear `CuentaDetailModal.tsx`
- [ ] Crear `OrdenPagoModal.tsx` o el equivalente definitivo
- [ ] Crear `CuentasPage.tsx` si se decide separar la página contenedora
- [ ] Reemplazar `/app/cuentas/page.tsx` para que use hooks reales y detalle por modal
- [ ] Integrar tabs reales:
  - `TabInformacion`
  - `TabDocumentos`
  - `TabRegistrarPago`
- [ ] Integrar historial de órdenes en la UI de pagar
- [ ] Mostrar alertas de cobrar en la UI
- [ ] Eliminar/bloquear los botones viejos de pago directo

### Check real de cierre
- [ ] Desde `/app/cuentas/page.tsx` se puede abrir detalle de una cuenta por cobrar y por pagar
- [ ] Desde la UI real se puede subir factura / complemento / comprobante
- [ ] Desde la UI real se puede generar orden de pago
- [ ] La UI ya no depende del flujo viejo de “Marcar Pagado” por `PUT`

---

## Fase D — Reglas de negocio faltantes

### Objetivo
Cerrar la diferencia entre “ya existe” y “cumple lo prometido”.

### Tareas
- [ ] Alertas de cuentas por cobrar: consolidar `VENCIDO` cuando corresponda
- [ ] Complemento XML: parsear y validar al menos estructura mínima útil
- [ ] Evaluar y aplicar regla de bloqueo de complementaria si principal no está pagada al 100%
- [ ] Ajustar cálculos visibles de saldo pendiente para usar saldo real y no solo monto bruto
- [ ] Endurecer mensajes y errores operativos

### Check real de cierre
- [ ] Una cuenta vencida queda reflejada como `VENCIDO` en una ruta/flujo consistente
- [ ] Subir complemento no es solo almacenamiento ciego; existe validación mínima real
- [ ] Dashboard / UI de cuentas muestran saldo pendiente real

---

## Fase E — Hardening mínimo antes de declarar cierre

### Objetivo
No cerrar la iniciativa con deuda evitable en un módulo financiero.

### Tareas
- [ ] Añadir validaciones Zod donde falten en endpoints nuevos
- [ ] Añadir trazabilidad mínima de acciones críticas (quién generó orden, quién registró pago, quién subió documentos cuando sea viable)
- [ ] Añadir tests mínimos para:
  - cálculo de estado cobrar
  - agrupación de orden de pago
  - transición de orden a completada
  - parseo/validación XML
- [ ] Revisar si se requieren migraciones SQL versionadas en el repo para dejar el estado reproducible

### Check real de cierre
- [ ] Los endpoints críticos de cuentas no aceptan payloads arbitrarios sin validación
- [ ] Existe al menos una base mínima de tests sobre reglas críticas
- [ ] La estructura DB necesaria está documentada/versionada en repo o claramente aterrizada

---

## 4. Tabla de control de cumplimiento

| Bloque | Estado actual | Criterio para marcar "hecho" |
|---|---|---|
| Base de dominio | Parcial | estados consistentes, fetch por ID, sin bypass viejo |
| Cuentas por cobrar | Parcial/avanzado | factura + pagos + complemento + alertas + UI real |
| Cuentas por pagar | Parcial/avanzado | factura + pagos + orden + historial + UI real |
| Orden de pago PDF | Pendiente crítico | PDF real en Drive + ciclo completo de estado |
| UI nueva de cuentas | Parcial | página real integrada con modal/tabs |
| Reglas de negocio faltantes | Pendiente | vencido, bloqueo complementaria, saldo real |
| Hardening | Pendiente | validación, trazabilidad, tests |

---

## 5. Definition of Done final

La iniciativa **solo se considerará terminada** cuando todas estas condiciones sean verdaderas:

- [ ] `/app/cuentas/page.tsx` usa el flujo nuevo y ya no existe bypass operativo por `PUT`
- [ ] Se pueden subir documentos y registrar pagos desde la UI real
- [ ] Las órdenes de pago generan PDF real y quedan en Drive
- [ ] Las órdenes cambian a `COMPLETADA` cuando corresponde
- [ ] Las cuentas por cobrar reflejan `FACTURA_PENDIENTE`, `FACTURADO`, `PARCIALMENTE_PAGADO`, `PAGADO`, `VENCIDO` de forma coherente
- [ ] El saldo pendiente mostrado es real
- [ ] Existen validaciones mínimas y tests mínimos en reglas críticas

---

## 6. Orden sugerido de ejecución real

1. Fase A — base y contratos
2. Fase B — orden de pago real
3. Fase C — UI final integrada
4. Fase D — reglas faltantes
5. Fase E — hardening

---

## 7. Notas de control

- Cada fase debe cerrarse con commit(s) reales en `main`
- Al terminar cada fase, actualizar este documento y marcar checkboxes reales
- Si `main` se mueve durante el trabajo, rebasar encima del HEAD actual
