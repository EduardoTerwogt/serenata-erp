---
paths:
  - "app/api/**"
---

- Las routes **autentican, validan y delegan**. Sin lógica de negocio compleja aquí.
- Auth siempre al inicio, con el patrón que ya exista en rutas hermanas — no inventar otro:
  ```ts
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response
  ```
  Secciones: `admin`, `dashboard`, `cotizaciones`, `proyectos`, `cuentas`,
  `responsables`, `planeacion`. Algunas rutas usan `requireAnySection()`.
- Validar el payload con Zod antes de usarlo:
  ```ts
  const validation = validate(CotizacionCreateSchema, body)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
  ```
- **`params` es Promise en Next.js 16:**
  ```ts
  export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
  }
  ```
- Reutilizar repositorios y servicios de `lib/server/`. Nunca duplicar su lógica.
- No exponer errores internos al cliente. Fallar explícito, nunca en silencio.
- Toda transición financiera va por un endpoint explícito, nunca por un `PUT` genérico.
- El portal de proveedores tiene sesión propia, independiente de NextAuth.
- Cálculos de dinero e impuestos: reutilizar `lib/server/validation/factura-fiscal.ts`
  y las fórmulas de `docs/decisions/006-reglas-de-negocio-invariables.md`. No duplicar.
