import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { cart, addToCart, renderCart, clearCart, getCartTotals } from "./cart.js";

let categories = [];
let items = [];
let currentCategory = null;
let pendingOrders = [];
let pendingTimer = null;

window.addEventListener("error", (e) => console.error("🔥 ERROR:", e.error));
window.addEventListener("unhandledrejection", (e) => console.error("🔥 PROMISE ERROR:", e.reason));

/* ========== تحميل الإعدادات ========== */
async function loadSettings() {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.error("settings:", error);
    return;
  }

  state.taxRate = Number(data.tax_rate || 0) / 100;
  state.hideTax = data.hide_tax || false;
  state.currency = data.currency || "د.ب";
  state.storeName = data.store_name || "العمدة";

  const titleEl = document.getElementById("storeName");
  if (titleEl) titleEl.textContent = state.storeName;
  document.title = `${state.storeName} - الكاشير`;
}

/* ========== تحميل الفئات ========== */
async function loadCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order");

  if (error) {
    console.error(error);
    return;
  }

  categories = data || [];
  const box = document.getElementById("categories");
  box.innerHTML = "";

  if (categories.length === 0) {
    box.innerHTML = `<div style="color:var(--text-muted)">ما فيه فئات. أضف من صفحة الإدارة.</div>`;
    return;
  }

  categories.forEach((cat, idx) => {
    const btn = document.createElement("button");
    btn.className = "cat";
    btn.textContent = `${cat.icon || ""} ${cat.name}`;
    if (idx === 0) btn.classList.add("active");
    btn.onclick = () => {
      document.querySelectorAll(".cat").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadItems(cat.slug);
    };
    box.appendChild(btn);
  });

  if (categories.length > 0) {
    loadItems(categories[0].slug);
  }
}

/* ========== تحميل المنتجات ========== */
async function loadItems(categorySlug) {
  currentCategory = categorySlug;

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category", categorySlug)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error(error);
    return;
  }

  items = data || [];
  renderItems();
}

function renderItems() {
  const box = document.getElementById("items");
  box.innerHTML = "";

  if (items.length === 0) {
    box.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
      🍽️<br><br>ما فيه منتجات في هذي الفئة
    </div>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";

    if (item.image_url) {
      const img = document.createElement("img");
      img.src = item.image_url;
      img.className = "item-img";
      img.onerror = () => { img.style.display = "none"; };
      div.appendChild(img);
    } else {
      const emoji = document.createElement("span");
      emoji.className = "item-emoji";
      const cat = categories.find(c => c.slug === item.category);
      emoji.textContent = cat?.icon || "🍽️";
      div.appendChild(emoji);
    }

    const name = document.createElement("div");
    name.className = "item-name";
    name.textContent = item.name;
    div.appendChild(name);

    const price = document.createElement("div");
    price.className = "item-price";
    price.textContent = `${Number(item.price).toFixed(3)} ${state.currency}`;
    div.appendChild(price);

    div.onclick = () => handleItemClick(item);
    box.appendChild(div);
  });
}

/* ========== نقر على منتج ========== */
async function handleItemClick(item) {
  const { data: groups, error } = await supabase
    .from("product_modifier_groups")
    .select("group_id, sort_order, modifier_groups(*)")
    .eq("product_id", item.id)
    .order("sort_order");

  if (error) {
    console.error(error);
    addToCart(item, []);
    return;
  }

  if (!groups || groups.length === 0) {
    addToCart(item, []);
    return;
  }

  openModifiersPopup(item, groups);
}

