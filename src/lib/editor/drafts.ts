import { enhance as kitEnhance } from '$app/forms';
import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';

/** Save only this form; other mounted tabs may contain unfinished edits. */
export function enhance<Success extends Record<string, unknown> | undefined = Record<string, unknown>, Failure extends Record<string, unknown> | undefined = Record<string, unknown>>(form: HTMLFormElement, submit?: SubmitFunction<Success, Failure>) {
	return kitEnhance<Success, Failure>(form, async (input) => {
		const callback = await submit?.(input);
		return async (output) => {
			if (callback) await callback(output); else await output.update({ reset: false });
			await tick();
			if (output.result.type === 'success') form.dispatchEvent(new CustomEvent('editor:saved', { bubbles: true }));
		};
	});
}

function snapshot(form: HTMLFormElement): string {
	return JSON.stringify(Array.from(form.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=file]), textarea, select')).map(node => {
		const field = node as HTMLInputElement;
		return [field.name, field.value, field.type === 'checkbox' || field.type === 'radio' ? field.checked : null];
	}));
}

/** Tabs and editor scopes stay mounted. Leaving the workshop explicitly protects drafts. */
export function guardDrafts(root: HTMLElement, options: { worldId: string; onChange: (count: number) => void }) {
	let bases = new Map<HTMLFormElement, string>();
	let dirty = new Set<HTMLFormElement>();
	let scheduled = false;
	const scan = () => {
		scheduled = false;
		for (const form of root.querySelectorAll('form')) {
			if (!bases.has(form)) bases.set(form, snapshot(form));
			if (snapshot(form) === bases.get(form)) dirty.delete(form); else dirty.add(form);
		}
		for (const form of bases.keys()) if (!root.contains(form)) { bases.delete(form); dirty.delete(form); }
		options.onChange(dirty.size);
	};
	const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(scan); } };
	const saved = (event: Event) => { const form = event.target as HTMLFormElement; bases.set(form, snapshot(form)); dirty.delete(form); scan(); };
	const leaving = (event: BeforeUnloadEvent) => { if (dirty.size) { event.preventDefault(); event.returnValue = ''; } };
	const switching = (event: SubmitEvent) => {
		const form = event.target as HTMLFormElement;
		if (/\?\/(selectWorld|importWorld|deleteWorld|definition)$/.test(form.action) && dirty.size && !confirm('저장하지 않은 편집 내용이 있어요. 변경을 버리고 계속할까요?')) { event.preventDefault(); event.stopImmediatePropagation(); }
	};
	scan();
	const observer = new MutationObserver(schedule);
	observer.observe(root, { childList: true, subtree: true });
	for (const type of ['input', 'change', 'click']) root.addEventListener(type, schedule);
	root.addEventListener('editor:saved', saved);
	root.addEventListener('submit', switching, true);
	window.addEventListener('beforeunload', leaving);
	return {
		update(next: typeof options) { if (next.worldId !== options.worldId) { bases = new Map(); dirty = new Set(); } options = next; schedule(); },
		destroy() { observer.disconnect(); for (const type of ['input', 'change', 'click']) root.removeEventListener(type, schedule); root.removeEventListener('editor:saved', saved); root.removeEventListener('submit', switching, true); window.removeEventListener('beforeunload', leaving); }
	};
}
