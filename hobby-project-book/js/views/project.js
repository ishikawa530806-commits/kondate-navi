// プロジェクト詳細：「計画」タブと「作業記録」タブ
import {
  getProject, saveProject, listLogs, newLog, saveLog, deleteLog, deletePhoto,
  genreOf, STATUS, materialsTotal, formatDate, today,
} from '../data.js';
import { uid } from '../db.js';
import { importPhotos } from '../photos.js';
import {
  esc, nl2br, yen, toast, openModal, confirmDialog, photoImg, loadPhotos, debounce, openPhotoViewer,
} from '../ui.js';
import { startCompleteFlow } from './complete.js';

const TABS = { plan: '📝 計画', log: '📷 作業記録' };

export default {
  async render(root, params, query, ctx) {
    const p = await getProject(params.id);
    if (!p) throw new Error('プロジェクトが見つかりません');
    let tab = TABS[query.get('tab')] ? query.get('tab') : (p.status === 'planning' ? 'plan' : 'log');

    ctx.setTitle(p.title);
    ctx.setBack(p.status === 'done' ? `#/gallery/${p.id}` : '#/');

    const g = genreOf(p.genre);
    root.innerHTML = `
      <section class="project-head card">
        <div class="project-card-meta">
          <span class="chip">${g.icon} ${esc(g.label)}</span>
          <span class="status" id="status-chip"></span>
          <a class="link small push-right" href="#/p/${esc(p.id)}/edit">編集</a>
        </div>
        <h2 class="project-title">${esc(p.title)}</h2>
        <div class="weekend-dots" id="weekend-dots"></div>
        <div class="btn-row" id="head-actions"></div>
      </section>
      <div class="tabs" role="tablist">
        ${Object.entries(TABS).map(([k, label]) => `<button role="tab" data-tab="${k}">${label}</button>`).join('')}
      </div>
      <div id="tab-body"></div>
    `;

    const body = root.querySelector('#tab-body');

    async function renderHead() {
      const logs = await listLogs(p.id);
      const done = new Set(logs.map((l) => l.weekend));
      if (logs.length && p.status === 'planning') p.status = 'active'; // saveLog が DB 側も更新済み
      const chip = root.querySelector('#status-chip');
      chip.className = `status status-${p.status}`;
      chip.textContent = STATUS[p.status];
      root.querySelector('#weekend-dots').innerHTML = Array.from({ length: p.weekends }, (_, i) =>
        `<span class="dot ${done.has(i + 1) ? 'on' : ''}">${i + 1}</span>`).join('') +
        `<span class="muted small">週末 ${done.size} / ${p.weekends} 回</span>`;
      root.querySelector('#head-actions').innerHTML = p.status === 'done'
        ? `<a class="btn btn-block" href="#/gallery/${esc(p.id)}">🖼️ ギャラリーで見る</a>`
        : `<button class="btn btn-accent btn-block" id="complete-btn">🎉 完成！</button>`;
      root.querySelector('#complete-btn')?.addEventListener('click', () => startCompleteFlow(p, ctx));
    }

    async function showTab(name) {
      tab = name;
      history.replaceState(null, '', `#/p/${p.id}?tab=${name}`);
      root.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
      if (name === 'plan') renderPlan(body, p);
      else await renderLog(body, p, renderHead);
      loadPhotos(body);
    }

    root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    await renderHead();
    await showTab(tab);
  },
};

// ---------------- 計画タブ ----------------

