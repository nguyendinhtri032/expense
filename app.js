// ============================================================
// DB
// ============================================================
const DB_NAME = 'expenseDB';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('expenses')) {
        const s = d.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!d.objectStoreNames.contains('budgets')) {
        const s = d.createObjectStore('budgets', { keyPath: 'id' });
        s.createIndex('month', 'month', { unique: false });
        s.createIndex('category', 'category', { unique: false });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

function tx(store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// Categories
// ============================================================
const CATEGORIES = {
  food: '🍜 Ăn uống',
  other: '📦 Khác'
};

const CAT_ICONS = {
  food: '🍜', other: '📦'
};

// ============================================================
// Date helpers (Asia/Ho_Chi_Minh)
// ============================================================
function vnNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

function toISO(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toVNDate(isoStr) {
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

function getMonth(isoDate) {
  return isoDate.substring(0, 7);
}

function formatMoney(n) {
  return n.toLocaleString('vi-VN') + ' đ';
}

// Money input formatting
function formatMoneyInput(value) {
  const num = String(value).replace(/[^\d]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString('en-US');
}

function parseMoneyInput(str) {
  return Number(String(str).replace(/[^\d]/g, '')) || 0;
}

function setupMoneyInput(input) {
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const oldLen = input.value.length;
    const raw = input.value.replace(/[^\d]/g, '');
    input.value = formatMoneyInput(raw);
    const newLen = input.value.length;
    const newPos = Math.max(0, pos + (newLen - oldLen));
    input.setSelectionRange(newPos, newPos);
  });
}

function setMoneyInputValue(input, num) {
  input.value = num ? formatMoneyInput(num) : '';
}

// ============================================================
// State
// ============================================================
let selectedMonth = localStorage.getItem('selectedMonth') || toISO(vnNow()).substring(0, 7);

// ============================================================
// DOM refs
// ============================================================
const $monthSelector = document.getElementById('month-selector');
const $totalSpent = document.getElementById('total-spent');
const $totalBudget = document.getElementById('total-budget');
const $totalRemaining = document.getElementById('total-remaining');
const $budgetList = document.getElementById('budget-list');
const $expenseList = document.getElementById('expense-list');
const $expenseEmpty = document.getElementById('expense-empty');

// Expense modal
const $modalExpense = document.getElementById('modal-expense');
const $formExpense = document.getElementById('form-expense');
const $expenseId = document.getElementById('expense-id');
const $expenseTitle = document.getElementById('expense-title');
const $expenseAmount = document.getElementById('expense-amount');
const $expenseCategory = document.getElementById('expense-category');
const $expenseDate = document.getElementById('expense-date');
const $expenseImages = document.getElementById('expense-images');
const $expenseImagePreview = document.getElementById('expense-image-preview');
const $expenseBudgetInfo = document.getElementById('expense-budget-info');
const $btnDeleteExpense = document.getElementById('btn-delete-expense');
const $modalExpenseTitle = document.getElementById('modal-expense-title');

// Budget modal
const $modalBudget = document.getElementById('modal-budget');
const $formBudget = document.getElementById('form-budget');
const $budgetCategory = document.getElementById('budget-category');
const $budgetAmount = document.getElementById('budget-amount');
const $btnDeleteBudget = document.getElementById('btn-delete-budget');
const $modalBudgetTitle = document.getElementById('modal-budget-title');

// Settings modal
const $modalSettings = document.getElementById('modal-settings');

// Detail view refs
const $expenseDetail = document.getElementById('expense-detail');
const $detailTitle = document.getElementById('detail-title');
const $detailAmount = document.getElementById('detail-amount');
const $detailCategory = document.getElementById('detail-category');
const $detailDate = document.getElementById('detail-date');
const $detailImages = document.getElementById('detail-images');
const $btnEditExpense = document.getElementById('btn-edit-expense');

// Image viewer refs
const $imageViewer = document.getElementById('image-viewer');
const $imageViewerImg = document.getElementById('image-viewer-img');
const $imageViewerClose = document.getElementById('image-viewer-close');

let editingBudgetId = null;
let currentImages = []; // Blob[]
let currentExpenseData = null; // for detail→edit transition

// ============================================================
// Modal helpers
// ============================================================
function openModal(el) { el.style.display = 'flex'; }
function closeModal(el) { el.style.display = 'none'; }

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(document.getElementById(btn.dataset.close)));
});

