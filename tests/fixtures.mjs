import { exampleWorld } from '../src/lib/theater/fixtures.ts';

/** Equal-speed cast for tests of ordering-independent runtime contracts; lore balance is tested separately. */
export function neutralWorldDefinition() {
	const definition = exampleWorld();
	for (const template of definition.templates) if (template.kind === 'character') template.reactionProfile = { baseSpeed: 10, talkativeness: 50 };
	for (const spawn of definition.spawns) if (definition.templates.find(template => template.id === spawn.templateId).kind === 'character') spawn.arousal = 0;
	return definition;
}
