/* =========================================================================
   FORGE — Gym Tracker
   Vanilla JS. Data is stored in localStorage only (frontend prototype).
   NOTE ON SECURITY: passwords are hashed with a simple non-cryptographic
   hash purely to avoid storing plain text in localStorage. This is NOT
   secure and is not meant to be. If a real backend/database is added
   later, replace hashPassword() and the login/verify functions below —
   everything else in the app reads/writes through the DB.* helpers so
   swapping storage layers only means editing this one section.
   ========================================================================= */

/* ---------------------------------------------------------------------
   CONSTANTS
   --------------------------------------------------------------------- */
const BODY_PARTS = ["chest", "biceps", "back", "triceps", "shoulders", "legs"];
const BODY_PART_LABELS = { chest: "Chest", biceps: "Biceps", back: "Back", triceps: "Triceps", shoulders: "Shoulders", legs: "Legs" };
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
const DEFAULT_SCHEDULE = {
  mon: ["chest", "biceps"],
  tue: ["back", "triceps"],
  wed: ["shoulders", "legs"],
  thu: ["chest", "biceps"],
  fri: ["back", "triceps"],
  sat: ["shoulders", "legs"],
  sun: []
};
const USERS = {};

/* ---------------------------------------------------------------------
   STORAGE LAYER (DB.*)
   --------------------------------------------------------------------- */
const DB = {
  getAccounts() {
    return JSON.parse(localStorage.getItem("gym_accounts") || "{}");
  },
  saveAccounts(accounts) {
    localStorage.setItem("gym_accounts", JSON.stringify(accounts));
  },
  getAccount(userId) {
    return this.getAccounts()[userId] || null;
  },
  saveAccount(userId, account) {
    const accounts = this.getAccounts();
    accounts[userId] = account;
    this.saveAccounts(accounts);
  },
  getData(userId) {
    const raw = localStorage.getItem("gym_data_" + userId);
    if (raw) return JSON.parse(raw);
    return {
      weightHistory: [],
      workoutHistory: {}, // date -> {bodyParts, exercises:{name:[{weight,reps,completed}]}, completed, startedAt, durationSec}
      prs: {},            // exerciseName -> {weight, reps, date}
      journal: [],         // [{id, date, note, photo}]
      streak: 0,
      bestStreak: 0
    };
  },
  saveData(userId, data) {
    localStorage.setItem("gym_data_" + userId, JSON.stringify(data));
  },
  getSchedule() {
    const raw = localStorage.getItem("gym_schedule");
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
  },
  saveSchedule(sched) {
    localStorage.setItem("gym_schedule", JSON.stringify(sched));
  },
  getSession() {
    return localStorage.getItem("gym_session") || null;
  },
  setSession(userId) {
    if (userId) localStorage.setItem("gym_session", userId);
    else localStorage.removeItem("gym_session");
  }
};

function hashPassword(pw) {
  // Simple non-cryptographic hash (djb2). Frontend-only prototype.
  let hash = 5381;
  for (let i = 0; i < pw.length; i++) {
    hash = ((hash << 5) + hash) + pw.charCodeAt(i);
    hash = hash & hash;
  }
  return "h" + Math.abs(hash).toString(36);
}

function emptyExercises() {
  const ex = {};
  BODY_PARTS.forEach(bp => (ex[bp] = ["", "", "", ""]));
  return ex;
}

function defaultProfile() {
  return {
    name: "",
    currentWeight: null,
    targetWeight: null,
    height: null,
    age: null,
    goal: "Maintain",
    exercises: emptyExercises(),
    settings: { sets: 3, reps: 12, restTimer: 90, notifications: false, streakReminder: false, friendsSharing: false, darkMode: true }
  };
}

/* ---------------------------------------------------------------------
   APP STATE
   --------------------------------------------------------------------- */
const state = {
  currentUser: null,      // 'sulaim' | 'rafee'
  pendingLoginUser: null,
  setup: null,            // temp data while running setup wizard
  setupStepIndex: 0,
  setupSteps: [1, 2, 3, 4],
  workout: {
    running: false,
    startedAt: null,
    elapsedTimer: null,
    todayKey: null,
    bodyParts: [],
    exercises: {} // name -> [{weight,reps,completed}]
  },
  restTimer: {
    total: 90,
    remaining: 90,
    running: false,
    interval: null
  },
  journalPhotoData: null,
  currentPage: "home"
};

/* ---------------------------------------------------------------------
   UTIL: DOM helpers
   --------------------------------------------------------------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function todayDateStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function todayDayKey() {
  return DAY_KEYS[new Date().getDay()];
}
function formatDateNice(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}
function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toast(msg) {
  const stack = $("#toast-stack");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function showModal({ icon = "✅", title, body, actions }) {
  $("#modal-icon").textContent = icon;
  $("#modal-title").textContent = title;
  $("#modal-body").textContent = body || "";
  const actionsEl = $("#modal-actions");
  actionsEl.innerHTML = "";
  (actions || [{ label: "OK", primary: true, onClick: closeModal }]).forEach(a => {
    const btn = document.createElement("button");
    btn.className = "btn " + (a.primary ? "btn-primary" : "btn-ghost");
    btn.textContent = a.label;
    btn.onclick = () => { a.onClick && a.onClick(); };
    actionsEl.appendChild(btn);
  });
  show($("#modal-backdrop"));
}
function closeModal() { hide($("#modal-backdrop")); }

function openOverlay(id) { show($(id)); }
function closeOverlay(id) { hide($(id)); }

/* ---------------------------------------------------------------------
   INIT
   --------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  wireStaticEvents();
  setTimeout(() => {
    hide($("#loading-screen"));
    const session = DB.getSession();
    if (session && DB.getAccount(session)) {
      enterApp(session);
    } else {
      show($("#login-screen"));
      refreshUserHints();
    }
  }, 900);
});



/* =========================================================================
   LOGIN FLOW
   ========================================================================= */
