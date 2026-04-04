'use client'

interface PageWrapperProps {
  children: React.ReactNode
  className?: string
}

export function PageWrapper({ children, className = '' }: PageWrapperProps) {
  return (
    <div className={`min-h-screen flex flex-col ${className}`}>
      {children}
    </div>
  )
}
