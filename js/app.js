/**
 * MuaSamMini - Main Application Logic
 * Mobile-first shopping list web app with local persistence,
 * XSS-safe text rendering, and keyboard accessibility.
 */

import { loadData, saveData } from './storage.js';

/**
 * Pure list operations
 */
export function createItem(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Tên món hàng không được để trống');
  }
  const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  return {
    id,
    name: trimmed,
    purchased: false,
    createdAt: now,
    updatedAt: now
  };
}

export function addItem(items, name) {
  const item = createItem(name);
  return {
    items: [item, ...items],
    addedItem: item
  };
}

export function toggleItem(items, id) {
  const now = Date.now();
  let toggledItem = null;
  const newItems = items.map(item => {
    if (item.id === id) {
      toggledItem = {
        ...item,
        purchased: !item.purchased,
        updatedAt: now
      };
      return toggledItem;
    }
    return item;
  });
  return { items: newItems, toggledItem };
}

export function updateItem(items, id, newName) {
  const trimmed = (newName || '').trim();
  if (!trimmed) {
    throw new Error('Tên món hàng không được để trống');
  }
  const now = Date.now();
  let updatedItem = null;
  const newItems = items.map(item => {
    if (item.id === id) {
      updatedItem = {
        ...item,
        name: trimmed,
        updatedAt: now
      };
      return updatedItem;
    }
    return item;
  });
  return { items: newItems, updatedItem };
}

export function deleteItem(items, id) {
  const deletedItem = items.find(item => item.id === id) || null;
  const newItems = items.filter(item => item.id !== id);
  return { items: newItems, deletedItem };
}

/**
 * DOM & Application Controller
 */
export class MuaSamMiniApp {
  constructor(options = {}) {
    let storage = null;
    let storageAccessError = null;

    if (options.storage !== undefined) {
      storage = options.storage;
    } else {
      try {
        storage = typeof window !== 'undefined' ? window.localStorage : null;
      } catch (err) {
        storage = null;
        storageAccessError = err;
      }
    }

    this.storage = storage;
    this.storageAccessError = storageAccessError;
    this.items = [];
    this.editingId = null;
    this.storageState = {
      isAvailable: !storageAccessError && Boolean(storage),
      hasError: Boolean(storageAccessError),
      message: storageAccessError
        ? `Trình duyệt đã chặn quyền truy cập localStorage (${storageAccessError.name || 'SecurityError'}). Vui lòng kiểm tra cài đặt cookie/quyền riêng tư.`
        : '',
      rawValue: null,
      backupKey: null
    };

    // DOM Elements (bind if running in browser)
    if (typeof document !== 'undefined') {
      this.initDom();
    }
  }

  initDom() {
    this.listContainer = document.getElementById('shopping-list');
    this.emptyState = document.getElementById('empty-state');
    this.addForm = document.getElementById('add-form');
    this.itemInput = document.getElementById('item-input');
    this.alertBanner = document.getElementById('storage-alert-banner');
    this.alertMessage = document.getElementById('storage-alert-message');
    this.liveAnnouncer = document.getElementById('live-announcer');
    this.itemCountBadge = document.getElementById('item-count-badge');

    if (this.addForm) {
      this.addForm.addEventListener('submit', (e) => this.handleAddSubmit(e));
    }
  }

  init() {
    this.loadInitialData();
    this.render();
    this.registerServiceWorker();
  }

  loadInitialData() {
    if (this.storageAccessError) {
      this.storageState.hasError = true;
      this.storageState.isAvailable = false;
      this.storageState.message = `Trình duyệt đã chặn quyền truy cập localStorage (${this.storageAccessError.name || 'SecurityError'}). Vui lòng kiểm tra cài đặt cookie/quyền riêng tư.`;
      this.storageState.rawValue = null;
      this.storageState.backupKey = null;
      this.items = [];
      this.showStorageAlert(this.storageState.message, null);
      this.announce(`Lỗi lưu trữ: ${this.storageState.message}`);
      return;
    }

    const result = loadData(this.storage);
    if (!result.success) {
      this.storageState.hasError = true;
      this.storageState.isAvailable = result.reason !== 'unavailable';
      this.storageState.message = result.error || 'Lỗi lưu trữ';
      this.storageState.rawValue = result.rawValue || null;
      this.storageState.backupKey = result.backupKey || null;
      this.items = [];
      this.showStorageAlert(this.storageState.message, result.backupKey);
    } else {
      this.storageState.hasError = false;
      this.storageState.isAvailable = true;
      this.storageState.message = '';
      this.storageState.backupKey = null;
      this.items = result.items || [];
      this.hideStorageAlert();
    }
  }

