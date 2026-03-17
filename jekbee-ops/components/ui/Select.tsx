import { clsx } from 'clsx'
import { SelectHTMLAttributes, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-medium text-white/60 uppercase tracking-wide">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={clsx(
            'bg-dark-600 border text-white text-sm px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400/60 focus:border-amber-400/60 transition-colors appearance-none',
            error ? 'border-red-500/60' : 'border-dark-400',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" className="bg-dark-700">
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-dark-700">
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
