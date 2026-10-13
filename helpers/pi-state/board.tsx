// Stylised top-down drawings of Raspberry Pi boards, chosen from the model
// string the device reports (/proc/device-tree/model). Not to exact scale;
// enough to tell the families apart at sidebar size.
import type { ReactNode } from "react";

export type BoardFamily =
  | "pi5"
  | "pi4"
  | "pi3"
  | "pi3a"
  | "zero"
  | "keyboard"
  | "cm"
  | "generic";

export function boardFamily(model: string): BoardFamily {
  const m = model.toLowerCase();
  if (m.includes("compute module")) return "cm";
  if (/raspberry pi [45]00\b/.test(m)) return "keyboard";
  if (m.includes("zero")) return "zero";
  if (/raspberry pi 5\b/.test(m)) return "pi5";
  if (/raspberry pi 4\b/.test(m)) return "pi4";
  if (/raspberry pi 3 model a/.test(m)) return "pi3a";
  if (/raspberry pi (3|2)\b/.test(m)) return "pi3";
  return "generic";
}

const PCB = "#1f7a45";
const PCB_EDGE = "#14532d";
const METAL = "#c9ced6";
const METAL_DARK = "#8b939e";
const CHIP = "#22262c";
const GOLD = "#d4a72c";

function Pcb({ width, height }: { width: number; height: number }) {
  return (
    <rect
      x={1}
      y={1}
      width={width - 2}
      height={height - 2}
      rx={12}
      fill={PCB}
      stroke={PCB_EDGE}
      strokeWidth={2}
    />
  );
}

function Holes({ points }: { points: [number, number][] }) {
  return (
    <>
      {points.map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={8}
          fill="#0b0d10"
          stroke={GOLD}
          strokeWidth={3}
        />
      ))}
    </>
  );
}

