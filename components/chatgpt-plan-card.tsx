import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function ChatGPTPlanCard() {
  return (
    <Card
      id="chatgpt-plan"
      className="scroll-mt-6 rounded-2xl bg-muted/50 py-6 ring-0 [--card-spacing:1.5rem]"
    >
      <CardHeader>
        <CardTitle>ChatGPT</CardTitle>
        <CardDescription>ChatGPT auth coming soon.</CardDescription>
      </CardHeader>
    </Card>
  )
}