function renderPlan(body, p) {
  const plan = p.plan;
  const save = debounce(() => saveProject(p));

  const materialRow = (m) => `
    <li class="item-row" data-id="${esc(m.id)}">
      <input type="checkbox" data-field="done" ${m.done ? 'checked' : ''} aria-label="用意できた">
      <input class="grow" data-field="name" value="${esc(m.name)}" placeholder="材料名">
      <input class="qty" data-field="qty" value="${esc(m.qty)}" placeholder="数量">
      <input class="price" data-field="price" value="${esc(m.price ?? '')}" placeholder="円" inputmode="numeric">
      <button class="icon-btn small" data-remove aria-label="削除">✕</button>
    </li>`;
  const toolRow = (t) => `
    <li class="item-row" data-id="${esc(t.id)}">
      <input type="checkbox" data-field="done" ${t.done ? 'checked' : ''} aria-label="用意できた">
      <input class="grow" data-field="name" value="${esc(t.name)}" placeholder="道具名">
      <button class="icon-btn small" data-remove aria-label="削除">✕</button>
    </li>`;

  const draw = () => {
    body.innerHTML = `
      <section class="card">
        <h3 class="card-title">🧱 材料</h3>
        <ul class="item-list" data-list="materials">${plan.materials.map(materialRow).join('')}</ul>
        <button class="btn btn-small" data-add="materials">＋ 材料を追加</button>
      </section>

      <section class="card">
        <h3 class="card-title">🧰 道具</h3>
        <ul class="item-list" data-list="tools">${plan.tools.map(toolRow).join('')}</ul>
        <button class="btn btn-small" data-add="tools">＋ 道具を追加</button>
      </section>

      <section class="card">
        <h3 class="card-title">💰 予算</h3>
        <label class="inline-field">予算
          <input id="budget" inputmode="numeric" placeholder="例：3000" value="${esc(plan.budget ?? '')}"> 円
        </label>
        <div class="budget-summary" id="budget-summary"></div>
      </section>

      <section class="card">
        <h3 class="card-title">🗓️ 週末ごとの作業</h3>
        ${Array.from({ length: p.weekends }, (_, i) => `
          <label class="field">
            <span class="field-label">${i + 1}回目の週末</span>
            <textarea data-step="${i + 1}" rows="3" placeholder="この週末にやること">${esc(plan.steps[i + 1] || '')}</textarea>
          </label>`).join('')}
      </section>

      <section class="card">
        <h3 class="card-title">🗒️ メモ</h3>
        <textarea id="plan-memo" rows="3" placeholder="参考URL、イメージ、注意点など">${esc(plan.memo)}</textarea>
      </section>
      <p class="muted small center">入力内容は自動で保存されます</p>
    `;
    updateBudget();
  };

  const updateBudget = () => {
    const total = materialsTotal(p);
    const budget = Number(plan.budget) || 0;
    const el = body.querySelector('#budget-summary');
    el.innerHTML = `材料の合計 <strong>${yen(total)}</strong>` +
      (budget ? `　残り <strong class="${budget - total < 0 ? 'over' : ''}">${yen(budget - total)}</strong>` : '');
  };

  const toNumber = (s) => {
    const n = Number(String(s).replace(/[^\d.]/g, ''));
    return s === '' || Number.isNaN(n) ? null : n;
  };

  body.oninput = body.onchange = (e) => {
    const t = e.target;
    const row = t.closest('.item-row');
    if (row) {
      const list = plan[row.parentElement.dataset.list];
      const item = list.find((x) => x.id === row.dataset.id);
      const field = t.dataset.field;
      item[field] = field === 'done' ? t.checked : field === 'price' ? toNumber(t.value) : t.value;
      updateBudget();
    } else if (t.id === 'budget') {
      plan.budget = toNumber(t.value);
      updateBudget();
    } else if (t.dataset.step) {
      plan.steps[t.dataset.step] = t.value;
    } else if (t.id === 'plan-memo') {
      plan.memo = t.value;
    } else return;
    save();
  };

  body.onclick = (e) => {
    const add = e.target.closest('[data-add]');
    const remove = e.target.closest('[data-remove]');
    if (add) {
      const key = add.dataset.add;
      plan[key].push(key === 'materials'
        ? { id: uid(), name: '', qty: '', price: null, done: false }
        : { id: uid(), name: '', done: false });
      save.flush();
      draw();
      body.querySelector(`[data-list="${key}"] .item-row:last-child [data-field="name"]`)?.focus();
    } else if (remove) {
      const row = remove.closest('.item-row');
      const key = row.parentElement.dataset.list;
      plan[key] = plan[key].filter((x) => x.id !== row.dataset.id);
      save.flush();
      draw();
    }
  };

  draw();
}

// ---------------- 作業記録タブ ----------------