function wireStaticEvents() {
  // user selection
  // Login
$("#login-submit").addEventListener("click", attemptLogin);

$("#login-password").addEventListener("keydown", e => {
  if (e.key === "Enter") attemptLogin();
});

$("#login-name").addEventListener("keydown", e => {
  if (e.key === "Enter") attemptLogin();
});
  // logout
  $("#logout-btn").addEventListener("click", () => confirmLogout());
  $("#settings-logout-btn").addEventListener("click", () => confirmLogout());
  $("#open-notifications").addEventListener("click", () => {
    toast("No new notifications");
  });

  // setup wizard nav
  $("#setup-next").addEventListener("click", setupNext);
  $("#setup-prev").addEventListener("click", setupPrev);
  $$("#su-goal-grid .goal-option").forEach(btn => {
    btn.addEventListener("click", () => selectGoalOption("#su-goal-grid", btn));
  });

  // bottom nav
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });

  // quick actions
  $("#qa-start-workout").addEventListener("click", () => navigateTo("workout"));
  $("#qa-rest-timer").addEventListener("click", () => { resetRestTimerFromSettings(); openOverlay("#overlay-resttimer"); });
  $("#qa-add-weight").addEventListener("click", () => { navigateTo("progress"); switchTab("progress-tabs", "weight"); openWeightAddPrompt(); });
  $("#qa-pr").addEventListener("click", () => { navigateTo("progress"); switchTab("progress-tabs", "pr"); });
  $("#qa-journal").addEventListener("click", () => { renderJournal(); openOverlay("#overlay-journal"); });
  $("#qa-calorie").addEventListener("click", () => { prefillCalorieCalc(); openOverlay("#overlay-calorie"); });

  // overlay close buttons
  $$("[data-close-overlay]").forEach(btn => {
    btn.addEventListener("click", () => closeOverlay("#" + btn.dataset.closeOverlay));
  });

  // workout
  $("#workout-start-btn").addEventListener("click", startWorkoutSession);
  $("#workout-finish-btn").addEventListener("click", finishWorkoutSession);

  // progress tabs
  $$("#progress-tabs .tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab("progress-tabs", btn.dataset.tab)));
  $$("#history-tabs .tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab("history-tabs", btn.dataset.tab)));
  $("#wt-add-btn").addEventListener("click", openWeightAddPrompt);
  $("#history-exercise-select").addEventListener("change", renderExerciseHistory);

  // PR
  $("#pr-save-btn").addEventListener("click", savePR);

  // rest timer
  $("#timer-toggle").addEventListener("click", toggleRestTimer);
  $("#timer-reset").addEventListener("click", () => resetRestTimer(state.restTimer.total));
  $("#timer-plus15").addEventListener("click", () => {
    state.restTimer.remaining += 15;
    state.restTimer.total += 15;
    updateRestTimerDisplay();
  });

  // journal
  $("#journal-save").addEventListener("click", saveJournalEntry);
  $("#journal-photo").addEventListener("change", handleJournalPhoto);

  // calorie calc
  $("#cal-calc-btn").addEventListener("click", calculateCalories);

  // settings
  $$("#set-goal-grid .goal-option").forEach(btn => btn.addEventListener("click", () => selectGoalOption("#set-goal-grid", btn)));
  $("#save-profile-btn").addEventListener("click", saveProfileSettings);
  $("#save-exercises-btn").addEventListener("click", saveExerciseSettings);
  $("#save-workout-settings-btn").addEventListener("click", saveWorkoutSettings);
  $("#save-password-btn").addEventListener("click", changePassword);
  $("#set-darkmode").addEventListener("change", toggleDarkMode);
  $("#set-notif").addEventListener("change", saveTogglesSettings);
  $("#set-streak-reminder").addEventListener("change", saveTogglesSettings);
  $("#set-friends-share").addEventListener("change", saveTogglesSettings);
  $("#save-schedule-btn").addEventListener("click", saveScheduleSettings);
  $("#export-data-btn").addEventListener("click", exportData);
  $("#import-data-input").addEventListener("change", importData);
  $("#reset-data-btn").addEventListener("click", confirmResetData);
}

function attemptLogin() {

  const name = $("#login-name").value.trim();
  const pw = $("#login-password").value;

  if (!name || !pw) {
    $("#login-error").textContent = "Please enter your name and password.";
    show($("#login-error"));
    return;
  }

  const userId = name.toLowerCase().replace(/\s+/g, "_");
  const acc = DB.getAccount(userId);

  // Existing account
  if (acc) {

    if (hashPassword(pw) === acc.passwordHash) {
      hide($("#login-error"));
      enterApp(userId);
    } else {
      $("#login-error").textContent = "Incorrect password.";
      show($("#login-error"));
    }

    return;
  }

  // New account
state.pendingLoginUser = userId;

state.setup = {
  profile: {
    name: name
  }
};

state.setup._passwordPlain = pw;

hide($("#login-error"));
hide($("#login-screen"));
beginSetupWizard();


function attemptCreateAccount() {
  const p1 = $("#pwc-input1").value;
  const p2 = $("#pwc-input2").value;
  if (p1.length < 4 || p1 !== p2) {
    show($("#pwc-error"));
    return;
  }
  hide($("#pwc-error"));
  const userId = state.pendingLoginUser;
  // start setup wizard, password captured now but account only saved once setup completes
  state.setup = defaultProfile();
  state.setup.name = USERS[userId].name;
  state.setup._passwordPlain = p1;
  state.setupStepIndex = 0;
  hide($("#login-screen"));
  beginSetupWizard();
}

function confirmLogout() {
  showModal({
    icon: "⏻",
    title: "Log out?",
    body: "You'll need your password to sign back in.",
    actions: [
      { label: "Cancel", primary: false, onClick: closeModal },
      { label: "Log out", primary: true, onClick: () => { closeModal(); doLogout(); } }
    ]
  });
}
function doLogout() {

  stopWorkoutTimerInterval();

  DB.setSession(null);

  state.currentUser = null;

  hide($("#app"));

  $$(".overlay").forEach(hide);

  $("#login-name").value = "";
  $("#login-password").value = "";
  hide($("#login-error"));

  show($("#login-screen"));

}

/* =========================================================================
   SETUP WIZARD
   ========================================================================= */
function beginSetupWizard() {

  show($("#setup-screen"));

  state.setupStepIndex = 0;

  buildExerciseInputs();

  renderSetupStep();

}

function buildExerciseInputs() {
  const container = $("#su-exercise-groups");
  container.innerHTML = "";
  BODY_PARTS.forEach(bp => {
    const group = document.createElement("div");
    group.className = "exercise-group";
    group.innerHTML = `<div class="exercise-group-title">${BODY_PART_LABELS[bp]}<span class="count">4 slots</span></div>`;
    for (let i = 0; i < 4; i++) {
      const wrap = document.createElement("div");
      wrap.className = "exercise-slot";
      wrap.innerHTML = `<input class="text-input" placeholder="Exercise ${i + 1}" data-bp="${bp}" data-idx="${i}" />`;
      group.appendChild(wrap);
    }
    container.appendChild(group);
  });
}

function renderSetupStep() {
  const step = state.setupSteps[state.setupStepIndex];
  $$(".setup-step").forEach(s => hide(s));
  show($(`.setup-step[data-step="${step}"]`));
  $("#setup-progress-fill").style.width = ((state.setupStepIndex + 1) / state.setupSteps.length * 100) + "%";
  $("#setup-prev").classList.toggle("hidden", state.setupStepIndex === 0);
  $("#setup-next").textContent = state.setupStepIndex === state.setupSteps.length - 1 ? "Finish setup" : "Continue";
}

function selectGoalOption(gridSel, btn) {
  $$(gridSel + " .goal-option").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
}

function setupPrev() {
  if (state.setupStepIndex > 0) {
    state.setupStepIndex--;
    renderSetupStep();
  }
}

function setupNext() {
  const step = state.setupSteps[state.setupStepIndex];

  if (step === 1) {
    const weight = parseFloat($("#su-weight").value);
    const target = parseFloat($("#su-target").value);
    const height = parseFloat($("#su-height").value);
    const age = parseInt($("#su-age").value);
    if (!weight || !target || !height || !age) {
      toast("Please fill in all fields");
      return;
    }
    state.setup.currentWeight = weight;
    state.setup.targetWeight = target;
    state.setup.height = height;
    state.setup.age = age;
  }

  if (step === 2) {
    const selected = $("#su-goal-grid .goal-option.selected");
    if (!selected) { toast("Please choose a goal"); return; }
    state.setup.goal = selected.dataset.goal;
  }

  if (step === 3) {
    let allFilled = true;
    BODY_PARTS.forEach(bp => {
      const inputs = $$(`#su-exercise-groups input[data-bp="${bp}"]`);
      inputs.forEach((inp, i) => {
        const val = inp.value.trim();
        if (!val) allFilled = false;
        state.setup.exercises[bp][i] = val;
      });
    });
    if (!allFilled) {
      toast("Please fill in all 4 exercises per body part");
      return;
    }
  }

if (step === 4) {

  const password = state.setup._passwordPlain;

  if (!password || password.length < 4) {
    show($("#su-pw-error"));
    return;
  }

  hide($("#su-pw-error"));

  finishSetup(password);

  return;
}

  state.setupStepIndex++;
  renderSetupStep();
}

function finishSetup(password) {
  const userId = state.pendingLoginUser;
  const profile = state.setup;
  delete profile._passwordPlain;
  const account = { passwordHash: hashPassword(password), profile };
  DB.saveAccount(userId, account);
  DB.saveData(userId, DB.getData(userId)); // ensure data record exists
  toast("Account created");
  hide($("#setup-screen"));
  enterApp(userId);
}

/* =========================================================================
   APP ENTRY / NAVIGATION
   ========================================================================= */
function enterApp(userId) {
  state.currentUser = userId;
  DB.setSession(userId);

  const acc = DB.getAccount(userId);
  const userName = acc.profile.name || "User";
  const initial = userName.charAt(0).toUpperCase();

  $("#app-avatar").textContent = initial;
  $("#app-username").textContent = userName;
  $("#app-greeting").textContent = "Good to see you";

  applyDarkModePreference(acc.profile.settings.darkMode);

  hide($("#login-screen"));
  hide($("#setup-screen"));
  show($("#app"));

  navigateTo("home");
  renderAll();
}

function navigateTo(page) {
  state.currentPage = page;
  $$(".page").forEach(p => hide(p));
  show($("#page-" + page));
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const fab = document.getElementById("pr-add-fab");
  if (fab) hide(fab);
  if (page === "home") renderHome();
  if (page === "workout") renderWorkoutPage();
  if (page === "progress") renderProgressPage();
  if (page === "history") renderHistoryPage();
  if (page === "settings") renderSettingsPage();
}

function renderAll() {
  renderHome();
}

function switchTab(rowId, tabName) {
  $$(`#${rowId} .tab-btn`).forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));
  const container = rowId === "progress-tabs" ? "#page-progress" : "#page-history";
  $$(`${container} .tab-panel`).forEach(p => hide(p));
  show($(`#tab-${tabName}`));
  const fab = document.getElementById("pr-add-fab");
  if (fab && tabName !== "pr") hide(fab);
  if (tabName === "weight") renderWeightTab();
  if (tabName === "pr") renderPRTab();
  if (tabName === "exercises") renderExerciseHistoryTab();
}

