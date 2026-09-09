# 증분 배치·경로 엔진 적용 기록

사용자가 지정한 `MindForge_Code_Modification_Guidelines_KO.txt`의 구현 지침을 적용했다. 기준은 `main` 커밋 `05bb470188168c3b0263eaee9d0b6190fa78cf04`다. 밝은 홈과 기존 편집 기능을 유지하면서, 편집마다 전체 지도를 재배열하던 배치 로직과 노드 장애물을 고려하지 않던 연결선을 교체했다.

## 구조와 책임

| 경로 | 책임 |
| --- | --- |
| `src/lib/layout-engine/types.ts`, `graph.ts` | 직렬화 가능한 입력/결과, 유한 기하와 부모 트리 검증, 반복형 순회 |
| `seed-layouts.ts`, `incremental.ts` | 기존 4모드, 크기 기반 contour 배치, 현재 좌표에서 시작하는 국소 충돌 해소, 부분 트리 경계 |
| `ports.ts`, `route-edges.ts`, `geometry.ts` | 실제 핸들 출구, 장애물 회피, 곡선·taper·화살표·라벨과 그 경계 |
| `spatial-index.ts`, `route-cache.ts` | 제한된 공간 인덱스, 비연결 장애물의 이전/새 경계에 의한 캐시 무효화 |
| `metrics.ts`, `index.ts` | 독립된 위치/경로 처리 단계, 진단과 실제 측정, 변경된 좌표만 반환 |
| `worker-client.ts`, `src/workers/layout.worker.ts` | Worker 실행/종료, 취소 Promise 완료, 동일 generator의 협력형 fallback |
| `layoutRuntime.ts`, `layoutTransactions.ts` | 문서 세션과 요청 버전, 측정 병합, 결과 검증, 사용자 동작 단위 이력 |
| `useLayoutMeasurements.ts`, `MindMapCanvas.tsx` | 줌 없는 노드/핸들 측정, 드래그와 화면 맞춤, 선택과 경로 계산 분리 |
| `MindMapEdge.tsx`, `RelationEdge.tsx`, `image.ts` | 검증한 동일 경로의 화면/클릭 영역/내보내기 사용 |

`layout.ts`는 템플릿 등 기존 호출자를 위한 동기 호환 래퍼다. 대형 편집기 작업은 Worker로 실행한다. 추가된 패키지는 테스트용 `tsx`와 `playwright`이며 런타임 의존성은 추가하지 않았다.

## 배치 규칙

- 전체 배열은 right-tree / bidirectional / vertical / radial을 지원한다. 루트 좌표를 유지하고 실제 노드 크기를 사용한다. 수평·수직 트리는 깊이별 점유 contour로 빈 공간을 줄이며 단일 자식 체인의 contour를 공유한다.
- 일반 수정은 기존 좌표에서 시작한다. 변경된 가지와 인접 형제의 충돌을 먼저 처리하고, 가지 전체의 이동을 우선 검토한 뒤 필요한 경우 작은 묶음으로 좁힌다. 관련 없는 먼 가지와 양방향의 기존 좌우 배정을 보존한다.
- 부분 배열은 선택한 루트와 외부 노드 좌표를 정확히 고정한다. 외부 노드는 여전히 장애물이다. 부분 배열 방식은 해당 노드의 선택적 `data.layoutMode`로 저장되며 후손의 연결선 방향에 적용된다.
- 접힌 후손은 삭제하거나 부모 좌표로 덮어쓰지 않는다. 접힌 조상 이동 시 같은 delta를 한 번만 적용한다. 과거 저장 데이터가 모든 숨김 자식을 부모 좌표에 겹쳐 저장한 경우 펼치기 시 해당 가지를 복구한다.
- 자유 드래그는 사용자가 놓은 위치를 유지하고 경로만 갱신한다. reparent와 그 후 정리는 드래그 한 번의 실행 취소에 포함된다.
- fixed 충돌은 `infeasible`, 연산/검색 제한 등 미해결은 `partial`, 잘못된 입력은 `invalid`, 이전 요청은 `cancelled`로 구분한다. 최종 충돌 수는 잘린 진단 목록의 길이가 아니라 실제 가시 노드 쌍을 센 값이다.

## 연결선 규칙

소스/타깃 카드는 경로 검사에서 통째로 제거하지 않는다. 측정된 핸들에서 실제 카드 경계 밖까지 빠져나오는 출구 구간만 허용한다. 포트가 카드 안쪽에 있거나 중앙이 아닌 경우도 처리한다.

빠른 후보가 실패하면 장애물 투영 좌표로 구성한 lazy grid에서 방향을 포함한 A* 탐색을 수행한다. 탐색 영역을 단계적으로 확장하되 후보 수와 확장 횟수를 제한한다. 모든 장애물 모서리를 미리 전부 연결하는 그래프를 만들지 않는다.

