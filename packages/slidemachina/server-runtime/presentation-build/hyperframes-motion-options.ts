import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { commandLineTexts } from "../command-line/command-line-texts.ts";

const defaultMotionFrameRate = 30;
const maximumMotionFrameRate = 60;

export type NativeMotionOptions = { frameRate: number; transitionDuration?: number };
export type MotionFrameSlot = { firstFrame: number; frameCount: number };

export function readNativeMotionOptions(projectFolder: string): NativeMotionOptions | undefined {
  const schedulePath = path.join(projectFolder, "hyperframes.json");
  if (!existsSync(schedulePath)) return;
  let scheduleContent: unknown;
  try {
    scheduleContent = JSON.parse(readFileSync(schedulePath, "utf8"));
  } catch {
    // The still exporter reports the existing schedule error, including its expected state count.
    return;
  }
  if (typeof scheduleContent !== "object" || scheduleContent === null || !("motion" in scheduleContent)) return;
  if (scheduleContent.motion === "still") return;
  if (scheduleContent.motion !== "native") throw new Error(commandLineTexts.invalidHyperframesMotion);
  const frameRate = "fps" in scheduleContent ? scheduleContent.fps : defaultMotionFrameRate;
  if (typeof frameRate !== "number" || !Number.isInteger(frameRate) || frameRate < 1 || frameRate > maximumMotionFrameRate) {
    throw new Error(commandLineTexts.invalidHyperframesFrameRate);
  }
  const transitionDuration = "transitionDuration" in scheduleContent ? scheduleContent.transitionDuration : undefined;
  if (transitionDuration !== undefined && (typeof transitionDuration !== "number" || !Number.isFinite(transitionDuration) || transitionDuration <= 0)) {
    throw new Error(commandLineTexts.invalidHyperframesTransitionDuration);
  }
  return { frameRate, transitionDuration };
}

export function planMotionFrameSlots(frameDurations: number[], frameRate: number): MotionFrameSlot[] {
  let elapsedSeconds = 0;
  let previousBoundary = 0;
  return frameDurations.map((frameDuration) => {
    elapsedSeconds += frameDuration;
    // Cumulative boundaries keep fractional durations from accumulating rounding errors.
    const finalBoundary = Math.round(elapsedSeconds * frameRate);
    const frameSlot = { firstFrame: previousBoundary, frameCount: finalBoundary - previousBoundary };
    if (frameSlot.frameCount < 1) throw new Error(commandLineTexts.shortHyperframesMotionState);
    previousBoundary = finalBoundary;
    return frameSlot;
  });
}