/* =========================================================================
   HOME PAGE
   ========================================================================= */
function renderHome() {
  const acc = DB.getAccount(state.currentUser);
  const data = DB.getData(state.currentUser);
  const profile = acc.profile;
  const schedule = DB.getSchedule();
  const dayKey = todayDayKey();
  const todayParts = schedule[dayKey] || [];

  $("#home-current-weight").textContent = (profile.currentWeight ?? "—") + " kg";
  $("#home-target-weight").textContent = (profile.targetWeight ?? "—") + " kg";
  $("#home-goal").textContent = profile.goal;
  $("#home-today").textContent = todayParts.length ? todayParts.map(bp => BODY_PART_LABELS[bp]).join(" + ") : "Rest Day";

  const weekStats = computeWeekStats(data, schedule);
  $("#home-weekly").textContent = `${weekStats.completed} / ${weekStats.total}`;
  $("#home-streak").textContent = `${data.streak || 0} days`;

  const totals = computeTotals(data);
  $("#home-completed").textContent = totals.completedWorkouts;
  $("#home-sets").textContent = totals.totalSets;
}

function computeWeekStats(data, schedule) {
  // Monday-start week containing today
  const now = new Date();
  const day = now.getDay(); // 0 sun .. 6 sat
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  let total = 0, completed = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = DAY_KEYS[d.getDay()];
    if (!schedule[key] || schedule[key].length === 0) continue; // rest day, not counted
    total++;
    const dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const entry = data.workoutHistory[dateStr];
    if (entry && entry.completed) completed++;
  }
  return { total, completed };
}

function computeTotals(data) {
  let completedWorkouts = 0, totalSets = 0;
  Object.values(data.workoutHistory).forEach(entry => {
    if (entry.completed) completedWorkouts++;
    Object.values(entry.exercises || {}).forEach(sets => {
      sets.forEach(s => { if (s.completed) totalSets++; });
    });
  });
  return { completedWorkouts, totalSets };
}

/* =========================================================================
   WORKOUT PAGE
   ========================================================================= */
function renderWorkoutPage() {
  const acc = DB.getAccount(state.currentUser);
  const data = DB.getData(state.currentUser);
  const schedule = DB.getSchedule();
  const dayKey = todayDayKey();
  const todayParts = schedule[dayKey] || [];
  const dateStr = todayDateStr();

  $("#workout-day-pill").textContent = DAY_LABELS[dayKey];

  if (todayParts.length === 0) {
    show($("#workout-restday"));
    hide($("#workout-body"));
    return;
  }
  hide($("#workout-restday"));
  show($("#workout-body"));

  // load or init today's session
  let entry = data.workoutHistory[dateStr];
  const isNewEntry = !entry;
  if (!entry) {
    entry = { bodyParts: todayParts, exercises: {}, completed: false, startedAt: null, durationSec: 0 };
    todayParts.forEach(bp => {
      (acc.profile.exercises[bp] || []).forEach(name => {
        if (!name) return;
        entry.exercises[name] = makeEmptySets(acc.profile.settings.sets);
      });
    });
  }
  data.workoutHistory[dateStr] = entry;
  DB.saveData(state.currentUser, data);

  state.workout.todayKey = dateStr;
  state.workout.bodyParts = todayParts;
  state.workout.startedAt = entry.startedAt;
  state.workout.running = !!entry.startedAt && !entry.completed;

  renderWorkoutGroups(entry, acc.profile);
  updateWorkoutTimerUI(entry);
}

