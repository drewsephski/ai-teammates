import type { MetadataRoute } from "next"

import { brandName, productName, siteDescription } from "@/lib/marketing/site"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: productName,
    short_name: brandName,
    description: siteDescription,
    start_url: "/workspace",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  }
}
