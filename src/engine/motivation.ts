import type { Profile } from '../types'

// מסרים מבוססי פעולה בלבד (פרק 16). בלי ״עצלן״, ״נכשלת״, ״חייב״ ובלי תגמול על חריגה.

type Situation = 'noEnergy' | 'deciding' | 'logged' | 'lowLogging' | 'start'

const LINES: Record<Situation, Record<Profile['tone'], string>> = {
  noEnergy: { calm: 'בוא נבחר משהו שכבר יש בבית.', practical: 'הנה האפשרות הקלה ביותר כרגע.', energetic: 'יאללה, משהו קל ומהיר!' },
  deciding: { calm: 'אפשר לבחור אחד מהשניים, שניהם מתאימים.', practical: 'שתי אפשרויות, בחירה אחת.', energetic: 'שתי אופציות טובות, בוחרים ויוצאים לדרך!' },
  logged: { calm: 'נרשם. הארוחה הבאה כבר מתוכננת.', practical: 'נרשם ביומן.', energetic: 'נרשם! הארוחה הבאה כבר מחכה.' },
  lowLogging: { calm: 'אפשר להמשיך מהארוחה הקרובה.', practical: 'רוצה לעדכן מה אכלת?', energetic: 'ממשיכים מהארוחה הבאה!' },
  start: { calm: 'ארוחה אחת בכל פעם.', practical: 'הארוחה הבאה מוכנה לבחירה.', energetic: 'בוא נתחיל עם הארוחה הבאה!' },
}

export function line(profile: Profile, s: Situation): string | null {
  if (!profile.motivationOn) return null
  return LINES[s][profile.tone]
}

/** הצלחות קטנות, רק כשיש להן נתונים */
export function smallWins(eatenCount: number, usedBackup: boolean): string | null {
  if (usedBackup) return 'השתמשת בגיבוי במקום להישאר בלי רעיון.'
  if (eatenCount >= 3) return 'תיעדת שלוש ארוחות היום.'
  if (eatenCount > 0) return `תיעדת ${eatenCount === 1 ? 'ארוחה אחת' : `${eatenCount} ארוחות`} היום.`
  return null
}

const BANNED = ['עצלן', 'נכשלת', 'חייב לסיים', 'תפסיד']
export function isSafeMessage(text: string): boolean {
  return !BANNED.some((b) => text.includes(b))
}
