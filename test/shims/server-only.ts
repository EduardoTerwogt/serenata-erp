// EF-2 1B-1: el paquete real `server-only` lanza al importarse fuera de la
// condición de resolución `react-server`, que Vitest no activa por defecto.
// Cualquier test que importe (directa o transitivamente, vía un
// repositorio) lib/server/supabase-admin.ts necesita este shim -- no-op a
// propósito, nunca debe hacer nada.
export {}
