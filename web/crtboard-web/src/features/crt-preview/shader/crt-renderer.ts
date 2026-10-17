// WebGL2 runner for gingerbeardman's CRT shader
// (https://github.com/gingerbeardman/webgl-crt-shader, MIT, see LICENSE).
// Adapted from the repository's crt-webgl.js without its demo scene and
// tweak panel.
import { CRTShader } from "./CRTShader.js";

/** The demo's defaults, with one scanline per PAL field line. */
const PARAMS = {
  scanlineIntensity: 0.5,
  scanlineCount: 288,
  adaptiveIntensity: 0.3,
  brightness: 1.5,
  contrast: 1.05,
  saturation: 1.1,
  bloomIntensity: 0.5,
  bloomThreshold: 0.5,
  rgbShift: 1.0,
  vignetteStrength: 0.3,
  curvature: 0.1,
  flickerStrength: 0.01,
};

const VERTEX_SOURCE = `#version 300 es
precision highp float;
const vec2 pos[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
const vec2 uvData[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
out vec2 vUv;
void main() {
  vUv = uvData[gl_VertexID];
  gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}`;

function fragmentSource(): string {
  let body: string = CRTShader.fragmentShader;
  body = body.replace(/uniform\s+[^;]+;\s*/g, "");
  body = body.replace(/varying\s+[^;]+;\s*/g, "");
  body = body.replace(/\btDiffuse\b/g, "uTexture");
  body = body.replace(/texture2D\s*\(/g, "texture(");
  body = body.replace(/gl_FragColor/g, "fragColor");
  body = body.replace(/void main\s*\(/, "void mainImage(");
  const uniforms = Object.keys(CRTShader.uniforms)
    .filter((name) => name !== "tDiffuse")
    .map((name) => `uniform float ${name};`)
    .join("\n");
  return `#version 300 es
precision highp float;
uniform sampler2D uTexture;
${uniforms}
in vec2 vUv;
out vec4 fragColor;
${body}
void main() { mainImage(); }`;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader compile error");
  }
  return shader;
}

/**
 * Draws `source` through the CRT shader into `target` every animation frame
 * until stopped. Without WebGL2 the picture is copied as is.
 */
export function startCrtRenderer(target: HTMLCanvasElement, source: HTMLCanvasElement): () => void {
  const gl = target.getContext("webgl2", { alpha: false });
  if (!gl) return startPlainCopy(target, source);

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource()));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "program link error");
  }
  const vao = gl.createVertexArray();
  const location = (name: string) => gl.getUniformLocation(program, name);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let frame = requestAnimationFrame(function render(ts: number) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(location("uTexture"), 0);
    for (const [name, value] of Object.entries(PARAMS)) gl.uniform1f(location(name), value);
    gl.uniform1f(location("time"), ts * 0.001);
    gl.uniform1f(location("yOffset"), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    frame = requestAnimationFrame(render);
  });
  return () => cancelAnimationFrame(frame);
}

function startPlainCopy(target: HTMLCanvasElement, source: HTMLCanvasElement): () => void {
  const ctx = target.getContext("2d")!;
  let frame = requestAnimationFrame(function render() {
    ctx.drawImage(source, 0, 0, target.width, target.height);
    frame = requestAnimationFrame(render);
  });
  return () => cancelAnimationFrame(frame);
}