async function renderLog(body, p, onChange) {
  const logs = await listLogs(p.id);
  const weekends = Math.max(p.weekends, ...logs.map((l) => l.weekend));

  const entry = (l) => `
    <article class="log-entry" data-id="${esc(l.id)}">
      <div class="log-entry-head">
        <span class="muted small">${formatDate(l.date)}</span>
        <button class="link small push-right" data-edit="${esc(l.id)}">編集</button>
      </div>
      ${l.photoIds.length ? `<div class="photo-grid">${l.photoIds.map((id) => `<button class="photo-btn" data-view="${esc(id)}">${photoImg(id)}</button>`).join('')}</div>` : ''}
      ${l.memo ? `<p class="log-memo">${nl2br(l.memo)}</p>` : ''}
    </article>`;

  body.innerHTML = Array.from({ length: weekends }, (_, i) => {
    const n = i + 1;
    const items = logs.filter((l) => l.weekend === n);
    const step = p.plan.steps[n];
    return `
      <section class="card weekend-card">
        <h3 class="card-title">${n}回目の週末 ${items.length ? '<span class="check">✔</span>' : ''}</h3>
        ${step ? `<p class="plan-step">📝 ${nl2br(step)}</p>` : ''}
        ${items.map(entry).join('')}
        <button class="btn btn-small" data-new="${n}">＋ 写真とメモを追加</button>
      </section>`;
  }).join('');

  const refresh = async () => {
    await renderLog(body, p, onChange);
    loadPhotos(body);
    await onChange();
  };

  body.oninput = body.onchange = null;
  body.onclick = (e) => {
    const t = e.target.closest('[data-new], [data-edit], [data-view]');
    if (!t) return;
    if (t.dataset.view) return openPhotoViewer(t.dataset.view);
    const log = t.dataset.new ? newLog(p.id, Number(t.dataset.new)) : logs.find((l) => l.id === t.dataset.edit);
    openLogForm(log, !!t.dataset.new, refresh);
  };
}

function openLogForm(log, isNew, onSaved) {
  const keep = [...log.photoIds]; // 残す既存の写真
  const pending = []; // 新しく選んだファイル { file, url }

  const { el, close } = openModal(`
    <h3 class="modal-title">${log.weekend}回目の週末の記録</h3>
    <form id="log-form" class="form">
      <label class="field"><span class="field-label">日付</span>
        <input type="date" name="date" value="${esc(log.date || today())}" required></label>
      <div class="field"><span class="field-label">写真</span>
        <div class="photo-grid editable" id="photo-edit"></div>
        <label class="btn btn-small file-btn">📷 写真を追加
          <input type="file" accept="image/*" multiple hidden id="photo-input"></label>
      </div>
      <label class="field"><span class="field-label">メモ</span>
        <textarea name="memo" rows="4" placeholder="やったこと、気づいたこと、次回やること">${esc(log.memo)}</textarea></label>
      <div class="btn-row">
        ${isNew ? '' : '<button type="button" class="btn btn-danger-outline" id="log-delete">削除</button>'}
        <button type="button" class="btn" data-close>キャンセル</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `, { onClose: () => pending.forEach((x) => URL.revokeObjectURL(x.url)) });

  const grid = el.querySelector('#photo-edit');
  const drawPhotos = () => {
    grid.innerHTML =
      keep.map((id) => `<div class="photo-thumb">${photoImg(id)}<button type="button" class="photo-remove" data-keep="${esc(id)}" aria-label="外す">✕</button></div>`).join('') +
      pending.map((x, i) => `<div class="photo-thumb"><img src="${x.url}" alt=""><button type="button" class="photo-remove" data-pending="${i}" aria-label="外す">✕</button></div>`).join('');
    loadPhotos(grid);
  };
  drawPhotos();

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.photo-remove');
    if (!b) return;
    if (b.dataset.keep) keep.splice(keep.indexOf(b.dataset.keep), 1);
    else URL.revokeObjectURL(pending.splice(Number(b.dataset.pending), 1)[0].url);
    drawPhotos();
  });

  el.querySelector('#photo-input').addEventListener('change', (e) => {
    for (const file of e.target.files) pending.push({ file, url: URL.createObjectURL(file) });
    e.target.value = '';
    drawPhotos();
  });

  el.querySelector('#log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = '保存中…';
    const f = new FormData(e.target);
    const removed = log.photoIds.filter((id) => !keep.includes(id));
    const added = await importPhotos(pending.map((x) => x.file));
    log.date = f.get('date');
    log.memo = f.get('memo').trim();
    log.photoIds = [...keep, ...added];
    await saveLog(log);
    for (const id of removed) await deletePhoto(id);
    close();
    toast('記録しました');
    onSaved();
  });

  el.querySelector('#log-delete')?.addEventListener('click', async () => {
    if (!(await confirmDialog('この記録を削除しますか？\n写真も消えます。', { ok: '削除する', danger: true }))) return;
    await deleteLog(log);
    close();
    toast('削除しました');
    onSaved();
  });
}
