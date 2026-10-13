// Sidebar snippets are plain text; the stored conversation retains Markdown.
export function chatPreview(text: string) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.+?)(?:\1|$)/g, "$2")
    .replace(/`([^`]*)(?:`|$)/g, "$1")
    .replace(/(?<!\w)([*_])(?=\S)(.+?\S)\1(?!\w)/g, "$2")
    .replace(/^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+)/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}
