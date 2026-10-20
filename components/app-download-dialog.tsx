"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon, DownloadIcon, SmartphoneIcon } from "lucide-react"

import { AppDownloadQr } from "@/components/app-download-qr"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import {
  androidDownloadPath,
  appDownloadUrl,
  detectMobilePlatform,
  type MobilePlatform,
} from "@/lib/app-download"

// "Get the app" in the sidebar footer. The person picks their phone; Android
// gets a QR code to the download page (or the download itself when they are
// already on the phone), iPhone says the App Store release is coming.
export function AppDownloadDialog({
  androidAvailable,
}: {
  androidAvailable: boolean
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <SidebarMenuButton
            tooltip="Get the app"
            className="h-10 rounded-xl"
          />
        }
      >
        <SmartphoneIcon />
        <span>Get the app</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get the app</DialogTitle>
          <DialogDescription>
            Chat with your bots and review their work from your phone.
          </DialogDescription>
        </DialogHeader>
        <AppDownloadChooser androidAvailable={androidAvailable} />
      </DialogContent>
    </Dialog>
  )
}

function AppDownloadChooser({
  androidAvailable,
}: {
  androidAvailable: boolean
}) {
  // Mounted only while the dialog is open, so navigator is always defined.
  const [device] = useState(() => detectMobilePlatform(navigator.userAgent))
  const [platform, setPlatform] = useState<MobilePlatform>(device ?? "android")

  return (
    <Tabs
      value={platform}
      onValueChange={(value) => setPlatform(value as MobilePlatform)}
    >
      <TabsList className="w-full" aria-label="Your phone">
        <TabsTrigger value="ios">iPhone</TabsTrigger>
        <TabsTrigger value="android">Android</TabsTrigger>
      </TabsList>
      <TabsContent value="android" className="pt-2">
        {!androidAvailable ? (
          <p className="text-muted-foreground">
            The Android app is coming soon.
          </p>
        ) : device === "android" ? (
          <div className="flex flex-col gap-3">
            <a
              href={androidDownloadPath}
              className={buttonVariants({ className: "w-full" })}
            >
              <DownloadIcon data-icon="inline-start" />
              Download for Android
            </a>
            <p className="text-muted-foreground">
              Open the file when it finishes downloading. If Android asks, allow
              your browser to install apps, then sign in to Krafty.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <AppDownloadQr className="rounded-xl" />
            <p className="text-muted-foreground">
              Scan the code with your Android phone&apos;s camera to open the
              download page, or copy the link and send it to your phone.
            </p>
            <CopyDownloadLink />
          </div>
        )}
      </TabsContent>
      <TabsContent value="ios" className="pt-2">
        <p className="text-muted-foreground">
          Krafty for iPhone is coming soon to the App Store. Until then, open{" "}
          {new URL(appDownloadUrl).host} in Safari to use Krafty on your iPhone.
        </p>
      </TabsContent>
    </Tabs>
  )
}

function CopyDownloadLink() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(appDownloadUrl)
          setCopied(true)
        } catch {
          toast.add({
            type: "error",
            title: "Couldn't copy the link",
            description: `Open ${appDownloadUrl} on your phone instead.`,
          })
        }
      }}
    >
      {copied ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
      {copied ? "Link copied" : "Copy link"}
    </Button>
  )
}
