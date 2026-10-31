import { escapeHtml } from "./html-escaping.ts";
import type { MotionFrameSlot } from "./hyperframes-motion-options.ts";

export type MotionFrame = MotionFrameSlot & { assetName: string; frameKind: "hold" | "transition"; stateIndex: number; slideHeading: string };

export function composeNativeMotion(framePictures: MotionFrame[], frameWidth: number, frameHeight: number, frameRate: number): string {
  const finalPicture = framePictures.at(-1)!;
  const totalFrames = finalPicture.firstFrame + finalPicture.frameCount;
  const frameMarkup = framePictures.map((framePicture, pictureIndex) =>
    `<img id="native-${pictureIndex}" class="clip" src="assets/${framePicture.assetName}" alt="${escapeHtml(framePicture.slideHeading)}" data-start="${framePicture.firstFrame / frameRate}" data-duration="${framePicture.frameCount / frameRate}" data-track-index="0" data-start-frame="${framePicture.firstFrame}" data-frame-count="${framePicture.frameCount}" data-state="${framePicture.stateIndex}" data-kind="${framePicture.frameKind}">`,
  ).join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>slidemachina</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}
#presentation{position:relative;width:${frameWidth}px;height:${frameHeight}px}
.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.clip[hidden]{display:none}
</style></head>
<body>
<div id="presentation" data-composition-id="presentation" data-start="0" data-duration="${totalFrames / frameRate}" data-fps="${frameRate}" data-width="${frameWidth}" data-height="${frameHeight}" data-no-timeline>
${frameMarkup}
</div>
<script>
function showPresentationFrame(currentSeconds) {
  const currentFrame = Math.min(${totalFrames - 1}, Math.max(0, Math.floor(currentSeconds * ${frameRate} + 1e-6)));
  for (const frameElement of document.querySelectorAll("#presentation > img.clip")) {
    const firstFrame = Number(frameElement.dataset.startFrame);
    frameElement.hidden = currentFrame < firstFrame || currentFrame >= firstFrame + Number(frameElement.dataset.frameCount);
  }
}
window.addEventListener("hf-seek", (seekEvent) => showPresentationFrame(seekEvent.detail.time));
showPresentationFrame(0);
</script>
</body></html>`;
}
