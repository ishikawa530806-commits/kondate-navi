// バックアップ：全データ（写真も含む）を1つの JSON ファイルに書き出す／読み込む。
import { db } from './db.js';

const FORMAT = 'hobby-project-book-backup';
const FORMAT_VERSION = 1;
const DATA_STORES = ['projects', 'logs', 'ideas', 'meta'];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

export async function exportBackup() {
  const data = {};
  for (const name of DATA_STORES) data[name] = await db.getAll(name);
  const photos = [];
  for (const p of await db.getAll('photos')) {
    photos.push({ id: p.id, type: p.type, createdAt: p.createdAt, data: await blobToDataUrl(p.blob) });
  }
  const json = JSON.stringify({
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    photos,
  });
  return new Blob([json], { type: 'application/json' });
}

export function backupFileName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `project-book-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

// ファイルを保存する。共有シート（「ファイルに保存」など）が使えればそれを使う。
// キャンセルされたら false を返す。
export async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}

// バックアップを読み込む。
// mode: 'merge'   … 今のデータを残したまま追加（同じIDのものは上書き）
//       'replace' … 今のデータを全部消してから読み込む
export async function importBackup(file, mode = 'merge') {
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('ファイルを読み取れませんでした。バックアップファイルを選んでください。');
  }
  if (json?.format !== FORMAT) throw new Error('プロジェクト帳のバックアップファイルではありません。');
  if (json.version > FORMAT_VERSION) throw new Error('新しいバージョンのアプリで作られたファイルです。アプリを更新してください。');

  const items = {};
  for (const name of DATA_STORES) items[name] = Array.isArray(json.data?.[name]) ? json.data[name] : [];
  items.photos = [];
  for (const p of json.photos || []) {
    items.photos.push({ id: p.id, type: p.type, createdAt: p.createdAt, blob: await dataUrlToBlob(p.data) });
  }

  await db.putMany(items, { clear: mode === 'replace' });
  return {
    projects: items.projects.length,
    ideas: items.ideas.length,
    photos: items.photos.length,
  };
}
