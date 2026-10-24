import { createImageDirector } from '$lib/server/oev';
import { withInferenceRootContext } from '$lib/server/inference-log';
import { imageGameTime } from '$lib/images/triggers';
import { ImageGenerationError } from './common';
import { generateWithImageConfig, ImageGenerationBusy, withImageGeneration } from './generate';
import { acceptImageCheck, completeImageCheck, getImageCursor, imageCheckValid, pendingImageCheck, queueAutomaticImageChecks, recoverImageChecks, setImageCheckStatus, type ImageCheckJob } from './trigger-store';

let started = false;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** One process-wide image lane; illustration failures never fail the story turn. */
export async function processImageCheck(job: ImageCheckJob): Promise<void> {
	await withInferenceRootContext({ worldId: job.worldId, imageJobId: job.id, sceneId: job.input.scene.sceneId, tick: job.input.scene.tick }, () => withImageGeneration(async () => {
		try {
			if (!imageCheckValid(job)) { setImageCheckStatus(job.id, 'skipped'); return; }
			setImageCheckStatus(job.id, 'checking');
			const { scene, policy, config, models } = job.input;
			const cursor = getImageCursor(job.worldId);
			if (scene.revision <= cursor.revision) { setImageCheckStatus(job.id, 'skipped'); return; }
			const director = createImageDirector(models, AbortSignal.timeout(120000));
			const generate = await director.shouldGenerate({ imageGeneration: policy, gameTime: imageGameTime(scene), scene: scene.context, objectStates: scene.objectStates });
			if (!generate) { acceptImageCheck(job, null); return; }
			if (!imageCheckValid(job)) { setImageCheckStatus(job.id, 'skipped'); return; }
			setImageCheckStatus(job.id, 'prompting');
			const profile = { provider: config.provider, model: config.provider === 'comfyui' ? config.workflowId : config.model, stylePrompt: config.stylePrompt };
			const prompt = await director.writePrompt({ scene: scene.context, promptFormat: policy.promptFormat, promptInstructions: policy.promptInstructions, imageProfile: profile }, policy.promptFormat);
			if (!acceptImageCheck(job, prompt)) return;
			const result = await generateWithImageConfig(job.input.config, prompt);
			completeImageCheck(job.id, result.images[0].bytes, result.images[0].mediaType);
		} catch (error) {
			setImageCheckStatus(job.id, 'failed', undefined, error instanceof ImageGenerationError ? error.message : '삽화의 System One 판단·프롬프트 작성 또는 생성에 실패했습니다. 세션의 판단·생성 모델과 이미지 프리셋을 확인해 주세요. 자동 재시도하지 않습니다.');
		}
	}));
}

async function drain(): Promise<void> {
	if (running) return;
	running = true;
	try {
		let job;
		while ((job = pendingImageCheck())) {
			try { await processImageCheck(job); }
			catch (error) {
				if (error instanceof ImageGenerationBusy) {
					timer = setTimeout(() => { timer = undefined; ensureImageWorker(); }, 1000);
					return;
				}
				throw error;
			}
		}
	} finally { running = false; }
}
export function ensureImageWorker(): void {
	if (!started) { recoverImageChecks(); started = true; }
	queueAutomaticImageChecks();
	if (!running && !timer) void drain().catch(() => console.error('삽화 작업을 처리하지 못했습니다.'));
}
