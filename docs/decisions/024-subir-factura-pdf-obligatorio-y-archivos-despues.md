# 024 — Subir factura: PDF obligatorio y archivos después de guardar (#131)

**Estado:** lanzada a producción el 2026-10-08 (merge `35709b6`). Historia de las tres rondas de #131:
`docs/archive/facturas-pagos-ligados-123-130-131.md` (decisión P30 y tracker). Diseño visual:
`docs/design/cuentas-123/cuentas-131.html`.

## Contexto

Tras revisar el preview de #123/#130 salieron dos problemas de Subir factura. (1) El botón aceptaba un XML solo y el PDF
quedaba opcional, así que había facturas sin su representación impresa. (2) Si Drive fallaba al guardar, el usuario perdía
la captura completa (cuentas elegidas, proveedor nuevo, reparto) y tenía que rehacerla.

## Decisión

1. **El PDF es obligatorio** en `POST /api/cuentas/facturas` para cliente, proveedor y complemento
   (`pdfRequired: true`; el botón Guardar también lo exige). Aunque del PDF no se extraigan datos, un XML no se sube sin PDF.
   XML y PDF viajan en la **misma petición** con tope combinado de ~4.2 MB (`MAX_TOTAL_SIZE` en
   `lib/server/uploads/factura-validation.ts`, `LIMITE_TOTAL` en el cliente) por el límite de ~4.5 MB de Vercel.
   Siguen permitiendo subirlo después las rutas del detalle (por cuenta, por grupo y `subir-complemento`) y el Portal ya lo exigía.
2. **Datos primero, Drive después.** `POST /api/cuentas/facturas` guarda la factura en la base y luego sube los archivos a
   Drive. Si Drive falla, el documento queda con `archivo_url = pendiente:xml` o `pendiente:pdf`
   (`lib/shared/cuentas/archivo-pendiente.ts`), la interfaz muestra «Archivo pendiente» y ofrece «Reintentar subida»
   (pantalla de guardado) o «Subir archivo» (Documentos), que reenvía **solo el archivo** a
   `POST /api/cuentas/documentos/[id]/reintentar-subida`. El servidor valida que el XML reenviado tenga el mismo
   `uuid_cfdi` y deriva la carpeta de Drive desde la base. Solo esa ruta opta por este orden (`driveDespues: true`); las demás
   rutas que usan los mismos servicios siguen con Drive primero.

## Razón

Perder la captura por una caída de Drive es el peor fallo posible del flujo; el dinero y las ligas viven en PostgreSQL, que es
la fuente de verdad, y el archivo es un anexo reintentable. Un valor centinela en `archivo_url` (columna `NOT NULL`) evita
migración y no hace falta una tabla de pendientes.

## Alternativas descartadas

- **Copia temporal en Supabase Storage** y subida diferida desde ahí: el usuario la rechazó («no hagamos el storage staging»);
  agregaba un segundo lugar con el archivo, limpieza y permisos. Se retiró lo ya construido.
- **PDF opcional con aviso:** deja facturas incompletas y obliga a perseguirlas.
- **Subir el PDF en una petición aparte** para saltar el tope de 4.2 MB: el tope combinado se documenta como limitación de la
  plataforma; si un PDF real no cabe, la salida es «Subir archivo» desde el detalle.

## Consecuencias

- Un documento puede existir con `archivo_url = pendiente:*`: ningún enlace debe construirse a partir de ese valor
  (`EstadoCuenta.tsx` y `Correcciones.tsx` ya no enlazan los pendientes). Todo lector nuevo de `archivo_url` debe tratarlo.
- En Preview Drive está apagado (sin `GOOGLE_DRIVE_REFRESH_TOKEN`): ahí **siempre** se ve el estado pendiente.
- Subir PDFs de más de ~4 MB a través de este flujo no es posible; hay que reducirlos o subirlos después.
