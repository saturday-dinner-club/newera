import { randomUUID } from 'node:crypto';
import type { ImagePresetConfig } from '$lib/images/presets';
import { imageGenerationPolicy, imageSceneSnapshot, imageTriggerCursor, type ImageSceneSnapshot, type ImageTriggerCursor, type Illustration } from '$lib/images/triggers';
import type { ImageGenerationPolicy, ModelSelection, World } from '$lib/theater/types';
import { getWorld, store, transaction } from '$lib/server/stage-store';
import { modelSettings } from '$lib/server/oev';
import { getImagePreset } from './presets';

type Row = Record<string, unknown>;
export interface ImageCheckInput {
	pipeline: 2; scene: ImageSceneSnapshot; policy: ImageGenerationPolicy;
	presetId: string; presetRevision: number; config: ImagePresetConfig; models: ModelSelection;
}
export interface ImageCheckJob { id: string; worldId: string; settingsRevision: number; input: ImageCheckInput }
export const maxIllustrations = 100;
const policyKey = (world: World) => JSON.stringify({ pipeline: 2, presetId: world.imagePresetId ?? null, policy: imageGenerationPolicy(world) });

/** Keep the legacy table as an internal cursor; its former session rule configuration is no longer read. */
function imageProgress(world: World): { revision: number; cursor: ImageTriggerCursor } {
	const row = store().prepare('SELECT * FROM theater_image_settings WHERE world_id = ?').get(world.id) as Row | undefined;
	const key = policyKey(world);
	if (row && row.config_json === key) {
		const saved = JSON.parse(String(row.cursor_json)) as ImageTriggerCursor;
		return { revision: Number(row.revision), cursor: { revision: saved.revision, tick: saved.tick, eventId: saved.eventId } };
	}
	const revision = Number(row?.revision ?? 0) + 1;
	const cursor = imageTriggerCursor(world);
	store().prepare('INSERT INTO theater_image_settings VALUES (?, ?, ?, ?) ON CONFLICT(world_id) DO UPDATE SET revision = excluded.revision, config_json = excluded.config_json, cursor_json = excluded.cursor_json')
		.run(world.id, revision, key, JSON.stringify(cursor));
	store().prepare("UPDATE theater_illustrations SET status = 'skipped' WHERE world_id = ? AND status IN ('pending', 'checking', 'prompting')").run(world.id);
	return { revision, cursor };
}
export function getImageCursor(worldId: string): ImageTriggerCursor { return imageProgress(getWorld(worldId)).cursor; }

