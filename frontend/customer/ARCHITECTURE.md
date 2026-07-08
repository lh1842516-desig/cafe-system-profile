# واجهة الزبون — React Customer App

Stack: React 19 + TypeScript + Vite + Zustand + Socket.io + CSS Modules

## التشغيل

```bash
cd frontend/customer
npm install
npm run dev      # تطوير على :5173 مع proxy للباكند
npm run build    # بناء إلى dist/ — يُخدم من /customer/
```

## الروابط

| المسار | الوصف |
|--------|--------|
| `/customer/10` | QR — طاولة 10 |
| `/customer/?table=10` | نفس الطاولة من query |
| `/customer/menu` | المنيو (بعد الدخول) |
| `/customer/order-status` | حالة الطلب |

## ربط الأدمن والواجهات الأخرى

| المصدر | حدث Socket (الباكند الفعلي) | التأثير في الزبون |
|--------|---------------------------|-------------------|
| الأدمن — إعدادات الكافي | `cafe-settings-updated` | اسم/شعار فوري |
| الأدمن — المنيو | `menu-updated` | تحديث التصنيفات والمنتجات |
| الكاشير — موافقة | `new-order` | حالة → انتظار تجهيز |
| الكاشير — رفض | `cashier-approval-rejected` | رسالة رفض |
| الكاشير — انتظار | `cashier-approval-pending` | حالة → بانتظار الكاشير |
| المطبخ | `kitchen-updated`, `order_ready` | تحديث الحالة |
| الكاشير — إغلاق فاتورة | `table_bill_closed` | العودة لصفحة الترحيب |
| طلب حساب | `bill-request-updated` | تفعيل cooldown |
| مستخدمو الطاولة | `table_users_updated` | قائمة المتصلين |
| إيموجي | `table_emoji_reaction` | أنيميشن طائر |

التعيين موجود في `src/services/socketService.ts`.

## هيكل المشروع

```
src/
  pages/          WelcomePage, MenuPage, OrderStatusPage
  components/     shared + menu/drawer (مدمجة في الصفحات حالياً)
  stores/         Zustand: session, cart, order, menu, cafe, table, lang
  hooks/          socket, session guard, translation, bill, table users
  services/       API + socket + ترجمة MyMemory
```

## ملاحظات

- الجلسة تُحفظ في `sessionStorage` (ليس localStorage).
- قاعدة الـ 60 ثانية: `useSessionGuard` + `useVisibilityTimer`.
- بعد `npm run build` أعد تشغيل السيرفر لخدمة `dist/`.
