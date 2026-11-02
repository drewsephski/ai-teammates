"use client"

import { Button } from "@/components/ui/button"
import type { FantasyMode } from "@/lib/fantasy-football-policy"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

export function FantasyFootballModeDialog({
  open,
  onOpenChange,
  pending,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onSelect: (mode: FantasyMode) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            How should Fantasy Coach manage your lineup?
          </DialogTitle>
          <DialogDescription>
            Review every lineup change yourself or let your bot handle start/sit
            moves. Trades, waivers, adds and drops always need approval. You can
            change your mode in bot settings.
          </DialogDescription>
        </DialogHeader>
        {(
          [
            [
              "manual",
              "Manual approval",
              "Accept or decline each proposed lineup change.",
            ],
            [
              "autonomous",
              "Automatic",
              "Allow start/sit changes for your saved ESPN team.",
            ],
          ] as const
        ).map(([mode, label, description]) => (
          <Button
            key={mode}
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-left whitespace-normal"
            disabled={pending}
            onClick={() => onSelect(mode)}
          >
            <span className="font-medium">{label}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {description}
            </span>
          </Button>
        ))}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancel
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
