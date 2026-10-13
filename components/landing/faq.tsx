"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import styles from "./landing.module.css"

const questions = [
  {
    question: "What can I actually do with Krafty?",
    answer:
      "Create AI teammates for research, code review, writing, learning, planning, or data analysis—or define your own role. Chat with them individually, bring them into a group, and ask them to use their computer to browse, run commands, and work with files.",
  },
  {
    question: "How is this different from a regular AI chat?",
    answer:
      "Each Krafty teammate has its own role, instructions, saved memory, and persistent cloud computer. You can see its desktop, keep work in its files, and bring multiple specialists into a conversation with handoffs.",
  },
  {
    question: "Do teammates remember everything?",
    answer:
      "Teammates can save notes to their memory and recall those notes across chats. Ask them to remember what matters. Saved memory is distinct from the conversation history; it does not mean every message is automatically remembered.",
  },
  {
    question: "Do I need a paid plan?",
    answer:
      "You can create an account and explore the workspace. Creating teammates and using their computers requires a paid plan. The plans page shows the available subscriptions, and the usage page tracks AI usage and active computer time for your billing period.",
  },
  {
    question: "Can I leave while a teammate is working?",
    answer:
      "Active chat tasks run independently of your browser, so closing a tab does not end the turn. Computer sessions pause when idle and resume when needed. Tasks remain subject to your usage allowance, step limits, and provider availability.",
  },
  {
    question: "Is Krafty open source?",
    answer:
      "Yes. You can inspect the source, customize roles and tools, and run your own instance. The repository includes setup instructions for authentication, billing, cloud computers, and background tasks.",
  },
]

export function LandingFaq() {
  return (
    <Accordion className={styles.questions}>
      {questions.map(({ question, answer }) => (
        <AccordionItem key={question} value={question}>
          <AccordionTrigger>{question}</AccordionTrigger>
          <AccordionContent>
            <p>{answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
