import { supabase } from "./supabase.js";

let currentOrders = [];

export async function renderSales(container) {
  const today = new Date().toISOString().split("T")[0];

  container.innerHTML = `
    <div class="admin-header">
      <h1>💰 المبيعات</h1>
    </div>

    <div class="filters">
      <div>
        <label>من تاريخ</label>
        <input type="date" id="dateFrom" value="${today}" />
      </div>
      <div>
        <label>إلى تاريخ</label>
        <input type="date" id="dateTo" value="${today}" />
      </div>
      <div>
        <label>طريقة الدفع</label>
        <select id="paymentFilter">
          <option value="">الكل</option>
          <option value="cash">💵 كاش</option>
          <option value="card">💳 بطاقة</option>
          <option value="split">💵💳 مشترك</option>
        </select>
      </div>
      <div>
        <label>الحالة</label>
        <select id="statusFilter">
          <option value="paid_or_delivered">مدفوع + مسلّم</option>
          <option value="delivered">✅ مسلّم فقط</option>
          <option value="paid">💰 مدفوع (غير مسلّم)</option>
          <option value="all">الكل (يشمل المعلقة)</option>
        </select>
      </div>
      <button class="btn success" id="applyFilters">🔍 عرض</button>
      <button class="btn secondary" id="exportCsv">📥 تصدير CSV</button>
      <button class="btn secondary" id="quickToday">اليوم</button>
      <button class="btn secondary" id="quickWeek">آخر 7 أيام</button>
      <button class="btn secondary" id="quickMonth">هذا الشهر</button>
    </div>

    <div class="stats-grid" id="statsGrid"></div>

    <h3 style="margin-top:24px;margin-bottom:14px;font-family:var(--font-display);color:var(--gold-light);font-size:20px">قائمة الطلبات</h3>

    <table class="data-table">
      <thead>
        <tr>
          <th>رقم</th>
          <th>التاريخ</th>
          <th>الفرعي</th>
          <th>الضريبة</th>
          <th>الإجمالي</th>
          <th>الدفع</th>
          <th>الحالة</th>
          <th>التفاصيل</th>
        </tr>
      </thead>
      <tbody id="ordersTable"></tbody>
    </table>
  `;

  document.getElementById("applyFilters").onclick = loadSales;
  document.getElementById("exportCsv").onclick = exportCsv;

  // أزرار سريعة
  document.getElementById("quickToday").onclick = () => {
    const t = new Date().toISOString().split("T")[0];
    document.getElementById("dateFrom").value = t;
    document.getElementById("dateTo").value = t;
    loadSales();
  };

  document.getElementById("quickWeek").onclick = () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    document.getElementById("dateFrom").value = from.toISOString().split("T")[0];
    document.getElementById("dateTo").value = to.toISOString().split("T")[0];
    loadSales();
  };

  document.getElementById("quickMonth").onclick = () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById("dateFrom").value = from.toISOString().split("T")[0];
    document.getElementById("dateTo").value = now.toISOString().split("T")[0];
    loadSales();
  };

  loadSales();
}

async function loadSales() {
  const from = document.getElementById("dateFrom").value;
  const to = document.getElementById("dateTo").value;
  const payment = document.getElementById("paymentFilter").value;
  const statusVal = document.getElementById("statusFilter").value;

  if (!from || !to) {
    alert("اختر التاريخين");
    return;
  }

  const fromIso = new Date(from + "T00:00:00").toISOString();
  const toIso = new Date(to + "T23:59:59").toISOString();

  let query = supabase
    .from("orders")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false });

  // فلتر الحالة
  if (statusVal === "delivered") {
    query = query.eq("status", "delivered");
  } else if (statusVal === "paid") {
    query = query.eq("status", "paid");
  } else if (statusVal === "paid_or_delivered") {
    query = query.in("status", ["paid", "delivered"]);
  }
  // "all" = بدون فلتر

  // فلتر الدفع
  if (payment) {
    query = query.eq("payment_method", payment);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    alert("❌ " + error.message);
    return;
  }

  currentOrders = data || [];
  renderStats();
  renderOrdersTable();
}