document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m); });
});

// ============================================================
// Toast
// ============================================================
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ============================================================
// Month navigation
// ============================================================
$monthSelector.value = selectedMonth;

$monthSelector.addEventListener('change', () => {
  selectedMonth = $monthSelector.value;
  localStorage.setItem('selectedMonth', selectedMonth);
  refresh();
});

document.getElementById('btn-prev-month').addEventListener('click', () => {
  const [y, m] = selectedMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  $monthSelector.value = selectedMonth;
  localStorage.setItem('selectedMonth', selectedMonth);
  refresh();
});

document.getElementById('btn-next-month').addEventListener('click', () => {
  const [y, m] = selectedMonth.split('-').map(Number);
  const d = new Date(y, m, 1);
  selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  $monthSelector.value = selectedMonth;
  localStorage.setItem('selectedMonth', selectedMonth);
  refresh();
});

// ============================================================
// Data fetching
// ============================================================
async function getExpensesByMonth(month) {
  const all = await idbReq(tx('expenses', 'readonly').index('date').getAll());
  return all.filter(e => getMonth(e.date) === month).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

async function getBudgetsByMonth(month) {
  return idbReq(tx('budgets', 'readonly').index('month').getAll(month));
}

async function getBudget(month, category) {
  const id = `${month}_${category}`;
  return idbReq(tx('budgets', 'readonly').get(id));
}

async function getSpentByCategory(month, category) {
  const expenses = await getExpensesByMonth(month);
  return expenses.filter(e => e.category === category).reduce((s, e) => s + e.amount, 0);
}

// ============================================================
// Refresh UI
// ============================================================
async function refresh() {
  const expenses = await getExpensesByMonth(selectedMonth);
  const budgets = await getBudgetsByMonth(selectedMonth);

  // Summary
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  $totalSpent.textContent = formatMoney(totalSpent);

  const totalBudgetAmt = budgets.reduce((s, b) => s + b.amount, 0);
  if (budgets.length > 0) {
    $totalBudget.textContent = formatMoney(totalBudgetAmt);
    const rem = totalBudgetAmt - totalSpent;
    $totalRemaining.textContent = formatMoney(rem);
    $totalRemaining.classList.toggle('over-budget', rem < 0);
  } else {
    $totalBudget.textContent = '-- đ';
    $totalRemaining.textContent = '-- đ';
    $totalRemaining.classList.remove('over-budget');
  }

  // Budget list
  renderBudgets(budgets, expenses);

  // Expense list
  renderExpenses(expenses);
}

function renderBudgets(budgets, expenses) {
  $budgetList.innerHTML = '';
  const cats = Object.keys(CATEGORIES);

  cats.forEach(cat => {
    const budget = budgets.find(b => b.category === cat);
    if (!budget) return;

    const spent = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
    const remaining = budget.amount - spent;
    const pct = budget.amount > 0 ? Math.min((spent / budget.amount) * 100, 100) : 0;
    const isOver = remaining < 0;
    const isWarning = pct >= 80 && !isOver;

    const card = document.createElement('div');
    card.className = 'budget-card';
    card.innerHTML = `
      <div class="budget-card-header">
        <span class="budget-card-category">${CATEGORIES[cat]}</span>
        <span class="budget-card-amount">${formatMoney(budget.amount)}</span>
      </div>
      <div class="budget-progress">
        <div class="budget-progress-bar ${isOver ? 'over' : isWarning ? 'warning' : ''}" style="width:${pct}%"></div>
      </div>
      <div class="budget-card-footer">
        <span>Đã chi: ${formatMoney(spent)}</span>
        <span class="${isOver ? 'over' : ''}">Còn: ${formatMoney(remaining)}</span>
      </div>
    `;
    card.addEventListener('click', () => openBudgetModal(cat, budget));
    $budgetList.appendChild(card);
  });
}

function renderExpenses(expenses) {
  $expenseList.innerHTML = '';
  $expenseEmpty.style.display = expenses.length === 0 ? 'block' : 'none';

  expenses.forEach(exp => {
    const card = document.createElement('div');
    card.className = 'expense-card';
    const hasImages = exp.images && exp.images.length > 0;
    card.innerHTML = `
      <div class="expense-card-icon">${CAT_ICONS[exp.category] || '📦'}</div>
      <div class="expense-card-body">
        <div class="expense-card-title">${escapeHtml(exp.title)}</div>
        <div class="expense-card-meta">${toVNDate(exp.date)}${hasImages ? ' · 📷' + exp.images.length : ''}</div>
      </div>
      <div class="expense-card-amount">-${formatMoney(exp.amount)}</div>
    `;
    card.addEventListener('click', () => openExpenseModal(exp));
    $expenseList.appendChild(card);
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ============================================================
// Image processing
// ============================================================
async function resizeAndConvert(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('toBlob failed'));
      }, 'image/webp', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

function renderImagePreviews() {
  $expenseImagePreview.innerHTML = '';
  currentImages.forEach((blob, i) => {
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    const img = document.createElement('img');
    img.src = imgSrc(blob);
    img.addEventListener('click', () => openImageViewer(blob));
    img.style.cursor = 'pointer';
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.type = 'button';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      currentImages.splice(i, 1);
      renderImagePreviews();
    });
    div.appendChild(img);
    div.appendChild(btn);
    $expenseImagePreview.appendChild(div);
  });
}

$expenseImages.addEventListener('change', async () => {
  const files = Array.from($expenseImages.files);
  for (const f of files) {
    if (currentImages.length >= 5) break;
    try {
      const blob = await resizeAndConvert(f);
      currentImages.push(blob);
    } catch (e) {
      console.error('Image processing failed:', e);
    }
  }
  $expenseImages.value = '';
  renderImagePreviews();
});

// ============================================================
// Expense budget info (in form)
// ============================================================
async function updateExpenseBudgetInfo() {
  const cat = $expenseCategory.value;
  const dateVal = $expenseDate.value;
  if (!cat || !dateVal) { $expenseBudgetInfo.style.display = 'none'; return; }

  const month = dateVal.substring(0, 7);
  const budget = await getBudget(month, cat);
  const allExpenses = await getExpensesByMonth(month);
  const spent = allExpenses
    .filter(e => e.category === cat && (!$expenseId.value || e.id !== Number($expenseId.value)))
    .reduce((s, e) => s + e.amount, 0);

  if (!budget) {
    $expenseBudgetInfo.style.display = 'block';
    $expenseBudgetInfo.innerHTML = '<span class="no-budget">Chưa đặt ngân sách cho danh mục này</span>';
    return;
  }

  const inputAmt = parseMoneyInput($expenseAmount.value);
  const remaining = budget.amount - spent;
  const afterRemaining = remaining - inputAmt;

  $expenseBudgetInfo.style.display = 'block';
  $expenseBudgetInfo.innerHTML = `
    <div>Ngân sách: <b>${formatMoney(budget.amount)}</b></div>
    <div>Đã chi: <b>${formatMoney(spent)}</b></div>
    <div>Còn lại: <b class="${remaining < 0 ? 'over' : 'ok'}">${formatMoney(remaining)}</b></div>
    ${inputAmt > 0 ? `<div>Sau khi thêm: <b class="${afterRemaining < 0 ? 'over' : 'ok'}">${formatMoney(afterRemaining)}</b></div>` : ''}
    ${afterRemaining < 0 && inputAmt > 0 ? `<div class="over">⚠️ Bạn đã vượt ngân sách ${formatMoney(Math.abs(afterRemaining))}</div>` : ''}
  `;
}

$expenseCategory.addEventListener('change', updateExpenseBudgetInfo);
$expenseDate.addEventListener('change', updateExpenseBudgetInfo);
$expenseAmount.addEventListener('input', updateExpenseBudgetInfo);

// ============================================================
// Image viewer
// ============================================================
function imgSrc(imgData) {
  if (imgData instanceof Blob) return URL.createObjectURL(imgData);
  if (typeof imgData === 'string') return imgData; // base64 data URL
  return '';
}

function openImageViewer(imgData) {
  $imageViewerImg.src = imgSrc(imgData);
  $imageViewer.style.display = 'flex';
}

function closeImageViewer() {
  $imageViewer.style.display = 'none';
  if ($imageViewerImg.src.startsWith('blob:')) URL.revokeObjectURL($imageViewerImg.src);
  $imageViewerImg.src = '';
}

$imageViewerClose.addEventListener('click', closeImageViewer);
$imageViewer.addEventListener('click', e => { if (e.target === $imageViewer) closeImageViewer(); });

// ============================================================
// Expense Modal
// ============================================================
document.getElementById('fab').addEventListener('click', () => openExpenseModal(null));

function showDetailView(exp) {
  $expenseDetail.style.display = 'block';
  $formExpense.style.display = 'none';
  $modalExpenseTitle.textContent = 'Chi tiết chi tiêu';

  $detailTitle.textContent = exp.title;
  $detailAmount.textContent = '-' + formatMoney(exp.amount);
  $detailCategory.textContent = CATEGORIES[exp.category] || exp.category;
  $detailDate.textContent = toVNDate(exp.date);

  // Render detail images (clickable for full view)
  $detailImages.innerHTML = '';
  if (exp.images && exp.images.length > 0) {
    exp.images.forEach(imgData => {
      const img = document.createElement('img');
      img.src = imgSrc(imgData);
      img.addEventListener('click', () => openImageViewer(imgData));
      $detailImages.appendChild(img);
    });
  }
}

function showEditForm(exp) {
  $expenseDetail.style.display = 'none';
  $formExpense.style.display = 'block';
  $modalExpenseTitle.textContent = 'Sửa chi tiêu';

  $expenseId.value = exp.id;
  $expenseTitle.value = exp.title;
  setMoneyInputValue($expenseAmount, exp.amount);
  $expenseCategory.value = exp.category;
  $expenseDate.value = exp.date;
  currentImages = exp.images ? [...exp.images] : [];
  renderImagePreviews();
  $btnDeleteExpense.style.display = 'block';
  updateExpenseBudgetInfo();
}

$btnEditExpense.addEventListener('click', () => {
  if (currentExpenseData) showEditForm(currentExpenseData);
});

async function openExpenseModal(exp) {
  $formExpense.reset();
  currentImages = [];
  $expenseImagePreview.innerHTML = '';
  $expenseBudgetInfo.style.display = 'none';
  currentExpenseData = exp;

  if (exp) {
    // Show read-only detail view first
    showDetailView(exp);
  } else {
    // New expense: show form directly
    $expenseDetail.style.display = 'none';
    $formExpense.style.display = 'block';
    $modalExpenseTitle.textContent = 'Thêm chi tiêu';
    $expenseId.value = '';
    $expenseDate.value = toISO(vnNow());
    $btnDeleteExpense.style.display = 'none';

    // Default category: first one, but if its remaining <= 0, use second
    const cats = Object.keys(CATEGORIES);
    if (cats.length >= 2) {
      const month = $expenseDate.value.substring(0, 7);
      const budget = await getBudget(month, cats[0]);
      if (budget) {
        const spent = await getSpentByCategory(month, cats[0]);
        const remaining = budget.amount - spent;
        if (remaining <= 0) {
          $expenseCategory.value = cats[1];
        }
      }
    }

    updateExpenseBudgetInfo();
  }

  openModal($modalExpense);
}

$formExpense.addEventListener('submit', async e => {
  e.preventDefault();

  const data = {
    title: $expenseTitle.value.trim(),
    amount: parseMoneyInput($expenseAmount.value),
    category: $expenseCategory.value,
    date: $expenseDate.value,
    images: currentImages
  };

  const store = tx('expenses', 'readwrite');
  if ($expenseId.value) {
    data.id = Number($expenseId.value);
    await idbReq(store.put(data));
    toast('Đã cập nhật chi tiêu');
  } else {
    await idbReq(store.add(data));
    toast('Đã thêm chi tiêu');
  }

  closeModal($modalExpense);
  refresh();
});

$btnDeleteExpense.addEventListener('click', async () => {
  if (!confirm('Xóa chi tiêu này?')) return;
  await idbReq(tx('expenses', 'readwrite').delete(Number($expenseId.value)));
  closeModal($modalExpense);
  toast('Đã xóa chi tiêu');
  refresh();
});

// ============================================================
// Budget Modal
// ============================================================
document.getElementById('btn-add-budget').addEventListener('click', () => openBudgetModal(null, null));

function openBudgetModal(cat, budget) {
  $formBudget.reset();

  if (budget) {
    $modalBudgetTitle.textContent = 'Sửa ngân sách';
    $budgetCategory.value = budget.category;
    $budgetCategory.disabled = true;
    setMoneyInputValue($budgetAmount, budget.amount);
    editingBudgetId = budget.id;
    $btnDeleteBudget.style.display = 'block';
  } else {
    $modalBudgetTitle.textContent = 'Đặt ngân sách';
    $budgetCategory.disabled = false;
    setMoneyInputValue($budgetAmount, 1000000);
    editingBudgetId = null;
    $btnDeleteBudget.style.display = 'none';
  }

  openModal($modalBudget);
}

$formBudget.addEventListener('submit', async e => {
  e.preventDefault();

  const cat = $budgetCategory.value;
  const amount = parseMoneyInput($budgetAmount.value);
  const id = `${selectedMonth}_${cat}`;

  const data = { id, month: selectedMonth, category: cat, amount };

  await idbReq(tx('budgets', 'readwrite').put(data));
  closeModal($modalBudget);
  $budgetCategory.disabled = false;
  toast('Đã lưu ngân sách');
  refresh();
});

$btnDeleteBudget.addEventListener('click', async () => {
  if (!editingBudgetId || !confirm('Xóa ngân sách này?')) return;
  await idbReq(tx('budgets', 'readwrite').delete(editingBudgetId));
  closeModal($modalBudget);
  $budgetCategory.disabled = false;
  toast('Đã xóa ngân sách');
  refresh();
});

// ============================================================
// Settings
// ============================================================
document.getElementById('btn-settings').addEventListener('click', () => openModal($modalSettings));

// Export
document.getElementById('btn-export').addEventListener('click', async () => {
  const expenses = await idbReq(tx('expenses', 'readonly').getAll());
  const budgets = await idbReq(tx('budgets', 'readonly').getAll());

  // Convert Blobs to base64
  const expWithB64 = await Promise.all(expenses.map(async exp => {
    const imgs = [];
    if (exp.images) {
      for (const blob of exp.images) {
        imgs.push(await blobToBase64(blob));
      }
    }
    return { ...exp, images: imgs };
  }));

  const data = { expenses: expWithB64, budgets, exportDate: new Date().toISOString() };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expense-backup-${selectedMonth}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Đã xuất dữ liệu');
  closeModal($modalSettings);
});

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64) {
  const [meta, data] = b64.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Import
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Nhập dữ liệu sẽ thay thế toàn bộ dữ liệu hiện tại. Tiếp tục?')) {
    e.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Clear existing
    const txn = db.transaction(['expenses', 'budgets'], 'readwrite');
    const expStore = txn.objectStore('expenses');
    const budStore = txn.objectStore('budgets');

    await idbReq(expStore.clear());
    await idbReq(budStore.clear());

    // Import budgets
    for (const b of (data.budgets || [])) {
      await idbReq(budStore.put(b));
    }

    // Import expenses (convert base64 back to Blob)
    for (const exp of (data.expenses || [])) {
      const imgs = [];
      if (exp.images) {
        for (const img of exp.images) {
          if (typeof img === 'string') {
            imgs.push(base64ToBlob(img));
          } else {
            imgs.push(img);
          }
        }
      }
      exp.images = imgs;
      await idbReq(expStore.put(exp));
    }

    toast('Đã nhập dữ liệu thành công');
    closeModal($modalSettings);
    refresh();
  } catch (err) {
    alert('Lỗi khi nhập dữ liệu: ' + err.message);
  }
  e.target.value = '';
});

// ============================================================
// Service Worker
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed:', err));
}

// ============================================================
// Init
// ============================================================
setupMoneyInput($expenseAmount);
setupMoneyInput($budgetAmount);
openDB().then(() => refresh());
