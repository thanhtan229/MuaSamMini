import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MuaSamMiniApp } from '../js/app.js';
import { STORAGE_KEY, CORRUPTED_PREFIX } from '../js/storage.js';

// Minimal DOM simulation for integration testing of MuaSamMiniApp
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.eventListeners = {};
    this._textContent = '';
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.className = '';
    this.id = '';
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(listener);
  }

  dispatchEvent(event) {
    const listeners = this.eventListeners[event.type] || [];
    for (const l of listeners) l(event);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  focus() {
    this.isFocused = true;
  }

  select() {
    this.isSelected = true;
  }
}

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
}

function createDocElements() {
  return {
    'shopping-list': new MockElement('ul'),
    'empty-state': new MockElement('div'),
    'add-form': new MockElement('form'),
    'item-input': new MockElement('input'),
    'storage-alert-banner': new MockElement('div'),
    'storage-alert-message': new MockElement('div'),
    'live-announcer': new MockElement('div'),
    'item-count-badge': new MockElement('div')
  };
}

function createDocumentFor(docElems) {
  function findById(root, id) {
    if (!root) return null;
    if (root.id === id) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = findById(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  return {
    getElementById(id) {
      if (docElems[id]) return docElems[id];
      for (const root of Object.values(docElems)) {
        const found = findById(root, id);
        if (found) return found;
      }
      return null;
    },
    createElement(tag) {
      return new MockElement(tag);
    },
    createDocumentFragment() {
      return new MockElement('fragment');
    }
  };
}

describe('MuaSamMiniApp DOM Controller Integration', () => {
  let docElements;

  beforeEach(() => {
    docElements = createDocElements();
    global.document = createDocumentFor(docElements);
    global.window = {};
  });

  it('initializes with empty state when storage is empty', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    assert.equal(app.items.length, 0);
    assert.equal(docElements['empty-state'].hidden, false);
    assert.equal(docElements['shopping-list'].hidden, true);
    assert.equal(docElements['storage-alert-banner'].hidden, true);
  });

  it('displays error banner and preserves data when corrupted data exists on init', () => {
    const storage = new MockStorage();
    const corruptedRaw = '{ not valid json }';
    storage.setItem(STORAGE_KEY, corruptedRaw);

    const app = new MuaSamMiniApp({ storage });
    app.init();

    assert.equal(app.storageState.hasError, true);
    assert.equal(docElements['storage-alert-banner'].hidden, false);
    assert.ok(docElements['storage-alert-message'].textContent.includes('Dữ liệu không phải JSON hợp lệ'));
    // Ensure original corrupted key was not wiped
    assert.equal(storage.getItem(STORAGE_KEY), corruptedRaw);
  });

  it('adds item via form submission and updates DOM, announcer, and storage', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    docElements['item-input'].value = '  Bánh mì pate  ';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.equal(app.items.length, 1);
    assert.equal(app.items[0].name, 'Bánh mì pate');
    assert.equal(docElements['item-input'].value, '');
    assert.equal(docElements['empty-state'].hidden, true);
    assert.equal(docElements['shopping-list'].hidden, false);
    assert.equal(docElements['item-count-badge'].textContent, '0/1');
    assert.equal(docElements['live-announcer'].textContent, 'Đã thêm "Bánh mì pate" vào danh sách');

    // Confirm persisted in storage
    const stored = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(stored.items.length, 1);
    assert.equal(stored.items[0].name, 'Bánh mì pate');
  });

  it('toggles item purchased and updates counter badge and announcer', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    docElements['item-input'].value = 'Sữa đậu nành';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    const itemId = app.items[0].id;
    app.handleToggle(itemId);

    assert.equal(app.items[0].purchased, true);
    assert.equal(docElements['item-count-badge'].textContent, '1/1');
    assert.equal(docElements['live-announcer'].textContent, 'Đã đánh dấu "Sữa đậu nành" là đã mua');

    // Toggle back
    app.handleToggle(itemId);
    assert.equal(app.items[0].purchased, false);
    assert.equal(docElements['item-count-badge'].textContent, '0/1');
  });

  it('edits item name and updates storage', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    docElements['item-input'].value = 'Cà phê';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    const itemId = app.items[0].id;
    app.handleSaveEdit(itemId, '  Cà phê sữa đá  ');

    assert.equal(app.items[0].name, 'Cà phê sữa đá');
    assert.equal(docElements['live-announcer'].textContent, 'Đã cập nhật món hàng thành "Cà phê sữa đá"');

    const stored = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(stored.items[0].name, 'Cà phê sữa đá');
  });

  it('deletes item and updates DOM', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    docElements['item-input'].value = 'Trái cây';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    const itemId = app.items[0].id;
    app.handleDelete(itemId);

    assert.equal(app.items.length, 0);
    assert.equal(docElements['empty-state'].hidden, false);
    assert.equal(docElements['item-count-badge'].textContent, '');
    assert.equal(docElements['live-announcer'].textContent, 'Đã xóa "Trái cây"');
  });

  it('persists changes across reload in the same browser profile', () => {
    const sharedStorage = new MockStorage();

    // Session 1: User adds 2 items, toggles 1, edits 1
    const app1 = new MuaSamMiniApp({ storage: sharedStorage });
    app1.init();

    docElements['item-input'].value = 'Trứng gà';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    docElements['item-input'].value = 'Rau muống';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.equal(app1.items.length, 2);

    // Toggle 'Trứng gà' (which is at index 1 because newest is unshifted)
    const trungGaItem = app1.items.find(i => i.name === 'Trứng gà');
    app1.handleToggle(trungGaItem.id);

    // Edit 'Rau muống' to 'Rau muống xào'
    const rauItem = app1.items.find(i => i.name === 'Rau muống');
    app1.handleSaveEdit(rauItem.id, 'Rau muống xào');

    // Session 2: User reloads the page (fresh DOM and fresh app instance reading same storage)
    const reloadDocElements = createDocElements();
    global.document = createDocumentFor(reloadDocElements);

    const appReloaded = new MuaSamMiniApp({ storage: sharedStorage });
    appReloaded.init();

    assert.equal(appReloaded.items.length, 2);
    assert.equal(reloadDocElements['empty-state'].hidden, true);
    assert.equal(reloadDocElements['shopping-list'].hidden, false);
    assert.equal(reloadDocElements['item-count-badge'].textContent, '1/2');

    const reloadedTrungGa = appReloaded.items.find(i => i.id === trungGaItem.id);
    assert.equal(reloadedTrungGa.name, 'Trứng gà');
    assert.equal(reloadedTrungGa.purchased, true);

    const reloadedRau = appReloaded.items.find(i => i.id === rauItem.id);
    assert.equal(reloadedRau.name, 'Rau muống xào');
    assert.equal(reloadedRau.purchased, false);
  });

  it('does NOT update UI state or announce success when persistence fails', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    // Add initial item successfully
    docElements['item-input'].value = 'Món 1';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });
    assert.equal(app.items.length, 1);
    assert.equal(docElements['item-count-badge'].textContent, '0/1');

    // Simulate storage write failure (e.g. QuotaExceededError)
    storage.setItem = () => { throw new Error('QuotaExceeded'); };

    // Try adding a second item
    docElements['item-input'].value = 'Món 2';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // In-memory items and UI must NOT be mutated to reflect the failed item
    assert.equal(app.items.length, 1);
    assert.equal(app.items[0].name, 'Món 1');
    assert.equal(docElements['item-count-badge'].textContent, '0/1');
    assert.equal(docElements['storage-alert-banner'].hidden, false);
    assert.ok(docElements['live-announcer'].textContent.includes('Lỗi lưu trữ'));
    assert.ok(!docElements['live-announcer'].textContent.includes('Đã thêm "Món 2"'));

    // Try toggling item when storage fails
    app.handleToggle(app.items[0].id);
    assert.equal(app.items[0].purchased, false); // state not toggled
    assert.ok(docElements['live-announcer'].textContent.includes('Lỗi lưu trữ'));

    // Try deleting item when storage fails
    app.handleDelete(app.items[0].id);
    assert.equal(app.items.length, 1); // item not deleted
    assert.ok(docElements['live-announcer'].textContent.includes('Lỗi lưu trữ'));
  });

  it('retains corrupted backup notice across subsequent failed write interactions', () => {
    const storage = new MockStorage();
    const corruptedContent = '{ broken json }';
    storage.setItem(STORAGE_KEY, corruptedContent);

    const app = new MuaSamMiniApp({ storage });
    app.init();

    assert.equal(docElements['storage-alert-banner'].hidden, false);
    const initialNotice = docElements['storage-alert-message'].textContent;
    assert.ok(initialNotice.includes(CORRUPTED_PREFIX));

    // Attempting to add an item while corrupted_lock is active
    docElements['item-input'].value = 'Hàng mới';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.equal(app.items.length, 0);
    // Notice must still retain backup key info
    assert.ok(docElements['storage-alert-message'].textContent.includes(CORRUPTED_PREFIX));
    // Original corrupted raw data must remain untouched in storage
    assert.equal(storage.getItem(STORAGE_KEY), corruptedContent);
  });

  it('initializes safely with actionable storage error and no overwrite when window.localStorage getter throws SecurityError', () => {
    // Configure window.localStorage getter to throw SecurityError
    Object.defineProperty(global.window, 'localStorage', {
      get() {
        const err = new Error('Access is denied for this document.');
        err.name = 'SecurityError';
        throw err;
      },
      configurable: true
    });

    let app;
    assert.doesNotThrow(() => {
      app = new MuaSamMiniApp();
    });

    app.init();

    assert.equal(app.storageState.hasError, true);
    assert.equal(app.storageState.isAvailable, false);
    assert.ok(app.storageState.message.includes('SecurityError'));
    assert.equal(docElements['storage-alert-banner'].hidden, false);
    assert.ok(docElements['storage-alert-message'].textContent.includes('SecurityError'));
    assert.equal(app.items.length, 0);

    // Attempting to add an item must not throw and must not overwrite
    docElements['item-input'].value = 'Món không thể lưu';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });
    assert.equal(app.items.length, 0);

    // Cleanup global.window
    delete global.window.localStorage;
  });

  it('restores DOM checkbox to persisted state when persistence fails on real change event', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    // Add an initial item
    docElements['item-input'].value = 'Món test toggle';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });
    const item = app.items[0];
    assert.equal(item.purchased, false);

    // Locate the rendered checkbox in DOM
    const checkbox = document.getElementById(`item-checkbox-${item.id}`);
    assert.ok(checkbox, 'Checkbox must exist in DOM');
    assert.equal(checkbox.checked, false);

    // Simulate write failure on storage
    storage.setItem = () => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    };

    // User clicks checkbox in browser: browser flips checked to true BEFORE change event
    checkbox.checked = true;
    checkbox.dispatchEvent({ type: 'change', target: checkbox });

    // Assert: DOM checkbox must be restored back to false, and model item remains unpurchased
    assert.equal(checkbox.checked, false, 'DOM checkbox must be restored to false on persistence failure');
    assert.equal(item.purchased, false, 'Model item purchased flag must remain false');
    assert.equal(app.storageState.hasError, true);
    assert.ok(docElements['live-announcer'].textContent.includes('Lỗi lưu trữ'));

    // Test reverse direction: toggle from true to false with failed persistence
    // Restore storage and successfully toggle to purchased: true
    delete storage.setItem;
    app.handleToggle(item.id);
    assert.equal(app.items[0].purchased, true);

    const updatedCheckbox = document.getElementById(`item-checkbox-${item.id}`);
    assert.ok(updatedCheckbox, 'Updated checkbox must exist in DOM');
    assert.equal(updatedCheckbox.checked, true);

    // Make storage fail again
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    // User unchecks the checkbox in browser: browser flips checked to false BEFORE change event
    updatedCheckbox.checked = false;
    updatedCheckbox.dispatchEvent({ type: 'change', target: updatedCheckbox });

    // Assert: Checkbox must be restored back to true (its persisted state)
    assert.equal(updatedCheckbox.checked, true, 'DOM checkbox must be restored to true on persistence failure');
    assert.equal(app.items[0].purchased, true, 'Model item must remain purchased: true');
  });

  it('preserves focus and DOM continuity across toggles when change event is dispatched', () => {
    const storage = new MockStorage();
    const app = new MuaSamMiniApp({ storage });
    app.init();

    // Add an initial item
    docElements['item-input'].value = 'Cà chua bi';
    docElements['add-form'].dispatchEvent({ type: 'submit', preventDefault: () => {} });
    const item = app.items[0];

    const checkbox = document.getElementById(`item-checkbox-${item.id}`);
    assert.ok(checkbox, 'Checkbox must exist in DOM');

    // User navigates via keyboard to checkbox and focuses it
    checkbox.focus();
    assert.equal(checkbox.isFocused, true, 'Checkbox must have focus before toggle');

    // User presses Space: browser checks the checkbox and fires change event
    checkbox.checked = true;
    checkbox.dispatchEvent({ type: 'change', target: checkbox });

    // Assert: toggle succeeded in model and storage
    assert.equal(app.items[0].purchased, true);
    assert.equal(docElements['item-count-badge'].textContent, '1/1');
    assert.equal(docElements['live-announcer'].textContent, 'Đã đánh dấu "Cà chua bi" là đã mua');

    // DOM continuity assertion: element instance must be preserved across toggle (not destroyed/re-created)
    const currentCheckboxInDOM = document.getElementById(`item-checkbox-${item.id}`);
    assert.equal(currentCheckboxInDOM, checkbox, 'DOM continuity: Checkbox instance must NOT be replaced or detached');

    // Focus preservation assertion: focused state must remain on the checkbox
    assert.equal(checkbox.isFocused, true, 'Keyboard focus must remain on the checkbox after successful toggle');
  });
});
