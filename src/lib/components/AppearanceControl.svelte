<script lang="ts">
	import { onMount } from 'svelte';
	let theme = $state('system');
	let fontSize = $state('18');
	let open = $state(false);
	let control: HTMLDetailsElement;
	onMount(() => {
		try { theme = localStorage.getItem('newera-theme') ?? 'system'; fontSize = localStorage.getItem('newera-font-size') ?? '18'; } catch { /* Private browsing can disable storage. */ }
		if (!['system', 'dark', 'light'].includes(theme)) theme = 'system';
		if (!['16', '18', '20'].includes(fontSize)) fontSize = '18';
		const media = matchMedia('(prefers-color-scheme: dark)');
		const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme; };
		media.addEventListener('change', apply);
		return () => media.removeEventListener('change', apply);
	});
	function apply() {
		document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
		document.documentElement.style.setProperty('--reading-size', `${fontSize}px`);
		try { localStorage.setItem('newera-theme', theme); localStorage.setItem('newera-font-size', fontSize); } catch { /* The controls still work for this visit. */ }
	}
</script>
<svelte:window onclick={(event) => { if (open && !control.contains(event.target as Node)) open = false; }} onkeydown={(event) => { if (open && event.key === 'Escape') { open = false; control.querySelector('summary')?.focus(); } }} />
<details class="appearance-control" bind:open bind:this={control}>
	<summary aria-label="화면 설정">화면</summary>
	<div class="appearance-popover">
		<label>테마<select bind:value={theme} onchange={apply}><option value="system">시스템 설정</option><option value="dark">다크</option><option value="light">라이트</option></select></label>
		<label>이야기 글자 크기<select bind:value={fontSize} onchange={apply}><option value="16">작게 · 16</option><option value="18">보통 · 18</option><option value="20">크게 · 20</option></select></label>
	</div>
</details>
