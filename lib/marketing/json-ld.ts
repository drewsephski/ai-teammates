import { faqs } from "@/components/landing/bot/faq-data"
import {
  brandName,
  productName,
  publicPlans,
  siteDescription,
  siteUrl,
  socialImage,
  tagline,
} from "./site"

const organizationId = `${siteUrl}/#organization`

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: brandName,
        url: siteUrl,
        logo: `${siteUrl}/icon.png`,
        email: "drewsepeczi@gmail.com",
        founder: {
          "@type": "Person",
          name: "Drew Sepeczi",
          url: "https://drewsepeczi.xyz",
        },
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
        operatingSystem: "Web",
        publisher: { "@id": organizationId },
        offers: publicPlans.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: plan.price,
          priceCurrency: "USD",
          url: `${siteUrl}/#pricing`,
          ...(plan.period && {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: plan.price,
              priceCurrency: "USD",
              unitCode: "MON",
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
