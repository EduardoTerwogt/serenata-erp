# Trabajo activo

**Última actualización:** 2026-09-25 (sesión 20: B0 mergeado, B1b en PR)

## Estado

**`docs/PLAN.md` — APROBADO: "Rediseño de la sección Cuentas".**
- Diseño final auditado (sesión 10).
- Auditoría end-to-end contra producción (sesión 11): 13 hallazgos (§5.1),
  entre ellos bugs vigentes en la generación de órdenes de pago (H1–H3) y
  rutas `PUT` que se saltan las RPCs (H4).
- Diseño final recibido como handoff `design_handoff_cuentas/` (sesión 12):
  escritorio, **móvil completo**, 34 capturas y README. El plan se re-adaptó:
  - §5.2: reglas del prototipo que no se adoptan;
  - §5.3: pendientes del README y cómo se resuelven;
  - B4–B7 entregan escritorio + móvil, en tema claro y oscuro.
- Auditoría de regresiones (sesión 13): R1–R13 en §5.4 y reglas
  transversales en §7.0. **R1 es un bug vigente:** cancelar una cotización
  aprobada falla en la BD (llave foránea); se corrige en B1b (D22).
- 32 decisiones confirmadas (D1–D32).
- **Supuestos de la §4 confirmados** (sesión 14). Auditoría final A1–A5:
  sin dudas de producto ni de negocio. Auditoría de optimización O1–O10
  (sesión 15) y D24: el corte (B8) va antes de B7. Revisión de reutilización
  U1–U10 (sesión 16, §5.7).
- Auditoría profunda por áreas (sesión 17, §5.8): S1–S21, entre ellos 3 P0
  que producían bugs (desglose de órdenes sin guardar, carrera en el monto
  de la orden, cancelar complementaria). Decisiones D25–D29 del usuario:
  - documento en revisión no cuenta;
  - fechas SAT, una fila por mes;
  - complemento con XML y PDF;
  - cancelar la principal en cascada;
  - etiqueta "Costo total · neto al proveedor".
- Segunda auditoría contra los datos reales de producción (sesión 18, §5.9):
  T1–T10, sin P0. Decisiones D30–D32 del usuario:
  - IVA negativo en un mes = "IVA a favor", según el art. 6 LIVA;
  - la cascada también cancela las complementarias no aprobadas;
  - se permite registrar un anticipo de cliente antes de la factura.
- Tercera auditoría (sesión 19, §5.10): V1–V4, sin P0. Cierra las
  consecuencias de D32 (anticipos) y T4 (factura de proveedor atómica).
- **El usuario aprobó el plan (sesión 19).** La mecánica de reasignar una
  cuenta pagada (S12) se confirma al abrir B7; no bloquea.
- 10 bloques propuestos (B0, B1b y B1–B8). B1b es nuevo y corrige los bugs
  vigentes antes del rediseño.

**Ejecución (sesión 20):**
- **B0 hecho** (PR #94, mergeado): handoff en `docs/design/cuentas/`,
  decisión `docs/decisions/017-rediseno-cuentas.md` y seed
  `scripts/seed-cuentas-test.sql`, ya aplicado en `serenata-erp-test`.
- **B1b en curso** (PR en borrador desde la rama
  `claude/practical-brown-giy5p3`). Las 4 migraciones `20260925_*` **ya
  están aplicadas en test y en producción**:
  - `ordenes_pago_conceptos`, con backfill de las 8 órdenes (47 conceptos);
  - `generar_orden_pago` atómica, candidatos filtrados (T2, D25) y `hoy_cdmx()`;
  - `cancel_cotizacion` en cascada, con sus guardas;
  - H3 en `registrar_pago_cuenta_pagar` y CHECK de `cuentas_pagar.estado`.
  El código (ruta de órdenes con la RPC, retiro de los `PUT`, tests
  unitarios y `live`) espera CI en el PR. Hasta que se mergee, producción
  corre la ruta vieja de órdenes contra los candidatos nuevos: la ruta vieja
  sigue funcionando, pero solo con candidatos válidos.

## Completado en las sesiones 9 y 10

- **Réplica exacta de `/cuentas`** (sesión 9).
  - Se capturó el DOM real con Playwright: app en local con APIs simuladas y el
    bypass de e2e.
  - Resultado: un HTML autocontenido con 20 pantallas, más PNG y un
    `LEEME.md`.
  - Se entregó al usuario como zip y **no vive en el repo**; con él rediseñó en
    Claude Design.
- **Auditoría del diseño final** (sesión 10).
  - Archivos recibidos: `Cuentas-v2.dc.html` y `cuentas-data.js`, en el zip
    `Serenata_ERP_Cuentas_recreation.zip`.
  - Se recorrieron sus estados en navegador y se contrastaron con los RPCs,
    tablas y rutas actuales.
  - Resultado en `docs/PLAN.md`: qué cambia, modelo de dominio, bloques,
    riesgos y validación.

## Decisiones nuevas

Todas viven en `docs/PLAN.md` §3 (D1–D32). Pasan a
`docs/decisions/017-rediseno-cuentas.md` en el bloque B0, cuando el plan se
apruebe con los supuestos cerrados. No se crea la decisión antes, para no
fijar supuestos que el usuario aún puede cambiar. Las de más peso:
- complemento de pago solo si la factura es PPD;
- pagos a proveedor en **total a transferir** (los items siguen en neto);
- los números salen de las fórmulas vigentes (decisión 006);
- reabrir es solo para admin y habilita correcciones;
- órdenes: Cancelada es manual y Vencida se calcula a los 15 días;
- los proyectos sin fecha de evento van al grupo "Sin fecha".

## Tests ejecutados

No aplica: no hubo cambios de código. La réplica se validó abriéndola sin
servidor contra capturas de la app real, en tema claro y oscuro.

## Pendiente del usuario

- Antes de B8: encender Drive en Preview (R9); los pasos se dan en su momento.
- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).

