import { state } from "./state.js";

export const cart = [];

function formatMoney(amount) {
  return `${Number(amount).toFixed(3)} ${state.currency}`;
}

/* مفتاح فريد للسلة (يدمج المنتجات المتطابقة فقط) */
function getCartKey(productId, modifiers) {
  const modKey = (modifiers || [])
    .map(m => `${m.id}:${m.qty}`)
    .sort()
    .join("|");
  return `${productId}::${modKey}`;
}

/* حساب سعر الإضافات */
function calcModifiersTotal(modifiers) {
  return (modifiers || []).reduce((sum, m) => sum + (m.price * m.qty), 0);
}

/* إضافة منتج للسلة */
export function addToCart(item, modifiers = []) {
  const modTotal = calcModifiersTotal(modifiers);
  const basePrice = Number(item.price);
  const unitPrice = basePrice + modTotal;
  const key = getCartKey(item.id, modifiers);

  const existing = cart.find(i => i.key === key);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      key,
      product_id: item.id,
      name: item.name,
      base_price: basePrice,
      modifiers_total: modTotal,
      unit_price: unitPrice,
      modifiers: modifiers || [],
      qty: 1
    });
  }

  renderCart();
}

export function changeQty(index, change) {
  if (!cart[index]) return;
  cart[index].qty += change;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  renderCart();
}

export function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

export function clearCart() {
  cart.length = 0;
  renderCart();
}

/* عرض الإضافات كنص */
function formatModifiers(modifiers) {
  if (!modifiers || modifiers.length === 0) return "";
  return modifiers
    .map(m => {
      const qtyStr = m.qty > 1 ? ` ×${m.qty}` : "";
      const priceStr = m.price > 0
        ? ` (+${(m.price * m.qty).toFixed(3)})`
        : "";
      return `+ ${m.name}${qtyStr}${priceStr}`;
    })
    .join("<br>");
}

export function renderCart() {
  const box = document.getElementById("cart");
  const subtotalEl = document.getElementById("subtotal");
  const taxEl = document.getElementById("taxAmount");
  const taxRow = document.getElementById("taxRow");
  const totalEl = document.getElementById("total");

  if (!box) return;

  if (cart.length === 0) {
    box.innerHTML = `<div class="empty-cart">السلة فاضية</div>`;
    subtotalEl.textContent = formatMoney(0);
    taxEl.textContent = formatMoney(0);
    totalEl.textContent = formatMoney(0);
    return;
  }

  let subtotal = 0;
  box.innerHTML = "";

  cart.forEach((item, index) => {
    subtotal += item.unit_price * item.qty;

    const div = document.createElement("div");
    div.className = "cart-item";

    const top = document.createElement("div");
    top.className = "cart-top";

    const nameEl = document.createElement("div");
    nameEl.className = "cart-name";
    nameEl.textContent = item.name;

    const priceEl = document.createElement("div");
    priceEl.className = "cart-price";
    priceEl.textContent = formatMoney(item.unit_price * item.qty);

    top.appendChild(nameEl);
    top.appendChild(priceEl);
    div.appendChild(top);

    // عرض الإضافات (لو موجودة)
    if (item.modifiers && item.modifiers.length > 0) {
      const modsEl = document.createElement("div");
      modsEl.className = "cart-modifiers";
      modsEl.innerHTML = formatModifiers(item.modifiers);
      div.appendChild(modsEl);
    }

    // أزرار التحكم بالكمية
    const controls = document.createElement("div");
    controls.className = "cart-controls";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.onclick = () => changeQty(index, -1);

    const qtyEl = document.createElement("span");
    qtyEl.className = "qty-display";
    qtyEl.textContent = item.qty;

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = () => changeQty(index, 1);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "🗑";
    removeBtn.onclick = () => removeFromCart(index);

    controls.appendChild(minus);
    controls.appendChild(qtyEl);
    controls.appendChild(plus);
    controls.appendChild(removeBtn);

    div.appendChild(controls);
    box.appendChild(div);
  });

  const tax = state.hideTax ? 0 : subtotal * state.taxRate;
  const total = subtotal + tax;

  subtotalEl.textContent = formatMoney(subtotal);
  taxEl.textContent = formatMoney(tax);
  totalEl.textContent = formatMoney(total);

  if (state.hideTax) {
    taxRow.style.display = "none";
  } else {
    taxRow.style.display = "flex";
  }
}

export function getCartTotals() {
  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const tax = state.hideTax ? 0 : subtotal * state.taxRate;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}