function makeEmptySets(count) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push({ weight: "", reps: "", completed: false });
  return arr;
}

function renderWorkoutGroups(entry, profile) {
  const container = $("#workout-groups");
  container.innerHTML = "";
  state.workout.bodyParts.forEach(bp => {
    const names = (profile.exercises[bp] || []).filter(n => n);
    if (names.length === 0) return;
    const group = document.createElement("div");
    group.className = "exercise-body-group";
    group.innerHTML = `<div class="exercise-body-title">${BODY_PART_LABELS[bp]}</div>`;
    names.forEach(name => {
      group.appendChild(buildExerciseCard(name, entry));
    });
    container.appendChild(group);
  });
}

function buildExerciseCard(name, entry) {
  const sets = entry.exercises[name] || [];
  const allDone = sets.length > 0 && sets.every(s => s.completed);
  const card = document.createElement("div");
  card.className = "exercise-card" + (allDone ? " completed" : "");
  const header = document.createElement("div");
  header.className = "exercise-card-header";
  header.innerHTML = `<div class="exercise-card-name">${escapeHtml(name)}</div>${allDone ? '<div class="exercise-card-badge">✓ Completed</div>' : ""}`;
  card.appendChild(header);

  sets.forEach((set, idx) => {
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `
      <div class="set-row-index">${idx + 1}</div>
      <input type="number" class="set-input" placeholder="kg" value="${set.weight}" data-ex="${encodeURIComponent(name)}" data-idx="${idx}" data-field="weight" />
      <input type="number" class="set-input" placeholder="reps" value="${set.reps}" data-ex="${encodeURIComponent(name)}" data-idx="${idx}" data-field="reps" />
      <button class="set-check ${set.completed ? "done" : ""}" data-ex="${encodeURIComponent(name)}" data-idx="${idx}">✓</button>
    `;
    card.appendChild(row);
  });

  card.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener("input", () => {
      const exName = decodeURIComponent(input.dataset.ex);
      const idx = parseInt(input.dataset.idx);
      const field = input.dataset.field;
      updateSetField(exName, idx, field, input.value);
    });
  });
  card.querySelectorAll('.set-check').forEach(btn => {
    btn.addEventListener("click", () => {
      const exName = decodeURIComponent(btn.dataset.ex);
      const idx = parseInt(btn.dataset.idx);
      toggleSetComplete(exName, idx);
    });
  });

  return card;
}

function getTodayEntry() {
  const data = DB.getData(state.currentUser);
  return { data, entry: data.workoutHistory[state.workout.todayKey] };
}

function updateSetField(exName, idx, field, value) {
  const { data, entry } = getTodayEntry();
  if (!entry || !entry.exercises[exName]) return;
  entry.exercises[exName][idx][field] = value;
  DB.saveData(state.currentUser, data);
}

function toggleSetComplete(exName, idx) {
  const { data, entry } = getTodayEntry();
  if (!entry || !entry.exercises[exName]) return;
  const set = entry.exercises[exName][idx];
  if (!set.weight || !set.reps) {
    toast("Enter weight and reps first");
    return;
  }
  set.completed = !set.completed;
  DB.saveData(state.currentUser, data);

  const acc = DB.getAccount(state.currentUser);
  renderWorkoutGroups(entry, acc.profile);
  checkWorkoutCompletion(data, entry);
}

function checkWorkoutCompletion(data, entry) {
  const allExercisesDone = Object.values(entry.exercises).every(sets => sets.length > 0 && sets.every(s => s.completed));
  if (allExercisesDone && !entry.completed && entry.startedAt) {
    entry.completed = true;
    entry.durationSec = Math.floor((Date.now() - entry.startedAt) / 1000);
    updateStreakAndSave(data);
    stopWorkoutTimerInterval();
    show($("#workout-finish-btn"));
    celebrateWorkoutComplete();
  }
  DB.saveData(state.currentUser, data);
}

function updateStreakAndSave(data) {
  const schedule = DB.getSchedule();
  // compute current streak walking backwards from today over scheduled days
  let streak = 0;
  let cursor = new Date();
  for (let i = 0; i < 400; i++) {
    const key = DAY_KEYS[cursor.getDay()];
    const dateStr = cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0") + "-" + String(cursor.getDate()).padStart(2, "0");
    if (!schedule[key] || schedule[key].length === 0) {
      cursor.setDate(cursor.getDate() - 1);
      continue; // rest days don't break streaks, just skip
    }
    const entry = data.workoutHistory[dateStr];
    if (entry && entry.completed) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  data.streak = streak;
  data.bestStreak = Math.max(data.bestStreak || 0, streak);
  DB.saveData(state.currentUser, data);
}

function celebrateWorkoutComplete() {
  showModal({
    icon: "🎉",
    title: "Workout Completed!",
    body: "Great session. Your streak and progress have been updated.",
    actions: [{ label: "Nice", primary: true, onClick: () => { closeModal(); renderHome(); } }]
  });
}

function startWorkoutSession() {
  const { data, entry } = getTodayEntry();
  if (!entry) return;
  if (!entry.startedAt) {
    entry.startedAt = Date.now();
    DB.saveData(state.currentUser, data);
  }
  state.workout.running = true;
  startWorkoutTimerInterval(entry.startedAt);
  updateWorkoutTimerUI(entry);
}

function finishWorkoutSession() {
  const { data, entry } = getTodayEntry();
  if (!entry) return;
  entry.completed = true;
  entry.durationSec = entry.startedAt ? Math.floor((Date.now() - entry.startedAt) / 1000) : entry.durationSec;
  updateStreakAndSave(data);
  DB.saveData(state.currentUser, data);
  stopWorkoutTimerInterval();
  const acc = DB.getAccount(state.currentUser);
  renderWorkoutGroups(entry, acc.profile);
  updateWorkoutTimerUI(entry);
  renderHome();
  toast("Workout saved");
}

function updateWorkoutTimerUI(entry) {
  const startBtn = $("#workout-start-btn");
  const finishBtn = $("#workout-finish-btn");
  if (entry.completed) {
    startBtn.textContent = "Workout Complete";
    startBtn.disabled = true;
    hide(finishBtn);
    $("#workout-elapsed").textContent = formatDuration(entry.durationSec || 0);
  } else if (entry.startedAt) {
    startBtn.textContent = "In Progress";
    startBtn.disabled = true;
    show(finishBtn);
  } else {
    startBtn.textContent = "Start Workout";
    startBtn.disabled = false;
    hide(finishBtn);
    $("#workout-elapsed").textContent = "00:00";
  }
}

function startWorkoutTimerInterval(startedAt) {
  stopWorkoutTimerInterval();
  state.workout.elapsedTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    $("#workout-elapsed").textContent = formatDuration(secs);
  }, 1000);
}
function stopWorkoutTimerInterval() {
  if (state.workout.elapsedTimer) { clearInterval(state.workout.elapsedTimer); state.workout.elapsedTimer = null; }
}
function formatDuration(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* =========================================================================
   PROGRESS PAGE
   ========================================================================= */
function renderProgressPage() {
  renderWeeklyTab();
}

function renderWeeklyTab() {
  const data = DB.getData(state.currentUser);
  const schedule = DB.getSchedule();
  const grid = $("#week-grid");
  grid.innerHTML = "";

  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const todayStr = todayDateStr();

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = DAY_KEYS[d.getDay()];
    const dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const isRest = !schedule[key] || schedule[key].length === 0;
    const entry = data.workoutHistory[dateStr];
    const isDone = entry && entry.completed;
    const cell = document.createElement("div");
    cell.className = "week-day" + (isRest ? " rest" : "") + (isDone ? " done" : "") + (dateStr === todayStr ? " today" : "");
    cell.innerHTML = `<div class="week-day-label">${labels[i]}</div><div class="week-day-icon">${isRest ? "🌙" : (isDone ? "✅" : "⭕")}</div>`;
    grid.appendChild(cell);
  }

  const weekStats = computeWeekStats(data, schedule);
  const pct = weekStats.total ? Math.round((weekStats.completed / weekStats.total) * 100) : 0;
  $("#prog-completion").textContent = pct + "%";
  $("#prog-streak").textContent = data.streak || 0;
  $("#prog-best-streak").textContent = data.bestStreak || 0;
  const totals = computeTotals(data);
  $("#prog-completed").textContent = totals.completedWorkouts;
  $("#prog-sets").textContent = totals.totalSets;
}

