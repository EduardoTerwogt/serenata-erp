interface TableFooterProps {
  shown: number
  total: number
  unit?: string
  className?: string
}

// Puerto de data/TableFooter.jsx del kit. El selector "Resultados por página"
// del kit no se incluye: ninguna lista de esta app pagina de verdad (siempre
// carga y filtra el conjunto completo), y un selector que no hace nada sería
// peor que no tenerlo. Se conserva solo la línea de conteo, que sí es real.
export function TableFooter({ shown, total, unit = '', className = '' }: TableFooterProps) {
  return (
    <div className={`flex h-11 items-center border-t border-hairline px-[var(--row-pad-x)] ${className}`}>
      <span className="text-[length:var(--text-caption)] text-faint">
        Mostrando {shown} de {total}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
  )
}