## Cómo retomar (sesión nueva)

1. Abrir con `/serenata-iniciar-fase`, que lee este archivo y
   `docs/PLAN.md`. No hay que re-auditar: la auditoría ya está en el plan.
2. El plan ya está aprobado (sesión 19): no hay que re-auditarlo completo.
   Cada bloque se abre auditando el código real de su alcance.
3. B0 ya está hecho (PR #94) y el diseño vive en `docs/design/cuentas/`.
   Si el PR de B1b sigue abierto, terminarlo primero (CI verde → merge).
4. Seguir el grafo B1 → B2 → B3 → B4 → B5 → B6 → B8 → B7, un PR por
   bloque, actualizando el tracker (§10).

Prompt sugerido para la sesión nueva:

```
/serenata-iniciar-fase
Retomamos el rediseño de Cuentas (docs/PLAN.md, aprobado). Sigue el
siguiente bloque del tracker.
```

Para ver el diseño en local, servir `docs/design/cuentas/` por HTTP: `python3 -m
http.server`. El mock carga React, Babel y lucide desde unpkg. Si la red de la
sesión bloquea unpkg, bajar `react@18.3.1`, `react-dom@18.3.1`,
`@babel/standalone@7.29.0` y `lucide` con `npm pack` y servirlos con
`page.route` de Playwright.

## Deuda técnica

- **`realtime-js` fijo en 2.112.0.** Para subir de versión hay que pasar el JWT
  de Realtime con la opción `accessToken` de `createClient`
  (`lib/supabase-browser.ts`) y revisar los reintentos de postgrest. La guarda
  `lib/realtime/__tests__/realtime-js-guard.test.ts` falla si se sube sin eso.
- **El build depende de descargar Inter de Google Fonts** (`app/fonts.ts`).
  Ya falló una vez de forma intermitente (2026-09-24). Si se repite, migrar a
  `next/font/local`.
- **Job `live` inestable en `main` (visto tras #92).** Hay fallos
  intermitentes en el test causal de `bulk` y en el de escala. Vigilar si se
  repiten ahora que #93 está mergeado.
- Las secuencias `seq_cc_2026` y `seq_cp_2026` quedaron sin uso tras #92; se
  pueden borrar en una limpieza.
- Drive está apagado en Preview a propósito. Si hace falta, se saca un token
  con `/api/integrations/drive/authorize` usando una cuenta de pruebas.
- El MCP de Vercel no tiene alcance de team para los logs de runtime (403).
- **Para el rediseño** (detalle en `docs/PLAN.md` §8):
  - `cuentas_por_proyecto()` no tiene parámetros y trae todo;
  - varias RPCs calculan "hoy" en UTC y no en hora CDMX;
  - `proyectos.fecha_entrega` es texto.

## Siguiente paso

Cerrar **B1b**: CI verde en su PR (incluido `live`, con
`tests/e2e/live/cuentas-b1b.spec.ts`), mergear y marcar el tracker. Después,
**B1** (derivación y datos fiscales, incluido `metodo_pago_cfdi`).
