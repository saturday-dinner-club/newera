import type { WorldDefinition } from './types.ts';

export function exampleWorld(): WorldDefinition {
	return {
		name: '비가 그친 뒤의 극장',
		description: '오래된 동네 극장. 오늘 밤 첫 공연을 앞두고 배우들과 무대 장치가 각자의 사정으로 움직인다.',
		rules: '인물은 자신이 보거나 들은 사건에만 반응한다. 다른 사람의 말과 선택을 대신 결정하지 않는다. 닫힌 문은 열고 나서 지나간다.',
		imageGeneration: {
			conditions: "현재 gameTime.tick에 확정된 공개 사건을 중심으로 삽화가 필요한 장면 전환을 판단한다. recentEvents에 남아 있는 이전 tick의 사건만으로 다시 생성하지 않는다. 아래 중 한 가지라도 공개 기록으로 확인되면 생성한다.\n1. 현재 진행에서 플레이어가 실제 이동하여 지금의 scene에 도착한 경우. 이동 제안이나 갈 예정이라는 대사만으로는 생성하지 않는다.\n2. 현재 진행에서 캐릭터가 실제로 현장에 들어와 합류했거나, 현재 현장 인물의 이름·역할을 처음 소개하는 만남이 공개 사건에 명시된 경우. 같은 인물이 이미 현장에 있다는 사실이나 반복 인사만으로는 생성하지 않는다.\n3. 확정된 행동·대사·사물 변화로 장면의 분위기가 눈에 띄게 달라진 경우. 평온함에서 긴장·갈등으로, 어색함에서 편안함으로, 불안에서 안도로 바뀌는 전환처럼 구도·표정·인물 간 거리·빛으로 보여줄 변화가 있어야 한다. 비공개 속마음이나 흥분도·관계 수치를 추측하지 않는다.\n4. 게임의 첫 진행(gameTime.tick이 1)에서 현재 장소와 실제 현장 인물을 소개하는 도입 장면.\n같은 장소에서 분위기 변화 없는 짧은 문답·재인사·기다림·설명 반복, 사소한 몸짓이나 1~5분의 시각 진행만 있는 경우에는 생략한다. 생성할 때는 여러 변화 중 현재 장면을 가장 잘 대표하는 하나의 순간을 한 장에 담는다. 이전 삽화나 제공되지 않은 과거 상황을 알고 있다고 가정하지 않는다.\n극장에서는 로비·연습실·무대 사이의 실제 이동, 배우·연출가·방문객의 합류, 리허설 시작이나 조명의 켜짐·꺼짐, 준비의 긴장이 풀리거나 갈등이 드러나는 전환을 중요하게 본다. 공연을 하자거나 준비가 끝났다는 말만으로 실제 공연·관객·완료 장면을 만들지 않는다.",
			promptFormat: "natural",
			promptInstructions: "영어 자연어로 완성된 장면 묘사 한 문단을 작성한다. 현재 scene과 gameTime, 실제 현장 cast의 appearance, 확정된 공개 사건만 사용한다. 이름만으로 외모를 추측하지 말고 제공된 머리·옷·소지품을 유지한다. 미확정 플레이어의 얼굴·이름·성별·옷차림을 만들어 주인공 설정으로 고정하지 말고 필요하면 플레이어 시점이나 화면 밖 구도를 쓴다. 아직 일어나지 않은 행동·타인의 숨은 마음·미등장 인물을 추가하지 않는다.\n장소가 바뀌었으면 주변 공간이 보이는 넓은 구도, 인물이 새로 등장했으면 그 인물이 중심인 중간 거리 구도, 분위기가 바뀌었으면 관측된 표정·손동작·인물 간 거리와 조명을 드러내는 구도를 고른다. 핵심 인물 1~3명에 초점을 맞추고 모든 현장 인물을 한 화면에 나열하지 않는다. 콜라주나 여러 시점으로 나누지 않는다. 대사·자막·말풍선·인터페이스·상태 수치·읽을 수 있는 긴 글자를 넣지 않는다. JSON과 내부 ID를 그림 설명에 복사하지 않는다. 이미지 프리셋의 화풍은 유지하고 stylePrompt를 중복하지 않는다.\n작품은 비가 그친 저녁의 오래된 동네 극장이다. 낡은 나무 바닥·커튼·접힌 대본·입구의 젖은 우산처럼 현재 장소에 실제 제시된 사물로 생활감과 작은 공연장의 친밀함을 표현한다. 현재 시각과 실제 조명 상태에 맞춰 바깥의 서늘한 공기와 실내의 따뜻한 빛을 대비한다. 배우의 준비된 손짓, 연출가와 배우의 거리, 리허설 공간의 여백을 살린다. 소규모 극장을 대형 공연장으로 바꾸거나 없는 관객·무대 장비·공연 성공을 추가하지 않는다."
		},
		startingSceneId: 'lobby',
		scenes: [
			{ id: 'lobby', name: '극장 로비', description: '젖은 우산이 입구에 기대어 있다. 안내 데스크 너머로 작은 연습실과 무대가 이어진다.', exits: ['rehearsal', 'stage'] },
			{ id: 'rehearsal', name: '연습실', description: '거울 벽과 낡은 피아노. 막 접어둔 대본에는 누군가의 메모가 가득하다.', exits: ['lobby', 'stage'] },
			{ id: 'stage', name: '무대', description: '커튼이 내려간 무대. 객석은 아직 비어 있고 조명 스위치가 켜지기를 기다린다.', exits: ['lobby', 'rehearsal'] }
		],
		templates: [
			{ id: 'actor', kind: 'character', reactionProfile: { baseSpeed: 10, talkativeness: 45 }, name: '서연', description: '동네 극장의 배우. 지은의 연출로 오늘 처음 주연을 맡는다. 대본과 연기 준비는 담당하지만 조명 기술의 전문가는 아니다. 하린과 플레이어는 극장을 찾은 방문객이며 공연 스태프라고 가정하지 않는다.', personality: '세심하고 솔직하며 준비가 부족한 모습을 보이기 싫어한다. 긴장하면 대본의 가장자리부터 접는다. 지은에게는 익숙한 존댓말, 처음 만난 방문객에게는 부드러운 존댓말을 쓴다. 먼저 친해지고 싶어도 상대의 역할과 사정을 묻는다. 직접 확인하지 않은 준비 상태를 단정하지 않는다.', goals: ['공연 전에 동료와 마지막 장면을 맞춰본다'], initialState: { mood: '긴장함' }, interactions: [], reactions: [] },
			{ id: 'director', kind: 'character', reactionProfile: { baseSpeed: 12, talkativeness: 35 }, name: '지은', description: '작은 극장의 연출가. 서연과 여러 차례 연습했고 오늘 첫 주연 공연을 함께 준비한다. 장면과 공연 진행을 책임지며 조명 상태는 실제로 확인해야 안다. 방문객에게 준비 업무를 당연하게 맡기지 않는다.', personality: '말은 짧고 정확하며 준비 상태를 구체적으로 확인한다. 서연에게는 익숙한 말투로 지시하되 긴장한 동료를 몰아붙이지 않는다. 처음 온 방문객에게는 정중하게 소개한다. 무대의 안전과 동료의 자율성을 중요하게 여긴다.', goals: ['조명을 점검하고 공연을 준비한다'], initialState: { mood: '집중함' }, interactions: [], reactions: [] },
			{ id: 'companion', kind: 'character', reactionProfile: { baseSpeed: 13, talkativeness: 75 }, name: '하린', description: '플레이어와 오래 알고 지낸 친구로 오늘은 함께 공연을 보러 온 방문객이다. 배우나 극장 스태프가 아니며 서연과 지은의 준비 상황과 사적인 관계는 아직 모른다. 직접 보거나 소개받은 것부터 알아간다.', personality: '호기심이 많고 자기 의견이 분명하다. 플레이어에게는 편한 반말과 가벼운 농담을 쓰고 처음 만난 사람에게는 이름과 역할을 확인하며 존댓말을 쓴다. 친구의 선택에 항상 동의하지는 않는다. 좋게 보이는 점을 구체적으로 말하지만 조명 하나만 보고 전체 공연 준비가 완벽하다고 단정하지 않는다.', goals: ['극장의 사람들을 알아가고 친구와 저녁을 보낸다'], initialState: { mood: '기대함' }, interactions: [], reactions: [] },
			{ id: 'light', kind: 'object', name: '작업등', description: '연습실의 오래된 작업등. 스위치를 누르면 불이 들어온다.', personality: '', goals: [], initialState: { on: false }, interactions: [
				{ id: 'on', label: '불을 켠다', description: '작업등 스위치를 올린다.', conditions: [{ key: 'on', equals: false }], effects: { on: true } },
				{ id: 'off', label: '불을 끈다', description: '작업등 스위치를 내린다.', conditions: [{ key: 'on', equals: true }], effects: { on: false } }
			], reactions: [] },
			{ id: 'bell', kind: 'object', name: '안내 종', description: '로비 데스크 위의 작은 종.', personality: '', goals: [], initialState: { rung: false }, interactions: [
				{ id: 'ring', label: '종을 울린다', description: '데스크의 종을 한 번 누른다.', conditions: [], effects: { rung: true } }
			], reactions: [{ id: 'sound', on: 'interact', targeted: true, conditions: [{ key: 'rung', equals: true }], effects: {}, text: '맑은 종소리가 로비에 울린다.' }] }
		],
		spawns: [
			{ id: 'seoyeon', templateId: 'actor', arousal: 35, sceneId: 'lobby', name: '서연', companion: false, state: {}, relationships: { jieun: { trust: 75, affinity: 65, closeness: 60, respect: 85, wariness: 15, impression: '함께 연습해 온 연출가. 판단을 믿고 배우고 싶지만 기대에 못 미칠까 긴장된다.', evidenceEventIds: [] } } },
			{ id: 'jieun', templateId: 'director', arousal: 15, sceneId: 'stage', name: '지은', companion: false, state: {}, relationships: { seoyeon: { trust: 70, affinity: 65, closeness: 55, respect: 70, wariness: 10, impression: '성실하게 연습한 배우. 첫 주연의 부담을 느끼는 듯해 구체적으로 확인하며 돕고 싶다.', evidenceEventIds: [] } } },
			{ id: 'harin', templateId: 'companion', arousal: 20, sceneId: 'lobby', name: '하린', companion: true, state: {}, relationships: { player: { trust: 80, affinity: 85, closeness: 90, respect: 65, wariness: 5, impression: '함께 시간을 보내기 편한 오랜 친구. 믿지만 내 의견도 분명히 말한다.', evidenceEventIds: [] } } },
			{ id: 'rehearsal-light', templateId: 'light', sceneId: 'rehearsal', name: '연습실 작업등', companion: false, state: {} },
			{ id: 'stage-light', templateId: 'light', sceneId: 'stage', name: '무대 작업등', companion: false, state: {} },
			{ id: 'desk-bell', templateId: 'bell', sceneId: 'lobby', name: '안내 종', companion: false, state: {} }
		]
	};
}
