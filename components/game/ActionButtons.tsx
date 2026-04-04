'use client'

interface ActionButtonsProps {
  onSuccess: () => void
  onFail:    () => void
  disabled:  boolean
  /** AR 模式下使用較小的「手動覆蓋」樣式 */
  compact?:  boolean
}

export function ActionButtons({ onSuccess, onFail, disabled, compact = false }: ActionButtonsProps) {
  if (compact) {
    return (
      <div className="flex gap-3 justify-center w-full max-w-xl mx-auto px-4">
        <button
          onClick={onFail}
          disabled={disabled}
          className="
            flex-1
            bg-red-50 text-red-700 border-2 border-red-300
            text-base font-bold
            min-h-[56px] rounded-xl
            hover:bg-red-100
            active:scale-[0.97]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
            transition-all duration-150 no-select
            flex items-center justify-center gap-1.5
          "
        >
          <span>✗</span>
          <span>手動記錄失敗</span>
        </button>
        <button
          onClick={onSuccess}
          disabled={disabled}
          className="
            flex-1
            bg-green-50 text-green-700 border-2 border-green-300
            text-base font-bold
            min-h-[56px] rounded-xl
            hover:bg-green-100
            active:scale-[0.97]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
            transition-all duration-150 no-select
            flex items-center justify-center gap-1.5
          "
        >
          <span>✓</span>
          <span>手動記錄成功</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-4 sm:gap-6 justify-center w-full max-w-xl mx-auto px-4">
      {/* 失敗按鈕 */}
      <button
        onClick={onFail}
        disabled={disabled}
        className="
          flex-1
          bg-red-600 text-white
          text-2xl font-bold
          min-h-[88px] rounded-2xl
          shadow-md shadow-red-200
          hover:bg-red-700
          active:scale-[0.97]
          disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
          transition-all duration-150 no-select
          flex items-center justify-center gap-2
        "
      >
        <span className="text-3xl">✗</span>
        <span>失敗</span>
      </button>

      {/* 成功按鈕 */}
      <button
        onClick={onSuccess}
        disabled={disabled}
        className="
          flex-1
          bg-green-600 text-white
          text-2xl font-bold
          min-h-[88px] rounded-2xl
          shadow-md shadow-green-200
          hover:bg-green-700
          active:scale-[0.97]
          disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
          transition-all duration-150 no-select
          flex items-center justify-center gap-2
        "
      >
        <span className="text-3xl">✓</span>
        <span>成功</span>
      </button>
    </div>
  )
}
