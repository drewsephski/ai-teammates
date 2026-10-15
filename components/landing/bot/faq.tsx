"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { faqs as questions } from "./faq-data"
import styles from "./faq.module.css"

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