function renderWeightTab() {
  const acc = DB.getAccount(state.currentUser);
  const data = DB.getData(state.currentUser);
  $("#wt-current").textContent = (acc.profile.currentWeight ?? "—") + " kg";
  $("#wt-target").textContent = (acc.profile.targetWeight ?? "—") + " kg";

  const history = [...data.weightHistory].sort((a, b) => a.date.localeCompare(b.date));
  drawWeightChart(history);

  const list = $("#weight-history-list");
  list.innerHTML = "";
  [...data.weightHistory].sort((a, b) => b.date.localeCompare(a.date)).forEach(entry => {
    const row = document.createElement("div");
    row.className = "entry-row";
    row.innerHTML = `<div class="entry-row-left"><div class="entry-date">${formatDateNice(entry.date)}</div><div class="entry-main">Weight logged</div></div><div class="entry-row-right">${entry.weight} kg</div>`;
    list.appendChild(row);
  });
  if (data.weightHistory.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div><div class="empty-title">No entries yet</div><div class="empty-sub">Log your weight to start tracking.</div></div>`;
  }
}

function drawWeightChart(history) {
  const svg = $("#weight-chart");
  svg.innerHTML = "";
  if (history.length < 2) {
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", "160"); txt.setAttribute("y", "70");
    txt.setAttribute("text-anchor", "middle"); txt.setAttribute("fill", "#626B7A"); txt.setAttribute("font-size", "11");
    txt.textContent = "Log at least 2 entries to see a trend";
    svg.appendChild(txt);
    return;
  }
  const weights = history.map(h => h.weight);
  const min = Math.min(...weights), max = Math.max(...weights);
  const pad = (max - min) * 0.15 || 2;
  const lo = min - pad, hi = max + pad;
  const w = 320, h = 140, marginX = 10, marginY = 14;

  const points = history.map((entry, i) => {
    const x = marginX + (i / (history.length - 1)) * (w - marginX * 2);
    const y = h - marginY - ((entry.weight - lo) / (hi - lo)) * (h - marginY * 2);
    return [x, y];
  });

  const pathD = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaD = pathD + ` L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`;

  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `<linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FF5A36" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="#FF5A36" stop-opacity="0"/>
  </linearGradient>`;
  svg.appendChild(defs);

  const area = document.createElementNS(ns, "path");
  area.setAttribute("d", areaD);
  area.setAttribute("fill", "url(#wgrad)");
  svg.appendChild(area);

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#FF5A36");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  points.forEach(p => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", "3");
    c.setAttribute("fill", "#0A0E14"); c.setAttribute("stroke", "#FF5A36"); c.setAttribute("stroke-width", "2");
    svg.appendChild(c);
  });
}

function openWeightAddPrompt() {
  const acc = DB.getAccount(state.currentUser);
  showModal({
    icon: "⚖️",
    title: "Log today's weight",
    body: "",
    actions: [{ label: "Cancel", primary: false, onClick: closeModal }]
  });
  // replace modal body with an input since showModal only supports text
  const bodyEl = $("#modal-body");
  bodyEl.innerHTML = `<input type="number" step="0.1" class="text-input" id="modal-weight-input" placeholder="Weight in kg" value="${acc.profile.currentWeight || ""}" style="margin-top:10px" />`;
  const actionsEl = $("#modal-actions");
  actionsEl.innerHTML = "";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-ghost"; cancelBtn.textContent = "Cancel"; cancelBtn.onclick = closeModal;
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary"; saveBtn.textContent = "Save"; saveBtn.onclick = saveWeightEntry;
  actionsEl.appendChild(cancelBtn); actionsEl.appendChild(saveBtn);
}

function saveWeightEntry() {
  const input = $("#modal-weight-input");
  const val = parseFloat(input.value);
  if (!val || val <= 0) { toast("Enter a valid weight"); return; }
  const data = DB.getData(state.currentUser);
  const dateStr = todayDateStr();
  const existingIdx = data.weightHistory.findIndex(e => e.date === dateStr);
  if (existingIdx >= 0) data.weightHistory[existingIdx].weight = val;
  else data.weightHistory.push({ date: dateStr, weight: val });
  DB.saveData(state.currentUser, data);

  const acc = DB.getAccount(state.currentUser);
  acc.profile.currentWeight = val;
  DB.saveAccount(state.currentUser, acc);

  closeModal();
  toast("Weight logged");
  renderWeightTab();
  renderHome();
}

function renderPRTab() {
  const acc = DB.getAccount(state.currentUser);
  const data = DB.getData(state.currentUser);
  const list = $("#pr-list");
  list.innerHTML = "";

  let fab = document.getElementById("pr-add-fab");
  if (!fab) {
    fab = document.createElement("button");
    fab.className = "pr-add-fab"; fab.id = "pr-add-fab"; fab.textContent = "+";
    fab.addEventListener("click", openPRAddOverlay);
    document.body.appendChild(fab);
  }
  show(fab);

  const allExercises = getAllUserExercises(acc.profile);
  if (allExercises.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">No exercises yet</div><div class="empty-sub">Add exercises in Settings first.</div></div>`;
    return;
  }
  allExercises.forEach(name => {
    const pr = data.prs[name];
    const card = document.createElement("div");
    card.className = "pr-card";
    card.innerHTML = `
      <div class="pr-card-name">${escapeHtml(name)}</div>
      <div class="pr-card-row"><span>Best weight</span><span class="pr-card-value">${pr ? pr.weight + " kg" : "—"}</span></div>
      <div class="pr-card-row"><span>Best reps</span><span class="pr-card-value">${pr ? pr.reps : "—"}</span></div>
      <div class="pr-card-row"><span>Date</span><span class="pr-card-value">${pr ? formatDateShort(pr.date) : "—"}</span></div>
    `;
    list.appendChild(card);
  });
}

