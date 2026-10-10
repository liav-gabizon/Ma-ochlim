# ערכת בדיקה מול Supabase האמיתי

מוכנה להרצה ברגע שהסביבה מורשית לפנות ל־`fjsgstkuvqmyrqzsvjef.supabase.co`. כל בקשה שה־proxy חוסם נזרקת כ־`ENV_BLOCKED` ולא נספרת כממצא.

1. בדיקת גישה: `curl -sS -o /dev/null -w '%{http_code}\n' https://fjsgstkuvqmyrqzsvjef.supabase.co/auth/v1/health` (401 מ־Supabase = פתוח; 403 עם `x-deny-reason` = עדיין חסום).
2. `TEST_EMAIL_BASE=<gmail של ליאב> node signup.mjs`: יוצר test1/test2 בכתובות הפלוס. סיסמאות אקראיות נשמרות רק ב־`~/.maochlim-test-creds.json` (600), לא בריפו ולא בתיקיית הפרויקט. **לעצור ולבקש מליאב לאשר את שני המיילים.**
3. בנייה של ה־Preview: `git worktree add ../build-27e7692 27e7692 && cd ../build-27e7692 && npm ci && npm run build && npx vite preview --port 4173`.
4. `node real-sync.mjs` (מחוץ לקונטיינר: `PLAYWRIGHT_MJS=<נתיב ל־playwright/index.mjs>`): אותם תרחישים כמו `../sync2.mjs`, שני דפדפנים עם test1, בלי שרת מדומה. מדפיס גרסה ומספר מתכונים בשורה של test1 לפני ואחרי.
5. `node isolation.mjs`: test2 ו־anon מול השורה של test1 (select/update/delete/insert), גם `push_subscriptions` ו־`notification_events`.
6. `node cleanup.mjs`: מוחק רק את השורות של test1/test2, כל אחד עם ה־JWT שלו. המשתמשים נשארים.
7. לעדכן את `docs/VERIFICATION.md` עם הפלטים (בלי כתובות מייל מלאות, סיסמאות או טוקנים).

קובץ הפרטים אבד (מחשב אחר)? `node reset-password.mjs` במסוף של ליאב: מייל איפוס לכל חשבון בדיקה, הדבקת הקישור במסוף, סיסמה אקראית חדשה נשמרת רק בקובץ המקומי.
