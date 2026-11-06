/**
 * MuaSamMini - Local Storage Management Module
 * Versioned schema, validation, corrupted data preservation, and single-tab synchronous storage operations.
 */

export const STORAGE_KEY = 'muasammini_v1_data';
export const CORRUPTED_PREFIX = 'muasammini_corrupted_backup_';
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Safely retrieve window.localStorage without throwing if property access is restricted (e.g. SecurityError).
 * @returns {Storage|null}
 */
export function getSafeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Check if storage is accessible and writable.
 * Uses a unique non-colliding probe key and safely removes it, ensuring no user data is overwritten.
 * @param {Storage} [storage=getSafeLocalStorage()]
 * @returns {boolean}
 */
export function isStorageAvailable(storage = getSafeLocalStorage()) {
  if (!storage || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    return false;
  }
  try {
    let probeKey = `__muasammini_probe_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    if (typeof storage.getItem === 'function') {
      while (storage.getItem(probeKey) !== null) {
        probeKey = `__muasammini_probe_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
      }
    }
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if storage can be read from (even if write fails or quota is exceeded).
 * Reads directly without writing any probe keys.
 * @param {Storage} [storage=getSafeLocalStorage()]
 * @returns {boolean}
 */
export function isStorageReadable(storage = getSafeLocalStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return false;
  try {
    storage.getItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate an item object against the V1 schema.
 * @param {any} item
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateItem(item) {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: 'Item must be an object' };
  }
  if (typeof item.id !== 'string' || item.id.trim() === '') {
    return { valid: false, error: 'Item id must be a non-empty string' };
  }
  if (typeof item.name !== 'string' || item.name.trim() === '') {
    return { valid: false, error: 'Item name must be a non-empty string' };
  }
  if (typeof item.purchased !== 'boolean') {
    return { valid: false, error: 'Item purchased flag must be a boolean' };
  }
  if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) {
    return { valid: false, error: 'Item createdAt must be a finite timestamp' };
  }
  if (typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) {
    return { valid: false, error: 'Item updatedAt must be a finite timestamp' };
  }
  return { valid: true };
}

/**
 * Validate the entire stored payload against the V1 schema.
 * @param {any} payload
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSchema(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Root payload must be an object' };
  }
  if (payload.version !== CURRENT_SCHEMA_VERSION) {
    return { valid: false, error: `Unsupported schema version: ${payload.version} (expected ${CURRENT_SCHEMA_VERSION})` };
  }
  if (!Array.isArray(payload.items)) {
    return { valid: false, error: 'Payload items must be an array' };
  }
  const seenIds = new Set();
  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i];
    const itemValidation = validateItem(item);
    if (!itemValidation.valid) {
      return { valid: false, error: `Invalid item at index ${i}: ${itemValidation.error}` };
    }
    if (seenIds.has(item.id)) {
      return { valid: false, error: `Duplicate item id detected: "${item.id}"` };
    }
    seenIds.add(item.id);
  }
  return { valid: true };
}

/**
 * Safely preserve corrupted data by saving a backup with a timestamp.
 * Avoids creating duplicate backup copies if the same corrupted content was already backed up.
 * Allocates a collision-safe unique key and never overwrites any existing differing backup.
 * Does NOT delete the original storage key.
 * @param {Storage} storage
 * @param {string} rawContent
 * @returns {string|null} The backup key if successful/existing, or null.
 */
