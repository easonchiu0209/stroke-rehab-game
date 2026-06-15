'use client'

import { signIn } from 'next-auth/react'

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 to-blue-50 flex flex-col items-center justify-center px-6 gap-8">
      <div className="text-center">
        <div className="text-7xl mb-4">🏥</div>
        <h1 className="text-4xl font-extrabold text-gray-900">上肢功能復健訓練</h1>
        <p className="text-gray-500 mt-2 text-lg">登入以記錄訓練進度、累積積分、兌換獎品</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <button
          onClick={() => signIn('line', { callbackUrl: '/' })}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-xl text-white shadow-lg active:scale-95 transition-all"
          style={{ background: '#06C755' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
          </svg>
          使用 LINE 登入
        </button>

        <p className="text-center text-sm text-gray-400">
          登入即代表同意訓練資料用於復健進度追蹤
        </p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-3">登入後可以：</h3>
        <ul className="space-y-2 text-gray-600 text-sm">
          <li>🏅 累積訓練積分，兌換實體/虛擬獎品</li>
          <li>📊 查看個人訓練歷程與進步曲線</li>
          <li>🏆 在排行榜與其他學員互相鼓勵</li>
          <li>🎯 解鎖成就徽章</li>
          <li>📋 治療師可查看詳細訓練報告</li>
        </ul>
      </div>
    </main>
  )
}
