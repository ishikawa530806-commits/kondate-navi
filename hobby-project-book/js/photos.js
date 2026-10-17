// 写真の取り込み。スマホの写真はそのままだと大きいので、
// 長辺 MAX_SIDE px の JPEG に縮小してから保存する（容量の節約）。
import { addPhoto } from './data.js';

const MAX_SIDE = 1600;
const QUALITY = 0.85;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
    img.src = url;
  });
}

export async function resizeImage(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  return blob || file;
}

// <input type="file"> で選ばれたファイルを保存し、写真IDの配列を返す
export async function importPhotos(fileList) {
  const ids = [];
  for (const file of fileList) {
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name)) continue;
    try {
      ids.push(await addPhoto(await resizeImage(file)));
    } catch {
      ids.push(await addPhoto(file)); // 縮小できない形式はそのまま保存
    }
  }
  return ids;
}
