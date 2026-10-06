# MindBranch

브라우저에서 동작하는 고급 마인드맵 생산성 웹앱. 아이디어 · 리서치 · 기획 · 공부 · 투자 아이디어 · 회의 내용을 마인드맵으로 정리합니다. XMind / Miro / Obsidian Canvas / Notion / Linear / Raycast의 장점을 섞은 느낌을 목표로 합니다.

## 기술 스택

- Next.js 14 (App Router) + TypeScript + React 18
- [@xyflow/react](https://reactflow.dev) — 무한 캔버스
- Zustand — 상태 관리
- Tailwind CSS — 스타일 / 라이트·다크 테마
- lucide-react — 아이콘
- framer-motion — 애니메이션
- localStorage — 영구 저장 (`mindforge-workspace-v1`, 이전 이름 MindForge 시절의 키를 호환을 위해 유지)

## 실행 방법

```bash
npm install
npm run dev      # http://localhost:3000
# 프로덕션
npm run build && npm run start
```

## 주요 기능

- **문서 관리** — 다중 문서, 생성/복제/삭제/이름변경, 최근 수정 정렬, 템플릿 8종
- **마인드맵 편집** — 자식/형제 추가, 인라인 편집, 드래그, 접기/펼치기, 하위 트리 복제/삭제
- **다중 선택 + 일괄 편집** — Shift/⌘+클릭으로 여러 노드 선택 → 색·타입·상태 일괄 변경, 일괄 삭제
- **드래그로 부모 변경** — 노드를 다른 노드 위로 드롭하면 부모가 바뀜(드롭 대상 하이라이트), 이동·정렬도 Undo 가능
- **새 맵으로 분리(드릴다운)** — 노드를 그 자체로 새 맵의 중심(루트)으로 승격, 하위 가지를 새 문서로 이동하고 원본 노드 ↔ 새 맵을 양방향 링크(🗺 맵 열기 / ↩ 상위 맵)
- **노드 타입** — root / plain(일반·텍스트만) / idea / task / note / question / warning / link
- **노드 상태** — none / todo / doing / done / blocked, 태그, 체크리스트(진행률), 링크, 색상
- **자동 레이아웃** — 오른쪽 트리 / 양방향 / 조직도(수직) / 방사형, 전체·하위 트리 정렬
- **가지 방향 조절** — 양방향 레이아웃에서 1단계 가지마다 왼쪽/오른쪽/자동 지정(자동은 좌우 균형 분배)
- **검색/탐색** — 텍스트·설명·태그 검색, 타입/상태 필터, 아웃라인 패널
- **가져오기/내보내기** — JSON / Markdown / 텍스트 아웃라인 + 이미지(PNG·SVG)
  - 마크다운·아웃라인 텍스트 붙여넣기 → 자동 트리 변환
  - 상단바 내보내기(↓) 버튼에서 PNG/SVG 원클릭 저장, 커맨드 팔레트 "PNG 이미지로 저장"
- **노드 스타일** — 카드 / 둥근 / 윤곽선 / 라인(가지선 위 텍스트) 4종 + 색 채움(틴트) 모드
- **엣지 스타일** — 곡선 / 직각(step) / 직선 + 흐르는 점선 애니메이션 (툴바 디자인 메뉴)
- **커스텀 색상** — 팔레트 + hex 직접 선택
- **폰트 변경** — 기본/본고딕/명조/둥근/손글씨/고정폭 6종을 앱에서 제공, 문서별 디자인과 JSON에 저장
- **레벨별 글자 크기** — 중심·1단계·2단계·3단계+ 깊이별로 노드 글자 크기 조절(툴바 Aa 메뉴)
- **히스토리** — Undo / Redo, 자동 저장(디바운스), 저장 상태·시간 표시
- **손그림 보드** — 빈 종이에 직접 필기·채색, 가지 다듬기, 올가미로 함께 이동, 부분 지우기, 선택적 연결 보조
- **커맨드 팔레트** — `⌘/Ctrl + K`
- **프레젠테이션 모드** — 노드 순차 이동(데스크톱 화살표 / 모바일 스와이프)
- **반응형** — 데스크톱 / 태블릿(드로어·슬라이드오버) / 모바일(바텀시트·하단 액션바) 전용 UX

## 손그림 모드

홈의 **손그림**에서 노드 없이 바로 쓰고 그립니다. 펜·색연필·마커·형광펜·붓·유기적 가지와 종이·색·굵기를 **그리기 도구**에서 고를 수 있습니다. 화면 아래의 도구 6개와 색상을 탭하면 도구함을 열지 않고 바로 바꿉니다. 마커는 연한 색과 낮은 불투명도로 시작해 기존 글씨가 보입니다.

- **곡선 다듬기** — 선택 도구로 붓이나 유기적 가지를 고른 뒤, 시작·중간·끝 손잡이를 끌어 모양을 다듬습니다. 부분 지운 획은 곡선 편집을 지원하지 않습니다.
- **올가미** — 그림을 전체 포함하도록 둘러싸면 함께 선택됩니다. 선택한 그림 하나를 드래그하면 모두 함께 이동합니다.
- **부분 지우기 / 획 지우기** — 지우개 버튼에서 원하는 방식을 고릅니다. 부분 지우기는 획 일부를 지우고, 획 지우기는 닿은 그림이나 글씨를 통째로 지웁니다.
- **재료 필치** — 도구함에서 색연필의 종이 결, 마커의 납작한 닙, 붓의 안료 표현을 켭니다. 기존 그림의 필치는 선택해 바꾸기 전까지 유지됩니다.
- **가지 연결 보조 / 가지 위 글씨** — 가까운 가지에서 새 가지를 이어 그리거나, 가지 방향에 맞춰 글씨를 약간 기울여 놓습니다. 보조 기능은 선택 사항이며, 연결 보조는 `Alt`를 누르면 잠시 끌 수 있습니다.
- **편집 연습** — 도구함의 예제에서 **새 문서로 손그림 편집 연습 열기**를 선택해 연습합니다. 기존 문서를 덮어쓰지 않습니다.

그림·부분 지우기·이동·곡선 편집은 Undo/Redo와 자동 저장을 지원합니다. 종이와 필치는 PNG/SVG에도 포함됩니다. 실제 펜의 필압·손바닥 차단은 기기와 브라우저에 따라 다를 수 있습니다.

### JSON 호환성과 검증

기존 JSON v1–v5 그림은 원래 필치로 가져옵니다. 새 필치와 부분 지우개는 **문서 JSON v6 / ink v4**로 보관하며, 새 옵션·종이·선택한 그림의 변환·스냅샷도 JSON에 포함됩니다. 구버전 앱은 v6 파일을 지원하지 않습니다. 손그림 문서는 JSON으로 백업하세요.

```bash
npm run test:ink          # 필치·편집·JSON·저장·Undo/Redo 검증
npm run build
npm run test:editing-e2e  # 실제 브라우저의 손그림 편집 흐름 검증
npm run test:ink-tools-e2e # 빠른 도구·마커 가독성·모바일 검증
```

## 단축키

| 키 | 동작 |
| --- | --- |
| `Tab` | 자식 노드 추가 |
| `Enter` | 형제 노드 추가 |
| `Shift + Enter` | 편집 중 줄바꿈 |
| `Delete` / `Backspace` | 선택 노드 삭제 |
| `F2` | 제목 편집 |
| `⌘/Ctrl + Z` / `⌘/Ctrl + Shift + Z` | Undo / Redo |
| `⌘/Ctrl + K` | 커맨드 팔레트 |
| `⌘/Ctrl + F` | 검색 |
| `⌘/Ctrl + S` | 저장 |
| `Esc` | 선택 해제 / 닫기 |

## 폴더 구조

```
src/
  app/            layout.tsx · page.tsx · globals.css · icon.svg
  components/
    canvas/       MindMapCanvas · MindMapNode · MindMapEdge · CanvasEmptyState
    layout/       AppShell · Sidebar · Topbar · InspectorPanel
    toolbar/      FloatingToolbar · NodeContextMenu · CommandPalette
    dialogs/      ImportJsonDialog · ExportDialog · TemplateDialog · ShortcutDialog
    panels/       OutlinePanel · SearchPanel · NodeEditorFields
    mobile/       MobileBottomBar · MobileNodeSheet · MobileDocumentDrawer
                  MobileSearchOverlay · MobileMoreMenu · MobileCommandPalette
    ui/           Button · Input · Textarea · Badge · Dropdown · Modal · Tooltip · Toast · Icon
  hooks/          useMediaQuery · useIsMobile · useDebouncedEffect · useKeyboardShortcuts
  store/          mindMapStore.ts
  lib/            id · storage · layout · templates · export · tree · keyboard · commands · validation · constants · cn
  types/          mindmap.ts
```

데스크톱 인스펙터(`InspectorPanel`)와 모바일 바텀시트(`MobileNodeSheet`)는 동일한 `NodeEditorFields` 컴포넌트와 동일한 store 액션을 공유합니다.