function renderStats() {
  const stats = document.getElementById("statsGrid");

  const totalSales = currentOrders.reduce((s, o) => s + Number(o.total), 0);

  // الحساب الصحيح للكاش والبطاقة (يحسب الدفع المشترك بشكل صحيح)
  // كاش = مجموع cash_amount لكل الطلبات (كاش كامل + جزء الكاش من المشترك)
  // بطاقة = مجموع card_amount لكل الطلبات (بطاقة كامل + جزء البطاقة من المشترك)
  const totalCash = currentOrders.reduce((s, o) => s + Number(o.cash_amount || 0), 0);
  const totalCard = currentOrders.reduce((s, o) => s + Number(o.card_amount || 0), 0);

  const totalTax = currentOrders.reduce((s, o) => s + Number(o.tax), 0);
  const avg = currentOrders.length > 0 ? totalSales / currentOrders.length : 0;

  // إحصاء الحالات
  const paidCount = currentOrders.filter(o => o.status === "paid").length;
  const deliveredCount = currentOrders.filter(o => o.status === "delivered").length;
  const openCount = currentOrders.filter(o => o.status === "open").length;

  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">إجمالي المبيعات</div>
      <div class="stat-value">${totalSales.toFixed(3)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">عدد الطلبات</div>
      <div class="stat-value">${currentOrders.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">متوسط الطلب</div>
      <div class="stat-value">${avg.toFixed(3)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">💵 كاش</div>
      <div class="stat-value">${totalCash.toFixed(3)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">💳 بطاقة</div>
      <div class="stat-value">${totalCard.toFixed(3)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">إجمالي الضريبة</div>
      <div class="stat-value">${totalTax.toFixed(3)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">✅ مسلّم</div>
      <div class="stat-value" style="color:var(--success)">${deliveredCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">💰 مدفوع (لم يسلّم)</div>
      <div class="stat-value" style="color:var(--warning)">${paidCount}</div>
    </div>
    ${openCount > 0 ? `
      <div class="stat-card">
        <div class="stat-label">⏳ معلّق</div>
        <div class="stat-value" style="color:var(--danger)">${openCount}</div>
      </div>
    ` : ''}
  `;
}

/* تنسيق طريقة الدفع (HTML للعرض في الجدول) */
function formatPaymentMethod(order) {
  if (!order.payment_method) return "—";
  if (order.payment_method === "cash") return "💵 كاش";
  if (order.payment_method === "card") return "💳 بطاقة";
  if (order.payment_method === "split") {
    const cash = Number(order.cash_amount || 0).toFixed(3);
    const card = Number(order.card_amount || 0).toFixed(3);
    return `💵💳 مشترك<br><span style="font-size:11px;color:var(--text-muted);font-weight:normal">كاش: ${cash} · بطاقة: ${card}</span>`;
  }
  return escapeHtml(order.payment_method);
}

/* تنسيق طريقة الدفع (نص عادي للـ CSV) */
function formatPaymentMethodPlain(order) {
  if (!order.payment_method) return "—";
  if (order.payment_method === "cash") return "كاش";
  if (order.payment_method === "card") return "بطاقة";
  if (order.payment_method === "split") {
    const cash = Number(order.cash_amount || 0).toFixed(3);
    const card = Number(order.card_amount || 0).toFixed(3);
    return `مشترك (كاش: ${cash} - بطاقة: ${card})`;
  }
  return order.payment_method;
}

/* تنسيق حالة الطلب */
function formatStatus(status) {
  if (status === "delivered") return `<span style="color:var(--success);font-weight:700">✅ مسلّم</span>`;
  if (status === "paid") return `<span style="color:var(--warning);font-weight:700">💰 مدفوع</span>`;
  if (status === "open") return `<span style="color:var(--danger);font-weight:700">⏳ معلّق</span>`;
  return status;
}

function formatStatusPlain(status) {
  if (status === "delivered") return "مسلّم";
  if (status === "paid") return "مدفوع";
  if (status === "open") return "معلّق";
  return status;
}

function renderOrdersTable() {
  const tbody = document.getElementById("ordersTable");

  if (currentOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">📊<br><br>ما فيه طلبات في الفترة المحددة</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  currentOrders.forEach(o => {
    const tr = document.createElement("tr");

    const date = new Date(o.created_at);
    const dateStr = date.toLocaleString("ar-BH", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });

    // استخدم الترقيم اليومي إذا متوفر
    const orderNum = o.daily_number || o.order_number;

    tr.innerHTML = `
      <td><strong style="color:var(--gold)">#${orderNum}</strong></td>
      <td style="font-size:13px;color:var(--text-secondary)">${dateStr}</td>
      <td>${Number(o.subtotal).toFixed(3)}</td>
      <td>${Number(o.tax).toFixed(3)}</td>
      <td><strong style="color:var(--gold-light);font-family:var(--font-display)">${Number(o.total).toFixed(3)}</strong></td>
      <td>${formatPaymentMethod(o)}</td>
      <td>${formatStatus(o.status)}</td>
    `;

    const viewTd = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn secondary";
    viewBtn.style.padding = "6px 14px";
    viewBtn.textContent = "👁 عرض";
    viewBtn.onclick = () => showOrderDetails(o);
    viewTd.appendChild(viewBtn);
    tr.appendChild(viewTd);

    tbody.appendChild(tr);
  });
}

async function showOrderDetails(order) {
  const { data: items, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (error) { alert(error.message); return; }

  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";
  box.style.maxWidth = "560px";

  const orderNum = order.daily_number || order.order_number;
  const date = new Date(order.created_at).toLocaleString("ar-BH");

  // بناء قائمة العناصر مع الإضافات
  const itemsHtml = (items || []).map(it => {
    const mods = it.modifiers_json || [];
    let modsHtml = "";

    if (Array.isArray(mods) && mods.length > 0) {
      modsHtml = `
        <div style="font-size:12px;color:var(--text-secondary);padding-right:12px;border-right:2px solid var(--border-gold);margin-top:6px;line-height:1.7">
          ${mods.map(m => {
            const qtyStr = m.qty > 1 ? ` ×${m.qty}` : "";
            const priceStr = m.price > 0 ? ` (+${(m.price * m.qty).toFixed(3)})` : "";
            return `+ ${escapeHtml(m.name)}${qtyStr}${priceStr}`;
          }).join("<br>")}
        </div>
      `;
    }

    return `
      <div style="background:var(--bg-card-solid);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${escapeHtml(it.name)}</strong>
            <span style="color:var(--text-muted);font-size:12px;margin-right:6px">× ${it.qty}</span>
          </div>
          <div style="font-family:var(--font-display);font-weight:700;color:var(--gold)">${Number(it.subtotal).toFixed(3)}</div>
        </div>
        ${modsHtml}
      </div>
    `;
  }).join("");

  // معلومات الدفع
  const cash = Number(order.cash_amount || 0);
  const card = Number(order.card_amount || 0);

  let methodLabel = "—";
  if (order.payment_method === "cash") methodLabel = "💵 كاش";
  else if (order.payment_method === "card") methodLabel = "💳 بطاقة";
  else if (order.payment_method === "split") methodLabel = "💵💳 مشترك";

  let paymentHtml = `
    <div style="text-align:center;color:var(--text-secondary);font-size:13px;margin:12px 0">
      طريقة الدفع: <strong style="color:var(--gold-light)">${methodLabel}</strong>
    </div>
  `;

  if (order.payment_method === "split") {
    paymentHtml += `
      <div style="display:flex;gap:10px;margin:12px 0">
        <div style="flex:1;text-align:center;background:var(--bg-hover);padding:10px;border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text-muted)">💵 كاش</div>
          <div style="font-family:var(--font-display);font-weight:700;color:var(--gold)">${cash.toFixed(3)}</div>
        </div>
        <div style="flex:1;text-align:center;background:var(--bg-hover);padding:10px;border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text-muted)">💳 بطاقة</div>
          <div style="font-family:var(--font-display);font-weight:700;color:var(--gold)">${card.toFixed(3)}</div>
        </div>
      </div>
    `;
  }

  // حالة الطلب
  const statusHtml = `
    <div style="text-align:center;color:var(--text-secondary);font-size:13px;margin:8px 0">
      الحالة: ${formatStatus(order.status)}
    </div>
  `;

  box.innerHTML = `
    <h3>📄 تفاصيل الطلب #${orderNum}</h3>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;text-align:center">${date}</div>

    <div style="max-height:50vh;overflow-y:auto;margin-bottom:14px">
      ${itemsHtml}
    </div>

    <div class="totals">
      <div class="totals-row"><span>الفرعي</span><span>${Number(order.subtotal).toFixed(3)}</span></div>
      <div class="totals-row"><span>الضريبة</span><span>${Number(order.tax).toFixed(3)}</span></div>
      <div class="totals-row grand"><span>الإجمالي</span><span>${Number(order.total).toFixed(3)}</span></div>
    </div>

    ${paymentHtml}
    ${statusHtml}

    <div class="popup-actions">
      <button class="btn primary" id="closeDetails">إغلاق</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector("#closeDetails").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function exportCsv() {
  if (currentOrders.length === 0) {
    alert("ما فيه طلبات للتصدير");
    return;
  }

  const headers = [
    "رقم الطلب",
    "التاريخ",
    "الفرعي",
    "الضريبة",
    "الإجمالي",
    "طريقة الدفع",
    "مبلغ الكاش",
    "مبلغ البطاقة",
    "الحالة"
  ];

  const rows = currentOrders.map(o => [
    o.daily_number || o.order_number,
    new Date(o.created_at).toLocaleString("ar-BH"),
    Number(o.subtotal).toFixed(3),
    Number(o.tax).toFixed(3),
    Number(o.total).toFixed(3),
    formatPaymentMethodPlain(o),
    Number(o.cash_amount || 0).toFixed(3),
    Number(o.card_amount || 0).toFixed(3),
    formatStatusPlain(o.status)
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // BOM للعربي في Excel
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `al3mda_sales_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
