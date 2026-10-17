// IndexedDB の薄いラッパー。
//
// データ構造（ストア）
//   projects : プロジェクト本体（計画もここに入る）
//   logs     : 作業記録（週末ごとの写真とメモ）。projectId で検索できる
//   photos   : 写真の実体（Blob）。他のデータからは id で参照する
//   ideas    : お題ストック
//   meta     : 設定などの雑多な値（key-value）
//
// 将来データ構造を変えるときは DB_VERSION を上げ、MIGRATIONS に関数を1つ足す。
// 既存のデータを消さずに、古いバージョンから順番に変換されていく。

const DB_NAME = 'hobby-project-book';
const DB_VERSION = 1;

const MIGRATIONS = {
  1(db) {
    db.createObjectStore('projects', { keyPath: 'id' });
    const logs = db.createObjectStore('logs', { keyPath: 'id' });
    logs.createIndex('projectId', 'projectId');
    db.createObjectStore('photos', { keyPath: 'id' });
    db.createObjectStore('ideas', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
  // 2(db, tx) { ... },
};

export const STORES = ['projects', 'logs', 'photos', 'ideas', 'meta'];

let dbPromise;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      for (let v = e.oldVersion + 1; v <= DB_VERSION; v++) {
        MIGRATIONS[v]?.(req.result, req.transaction);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 別タブで新しいバージョンが開かれたら、古い接続を閉じて再読み込みを促す
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => alert('アプリを更新しています。他のタブで開いている場合は閉じてください。');
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    Promise.resolve(fn(tx)).then((r) => { result = r; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const db = {
  get: (store, id) => run(store, 'readonly', (tx) => promisify(tx.objectStore(store).get(id))),
  getAll: (store) => run(store, 'readonly', (tx) => promisify(tx.objectStore(store).getAll())),
  getByIndex: (store, index, value) =>
    run(store, 'readonly', (tx) => promisify(tx.objectStore(store).index(index).getAll(value))),
  put: (store, value) => run(store, 'readwrite', (tx) => promisify(tx.objectStore(store).put(value))),
  delete: (store, id) => run(store, 'readwrite', (tx) => promisify(tx.objectStore(store).delete(id))),

  // 複数ストアをまとめて書き込む（バックアップ読み込み用）。
  // items: { storeName: [value, ...] }
  // clear: true なら先に全ストアを空にする。1つのトランザクションなので、
  //        途中で失敗したら何も変わらない（データが半端に消えることはない）。
  async putMany(items, { clear = false } = {}) {
    await run(STORES, 'readwrite', (tx) => {
      for (const name of STORES) {
        const os = tx.objectStore(name);
        if (clear) os.clear();
        for (const v of items[name] || []) os.put(v);
      }
    });
  },
};

// ブラウザに「このサイトのデータは勝手に消さないで」とお願いする。
// （空き容量が少ないときなどに自動削除されるのを防ぐ）
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
