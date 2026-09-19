/* =====================================================
   عيادة د. هشام الخطاب — منطق لوحة التحكم
   ===================================================== */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- عناصر عامة ---------- */
const $ = (id) => document.getElementById(id);
const screens = { splash: $("splash"), login: $("login"), dashboard: $("dashboard") };
const views = { home: $("homeView"), newPatient: $("newPatientView"), returning: $("returningView"), archive: $("archiveView") };

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function showView(name) {
  Object.values(views).forEach((v) => (v.hidden = true));
  views[name].hidden = false;
  $("navHome").classList.toggle("active", name === "home");
  $("navArchive").classList.toggle("active", name === "archive");
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg, type = "success") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

/* صور مصغّرة (تصغير تلقائي قبل الحفظ لتخفيف حجم البيانات) */
function readImage(file, maxSide = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =====================================================
   تسلسل الشاشات: ترحيب 3 ثوانٍ ← دخول ← لوحة التحكم
   ===================================================== */

const remembered = sessionStorage.getItem("clinic_auth") === "1";
window.addEventListener("load", () => {
  if (remembered) {
    showScreen("dashboard");
    showView("home");
  } else {
    showScreen("splash");
    setTimeout(() => showScreen("login"), 3000);
  }
});

$("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim().toLowerCase();
  const pass = $("loginPass").value;
  if (email === ADMIN_EMAIL.toLowerCase() && pass === ADMIN_PASSWORD) {
    sessionStorage.setItem("clinic_auth", "1");
    $("loginError").hidden = true;
    showScreen("dashboard");
    showView("home");
    $("loginForm").reset();
  } else {
    $("loginError").hidden = false;
  }
});

$("logoutBtn").addEventListener("click", (e) => {
  e.preventDefault();
  sessionStorage.removeItem("clinic_auth");
  showScreen("login");
  $("loginForm").reset();
});

$("navHome").addEventListener("click", (e) => { e.preventDefault(); showView("home"); });
$("navArchive").addEventListener("click", (e) => { e.preventDefault(); loadArchive(); showView("archive"); });

/* أزرار الرجوع */
document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.closest("#returningView")) { resetReturning(); showView("returning"); }
    else showView("home");
  });
});

/* =====================================================
   بطاقة: مريض جديد
   ===================================================== */
$("cardNewPatient").addEventListener("click", () => {
  $("newPatientForm").reset();
  $("photoPreviewWrap").hidden = true;
  $("photoPreview").removeAttribute("src");
  newPhotoData = null;
  showView("newPatient");
});

let newPhotoData = null;
$("pPhoto").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    newPhotoData = await readImage(file);
    $("photoPreview").src = newPhotoData;
    $("photoPreviewWrap").hidden = false;
  } catch {
    toast("تعذّر قراءة الصورة", "error");
  }
});
$("removePhoto").addEventListener("click", () => {
  newPhotoData = null;
  $("pPhoto").value = "";
  $("photoPreviewWrap").hidden = true;
});