export function preserveCorruptedData(storage, rawContent) {
  try {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return null;
    }
    // Check if an existing backup already holds this exact content to avoid duplicates on every reload
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(CORRUPTED_PREFIX)) {
          if (storage.getItem(key) === rawContent) {
            return key;
          }
        }
      }
    } else if (storage.store instanceof Map) {
      // For map-based or custom storage without key() method
      for (const [key, value] of storage.store.entries()) {
        if (key && key.startsWith(CORRUPTED_PREFIX) && value === rawContent) {
          return key;
        }
      }
    }

    const baseTimestamp = Date.now();
    let backupKey = `${CORRUPTED_PREFIX}${baseTimestamp}`;
    let counter = 0;
    while (storage.getItem(backupKey) !== null) {
      if (storage.getItem(backupKey) === rawContent) {
        return backupKey;
      }
      counter++;
      backupKey = `${CORRUPTED_PREFIX}${baseTimestamp}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
    }

    storage.setItem(backupKey, rawContent);
    return backupKey;
  } catch {
    return null;
  }
}

/**
 * Load items from storage with safety checks and error reporting.
 * Read operation does NOT depend on write probe; directly performs guarded read.
 * @param {Storage} [storage=getSafeLocalStorage()]
 * @returns {{
 *   success: boolean,
 *   items: Array<any>,
 *   reason?: 'unavailable' | 'corrupted' | 'empty',
 *   error?: string,
 *   rawValue?: string | null,
 *   backupKey?: string | null
 * }}
 */
export function loadData(storage = getSafeLocalStorage()) {
  if (!isStorageReadable(storage)) {
    return {
      success: false,
      reason: 'unavailable',
      error: 'Trình duyệt không hỗ trợ hoặc đã vô hiệu hóa localStorage.',
      items: [],
      rawValue: null
    };
  }

  let rawValue = null;
  try {
    rawValue = storage.getItem(STORAGE_KEY);
  } catch (err) {
    return {
      success: false,
      reason: 'unavailable',
      error: `Không thể đọc từ localStorage: ${err.message}`,
      items: [],
      rawValue: null
    };
  }

  // Storage is empty / fresh first run
  if (rawValue === null) {
    return {
      success: true,
      reason: 'empty',
      items: [],
      rawValue: null
    };
  }

  // Attempt JSON parsing
  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (parseErr) {
    const backupKey = preserveCorruptedData(storage, rawValue);
    return {
      success: false,
      reason: 'corrupted',
      error: `Dữ liệu không phải JSON hợp lệ: ${parseErr.message}`,
      rawValue,
      backupKey,
      items: []
    };
  }

  // Validate Schema
  const validation = validateSchema(parsed);
  if (!validation.valid) {
    const backupKey = preserveCorruptedData(storage, rawValue);
    return {
      success: false,
      reason: 'corrupted',
      error: `Cấu trúc dữ liệu không hợp lệ: ${validation.error}`,
      rawValue,
      backupKey,
      items: []
    };
  }

  return {
    success: true,
    items: parsed.items,
    rawValue
  };
}

/**
 * Save items to storage synchronously for single-tab operation.
 * Validates schema/items first, guards corrupted existing data, then attempts direct synchronous write.
 * Preserves existing data on quota or storage failure.
 * @param {Array<any>} items
 * @param {Storage} [storage=getSafeLocalStorage()]
 * @param {boolean|{ force?: boolean }} [options=false]
 * @returns {{ success: boolean, reason?: string, error?: string, rawValue?: string }}
 */
export function saveData(items, storage = getSafeLocalStorage(), options = false) {
  const opts = typeof options === 'boolean' ? { force: options } : (options || {});
  const force = Boolean(opts.force);

  if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
    return {
      success: false,
      reason: 'unavailable',
      error: 'localStorage không khả dụng, không thể lưu dữ liệu.'
    };
  }

  // 1. Validate items and schema BEFORE any storage access or modification
  if (!Array.isArray(items)) {
    return {
      success: false,
      reason: 'invalid_data',
      error: 'Không thể lưu: Dữ liệu món hàng phải là một mảng.'
    };
  }

  const seenIds = new Set();
  for (let i = 0; i < items.length; i++) {
    const v = validateItem(items[i]);
    if (!v.valid) {
      return {
        success: false,
        reason: 'invalid_data',
        error: `Không thể lưu: Món hàng ${i} không hợp lệ (${v.error})`
      };
    }
    if (seenIds.has(items[i].id)) {
      return {
        success: false,
        reason: 'invalid_data',
        error: `Không thể lưu: Trùng lặp mã món hàng "${items[i].id}"`
      };
    }
    seenIds.add(items[i].id);
  }

  // 2. Check if existing data is currently corrupted (protect recoverable user data unless forced)
  if (!force) {
    try {
      const existing = storage.getItem(STORAGE_KEY);
      if (existing !== null) {
        let isCorrupted = false;
        try {
          const parsed = JSON.parse(existing);
          if (!validateSchema(parsed).valid) {
            isCorrupted = true;
          }
        } catch {
          isCorrupted = true;
        }

        if (isCorrupted) {
          return {
            success: false,
            reason: 'corrupted_lock',
            error: 'Dữ liệu hiện tại trong bộ nhớ bị lỗi. Để bảo vệ dữ liệu gốc, hệ thống từ chối ghi đè tự động.'
          };
        }
      }
    } catch (err) {
      return {
        success: false,
        reason: 'unavailable',
        error: `Không thể kiểm tra dữ liệu hiện tại trong localStorage: ${err.message}`
      };
    }
  }

  // 3. Direct synchronous save attempt with error handling
  const payload = {
    version: CURRENT_SCHEMA_VERSION,
    items
  };

  try {
    const serialized = JSON.stringify(payload);
    storage.setItem(STORAGE_KEY, serialized);
    return {
      success: true,
      rawValue: serialized
    };
  } catch (writeErr) {
    return {
      success: false,
      reason: 'write_failed',
      error: `Không thể ghi vào localStorage: ${writeErr.message}`
    };
  }
}
