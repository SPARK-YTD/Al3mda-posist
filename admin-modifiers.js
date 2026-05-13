import { supabase } from "./supabase.js";

let groups = [];
let modifiersByGroup = {};

export async function renderModifiers(container) {
  container.innerHTML = `
    <div class="admin-header">
      <h1>🧩 الإضافات</h1>
      <button class="btn success" onclick="window.openGroupForm()">➕ إضافة مجموعة</button>
    </div>

    <div style="background:rgba(212,175,55,0.08);border:1px solid var(--border-gold);border-radius:12px;padding:14px;margin-bottom:20px;font-size:13px;color:var(--text-secondary);line-height:1.7">
      💡 <strong style="color:var(--gold-light)">المجموعات</strong> هي تصنيفات الإضافات (مثل: نوع الخبز، الصوصات، إضافات مدفوعة).<br>
      كل مجموعة فيها <strong style="color:var(--gold-light)">إضافات</strong> (مثل: ثوم، حار، جبنة).<br>
      تربط المجموعة بالمنتجات من تاب "المنتجات" → تعديل.
    </div>

    <div id="groupsList"></div>
  `;

  await loadAll();
}

async function loadAll() {
  // اجلب المجموعات
  const { data: g } = await supabase
    .from("modifier_groups")
    .select("*")
    .order("sort_order");

  groups = g || [];

  // اجلب كل الإضافات
  const { data: m } = await supabase
    .from("modifiers")
    .select("*")
    .order("sort_order");

  // قسّمها حسب المجموعة
  modifiersByGroup = {};
  (m || []).forEach(mod => {
    if (!modifiersByGroup[mod.group_id]) modifiersByGroup[mod.group_id] = [];
    modifiersByGroup[mod.group_id].push(mod);
  });

  renderGroups();
}

