# Do'kon hisobi (GitHub Pages + Supabase)

Sayt GitHub Pages'da, ma'lumotlar Supabase bulutida saqlanadi. Login bor, telefon va kompyuter orasida ma'lumot bir xil bo'ladi.

## 1-qadam. Supabase loyihasi (bepul)
1. https://supabase.com ga kiring → **New project** (nom va parol kiriting, region: yaqinrog'ini tanlang).
2. Loyiha tayyor bo'lgach: **SQL Editor → New query** → `supabase_schema.sql` faylidagi kodni to'liq qo'yib **Run** bosing.
3. **Authentication → Sign In / Providers → Email** bo'limida **Confirm email** ni o'chiring (aks holda har bir ro'yxatdan o'tishda pochta tasdig'i kerak bo'ladi).

## 2-qadam. Kalitlarni qo'yish
**Project Settings → API** dan oling:
- **Project URL**
- **anon public** (yoki **publishable**) kalit

`config.js` faylini oching va ikkala qiymatni qo'ying. `service_role` kalitini HECH QACHON qo'ymang.

## 3-qadam. GitHub'ga joylash
1. GitHub'da yangi repository oching, barcha fayllarni yuklang (`pages.yml` ni `.github/workflows/pages.yml` yo'liga qo'ying).
2. **Settings → Pages → Source: GitHub Actions**.
3. `main` branch'ga push qiling. 1–2 daqiqadan keyin sayt `https://USERNAME.github.io/REPO-NOMI/` da ochiladi.
4. **Supabase → Authentication → URL Configuration → Site URL** ga shu manzilni yozing.

## 4-qadam. Birinchi kirish
Saytni oching → email va parol bilan **Ro'yxatdan o'tish**. Keyin xuddi shu email/parol bilan boshqa qurilmadan **Kirish** qilsangiz, ma'lumot o'sha yerda ham bo'ladi.

Xavfsizlik uchun o'z akkauntingizni yaratgach: **Authentication → Sign In / Providers → "Allow new users to sign up"** ni o'chiring. Shunda begona odam ro'yxatdan o'ta olmaydi.

## Qanday ishlaydi
- Har bir o'zgarish ~2 soniyada serverga yuboriladi. Chap yuqoridagi kichik belgi holatni ko'rsatadi (☁ saqlangan, ⏳ yuborilmoqda, ⚠ aloqa yo'q, 🔔 boshqa qurilmada yangilik bor). Belgini bossangiz: sinxronlash va **Chiqish**.
- Internet yo'q bo'lsa, dastur ishlayveradi, ma'lumot qurilmada turadi va aloqa tiklanganda yuboriladi.
- Ikki qurilmada bir vaqtda o'zgartirilsa, dastur qaysi nusxa qolishini so'raydi.
- Bir akkauntni bir nechta xodim ishlatsa, ular bir vaqtda sotuvda ishlamagani yaxshi: oxirgi saqlagan nusxa yutadi.
- `config.js` bo'sh bo'lsa, sayt avvalgidek (faqat shu brauzerda) ishlaydi.
- Baribir ilovadagi **Zaxira** funksiyasidan vaqti-vaqti bilan nusxa oling.

## Fayllar
`index.html` (ilova), `config.js` (kalitlar), `sync.js` (login + bulut), `supabase_schema.sql` (baza), `pwa.js`, `sw.js`, `manifest.webmanifest`, `icon-*.png`, `favicon.ico` (telefonga o'rnatish va oflayn), `404.html`, `robots.txt`, `.github/workflows/pages.yml` (avtomatik joylash).
