"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { cn } from "cn"

function ScrollArea({
  className,
  children,
  viewportProps,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>
  orientation?: "vertical" | "horizontal" | "both"
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative min-w-0 overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        {...viewportProps}
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          viewportProps?.className
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-0.5 opacity-60 select-none data-hovering:opacity-100 data-scrolling:opacity-100 motion-safe:transition-opacity motion-safe:duration-150 data-horizontal:h-2 data-horizontal:flex-col data-vertical:h-full data-vertical:w-2",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-muted-foreground/35 hover:bg-muted-foreground/55"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
