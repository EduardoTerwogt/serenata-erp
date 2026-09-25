# Trabajo activo

**Última actualización:** 2026-09-25 (sesión 16: revisión de reutilización contra el repo)

## Estado

**`docs/PLAN.md` — Borrador en refinamiento: "Rediseño de la sección
Cuentas".**
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
- 23 decisiones confirmadas (D1–D23).
- **Supuestos de la §4 confirmados** (sesión 14). Auditoría final A1–A5:
  sin dudas de producto ni de negocio. Auditoría de optimización O1–O10
  (sesión 15) y D24: el corte (B8) va antes de B7. Revisión de reutilización
  U1–U10 (sesión 16, §5.7). **Falta solo la aprobación del plan.**
- 10 bloques propuestos (B0, B1b y B1–B8). B1b es nuevo y corrige los bugs
  vigentes antes del rediseño.

**No hay código escrito.** El plan todavía no está aprobado: nada de B0–B8 se
ha empezado. Todo lo de estas sesiones está en `main` (solo docs).

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

Todas viven en `docs/PLAN.md` §3 (D1–D9). Pasan a
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

- **Aprobar `docs/PLAN.md`.**
- Antes de B8: encender Drive en Preview (R9); los pasos se dan en su momento.
- **Tener a mano el zip final** (`Serenata_ERP_Cuentas_recreation.zip` con
  `design_handoff_cuentas/`) para la sesión que haga B0. No está en el repo.
- Borrar ramas remotas ya mergeadas (GitHub → Branches → Merged).

## Cómo retomar (sesión nueva)

1. Abrir con `/serenata-iniciar-fase`, que lee este archivo y
   `docs/PLAN.md`. No hay que re-auditar: la auditoría ya está en el plan.
2. Si el usuario aprueba o ajusta la §4 del plan:
   - aplicar los ajustes;
   - poner **Estado: Aprobado** en `docs/PLAN.md`;
   - commit doc-only a `main`.
3. Ejecutar **B0** en una rama con PR en borrador:
   - pedir el zip al usuario si no lo subió;
   - copiar `design_handoff_cuentas/` completo a `docs/design/cuentas/`;
   - escribir la decisión 017;
   - crear el seed de `serenata-erp-test` (H11).
4. Seguir el grafo B1b → B1 → B2 → B3 → B4 → B5 → B6 → B8 → B7, un PR por
   bloque, actualizando el tracker (§10).

Prompt sugerido para la sesión nueva, con el zip adjunto:

```
/serenata-iniciar-fase
Retomamos el rediseño de Cuentas (docs/PLAN.md). Confirmo los supuestos de la
§4 [o: con estos cambios: …]. Aprueba el plan y ejecuta B0 con el zip adjunto.
```

Para ver el diseño en local, servir la carpeta por HTTP: `python3 -m
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

El usuario confirma los supuestos de la §4 y aprueba `docs/PLAN.md`.
Después: **B0**, con el zip del diseño, y enseguida **B1b** (bugs vigentes de
órdenes de pago).