$("newPatientForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("savePatientBtn");
  const name = $("pName").value.trim();
  const phone = $("pPhone").value.trim();

  if (!name || !phone) { toast("الاسم ورقم الهاتف مطلوبان", "error"); return; }

  btn.disabled = true;
  btn.textContent = "جارٍ الحفظ…";
  try {
    // فحص التكرار: نفس رقم الهاتف مسجّل سابقاً
    const { data: dup, error: dupErr } = await sb
      .from("patients")
      .select("id, name, phone")
      .eq("phone", phone)
      .maybeSingle();
    if (dupErr) throw dupErr;
    if (dup) {
      toast(`تم رفض الإضافة: هذا المريض مسجّل مسبقاً باسم «${dup.name}». استخدم بطاقة «مريض مراجع»`, "error");
      return;
    }

    const record = {
      name,
      phone,
      age: $("pAge").value ? Number($("pAge").value) : null,
      gender: $("pGender").value || null,
      address: $("pAddress").value.trim() || null,
      chronic: $("pChronic").value.trim() || null,
      condition: $("pCondition").value.trim(),
      notes: $("pNotes").value.trim() || null,
      photo: newPhotoData || null,
      created_at: new Date().toISOString(),
      last_visit: new Date().toISOString(),
    };

    const { data: inserted, error: insErr } = await sb.from("patients").insert(record).select().single();
    if (insErr) throw insErr;

    await sb.from("visits").insert({
      patient_id: inserted.id,
      visit_date: new Date().toISOString().slice(0, 10),
      diagnosis: "زيارة أولى — تسجيل المريض",
      prescription: $("pCondition").value.trim() || null,
      notes: null,
      photo: newPhotoData || null,
      created_at: new Date().toISOString(),
    });

    toast(`تم حفظ المريض «${name}» بنجاح في سجل المراجعين`, "success");
    $("newPatientForm").reset();
    newPhotoData = null;
    $("photoPreviewWrap").hidden = true;
    showView("home");
  } catch (err) {
    console.error(err);
    toast("حدث خطأ أثناء الحفظ: " + (err.message || err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "حفظ المريض";
  }
});

/* =====================================================
   بطاقة: مريض مراجع — بحث فوري واقتراحات
   ===================================================== */
$("cardReturning").addEventListener("click", () => {
  resetReturning();
  showView("returning");
});

let currentPatient = null;
let currentVisits = [];
let searchTimer;

function resetReturning() {
  $("searchInput").value = "";
  $("searchResults").hidden = true;
  $("patientDetails").hidden = true;
  $("visitFormCard").hidden = true;
  currentPatient = null;
  currentVisits = [];
}

$("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("searchInput").value.trim();
  if (!q) { $("searchResults").hidden = true; return; }
  searchTimer = setTimeout(() => searchPatients(q), 200);
});

async function searchPatients(q) {
  const esc = q.replace(/[%_,()]/g, (m) => "\\" + m);
  const { data, error } = await sb
    .from("patients")
    .select("id, name, phone, created_at")
    .or(`name.ilike.%${esc}%,phone.ilike.%${esc}%`)
    .order("name")
    .limit(8);
  if (error) { console.error(error); return; }
  const box = $("searchResults");
  box.innerHTML = "";
  if (!data.length) {
    box.innerHTML = `<li class="search-empty">لا توجد نتائج مطابقة — تأكد من الاسم أو الرقم، أو أضف المريض من بطاقة «مريض جديد»</li>`;
  } else {
    data.forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.phone)}</small>`;
      li.addEventListener("click", () => {
        $("searchInput").value = p.name;
        box.hidden = true;
        openPatient(p.id);
      });
      box.appendChild(li);
    });
  }
  box.hidden = false;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function openPatient(id) {
  const { data: p, error } = await sb.from("patients").select("*").eq("id", id).maybeSingle();
  if (error || !p) { toast("تعذّر جلب بيانات المريض", "error"); return; }
  currentPatient = p;

  const { data: visits } = await sb
    .from("visits")
    .select("*")
    .eq("patient_id", id)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false });
  currentVisits = visits || [];

  $("dName").textContent = p.name;
  $("dAvatar").textContent = p.name.trim().charAt(0) || "؟";
  $("dSince").textContent = "مسجّل منذ: " + fmtDate(p.created_at);
  $("dLastVisit").textContent = fmtDate(p.last_visit || p.created_at);
  $("dPhone").textContent = p.phone || "—";
  $("dAge").textContent = p.age ? p.age + " سنة" : "—";
  $("dGender").textContent = p.gender || "—";
  $("dAddress").textContent = p.address || "—";
  $("dChronic").textContent = p.chronic || "لا يوجد";
  $("dCondition").textContent = p.condition || "—";
  $("dNotes").textContent = p.notes || "—";

  if (p.photo) {
    $("dPhoto").src = p.photo;
    $("dPhotoSection").hidden = false;
  } else {
    $("dPhotoSection").hidden = true;
  }

  const list = $("dVisitsList");
  list.innerHTML = "";
  if (!currentVisits.length) {
    list.innerHTML = `<li class="visit-empty">لا توجد مراجعات مسجّلة بعد</li>`;
  } else {
    currentVisits.forEach((v) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<div class="visit-date">${fmtDate(v.visit_date)}</div>` +
        (v.diagnosis ? `<div class="visit-body"><b>التشخيص:</b> ${escapeHtml(v.diagnosis)}</div>` : "") +
        (v.prescription ? `<div class="visit-body"><b>الوصفة:</b> ${escapeHtml(v.prescription)}</div>` : "") +
        (v.vitals ? `<div class="visit-body"><b>القياسات:</b> ${escapeHtml(v.vitals)}</div>` : "") +
        (v.notes ? `<div class="visit-body"><b>ملاحظات:</b> ${escapeHtml(v.notes)}</div>` : "");
      list.appendChild(li);
    });
  }

  $("patientDetails").hidden = false;
  $("visitFormCard").hidden = true;
  $("searchResults").hidden = true;
}

