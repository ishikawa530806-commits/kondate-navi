// アプリの入口：画面の切り替え（ハッシュルーティング）だけを担当する。
//
// 画面を追加するときは js/views/ にファイルを作り、下の ROUTES に1行足すだけ。
// 各画面は render(root, params, query) を持つオブジェクトを export default する。
//   root   : 描画先の <main>
//   params : URL の :id などの値
//   query  : ?a=b の値（URLSearchParams）
// render の中で ctx.setTitle() / ctx.setBack() を呼んで上部バーを設定する。
import { requestPersistence } from './db.js';
import { loadPhotos } from './ui.js';
import home from './views/home.js';
import newProject from './views/new-project.js';
import projectForm from './views/project-form.js';
import suggestView from './views/suggest-view.js';
import project from './views/project.js';
import gallery from './views/gallery.js';
import galleryDetail from './views/gallery-detail.js';
import ideas from './views/ideas.js';
import settings from './views/settings.js';

const ROUTES = [
  { path: '/', view: home, tab: 'home' },
  { path: '/new', view: newProject, tab: 'home' },
  { path: '/new/:genre', view: newProject, tab: 'home' },
  { path: '/new/:genre/create', view: projectForm, tab: 'home' },
  { path: '/new/:genre/suggest', view: suggestView, tab: 'home' },
  { path: '/p/:id/edit', view: projectForm, tab: 'home' },
  { path: '/p/:id', view: project, tab: 'home' },
  { path: '/gallery', view: gallery, tab: 'gallery' },
  { path: '/gallery/:id', view: galleryDetail, tab: 'gallery' },
  { path: '/ideas', view: ideas, tab: 'ideas' },
  { path: '/settings', view: settings, tab: 'settings' },
];

function match(path) {
  for (const route of ROUTES) {
    const names = [];
    const re = new RegExp('^' + route.path.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    const m = path.match(re);
    if (m) return { route, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

const titleEl = document.getElementById('page-title');
const backBtn = document.getElementById('back-btn');
const viewEl = document.getElementById('view');
let backHref = null;
let renderId = 0;
let lastPath = null;

backBtn.addEventListener('click', () => { if (backHref) location.hash = backHref; });

const ctx = {
  setTitle(text) {
    titleEl.textContent = text;
    document.title = text === 'プロジェクト帳' ? text : `${text} - プロジェクト帳`;
  },
  setBack(href) {
    backHref = href;
    backBtn.hidden = !href;
  },
  go(href) { location.hash = href; },
  refresh: () => render(),
};

async function render() {
  const id = ++renderId;
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const found = match(path) || match('/');
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === found.route.tab);
  });
  ctx.setTitle('プロジェクト帳');
  ctx.setBack(null);
  document.getElementById('modal-root').innerHTML = '';
  document.body.classList.remove('modal-open');

  const root = document.createElement('div');
  root.className = 'page';
  try {
    await found.route.view.render(root, found.params, new URLSearchParams(qs), ctx);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><p>表示できませんでした。<br>${String(e.message || e)}</p></div>`;
  }
  if (id !== renderId) return; // 描画中に別の画面へ移った
  const scrollY = path === lastPath ? window.scrollY : 0; // 同じ画面の再描画ならスクロール位置を保つ
  viewEl.replaceChildren(root);
  window.scrollTo(0, scrollY);
  lastPath = path;
  loadPhotos(root);
}

window.addEventListener('hashchange', render);
render();
requestPersistence();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker 登録失敗', e));
}
