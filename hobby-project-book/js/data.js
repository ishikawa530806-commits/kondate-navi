// アプリのデータ操作（プロジェクト・作業記録・写真・お題）。
// 画面側はここの関数だけを使い、IndexedDB を直接は触らない。
import { db, uid } from './db.js';

export const GENRES = [
  { id: 'diy', label: 'DIY', icon: '🔨' },
  { id: 'garden', label: 'ガーデニング', icon: '🌱' },
  { id: 'cooking', label: '料理', icon: '🍳' },
  { id: 'craft', label: '手芸・工作', icon: '🧵' },
  { id: 'tidy', label: '片付け・模様替え', icon: '🧺' },
  { id: 'other', label: 'その他', icon: '✨' },
];

export function genreOf(id) {
  return GENRES.find((g) => g.id === id) || GENRES[GENRES.length - 1];
}

export const STATUS = {
  planning: '計画中',
  active: '作業中',
  done: '完成',
};

const now = () => new Date().toISOString();

// ---------- プロジェクト ----------

export function newProject({ title, genre, weekends, ideaId = null }) {
  return {
    id: uid(),
    title,
    genre,
    weekends,
    status: 'planning',
    ideaId,
    plan: {
      materials: [], // { id, name, qty, price, done }
      tools: [], // { id, name, done }
      budget: null,
      steps: {}, // { 1: '1回目の週末にやること', ... }
      memo: '',
    },
    beforePhotoId: null,
    afterPhotoId: null,
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
  };
}

export async function listProjects() {
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const getProject = (id) => db.get('projects', id);

export function saveProject(p) {
  p.updatedAt = now();
  return db.put('projects', p);
}

export async function deleteProject(id) {
  const logs = await listLogs(id);
  for (const log of logs) await deleteLog(log);
  await db.delete('projects', id);
}

export function materialsTotal(p) {
  return p.plan.materials.reduce((sum, m) => sum + (Number(m.price) || 0), 0);
}

// ---------- 作業記録 ----------

export async function listLogs(projectId) {
  const logs = await db.getByIndex('logs', 'projectId', projectId);
  return logs.sort((a, b) => a.weekend - b.weekend || a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function newLog(projectId, weekend) {
  return { id: uid(), projectId, weekend, date: today(), memo: '', photoIds: [], createdAt: now() };
}

export async function saveLog(log) {
  await db.put('logs', log);
  const p = await getProject(log.projectId);
  if (p && p.status === 'planning') p.status = 'active';
  if (p) await saveProject(p);
}

export async function deleteLog(log) {
  for (const pid of log.photoIds) await deletePhoto(pid);
  await db.delete('logs', log.id);
}

// プロジェクトの全写真を作業順に（週末 → 記録 → 写真の順）
export async function projectPhotoIds(projectId) {
  const logs = await listLogs(projectId);
  return logs.flatMap((l) => l.photoIds);
}

// ---------- 写真 ----------

export async function addPhoto(blob) {
  const photo = { id: uid(), blob, type: blob.type, createdAt: now() };
  await db.put('photos', photo);
  return photo.id;
}

export function deletePhoto(id) {
  photoUrlCache.delete(id);
  return db.delete('photos', id);
}

const photoUrlCache = new Map();

// 写真の表示用 URL（同じ写真は使い回す）
export async function photoUrl(id) {
  if (!id) return null;
  if (photoUrlCache.has(id)) return photoUrlCache.get(id);
  const photo = await db.get('photos', id);
  if (!photo) return null;
  const url = URL.createObjectURL(photo.blob);
  photoUrlCache.set(id, url);
  return url;
}

// ---------- お題ストック ----------

export function newIdea({ title, genre, weekends, memo }) {
  return { id: uid(), title, genre, weekends, memo, projectId: null, createdAt: now() };
}

export async function listIdeas() {
  const all = await db.getAll('ideas');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const getIdea = (id) => db.get('ideas', id);
export const saveIdea = (idea) => db.put('ideas', idea);
export const deleteIdea = (id) => db.delete('ideas', id);

// お題からプロジェクトを始める
export async function startProjectFromIdea(idea, weekends = idea.weekends || 1) {
  const p = newProject({ title: idea.title, genre: idea.genre, weekends, ideaId: idea.id });
  if (idea.memo) p.plan.memo = idea.memo;
  await saveProject(p);
  idea.projectId = p.id;
  await saveIdea(idea);
  return p;
}

// ---------- 共通 ----------

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
