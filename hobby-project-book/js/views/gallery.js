// 完成ギャラリー：完成したプロジェクトを写真で一覧表示
import { listProjects, projectPhotoIds, genreOf, GENRES, formatDate } from '../data.js';
import { esc, photoImg, emptyState } from '../ui.js';
import { effectiveBeforeAfter } from './complete.js';

export default {
  async render(root, params, query, ctx) {
    ctx.setTitle('完成ギャラリー');
    const genre = query.get('genre');
    const done = (await listProjects())
      .filter((p) => p.status === 'done')
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    const shown = genre ? done.filter((p) => p.genre === genre) : done;

    if (!done.length) {
      root.innerHTML = emptyState('🖼️', '完成したプロジェクトがここに並びます。<br>まずはひとつ、完成させてみましょう！',
        '<a class="btn btn-primary" href="#/">プロジェクトを見る</a>');
      return;
    }

    const usedGenres = GENRES.filter((g) => done.some((p) => p.genre === g.id));
    const tiles = await Promise.all(shown.map(async (p) => {
      const { after } = effectiveBeforeAfter(p, await projectPhotoIds(p.id));
      return `
        <a class="gallery-tile" href="#/gallery/${esc(p.id)}">
          ${photoImg(after, { alt: p.title })}
          <div class="gallery-caption"><span>${genreOf(p.genre).icon} ${esc(p.title)}</span><small>${formatDate(p.completedAt)}</small></div>
        </a>`;
    }));

    root.innerHTML = `
      <p class="muted small">完成した作品 ${done.length} 件</p>
      ${usedGenres.length > 1 ? `<div class="filter-row">
        <a class="chip ${genre ? '' : 'selected'}" href="#/gallery">すべて</a>
        ${usedGenres.map((g) => `<a class="chip ${g.id === genre ? 'selected' : ''}" href="#/gallery?genre=${g.id}">${g.icon} ${esc(g.label)}</a>`).join('')}
      </div>` : ''}
      <div class="gallery-grid">${tiles.join('')}</div>
    `;
  },
};
