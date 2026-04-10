# Playwright E2E — Serenata ERP

Esta implementación deja automatizadas 3 fases de prueba:

## Fase 1 — Smoke
- redirección de usuario no autenticado
- carga del shell de Cuentas

Comando:

```bash
npm run test:e2e:smoke
```

## Fase 2 — Flujos críticos del módulo de Cuentas
- cobrar: detalle, documentos, complemento y registrar pago
- pagar: generar orden de pago, validar PDF y registrar pago

Comando:

```bash
npm run test:e2e:critical
```

## Fase 3 — Live smoke opcional
Corre contra un ambiente real ya desplegado usando `PLAYWRIGHT_BASE_URL` y credenciales reales de prueba.

Comando:

```bash
npm run test:e2e:live
```

## Scripts disponibles

```bash
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:critical
npm run test:e2e:live
npm run test:e2e:headed
npm run test:e2e:ui
```

## Modo local / CI
Si `PLAYWRIGHT_BASE_URL` no está definido, Playwright levanta la app localmente con `npm run dev`.

## Bypass E2E para CI/local
El workflow smoke + critical usa `PLAYWRIGHT_E2E_BYPASS=true`.

Ese bypass solo se activa si:
- la variable de entorno está en `true`
- la prueba coloca la cookie `e2e-bypass=1`

Con eso se pueden correr pruebas automáticas estables de navegador sin depender de credenciales reales ni de staging.

## Activar live smoke en GitHub después
La parte live ya quedó implementada en código. Para correrla desde GitHub más adelante solo necesitas crear un job o workflow que pase estas variables dentro de GitHub:

- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_TEST_EMAIL`
- `PLAYWRIGHT_TEST_PASSWORD`

No necesitas tocar producción para eso.
