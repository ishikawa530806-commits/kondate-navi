// プロジェクトの作成・編集
import {
  GENRES, genreOf, newProject, getProject, saveProject, deleteProject, getIdea, startProjectFromIdea, listLogs,
} from '../data.js';
import { esc, toast, confirmDialog } from '../ui.js';

export function genreSelect(name, selected) {
  return `<div class="genre-picker">${GENRES.map((g) => `
    <label><input type="radio" name="${name}" value="${g.id}" ${g.id === selected ? 'checked' : ''} required>
    <span>${g.icon} ${esc(g.label)}</span></label>`).join('')}</div>`;
}

export function weekendsSelect(name, selected, min = 1) {
  return `<div class="segmented">${[1, 2, 3, 4].map((n) => `
    <label><input type="radio" name="${name}" value="${n}" ${n === selected ? 'checked' : ''} ${n < min ? 'disabled' : ''}>
    <span>${n}回</span></label>`).join('')}</div>`;
}

export default {
  async render(root, params, query, ctx) {
    const editing = params.id ? await getProject(params.id) : null;
    if (params.id && !editing) throw new Error('プロジェクトが見つかりません');
    const idea = query.get('idea') ? await getIdea(query.get('idea')) : null;

    // すでに記録がある週末より少なくはできない
    const minWeekends = editing
      ? Math.max(1, ...(await listLogs(editing.id)).map((l) => l.weekend))
      : 1;
    const v = editing || { title: idea?.title || '', genre: idea?.genre || params.genre || 'diy', weekends: idea?.weekends || 1 };
    // 新規作成では、ジャンルは前の画面で選んだものに決まっている
    const genreFixed = !editing && !idea;

    ctx.setTitle(editing ? 'プロジェクトを編集' : '新しいプロジェクト');
    ctx.setBack(editing ? `#/p/${editing.id}` : idea ? '#/ideas' : `#/new/${v.genre}`);

    root.innerHTML = `
      <form class="form card" id="project-form">
        ${idea ? `<p class="note">💡 お題「${esc(idea.title)}」から作成します</p>` : ''}
        <label class="field">
          <span class="field-label">タイトル</span>
          <input name="title" required maxlength="60" placeholder="例：ベランダに小さな棚をつくる" value="${esc(v.title)}">
        </label>
        <div class="field">
          <span class="field-label">ジャンル</span>
          ${genreFixed
            ? `<div><span class="chip">${genreOf(v.genre).icon} ${esc(genreOf(v.genre).label)}</span>
               <input type="hidden" name="genre" value="${esc(v.genre)}"></div>`
            : genreSelect('genre', v.genre)}
        </div>
        <div class="field">
          <span class="field-label">予定する週末の回数</span>
          ${weekendsSelect('weekends', v.weekends, minWeekends)}
          <span class="muted small">週末1〜4回で終わるくらいの、小さなプロジェクトがおすすめです</span>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${editing ? '保存する' : 'つくって計画を立てる'}</button>
      </form>
      ${editing ? '<button class="btn btn-danger-outline btn-block" id="delete-btn">このプロジェクトを削除</button>' : ''}
    `;

    root.querySelector('#project-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const title = f.get('title').trim();
      if (!title) return;
      const genre = f.get('genre');
      const weekends = Number(f.get('weekends'));
      let p;
      if (editing) {
        p = Object.assign(editing, { title, genre, weekends });
        await saveProject(p);
        toast('保存しました');
      } else if (idea) {
        p = await startProjectFromIdea(Object.assign(idea, { title, genre }), weekends);
      } else {
        p = newProject({ title, genre, weekends });
        await saveProject(p);
      }
      ctx.go(`#/p/${p.id}`);
    });

    root.querySelector('#delete-btn')?.addEventListener('click', async () => {
      const ok = await confirmDialog(`「${editing.title}」を削除しますか？\n記録と写真もすべて消えます。`, { ok: '削除する', danger: true });
      if (!ok) return;
      await deleteProject(editing.id);
      toast('削除しました');
      ctx.go('#/');
    });
  },
};
