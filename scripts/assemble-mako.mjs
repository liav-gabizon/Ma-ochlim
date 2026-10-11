import { readFileSync, writeFileSync } from 'node:fs'
const files = [process.argv[2], process.argv[3]]
const labels = {
  'recipes_column-pasta':'פסטה','recipes_column-cakes':'עוגות ועוגיות','recipes_column-stuffed':'אורז וממולאים',
  'recipes_column-bread':'לחמים ומאפים','recipes_column-salads':'סלטים וירקות','recipes_column-desserts':'קינוחים',
  'recipes_column-chicken':'עוף','recipes_column-meat':'בשר','recipes_column-fish-seafood':'דגים ופירות ים',
  'recipes_column-vegetarian-recipes':'צמחוני','recipes_column-vegan-recipes':'טבעוני','recipes_column-healthy':'בריא',
  'recipes_column-30-minutes':'עד חצי שעה','recipes_column-soups':'מרקים','recipes_column-dairy_recipes':'חלבי',
  'recipes_column-asian_recipes':'אסייתי','recipes_column-sauces':'רטבים וממרחים','recipes_column-jams':'ריבות וחמוצים',
  'recipes_column-beverages':'משקאות','recipes_column-gluten-free':'ללא גלוטן',
}
const byId = new Map()
let raw = 0
for (const f of files) {
  const obj = JSON.parse(readFileSync(f, 'utf8'))
  for (const [cat, items] of Object.entries(obj)) {
    for (const it of items) {
      raw++
      const m = it.url.match(/Recipe-([0-9a-f]+)\.htm/i); if (!m) continue
      const id = m[1]
      if (!byId.has(id)) byId.set(id, { title: it.title.trim(), url: it.url, category: cat })
    }
  }
}
const all = [...byId.values()].filter(x => x.title && x.url)
all.sort((a,b)=> a.category===b.category ? a.title.localeCompare(b.title,'he') : (labels[a.category]||a.category).localeCompare(labels[b.category]||b.category,'he'))
const esc = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ')
const lines = all.map(x => `  { title: '${esc(x.title)}', url: '${esc(x.url)}', category: '${esc(x.category)}' },`).join('\n')
const labelLines = Object.entries(labels).map(([k,v])=>`  '${esc(k)}': '${esc(v)}',`).join('\n')
const out = `// קטלוג קישורים למתכונים באתר מאקו (mobile.mako.co.il/food-recipes), שם וקישור בלבד.
// נאסף מ-20 עמודי הקטגוריות ב-11 באוקטובר 2026 דרך דפדפן. בלי הוראות הכנה, תמונות או נתוני תזונה.
// זהו תצלום־רגע של המתכונים שהופיעו בראש כל קטגוריה; הארכיון המלא של מאקו גדול יותר ומתעדכן.
// כל פריט נפתח במאקו. אין קשר למנוע התכנון/הקלוריות — אלו קישורים חיצוניים בלבד.
export interface MakoLink { title: string; url: string; category: string }

export const MAKO_CATEGORY_LABELS: Record<string, string> = {
${labelLines}
}

export const MAKO_LINKS: MakoLink[] = [
${lines}
]
`
writeFileSync(process.argv[4], out)
console.log('raw items:', raw, '| unique recipes:', all.length, '| categories:', new Set(all.map(x=>x.category)).size)
