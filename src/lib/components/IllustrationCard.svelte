<script lang="ts">
	import type { Illustration } from '$lib/images/triggers';
	let { illustration, onImageLoad }: { illustration: Illustration; onImageLoad?: () => void } = $props();
	const statusLabels = { pending: '장면을 담을 준비를 하고 있어요', checking: '장면을 담을 준비를 하고 있어요', prompting: '장면을 담고 있어요…', generating: '장면을 그리고 있어요…', completed: '장면 삽화', failed: '삽화를 완성하지 못했어요', skipped: '' };
</script>
<figure class="illustration" aria-label="장면 삽화 기록">
	{#if illustration.status === 'completed'}<img src={`/api/images/illustrations/${encodeURIComponent(illustration.id)}`} alt={`${illustration.reason} · 장면 삽화`} onload={onImageLoad} />{/if}
	<figcaption><span>{statusLabels[illustration.status]} · {illustration.tick}회 진행</span><details><summary>삽화 기록</summary><small>{illustration.reason}</small>{#if illustration.error}<p>{illustration.error}</p>{/if}</details></figcaption>
</figure>
<style>
	.illustration { margin: 18px 0; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
	img { display: block; width: 100%; max-height: 720px; object-fit: contain; background: var(--page); }
	figcaption { padding: 12px 14px; display: grid; gap: 6px; color: var(--muted); font-size: 12px; }
	small { color: var(--accent); } p { margin: 0; line-height: 1.7; overflow-wrap: anywhere; }
</style>