function getAllUserExercises(profile) {
  const names = [];
  BODY_PARTS.forEach(bp => (profile.exercises[bp] || []).forEach(n => { if (n) names.push(n); }));
  return names;
}

function openPRAddOverlay() {
  const acc = DB.getAccount(state.currentUser);
  const select = $("#pr-exercise-select");
  select.innerHTML = getAllUserExercises(acc.profile).map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  $("#pr-weight").value = "";
  $("#pr-reps").value = "";
  openOverlay("#overlay-pr-add");
}

function savePR() {
  const name = $("#pr-exercise-select").value;
  const weight = parseFloat($("#pr-weight").value);
  const reps = parseInt($("#pr-reps").value);
  if (!name || !weight || !reps) { toast("Fill in all fields"); return; }
  const data = DB.getData(state.currentUser);
  const existing = data.prs[name];
  if (!existing || weight > existing.weight || (weight === existing.weight && reps > existing.reps)) {
    data.prs[name] = { weight, reps, date: todayDateStr() };
    DB.saveData(state.currentUser, data);
    toast("New PR saved!");
  } else {
    data.prs[name] = data.prs[name]; // unchanged, but still log attempt in exercise history via journal-less path
    toast("Saved — not a new best, but logged");
    data.prs[name].lastAttempt = { weight, reps, date: todayDateStr() };
    DB.saveData(state.currentUser, data);
  }
  closeOverlay("#overlay-pr-add");
  renderPRTab();
}

/* =========================================================================
   HISTORY PAGE
   ========================================================================= */
function renderHistoryPage() {
  renderWorkoutHistoryTab();
  populateExerciseHistorySelect();
}

function renderWorkoutHistoryTab() {
  const data = DB.getData(state.currentUser);
  const list = $("#workout-history-list");
  list.innerHTML = "";
  const dates = Object.keys(data.workoutHistory).sort().reverse();
  const completedDates = dates.filter(d => data.workoutHistory[d].completed);
  if (completedDates.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🕓</div><div class="empty-title">No workouts yet</div><div class="empty-sub">Complete a workout to see it here.</div></div>`;
    return;
  }
  completedDates.forEach(dateStr => {
    const entry = data.workoutHistory[dateStr];
    const setCount = Object.values(entry.exercises).reduce((sum, sets) => sum + sets.filter(s => s.completed).length, 0);
    const row = document.createElement("div");
    row.className = "entry-row";
    row.innerHTML = `<div class="entry-row-left"><div class="entry-date">${formatDateNice(dateStr)} · ${entry.bodyParts.map(bp => BODY_PART_LABELS[bp]).join(" + ")}</div><div class="entry-main">${formatDuration(entry.durationSec || 0)} · ${setCount} sets</div></div><div class="entry-row-right">✓</div>`;
    list.appendChild(row);
  });
}

function populateExerciseHistorySelect() {
  const acc = DB.getAccount(state.currentUser);
  const select = $("#history-exercise-select");
  const names = getAllUserExercises(acc.profile);
  select.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
}

function renderExerciseHistoryTab() {
  populateExerciseHistorySelect();
  renderExerciseHistory();
}

function renderExerciseHistory() {
  const name = $("#history-exercise-select").value;
  const data = DB.getData(state.currentUser);
  const list = $("#exercise-history-list");
  list.innerHTML = "";
  if (!name) return;

  const dates = Object.keys(data.workoutHistory).sort().reverse();
  let any = false;
  dates.forEach(dateStr => {
    const entry = data.workoutHistory[dateStr];
    const sets = entry.exercises[name];
    if (!sets) return;
    const doneSets = sets.filter(s => s.completed && s.weight && s.reps);
    if (doneSets.length === 0) return;
    any = true;
    const summary = doneSets.map(s => `${s.weight}kg×${s.reps}`).join(", ");
    const row = document.createElement("div");
    row.className = "entry-row";
    row.innerHTML = `<div class="entry-row-left"><div class="entry-date">${formatDateNice(dateStr)}</div><div class="entry-main">${summary}</div></div>`;
    list.appendChild(row);
  });
  if (!any) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No history yet</div><div class="empty-sub">Complete sets for this exercise to build history.</div></div>`;
  }
}

/* =========================================================================
   SETTINGS PAGE
   ========================================================================= */
function renderSettingsPage() {
  const acc = DB.getAccount(state.currentUser);
  const p = acc.profile;

  $("#set-name").value = p.name || "";
  $("#set-age").value = p.age || "";
  $("#set-height").value = p.height || "";
  $("#set-weight").value = p.currentWeight || "";
  $("#set-target").value = p.targetWeight || "";
  $$("#set-goal-grid .goal-option").forEach(b => b.classList.toggle("selected", b.dataset.goal === p.goal));

  buildSettingsExerciseInputs(p.exercises);

  $("#set-sets").value = p.settings.sets;
  $("#set-reps").value = p.settings.reps;
  $("#set-rest").value = p.settings.restTimer;

  $("#set-darkmode").checked = p.settings.darkMode !== false;
  $("#set-notif").checked = !!p.settings.notifications;
  $("#set-streak-reminder").checked = !!p.settings.streakReminder;
  $("#set-friends-share").checked = !!p.settings.friendsSharing;

  buildScheduleSettings();
}

function buildSettingsExerciseInputs(exercises) {
  const container = $("#settings-exercise-groups");
  container.innerHTML = "";
  BODY_PARTS.forEach(bp => {
    const group = document.createElement("div");
    group.className = "exercise-group";
    group.innerHTML = `<div class="exercise-group-title">${BODY_PART_LABELS[bp]}</div>`;
    for (let i = 0; i < 4; i++) {
      const wrap = document.createElement("div");
      wrap.className = "exercise-slot";
      wrap.innerHTML = `<input class="text-input" placeholder="Exercise ${i + 1}" value="${escapeHtml(exercises[bp][i] || "")}" data-bp="${bp}" data-idx="${i}" />`;
      group.appendChild(wrap);
    }
    container.appendChild(group);
  });
}

function buildScheduleSettings() {
  const schedule = DB.getSchedule();
  const list = $("#settings-schedule-list");
  list.innerHTML = "";
  const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  dayOrder.forEach(key => {
    const row = document.createElement("div");
    row.className = "schedule-row";
    const current = (schedule[key] || []).join(",");
    const options = ["", "chest,biceps", "back,triceps", "shoulders,legs"].map(opt => {
      const label = opt === "" ? "Rest Day" : opt.split(",").map(bp => BODY_PART_LABELS[bp]).join(" + ");
      return `<option value="${opt}" ${opt === current ? "selected" : ""}>${label}</option>`;
    }).join("");
    row.innerHTML = `<div class="schedule-row-day">${DAY_LABELS[key].slice(0, 3)}</div><select data-day="${key}">${options}</select>`;
    list.appendChild(row);
  });
}

