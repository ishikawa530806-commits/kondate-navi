// 提案依頼：ジャンルと条件に合うアイデアを5つ提案する
import {
  genreOf, newProject, saveProject, newIdea, saveIdea, knownTitles,
} from '../data.js';
import { db } from '../db.js';
import { esc, yen, toast } from '../ui.js';
import {
  CONDITIONS, LEVEL_LABEL, PLACE_LABEL, SUGGEST_COUNT, suggest, matches, toPlan,
} from '../suggest.js';

const COND_KEY = 'suggestConditions';

function conditionFields(cond) {
  return CONDITIONS.map((c) => `
    <div class="field">
      <span class="field-label">${esc(c.label)}</span>
      <div class="segmented wrap">${c.options.map((o) => `
        <label><input type="radio" name="${c.key}" value="${o.value ?? ''}" ${(cond[c.key] ?? null) === o.value ? 'checked' : ''}>
        <span>${esc(o.label)}</span></label>`).join('')}</div>
    </div>`).join('');
}

function readConditions(form) {
  const f = new FormData(form);
  return Object.fromEntries(CONDITIONS.map((c) => {
    const raw = f.get(c.key);
    const opt = c.options.find((o) => String(o.value ?? '') === raw);
    return [c.key, opt ? opt.value : null];
  }));
}

function suggestionCard(item, i, cond) {
  const outside = !matches(item, cond);
  const list = (items) => (items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">特になし</p>');
  return `
    <article class="card suggestion" data-index="${i}">
      <div class="project-card-meta">
        <span class="chip">${esc(item.sub)}</span>
        ${outside ? '<span class="chip chip-warn">条件に近いもの</span>' : ''}
      </div>
      <h3>${esc(item.title)}</h3>
      <div class="suggestion-facts">
        <span>🗓️ 週末${item.weekends}回</span>
        <span>💰 ${item.cost ? `約${yen(item.cost)}` : 'ほぼ0円'}</span>
        <span>📈 ${LEVEL_LABEL[item.level]}</span>
        <span>📍 ${PLACE_LABEL[item.place]}</span>
      </div>
      <p class="small">${esc(item.desc)}</p>
      <details>
        <summary>材料・道具・作業の流れ</summary>
        <div class="details-body">
          <h4>材料</h4>${list(item.materials)}
          <h4>道具</h4>${list(item.tools)}
          <h4>作業の流れ</h4>
          <ol>${item.steps.map((s, n) => `<li><span class="muted small">${n + 1}回目の週末：</span>${esc(s)}</li>`).join('')}</ol>
        </div>
      </details>
      <div class="btn-row">
        <button class="btn btn-small" data-stock>💡 ストックに追加</button>
        <button class="btn btn-small btn-primary" data-start>▶ これで始める</button>
      </div>
    </article>`;
}

export default {
  async render(root, params, query, ctx) {
    const g = genreOf(params.genre);
    ctx.setTitle(`${g.label}の提案`);
    ctx.setBack(`#/new/${g.id}`);

    const saved = (await db.get('meta', COND_KEY))?.value || {};
    let cond = { ...saved };
    let items = [];

    root.innerHTML = `
      <div class="genre-banner">
        <span class="genre-tile-icon">${g.icon}</span>
        <strong>${esc(g.label)}</strong>
        <span class="muted small push-right">内蔵アイデアから提案・無料</span>
      </div>
      <details class="card cond-card">
        <summary><strong>🔧 条件を指定する</strong> <span class="muted small" id="cond-summary"></span></summary>
        <form id="cond-form" class="form">${conditionFields(cond)}</form>
      </details>
      <button class="btn btn-accent btn-block btn-lg" id="suggest-btn">🎲 ${SUGGEST_COUNT}つ提案してもらう</button>
      <div id="results"></div>
    `;

    const form = root.querySelector('#cond-form');
    const results = root.querySelector('#results');

    const summarize = () => {
      const parts = CONDITIONS.filter((c) => cond[c.key] != null)
        .map((c) => c.options.find((o) => o.value === cond[c.key]).label);
      root.querySelector('#cond-summary').textContent = parts.length ? `（${parts.join('・')}）` : '（指定なし）';
    };

    const run = async () => {
      cond = readConditions(form);
      summarize();
      await db.put('meta', { key: COND_KEY, value: cond });
      const r = suggest(g.id, cond, await knownTitles());
      items = r.items;
      const relaxedLabels = r.relaxed.map((k) => CONDITIONS.find((c) => c.key === k).label);
      results.innerHTML = items.length
        ? `<p class="muted small">条件に合うアイデア：${r.total}件${r.total > SUGGEST_COUNT ? '（「別の提案」で順番に出てきます）' : ''}</p>
           ${relaxedLabels.length ? `<p class="note">条件にぴったり合うものが少なかったので、「${relaxedLabels.join('」「')}」が近いものも入れています。</p>` : ''}
           ${items.map((it, i) => suggestionCard(it, i, cond)).join('')}
           ${r.total > SUGGEST_COUNT ? `<button class="btn btn-block" id="again-btn">🔄 別の${SUGGEST_COUNT}つを提案</button>` : ''}`
        : '<div class="empty"><div class="empty-icon">🤔</div><p>提案できるアイデアがありませんでした。</p></div>';
      root.querySelector('#suggest-btn').textContent = '🎲 この条件で提案し直す';
    };

    form.addEventListener('change', summarize);
    root.querySelector('#suggest-btn').addEventListener('click', async () => {
      await run();
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    results.addEventListener('click', async (e) => {
      if (e.target.closest('#again-btn')) {
        await run();
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const card = e.target.closest('.suggestion');
      if (!card) return;
      const item = items[Number(card.dataset.index)];

      if (e.target.closest('[data-start]')) {
        const p = newProject({ title: item.title, genre: g.id, weekends: item.weekends });
        Object.assign(p.plan, toPlan(item));
        await saveProject(p);
        toast(`「${p.title}」を始めました`);
        ctx.go(`#/p/${p.id}?tab=plan`);
      } else if (e.target.closest('[data-stock]')) {
        const btn = e.target.closest('[data-stock]');
        await saveIdea(newIdea({
          title: item.title, genre: g.id, weekends: item.weekends, memo: item.desc, plan: toPlan(item),
        }));
        btn.disabled = true;
        btn.textContent = '✔ ストック済み';
        toast('お題ストックに追加しました');
      }
    });

    summarize();
    await run();
  },
};
