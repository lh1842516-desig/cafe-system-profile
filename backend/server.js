/**
 * خادم تطبيق إدارة الكافيه
 * Express + Socket.io + تخزين محلي — يعمل على الشبكة المحلية (LAN)
 */
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config');
const createMenuRouter = require('./routes/menu');
const createOrdersRouter = require('./routes/orders');
const statsRoutes = require('./routes/stats');
const archiveRoutes = require('./routes/archive');
const closingsRoutes = require('./routes/closings');
const createTillRouter = require('./routes/till');
const categoriesRoutes = require('./routes/categories');
const createTableSessionsRouter = require('./routes/tableSessions');
const customerSessionRoutes = require('./routes/customerSession');
const iosKitchenRecoveryRoutes = require('./routes/iosKitchenRecovery');
const createKitchenRouter = require('./routes/kitchen');
const { postClosingHandler } = require('./routes/closings');
const { reportHandler } = require('./routes/archive');
const { syncClosedOrdersToArchive } = require('./data/archive');
const { getOrders, getTables } = require('./data/store');
const tableQrService = require('./services/tableQrService');
const { attachTableCustomerSocket } = require('./services/tableCustomerSocket');
const createSettingsRouter = require('./routes/settings');
const createAdminAuthRouter = require('./routes/adminAuth');
const todaySessionHistoryRoutes = require('./routes/todaySessionHistory');

const app = express();
const server = http.createServer(app);

// Socket.io — لعرض الطلبات مباشرة عند الكاشير
const io = new Server(server, {
  cors: { origin: '*' },
  /** أطول لـ Safari/iOS عند الخلفية — يقلل قطع السوكت الوهمي قبل visibility «خلفية». */
  pingInterval: 25000,
  pingTimeout: 120000,
});

attachTableCustomerSocket(io);

io.on('connection', (socket) => {
  if (config.DEBUG_SOCKET) {
    console.log('[socket] client connected', socket.id, 'total:', io.engine.clientsCount);
  }
});

app.use(cors());
app.use(express.json());
/* sendBeacon + URLSearchParams (application/x-www-form-urlencoded) من بعض المتصفحات لا يُعبَّأ req.body من JSON */
app.use(express.urlencoded({ extended: true }));