  persistData(pendingItems) {
    const saveResult = saveData(pendingItems, this.storage);

    if (!saveResult || !saveResult.success) {
      this.storageState.hasError = true;
      this.storageState.message = (saveResult && saveResult.error) || 'Không thể lưu dữ liệu';
      // Retain existing backupKey if present so user/notice is not lost
      this.showStorageAlert(this.storageState.message, this.storageState.backupKey);
      this.announce(`Lỗi lưu trữ: ${this.storageState.message}`);
      return false;
    }

    // Only update in-memory items upon confirmed persistence success
    this.items = pendingItems;
    // If previous error was only a write error (not a corrupted_lock with backup), clear banner
    if (!this.storageState.backupKey) {
      this.storageState.hasError = false;
      this.storageState.message = '';
      this.hideStorageAlert();
    }
    return true;
  }

  announce(message) {
    if (this.liveAnnouncer) {
      this.liveAnnouncer.textContent = message;
    }
  }

  showStorageAlert(message, backupKey) {
    if (!this.alertBanner || !this.alertMessage) return;
    let text = message;
    const effectiveBackupKey = backupKey || this.storageState.backupKey;
    if (effectiveBackupKey) {
      text += ` (Đã sao lưu nội dung cũ vào khóa: ${effectiveBackupKey})`;
    }
    this.alertMessage.textContent = text;
    this.alertBanner.hidden = false;
  }

  hideStorageAlert() {
    if (this.alertBanner) {
      this.alertBanner.hidden = true;
    }
  }

  handleAddSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const rawValue = this.itemInput ? this.itemInput.value : '';
    const trimmed = (rawValue || '').trim();

    if (!trimmed) {
      if (this.itemInput) this.itemInput.focus();
      this.announce('Vui lòng nhập tên món hàng');
      return;
    }

