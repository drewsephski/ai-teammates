"use client"

import { useEffect, useId, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { fantasyFootballSettingsSchema } from "@/db/schema"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

const actions = () => import("@/actions/fantasy-football")
type Actions = Pick<
  Awaited<ReturnType<typeof actions>>,
  "loadFantasyFootballSettings" | "updateFantasyFootballSettings"
>
type Settings = NonNullable<
  Awaited<ReturnType<Actions["loadFantasyFootballSettings"]>>
>

export function FantasyFootballSettings({
  botId,
  api,
}: {
  botId: string
  api?: Actions
}) {
  const [result, setResult] = useState<{
    botId: string
    settings?: Settings | null
    failed?: boolean
  }>()
  const [attempt, retry] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      const client = api ?? (await actions())
      return client.loadFantasyFootballSettings(botId)
    }
    load()
      .then((result) => {
        if (active) setResult({ botId, settings: result })
      })
      .catch(() => {
        if (active) setResult({ botId, failed: true })
      })
    return () => {
      active = false
    }
  }, [botId, api, attempt])
  if (result?.botId !== botId)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading ESPN lineup settings…
      </p>
    )
  if (result.failed)
    return (
      <div className="space-y-2">
        <p role="status" className="text-sm text-muted-foreground">
          Couldn&apos;t load ESPN lineup settings.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setResult(undefined)
            retry((value) => value + 1)
          }}
        >
          Retry lineup settings
        </Button>
      </div>
    )
  if (!result.settings) return null
  return (
    <LineupSettings
      key={botId}
      settings={result.settings}
      api={api}
      onSaved={(settings) => setResult({ botId, settings })}
    />
  )
}

function LineupSettings({
  settings,
  onSaved,
  api,
}: {
  settings: Settings
  onSaved: (value: Settings) => void
  api?: Actions
}) {
  const id = useId()
  const form = useForm({
    resolver: zodResolver(fantasyFootballSettingsSchema),
    defaultValues: {
      mode: settings.mode,
      teamUrl: settings.teamUrl,
      enabled: settings.enabled,
      timezone: settings.teamUrl
        ? settings.timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
      checkTime: settings.checkTime,
    },
  })
  const save = form.handleSubmit(async (values) => {
    try {
      const client = api ?? (await actions())
      const next = await client.updateFantasyFootballSettings(
        settings.botId,
        values
      )
      if (!next) throw new Error("No settings returned")
      form.reset({ ...values, teamUrl: next.teamUrl, enabled: next.enabled })
      onSaved(next)
      toast.add({ type: "success", title: "Lineup settings saved" })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't save lineup settings",
        description: "Your changes are still here. Try again.",
      })
    }
  })
  return (
    <FieldSet
      disabled={form.formState.isSubmitting}
      onKeyDown={(event) => {
        // These fields sit inside the bot profile form, but save independently.
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault()
          event.stopPropagation()
          if (!form.formState.isSubmitting) void save()
        }
      }}
    >
      <FieldLegend variant="label">ESPN lineup management</FieldLegend>
      <FieldDescription>
        Choose your team and daily check, then sign in to ESPN in chat. Checks
        run while the app is closed; ESPN can require sign-in again.
      </FieldDescription>
      <FieldGroup>
        <Controller
          control={form.control}
          name="mode"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldLabel htmlFor={`${id}-mode`}>
                Automatic start/sit changes
              </FieldLabel>
              <Switch
                id={`${id}-mode`}
                disabled={form.formState.isSubmitting}
                aria-label="Automatic ESPN lineup changes"
                aria-describedby={`${id}-mode-description`}
                checked={field.value === "autonomous"}
                onCheckedChange={(checked) =>
                  field.onChange(checked ? "autonomous" : "manual")
                }
              />
            </Field>
          )}
        />
        <FieldDescription id={`${id}-mode-description`}>
          With automatic changes off, accept or decline each lineup change in
          chat. With automatic changes on and daily checks enabled, your bot can
          make start/sit moves for this team. Trades, waivers, adds and drops
          always require approval. Save with automatic changes off to revoke
          permission.
        </FieldDescription>
        {(
          [
            [
              "teamUrl",
              "ESPN team link",
              "Paste the team URL including leagueId, teamId and seasonId.",
            ],
            [
              "checkTime",
              "Daily check time",
              "24-hour time, such as 09:00, before kickoff.",
            ],
            ["timezone", "Timezone", "For example America/Chicago."],
          ] as const
        ).map(([name, label, description]) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-${name}`}>{label}</FieldLabel>
                <FieldDescription id={`${id}-${name}-description`}>
                  {description}
                </FieldDescription>
                <Input
                  {...field}
                  id={`${id}-${name}`}
                  type={
                    name === "checkTime"
                      ? "time"
                      : name === "teamUrl"
                        ? "url"
                        : "text"
                  }
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={
                    name === "teamUrl"
                      ? "https://fantasy.espn.com/football/team?..."
                      : undefined
                  }
                  aria-label={label}
                  aria-describedby={`${id}-${name}-description ${id}-${name}-error`}
                  aria-invalid={fieldState.invalid}
                />
                <FieldError
                  id={`${id}-${name}-error`}
                  errors={[fieldState.error]}
                />
              </Field>
            )}
          />
        ))}
        <Controller
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldLabel htmlFor={`${id}-enabled`}>
                Daily lineup check
              </FieldLabel>
              <Switch
                id={`${id}-enabled`}
                disabled={form.formState.isSubmitting}
                aria-label="Daily ESPN lineup check"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
        {settings.nextRunAt && (
          <p role="status" className="text-xs text-muted-foreground">
            Next check:{" "}
            {new Date(settings.nextRunAt).toLocaleString(undefined, {
              timeZone: settings.timezone,
            })}{" "}
            ({settings.timezone})
          </p>
        )}
        {settings.lastError && (
          <p role="status" className="text-xs text-muted-foreground">
            Last check: {settings.lastError}
          </p>
        )}
        <Button
          type="button"
          disabled={form.formState.isSubmitting}
          aria-busy={form.formState.isSubmitting}
          onClick={() => void save()}
        >
          {form.formState.isSubmitting && (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          )}
          Save lineup settings
        </Button>
      </FieldGroup>
    </FieldSet>
  )
}
