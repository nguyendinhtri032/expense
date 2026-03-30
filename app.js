// ============================================================
// DB
// ============================================================
const DB_NAME = 'expenseDB';
const DB_VERSION = 2;
let db;

const DEFAULT_CATEGORIES = [
  { id: 'food', icon: '🍜', name: 'Ăn uống' },
  { id: 'transport', icon: '🚗', name: 'Di chuyển' },
  { id: 'shopping', icon: '🛍️', name: 'Mua sắm' },
  { id: 'entertainment', icon: '🎮', name: 'Giải trí' },
  { id: 'health', icon: '💊', name: 'Sức khỏe' },
  { id: 'education', icon: '📚', name: 'Học tập' },
  { id: 'bills', icon: '🧾', name: 'Hóa đơn' },
  { id: 'other', icon: '📦', name: 'Khác' }
];

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
      if (!d.objectStoreNames.contains('categories')) {
        const s = d.createObjectStore('categories', { keyPath: 'id' });
        // Seed default categories
        DEFAULT_CATEGORIES.forEach(cat => s.put(cat));
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
// Categories (dynamic from IndexedDB)
// ============================================================
let CATEGORIES = {}; // { id: 'icon name' }
let CAT_ICONS = {};  // { id: 'icon' }
let categoriesList = []; // [{ id, icon, name }]

async function loadCategories() {
  const all = await idbReq(tx('categories', 'readonly').getAll());
  categoriesList = all;
  CATEGORIES = {};
  CAT_ICONS = {};
  all.forEach(c => {
    CATEGORIES[c.id] = `${c.icon} ${c.name}`;
    CAT_ICONS[c.id] = c.icon;
  });
  populateCategorySelects();
}

function populateCategorySelects() {
  [$expenseCategory, $budgetCategory].forEach($sel => {
    if (!$sel) return;
    const current = $sel.value;
    $sel.innerHTML = '';
    categoriesList.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      $sel.appendChild(opt);
    });
    if (current && [...$sel.options].some(o => o.value === current)) {
      $sel.value = current;
    }
  });
}

async function addCategory(id, icon, name) {
  await idbReq(tx('categories', 'readwrite').put({ id, icon, name }));
  await loadCategories();
}

async function deleteCategory(id) {
  await idbReq(tx('categories', 'readwrite').delete(id));
  await loadCategories();
}

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
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function toVNDate(isoStr) {
  const datePart = isoStr.substring(0, 10);
  const [y, m, d] = datePart.split('-');
  const timePart = isoStr.length > 10 ? isoStr.substring(11, 16) : '';
  return timePart ? `${d}/${m}/${y} ${timePart}` : `${d}/${m}/${y}`;
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
let currentSort = 'id';   // 'id' | 'amount' | 'date'
let sortAsc = false;       // default descending

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
// Sort controls
// ============================================================
document.querySelector('.sort-controls').addEventListener('click', e => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;
  const sort = btn.dataset.sort;

  if (currentSort === sort) {
    // Toggle direction
    sortAsc = !sortAsc;
  } else {
    currentSort = sort;
    sortAsc = false; // default desc for new sort
  }

  // Update active state and arrow
  document.querySelectorAll('.sort-btn').forEach(b => {
    b.classList.remove('active');
    b.querySelector('.sort-arrow')?.remove();
  });
  btn.classList.add('active');
  const arrow = document.createElement('span');
  arrow.className = 'sort-arrow';
  arrow.textContent = sortAsc ? ' ↑' : ' ↓';
  btn.appendChild(arrow);

  refresh();
});

