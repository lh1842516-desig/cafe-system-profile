/**
 * خادم تطبيق إدارة الكافيه
 * Express + Socket.io + Supabase — يعمل على الشبكة المحلية (LAN)
 */
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const config = require('./config');
const createMenuRouter = require('./routes/menu');
const createOrdersRouter = require('./routes/orders');
const statsRoutes = require('./routes/stats');
const archiveRoutes = require('./routes/archive');
const closingsRoutes = require('./routes/closings');
const createTillRouter = require('./routes/till');
const createCategoryRouter = require('./routes/categories');
const createTableSessionsRouter = require('./routes/tableSessions');
const createKitchenRouter = require('./routes/kitchen');
const { postClosingHandler } = require('./routes/closings');
const { reportHandler } = require('./routes/archive');
const { syncClosedOrdersToArchive } = require('./data/archive');
const { getOrders, getTables } = require('./data/store');
const tableRepo = require('./repository/tableRepository');
const orderRepo = require('./repository/orderRepository');
const tableQrService = require('./services/tableQrService');
const createSettingsRouter = require('./routes/settings');
const createAdminAuthRouter = require('./routes/adminAuth');
const todaySessionHistoryRoutes = require('./routes/todaySessionHistory');
const saasAuthRoutes = require('./routes/saasAuth');
const superadminRoutes = require('./routes/superadmin');

// Supabase-backed init
const { initCafeContext, getDefaultCafeId } = require('./lib/cafeContext');
const { initStore } = require('./data/store');
const { initTill } = require('./data/till');
const { initKitchenState } = require('./data/kitchen');

const app = express();
const server = http.createServer(app);

// Socket.io — لعرض الطلبات مباشرة عند الكاشير
const io = new Server(server, {
  cors: { origin: '*' },
  /** أطول لـ Safari/iOS عند الخلفية — يقلل قطع السوكت الوهمي قبل visibility «خلفية». */
  pingInterval: 25000,
  pingTimeout: 120000,
});

const saasAuthService = require('./services/saasAuthService');

io.on('connection', (socket) => {
  let cafeId = null;
  const token = socket.handshake.query && socket.handshake.query.token;
  if (token) {
    const decoded = saasAuthService.verifyToken(token);
    if (decoded && decoded.cafeId) {
      cafeId = decoded.cafeId;
    }
  }
  const queryCafeId = (socket.handshake.query && socket.handshake.query.cafeId) ||
                      (socket.handshake.auth && socket.handshake.auth.cafeId);
  if (!cafeId && queryCafeId) {
    cafeId = String(queryCafeId).trim();
  }
  if (!cafeId) {
    cafeId = getDefaultCafeId();
  }
  socket.data.cfCafeId = cafeId;
  socket.join(`cafe-${cafeId}-staff`);
  socket.join(`cafe-${cafeId}-customer`);

  // Customer joins table room for real-time table bill closure & updates
  socket.on('join_table_room', (data) => {
    const cid = (data && data.cafeId) || socket.data.cfCafeId || cafeId;
    const tid = data && data.tableId != null ? String(data.tableId) : '';
    if (!tid || !cid) return;
    const { tableRoomName } = require('./services/tableRoomHelper');
    const room = tableRoomName(tid, cid);
    socket.join(room);
    if (config.DEBUG_SOCKET) console.log('[socket] client joined table room:', room, 'socket:', socket.id);
  });

  if (config.DEBUG_SOCKET) {
    console.log('[socket] client connected', socket.id, 'cafe:', cafeId, 'total:', io.engine.clientsCount);
  }

  // Customer → Staff relay: "Call Waiter" button
  socket.on('customer_call_waiter', (data) => {
    const cid = (data && data.cafeId) || cafeId;
    if (!cid) return;
    const payload = data || {};
    io.to('cafe-' + cid + '-staff').emit('customer_call_waiter', payload);
    io.to('cafe-' + cid + '-staff').emit('captain-request', payload);
    if (config.DEBUG_SOCKET) console.log('[socket] customer_call_waiter relayed', payload);
  });

  // Customer → Staff relay: "Request Bill" button
  socket.on('customer_request_bill', (data) => {
    const cid = (data && data.cafeId) || cafeId;
    if (!cid) return;
    const payload = data || {};
    const tid = String(payload.tableId || '').trim();
    if (tid) {
      const tableSessions = require('./services/tableSessions');
      const { tableRoomName } = require('./services/tableRoomHelper');
      tableSessions.setTableBillRequested(cid, tid, true);
      const room = tableRoomName(tid, cid);
      io.to(room).emit('table_bill_requested', { tableId: tid, isBillRequested: true });
    }
    io.to('cafe-' + cid + '-staff').emit('customer_request_bill', payload);
    io.to('cafe-' + cid + '-staff').emit('bill-request', payload);
    if (config.DEBUG_SOCKET) console.log('[socket] customer_request_bill relayed', payload);
  });
});

