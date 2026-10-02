# מה אוכלים

כתובת: https://ma-ochlim-one.vercel.app (נפרס אוטומטית מ־main ב־Vercel)

אפליקציית אכילה אישית לליאב, לפי `meal-app-spec.html` (גרסה 1.0).

## הרצה
```
npm install
npm run dev        # פיתוח
npm test           # בדיקות מנוע (35)
npm run build      # PWA ל־dist/
```

## החלטות שנבחרו כברירת מחדל
- פלטפורמה: PWA (React + TypeScript + Vite), מותאם לאייפון ומותקן למסך הבית.
- אחסון: מקומי במכשיר (localStorage), ועם חשבון גם גיבוי וסנכרון ב־Supabase (פרויקט ma-ochlim). תזכורות נשלחות מהשרת ב־Web Push.
- מנוע קלוריות דטרמיניסטי; פענוח טקסט חופשי בלי AI.

## מה אומת ומה לא
ראו `docs/VERIFICATION.md`.
