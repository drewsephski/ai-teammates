import Link from "next/link"

import page from "@/app/how-it-works/how-it-works.module.css"
import { helpContact } from "@/lib/marketing/help"
import { supportEmail } from "@/lib/marketing/site"
import help from "./help.module.css"

/** The way to reach a person, at the end of every help page. */
export function HelpContact() {
  const [before, after] = helpContact.body.split(supportEmail)
  return (
    <section
      id="contact"
      className={page.section}
      aria-labelledby="contact-title"
    >
      <h2 id="contact-title">{helpContact.title}</h2>
      <div className={help.contact}>
        <p>
          {before}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          {after}
        </p>
        <p>
          The <Link href="/support">support page</Link> has more on reporting a
          problem and on privacy.
        </p>
      </div>
    </section>
  )
}