/** 2×20 GPIO header starting at (x, y). */
function Gpio({ x, y, pitch = 10 }: { x: number; y: number; pitch?: number }) {
  const pins: ReactNode[] = [];
  for (let col = 0; col < 20; col++) {
    for (let row = 0; row < 2; row++) {
      pins.push(
        <rect
          key={`${col}-${row}`}
          x={x + 3 + col * pitch}
          y={y + 3 + row * pitch}
          width={4}
          height={4}
          fill={GOLD}
        />,
      );
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={pitch * 20} height={pitch * 2} fill="#111" rx={1} />
      {pins}
    </g>
  );
}

function Chip({
  x,
  y,
  size,
  label,
  metal,
}: {
  x: number;
  y: number;
  size: number;
  label?: string;
  metal?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={3}
        fill={metal ? METAL : CHIP}
        stroke={metal ? METAL_DARK : "#000"}
        strokeWidth={1.5}
      />
      {label ? (
        <text
          x={x + size / 2}
          y={y + size / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fontFamily="ui-monospace, monospace"
          fill={metal ? "#4b5563" : "#9ca3af"}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** A port block hanging off the right edge. */
function RightPort({
  y,
  height,
  kind,
}: {
  y: number;
  height: number;
  kind: "usb2" | "usb3" | "eth";
}) {
  const x = 262;
  const width = 84;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2}
        fill={METAL}
        stroke={METAL_DARK}
        strokeWidth={1.5}
      />
      {kind === "eth" ? (
        <rect x={x + 30} y={y + 10} width={50} height={height - 20} fill="#2a2f36" />
      ) : (
        <>
          <rect x={x + 30} y={y + 8} width={50} height={height / 2 - 12} fill={kind === "usb3" ? "#2563eb" : "#1f2937"} />
          <rect x={x + 30} y={y + height / 2 + 4} width={50} height={height / 2 - 12} fill={kind === "usb3" ? "#2563eb" : "#1f2937"} />
        </>
      )}
    </g>
  );
}

/** A port on the bottom edge, centred at x. */
function BottomPort({ x, width, height = 18 }: { x: number; width: number; height?: number }) {
  return (
    <rect
      x={x - width / 2}
      y={222 - height + 6}
      width={width}
      height={height}
      rx={3}
      fill={METAL}
      stroke={METAL_DARK}
      strokeWidth={1.5}
    />
  );
}

function AudioJack({ x }: { x: number }) {
  return (
    <g>
      <rect x={x - 12} y={192} width={24} height={34} rx={3} fill="#111" />
      <circle cx={x} cy={220} r={5} fill="#444" />
    </g>
  );
}

const B_HOLES: [number, number][] = [
  [14, 14],
  [246, 14],
  [14, 210],
  [246, 210],
];

/** Pi Model B layout, 85 × 56 mm at 4 px/mm. */
function ModelB({ family }: { family: "pi5" | "pi4" | "pi3" | "generic" }) {
  return (
    <svg viewBox="0 0 350 232" role="img">
      <Pcb width={340} height={224} />
      <Holes points={B_HOLES} />
      <Gpio x={30} y={4} />
      {family === "pi5" ? (
        <>
          <RightPort y={8} height={56} kind="usb2" />
          <RightPort y={74} height={56} kind="usb3" />
          <RightPort y={140} height={70} kind="eth" />
          <Chip x={80} y={70} size={66} label="BCM2712" metal />
          <Chip x={170} y={110} size={44} label="RP1" />
          <rect x={80} y={150} width={66} height={30} rx={2} fill={CHIP} />
          <BottomPort x={46} width={36} />
          <BottomPort x={110} width={28} />
          <BottomPort x={160} width={28} />
          <rect x={4} y={78} width={14} height={64} fill="#e5e7eb" stroke="#9ca3af" />
          <rect x={210} y={196} width={18} height={14} rx={2} fill="#111" />
        </>
      ) : family === "pi4" ? (
        <>
          <RightPort y={8} height={70} kind="eth" />
          <RightPort y={86} height={56} kind="usb3" />
          <RightPort y={150} height={56} kind="usb2" />
          <Chip x={84} y={66} size={64} label="BCM2711" metal />
          <rect x={160} y={74} width={56} height={44} rx={2} fill={CHIP} />
          <BottomPort x={44} width={36} />
          <BottomPort x={100} width={28} />
          <BottomPort x={146} width={28} />
          <AudioJack x={200} />
          <rect x={4} y={84} width={14} height={60} fill="#e5e7eb" stroke="#9ca3af" />
        </>
      ) : (
        <>
          <RightPort y={8} height={56} kind="usb2" />
          <RightPort y={74} height={56} kind="usb2" />
          <RightPort y={140} height={70} kind="eth" />
          <Chip x={90} y={70} size={60} label={family === "pi3" ? "BCM2837" : "SoC"} metal />
          <BottomPort x={40} width={30} height={14} />
          <BottomPort x={128} width={60} height={22} />
          <AudioJack x={210} />
          <rect x={4} y={84} width={14} height={60} fill="#e5e7eb" stroke="#9ca3af" />
        </>
      )}
    </svg>
  );
}

/** Model 3 A+: 65 × 56 mm, one USB port, no Ethernet. */
function ModelA() {
  return (
    <svg viewBox="0 0 290 232" role="img">
      <Pcb width={260} height={224} />
      <Holes points={B_HOLES} />
      <Gpio x={30} y={4} />
      <rect x={210} y={70} width={76} height={60} rx={2} fill={METAL} stroke={METAL_DARK} strokeWidth={1.5} />
      <rect x={240} y={86} width={40} height={28} fill="#1f2937" />
      <Chip x={90} y={70} size={60} label="BCM2837" metal />
      <BottomPort x={40} width={30} height={14} />
      <BottomPort x={128} width={60} height={22} />
      <AudioJack x={200} />
    </svg>
  );
}

/** Zero form factor, 65 × 30 mm. */
function Zero() {
  return (
    <svg viewBox="0 0 270 130" role="img">
      <Pcb width={260} height={120} />
      <Holes points={[[14, 14], [246, 14], [14, 106], [246, 106]]} />
      <Gpio x={30} y={4} />
      <Chip x={104} y={42} size={52} label="RP3A0" metal />
      <rect x={30} y={102} width={30} height={18} rx={3} fill={METAL} stroke={METAL_DARK} />
      <rect x={160} y={106} width={22} height={14} rx={3} fill={METAL} stroke={METAL_DARK} />
      <rect x={200} y={106} width={22} height={14} rx={3} fill={METAL} stroke={METAL_DARK} />
      <rect x={250} y={36} width={12} height={48} fill="#e5e7eb" stroke="#9ca3af" />
    </svg>
  );
}

/** Pi 400 / 500: the keyboard computer. */
function Keyboard() {
  const keys: ReactNode[] = [];
  const rows = [14, 14, 13, 12, 11];
  rows.forEach((count, row) => {
    const width = 300 / 14;
    const offset = (14 - count) * width * 0.5;
    for (let i = 0; i < count; i++) {
      keys.push(
        <rect
          key={`${row}-${i}`}
          x={20 + offset + i * width + 1.5}
          y={30 + row * 22 + 1.5}
          width={width - 3}
          height={19}
          rx={3}
          fill="#f8fafc"
          stroke="#d4d4d8"
        />,
      );
    }
  });
  return (
    <svg viewBox="0 0 340 170" role="img">
      <rect x={2} y={10} width={336} height={150} rx={14} fill="#ef4444" />
      <rect x={10} y={18} width={320} height={136} rx={10} fill="#ffffff" />
      {keys}
      <rect x={110} y={140} width={120} height={10} rx={3} fill="#f8fafc" stroke="#d4d4d8" />
    </svg>
  );
}

/** Compute Module: a bare module with its board-to-board connectors. */
function ComputeModule() {
  return (
    <svg viewBox="0 0 230 160" role="img">
      <Pcb width={220} height={150} />
      <Holes points={[[12, 12], [208, 12], [12, 138], [208, 138]]} />
      <Chip x={40} y={40} size={60} label="SoC" metal />
      <rect x={120} y={44} width={60} height={30} rx={2} fill={CHIP} />
      <rect x={120} y={84} width={60} height={20} rx={2} fill={CHIP} />
      <rect x={30} y={118} width={70} height={14} fill="#e5e7eb" stroke="#9ca3af" />
      <rect x={120} y={118} width={70} height={14} fill="#e5e7eb" stroke="#9ca3af" />
    </svg>
  );
}

export function BoardPicture({ model }: { model: string }) {
  const family = boardFamily(model);
  switch (family) {
    case "pi5":
    case "pi4":
    case "pi3":
    case "generic":
      return <ModelB family={family} />;
    case "pi3a":
      return <ModelA />;
    case "zero":
      return <Zero />;
    case "keyboard":
      return <Keyboard />;
    case "cm":
      return <ComputeModule />;
  }
}
