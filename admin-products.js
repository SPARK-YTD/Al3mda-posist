import { supabase } from "./supabase.js";

let products = [];
let categories = [];
let allModifierGroups = [];

export async function renderProducts(container) {
  container.innerHTML = `
    <div class="admin-header">
      <h1>📦 المنتجات</h1>
      <button class="btn success" onclick="window.openProductForm()">➕ إضافة منتج</button>
    </div>

    <div class="filters">
      <div>
        <label>بحث</label>
        <input type="text" id="prodSearch" placeholder="اسم المنتج..." />
      </div>
      <div>
        <label>الفئة</label>
        <select id="prodCategoryFilter">
          <option value="">كل الفئات</option>
        </select>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>الاسم</th>
          <th>الفئة</th>
          <th>السعر</th>
          <th>إضافات</th>
          <th>الحالة</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody id="productsTable"></tbody>
    </table>
  `;

  await loadCategories();
  await loadModifierGroups();
  await loadProducts();

  document.getElementById("prodSearch").oninput = renderTable;
  document.getElementById("prodCategoryFilter").onchange = renderTable;
}

async function loadCategories() {
  const { data } = await supabase.from("categories").select("*").order("sort_order");
  categories = data || [];

  const sel = document.getElementById("prodCategoryFilter");
  if (sel) {
    sel.innerHTML = `<option value="">كل الفئات</option>` +
      categories.map(c => `<option value="${escapeAttr(c.slug)}">${escapeHtml(c.name)}</option>`).join("");
  }
}

async function loadModifierGroups() {
  const { data } = await supabase.from("modifier_groups").select("*").order("sort_order");
  allModifierGroups = data || [];
}

async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*, product_modifier_groups(group_id)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  products = data || [];
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("productsTable");
  if (!tbody) return;

  const search = (document.getElementById("prodSearch")?.value || "").toLowerCase();
  const cat = document.getElementById("prodCategoryFilter")?.value || "";

  const filtered = products.filter(p => {
    if (cat && p.category !== cat) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">📦<br><br>ما فيه منتجات</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  filtered.forEach(p => {
    const tr = document.createElement("tr");
    const catName = categories.find(c => c.slug === p.category)?.name || p.category;
    const modCount = (p.product_modifier_groups || []).length;

    tr.innerHTML = `
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(catName)}</td>
      <td style="color:var(--gold);font-weight:700">${Number(p.price).toFixed(3)}</td>
      <td>${modCount > 0 ? `<span style="background:rgba(212,175,55,0.15);color:var(--gold);padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600">${modCount} مجموعة</span>` : `<span style="color:var(--text-muted);font-size:12px">بدون</span>`}</td>
      <td><span class="${p.is_active ? 'status-active' : 'status-inactive'}">${p.is_active ? "🟢 نشط" : "🔴 معطّل"}</span></td>
    `;

    const actions = document.createElement("td");
    actions.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn secondary";
    editBtn.textContent = "تعديل";
    editBtn.onclick = () => openProductForm(p);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn secondary";
    toggleBtn.textContent = p.is_active ? "تعطيل" : "تفعيل";
    toggleBtn.onclick = () => toggleActive(p);

    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "حذف";
    delBtn.onclick = () => deleteProduct(p);

    actions.appendChild(editBtn);
    actions.appendChild(toggleBtn);
    actions.appendChild(delBtn);

    tr.appendChild(actions);
    tbody.appendChild(tr);
  });
}

