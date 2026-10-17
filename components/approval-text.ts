// Wording for approvals, kept pure so the cards and their tests share it.

// "NOTION_UPDATE_PAGE" -> "Notion: update page". The first word is the app,
// the rest is the action. A slug with one word is shown as it is.
export function humanizeToolSlug(slug: string) {
  const [app, ...rest] = slug.trim().toLowerCase().split("_").filter(Boolean)
  if (!app) return slug
  const name = app.charAt(0).toUpperCase() + app.slice(1)
  return rest.length ? `${name}: ${rest.join(" ")}` : name
}

const actionLabels: Record<string, string> = {
  submit: "Submit",
  post: "Post",
  send: "Send",
  delete: "Delete",
  buy: "Buy",
}

// The kind of step a computer approval holds. Unknown actions get no label.
export function approvalActionLabel(action?: string | null) {
  return action ? actionLabels[action] : undefined
}

// The server's screenshot is a data URL. Anything else is not drawn.
export function approvalPreviewSrc(preview?: string | null) {
  if (!preview) return undefined
  return /^data:image\/(png|jpeg|webp);base64,/.test(preview)
    ? preview
    : undefined
}
