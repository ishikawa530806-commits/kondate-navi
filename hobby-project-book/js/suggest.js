// 「提案依頼」のしくみ。内蔵のアイデア集（suggestions-data.js）から条件に合うものを選ぶ。
// 通信しないので無料・オフラインで動く。
//
// 選び方
//   1. 条件に合うアイデアを集める（すでにプロジェクトやストックにあるものは除く）
//   2. 直前に見せたものはなるべく避ける（「別の提案」を押すたびに違うものが出る）
//   3. 分類（収納・家具…）がなるべくばらけるように選ぶ
//   4. 5つに足りなければ、条件をゆるめて補う
import { CATALOG } from './suggestions-data.js';
import { uid } from './db.js';

export const SUGGEST_COUNT = 5;

// ユーザーが指定できる条件。value が null なら「指定なし」
export const CONDITIONS = [
  {
    key: 'weekends', label: '週末の回数', options: [
      { value: null, label: 'こだわらない' },
      { value: 1, label: '1回で終わる' },
      { value: 2, label: '2回まで' },
      { value: 4, label: '3〜4回もOK' },
    ],
    test: (item, v) => item.weekends <= v,
  },
  {
    key: 'budget', label: '予算', options: [
      { value: null, label: 'こだわらない' },
      { value: 1000, label: '〜1,000円' },
      { value: 3000, label: '〜3,000円' },
      { value: 10000, label: '〜10,000円' },
    ],
    test: (item, v) => item.cost <= v,
  },
  {
    key: 'place', label: '場所', options: [
      { value: null, label: 'どこでも' },
      { value: 'in', label: '家の中' },
      { value: 'out', label: '屋外・ベランダ' },
    ],
    test: (item, v) => item.place === 'any' || item.place === v,
  },
  {
    key: 'level', label: '難しさ', options: [
      { value: null, label: 'こだわらない' },
      { value: 'easy', label: 'やさしい' },
      { value: 'normal', label: 'ほどほど' },
      { value: 'hard', label: '歯ごたえあり' },
    ],
    test: (item, v) => (v === 'easy' ? item.level === 1 : v === 'normal' ? item.level <= 2 : item.level >= 2),
  },
];

// 条件をゆるめる順番（後ろのものほど大事にする）
const RELAX_ORDER = ['level', 'place', 'budget', 'weekends'];

export const LEVEL_LABEL = { 1: 'やさしい', 2: 'ほどほど', 3: '歯ごたえあり' };
export const PLACE_LABEL = { in: '家の中', out: '屋外', any: '屋内・屋外' };

const split = (s) => (s && s !== 'なし' ? s.split('、').map((x) => x.trim()).filter(Boolean) : []);

function toItem(genre, row, i) {
  const [title, sub, weekends, cost, level, place, desc, materials, tools, steps] = row;
  return {
    key: `${genre}-${i}`, genre, title, sub, weekends, cost, level, place, desc,
    materials: split(materials), tools: split(tools), steps: steps.split('｜'),
  };
}

export function catalogFor(genre) {
  return (CATALOG[genre] || []).map((row, i) => toItem(genre, row, i));
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function matches(item, cond, skip = []) {
  return CONDITIONS.every((c) => skip.includes(c.key) || cond[c.key] == null || c.test(item, cond[c.key]));
}

// 分類がばらけるように count 個選ぶ
function pickDiverse(pool, count, usedSubs = new Set()) {
  const picked = [];
  const rest = [];
  for (const item of shuffle(pool)) {
    if (picked.length < count && !usedSubs.has(item.sub)) {
      picked.push(item);
      usedSubs.add(item.sub);
    } else rest.push(item);
  }
  return [...picked, ...rest].slice(0, count);
}

const seenByGenre = new Map(); // ジャンル → これまでに見せたアイデアの key
const lastByGenre = new Map(); // ジャンル → 直前に見せた5つの key

// genre   : ジャンルID
// cond    : { weekends, budget, place, level }
// exclude : 除外するタイトル（すでにあるプロジェクト・お題）
// 戻り値  : { items: [...], relaxed: ['budget', ...], total }
//           relaxed はゆるめた条件、total は条件にぴったり合うアイデアの数
export function suggest(genre, cond, exclude = new Set()) {
  const all = catalogFor(genre).filter((x) => !exclude.has(x.title));
  const seen = seenByGenre.get(genre) || new Set();
  const last = lastByGenre.get(genre) || new Set();
  const fill = (items, pool) => {
    const have = new Set(items.map((x) => x.key));
    const subs = new Set(items.map((x) => x.sub));
    items.push(...pickDiverse(pool.filter((x) => !have.has(x.key)), SUGGEST_COUNT - items.length, subs));
  };

  // まだ見せていないもの → 直前以外 → 直前のもの、の順に使う
  const matched = all.filter((x) => matches(x, cond));
  const items = [];
  fill(items, matched.filter((x) => !seen.has(x.key)));
  if (items.length < SUGGEST_COUNT) {
    for (const x of matched) seen.delete(x.key); // ひととおり見せたので一巡
    fill(items, matched.filter((x) => !last.has(x.key)));
    fill(items, matched);
  }

  const relaxed = [];
  const skip = [];
  for (const key of RELAX_ORDER) {
    if (items.length >= SUGGEST_COUNT) break;
    if (cond[key] == null) continue;
    skip.push(key);
    const before = items.length;
    const near = all.filter((x) => matches(x, cond, skip));
    fill(items, near.filter((x) => !last.has(x.key)));
    fill(items, near);
    if (items.length > before) relaxed.push(key);
  }

  for (const x of items) seen.add(x.key);
  seenByGenre.set(genre, seen);
  lastByGenre.set(genre, new Set(items.map((x) => x.key)));
  return { items, relaxed, total: matched.length };
}

// 提案の内容を、プロジェクトの「計画」の形に変換する
export function toPlan(item) {
  const parse = (s) => {
    const m = s.match(/^(.*?)[(（]([^)）]*)[)）]$/);
    return m ? { name: m[1].trim(), qty: m[2].trim() } : { name: s, qty: '' };
  };
  return {
    materials: item.materials.map((s) => ({ id: uid(), ...parse(s), price: null, done: false })),
    tools: item.tools.map((s) => ({ id: uid(), name: s, done: false })),
    budget: item.cost || null,
    steps: Object.fromEntries(item.steps.map((s, i) => [i + 1, s])),
    memo: item.desc,
  };
}
