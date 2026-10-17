// ギャラリーの1作品：ビフォーアフター比較と、作業の振り返り
import {
  getProject, saveProject, listLogs, genreOf, formatDate, materialsTotal,
} from '../data.js';
import { esc, nl2br, yen, photoImg, loadPhotos, openPhotoViewer, confirmDialog, toast } from '../ui.js';
import { effectiveBeforeAfter, editBeforeAfter } from './complete.js';

function compareView(mode, before, after) {
  if (mode === 'side') {
    return `<div class="compare-side">
      <figure>${photoImg(before)}<figcaption>ビフォー</figcaption></figure>
      <figure>${photoImg(after)}<figcaption>アフター</figcaption></figure>
    </div>`;
  }
  // スライダー：アフターの上にビフォーを重ね、つまみの位置まで見せる
  return `<div class="compare-slider" style="--pos:50%">
      ${photoImg(after, { cls: 'cmp-after' })}
      ${photoImg(before, { cls: 'cmp-before' })}
      <span class="cmp-label left">ビフォー</span><span class="cmp-label right">アフター</span>
      <div class="cmp-handle" aria-hidden="true"></div>
      <input type="range" min="0" max="100" value="50" aria-label="ビフォーとアフターの境目">
    </div>`;
}

export default {
  async render(root, params, query, ctx) {
    const p = await getProject(params.id);
    if (!p) throw new Error('作品が見つかりません');
    ctx.setTitle(p.title);
    ctx.setBack('#/gallery');

    const logs = await listLogs(p.id);
    const photoIds = logs.flatMap((l) => l.photoIds);
    const { before, after } = effectiveBeforeAfter(p, photoIds);
    const g = genreOf(p.genre);
    const days = logs.length ? `${formatDate(logs[0].date)} 〜 ${formatDate(logs.at(-1).date)}` : '';
    const weekendsDone = new Set(logs.map((l) => l.weekend)).size;
    let mode = 'slider';

    root.innerHTML = `
      <section class="card">
        <div class="project-card-meta"><span class="chip">${g.icon} ${esc(g.label)}</span>
          <span class="muted small push-right">完成 ${formatDate(p.completedAt)}</span></div>
        <h2 class="project-title">${esc(p.title)}</h2>
        <p class="muted small">週末 ${weekendsDone} 回${days ? `（${days}）` : ''}${materialsTotal(p) ? `・材料費 ${yen(materialsTotal(p))}` : ''}</p>
      </section>

      ${photoIds.length ? `
      <section class="card">
        <div class="card-title-row">
          <h3 class="card-title">ビフォー・アフター</h3>
          <div class="mini-toggle">
            <button data-mode="slider" aria-pressed="true">スライド</button>
            <button data-mode="side" aria-pressed="false">並べる</button>
          </div>
        </div>
        <div id="compare">${compareView(mode, before, after)}</div>
        <button class="link small" id="pick-ba">写真を選び直す</button>
      </section>` : ''}

      <section>
        <h3 class="section-title">作業の記録</h3>
        ${logs.map((l) => `
          <article class="card log-entry">
            <div class="log-entry-head"><strong>${l.weekend}回目の週末</strong><span class="muted small push-right">${formatDate(l.date)}</span></div>
            ${l.photoIds.length ? `<div class="photo-grid">${l.photoIds.map((id) => `<button class="photo-btn" data-view="${esc(id)}">${photoImg(id)}</button>`).join('')}</div>` : ''}
            ${l.memo ? `<p class="log-memo">${nl2br(l.memo)}</p>` : ''}
          </article>`).join('') || '<p class="muted">記録はありません</p>'}
      </section>

      <div class="btn-row stack">
        <a class="btn btn-block" href="#/p/${esc(p.id)}?tab=log">記録・計画を開く</a>
        <button class="btn btn-block btn-danger-outline" id="reopen">作業中に戻す</button>
      </div>
    `;

    const compare = root.querySelector('#compare');
    // 指でなぞった位置に境目を動かす（キーボードでは range で操作できる）
    const bindSlider = () => {
      const slider = compare.querySelector('.compare-slider');
      if (!slider) return;
      const range = slider.querySelector('input');
      const setPos = (pct) => {
        const v = Math.max(0, Math.min(100, pct));
        slider.style.setProperty('--pos', `${v}%`);
        range.value = v;
      };
      const fromEvent = (e) => {
        const r = slider.getBoundingClientRect();
        setPos(((e.clientX - r.left) / r.width) * 100);
      };
      slider.addEventListener('pointerdown', (e) => { slider.setPointerCapture(e.pointerId); fromEvent(e); });
      slider.addEventListener('pointermove', (e) => { if (slider.hasPointerCapture(e.pointerId)) fromEvent(e); });
      range.addEventListener('input', () => setPos(Number(range.value)));
    };
    bindSlider();

    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      root.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      compare.innerHTML = compareView(mode, before, after);
      bindSlider();
      loadPhotos(compare);
    }));

    root.querySelector('#pick-ba')?.addEventListener('click', () => editBeforeAfter(p, ctx.refresh));
    root.addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]');
      if (v) openPhotoViewer(v.dataset.view);
    });
    root.querySelector('#reopen').addEventListener('click', async () => {
      if (!(await confirmDialog('このプロジェクトを「作業中」に戻しますか？\nギャラリーからは外れます。', { ok: '戻す' }))) return;
      p.status = 'active';
      p.completedAt = null;
      await saveProject(p);
      toast('作業中に戻しました');
      ctx.go(`#/p/${p.id}?tab=log`);
    });
  },
};
