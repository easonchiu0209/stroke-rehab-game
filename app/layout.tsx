import type { Metadata, Viewport } from 'next'
import { GameProvider } from '@/context/GameContext'
import { SessionProvider } from '@/components/SessionProvider'
import RewardDropToast from '@/components/shared/RewardDropToast'
import CoachToast from '@/components/shared/CoachToast'
import './globals.css'

export const metadata: Metadata = {
  title: 'LifeMotionXR',
  description: 'LifeMotionXR — 復能訓練遊戲平台（訓練輔助工具，非醫療器材）',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LifeMotionXR',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-slate-50">
        <SessionProvider>
          <GameProvider>{children}</GameProvider>
          <RewardDropToast />
          <CoachToast />
        </SessionProvider>
      </body>
    </html>
  )
}