// ============================================================
// Data fetching
// ============================================================
async function getExpensesByMonth(month) {
  const all = await idbReq(tx('expenses', 'readonly').index('date').getAll());
  return all.filter(e => getMonth(e.date) === month);
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
  renderExpenses(expenses, budgets);

  // Re-render chart if visible
  if ($chartPage.style.display !== 'none') renderChart();
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

function sortExpenses(expenses) {
  const sorted = [...expenses];
  const dir = sortAsc ? 1 : -1;
  if (currentSort === 'amount') {
    sorted.sort((a, b) => (a.amount - b.amount) * dir || b.id - a.id);
  } else if (currentSort === 'date') {
    sorted.sort((a, b) => a.date.localeCompare(b.date) * dir || b.id - a.id);
  } else {
    // id desc by default
    sorted.sort((a, b) => (a.id - b.id) * dir);
  }
  return sorted;
}

function renderExpenses(expenses, budgets) {
  $expenseList.innerHTML = '';
  $expenseEmpty.style.display = expenses.length === 0 ? 'block' : 'none';

  const sorted = sortExpenses(expenses);

  // Pre-calculate spent per category for percentage
  const spentByCategory = {};
  expenses.forEach(e => {
    spentByCategory[e.category] = (spentByCategory[e.category] || 0) + e.amount;
  });

  sorted.forEach(exp => {
    const card = document.createElement('div');
    card.className = 'expense-card';
    const hasImages = exp.images && exp.images.length > 0;

    // Calculate this expense's % of its category budget
    const budget = budgets.find(b => b.category === exp.category);
    let pctHtml = '';
    if (budget && budget.amount > 0) {
      const pct = Math.round((exp.amount / budget.amount) * 100);
      pctHtml = `<div class="expense-card-pct">${pct}%</div>`;
    }

    card.innerHTML = `
      <div class="expense-card-icon">${CAT_ICONS[exp.category] || '📦'}</div>
      <div class="expense-card-body">
        <div class="expense-card-title">${escapeHtml(exp.title)}</div>
        <div class="expense-card-meta">${toVNDate(exp.date)}${hasImages ? ' · <img src="images/image-gallery.png" class="expense-card-img-icon" alt="">' + exp.images.length : ''}</div>
      </div>
      <div class="expense-card-right">
        <div class="expense-card-amount">-${formatMoney(exp.amount)}</div>
        ${pctHtml}
      </div>
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

  // Convert Blob images to base64 for reliable IndexedDB storage (especially offline)
  const savedImages = [];
  for (const img of currentImages) {
    if (img instanceof Blob) {
      savedImages.push(await blobToBase64(img));
    } else {
      savedImages.push(img); // already base64
    }
  }

  const data = {
    title: $expenseTitle.value.trim(),
    amount: parseMoneyInput($expenseAmount.value),
    category: $expenseCategory.value,
    date: $expenseDate.value,
    images: savedImages
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
  document.getElementById('new-category-section').style.display = 'none';
  document.getElementById('btn-new-category').style.display = 'block';

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
// Category creation (in budget modal)
// ============================================================
const $newCatSection = document.getElementById('new-category-section');
const $btnNewCategory = document.getElementById('btn-new-category');
const $newCatIcon = document.getElementById('new-cat-icon');
const $newCatName = document.getElementById('new-cat-name');
const $btnSaveCategory = document.getElementById('btn-save-category');
const $btnCancelCategory = document.getElementById('btn-cancel-category');

$btnNewCategory.addEventListener('click', () => {
  $newCatSection.style.display = 'block';
  $btnNewCategory.style.display = 'none';
  $newCatIcon.value = '';
  $newCatName.value = '';
  $newCatIcon.focus();
});

$btnCancelCategory.addEventListener('click', () => {
  $newCatSection.style.display = 'none';
  $btnNewCategory.style.display = 'block';
});

$btnSaveCategory.addEventListener('click', async () => {
  const icon = $newCatIcon.value.trim();
  const name = $newCatName.value.trim();
  if (!icon || !name) {
    toast('Vui lòng nhập icon và tên danh mục');
    return;
  }
  // Generate id from name (slug)
  const id = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (CATEGORIES[id]) {
    toast('Danh mục này đã tồn tại');
    return;
  }

  await addCategory(id, icon, name);
  $newCatSection.style.display = 'none';
  $btnNewCategory.style.display = 'block';
  $budgetCategory.value = id;
  toast('Đã tạo danh mục mới');
});

// ============================================================
// Settings
// ============================================================
document.getElementById('btn-settings').addEventListener('click', () => openModal($modalSettings));

// Export
document.getElementById('btn-export').addEventListener('click', async () => {
  const expenses = await idbReq(tx('expenses', 'readonly').getAll());
  const budgets = await idbReq(tx('budgets', 'readonly').getAll());

  // Ensure all images are base64 for export (handle legacy Blob data)
  const expWithB64 = await Promise.all(expenses.map(async exp => {
    const imgs = [];
    if (exp.images) {
      for (const img of exp.images) {
        if (img instanceof Blob) {
          imgs.push(await blobToBase64(img));
        } else {
          imgs.push(img); // already base64
        }
      }
    }
    return { ...exp, images: imgs };
  }));

  const categories = await idbReq(tx('categories', 'readonly').getAll());
  const data = { expenses: expWithB64, budgets, categories, exportDate: new Date().toISOString() };
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
    const txn = db.transaction(['expenses', 'budgets', 'categories'], 'readwrite');
    const expStore = txn.objectStore('expenses');
    const budStore = txn.objectStore('budgets');
    const catStore = txn.objectStore('categories');

    await idbReq(expStore.clear());
    await idbReq(budStore.clear());
    await idbReq(catStore.clear());

    // Import categories (fallback to defaults if not in export)
    const cats = data.categories || DEFAULT_CATEGORIES;
    for (const c of cats) {
      await idbReq(catStore.put(c));
    }

    // Import budgets
    for (const b of (data.budgets || [])) {
      await idbReq(budStore.put(b));
    }

    // Import expenses (keep images as base64 strings)
    for (const exp of (data.expenses || [])) {
      await idbReq(expStore.put(exp));
    }

    toast('Đã nhập dữ liệu thành công');
    closeModal($modalSettings);
    await loadCategories();
    refresh();
  } catch (err) {
    alert('Lỗi khi nhập dữ liệu: ' + err.message);
  }
  e.target.value = '';
});

// ============================================================
// Category Management (in Settings)
// ============================================================
const $modalCategories = document.getElementById('modal-categories');
const $categoryList = document.getElementById('category-list');

document.getElementById('btn-manage-categories').addEventListener('click', () => {
  closeModal($modalSettings);
  renderCategoryList();
  openModal($modalCategories);
});

function renderCategoryList() {
  $categoryList.innerHTML = '';
  categoriesList.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'cat-item';
    item.innerHTML = `
      <input type="text" class="cat-item-icon-input" value="${cat.icon}" maxlength="2" data-id="${cat.id}" data-field="icon">
      <div class="cat-item-name">
        <input type="text" value="${escapeHtml(cat.name)}" data-id="${cat.id}" data-field="name" maxlength="30">
      </div>
      <div class="cat-item-actions">
        <button class="cat-item-btn delete" data-id="${cat.id}" title="Xóa">✕</button>
      </div>
    `;
    $categoryList.appendChild(item);
  });

  // Inline edit: save on blur
  $categoryList.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const id = inp.dataset.id;
      const field = inp.dataset.field;
      const val = inp.value.trim();
      if (!val) { inp.value = categoriesList.find(c => c.id === id)?.[field] || ''; return; }
      const cat = categoriesList.find(c => c.id === id);
      if (!cat) return;
      cat[field] = val;
      await idbReq(tx('categories', 'readwrite').put({ ...cat }));
      await loadCategories();
      toast('Đã cập nhật danh mục');
    });
  });

  // Delete
  $categoryList.querySelectorAll('.cat-item-btn.delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const cat = categoriesList.find(c => c.id === id);
      if (!confirm(`Xóa danh mục "${cat.icon} ${cat.name}"?`)) return;
      await deleteCategory(id);
      renderCategoryList();
      toast('Đã xóa danh mục');
      refresh();
    });
  });
}

// Add new category from management modal
document.getElementById('btn-cat-add').addEventListener('click', async () => {
  const icon = document.getElementById('cat-add-icon').value.trim();
  const name = document.getElementById('cat-add-name').value.trim();
  if (!icon || !name) { toast('Vui lòng nhập icon và tên'); return; }

  const id = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (CATEGORIES[id]) { toast('Danh mục này đã tồn tại'); return; }

  await addCategory(id, icon, name);
  document.getElementById('cat-add-icon').value = '';
  document.getElementById('cat-add-name').value = '';
  renderCategoryList();
  toast('Đã thêm danh mục mới');
});

// ============================================================
// Tab switching
// ============================================================
const $tabBar = document.getElementById('tab-bar');
const $main = document.getElementById('main');
const $chartPage = document.getElementById('chart-page');

$tabBar.addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tab = btn.dataset.tab;

  $tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (tab === 'chart') {
    $main.style.display = 'none';
    $chartPage.style.display = 'block';
    renderChart();
  } else {
    $main.style.display = 'block';
    $chartPage.style.display = 'none';
  }
});

// ============================================================
// Chart
// ============================================================
async function renderChart() {
  const canvas = document.getElementById('expense-chart');
  const ctx = canvas.getContext('2d');

  // Hi-DPI support
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width - 16; // padding
  const H = 240;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  // Data
  const expenses = await getExpensesByMonth(selectedMonth);
  const budgets = await getBudgetsByMonth(selectedMonth);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);

  // Days in month
  const [y, m] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  // Spending per day
  const dailySpend = new Array(daysInMonth).fill(0);
  expenses.forEach(exp => {
    const day = parseInt(exp.date.substring(8, 10), 10);
    if (day >= 1 && day <= daysInMonth) dailySpend[day - 1] += exp.amount;
  });

  // Cumulative spending
  const cumSpend = [];
  let cumSum = 0;
  for (let i = 0; i < daysInMonth; i++) {
    cumSum += dailySpend[i];
    cumSpend.push(cumSum);
  }

  // Remaining budget
  const remaining = [];
  let rem = totalBudget;
  for (let i = 0; i < daysInMonth; i++) {
    rem -= dailySpend[i];
    remaining.push(Math.max(rem, 0));
  }

  // Chart subtitle
  document.getElementById('chart-subtitle').textContent =
    `Tháng ${m}/${y} — Ngân sách: ${totalBudget > 0 ? formatMoney(totalBudget) : 'chưa đặt'}`;

  // Legend
  document.getElementById('chart-legend').innerHTML = `
    <div class="chart-legend-item">
      <span class="chart-legend-dot" style="background:var(--blue);border:2px dashed var(--blue-dark);"></span>
      Chi tiêu tích lũy
    </div>
    <div class="chart-legend-item">
      <span class="chart-legend-dot" style="background:#3b82f6;"></span>
      Ngân sách còn lại
    </div>
  `;

  // Max value for Y axis
  const maxVal = Math.max(...cumSpend, totalBudget, 100000);

  // Chart margins
  const mL = 48, mR = 12, mT = 12, mB = 28;
  const cW = W - mL - mR;
  const cH = H - mT - mB;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Helpers
  function xPos(day) { return mL + (day / (daysInMonth - 1)) * cW; }
  function yPos(val) { return mT + cH - (val / maxVal) * cH; }

  // Grid lines + Y labels
  ctx.strokeStyle = var_gray200();
  ctx.lineWidth = 0.5;
  ctx.fillStyle = var_gray400();
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'right';

  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const val = (maxVal / gridSteps) * i;
    const py = yPos(val);
    ctx.beginPath();
    ctx.moveTo(mL, py);
    ctx.lineTo(W - mR, py);
    ctx.stroke();

    let label;
    if (val >= 1000000) label = (val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1) + 'M';
    else label = Math.round(val / 1000) + 'K';
    ctx.fillText(label, mL - 6, py + 4);
  }

  // X labels (days) — calculate step based on available width
  ctx.textAlign = 'center';
  ctx.fillStyle = var_gray400();
  const labelWidth = 24; // approx width per label in px
  const maxLabels = Math.floor(cW / labelWidth);
  const dayStep = Math.max(1, Math.ceil(daysInMonth / maxLabels));
  for (let d = 0; d < daysInMonth; d++) {
    const day = d + 1;
    const isFirst = day === 1;
    const isLast = day === daysInMonth;
    const isStep = day % dayStep === 0;
    // Skip step label if too close to the last day
    if (isStep && !isLast && (daysInMonth - day) < dayStep) continue;
    if (isFirst || isLast || isStep) {
      ctx.fillText(day, xPos(d), H - 6);
    }
  }

  // === Draw cumulative spending area (pink, dashed border) ===
  // Fill area
  ctx.beginPath();
  ctx.moveTo(xPos(0), yPos(0));
  for (let d = 0; d < daysInMonth; d++) {
    ctx.lineTo(xPos(d), yPos(cumSpend[d]));
  }
  ctx.lineTo(xPos(daysInMonth - 1), yPos(0));
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, mT, 0, mT + cH);
  grad.addColorStop(0, 'rgba(244,160,185,0.5)');
  grad.addColorStop(1, 'rgba(244,160,185,0.05)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Dashed border line
  ctx.beginPath();
  for (let d = 0; d < daysInMonth; d++) {
    if (d === 0) ctx.moveTo(xPos(d), yPos(cumSpend[d]));
    else ctx.lineTo(xPos(d), yPos(cumSpend[d]));
  }
  ctx.strokeStyle = '#e8809f';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // === Draw remaining budget line (blue, solid) ===
  if (totalBudget > 0) {
    ctx.beginPath();
    // Fill area under remaining
    ctx.moveTo(xPos(0), yPos(0));
    ctx.lineTo(xPos(0), yPos(totalBudget));
    for (let d = 0; d < daysInMonth; d++) {
      ctx.lineTo(xPos(d), yPos(remaining[d]));
    }
    ctx.lineTo(xPos(daysInMonth - 1), yPos(0));
    ctx.closePath();

    const gradBlue = ctx.createLinearGradient(0, mT, 0, mT + cH);
    gradBlue.addColorStop(0, 'rgba(59,130,246,0.15)');
    gradBlue.addColorStop(1, 'rgba(59,130,246,0.02)');
    ctx.fillStyle = gradBlue;
    ctx.fill();

    // Solid line
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(totalBudget));
    for (let d = 0; d < daysInMonth; d++) {
      ctx.lineTo(xPos(d), yPos(remaining[d]));
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Also render pie chart
  renderPieChart(expenses);
}

// ============================================================
// Pie Chart (spending by category)
// ============================================================
const PIE_COLORS = [
  '#f4a0b9', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6',
  '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#f97316',
  '#6366f1', '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9'
];

function renderPieChart(expenses) {
  const canvas = document.getElementById('pie-chart');
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const size = 220;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  // Aggregate by category
  const catSpend = {};
  expenses.forEach(e => {
    catSpend[e.category] = (catSpend[e.category] || 0) + e.amount;
  });

  const entries = Object.entries(catSpend)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const $legend = document.getElementById('pie-legend');

  if (entries.length === 0) {
    // Draw empty state
    const cx = size / 2, cy = size / 2, r = 85;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = var_gray200();
    ctx.fill();
    ctx.fillStyle = var_gray400();
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chưa có dữ liệu', cx, cy);
    $legend.innerHTML = '';
    return;
  }

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = size / 2, cy = size / 2, r = 85, innerR = 50;

  let startAngle = -Math.PI / 2;

  entries.forEach(([cat, amount], i) => {
    const slice = (amount / total) * Math.PI * 2;
    const color = PIE_COLORS[i % PIE_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(startAngle) * innerR, cy + Math.sin(startAngle) * innerR);
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.arc(cx, cy, innerR, startAngle + slice, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // White gap between slices
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle += slice;
  });

  // Center text: total
  ctx.fillStyle = var_gray900();
  ctx.font = 'bold 14px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatMoney(total), cx, cy);

  // Legend
  $legend.innerHTML = entries.map(([cat, amount], i) => {
    const pct = Math.round((amount / total) * 100);
    const color = PIE_COLORS[i % PIE_COLORS.length];
    const label = CATEGORIES[cat] || cat;
    return `<div class="pie-legend-item">
      <span class="pie-legend-dot" style="background:${color}"></span>
      <span>${label}</span>
      <span class="pie-legend-pct">${pct}% · ${formatMoney(amount)}</span>
    </div>`;
  }).join('');
}

function var_gray200() { return getComputedStyle(document.documentElement).getPropertyValue('--gray-200').trim() || '#e5e7eb'; }
function var_gray400() { return getComputedStyle(document.documentElement).getPropertyValue('--gray-400').trim() || '#9ca3af'; }
function var_gray900() { return getComputedStyle(document.documentElement).getPropertyValue('--gray-900').trim() || '#111827'; }

// ============================================================
// Service Worker — auto-update system
// ============================================================
if ('serviceWorker' in navigator) {
  // Prevent infinite reload loop
  const RELOAD_KEY = 'sw_reload_ts';

  navigator.serviceWorker.register('./sw.js').then(reg => {
    console.log('[App] SW registered');

    // Check for updates periodically (every 30 min)
    setInterval(() => reg.update(), 30 * 60 * 1000);
  }).catch(err => console.log('[App] SW registration failed:', err));

  // Detect when a new SW takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const lastReload = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
    const now = Date.now();

    // Prevent reload loop: ignore if reloaded within last 5 seconds
    if (now - lastReload < 5000) {
      console.log('[App] Skipping reload — too recent');
      return;
    }

    // Ask new SW for its version
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('GET_VERSION');
    }

    // Show toast and reload
    sessionStorage.setItem(RELOAD_KEY, String(now));
    toast('App đã cập nhật — đang tải lại...');
    setTimeout(() => location.reload(), 1500);
  });

  // Listen for version info from SW
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'VERSION') {
      console.log('[App] Running version:', e.data.version);
    }
  });
}

// ============================================================
// Reload button (for PWA standalone mode)
// ============================================================
document.getElementById('btn-reload').addEventListener('click', () => location.reload());

// ============================================================
// Init
// ============================================================
setupMoneyInput($expenseAmount);
setupMoneyInput($budgetAmount);
openDB().then(() => loadCategories()).then(() => refresh());
