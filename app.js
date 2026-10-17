// =====================================================================
// 献立ナビ：アプリの動き
// =====================================================================

const SEASON_NAMES = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const GENRE_NAMES = { washoku: "和食", chuka: "中華", yoshoku: "洋食" };
const SUGGEST_COUNT = 5;        // 提案する献立の数
const BASE_SERVINGS = 2;        // レシピの材料は2人分で書いてある

// 特売の食材を使う料理に足す点数。旬の料理（2〜3点）より必ず上に来るよう 3 にする
const SALE_BONUS = 3;
const SALE_BONUS_EXTRA = 0.5;   // 特売の食材を2つ以上使う場合、1つ増えるごとに足す点数

// チラシ画像の読み取り（文字認識）の設定
const MAX_IMAGES = 5;             // アップロードできる画像の数
// 文字認識の部品の置き場所。アプリと一緒に置いた vendor/tesseract/ を使う。
// ただしファイルを直接開いた場合（file://）は、ブラウザの制限で同梱の部品を読み込めないため、配布元（CDN）から読み込む
const TESSERACT_CDN_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const TESSERACT_DIR = "vendor/tesseract/";
const USE_BUNDLED_OCR = location.protocol !== "file:";
const OCR_MIN_WIDTH = 3000;       // 横幅がこれより小さい画像は拡大して読む（最大2倍。試験では2倍で精度が上がった）
const OCR_MAX_WIDTH = 4000;       // 横幅がこれより大きくならないようにする（スマホのメモリと処理時間を抑えるため）
const CONF_GOOD = 60;             // 信頼度がこれ以上なら「良い」
const CONF_FAIR = 40;             // これ以上なら「ふつう」、未満なら「低い」
const MIN_READ_CHARS = 20;        // 読み取れた文字がこれより少なければ「読み取れなかった」とみなす
const SNIPPET_CHARS = 8;          // 根拠として、見つかった言葉の前後に表示する文字数

// 画面の部品をまとめて取得しておく
const $ = (id) => document.getElementById(id);

// アプリの状態
let lastConditions = null; // 最後に提案したときの条件（レシピの人数分の計算に使う）
let currentPicks = [];   // いま表示している5つの献立
let flyerImages = [];    // 選んだチラシ画像 { id, file, url }
let nextImageId = 1;
let ocrResult = null;    // まだ反映していない読み取り結果（反映・破棄すると null に戻す）

