# منصة إدارة الكافيهات السحابية والمحلية (Cafe Management SaaS Platform)

منصة متكاملة لإدارة الكافيهات والمطاعم تعمل بأسلوبين: **سحابي Multi-Tenant SaaS** للعمل على الإنترنت وإدارة كافيهات متعددة، و**محلي Local LAN Mode** للعمل داخل شبكة الكافيه بدون إنترنت.

---

## 🌟 الميزات الرئيسية

- 🏢 **نظام SaaS متعدد الكافيهات (Multi-Tenant Architecture):**
  - عزْل كامل لبيانات كل كافيه (`cafeId`) على قاعدة بيانات سحابية متقدمة.
  - لوحة **Super Admin** مخصصة لإدارة الكافيهات، الاشتراكات (نشط / معطل / تجريبي)، والمستخدمين.
  
- 🔐 **إدارة الحسابات والأدوار (Role-Based Access Control):**
  - تشفير كلمات المرور باستخدام **Bcrypt** ومصادقة **JWT Tokens** محصّنة.
  - أدوار وظيفية: `SUPER_ADMIN` / `OWNER` / `ADMIN` / `CASHIER` / `KITCHEN` / `CAPTAIN`.

- 💵 **إغلاق القاصة والجلسات المالية (Till Sessions):**
  - ربط كافة الطلبات والإحصائيات والأرشيف بتاريخ **فتح القاصة** (وحتى للطلبات التي تُؤخذ بعد منتصف الليل).
  - تسجيل المصروفات والشحوبات وتقرير المبيعات والتقرير اليومي بنقرة واحدة.

- 📲 **الطلب عبر QR Code للزبائن (QR Customer Ordering):**
  - توليد تلقائي لرموز QR لكل طاولة.
  - واجهة زبون سريعة وتفاعلية مع متابعة حالة الطلب واستدعاء الويتر.

- 🖥️ **شاشة المطبخ المباشرة (Kitchen KDS Display):**
  - استقبال الطلبات في الوقت الفعلي عبر **Socket.io**.
  - إمكانية تفعيل نظام الموافقة المسبقة من الكاشير أو التوجيه المباشر للمطبخ.

- 📊 **الأرشيف والتقارير المالية:**
  - أرشيف سنوي/شهري/يومي للطلبات والأرباح، والأصناف الأكثر مبيعاً.

---

## 🛠️ التقنيات المستخدمة

- **Backend:** Node.js + Express.js
- **Database:** Supabase (PostgreSQL) السحابية + تخزين محلي طوارئ
- **Realtime Services:** Socket.io
- **Security:** Helmet, Express Rate Limit, JWT, Bcrypt
- **Frontend:** HTML5, CSS3, Modern JavaScript (Vanilla JS)
- **Deployment:** Railway / Docker Ready

---

## 🚀 التثبيت والتشغيل المحلي

1. **تثبيت الحزم:**
   ```bash
   cd backend
   npm install
   ```

2. **ضبط المتغيرات البيئية:**
   قم بإنشاء ملف `.env` بناءً على `.env.example` واضِف بيانات Supabase ومفتاح JWT.

3. **تشغيل الخادم:**
   ```bash
   npm start
   ```

4. **الوصول للواجهات:**
   - **الصفحة الرئيسية:** `http://localhost:3000/`
   - **تسجيل الدخول:** `http://localhost:3000/login`
   - **لوحة المنصة (SuperAdmin):** `http://localhost:3000/superadmin`
   - **الكاشير:** `http://localhost:3000/cashier`
   - **المطبخ:** `http://localhost:3000/kitchen`
   - **الكابتن:** `http://localhost:3000/captain`
   - **الأدمن:** `http://localhost:3000/admin`

---

## ☁️ الرفع على السيرفر والإنترنت (Railway Deployment)

المشروع مُجهز بالكامل للرفع المباشر على منصة **Railway** عبر `railway.json`:

1. اربط المستودع بـ GitHub وافعه باستخدام `git push origin main`.
2. ربط المستودع في Railway وإضافة متغيرات البيئة (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SAAS_JWT_SECRET`, `NODE_ENV=production`).
3. اضغط على **Generate Domain** للحصول على رابط سحابي آمن `https://`.
