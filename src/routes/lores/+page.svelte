<script lang="ts">
	import AppearanceControl from '$lib/components/AppearanceControl.svelte';
	import { onMount, untrack } from 'svelte';
	import { enhance, guardDrafts } from '$lib/editor/drafts';
	import { beforeNavigate } from '$app/navigation';
	import SceneEditor from '$lib/components/editor/SceneEditor.svelte';
	import SceneGraph from '$lib/components/editor/SceneGraph.svelte';
	import TemplateEditor from '$lib/components/editor/TemplateEditor.svelte';
	import InstanceEditor from '$lib/components/editor/InstanceEditor.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let world = $derived(data.world);
	let section = $state(untrack(() => data.editorTab));
	let visitedTabs = $state<string[]>(untrack(() => [data.editorTab]));
	let filter = $state('all');
	let libraryOpen = $state(true);
	let draftWorldId = untrack(() => data.world.id);
	let startingSceneId = $state(untrack(() => data.world.definition.startingSceneId));
	let imagePromptFormat = $state(untrack(() => data.world.definition.imageGeneration?.promptFormat ?? 'natural'));
	let spawnSceneId = $state(untrack(() => data.world.state.activeSceneId));
	$effect(() => { const id = world.id; if (id !== draftWorldId) untrack(() => { draftWorldId = id; startingSceneId = world.definition.startingSceneId; imagePromptFormat = world.definition.imageGeneration?.promptFormat ?? 'natural'; spawnSceneId = world.state.activeSceneId; }); });
	onMount(() => { const media = matchMedia('(max-width: 680px)'); const resize = () => { libraryOpen = !media.matches; }; resize(); media.addEventListener('change', resize); return () => media.removeEventListener('change', resize); });
	let importMode = $state('new');
	let search = $state('');
	let draftCount = $state(0);
	const updateDraftCount = (count: number) => { draftCount = count; };
	beforeNavigate(({ cancel }) => { if (draftCount && !confirm('저장하지 않은 편집 내용이 있어요. 작업실을 떠날까요?')) cancel(); });
	const matches = (name: string) => name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
	let tabs = $derived([
		{ id: 'world', name: '세계관', count: null },
		{ id: 'scenes', name: '씬', count: world.definition.scenes.length },
		{ id: 'templates', name: '캐릭터·사물', count: world.definition.templates.length },
		{ id: 'instances', name: '배치·관계', count: world.state.instances.length },
		{ id: 'advanced', name: '고급', count: null }
	]);
	let generating = $derived(data.generation?.status === 'running' || data.generation?.status === 'pending');
</script>

