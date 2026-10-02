import { useEffect, type ReactNode } from 'react'
import { SOURCE_LABEL } from '../data/foods'
import { displayKcal, type MealCalc } from '../engine/nutrition'
import type { Effort, Recipe, Source } from '../types'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function Certainty({ source }: { source: Source }) {
  return <span className={`tag tag-${source}`}>{SOURCE_LABEL[source]}</span>
}

export function Kcal({ calc, prefix = 'כ־' }: { calc: Pick<MealCalc, 'kcal' | 'complete'>; prefix?: string }) {
  return (
    <span className="kcal">
      {prefix}
      {displayKcal(calc.kcal)} קק״ל{!calc.complete && <span className="partial"> (חלקי)</span>}
    </span>
  )
}

export function proteinText(p: number | null) {
  return p == null ? 'חלבון: לא ידוע' : `חלבון: ${Math.round(p)} ג׳`
}

export const EFFORT_LABEL: Record<Effort, string> = {
  none: 'ללא הכנה',
  '5': 'עד 5 דקות',
  heat: 'חימום פשוט',
  '15': 'עד 15 דקות',
  '30': 'עד 30 דקות',
}

export function timeText(r: Recipe) {
  if (r.kind === 'outside') return 'קנייה בחוץ'
  return r.activeMinutes === r.totalMinutes ? `${r.totalMinutes} דק׳` : `${r.totalMinutes} דק׳ (${r.activeMinutes} עבודה)`
}

export function diffText(diff: number) {
  const d = Math.round(Math.abs(diff) / 10) * 10
  if (d === 0) return 'כמעט זהה'
  return diff < 0 ? `${d} פחות` : `${d} יותר`
}

export function multiplierText(m: number) {
  if (m === 1) return ''
  if (m === 1.5) return ' · מנה מוגדלת (×1.5)'
  if (m === 1.25) return ' · מנה גדולה מעט (×1.25)'
  if (m === 0.75) return ' · מנה קטנה (×0.75)'
  return ` · ×${m}`
}

/** כשרות של סניף שלא נבדקה מוצגת תמיד כ״לא אומתה״ (פרק 12) */
export function KosherUnverified() {
  return <span className="tag tag-kosher" title="כשרות נבדקת לפי סניף ומוצר. עד שתבדוק בסניף עצמו, היא לא מאומתת.">כשרות הסניף: לא אומתה</span>
}
