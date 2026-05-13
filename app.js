import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { cart, addToCart, renderCart, clearCart, getCartTotals } from "./cart.js";

let categories = [];
let items = [];
let currentCategory = null;

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
      // إيموجي افتراضي حسب الفئة
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
  // نشوف لو المنتج له إضافات
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

  // لو ما له إضافات، أضفه مباشرة
  if (!groups || groups.length === 0) {
    addToCart(item, []);
    return;
  }

  // افتح البوب أب
  openModifiersPopup(item, groups);
}

/* ========== بوب أب الإضافات ========== */
async function openModifiersPopup(item, productGroups) {
  // اجلب الإضافات لكل مجموعة
  const groupIds = productGroups.map(g => g.group_id);
  const { data: allModifiers } = await supabase
    .from("modifiers")
    .select("*")
    .in("group_id", groupIds)
    .eq("is_active", true)
    .order("sort_order");

  // نظّم الإضافات حسب المجموعة
  const groupsWithMods = productGroups.map(pg => ({
    group: pg.modifier_groups,
    modifiers: (allModifiers || []).filter(m => m.group_id === pg.group_id)
  }));

  // حالة الاختيارات (key = modifier_id, value = qty)
  const selections = new Map();

  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";

  // عنوان
  const title = document.createElement("h3");
  title.innerHTML = `🍔 ${escapeHtml(item.name)}`;
  box.appendChild(title);

  // السعر الأساسي
  const basePriceEl = document.createElement("div");
  basePriceEl.style.cssText = "color:var(--text-secondary);font-size:13px;margin-bottom:16px;text-align:center";
  basePriceEl.textContent = `السعر الأساسي: ${Number(item.price).toFixed(3)} ${state.currency}`;
  box.appendChild(basePriceEl);

  // المجموعات
  groupsWithMods.forEach(({ group, modifiers }) => {
    const groupEl = document.createElement("div");
    groupEl.className = "mod-group";

    // رأس المجموعة
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

    // عناصر المجموعة
    modifiers.forEach(mod => {
      const modEl = document.createElement("div");
      modEl.className = "mod-item";
      modEl.dataset.modId = mod.id;
      modEl.dataset.groupId = group.id;

      const left = document.createElement("div");
      left.className = "mod-item-name";

      // checkbox أو radio حسب نوع المجموعة
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

      // السعر
      const priceEl = document.createElement("div");
      if (Number(mod.price) > 0) {
        priceEl.className = "mod-price";
        priceEl.textContent = `+${Number(mod.price).toFixed(3)}`;
      } else {
        priceEl.className = "mod-price free";
        priceEl.textContent = "مجاني";
      }
      right.appendChild(priceEl);

      // أزرار الكمية (للإضافات متعددة الكمية)
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
            // حذف الإضافة كاملة
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

        modEl.dataset.qtyBox = "true";
        modEl._qtyBox = qtyBox;
        modEl._qtySpan = qtySpan;
      }

      modEl.appendChild(right);

      // النقر للاختيار
      modEl.onclick = () => {
        const currentQty = selections.get(mod.id) || 0;

        if (isSingle) {
          // اختيار واحد فقط - أزل أي اختيار آخر في نفس المجموعة
          groupEl.querySelectorAll(".mod-item").forEach(el => {
            el.classList.remove("selected");
            const modId = el.dataset.modId;
            selections.delete(modId);
          });
          selections.set(mod.id, 1);
          modEl.classList.add("selected");
        } else {
          // اختيار متعدد
          if (currentQty > 0) {
            // إلغاء
            selections.delete(mod.id);
            modEl.classList.remove("selected");
            indicator.textContent = "";
            if (modEl._qtyBox) {
              modEl._qtyBox.style.display = "none";
              modEl._qtySpan.textContent = "1";
            }
          } else {
            // تحقق من الحد الأقصى
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

  // السعر الإجمالي
  const totalBox = document.createElement("div");
  totalBox.className = "popup-total";
  totalBox.innerHTML = `
    <div class="popup-total-label">السعر الإجمالي</div>
    <div class="popup-total-value" id="popupTotal">${Number(item.price).toFixed(3)} ${state.currency}</div>
  `;
  box.appendChild(totalBox);

  // الأزرار
  const actions = document.createElement("div");
  actions.className = "popup-actions";

  const addBtn = document.createElement("button");
  addBtn.className = "btn success";
  addBtn.textContent = "✨ إضافة للسلة";
  addBtn.onclick = () => {
    // تحقق من الحدود الدنيا
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

    // اجمع الإضافات المختارة
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

  /* تحديث السعر الإجمالي في البوب أب */
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

/* ========== إتمام الطلب ========== */
window.completeOrder = async function () {
  if (cart.length === 0) {
    showAlert("السلة فاضية");
    return;
  }

  const { subtotal, tax, total } = getCartTotals();
  const method = await pickPaymentMethod();
  if (!method) return;

  const btn = document.getElementById("completeBtn");
  btn.disabled = true;
  btn.textContent = "جاري الحفظ...";

  try {
    const { data: order, error } = await supabase
      .from("orders")
      .insert({ subtotal, tax, total, payment_method: method })
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

    showAlert(`✅ تم حفظ الطلب رقم #${order.order_number}`);
    clearCart();

  } catch (err) {
    console.error(err);
    showAlert("❌ فشل حفظ الطلب: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ إتمام الطلب";
  }
};

/* ========== اختيار طريقة الدفع ========== */
function pickPaymentMethod() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "popup-overlay";

    const box = document.createElement("div");
    box.className = "popup-box";
    box.style.maxWidth = "380px";

    const { total } = getCartTotals();

    box.innerHTML = `
      <h3>💰 طريقة الدفع</h3>
      <div class="popup-total">
        <div class="popup-total-label">المبلغ المطلوب</div>
        <div class="popup-total-value">${total.toFixed(3)} ${state.currency}</div>
      </div>
    `;

    const cashBtn = document.createElement("button");
    cashBtn.className = "btn success";
    cashBtn.textContent = "💵 كاش";
    cashBtn.style.marginBottom = "10px";
    cashBtn.onclick = () => { overlay.remove(); resolve("cash"); };

    const cardBtn = document.createElement("button");
    cardBtn.className = "btn primary";
    cardBtn.textContent = "💳 بطاقة";
    cardBtn.style.marginBottom = "10px";
    cardBtn.onclick = () => { overlay.remove(); resolve("card"); };

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn secondary";
    cancelBtn.textContent = "إلغاء";
    cancelBtn.onclick = () => { overlay.remove(); resolve(null); };

    box.appendChild(cashBtn);
    box.appendChild(cardBtn);
    box.appendChild(cancelBtn);

    overlay.appendChild(box);
    overlay.onclick = (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null); }
    };
    document.body.appendChild(overlay);
  });
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

/* ========== بدء التشغيل ========== */
window.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadCategories();
  renderCart();
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
  .subscribe();