function renderGroups() {
  const box = document.getElementById("groupsList");
  if (!box) return;

  if (groups.length === 0) {
    box.innerHTML = `
      <div class="empty-state" data-icon="🧩">
        ما فيه مجموعات بعد. اضغط "إضافة مجموعة" لتبدأ.
      </div>
    `;
    return;
  }

  box.innerHTML = "";

  groups.forEach(g => {
    const card = document.createElement("div");
    card.style.cssText = "background:var(--bg-card);backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px";

    // رأس المجموعة
    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)";

    const titleBox = document.createElement("div");
    const isRequired = g.min_select > 0;
    const isSingle = g.max_select === 1;

    titleBox.innerHTML = `
      <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--gold-light);margin-bottom:6px">${escapeHtml(g.name)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isRequired
          ? `<span style="background:rgba(239,68,68,0.15);color:var(--danger);padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600">إجباري</span>`
          : `<span style="background:rgba(255,255,255,0.05);color:var(--text-muted);padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600">اختياري</span>`}
        <span style="background:rgba(212,175,55,0.1);color:var(--gold);padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600">${isSingle ? "اختيار واحد" : `حتى ${g.max_select}`}</span>
        <span style="background:rgba(255,255,255,0.05);color:var(--text-muted);padding:3px 10px;border-radius:6px;font-size:11px">ترتيب: ${g.sort_order}</span>
      </div>
    `;
    header.appendChild(titleBox);

    const headerActions = document.createElement("div");
    headerActions.style.cssText = "display:flex;gap:6px";

    const addModBtn = document.createElement("button");
    addModBtn.className = "btn success";
    addModBtn.style.cssText = "width:auto;padding:8px 14px;font-size:12px";
    addModBtn.textContent = "➕ إضافة";
    addModBtn.onclick = () => openModifierForm(g.id);

    const editGroupBtn = document.createElement("button");
    editGroupBtn.className = "btn secondary";
    editGroupBtn.style.cssText = "width:auto;padding:8px 14px;font-size:12px";
    editGroupBtn.textContent = "تعديل";
    editGroupBtn.onclick = () => openGroupForm(g);

    const delGroupBtn = document.createElement("button");
    delGroupBtn.className = "btn danger";
    delGroupBtn.style.cssText = "width:auto;padding:8px 14px;font-size:12px";
    delGroupBtn.textContent = "حذف";
    delGroupBtn.onclick = () => deleteGroup(g);

    headerActions.appendChild(addModBtn);
    headerActions.appendChild(editGroupBtn);
    headerActions.appendChild(delGroupBtn);
    header.appendChild(headerActions);

    card.appendChild(header);

    // قائمة الإضافات داخل المجموعة
    const mods = modifiersByGroup[g.id] || [];

    if (mods.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:20px;text-align:center;color:var(--text-muted);font-size:13px";
      empty.textContent = "ما فيه إضافات في هذي المجموعة بعد";
      card.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px";

      mods.forEach(m => {
        const modCard = document.createElement("div");
        modCard.style.cssText = `
          background:${m.is_active ? 'rgba(0,0,0,0.2)' : 'rgba(239,68,68,0.05)'};
          border:1px solid ${m.is_active ? 'var(--border)' : 'rgba(239,68,68,0.2)'};
          border-radius:10px;
          padding:12px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
        `;

        const left = document.createElement("div");
        left.innerHTML = `
          <div style="font-weight:600;font-size:14px;color:${m.is_active ? 'var(--text-primary)' : 'var(--text-muted)'};margin-bottom:4px">${escapeHtml(m.name)}</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:13px;color:${Number(m.price) > 0 ? 'var(--gold)' : 'var(--success)'}">${Number(m.price) > 0 ? `+${Number(m.price).toFixed(3)}` : "مجاني"}</div>
        `;

        const right = document.createElement("div");
        right.style.cssText = "display:flex;gap:4px";

        const editBtn = document.createElement("button");
        editBtn.className = "btn secondary";
        editBtn.style.cssText = "width:auto;padding:5px 10px;font-size:11px";
        editBtn.textContent = "✏️";
        editBtn.title = "تعديل";
        editBtn.onclick = () => openModifierForm(g.id, m);

        const toggleBtn = document.createElement("button");
        toggleBtn.className = "btn secondary";
        toggleBtn.style.cssText = "width:auto;padding:5px 10px;font-size:11px";
        toggleBtn.textContent = m.is_active ? "🟢" : "🔴";
        toggleBtn.title = m.is_active ? "تعطيل" : "تفعيل";
        toggleBtn.onclick = () => toggleModifier(m);

        const delBtn = document.createElement("button");
        delBtn.className = "btn danger";
        delBtn.style.cssText = "width:auto;padding:5px 10px;font-size:11px";
        delBtn.textContent = "🗑";
        delBtn.title = "حذف";
        delBtn.onclick = () => deleteModifier(m);

        right.appendChild(editBtn);
        right.appendChild(toggleBtn);
        right.appendChild(delBtn);

        modCard.appendChild(left);
        modCard.appendChild(right);
        grid.appendChild(modCard);
      });

      card.appendChild(grid);
    }

    box.appendChild(card);
  });
}

