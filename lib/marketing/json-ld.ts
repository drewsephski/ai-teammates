import { faqs } from "@/components/landing/bot/faq-data"
import { capabilities, definition } from "./content"
import type { MarketingFaq } from "./seo-pages"
import {
  brandName,
  marketingUpdated,
  productName,
  publicPlans,
  siteDescription,
  siteUrl,
  socialImage,
  tagline,
} from "./site"

const organizationId = `${siteUrl}/#organization`
const founderId = `${siteUrl}/#founder`

export function faqPageJsonLd(faqs: readonly MarketingFaq[], id: string) {
  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  }
}

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: brandName,
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/icon.png`,
          width: 512,
          height: 512,
        },
        description: definition,
        founder: { "@id": founderId },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "drewsepeczi@gmail.com",
          url: `${siteUrl}/support`,
          availableLanguage: "en",
        },
      },
      {
        "@type": "Person",
        "@id": founderId,
        name: "Drew Sepeczi",
        url: "https://drewsepeczi.xyz",
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: brandName,
        description: tagline,
        publisher: { "@id": organizationId },
        inLanguage: "en-US",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#app`,
        name: productName,
        alternateName: brandName,
        url: siteUrl,
        description: siteDescription,
        image: `${siteUrl}${socialImage.url}`,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "AI agents",
        // The iPhone app isn't in the App Store yet; add "iOS" when it is.
        operatingSystem: "Web",
        browserRequirements: "Requires a modern web browser",
        featureList: capabilities.map((capability) => capability.title),
        publisher: { "@id": organizationId },
        offers: publicPlans.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: plan.price,
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${siteUrl}/#pricing`,
          seller: { "@id": organizationId },
          ...(plan.period && {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: plan.price,
              priceCurrency: "USD",
              referenceQuantity: {
                "@type": "QuantitativeValue",
                value: 1,
                unitCode: "MON",
              },
            },
          }),
        })),
      },
      {
        "@type": "WebPage",
        "@id": `${siteUrl}/#webpage`,
        url: `${siteUrl}/`,
        name: "Krafty — AI teammates with memory, apps, and a cloud computer",
        description: definition,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#app` },
        dateModified: marketingUpdated,
        inLanguage: "en-US",
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faqs`,
        mainEntity: faqs.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  }
}
