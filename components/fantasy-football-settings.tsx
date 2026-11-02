"use client"

import { useEffect, useId, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { fantasyFootballSettingsSchema } from "@/db/schema"
import { describeEspnTeam } from "@/lib/fantasy-football-policy"
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
  // What the saved link points at, as the person edits it; the saved team's
  // name belongs to the saved link only
  const teamUrl = useWatch({ control: form.control, name: "teamUrl" })
  const team = teamUrl
    ? describeEspnTeam(
        teamUrl,
        teamUrl === settings.teamUrl ? settings.teamName : ""
      )
    : null
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
        Sign in to ESPN once from chat and your bot finds your team and saves it
        here. Checks run while the app is closed; ESPN can ask you to sign in
        again.
      </FieldDescription>
      <FieldGroup>
        <Controller
          control={form.control}
          name="teamUrl"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${id}-teamUrl`}>ESPN team link</FieldLabel>
              {team ? (
                <p
                  role="status"
                  id={`${id}-teamUrl-team`}
                  className="text-sm text-foreground"
                >
                  {teamUrl === settings.teamUrl ? "Saved team: " : "Team: "}
                  {team}
                </p>
              ) : null}
              <FieldDescription id={`${id}-teamUrl-description`}>
                {settings.teamUrl
                  ? "To manage a different team, paste the link of its team page on fantasy.espn.com."
                  : "No team yet. Ask your bot in chat to find it, or paste the link of your team page on fantasy.espn.com (My Team)."}
              </FieldDescription>
              <Input
                {...field}
                id={`${id}-teamUrl`}
                type="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="https://fantasy.espn.com/football/team?leagueId=…&teamId=…"
                aria-label="ESPN team link"
                aria-describedby={`${id}-teamUrl-description ${id}-teamUrl-error`}
                aria-invalid={fieldState.invalid}
              />
              <FieldError
                id={`${id}-teamUrl-error`}
                errors={[fieldState.error]}
              />
            </Field>
          )}
        />
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
          Off: accept or decline each lineup change in chat. On, with the daily
          check enabled: your bot makes start/sit moves for the saved team on
          its own. Trades, waivers, adds and drops always ask. Save with this
          off to revoke permission.
        </FieldDescription>
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
        {(
          [
            [
              "checkTime",
              "Daily check time",
              "Before the first kickoff of the day, in your timezone.",
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
                  type={name === "checkTime" ? "time" : "text"}
                  autoCapitalize="none"
                  spellCheck={false}
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
