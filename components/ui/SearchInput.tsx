import { InputHTMLAttributes } from 'react'
import { Icon } from './Icon'

type SearchInputProps = InputHTMLAttributes<HTMLInputElement>

export function SearchInput({ className = '', ...rest }: SearchInputProps) {
  return (
    <div className="relative">
      <Icon name="search" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
      <input
        type="text"
        {...rest}
        className={`w-full rounded-control border border-hairline bg-input py-2.5 pl-11 pr-4 text-sm text-body placeholder-faint transition-colors focus:border-accent focus:outline-none ${className}`}
      />
    </div>
  )
}