/* ========== بوب أب الإضافات ========== */
async function openModifiersPopup(item, productGroups) {
  const groupIds = productGroups.map(g => g.group_id);
  const { data: allModifiers } = await supabase
    .from("modifiers")
    .select("*")
    .in("group_id", groupIds)
    .eq("is_active", true)
    .order("sort_order");

  const groupsWithMods = productGroups.map(pg => ({
    group: pg.modifier_groups,
    modifiers: (allModifiers || []).filter(m => m.group_id === pg.group_id)
  }));

  const selections = new Map();

  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";

  const title = document.createElement("h3");
  title.innerHTML = `🍔 ${escapeHtml(item.name)}`;
  box.appendChild(title);

  const basePriceEl = document.createElement("div");
  basePriceEl.style.cssText = "color:var(--text-secondary);font-size:13px;margin-bottom:16px;text-align:center";
  basePriceEl.textContent = `السعر الأساسي: ${Number(item.price).toFixed(3)} ${state.currency}`;
  box.appendChild(basePriceEl);

  groupsWithMods.forEach(({ group, modifiers }) => {
    const groupEl = document.createElement("div");
    groupEl.className = "mod-group";

    const header = document.createElement("div");
    header.className = "mod-group-header";

    const nameEl = document.createElement("div");
    nameEl.className = "mod-group-name";
    nameEl.textContent = group.name;
    header.appendChild(nameEl);

    const tagEl = document.createElement("div");
    const isRequired = group.min_select > 0;
    const isSingle = group.max_select === 1;

    if (isRequired) {
      tagEl.className = "mod-group-required";
      tagEl.textContent = isSingle ? "اختر واحد" : `اختر ${group.min_select} على الأقل`;
    } else {
      tagEl.className = "mod-group-optional";
      tagEl.textContent = isSingle ? "اختياري" : `حتى ${group.max_select}`;
    }
    header.appendChild(tagEl);
    groupEl.appendChild(header);

    modifiers.forEach(mod => {
      const modEl = document.createElement("div");
      modEl.className = "mod-item";
      modEl.dataset.modId = mod.id;
      modEl.dataset.groupId = group.id;

      const left = document.createElement("div");
      left.className = "mod-item-name";

      const indicator = document.createElement("div");
      if (isSingle) {
        indicator.className = "mod-radio";
      } else {
        indicator.className = "mod-checkbox";
        indicator.textContent = "";
      }
      left.appendChild(indicator);

      const modName = document.createElement("span");
      modName.textContent = mod.name;
      left.appendChild(modName);

      modEl.appendChild(left);

      const right = document.createElement("div");
      right.style.cssText = "display:flex;align-items:center;gap:12px";

      const priceEl = document.createElement("div");
      if (Number(mod.price) > 0) {
        priceEl.className = "mod-price";
        priceEl.textContent = `+${Number(mod.price).toFixed(3)}`;
      } else {
        priceEl.className = "mod-price free";
        priceEl.textContent = "مجاني";
      }
      right.appendChild(priceEl);

      if (!isSingle && Number(mod.price) > 0) {
        const qtyBox = document.createElement("div");
        qtyBox.className = "mod-qty";
        qtyBox.style.display = "none";

        const minus = document.createElement("button");
        minus.textContent = "−";
        minus.onclick = (e) => {
          e.stopPropagation();
          const cur = selections.get(mod.id) || 0;
          if (cur > 1) {
            selections.set(mod.id, cur - 1);
            qtySpan.textContent = cur - 1;
            updateTotalDisplay();
          } else {
            selections.delete(mod.id);
            modEl.classList.remove("selected");
            indicator.textContent = "";
            qtyBox.style.display = "none";
            updateTotalDisplay();
          }
        };

        const qtySpan = document.createElement("span");
        qtySpan.textContent = "1";

        const plus = document.createElement("button");
        plus.textContent = "+";
        plus.onclick = (e) => {
          e.stopPropagation();
          const cur = selections.get(mod.id) || 0;
          selections.set(mod.id, cur + 1);
          qtySpan.textContent = cur + 1;
          updateTotalDisplay();
        };

        qtyBox.appendChild(minus);
        qtyBox.appendChild(qtySpan);
        qtyBox.appendChild(plus);
        right.appendChild(qtyBox);

        modEl._qtyBox = qtyBox;
        modEl._qtySpan = qtySpan;
      }

      modEl.appendChild(right);

      modEl.onclick = () => {
        const currentQty = selections.get(mod.id) || 0;

        if (isSingle) {
          groupEl.querySelectorAll(".mod-item").forEach(el => {
            el.classList.remove("selected");
            const modId = el.dataset.modId;
            selections.delete(modId);
          });
          selections.set(mod.id, 1);
          modEl.classList.add("selected");
        } else {
          if (currentQty > 0) {
            selections.delete(mod.id);
            modEl.classList.remove("selected");
            indicator.textContent = "";
            if (modEl._qtyBox) {
              modEl._qtyBox.style.display = "none";
              modEl._qtySpan.textContent = "1";
            }
          } else {
            const groupSelections = Array.from(groupEl.querySelectorAll(".mod-item.selected")).length;
            if (groupSelections >= group.max_select) {
              showAlert(`الحد الأقصى ${group.max_select} في "${group.name}"`);
              return;
            }
            selections.set(mod.id, 1);
            modEl.classList.add("selected");
            indicator.textContent = "✓";
            if (modEl._qtyBox) {
              modEl._qtyBox.style.display = "flex";
            }
          }
        }

        updateTotalDisplay();
      };

      groupEl.appendChild(modEl);
    });

    box.appendChild(groupEl);
  });

  const totalBox = document.createElement("div");
  totalBox.className = "popup-total";
  totalBox.innerHTML = `
    <div class="popup-total-label">السعر الإجمالي</div>
    <div class="popup-total-value" id="popupTotal">${Number(item.price).toFixed(3)} ${state.currency}</div>
  `;
  box.appendChild(totalBox);

  const actions = document.createElement("div");
  actions.className = "popup-actions";

  const addBtn = document.createElement("button");
  addBtn.className = "btn success";
  addBtn.textContent = "✨ إضافة للسلة";
  addBtn.onclick = () => {
    for (const { group } of groupsWithMods) {
      if (group.min_select > 0) {
        const count = Array.from(box.querySelectorAll(`.mod-item.selected`))
          .filter(el => el.dataset.groupId === group.id).length;
        if (count < group.min_select) {
          showAlert(`اختر ${group.min_select} على الأقل من "${group.name}"`);
          return;
        }
      }
    }

    const modifiers = [];
    selections.forEach((qty, modId) => {
      const mod = groupsWithMods
        .flatMap(g => g.modifiers)
        .find(m => m.id === modId);
      if (mod) {
        modifiers.push({
          id: mod.id,
          name: mod.name,
          price: Number(mod.price),
          qty: qty
        });
      }
    });

    addToCart(item, modifiers);
    overlay.remove();
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary";
  cancelBtn.textContent = "إلغاء";
  cancelBtn.onclick = () => overlay.remove();

  actions.appendChild(addBtn);
  actions.appendChild(cancelBtn);
  box.appendChild(actions);

  overlay.appendChild(box);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);

  function updateTotalDisplay() {
    let total = Number(item.price);
    selections.forEach((qty, modId) => {
      const mod = groupsWithMods
        .flatMap(g => g.modifiers)
        .find(m => m.id === modId);
      if (mod) total += Number(mod.price) * qty;
    });
    const totalEl = box.querySelector("#popupTotal");
    if (totalEl) totalEl.textContent = `${total.toFixed(3)} ${state.currency}`;
  }
}
/* ========== حفظ الطلب (بدون دفع) ========== */
window.saveOrder = async function () {
  if (cart.length === 0) {
    showAlert("السلة فاضية");
    return;
  }

  const { subtotal, tax, total } = getCartTotals();

  const btn = document.getElementById("completeBtn");
  btn.disabled = true;
  btn.textContent = "جاري الحفظ...";

  try {
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        subtotal,
        tax,
        total,
        status: "open",
        payment_method: null,
        cash_amount: 0,
        card_amount: 0
      })
      .select()
      .single();

    if (error) throw error;

    const orderItems = cart.map(item => ({
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

    const displayNum = order.daily_number || order.order_number;
    showToast(`✅ تم حفظ الطلب #${displayNum}`);
    clearCart();
    loadPendingOrders();

  } catch (err) {
    console.error(err);
    showAlert("❌ فشل حفظ الطلب: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ حفظ الطلب";
  }
};

/* ========== تحميل الطلبات المعلقة (اليوم فقط) ========== */
async function loadPendingOrders() {
  // التاريخ الحالي بتوقيت البحرين
  const todayBahrain = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Bahrain" })
  );
  const todayStr = todayBahrain.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .in("status", ["open", "paid"])
    .eq("order_date", todayStr)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  pendingOrders = data || [];
  renderPendingOrders();
}

function renderPendingOrders() {
  const box = document.getElementById("pendingOrders");
  const countEl = document.getElementById("pendingCount");

  if (countEl) countEl.textContent = pendingOrders.length;

  if (!box) return;

  if (pendingOrders.length === 0) {
    box.innerHTML = `<div class="pending-empty">لا توجد طلبات معلقة</div>`;
    return;
  }

  box.innerHTML = "";

  pendingOrders.forEach(order => {
    const card = document.createElement("div");
    card.className = "pending-card";

    const ageMinutes = (Date.now() - new Date(order.created_at).getTime()) / 60000;

    if (order.status === "paid") {
      card.classList.add("paid");
    } else if (ageMinutes > 60) {
      card.classList.add("old");
    } else if (ageMinutes > 15) {
      card.classList.add("medium");
    } else {
      card.classList.add("fresh");
    }

    const orderNum = order.daily_number || order.order_number;

    // رأس
    const header = document.createElement("div");
    header.className = "pending-header";
    header.innerHTML = `
      <div class="pending-num">#${orderNum}</div>
      <div class="pending-time">${formatAge(ageMinutes)}</div>
    `;
    card.appendChild(header);

    // حالة
    const statusEl = document.createElement("div");
    statusEl.className = `pending-status ${order.status === 'paid' ? 'paid' : 'unpaid'}`;
    statusEl.textContent = order.status === "paid" ? "✅ مدفوع" : "⏳ في انتظار الدفع";
    card.appendChild(statusEl);

    // العناصر (مختصرة)
    const itemsBox = document.createElement("div");
    itemsBox.className = "pending-items";
    (order.order_items || []).forEach(it => {
      const line = document.createElement("div");
      line.className = "pending-item-line";
      line.innerHTML = `
        <span>${escapeHtml(it.name)} × ${it.qty}</span>
        <span style="color:var(--gold-dark);font-weight:600">${Number(it.subtotal).toFixed(3)}</span>
      `;
      itemsBox.appendChild(line);
    });
    card.appendChild(itemsBox);

    // الإجمالي
    const totalEl = document.createElement("div");
    totalEl.className = "pending-total";
    totalEl.innerHTML = `
      <span class="pending-total-label">الإجمالي</span>
      <span class="pending-total-value">${Number(order.total).toFixed(3)} ${state.currency}</span>
    `;
    card.appendChild(totalEl);

    // أزرار
    const actions = document.createElement("div");
    actions.className = "pending-actions";

    // 👁 زر عرض التفاصيل (دائماً موجود)
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn primary";
    viewBtn.textContent = "👁 عرض";
    viewBtn.onclick = () => showOrderDetails(order);
    actions.appendChild(viewBtn);

    if (order.status === "open") {
      const payBtn = document.createElement("button");
      payBtn.className = "btn success";
      payBtn.textContent = "💰 دفع";
      payBtn.onclick = () => openPaymentPopup(order);
      actions.appendChild(payBtn);
    }

    const deliverBtn = document.createElement("button");
    deliverBtn.className = "btn delivery";
    deliverBtn.textContent = "✅ تسليم";
    deliverBtn.onclick = () => deliverOrder(order);
    actions.appendChild(deliverBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn secondary";
    cancelBtn.style.flex = "0 0 auto";
    cancelBtn.style.padding = "9px 12px";
    cancelBtn.textContent = "🗑";
    cancelBtn.title = "إلغاء الطلب";
    cancelBtn.onclick = () => cancelOrder(order);
    actions.appendChild(cancelBtn);

    card.appendChild(actions);

    box.appendChild(card);
  });
}

function formatAge(minutes) {
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `${Math.floor(minutes)} د`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h}س ${m}د`;
}

/* ========== 👁 عرض تفاصيل الطلب ========== */
function showOrderDetails(order) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box order-details-box";

  const orderNum = order.daily_number || order.order_number;
  const date = new Date(order.created_at);
  const dateStr = date.toLocaleString("ar-BH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const isPaid = order.status === "paid";

  // بناء قائمة العناصر مع الإضافات
  const itemsHtml = (order.order_items || []).map(it => {
    const mods = it.modifiers_json || [];
    let modsHtml = "";

    if (Array.isArray(mods) && mods.length > 0) {
      const modLines = mods.map(m => {
        const qtyStr = m.qty > 1 ? ` ×${m.qty}` : "";
        const priceStr = m.price > 0 ? `+${(m.price * m.qty).toFixed(3)}` : "مجاني";
        return `
          <div class="order-detail-mod-line">
            <span>+ ${escapeHtml(m.name)}${qtyStr}</span>
            <span>${priceStr}</span>
          </div>
        `;
      }).join("");

      modsHtml = `<div class="order-detail-mods">${modLines}</div>`;
    }

    return `
      <div class="order-detail-item">
        <div class="order-detail-item-top">
          <div>
            <span class="order-detail-item-name">${escapeHtml(it.name)}</span>
            <span class="order-detail-item-qty">× ${it.qty}</span>
          </div>
          <div class="order-detail-item-price">${Number(it.subtotal).toFixed(3)}</div>
        </div>
        ${modsHtml}
      </div>
    `;
  }).join("");

  // معلومات الدفع
  let paymentHtml = "";
  if (isPaid) {
    const cash = Number(order.cash_amount || 0);
    const card = Number(order.card_amount || 0);

    let methodLabel = "—";
    if (order.payment_method === "cash") methodLabel = "💵 كاش";
    else if (order.payment_method === "card") methodLabel = "💳 بطاقة";
    else if (order.payment_method === "split") methodLabel = "💵💳 مشترك";

    paymentHtml = `
      <div class="order-details-payment">
        <span>طريقة الدفع</span>
        <strong>${methodLabel}</strong>
      </div>
    `;

    if (order.payment_method === "split") {
      paymentHtml += `
        <div class="order-details-payment payment-split-info">
          <div>
            <div class="label">💵 كاش</div>
            <div class="value">${cash.toFixed(3)}</div>
          </div>
          <div>
            <div class="label">💳 بطاقة</div>
            <div class="value">${card.toFixed(3)}</div>
          </div>
        </div>
      `;
    }
  } else {
    paymentHtml = `
      <div class="order-details-payment" style="background:#fef3c7;color:#92400e;border-color:#fde68a">
        <span>⏳ في انتظار الدفع</span>
        <strong>لم يدفع بعد</strong>
      </div>
    `;
  }

  box.innerHTML = `
    <h3>📄 تفاصيل الطلب</h3>

    <div class="order-details-header">
      <div class="order-details-num">#${orderNum}</div>
      <div class="order-details-date">${dateStr}</div>
      <div class="order-details-status ${isPaid ? 'paid' : 'unpaid'}">
        ${isPaid ? '✅ مدفوع' : '⏳ في انتظار الدفع'}
      </div>
    </div>

    <div class="order-details-items">
      ${itemsHtml}
    </div>

    <div class="order-details-totals">
      <div class="totals-row">
        <span>المجموع الفرعي</span>
        <span>${Number(order.subtotal).toFixed(3)} ${state.currency}</span>
      </div>
      <div class="totals-row">
        <span>الضريبة</span>
        <span>${Number(order.tax).toFixed(3)} ${state.currency}</span>
      </div>
      <div class="totals-row grand">
        <span>الإجمالي</span>
        <span>${Number(order.total).toFixed(3)} ${state.currency}</span>
      </div>
    </div>

    ${paymentHtml}

    <div class="popup-actions" style="margin-top:16px">
      <button class="btn primary" id="closeDetails">إغلاق</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector("#closeDetails").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

/* ========== بوب أب الدفع (مع دعم الدفع المشترك) ========== */
function openPaymentPopup(order) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";
  box.style.maxWidth = "440px";

  const total = Number(order.total);
  const orderNum = order.daily_number || order.order_number;

  box.innerHTML = `
    <h3>💰 دفع الطلب #${orderNum}</h3>

    <div class="popup-total">
      <div class="popup-total-label">المبلغ المطلوب</div>
      <div class="popup-total-value">${total.toFixed(3)} ${state.currency}</div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn primary" id="payCashOnly" style="flex:1">💵 كاش بالكامل</button>
      <button class="btn primary" id="payCardOnly" style="flex:1">💳 بطاقة بالكامل</button>
    </div>

    <div style="text-align:center;color:var(--text-muted);font-size:12px;margin-bottom:10px">
      ━━━━ أو الدفع المشترك ━━━━
    </div>

    <div class="split-payment">
      <div class="split-row">
        <label>💵 كاش</label>
        <input type="number" step="0.001" min="0" id="cashAmount" value="0" />
      </div>
      <div class="split-row">
        <label>💳 بطاقة</label>
        <input type="number" step="0.001" min="0" id="cardAmount" value="0" />
      </div>

      <div class="split-summary">
        <div class="split-summary-row">
          <span>المدخل</span>
          <span id="splitPaid" style="font-weight:700;color:var(--gold-dark)">0.000</span>
        </div>
        <div class="split-summary-row required">
          <span>المطلوب</span>
          <span>${total.toFixed(3)} ${state.currency}</span>
        </div>
        <div id="splitStatus"></div>
      </div>
    </div>

    <div class="popup-actions">
      <button class="btn success" id="confirmPay">✅ تأكيد الدفع</button>
      <button class="btn secondary" id="cancelPay">إلغاء</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const cashInput = box.querySelector("#cashAmount");
  const cardInput = box.querySelector("#cardAmount");
  const paidEl = box.querySelector("#splitPaid");
  const statusEl = box.querySelector("#splitStatus");

  function updateSplit() {
    const cash = Number(cashInput.value) || 0;
    const card = Number(cardInput.value) || 0;
    const paid = cash + card;
    paidEl.textContent = paid.toFixed(3);

    statusEl.innerHTML = "";
    if (paid > 0) {
      if (Math.abs(paid - total) < 0.001) {
        statusEl.innerHTML = `<div class="split-success">✅ المبلغ مطابق</div>`;
      } else if (paid < total) {
        statusEl.innerHTML = `<div class="split-error">⚠️ ناقص ${(total - paid).toFixed(3)} ${state.currency}</div>`;
      } else {
        statusEl.innerHTML = `<div class="split-error">⚠️ زائد ${(paid - total).toFixed(3)} ${state.currency}</div>`;
      }
    }
  }

  cashInput.oninput = updateSplit;
  cardInput.oninput = updateSplit;

  box.querySelector("#payCashOnly").onclick = () => {
    confirmPayment(order, total, 0, "cash", overlay);
  };

  box.querySelector("#payCardOnly").onclick = () => {
    confirmPayment(order, 0, total, "card", overlay);
  };

  box.querySelector("#confirmPay").onclick = () => {
    const cash = Number(cashInput.value) || 0;
    const card = Number(cardInput.value) || 0;
    const paid = cash + card;

    if (paid <= 0) {
      showAlert("أدخل مبلغ الدفع");
      return;
    }

    if (Math.abs(paid - total) >= 0.001) {
      showAlert(`المبلغ المدخل (${paid.toFixed(3)}) لا يطابق المطلوب (${total.toFixed(3)})`);
      return;
    }

    let method = "split";
    if (cash > 0 && card === 0) method = "cash";
    else if (card > 0 && cash === 0) method = "card";

    confirmPayment(order, cash, card, method, overlay);
  };

  box.querySelector("#cancelPay").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}
async function confirmPayment(order, cash, card, method, overlay) {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "paid",
      payment_method: method,
      cash_amount: cash,
      card_amount: card,
      paid_at: new Date().toISOString()
    })
    .eq("id", order.id);

  if (error) {
    showAlert("❌ " + error.message);
    return;
  }

  overlay.remove();
  const orderNum = order.daily_number || order.order_number;
  showToast(`✅ تم دفع الطلب #${orderNum}`);
  loadPendingOrders();
}

/* ========== تسليم الطلب ========== */
async function deliverOrder(order) {
  const orderNum = order.daily_number || order.order_number;
  if (!confirm(`تسليم الطلب #${orderNum}؟`)) return;

  const { error } = await supabase
    .from("orders")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString()
    })
    .eq("id", order.id);

  if (error) {
    showAlert("❌ " + error.message);
    return;
  }

  showToast(`✅ تم تسليم الطلب #${orderNum}`);
  loadPendingOrders();
}