곡선은 적응적으로 분할해 보수적인 여유를 포함해 다시 검사한다. 둥근 모서리가 안전하지 않으면 검증된 polyline으로 돌아간다. taper는 bevel ribbon의 최대 폭을, 관계선은 화살표와 라벨 경계를 포함한다. 표시선과 클릭선·라벨 위치·내보내기는 같은 결과를 사용한다.

기존 `straight`는 strict 정책이다. 장애물을 만났다고 꺾인 선으로 의미를 바꾸지 않는다. 막힌 직선은 `blocked` 진단과 옅은 표시를 남긴다. 아직 검증되지 않은 임시 경로 역시 `unverified`로 구분한다. 라벨 간 교차와 모든 관계선 교차를 전역 최소화하는 최적화는 보장하지 않는다.

## 요청·측정·이력

Worker 요청은 documentId, documentEpoch, contentRevision, geometryRevision, requestGeneration, transactionId 여섯 값으로 검증한다. A→B→A 이동, 삭제, undo/redo, 새 입력은 이전 결과를 무효화한다. 진행 중 Worker를 종료하면 기다리던 Promise도 취소 결과로 끝난다. idle Worker는 경로 캐시를 유지한다.

React Flow의 measured/handleBounds를 사용하고 치수는 0.5 단위로 올림한다. 숨김 후손의 측정을 무조건 기다리지 않으며 폰트와 노드 스타일 변화도 반영한다. 입력 중인 노드와 드래그 중인 노드는 보호한다. 크기 측정 자체는 저장 revision이나 history를 증가시키지 않는다.

사용자 변경은 store가 소유한다. 실질적인 첫 변경에서 한 번만 이전 상태를 기록하고, 같은 동작의 후속 측정/배치가 그 결과에 합쳐진다. no-op, 편집 취소, 빈 드래그는 이력을 만들지 않는다. mode 변경과 snapshot 복원도 좌표와 함께 undo/redo한다. 노드와 관계 이름의 한글 IME 조합 중 Enter는 편집을 끝내지 않는다.

선택, 확대/축소, 포커스 모드, 발표 단계 전환은 영구 배치의 입력이 아니다. 실제 포인터 조작으로 카메라가 바뀌면 진행 중 전체 배열의 자동 화면 맞춤이 그 의도를 덮지 않는다.

## 호환성과 제한

- workspace와 JSON/share 형식은 version 1을 유지한다. 선택적 subtree mode와 snapshot mode를 보존하며 mode 없는 기존 데이터도 읽는다.
- routes, Worker 요청 번호, 공간 인덱스, 측정 핸들 캐시는 저장하지 않는다. 복제/붙여넣기에서 후손을 같은 delta로 이동시키며 내용·체크리스트·태그·관계선 메타데이터를 유지한다.
- 화면 맞춤과 PNG/SVG 경계에는 표시 중인 노드와 검증 경로의 ribbon/arrow/label 경계가 포함된다. 패널과 미니맵의 여백 처리도 유지한다.
- 초기 옵션은 nodeGap 28, levelGap 56, edgeClearance 6, curveTolerance 0.25, maxPasses 32, maxInfluenceNodes 400, 각 탐색 영역의 maxRouteExpansions 6000이다. 후보 예산은 입력 수에 따라 2백만~2천4백만으로 제한한다. 좌표 절댓값 한도는 1천만, 단일 이동/추가 확장 한도는 2백만이다.
- operations 모드는 고정 연산 예산으로 결정성을 검증한다. interactive 모드의 시간 제한 종료는 별도 사유다. 모든 가능한 그래프에 무충돌 해가 존재하거나 탐색이 항상 찾는다고 보장하지 않는다.

## 검증 재현

```sh
npm ci
npm run test:layout
npm run test:layout-integration
npm run lint
npx tsc --noEmit
npm run build
npm run bench:layout
npx playwright install chromium
npm run test:e2e
```

브라우저 검사는 같은 프로세스에서 production 서버를 시작한다. 별도 브라우저를 쓰는 환경에서는 `BROWSER_EXECUTABLE_PATH`와 JSON 배열 `BROWSER_ARGS_JSON`을 지정할 수 있다. 시스템에 한글 글꼴이 있어야 캡처가 읽을 수 있는 한글로 표시된다.

자동 검증기는 엔진의 성공 숫자만 믿지 않는다. 노드 경계는 별도 전체 쌍 검사로 확인하고, 곡선은 별도 평가식의 샘플과 ribbon/arrow 점으로 검사한다. 이는 임의의 모든 곡선에 대한 형식 증명을 뜻하지 않는다. 엔진 자체는 보수적인 적응 분할 검사를 사용한다.

