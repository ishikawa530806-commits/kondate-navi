// 画面共通の小道具（HTMLエスケープ、トースト、モーダル、写真の読み込み）
import { photoUrl } from './data.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 改行をそのまま見せるテキスト
export const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

export function yen(n) {
  return `¥${Math.round(Number(n) || 0).toLocaleString('ja-JP')}`;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// モーダルを開く。html の中の [data-close] を押すと閉じる。
// 戻り値の close() で閉じる。onClose は閉じたときに呼ばれる。
export function openModal(html, { onClose } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(wrap);
  document.body.classList.add('modal-open');

  const close = () => {
    wrap.remove();
    if (!root.children.length) document.body.classList.remove('modal-open');
    onClose?.();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  const el = wrap.querySelector('.modal');
  loadPhotos(el);
  return { el, close };
}

export function confirmDialog(message, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { el, close } = openModal(`
      <p class="confirm-message">${nl2br(message)}</p>
      <div class="btn-row">
        <button class="btn" data-close>キャンセル</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>
      </div>`, { onClose: () => { if (!answered) resolve(false); } });
    el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      close();
      resolve(true);
    });
  });
}

// <img data-photo="写真ID"> の src を IndexedDB の写真で埋める
export async function loadPhotos(root) {
  const imgs = root.querySelectorAll('img[data-photo]');
  await Promise.all([...imgs].map(async (img) => {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url;
    else img.classList.add('missing');
  }));
}

export function photoImg(id, { cls = '', alt = '' } = {}) {
  if (!id) return `<div class="photo-placeholder ${cls}">📷</div>`;
  return `<img data-photo="${esc(id)}" class="${cls}" alt="${esc(alt)}" loading="lazy">`;
}

export function emptyState(icon, text, actionHtml = '') {
  return `<div class="empty"><div class="empty-icon">${icon}</div><p>${text}</p>${actionHtml}</div>`;
}

// 入力の変更を少し待ってからまとめて保存する
export function debounce(fn, ms = 400) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = () => { clearTimeout(t); fn(); };
  return wrapped;
}

// 写真を全画面で見る
export function openPhotoViewer(id) {
  openModal(`<button class="viewer" data-close aria-label="閉じる">${photoImg(id, { cls: 'viewer-img' })}</button>`)
    .el.classList.add('modal-viewer');
}
