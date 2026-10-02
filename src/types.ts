// מודל הנתונים של האפליקציה (פרק 21 באיפיון), בגרסה מקומית לפיילוט.

export type Source = 'label' | 'restaurant' | 'usda' | 'recipe' | 'estimate'
export type KosherClass = 'meat' | 'dairy' | 'parve'
export type Allergen = 'gluten' | 'milk' | 'egg' | 'peanut' | 'nuts' | 'sesame' | 'fish' | 'soy'
export type ShopCategory =
  | 'produce'
  | 'bread'
  | 'dairy'
  | 'meat'
  | 'frozen'
  | 'pantry'
  | 'spreads'
  | 'drinks'

export interface FoodUnit {
  name: string // יחיד, למשל ״ביצה״
  plural?: string
  grams: number
}

export interface FoodItem {
  id: string
  name: string
  aliases?: string[]
  /** null = ערך לא ידוע. לעולם לא מציגים אפס במקום נתון חסר. */
  kcal100: number | null
  protein100: number | null
  state: 'raw' | 'dry' | 'cooked' | 'ready' | 'liquid'
  source: Source
  sourceNote?: string
  kosher: KosherClass
  allergens: Allergen[]
  category: ShopCategory
  units?: FoodUnit[]
  /** גודל אריזה לקנייה, בגרמים או מ״ל */
  pack?: { grams: number; label: string }
}

export interface MealItem {
  foodId: string
  grams: number
  optional?: boolean // תוספת שהמשתמש יכול להוריד (צ׳יפס, שתייה)
}

export type MealKind = 'home' | 'outside'
export type Effort = 'none' | '5' | 'heat' | '15' | '30'

export interface Recipe {
  id: string
  name: string
  kind: MealKind
  items: MealItem[]
  effort: Effort
  totalMinutes: number
  activeMinutes: number
  backup?: boolean
  /** בחירה לאיזו ארוחה ביום זה מתאים */
  slots: SlotId[]
  note?: string
  /** מתכונים שהמשתמש יצר מטקסט חופשי */
  custom?: boolean
}

export type SlotId = 'morning' | 'outside' | 'evening'
export const SLOTS: SlotId[] = ['morning', 'outside', 'evening']

export type SlotStatus = 'planned' | 'cooking' | 'eaten' | 'partial' | 'swapped' | 'skipped'

export interface PlannedMeal {
  date: string // YYYY-MM-DD מקומי
  slot: SlotId
  recipeId: string
  multiplier: number
  status: SlotStatus
  logId?: string
}

export type Pref = 'love' | 'try' | 'dislike' | 'unknown'

export interface Profile {
  name: string
  goal: 'regular' | 'gain' | 'maintain' | 'other'
  timezone: string
  slotTargets: Record<SlotId, number>
  mealTimes: Record<SlotId, string> // HH:MM
  allergies: 'unanswered' | 'none' | Allergen[]
  meatDairyWaitHours: number | null
  tone: 'calm' | 'practical' | 'energetic'
  motivationOn: boolean
  personalLine: string
  showWeightOnHome: boolean
  heightCm: number | null
  weightGoalKg: number | null
}

export interface GoalVersion {
  kcal: number
  effectiveFrom: string // YYYY-MM-DD
  setAt: string // ISO
}

export interface LogItemSnapshot {
  name: string
  grams: number
  kcal: number | null
  protein: number | null
  source: Source
}

export interface LogEntry {
  id: string
  idemKey: string
  localDate: string
  timezone: string
  eatenAt: string // ISO
  loggedAt: string // ISO
  title: string
  slot?: SlotId
  items: LogItemSnapshot[]
  /** חלק מהמנה שנאכל, 1 = כולה */
  portion: number
  version: number
  deleted?: boolean
}

export interface WeightEntry {
  id: string
  date: string
  kg: number
}

export interface NotificationSettings {
  enabled: boolean
  timesConfirmed: boolean
  quietStart: string
  quietEnd: string
  dailyCap: number
  followUp: boolean
  snoozeMinutes: number
  genericLockText: boolean
  /** תזכורות נשלחות מהשרת ב־Web Push (גם כשהאייפון נעול) */
  serverPush?: boolean
}

export interface SentNotification {
  key: string // מזהה ייחודי: תאריך+משבצת+גרסת ארוחה
  at: string
}

export interface ShoppingLine {
  foodId: string
  name: string
  category: ShopCategory
  neededGrams: number
  packs: number
  packLabel: string
}

export interface ShoppingState {
  confirmed: ShoppingLine[] | null
  confirmedAt: string | null
  bought: Record<string, boolean>
}

export interface AppState {
  schema: 1
  profile: Profile
  goals: GoalVersion[]
  prefs: Record<string, Pref> // foodId או recipeId
  rejections: Record<string, number>
  alwaysGood: string[]
  customRecipes: Recipe[]
  plan: PlannedMeal[]
  log: LogEntry[]
  dayComplete: Record<string, boolean>
  pantry: Record<string, boolean>
  shopping: ShoppingState
  weights: WeightEntry[]
  notifications: NotificationSettings
  sent: SentNotification[]
  snoozed: Record<string, string> // slotKey -> ISO
  ideas: string[] // ״בא לי״ שנשמרו לתכנון
}
