import { supabase } from "./supabase.js";

export async function renderSettings(container) {
  container.innerHTML = `
    <div class="admin-header">
      <h1>⚙️ الإعدادات</h1>
    </div>

    <!-- إعدادات المتجر -->
    <div style="background:var(--bg-card);backdrop-filter:blur(20px);border:1px solid var(--border);padding:24px;border-radius:16px;max-width:640px;margin-bottom:20px">
      <h3 style="margin-top:0;font-family:var(--font-display);color:var(--gold-light);font-size:18px;margin-bottom:18px">🏪 إعدادات المتجر</h3>

      <div class="form-grid">
        <div class="full">
          <label>اسم المتجر</label>
          <input type="text" id="storeName" />
        </div>

        <div>
          <label>العملة</label>
          <input type="text" id="currency" placeholder="د.ب" />
        </div>

        <div>
          <label>نسبة الضريبة (%)</label>
          <input type="number" step="0.01" id="taxRate" />
        </div>

        <div class="full">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="hideTax" style="width:auto;margin:0" />
            <span>إخفاء الضريبة (للأسعار شاملة الضريبة)</span>
          </label>
        </div>
      </div>

      <button class="btn success" id="saveSettings" style="margin-top:20px;width:auto;padding:12px 28px">💾 حفظ الإعدادات</button>
    </div>

    <!-- تغيير كلمة المرور -->
    <div style="background:var(--bg-card);backdrop-filter:blur(20px);border:1px solid var(--border);padding:24px;border-radius:16px;max-width:640px">
      <h3 style="margin-top:0;font-family:var(--font-display);color:var(--gold-light);font-size:18px;margin-bottom:18px">🔐 تغيير كلمة المرور</h3>

      <div class="form-grid">
        <div class="full">
          <label>كلمة المرور الحالية</label>
          <input type="password" id="currentPassword" autocomplete="current-password" />
        </div>

        <div class="full">
          <label>كلمة المرور الجديدة</label>
          <input type="password" id="newPassword" autocomplete="new-password" />
        </div>

        <div class="full">
          <label>تأكيد كلمة المرور الجديدة</label>
          <input type="password" id="confirmPassword" autocomplete="new-password" />
        </div>
      </div>

      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px;margin-top:14px;font-size:12px;color:var(--text-secondary);line-height:1.7">
        ⚠️ <strong style="color:var(--danger)">تنبيه:</strong> كلمة المرور لازم 6 أحرف على الأقل. بعد التغيير، استخدم الجديدة في الدخول.
      </div>

      <button class="btn primary" id="changePassword" style="margin-top:16px;width:auto;padding:12px 28px">🔄 تغيير الباسورد</button>
    </div>
  `;

  await loadSettings();

  document.getElementById("saveSettings").onclick = saveSettings;
  document.getElementById("changePassword").onclick = changePassword;
}

async function loadSettings() {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  document.getElementById("storeName").value = data.store_name || "";
  document.getElementById("currency").value = data.currency || "د.ب";
  document.getElementById("taxRate").value = data.tax_rate ?? 0;
  document.getElementById("hideTax").checked = data.hide_tax || false;
}

async function saveSettings() {
  const store_name = document.getElementById("storeName").value.trim();
  const currency = document.getElementById("currency").value.trim() || "د.ب";
  const tax_rate = Number(document.getElementById("taxRate").value) || 0;
  const hide_tax = document.getElementById("hideTax").checked;

  if (!store_name) { alert("اكتب اسم المتجر"); return; }
  if (tax_rate < 0 || tax_rate > 100) { alert("نسبة الضريبة غير منطقية"); return; }

  const btn = document.getElementById("saveSettings");
  btn.disabled = true;
  btn.textContent = "جاري الحفظ...";

  const { error } = await supabase
    .from("settings")
    .update({ store_name, currency, tax_rate, hide_tax })
    .eq("id", 1);

  btn.disabled = false;
  btn.textContent = "💾 حفظ الإعدادات";

  if (error) {
    alert("❌ " + error.message);
    return;
  }

  alert("✅ تم حفظ الإعدادات بنجاح");
}

async function changePassword() {
  const current = document.getElementById("currentPassword").value;
  const newPass = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmPassword").value;

  if (!current || !newPass || !confirm) {
    alert("املأ كل الحقول");
    return;
  }

  if (newPass.length < 6) {
    alert("كلمة المرور الجديدة لازم 6 أحرف على الأقل");
    return;
  }

  if (newPass !== confirm) {
    alert("كلمة المرور وتأكيدها غير متطابقين");
    return;
  }

  // اجلب الجلسة لمعرفة اليوزر
  const sessionRaw = localStorage.getItem("al3mda_admin_session");
  if (!sessionRaw) {
    alert("الجلسة منتهية، سجّل دخول من جديد");
    return;
  }

  const session = JSON.parse(sessionRaw);
  const username = session.user.username;

  // تحقق من الباسورد الحالي عبر RPC
  const { data, error } = await supabase.rpc("verify_admin_login", {
    input_username: username,
    input_password: current
  });

  if (error) {
    alert("❌ " + error.message);
    return;
  }

  if (!data || data.length === 0) {
    alert("❌ كلمة المرور الحالية غير صحيحة");
    return;
  }

  // غيّر الباسورد عبر RPC جديد
  const { error: updateError } = await supabase.rpc("change_admin_password", {
    input_username: username,
    new_password: newPass
  });

  if (updateError) {
    alert("❌ " + updateError.message);
    return;
  }

  alert("✅ تم تغيير كلمة المرور بنجاح");
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
}