window.openProductForm = function (product = null) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";
  box.style.maxWidth = "560px";

  const catOptions = categories.map(c =>
    `<option value="${escapeAttr(c.slug)}" ${product?.category === c.slug ? "selected" : ""}>${escapeHtml(c.name)}</option>`
  ).join("");

  const currentGroupIds = (product?.product_modifier_groups || []).map(g => g.group_id);

  box.innerHTML = `
    <h3>${product ? "✏️ تعديل منتج" : "➕ إضافة منتج"}</h3>

    <div class="form-grid">
      <div class="full">
        <label>اسم المنتج</label>
        <input type="text" id="prodName" value="${product ? escapeAttr(product.name) : ""}" placeholder="مثلاً: برجر دجاج" />
      </div>

      <div>
        <label>السعر (د.ب)</label>
        <input type="number" step="0.001" id="prodPrice" value="${product?.price ?? ""}" placeholder="2.500" />
      </div>

      <div>
        <label>الفئة</label>
        <select id="prodCategory">${catOptions}</select>
      </div>

      <div class="full">
        <label>رابط الصورة (اختياري)</label>
        <input type="text" id="prodImage" value="${product?.image_url ? escapeAttr(product.image_url) : ""}" placeholder="https://..." />
      </div>

      <div class="full">
        <label>مجموعات الإضافات (اختر اللي تبيها لهذا المنتج)</label>
        <div id="groupsCheckboxes" style="background:var(--bg-card-solid);border:1px solid var(--border);border-radius:10px;padding:12px;max-height:200px;overflow-y:auto"></div>
      </div>
    </div>

    <div class="popup-actions">
      <button class="btn success" id="saveProd">💾 حفظ</button>
      <button class="btn secondary" id="cancelProd">إلغاء</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // عرض قائمة مجموعات الإضافات
  const groupsBox = box.querySelector("#groupsCheckboxes");
  if (allModifierGroups.length === 0) {
    groupsBox.innerHTML = `<div style="color:var(--text-muted);font-size:13px">لا توجد مجموعات. أنشئ مجموعات من تاب "الإضافات".</div>`;
  } else {
    allModifierGroups.forEach(g => {
      const label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;transition:background 0.15s";
      label.onmouseenter = () => label.style.background = "var(--bg-hover)";
      label.onmouseleave = () => label.style.background = "transparent";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = g.id;
      checkbox.style.cssText = "width:auto;cursor:pointer";
      if (currentGroupIds.includes(g.id)) checkbox.checked = true;

      const text = document.createElement("span");
      text.textContent = `${g.name} (${g.min_select > 0 ? "إجباري" : "اختياري"} - حتى ${g.max_select})`;
      text.style.fontSize = "13px";

      label.appendChild(checkbox);
      label.appendChild(text);
      groupsBox.appendChild(label);
    });
  }

  box.querySelector("#cancelProd").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  box.querySelector("#saveProd").onclick = async () => {
    const name = box.querySelector("#prodName").value.trim();
    const price = Number(box.querySelector("#prodPrice").value);
    const category = box.querySelector("#prodCategory").value;
    const image_url = box.querySelector("#prodImage").value.trim() || null;

    if (!name) { alert("اكتب اسم المنتج"); return; }
    if (isNaN(price) || price < 0) { alert("السعر غير صحيح"); return; }
    if (!category) { alert("اختر فئة"); return; }

    const payload = { name, price, category, image_url };
    const selectedGroupIds = Array.from(groupsBox.querySelectorAll("input:checked")).map(cb => cb.value);

    let productId;
    let result;

    if (product) {
      // تعديل
      result = await supabase.from("products").update(payload).eq("id", product.id);
      productId = product.id;
    } else {
      // إضافة
      result = await supabase.from("products").insert(payload).select().single();
      productId = result.data?.id;
    }

    if (result.error) {
      alert("❌ " + result.error.message);
      return;
    }

    // تحديث الروابط مع مجموعات الإضافات
    if (productId) {
      // احذف الروابط القديمة
      await supabase.from("product_modifier_groups").delete().eq("product_id", productId);

      // أضف الروابط الجديدة
      if (selectedGroupIds.length > 0) {
        const links = selectedGroupIds.map((gid, idx) => ({
          product_id: productId,
          group_id: gid,
          sort_order: idx + 1
        }));
        await supabase.from("product_modifier_groups").insert(links);
      }
    }

    overlay.remove();
    loadProducts();
  };
};

async function toggleActive(p) {
  const { error } = await supabase
    .from("products")
    .update({ is_active: !p.is_active })
    .eq("id", p.id);

  if (error) { alert(error.message); return; }
  loadProducts();
}

async function deleteProduct(p) {
  if (!confirm(`حذف المنتج "${p.name}"؟`)) return;

  const { error } = await supabase.from("products").delete().eq("id", p.id);
  if (error) { alert(error.message); return; }
  loadProducts();
}

/* ========== Helpers ========== */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}
