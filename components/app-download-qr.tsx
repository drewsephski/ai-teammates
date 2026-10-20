"use client"

import { QRCodeSVG } from "qrcode.react"

import { appDownloadUrl } from "@/lib/app-download"

// Phone cameras need dark modules on a light field, so the code keeps black on
// white in both themes.
export function AppDownloadQr({
  size = 168,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <QRCodeSVG
      value={appDownloadUrl}
      size={size}
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#0a0a0a"
      title="QR code that opens the Krafty download page"
      className={className}
    />
  )
}
