const STORAGE_KEY = "weekly_planner_mvp_v01";

const DAYS = [
  { id: "monday", title: "Понедельник" },
  { id: "tuesday", title: "Вторник" },
  { id: "wednesday", title: "Среда" },
  { id: "thursday", title: "Четверг" },
  { id: "friday", title: "Пятница" },
  { id: "saturday", title: "Суббота" },
  { id: "sunday", title: "Воскресенье" }
];

const CATEGORIES = [
  { id: "now", title: "Сделать немедленно", className: "task-card--now" },
  { id: "schedule", title: "Запланировать", className: "task-card--schedule", isDefault: true },
  { id: "delegate", title: "Делегировать", className: "task-card--delegate" },
  { id: "later", title: "Отложить", className: "task-card--later" },
  { id: "done", title: "Вычеркнуть/Успешно", className: "task-card--done" }
];

const DEFAULT_CATEGORY_ID = "schedule";

let state = loadState();
let selectedDayForNewTask = null;
let editingTaskId = null;
let draggedTaskId = null;
let dragSourceDay = null;
let dropHandled = false;

function createDefaultState() {
  return {
    version: "0.1",
    tasks: [],
    trash: []
  };
}

function isValidState(data) {
  return Boolean(
    data &&
      typeof data === "object" &&
      data.version === "0.1" &&
      Array.isArray(data.tasks) &&
      Array.isArray(data.trash)
  );
}

function normalizeTask(task, index, isTrash = false) {
  const sourceTask = task && typeof task === "object" ? task : {};
  const day = isValidDayId(sourceTask.day) ? sourceTask.day : "monday";
  const category = CATEGORIES.some((item) => item.id === sourceTask.category) ? sourceTask.category : DEFAULT_CATEGORY_ID;
  const normalizedTask = {
    id: typeof sourceTask.id === "string" && sourceTask.id.trim() ? sourceTask.id : createTaskId(),
    title: typeof sourceTask.title === "string" ? sourceTask.title : "Без названия",
    description: typeof sourceTask.description === "string" ? sourceTask.description : "",
    day,
    category,
    deadline: typeof sourceTask.deadline === "string" ? sourceTask.deadline : "",
    delegatedTo: typeof sourceTask.delegatedTo === "string" ? sourceTask.delegatedTo : "",
    createdAt: typeof sourceTask.createdAt === "string" ? sourceTask.createdAt : new Date().toISOString(),
    updatedAt: typeof sourceTask.updatedAt === "string" ? sourceTask.updatedAt : new Date().toISOString(),
    isCrossedOut: category === "done" || sourceTask.isCrossedOut === true,
    order: Number.isFinite(Number(sourceTask.order)) && Number(sourceTask.order) > 0 ? Number(sourceTask.order) : index + 1
  };

  if (isTrash && typeof sourceTask.deletedAt === "string") {
    normalizedTask.deletedAt = sourceTask.deletedAt;
  }

  return normalizedTask;
}

function normalizeState(data) {
  const normalizedState = {
    version: "0.1",
    tasks: data.tasks.map((task, index) => ({ ...normalizeTask(task, index), originalIndex: index })),
    trash: data.trash.map((task, index) => normalizeTask(task, index, true))
  };

  DAYS.forEach((day) => {
    normalizedState.tasks
      .filter((task) => task.day === day.id)
      .sort((firstTask, secondTask) => firstTask.order - secondTask.order || firstTask.originalIndex - secondTask.originalIndex)
      .forEach((task, index) => {
        task.order = index + 1;
        delete task.originalIndex;
      });
  });

  normalizedState.tasks.forEach((task) => {
    delete task.originalIndex;
  });

  return normalizedState;
}

function loadState() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);

    if (!savedData) {
      const defaultState = createDefaultState();
      saveState(defaultState);
      return defaultState;
    }

    const parsedData = JSON.parse(savedData);

    if (!isValidState(parsedData)) {
      throw new Error("Некорректная структура данных");
    }

    const normalizedState = normalizeState(parsedData);
    saveState(normalizedState);
    return normalizedState;
  } catch (error) {
    const defaultState = createDefaultState();
    saveState(defaultState);
    return defaultState;
  }
}

