import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { actorName } from '$lib/theater/runtime';
import { eventParts } from '$lib/theater/event-content';
import { eventPresentations } from '$lib/theater/presentation';
import { getWorld } from '$lib/server/stage-store';

export const GET: RequestHandler = ({ url }) => {
	try {
		const world = url.searchParams.has('worldId') ? getWorld(url.searchParams.get('worldId')!) : getWorld();
		const presentations = eventPresentations(world);
		const markdown = [`# ${world.definition.name}`, '', world.definition.description, '', ...world.state.events.flatMap((event) => {
			const parts = eventParts(event);
			const presentation = presentations.get(event.id);
			return [
				`## ${event.tick} · ${world.definition.scenes.find((scene) => scene.id === event.sceneId)?.name} · ${actorName(world, event.actorId)}`, '',
				...(presentation?.playerContext ? [presentation.playerContext, ''] : []),
				...(presentation?.appearance ? [presentation.appearance, ''] : []),
				...parts.flatMap((part) => part.kind === 'act' ? [`**행동**: ${part.text}`, ''] : ['**대사**', '', ...part.text.split('\n').map((line) => `> ${line}`), ''])
			];
		})].join('\n');
		return new Response(markdown, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="newera-theater-${encodeURIComponent(world.id)}.md"`, 'cache-control': 'no-store' } });
	} catch { error(404, '세계관을 찾을 수 없습니다.'); }
};
