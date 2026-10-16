import { revalidatePath } from "next/cache"
import { apiRoute, readJson } from "@/lib/api"
import { emailDraftActionSchema } from "@/lib/email-draft"
import { actOnEmailDraft } from "@/services/approvals"

type Context = { params: Promise<{ approvalId: string }> }
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const input = emailDraftActionSchema.parse(await readJson(request))
    const result = await actOnEmailDraft(
      userId,
      (await params).approvalId,
      input
    )
    revalidatePath("/", "layout")
    return result
  }
)
