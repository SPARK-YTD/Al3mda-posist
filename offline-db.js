/* ==========================================
   العمدة - إدارة قاعدة البيانات المحلية
   IndexedDB للعمل بدون نت
========================================== */

const DB_NAME = "al3mda_offline";
const DB_VERSION = 1;

const STORES = {
  categories: "categories",
  products: "products",
  modifier_groups: "modifier_groups",
  modifiers: "modifiers",
  product_modifier_groups: "product_modifier_groups",
  settings: "settings",
  pending_orders: "pending_orders",      // طلبات في انتظار المزامنة
  cached_orders: "cached_orders"          // طلبات اليوم المخزنة
};

let dbInstance = null;

/* فتح/إنشاء قاعدة البيانات */
export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // كل المتاجر تستخدم 'id' كمفتاح
      if (!db.objectStoreNames.contains(STORES.categories)) {
        db.createObjectStore(STORES.categories, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.products)) {
        const productStore = db.createObjectStore(STORES.products, { keyPath: "id" });
        productStore.createIndex("category", "category");
      }
      if (!db.objectStoreNames.contains(STORES.modifier_groups)) {
        db.createObjectStore(STORES.modifier_groups, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.modifiers)) {
        const modStore = db.createObjectStore(STORES.modifiers, { keyPath: "id" });
        modStore.createIndex("group_id", "group_id");
      }
      if (!db.objectStoreNames.contains(STORES.product_modifier_groups)) {
        const pmgStore = db.createObjectStore(STORES.product_modifier_groups, { keyPath: "id", autoIncrement: true });
        pmgStore.createIndex("product_id", "product_id");
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.pending_orders)) {
        // الطلبات المعلقة تستخدم temp_id كمفتاح
        db.createObjectStore(STORES.pending_orders, { keyPath: "temp_id" });
      }
      if (!db.objectStoreNames.contains(STORES.cached_orders)) {
        db.createObjectStore(STORES.cached_orders, { keyPath: "id" });
      }
    };
  });
}

/* عمليات أساسية */
export async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function putAll(storeName, items) {
  if (!items || items.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteItem(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ==========================================
   عمليات مخصصة للنظام
========================================== */

/* تخزين البيانات الأساسية للعمل offline */
export async function cacheReferenceData(data) {
  await Promise.all([
    clearStore(STORES.categories).then(() => putAll(STORES.categories, data.categories)),
    clearStore(STORES.products).then(() => putAll(STORES.products, data.products)),
    clearStore(STORES.modifier_groups).then(() => putAll(STORES.modifier_groups, data.modifier_groups)),
    clearStore(STORES.modifiers).then(() => putAll(STORES.modifiers, data.modifiers)),
    clearStore(STORES.product_modifier_groups).then(() => putAll(STORES.product_modifier_groups, data.product_modifier_groups)),
    data.settings ? put(STORES.settings, data.settings) : Promise.resolve()
  ]);
}

/* قراءة البيانات الأساسية */
export async function getReferenceData() {
  const [categories, products, modifier_groups, modifiers, product_modifier_groups, settingsArr] = await Promise.all([
    getAll(STORES.categories),
    getAll(STORES.products),
    getAll(STORES.modifier_groups),
    getAll(STORES.modifiers),
    getAll(STORES.product_modifier_groups),
    getAll(STORES.settings)
  ]);

  return {
    categories: categories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    products,
    modifier_groups,
    modifiers,
    product_modifier_groups,
    settings: settingsArr[0] || null
  };
}

/* إنشاء معرّف مؤقت للطلب الـ offline */
export function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/* حفظ طلب في قائمة انتظار المزامنة */
export async function savePendingOrder(orderData) {
  const tempId = generateTempId();
  const record = {
    temp_id: tempId,
    created_at: new Date().toISOString(),
    synced: false,
    ...orderData
  };
  await put(STORES.pending_orders, record);
  return record;
}

/* جلب كل الطلبات المعلقة (غير المتزامنة) */
export async function getPendingOrders() {
  const all = await getAll(STORES.pending_orders);
  return all.filter(o => !o.synced);
}

/* وضع علامة على الطلب أنه تمت مزامنته */
export async function markOrderSynced(tempId, supabaseOrderId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.pending_orders, "readwrite");
    const store = tx.objectStore(STORES.pending_orders);
    const req = store.get(tempId);
    req.onsuccess = () => {
      const order = req.result;
      if (order) {
        order.synced = true;
        order.supabase_id = supabaseOrderId;
        store.put(order);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/* حذف طلب من قائمة الانتظار (بعد المزامنة بنجاح) */
export async function removePendingOrder(tempId) {
  await deleteItem(STORES.pending_orders, tempId);
}

/* عدد الطلبات في انتظار المزامنة */
export async function getPendingCount() {
  const pending = await getPendingOrders();
  return pending.length;
}

export { STORES };
