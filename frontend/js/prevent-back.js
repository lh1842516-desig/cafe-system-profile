/**
 * prevent-back.js
 * يمنع التنقل للخلف أو الأمام باستخدام أسهم المتصفح (← و →) في جميع صفحات النظام.
 * يحافظ على المستخدم داخل النظام ويمنع الخروج إلى محركات البحث مثل جوجل،
 * مع التنقل الطبيعي فقط عبر أزرار الواجهة (مثل زر الخروج والأزرار داخل الصفحة).
 */
(function preventBrowserNavigation() {
  try {
    if (typeof window === 'undefined' || !window.history || !window.history.pushState) return;

    // دفع حالة جديدة في سجل المتصفح لمنع الرجوع للخلف
    window.history.pushState(null, null, window.location.href);

    // عند ضغط المستخدم على سهم الرجوع أو التقدم في المتصفح، يتم إعادة تثبيت الصفحة الحالية
    window.addEventListener('popstate', function () {
      window.history.pushState(null, null, window.location.href);
    });
  } catch (_) {}
})();
