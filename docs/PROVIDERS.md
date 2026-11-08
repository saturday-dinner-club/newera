# Provider와 모델 별칭

화면 상단 **메뉴 → 모델과 삽화 설정 → Provider 관리**에서 OEV 서버와 OpenAI 호환 API를 여러 개 등록합니다. Provider 등록은 앱 전체에서 공유하며, 판단·생성 모델 선택은 세계관별로 저장합니다.

## 화면에서 설정하기

1. **새 Provider 추가**에서 이름, API 유형, 기본 주소와 필요한 경우 API 키를 입력하고 **Provider 저장**을 누릅니다. 주소는 `http://macstudio:12821/v1`처럼 API 접두 경로까지 포함합니다.
2. **서버 모델 목록 가져오기**로 모델을 가져오거나 **모델 별칭 추가**로 직접 등록합니다. 실제 모델 ID와 표시 별칭을 입력하고 저장합니다. 조회한 모델은 저장 전까지 편집 초안입니다.
3. 위쪽 판단·생성 선택창에서 `Provider 이름 / 모델 별칭`을 선택하고 **모델 적용**을 누릅니다. 같은 모델 ID도 서버별로 구분됩니다.

상단 **목록 새로고침**은 기본 OEV와 추가로 등록된 Provider 서버를 조회합니다. 새 모델은 별칭으로 저장해 선택창에 표시하며, 기존 별칭의 이름·용도와 세션의 모델 선택은 유지합니다. 일부 서버 조회에 실패하면 해당 오류와 기존 별칭을 함께 표시합니다. 조회 도중 Provider 설정이 바뀌면 해당 결과를 저장하지 않고 다시 조회하도록 안내합니다. 설정 창을 여는 것만으로는 별칭을 추가하지 않습니다.

판단은 **System One** 또는 **Decision API**를 설정한 Provider에서 선택합니다. 생성에는 OEV와 **OpenAI 호환 API**를 모두 사용할 수 있습니다. `task: "decision"` 별칭은 판단 전용이며 문장 생성 목록에서는 제외됩니다. 관찰·관계 해석도 선택한 생성 Provider를 사용합니다. 정체성·표현 검수와 옷차림 선택은 판단 Provider의 typed decision을 사용합니다. 임베딩용 별칭은 판단·생성 목록에서 제외합니다.

기존 기본 OEV 자동 모델 목록과 별칭 없는 모델 ID도 계속 사용할 수 있습니다. 기본 OEV는 삭제하거나 OpenAI 호환 유형으로 바꿀 수 없습니다. 세션에서 선택 중인 Provider나 별칭을 제거하려면 해당 세션의 모델을 먼저 변경합니다. 선택 중인 별칭의 표시 이름이나 실제 모델 ID는 수정할 수 있습니다.

API 키는 저장 후 브라우저에 다시 보내지 않습니다. 입력란을 비워 저장하면 기존 키를 유지하며, **저장된 API 키 지우기**로 제거합니다. **API 세부 옵션**의 환경 변수 이름을 지정하면 서버 프로세스의 해당 값을 직접 입력한 키보다 우선하여 사용합니다.

## API 호환 옵션