function saveState(nextState = state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    // Интерфейс должен отрисоваться даже при недоступном LocalStorage.
  }
}

function getTasksByDay(dayId) {
  return state.tasks
    .filter((task) => task.day === dayId)
    .sort((firstTask, secondTask) => (firstTask.order || 0) - (secondTask.order || 0));
}

function getCategory(categoryId) {
  return CATEGORIES.find((category) => category.id === categoryId) || CATEGORIES.find((category) => category.id === DEFAULT_CATEGORY_ID);
}

function getDay(dayId) {
  return DAYS.find((day) => day.id === dayId) || DAYS[0];
}

function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function isValidDayId(dayId) {
  return DAYS.some((day) => day.id === dayId);
}

function getTaskCountText(count) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return `${count} задача`;
  }

  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} задачи`;
  }

  return `${count} задач`;
}

function createDayColumn(day) {
  const column = document.createElement("article");
  column.className = "day-column";
  column.dataset.day = day.id;

  const header = document.createElement("div");
  header.className = "day-column__header";

  const titleWrap = document.createElement("div");

  const title = document.createElement("h2");
  title.textContent = day.title;

  const taskCount = document.createElement("span");
  taskCount.className = "task-count";
  taskCount.dataset.taskCount = day.id;
  taskCount.textContent = getTaskCountText(0);

  const addButton = document.createElement("button");
  addButton.className = "add-task";
  addButton.type = "button";
  addButton.textContent = "+";
  addButton.setAttribute("aria-label", `Добавить задачу на ${day.title.toLowerCase()}`);
  addButton.dataset.day = day.id;

  titleWrap.append(title, taskCount);
  header.append(titleWrap, addButton);
  column.append(header);

  const taskList = document.createElement("div");
  taskList.className = "task-list";
  taskList.dataset.taskList = day.id;

  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.dataset.emptyState = day.id;
  emptyState.textContent = "Пока задач нет...";

  column.append(taskList, emptyState);
  return column;
}

function shouldEnableNativeDrag() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }

  return !window.matchMedia("(max-width: 767px)").matches;
}

function createTaskCard(task) {
  const category = getCategory(task.category || DEFAULT_CATEGORY_ID);
  const isCrossedOut = task.category === "done" || task.isCrossedOut === true;
  const isOverdue = isTaskOverdue(task);
  const needsDelegate = task.category === "delegate" && !task.delegatedTo;
  const card = document.createElement("article");
  card.className = `task-card ${category.className}${isCrossedOut ? " task-card--crossed-out" : ""}`;
  card.dataset.taskId = task.id || "";
  card.draggable = shouldEnableNativeDrag();
  card.setAttribute("draggable", String(card.draggable));

  const actions = document.createElement("div");
  actions.className = "task-card__actions";

  const editButton = document.createElement("button");
  editButton.className = "task-card__edit";
  editButton.type = "button";
  editButton.textContent = "✎";
  editButton.title = "Редактировать";
  editButton.dataset.editTaskId = task.id || "";
  editButton.setAttribute("aria-label", `Редактировать задачу ${task.title || "без названия"}`);

  const deleteButton = document.createElement("button");
  deleteButton.className = "task-card__delete";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.title = "Удалить";
  deleteButton.dataset.deleteTaskId = task.id || "";
  deleteButton.setAttribute("aria-label", `Удалить задачу ${task.title || "без названия"}`);

  actions.append(editButton, deleteButton);

  const title = document.createElement("p");
  title.className = "task-card__title";
  title.textContent = task.title || "Без названия";

  const cardHeader = document.createElement("div");
  cardHeader.className = "task-card__top";
  cardHeader.append(title, actions);
  card.append(cardHeader);

  const categoryLabel = document.createElement("span");
  categoryLabel.className = "task-card__category";
  categoryLabel.textContent = category.title;

  card.append(categoryLabel);

  if (isOverdue || needsDelegate) {
    const statusList = document.createElement("p");
    statusList.className = "task-card__statuses";

    if (isOverdue) {
      const overdueStatus = document.createElement("span");
      overdueStatus.className = "task-status task-status--overdue";
      overdueStatus.textContent = "Просрочено";
      statusList.append(overdueStatus);
    }

    if (needsDelegate) {
      const delegateStatus = document.createElement("span");
      delegateStatus.className = "task-status task-status--delegate";
      delegateStatus.textContent = "Исполнитель не указан";
      statusList.append(delegateStatus);
    }

    card.append(statusList);
  }

  const metaItems = [];

  if (task.deadline) {
    metaItems.push(`Дедлайн: ${task.deadline}`);
  }

  if (task.delegatedTo) {
    metaItems.push(`Делегировано: ${task.delegatedTo}`);
  }

  if (metaItems.length > 0) {
    const meta = document.createElement("p");
    meta.className = "task-card__meta";

    metaItems.forEach((item) => {
      const itemElement = document.createElement("span");
      itemElement.textContent = item;
      meta.append(itemElement);
    });

    card.append(meta);
  }

  return card;
}

function isTaskOverdue(task) {
  if (!task.deadline || task.category === "done" || task.isCrossedOut === true) {
    return false;
  }

  const dateParts = task.deadline.split("-").map(Number);

  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) {
    return false;
  }

  const [year, month, day] = dateParts;
  const deadlineDate = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return deadlineDate < today;
}

function renderTasks() {
  DAYS.forEach((day) => {
    const taskList = document.querySelector(`[data-task-list="${day.id}"]`);
    const emptyState = document.querySelector(`[data-empty-state="${day.id}"]`);
    const taskCount = document.querySelector(`[data-task-count="${day.id}"]`);
    const tasks = getTasksByDay(day.id);

    if (!taskList || !emptyState || !taskCount) {
      return;
    }

    taskList.innerHTML = "";

    tasks.forEach((task) => {
      taskList.append(createTaskCard(task));
    });

    emptyState.classList.toggle("hidden", tasks.length > 0);
    taskCount.textContent = getTaskCountText(tasks.length);
  });
}

function clearDragColumnHighlights() {
  if (typeof document.querySelectorAll !== "function") {
    return;
  }

  document.querySelectorAll(".day-column--drag-over").forEach((column) => {
    column.classList.remove("day-column--drag-over");
  });
}

function getDragAfterElement(taskList, pointerY) {
  const cards = Array.from(taskList.querySelectorAll(".task-card:not(.task-card--dragging)"));

  return cards.reduce(
    (closest, card) => {
      const box = card.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset, element: card };
      }

      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function placeDraggedCardInColumn(column, event) {
  const taskList = column.querySelector(".task-list");
  const draggingCard = document.querySelector(".task-card--dragging");

  if (!taskList || !draggingCard) {
    return;
  }

  const afterElement = getDragAfterElement(taskList, event.clientY);

  if (afterElement) {
    taskList.insertBefore(draggingCard, afterElement);
    return;
  }

  taskList.append(draggingCard);
}

function syncDayOrderFromDom(dayId) {
  const taskList = document.querySelector(`[data-task-list="${dayId}"]`);

  if (!taskList) {
    getTasksByDay(dayId).forEach((task, index) => {
      task.order = index + 1;
    });
    return;
  }

  const taskIds = Array.from(taskList.querySelectorAll(".task-card"))
    .map((card) => card.dataset.taskId)
    .filter(Boolean);

  if (taskIds.length === 0) {
    getTasksByDay(dayId).forEach((task, index) => {
      task.order = index + 1;
    });
    return;
  }

  taskIds.forEach((taskId, index) => {
    const task = getTaskById(taskId);

    if (task) {
      task.day = dayId;
      task.order = index + 1;
    }
  });
}

function handleDragStart(event) {
  const card = event.target.closest(".task-card");

  if (!card || !card.dataset.taskId) {
    return;
  }

  const task = getTaskById(card.dataset.taskId);

  if (!task) {
    return;
  }

  draggedTaskId = task.id;
  dragSourceDay = task.day;
  dropHandled = false;
  card.classList.add("task-card--dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }
}

function handleDragEnter(event) {
  const column = event.target.closest(".day-column");

  if (!column || !draggedTaskId) {
    return;
  }

  column.classList.add("day-column--drag-over");
}

function handleDragOver(event) {
  const column = event.target.closest(".day-column");

  if (!column || !draggedTaskId) {
    return;
  }

  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }

  clearDragColumnHighlights();
  column.classList.add("day-column--drag-over");
  placeDraggedCardInColumn(column, event);
}

function handleDragLeave(event) {
  const column = event.target.closest(".day-column");

  if (!column || !draggedTaskId || column.contains(event.relatedTarget)) {
    return;
  }

  column.classList.remove("day-column--drag-over");
}

function handleDrop(event) {
  const column = event.target.closest(".day-column");

  if (!column || !draggedTaskId) {
    return;
  }

  event.preventDefault();

  const task = getTaskById(draggedTaskId);
  const targetDay = column.dataset.day;

  if (!task || !isValidDayId(targetDay)) {
    return;
  }

  const sourceDay = dragSourceDay || task.day;

  placeDraggedCardInColumn(column, event);
  syncDayOrderFromDom(targetDay);

  if (sourceDay !== targetDay) {
    syncDayOrderFromDom(sourceDay);
  }

  task.updatedAt = new Date().toISOString();
  dropHandled = true;

  saveState();
  clearDragColumnHighlights();
  renderApp();
}

function handleDragEnd() {
  const draggingCard = document.querySelector(".task-card--dragging");

  if (draggingCard) {
    draggingCard.classList.remove("task-card--dragging");
  }

  clearDragColumnHighlights();

  if (!dropHandled) {
    renderApp();
  }

  draggedTaskId = null;
  dragSourceDay = null;
  dropHandled = false;
}

function createTrashCard(task) {
  const category = getCategory(task.category || DEFAULT_CATEGORY_ID);
  const day = getDay(task.day);
  const card = document.createElement("article");
  card.className = "trash-card";
  card.dataset.trashTaskId = task.id || "";

  const title = document.createElement("p");
  title.className = "trash-card__title";
  title.textContent = task.title || "Без названия";

  const meta = document.createElement("p");
  meta.className = "trash-card__meta";

  const dayMeta = document.createElement("span");
  dayMeta.textContent = `День: ${day.title}`;

  const categoryMeta = document.createElement("span");
  categoryMeta.textContent = category.title;

  meta.append(dayMeta, categoryMeta);

  if (task.deletedAt) {
    const deletedAtMeta = document.createElement("span");
    deletedAtMeta.textContent = `Удалено: ${formatDateTime(task.deletedAt)}`;
    meta.append(deletedAtMeta);
  }

  const actions = document.createElement("div");
  actions.className = "trash-card__actions";

  const restoreButton = document.createElement("button");
  restoreButton.className = "trash-card__restore";
  restoreButton.type = "button";
  restoreButton.textContent = "Восстановить";
  restoreButton.dataset.restoreTaskId = task.id || "";

  const deleteButton = document.createElement("button");
  deleteButton.className = "trash-card__delete";
  deleteButton.type = "button";
  deleteButton.textContent = "Удалить окончательно";
  deleteButton.dataset.permanentDeleteTaskId = task.id || "";

  actions.append(restoreButton, deleteButton);
  card.append(title, meta, actions);

  return card;
}

function renderTrash() {
  const trashList = document.querySelector("#trash-list");
  const trashEmpty = document.querySelector("#trash-empty");
  const clearTrashButton = document.querySelector("#clear-trash-button");

  if (!trashList || !trashEmpty || !clearTrashButton) {
    return;
  }

  trashList.innerHTML = "";

  state.trash.forEach((task) => {
    trashList.append(createTrashCard(task));
  });

  trashEmpty.classList.toggle("hidden", state.trash.length > 0);
  clearTrashButton.disabled = state.trash.length === 0;
}

function renderApp() {
  const weekGrid = document.querySelector(".week-grid");
  const trashCounter = document.querySelector(".button__counter");

  if (!weekGrid) {
    return;
  }

  weekGrid.innerHTML = "";

  DAYS.forEach((day) => {
    weekGrid.append(createDayColumn(day));
  });

  renderTasks();
  renderTrash();

  if (trashCounter) {
    trashCounter.textContent = String(state.trash.length);
  }
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function fillFormSelects() {
  const daySelect = document.querySelector("#task-day");
  const categorySelect = document.querySelector("#task-category");

  if (daySelect) {
    daySelect.innerHTML = "";

    DAYS.forEach((day) => {
      const option = document.createElement("option");
      option.value = day.id;
      option.textContent = day.title;
      daySelect.append(option);
    });
  }

  if (categorySelect) {
    categorySelect.innerHTML = "";

    CATEGORIES.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.title;
      categorySelect.append(option);
    });

    categorySelect.value = DEFAULT_CATEGORY_ID;
  }
}

function resetTaskForm(dayId = null) {
  const form = document.querySelector("#task-form");
  const titleInput = document.querySelector("#task-title");
  const titleError = document.querySelector("#task-title-error");
  const daySelect = document.querySelector("#task-day");
  const categorySelect = document.querySelector("#task-category");
  const modalTitle = document.querySelector("#task-modal-title");

  if (!form) {
    return;
  }

  form.reset();

  if (daySelect) {
    daySelect.value = getDay(dayId || DAYS[0].id).id;
  }

  if (categorySelect) {
    categorySelect.value = DEFAULT_CATEGORY_ID;
  }

  if (titleInput) {
    titleInput.classList.remove("is-invalid");
  }

  if (titleError) {
    titleError.textContent = "";
  }

  if (modalTitle) {
    modalTitle.textContent = "Новая задача";
  }
}

function openTaskModal(dayId = null) {
  const taskModal = document.querySelector("#task-modal");
  const titleInput = document.querySelector("#task-title");

  editingTaskId = null;
  selectedDayForNewTask = dayId;
  resetTaskForm(dayId);

  if (!taskModal) {
    return;
  }

  taskModal.classList.remove("hidden");

  if (titleInput) {
    titleInput.focus();
  }
}

function openEditTaskModal(taskId) {
  const task = getTaskById(taskId);
  const taskModal = document.querySelector("#task-modal");
  const modalTitle = document.querySelector("#task-modal-title");
  const titleInput = document.querySelector("#task-title");
  const descriptionInput = document.querySelector("#task-description");
  const daySelect = document.querySelector("#task-day");
  const categorySelect = document.querySelector("#task-category");
  const deadlineInput = document.querySelector("#task-deadline");
  const delegatedToInput = document.querySelector("#task-delegated-to");
  const titleError = document.querySelector("#task-title-error");

  if (!task || !taskModal) {
    return;
  }

  editingTaskId = task.id;
  selectedDayForNewTask = task.day;

  if (modalTitle) {
    modalTitle.textContent = "Редактировать задачу";
  }

  if (titleInput) {
    titleInput.value = task.title || "";
    titleInput.classList.remove("is-invalid");
  }

  if (descriptionInput) {
    descriptionInput.value = task.description || "";
  }

  if (daySelect) {
    daySelect.value = getDay(task.day).id;
  }

  if (categorySelect) {
    categorySelect.value = getCategory(task.category).id;
  }

  if (deadlineInput) {
    deadlineInput.value = task.deadline || "";
  }

  if (delegatedToInput) {
    delegatedToInput.value = task.delegatedTo || "";
  }

  if (titleError) {
    titleError.textContent = "";
  }

  taskModal.classList.remove("hidden");

  if (titleInput) {
    titleInput.focus();
  }
}

function closeTaskModal() {
  const taskModal = document.querySelector("#task-modal");

  if (taskModal) {
    taskModal.classList.add("hidden");
  }

  selectedDayForNewTask = null;
  editingTaskId = null;
}

function openTrashModal() {
  const trashModal = document.querySelector("#trash-modal");

  if (!trashModal) {
    return;
  }

  renderTrash();
  trashModal.classList.remove("hidden");
}

function closeTrashModal() {
  const trashModal = document.querySelector("#trash-modal");

  if (trashModal) {
    trashModal.classList.add("hidden");
  }
}

function getTrimmedFormValue(selector) {
  const field = document.querySelector(selector);
  return field ? field.value.trim() : "";
}

function getNextTaskOrder(dayId) {
  return getTasksByDay(dayId).length + 1;
}

function createTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function validateTaskForm() {
  const titleInput = document.querySelector("#task-title");
  const titleError = document.querySelector("#task-title-error");
  const title = getTrimmedFormValue("#task-title");

  if (!title) {
    if (titleInput) {
      titleInput.classList.add("is-invalid");
      titleInput.focus();
    }

    if (titleError) {
      titleError.textContent = "Введите название задачи.";
    }

    return false;
  }

  if (titleInput) {
    titleInput.classList.remove("is-invalid");
  }

  if (titleError) {
    titleError.textContent = "";
  }

  return true;
}

function createTaskFromForm() {
  const now = new Date().toISOString();
  const day = getTrimmedFormValue("#task-day") || selectedDayForNewTask || DAYS[0].id;
  const category = getTrimmedFormValue("#task-category") || DEFAULT_CATEGORY_ID;
  const isCrossedOut = category === "done";

  return {
    id: createTaskId(),
    title: getTrimmedFormValue("#task-title"),
    description: getTrimmedFormValue("#task-description"),
    day,
    category,
    deadline: getTrimmedFormValue("#task-deadline"),
    delegatedTo: getTrimmedFormValue("#task-delegated-to"),
    createdAt: now,
    updatedAt: now,
    isCrossedOut,
    order: getNextTaskOrder(day)
  };
}

function updateTaskFromForm(task) {
  const now = new Date().toISOString();
  const day = getTrimmedFormValue("#task-day") || task.day;
  const category = getTrimmedFormValue("#task-category") || DEFAULT_CATEGORY_ID;
  const isDayChanged = day !== task.day;

  return {
    ...task,
    title: getTrimmedFormValue("#task-title"),
    description: getTrimmedFormValue("#task-description"),
    day,
    category,
    deadline: getTrimmedFormValue("#task-deadline"),
    delegatedTo: getTrimmedFormValue("#task-delegated-to"),
    updatedAt: now,
    isCrossedOut: category === "done",
    order: isDayChanged ? getNextTaskOrder(day) : task.order
  };
}

function moveTaskToTrash(taskId) {
  const taskIndex = state.tasks.findIndex((task) => task.id === taskId);

  if (taskIndex < 0) {
    return;
  }

  const [task] = state.tasks.splice(taskIndex, 1);

  state.trash.push({
    ...task,
    deletedAt: new Date().toISOString()
  });

  if (editingTaskId === taskId) {
    closeTaskModal();
  }

  saveState();
  renderApp();
}

function restoreTaskFromTrash(taskId) {
  const trashIndex = state.trash.findIndex((task) => task.id === taskId);

  if (trashIndex < 0) {
    return;
  }

  const [task] = state.trash.splice(trashIndex, 1);
  const restoredDay = isValidDayId(task.day) ? task.day : "monday";
  const restoredTask = {
    ...task,
    day: restoredDay,
    order: getNextTaskOrder(restoredDay)
  };

  delete restoredTask.deletedAt;
  state.tasks.push(restoredTask);

  saveState();
  renderApp();
}

function confirmAction(message) {
  if (typeof confirm !== "function") {
    return true;
  }

  return confirm(message);
}

function deleteTrashTaskPermanently(taskId) {
  const trashIndex = state.trash.findIndex((task) => task.id === taskId);

  if (trashIndex < 0 || !confirmAction("Удалить задачу окончательно?")) {
    return;
  }

  state.trash.splice(trashIndex, 1);
  saveState();
  renderApp();
}

function clearTrash() {
  if (state.trash.length === 0 || !confirmAction("Очистить корзину полностью?")) {
    return;
  }

  state.trash = [];
  saveState();
  renderApp();
}

function handleTaskSubmit(event) {
  event.preventDefault();

  if (!validateTaskForm()) {
    return;
  }

  if (editingTaskId) {
    const taskIndex = state.tasks.findIndex((task) => task.id === editingTaskId);

    if (taskIndex >= 0) {
      state.tasks[taskIndex] = updateTaskFromForm(state.tasks[taskIndex]);
    }
  } else {
    const newTask = createTaskFromForm();
    state.tasks.push(newTask);
  }

  saveState();
  closeTaskModal();
  renderApp();
}

function bindEvents() {
  const newTaskButton = document.querySelector("#new-task-button");
  const trashButton = document.querySelector("#trash-button");
  const taskForm = document.querySelector("#task-form");
  const cancelTaskButton = document.querySelector("#cancel-task-button");
  const closeTaskButton = document.querySelector("#task-modal .modal__close");
  const closeTrashButton = document.querySelector("#trash-modal .modal__close");
  const taskModal = document.querySelector("#task-modal");
  const trashModal = document.querySelector("#trash-modal");
  const clearTrashButton = document.querySelector("#clear-trash-button");
  const titleInput = document.querySelector("#task-title");

  if (newTaskButton) {
    newTaskButton.addEventListener("click", () => openTaskModal());
  }

  if (trashButton) {
    trashButton.addEventListener("click", openTrashModal);
  }

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest(".add-task");

    if (addButton) {
      openTaskModal(addButton.dataset.day);
    }

    const editButton = event.target.closest("[data-edit-task-id]");

    if (editButton) {
      openEditTaskModal(editButton.dataset.editTaskId);
    }

    const deleteButton = event.target.closest("[data-delete-task-id]");

    if (deleteButton) {
      moveTaskToTrash(deleteButton.dataset.deleteTaskId);
    }

    const restoreButton = event.target.closest("[data-restore-task-id]");

    if (restoreButton) {
      restoreTaskFromTrash(restoreButton.dataset.restoreTaskId);
    }

    const permanentDeleteButton = event.target.closest("[data-permanent-delete-task-id]");

    if (permanentDeleteButton) {
      deleteTrashTaskPermanently(permanentDeleteButton.dataset.permanentDeleteTaskId);
    }
  });

  document.addEventListener("dragstart", handleDragStart);
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);
  document.addEventListener("dragend", handleDragEnd);

  if (taskForm) {
    taskForm.addEventListener("submit", handleTaskSubmit);
  }

  if (cancelTaskButton) {
    cancelTaskButton.addEventListener("click", closeTaskModal);
  }

  if (closeTaskButton) {
    closeTaskButton.addEventListener("click", closeTaskModal);
  }

  if (closeTrashButton) {
    closeTrashButton.addEventListener("click", closeTrashModal);
  }

  if (clearTrashButton) {
    clearTrashButton.addEventListener("click", clearTrash);
  }

  if (taskModal) {
    taskModal.addEventListener("click", (event) => {
      if (event.target === taskModal) {
        closeTaskModal();
      }
    });
  }

  if (trashModal) {
    trashModal.addEventListener("click", (event) => {
      if (event.target === trashModal) {
        closeTrashModal();
      }
    });
  }

  if (titleInput) {
    titleInput.addEventListener("input", () => {
      if (titleInput.value.trim()) {
        validateTaskForm();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTaskModal();
      closeTrashModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  fillFormSelects();
  renderApp();
  bindEvents();
});
