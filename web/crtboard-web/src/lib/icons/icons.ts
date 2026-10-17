import calendar from "./calendar.svg?raw";
import clipboard from "./clipboard.svg?raw";
import done from "./done.svg?raw";
import eye from "./eye.svg?raw";
import fileArrowUp from "./file-arrow-up.svg?raw";
import fileCross from "./file-cross.svg?raw";
import gitBranch from "./git-branch.svg?raw";
import gitFork from "./git-fork.svg?raw";
import gitForkSlash from "./git-fork-slash.svg?raw";
import gitMerge from "./git-merge.svg?raw";
import hourglass from "./hourglass.svg?raw";
import roadblock from "./roadblock.svg?raw";
import trashCan from "./trash-can.svg?raw";

interface IconAsset {
  /** Inline data URL, so the icon also renders inside the CRT snapshot. */
  url: string;
  /** Where the glyph sits inside its square, as in the Figma component. */
  inset: string;
}

function asset(svg: string, inset = "0"): IconAsset {
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, inset };
}

export const icons = {
  calendar: asset(calendar, "6.25%"),
  clipboard: asset(clipboard, "6.25% 18.75%"),
  done: asset(done),
  eye: asset(eye),
  "file-arrow-up": asset(fileArrowUp, "6.25% -0.08% 0 18.75%"),
  "file-cross": asset(fileCross, "6.25% -0.08% -0.08% 18.75%"),
  "git-branch": asset(gitBranch),
  "git-fork": asset(gitFork),
  "git-fork-slash": asset(gitForkSlash),
  "git-merge": asset(gitMerge),
  hourglass: asset(hourglass),
  roadblock: asset(roadblock),
  "trash-can": asset(trashCan),
} satisfies Record<string, IconAsset>;

export type IconName = keyof typeof icons;
