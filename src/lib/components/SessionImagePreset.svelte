<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { World } from '$lib/theater/types';
	import { imageProviderNames, type ImagePresetSummary } from '$lib/images/presets';
	let { world, presets, count }: { world: World; presets: ImagePresetSummary[]; count: number } = $props();
	let selected = $state('');
	let saving = $state(false);
	let notice = $state('');
	let error = $state('');
	const selectionKey = $derived(JSON.stringify([world.id, world.imagePresetId ?? null]));
	$effect(() => { const [, id] = JSON.parse(selectionKey); selected = id ?? ''; });
	const save: SubmitFunction = () => {
		saving = true; notice = ''; error = '';
		return async ({ update, result }) => {
			try { await update({ reset: false }); if (result.type === 'success') notice = '이 세션의 이미지 프리셋을 적용했습니다.'; else if (result.type === 'failure') error = String(result.data?.message ?? '이미지 프리셋을 적용하지 못했습니다.'); }
			finally { saving = false; }
		};
	};
	async function clearImages() {
		if (saving) return; saving = true; notice = ''; error = '';
		try {
			const response = await fetch('/api/images/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ worldId: world.id, operation: 'clear' }) });
			if (!response.ok) throw new Error((await response.json()).message);
			await invalidateAll(); notice = '삽화 기록을 비웠습니다.';
		} catch (cause) { error = cause instanceof Error ? cause.message : '삽화 기록을 비우지 못했습니다.'; }
		finally { saving = false; }
	}
</script>
<section class="image-model" aria-label="이미지 생성 모델">
	<form method="POST" action="?/imagePreset" use:enhance={save} class="settings-form">
		<input type="hidden" name="worldId" value={world.id} />
		<label>이미지 생성 프리셋<select name="imagePresetId" bind:value={selected} disabled={saving}><option value="">이미지 사용 안 함</option>{#each presets as preset}<option value={preset.id}>{preset.name} · {imageProviderNames[preset.provider]}</option>{/each}</select></label>
		<div class="button-row"><button disabled={saving}>이미지 프리셋 적용</button><a href="/images">이미지 프리셋 관리 ↗</a></div>
	</form>
	<p class="field-hint">생성 조건과 태그·자연어 프롬프트 지침은 <a href="/lores?tab=world">로어북의 세계관 설정</a>에 작성하세요. 판단 모델이 System One으로 생성 여부를 결정하고, 생성 모델이 이미지 프롬프트를 작성합니다.</p>
	{#if count}<button type="button" onclick={clearImages} disabled={saving}>삽화 기록 비우기 ({count}/100)</button>{/if}
	{#if notice}<p class="feedback" role="status">{notice}</p>{/if}{#if error}<p class="feedback error" role="alert">{error}</p>{/if}
</section>
<style>.image-model { border-top: 1px solid var(--line); margin: 20px 0; padding-top: 8px; } .button-row { align-items: center; flex-wrap: wrap; } a { font-size: 12px; }</style>
