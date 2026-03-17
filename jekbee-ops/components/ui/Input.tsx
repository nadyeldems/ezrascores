import { clsx } from 'clsx'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-medium text-white/60 uppercase tracking-wide">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            'bg-dark-600 border text-white text-sm px-3 py-2 rounded-md placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/60 focus:border-amber-400/60 transition-colors',
            error ? 'border-red-500/60' : 'border-dark-400',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {helperText && !error && <p className="text-xs text-white/40">{helperText}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