/* ---------- مراجعة جديدة ---------- */
$("newVisitBtn").addEventListener("click", () => {
  $("vPatientName").textContent = currentPatient.name;
  $("visitForm").reset();
  $("vDate").value = new Date().toISOString().slice(0, 10);
  vPhotoData = null;
  $("vPhotoPreviewWrap").hidden = true;
  $("visitFormCard").hidden = false;
  $("visitFormCard").scrollIntoView({ behavior: "smooth" });
});

$("cancelVisitBtn").addEventListener("click", () => ($("visitFormCard").hidden = true));

let vPhotoData = null;
$("vPhoto").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    vPhotoData = await readImage(file);
    $("vPhotoPreview").src = vPhotoData;
    $("vPhotoPreviewWrap").hidden = false;
  } catch {
    toast("تعذّر قراءة الصورة", "error");
  }
});
$("vRemovePhoto").addEventListener("click", () => {
  vPhotoData = null;
  $("vPhoto").value = "";
  $("vPhotoPreviewWrap").hidden = true;
});

$("visitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("saveVisitBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الحفظ…";
  try {
    const visitDate = $("vDate").value || new Date().toISOString().slice(0, 10);
    const { error } = await sb.from("visits").insert({
      patient_id: currentPatient.id,
      visit_date: visitDate,
      vitals: $("vVitals").value.trim() || null,
      diagnosis: $("vDiagnosis").value.trim() || null,
      prescription: $("vPrescription").value.trim() || null,
      notes: $("vNotes").value.trim() || null,
      photo: vPhotoData || null,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;

    await sb.from("patients").update({ last_visit: visitDate }).eq("id", currentPatient.id);

    toast("تم حفظ المراجعة الجديدة وتحديث الأرشيف", "success");
    $("visitFormCard").hidden = true;
    await openPatient(currentPatient.id);
  } catch (err) {
    console.error(err);
    toast("حدث خطأ أثناء حفظ المراجعة: " + (err.message || err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "حفظ المراجعة";
  }
});

/* =====================================================
   حفظ الكشفية PDF
   ===================================================== */
$("pdfBtn").addEventListener("click", async () => {
  if (!currentPatient) return;
  const p = currentPatient;
  const btn = $("pdfBtn");
  btn.disabled = true;

  const photoSrc = p.photo || (currentVisits.find((v) => v.photo) || {}).photo || null;

  $("pdfSheet").innerHTML = `
    <div class="ps-header">
      <h1>عيادة د. هشام الخطاب</h1>
      <p>كشفية طبية — تاريخ الإصدار: ${fmtDate(new Date())}</p>
    </div>
    <h3>بيانات المريض</h3>
    <table>
      <tr><td class="k">اسم المريض</td><td>${escapeHtml(p.name)}</td></tr>
      <tr><td class="k">رقم الهاتف</td><td dir="ltr" style="text-align:right">${escapeHtml(p.phone)}</td></tr>
      <tr><td class="k">العمر</td><td>${p.age ? p.age + " سنة" : "—"}</td></tr>
      <tr><td class="k">الجنس</td><td>${escapeHtml(p.gender) || "—"}</td></tr>
      <tr><td class="k">العنوان</td><td>${escapeHtml(p.address) || "—"}</td></tr>
      <tr><td class="k">الأمراض المزمنة / الحساسية</td><td>${escapeHtml(p.chronic) || "لا يوجد"}</td></tr>
      <tr><td class="k">الحالة المرضية</td><td>${escapeHtml(p.condition) || "—"}</td></tr>
      <tr><td class="k">ملاحظات</td><td>${escapeHtml(p.notes) || "—"}</td></tr>
      <tr><td class="k">تاريخ آخر مراجعة</td><td>${fmtDate(p.last_visit || p.created_at)}</td></tr>
    </table>
    <h3>سجل المراجعات</h3>
    ${currentVisits.length
      ? currentVisits
          .map(
            (v) => `
      <div class="ps-visit">
        <div class="ps-visit-date">${fmtDate(v.visit_date)}</div>
        ${v.vitals ? `<p><b>القياسات:</b> ${escapeHtml(v.vitals)}</p>` : ""}
        ${v.diagnosis ? `<p><b>التشخيص:</b> ${escapeHtml(v.diagnosis)}</p>` : ""}
        ${v.prescription ? `<p><b>الوصفة:</b> ${escapeHtml(v.prescription)}</p>` : ""}
        ${v.notes ? `<p><b>ملاحظات:</b> ${escapeHtml(v.notes)}</p>` : ""}
      </div>`
          )
          .join("")
      : "<p style='font-size:13px'>لا توجد مراجعات مسجّلة.</p>"}
    ${photoSrc ? `<h3>صورة الوصفة الطبية</h3><img src="${photoSrc}">` : ""}
    <div class="ps-footer">
      <p>توقيع الطبيب: د. هشام الخطاب</p>
      <small>هذه الكشفية صادرة إلكترونياً من نظام عيادة د. هشام الخطاب</small>
    </div>`;

  try {
    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: `كشفية-${p.name.replace(/\s+/g, "-")}.pdf`,
      image: { type: "jpeg", quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }).from($("pdfSheet")).save();
    toast("تم تنزيل الكشفية بصيغة PDF", "success");
  } catch (err) {
    console.error(err);
    toast("تعذّر إنشاء ملف PDF", "error");
  } finally {
    btn.disabled = false;
  }
});

/* =====================================================
   أرشيف المرضى
   ===================================================== */
let archiveCache = [];

async function loadArchive() {
  const body = $("archiveBody");
  body.innerHTML = `<tr><td colspan="7" style="color:var(--muted)">جارٍ تحميل الأرشيف…</td></tr>`;
  const { data: patients, error } = await sb.from("patients").select("*").order("created_at", { ascending: false });
  if (error) {
    body.innerHTML = `<tr><td colspan="7" style="color:var(--danger)">تعذّر تحميل الأرشيف: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  archiveCache = patients || [];
  const { count } = await sb.from("visits").select("id", { count: "exact", head: true });
  $("statTotal").textContent = archiveCache.length;
  $("statVisits").textContent = count ?? "—";
  renderArchive("");
}

function renderArchive(q) {
  const body = $("archiveBody");
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? archiveCache.filter((p) => (p.name || "").toLowerCase().includes(needle) || (p.phone || "").includes(needle))
    : archiveCache;

  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<tr class="archive-empty"><td colspan="7">${needle ? "لا توجد نتائج مطابقة" : "الأرشيف فارغ — أضف أول مريض من بطاقة «مريض جديد»"}</td></tr>`;
    return;
  }
  rows.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td dir="ltr" style="text-align:right">${escapeHtml(p.phone)}</td>
      <td>${escapeHtml((p.condition || "").slice(0, 40))}${(p.condition || "").length > 40 ? "…" : ""}</td>
      <td>${fmtDate(p.created_at)}</td>
      <td>${fmtDate(p.last_visit || p.created_at)}</td>
      <td><button class="open-btn">عرض</button></td>`;
    tr.querySelector(".open-btn").addEventListener("click", () => {
      showView("returning");
      $("searchInput").value = p.name;
      openPatient(p.id);
    });
    body.appendChild(tr);
  });
}

$("archiveSearch").addEventListener("input", (e) => renderArchive(e.target.value));
