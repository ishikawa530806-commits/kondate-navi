// お題ストック：やりたいアイデアをためておく
import {
  listIdeas, newIdea, saveIdea, deleteIdea, getProject, genreOf, STATUS,
} from '../data.js';
import { esc, nl2br, openModal, confirmDialog, toast, emptyState } from '../ui.js';
import { genreSelect, weekendsSelect } from './project-form.js';

function openIdeaForm(idea, onSaved) {
  const isNew = !idea;
  const v = idea || { title: '', genre: 'diy', weekends: 1, memo: '' };
  const { el, close } = openModal(`
    <h3 class="modal-title">${isNew ? 'お題を追加' : 'お題を編集'}</h3>
    <form class="form">
      <label class="field"><span class="field-label">やりたいこと</span>
        <input name="title" required maxlength="60" value="${esc(v.title)}" placeholder="例：ハーブの寄せ植え"></label>
      <div class="field"><span class="field-label">ジャンル</span>${genreSelect('genre', v.genre)}</div>
      <div class="field"><span class="field-label">週末何回くらい？</span>${weekendsSelect('weekends', v.weekends || 1)}</div>
      <label class="field"><span class="field-label">メモ</span>
        <textarea name="memo" rows="3" placeholder="きっかけ、参考にしたいもの など">${esc(v.memo)}</textarea></label>
      <div class="btn-row"><button type="button" class="btn" data-close>キャンセル</button>
        <button class="btn btn-primary">保存</button></div>
    </form>`);
  el.querySelector('input[name="title"]').focus();
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const fields = {
      title: f.get('title').trim(),
      genre: f.get('genre'),
      weekends: Number(f.get('weekends')),
      memo: f.get('memo').trim(),
    };
    if (!fields.title) return;
    await saveIdea(isNew ? newIdea(fields) : Object.assign(idea, fields));
    close();
    toast(isNew ? 'ストックしました' : '保存しました');
    onSaved();
  });
}

export default {
  async render(root, params, query, ctx) {
    ctx.setTitle('お題ストック');
    const all = await listIdeas();
    // 元のプロジェクトが削除されていたら、未着手のお題に戻す
    for (const i of all) {
      if (i.projectId && !(await getProject(i.projectId))) {
        i.projectId = null;
        await saveIdea(i);
      }
    }
    const stock = all.filter((i) => !i.projectId);
    const started = all.filter((i) => i.projectId);
    const projects = Object.fromEntries(await Promise.all(started.map(async (i) => [i.id, await getProject(i.projectId)])));

    const ideaCard = (i) => {
      const g = genreOf(i.genre);
      return `
        <article class="card idea-card" data-id="${esc(i.id)}">
          <div class="project-card-meta"><span class="chip">${g.icon} ${esc(g.label)}</span>
            <span class="muted small">週末${i.weekends || 1}回</span>
            <button class="link small push-right" data-edit>編集</button></div>
          <h3>${esc(i.title)}</h3>
          ${i.memo ? `<p class="muted small">${nl2br(i.memo)}</p>` : ''}
          <div class="btn-row">
            <button class="btn btn-small btn-danger-outline" data-delete>削除</button>
            <a class="btn btn-small btn-primary" href="#/new?idea=${esc(i.id)}">▶ プロジェクトにする</a>
          </div>
        </article>`;
    };

    root.innerHTML = `
      <button class="btn btn-primary btn-block btn-lg" id="add-idea">＋ お題を追加</button>
      <section>
        <h2 class="section-title">やりたいこと（${stock.length}）</h2>
        ${stock.length ? stock.map(ideaCard).join('') : emptyState('💡', '思いついた「やってみたい」をメモしておきましょう。<br>プロジェクトが完成したら、ここから次を選べます。')}
      </section>
      ${started.length ? `
      <section>
        <h2 class="section-title">プロジェクトにしたお題</h2>
        <ul class="simple-list">${started.map((i) => {
          const p = projects[i.id];
          return `<li><a href="${p.status === 'done' ? `#/gallery/${esc(p.id)}` : `#/p/${esc(p.id)}`}">
            ${genreOf(i.genre).icon} ${esc(i.title)} <span class="status status-${p.status}">${STATUS[p.status]}</span></a></li>`;
        }).join('')}</ul>
      </section>` : ''}
    `;

    root.querySelector('#add-idea').addEventListener('click', () => openIdeaForm(null, ctx.refresh));
    root.addEventListener('click', async (e) => {
      const card = e.target.closest('.idea-card');
      if (!card) return;
      const idea = stock.find((i) => i.id === card.dataset.id);
      if (e.target.closest('[data-edit]')) openIdeaForm(idea, ctx.refresh);
      if (e.target.closest('[data-delete]')) {
        if (!(await confirmDialog(`「${idea.title}」をストックから削除しますか？`, { ok: '削除する', danger: true }))) return;
        await deleteIdea(idea.id);
        toast('削除しました');
        ctx.refresh();
      }
    });
  },
};
