import type { Metadata, Viewport } from 'next'
import { GameProvider } from '@/context/GameContext'
import './globals.css'

export const metadata: Metadata = {
  title: '上肢功能復健訓練',
  description: '中風後上肢功能性復健訓練遊戲 — 近距離抓取與左右移動訓練',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '復健訓練',
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
      <body className="min-h-screen bg-gray-50">
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  )
}