정량 결과는 `verification/layout-benchmark.json`, 브라우저 결과는 `verification/layout-browser.json`에 기록한다. 캡처와 PNG/SVG는 같은 스크립트가 재생성하며 바이너리 결과를 저장소에 중복 보관하지 않는다.

## 최종 결과

2026-09-09, Linux x64 / Node 24.19.0 / Chromium 138.0.7204.0에서 검증했다.

- 엔진 55개, 실제 store/Worker 통합 18개, 총 73개 자동 검사 통과.
- production 빌드의 타입 검사·린트 통과. 홈 First Load JS는 기준 227kB에서 242kB로 증가했다.
- 360/390/768/1024/1440px에서 가로 넘침과 가시 노드 겹침 없음, 14개 노드의 13개 가지 경로 모두 검증 상태 `ok`, 브라우저 런타임 오류 없음.
- 선택/줌의 무재계산, 한글 IME, 배열 방식 undo, 긴 라벨의 국소 보정, 드래그 undo, 접기/펼치기, PNG/SVG, 저장 후 새로고침 통과. 관계선 선택·이름 변경·취소·삭제·undo도 실제 브라우저로 확인했다.
- 3,000개 맵은 추정 크기의 가져오기 이후 명시적 전체 배열로 실제 측정 크기를 반영해 겹침 없는 기준 상태를 만들었다. 계산 중 undo로 Worker를 종료하고 기존 내용을 복원하는 검사도 통과했다.

### 성능 해석과 남은 한계

`layout-benchmark.json`은 고정 seed 43의 14/200/500/1,000/3,000개 맵 × 4모드를 기록한다. 각 행의 tree edge는 N−1개, relation edge는 0개다. 3회 warm 실행의 median/p95와 별도 국소 수정 1회의 계산 시간을 기록한다. 표본이 적으므로 p95를 일반적인 응답시간 보장으로 읽으면 안 된다.

`stages`는 별도 cold-cache 실행에서 입력 변환, structuredClone, 그래프 검증, 배치, 인덱스/캐시, 경로, 기하 측정, 최종 patch 검증, 좌표 반영을 구분한다. structuredClone 값은 실제 Worker 전송시간이 아니다. 브라우저의 `workerToPaintMs`가 전송/Worker 실행/결과 렌더링을 함께 관측한다. 표시 시점은 두 번의 requestAnimationFrame으로 근사하며 GPU 완료를 직접 측정하지 않는다.

기존 `oldMs`는 기준 커밋의 위치 계산만 수행한다. 새 시간에는 장애물 경로 검증과 측정도 포함하므로 둘을 같은 작업의 속도 비교로 주장하지 않는다. 노드 bounds 면적과 경로를 포함한 render bounds 면적을 따로 기록한다. 본 fixture 범위의 기존 대비 노드 면적 증가 최대치는 약 6.8%이며 15% 검토 기준 안에 있다. 전체/국소 결과 모두 `ok`, 노드 겹침과 막힌 가지는 0이었다.

200개 맵의 실제 Enter→표시 10회는 median 약 316ms, 표본 p95 약 369ms였다. 이는 초기 목표 100ms에 미달한다. 입력 측정, debounce, React Flow의 상태 반영과 브라우저 렌더링까지 포함한 값이다. 엔진 계산 시간만으로 이 목표를 달성했다고 주장하지 않는다.

3,000개 맵의 취소 handler 실행→Worker terminate 호출은 약 0.5ms였다. 그러나 같은 undo/렌더링 구간에서 최대 약 1,003ms의 메인 스레드 긴 작업이 관측됐다. Worker 종료가 빠르다는 것이 UI 전체가 계속 60fps로 동작한다는 뜻은 아니다. 측정 시점의 main JS heap은 약 282MiB였으며 Worker/네이티브 DOM 메모리와 순간 최고치를 포함하지 않는다. 모든 데이터의 메모리 상한을 입증한 결과도 아니다.

fallback은 6ms를 목표로 generator를 양보한다. 이번 core chunk 측정의 최대값은 약 20.5ms였다. GC와 한 번의 연산 비용으로 목표를 초과할 수 있으며 JSON에 원시값을 기록했다. 실제 휴대폰은 시험하지 않았다. 대형 화면의 렌더링/메모리 최적화와 전역 라벨·관계선 교차 최소화는 다음 단계로 남는다.

매우 큰 맵은 기존 최소 줌 0.15에서 화면 전체에 들어가지 않을 수 있다. 키보드·검색으로 접근할 수 있으며 이미지 내보내기는 전체 경계를 사용한다. 저장된 위치를 우선 보존하는 초기 로딩은 국소 영향 범위를 넘는 대량 겹침을 자동 전역 배열로 덮지 않는다. 이 경우 명시적 전체 배열을 사용한다.
