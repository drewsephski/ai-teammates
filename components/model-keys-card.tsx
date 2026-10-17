"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { KeyRoundIcon, Trash2Icon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import {
  deleteModelKey,
  listProviderModels,
  saveModelKey,
  selectAIProvider,
} from "@/actions/model-keys"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { toast } from "@/components/ui/toast"
import { modelKeySaveSchema, type AIProviderChoice } from "@/db/schema"
import {
  modelProviderKeyUrls,
  modelProviderLabels,
  modelProviders,
  type ModelProvider,
  type ProviderModel,
} from "@/lib/model-key-policy"
import type { PublicModelKey } from "@/lib/model-keys"

function KeyForm({
  keys,
  onSaved,
}: {
  keys: PublicModelKey[]
  onSaved: () => void
}) {
  const [models, setModels] = useState<ProviderModel[]>()
  const [checking, setChecking] = useState(false)
  const form = useForm({
    resolver: zodResolver(modelKeySaveSchema),
    defaultValues: {
      provider: "anthropic" as ModelProvider,
      apiKey: "",
      model: "",
    },
  })
  const { isSubmitting } = form.formState
  const provider = useWatch({ control: form.control, name: "provider" })
  const saved = keys.find((key) => key.provider === provider)

  // Lists the key's models; an empty field uses the saved key
  async function check() {
    const apiKey = form.getValues("apiKey")?.trim() || undefined
    if (!apiKey && !saved) {
      form.setError("apiKey", { message: "Paste your API key." })
      return
    }
    setChecking(true)
    try {
      const result = await listProviderModels({ provider, apiKey })
      if (!result.ok) {
        form.setError("apiKey", { message: result.message })
        setModels(undefined)
        return
      }
      form.clearErrors("apiKey")
      setModels(result.models)
      if (!result.models.length)
        form.setError("model", {
          message: "This key has no chat models that can use tools.",
        })
      else
        form.setValue(
          "model",
          saved && result.models.some((model) => model.id === saved.model)
            ? saved.model
            : result.models[0].id
        )
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't check the key",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setChecking(false)
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await saveModelKey({
        ...values,
        apiKey: values.apiKey?.trim() || undefined,
      })
      if (!result.ok) {
        toast.add({
          type: "error",
          title: "Couldn't save the key",
          description: result.message,
        })
        return
      }
      toast.add({
        type: "success",
        title: `Replies now use ${modelProviderLabels[values.provider]}`,
        description: values.model,
      })
      onSaved()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't save the key",
        description: "Something went wrong. Try again.",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
      <FieldGroup className="min-h-0 overflow-y-auto">
        <Controller
          name="provider"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="model-provider">Provider</FieldLabel>
              <Select
                items={modelProviderLabels}
                name={field.name}
                inputRef={field.ref}
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value)
                  setModels(undefined)
                  form.setValue("model", "")
                }}
              >
                <SelectTrigger
                  id="model-provider"
                  className="w-full sm:w-64"
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelProviders.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {modelProviderLabels[provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="apiKey"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="model-api-key">API key</FieldLabel>
              <div className="flex gap-2">
                <Input
                  {...field}
                  value={field.value ?? ""}
                  id="model-api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={saved ? `Saved key …${saved.keyHint}` : ""}
                  aria-invalid={fieldState.invalid}
                  onChange={(event) => {
                    field.onChange(event)
                    setModels(undefined)
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={checking}
                  onClick={() => void check()}
                >
                  {checking && <Spinner data-icon="inline-start" />}
                  Check key
                </Button>
              </div>
              <FieldDescription>
                {saved ? "Leave it empty to keep your saved key. " : ""}
                Create one in your{" "}
                <a
                  href={modelProviderKeyUrls[provider]}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {modelProviderLabels[provider]} account
                </a>
                . It&apos;s stored encrypted and never shown again.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {models && models.length > 0 && (
          <Controller
            name="model"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="model-id">Model</FieldLabel>
                <Select
                  items={Object.fromEntries(
                    models.map((model) => [model.id, model.name])
                  )}
                  name={field.name}
                  inputRef={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    id="model-id"
                    className="w-full"
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Your bots use tools, the computer and screenshots, so pick a
                  capable model that can read images.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
        {models?.length === 0 && (
          <FieldError errors={[form.formState.errors.model]} />
        )}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting || !models?.length}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Save and use
        </Button>
      </DialogFooter>
    </form>
  )
}

function KeyDialog({ keys }: { keys: PublicModelKey[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
          />
        }
      >
        <KeyRoundIcon data-icon="inline-start" />
        {keys.length ? "Add or change a key" : "Add a key"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Use your own model</DialogTitle>
          <DialogDescription>
            Your bots reply with a model you pay for directly. Web search and
            computer safety checks still use your Krafty allowance.
          </DialogDescription>
        </DialogHeader>
        <KeyForm keys={keys} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function KeyRow({ entry }: { entry: PublicModelKey }) {
  const [pending, setPending] = useState(false)
  const label = modelProviderLabels[entry.provider]

  async function remove() {
    setPending(true)
    try {
      await deleteModelKey(entry.provider)
      toast.add({ type: "success", title: `${label} key removed` })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't remove the key",
        description: "Something went wrong. Try again.",
      })
      setPending(false)
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {label}
          {entry.selected && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              In use
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.model} · key ending {entry.keyHint}
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={pending}
              aria-label={`Remove ${label} key`}
            />
          }
        >
          <Trash2Icon />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your {label} key?</AlertDialogTitle>
            <AlertDialogDescription>
              {entry.selected
                ? "Replies go back to your Krafty AI allowance."
                : "You can add it again any time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

export function ModelKeysCard({
  keys,
  aiProvider,
  available,
}: {
  keys: PublicModelKey[]
  aiProvider: "chatgpt" | AIProviderChoice
  available: boolean
}) {
  const [pending, setPending] = useState(false)
  const items: Record<string, string> = {
    krafty: "Krafty AI allowance",
    ...(aiProvider === "chatgpt" && { chatgpt: "Your ChatGPT plan" }),
    ...Object.fromEntries(
      keys.map((key) => [
        key.provider,
        `${modelProviderLabels[key.provider]} · ${key.model}`,
      ])
    ),
  }

  async function choose(value: string) {
    if (value === aiProvider || value === "chatgpt") return
    setPending(true)
    try {
      await selectAIProvider(value as AIProviderChoice)
      toast.add({ type: "success", title: `Replies now use ${items[value]}` })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't switch models",
        description: "Something went wrong. Try again.",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Card
      id="own-model"
      className="scroll-mt-6 rounded-2xl bg-muted/50 py-6 ring-0 [--card-spacing:1.5rem]"
    >
      <CardHeader>
        <CardTitle>Your own model</CardTitle>
        <CardDescription>
          Bring an API key from Anthropic, OpenAI, Google or OpenRouter and your
          bots reply with it. Those replies don&apos;t count against your AI
          allowance.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-2">
        {available ? (
          <>
            <Field>
              <FieldLabel htmlFor="ai-provider">Replies use</FieldLabel>
              <Select
                items={items}
                value={aiProvider}
                disabled={pending}
                onValueChange={(value) => void choose(String(value))}
              >
                <SelectTrigger id="ai-provider" className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(items).map(([value, label]) => (
                    <SelectItem
                      key={value}
                      value={value}
                      disabled={value === "chatgpt"}
                    >
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pending && (
                <FieldDescription role="status">Switching…</FieldDescription>
              )}
            </Field>
            {keys.length > 0 && (
              <ul className="flex flex-col gap-2">
                {keys.map((entry) => (
                  <KeyRow key={entry.provider} entry={entry} />
                ))}
              </ul>
            )}
            <KeyDialog keys={keys} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Saving your own API key isn&apos;t set up on this server yet.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
