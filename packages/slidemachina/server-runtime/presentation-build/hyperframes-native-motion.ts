import path from "node:path";
import { defaultAspectRatio, measureCanvasSize } from "../../shared-between-runtimes/canvas-size.ts";
import { readPresentationFile } from "../source-transforms/presentation-settings.ts";
import type { SharedChrome } from "./chrome-sharing.ts";
import { writeMotionComposition } from "./hyperframes-motion-composition.ts";
import { captureMotionFrames } from "./hyperframes-motion-frames.ts";
import { planMotionFrameSlots, type NativeMotionOptions } from "./hyperframes-motion-options.ts";
import { prepareMotionPage } from "./hyperframes-motion-page.ts";

export async function exportHyperframesNativeMotion(
  builtPagePath: string, projectFolder: string, outputFolder: string, printsHidden: boolean,
  sharedChrome: SharedChrome, motionOptions: NativeMotionOptions,
  readDurations: (projectFolder: string, stateCount: number) => number[],
): Promise<void> {
  const aspectRatio = readPresentationFile(projectFolder).aspectRatio ?? defaultAspectRatio;
  const canvasSize = measureCanvasSize(aspectRatio)!;
  const chromeBrowser = await sharedChrome.openChrome();
  const capturePage = await chromeBrowser.newPage({ viewport: { width: canvasSize.canvasWidth, height: canvasSize.canvasHeight }, reducedMotion: "no-preference" });
  try {
    const presentationStates = await prepareMotionPage(capturePage, builtPagePath, printsHidden);
    const frameSlots = planMotionFrameSlots(readDurations(projectFolder, presentationStates.length), motionOptions.frameRate);
    const capturedFrames = await captureMotionFrames({ capturePage, canvasSize, assetFolder: path.join(outputFolder, "assets"), motionOptions }, presentationStates, frameSlots);
    writeMotionComposition(outputFolder, canvasSize, motionOptions.frameRate, presentationStates, capturedFrames);
  } finally {
    await capturePage.close();
  }
}
