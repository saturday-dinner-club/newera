<script lang="ts">
	import { onMount, tick } from 'svelte';
	import AppearanceControl from '$lib/components/AppearanceControl.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { actorName, residents, templateFor, interactionsFor } from '$lib/theater/runtime';
	import { eventParts } from '$lib/theater/event-content';
	import { transcriptGroups } from '$lib/theater/transcript';
	import { bodyParts } from '$lib/theater/expression-parts';
	import { eventPresentations } from '$lib/theater/presentation';
	import { inactivityLabels, relationshipMetrics } from '$lib/theater/types';
	import { relationshipLabels } from '$lib/theater/reflection';
	import { memoryForEvent } from '$lib/theater/memory';
	import type { ModelSelection } from '$lib/theater/types';
	import type { PageProps } from './$types';
	import CharacterIntroduction from '$lib/components/CharacterIntroduction.svelte';
	import ProviderManager from '$lib/components/ProviderManager.svelte';
	import SessionImagePreset from '$lib/components/SessionImagePreset.svelte';
	import IllustrationCard from '$lib/components/IllustrationCard.svelte';
	import type { ModelOption } from '$lib/providers/types';
	let { data, form }: PageProps = $props();
	let submitting = $state(false);
	let targetId = $state('');
	let modelsDialog = $state<HTMLDialogElement>();
	let resetDialog = $state<HTMLDialogElement>();
	let resetError = $state('');
	let historyElement = $state<HTMLDivElement>();
	let objectsOpen = $state(true);
	let catalogOpen = $state(false);
	let actionsOpen = $state(false);
	let menuOpen = $state(false);
	let narrowLayout = $state(false);
	let hasNewEvents = $state(false);
	let followingHistory = true;
	let showEventDetails = $state(false);
	let scrollContext = '';
	let scrollVersion = 0;
	let observedOutput = '';
	let world = $derived(data.world);
	let scene = $derived(world.definition.scenes.find((entry) => entry.id === world.state.activeSceneId)!);
	let present = $derived(residents(world));
	let characters = $derived(present.filter((instance) => templateFor(world, instance).kind === 'character'));
	let objects = $derived(present.filter((instance) => templateFor(world, instance).kind === 'object'));
	let companions = $derived(world.state.instances.filter((instance) => instance.active && instance.companion));
	let generating = $derived(data.generation?.status === 'pending' || data.generation?.status === 'running');
	let playerReplyUntil = $derived(generating ? data.generation?.progress?.playerReplyUntil : undefined);
	let replyClock = $state(Date.now());
	let replySeconds = $derived(Math.max(0, Math.ceil(((playerReplyUntil ?? replyClock) - replyClock) / 1000)));
	$effect(() => {
		if (playerReplyUntil === undefined) return;
		replyClock = Date.now();
		const timer = setInterval(() => { replyClock = Date.now(); }, 250);
		return () => clearInterval(timer);
	});
	let busy = $derived(submitting || generating);
	let events = $derived(world.state.events.slice(-100));
	let transcript = $derived(transcriptGroups(events));
	let eventsById = $derived(new Map(world.state.events.map((event) => [event.id, event])));
	let presentations = $derived(eventPresentations(world));
	let illustrationRevision = $derived(JSON.stringify(data.illustrations.map((entry) => [entry.id, entry.status])));
	let historyRevision = $derived(JSON.stringify([world.id, world.revision, data.generation?.status, form?.message, illustrationRevision]));
	let illustrationsByEvent = $derived(new Map(events.map((event) => [event.id, data.illustrations.filter((entry) => entry.eventId === event.id)])));
	let otherIllustrations = $derived(data.illustrations.filter((entry) => !entry.eventId || !illustrationsByEvent.has(entry.eventId)));
	function nearHistoryEnd(element: HTMLDivElement): boolean {
		const range = element.scrollHeight - element.clientHeight;
		return range <= 0 || element.scrollTop >= range * 0.98;
	}
	function followIllustration() {
		if (historyElement && followingHistory) historyElement.scrollTop = historyElement.scrollHeight;
	}
	$effect.pre(() => {
		historyRevision;
		const element = historyElement;
		if (!element) return;
		// Measure before new output grows the scroll range; measuring afterward would disable following.
		const follow = scrollContext !== world.id || nearHistoryEnd(element);
		const previousTop = element.scrollTop;
		const output = JSON.stringify([events.map(event => event.id), data.illustrations.filter(entry => entry.status === 'completed').map(entry => entry.id)]);
		if (!follow && output !== observedOutput) hasNewEvents = true;
		observedOutput = output;
		const version = ++scrollVersion;
		scrollContext = world.id;
		void tick().then(() => {
			if (version !== scrollVersion || historyElement !== element) return;
			element.scrollTop = follow ? element.scrollHeight : previousTop;
			followingHistory = nearHistoryEnd(element);
			if (followingHistory) hasNewEvents = false;
		});
	});
	onMount(() => {
		const narrow = window.matchMedia('(max-width: 900px)');
		const resizeObjects = () => { narrowLayout = narrow.matches; objectsOpen = !narrow.matches; catalogOpen = false; };
		resizeObjects();
		narrow.addEventListener('change', resizeObjects);
		const element = historyElement!;
		const resizeHistory = new ResizeObserver(() => {
			if (followingHistory) element.scrollTop = element.scrollHeight;
		});
		resizeHistory.observe(element);
		return () => { narrow.removeEventListener('change', resizeObjects); resizeHistory.disconnect(); };
	});
	$effect(() => {
		if (!narrowLayout || (!catalogOpen && !objectsOpen)) return;
		const active = document.activeElement as HTMLElement | null;
		const drawer = document.querySelector<HTMLElement>(catalogOpen ? '.catalog' : '.objects-panel');
		const reader = document.querySelector<HTMLElement>('.stage-reader');
		const header = document.querySelector<HTMLElement>('.topbar');
		if (!drawer) return;
		if (reader) reader.inert = true;
		if (header) header.inert = true;
		const focusables = () => Array.from(drawer.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not([type=hidden]), select, textarea, summary')).filter(node => node.getClientRects().length > 0);
		void tick().then(() => focusables()[0]?.focus());
		const keys = (event: KeyboardEvent) => {
			if (event.key === 'Escape') { catalogOpen = false; objectsOpen = false; }
			if (event.key === 'Tab') { const items = focusables(); const first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
		};
		document.addEventListener('keydown', keys);
		return () => { if (reader) reader.inert = false; if (header) header.inert = false; document.removeEventListener('keydown', keys); if (active?.isConnected) active.focus(); };
	});
	let modelCatalog = $state<{ models: string[]; defaults: ModelSelection; options: ModelOption[]; errors: string[] } | null>(null);
	let providerManagerOpen = $state(false);
	const modelLabel = (value: string) => { const option = modelCatalog?.options.find((entry) => entry.value === value); return option ? `${option.providerLabel} / ${option.label}` : value; };
	let modelsLoading = $state(false);
	let modelsSaving = $state(false);
	let modelsError = $state('');
	let decisionModel = $state('');
	let textModel = $state('');
	let modelContext = $derived(JSON.stringify([world.id, world.models?.decisionModel ?? null, world.models?.textModel ?? null]));
	$effect(() => {
		const [, savedDecision, savedText] = JSON.parse(modelContext) as [string, string | null, string | null];
		decisionModel = savedDecision ?? modelCatalog?.defaults.decisionModel ?? '';
		textModel = savedText ?? modelCatalog?.defaults.textModel ?? '';
	});
	async function loadModels() {
		if (modelsLoading) return;
		modelsLoading = true;
		modelsError = '';
		try {
			const response = await fetch('/api/models', { cache: 'no-store' });
			const catalog = await response.json();
			if (!response.ok) throw new Error(catalog.message || '모델 목록을 불러오지 못했습니다.');
			modelCatalog = catalog;
		} catch (error) { modelsError = error instanceof Error ? error.message : '모델 목록을 불러오지 못했습니다.'; }
		finally { modelsLoading = false; }
	}
	const submitModels: SubmitFunction = () => {
		modelsSaving = true;
		return async ({ update, result }) => {
			try {
				await update({ reset: false });
				if (result.type === 'success') {
					const saved = result.data?.models as ModelSelection | null;
					decisionModel = saved?.decisionModel ?? modelCatalog?.defaults.decisionModel ?? '';
					textModel = saved?.textModel ?? modelCatalog?.defaults.textModel ?? '';
				}
			} finally { modelsSaving = false; }
		};
	};
	const submitTurn: SubmitFunction = () => {
		submitting = true;
		return async ({ update }) => { try { await update(); } finally { submitting = false; } };
	};
	const submitRetry: SubmitFunction = () => {
		submitting = true;
		return async ({ update }) => { try { await update({ reset: false }); } finally { submitting = false; } };
	};
	const submitReset: SubmitFunction = () => {
		submitting = true;
		resetError = '';
		return async ({ update, result }) => {
			try {
				await update();
				if (result.type === 'success') resetDialog?.close();
				else if (result.type === 'failure') resetError = String(result.data?.message ?? '초기화하지 못했습니다.');
			} finally { submitting = false; }
		};
	};
	$effect(() => {
		if (targetId && !characters.some((instance) => instance.id === targetId)) targetId = '';
	});
	$effect(() => {
		const generation = data.generation;
		const revision = data.world.revision;
		if (!generation || !['pending', 'running'].includes(generation.status)) return;
		const controller = new AbortController();
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			try {
				const response = await fetch(`/api/generation?id=${encodeURIComponent(generation!.id)}`, { signal: controller.signal, cache: 'no-store' });
				if (!response.ok) throw new Error('생성 상태를 확인하지 못했습니다.');
				const result = await response.json();
				if (!result.generation || result.generation.revision > revision || !['pending', 'running'].includes(result.generation.status)) {
					if (!stopped) await invalidateAll();
					return;
				}
			} catch { if (stopped) return; }
			if (!stopped) timer = setTimeout(poll, 250);
		}
		timer = setTimeout(poll, 300);
		return () => { stopped = true; controller.abort(); clearTimeout(timer); };
	});
	const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
	$effect(() => {
		const current = illustrationRevision;
		const worldId = world.id;
		if (!data.illustrations.some((entry) => ['pending', 'checking', 'prompting', 'generating'].includes(entry.status))) return;
		const controller = new AbortController();
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		async function pollImages() {
			try {
				const response = await fetch(`/api/images/session?worldId=${encodeURIComponent(worldId)}`, { signal: controller.signal, cache: 'no-store' });
				if (response.ok) {
					const result = await response.json();
					if (JSON.stringify(result.illustrations.map((entry: { id: string; status: string }) => [entry.id, entry.status])) !== current) { if (!stopped) await invalidateAll(); return; }
				}
			} catch { if (stopped) return; }
			if (!stopped) timer = setTimeout(pollImages, 1000);
		}
		timer = setTimeout(pollImages, 700);
		return () => { stopped = true; controller.abort(); clearTimeout(timer); };
	});
</script>

<svelte:head><title>{world.definition.name} · newera</title><meta name="description" content="씬과 인물의 선택으로 이어지는 이야기" /></svelte:head>
<div class="play-shell">
<header class="topbar">
 <a class="brand" href="/">newera<span>THEATER</span></a>
 <nav class="session-actions" aria-label="세션 관리">
  <a class="top-link desktop-link" href="/lores">작업실</a><a class="top-link desktop-link" href="/images">삽화</a>
  <AppearanceControl />
  <details class="session-menu" bind:open={menuOpen}><summary>메뉴</summary><div class="menu-popover">
   <button type="button" onclick={() => { menuOpen = false; catalogOpen = true; }}>세계관 · 저장 슬롯</button>
   <button type="button" onclick={() => { menuOpen = false; modelsDialog?.showModal(); if (!modelCatalog) void loadModels(); }}>모델과 삽화 설정</button>
   <a href="/lores">이야기 작업실</a><a href="/images">삽화 프리셋</a>
   <a href={`/session/export?worldId=${encodeURIComponent(world.id)}`}>공연 기록 내려받기</a>
   <button type="button" onclick={() => { menuOpen = false; resetError = ''; resetDialog?.showModal(); }}>처음부터 다시</button>
  </div></details>
 </nav>
</header>
<dialog class="session-dialog" aria-labelledby="models-dialog-title" bind:this={modelsDialog}>
 <form method="dialog" class="dialog-close"><button aria-label="모델 설정 닫기">닫기</button></form>
		<div class="model-settings">
			<h2 id="models-dialog-title">이 세션의 모델 설정</h2>
			<small>반응: {modelLabel(world.models?.decisionModel ?? modelCatalog?.defaults.decisionModel ?? '기본 설정')} · 문장: {modelLabel(world.models?.textModel ?? modelCatalog?.defaults.textModel ?? '기본 설정')}</small>
			<p>현재 세계관의 다음 새 진행 또는 이어서 재시도부터 적용됩니다. 진행 중인 작업은 시작할 때 선택한 모델을 유지합니다.</p>
			<form method="POST" action="?/models" use:enhance={submitModels} class="model-form">
				<input type="hidden" name="worldId" value={world.id} />
				<label>반응 모델<select name="decisionModel" bind:value={decisionModel} disabled={modelsLoading || modelsSaving || !modelCatalog} required>
					<option value="">{modelsLoading ? '목록을 불러오는 중…' : '모델을 선택하세요'}</option>
					{#if decisionModel && !modelCatalog?.models.includes(decisionModel)}<option value={decisionModel} disabled>{decisionModel} (목록에 없음)</option>{/if}
					{#each modelCatalog?.options.filter((entry) => entry.decision) ?? [] as option}<option value={option.value}>{option.providerLabel} / {option.label}</option>{/each}
				</select></label>
				<label>문장 모델<select name="textModel" bind:value={textModel} disabled={modelsLoading || modelsSaving || !modelCatalog} required>
					<option value="">{modelsLoading ? '목록을 불러오는 중…' : '모델을 선택하세요'}</option>
					{#if textModel && !modelCatalog?.models.includes(textModel)}<option value={textModel} disabled>{textModel} (목록에 없음)</option>{/if}
					{#each modelCatalog?.options ?? [] as option}<option value={option.value}>{option.providerLabel} / {option.label}</option>{/each}
				</select></label>
				<div class="model-buttons"><button disabled={modelsLoading || modelsSaving || !modelCatalog?.options.some((entry) => entry.value === decisionModel && entry.decision) || !modelCatalog?.models.includes(textModel)}>모델 적용</button><button name="mode" value="defaults" formnovalidate disabled={modelsSaving}>기본 설정 사용</button><button type="button" onclick={loadModels} disabled={modelsLoading || modelsSaving}>목록 새로고침</button></div>
			</form>
			{#if modelsError}<p class="feedback error" role="alert">{modelsError}</p>{/if}
			{#each modelCatalog?.errors ?? [] as message}<p class="feedback error">{message}</p>{/each}
			{#key world.id}<SessionImagePreset {world} presets={data.imagePresets} count={data.illustrations.length} />{/key}
			<button type="button" class="provider-toggle" onclick={() => { providerManagerOpen = !providerManagerOpen; }}>{providerManagerOpen ? 'Provider 관리 접기' : 'Provider 관리'}</button>
			{#if providerManagerOpen}<ProviderManager onsaved={loadModels} />{/if}
		</div>
</dialog>
<dialog class="session-dialog" aria-labelledby="reset-dialog-title" bind:this={resetDialog}>
 <form method="dialog" class="dialog-close"><button aria-label="초기화 창 닫기">닫기</button></form>
 <h2 id="reset-dialog-title">처음부터 다시</h2>
 <p>현재 세계관의 진행·대화·기억·삽화 기록을 지우고 초기 배치로 돌아갑니다. 저장 슬롯과 모델·이미지 설정은 유지됩니다.</p>
 <a class="session-export" href={`/session/export?worldId=${encodeURIComponent(world.id)}`}>초기화 전에 공연 기록 내려받기</a>
 {#if generating}<p>이야기가 이어지는 동안에는 먼저 「잠시 멈추기」를 눌러 주세요.</p>{/if}
 <form method="POST" action="?/reset" use:enhance={submitReset} class="reset-form">
  <input type="hidden" name="worldId" value={world.id} />
  <input type="hidden" name="revision" value={world.revision} />
  <button class="danger-button" disabled={busy}>현재 진행 초기화</button>
 </form>
 {#if resetError}<p class="feedback error" role="alert">{resetError}</p>{/if}
</dialog>
{#if catalogOpen || objectsOpen}<button class="drawer-backdrop" aria-label="주변 창 닫기" onclick={() => { catalogOpen = false; objectsOpen = false; }}></button>{/if}
<div class="theater-layout">
	<aside class="catalog" class:drawer-open={catalogOpen} aria-label="세계관과 저장 슬롯"><button class="drawer-close" onclick={() => { catalogOpen = false; }}>세계관 닫기</button>
		<p class="eyebrow">세계관</p>
		{#each data.worlds as entry}
			<form method="POST" action="?/selectWorld" use:enhance>
				<input type="hidden" name="worldId" value={entry.id} />
				<button class:current={entry.id === world.id} class="world-link" disabled={entry.id === world.id}>{entry.name}</button>
			</form>
		{/each}
		<div class="sidebar-section"><p class="eyebrow">동행</p>
			{#each companions as instance}<p class="companion-name">{instance.name}<small>함께 이동하는 동행</small></p>{:else}<p class="muted">아직 동행이 없습니다.</p>{/each}
		</div>
		<div class="sidebar-section"><p class="eyebrow">저장 슬롯</p>
			{#each [1, 2, 3] as slot}
				{@const save = data.saves.find((entry) => entry.slot === slot)}
				<div class="save-slot"><span>{slot} · {save ? `${save.tick}회 진행` : '비어 있음'}</span><div class="button-row">
					<form method="POST" action="?/save" use:enhance><input type="hidden" name="worldId" value={world.id} /><button name="slot" value={slot}>저장</button></form>
					<form method="POST" action="?/load" use:enhance><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><button name="slot" value={slot} disabled={!save || submitting}>불러오기</button></form>
				</div></div>
			{/each}
		</div>
	</aside>
	<main class="stage-reader">
		<div class="scene-heading"><div><p class="eyebrow">SCENE / {world.state.tick}</p><h1>{scene.name}</h1></div><div class="scene-heading-meta"><span>{world.state.day}일차 · {clock(world.state.minute)}</span><button class="context-trigger" type="button" onclick={() => { objectsOpen = !objectsOpen; }}>주변 <span>{objects.length}</span></button></div></div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable history region needs keyboard focus for PageUp and PageDown.) -->
		<div class="history-scroll" role="region" aria-label="대화 기록" tabindex="0" bind:this={historyElement} onscroll={() => { if (historyElement) { followingHistory = nearHistoryEnd(historyElement); if (followingHistory) hasNewEvents = false; } }}>
		<p class="scene-description">{scene.description}</p>
		<div class="cast-strip" aria-label="현재 씬의 등장인물">
			{#each characters as instance}<span class:companion={instance.companion}>{instance.name}{instance.companion ? ' · 동행' : ''}</span>{:else}<span>지금 이곳에는 나 혼자 있다.</span>{/each}
		</div>

		<div class="scene-tools">
		<label class="event-details-toggle"><input type="checkbox" bind:checked={showEventDetails} />기록 정보 표시</label>
		<details class="world-notes"><summary>세계관과 현재 인물의 기억</summary><p>{world.definition.description}</p><p>{world.definition.rules}</p>
			{#each characters as instance}<h3>{instance.name}</h3>
				{#if instance.inactivity}<p>최근 비참여 선택: {inactivityLabels[instance.inactivity.mode]} · 판단 {instance.inactivity.model}</p>{/if}
				<details class="relationship-notes"><summary>상대별 관계 · 이 인물의 개인적 인식</summary>
					{#each Object.entries(instance.relationships ?? {}) as [id, relation]}
						<article><h4>{actorName(world, id)}</h4><dl>{#each relationshipMetrics as metric}<div><dt>{relationshipLabels[metric]}</dt><dd>{relation[metric] ?? '미평가'}</dd></div>{/each}</dl>
						<p>{relation.impression || '아직 정리한 인식이 없습니다.'}</p>
						{#if relation.evidenceEventIds.length}<details><summary>인식의 근거 {relation.evidenceEventIds.length}건</summary><ul>{#each relation.evidenceEventIds as eventId}{@const source = eventsById.get(eventId)}<li>{#if source}{actorName(world, source.actorId)} · {source.text}{:else}{eventId}{/if}</li>{/each}</ul></details>{:else}<small>초기 설정 또는 편집한 관계</small>{/if}</article>
					{:else}<p>아직 평가한 상대가 없습니다. 미평가는 중간 점수와 다릅니다.</p>{/each}
				</details>
				{#if instance.memo}<p>메모: {instance.memo.summary}</p><p>현재 의도: {instance.memo.currentIntention}</p><p>감정: {instance.memo.feelings.join(', ') || '없음'}</p><p>미해결 문제: {instance.memo.openThreads.join(', ') || '없음'}</p>{/if}
				<ul>{#each instance.memories.slice(-8) as memory}
					{@const event = eventsById.get(memory.eventId)}
					{@const witnessed = event ? memoryForEvent(event) : 'body' in memory ? memory : null}
					<li>{#if witnessed}
						<strong>{witnessed.actorId === 'player' ? '플레이어' : actorName(world, witnessed.actorId)}</strong>{#if witnessed.targetId} → {actorName(world, witnessed.targetId)}{/if}
						{#each bodyParts(witnessed.body) as part}<p>{part.kind === 'act' ? '행동' : '대사'}: {part.text}</p>{/each}
					{:else if 'text' in memory}이전 기록 (주체 미확인): {memory.text}{/if}</li>
				{:else}<li>아직 기억한 사건이 없습니다.</li>{/each}</ul>
			{/each}
		</details>

		</div>
		<div class="event-thread" aria-live="polite">
			{#each transcript as group (group.id)}
				{@const first = group.firstEvent}
				{@const eventScene = world.definition.scenes.find((entry) => entry.id === group.sceneId)}
				{#if first}
					{#if group.startsScene}<h2 class="transcript-scene">{eventScene?.name ?? '무대'}</h2>{/if}
					<article class="stage-event" class:player={first.actorId === 'player'} class:dialogue={group.entries.some(entry => entry.visible && entry.event.kind === 'speak')}>
						<div class="event-byline"><strong>{actorName(world, first.actorId)}</strong>{#if first.targetId}<span>{actorName(world, first.targetId)}에게</span>{/if}</div>
						{#each group.entries as entry (entry.event.id)}
							{@const event = entry.event}
							{#if entry.visible}
								{@const presentation = presentations.get(event.id)}
								{#if entry.targetChanged}<div class="event-recipient">{event.targetId ? `${actorName(world, event.targetId)}에게` : '모두에게'}</div>{/if}
								{#if presentation}<CharacterIntroduction {presentation} characterId={event.actorId} />{/if}
								{#each eventParts(event) as part}
									{#if part.kind === 'act'}<p class="event-action">{part.text}</p>{:else}<p class="event-speech"><q>{part.text}</q></p>{/if}
								{/each}
								{#if showEventDetails}
									<div class="event-metadata">
										<small>{eventScene?.name} · {event.tick}회</small>
										{#if event.changes && Object.keys(event.changes).length}<small class="state-change">{Object.entries(event.changes).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small>{/if}
										{#if event.decision}<details class="decision-detail"><summary>선택 기록</summary><small>{event.decision.acted === undefined ? '이전 판단' : event.decision.acted ? '행동한다' : '지켜본다'} · {event.decision.choice} · 판단 {event.decision.model}{#if event.decision.generationModel} · 생성 {event.decision.generationModel}{/if}</small></details>{/if}
									</div>
								{/if}
							{/if}
							{#each illustrationsByEvent.get(event.id) ?? [] as illustration (illustration.id)}<IllustrationCard {illustration} onImageLoad={followIllustration} />{/each}
						{/each}
					</article>
				{:else}
					{#each group.entries as entry (entry.event.id)}
						{#each illustrationsByEvent.get(entry.event.id) ?? [] as illustration (illustration.id)}<IllustrationCard {illustration} onImageLoad={followIllustration} />{/each}
					{/each}
				{/if}
			{:else}<div class="empty-stage"><p>아직 아무도 말을 꺼내지 않았다.</p><span>말을 걸거나, 주변 사물을 살피거나, 잠시 기다려 보세요.</span></div>{/each}
			{#each otherIllustrations as illustration (illustration.id)}<IllustrationCard {illustration} onImageLoad={followIllustration} />{/each}
		</div>

		</div>
		<section class="player-console" aria-label="나의 차례">
			{#if hasNewEvents}<button class="latest-story" type="button" onclick={() => { if (historyElement) historyElement.scrollTop = historyElement.scrollHeight; hasNewEvents = false; }}>새 이야기 ↓</button>{/if}
			<div class="turn-status" class:reply-waiting={playerReplyUntil !== undefined}>
				<p role="status">{#if playerReplyUntil !== undefined}당신의 이야기를 기다려요{:else if generating}이야기가 이어지고 있어요{:else if data.generation?.stopReason === 'user'}이야기를 잠시 멈췄어요{:else if data.generation?.status === 'failed'}잠시 이야기를 이어가지 못했어요{:else}다음 이야기를 들려주세요{/if}</p>
				{#if playerReplyUntil !== undefined}<time aria-label={`답변까지 ${replySeconds}초 남음`}>{clock(replySeconds)}</time><form method="POST" action="?/continue" use:enhance={submitRetry}><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="jobId" value={data.generation!.id} /><input type="hidden" name="until" value={playerReplyUntil} /><input type="hidden" name="eventId" value={data.generation?.progress?.playerReplyEventId ?? ''} /><button disabled={submitting}>지금 이어가기</button></form>
				{:else if generating}<form method="POST" action="?/stop" use:enhance={submitRetry}><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="jobId" value={data.generation!.id} /><button disabled={submitting}>잠시 멈추기</button></form>
				{:else if data.generation?.status === 'failed' && data.generation.revision === world.revision}<form method="POST" action="?/retry" use:enhance={submitRetry}><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><input type="hidden" name="jobId" value={data.generation.id} /><button disabled={busy}>{data.generation.stopReason === 'user' ? '이어서 진행' : '다시 이어가기'}</button></form>{/if}
			</div>
			{#if data.generation?.status === 'failed' && data.generation.stopReason !== 'user'}<details class="problem-details"><summary>지금까지의 이야기는 간직하고 있어요 · 문제 상세</summary><p>{data.generation.error}</p></details>{/if}
			{#if data.generation?.status === 'failed' && data.generation.revision !== world.revision}<p class="console-feedback">장면이 바뀌었어요. 새 말이나 행동으로 이야기를 이어 주세요.</p>{/if}
			{#if form?.message}<p class="console-feedback" role="status">{form.message}</p>{/if}
			<form method="POST" action="?/turn" use:enhance={submitTurn} class="speech-form">
				<input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><input type="hidden" name="kind" value="input" />
				{#if characters.length < 8}
					<fieldset class="recipient-picker" disabled={submitting}>
						<legend class="sr-only">누구에게</legend>
						<div class="recipient-tags">
							<label class="recipient-tag"><input type="radio" name="targetId" value="" bind:group={targetId} /><span>모두에게</span></label>
							{#each characters as instance (instance.id)}<label class="recipient-tag"><input type="radio" name="targetId" value={instance.id} bind:group={targetId} /><span>{instance.name}</span></label>{/each}
						</div>
					</fieldset>
				{:else}
					<label class="recipient-dropdown">누구에게<select name="targetId" bind:value={targetId} disabled={submitting}><option value="">현장에 있는 모두에게</option>{#each characters as instance}<option value={instance.id}>{instance.name}</option>{/each}</select></label>
				{/if}
				<label class="speech-input"><span class="sr-only">나의 행동과 대사</span><textarea name="text" rows="1" placeholder={'*고개를 끄덕인다* "좋아요. 함께 가요."'} aria-describedby="player-input-help" maxlength="4000" required disabled={submitting}></textarea></label>
				<button class="primary" disabled={submitting}>보내기</button>
			</form>
			<div class="console-tools"><details class="input-help"><summary>입력 도움말</summary><p id="player-input-help">*행동*과 "대사"를 순서대로 적어 주세요. 표기 없는 문장은 대사로 처리합니다. 예: *고개를 끄덕인다* "좋아요."</p></details><button type="button" onclick={() => { actionsOpen = !actionsOpen; }} aria-expanded={actionsOpen}>행동 · 이동 {actionsOpen ? "접기" : "열기"}</button></div>
			<div class="stage-options console-actions" class:actions-open={actionsOpen}>
				<form method="POST" action="?/turn" use:enhance={submitTurn}><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><button name="kind" value="wait" disabled={busy}>잠시 지켜본다</button></form>
				{#each scene.exits as exit}{@const destination = world.definition.scenes.find((entry) => entry.id === exit)!}<form method="POST" action="?/turn" use:enhance={submitTurn}><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><input type="hidden" name="kind" value="move" /><button name="destinationId" value={exit} disabled={busy}>{destination.name}(으)로 →</button></form>{/each}
			</div>
		</section>

	</main>
	<aside class="objects-panel" class:drawer-open={objectsOpen} aria-label="현재 씬의 상호작용 오브젝트"><details class="objects-drawer" bind:open={objectsOpen}><summary>주변 사물 <span>{objects.length}</span></summary><div class="objects-content"><button class="drawer-close" type="button" onclick={() => { objectsOpen = false; }}>주변 닫기</button><p class="eyebrow">ON THE SCENE</p><h2>주변 사물</h2><p class="objects-location">{scene.name}</p><div class="object-grid">
		{#each objects as instance (instance.id)}<article class="object-card"><h3>{instance.name}</h3><p>{templateFor(world, instance).description}</p><details class="object-state-details"><summary>사물 상태</summary><small>{Object.entries(instance.state).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></details><div class="stage-options">
			{#each interactionsFor(world, instance) as interaction}<form method="POST" action="?/turn" use:enhance={submitTurn}><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><input type="hidden" name="kind" value="interact" /><input type="hidden" name="targetId" value={instance.id} /><button name="interactionId" value={interaction.id} disabled={busy}>{interaction.label}</button></form>{/each}
		</div></article>{:else}<p class="muted">지금 이곳에는 살펴볼 사물이 없습니다.</p>{/each}
	</div></div></details></aside>
</div>
</div>
