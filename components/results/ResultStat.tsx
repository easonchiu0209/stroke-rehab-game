'use client'

interface ResultStatProps {
  label: string
  value: string | number
  unit?: string
  accentClass: string  // e.g. 'text-green-600'
  icon?: string
}

export function ResultStat({ label, value, unit, accentClass, icon }: ResultStatProps) {
  return (
    <div className="flex-1 min-w-[130px] bg-white rounded-2xl border-2 border-gray-100 p-5 text-center shadow-sm">
      {icon && <div className="text-3xl mb-1 leading-none">{icon}</div>}
      <p className="text-sm text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-4xl font-extrabold tabular-nums leading-tight ${accentClass}`}>
        {value}
        {unit && (
          <span className="text-xl font-semibold text-gray-400 ml-0.5">{unit}</span>
        )}
      </p>
    </div>
  )
}
