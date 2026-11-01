import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { escapeHtml } from "./html-escaping.ts";
import type { CapturedMotionFrames, MotionFrame, PresentationState } from "./hyperframes-motion-types.ts";
import type { CanvasSize } from "../../shared-between-runtimes/canvas-size.ts";

const motionPageTemplate = readFileSync(new URL("./hyperframes-motion.html", import.meta.url), "utf8");
const templatePlaceholder = /\{\{(frameMarkup|frameWidth|frameHeight|totalDuration|frameRate|finalFrame)\}\}/g;

export function composeNativeMotion(framePictures: MotionFrame[], frameWidth: number, frameHeight: number, frameRate: number): string {
  const finalPicture = framePictures.at(-1)!;
  const totalFrames = finalPicture.firstFrame + finalPicture.frameCount;
  const frameMarkup = framePictures.map((framePicture, pictureIndex) =>
    `<img id="native-${pictureIndex}" class="clip" src="assets/${framePicture.assetName}" alt="${escapeHtml(framePicture.slideHeading)}" data-start="${framePicture.firstFrame / frameRate}" data-duration="${framePicture.frameCount / frameRate}" data-track-index="0" data-start-frame="${framePicture.firstFrame}" data-frame-count="${framePicture.frameCount}" data-state="${framePicture.stateIndex}" data-kind="${framePicture.frameKind}">`,
  ).join("\n");
  const templateValues: Record<string, string | number> = {
    frameMarkup, frameWidth, frameHeight, frameRate,
    totalDuration: totalFrames / frameRate, finalFrame: totalFrames - 1,
  };
  return motionPageTemplate.replace(templatePlaceholder, (_, placeholderName: string) => String(templateValues[placeholderName]));
}

export function writeMotionComposition(
  outputFolder: string, canvasSize: CanvasSize, frameRate: number,
  presentationStates: PresentationState[], capturedFrames: CapturedMotionFrames,
) {
  const { framePictures, capturedTransitions } = capturedFrames;
  const { canvasWidth, canvasHeight } = canvasSize;
  writeFileSync(path.join(outputFolder, "index.html"), composeNativeMotion(framePictures, canvasWidth, canvasHeight, frameRate));
  const finalPicture = framePictures.at(-1)!;
  writeFileSync(path.join(outputFolder, "motion.json"), JSON.stringify({
    motion: "native", fps: frameRate, width: canvasWidth, height: canvasHeight,
    totalFrames: finalPicture.firstFrame + finalPicture.frameCount,
    states: presentationStates, frames: framePictures, transitions: capturedTransitions,
  }, null, 2));
}