TypeSafe(`https://api.typesafe.ai/v1`)는 판단 API를 **System One**으로 지정합니다. [공식 모델 목록 명세](https://api.typesafe.ai/docs)에 맞춰 `models[].name` 형식도 읽으며, 조회한 모델은 판단 전용 별칭으로 등록합니다. `jev-latest`, `jev-preview` 같은 모델은 문장 생성 목록에 표시하지 않습니다. 문장 생성에는 별도 Chat Completions Provider를 선택합니다. OEV와 OpenAI 호환 서버의 기존 `data[].id` 모델 목록도 계속 지원합니다.

| 옵션 | 동작 |
| --- | --- |
| JSON Schema | `response_format.json_schema`를 전달합니다. OpenAI 호환 서버에는 아래의 배열 제약 세 개를 제외한 스키마를 보냅니다. |
| JSON 객체 | `response_format: {"type":"json_object"}`와 스키마 지침을 전달하고, 앱이 동일한 출력 계약을 검증합니다. |

ArliAI처럼 JSON Schema 일부만 지원하는 서버를 위해 OpenAI 호환 생성 요청에서는 `contains`, `minContains`, `uniqueItems`를 제외합니다. 이 세 조건은 관찰·관계 해석의 근거 사건 배열에 사용됩니다. 새 목격 사건을 근거로 포함하는지와 허용된 사건 ID인지는 앱에서 계속 검증하고, 근거 ID 중복도 기존처럼 정리합니다. 필수 필드·타입·후보 enum·배열 길이 제약은 전달하며, OEV의 원본 스키마와 JSON 객체 모드의 전체 스키마 지침은 유지합니다. `Grammar error: Unimplemented keys` HTTP 400은 생성 결과 오류가 아니라 서버가 요청 스키마를 받아들이지 못했다는 뜻이며 같은 요청을 반복해도 해결되지 않습니다.

OpenAI 호환 생성 요청에는 OEV 전용 `input_type`, `reasoning_effort`, `temperature`를 보내지 않습니다. 모든 생성 Provider에 `max_completion_tokens`와 `max_tokens`를 생략하며 출력 길이는 Provider의 기본 설정과 모델 문맥 한도를 따릅니다. 기존 `outputTokenParameter`는 저장 데이터 호환을 위해 읽고 보존하지만 요청에는 적용하지 않습니다. JSON 객체 모드에서도 행동·대사 분리와 필드·실행 가능성 검증을 유지하며, 평문으로 자동 전환하지 않습니다. Provider가 선택한 구조화 출력 방식을 지원해야 합니다. 이 기능은 Chat Completions 호환 API를 대상으로 하며 Responses 전용 API는 지원하지 않습니다.

## 시스템 프롬프트 구성

행동·대사 생성, 관찰·관계 해석, 삽화 프롬프트 작성의 system 메시지는 `src/lib/server/prompts.ts`에서 Markdown 제목과 항목으로 조립합니다. 역할과 과제, 입력 해석, 관측 사실과 주관적 해석, 작업별 규칙, 출력 계약을 구분합니다. 공통 관측 규칙은 행동 생성과 관계 해석에서 공유합니다.

화자 이름과 ID는 한 줄의 JSON 문자열로 인용하며, 로어북 문체 지침은 별도 인용 블록에 넣습니다. 문체 적용 범위는 그 다음 절에 명시합니다. 문체가 비어 있으면 해당 절을 생략합니다. 인물·관계·사건 등의 user 입력은 기존 JSON 형식을 유지하고, 모델의 응답은 기존 JSON Schema로 검증합니다. 프롬프트 문서의 Markdown 형식이 응답 형식을 바꾸지는 않습니다.

## 추론 로그

행동·대사와 관찰·관계 생성의 재시도 지침은 확인된 실패 단계로 구분한다. HTTP 오류·연결 실패·시간 초과는 직전 요청을 그대로 반복한다. JSON 파싱은 JSON 형식만, content 오류와 출력 잘림은 간결하고 완전한 출력만 교정한다. 행동·관계 스키마 위반은 각각의 필드·행동 후보·새 사건 근거 규칙을 안내하고, 정체성 검수와 행동 의미 검수 거절은 해당 내용만 교정한다. 전송 오류는 교정 번호를 증가시키거나 기존 지침을 바꾸지 않는다. 재시도 횟수·백오프·취소·확정 결과 보존 규칙은 유지한다.

앱 서버 stdout/stderr에 타임스탬프(`timestamp`, UTC ISO 8601)·수준(`level`)·이벤트(`event`)를 담은 JSON 한 줄씩 출력한다. 별도의 로그 수집기나 파일 저장은 추가하지 않는다.

| 이벤트 | 의미 |
| --- | --- |
| `[추론] 시도 시작 / 완료` | 한 추론 시도의 시작과 검증·검수까지 마친 완료 |
| `[OEV] 요청 시작` | 실제 HTTP 요청 시작. Provider·모델·`schema`/`question`·실제 `responseFormat` 포함 |
| `[OEV] HTTP 응답 수신` | HTTP 응답 및 JSON 수신. 출력 계약을 통과했다는 뜻은 아님 |
| `[추론] 출력 검증 통과 / 실패` | 응답 종료·JSON·스키마·의미 검수 단계 결과 |
| `[추론] 재시도 예약` | 실패한 `requestId`, 단계·코드·사유, `delayMs`와 다음 시도 번호 |
| `[추론] 재시도 소진 / 실패 / 취소` | 최종 실패 또는 호출자에 의한 취소. 취소는 info 수준이며 재시도하지 않음 |

한 추론의 재시도들은 `operationId`가 같고 HTTP 시도별 `requestId`는 다르다. `attempt`는 1부터, `maxAttempts`는 최초 시도를 포함한 한도다. 중첩 검수는 `parentOperationId`, 검수 대상이 된 행동 생성은 `parentRequestId`로 연결한다. 장면 처리에는 `worldId/jobId/actorId/sceneId/tick`, 삽화 처리에는 `worldId/imageJobId`가 붙는다. 다른 세계관·인물의 동시 요청에도 문맥이 섞이지 않도록 AsyncLocalStorage를 사용한다.

응답 요약은 `finishReason`, `contentChars`, `reasoningChars`, `refusal`, `promptTokens/completionTokens/totalTokens/reasoningTokens`다. 요청의 `bytes`와 응답의 `responseBytes`는 실제 바이트 크기다. 없는 사용량을 0으로 해석하지 않고 생략한다. 본문·추론·상태·프롬프트·인증 헤더·원문 오류 응답은 출력하지 않는다. 스키마 오류는 누락된 고정 필드 이름·예상 밖 필드 수·허용된 필드의 값 타입만 남긴다.

| 단계·코드 | 확인할 내용 |
| --- | --- |
| `transport / http_429`, `http_500` 등 | Provider HTTP 오류. 기존 정책에서 재시도 가능한 상태만 재시도 |
| `transport / timeout`, `connection`, `http_invalid_json` | 대기 시간·연결·HTTP 본문 JSON 문제 |
| `finish_reason / output_token_limit` | `finishReason=length`. Provider의 출력·문맥 한도와 completion/reasoning 토큰 사용량 확인 |
| `finish_reason / unexpected_finish_reason` | stop 이외 종료 원인. content filter·tool call 등 확인 |
| `response_shape / missing_choices`, `model_refusal` | 응답 후보 누락 또는 모델 거절 |
| `content / empty_content`, `invalid_content_type`, `content_too_long` | content가 없거나 문자열이 아니거나 길이 초과 |
| `json_parse / invalid_json` | 모델이 반환한 content가 유효한 JSON이 아님 |
| `action_schema`, `reflection_schema`, `typed_answer`, `image_prompt_schema`, `embedding_schema`의 `invalid_output` | 필드·타입·실행 후보·목격 근거 등 계약 불일치. `reason`, `missingFields`, `unexpectedFieldCount`, `fieldTypes` 확인 |
| `identity_review / identity_contradiction` | 생성 결과가 고정 화자의 정체성과 모순됨 |
| `performance_review / review_rejected` | 행동·대사 의미 검수에서 재작성 요청 |

예를 들어 HTTP 200이라도 Provider의 출력·문맥 한도로 잘리면 다음과 같이 기록한다(필드 일부만 표시한 예시).

```json
{"event":"[추론] 재시도 예약","operation":"행동·대사 생성","attempt":1,"maxAttempts":3,"requestId":"…","stage":"finish_reason","code":"output_token_limit","reason":"출력 토큰 한도를 확인해 주세요.","finishReason":"length","completionTokens":512,"delayMs":1000,"nextAttempt":2}
```

앱은 출력 토큰 상한을 지정하지 않으며 Provider가 중단한 출력의 검증·실패 사유는 계속 기록한다. 재시도 횟수·대기 시간·출력 검증 계약은 유지한다. 이미지 판단·프롬프트 작성도 로그에 표시하지만 재시도 한도는 계속 0이다.

## 저장과 적용 시점

등록 정보는 기본 `data/providers.json`에 저장합니다. `NEWERA_PROVIDER_CONFIG`로 경로를 바꿀 수 있습니다. 파일이 없으면 기존 `models.json` 또는 `NEWERA_OEV_BASE_URL`에서 기본 OEV 주소를 사용합니다. 파일을 저장한 뒤에는 등록된 기본 Provider의 주소를 사용하므로 이후 기본 주소 수정도 Provider 관리에서 합니다.

새 작업을 접수할 때 Provider·실제 모델·주소·인증 정보와 API 옵션을 확정합니다. 실행 도중 별칭이나 서버 주소를 바꿔도 진행 중인 작업과 서버 재시작 후 자동 재개는 저장된 대상을 유지합니다. **이어서 재시도**를 누르면 현재 세션의 판단·생성 모델과 현재 Provider 설정을 다시 읽어 작업 스냅샷을 교체합니다. 같은 별칭의 실제 모델·주소·키만 바꿔도 수동 재시도부터 반영하며, 기본 설정 사용 상태라면 현재 기본 모델을 사용합니다. 확정된 사건·기억·진행 위치와 대기 중인 채팅은 유지합니다. 새 설정을 해석할 수 없으면 실패 상태와 이전 스냅샷을 보존하고 오류를 표시합니다. 기존 데이터의 작업에는 최초 자동 재개 시 이 스냅샷을 채웁니다.

이 스냅샷은 SQLite `theater_jobs.providers_json`에 서버 내부 정보로 저장합니다. **직접 입력한 API 키는 로컬 설정 파일에, 실행 시 해석한 키는 작업 스냅샷에 평문으로 저장됩니다.** 환경 변수를 사용하는 경우에도 재시도에 필요한 해석된 키가 작업에 남습니다. 이 파일들과 DB 백업은 비공개로 보관해야 합니다. Provider 키와 작업 스냅샷은 화면 데이터·세계관 내보내기·공연 기록에 포함하지 않습니다. 세계관 파일을 다른 앱 설치로 옮길 때는 Provider 등록을 별도로 준비해야 합니다.

설정 파일은 새 작업이나 수동 재시도의 호출 대상 결정 시 다시 읽고 유효한 전체 설정으로 교체합니다. 잘못된 파일은 마지막 유효 설정을 유지하며, 처음부터 잘못되었으면 오류로 표시합니다. GUI 저장은 리비전을 검사하고 다른 창에서 먼저 저장했다면 목록을 다시 불러오도록 안내합니다. 파일을 직접 수정할 때도 `revision`을 증가시킵니다. 설정 파일 경로와 서버 환경 변수의 변경은 서버 재시작이 필요합니다.


## System One과 Decision API

생성·임베딩의 `kind`와 판단의 `decisionApi`를 독립적으로 저장합니다.

| 설정 | 요청 경로 | 입력과 질문 | 응답 |
| --- | --- | --- | --- |
| `decisionApi: "systemone"` | `/systemone` | `state`, 이름별 `questions` 객체와 `criteria` | 이름별 `answers` 객체 |
| `decisionApi: "decision"` | `/decisions` | JSON 근거를 담은 문자열 `input`, 이름이 있는 `questions` 배열과 `choices` | 이름이 있는 `answers` 배열 |
| `decisionApi: "none"` | 판단 사용 안 함 | 생성·임베딩 용도만 사용 | — |

기존 설정과 작업 스냅샷에 필드가 없으면 OEV는 `systemone`, OpenAI 호환 Provider는 `none`으로 읽습니다. 진행 중 작업은 접수한 API 유형·경로·후보 한도·모델·인증 정보를 고정하며, 설정 변경은 새 작업과 수동 재시도부터 적용됩니다. HTTP 로그와 오류 진단에 `decisionApi`를 기록합니다. 새 행동·비참여·옷차림 기록에도 API 유형을 남기며 저장 슬롯·재시작·세계관 내보내기에서 보존합니다. 예전 기록의 누락된 유형은 화면에서 System One으로 표시합니다.

현재 공연에서는 행동 여부, 비참여 태도, 옷차림, 정체성·표현 검수, 삽화 여부의 **choice** 질문을 변환합니다. predicate·score를 사용하는 새 게임 기능은 이 구현에 포함되지 않습니다. 응답을 배열 위치가 아닌 질문 이름으로 연결하고, 중복·누락·알 수 없는 이름·타입·후보를 거부합니다. 거절 응답은 재시도하거나 다른 API로 바꾸지 않고 해당 판단을 실패로 알립니다. 후보가 하나뿐인 옷차림은 호스트에서 그 후보를 선택하며 요청을 보내지 않습니다.

### OpenAI Luna

Provider 관리에서 **OpenAI Luna 추가 → Provider 저장**을 누릅니다. 기본 주소는 `https://api.openai.com/v1`, API는 `decision`, 경로는 `/decisions`, 키 환경 변수는 `OPENAI_API_KEY`, 모델은 `gpt-6-luna`, 별칭 용도는 `decision`입니다. 문장 생성 모델은 별도로 선택합니다. 키 값은 화면 응답과 로그에 포함하지 않습니다.

### Geniex

**Geniex 추가 → Provider 저장 → 서버 모델 목록 가져오기 → Provider 저장** 순서로 등록합니다. 기본 주소는 `http://127.0.0.1:18181/v1`, API는 `decision`, 경로는 `/decisions`입니다. 조회한 모델은 판단·문장 생성용으로 등록되며 판단 전용으로 바꿀 수 있습니다. 인증이 필요하면 해당 서버의 키 또는 키 환경 변수를 지정합니다.

[Geniex Swagger 명세](http://127.0.0.1:18181/docs/swagger.yaml)와 현재 서버가 제공하는 경로는 복수형 `/v1/decisions`입니다. 오류가 나도 경로나 API 유형을 자동 추측해 재전송하지 않습니다.

`decisionMaxChoices`는 한 질문의 후보 수 한도입니다. 기본값과 Luna 프리셋은 255, Geniex 프리셋은 명세에 맞춰 26입니다. 후보를 임의로 자르지 않고 한도를 초과하면 오류로 알립니다. 새 설정은 API 세부 옵션에서 수정할 수 있습니다.

```json
{
  "id": "openai-luna",
  "label": "OpenAI Luna",
  "kind": "openai-compatible",
  "decisionApi": "decision",
  "decisionMaxChoices": 255,
  "baseUrl": "https://api.openai.com/v1",
  "apiKeyEnv": "OPENAI_API_KEY",
  "models": [
    { "id": "luna", "label": "Luna", "modelId": "gpt-6-luna", "task": "decision" }
  ]
}
```

이를 `providers` 배열에 추가하면 판단 모델 선택 값은 `openai-luna::luna`입니다. 기존 기본 OEV와 함께 사용할 수 있습니다. 제공자의 상세 계약은 [OpenAI Decisions API](https://developers.openai.com/api/reference/resources/decisions/methods/create)를 참고하세요.

2026-11-02에 합성한 옷차림 후보 2개로 새 어댑터를 통해 OpenAI Luna와 로컬 Geniex를 각각 실제 호출했습니다. 두 서비스 모두 HTTP 200과 허용된 후보를 반환했고 `decisionApi: "decision"` 및 입력 토큰 사용량을 확인했습니다. 실제 사용자 대화는 이 검증에 보내지 않았습니다. 이 결과는 해당 요청의 연결 검증이며 모든 게임 장면의 판단 품질을 보장하지 않습니다.

## 파일 형식

GUI가 안정적인 ID를 생성합니다. 선택 값은 `Provider ID::별칭 ID`이고 표시 이름은 자유롭게 바꿀 수 있습니다. 아래 예시의 `writer::story`를 생성 모델로 사용할 수 있습니다.

```json
{
  "version": 1,
  "revision": 1,
  "providers": [
    {
      "id": "default",
      "label": "집 OEV",
      "kind": "oev",
      "baseUrl": "http://macstudio:12821/v1",
      "apiKeyEnv": "",
      "models": [
        { "id": "judge", "label": "빠른 판단", "modelId": "gemma4-26b", "task": "generation" }
      ]
    },
    {
      "id": "writer",
      "label": "이야기 서버",
      "kind": "openai-compatible",
      "baseUrl": "http://localhost:8000/v1",
      "apiKeyEnv": "STORY_API_KEY",
      "structuredOutput": "json_schema",
      "models": [
        { "id": "story", "label": "상세 서술", "modelId": "my-story-model", "task": "generation" }
      ]
    }
  ]
}
```

Provider는 최대 32개, 각 Provider의 별칭은 최대 100개입니다. 별칭 ID는 Provider 안에서 고유해야 합니다. 기본 Provider에는 `id: "default"`, `kind: "oev"`가 필요합니다. 생략한 구조화 출력 기본값은 `json_schema`입니다.

임베딩 Provider는 `task: "embedding"` 별칭을 등록하고 `models.json`의 `embeddingModel` 또는 `NEWERA_EMBEDDING_MODEL`에 `Provider ID::별칭 ID`를 지정합니다. 기본 `embeddinggemma2`는 기존 기본 OEV를 사용합니다. 임베딩 모델과 차원은 별도 설정을 유지하며, 실제 API 주소·유형·모델이 달라지면 다른 LanceDB 테이블을 사용합니다. 각 검색은 테이블 구분과 실제 임베딩 요청에 같은 Provider 스냅샷을 사용하며 다음 검색부터 별칭 변경을 반영합니다. 모델 선택 GUI는 판단·생성용이며 임베딩 선택은 파일·환경 변수로 설정합니다.

로컬 HTTP 서버 두 개를 사용해 Provider별 실제 요청·인증, 구조화 출력 옵션, 수정·삭제 후 재시도와 서버 재시작을 검증합니다. 자동 테스트는 로컬 모의 서버를 사용하며, 별도의 Luna·Geniex 실호출 결과는 위 절에 기록합니다.
