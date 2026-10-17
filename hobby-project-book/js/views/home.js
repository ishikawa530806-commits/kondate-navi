// ホーム：進行中のプロジェクト一覧
import { listProjects, listLogs, listIdeas, genreOf, STATUS } from '../data.js';
import { esc, photoImg, emptyState } from '../ui.js';

async function card(p) {
  const logs = await listLogs(p.id);
  const doneWeekends = new Set(logs.map((l) => l.weekend)).size;
  const cover = logs.flatMap((l) => l.photoIds).at(-1);
  const g = genreOf(p.genre);
  const pct = Math.min(100, Math.round((doneWeekends / p.weekends) * 100));
  return `
    <a class="project-card" href="#/p/${esc(p.id)}">
      <div class="project-card-thumb">${photoImg(cover)}</div>
      <div class="project-card-body">
        <div class="project-card-meta"><span class="chip">${g.icon} ${esc(g.label)}</span><span class="status status-${p.status}">${STATUS[p.status]}</span></div>
        <h3>${esc(p.title)}</h3>
        <div class="progress" aria-label="進み具合"><div style="width:${pct}%"></div></div>
        <div class="muted small">週末 ${doneWeekends} / ${p.weekends} 回</div>
      </div>
    </a>`;
}

export default {
  async render(root) {
    const projects = await listProjects();
    const active = projects.filter((p) => p.status !== 'done');
    const doneCount = projects.length - active.length;
    const ideas = (await listIdeas()).filter((i) => !i.projectId);

    root.innerHTML = `
      <a class="btn btn-primary btn-block btn-lg" href="#/new">＋ 新しいプロジェクト</a>

      <section>
        <h2 class="section-title">進行中のプロジェクト</h2>
        ${active.length
          ? `<div class="project-list">${(await Promise.all(active.map(card))).join('')}</div>`
          : emptyState('🛠️', '進行中のプロジェクトはありません。<br>週末にやってみたいことを始めましょう！')}
      </section>

      <section class="summary-row">
        <a class="summary-tile" href="#/gallery"><strong>${doneCount}</strong><span>完成した作品</span></a>
        <a class="summary-tile" href="#/ideas"><strong>${ideas.length}</strong><span>お題ストック</span></a>
      </section>
    `;
  },
};
