import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSafeLocalStorage,
  isStorageAvailable,
  isStorageReadable,
  validateItem,
  validateSchema,
  loadData,
  saveData,
  preserveCorruptedData,
  STORAGE_KEY,
  CORRUPTED_PREFIX,
  CURRENT_SCHEMA_VERSION
} from '../js/storage.js';

// Mock localStorage implementation for Node test environment
class MockLocalStorage {
  constructor(options = {}) {
    this.store = new Map();
    this.throwOnGet = options.throwOnGet || false;
    this.throwOnSet = options.throwOnSet || false;
  }

  getItem(key) {
    if (this.throwOnGet) throw new Error('SecurityError: access denied');
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    if (this.throwOnSet) throw new Error('QuotaExceededError');
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  key(index) {
    const keys = Array.from(this.store.keys());
    return keys[index] !== undefined ? keys[index] : null;
  }

  get length() {
    return this.store.size;
  }
}

describe('Storage Module', () => {
  it('detects available and unavailable storage', () => {
    const workingStorage = new MockLocalStorage();
    assert.equal(isStorageAvailable(workingStorage), true);

    const brokenStorage = new MockLocalStorage({ throwOnSet: true });
    assert.equal(isStorageAvailable(brokenStorage), false);

    assert.equal(isStorageAvailable(null), false);
    assert.equal(isStorageAvailable(undefined), false);
  });

  it('validates single item structure strictly', () => {
    assert.equal(validateItem(null).valid, false);
    assert.equal(validateItem('string').valid, false);
    assert.equal(validateItem({}).valid, false);
    assert.equal(validateItem({ id: '1', name: '', purchased: false, createdAt: 1, updatedAt: 1 }).valid, false);
    assert.equal(validateItem({ id: '', name: 'Milk', purchased: false, createdAt: 1, updatedAt: 1 }).valid, false);
    assert.equal(validateItem({ id: '1', name: 'Milk', purchased: 'false', createdAt: 1, updatedAt: 1 }).valid, false);
    assert.equal(validateItem({ id: '1', name: 'Milk', purchased: false, createdAt: 'now', updatedAt: 1 }).valid, false);

    const validItem = {
      id: 'item_1',
      name: 'Bánh mì',
      purchased: false,
      createdAt: 1700000000000,
      updatedAt: 1700000000000
    };
    assert.equal(validateItem(validItem).valid, true);
  });

  it('validates root schema structure and version', () => {
    assert.equal(validateSchema(null).valid, false);
    assert.equal(validateSchema({ version: 2, items: [] }).valid, false);
    assert.equal(validateSchema({ version: 1, items: 'not an array' }).valid, false);

    const validPayload = {
      version: CURRENT_SCHEMA_VERSION,
      items: [
        {
          id: 'item_1',
          name: 'Trứng gà',
          purchased: true,
          createdAt: 1700000000000,
          updatedAt: 1700000000100
        }
      ]
    };
    assert.equal(validateSchema(validPayload).valid, true);
  });

  it('handles empty storage gracefully on first load', () => {
    const storage = new MockLocalStorage();
    const result = loadData(storage);
    assert.equal(result.success, true);
    assert.equal(result.reason, 'empty');
    assert.deepEqual(result.items, []);
  });

  it('saves and loads valid items successfully', () => {
    const storage = new MockLocalStorage();
    const items = [
      {
        id: 'item_1',
        name: 'Rau xanh',
        purchased: false,
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const saveResult = saveData(items, storage);
    assert.equal(saveResult.success, true);
    assert.ok(typeof saveResult.rawValue === 'string');

    const loadResult = loadData(storage);
    assert.equal(loadResult.success, true);
    assert.deepEqual(loadResult.items, items);
  });

  it('persists sequential single-tab mutations and reloads accurately', () => {
    const storage = new MockLocalStorage();

    // Initial item addition
    const item1 = { id: 'item_1', name: 'Cà phê', purchased: false, createdAt: 1000, updatedAt: 1000 };
    const step1 = saveData([item1], storage);
    assert.equal(step1.success, true);

    // Add second item
    const item2 = { id: 'item_2', name: 'Đường cát', purchased: false, createdAt: 2000, updatedAt: 2000 };
    const step2 = saveData([item2, item1], storage);
    assert.equal(step2.success, true);

    // Toggle item1 purchased state
    const toggledItem1 = { ...item1, purchased: true, updatedAt: 3000 };
    const step3 = saveData([item2, toggledItem1], storage);
    assert.equal(step3.success, true);

    // Edit item2 name
    const editedItem2 = { ...item2, name: 'Đường phèn', updatedAt: 4000 };
    const step4 = saveData([editedItem2, toggledItem1], storage);
    assert.equal(step4.success, true);

    // Delete item1
    const step5 = saveData([editedItem2], storage);
    assert.equal(step5.success, true);

    // Reload from storage
    const reloaded = loadData(storage);
    assert.equal(reloaded.success, true);
    assert.equal(reloaded.items.length, 1);
    assert.equal(reloaded.items[0].id, 'item_2');
    assert.equal(reloaded.items[0].name, 'Đường phèn');
    assert.equal(reloaded.items[0].purchased, false);
  });

  it('handles malformed JSON without silent overwrite, preserves data in backup and original key', () => {
    const storage = new MockLocalStorage();
    const malformedContent = '{ "version": 1, "items": [ broken json ...';
    storage.setItem(STORAGE_KEY, malformedContent);

    const result = loadData(storage);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'corrupted');
    assert.equal(result.rawValue, malformedContent);
    assert.ok(result.backupKey.startsWith(CORRUPTED_PREFIX));

    // Confirm original key is preserved (not wiped or replaced)
    assert.equal(storage.getItem(STORAGE_KEY), malformedContent);
    // Confirm backup was created
    assert.equal(storage.getItem(result.backupKey), malformedContent);

    // Saving should be locked to prevent silent overwrite of corrupted data
    const saveAttempt = saveData([{ id: 'new', name: 'New Item', purchased: false, createdAt: 1, updatedAt: 1 }], storage);
    assert.equal(saveAttempt.success, false);
    assert.equal(saveAttempt.reason, 'corrupted_lock');
    assert.equal(storage.getItem(STORAGE_KEY), malformedContent);
  });

  it('handles schema violation without silent overwrite, preserves data', () => {
    const storage = new MockLocalStorage();
    const invalidSchemaContent = JSON.stringify({ version: 999, items: 'corrupted' });
    storage.setItem(STORAGE_KEY, invalidSchemaContent);

    const result = loadData(storage);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'corrupted');
    assert.equal(storage.getItem(STORAGE_KEY), invalidSchemaContent);
    assert.ok(result.backupKey.startsWith(CORRUPTED_PREFIX));
  });

  it('avoids creating duplicate backup copies on repeated reloads with corrupted data', () => {
    const storage = new MockLocalStorage();
    const malformed = '{ broken json }';
    storage.setItem(STORAGE_KEY, malformed);

    const firstLoad = loadData(storage);
    assert.equal(firstLoad.success, false);
    assert.ok(firstLoad.backupKey);
    const initialBackupCount = Array.from(storage.store.keys()).filter(k => k.startsWith(CORRUPTED_PREFIX)).length;
    assert.equal(initialBackupCount, 1);

    // Second load should reuse the existing backup key without adding a duplicate
    const secondLoad = loadData(storage);
    assert.equal(secondLoad.success, false);
    assert.equal(secondLoad.backupKey, firstLoad.backupKey);
    const secondBackupCount = Array.from(storage.store.keys()).filter(k => k.startsWith(CORRUPTED_PREFIX)).length;
    assert.equal(secondBackupCount, 1);
  });

  it('reads existing valid data even if storage write is full / quota exceeded', () => {
    const storage = new MockLocalStorage();
    const validItems = [{ id: 'item_1', name: 'Item 1', purchased: false, createdAt: 1000, updatedAt: 1000 }];
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items: validItems }));

    // Now make storage write fail (quota exceeded) while read still works
    storage.throwOnSet = true;
    assert.equal(isStorageAvailable(storage), false); // write check fails

    const loadResult = loadData(storage);
    assert.equal(loadResult.success, true);
    assert.deepEqual(loadResult.items, validItems);
  });

  it('validates finite timestamps and rejects duplicate IDs', () => {
    // Non-finite timestamps
    assert.equal(validateItem({ id: '1', name: 'Item', purchased: false, createdAt: Infinity, updatedAt: 1000 }).valid, false);
    assert.equal(validateItem({ id: '1', name: 'Item', purchased: false, createdAt: -Infinity, updatedAt: 1000 }).valid, false);
    assert.equal(validateItem({ id: '1', name: 'Item', purchased: false, createdAt: NaN, updatedAt: 1000 }).valid, false);
    assert.equal(validateItem({ id: '1', name: 'Item', purchased: false, createdAt: 1000, updatedAt: Infinity }).valid, false);

    // Duplicate IDs in schema
    const duplicatePayload = {
      version: 1,
      items: [
        { id: 'dup_id', name: 'Item 1', purchased: false, createdAt: 1000, updatedAt: 1000 },
        { id: 'dup_id', name: 'Item 2', purchased: true, createdAt: 2000, updatedAt: 2000 }
      ]
    };
    const schemaRes = validateSchema(duplicatePayload);
    assert.equal(schemaRes.valid, false);
    assert.ok(schemaRes.error.includes('Duplicate item id detected'));
  });

  it('handles storage throwing errors gracefully', () => {
    const throwingStorage = new MockLocalStorage({ throwOnGet: true });
    const result = loadData(throwingStorage);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'unavailable');
  });

  it('safely handles window.localStorage getter throwing SecurityError on default params', () => {
    const originalWindow = global.window;
    global.window = {};
    Object.defineProperty(global.window, 'localStorage', {
      get() {
        const err = new Error('Access denied');
        err.name = 'SecurityError';
        throw err;
      },
      configurable: true
    });

    assert.equal(getSafeLocalStorage(), null);
    assert.equal(isStorageAvailable(), false);
    assert.equal(isStorageReadable(), false);

    const loadRes = loadData();
    assert.equal(loadRes.success, false);
    assert.equal(loadRes.reason, 'unavailable');

    const saveRes = saveData([]);
    assert.equal(saveRes.success, false);
    assert.equal(saveRes.reason, 'unavailable');

    global.window = originalWindow;
  });

  it('validates schema and items before touching storage in saveData and preserves existing data', () => {
    const storage = new MockLocalStorage();
    const existingContent = JSON.stringify({ version: 1, items: [{ id: 'init', name: 'Original', purchased: false, createdAt: 1, updatedAt: 1 }] });
    storage.setItem(STORAGE_KEY, existingContent);

    // Track any setItem calls
    let setItemCalled = false;
    const origSetItem = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      setItemCalled = true;
      origSetItem(k, v);
    };

    // Invalid item (e.g. empty name)
    const invalidItems = [{ id: 'item_bad', name: '', purchased: false, createdAt: 100, updatedAt: 100 }];
    const res = saveData(invalidItems, storage);

    assert.equal(res.success, false);
    assert.equal(res.reason, 'invalid_data');
    assert.equal(setItemCalled, false, 'setItem must NOT be called if schema validation fails');
    assert.equal(storage.getItem(STORAGE_KEY), existingContent, 'Existing data must be preserved');
  });

  it('does not use a fixed probe key and preserves existing data when write fails on quota', () => {
    const storage = new MockLocalStorage();
    const existingContent = JSON.stringify({ version: 1, items: [{ id: 'init', name: 'Safe', purchased: false, createdAt: 1, updatedAt: 1 }] });
    storage.setItem(STORAGE_KEY, existingContent);

    // Ensure fixed probe key is never written or created
    const recordedKeys = new Set();
    const origSetItem = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      recordedKeys.add(k);
      origSetItem(k, v);
    };

    const validNewItems = [{ id: 'new_item', name: 'New Item', purchased: false, createdAt: 2, updatedAt: 2 }];
    const saveRes = saveData(validNewItems, storage);
    assert.equal(saveRes.success, true);
    assert.ok(recordedKeys.has(STORAGE_KEY));
    assert.equal(recordedKeys.has('__muasammini_test__'), false, 'Fixed probe key __muasammini_test__ must not be used');

    // Now test that write failure preserves existing data
    storage.throwOnSet = true;
    const writeFailRes = saveData([{ id: 'fail_item', name: 'Fail', purchased: false, createdAt: 3, updatedAt: 3 }], storage);
    assert.equal(writeFailRes.success, false);
    assert.equal(writeFailRes.reason, 'write_failed');
    // Read directly - existing data must still be intact
    assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify({ version: 1, items: validNewItems }));
  });

  it('allocates collision-safe unique key and never overwrites differing backup under fixed Date.now, preserving original storage key', () => {
    const storage = new MockLocalStorage();
    const originalContent = '{ corrupted original content in main storage }';
    storage.setItem(STORAGE_KEY, originalContent);

    // Freeze Date.now to simulate identical millisecond execution
    const fixedNow = 1700000000000;
    const realDateNow = Date.now;
    Date.now = () => fixedNow;

    try {
      const corruptPayload1 = '{"bad": 1}';
      const corruptPayload2 = '{"bad": 2}';

      const key1 = preserveCorruptedData(storage, corruptPayload1);
      const key2 = preserveCorruptedData(storage, corruptPayload2);

      // Verify two distinct collision-safe keys were generated
      assert.ok(key1, 'Key 1 must be generated');
      assert.ok(key2, 'Key 2 must be generated');
      assert.notEqual(key1, key2, 'Keys must be distinct despite identical Date.now');

      // Verify neither backup was overwritten
      assert.equal(storage.getItem(key1), corruptPayload1, 'First corrupted payload must be preserved intact');
      assert.equal(storage.getItem(key2), corruptPayload2, 'Second corrupted payload must be preserved intact');

      // Verify original storage key was NOT deleted or overwritten
      assert.equal(storage.getItem(STORAGE_KEY), originalContent, 'Original STORAGE_KEY must be preserved');

      // Verify subsequent call with identical payload reuses existing key without duplicate
      const key1Duplicate = preserveCorruptedData(storage, corruptPayload1);
      assert.equal(key1Duplicate, key1, 'Re-saving identical content must return existing key without creating duplicate');
    } finally {
      Date.now = realDateNow;
    }
  });
});
