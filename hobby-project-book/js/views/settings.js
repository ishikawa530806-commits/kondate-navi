// 設定：バックアップ（書き出し・読み込み）と保存状況
import { exportBackup, importBackup, backupFileName, saveFile } from '../backup.js';
import { db, requestPersistence } from '../db.js';
import { esc, toast, confirmDialog, openModal } from '../ui.js';

export const APP_VERSION = '1.0.0';

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function lastBackupText() {
  const m = await db.get('meta', 'lastBackupAt');
  return m ? new Date(m.value).toLocaleString('ja-JP') : 'まだありません';
}

export default {
  async render(root, params, query, ctx) {
    ctx.setTitle('設定');
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();

    root.innerHTML = `
      <section class="card">
        <h3 class="card-title">💾 バックアップ</h3>
        <p class="small">データと写真はこのスマホのブラウザの中だけに保存されています。機種変更やもしもの時のために、ときどきファイルに書き出しておきましょう。</p>
        <p class="muted small">前回の書き出し：${esc(await lastBackupText())}</p>
        <button class="btn btn-primary btn-block" id="export">ファイルに書き出す</button>
        <label class="btn btn-block file-btn">ファイルから読み込む
          <input type="file" accept="application/json,.json" hidden id="import"></label>
      </section>

      <section class="card">
        <h3 class="card-title">📦 保存状況</h3>
        <ul class="kv">
          ${est ? `<li><span>使用量</span><span>${mb(est.usage || 0)}${est.quota ? ` / ${mb(est.quota)}` : ''}</span></li>` : ''}
          <li><span>自動削除からの保護</span><span>${persisted ? '✅ 有効' : '⚠️ 未設定'}</span></li>
        </ul>
        ${persisted ? '' : `<p class="muted small">ホーム画面に追加して使うと、保護されやすくなります。</p>
          <button class="btn btn-small" id="persist">保護をお願いする</button>`}
      </section>

      <section class="card">
        <h3 class="card-title">ℹ️ このアプリについて</h3>
        <p class="small">プロジェクト帳 v${APP_VERSION}<br>アカウント登録なし・サーバーなしで動きます。アプリを更新してもデータは消えません。</p>
      </section>
    `;

    root.querySelector('#export').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '準備中…';
      try {
        if (await saveFile(await exportBackup(), backupFileName())) {
          await db.put('meta', { key: 'lastBackupAt', value: new Date().toISOString() });
        }
        ctx.refresh();
      } catch (err) {
        toast(`書き出せませんでした：${err.message}`);
        btn.disabled = false;
        btn.textContent = 'ファイルに書き出す';
      }
    });

    root.querySelector('#import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const mode = await chooseImportMode();
      if (!mode) return;
      if (mode === 'replace' && !(await confirmDialog('今のデータをすべて消して、ファイルの内容に置き換えます。よろしいですか？', { ok: '置き換える', danger: true }))) return;
      try {
        const r = await importBackup(file, mode);
        toast(`読み込みました（プロジェクト${r.projects}件・お題${r.ideas}件・写真${r.photos}枚）`);
        ctx.go('#/');
      } catch (err) {
        toast(err.message);
      }
    });

    root.querySelector('#persist')?.addEventListener('click', async () => {
      toast((await requestPersistence()) ? '保護が有効になりました' : 'ブラウザに許可されませんでした');
      ctx.refresh();
    });
  },
};

function chooseImportMode() {
  return new Promise((resolve) => {
    let chosen = null;
    const { el, close } = openModal(`
      <h3 class="modal-title">読み込み方法</h3>
      <div class="btn-row stack">
        <button class="btn btn-primary btn-block" data-mode="merge">今のデータに追加する<br><small>同じデータは新しい内容で上書き</small></button>
        <button class="btn btn-danger-outline btn-block" data-mode="replace">今のデータと置き換える</button>
        <button class="btn btn-block" data-close>キャンセル</button>
      </div>`, { onClose: () => resolve(chosen) });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) { chosen = b.dataset.mode; close(); }
    });
  });
}
