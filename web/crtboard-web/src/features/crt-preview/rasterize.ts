const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** All same-origin CSS on the page, including the inline font faces. */
function pageCss(): string {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) css += rule.cssText + "\n";
    } catch {
      // Cross-origin sheets cannot be read and are not used by the CRT screen.
    }
  }
  return css;
}

/**
 * Draws a DOM element into a 2D canvas by wrapping it in an SVG
 * `foreignObject`. Every resource it uses must be inline (data URLs), which
 * keeps the canvas untainted so frames can still be read with `toBlob`.
 */
export async function rasterize(element: HTMLElement, ctx: CanvasRenderingContext2D): Promise<void> {
  const { width, height } = ctx.canvas;
  const markup = new XMLSerializer().serializeToString(element);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}">` +
    `<style><![CDATA[${pageCss().replaceAll("]]>", "]]]]><![CDATA[>")}]]></style>` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="${XHTML_NS}">${markup}</div>` +
    `</foreignObject></svg>`;

  const image = new Image(width, height);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
}
