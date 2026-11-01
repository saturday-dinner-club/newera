import { record, text } from '$lib/theater/validation';

/** The theater asks finite-choice questions; translate its System One evidence without changing meaning. */
export function decisionRequest(input: Record<string, unknown>, maxChoices = 255): Record<string, unknown> {
	const questions = Object.entries(record(input.questions, '판단 질문')).map(([name, value]) => {
		const question = record(value, '판단 질문');
		if (question.type !== 'choice') throw new Error('현재 공연의 Decision API는 choice 질문을 사용합니다.');
		const choices = Object.entries(record(question.criteria, '판단 후보')).map(([value, description]) => ({ value, description: typeof description === 'string' ? description : JSON.stringify(description) }));
		if (choices.length < 2 || choices.length > maxChoices) throw new Error(`Decision API 질문에는 2~${maxChoices}개의 후보가 필요합니다. 후보를 줄이거나 한도가 더 큰 Provider를 선택해 주세요.`);
		return { name, type: 'choice', instructions: text(question.instructions, '판단 지침', 100000), choices };
	});
	if (!questions.length || questions.length > 64) throw new Error('공연의 Decision API 요청은 1~64개의 질문을 지원합니다.');
	return { model: input.model, input: JSON.stringify(input.state), questions };
}

/** Bind by question name, never by array position; refuse ambiguous, missing or unrelated answers. */
export function decisionAnswer(response: Record<string, unknown>, key: string, expectedNames: string[]): Record<string, unknown> {
	if (!Array.isArray(response.answers) || response.answers.length !== expectedNames.length) throw new Error('Decision API 응답의 질문 개수가 요청과 다릅니다.');
	const answers = response.answers.map(value => record(value, '판단 응답'));
	const names = answers.map(answer => answer.name);
	if (new Set(names).size !== names.length || names.some(name => typeof name !== 'string' || !expectedNames.includes(name))) throw new Error('Decision API 응답의 질문 이름이 요청과 다르거나 중복되었습니다.');
	const answer = answers.find(answer => answer.name === key);
	if (!answer) throw new Error('Decision API 응답에 요청한 질문이 없습니다.');
	return answer;
}
