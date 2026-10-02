import type { FoodItem } from '../types'

// מאגר בסיס. ערכי USDA מעוגלים לפי 100 גרם (נבדקו מול טבלת האנרגיה של USDA שבאיפיון, נספח ב).
// פריטי אוכל רחוב ומוצרים מוכנים מסומנים ״אומדן״ עד שיוזן נתון תווית או מסעדה מקומי.
// הערכת כשרות כאן היא סוג המזון (בשרי/חלבי/פרווה) בלבד, ולא אישור כשרות של מוצר או סניף.

const usda = 'USDA, נבדק 1.10.2026'

export const FOODS: FoodItem[] = [
  // לחמים ודגנים
  { id: 'bread', name: 'לחם לבן', aliases: ['לחם', 'פרוסה', 'פרוסות', 'טוסט'], kcal100: 239, protein100: 9, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'bread', units: [{ name: 'פרוסה', plural: 'פרוסות', grams: 28 }], pack: { grams: 750, label: 'כיכר' } },
  { id: 'pita', name: 'פיתה', aliases: ['פיתות'], kcal100: 275, protein100: 9.1, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'bread', units: [{ name: 'פיתה', plural: 'פיתות', grams: 90 }], pack: { grams: 450, label: 'חבילת 5 פיתות' } },
  { id: 'tortilla', name: 'טורטייה', aliases: ['טורטיה', 'טורטיות'], kcal100: 306, protein100: 8, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'bread', units: [{ name: 'טורטייה', plural: 'טורטיות', grams: 60 }], pack: { grams: 600, label: 'חבילת 10' } },
  { id: 'bagel', name: 'בייגל', kcal100: 257, protein100: 10, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten', 'sesame'], category: 'bread', units: [{ name: 'בייגל', grams: 100 }], pack: { grams: 400, label: 'חבילת 4' } },
  { id: 'baguette', name: 'בגט', aliases: ['באגט'], kcal100: 272, protein100: 10.8, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'bread', units: [{ name: 'בגט', grams: 250 }] },
  { id: 'lafa', name: 'לאפה', kcal100: 270, protein100: 8.5, state: 'ready', source: 'estimate', sourceNote: 'אומדן לפי לחם שטוח, 150 גרם ללאפה', kosher: 'parve', allergens: ['gluten'], category: 'bread', units: [{ name: 'לאפה', grams: 150 }] },
  { id: 'rice_cooked', name: 'אורז לבן מבושל', aliases: ['אורז'], kcal100: 130, protein100: 2.7, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'pantry', units: [{ name: 'כוס', plural: 'כוסות', grams: 158 }] },
  { id: 'rice_dry', name: 'אורז לבן יבש', kcal100: 365, protein100: 7.1, state: 'dry', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'pantry', pack: { grams: 1000, label: 'שקית 1 ק״ג' } },
  { id: 'pasta_dry', name: 'פסטה יבשה', aliases: ['פסטה'], kcal100: 371, protein100: 13, state: 'dry', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'pantry', pack: { grams: 500, label: 'חבילה 500 ג׳' } },
  { id: 'couscous_dry', name: 'קוסקוס יבש', kcal100: 376, protein100: 12.8, state: 'dry', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'pantry', pack: { grams: 500, label: 'חבילה 500 ג׳' } },
  { id: 'noodles_cooked', name: 'נודלס מבושלים', aliases: ['נודלס'], kcal100: 138, protein100: 4.5, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten', 'egg'], category: 'pantry' },
  { id: 'potato_baked', name: 'תפוח אדמה אפוי', aliases: ['תפוחי אדמה', 'תפוח אדמה'], kcal100: 93, protein100: 2.5, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'produce', pack: { grams: 1000, label: 'שקית 1 ק״ג' } },
  { id: 'cornflakes', name: 'קורנפלקס', kcal100: 357, protein100: 7.5, state: 'dry', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'pantry', pack: { grams: 750, label: 'קופסה 750 ג׳' } },
  { id: 'granola', name: 'גרנולה', kcal100: 471, protein100: 10, state: 'dry', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten', 'nuts'], category: 'pantry', pack: { grams: 500, label: 'שקית 500 ג׳' } },
  { id: 'crackers', name: 'קרקרים', kcal100: 421, protein100: 9, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'pantry', pack: { grams: 200, label: 'חבילה' } },

  // חלב וביצים
  { id: 'egg', name: 'ביצה', aliases: ['ביצים'], kcal100: 143, protein100: 12.6, state: 'raw', source: 'usda', sourceNote: usda + ' (לפני שמן)', kosher: 'parve', allergens: ['egg'], category: 'dairy', units: [{ name: 'ביצה', plural: 'ביצים', grams: 50 }], pack: { grams: 600, label: 'תבנית 12' } },
  { id: 'mozzarella', name: 'מוצרלה / גבינה צהובה', aliases: ['גבינה צהובה', 'מוצרלה', 'צהובה'], kcal100: 298, protein100: 22, state: 'ready', source: 'usda', sourceNote: usda + ' (מוצרלה מחלב מלא)', kosher: 'dairy', allergens: ['milk'], category: 'dairy', units: [{ name: 'פרוסה', plural: 'פרוסות', grams: 20 }], pack: { grams: 250, label: 'אריזה 250 ג׳' } },
  { id: 'cottage', name: 'קוטג׳ / גבינה לבנה', aliases: ['קוטג', 'קוטג׳', 'גבינה לבנה'], kcal100: 98, protein100: 11, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'dairy', allergens: ['milk'], category: 'dairy', units: [{ name: 'גביע', plural: 'גביעים', grams: 250 }], pack: { grams: 250, label: 'גביע' } },
  { id: 'bulgarian', name: 'גבינה בולגרית', aliases: ['בולגרית', 'פטה'], kcal100: 264, protein100: 14, state: 'ready', source: 'usda', sourceNote: usda + ' (פטה)', kosher: 'dairy', allergens: ['milk'], category: 'dairy', pack: { grams: 250, label: 'אריזה' } },
  { id: 'cream_cheese', name: 'גבינת שמנת', kcal100: 342, protein100: 6, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'dairy', allergens: ['milk'], category: 'dairy', pack: { grams: 200, label: 'גביע' } },
  { id: 'yogurt', name: 'יוגורט', aliases: ['יוגורטים'], kcal100: 61, protein100: 3.5, state: 'ready', source: 'usda', sourceNote: usda + ' (חלב מלא, טבעי)', kosher: 'dairy', allergens: ['milk'], category: 'dairy', units: [{ name: 'גביע', plural: 'גביעים', grams: 200 }], pack: { grams: 200, label: 'גביע' } },
  { id: 'milk', name: 'חלב 3%', aliases: ['חלב'], kcal100: 61, protein100: 3.2, state: 'liquid', source: 'usda', sourceNote: usda, kosher: 'dairy', allergens: ['milk'], category: 'dairy', units: [{ name: 'כוס', plural: 'כוסות', grams: 240 }], pack: { grams: 1000, label: 'קרטון 1 ל׳' } },
  { id: 'choco_drink', name: 'שוקו', kcal100: 83, protein100: 3.2, state: 'liquid', source: 'usda', sourceNote: usda, kosher: 'dairy', allergens: ['milk'], category: 'dairy', units: [{ name: 'שקית', plural: 'שקיות', grams: 250 }] },

  // בשר, עוף ודגים (משקל מבושל)
  { id: 'chicken_breast', name: 'חזה עוף מבושל', aliases: ['חזה עוף', 'עוף'], kcal100: 165, protein100: 31, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'meat', allergens: [], category: 'meat', pack: { grams: 500, label: 'מגש 500 ג׳ (נא)' } },
  { id: 'chicken_thigh', name: 'פרגית מבושלת', aliases: ['פרגית', 'פרגיות'], kcal100: 209, protein100: 26, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'meat', allergens: [], category: 'meat', pack: { grams: 500, label: 'מגש 500 ג׳ (נא)' } },
  { id: 'beef_ground', name: 'בקר טחון מבושל', aliases: ['בקר', 'המבורגר ביתי'], kcal100: 250, protein100: 26, state: 'cooked', source: 'usda', sourceNote: usda + ' (85% רזה)', kosher: 'meat', allergens: [], category: 'meat', pack: { grams: 500, label: 'אריזה 500 ג׳ (נא)' } },
  { id: 'salmon', name: 'סלמון אפוי', aliases: ['סלמון', 'דג'], kcal100: 206, protein100: 22, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['fish'], category: 'meat', pack: { grams: 400, label: 'נתח 400 ג׳ (נא)' } },
  { id: 'schnitzel_ready', name: 'שניצל מוכן', aliases: ['שניצל', 'שניצלים'], kcal100: 250, protein100: 15, state: 'ready', source: 'estimate', sourceNote: 'אומדן לשניצל עוף מצופה; להחליף בתווית המוצר שנקנה', kosher: 'meat', allergens: ['gluten', 'egg'], category: 'frozen', units: [{ name: 'שניצל', plural: 'שניצלים', grams: 100 }], pack: { grams: 700, label: 'אריזה קפואה 700 ג׳' } },
  { id: 'nuggets', name: 'נאגטס / שניצלונים', aliases: ['נאגטס', 'שניצלונים'], kcal100: 296, protein100: 15, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'meat', allergens: ['gluten'], category: 'frozen', units: [{ name: 'יחידה', plural: 'יחידות', grams: 18 }], pack: { grams: 500, label: 'אריזה קפואה' } },
  { id: 'shawarma_meat', name: 'בשר שווארמה', aliases: ['שווארמה', 'שוארמה'], kcal100: 220, protein100: 20, state: 'cooked', source: 'estimate', sourceNote: 'אומדן לשווארמת הודו/עוף כולל שומן צלייה', kosher: 'meat', allergens: [], category: 'meat' },
  { id: 'hotdog', name: 'נקניקייה', aliases: ['נקניקיה', 'נקניקיות'], kcal100: 290, protein100: 11, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'meat', allergens: [], category: 'meat', units: [{ name: 'נקניקייה', plural: 'נקניקיות', grams: 50 }] },
  { id: 'sausage_slices', name: 'נקניק פרוס', aliases: ['נקניק'], kcal100: 230, protein100: 13, state: 'ready', source: 'estimate', sourceNote: 'אומדן לנקניק פרוס', kosher: 'meat', allergens: [], category: 'meat' },

  // קטניות וממרחים
  { id: 'hummus', name: 'חומוס (ממרח)', aliases: ['חומוס'], kcal100: 166, protein100: 7.9, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['sesame'], category: 'spreads', units: [{ name: 'כף', plural: 'כפות', grams: 20 }], pack: { grams: 400, label: 'קופסה קטנה' } },
  { id: 'tahini', name: 'טחינה מוכנה', aliases: ['טחינה'], kcal100: 595, protein100: 17, state: 'ready', source: 'usda', sourceNote: usda + ' (גולמית; טחינה מדוללת קלה יותר)', kosher: 'parve', allergens: ['sesame'], category: 'spreads', units: [{ name: 'כף', plural: 'כפות', grams: 15 }] },
  { id: 'peanut_butter', name: 'חמאת בוטנים', kcal100: 588, protein100: 25, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['peanut'], category: 'spreads', units: [{ name: 'כף', plural: 'כפות', grams: 16 }], pack: { grams: 340, label: 'צנצנת' } },
  { id: 'jam', name: 'ריבה', kcal100: 278, protein100: 0.4, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'spreads', units: [{ name: 'כף', plural: 'כפות', grams: 20 }], pack: { grams: 340, label: 'צנצנת' } },
  { id: 'honey', name: 'דבש', kcal100: 304, protein100: 0.3, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'spreads', units: [{ name: 'כף', plural: 'כפות', grams: 21 }], pack: { grams: 350, label: 'צנצנת' } },
  { id: 'choc_spread', name: 'ממרח שוקולד', kcal100: 539, protein100: 6, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'dairy', allergens: ['milk', 'nuts'], category: 'spreads', units: [{ name: 'כף', plural: 'כפות', grams: 20 }], pack: { grams: 350, label: 'צנצנת' } },
  { id: 'tomato_sauce', name: 'רוטב עגבניות', aliases: ['רוטב'], kcal100: 50, protein100: 1.5, state: 'ready', source: 'usda', sourceNote: usda + ' (רוטב פסטה)', kosher: 'parve', allergens: [], category: 'spreads', pack: { grams: 680, label: 'צנצנת' } },
  { id: 'mayo', name: 'מיונז', kcal100: 680, protein100: 1, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['egg'], category: 'spreads', units: [{ name: 'כף', plural: 'כפות', grams: 14 }] },
  { id: 'olive_oil', name: 'שמן זית', aliases: ['שמן'], kcal100: 884, protein100: 0, state: 'liquid', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'pantry', units: [{ name: 'כף', plural: 'כפות', grams: 13.5 }], pack: { grams: 750, label: 'בקבוק' } },

  // ירקות ופירות
  { id: 'cucumber', name: 'מלפפון', aliases: ['מלפפונים'], kcal100: 15, protein100: 0.7, state: 'raw', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'produce', units: [{ name: 'מלפפון', plural: 'מלפפונים', grams: 100 }], pack: { grams: 100, label: 'יחידה' } },
  { id: 'tomato', name: 'עגבנייה', aliases: ['עגבניה', 'עגבניות'], kcal100: 18, protein100: 0.9, state: 'raw', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'produce', units: [{ name: 'עגבנייה', plural: 'עגבניות', grams: 120 }], pack: { grams: 120, label: 'יחידה' } },
  { id: 'pepper', name: 'פלפל', aliases: ['פלפלים'], kcal100: 31, protein100: 1, state: 'raw', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'produce', pack: { grams: 150, label: 'יחידה' } },
  { id: 'salad', name: 'ירקות לכריך / סלט', aliases: ['סלט', 'ירקות'], kcal100: 17, protein100: 0.9, state: 'raw', source: 'usda', sourceNote: usda + ' (תערובת ירקות)', kosher: 'parve', allergens: [], category: 'produce' },
  { id: 'eggplant_fried', name: 'חציל מטוגן', aliases: ['חציל'], kcal100: 250, protein100: 1.5, state: 'cooked', source: 'estimate', sourceNote: 'אומדן לחציל מטוגן בשמן', kosher: 'parve', allergens: [], category: 'produce' },
  { id: 'banana', name: 'בננה', aliases: ['בננות'], kcal100: 89, protein100: 1.1, state: 'raw', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'produce', units: [{ name: 'בננה', plural: 'בננות', grams: 118 }], pack: { grams: 118, label: 'יחידה' } },
  { id: 'apple', name: 'פרי עונתי', aliases: ['פרי', 'תפוח'], kcal100: 52, protein100: 0.3, state: 'raw', source: 'usda', sourceNote: usda + ' (תפוח)', kosher: 'parve', allergens: [], category: 'produce', units: [{ name: 'פרי', grams: 180 }], pack: { grams: 1000, label: 'ק״ג' } },
  { id: 'frozen_fruit', name: 'פירות קפואים', kcal100: 50, protein100: 0.7, state: 'raw', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'frozen', pack: { grams: 500, label: 'שקית 500 ג׳' } },
  { id: 'avocado', name: 'אבוקדו', kcal100: 160, protein100: 2, state: 'raw', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'produce', units: [{ name: 'אבוקדו', grams: 140 }], pack: { grams: 140, label: 'יחידה' } },

  // נשנושים ושתייה
  { id: 'nuts', name: 'אגוזים מעורבים', aliases: ['אגוזים', 'שקדים'], kcal100: 607, protein100: 20, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['nuts'], category: 'pantry', units: [{ name: 'חופן', plural: 'חופנים', grams: 30 }], pack: { grams: 200, label: 'שקית 200 ג׳' } },
  { id: 'dates', name: 'תמרים', aliases: ['תמר'], kcal100: 277, protein100: 1.8, state: 'ready', source: 'usda', sourceNote: usda + ' (מג׳הול)', kosher: 'parve', allergens: [], category: 'pantry', units: [{ name: 'תמר', plural: 'תמרים', grams: 24 }], pack: { grams: 500, label: 'קופסה' } },
  { id: 'chocolate', name: 'שוקולד', kcal100: 535, protein100: 7.7, state: 'ready', source: 'usda', sourceNote: usda + ' (חלב)', kosher: 'dairy', allergens: ['milk'], category: 'pantry', units: [{ name: 'קובייה', plural: 'קוביות', grams: 5 }], pack: { grams: 100, label: 'טבלה' } },
  { id: 'cookies', name: 'עוגיות', kcal100: 480, protein100: 5, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'pantry', units: [{ name: 'עוגייה', plural: 'עוגיות', grams: 12 }] },
  { id: 'cola', name: 'שתייה קלה (קולה)', aliases: ['קולה', 'שתייה קלה', 'פחית'], kcal100: 42, protein100: 0, state: 'liquid', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'drinks', units: [{ name: 'פחית', plural: 'פחיות', grams: 330 }, { name: 'כוס', plural: 'כוסות', grams: 250 }] },
  { id: 'juice', name: 'מיץ תפוזים', aliases: ['מיץ'], kcal100: 45, protein100: 0.7, state: 'liquid', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'drinks', units: [{ name: 'כוס', plural: 'כוסות', grams: 250 }] },
  { id: 'water', name: 'מים / סודה', aliases: ['מים', 'סודה'], kcal100: 0, protein100: 0, state: 'liquid', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: [], category: 'drinks', units: [{ name: 'כוס', plural: 'כוסות', grams: 250 }] },

  // אוכל רחוב: רכיבים מוערכים
  { id: 'falafel', name: 'כדור פלאפל', aliases: ['פלאפל', 'כדורי פלאפל'], kcal100: 333, protein100: 13, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['sesame'], category: 'pantry', units: [{ name: 'כדור', plural: 'כדורים', grams: 17 }] },
  { id: 'fries', name: 'צ׳יפס', aliases: ['ציפס', 'צ׳יפס', 'צ\'יפס'], kcal100: 312, protein100: 3.4, state: 'cooked', source: 'usda', sourceNote: usda + ' (מזון מהיר)', kosher: 'parve', allergens: [], category: 'frozen', units: [{ name: 'מנה בינונית', grams: 117 }] },
  { id: 'onion_rings', name: 'טבעות בצל', kcal100: 411, protein100: 4.5, state: 'cooked', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'frozen' },
  { id: 'pizza_slice', name: 'משולש פיצה', aliases: ['פיצה', 'משולש', 'משולשים'], kcal100: 266, protein100: 11, state: 'ready', source: 'usda', sourceNote: usda + ' (פיצה גבינה, בצק רגיל). להחליף בנתון הפיצרייה', kosher: 'dairy', allergens: ['gluten', 'milk'], category: 'frozen', units: [{ name: 'משולש', plural: 'משולשים', grams: 107 }] },
  { id: 'burger_sandwich', name: 'המבורגר בלחמנייה', aliases: ['המבורגר', 'בורגר'], kcal100: 245, protein100: 13, state: 'ready', source: 'estimate', sourceNote: 'אומדן כללי; לא נתון של רשת מסוימת בישראל', kosher: 'meat', allergens: ['gluten', 'sesame'], category: 'meat', units: [{ name: 'המבורגר', grams: 230 }] },
  { id: 'bun', name: 'לחמנייה', aliases: ['לחמניה', 'לחמניות', 'חלה'], kcal100: 280, protein100: 9, state: 'ready', source: 'usda', sourceNote: usda, kosher: 'parve', allergens: ['gluten'], category: 'bread', units: [{ name: 'לחמנייה', plural: 'לחמניות', grams: 70 }], pack: { grams: 420, label: 'חבילת 6' } },
  { id: 'ravioli', name: 'רביולי גבינה', aliases: ['רביולי', 'ניוקי'], kcal100: 270, protein100: 11, state: 'ready', source: 'estimate', sourceNote: 'אומדן למוצר קפוא; להחליף בתווית', kosher: 'dairy', allergens: ['gluten', 'milk', 'egg'], category: 'frozen', pack: { grams: 500, label: 'אריזה 500 ג׳' } },
  { id: 'bourekas', name: 'בורקס', aliases: ['בורקס גבינה'], kcal100: 350, protein100: 9, state: 'ready', source: 'estimate', sourceNote: 'אומדן לבורקס בצק עלים', kosher: 'dairy', allergens: ['gluten', 'milk'], category: 'frozen', units: [{ name: 'בורקס', grams: 125 }] },
  { id: 'sushi', name: 'סושי (רול דג/ירקות)', aliases: ['סושי', 'רול'], kcal100: 150, protein100: 5.5, state: 'ready', source: 'estimate', sourceNote: 'אומדן לרולים ללא פירות ים', kosher: 'parve', allergens: ['fish', 'soy', 'sesame'], category: 'meat', units: [{ name: 'יחידה', plural: 'יחידות', grams: 28 }] },
  { id: 'stirfry_sauce', name: 'רוטב מוקפץ', kcal100: 120, protein100: 2, state: 'ready', source: 'estimate', sourceNote: 'אומדן לרוטב סויה-טריאקי', kosher: 'parve', allergens: ['soy', 'gluten'], category: 'spreads' },
]

export const FOOD_BY_ID: Record<string, FoodItem> = Object.fromEntries(FOODS.map((f) => [f.id, f]))

export const CATEGORY_LABEL: Record<FoodItem['category'], string> = {
  produce: 'ירקות ופירות',
  bread: 'לחמים',
  dairy: 'חלב וביצים',
  meat: 'בשר ודגים',
  frozen: 'קפואים',
  pantry: 'מזווה',
  spreads: 'ממרחים ורטבים',
  drinks: 'שתייה ונשנושים',
}

export const SOURCE_LABEL: Record<FoodItem['source'], string> = {
  label: 'לפי תווית',
  restaurant: 'לפי המסעדה',
  usda: 'לפי מאגר USDA',
  recipe: 'לפי מתכון',
  estimate: 'אומדן',
}