// رفع الصور للمنيو
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { UPLOADS_DIR } = config;
    require('fs').mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || '.jpg'}`;
    cb(null, unique);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const frontendPath = path.join(__dirname, '..', 'frontend');

// API أولاً حتى لا يلتقط express.static طلبات /api/*
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع ملف' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});
// صور المنيو: أسماء الملفات فريدة (Date.now()-random) فالمحتوى ثابت لكل رابط،
// لذا نخزّنها مؤقتاً 30 يوماً بلا إعادة تحقق حتى تظهر فوراً عند التنقل بين الصفحات والتصنيفات.
app.use(
  '/uploads',
  express.static(config.UPLOADS_DIR, {
    maxAge: '30d',
    immutable: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    },
  })
);
app.use('/table-qrs', express.static(config.TABLE_QRS_DIR));
app.use('/api/menu', createMenuRouter(io));
app.use('/api/table-sessions', createTableSessionsRouter(io));
app.use('/api/customer/session', customerSessionRoutes);
app.use('/api/customer/ios-recovery', iosKitchenRecoveryRoutes);
app.use('/api/orders', createOrdersRouter(io));
app.use('/api/today-sessions', todaySessionHistoryRoutes);
app.use('/api/stats', statsRoutes);
app.post('/api/closings', postClosingHandler);
app.use('/api/closings', closingsRoutes);
app.use('/api/till', createTillRouter(io));
app.use('/api/kitchen', createKitchenRouter(io));
app.post('/api/categories/delete', categoriesRoutes.deleteCategoryHandler || function (req, res) { return res.status(404).json({ error: 'غير متوفر' }); });
app.post('/api/categories/rename', categoriesRoutes.renameCategoryHandler || function (req, res) { return res.status(404).json({ error: 'غير متوفر' }); });
app.post('/api/categories/image', categoriesRoutes.setCategoryImageHandler || function (req, res) { return res.status(404).json({ error: 'غير متوفر' }); });
app.use('/api/categories', categoriesRoutes);
app.use('/api/settings', createSettingsRouter(io));
app.use('/api/admin', createAdminAuthRouter());
// مسار التقرير مسجّل صراحةً لضمان عدم 404
app.get('/api/archive/report', reportHandler);
app.use('/api/archive', archiveRoutes);

const customerDist = path.join(frontendPath, 'customer', 'dist');
const customerNoStore = (res, filePath) => {
  const lower = String(filePath).toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.css') || lower.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
  }
};

// واجهة الزبون (Vite build) — قبل static العام حتى لا يُخدم index.html المصدر
app.use('/customer', express.static(customerDist, { setHeaders: customerNoStore }));
app.get(/^\/customer(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(customerDist, 'index.html'));
});

// الملفات الثابتة — منع تخزين HTML/CSS/JS في المتصفح أثناء التطوير حتى تظهر التعديلات فوراً
app.use(
  express.static(frontendPath, {
    setHeaders(res, filePath) {
      const lower = String(filePath).toLowerCase();
      if (lower.endsWith('.html') || lower.endsWith('.css') || lower.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
      }
    },
  })
);

// روابط الصفحات: بعد static حتى يُمرَّر /captain/ عند عدم وجود captain/index.html
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'index.html')));
app.get('/cashier', (req, res) => res.sendFile(path.join(frontendPath, 'cashier', 'index.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(frontendPath, 'kitchen', 'index.html')));
// واجهة الكابتن: /captain و /captain/ → واجهة الطلب مباشرة (لا صفحة تحويل)
app.get(/^\/captain\/?$/, (req, res) =>
  res.sendFile(path.join(frontendPath, 'captain', 'captain-order.html')));
app.get('/captain/captain-order.html', (req, res) => res.redirect(302, '/captain'));

/**
 * عميل أغلق الاتصال أثناء إرسال الجسم — express/json (raw-body) يرمي BadRequestError.
 * ليس خطأ تطبيقياً؛ نتجنب تلوين الكونسول بـ stack trace.
 */
function isBenignClientAbort(err) {
  if (!err) return false;
  if (err.code === 'ECONNABORTED') return true;
  if (err.type === 'request.aborted') return true;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('request aborted')) return true;
  return false;
}

app.use((err, req, res, next) => {
  void next;
  if (isBenignClientAbort(err)) {
    try {
      if (!res.headersSent) res.end();
    } catch (_) {}
    return;
  }
  try {
    console.error('[express]', err && err.stack ? err.stack : err);
  } catch (_) {}
  try {
    if (!res.headersSent) {
      res.status(err.status && Number(err.status) >= 400 && Number(err.status) < 600 ? err.status : 500).json({
        error: err.message || 'خطأ في الخادم',
      });
    }
  } catch (_) {}
});

// الحصول على IP المحلي للشبكة لعرضه عند التشغيل
function getLocalIP() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
    }
  }
  const wifiLan = candidates.find((a) => /^192\.168\.\d+\.\d+$/.test(a));
  return wifiLan || candidates[0] || null;
}

/** روابط الواجهات — كل مسار مرة واحدة فقط */
const LAN_UI_LINKS = [
  { label: 'أدمن', path: '/admin' },
  { label: 'زبائن', path: '/customer' },
  { label: 'كاشير', path: '/cashier' },
  { label: 'كابتن', path: '/captain' },
  { label: 'مطبخ', path: '/kitchen' },
];

let startupBannerPrinted = false;

function printStartupBanner() {
  if (startupBannerPrinted) return;
  startupBannerPrinted = true;

  const localIP = getLocalIP();
  const port = config.PORT;

  console.log('');
  console.log('  نظام إدارة الكافيه — يعمل على الشبكة المحلية');
  console.log('  ----------------------------------------');
  console.log(`  محلي:    http://localhost:${port}`);
  if (localIP) {
    console.log(`  شبكة:    http://${localIP}:${port}`);
    console.log('');
    console.log('  روابط الواجهات (افتح من أي جهاز على نفس الشبكة):');
    for (const { label, path } of LAN_UI_LINKS) {
      const pad = label.length >= 6 ? label : label + ' '.repeat(6 - label.length);
      console.log(`    ${pad}  http://${localIP}:${port}${path}`);
    }
  }
  console.log('  ----------------------------------------');
  console.log('');
}

server.listen(config.PORT, config.HOST, () => {
  try {
    syncClosedOrdersToArchive(getOrders);
  } catch (_) {}
  printStartupBanner();
  tableQrService
    .regenerateAllTableQrs(getTables(), null)
    .then(function (results) {
      if (results && results.length) {
        console.log('  [QR] تم تحديث ' + results.length + ' بطاقة طاولة (تخطيط Wi-Fi)');
      }
    })
    .catch(function (err) {
      console.warn('[QR] تعذّر تحديث بطاقات الطاولات عند الإقلاع:', err && err.message ? err.message : err);
    });
});
