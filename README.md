# MindForge

브라우저에서 동작하는 고급 마인드맵 생산성 웹앱. 아이디어 · 리서치 · 기획 · 공부 · 투자 아이디어 · 회의 내용을 마인드맵으로 정리합니다. XMind / Miro / Obsidian Canvas / Notion / Linear / Raycast의 장점을 섞은 느낌을 목표로 합니다.

## 기술 스택

- Next.js 14 (App Router) + TypeScript + React 18
- [@xyflow/react](https://reactflow.dev) — 무한 캔버스
- Zustand — 상태 관리
- Tailwind CSS — 스타일 / 라이트·다크 테마
- lucide-react — 아이콘
- framer-motion — 애니메이션
- localStorage — 영구 저장 (`mindforge-workspace-v1`)

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
- **새 맵으로 분리(드릴다운)** — 노드를 그 자체로 새 맵의 중심(루트)으로 승격, 하위 가지를 새 문서로 이동하고 원본 노드 ↔ 새 맵을 양방향 링크(🗺 맵 열기 / ↩ 상위 맵)
- **노드 타입** — root / plain(일반·텍스트만) / idea / task / note / question / warning / link
- **노드 상태** — none / todo / doing / done / blocked, 태그, 체크리스트(진행률), 링크, 색상
- **자동 레이아웃** — 오른쪽 트리 / 양방향 / 조직도(수직) / 방사형, 전체·하위 트리 정렬
- **가지 방향 조절** — 양방향 레이아웃에서 1단계 가지마다 왼쪽/오른쪽/자동 지정(자동은 좌우 균형 분배)
- **검색/탐색** — 텍스트·설명·태그 검색, 타입/상태 필터, 아웃라인 패널
- **가져오기/내보내기** — JSON / Markdown / 텍스트 아웃라인 + 이미지(PNG·SVG)
  - 마크다운·아웃라인 텍스트 붙여넣기 → 자동 트리 변환
  - 상단바 내보내기(↓) 버튼에서 PNG/SVG 원클릭 저장, 커맨드 팔레트 "PNG 이미지로 저장"
- **노드 스타일** — 카드 / 둥근 / 윤곽선 / 라인(가지선 위 텍스트) 4종, 워크스페이스에 저장
- **폰트 변경** — 기본/본고딕/명조/둥근/손글씨/고정폭 6종(런타임 로드), 워크스페이스에 저장
- **레벨별 글자 크기** — 중심·1단계·2단계·3단계+ 깊이별로 노드 글자 크기 조절(툴바 Aa 메뉴)
- **히스토리** — Undo / Redo, 자동 저장(디바운스), 저장 상태·시간 표시
- **커맨드 팔레트** — `⌘/Ctrl + K`
- **프레젠테이션 모드** — 노드 순차 이동(데스크톱 화살표 / 모바일 스와이프)
- **반응형** — 데스크톱 / 태블릿(드로어·슬라이드오버) / 모바일(바텀시트·하단 액션바) 전용 UX

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
