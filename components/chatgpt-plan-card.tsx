"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"

import {
  disconnectChatGPTPlan,
  listChatGPTModels,
  saveChatGPTPreference,
} from "@/actions/chatgpt"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { chatgptPreferenceSchema, type ChatGPTPreference } from "@/db/schema"
import type { ChatGPTStatus } from "@/lib/chatgpt-connection"
import type { ChatGPTModelChoice } from "@/lib/chatgpt-model"

function ChatGPTPreferences({ status }: { status: ChatGPTStatus }) {
  const router = useRouter()
  const [models, setModels] = useState<ChatGPTModelChoice[]>([])
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const form = useForm<ChatGPTPreference>({
    resolver: zodResolver(chatgptPreferenceSchema),
    defaultValues: { enabled: status.enabled, model: status.model },
  })
  const busy = form.formState.isSubmitting || disconnecting || loading

  async function loadModels() {
    setLoading(true)
    try {
      setModels(await listChatGPTModels())
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn’t load ChatGPT models",
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    try {
      const result = await disconnectChatGPTPlan()
      toast.add({
        type: result.revoked ? "success" : "warning",
        title: "ChatGPT plan disconnected",
        description: result.revoked
          ? "New replies will use Krafty AI. You can still sign in with ChatGPT."
          : "Access was removed from Krafty. Remote revocation wasn’t confirmed; also disconnect Krafty in ChatGPT settings.",
      })
      router.refresh()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn’t disconnect ChatGPT",
        description: "Please try again.",
      })
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        try {
          const saved = await saveChatGPTPreference(values)
          form.reset({ enabled: saved.enabled, model: saved.model })
          toast.add({
            type: "success",
            title: saved.enabled
              ? "Using your ChatGPT plan"
              : "Using Krafty AI",
            description:
              "Your AI preference is saved. A reply already streaming may finish.",
          })
          router.refresh()
        } catch (error) {
          toast.add({
            type: "error",
            title: "Couldn’t save your AI preference",
            description:
              error instanceof Error ? error.message : "Please try again.",
          })
        }
      })}
    >
      <FieldGroup>
        <Controller
          name="enabled"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <div className="flex-1">
                <FieldLabel htmlFor="chatgpt-enabled">
                  Use my ChatGPT plan
                </FieldLabel>
                <FieldDescription>
                  Turn off to use Krafty’s included AI allowance.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </div>
              <Switch
                id="chatgpt-enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-invalid={fieldState.invalid}
                disabled={busy}
              />
            </Field>
          )}
        />
        <Controller
          name="model"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="chatgpt-model">ChatGPT model</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  id="chatgpt-model"
                  ref={field.ref}
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(event.target.value || null)
                  }
                  aria-invalid={fieldState.invalid}
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  <NativeSelectOption value="">Automatic</NativeSelectOption>
                  {status.model &&
                    !models.some((model) => model.id === status.model) && (
                      <NativeSelectOption value={status.model}>
                        {status.model}
                      </NativeSelectOption>
                    )}
                  {models.map((model) => (
                    <NativeSelectOption key={model.id} value={model.id}>
                      {model.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={loadModels}
                >
                  {loading && <Spinner data-icon="inline-start" />}Refresh
                  models
                </Button>
              </div>
              <FieldDescription>
                Automatic uses the first model offered by your ChatGPT account.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !form.formState.isDirty}>
            {form.formState.isSubmitting && (
              <Spinner data-icon="inline-start" />
            )}
            Save preference
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={disconnect}
          >
            {disconnecting && <Spinner data-icon="inline-start" />}Disconnect
            plan
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

export function ChatGPTPlanCard({
  status,
  compact = false,
}: {
  status: ChatGPTStatus
  compact?: boolean
}) {
  return (
    <Card
      id="chatgpt-plan"
      className="scroll-mt-6 rounded-2xl bg-muted/50 py-6 ring-0 [--card-spacing:1.5rem]"
    >
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          ChatGPT plan
          <span className="text-xs font-normal text-muted-foreground">
            {status.enabled
              ? "Selected for replies"
              : status.connected
                ? "Account linked"
                : "Optional"}
          </span>
        </CardTitle>
        <CardDescription>
          Use your eligible ChatGPT subscription for replies.
          Subscription-backed model usage does not count toward your Krafty AI
          allowance.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-2">
        {status.connected && (
          <p className="text-sm break-all">
            {status.email ?? status.name ?? "ChatGPT account linked"}
          </p>
        )}
        {status.needsReconnect && (
          <p role="status" className="text-sm text-destructive">
            Reconnect ChatGPT to renew access. Krafty AI will not be used
            automatically.
          </p>
        )}
        {!status.available ? (
          <>
            <p className="text-sm text-muted-foreground">
              ChatGPT connections are currently unavailable.{" "}
              {status.enabled
                ? "Reconnect when available, or switch to Krafty AI below."
                : "Your current sign-in and AI allowance remain available."}
            </p>
            {status.enabled && !compact && (
              <ChatGPTPreferences status={status} />
            )}
          </>
        ) : compact ? (
          <Link
            href="/usage#chatgpt-plan"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Manage ChatGPT plan <ArrowUpRightIcon />
          </Link>
        ) : (
          <>
            {(status.authorized || status.enabled) && (
              <ChatGPTPreferences
                key={`${status.enabled}:${status.model}:${status.authorized}`}
                status={status}
              />
            )}
            <a
              href="/api/chatgpt/start?intent=connect"
              className={buttonVariants({
                variant: "outline",
                className: "self-start",
              })}
            >
              {status.connected ? "Reconnect ChatGPT" : "Continue with ChatGPT"}
            </a>
            {!status.planAvailable && (
              <p className="text-sm text-muted-foreground">
                Account sign-in is available. ChatGPT subscription usage is not
                available for Krafty yet.
              </p>
            )}
            {status.planAvailable && status.connected && !status.authorized && (
              <p className="text-sm text-muted-foreground">
                Reconnect and allow ChatGPT plan usage to power replies with
                your subscription.
              </p>
            )}
          </>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          ChatGPT’s own limits apply. Web searches use Krafty’s AI allowance;
          cloud computers and connected apps follow your Krafty plan. Connecting
          does not give Krafty access to your ChatGPT conversations or memories.
        </p>
        {status.connected && (
          <a
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 self-start text-sm underline underline-offset-4"
          >
            Manage usage in ChatGPT <ArrowUpRightIcon className="size-3.5" />
          </a>
        )}
      </CardContent>
    </Card>
  )
}
