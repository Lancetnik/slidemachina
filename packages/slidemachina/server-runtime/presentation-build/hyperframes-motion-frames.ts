import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { commandLineTexts } from "../command-line/command-line-texts.ts";
import { shootPageClip } from "./chrome-sharing.ts";
import { changeMotionPosition, finishMotionCapture, readMotionTransition, seekMotionTransition } from "./hyperframes-motion-capture.ts";
import type { MotionFrameSlot } from "./hyperframes-motion-options.ts";
import type { CapturedMotionFrames, CapturedTransition, MotionCaptureContext, MotionFrame, PresentationState } from "./hyperframes-motion-types.ts";

const millisecondsPerSecond = 1000;

async function captureMotionPicture(captureContext: MotionCaptureContext, assetName: string) {
  const { canvasWidth, canvasHeight } = captureContext.canvasSize;
  const screenshotBytes = await shootPageClip(captureContext.capturePage, { x: 0, y: 0, width: canvasWidth, height: canvasHeight, scale: 1 }, false);
  await sharp(screenshotBytes).webp({ lossless: true }).toFile(path.join(captureContext.assetFolder, assetName));
}

async function captureTransitionFrames(captureContext: MotionCaptureContext, currentState: PresentationState, currentSlot: MotionFrameSlot, stateIndex: number) {
  const { capturePage, motionOptions } = captureContext;
  const transitionDetails = await readMotionTransition(capturePage);
  const transitionSeconds = motionOptions.transitionDuration ?? transitionDetails.durationMilliseconds / millisecondsPerSecond;
  const transitionFrameCount = transitionDetails.durationMilliseconds > 0 ? Math.max(1, Math.round(transitionSeconds * motionOptions.frameRate)) : 0;
  if (transitionFrameCount >= currentSlot.frameCount) throw new Error(commandLineTexts.longHyperframesTransition);
  const framePictures: MotionFrame[] = [];
  for (let transitionFrame = 0; transitionFrame < transitionFrameCount; transitionFrame++) {
    await seekMotionTransition(capturePage, transitionFrame / transitionFrameCount);
    const assetName = `transition-${stateIndex}-${transitionFrame}.webp`;
    await captureMotionPicture(captureContext, assetName);
    framePictures.push({ assetName, firstFrame: currentSlot.firstFrame + transitionFrame, frameCount: 1, frameKind: "transition", stateIndex, slideHeading: currentState.slideHeading });
  }
  await finishMotionCapture(capturePage);
  const capturedTransition: CapturedTransition = {
    stateIndex, frameCount: transitionFrameCount,
    nativeDurationMilliseconds: transitionDetails.durationMilliseconds, animationNames: transitionDetails.animationNames,
  };
  return { framePictures, capturedTransition };
}

async function captureHoldFrame(captureContext: MotionCaptureContext, currentState: PresentationState, currentSlot: MotionFrameSlot, stateIndex: number, transitionFrameCount: number): Promise<MotionFrame> {
  const assetName = `hold-${stateIndex}.webp`;
  await captureMotionPicture(captureContext, assetName);
  return { assetName, firstFrame: currentSlot.firstFrame + transitionFrameCount, frameCount: currentSlot.frameCount - transitionFrameCount, frameKind: "hold", stateIndex, slideHeading: currentState.slideHeading };
}

export async function captureMotionFrames(captureContext: MotionCaptureContext, presentationStates: PresentationState[], frameSlots: MotionFrameSlot[]): Promise<CapturedMotionFrames> {
  const framePictures: MotionFrame[] = [];
  const capturedTransitions: CapturedTransition[] = [];
  mkdirSync(captureContext.assetFolder, { recursive: true });
  for (let stateIndex = 0; stateIndex < presentationStates.length; stateIndex++) {
    const currentState = presentationStates[stateIndex]!;
    const currentSlot = frameSlots[stateIndex]!;
    let transitionFrameCount = 0;
    if (stateIndex > 0) {
      const changesSlide = currentState.slideAddress !== presentationStates[stateIndex - 1]!.slideAddress;
      await changeMotionPosition(captureContext.capturePage, currentState.positionAddress, changesSlide);
      if (changesSlide) {
        const transitionFrames = await captureTransitionFrames(captureContext, currentState, currentSlot, stateIndex);
        transitionFrameCount = transitionFrames.capturedTransition.frameCount;
        framePictures.push(...transitionFrames.framePictures);
        capturedTransitions.push(transitionFrames.capturedTransition);
      }
    }
    framePictures.push(await captureHoldFrame(captureContext, currentState, currentSlot, stateIndex, transitionFrameCount));
  }
  return { framePictures, capturedTransitions };
}
