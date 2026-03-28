const state = {
  token: localStorage.getItem("keep_accounting_token") || "",
  filter: {
    startDate: "",
    endDate: ""
  },
  user: null
};

const authPanel = document.getElementById("authPanel");
const appPanel = document.getElementById("appPanel");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const recordForm = document.getElementById("recordForm");
const filterForm = document.getElementById("filterForm");
const resetFilterButton = document.getElementById("resetFilterButton");
const logoutButton = document.getElementById("logoutButton");
const currentUser = document.getElementById("currentUser");
const totalIncome = document.getElementById("totalIncome");
const totalExpense = document.getElementById("totalExpense");
const balance = document.getElementById("balance");
const recordsBody = document.getElementById("recordsBody");
const toast = document.getElementById("toast");

function todayString() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.remove("hidden", "error");
  if (isError) {
    toast.classList.add("error");
  }

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2600);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY"
  }).format(Number(value || 0));
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }

  return data;
}

function updateAuthView() {
  const loggedIn = Boolean(state.token && state.user);
  authPanel.classList.toggle("hidden", loggedIn);
  appPanel.classList.toggle("hidden", !loggedIn);
  logoutButton.classList.toggle("hidden", !loggedIn);
  currentUser.textContent = loggedIn ? state.user.email : "未登录";
}

function switchTab(tab) {
  const loginActive = tab === "login";
  loginTab.classList.toggle("active", loginActive);
  registerTab.classList.toggle("active", !loginActive);
  loginForm.classList.toggle("hidden", !loginActive);
  registerForm.classList.toggle("hidden", loginActive);
}

function buildQueryString() {
  const params = new URLSearchParams();
  if (state.filter.startDate) {
    params.set("startDate", state.filter.startDate);
  }
  if (state.filter.endDate) {
    params.set("endDate", state.filter.endDate);
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function renderSummary(summary) {
  totalIncome.textContent = formatCurrency(summary.totalIncome);
  totalExpense.textContent = formatCurrency(summary.totalExpense);
  balance.textContent = formatCurrency(summary.balance);
}

function renderRecords(records) {
  if (!records.length) {
    recordsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-cell">当前筛选条件下暂无记录</td>
      </tr>
    `;
    return;
  }

  recordsBody.innerHTML = records.map((record) => {
    const typeLabel = record.type === "income" ? "收入" : "支出";
    const rowClass = record.type === "income" ? "income-row" : "expense-row";
    return `
      <tr>
        <td>${record.recordDate}</td>
        <td><span class="pill ${rowClass}">${typeLabel}</span></td>
        <td>${formatCurrency(record.amount)}</td>
        <td>${record.category || "-"}</td>
        <td>${record.note || "-"}</td>
      </tr>
    `;
  }).join("");
}

async function loadDashboard() {
  const queryString = buildQueryString();
  const [summary, recordsData] = await Promise.all([
    apiFetch(`/api/summary${queryString}`),
    apiFetch(`/api/records${queryString}`)
  ]);

  renderSummary(summary);
  renderRecords(recordsData.records);
}

function saveToken(token) {
  state.token = token;
  if (token) {
    localStorage.setItem("keep_accounting_token", token);
  } else {
    localStorage.removeItem("keep_accounting_token");
  }
}

async function restoreSession() {
  if (!state.token) {
    updateAuthView();
    return;
  }

  try {
    const data = await apiFetch("/api/auth/me");
    state.user = data.user;
    updateAuthView();
    await loadDashboard();
  } catch (error) {
    saveToken("");
    state.user = null;
    updateAuthView();
  }
}

loginTab.addEventListener("click", () => switchTab("login"));
registerTab.addEventListener("click", () => switchTab("register"));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);

  try {
    const result = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });

    saveToken(result.token);
    state.user = result.user;
    updateAuthView();
    await loadDashboard();
    loginForm.reset();
    showToast("登录成功");
  } catch (error) {
    showToast(error.message, true);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(registerForm);

  try {
    const result = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });

    saveToken(result.token);
    state.user = result.user;
    updateAuthView();
    await loadDashboard();
    registerForm.reset();
    showToast("注册成功，已自动登录");
  } catch (error) {
    showToast(error.message, true);
  }
});

recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(recordForm);

  try {
    await apiFetch("/api/records", {
      method: "POST",
      body: JSON.stringify({
        type: formData.get("type"),
        amount: Number(formData.get("amount")),
        category: formData.get("category"),
        note: formData.get("note"),
        recordDate: formData.get("recordDate")
      })
    });

    recordForm.reset();
    recordForm.elements.recordDate.value = todayString();
    await loadDashboard();
    showToast("记录已保存");
  } catch (error) {
    showToast(error.message, true);
  }
});

filterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(filterForm);
  state.filter.startDate = String(formData.get("startDate") || "");
  state.filter.endDate = String(formData.get("endDate") || "");

  try {
    await loadDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

resetFilterButton.addEventListener("click", async () => {
  state.filter.startDate = "";
  state.filter.endDate = "";
  filterForm.reset();

  try {
    await loadDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch (error) {
    showToast(error.message, true);
  } finally {
    saveToken("");
    state.user = null;
    renderSummary({ totalIncome: 0, totalExpense: 0, balance: 0 });
    renderRecords([]);
    updateAuthView();
  }
});

recordForm.elements.recordDate.value = todayString();
restoreSession();
