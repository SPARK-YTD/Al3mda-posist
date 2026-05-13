import { supabase } from "./supabase.js";
import { renderProducts } from "./admin-products.js";
import { renderCategories } from "./admin-categories.js";
import { renderModifiers } from "./admin-modifiers.js";
import { renderSales } from "./admin-sales.js";
import { renderSettings } from "./admin-settings.js";

const SESSION_KEY = "al3mda_admin_session";
const SESSION_TIMEOUT = 60 * 60 * 1000; // ساعة

/* ========== إدارة الجلسة ========== */
function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    user,
    expiresAt: Date.now() + SESSION_TIMEOUT
  }));
}

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* ========== تسجيل الدخول ========== */
window.doLogin = async function () {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorBox = document.getElementById("loginError");

  errorBox.style.display = "none";

  if (!username || !password) {
    errorBox.textContent = "❌ أدخل اسم المستخدم وكلمة المرور";
    errorBox.style.display = "block";
    return;
  }

  const { data, error } = await supabase.rpc("verify_admin_login", {
    input_username: username,
    input_password: password
  });

  if (error) {
    console.error(error);
    errorBox.textContent = "❌ خطأ في الاتصال بقاعدة البيانات";
    errorBox.style.display = "block";
    return;
  }

  if (!data || data.length === 0) {
    errorBox.textContent = "❌ بيانات الدخول غير صحيحة";
    errorBox.style.display = "block";
    return;
  }

  saveSession(data[0]);
  showAdmin();
};

window.doLogout = function () {
  clearSession();
  location.reload();
};

/* ========== التابات ========== */
const tabs = {
  products: renderProducts,
  categories: renderCategories,
  modifiers: renderModifiers,
  sales: renderSales,
  settings: renderSettings
};

function showTab(name) {
  if (name === "logout") {
    if (confirm("هل تريد تسجيل الخروج؟")) doLogout();
    return;
  }

  document.querySelectorAll(".admin-sidebar [data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === name);
  });

  const container = document.getElementById("tabContent");
  container.innerHTML = "";

  if (tabs[name]) {
    tabs[name](container);
  }
}

/* Enter للدخول */
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.getElementById("loginScreen").style.display !== "none") {
    doLogin();
  }
});

/* ========== عرض الإدارة ========== */
function showAdmin() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("adminApp").style.display = "flex";

  document.querySelectorAll(".admin-sidebar [data-tab]").forEach(btn => {
    btn.onclick = () => showTab(btn.dataset.tab);
  });

  showTab("products");
}

/* ========== بدء التشغيل ========== */
window.addEventListener("DOMContentLoaded", () => {
  const session = getSession();
  if (session) {
    showAdmin();
  }
});