<svelte:head><title>세계관과 무대 편집 · newera</title><meta name="description" content="장소와 캐릭터, 서로에 대한 마음을 편하게 다듬는 이야기 작업실" /></svelte:head>
<header class="topbar"><a class="brand" href="/">newera<span>THEATER</span></a><nav class="session-actions"><a class="top-link" href="/">공연</a><a class="top-link" href="/images">삽화</a><AppearanceControl /></nav></header>
<main class="editor-shell workshop-shell" use:guardDrafts={{ worldId: world.id, onChange: updateDraftCount }}>
	<div class="editor-intro"><p class="eyebrow">STORY WORKSHOP</p><h1>세계관과 무대 편집</h1><p>장소를 잇고, 인물을 알아가고, 서로에 대한 마음을 다듬어 보세요.</p></div>
	<div class="editor-layout">
		<details class="editor-library" bind:open={libraryOpen}><summary>나의 이야기 · 세계관 관리</summary><aside class="editor-catalog"><p class="eyebrow">나의 이야기</p>
			{#each data.worlds as entry}<form method="POST" action="?/selectWorld" use:enhance><button class="world-link" class:current={entry.id === world.id} name="worldId" value={entry.id} disabled={entry.id === world.id}>{entry.name}<small class="world-identity">{entry.id.slice(0, 8)}</small></button></form>{/each}
			<details class="editor-section"><summary>+ 새 세계관</summary><form method="POST" action="?/createWorld" use:enhance class="settings-form"><label>이름<input name="name" maxlength="200" placeholder="이야기의 이름" required /></label><label>어떤 세계인가요?<textarea name="description" rows="4" maxlength="40000" placeholder="배경과 분위기를 자유롭게 적어 주세요." required></textarea></label><button class="primary">세계관 만들기</button></form></details>
			<details class="editor-section"><summary>저장한 세계관 가져오기</summary><form method="POST" action="?/importWorld" enctype="multipart/form-data" use:enhance class="settings-form"><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><label>가져오기 방식<select name="mode" bind:value={importMode}><option value="new">새 세계관으로 추가</option><option value="replace">현재 세계관 교체</option></select></label>{#if importMode === 'replace'}<p class="field-hint">‘{world.definition.name}’ ({world.id.slice(0, 8)})의 설정·진행·저장 슬롯을 새 파일의 내용으로 교체하고 모델 선택을 기본값으로 되돌리고 이미지 프리셋 선택을 해제합니다. 이전 기록은 지워집니다.</p>{:else}<p class="field-hint">별도의 세계관을 추가합니다. 같은 이름도 새 항목으로 생깁니다.</p>{/if}<label>세계관 파일<input name="file" type="file" accept=".json,application/json" required /></label><button class:danger-button={importMode === 'replace'}>{importMode === 'replace' ? '현재 세계관 교체' : '가져오고 열기'}</button></form></details>
			<a class="export-link" href={`/lores/export/${encodeURIComponent(world.id)}`}>세계관·진행·슬롯 내려받기 ↓</a>
			<details class="editor-section world-delete" open={false}><summary>현재 세계관 삭제</summary><p>‘{world.definition.name}’ ({world.id.slice(0, 8)})와 진행 기록·저장 슬롯을 모두 삭제합니다.</p><form method="POST" action="?/deleteWorld" use:enhance><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><button class="danger-button">이 세계관 삭제</button></form></details>
		</aside></details>
		<section class="editor-main">
			<div class="workshop-heading"><div><span class="workshop-badge">이야기 작업실</span><h2>{world.definition.name}</h2><p>{world.definition.scenes.length}개의 씬 · {world.state.instances.filter((instance) => world.definition.templates.find((template) => template.id === instance.templateId)?.kind === 'character').length}명의 인물</p></div><a href="/" class="preview-link">공연 보기 →</a></div>
			<nav class="editor-tabs" aria-label="편집 항목">{#each tabs as tab}<button type="button" class:chosen={section === tab.id} aria-pressed={section === tab.id} onclick={() => { section = tab.id; if (!visitedTabs.includes(tab.id)) visitedTabs.push(tab.id); }}>{tab.name}{#if tab.count !== null}<span>{tab.count}</span>{/if}</button>{/each}</nav>
			{#if section !== 'world' && section !== 'advanced'}<label class="editor-search">이름으로 찾기<input type="search" bind:value={search} placeholder="씬·인물·사물 이름" /></label>{/if}
			{#if draftCount}<p class="draft-notice" role="status">저장하지 않은 편집 {draftCount}곳 · 탭을 바꿔도 유지됩니다. 작업실을 떠나기 전에 저장해 주세요.</p>{/if}
			{#if form?.message}<p class="feedback editor-feedback" class:error={form.error} role={form.error ? 'alert' : 'status'}>{form.message}</p>{/if}
			{#if generating}<p class="scope-note">지금 공연이 진행 중입니다. 설정을 저장하면 진행 중인 응답은 멈추고, 이미 확정된 기록은 유지됩니다.</p>{/if}
			{#key world.id}
				{#if visitedTabs.includes('world')}<div hidden={section !== 'world'}>
					<div class="section-intro"><h3>이야기의 큰 배경</h3><p>인물들이 살아가는 세계와 지켜야 할 규칙을 알려 주세요.</p></div>
					<form method="POST" action="?/settings" use:enhance class="settings-form workshop-card padded-card"><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><label>세계관 이름<input name="name" defaultValue={world.definition.name} maxlength="200" required /></label><label>배경과 분위기<textarea name="description" rows="6" defaultValue={world.definition.description} maxlength="40000" required></textarea></label><label>이 세계의 규칙<textarea name="rules" rows="5" defaultValue={world.definition.rules} maxlength="20000" placeholder="예: 인물은 자신이 보거나 들은 일에만 반응한다."></textarea></label><label>서술 문체 지침<textarea name="writingStyle" rows="5" defaultValue={world.definition.writingStyle ?? ''} maxlength="4000" placeholder="예: 담백한 현재형으로 쓴다. 행동은 구체적인 동작 위주로 1~2문장만 묘사한다. 과한 비유와 감정 해설을 줄인다. 대사는 각 인물의 평소 말투를 살린다."></textarea></label><p class="field-hint">행동 묘사와 대사의 표현에 반영해요. 비워두면 기본 문체를 사용합니다. 문체를 바꿔도 인물의 성격과 행동·대사 분리는 유지돼요. 저장 후 다음 이야기부터 적용되며, 이미 확정된 기록은 유지됩니다.</p><label>이야기가 시작되는 씬<select name="startingSceneId" bind:value={startingSceneId}>{#each world.definition.scenes as scene}<option value={scene.id}>{scene.name}</option>{/each}</select></label><p class="field-hint">시작 씬을 바꾸면 처음 동행하는 인물의 시작 위치도 함께 옮겨요. 지금 진행 중인 위치는 유지됩니다.</p><label>다른 장소에서 옷차림을 다시 고를 최소 간격 (분)<input type="number" name="appearanceChangeMinutes" defaultValue={world.definition.appearanceChangeMinutes ?? 180} min="1" max="1440" required /></label><p class="field-hint">기본 180분. 마지막 선택 이후 이 시간이 지나고 다른 씬에 등장하면 다시 고를 수 있어요. 날짜가 바뀌면 장소와 관계없이 다시 선택합니다.</p><fieldset class="lore-image-settings"><legend>로어북 · 삽화</legend>
						<label>삽화를 더할 장면<textarea name="imageConditions" rows="5" maxlength="8000" defaultValue={world.definition.imageGeneration?.conditions ?? ''} placeholder="예: 중요한 만남이 일어나거나 게임 내 시각이 18시 이후인 극장 입구 장면을 삽화로 그린다."></textarea></label>
						<p class="field-hint">비워두면 자동 삽화를 사용하지 않습니다. 설정한 조건과 장면의 흐름, 이야기 속 날짜와 시각에 맞춰 삽화가 더해집니다.</p>
						<label>이미지 프롬프트 형식<select name="imagePromptFormat" bind:value={imagePromptFormat}><option value="natural">자연어 묘사</option><option value="tags">쉼표로 구분한 태그</option></select></label>
						<label>이미지 프롬프트 작성 지침<textarea name="imagePromptInstructions" rows="3" maxlength="4000" defaultValue={world.definition.imageGeneration?.promptInstructions ?? ''} placeholder="예: 인물의 현재 옷차림과 표정을 중심으로 영어 프롬프트를 작성한다."></textarea></label>
						<p class="field-hint">삽화에 담을 인물과 분위기, 표현 방식을 적어 주세요. 이 지침은 세계관에 저장됩니다. 사용할 삽화 프리셋은 공연 화면의 설정에서 선택하세요.</p>
					</fieldset><button class="primary">세계관 저장</button></form>
				</div>{/if}{#if visitedTabs.includes('scenes')}<div hidden={section !== 'scenes'}>
					<div class="section-intro"><h3>어디에서 만날까요?</h3><p>각 씬 카드에서 인접 씬을 선택하세요. 저장한 목록대로 위 지도에 연결을 그려요.</p></div>
					<details class="graph-disclosure"><summary>씬 연결 지도 펼치기</summary><SceneGraph {world} /></details>
					<div class="workshop-grid">{#each world.definition.scenes as scene (scene.id)}<details hidden={!matches(scene.name)} class="workshop-card scene-editor" data-testid={`scene-${scene.id}`}><summary><span class="card-avatar scene-avatar">{scene.name.slice(0, 1)}</span><span><strong>{scene.name}</strong><small>{scene.id === world.state.activeSceneId ? '지금 있는 곳' : scene.id === world.definition.startingSceneId ? '시작하는 곳' : '씬'}</small></span><span class="card-edit-label">편집</span></summary><p class="card-description">{scene.description}</p><div class="connection-chips">{#each scene.exits as id}<span>→ {world.definition.scenes.find((other) => other.id === id)?.name}</span>{:else}<span>연결된 길이 없어요</span>{/each}</div><div class="card-body">{#key world.id}<SceneEditor {world} {scene} />{/key}</div></details>{/each}</div>
					<details class="workshop-card add-card"><summary>+ 새로운 씬 만들기</summary><div class="card-body">{#key world.id}<SceneEditor {world} />{/key}</div></details>
				</div>{/if}{#if visitedTabs.includes('templates')}<div hidden={section !== 'templates'}>
					<div class="section-intro"><h3>어떤 인물이 등장하나요?</h3><p>소개·성격·말투·바라는 것을 적어 주세요. 같은 기본 설정으로 여러 인물을 배치할 수도 있어요.</p></div>
					<div class="scope-switch filter-switch" aria-label="캐릭터·사물 필터">{#each [{ id: 'all', name: '모두' }, { id: 'character', name: '캐릭터' }, { id: 'object', name: '사물' }] as item}<button type="button" class:chosen={filter === item.id} aria-pressed={filter === item.id} onclick={() => { filter = item.id; }}>{item.name}</button>{/each}</div>
					<div class="workshop-stack">{#each world.definition.templates as template (template.id)}<details hidden={!matches(template.name) || (filter !== 'all' && template.kind !== filter)} class="workshop-card" data-testid={`template-${template.id}`}><summary><span class="card-avatar" class:object-avatar={template.kind === 'object'}>{template.name.slice(0, 1)}</span><span><strong>{template.name}</strong><small>{template.kind === 'character' ? '캐릭터' : '사물'} · {world.state.instances.filter((instance) => instance.templateId === template.id).length}곳에 배치됨</small></span><span class="card-edit-label">편집</span></summary><div class="card-body">{#key world.id}<TemplateEditor {world} {template} />{/key}</div></details>{:else}<p class="empty-hint">아직 설정이 없어요. 첫 캐릭터나 사물을 만들어 보세요.</p>{/each}</div>
					<details class="workshop-card add-card"><summary>+ 캐릭터·사물 만들기</summary><div class="card-body">{#key world.id}<TemplateEditor {world} />{/key}</div></details>
				</div>{/if}{#if visitedTabs.includes('instances')}<div hidden={section !== 'instances'}>
					<div class="section-intro"><h3>씬의 인스턴스와 동행</h3><p>배치된 인물과 사물의 이름·위치·상태를 바꾸고, 인물끼리의 마음을 설정해 보세요.</p></div>
					<div class="workshop-stack">{#each world.state.instances as instance (instance.id)}<div hidden={!matches(instance.name)}><InstanceEditor {world} {instance} /></div>{:else}<p class="empty-hint">아직 배치된 인물이 없어요. 아래에서 첫 인물이나 사물을 배치해 보세요.</p>{/each}</div>
					<details class="workshop-card add-card"><summary>+ 인물·사물 배치하기</summary><div class="card-body"><form method="POST" action="?/spawn" use:enhance class="settings-form"><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><label>기본 설정<select name="templateId" required>{#each world.definition.templates as template}<option value={template.id}>{template.name} · {template.kind === 'character' ? '캐릭터' : '사물'}</option>{/each}</select></label><label>이름<input name="name" placeholder="비워두면 기본 이름을 사용해요" /></label><label>배치할 씬<select name="sceneId" bind:value={spawnSceneId}>{#each world.definition.scenes as scene}<option value={scene.id}>{scene.name}</option>{/each}</select></label><label class="choice-chip"><input name="companion" type="checkbox" />플레이어와 동행</label><button class="primary" disabled={!world.definition.templates.length}>배치하기</button></form></div></details>
				</div>{/if}{#if visitedTabs.includes('advanced')}<div hidden={section !== 'advanced'}>
					<div class="section-intro"><h3>세밀한 설정이 필요할 때</h3><p>평소에는 다른 탭의 편집 도구를 사용하고, 전체 내용을 한꺼번에 다룰 때 이곳을 이용하세요.</p></div>
					<details class="workshop-card"><summary>세계관 전체 정의 · JSON</summary><div class="card-body"><p class="field-hint">현재 진행과 기억은 유지됩니다. 초기 배치는 초기화할 때 적용됩니다.</p><form method="POST" action="?/definition" use:enhance class="settings-form"><input type="hidden" name="worldId" value={world.id} /><input type="hidden" name="revision" value={world.revision} /><label>세계관 정의<textarea name="definition" class="code-input definition-input" rows="24" defaultValue={JSON.stringify(world.definition, null, 2)} required></textarea></label><button>정의 저장</button></form></div></details>
				</div>{/if}
			{/key}
		</section>
	</div>
</main>

<style>
	.settings-form .lore-image-settings { display: grid; gap: 16px; }
</style>
