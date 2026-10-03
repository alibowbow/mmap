import { FONT_OPTIONS } from "./constants";

const families: Record<string, string> = {
  inter: "Pretendard Variable",
  noto: "Noto Sans KR",
  myeongjo: "Nanum Myeongjo",
  jua: "Jua",
  gaegu: "Gaegu",
  mono: "JetBrains Mono",
};

// check() alone returns true for an unknown family (system fallback). Require
// actual loaded FontFaces, including the subsets needed by this document.
export async function ensureDocumentFont(
  id: string,
  text = "한글 ABC",
): Promise<void> {
  if (typeof document === "undefined") return;
  const option = FONT_OPTIONS.find((f) => f.id === id);
  const family = families[id];
  if (!family || !document.fonts)
    throw new Error("선택한 글꼴을 확인할 수 없습니다.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const groups = await Promise.race([
      Promise.all(
        [400, 700].map((weight) =>
          document.fonts.load(`${weight} 16px "${family}"`, "한글 ABC " + text),
        ),
      ).then(async (groups) => {
        await document.fonts.ready;
        return groups;
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("font timeout")), 10_000);
      }),
    ]);
    if (
      groups.some(
        (faces) =>
          !faces.length || faces.some((face) => face.status !== "loaded"),
      )
    )
      throw new Error("font unavailable");
  } catch {
    throw new Error(
      `${option?.label ?? id} 글꼴을 불러오지 못했습니다. 연결을 확인하거나 다른 글꼴을 선택한 뒤 다시 저장하세요.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
