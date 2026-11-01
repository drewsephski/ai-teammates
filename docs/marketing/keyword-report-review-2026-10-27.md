# Keyword report review — October 27, 2026

Source: https://app.openseo.so/s/qCWDcipktXgpP2XWkJTxIV21c7lknkOU

Reviewed against the current working tree, including existing concurrent changes. Keyword volumes and difficulty are estimates from the report, not independently rerun research or evidence of conversion.

- **Email assistant: implement.** No dedicated route existed. Added `/use-cases/email-assistant` with a bounded Gmail starter prompt, a manual review workflow, separate chat-draft / Gmail-draft / send states, approval requirements, plan limits, and realistic failure cases. Uses the shared server-rendered marketing page, metadata, and structured data. Registration in `marketingSeoPages` also adds sitemap, footer, and llms discovery. The business page links to it contextually.
- **Business agents: retain and link.** The existing page already covers concrete jobs, costs, access, approval boundaries, and buyer evaluation questions. Added the Gmail workflow to the jobs section; another overlapping business article is not justified yet.
- **Executive assistant: improve the existing route.** Updated the chief-of-staff headline and summary to name the search intent. Existing copy already includes meeting preparation, calendar context, inbox drafts, first-run steps, examples labeled as fictional, and FAQs. Keep its established URL.
- **Manus alternatives: retain existing correction.** Concurrent edits already count four separate alternatives and place Manus Desktop outside that count. The page has dated vendor source links and evaluation criteria. This review did not independently revalidate vendor claims; it adds no new comparative claims, prices, or scores. An authentic recorded task demonstration remains outstanding.
- **Personal assistant hub / small-business best-of list: defer.** Validate distinct search intent and collect useful product evidence before adding pages that overlap the existing business and chief-of-staff content. Low estimated difficulty alone does not justify another page.

The Gmail walkthrough is instructional copy, not proof of a live run. No live mailbox actions, model calls, signup analytics setup, indexing requests, or deployment are part of this implementation. The new page needs deployment before indexing can be checked. Search Console and conversion measurement remain follow-up work; this review does not claim current traffic or conversions.

The process on local port 3000 belongs to another project (`higgsfield-affiliate`), so its 404s are not evidence about Krafty. It was left untouched. Rendered Krafty UI verification requires its own available dev server.
