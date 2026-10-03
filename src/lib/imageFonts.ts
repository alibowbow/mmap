// Embed the actual loaded subsets used by the canvas, rather than every weight
// and subset of every fallback family. This keeps SVG portable without fetching
// unused fonts or depending on the receiving machine's installed fonts.
const cache = new Map<string, Promise<string>>();
const normalize = (value: string) =>
  value.replace(/["']/g, "").trim().toLowerCase();
const key = (family: string, weight: string, style: string, range: string) =>
  [
    normalize(family),
    weight === "normal" ? "400" : weight || "400",
    style || "normal",
    (range || "U+0-10FFFF").replace(/\s/g, "").toUpperCase(),
  ].join("|");

async function fontData(url: string): Promise<string> {
  if (!cache.has(url)) {
    const task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("font fetch failed");
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("font read failed"));
          reader.readAsDataURL(blob);
        });
      } finally {
        clearTimeout(timer);
      }
    })();
    cache.set(url, task);
    void task.catch(() => cache.delete(url));
  }
  return cache.get(url)!;
}

export async function loadedCanvasFontCSS(
  viewport: HTMLElement,
): Promise<string> {
  const families = new Set<string>();
  for (const el of [viewport, ...Array.from(viewport.querySelectorAll("*"))])
    for (const family of getComputedStyle(el).fontFamily.split(","))
      families.add(normalize(family));
  const loaded = new Set(
    Array.from(document.fonts)
      .filter(
        (face) =>
          face.status === "loaded" && families.has(normalize(face.family)),
      )
      .map((face) =>
        key(face.family, face.weight, face.style, face.unicodeRange),
      ),
  );
  const rules: CSSFontFaceRule[] = [];
  const collect = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const face = rule as CSSFontFaceRule,
          s = face.style;
        if (
          loaded.has(
            key(
              s.fontFamily,
              s.fontWeight,
              s.fontStyle,
              s.getPropertyValue("unicode-range"),
            ),
          )
        )
          rules.push(face);
      } else if ("cssRules" in rule)
        collect((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collect(sheet.cssRules);
    } catch {
      /* inaccessible third-party CSS */
    }
  }
  if (!rules.length)
    throw new Error("이미지에 사용할 글꼴을 찾지 못했습니다. 다시 시도하세요.");
  try {
    return (
      await Promise.all(
        rules.map(async (rule) => {
          const src = rule.style.getPropertyValue("src");
          const match = src.match(
            /url\(["']?([^"')]+)["']?\)(?:\s*format\(["']([^"']+)["']\))?/,
          );
          if (!match) throw new Error("font source unavailable");
          const data = await fontData(
            new URL(match[1], rule.parentStyleSheet?.href ?? document.baseURI)
              .href,
          );
          return rule.cssText.replace(
            /src:\s*[^;]+;/i,
            `src: url("${data}")${match[2] ? ` format("${match[2]}")` : ""};`,
          );
        }),
      )
    ).join("\n");
  } catch {
    throw new Error("이미지에 글꼴을 포함하지 못했습니다. 다시 시도하세요.");
  }
}
