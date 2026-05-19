/* ==========================================
   العمدة - منطق المزامنة Offline ↔ Online
========================================== */

import { supabase } from "./supabase.js";
import {
  cacheReferenceData,
  getReferenceData,
  savePendingOrder,
  getPendingOrders,
  removePendingOrder,
  getPendingCount
} from "./offline-db.js";

let isOnline = navigator.onLine;
let syncInProgress = false;
const listeners = new Set();

/* اشتراك في تغيير حالة الاتصال */
export function onConnectionChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(state) {
  listeners.forEach(cb => {
    try { cb(state); } catch (e) { console.error(e); }
  });
}

/* ==========================================
   تحديث الكاش من Supabase
========================================== */
export async function refreshCacheFromServer() {
  try {
    const [
      { data: categories },
      { data: products },
      { data: modifier_groups },
      { data: modifiers },
      { data: product_modifier_groups },
      { data: settings }
    ] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").eq("is_active", true),
      supabase.from("modifier_groups").select("*"),
      supabase.from("modifiers").select("*").eq("is_active", true),
      supabase.from("product_modifier_groups").select("*"),
      supabase.from("settings").select("*").eq("id", 1).single()
    ]);

    await cacheReferenceData({
      categories: categories || [],
      products: products || [],
      modifier_groups: modifier_groups || [],
      modifiers: modifiers || [],
      product_modifier_groups: product_modifier_groups || [],
      settings: settings || null
    });

    console.log("[Sync] ✅ تم تحديث الكاش من السيرفر");
    return true;
  } catch (err) {
    console.error("[Sync] ❌ فشل تحديث الكاش:", err);
    return false;
  }
}

/* ==========================================
   حفظ طلب (مع وضع offline)
========================================== */
export async function saveOrderSmart(orderData, cartItems) {
  // جرب أولاً السيرفر إذا متصل
  if (navigator.onLine) {
    try {
      const result = await saveOrderToSupabase(orderData, cartItems);
      return { ...result, mode: "online" };
    } catch (err) {
      console.warn("[Sync] فشل الحفظ online، سأحفظ offline:", err.message);
      // لو فشل السيرفر، نحفظ offline كاحتياط
    }
  }

  // offline: احفظ في IndexedDB
  const tempId = await savePendingOrder({
    order: orderData,
    items: cartItems
  });

  return {
    mode: "offline",
    temp_id: tempId.temp_id,
    display_number: `معلق-${tempId.temp_id.slice(-4)}`
  };
}

/* حفظ مباشر للسيرفر */
async function saveOrderToSupabase(orderData, cartItems) {
  const { data: order, error } = await supabase
    .from("orders")
    .insert(orderData)
    .select()
    .single();

  if (error) throw error;

  const orderItems = cartItems.map(item => ({
    order_id: order.id,
    product_id: item.product_id,
    name: item.name,
    base_price: item.base_price,
    modifiers_total: item.modifiers_total,
    unit_price: item.unit_price,
    qty: item.qty,
    subtotal: item.unit_price * item.qty,
    modifiers_json: item.modifiers || []
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItems);

  if (itemsError) throw itemsError;

  return {
    order,
    display_number: order.daily_number || order.order_number
  };
}

/* ==========================================
   مزامنة الطلبات المعلقة عند رجوع النت
========================================== */
export async function syncPendingOrders() {
  if (syncInProgress) return { synced: 0, failed: 0, alreadyRunning: true };
  if (!navigator.onLine) return { synced: 0, failed: 0, offline: true };

  syncInProgress = true;
  let synced = 0;
  let failed = 0;
  const errors = [];

  try {
    const pending = await getPendingOrders();

    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    console.log(`[Sync] محاولة مزامنة ${pending.length} طلب معلق...`);

    for (const record of pending) {
      try {
        await saveOrderToSupabase(record.order, record.items);
        await removePendingOrder(record.temp_id);
        synced++;
      } catch (err) {
        console.error(`[Sync] فشل مزامنة ${record.temp_id}:`, err);
        errors.push({ temp_id: record.temp_id, error: err.message });
        failed++;
      }
    }
  } finally {
    syncInProgress = false;
  }

  return { synced, failed, errors };
}

/* ==========================================
   مراقبة حالة الاتصال
========================================== */
export function startConnectionMonitor() {
  const updateStatus = (online) => {
    isOnline = online;
    notifyListeners({ online });
  };

  window.addEventListener("online", async () => {
    console.log("[Sync] 🌐 رجع النت");
    updateStatus(true);

    // حدّث الكاش وزامن الطلبات المعلقة
    const result = await syncPendingOrders();
    if (result.synced > 0) {
      notifyListeners({ online: true, syncResult: result });
    }

    // حدّث البيانات في الخلفية
    refreshCacheFromServer();
  });

  window.addEventListener("offline", () => {
    console.log("[Sync] 🔌 انقطع النت");
    updateStatus(false);
  });

  // أرسل الحالة الأولى
  updateStatus(navigator.onLine);
}

export function getOnlineState() {
  return isOnline;
}

export async function getOfflineSummary() {
  const pendingCount = await getPendingCount();
  return {
    online: navigator.onLine,
    pendingOrdersCount: pendingCount
  };
}