app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { error: 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها، يرجى المحاولة بعد 15 دقيقة.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/', authLimiter);
app.use('/api/admin/login', authLimiter);

app.use(express.json());
/* sendBeacon + URLSearchParams (application/x-www-form-urlencoded) من بعض المتصفحات لا يُعبَّأ req.body من JSON */
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
app.use('/api/menu', createMenuRouter(io));
app.use('/api/table-sessions', createTableSessionsRouter(io));
app.use('/api/orders', createOrdersRouter(io));
app.use('/api/today-sessions', todaySessionHistoryRoutes);
app.use('/api/stats', statsRoutes);
app.post('/api/closings', postClosingHandler);
app.use('/api/closings', closingsRoutes);
app.use('/api/till', createTillRouter(io));
app.use('/api/kitchen', createKitchenRouter(io));
app.use('/api/categories', createCategoryRouter(io));
app.use('/api/settings', createSettingsRouter(io));
app.use('/api/admin', createAdminAuthRouter());
app.use('/api/auth/saas', saasAuthRoutes);
app.use('/api/superadmin', superadminRoutes);
// مسار التقرير مسجّل صراحةً لضمان عدم 404
app.get('/api/archive/report', reportHandler);
app.use('/api/archive', archiveRoutes);



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

// روابط الصفحات: بعد static حتى يُمرَّر /captain/ عند عدم وجود captain/index.html
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(frontendPath, 'login', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(frontendPath, 'admin', 'index.html')));
app.get(/^\/superadmin\/?$/, (req, res) => res.sendFile(path.join(frontendPath, 'superadmin', 'index.html')));
app.get('/cashier', (req, res) => res.sendFile(path.join(frontendPath, 'cashier', 'index.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(frontendPath, 'kitchen', 'index.html')));
// واجهة الكابتن: /captain و /captain/ → واجهة الطلب مباشرة (لا صفحة تحويل)
app.get(/^\/captain\/?$/, (req, res) =>
  res.sendFile(path.join(frontendPath, 'captain', 'captain-order.html')));
app.get('/captain/captain-order.html', (req, res) => res.redirect(302, '/captain'));
// Customer QR-ordering interface
app.get('/customer', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(frontendPath, 'customer', 'index.html'));
});
app.get('/customer/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(frontendPath, 'customer', 'index.html'));
});

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
    } catch (_) { }
    return;
  }
  try {
    console.error('[express]', err && err.stack ? err.stack : err);
  } catch (_) { }
  try {
    if (!res.headersSent) {
      res.status(err.status && Number(err.status) >= 400 && Number(err.status) < 600 ? err.status : 500).json({
        error: err.message || 'خطأ في الخادم',
      });
    }
  } catch (_) { }
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

async function startServer() {
  console.log('  Connecting to Supabase...');
  try {
    await initCafeContext();
    const cafeId = getDefaultCafeId();
    console.log(`  Cafe ID: ${cafeId}`);
    await Promise.all([
      initStore(cafeId),
      initTill(cafeId),
      initKitchenState(cafeId),
    ]);
    console.log('  Supabase ready.\n');
  } catch (err) {
    console.error('  Supabase initialization failed:', err.message);
    console.error('  Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    process.exit(1);
  }

  server.listen(config.PORT, config.HOST, async () => {
    try {
      syncClosedOrdersToArchive(getOrders);
    } catch (_) { }
    printStartupBanner();
  });
}

startServer().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
