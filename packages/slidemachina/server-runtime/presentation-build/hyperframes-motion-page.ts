import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { commandLineTexts } from "../command-line/command-line-texts.ts";
import { waitForStillSlide } from "./cover-shooting.ts";
import { installMotionCapture } from "./hyperframes-motion-capture.ts";
import type { PresentationState } from "./hyperframes-motion-types.ts";

const currentSlideSelector = "[data-canvas] > [data-slide][data-current]";
const hiddenControlsStyle = "[data-toolbar],[data-minimap]{display:none!important}";

async function openMotionPage(capturePage: Page, presentationUrl: string) {
  await capturePage.goto(presentationUrl);
  await capturePage.addStyleTag({ content: hiddenControlsStyle });
  await waitForStillSlide(capturePage, currentSlideSelector);
}

async function readMotionStates(capturePage: Page, printsHidden: boolean): Promise<PresentationState[]> {
  await capturePage.waitForFunction(() => [...document.querySelectorAll("[data-canvas] > [data-slide]")].every((slideElement) => slideElement.hasAttribute("data-slide-address")));
  return capturePage.evaluate((includesHidden) =>
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
}

export async function prepareMotionPage(capturePage: Page, builtPagePath: string, printsHidden: boolean): Promise<PresentationState[]> {
  await capturePage.route("**/*", (interceptedRoute) => /^(file:|data:|blob:)/.test(interceptedRoute.request().url()) ? interceptedRoute.continue() : interceptedRoute.abort());
  const presentationUrl = pathToFileURL(builtPagePath).href;
  await openMotionPage(capturePage, presentationUrl);
  const presentationStates = await readMotionStates(capturePage, printsHidden);
  if (!presentationStates.length) throw new Error(commandLineTexts.emptyHyperframesPresentation);
  if (await capturePage.locator("[data-canvas] video,[data-canvas] iframe,[data-canvas] [data-scene]").count()) {
    throw new Error(commandLineTexts.unsupportedHyperframesMotionContent);
  }
  if (await capturePage.evaluate(() => location.hash.slice(1)) !== presentationStates[0]!.positionAddress) {
    await openMotionPage(capturePage, presentationUrl + "#" + presentationStates[0]!.positionAddress);
  }
  if (!await capturePage.evaluate(() => "startViewTransition" in document)) throw new Error(commandLineTexts.hyperframesMotionNeedsChrome);
  await capturePage.evaluate(installMotionCapture);
  return presentationStates;
}
