"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { createRoutine } from "@/actions/routines"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { routineInsertSchema, type Bot } from "@/db/schema"
import type { RoutineSchedule } from "@/lib/routine-policy"

type RoutineBot = Pick<Bot, "id" | "name">

const formatZone = (zone: string) => zone.replaceAll("_", " ")
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const kinds = { daily: "At a set time", interval: "Every few hours" }
const defaults: Record<keyof typeof kinds, RoutineSchedule> = {
  daily: { kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] },
  interval: { kind: "interval", hours: 4 },
}

// The nested message for whichever schedule field failed
function scheduleError(error: unknown) {
  if (!error || typeof error !== "object") return undefined
  const nested = error as Record<string, { message?: string } | undefined>
  return (
    (error as { message?: string }).message ??
    nested.time?.message ??
    nested.days?.message ??
    nested.hours?.message
  )
}

function RoutineForm({
  bots,
  timezones,
  onSaved,
}: {
  bots: RoutineBot[]
  timezones: string[]
  onSaved: () => void
}) {
  const [requestId] = useState(() => crypto.randomUUID())
  const [zone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  )
  const form = useForm({
    resolver: zodResolver(routineInsertSchema),
    defaultValues: {
      botId: bots[0]?.id ?? "",
      title: "",
      prompt: "",
      schedule: defaults.daily,
      timezone: zone,
      requestId,
    },
  })
  const { isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await createRoutine(values)
      if (!result.ok) {
        toast.add({
          type: "error",
          title: "Couldn't schedule the routine",
          description: result.message,
        })
        return
      }
      toast.add({
        type: "success",
        title: `${result.routine.title} is scheduled`,
        description: `${result.routine.description} (${formatZone(result.routine.timezone)})`,
      })
      onSaved()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't schedule the routine",
        description: "Something went wrong. Try again.",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
      <FieldGroup className="min-h-0 overflow-y-auto">
        <Controller
          name="botId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="routine-bot">Bot</FieldLabel>
              <Select
                items={bots.map((bot) => ({ value: bot.id, label: bot.name }))}
                name={field.name}
                inputRef={field.ref}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger
                  id="routine-bot"
                  className="w-full"
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bots.map((bot) => (
                    <SelectItem key={bot.id} value={bot.id}>
                      {bot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="title"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="routine-title">Name</FieldLabel>
              <Input
                {...field}
                id="routine-title"
                placeholder="Morning brief"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="prompt"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="routine-prompt">
                What to do each time
              </FieldLabel>
              <Textarea
                {...field}
                id="routine-prompt"
                rows={4}
                placeholder="Check my inbox and calendar. Tell me what needs a reply today and draft the replies."
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                The bot works on its own and reports back in its chat. Sending,
                posting or deleting still waits for your approval.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="schedule"
          control={form.control}
          render={({ field, fieldState }) => {
            const schedule = field.value as RoutineSchedule
            const message = scheduleError(fieldState.error)
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="routine-kind">When</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    items={kinds}
                    value={schedule.kind === "interval" ? "interval" : "daily"}
                    onValueChange={(kind) =>
                      field.onChange(defaults[kind as keyof typeof kinds])
                    }
                  >
                    <SelectTrigger
                      id="routine-kind"
                      className="w-44"
                      onBlur={field.onBlur}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">{kinds.daily}</SelectItem>
                      <SelectItem value="interval">{kinds.interval}</SelectItem>
                    </SelectContent>
                  </Select>
                  {schedule.kind === "daily" && (
                    <Input
                      type="time"
                      aria-label="Time"
                      className="w-32"
                      value={schedule.time}
                      aria-invalid={fieldState.invalid}
                      onChange={(event) =>
                        field.onChange({
                          ...schedule,
                          time: event.target.value,
                        })
                      }
                    />
                  )}
                  {schedule.kind === "interval" && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={168}
                        aria-label="Hours between runs"
                        className="w-20"
                        value={
                          Number.isNaN(schedule.hours) ? "" : schedule.hours
                        }
                        aria-invalid={fieldState.invalid}
                        onChange={(event) =>
                          field.onChange({
                            ...schedule,
                            hours: event.target.valueAsNumber,
                          })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        hours
                      </span>
                    </div>
                  )}
                </div>
                {schedule.kind === "daily" && (
                  <div
                    role="group"
                    aria-label="Days"
                    className="flex flex-wrap gap-1"
                  >
                    {weekdays.map((label, day) => {
                      const selected = schedule.days.includes(day)
                      return (
                        <Button
                          key={label}
                          type="button"
                          size="sm"
                          variant={selected ? "secondary" : "ghost"}
                          aria-pressed={selected}
                          onClick={() =>
                            field.onChange({
                              ...schedule,
                              days: selected
                                ? schedule.days.filter((value) => value !== day)
                                : [...schedule.days, day].sort(),
                            })
                          }
                        >
                          {label}
                        </Button>
                      )
                    })}
                  </div>
                )}
                {message && <FieldError>{message}</FieldError>}
              </Field>
            )
          }}
        />
        <Controller
          name="timezone"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="routine-timezone">Timezone</FieldLabel>
              <Combobox
                items={timezones}
                value={field.value || null}
                onValueChange={(value) => field.onChange(value ?? "")}
                itemToStringLabel={formatZone}
              >
                <ComboboxInput
                  ref={field.ref}
                  id="routine-timezone"
                  name={field.name}
                  onBlur={field.onBlur}
                  className="w-full sm:w-72"
                  aria-invalid={fieldState.invalid}
                />
                <ComboboxContent>
                  <ComboboxEmpty>No matching timezone</ComboboxEmpty>
                  <ComboboxList>
                    {(option: string) => (
                      <ComboboxItem key={option} value={option}>
                        {formatZone(option)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Schedule
        </Button>
      </DialogFooter>
    </form>
  )
}

export function RoutineDialog({
  bots,
  timezones,
}: {
  bots: RoutineBot[]
  timezones: string[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" size="sm" disabled={!bots.length} />}
      >
        <PlusIcon data-icon="inline-start" />
        New routine
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New routine</DialogTitle>
          <DialogDescription>
            A bot does this on a schedule, even when you&apos;re away, and
            notifies your phone when it&apos;s done.
          </DialogDescription>
        </DialogHeader>
        <RoutineForm
          bots={bots}
          timezones={timezones}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
