export interface PlayerInputPart { kind: 'act' | 'speak'; text: string }

/** Parse explicit roleplay markers without asking a model to infer what the player meant. */
export function parsePlayerInput(input: string): PlayerInputPart[] {
	if (!input.trim() || input.length > 4000) throw new Error('행동과 대사를 1~4000자로 입력해 주세요.');
	const parts: PlayerInputPart[] = [];
	let buffer = '';
	let closing: '*' | '"' | '”' | null = null;
	const append = (kind: PlayerInputPart['kind']) => {
		const text = buffer.trim();
		if (text) {
			const previous = parts.at(-1);
			if (previous?.kind === kind) previous.text += `\n${text}`;
			else parts.push({ kind, text });
		}
		buffer = '';
	};
	for (let index = 0; index < input.length; index++) {
		const character = input[index];
		if (character === '\\' && ['\\', '*', '"', '“', '”'].includes(input[index + 1])) {
			buffer += input[++index];
		} else if (closing) {
			if (character === closing) {
				if (!buffer.trim()) throw new Error('행동이나 대사 표기 안에 내용을 입력해 주세요.');
				append(closing === '*' ? 'act' : 'speak');
				closing = null;
			} else buffer += character;
		} else if (character === '*' || character === '"' || character === '“') {
			append('speak');
			closing = character === '“' ? '”' : character;
		} else buffer += character;
	}
	if (closing) throw new Error(closing === '*' ? '행동 묘사는 *로 닫아 주세요.' : '대사는 큰따옴표로 닫아 주세요.');
	append('speak');
	return parts;
}
