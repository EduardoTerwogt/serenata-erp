export function formatCuentasCurrency(value: number) {
  return (value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}
