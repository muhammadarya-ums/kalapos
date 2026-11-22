import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { ToastProvider } from "@/components/ui/toast"
import { KalaPOSProvider } from "@/lib/kalapos/context"
import { PrinterProvider } from "@/lib/printer/context"
import "./globals.css"

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta",
  display: "swap",
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "KalaPOS - Sistem Kasir & Operasional Internal Kafe Kala",
  description:
    "Sistem POS internal Kafe Kala untuk pengelolaan cabang oleh Owner, kasir, antrean barista real-time, dan laporan omset arus kas.",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png?v=kala1",
        media: "(prefers-color-scheme: light)",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/icon-dark-32x32.png?v=kala1",
        media: "(prefers-color-scheme: dark)",
        sizes: "32x32",
        type: "image/png",
      },
      { url: "/icon.svg?v=kala1", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico?v=kala1",
    apple: [{ url: "/apple-icon.png?v=kala1", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#F8F7F4",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${jetBrainsMono.variable}`}>
      <body className="min-h-screen bg-[#F8F7F4] font-sans text-[#18181B] antialiased">
        <ToastProvider>
          <KalaPOSProvider>
            <PrinterProvider>{children}</PrinterProvider>
          </KalaPOSProvider>
        </ToastProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
