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
          <th>رقم الطلب</th>
          <th>التاريخ</th>
          <th>الفرعي</th>
          <th>الضريبة</th>
          <th>الإجمالي</th>
          <th>الدفع</th>
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
  const totalCash = currentOrders.filter(o => o.payment_method === "cash")
    .reduce((s, o) => s + Number(o.total), 0);
  const totalCard = currentOrders.filter(o => o.payment_method === "card")
    .reduce((s, o) => s + Number(o.total), 0);
  const totalTax = currentOrders.reduce((s, o) => s + Number(o.tax), 0);
  const avg = currentOrders.length > 0 ? totalSales / currentOrders.length : 0;

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
  `;
}

function renderOrdersTable() {
  const tbody = document.getElementById("ordersTable");

  if (currentOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">📊<br><br>ما فيه طلبات في الفترة المحددة</td></tr>`;
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

    tr.innerHTML = `
      <td><strong style="color:var(--gold)">#${o.order_number}</strong></td>
      <td style="font-size:13px;color:var(--text-secondary)">${dateStr}</td>
      <td>${Number(o.subtotal).toFixed(3)}</td>
      <td>${Number(o.tax).toFixed(3)}</td>
      <td><strong style="color:var(--gold-light);font-family:var(--font-display)">${Number(o.total).toFixed(3)}</strong></td>
      <td>${o.payment_method === "cash" ? "💵 كاش" : "💳 بطاقة"}</td>
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
      <div style="background:rgba(28,28,40,0.5);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">
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

  box.innerHTML = `
    <h3>📄 تفاصيل الطلب #${order.order_number}</h3>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;text-align:center">${date}</div>

    <div style="max-height:50vh;overflow-y:auto;margin-bottom:14px">
      ${itemsHtml}
    </div>

    <div class="totals">
      <div class="totals-row"><span>الفرعي</span><span>${Number(order.subtotal).toFixed(3)}</span></div>
      <div class="totals-row"><span>الضريبة</span><span>${Number(order.tax).toFixed(3)}</span></div>
      <div class="totals-row grand"><span>الإجمالي</span><span>${Number(order.total).toFixed(3)}</span></div>
    </div>

    <div style="text-align:center;color:var(--text-secondary);font-size:13px;margin:12px 0">
      طريقة الدفع: <strong style="color:var(--gold-light)">${order.payment_method === "cash" ? "💵 كاش" : "💳 بطاقة"}</strong>
    </div>

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

  const headers = ["رقم الطلب", "التاريخ", "الفرعي", "الضريبة", "الإجمالي", "طريقة الدفع"];
  const rows = currentOrders.map(o => [
    o.order_number,
    new Date(o.created_at).toLocaleString("ar-BH"),
    Number(o.subtotal).toFixed(3),
    Number(o.tax).toFixed(3),
    Number(o.total).toFixed(3),
    o.payment_method === "cash" ? "كاش" : "بطاقة"
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
