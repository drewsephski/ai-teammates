"use client"

import { ClockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const hours = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0")
)
const minutes = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0")
)

export function TimePicker({
  value,
  onChange,
  onBlur,
  invalid,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  invalid?: boolean
}) {
  const [hour, minute] = value.split(":")
  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={`Time: ${value}`}
            aria-invalid={invalid}
            onBlur={onBlur}
          />
        }
      >
        <ClockIcon data-icon="inline-start" />
        <span className="tabular-nums">{value}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60">
        <PopoverTitle>Time (24-hour)</PopoverTitle>
        <div className="flex items-center gap-2">
          {[
            { label: "Hour", options: hours, selected: hour },
            { label: "Minute", options: minutes, selected: minute },
          ].map(({ label, options, selected }) => (
            <Select
              key={label}
              items={options.map((value) => ({ label: value, value }))}
              value={selected}
              onValueChange={(next) => {
                if (next !== null)
                  onChange(
                    label === "Hour" ? `${next}:${minute}` : `${hour}:${next}`
                  )
              }}
            >
              <SelectTrigger aria-label={label} className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
