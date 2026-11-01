"use client"

import { useDeferredValue, useState } from "react"
import Link from "next/link"
import { ArrowRightIcon, SearchIcon } from "lucide-react"

import help from "./help.module.css"

type Topic = { href: string; title: string; summary: string }

/** Topic list with a filter box. Every topic is in the server HTML. */
export function HelpTopicSearch({ topics }: { topics: readonly Topic[] }) {
  const [query, setQuery] = useState("")
  const deferred = useDeferredValue(query.trim().toLowerCase())
  const matches = (topic: Topic) =>
    !deferred ||
    `${topic.title} ${topic.summary}`.toLowerCase().includes(deferred)
  const count = topics.filter(matches).length

  return (
    <div className={help.search}>
      <label className={help.searchField}>
        <SearchIcon size={18} aria-hidden />
        <span className={help.srOnly}>Search help topics</span>
        <input
          type="search"
          value={query}
          placeholder="Search help, like “routines” or “approval”"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p className={help.searchCount} role="status">
        {deferred
          ? count === 0
            ? "No topics match. Try another word, or write to us below."
            : `${count} of ${topics.length} topics`
          : `${topics.length} topics`}
      </p>
      <ul className={help.topics} aria-label="Help topics">
        {topics.map((topic) => (
          <li key={topic.href} hidden={!matches(topic)}>
            <Link href={topic.href} className={help.topic}>
              <span>
                <h2>{topic.title}</h2>
                <p>{topic.summary}</p>
              </span>
              <ArrowRightIcon size={18} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