/** Queue only new committed story progress. Conditions and prompt format come from the lorebook. */
export function queueImageCheck(worldId: string): string | null {
	return transaction(() => {
		const world = getWorld(worldId);
		const progress = imageProgress(world);
		const policy = imageGenerationPolicy(world);
		if (!world.imagePresetId || !policy.conditions.trim() || progress.cursor.revision >= world.revision) return null;
		if (store().prepare("SELECT id FROM theater_jobs WHERE world_id = ? AND status IN ('pending', 'running')").get(worldId)) return null;
		// Editor changes alone are not a new scene action.
		const scene = imageSceneSnapshot(world);
		if (scene.tick <= progress.cursor.tick && scene.eventId === progress.cursor.eventId) return null;
		const last = store().prepare("SELECT input_json FROM theater_illustrations WHERE world_id = ? AND json_extract(input_json, '$.pipeline') = 2 ORDER BY rowid DESC LIMIT 1").get(worldId) as Row | undefined;
		if (last) {
			const previous = (JSON.parse(String(last.input_json)) as ImageCheckInput).scene;
			if (scene.tick <= previous.tick && scene.eventId === previous.eventId) return null;
		}
		const sourceKey = `lore:${progress.revision}:revision:${world.revision}`;
		if (store().prepare('SELECT id FROM theater_illustrations WHERE world_id = ? AND source_key = ?').get(worldId, sourceKey)) return null;
		if (Number((store().prepare("SELECT COUNT(*) AS count FROM theater_illustrations WHERE world_id = ? AND status != 'skipped'").get(worldId) as Row).count) >= maxIllustrations) return null;
		const preset = getImagePreset(world.imagePresetId);
		let models = world.models ?? null;
		let admissionError: string | undefined;
		if (!models) {
			try { const defaults = modelSettings(); models = { decisionModel: defaults.decisionModel, textModel: defaults.textModel }; }
			catch { admissionError = '삽화 판단·프롬프트 생성을 위한 기본 모델 설정을 확인해 주세요.'; }
		}
		const input = { pipeline: 2, scene, policy, presetId: preset.id, presetRevision: preset.revision, config: preset.config, models };
		const id = randomUUID();
		store().prepare("INSERT INTO theater_illustrations (id, world_id, source_key, settings_revision, input_json, status, reason, created_at, error) VALUES (?, ?, ?, ?, ?, ?, '로어북 조건 판단', ?, ?)")
			.run(id, worldId, sourceKey, progress.revision, JSON.stringify(input), admissionError ? 'failed' : 'pending', new Date().toISOString(), admissionError ?? null);
		return id;
	});
}
export function queueAutomaticImageChecks(): void {
	for (const row of store().prepare('SELECT id FROM theater_worlds WHERE image_preset_id IS NOT NULL').all() as Row[]) queueImageCheck(String(row.id));
}
export function pendingImageCheck(): ImageCheckJob | null {
	const row = store().prepare("SELECT * FROM theater_illustrations WHERE status = 'pending' AND json_extract(input_json, '$.pipeline') = 2 ORDER BY created_at, rowid LIMIT 1").get() as Row | undefined;
	return row ? { id: String(row.id), worldId: String(row.world_id), settingsRevision: Number(row.settings_revision), input: JSON.parse(String(row.input_json)) } : null;
}
export function imageCheckValid(job: ImageCheckJob): boolean {
	const row = store().prepare('SELECT status FROM theater_illustrations WHERE id = ?').get(job.id) as Row | undefined;
	if (!row || !['pending', 'checking', 'prompting', 'generating'].includes(String(row.status)) || job.input.pipeline !== 2) return false;
	const world = getWorld(job.worldId);
	return world.imagePresetId === job.input.presetId && !!imageGenerationPolicy(world).conditions.trim() && JSON.stringify(imageGenerationPolicy(world)) === JSON.stringify(job.input.policy);
}
export function setImageCheckStatus(id: string, status: Illustration['status'], reason?: string, error?: string): void {
	store().prepare('UPDATE theater_illustrations SET status = ?, reason = COALESCE(?, reason), error = ? WHERE id = ?').run(status, reason ?? null, error?.slice(0, 500) ?? null, id);
}
export function acceptImageCheck(job: ImageCheckJob, prompt: string | null): boolean {
	return transaction(() => {
		if (!imageCheckValid(job)) { setImageCheckStatus(job.id, 'skipped'); return false; }
		const cursor = getImageCursor(job.worldId);
		if (job.input.scene.revision <= cursor.revision) { setImageCheckStatus(job.id, 'skipped'); return false; }
		const scene = job.input.scene;
		const next: ImageTriggerCursor = { revision: scene.revision, tick: scene.tick, eventId: scene.eventId };
		store().prepare('UPDATE theater_image_settings SET cursor_json = ? WHERE world_id = ? AND revision = ?').run(JSON.stringify(next), job.worldId, job.settingsRevision);
		setImageCheckStatus(job.id, prompt ? 'generating' : 'skipped', prompt ? '로어북 조건에 따른 삽화' : '');
		store().prepare("DELETE FROM theater_illustrations WHERE world_id = ? AND status = 'skipped' AND id != ?").run(job.worldId, job.id);
		return prompt !== null;
	});
}
export function completeImageCheck(id: string, bytes: Uint8Array, mediaType: string): void {
	store().prepare("UPDATE theater_illustrations SET status = 'completed', bytes = ?, media_type = ? WHERE id = ? AND status = 'generating'").run(bytes, mediaType, id);
}
export function listIllustrations(worldId: string): Illustration[] {
	getWorld(worldId);
	return (store().prepare("SELECT id, input_json, status, reason, error, created_at FROM theater_illustrations WHERE world_id = ? AND status != 'skipped' ORDER BY created_at, rowid").all(worldId) as Row[]).map((row) => {
		const { scene } = JSON.parse(String(row.input_json)) as ImageCheckInput;
		return { id: String(row.id), worldId, eventId: scene.eventId, tick: scene.tick, sceneId: scene.sceneId, status: row.status as Illustration['status'], reason: String(row.reason), error: row.error ? String(row.error) : null, createdAt: String(row.created_at) };
	});
}
export function clearIllustrations(worldId: string): void {
	transaction(() => {
		const world = getWorld(worldId);
		store().prepare('DELETE FROM theater_illustrations WHERE world_id = ?').run(worldId);
		imageProgress(world);
		store().prepare('UPDATE theater_image_settings SET cursor_json = ? WHERE world_id = ?').run(JSON.stringify(imageTriggerCursor(world)), worldId);
	});
}
export function recoverImageChecks(): void {
	store().prepare("UPDATE theater_illustrations SET status = 'failed', error = '서버가 재시작되어 완료 여부를 확인할 수 없습니다. 자동 재시도하지 않습니다.' WHERE status IN ('checking', 'prompting', 'generating')").run();
	// Old session-rule jobs must not execute under the new lorebook/System One contract.
	store().prepare("UPDATE theater_illustrations SET status = 'skipped' WHERE status = 'pending' AND COALESCE(json_extract(input_json, '$.pipeline'), 0) != 2").run();
}
