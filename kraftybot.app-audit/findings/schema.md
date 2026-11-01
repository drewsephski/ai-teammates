# Schema audit: kraftybot.app (2026-10-27)

Score: 80/100. All JSON-LD is valid, server-rendered, uses https://schema.org, absolute URLs, ISO dates, a linked @graph, and nothing deprecated (no HowTo, SpecialAnnouncement, etc.).

## Detection (raw HTML, no JS render)
| Page | Blocks | Types |
|---|---|---|
| / | 1 (6.2 KB) | Organization, Person, WebSite, SoftwareApplication, Offer x2, UnitPriceSpecification, QuantitativeValue, WebPage, FAQPage (9 Q) |
| /how-it-works | 1 | WebPage + BreadcrumbList (2) |
| /use-cases | 1 | CollectionPage + BreadcrumbList (2) + ItemList (9) |
| /use-cases/sales-outbound | 1 | WebPage + BreadcrumbList (3: Home > Use cases > Sales Outbound) |
| /ai-agents-for-business | 1 | WebPage + BreadcrumbList + FAQPage (4 Q) |
| /manus-alternatives | 1 | WebPage + BreadcrumbList + FAQPage (3 Q) |
| /support | 0 | none |
| /privacy | 0 | none |

## Valid
- Homepage @graph links via @id: WebSite.publisher -> Organization, Organization.founder -> Person, WebPage.isPartOf -> WebSite, WebPage.about -> SoftwareApplication. Inner pages reuse #website and #app.
- SoftwareApplication has applicationCategory (BusinessApplication), operatingSystem (Web), offers, image, featureList.
- Offers match visible copy: Free = 0 USD; Pro = 20 USD per month (UnitPriceSpecification, MON). Matches the pricing section and FAQ text.
- Organization has logo (ImageObject 512x512), contactPoint, founder.
- BreadcrumbList is present on the nested use-case page and all content pages, with correct positions and absolute URLs.

## Issues
1. MEDIUM - Organization has no sameAs. Evidence: no sameAs key in the graph. Fix: add the real profile URLs (GitHub, X, LinkedIn, Product Hunt), only ones that exist.
2. MEDIUM - SoftwareApplication is not eligible for Google's software rich result: it has offers but no aggregateRating or review. Fix: add only when real, verifiable ratings exist. Don't invent them.
3. LOW - contactPoint.email is a personal Gmail (drewsepeczi@gmail.com) published in markup. Fix: use a role address on the domain (e.g. support@kraftybot.app) if one exists, plus availableLanguage. Not applicable if no such mailbox exists.
4. LOW - /support and /privacy have no JSON-LD and no BreadcrumbList. Fix: add WebPage (ContactPage for /support) with breadcrumb (below).
5. LOW - Offers lack `seller` and `priceValidUntil`; the Pro offer's top-level `price` and the priceSpecification duplicate each other (fine). The FOUNDING50 $8/month promo is not modeled (optional, acceptable).
6. LOW - Inner pages reference #website and #app by @id, but those nodes are only defined on the homepage. Valid for graph consumers that merge across pages; Google evaluates per page. Optional: repeat a minimal publisher reference.
7. LOW - dateModified is the same date on every page ("2026-10-26"); make sure it comes from real content changes, not the build date. No datePublished anywhere (optional).
8. INFO - FAQPage on /, /ai-agents-for-business, /manus-alternatives. Google retired FAQ rich results for all sites on 2026-05-07, so there is no SERP feature. Valid markup, harmless. No action required.
9. INFO - Homepage WebPage has no breadcrumb (appropriate for the root).

## Suggested JSON-LD

Organization additions (homepage; replace the placeholders with real URLs or omit):
```json
{
  "@type": "Organization",
  "@id": "https://kraftybot.app/#organization",
  "sameAs": ["https://github.com/<real-org>", "https://x.com/<real-handle>", "https://www.linkedin.com/company/<real-slug>"],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "support@<your-domain-mailbox>",
    "url": "https://kraftybot.app/support",
    "availableLanguage": "English"
  }
}
```

Offer seller (add inside both Offer objects): `"seller": {"@id": "https://kraftybot.app/#organization"}`

/support:
```json
{"@context":"https://schema.org","@graph":[{"@type":"ContactPage","@id":"https://kraftybot.app/support#page","url":"https://kraftybot.app/support","name":"Support · Krafty","isPartOf":{"@id":"https://kraftybot.app/#website"},"breadcrumb":{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://kraftybot.app/"},{"@type":"ListItem","position":2,"name":"Support","item":"https://kraftybot.app/support"}]}}]}
```

/privacy:
```json
{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"https://kraftybot.app/privacy#page","url":"https://kraftybot.app/privacy","name":"Privacy policy · Krafty","isPartOf":{"@id":"https://kraftybot.app/#website"},"breadcrumb":{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://kraftybot.app/"},{"@type":"ListItem","position":2,"name":"Privacy policy","item":"https://kraftybot.app/privacy"}]}}]}
```

Other nested use-case pages (/use-cases/<slug>, 8 more): not fetched; the sales-outbound pattern is data-driven, so they likely share it. Spot-check one.
