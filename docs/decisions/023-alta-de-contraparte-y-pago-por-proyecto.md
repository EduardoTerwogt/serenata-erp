# 023 — Alta de contraparte, gasto extra y pago por proyecto (#130)

**Estado:** **lanzada a producción el 2026-10-08** junto con #123 (PR #129, merge `35709b6`; migraciones `20261034`, `20261035` y
`20261036`). Detalle de ejecución, preguntas Q1–Q13 y bloques C0–C5: `docs/archive/facturas-pagos-ligados-123-130-131.md`.
Diseño visual: `docs/design/cuentas-123/cuentas-130.html`.

## Contexto

Con #123, Subir factura solo dejaba ligar la factura de un proveedor a un grupo (proveedor + proyecto) que ya existía, y
Registrar pago solo entraba por cliente o proveedor. Faltaba el caso real: el emisor del XML **no existe**, sus renglones
están **sin asignar o en otro proveedor**, o el gasto **no estaba en la cotización**; y pagar **por proyecto**.

## Decisión

- **Tres operaciones al subir la factura de un proveedor** (Q1): ligar a un grupo existente (como hoy); **asignar renglones
  al emisor** (unifica "sin asignar" y "en otro proveedor": solo cambia la preselección); o **gasto extra**. Una factura de
  proveedor es de **un** proyecto; la de cliente puede cubrir varios (Q2).
- **Una RPC atómica prepara el grupo**, `preparar_grupo_factura_proveedor` (alta de proveedor si no existe + reasignación de
  renglones o gasto extra + reconcilia el grupo). **No sube la factura**: eso sigue en TypeScript (Drive →
  `createDocumentoCuentaPagar` → `validar_factura_proveedor`), como antes. Si la subida falla después de preparar, la ruta
  responde 502 `subida_fallida` con `preparado {proveedor_id, grupo_id}` y el reintento reutiliza ese grupo (repetir el alta
  fallaría por RFC repetido). Idempotencia: `operation_id` único en el gasto extra; el alta se serializa por RFC
  (`pg_advisory_xact_lock`) y el segundo concurrente recibe `proveedor_existente`.
- **Reasignar** solo mientras el grupo siga `ABIERTO` y el renglón no tenga pagos ni orden (D21): `grupo_no_abierto` (P1412) o
  `renglon_bloqueado` (P1413), todo o nada. El rastro va a `historial_cambios_responsable_item` (no a `cuentas_correcciones`,
  cuya `reapertura_id` es NOT NULL).
- **Proveedor nuevo** (Q3): RFC, nombre y régimen vienen del XML (solo lectura; 626 = RESICO, 12 = moral, 13 = física);
  banco, CLABE, correo y teléfono son obligatorios. Se le cuenta como `portal_estado = pendiente_confirmacion`.
- **Gasto extra** (Q5, Q10): sin tabla nueva. `cuentas_pagar.item_id` pasó a ser nullable, con `concepto` y `operation_id`
  y un CHECK `cuentas_pagar_renglon_o_gasto`; cuelga de la cotización principal aprobada (`cotizacion_id = proyecto_id`),
  **resta de la utilidad real** del proyecto (`cuentas_conceptos`) y no cambia la cotización aprobada. `cancel_cotizacion` lo
  borra con el grupo `ABIERTO` y se bloquea (`cancelacion_bloqueada`) si el grupo ya está facturado o en pago. Guarda nueva
  en `auditar_consistencia()` (24): `gasto_extra_proyecto`.
- **Cliente** (Q9, Q11): ya existe cuando se le factura (nace con la cotización); "alta" es completar su **ficha**: RFC del XML,
  contacto y la **constancia fiscal** (columnas `constancia_url` y `constancia_nombre` en `clientes`, Drive
  `Constancias de clientes/<nombre>`), obligatoria si no hay una guardada. Ruta aparte `PATCH /api/cuentas/clientes/[id]`
  con la sección `cuentas` (`PUT /api/clientes/[id]` exige Cotizaciones y edita todo); un RFC ya guardado no se cambia desde ahí.
- **Propuesta de renglones** (Q7): los renglones sin asignar de un proyecto que suman el **subtotal (neto) del XML** dentro
  de una tolerancia (`datos_fiscales_serenata.tolerancia_total`, $1.00 por omisión, editable en Admin → Datos fiscales) se
  **proponen**; el usuario los revisa y la validación fiscal sigue siendo la de siempre (`validarFacturaFiscalProveedor`).
  **Desvío consciente de Q7:** se compara el neto y no el total con IVA; es la misma respuesta sin una tercera copia de la
  fórmula fiscal.
- **Pago por proyecto** (Q4, Q12): sin RPC de pago nueva. `cuentas_proyectos_selector(modo='pago')` lista proyectos con su(s)
  contraparte(s) y saldo de facturas abiertas; `estado_cuenta` acepta `p_proyectos` (sobrecarga; la firma anterior quedó como
  envoltura porque el MCP retiene todo `DROP`); el pago sigue por `registrar_pago_cobro|proveedor`. **Una contraparte por
  pago** (`contrapartes_distintas`), solo contra **facturas** (sin anticipos), máximo 50 proyectos.
- **Permisos** (Q8): cualquiera con `cuentas`; las RPC son solo `service_role` y las rutas llevan `requireSection('cuentas')`.
  `POST /api/proveedores` sigue exigiendo `responsables`.
- **Lectura ligera:** `cuentas_proyectos_selector` (plpgsql, `force_custom_plan`, paginada de 25) no deriva saldos; evita
  re-derivar el año completo para listar proyectos.

## Notas de honestidad

- El gasto extra **no** entra a `cuentas_por_proyecto` (función usada solo por tests); la utilidad real se deriva en
  `cuentas_conceptos`.
- No se busca el subconjunto de renglones que cuadra: solo se propone si **todos** los sin asignar de un proyecto suman el neto.
- Se probó en `serenata-erp-test` (SQL con rollback y specs `live` `cuentas-130.spec.ts`); falta producción, que se lanza
  con #123 y sus orden de migraciones (`20261034` y `20261035` después de `20261033`).
- Texto de `auditar_consistencia` y `estado_cuenta` en test difiere del archivo solo en comentarios (aplicado con parches
  `replace` sobre `pg_get_functiondef`); no cambia comportamiento.

## Referencias

022 (modelo de facturas y pagos ligados, T16 orden de locks), 020 (cada dato tiene un solo dueño), 012 (autonomía en plan
aprobado). Diseño: `docs/design/cuentas-123/cuentas-130.html`.
