"use client"

import { MousePointer2 } from "lucide-react"
import {
  MouseTrackerProvider,
  Pointer,
  PointerFollower,
} from "@/components/ui/cursor"

export function ComputerCursor() {
  return (
    <MouseTrackerProvider>
      <Pointer>
        <MousePointer2
          size={25}
          className="fill-blue-500 stroke-white drop-shadow-md"
          strokeWidth={1.5}
        />
      </Pointer>
      <PointerFollower gap={24}>
        <span className="rounded-md border border-white/20 bg-blue-500 px-2 py-1 text-[11px] leading-none font-medium text-white shadow-md">
          You
        </span>
      </PointerFollower>
    </MouseTrackerProvider>
  )
}
