# 013 — Documentos del Portal: verdad única, matching solo por INE, validación híbrida

## Contexto

Tras cerrar la primera ronda del Bloque 1 (`docs/PLAN.md`, simulador de
factura), el usuario probó a fondo la sección "Documentación" del Portal y
encontró tres problemas reales, todos en `POST /api/portal/documentos`
(`app/api/portal/documentos/route.ts`):

1. **El matching de identidad** (`buscarCandidatosMatch()`, cruza el
   proveedor recién registrado contra los que staff ya cargó) se disparaba
   tanto al subir el INE como la Constancia de Situación Fiscal. Hay
   proveedores que facturan por medio de terceros -- la constancia trae el
   RFC/nombre legal de ese intermediario, no el de la persona que
   realmente colabora con Serenata. Cruzar por ese nombre fusionaba o
   pedía confirmar la cuenta equivocada.
2. **`estado_validacion` nunca se movía de `pendiente`.** No existía
   ningún mecanismo -- ni automático ni manual -- que lo escribiera.
   `proveedor_documentos_resumen()` (RPC que alimenta el stat
   "documentación con errores" en `/proveedores`) ya leía ese campo, pero
   nada lo poblaba: el stat estuvo siempre en 0, sin que nadie lo notara.
3. **Subir una constancia nueva no reemplazaba la anterior.** El usuario
   subió una segunda constancia con régimen fiscal distinto y ni "Mis
   datos" ni "Cuentas y facturas" reflejaron el cambio -- la causa raíz era
   doble: `regimen_fiscal` solo se seteaba la primera vez
   (`!proveedorActual?.regimen_fiscal`, para "nunca pisar lo que staff
   corrigió a mano"), y ambas constancias quedaban archivadas para
   siempre, sin ningún concepto de "la vigente".

## Decisión

- **Identidad del Portal se valida solo con una identificación oficial
  (INE hoy).** La constancia sigue disparando extracción de IA
  (`extraerDatosIdentidad()`) para `regimen_fiscal`, pero nunca para
  matching.
- **`estado_validacion` se resuelve híbrido** (elegido explícitamente por
  el usuario entre 4 opciones -- auto/manual/híbrido/dejarlo como estaba):
  la misma lectura de IA que ya corre para matching/régimen también
  clasifica el documento (`validado` si el dato esperado se pudo leer,
  `revision` con motivo si no); comprobante de domicilio/bancario no
  pasan por IA (el prompt es específico a identidad/fiscal) y quedan
  `pendiente` hasta revisión manual. Staff puede corregir cualquier estado
  desde una sección nueva en `ProveedorModal.tsx`
  (`PATCH /api/proveedores/[id]/documentos/[docId]`).
- **`regimen_fiscal` siempre refleja la última constancia subida, sin
  excepción** -- se quitó el guard "solo si no hay uno ya asignado". La
  constancia manda; no hay ningún otro mecanismo en el Portal que lo
  corrija con más autoridad que la constancia vigente.
- **Cada tipo de documento (constancia, INE, comprobante de domicilio,
  comprobante bancario) es de "verdad única":** subir uno nuevo borra el
  anterior del mismo tipo -- registro en `proveedor_documentos` y archivo
  en Google Drive (best-effort; un fallo al borrar de Drive nunca bloquea
  que el documento desaparezca de la lista del proveedor). El proveedor
  solo tiene, en todo momento, como máximo un documento vigente por tipo.

## Razón

- Un intermediario que factura por cuenta de otra persona es un caso real
  y frecuente en producción -- validar identidad contra un documento que
  puede traer el nombre de un tercero es una fuente de falsos positivos
  activa, no hipotética.
- El stat de staff ("documentación con errores") ya asumía que
  `estado_validacion` se movía solo -- dejarlo muerto para siempre no era
  una opción una vez detectado. Híbrido balancea automatizar lo que la IA
  ya lee con confianza razonable, sin dejar que apruebe documentos de
  identidad/cumplimiento sin que nadie de Serenata los mire cuando la
  lectura falla.
- Un documento que se reemplaza en la vida real (el proveedor corrigió su
  régimen, actualizó su domicilio, cambió de cuenta bancaria) debe
  reemplazarse en el sistema -- acumular versions viejas sin ninguna
  marcada como vigente es peor que no guardar historial: cualquier
  consulta posterior (¿cuál es el régimen real?) queda ambigua.

## Alternativas descartadas

- **Auto-validar sin revisión de staff:** más simple, pero deja que una
  IA apruebe documentos de identidad/cumplimiento sin supervisión humana
  -- riesgo real frente al beneficio de ahorrar un clic.
- **Dejar `estado_validacion` en `pendiente` fijo, sin resolver:** opción
  ofrecida explícitamente; el usuario la descartó a favor del híbrido.
- **Mantener varias constancias históricas con una marca de "vigente":**
  más flexible (permite auditar versiones anteriores), pero el usuario
  pidió explícitamente que se **descarten** los datos y el archivo de la
  anterior, no que se archiven.

## Consecuencias

- Un futuro tipo de documento de identidad (pasaporte, cédula
  profesional) debe agregarse a la lista de tipos que sí validan matching
  -- hoy es una lista de un solo elemento (`INE`), no una propiedad
  derivada de otra cosa.
- Si se necesita alguna vez conservar el historial de constancias (p.ej.
  para auditoría fiscal), hace falta un mecanismo nuevo (archivo aparte,
  o una tabla de historial) -- hoy el reemplazo es destructivo a
  propósito, sin backup.
- Los documentos que ya estaban duplicados en producción **antes** de
  este fix no se limpiaron retroactivamente -- el reemplazo es "lazy": se
  dispara recién la próxima vez que ese proveedor suba un documento de
  ese tipo. Un backfill one-off queda pendiente si se quiere una base ya
  limpia sin esperar a que cada proveedor vuelva a subir algo.
