// 完成の流れ：ビフォー・アフター写真を選ぶ → 完成！ → お題ストックから次を選ぶ
import {
  saveProject, projectPhotoIds, listIdeas, startProjectFromIdea, genreOf,
} from '../data.js';
import { esc, openModal, photoImg, toast } from '../ui.js';

// 保存されている選択が今もある写真ならそれを、なければ最初／最後の写真を使う
export function effectiveBeforeAfter(p, photoIds) {
  return {
    before: photoIds.includes(p.beforePhotoId) ? p.beforePhotoId : photoIds[0] || null,
    after: photoIds.includes(p.afterPhotoId) ? p.afterPhotoId : photoIds.at(-1) || null,
  };
}

function strip(name, photoIds, selected) {
  return `<div class="pick-strip">${photoIds.map((id) => `
    <label class="pick-item"><input type="radio" name="${name}" value="${esc(id)}" ${id === selected ? 'checked' : ''}>
    ${photoImg(id)}</label>`).join('')}</div>`;
}

function beforeAfterFields(photoIds, current) {
  if (!photoIds.length) return '<p class="note">写真がまだありません。作業記録に写真を追加すると、ビフォーアフターを並べて見られます。</p>';
  return `
    <div class="field"><span class="field-label">ビフォー（作業前）</span>${strip('before', photoIds, current.before)}</div>
    <div class="field"><span class="field-label">アフター（完成）</span>${strip('after', photoIds, current.after)}</div>`;
}

// ビフォー・アフターの選び直し（ギャラリーから使う）
export async function editBeforeAfter(p, onSaved) {
  const photoIds = await projectPhotoIds(p.id);
  const { el, close } = openModal(`
    <h3 class="modal-title">ビフォー・アフターを選ぶ</h3>
    <form class="form">${beforeAfterFields(photoIds, effectiveBeforeAfter(p, photoIds))}
      <div class="btn-row"><button type="button" class="btn" data-close>キャンセル</button>
      <button class="btn btn-primary">保存</button></div>
    </form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    p.beforePhotoId = f.get('before');
    p.afterPhotoId = f.get('after');
    await saveProject(p);
    close();
    onSaved();
  });
}

export async function startCompleteFlow(p, ctx) {
  const photoIds = await projectPhotoIds(p.id);
  const { el, close } = openModal(`
    <div class="celebrate">🎉</div>
    <h3 class="modal-title center">「${esc(p.title)}」完成おめでとう！</h3>
    <form class="form">
      ${beforeAfterFields(photoIds, effectiveBeforeAfter(p, photoIds))}
      <div class="btn-row"><button type="button" class="btn" data-close>まだ途中</button>
      <button class="btn btn-accent">完成にする</button></div>
    </form>`);

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    p.beforePhotoId = f.get('before');
    p.afterPhotoId = f.get('after');
    p.status = 'done';
    p.completedAt = new Date().toISOString();
    await saveProject(p);
    close();
    toast('ギャラリーに追加しました');
    chooseNext(p, ctx);
  });
}

async function chooseNext(done, ctx) {
  const ideas = (await listIdeas()).filter((i) => !i.projectId);
  const { el, close } = openModal(`
    <h3 class="modal-title">次は何をつくる？</h3>
    ${ideas.length
      ? `<p class="muted small">お題ストックから次のプロジェクトを選べます</p>
         <ul class="idea-pick">${ideas.map((i) => {
           const g = genreOf(i.genre);
           return `<li><button class="idea-pick-btn" data-idea="${esc(i.id)}">
             <span class="chip">${g.icon} ${esc(g.label)}</span>
             <strong>${esc(i.title)}</strong>
             <span class="muted small">週末${i.weekends || 1}回</span></button></li>`;
         }).join('')}</ul>`
      : '<p class="note">お題ストックは空です。やりたいことを思いついたらメモしておきましょう。</p>'}
    <div class="btn-row">
      <button class="btn" data-later>あとで</button>
      ${ideas.length ? '' : '<a class="btn btn-primary" href="#/ideas">お題を追加する</a>'}
    </div>`);

  el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-idea]');
    if (pick) {
      const idea = ideas.find((i) => i.id === pick.dataset.idea);
      const p = await startProjectFromIdea(idea);
      close();
      toast(`「${p.title}」を始めました`);
      ctx.go(`#/p/${p.id}?tab=plan`);
    } else if (e.target.closest('[data-later]')) {
      close();
      ctx.go(`#/gallery/${done.id}`);
    }
  });
}
