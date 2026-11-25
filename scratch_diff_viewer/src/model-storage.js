/**
 * マイおてほんのブラウザ永続化ストレージ（IndexedDB ベース、localStorage フォールバック付き）
 */

(function () {
  const DB_NAME = 'ScratchDiffViewerDB';
  const STORE_NAME = 'customModels';
  const DB_VERSION = 1;
  const LS_KEY = 'scratch_diff_custom_models';

  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof window.indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported'));
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  function readLocalFallback() {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeLocalFallback(items) {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch (_) {
      // 容量超過やプライベートブラウズ制限時は無言でスキップ
    }
  }

  function sortByCreatedAt(items) {
    return items.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  async function list() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          db.close();
          resolve(sortByCreatedAt(Array.isArray(req.result) ? req.result : []));
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch (_) {
      return sortByCreatedAt(readLocalFallback());
    }
  }

  async function save({ name, fileName, project }) {
    const record = {
      id: `user:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      name: String(name || fileName || 'マイおてほん'),
      fileName: String(fileName || ''),
      createdAt: Date.now(),
      project,
    };

    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
      return record;
    } catch (_) {
      const items = readLocalFallback();
      items.push(record);
      writeLocalFallback(items);
      return record;
    }
  }

  async function remove(id) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (_) {
      const items = readLocalFallback().filter((item) => item.id !== id);
      writeLocalFallback(items);
    }
  }

  window.ScratchDiff = window.ScratchDiff || {};
  window.ScratchDiff.ModelStorage = { list, save, remove };
})();
