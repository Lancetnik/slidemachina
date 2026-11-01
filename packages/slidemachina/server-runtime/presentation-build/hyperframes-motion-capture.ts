import type { Page } from "playwright-core";
import { commandLineTexts } from "../command-line/command-line-texts.ts";
import { waitForStillSlide } from "./cover-shooting.ts";

const transitionWaitMilliseconds = 15_000;

export type NativeMotionCapture = {
  isEnabled: boolean;
  isReady: boolean;
  captureError?: string;
  viewTransition?: ViewTransition;
  isPositionReady: boolean;
  targetAddress?: string;
  capturedAnimations: Animation[];
  previousAnimations: Set<Animation>;
  durationMilliseconds: number;
  animationNames: string[];
};
declare global { interface Window { __slidemachinaMotionCapture: NativeMotionCapture } }

export function installMotionCapture() {
  const captureWindow = window;
  const startTransition = document.startViewTransition.bind(document);
  captureWindow.__slidemachinaMotionCapture = {
    isEnabled: false, isReady: false, isPositionReady: false,
    capturedAnimations: [], previousAnimations: new Set(), durationMilliseconds: 0, animationNames: [],
  };

  document.addEventListener("slidemachina-steps", (stepsEvent) => {
    const motionCapture = captureWindow.__slidemachinaMotionCapture;
    const slideElement = stepsEvent.target as HTMLElement;
    const [slideAddress, requestedStep] = (motionCapture.targetAddress ?? "").split(".");
    const stepNumber = Number(requestedStep ?? 0);
    if (slideElement.dataset.slideAddress !== slideAddress || !slideElement.hasAttribute("data-current")) return;
    motionCapture.isPositionReady = [...slideElement.querySelectorAll<HTMLElement>("[data-step-index]")].every((stepElement) =>
      stepElement.hasAttribute("data-step-reached") === (Number(stepElement.dataset.stepIndex) <= stepNumber),
    );
  }, true);

  document.startViewTransition = (updateSlides) => {
    const viewTransition = startTransition(updateSlides);
    const motionCapture = captureWindow.__slidemachinaMotionCapture;
    if (!motionCapture.isEnabled) return viewTransition;
    motionCapture.viewTransition = viewTransition;
    // The engine adds shape and word paints in its ready handler, after this handler is registered.
    void viewTransition.ready.then(() => queueMicrotask(() => {
      try {
        motionCapture.capturedAnimations = document.getAnimations().filter((runningAnimation) => !motionCapture.previousAnimations.has(runningAnimation));
        motionCapture.durationMilliseconds = Math.max(0, ...motionCapture.capturedAnimations.map((runningAnimation) => {
          const animationEnd = Number(runningAnimation.effect?.getComputedTiming().endTime);
          return Number.isFinite(animationEnd) ? animationEnd : 0;
        }));
        motionCapture.animationNames = motionCapture.capturedAnimations.map((runningAnimation) => (runningAnimation as CSSAnimation).animationName || runningAnimation.id || "anonymous");
        for (const capturedAnimation of motionCapture.capturedAnimations) {
          capturedAnimation.pause();
          capturedAnimation.currentTime = 0;
        }
        motionCapture.isReady = true;
      } catch (captureError) {
        motionCapture.captureError = String(captureError);
      }
    }), (captureError: unknown) => { motionCapture.captureError = String(captureError); });
    return viewTransition;
  };
}

export async function changeMotionPosition(capturePage: Page, positionAddress: string, changesSlide: boolean) {
  await capturePage.evaluate(({ positionAddress, changesSlide }) => {
    window.__slidemachinaMotionCapture = {
      isEnabled: changesSlide, isReady: false, isPositionReady: false, targetAddress: positionAddress,
      capturedAnimations: [], previousAnimations: new Set(document.getAnimations()), durationMilliseconds: 0, animationNames: [],
    };
    location.hash = positionAddress;
  }, { positionAddress, changesSlide });
  if (!changesSlide) {
    await capturePage.waitForFunction(() => window.__slidemachinaMotionCapture.isPositionReady);
    await waitForStillSlide(capturePage, "[data-canvas] > [data-slide][data-current]");
  }
}

export async function readMotionTransition(capturePage: Page) {
  await capturePage.waitForFunction(() => {
    const motionCapture = window.__slidemachinaMotionCapture;
    return motionCapture.isReady || motionCapture.captureError;
  }, undefined, { timeout: transitionWaitMilliseconds });
  const transitionDetails = await capturePage.evaluate(() => {
    const motionCapture = window.__slidemachinaMotionCapture;
    return { captureError: motionCapture.captureError, durationMilliseconds: motionCapture.durationMilliseconds, animationNames: motionCapture.animationNames };
  });
  if (transitionDetails.captureError) throw new Error(commandLineTexts.failedHyperframesMotion(transitionDetails.captureError));
  return transitionDetails;
}

export async function seekMotionTransition(capturePage: Page, frameFraction: number) {
  await capturePage.evaluate((frameFraction) => {
    const motionCapture = window.__slidemachinaMotionCapture;
    for (const capturedAnimation of motionCapture.capturedAnimations) {
      capturedAnimation.pause();
      capturedAnimation.currentTime = frameFraction * motionCapture.durationMilliseconds;
    }
  }, frameFraction);
}

export async function finishMotionCapture(capturePage: Page) {
  await capturePage.evaluate(async () => {
    const motionCapture = window.__slidemachinaMotionCapture;
    motionCapture.isEnabled = false;
    for (const capturedAnimation of motionCapture.capturedAnimations) {
      try { capturedAnimation.finish(); } catch { capturedAnimation.cancel(); }
    }
    if (motionCapture.viewTransition) {
      motionCapture.viewTransition.skipTransition();
      await motionCapture.viewTransition.finished;
    }
    // The engine removes its temporary code and word wrappers when the transition finishes.
    await Promise.resolve();
  });
  await waitForStillSlide(capturePage, "[data-canvas] > [data-slide][data-current]");
}
