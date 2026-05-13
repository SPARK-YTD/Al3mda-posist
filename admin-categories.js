import { supabase } from "./supabase.js";

let categories = [];

export async function renderCategories(container) {
  container.innerHTML = `
    <div class="admin-header">
      <h1>📁 الفئات</h1>
      <button class="btn success" onclick="window.openCategoryForm()">➕ إضافة فئة</button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>الترتيب</th>
          <th>الأيقونة</th>
          <th>الاسم</th>
          <th>المعرّف (slug)</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody id="categoriesTable"></tbody>
    </table>
  `;

  await loadCategories();
}

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
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("categoriesTable");
  if (!tbody) return;

  if (categories.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">📁<br><br>ما فيه فئات</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  categories.forEach(c => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong style="color:var(--gold)">${c.sort_order}</strong></td>
      <td style="font-size:24px">${escapeHtml(c.icon || "")}</td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td><code style="background:var(--bg-card-solid);padding:4px 10px;border-radius:6px;color:var(--gold-light);font-size:12px">${escapeHtml(c.slug)}</code></td>
    `;

    const actions = document.createElement("td");
    actions.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn secondary";
    editBtn.textContent = "تعديل";
    editBtn.onclick = () => openCategoryForm(c);

    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "حذف";
    delBtn.onclick = () => deleteCategory(c);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    tr.appendChild(actions);
    tbody.appendChild(tr);
  });
}

window.openCategoryForm = function (category = null) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";

  box.innerHTML = `
    <h3>${category ? "✏️ تعديل فئة" : "➕ إضافة فئة"}</h3>

    <div class="form-grid">
      <div class="full">
        <label>اسم الفئة</label>
        <input type="text" id="catName" value="${category ? escapeAttr(category.name) : ""}" placeholder="ساندوتشات" />
      </div>

      <div>
        <label>المعرّف (slug)</label>
        <input type="text" id="catSlug" value="${category ? escapeAttr(category.slug) : ""}" placeholder="sandwiches" />
      </div>

      <div>
        <label>الأيقونة (إيموجي)</label>
        <input type="text" id="catIcon" value="${category ? escapeAttr(category.icon || "") : ""}" placeholder="🥪" />
      </div>

      <div class="full">
        <label>الترتيب</label>
        <input type="number" id="catOrder" value="${category?.sort_order ?? 0}" />
      </div>
    </div>

    <div style="background:rgba(212,175,55,0.08);border:1px solid var(--border-gold);border-radius:10px;padding:10px;margin-top:12px;font-size:12px;color:var(--text-secondary)">
      💡 المعرّف (slug) لازم بحروف إنجليزية صغيرة فقط، يستخدم داخلياً لربط المنتجات بالفئة.
    </div>

    <div class="popup-actions">
      <button class="btn success" id="saveCat">💾 حفظ</button>
      <button class="btn secondary" id="cancelCat">إلغاء</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector("#cancelCat").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  box.querySelector("#saveCat").onclick = async () => {
    const name = box.querySelector("#catName").value.trim();
    const slug = box.querySelector("#catSlug").value.trim().toLowerCase();
    const icon = box.querySelector("#catIcon").value.trim() || null;
    const sort_order = Number(box.querySelector("#catOrder").value) || 0;

    if (!name) { alert("اكتب اسم الفئة"); return; }
    if (!slug || !/^[a-z0-9_-]+$/.test(slug)) {
      alert("المعرّف لازم حروف إنجليزية صغيرة وأرقام فقط");
      return;
    }

    const payload = { name, slug, icon, sort_order };

    let result;
    if (category) {
      result = await supabase.from("categories").update(payload).eq("id", category.id);
    } else {
      result = await supabase.from("categories").insert(payload);
    }

    if (result.error) {
      alert("❌ " + result.error.message);
      return;
    }

    overlay.remove();
    loadCategories();
  };
};

async function deleteCategory(c) {
  // تحقق إذا فيه منتجات في الفئة
  const { count } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("category", c.slug);

  if (count && count > 0) {
    alert(`لا يمكن حذف الفئة — فيها ${count} منتج. احذف المنتجات أو غيّر فئتها أولاً.`);
    return;
  }

  if (!confirm(`حذف الفئة "${c.name}"؟`)) return;

  const { error } = await supabase.from("categories").delete().eq("id", c.id);
  if (error) { alert(error.message); return; }
  loadCategories();
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(str) { return escapeHtml(str); }
