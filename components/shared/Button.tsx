'use client'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
  size?: 'md' | 'lg' | 'xl'
  fullWidth?: boolean
  children: React.ReactNode
}

const VARIANT_CLASSES = {
  primary:
    'bg-blue-800 text-white hover:bg-blue-700 shadow-md shadow-blue-200 active:scale-[0.97]',
  secondary:
    'bg-white text-blue-800 border-2 border-blue-800 hover:bg-blue-50 active:scale-[0.97]',
  success:
    'bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-200 active:scale-[0.97]',
  danger:
    'bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-200 active:scale-[0.97]',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 active:scale-[0.97]',
}

const SIZE_CLASSES = {
  md: 'min-h-[56px] px-6 text-lg font-semibold rounded-xl',
  lg: 'min-h-[72px] px-8 text-xl font-bold rounded-2xl',
  xl: 'min-h-[88px] px-10 text-2xl font-bold rounded-2xl',
}

export function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`
        ${VARIANT_CLASSES[variant]}
        ${SIZE_CLASSES[size]}
        ${fullWidth ? 'w-full' : ''}
        transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
        no-select
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
