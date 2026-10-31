import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { commandLineScript, examplesFolder } from "./test-helpers.ts";

const runCommand = promisify(execFile);
const testFrameRate = 10;
const expectedFrameCount = 60;
const testedTimestamps = [0, 1.1, 2, 2.1, 2.2, 2.3, 2.5, 2.6, 6];

type ExportedMotion = {
  totalFrames: number;
  states: Array<{ slideHeading: string }>;
  frames: Array<{ assetName: string; firstFrame: number; frameCount: number; frameKind: string; stateIndex: number }>;
  transitions: Array<{ frameCount: number; animationNames: string[] }>;
};

async function seekComposition(compositionPage: Page, currentSeconds: number) {
  await compositionPage.evaluate((seekSeconds) => window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: seekSeconds } })), currentSeconds);
  await expect(compositionPage.locator("img.clip:not([hidden])")).toHaveCount(1);
  return compositionPage.screenshot();
}

test("HyperFrames native motion: words, code, cards, steps, timing and reversible seeking", async ({ page }) => {
  test.setTimeout(180_000);
  const repositoryFolder = await mkdtemp(path.join(examplesFolder, "hyperframes-motion-"));
  const projectFolder = path.join(repositoryFolder, "sample-talk");
  const outputFolder = await mkdtemp(path.join(os.tmpdir(), "slidemachina-motion-"));
  const compositionFolder = path.join(outputFolder, "sample-talk-hyperframes");
  const schedulePath = path.join(projectFolder, "hyperframes.json");
  const buildArguments = [commandLineScript, "build", projectFolder, "--hyperframes", "--no-hidden", "--out", outputFolder];
  try {
    await mkdir(projectFolder);
    await writeFile(path.join(projectFolder, "index.tsx"), `
import { Code, Presentation, Slide } from "slidemachina";
export default <Presentation aspectRatio="4:3" transition="morph" progress={false}>
  <Slide plain>
    <h2>Test your handler.</h2>
    <Code lang="python" lines="|2">{"def handle(message):\\n    return message"}</Code>
    <div morph="broker-card" className="broker-card">Message broker</div>
  </Slide>
  <Slide hidden><h2>Hidden frame</h2></Slide>
  <Slide plain className="incoming-slide">
    <h2>Test your handler. In memory.</h2>
    <Code lang="python">{"def handle(message):\\n    return message\\n\\nassert handle('hello') == 'hello'"}</Code>
    <div morph="broker-card" className="broker-card">Test broker</div>
  </Slide>
</Presentation>;
`);
    await writeFile(path.join(projectFolder, "style.css"), `
:root { --heading-size: 64px; }
.broker-card { position:absolute; right:80px; top:360px; width:300px; padding:30px; border:3px solid black; background:#d5ff45; }
.incoming-slide .broker-card { top:720px; right:160px; width:400px; border-radius:30px; background:#9e7bff; }
.incoming-slide h2 { font-size:54px; }
`);
    await writeFile(schedulePath, JSON.stringify({ durations: [1.05, 0.95, 4], motion: "native", fps: testFrameRate, transitionDuration: 0.6 }));
    await runCommand(process.execPath, buildArguments).catch((commandError) => { throw new Error(`${commandError.stdout}\n${commandError.stderr}`); });
    const exportedMotion = JSON.parse(await readFile(path.join(compositionFolder, "motion.json"), "utf8")) as ExportedMotion;
    expect(exportedMotion.totalFrames).toBe(expectedFrameCount);
    expect(exportedMotion.states.map((exportedState) => exportedState.slideHeading.replace(/\s+/g, " "))).toEqual(["Test your handler.", "Test your handler.", "Test your handler. In memory."]);
    expect(exportedMotion.transitions).toHaveLength(1);
    expect(exportedMotion.transitions[0]!.frameCount).toBe(6);
    const animationNames = exportedMotion.transitions[0]!.animationNames.join(" ");
    expect(animationNames).toContain("code-piece");
    expect(animationNames).toContain("morph-word");
    expect(animationNames).toMatch(/morph-\d/);
    let nextFrameNumber = 0;
    for (const exportedFrame of exportedMotion.frames) {
      expect(exportedFrame.firstFrame).toBe(nextFrameNumber);
      expect(exportedFrame.frameCount).toBeGreaterThan(0);
      nextFrameNumber += exportedFrame.frameCount;
    }
    expect(nextFrameNumber).toBe(expectedFrameCount);
    const holdPictures = exportedMotion.frames.filter((exportedFrame) => exportedFrame.frameKind === "hold");
    const initialPicture = await readFile(path.join(compositionFolder, "assets", holdPictures[0]!.assetName));
    const steppedPicture = await readFile(path.join(compositionFolder, "assets", holdPictures[1]!.assetName));
    expect(initialPicture.equals(steppedPicture)).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(pathToFileURL(path.join(compositionFolder, "index.html")).href);
    await page.evaluate(() => Promise.all([...document.images].map((frameImage) => frameImage.decode())));
    const compositionRoot = page.locator("[data-composition-id]");
    await expect(compositionRoot).toHaveAttribute("data-width", "1440");
    await expect(compositionRoot).toHaveAttribute("data-height", "1080");
    await expect(compositionRoot).toHaveAttribute("data-duration", "6");
    await expect(compositionRoot).toHaveAttribute("data-fps", String(testFrameRate));
    const forwardPictures = [];
    for (const currentSeconds of testedTimestamps) forwardPictures.push(await seekComposition(page, currentSeconds));
    for (let timestampIndex = testedTimestamps.length - 1; timestampIndex >= 0; timestampIndex--) {
      const reversePicture = await seekComposition(page, testedTimestamps[timestampIndex]!);
      expect(reversePicture.equals(forwardPictures[timestampIndex]!)).toBe(true);
    }
    expect(new Set(forwardPictures.slice(2, 7).map((pictureBytes) => pictureBytes.toString("base64"))).size).toBeGreaterThanOrEqual(4);
    for (const invalidOptions of [
      { motion: "unknown" }, { fps: 0 }, { fps: 61 }, { fps: 1.5 },
      { transitionDuration: 0 }, { transitionDuration: 9 }, { durations: [0.001, 1, 4] },
    ]) {
      await writeFile(schedulePath, JSON.stringify({ durations: [1, 1, 4], motion: "native", fps: testFrameRate, transitionDuration: 0.6, ...invalidOptions }));
      await expect(runCommand(process.execPath, buildArguments)).rejects.toMatchObject({ stdout: expect.stringContaining("hyperframes.json") });
    }
    // Failed builds must leave the last working composition intact.
    await page.reload();
    await expect(compositionRoot).toHaveAttribute("data-duration", "6");
    await seekComposition(page, 2.2);
    await writeFile(path.join(projectFolder, "index.tsx"), `
import { Presentation, Slide } from "slidemachina";
export default <Presentation><Slide hidden><h1>Hidden first</h1></Slide><Slide><h1>Visible first</h1></Slide><Slide transition="none"><h1>Visible last</h1></Slide></Presentation>;
`);
    await writeFile(schedulePath, JSON.stringify({ durations: [1, 1], motion: "native" }));
    await runCommand(process.execPath, buildArguments);
    await page.reload();
    await expect(compositionRoot).toHaveAttribute("data-fps", "30");
    await expect(compositionRoot).toHaveAttribute("data-duration", "2");
    await expect(page.locator('img[data-kind="hold"]')).toHaveCount(2);
    await expect(page.locator('img[data-kind="hold"]').first()).toHaveAttribute("alt", "Visible first");
    await seekComposition(page, 1);
    await expect(page.locator("img.clip:not([hidden])")).toHaveAttribute("alt", "Visible last");
    await writeFile(schedulePath, JSON.stringify({ durations: [1, 1], motion: "still" }));
    await runCommand(process.execPath, buildArguments);
    await page.reload();
    await expect(page.locator("img.clip")).toHaveCount(2);
    await expect(compositionRoot).not.toHaveAttribute("data-fps");
    await seekComposition(page, 1);
    await expect(page.locator("img.clip:not([hidden])")).toHaveAttribute("alt", "Visible last");
  } finally {
    await rm(repositoryFolder, { recursive: true, force: true });
    await rm(outputFolder, { recursive: true, force: true });
  }
});