function saveProfileSettings() {
  const acc = DB.getAccount(state.currentUser);
  acc.profile.name = $("#set-name").value.trim() || acc.profile.name || "User";
  acc.profile.age = parseInt($("#set-age").value) || acc.profile.age;
  acc.profile.height = parseFloat($("#set-height").value) || acc.profile.height;
  acc.profile.currentWeight = parseFloat($("#set-weight").value) || acc.profile.currentWeight;
  acc.profile.targetWeight = parseFloat($("#set-target").value) || acc.profile.targetWeight;
  const selectedGoal = $("#set-goal-grid .goal-option.selected");
  if (selectedGoal) acc.profile.goal = selectedGoal.dataset.goal;
  DB.saveAccount(state.currentUser, acc);
  $("#app-username").textContent = acc.profile.name;
  toast("Profile saved");
  renderHome();
}

function saveExerciseSettings() {
  const acc = DB.getAccount(state.currentUser);
  BODY_PARTS.forEach(bp => {
    const inputs = $$(`#settings-exercise-groups input[data-bp="${bp}"]`);
    inputs.forEach((inp, i) => { acc.profile.exercises[bp][i] = inp.value.trim(); });
  });
  DB.saveAccount(state.currentUser, acc);
  toast("Exercises saved");
}

function saveWorkoutSettings() {
  const acc = DB.getAccount(state.currentUser);
  acc.profile.settings.sets = Math.max(1, parseInt($("#set-sets").value) || 3);
  acc.profile.settings.reps = Math.max(1, parseInt($("#set-reps").value) || 12);
  acc.profile.settings.restTimer = Math.max(10, parseInt($("#set-rest").value) || 90);
  DB.saveAccount(state.currentUser, acc);
  toast("Workout settings saved");
}

function changePassword() {
  const p1 = $("#set-newpw").value;
  const p2 = $("#set-newpw2").value;
  if (p1.length < 4 || p1 !== p2) { show($("#set-pw-error")); return; }
  hide($("#set-pw-error"));
  const acc = DB.getAccount(state.currentUser);
  acc.passwordHash = hashPassword(p1);
  DB.saveAccount(state.currentUser, acc);
  $("#set-newpw").value = ""; $("#set-newpw2").value = "";
  toast("Password updated");
}

function toggleDarkMode() {
  const acc = DB.getAccount(state.currentUser);
  acc.profile.settings.darkMode = $("#set-darkmode").checked;
  DB.saveAccount(state.currentUser, acc);
  applyDarkModePreference(acc.profile.settings.darkMode);
}
function applyDarkModePreference(isDark) {
  document.documentElement.style.filter = isDark === false ? "invert(1) hue-rotate(180deg)" : "";
}

function saveTogglesSettings() {
  const acc = DB.getAccount(state.currentUser);
  acc.profile.settings.notifications = $("#set-notif").checked;
  acc.profile.settings.streakReminder = $("#set-streak-reminder").checked;
  acc.profile.settings.friendsSharing = $("#set-friends-share").checked;
  DB.saveAccount(state.currentUser, acc);
  toast("Preferences saved");
}

function saveScheduleSettings() {
  const schedule = {};
  $$("#settings-schedule-list select").forEach(sel => {
    const day = sel.dataset.day;
    schedule[day] = sel.value ? sel.value.split(",") : [];
  });
  DB.saveSchedule(schedule);
  toast("Schedule updated for both accounts");
  renderHome();
}

function exportData() {
  const acc = DB.getAccount(state.currentUser);
  const data = DB.getData(state.currentUser);
  const payload = { account: acc, data, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `forge-${state.currentUser}-backup.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Export started");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      if (payload.account) DB.saveAccount(state.currentUser, payload.account);
      if (payload.data) DB.saveData(state.currentUser, payload.data);
      toast("Data imported");
      renderSettingsPage();
      renderHome();
    } catch (err) {
      toast("Invalid backup file");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function confirmResetData() {
  showModal({
    icon: "⚠️",
    title: "Reset your data?",
    body: "This clears your workouts, weight history, PRs and journal. Your login stays the same. This cannot be undone.",
    actions: [
      { label: "Cancel", primary: false, onClick: closeModal },
      { label: "Reset", primary: true, onClick: () => {
        DB.saveData(state.currentUser, { weightHistory: [], workoutHistory: {}, prs: {}, journal: [], streak: 0, bestStreak: 0 });
        closeModal();
        toast("Your data has been reset");
        navigateTo("home");
      }}
    ]
  });
}

/* =========================================================================
   REST TIMER
   ========================================================================= */
const RING_CIRCUMFERENCE = 2 * Math.PI * 88;

function resetRestTimerFromSettings() {
  const acc = DB.getAccount(state.currentUser);
  resetRestTimer(acc.profile.settings.restTimer || 90);
}
function resetRestTimer(seconds) {
  clearInterval(state.restTimer.interval);
  state.restTimer.total = seconds;
  state.restTimer.remaining = seconds;
  state.restTimer.running = false;
  $("#timer-toggle").textContent = "Start";
  updateRestTimerDisplay();
}
function toggleRestTimer() {
  if (state.restTimer.running) {
    clearInterval(state.restTimer.interval);
    state.restTimer.running = false;
    $("#timer-toggle").textContent = "Start";
  } else {
    state.restTimer.running = true;
    $("#timer-toggle").textContent = "Pause";
    state.restTimer.interval = setInterval(() => {
      state.restTimer.remaining--;
      if (state.restTimer.remaining <= 0) {
        state.restTimer.remaining = 0;
        clearInterval(state.restTimer.interval);
        state.restTimer.running = false;
        $("#timer-toggle").textContent = "Start";
        updateRestTimerDisplay();
        onRestTimerFinished();
        return;
      }
      updateRestTimerDisplay();
    }, 1000);
  }
}
function updateRestTimerDisplay() {
  const m = Math.floor(state.restTimer.remaining / 60).toString().padStart(2, "0");
  const s = Math.floor(state.restTimer.remaining % 60).toString().padStart(2, "0");
  $("#timer-display").textContent = `${m}:${s}`;
  const frac = state.restTimer.total > 0 ? state.restTimer.remaining / state.restTimer.total : 0;
  $("#timer-ring-fg").style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - frac)).toString();
}
function onRestTimerFinished() {
  toast("Rest complete — back to it 💪");
  showModal({
    icon: "⏱️",
    title: "Rest complete",
    body: "Time to jump back in.",
    actions: [{ label: "Got it", primary: true, onClick: closeModal }]
  });
}

/* =========================================================================
   JOURNAL
   ========================================================================= */
function renderJournal() {
  $("#journal-note").value = "";
  $("#journal-photo-preview").innerHTML = "";
  state.journalPhotoData = null;

  const data = DB.getData(state.currentUser);
  const list = $("#journal-list");
  list.innerHTML = "";
  const entries = [...data.journal].sort((a, b) => b.date.localeCompare(a.date));
  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📓</div><div class="empty-title">No entries yet</div><div class="empty-sub">Write your first note above.</div></div>`;
    return;
  }
  entries.forEach(entry => {
    const row = document.createElement("div");
    row.className = "entry-row";
    row.style.flexDirection = "column";
    row.style.alignItems = "stretch";
    row.innerHTML = `<div class="entry-date">${formatDateNice(entry.date)}</div><div class="entry-main" style="margin-top:6px;white-space:pre-wrap;">${escapeHtml(entry.note)}</div>${entry.photo ? `<img class="journal-entry-photo" src="${entry.photo}" />` : ""}`;
    list.appendChild(row);
  });
}

function handleJournalPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.journalPhotoData = reader.result;
    $("#journal-photo-preview").innerHTML = `<img src="${reader.result}" />`;
  };
  reader.readAsDataURL(file);
}

function saveJournalEntry() {
  const note = $("#journal-note").value.trim();
  if (!note && !state.journalPhotoData) { toast("Write a note or add a photo"); return; }
  const data = DB.getData(state.currentUser);
  data.journal.push({ id: Date.now().toString(36), date: todayDateStr(), note, photo: state.journalPhotoData });
  DB.saveData(state.currentUser, data);
  toast("Journal entry saved");
  renderJournal();
}

/* =========================================================================
   CALORIE CALCULATOR (Mifflin-St Jeor estimate — informational only)
   ========================================================================= */
function prefillCalorieCalc() {
  const acc = DB.getAccount(state.currentUser);
  $("#cal-weight").value = acc.profile.currentWeight || "";
  $("#cal-height").value = acc.profile.height || "";
  $("#cal-age").value = acc.profile.age || "";
  hide($("#cal-result"));
}
function calculateCalories() {
  const weight = parseFloat($("#cal-weight").value);
  const height = parseFloat($("#cal-height").value);
  const age = parseInt($("#cal-age").value);
  const activity = parseFloat($("#cal-activity").value);
  if (!weight || !height || !age) { toast("Fill in all fields"); return; }
  // Mifflin-St Jeor, gender-neutral average of male/female offset for a rough estimate
  const bmr = (10 * weight) + (6.25 * height) - (5 * age) - 78; // midpoint offset
  const maintenance = Math.round(bmr * activity);
  $("#cal-result-value").textContent = maintenance + " kcal";
  show($("#cal-result"));
}

/* =========================================================================
   ESCAPE / MISC
   ========================================================================= */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    $$(".overlay").forEach(o => { if (!o.classList.contains("hidden")) hide(o); });
    if (!$("#modal-backdrop").classList.contains("hidden")) closeModal();
  }
});
/* =========================================
   DEADLIFT PR TRACKER
========================================= */

function getDeadliftPRData() {
    if (!state.currentUser) {
        return {
            best: 0,
            reps: 0,
            date: null,
            history: []
        };
    }

    const data = DB.getData(state.currentUser);

    if (!data.deadliftPR) {
        data.deadliftPR = {
            best: 0,
            reps: 0,
            date: null,
            history: []
        };

        DB.saveData(state.currentUser, data);
    }

    return data.deadliftPR;
}


function renderDeadliftPR() {

    if (!state.currentUser) return;

    const pr = getDeadliftPRData();

    const valueEl = document.getElementById("deadlift-pr-value");
    const messageEl = document.getElementById("deadlift-pr-message");
    const historyEl = document.getElementById("deadlift-pr-history");

    if (!valueEl || !messageEl || !historyEl) return;

    valueEl.textContent = pr.best || 0;

    if (!pr.best) {
        messageEl.textContent = "No deadlift PR recorded yet.";
    } else {
        messageEl.textContent =
            `Best: ${pr.best} kg × ${pr.reps} reps • ${formatDateNice(pr.date)}`;
    }

    if (!pr.history || pr.history.length === 0) {
        historyEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-sub">
                    Your deadlift PR history will appear here.
                </div>
            </div>
        `;
        return;
    }

    historyEl.innerHTML = pr.history
        .slice()
        .reverse()
        .map(item => `
            <div class="deadlift-history-item">

                <div class="deadlift-history-left">
                    <div class="deadlift-history-weight">
                        ${item.weight} kg
                    </div>

                    <div class="deadlift-history-date">
                        ${formatDateNice(item.date)}
                    </div>
                </div>

                <div class="deadlift-history-reps">
                    × ${item.reps} reps
                </div>

            </div>
        `)
        .join("");
}


function saveDeadliftPR() {

    if (!state.currentUser) {
        toast("Please log in first");
        return;
    }

    const weightInput =
        document.getElementById("deadlift-pr-weight");

    const repsInput =
        document.getElementById("deadlift-pr-reps");

    const weight = parseFloat(weightInput.value);
    const reps = parseInt(repsInput.value);

    if (!weight || weight <= 0) {
        toast("Enter a valid deadlift weight");
        return;
    }

    if (!reps || reps <= 0) {
        toast("Enter the number of reps");
        return;
    }

    const data = DB.getData(state.currentUser);

    if (!data.deadliftPR) {
        data.deadliftPR = {
            best: 0,
            reps: 0,
            date: null,
            history: []
        };
    }

    const today = todayDateStr();

    const isNewPR = weight > data.deadliftPR.best;

    data.deadliftPR.history.push({
        weight: weight,
        reps: reps,
        date: today
    });

    if (isNewPR) {

        data.deadliftPR.best = weight;
        data.deadliftPR.reps = reps;
        data.deadliftPR.date = today;

        DB.saveData(state.currentUser, data);

        weightInput.value = "";
        repsInput.value = "";

        renderDeadliftPR();

        showModal({
            icon: "🏆",
            title: "NEW DEADLIFT PR!",
            body: `${weight} kg × ${reps} reps`,
            actions: [
                {
                    label: "Awesome!",
                    primary: true,
                    onClick: closeModal
                }
            ]
        });

    } else {

        DB.saveData(state.currentUser, data);

        weightInput.value = "";
        repsInput.value = "";

        renderDeadliftPR();

        toast(
            `Logged ${weight} kg × ${reps}. Current PR: ${data.deadliftPR.best} kg`
        );
    }
}


/* =========================================
   DEADLIFT PR EVENTS
========================================= */

document.addEventListener("DOMContentLoaded", () => {

    const saveButton =
        document.getElementById("deadlift-pr-save");

    if (saveButton) {
        saveButton.addEventListener(
            "click",
            saveDeadliftPR
        );
    }

    const progressTabs =
        document.getElementById("progress-tabs");

    if (progressTabs) {

        progressTabs.addEventListener("click", event => {

            const button =
                event.target.closest(".tab-btn");

            if (!button) return;

            if (button.dataset.tab === "pr") {
                setTimeout(renderDeadliftPR, 50);
            }

        });

    }

});