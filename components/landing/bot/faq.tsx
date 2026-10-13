"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import styles from "./faq.module.css"

const questions = [
  [
    "How is Krafty Bot different from AI assistants?",
    "Bots have their own computer, so they can work inside your apps and tools. They also run in parallel, even when your browser is closed.",
  ],
  [
    "Who is Krafty Bot available for today?",
    "Anyone can create an account and explore Krafty. Creating teammates and using their computers requires a paid plan. See the available plans in your workspace.",
  ],
  [
    "Where do I talk to Krafty Bot?",
    "Open Krafty in your browser on your desktop or phone. Your workspace brings individual chats, group conversations, and your teammates together.",
  ],
  [
    "How much does Krafty Bot cost?",
    "The plans page shows the available subscriptions. Your usage page tracks AI usage and active computer time for your billing period.",
  ],
  [
    "Do Bots share one computer?",
    "Each Krafty Bot has its own persistent cloud computer. Its files, memory, and applications survive when the computer pauses. Bots can collaborate through shared conversations and handoffs.",
  ],
  [
    "Can Bots keep working when I close my browser?",
    "Active chat tasks run independently of your browser. Computers pause when idle and resume when needed. Tasks are subject to your usage allowance, step limits, and provider availability.",
  ],
  [
    "Do Bots remember everything?",
    "Bots can save notes to their memory and recall them across chats. Ask them to remember what matters. Saved memory is separate from conversation history; every message is not automatically remembered.",
  ],
] as const

export function BotFaq() {
  return (
    <Accordion className={styles.questions} defaultValue={[questions[0][0]]}>
      {questions.map(([question, answer]) => (
        <AccordionItem key={question} value={question} className={styles.item}>
          <AccordionTrigger className={styles.trigger}>
            {question}
          </AccordionTrigger>
          <AccordionContent className={styles.answer}>
            <p>{answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