/* ========== إلغاء الطلب ========== */
async function cancelOrder(order) {
  const orderNum = order.daily_number || order.order_number;
  if (!confirm(`إلغاء وحذف الطلب #${orderNum}؟`)) return;

  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", order.id);

  if (error) {
    showAlert("❌ " + error.message);
    return;
  }

  showToast(`🗑 تم حذف الطلب #${orderNum}`);
  loadPendingOrders();
}

/* ========== Toast (إشعار سريع) ========== */
function showToast(message) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed;
    top:80px;
    left:50%;
    transform:translateX(-50%);
    background:linear-gradient(135deg,#059669,#047857);
    color:#fff;
    padding:14px 24px;
    border-radius:12px;
    box-shadow:0 8px 24px rgba(5,150,105,0.3);
    z-index:10000;
    font-weight:600;
    animation:fadeIn 0.3s ease-out;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/* ========== رسائل التنبيه ========== */
function showAlert(message) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";
  box.style.maxWidth = "340px";
  box.style.textAlign = "center";

  const msg = document.createElement("div");
  msg.textContent = message;
  msg.style.cssText = "font-size:15px;padding:14px 0 22px;color:var(--text-primary)";

  const okBtn = document.createElement("button");
  okBtn.className = "btn primary";
  okBtn.textContent = "حسناً";
  okBtn.onclick = () => overlay.remove();

  box.appendChild(msg);
  box.appendChild(okBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

window.showAlert = showAlert;

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ========== فحص تغيّر اليوم (للتصفير التلقائي) ========== */
let currentDayBahrain = getCurrentBahrainDate();

function getCurrentBahrainDate() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bahrain" }))
    .toISOString().split("T")[0];
}

function checkDayChange() {
  const newDay = getCurrentBahrainDate();
  if (newDay !== currentDayBahrain) {
    console.log("🌙 يوم جديد:", newDay);
    currentDayBahrain = newDay;
    loadPendingOrders();
    showToast("🌙 يوم جديد - تم تصفير الأرقام");
  }
}

/* ========== بدء التشغيل ========== */
window.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadCategories();
  await loadPendingOrders();
  renderCart();

  // تحديث أعمار الطلبات + فحص تغيّر اليوم كل 30 ثانية
  pendingTimer = setInterval(() => {
    checkDayChange();
    if (pendingOrders.length > 0) renderPendingOrders();
  }, 30000);
});

/* ========== Realtime ========== */
supabase
  .channel("pos-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
    if (currentCategory) loadItems(currentCategory);
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => {
    loadCategories();
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "settings" }, () => {
    loadSettings().then(renderCart);
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
    loadPendingOrders();
  })
  .subscribe();
