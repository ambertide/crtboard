import handjetLatin from "@fontsource-variable/handjet/files/handjet-latin-full-normal.woff2?inline";
import handjetLatinExt from "@fontsource-variable/handjet/files/handjet-latin-ext-full-normal.woff2?inline";
import vt323Latin from "@fontsource/vt323/files/vt323-latin-400-normal.woff2?inline";
import vt323LatinExt from "@fontsource/vt323/files/vt323-latin-ext-400-normal.woff2?inline";

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

function face(family: string, src: string, range: string, weight = "400"): string {
  return `@font-face{font-family:'${family}';font-style:normal;font-display:block;font-weight:${weight};src:url(${src}) format('woff2');unicode-range:${range};}`;
}

/**
 * Font faces as inline data URLs, so the same rules work in the page and in
 * the SVG snapshot the CRT screen is rasterised from.
 */
export const fontFaceCss = [
  face("Handjet", handjetLatin, LATIN, "100 900"),
  face("Handjet", handjetLatinExt, LATIN_EXT, "100 900"),
  face("VT323", vt323Latin, LATIN),
  face("VT323", vt323LatinExt, LATIN_EXT),
].join("\n");

/** Adds the font faces to the page and resolves once both families are usable. */
export async function installFonts(): Promise<void> {
  const style = document.createElement("style");
  style.textContent = fontFaceCss;
  document.head.append(style);
  await Promise.all([document.fonts.load("20px Handjet"), document.fonts.load("24px VT323")]);
}
