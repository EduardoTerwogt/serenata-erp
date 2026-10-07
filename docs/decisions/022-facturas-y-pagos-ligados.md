# 022 — Facturas y pagos ligados (#123)

**Estado:** ejecutada en código y en `serenata-erp-test`; **pendiente de lanzar a producción** (PR #129, no se mergea ni se
aplica nada a producción hasta la revisión del usuario). Detalle de ejecución y decisiones de producto P1–P29 y técnicas
T1–T20: `docs/PLAN.md` (se archiva en `docs/archive/` al lanzar).

## Contexto

Hasta aquí cada factura y cada pago pertenecían a **una sola cuenta**. El negocio real es otro: el cliente pide **una
factura para varias cotizaciones**, un **depósito paga varias facturas** y una **transferencia a un proveedor paga varias
facturas suyas**. Subir lo mismo cotización por cotización dejaba siempre la factura "En revisión" y duplicaba archivos.

## Decisión

**Modelo vigente (P27, T1, T10).**
- Una sola tabla nueva: la **cabecera `pagos`** (`lado` cobro | proveedor, fecha, tipo, comprobante, `operation_id`,
  anulación). Las líneas siguen donde estaban (`pagos_comprobantes`, `pagos_cuentas_pagar`), ahora con `pago_id`.
- Cada cuenta de cobro apunta a su factura vigente con **`cuentas_cobrar.factura_documento_id`** (sin tabla puente). El
  `FACTURA_XML` de cobro es una cabecera sin ancla de cuenta; PDF y complementos se anclan a la factura. El historial de qué
  cuentas cubría una factura dada de baja vive en `cuentas_correcciones` (una fila por cuenta).
- La factura **no guarda monto por aplicación**: su total se compara con la suma de las cotizaciones que cubre
  (`factura_cuadre`, tolerancia **0.01 por cotización**, P26). Un descuadre se guarda "En revisión" con el detalle exacto (P5).
- Una RPC de pago por lado (`registrar_pago_cobro`, `registrar_pago_proveedor`), `ligar_factura`, `ligar_complemento_*`.
  Toda la regla (totales, estados, umbrales, tolerancias) vive **solo en SQL**; el cliente calcula en centavos enteros y solo
  para pintar (T6). El motor TS de pruebas quedó congelado y lo vigila `cuentas-paridad-sql.spec.ts`.
- Lecturas: `estado_cuenta(lado, contraparte)` (una consulta para las ventanas, las fichas y el Portal, P15) y
  `facturas_candidatos`.

**Matiz sobre la 020/C:** solo la **cabecera de pagos** es común a cobro y proveedor; las cuentas y los documentos siguen
separados por lado. Un pago **no guarda contraparte**: la contraparte es la de las cuentas que cubre, y un pago a
proveedor solo puede cubrir grupos de **un** proveedor (`contrapartes_distintas`).

**Reglas de producto que cambian lo anterior.**
- **P11 amplía D11 (017):** un proveedor que factura PPD debe enviar su complemento de pago por cada pago; si falta hay
  aviso y el proyecto no cierra. P13: cada proyecto cierra por su parte aunque la factura o el pago sean compartidos.
- **P14 revierte D5, D6, D33, D34 y el supuesto 10 de la 017:** cualquier usuario con la sección `cuentas` puede reabrir,
  corregir y reemplazar facturas (ya no solo admin). `cuentas_correcciones` conserva `p_usuario` como rastro.
- **D22 (cancelar cotización aprobada) se amplía (T4):** sigue **bloqueada** con cuentas ligadas o con cualquier línea de
  pago, incluida la anulada; cancelar con traspaso es otra iniciativa (`docs/ROADMAP.md`).
- **Anular un pago que cubre varios proyectos** exige que **todos** estén reabiertos (resuelta con la propuesta del plan).
- **Drive:** archivos de las rutas nuevas en `/Por Cobrar/<cliente>/` y `/Por Pagar/<proveedor>/` (T15).
- **Subir factura detecta el tipo por RFC** (P18, P24): el RFC es columna en `clientes` y `proveedores`; el de Serenata sale
  de **su Constancia de Situación Fiscal cargada en Admin** (B6a, tabla `datos_fiscales_serenata`), no de una variable de
  entorno; sin constancia las rutas de factura fallan explícito (409). El tipo de persona de la constancia también decide
  la estimación de ISR del Dashboard.

**Orden global de locks (T16):** cuentas de cobro → grupos → hijas → cabecera `pagos` → órdenes de pago. Cierra el ABBA
preexistente entre pagar un grupo con orden y `cancelar_orden_pago` (reproducido en B0, corregido en M2).

**UI (P17, P19, P20, P22, P28).** Menú **Acciones** (Subir factura, Registrar pago, Orden de pago, Estado de cuenta); los
botones del detalle abren esas mismas ventanas con la contraparte y el proyecto preseleccionados (un solo formulario para
altas); el chip de una factura o pago compartido abre el Estado de cuenta resaltado; las fichas de cliente y proveedor
capturan RFC y abren el mismo Estado de cuenta con la sección `cuentas`. El Portal solo agrega lectura (P12, P29).

## Notas de honestidad

- La decisión **004** se citó en el plan solo **por analogía** (idempotencia por operación); se conservan sus ids.
- Queda **abierta** la pregunta 3 del plan: corregir un descuadre ligando o desligando cotizaciones de una factura existente
  **sin resubirla** (hoy el camino es marcar válida o reemplazar la factura). La propuesta (una RPC de reasignación como
  corrección registrada, que exige ampliar el CHECK de `tipo` de `cuentas_correcciones`) no se construyó; decidir con uso real.
- **Rendimiento de `cuentas_conceptos` (2026-10-07, test, 16,193 conceptos):** como `LANGUAGE sql` usaba plan genérico y hacía una
  sonda de índice por grupo (309,077 buffers por derivación completa; ≈ 19 por concepto contra 12.3 en `main`). Ahora es plpgsql con
  `force_custom_plan` (misma consulta, mismo resultado: `md5` idéntico en 9 alcances): 7,965 buffers (≈ 0.5 por concepto), un cliente
  4,310. Cuesta planeo por llamada (15–70 ms en Micro). El ms en test es ruidoso (×5 entre corridas): decidir por buffers. Sigue
  lineal en el historial para las lecturas globales (`resumen`, `avisos`, `opciones`): si `escala.yml` no cumple, siguiente paso #110 V2–V3.

## Referencias

011 y 017 (D5, D6, D11, D33, D34 y el supuesto 10 quedan modificados por P11 y P14), 020 (cuentas y documentos separados por
lado; solo la cabecera de pagos es común), 021 (regiones). Diseño visual: `docs/design/cuentas-123/`.
