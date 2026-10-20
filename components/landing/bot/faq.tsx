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
    // hiddenUntilFound keeps closed answers in the HTML, so search engines,
    // AI crawlers and find-in-page read every answer the FAQPage data lists.
    <Accordion
      className={styles.questions}
      defaultValue={[questions[0][0]]}
      hiddenUntilFound
    >
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
