/* ==========================================
   العمدة - Service Worker
   كاش ملفات التطبيق للعمل بدون نت
========================================== */

const CACHE_VERSION = "al3mda-v1";
const CACHE_NAME = `al3mda-cache-${CACHE_VERSION}`;

// ملفات لازم تنكاش لما يفتح التطبيق أول مرة
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./admin.html",
  "./style.css",
  "./state.js",
  "./supabase.js",
  "./cart.js",
  "./app.js",
  "./admin.js",
  "./admin-products.js",
  "./admin-categories.js",
  "./admin-modifiers.js",
  "./admin-sales.js",
  "./admin-settings.js",
  "./offline-db.js",
  "./offline-sync.js"
];

// الخطوط من Google Fonts
const FONT_URLS = [
  "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Reem+Kufi:wght@500;600;700&display=swap"
];

/* ========== التنصيب ========== */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] caching shell");
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn("[SW] some files failed to cache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ========== التفعيل ========== */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k.startsWith("al3mda-cache-") && k !== CACHE_NAME)
            .map(k => {
              console.log("[SW] حذف كاش قديم:", k);
              return caches.delete(k);
            })
      );
    }).then(() => self.clients.claim())
  );
});

/* ========== الـ Fetch Strategy ========== */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // تجاهل الطلبات غير GET
  if (req.method !== "GET") return;

  // 1. طلبات Supabase API → ما نكاش، نوصلها مباشرة
  if (url.hostname.includes("supabase.co") || url.hostname.includes("supabase.io")) {
    return; // الـ default browser behavior
  }

  // 2. صور Supabase Storage → كاش بعد التحميل
  if (url.hostname.includes("supabase.co") && url.pathname.includes("/storage/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 3. CDN الـ Supabase JS و Google Fonts → كاش
  if (url.hostname.includes("cdn.jsdelivr.net") || url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 4. ملفات التطبيق (نفس الـ origin) → كاش أول، نت احتياط
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

/* استراتيجية: من الكاش أولاً، ثم النت */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    // حدّث الكاش في الخلفية بدون انتظار
    fetch(request).then(response => {
      if (response.ok) cache.put(request, response);
    }).catch(() => { /* تجاهل أخطاء الشبكة */ });
    return cached;
  }

  // ما هو في الكاش → جيب من النت واحفظه
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // فشل النت ولا في الكاش → ارجع HTML الرئيسي إذا الطلب navigation
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

/* استقبال رسائل من الصفحة */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