/* ========== نموذج مجموعة ========== */
window.openGroupForm = function (group = null) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";

  box.innerHTML = `
    <h3>${group ? "✏️ تعديل مجموعة" : "➕ مجموعة جديدة"}</h3>

    <div class="form-grid">
      <div class="full">
        <label>اسم المجموعة</label>
        <input type="text" id="grpName" value="${group ? escapeAttr(group.name) : ""}" placeholder="مثلاً: الصوصات" />
      </div>

      <div>
        <label>الحد الأدنى</label>
        <input type="number" id="grpMin" value="${group?.min_select ?? 0}" min="0" />
      </div>

      <div>
        <label>الحد الأقصى</label>
        <input type="number" id="grpMax" value="${group?.max_select ?? 1}" min="1" />
      </div>

      <div class="full">
        <label>الترتيب</label>
        <input type="number" id="grpOrder" value="${group?.sort_order ?? 0}" />
      </div>
    </div>

    <div style="background:rgba(212,175,55,0.08);border:1px solid var(--border-gold);border-radius:10px;padding:12px;margin-top:12px;font-size:12px;color:var(--text-secondary);line-height:1.7">
      💡 <strong style="color:var(--gold-light)">الحد الأدنى = 0</strong> → اختياري<br>
      💡 <strong style="color:var(--gold-light)">الحد الأدنى = 1</strong> → إجباري (لازم يختار)<br>
      💡 <strong style="color:var(--gold-light)">الحد الأقصى = 1</strong> → اختيار واحد فقط (radio)<br>
      💡 <strong style="color:var(--gold-light)">الحد الأقصى > 1</strong> → اختيارات متعددة (checkbox)
    </div>

    <div class="popup-actions">
      <button class="btn success" id="saveGrp">💾 حفظ</button>
      <button class="btn secondary" id="cancelGrp">إلغاء</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector("#cancelGrp").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  box.querySelector("#saveGrp").onclick = async () => {
    const name = box.querySelector("#grpName").value.trim();
    const min_select = Number(box.querySelector("#grpMin").value) || 0;
    const max_select = Number(box.querySelector("#grpMax").value) || 1;
    const sort_order = Number(box.querySelector("#grpOrder").value) || 0;

    if (!name) { alert("اكتب اسم المجموعة"); return; }
    if (max_select < 1) { alert("الحد الأقصى لازم 1 على الأقل"); return; }
    if (min_select > max_select) { alert("الحد الأدنى لا يقدر يكون أكبر من الأقصى"); return; }

    const payload = { name, min_select, max_select, sort_order };

    let result;
    if (group) {
      result = await supabase.from("modifier_groups").update(payload).eq("id", group.id);
    } else {
      result = await supabase.from("modifier_groups").insert(payload);
    }

    if (result.error) {
      alert("❌ " + result.error.message);
      return;
    }

    overlay.remove();
    loadAll();
  };
};

async function deleteGroup(g) {
  // تحقق إذا مربوطة بمنتجات
  const { count } = await supabase
    .from("product_modifier_groups")
    .select("*", { count: "exact", head: true })
    .eq("group_id", g.id);

  if (count && count > 0) {
    if (!confirm(`هذي المجموعة مربوطة بـ ${count} منتج. حذفها يحذف الارتباط. متأكد؟`)) return;
  } else {
    if (!confirm(`حذف المجموعة "${g.name}" وكل إضافاتها؟`)) return;
  }

  const { error } = await supabase.from("modifier_groups").delete().eq("id", g.id);
  if (error) { alert(error.message); return; }
  loadAll();
}

/* ========== نموذج إضافة ========== */
function openModifierForm(groupId, modifier = null) {
  const overlay = document.createElement("div");
  overlay.className = "popup-overlay";

  const box = document.createElement("div");
  box.className = "popup-box";

  box.innerHTML = `
    <h3>${modifier ? "✏️ تعديل إضافة" : "➕ إضافة جديدة"}</h3>

    <div class="form-grid">
      <div class="full">
        <label>اسم الإضافة</label>
        <input type="text" id="modName" value="${modifier ? escapeAttr(modifier.name) : ""}" placeholder="مثلاً: جبنة" />
      </div>

      <div>
        <label>السعر (0 = مجاني)</label>
        <input type="number" step="0.001" id="modPrice" value="${modifier?.price ?? 0}" placeholder="0.500" />
      </div>

      <div>
        <label>الترتيب</label>
        <input type="number" id="modOrder" value="${modifier?.sort_order ?? 0}" />
      </div>
    </div>

    <div class="popup-actions">
      <button class="btn success" id="saveMod">💾 حفظ</button>
      <button class="btn secondary" id="cancelMod">إلغاء</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector("#cancelMod").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  box.querySelector("#saveMod").onclick = async () => {
    const name = box.querySelector("#modName").value.trim();
    const price = Number(box.querySelector("#modPrice").value) || 0;
    const sort_order = Number(box.querySelector("#modOrder").value) || 0;

    if (!name) { alert("اكتب اسم الإضافة"); return; }
    if (price < 0) { alert("السعر غير صحيح"); return; }

    const payload = { group_id: groupId, name, price, sort_order };

    let result;
    if (modifier) {
      result = await supabase.from("modifiers").update(payload).eq("id", modifier.id);
    } else {
      result = await supabase.from("modifiers").insert(payload);
    }

    if (result.error) {
      alert("❌ " + result.error.message);
      return;
    }

    overlay.remove();
    loadAll();
  };
}

async function toggleModifier(m) {
  const { error } = await supabase
    .from("modifiers")
    .update({ is_active: !m.is_active })
    .eq("id", m.id);

  if (error) { alert(error.message); return; }
  loadAll();
}

async function deleteModifier(m) {
  if (!confirm(`حذف الإضافة "${m.name}"؟`)) return;

  const { error } = await supabase.from("modifiers").delete().eq("id", m.id);
  if (error) { alert(error.message); return; }
  loadAll();
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(str) { return escapeHtml(str); }
