// 新しいプロジェクトの入口：ジャンルを選ぶ → 「自分で作る」か「提案依頼」を選ぶ
import { GENRES, genreOf } from '../data.js';
import { esc } from '../ui.js';
import { catalogFor } from '../suggest.js';
import projectForm from './project-form.js';

export default {
  async render(root, params, query, ctx) {
    // お題ストックから来たときは、ジャンルが決まっているのでそのまま作成フォームへ
    if (query.get('idea')) return projectForm.render(root, params, query, ctx);

    ctx.setTitle('新しいプロジェクト');

    if (!params.genre) {
      ctx.setBack('#/');
      root.innerHTML = `
        <h2 class="section-title">どのジャンルにする？</h2>
        <div class="genre-grid">
          ${GENRES.map((g) => `
            <a class="genre-tile" href="#/new/${g.id}">
              <span class="genre-tile-icon">${g.icon}</span>
              <span>${esc(g.label)}</span>
            </a>`).join('')}
        </div>`;
      return;
    }

    const g = genreOf(params.genre);
    ctx.setBack('#/new');
    root.innerHTML = `
      <div class="genre-banner">
        <span class="genre-tile-icon">${g.icon}</span>
        <strong>${esc(g.label)}</strong>
        <a class="link small push-right" href="#/new">ジャンルを変える</a>
      </div>
      <a class="choice-card" href="#/new/${g.id}/create">
        <span class="choice-icon">✏️</span>
        <span class="choice-body"><strong>新しいプロジェクトを作る</strong>
          <span class="muted small">作りたいものが決まっているとき</span></span>
        <span class="choice-arrow">›</span>
      </a>
      <a class="choice-card" href="#/new/${g.id}/suggest">
        <span class="choice-icon">🎲</span>
        <span class="choice-body"><strong>提案依頼</strong>
          <span class="muted small">何を作るか迷ったら、${catalogFor(g.id).length}個のアイデアから5つ提案します</span></span>
        <span class="choice-arrow">›</span>
      </a>`;
  },
};
