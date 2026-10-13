import { mkdir, writeFile } from 'node:fs/promises'
const assets = [
  ['cloud-agents-1.webp', 'https://media.x.ai/v1/website/cloud-agents-1-f6d00cf8.webp'],
  ['cloud-agents-2.webp', 'https://media.x.ai/v1/website/cloud-agents-2-a4798c0f.webp'],
  ['cloud-agents-3.webp', 'https://media.x.ai/v1/website/cloud-agents-3-5a23ca2f.webp'],
  ['cloud-agents-4.webp', 'https://media.x.ai/v1/website/cloud-agents-4-d2fe557a.webp'],
  ['display.woff2', 'https://x.ai/_next/static/media/XVF_Variable-s.p.2_a5y-slrzff6.woff2'],
]
await mkdir('public/landing/bot', { recursive: true })
for (let i = 0; i < assets.length; i += 4) {
  await Promise.all(assets.slice(i, i + 4).map(async ([name, url]) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status}`)
    await writeFile(`public/landing/bot/${name}`, Buffer.from(await response.arrayBuffer()))
    console.log(`Downloaded ${name}`)
  }))
}