// ---------------------------------------------------------------------
// 季節：今日の日付から判定する（3〜5月:春、6〜8月:夏、9〜11月:秋、12〜2月:冬）
// ---------------------------------------------------------------------
function getSeason(date) {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function showToday() {
  const now = new Date();
  const text = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  $("today").textContent = `今日は ${text}（${SEASON_NAMES[getSeason(now)]}）です`;
}

// ---------------------------------------------------------------------
// チラシの画像：選ぶ・撮る（最大5枚）、一覧表示、削除
// ---------------------------------------------------------------------

function addImages(fileList) {
  const status = $("imageStatus");
  status.textContent = "";
  status.classList.remove("error");

  const files = [...fileList];
  const images = files.filter((f) => f.type.startsWith("image/"));
  const room = MAX_IMAGES - flyerImages.length;
  const messages = [];
  if (images.length < files.length) messages.push("画像ではないファイルは追加しませんでした。");
  if (images.length > room) messages.push(`チラシの画像は${MAX_IMAGES}枚までです。${images.length - room}枚は追加しませんでした。`);

  for (const file of images.slice(0, Math.max(0, room))) {
    flyerImages.push({ id: nextImageId++, file, url: URL.createObjectURL(file) });
  }
  if (messages.length) {
    status.textContent = messages.join("");
    status.classList.add("error");
  }
  discardOcrResult(); // 画像が変わったら、前の読み取り結果は使わない
  renderImages();
}

function removeImage(id) {
  const img = flyerImages.find((x) => x.id === id);
  if (img) URL.revokeObjectURL(img.url);
  flyerImages = flyerImages.filter((x) => x.id !== id);
  $("imageStatus").textContent = "";
  discardOcrResult();
  renderImages();
}

function renderImages() {
  const list = $("imageList");
  list.innerHTML = "";
  flyerImages.forEach((img, i) => {
    const li = document.createElement("li");
    const pic = document.createElement("img");
    pic.src = img.url;
    pic.alt = `チラシ画像${i + 1}`;
    // ファイル名は利用者の端末から来た文字なので textContent で表示する
    const name = document.createElement("span");
    name.className = "thumb-name";
    name.textContent = `画像${i + 1}：${img.file.name}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "thumb-remove";
    del.textContent = "✕";
    del.setAttribute("aria-label", `画像${i + 1}を削除`);
    del.addEventListener("click", () => removeImage(img.id));
    li.append(pic, name, del);
    list.append(li);
  });

  const full = flyerImages.length >= MAX_IMAGES;
  $("imageCount").textContent = `チラシの画像：${flyerImages.length} / ${MAX_IMAGES}枚`;
  $("ocrBtn").disabled = flyerImages.length === 0;
  $("imageInput").disabled = full;
  $("cameraInput").disabled = full;
  document.querySelectorAll(".upload-btn").forEach((b) => b.classList.toggle("disabled", full));
}

// ---------------------------------------------------------------------
// チラシの画像：文字認識で読み取り、特売の食材を探す
// ---------------------------------------------------------------------

// 同梱の部品の場所を、ページの場所をもとにした完全な URL にする（ワーカーの中からも正しく参照できるように）
const bundledUrl = (path) => new URL(TESSERACT_DIR + path, location.href).href;

// 文字認識の部品（Tesseract.js）は、読み取るときに初めて読み込む
let tesseractPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = USE_BUNDLED_OCR ? bundledUrl("tesseract.min.js") : TESSERACT_CDN_URL;
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => { tesseractPromise = null; script.remove(); reject(new Error("load")); };
      document.head.append(script);
    });
  }
  return tesseractPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

// 読み取りやすいよう、大きさをそろえて白黒にする
async function imageToCanvas(file) {
  const img = await loadImage(file);
  const w = img.naturalWidth;
  let scale = 1;
  if (w < OCR_MIN_WIDTH) scale = Math.min(2, OCR_MAX_WIDTH / w);
  else if (w > OCR_MAX_WIDTH) scale = OCR_MAX_WIDTH / w;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

// 読み取った文字の中から特売の食材を探し、見つけた言葉と前後の文字（根拠）を返す
function findFlyerItems(rawText) {
  const text = rawText.replace(/\s+/g, ""); // 文字認識は文字の間に空白を入れることがあるので取り除く
  const found = [];
  for (const item of SALE_ITEMS) {
    let t = text;
    for (const ex of item.flyerExclude || []) t = t.split(ex).join("／");
    for (const word of item.flyer) {
      const i = t.indexOf(word);
      if (i >= 0) {
        const snippet = t.slice(Math.max(0, i - SNIPPET_CHARS), i + word.length + SNIPPET_CHARS);
        found.push({ id: item.id, word, snippet });
        break;
      }
    }
  }
  return found;
}

function accuracyLevel(conf) {
  if (conf >= CONF_GOOD) return { key: "good", text: "良い" };
  if (conf >= CONF_FAIR) return { key: "fair", text: "ふつう" };
  return { key: "low", text: "低い" };
}

function setProgress(percent, text) {
  $("ocrBar").value = Math.round(percent);
  $("ocrProgressText").textContent = text;
}

async function readFlyers() {
  const error = $("ocrError");
  error.textContent = "";
  discardOcrResult();
  const total = flyerImages.length;
  if (total === 0) return;

  $("ocrBtn").disabled = true;
  $("ocrProgress").hidden = false;
  setProgress(0, "文字認識の準備をしています…（初めての場合は数十秒かかることがあります）");

  let worker = null;
  let current = 0;
  try {
    let Tesseract;
    try {
      Tesseract = await loadTesseract();
      // 同梱の部品を使うときは、処理部品・日本語データも同梱のものを読む（外部へのデータ取得をしない）
      const paths = USE_BUNDLED_OCR
        ? { workerPath: bundledUrl("worker.min.js"), corePath: bundledUrl("core/"), langPath: bundledUrl("lang"), workerBlobURL: false }
        : {};
      worker = await Tesseract.createWorker("jpn", 1, {
        ...paths,
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(((current + m.progress) / total) * 100,
              `画像${current + 1} / ${total}枚目を読み取っています…（${Math.round(m.progress * 100)}%）`);
          }
        },
      });
      // まばらに並んだ文字を探す読み方（チラシに向いている）
      await worker.setParameters({ tessedit_pageseg_mode: "11" });
    } catch (err) {
      throw new Error("文字認識の部品を読み込めませんでした。インターネットに接続して、もう一度お試しください。");
    }

    const perImage = [];
    for (current = 0; current < total; current++) {
      const img = flyerImages[current];
      setProgress((current / total) * 100, `画像${current + 1} / ${total}枚目を準備しています…`);
      try {
        const canvas = await imageToCanvas(img.file);
        const { data } = await worker.recognize(canvas);
        perImage.push({
          no: current + 1, name: img.file.name,
          conf: Math.round(data.confidence),
          chars: data.text.replace(/\s+/g, "").length,
          found: findFlyerItems(data.text),
        });
      } catch (err) {
        perImage.push({ no: current + 1, name: img.file.name, failed: true, conf: 0, chars: 0, found: [] });
      }
    }
    ocrResult = buildOcrResult(perImage);
    renderOcrResult();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    if (worker) await worker.terminate();
    $("ocrProgress").hidden = true;
    $("ocrBtn").disabled = flyerImages.length === 0;
  }
}

// 画像ごとの結果をまとめ、食材ごとの根拠と、全体の精度を求める
function buildOcrResult(perImage) {
  const items = new Map();
  for (const img of perImage) {
    for (const f of img.found) {
      if (!items.has(f.id)) items.set(f.id, []);
      items.get(f.id).push({ no: img.no, word: f.word, snippet: f.snippet });
    }
  }
  const avgConf = Math.round(perImage.reduce((sum, x) => sum + x.conf, 0) / perImage.length);
  return { perImage, items, avgConf, skipped: false };
}

// 読み取り結果をアプリ内で確認してもらう欄を作る
function renderOcrResult() {
  const box = $("ocrResult");
  box.innerHTML = "";
  const { perImage, items, avgConf } = ocrResult;
  const level = accuracyLevel(avgConf);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  box.append(el("h3", "", "読み取り結果の確認"));

  // 精度のまとめ
  const summary = el("div", `accuracy level-${level.key}`);
  summary.append(el("p", "accuracy-main", `読み取りの精度：${level.text}（平均 ${avgConf}%）`));
  summary.append(el("p", "", `画像${perImage.length}枚から、特売の食材が${items.size}品目見つかりました。`));
  box.append(summary);

  const imgList = el("ul", "per-image");
  for (const img of perImage) {
    const text = img.failed
      ? `画像${img.no}（${img.name}）：画像を開けませんでした`
      : `画像${img.no}（${img.name}）：信頼度 ${img.conf}%（${accuracyLevel(img.conf).text}）・読み取った文字 ${img.chars.toLocaleString()}字・見つかった食材 ${img.found.length}品目`;
    imgList.append(el("li", "", text));
  }
  box.append(imgList);

  // 確認事項
  const checks = [];
  for (const img of perImage) {
    if (img.failed) {
      checks.push(`画像${img.no}（${img.name}）は開けませんでした。別の画像を選んでください。`);
    } else if (img.conf < CONF_FAIR || img.chars < MIN_READ_CHARS) {
      checks.push(`画像${img.no}（${img.name}）はうまく読み取れませんでした（信頼度 ${img.conf}%）。明るい場所で、チラシに近づいてピントを合わせて撮り直すと、読み取れることがあります。`);
    } else if (img.found.length === 0) {
      checks.push(`画像${img.no}（${img.name}）からは特売の食材が見つかりませんでした。食料品のページであれば、下の「特売の食材を手で選ぶ・直す」から選んでください。`);
    }
  }
  if (items.size === 0) {
    checks.push("特売の食材が1つも見つかりませんでした。撮り直すか、下の「特売の食材を手で選ぶ・直す」から選んでください。");
  } else {
    checks.push("チラシの言葉を探して見つけているため、惣菜・飲み物・お寿司などの名前を食材と取り違えることがあります。根拠を見て、違うものはチェックを外してください。");
    checks.push("見つからなかった特売の食材は、反映したあとで「特売の食材を手で選ぶ・直す」から追加できます。");
  }
  const checkBox = el("div", "ocr-checks");
  checkBox.append(el("p", "ocr-checks-title", "⚠️ 確認してください"));
  const checkList = el("ul");
  checks.forEach((c) => checkList.append(el("li", "", c)));
  checkBox.append(checkList);
  box.append(checkBox);

  // 見つかった食材（根拠つき、チェックで選ぶ）
  if (items.size > 0) {
    box.append(el("p", "found-title", "見つかった特売の食材（違うものはチェックを外してください）"));
    const list = el("ul", "found-list");
    for (const item of SALE_ITEMS.filter((x) => items.has(x.id))) {
      const ev = items.get(item.id)[0];
      const li = el("li");
      const label = el("label");
      const cb = el("input");
      cb.type = "checkbox";
      cb.name = "ocrItem";
      cb.value = item.id;
      cb.checked = true;
      label.append(cb, " " + item.label);
      const more = items.get(item.id).length > 1 ? ` ほか${items.get(item.id).length - 1}枚` : "";
      li.append(label, el("small", "evidence", `根拠：「…${ev.snippet}…」（画像${ev.no}${more}）`));
      list.append(li);
    }
    box.append(list);
  }

  // ボタン：精度が低くても、ユーザーが判断して反映できる
  const buttons = el("div", "notice-buttons");
  if (items.size > 0) {
    const apply = el("button", "btn btn-primary",
      level.key === "low" ? "精度は低いですが、この内容で反映する" : "この内容で特売の食材に反映する");
    apply.type = "button";
    apply.id = "applyOcr";
    apply.addEventListener("click", applyOcrResult);
    buttons.append(apply);
  }
  const discard = el("button", "btn", items.size > 0 ? "反映しない" : "閉じる");
  discard.type = "button";
  discard.id = "discardOcr";
  discard.addEventListener("click", discardOcrResult);
  buttons.append(discard);
  box.append(buttons);

  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 確認でチェックが残った食材を、特売の食材の一覧に反映する
function applyOcrResult() {
  if (!ocrResult) return;
  const ids = [...document.querySelectorAll('input[name="ocrItem"]:checked')].map((c) => c.value);
  for (const id of ids) {
    const cb = document.querySelector(`input[name="sale"][value="${id}"]`);
    if (cb) cb.checked = true;
  }
  updateSaleCount();
  ocrResult = null;
  $("pendingNotice").hidden = true;

  const box = $("ocrResult");
  box.innerHTML = "";
  const labels = SALE_ITEMS.filter((x) => ids.includes(x.id)).map((x) => x.label);
  const msg = document.createElement("p");
  msg.className = "ocr-applied";
  msg.textContent = labels.length
    ? `✅ チラシから ${labels.length}品目（${labels.join("・")}）を特売の食材に反映しました。直すときは下の「特売の食材を手で選ぶ・直す」を開いてください。`
    : "✅ 反映する食材がなかったため、特売の食材は変更しませんでした。";
  box.append(msg);
  box.hidden = false;
}

function discardOcrResult() {
  ocrResult = null;
  $("ocrResult").hidden = true;
  $("ocrResult").innerHTML = "";
  $("pendingNotice").hidden = true;
}

// ---------------------------------------------------------------------
// 特売の食材：チェック一覧の表示と、レシピとの照らし合わせ
// ---------------------------------------------------------------------

// 材料名が特売の食材に当てはまるか
function matchesSaleItem(ingredientName, item) {
  if (item.exclude && item.exclude.some((w) => ingredientName.includes(w))) return false;
  return item.match.some((w) => ingredientName.includes(w));
}

// レシピが使う特売の食材（チェックされたもののうち）を返す
function saleItemsUsed(recipe, saleIds) {
  return SALE_ITEMS.filter((item) =>
    saleIds.includes(item.id) &&
    recipe.ingredients.some(([name]) => matchesSaleItem(name, item)));
}

function renderSaleList() {
  const box = $("saleList");
  box.innerHTML = "";
  const groups = [...new Set(SALE_ITEMS.map((item) => item.group))];

  for (const group of groups) {
    const wrap = document.createElement("div");
    wrap.className = "sale-group";
    const title = document.createElement("p");
    title.className = "sale-group-title";
    title.textContent = group;
    const choices = document.createElement("div");
    choices.className = "choices";

    for (const item of SALE_ITEMS.filter((x) => x.group === group)) {
      // その食材を使うレシピの数も表示する
      const count = RECIPES.filter((r) => r.ingredients.some(([name]) => matchesSaleItem(name, item))).length;
      const label = document.createElement("label");
      label.className = "chip";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "sale";
      checkbox.value = item.id;
      const small = document.createElement("small");
      small.textContent = `（${count}品）`;
      label.append(checkbox, " " + item.label, small);
      choices.append(label);
    }
    wrap.append(title, choices);
    box.append(wrap);
  }
}

function getCheckedSaleIds() {
  return [...document.querySelectorAll('input[name="sale"]:checked')].map((c) => c.value);
}

function updateSaleCount() {
  const ids = getCheckedSaleIds();
  $("saleCount").textContent = ids.length ? `特売の食材：${ids.length}件選択中` : "特売の食材：未選択";
}

// ---------------------------------------------------------------------
// 献立の提案
// ---------------------------------------------------------------------

// HTML として組み立てる文字の中の記号を無害化する
// （レシピは内蔵データだが、将来外部から取り込んでも安全なようにする）
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 旬の料理ほど点数を高くする（旬を考慮しないときは、どの料理も同じ点数）
function seasonScore(recipe, season, useSeason = true) {
  if (!useSeason) return 0;
  if (recipe.seasons.includes(season)) return 2;
  if (recipe.seasons.includes("all")) return 1.5;
  return 0;
}

// 特売の食材を使うほど点数を高くする
function saleScore(usedCount) {
  return usedCount === 0 ? 0 : SALE_BONUS + SALE_BONUS_EXTRA * (usedCount - 1);
}

// 条件に合う献立を5つ選ぶ
function pickRecipes({ people, budget, genre, season, useSeason, saleIds }) {
  const candidates = RECIPES
    .filter((r) => genre === "omakase" || r.genre === genre)
    .map((r) => {
      const saleUsed = saleItemsUsed(r, saleIds);
      return {
        recipe: r,
        saleUsed,
        // 毎回少し違う提案になるよう、点数にランダムな値を足す
        score: seasonScore(r, season, useSeason) + saleScore(saleUsed.length) + Math.random(),
        overBudget: r.cost * people > budget,
      };
    });

  // 予算内のものを点数順に。足りなければ予算オーバーのものを安い順に追加する
  const within = candidates.filter((c) => !c.overBudget).sort((a, b) => b.score - a.score);
  const over = candidates.filter((c) => c.overBudget).sort((a, b) => a.recipe.cost - b.recipe.cost);
  return [...within, ...over].slice(0, SUGGEST_COUNT);
}

// おすすめの理由を、特売・季節・予算・調理時間の条件から作る
// short はカードに出す短い要点、long はレシピ画面に出す文章
const SEASON_ICONS = { spring: "🌸", summer: "🌻", autumn: "🍂", winter: "❄️" };
const QUICK_MINUTES = 20; // これ以下なら「手軽」
const SLOW_MINUTES = 45;  // これ以上なら「時間のある日向き」

function buildReasons(pick, { people, budget, season, useSeason = true }) {
  const r = pick.recipe;
  const reasons = [];
  const seasonName = SEASON_NAMES[season];

  if (pick.saleUsed.length > 0) {
    const names = pick.saleUsed.map((item) => item.label).join("・");
    reasons.push({ icon: "🏷️", short: `${names}が特売`,
      long: `チラシで特売の${names}を使う料理です。` });
  }

  // 旬を考慮しないときは、今が旬の料理にだけ季節の理由を添える
  if (r.seasons.includes(season)) {
    reasons.push({ icon: SEASON_ICONS[season], short: `${seasonName}が旬`,
      long: `今が旬の${seasonName}にぴったりの料理です。` });
  } else if (!useSeason) {
    // 季節の理由は付けない
  } else if (r.seasons.includes("all")) {
    reasons.push({ icon: "🍽️", short: "季節を問わない定番",
      long: "季節を問わずおいしく食べられる定番の料理です。" });
  } else {
    const shun = r.seasons.map((s) => SEASON_NAMES[s]).join("・");
    reasons.push({ icon: "📅", short: `旬は${shun}`,
      long: `旬は${shun}ですが、特売や予算などの条件から候補に入れました。` });
  }

  const total = r.cost * people;
  if (!pick.overBudget) {
    reasons.push({ icon: "💰", short: "予算内",
      long: `${people}人分の食材費は約${total.toLocaleString()}円で、予算${budget.toLocaleString()}円に収まります（残り約${(budget - total).toLocaleString()}円）。` });
  } else {
    const over = total - budget;
    reasons.push({ icon: "⚠️", short: `予算を約${over.toLocaleString()}円超過`,
      long: `予算内で作れる料理が${SUGGEST_COUNT}品に満たないため、食材費の安い順に選びました。予算を約${over.toLocaleString()}円超えます。` });
  }

  if (r.time <= QUICK_MINUTES) {
    reasons.push({ icon: "⏱️", short: `${r.time}分で完成`,
      long: `調理時間が約${r.time}分と短く、忙しい日にも作りやすい料理です。` });
  } else if (r.time >= SLOW_MINUTES) {
    reasons.push({ icon: "⏳", short: `じっくり${r.time}分`,
      long: `調理に約${r.time}分かかるので、時間に余裕のある日におすすめです。` });
  }
  return reasons;
}

function readConditions() {
  const people = Number($("people").value);
  const budget = Number($("budget").value);
  const genre = document.querySelector('input[name="genre"]:checked').value;
  const useSeason = document.querySelector('input[name="seasonMode"]:checked').value === "on";

  if (!Number.isInteger(people) || people < 1 || people > 10) {
    throw new Error("人数は 1〜10 の整数で入力してください。");
  }
  if (!(budget >= 100)) {
    throw new Error("食材の合計金額は 100円以上で入力してください。");
  }
  return { people, budget, genre, season: getSeason(new Date()), useSeason, saleIds: getCheckedSaleIds() };
}

function suggest() {
  const error = $("formError");
  error.textContent = "";
  try {
    lastConditions = readConditions();
  } catch (err) {
    error.textContent = err.message;
    return;
  }
  showSuggestions();
}

function showSuggestions() {
  const { people, budget, genre, season, useSeason, saleIds } = lastConditions;
  currentPicks = pickRecipes(lastConditions);

  const genreText = genre === "omakase" ? "おまかせ" : GENRE_NAMES[genre];
  const saleText = saleIds.length ? `・特売の食材${saleIds.length}件` : "";
  const seasonText = useSeason ? SEASON_NAMES[season] : `${SEASON_NAMES[season]}（旬は考慮しない）`;
  $("resultSummary").textContent =
    `${seasonText}・${people}人分・予算${budget.toLocaleString()}円・${genreText}${saleText} の条件で選びました。料理を選ぶと作り方が見られます。`;

  const grid = $("menuGrid");
  grid.innerHTML = "";
  currentPicks.forEach((pick, index) => {
    const r = pick.recipe;
    pick.reasons = buildReasons(pick, lastConditions);
    const reasonItems = pick.reasons
      .map((x) => `<li><span aria-hidden="true">${escapeHtml(x.icon)}</span> ${escapeHtml(x.short)}</li>`)
      .join("");
    const card = document.createElement("button");
    card.type = "button";
    card.className = "menu-card";
    card.innerHTML = `
      <div class="dish-img ${escapeHtml(r.genre)}" aria-hidden="true">${escapeHtml(r.emoji)}</div>
      <div class="menu-card-body">
        <p class="menu-card-name">${escapeHtml(r.name)}</p>
        <p class="menu-card-meta">
          <span class="badge">${GENRE_NAMES[r.genre]}</span>
          ${pick.saleUsed.length ? '<span class="badge sale">特売</span>' : ""}
          ${r.seasons.includes(season) ? '<span class="badge season">旬</span>' : ""}
          ${pick.overBudget ? '<span class="badge over">予算オーバー</span>' : ""}
        </p>
        <p class="menu-card-meta">約${(r.cost * people).toLocaleString()}円 ／ ${escapeHtml(r.time)}分</p>
        <ul class="reasons" aria-label="おすすめの理由">${reasonItems}</ul>
      </div>`;
    card.addEventListener("click", () => showRecipe(index));
    grid.appendChild(card);
  });

  $("recipe").hidden = true;
  $("results").hidden = false;
  $("results").scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------------
// レシピの表示
// ---------------------------------------------------------------------

// 「大さじ」などは数字の前に、それ以外の単位は数字の後ろにつける
const PREFIX_UNITS = ["大さじ", "小さじ"];

// 0.5 → 1/2、1.5 → 1と1/2 のように読みやすい形にする
function toFraction(value) {
  const rounded = Math.max(0.25, Math.round(value * 4) / 4);
  const whole = Math.floor(rounded);
  const frac = { 0.25: "1/4", 0.5: "1/2", 0.75: "3/4" }[rounded - whole];
  if (!frac) return String(whole);
  return whole > 0 ? `${whole}と${frac}` : frac;
}

// 人数に合わせて分量を計算する
function formatAmount(amount, unit, factor) {
  if (amount === null) return unit; // 「少々」「適量」はそのまま
  const value = amount * factor;
  if (unit === "g" || unit === "ml") {
    const rounded = value >= 20 ? Math.round(value / 10) * 10 : Math.round(value);
    return `${rounded}${unit}`;
  }
  const text = toFraction(value);
  return PREFIX_UNITS.includes(unit) ? unit + text : text + unit;
}

function showRecipe(index) {
  const { recipe: r, overBudget, reasons, saleUsed } = currentPicks[index];
  const { people, season } = lastConditions;
  const factor = people / BASE_SERVINGS;

  // 特売の食材に当てはまる材料には「特売」の印を付ける
  const ingredients = r.ingredients
    .map(([name, amount, unit]) => {
      const onSale = saleUsed.some((item) => matchesSaleItem(name, item));
      const mark = onSale ? ' <span class="badge sale">特売</span>' : "";
      return `<li><span>${escapeHtml(name)}${mark}</span><span>${escapeHtml(formatAmount(amount, unit, factor))}</span></li>`;
    })
    .join("");
  const steps = r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const reasonItems = reasons
    .map((x) => `<li><span aria-hidden="true">${escapeHtml(x.icon)}</span> ${escapeHtml(x.long)}</li>`)
    .join("");

  $("recipeBody").innerHTML = `
    <div class="dish-img large ${escapeHtml(r.genre)}" aria-hidden="true">${escapeHtml(r.emoji)}</div>
    <h2 class="recipe-title">${escapeHtml(r.name)}</h2>
    <p class="menu-card-meta">
      <span class="badge">${GENRE_NAMES[r.genre]}</span>
      ${saleUsed.length ? '<span class="badge sale">特売</span>' : ""}
      ${r.seasons.includes(season) ? '<span class="badge season">旬</span>' : ""}
      ${overBudget ? '<span class="badge over">予算オーバー</span>' : ""}
      食材費 約${(r.cost * people).toLocaleString()}円 ／ 調理時間 約${escapeHtml(r.time)}分
    </p>
    <div class="reason-box">
      <h3>この献立をおすすめする理由</h3>
      <ul class="reasons-long">${reasonItems}</ul>
    </div>
    <div class="recipe-cols">
      <div>
        <h3>材料（${people}人分）</h3>
        <ul class="ingredients">${ingredients}</ul>
      </div>
      <div>
        <h3>作り方</h3>
        <ol class="steps">${steps}</ol>
      </div>
    </div>`;

  $("recipe").hidden = false;
  $("recipe").scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------------
// ボタンなどの操作をつなぐ
// ---------------------------------------------------------------------
// 画像を選んだら追加する（同じ画像をもう一度選べるよう、選択欄は空に戻す）
for (const id of ["imageInput", "cameraInput"]) {
  $(id).addEventListener("change", (e) => {
    addImages(e.target.files);
    e.target.value = "";
  });
}
$("ocrBtn").addEventListener("click", readFlyers);
$("saleList").addEventListener("change", updateSaleCount);
$("clearSale").addEventListener("click", () => {
  document.querySelectorAll('input[name="sale"]').forEach((c) => { c.checked = false; });
  updateSaleCount();
});

// 読み取り結果を確認しないまま提案しようとしたら、アプリ内で確認する
function requestSuggest() {
  if (ocrResult && !ocrResult.skipped) {
    $("pendingNotice").hidden = false;
    $("pendingNotice").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  $("pendingNotice").hidden = true;
  suggest();
}
$("applyAndSuggest").addEventListener("click", () => { applyOcrResult(); suggest(); });
$("suggestWithout").addEventListener("click", () => {
  // 今回の読み取り結果は反映せずに提案する（確認欄は残すので、あとから反映もできる）
  if (ocrResult) ocrResult.skipped = true;
  $("pendingNotice").hidden = true;
  suggest();
});
$("suggestBtn").addEventListener("click", requestSuggest);
// 「ほかの献立を見る」も、その時点の入力欄の条件を読み直して提案する
$("reshuffleBtn").addEventListener("click", requestSuggest);
$("backBtn").addEventListener("click", () => {
  $("recipe").hidden = true;
  $("results").scrollIntoView({ behavior: "smooth" });
});

showToday();
renderSaleList();
renderImages();
