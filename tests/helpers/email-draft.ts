export const emailTool = {
  slug: "GMAIL_SEND_EMAIL",
  toolkit: "gmail",
  description: "Send email",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      recipient_email: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
      cc: { type: "array", items: { type: "string" } },
      bcc: { type: "array", items: { type: "string" } },
      thread_id: { type: "string" },
      is_html: { type: "boolean" },
    },
    required: ["recipient_email", "subject", "body"],
  },
}
export const emailInput = {
  recipient_email: "ayesha@example.com",
  subject: "Re: Contract role",
  body: "Hi Ayesha,\n\nCould you share the rate and onsite expectations?\n\nThanks,\nDrew",
  thread_id: "thread_verified",
  is_html: false,
}
