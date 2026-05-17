import { supabase } from "./supabase.js";

let products = [];
let categories = [];
let allModifierGroups = [];

const STORAGE_BUCKET = "products";
const MAX_DIMENSION = 600;       // أكبر بُعد للصورة
const JPEG_QUALITY = 0.8;        // جودة الضغط 80%
const MAX_ORIGINAL_SIZE = 10 * 1024 * 1024; // 10 ميجا حد أعلى للأصل

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
          <th>الصورة</th>
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">📦<br><br>ما فيه منتجات</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  filtered.forEach(p => {
    const tr = document.createElement("tr");
    const catName = categories.find(c => c.slug === p.category)?.name || p.category;
    const modCount = (p.product_modifier_groups || []).length;

    // الصورة المصغّرة في الجدول
    const imgCell = p.image_url
      ? `<img src="${escapeAttr(p.image_url)}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" onerror="this.style.display='none'" />`
      : `<div style="width:50px;height:50px;background:var(--bg-dark);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;border:1px solid var(--border)">🍽️</div>`;

    tr.innerHTML = `
      <td>${imgCell}</td>
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

/* ========== ضغط الصورة ========== */
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("فشل تحميل الصورة"));
      img.onload = () => {
        // حساب الأبعاد الجديدة مع الحفاظ على النسبة
        let { width, height } = img;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        // رسم على canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // خلفية بيضاء (للـ PNG الشفاف)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // رسم بجودة عالية
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // تحويل لـ blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("فشل ضغط الصورة"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ========== رفع الصورة لـ Supabase Storage ========== */
async function uploadImage(blob) {
  // اسم فريد للملف
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const filename = `product_${timestamp}_${random}.jpg`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filename, blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  // جيب الرابط العام
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filename);

  return urlData.publicUrl;
}

/* ========== حذف الصورة من Storage ========== */
async function deleteImage(imageUrl) {
  if (!imageUrl) return;

  try {
    // استخراج اسم الملف من الرابط
    const match = imageUrl.match(/\/products\/([^?]+)/);
    if (!match) return;
    const filename = match[1];

    await supabase.storage.from(STORAGE_BUCKET).remove([filename]);
  } catch (err) {
    console.error("فشل حذف الصورة:", err);
  }
}
/* ========== نموذج المنتج ========== */
window.openProductForm = function (product = null) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";
  box.style.maxWidth = "580px";

  const catOptions = categories.map(c =>
    `<option value="${escapeAttr(c.slug)}" ${product?.category === c.slug ? "selected" : ""}>${escapeHtml(c.name)}</option>`
  ).join("");

  const currentGroupIds = (product?.product_modifier_groups || []).map(g => g.group_id);

  // حالة الصورة الحالية
  let currentImageUrl = product?.image_url || null;
  let pendingBlob = null;        // الصورة المضغوطة الجديدة (قبل الرفع)
  let oldImageToDelete = null;   // صورة قديمة نحذفها بعد الحفظ

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
        <label>صورة المنتج</label>

        <div id="imagePreviewBox" style="
          background:var(--bg-deep);
          border:2px dashed var(--border-strong);
          border-radius:12px;
          padding:16px;
          text-align:center;
          min-height:180px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:10px;
        ">
          ${currentImageUrl
            ? `<img id="previewImg" src="${escapeAttr(currentImageUrl)}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--border)" />`
            : `<div style="font-size:48px;opacity:0.4">🖼️</div><div style="color:var(--text-muted);font-size:13px">لا توجد صورة</div>`
          }
        </div>

        <input type="file" id="prodImageFile" accept="image/jpeg,image/png,image/webp" style="display:none" />

        <div style="display:flex;gap:8px;margin-top:10px">
          <button type="button" class="btn primary" id="chooseImageBtn" style="flex:1">
            📷 ${currentImageUrl ? "تغيير الصورة" : "اختر صورة"}
          </button>
          ${currentImageUrl ? `<button type="button" class="btn danger" id="removeImageBtn" style="flex:0 0 auto">🗑 حذف</button>` : ""}
        </div>

        <div id="imageStatus" style="margin-top:8px;font-size:12px;color:var(--text-muted);text-align:center"></div>
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

  // قائمة مجموعات الإضافات
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

  /* ========== التعامل مع الصورة ========== */
  const fileInput = box.querySelector("#prodImageFile");
  const chooseBtn = box.querySelector("#chooseImageBtn");
  const previewBox = box.querySelector("#imagePreviewBox");
  const statusEl = box.querySelector("#imageStatus");
  const removeBtn = box.querySelector("#removeImageBtn");

  chooseBtn.onclick = () => fileInput.click();

  if (removeBtn) {
    removeBtn.onclick = () => {
      // نحفظ الرابط القديم للحذف عند الحفظ
      if (currentImageUrl) oldImageToDelete = currentImageUrl;
      currentImageUrl = null;
      pendingBlob = null;
      previewBox.innerHTML = `
        <div style="font-size:48px;opacity:0.4">🖼️</div>
        <div style="color:var(--text-muted);font-size:13px">لا توجد صورة</div>
      `;
      chooseBtn.innerHTML = "📷 اختر صورة";
      removeBtn.style.display = "none";
      statusEl.textContent = "";
    };
  }

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // تحقق من النوع
    if (!file.type.startsWith("image/")) {
      statusEl.style.color = "var(--danger)";
      statusEl.textContent = "❌ الملف ليس صورة";
      return;
    }

    // تحقق من الحجم
    if (file.size > MAX_ORIGINAL_SIZE) {
      statusEl.style.color = "var(--danger)";
      statusEl.textContent = `❌ الصورة كبيرة جداً (الحد الأقصى ${MAX_ORIGINAL_SIZE / 1024 / 1024}MB)`;
      return;
    }

    statusEl.style.color = "var(--text-muted)";
    statusEl.textContent = "⏳ جاري الضغط...";
    chooseBtn.disabled = true;

    try {
      const originalSize = (file.size / 1024).toFixed(1);
      const blob = await compressImage(file);
      const newSize = (blob.size / 1024).toFixed(1);

      pendingBlob = blob;

      // لو فيه صورة قديمة، نحفظها للحذف
      if (currentImageUrl) oldImageToDelete = currentImageUrl;

      // معاينة
      const previewUrl = URL.createObjectURL(blob);
      previewBox.innerHTML = `<img id="previewImg" src="${previewUrl}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--border)" />`;

      chooseBtn.innerHTML = "📷 تغيير الصورة";
      statusEl.style.color = "var(--success)";
      statusEl.textContent = `✅ تم الضغط: ${originalSize}KB → ${newSize}KB`;

      // إظهار زر الحذف
      if (!removeBtn) {
        const btnRow = chooseBtn.parentElement;
        const newRemoveBtn = document.createElement("button");
        newRemoveBtn.type = "button";
        newRemoveBtn.className = "btn danger";
        newRemoveBtn.id = "removeImageBtn";
        newRemoveBtn.style.flex = "0 0 auto";
        newRemoveBtn.textContent = "🗑 حذف";
        newRemoveBtn.onclick = () => {
          pendingBlob = null;
          if (currentImageUrl) oldImageToDelete = currentImageUrl;
          currentImageUrl = null;
          previewBox.innerHTML = `
            <div style="font-size:48px;opacity:0.4">🖼️</div>
            <div style="color:var(--text-muted);font-size:13px">لا توجد صورة</div>
          `;
          chooseBtn.innerHTML = "📷 اختر صورة";
          newRemoveBtn.remove();
          statusEl.textContent = "";
        };
        btnRow.appendChild(newRemoveBtn);
      }
    } catch (err) {
      statusEl.style.color = "var(--danger)";
      statusEl.textContent = "❌ فشل ضغط الصورة: " + err.message;
    } finally {
      chooseBtn.disabled = false;
      fileInput.value = ""; // عشان نقدر نختار نفس الملف مرة ثانية
    }
  };
  /* ========== الإلغاء ========== */
  box.querySelector("#cancelProd").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  /* ========== الحفظ ========== */
  box.querySelector("#saveProd").onclick = async () => {
    const name = box.querySelector("#prodName").value.trim();
    const price = Number(box.querySelector("#prodPrice").value);
    const category = box.querySelector("#prodCategory").value;

    if (!name) { alert("اكتب اسم المنتج"); return; }
    if (isNaN(price) || price < 0) { alert("السعر غير صحيح"); return; }
    if (!category) { alert("اختر فئة"); return; }

    const saveBtn = box.querySelector("#saveProd");
    saveBtn.disabled = true;
    saveBtn.textContent = "جاري الحفظ...";

    try {
      // 1. رفع الصورة الجديدة (إن وجدت)
      let finalImageUrl = currentImageUrl;

      if (pendingBlob) {
        statusEl.style.color = "var(--text-muted)";
        statusEl.textContent = "⏳ جاري رفع الصورة...";
        finalImageUrl = await uploadImage(pendingBlob);
      }

      // 2. حفظ المنتج
      const payload = {
        name,
        price,
        category,
        image_url: finalImageUrl
      };

      const selectedGroupIds = Array.from(groupsBox.querySelectorAll("input:checked")).map(cb => cb.value);

      let productId;
      let result;

      if (product) {
        result = await supabase.from("products").update(payload).eq("id", product.id);
        productId = product.id;
      } else {
        result = await supabase.from("products").insert(payload).select().single();
        productId = result.data?.id;
      }

      if (result.error) throw result.error;

      // 3. تحديث روابط مجموعات الإضافات
      if (productId) {
        await supabase.from("product_modifier_groups").delete().eq("product_id", productId);

        if (selectedGroupIds.length > 0) {
          const links = selectedGroupIds.map((gid, idx) => ({
            product_id: productId,
            group_id: gid,
            sort_order: idx + 1
          }));
          await supabase.from("product_modifier_groups").insert(links);
        }
      }

      // 4. حذف الصورة القديمة من Storage (لو في)
      if (oldImageToDelete) {
        await deleteImage(oldImageToDelete);
      }

      overlay.remove();
      loadProducts();
    } catch (err) {
      console.error(err);
      alert("❌ " + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 حفظ";
    }
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

  // احذف من قاعدة البيانات
  const { error } = await supabase.from("products").delete().eq("id", p.id);
  if (error) { alert(error.message); return; }

  // احذف الصورة من Storage
  if (p.image_url) {
    await deleteImage(p.image_url);
  }

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
