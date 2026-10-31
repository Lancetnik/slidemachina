import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { defaultAspectRatio, measureCanvasSize } from "../../shared-between-runtimes/canvas-size.ts";
import { commandLineTexts } from "../command-line/command-line-texts.ts";
import { readPresentationFile } from "../source-transforms/presentation-settings.ts";
import { shootPageClip, type SharedChrome } from "./chrome-sharing.ts";
import { waitForStillSlide } from "./cover-shooting.ts";
import { finishMotionCapture, installMotionCapture } from "./hyperframes-motion-capture.ts";
import { composeNativeMotion, type MotionFrame } from "./hyperframes-motion-composition.ts";
import { planMotionFrameSlots, type NativeMotionOptions } from "./hyperframes-motion-options.ts";

const millisecondsPerSecond = 1000;
const transitionWaitMilliseconds = 15_000;
const currentSlideSelector = "[data-canvas] > [data-slide][data-current]";
const hiddenControlsStyle = "[data-toolbar],[data-minimap]{display:none!important}";

type PresentationState = { positionAddress: string; slideAddress: string; slideHeading: string };
type CapturedTransition = { stateIndex: number; frameCount: number; nativeDurationMilliseconds: number; animationNames: string[] };

export async function exportHyperframesNativeMotion(
  builtPagePath: string, projectFolder: string, outputFolder: string, printsHidden: boolean,
  sharedChrome: SharedChrome, motionOptions: NativeMotionOptions,
  readDurations: (projectFolder: string, stateCount: number) => number[],
): Promise<void> {
  const aspectRatio = readPresentationFile(projectFolder).aspectRatio ?? defaultAspectRatio;
  const canvasSize = measureCanvasSize(aspectRatio)!;
  const { canvasWidth, canvasHeight } = canvasSize;
  const chromeBrowser = await sharedChrome.openChrome();
  const capturePage = await chromeBrowser.newPage({ viewport: { width: canvasWidth, height: canvasHeight }, reducedMotion: "no-preference" });
  const framePictures: MotionFrame[] = [];
  const capturedTransitions: CapturedTransition[] = [];
  const assetFolder = path.join(outputFolder, "assets");
  mkdirSync(assetFolder, { recursive: true });
  try {
    await capturePage.route("**/*", (interceptedRoute) => /^(file:|data:|blob:)/.test(interceptedRoute.request().url()) ? interceptedRoute.continue() : interceptedRoute.abort());
    const presentationUrl = pathToFileURL(builtPagePath).href;
    await capturePage.goto(presentationUrl);
    await capturePage.addStyleTag({ content: hiddenControlsStyle });
    await waitForStillSlide(capturePage, currentSlideSelector);
    await capturePage.waitForFunction(() => [...document.querySelectorAll("[data-canvas] > [data-slide]")].every((slideElement) => slideElement.hasAttribute("data-slide-address")));
    const presentationStates: PresentationState[] = await capturePage.evaluate((includesHidden) =>
      [...document.querySelectorAll<HTMLElement>("[data-canvas] > [data-slide]")].flatMap((slideElement) => {
        if (!includesHidden && slideElement.hasAttribute("data-hidden")) return [];
        const slideAddress = slideElement.dataset.slideAddress!;
        const stepCount = Math.max(0, ...[...slideElement.querySelectorAll<HTMLElement>("[data-step-index]")].map((stepElement) => Number(stepElement.dataset.stepIndex)));
        return Array.from({ length: stepCount + 1 }, (_, stepNumber) => ({
          positionAddress: slideAddress + (stepNumber ? `.${stepNumber}` : ""),
          slideAddress,
          slideHeading: slideElement.querySelector("h1,h2")?.textContent.trim() ?? "",
        }));
      }), printsHidden,
    );
    if (!presentationStates.length) throw new Error(commandLineTexts.emptyHyperframesPresentation);
    if (await capturePage.locator("[data-canvas] video,[data-canvas] iframe,[data-canvas] [data-scene]").count()) {
      throw new Error(commandLineTexts.unsupportedHyperframesMotionContent);
    }
    const frameSlots = planMotionFrameSlots(readDurations(projectFolder, presentationStates.length), motionOptions.frameRate);
    if (await capturePage.evaluate(() => location.hash.slice(1)) !== presentationStates[0]!.positionAddress) {
      await capturePage.goto(presentationUrl + "#" + presentationStates[0]!.positionAddress);
      await capturePage.addStyleTag({ content: hiddenControlsStyle });
      await waitForStillSlide(capturePage, currentSlideSelector);
    }
    if (!await capturePage.evaluate(() => "startViewTransition" in document)) throw new Error(commandLineTexts.hyperframesMotionNeedsChrome);
    await capturePage.evaluate(installMotionCapture);
    const capturePicture = async (assetName: string) => {
      const screenshotBytes = await shootPageClip(capturePage, { x: 0, y: 0, width: canvasWidth, height: canvasHeight, scale: 1 }, false);
      await sharp(screenshotBytes).webp({ lossless: true }).toFile(path.join(assetFolder, assetName));
    };
    for (let stateIndex = 0; stateIndex < presentationStates.length; stateIndex++) {
      const currentState = presentationStates[stateIndex]!;
      const currentSlot = frameSlots[stateIndex]!;
      let transitionFrameCount = 0;
      if (stateIndex > 0) {
        const changesSlide = currentState.slideAddress !== presentationStates[stateIndex - 1]!.slideAddress;
        await capturePage.evaluate(({ positionAddress, changesSlide }) => {
          window.__slidemachinaMotionCapture = {
            isEnabled: changesSlide, isReady: false, isPositionReady: false, targetAddress: positionAddress,
            capturedAnimations: [], previousAnimations: new Set(document.getAnimations()), durationMilliseconds: 0, animationNames: [],
          };
          location.hash = positionAddress;
        }, { positionAddress: currentState.positionAddress, changesSlide });
        if (changesSlide) {
          await capturePage.waitForFunction(() => {
            const motionCapture = window.__slidemachinaMotionCapture;
            return motionCapture.isReady || motionCapture.captureError;
          }, undefined, { timeout: transitionWaitMilliseconds });
          const transitionDetails = await capturePage.evaluate(() => {
            const motionCapture = window.__slidemachinaMotionCapture;
            return { captureError: motionCapture.captureError, durationMilliseconds: motionCapture.durationMilliseconds, animationNames: motionCapture.animationNames };
          });
          if (transitionDetails.captureError) throw new Error(commandLineTexts.failedHyperframesMotion(transitionDetails.captureError));
          const transitionSeconds = motionOptions.transitionDuration ?? transitionDetails.durationMilliseconds / millisecondsPerSecond;
          transitionFrameCount = transitionDetails.durationMilliseconds > 0 ? Math.max(1, Math.round(transitionSeconds * motionOptions.frameRate)) : 0;
          if (transitionFrameCount >= currentSlot.frameCount) throw new Error(commandLineTexts.longHyperframesTransition);
          for (let transitionFrame = 0; transitionFrame < transitionFrameCount; transitionFrame++) {
            await capturePage.evaluate((frameFraction) => {
              const motionCapture = window.__slidemachinaMotionCapture;
              for (const capturedAnimation of motionCapture.capturedAnimations) {
                capturedAnimation.pause();
                capturedAnimation.currentTime = frameFraction * motionCapture.durationMilliseconds;
              }
            }, transitionFrame / transitionFrameCount);
            const assetName = `transition-${stateIndex}-${transitionFrame}.webp`;
            await capturePicture(assetName);
            framePictures.push({ assetName, firstFrame: currentSlot.firstFrame + transitionFrame, frameCount: 1, frameKind: "transition", stateIndex, slideHeading: currentState.slideHeading });
          }
          capturedTransitions.push({ stateIndex, frameCount: transitionFrameCount, nativeDurationMilliseconds: transitionDetails.durationMilliseconds, animationNames: transitionDetails.animationNames });
          await finishMotionCapture(capturePage);
        } else {
          await capturePage.waitForFunction(() => window.__slidemachinaMotionCapture.isPositionReady);
          await waitForStillSlide(capturePage, currentSlideSelector);
        }
      }
      const assetName = `hold-${stateIndex}.webp`;
      await capturePicture(assetName);
      framePictures.push({ assetName, firstFrame: currentSlot.firstFrame + transitionFrameCount, frameCount: currentSlot.frameCount - transitionFrameCount, frameKind: "hold", stateIndex, slideHeading: currentState.slideHeading });
    }
    writeFileSync(path.join(outputFolder, "index.html"), composeNativeMotion(framePictures, canvasWidth, canvasHeight, motionOptions.frameRate));
    const finalPicture = framePictures.at(-1)!;
    writeFileSync(path.join(outputFolder, "motion.json"), JSON.stringify({
      motion: "native", fps: motionOptions.frameRate, width: canvasWidth, height: canvasHeight,
      totalFrames: finalPicture.firstFrame + finalPicture.frameCount,
      states: presentationStates, frames: framePictures, transitions: capturedTransitions,
    }, null, 2));
  } finally {
    await capturePage.close();
  }
}