    try {
      const { items, addedItem } = addItem(this.items, trimmed);
      const success = this.persistData(items);
      if (success) {
        if (this.itemInput) this.itemInput.value = '';
        this.render();
        this.announce(`Đã thêm "${addedItem.name}" vào danh sách`);
        if (this.itemInput) this.itemInput.focus();
      }
      // If write failed: pending user input in itemInput is preserved!
    } catch (err) {
      this.announce(err.message);
    }
  }

  handleToggle(id, event = null) {
    const currentItem = this.items.find(item => item.id === id);
    if (!currentItem) return;

    const { items, toggledItem } = toggleItem(this.items, id);
    if (toggledItem) {
      const success = this.persistData(items);
      if (success) {
        // Preserve DOM continuity across toggles without recreating DOM elements
        this.updateItemRow(toggledItem);
        this.updateBadge();
        const statusText = toggledItem.purchased ? 'đã mua' : 'chưa mua';
        this.announce(`Đã đánh dấu "${toggledItem.name}" là ${statusText}`);

        // Preserve keyboard focus on the checkbox
        const checkbox = document.getElementById(`item-checkbox-${id}`);
        if (checkbox && typeof checkbox.focus === 'function' && !checkbox.isFocused) {
          checkbox.focus();
        }
      } else {
        // Persistence failed: restore DOM checkbox state to match persisted model state
        const targetCheckbox = (event && event.target) ||
          (typeof document !== 'undefined' ? document.getElementById(`item-checkbox-${id}`) : null);
        if (targetCheckbox) {
          targetCheckbox.checked = Boolean(currentItem.purchased);
          if (typeof targetCheckbox.focus === 'function' && !targetCheckbox.isFocused) {
            targetCheckbox.focus();
          }
        }
      }
    }
  }

  updateItemRow(item) {
    if (typeof document === 'undefined') return;
    const row = document.getElementById(`item-row-${item.id}`);
    if (!row) {
      this.render();
      return;
    }

    row.className = `shopping-item ${item.purchased ? 'is-purchased' : ''}`;
    const checkbox = document.getElementById(`item-checkbox-${item.id}`);
    if (checkbox) {
      checkbox.checked = Boolean(item.purchased);
    }

    const nameSpan = (row.querySelector && row.querySelector('.item-name')) ||
      this.findChildByClass(row, 'item-name');
    if (nameSpan) {
      nameSpan.className = `item-name ${item.purchased ? 'name-purchased' : ''}`;
    }
  }

  findChildByClass(element, className) {
    if (!element || !element.children) return null;
    for (const child of element.children) {
      if (child.className && child.className.split(' ').includes(className)) {
        return child;
      }
      const found = this.findChildByClass(child, className);
      if (found) return found;
    }
    return null;
  }

  updateBadge() {
    if (this.itemCountBadge) {
      const total = this.items.length;
      const completed = this.items.filter(i => i.purchased).length;
      this.itemCountBadge.textContent = total > 0 ? `${completed}/${total}` : '';
    }
  }

  handleStartEdit(id) {
    this.editingId = id;
    this.render();
    const editInput = document.getElementById(`edit-input-${id}`);
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }

  handleCancelEdit() {
    const previousEditId = this.editingId;
    this.editingId = null;
    this.render();
    if (previousEditId) {
      const editBtn = document.getElementById(`edit-btn-${previousEditId}`);
      if (editBtn) editBtn.focus();
    }
  }

  handleSaveEdit(id, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      const editInput = document.getElementById(`edit-input-${id}`);
      if (editInput) editInput.focus();
      this.announce('Tên món hàng không được để trống');
      return;
    }

    try {
      const { items, updatedItem } = updateItem(this.items, id, trimmed);
      const success = this.persistData(items);
      if (success) {
        this.editingId = null;
        this.render();
        this.announce(`Đã cập nhật món hàng thành "${updatedItem.name}"`);

        // Restore focus to edit button
        const editBtn = document.getElementById(`edit-btn-${id}`);
        if (editBtn) editBtn.focus();
      }
      // If write failed: editingId remains id, edit form stays visible with pending input
    } catch (err) {
      this.announce(err.message);
    }
  }

  handleDelete(id) {
    const itemToDelete = this.items.find(item => item.id === id);
    if (!itemToDelete) return;
    const itemIndex = this.items.findIndex(item => item.id === id);
    const { items } = deleteItem(this.items, id);
    const success = this.persistData(items);
    if (success) {
      if (this.editingId === id) {
        this.editingId = null;
      }
      this.render();

      const name = itemToDelete ? itemToDelete.name : 'món hàng';
      this.announce(`Đã xóa "${name}"`);

      // Manage focus smoothly after deletion
      if (this.items.length === 0) {
        if (this.itemInput) this.itemInput.focus();
      } else {
        const nextFocusIndex = Math.min(itemIndex, this.items.length - 1);
        const nextItemId = this.items[nextFocusIndex]?.id;
        if (nextItemId) {
          const nextElem = document.getElementById(`item-checkbox-${nextItemId}`) || document.getElementById(`edit-btn-${nextItemId}`);
          if (nextElem) nextElem.focus();
        }
      }
    }
  }

  /**
   * Render list item element securely using DOM methods.
   * Untrusted user text is inserted via textContent ONLY to prevent XSS.
   */
  createItemElement(item) {
    const li = document.createElement('li');
    li.className = `shopping-item ${item.purchased ? 'is-purchased' : ''}`;
    li.setAttribute('role', 'listitem');
    li.id = `item-row-${item.id}`;

    if (this.editingId === item.id) {
      // Edit mode form
      const editForm = document.createElement('form');
      editForm.className = 'edit-form';
      editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSaveEdit(item.id, editInput.value);
      });

      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.id = `edit-input-${item.id}`;
      editInput.className = 'edit-input';
      editInput.value = item.name;
      editInput.setAttribute('aria-label', `Chỉnh sửa tên món hàng ${item.name}`);
      editInput.maxLength = 200;
      editInput.required = true;

      editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.handleCancelEdit();
        }
      });

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'edit-actions';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'btn btn-primary btn-sm edit-btn-action';
      saveBtn.textContent = 'Lưu';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary btn-sm edit-btn-action';
      cancelBtn.textContent = 'Hủy';
      cancelBtn.addEventListener('click', () => this.handleCancelEdit());

      actionsDiv.appendChild(saveBtn);
      actionsDiv.appendChild(cancelBtn);

      editForm.appendChild(editInput);
      editForm.appendChild(actionsDiv);
      li.appendChild(editForm);
    } else {
      // Normal display mode
      const mainContent = document.createElement('div');
      mainContent.className = 'item-content';

      // Checkbox container
      const label = document.createElement('label');
      label.className = 'checkbox-label';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `item-checkbox-${item.id}`;
      checkbox.className = 'item-checkbox';
      checkbox.checked = Boolean(item.purchased);
      checkbox.setAttribute('aria-label', `Đánh dấu đã mua: ${item.name}`);
      checkbox.addEventListener('change', (e) => this.handleToggle(item.id, e));

      const customCheck = document.createElement('span');
      customCheck.className = 'custom-checkbox';
      customCheck.setAttribute('aria-hidden', 'true');

      const nameSpan = document.createElement('span');
      nameSpan.className = `item-name ${item.purchased ? 'name-purchased' : ''}`;
      // SECURE: textContent prevents HTML/script injection
      nameSpan.textContent = item.name;

      label.appendChild(checkbox);
      label.appendChild(customCheck);
      label.appendChild(nameSpan);
      mainContent.appendChild(label);

      // Actions: Edit and Delete buttons
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'item-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.id = `edit-btn-${item.id}`;
      editBtn.className = 'btn-icon edit-btn';
      editBtn.setAttribute('aria-label', `Sửa "${item.name}"`);
      editBtn.title = 'Sửa';
      // Icon SVG representation or text
      editBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
      editBtn.addEventListener('click', () => this.handleStartEdit(item.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.id = `delete-btn-${item.id}`;
      deleteBtn.className = 'btn-icon delete-btn';
      deleteBtn.setAttribute('aria-label', `Xóa "${item.name}"`);
      deleteBtn.title = 'Xóa';
      deleteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      deleteBtn.addEventListener('click', () => this.handleDelete(item.id));

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);

      li.appendChild(mainContent);
      li.appendChild(actionsDiv);
    }

    return li;
  }

  render() {
    if (!this.listContainer) return;

    const focusedId = (typeof document !== 'undefined' && document.activeElement)
      ? document.activeElement.id
      : null;

    // Clear current list safely
    this.listContainer.textContent = '';

    if (this.items.length === 0) {
      if (this.emptyState) this.emptyState.hidden = false;
      this.listContainer.hidden = true;
    } else {
      if (this.emptyState) this.emptyState.hidden = true;
      this.listContainer.hidden = false;

      const fragment = document.createDocumentFragment();
      for (const item of this.items) {
        fragment.appendChild(this.createItemElement(item));
      }
      this.listContainer.appendChild(fragment);

      if (focusedId && typeof document !== 'undefined' && typeof document.getElementById === 'function') {
        const toFocus = document.getElementById(focusedId);
        if (toFocus && typeof toFocus.focus === 'function') {
          toFocus.focus();
        }
      }
    }

    this.updateBadge();
  }

  registerServiceWorker() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = () => {
        // Register relative service worker to be subpath-safe
        navigator.serviceWorker.register('./sw.js', { scope: './' })
          .then(registration => {
            console.log('MuaSamMini: ServiceWorker registered successfully with scope:', registration.scope);
          })
          .catch(err => {
            console.warn('MuaSamMini: ServiceWorker registration failed:', err);
          });
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW, { once: true });
      }
    }
  }
}

// Auto-bootstrap in browser environment with DOM lifecycle check
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const initApp = () => {
    const app = new MuaSamMiniApp();
    app.init();
    window.__muasammini_app__ = app;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
  } else {
    initApp();
  }
}
