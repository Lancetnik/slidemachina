import { copyFileSync, cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { styleText } from "node:util";
import { log, spinner } from "@clack/prompts";
import { build } from "vite";
import { commandLineTexts, formatFileSize } from "../command-line/command-line-texts.ts";
import { zipFolder } from "./folder-archive.ts";
import { presentationFileName } from "../presentation-repository/presentation-repository.ts";
import { readPresentationFile } from "../source-transforms/presentation-settings.ts";
import { createBuildConfiguration } from "../development-server/vite-configuration.ts";
import type { BuildVariant } from "../command-line/build-choice.ts";
import type { BuildReport } from "./image-compression.ts";
import type { SharedChrome } from "./chrome-sharing.ts";
import type { SiteLayout } from "../presentation-repository/presentation-repository.ts";

export type OutputPaths = Record<BuildVariant, string>;
export type BuildContext = { isInteractive: boolean, pageSecret: string | undefined, printsHidden: boolean, sharedChrome: SharedChrome, buildReport: BuildReport, stepPrefix?: string };
export type StepTitler = (shownTitle: string) => string;
// A step may leave a message for after the spinner, such as why the Quick Look pictures are missing.
type ChromeStep = { stepTitle: string; stepWork: () => Promise<(() => void) | void> };

const singleFileVariants = new Set<BuildVariant>(["html", "protected", "pdf", "pdf-steps", "pptx", "hyperframes"]);
const pdfVariantNames: BuildVariant[] = ["pdf", "pdf-steps"];
const largeFileLimit = 50 * 1024 * 1024;

export async function runBuildStep<StepOutcome>(stepTitle: string, buildStepWork: () => StepOutcome | Promise<StepOutcome>, isInteractive: boolean): Promise<StepOutcome> {
  if (!isInteractive) {
    log.step(stepTitle);
    return buildStepWork();
  }
  const stepSpinner = spinner();
  stepSpinner.start(stepTitle);
  try {
    const stepResult = await buildStepWork();
    stepSpinner.stop(stepTitle);
    return stepResult;
  } catch (stepError) {
    stepSpinner.error(stepTitle);
    throw stepError;
  }
}

function measureOutput(outputPath: string): number {
  if (!statSync(outputPath).isDirectory()) return statSync(outputPath).size;
  return readdirSync(outputPath, { recursive: true, withFileTypes: true })
    .filter((folderEntry) => folderEntry.isFile())
    .reduce((folderSize, folderEntry) => folderSize + statSync(path.join(folderEntry.parentPath, folderEntry.name)).size, 0);
}

function sumMapValues(numbersByKey: Map<string, number>): number {
  return [...numbersByKey.values()].reduce((valueTotal, mapValue) => valueTotal + mapValue, 0);
}

// A build never writes index.tsx, so a folder holding one is sources: the build stops instead of wiping it.
export function removeOldOutput(outputPath: string): void {
  if (!existsSync(outputPath)) return;
  const holdsSources = readdirSync(outputPath, { recursive: true }).some((entryPath) => path.basename(String(entryPath)) === presentationFileName);
  if (holdsSources) throw new Error(commandLineTexts.outputHoldsSources(outputPath));
  rmSync(outputPath, { recursive: true, force: true });
}

// One line of the summary: the path from the current folder and the size.
export function reportBuiltOutput(outputPath: string): { shownPath: string, outputSize: number } {
  const outputSize = measureOutput(outputPath);
  const relativePath = path.relative(process.cwd(), outputPath);
  const shownPath = relativePath.startsWith("..") ? outputPath : relativePath;
  log.success(commandLineTexts.builtOutput(styleText("bold", shownPath), styleText("dim", formatFileSize(outputSize))));
  return { shownPath, outputSize };
}

// A repository prints the hint about serving folders once, after all presentations.
export function reportBuild(chosenVariants: BuildVariant[], outputPaths: OutputPaths, buildReport: BuildReport, showsServingHint = true): void {
  if (buildReport.savedPictureBytes.size > 0) {
    log.info(commandLineTexts.compressedPictures(buildReport.savedPictureBytes.size, formatFileSize(sumMapValues(buildReport.savedPictureBytes))));
  }
  for (const [videoPath, videoSize] of buildReport.videoSizes) {
    log.info(commandLineTexts.keptVideo(path.basename(videoPath), formatFileSize(videoSize)));
  }
  for (const variantName of chosenVariants) {
    const outputPath = outputPaths[variantName];
    const { shownPath, outputSize } = reportBuiltOutput(outputPath);
    const isSingleHtmlFile = variantName === "html" || variantName === "protected";
    if (isSingleHtmlFile && outputSize > largeFileLimit) {
      log.warn(commandLineTexts.largeSingleFile(path.basename(outputPath), formatFileSize(outputSize)));
    }
    if (variantName === "folder" && showsServingHint) log.message(styleText("dim", commandLineTexts.folderServingHint(shownPath)));
  }
}

// The pictures never stop the build: a missing Chrome or a too big file only leaves a message.
async function shootPreviewQuietly(builtPage: string, htmlPath: string, sharedChrome: SharedChrome): Promise<(() => void) | void> {
  try {
    const { addScriptFreePreview, quickLookSizeLimit } = await import("./script-free-preview.ts");
    const hasPreview = await addScriptFreePreview(builtPage, htmlPath, sharedChrome);
    if (!hasPreview) return () => log.info(commandLineTexts.previewTooLarge(formatFileSize(quickLookSizeLimit)));
  } catch (previewError) {
    const previewProblem = previewError instanceof Error ? previewError.message : String(previewError);
    return () => log.warn(previewProblem === commandLineTexts.missingChrome ? commandLineTexts.previewWithoutChrome : commandLineTexts.previewFailed(previewProblem));
  }
}

function listChromeSteps(chosenVariants: BuildVariant[], builtPage: string, outputPaths: OutputPaths, printsHidden: boolean, sharedChrome: SharedChrome): ChromeStep[] {
  const previewSteps = chosenVariants.includes("html") ? [{ stepTitle: commandLineTexts.shootingPreview, stepWork: () => shootPreviewQuietly(builtPage, outputPaths.html, sharedChrome) }] : [];
  const pdfSteps = pdfVariantNames
    .filter((variantName) => chosenVariants.includes(variantName))
    .map((pdfVariant) => {
      const printsSteps = pdfVariant === "pdf-steps";
      return { stepTitle: commandLineTexts.printingPdf(printsSteps), stepWork: async () => (await import("./pdf-printing.ts")).printPdf(builtPage, outputPaths[pdfVariant], { printsSteps, printsHidden }, sharedChrome) };
    });
  const pptxSteps = chosenVariants.includes("pptx") ? [{ stepTitle: commandLineTexts.exportingPptx, stepWork: async () => (await import("../pptx-export/pptx-export.ts")).exportPptx(builtPage, outputPaths.pptx, printsHidden, sharedChrome) }] : [];
  return [...previewSteps, ...pdfSteps, ...pptxSteps];
}

// Folder and zip come first: in a repository the folder is the presentation's own output folder, other files go into it after.
export async function buildPresentation(
  presentationLayout: SiteLayout,
  chosenVariants: BuildVariant[],
  outputPaths: OutputPaths,
  buildContext: BuildContext,
  processBuiltPage?: (builtFolder: string, stepTitle: StepTitler) => Promise<void>,
): Promise<void> {
  const { buildReport, isInteractive, pageSecret, printsHidden, sharedChrome, stepPrefix } = buildContext;
  const projectFolder = presentationLayout.rootFolder;
  const nameStepTitle: StepTitler = (shownTitle) => (stepPrefix === undefined ? shownTitle : `${stepPrefix} · ${shownTitle}`);
  const temporaryFolder = mkdtempSync(path.join(os.tmpdir(), "slidemachina-build-"));
  const builtPages: string[] = [];
  const buildsFolder = chosenVariants.includes("folder") || chosenVariants.includes("zip");
  const buildsSingleFile = chosenVariants.some((variantName) => singleFileVariants.has(variantName));
  const folderBuild = path.join(temporaryFolder, "folder");
  const singleFileFolder = path.join(temporaryFolder, "single-file");
  try {
    // The two builds share nothing but the compressed-picture cache, so they run at the same time.
    const bundleTitles = [buildsFolder && commandLineTexts.buildingFiles(false), buildsSingleFile && commandLineTexts.buildingFiles(true)].filter(
      (bundleTitle): bundleTitle is string => bundleTitle !== false,
    );
    if (bundleTitles.length > 0) {
      await runBuildStep(
        nameStepTitle(bundleTitles.join(" · ")),
        () =>
          Promise.all([
            buildsFolder ? build(createBuildConfiguration(presentationLayout, folderBuild, false, buildReport)) : undefined,
            buildsSingleFile ? build(createBuildConfiguration(presentationLayout, singleFileFolder, true, buildReport)) : undefined,
          ]),
        isInteractive,
      );
    }
    if (buildsFolder) {
      if (chosenVariants.includes("folder")) {
        removeOldOutput(outputPaths.folder);
        cpSync(folderBuild, outputPaths.folder, { recursive: true });
      }
      if (chosenVariants.includes("zip")) zipFolder(folderBuild, outputPaths.zip);
      builtPages.push(folderBuild);
    }
    if (buildsSingleFile) {
      const builtPage = path.join(singleFileFolder, "index.html");
      if (pageSecret !== undefined) {
        const presentationTitle = readPresentationFile(projectFolder).presentationTitle ?? path.basename(projectFolder);
        await runBuildStep(
          nameStepTitle(commandLineTexts.encryptingFile),
          async () => (await import("./page-encryption.ts")).encryptPage(builtPage, outputPaths.protected, pageSecret, presentationTitle),
          isInteractive,
        );
      }
      if (chosenVariants.includes("html")) copyFileSync(builtPage, outputPaths.html);
      if (chosenVariants.includes("hyperframes")) {
        const hyperframesFolder = path.join(temporaryFolder, "hyperframes");
        await runBuildStep(
          nameStepTitle(commandLineTexts.exportingHyperframes),
          async () => (await import("./script-free-preview.ts")).exportHyperframes(builtPage, projectFolder, hyperframesFolder, printsHidden, sharedChrome),
          isInteractive,
        );
        removeOldOutput(outputPaths.hyperframes);
        cpSync(hyperframesFolder, outputPaths.hyperframes, { recursive: true });
      }
      const chromeSteps = listChromeSteps(chosenVariants, builtPage, outputPaths, printsHidden, sharedChrome);
      // Pictures, PDF and PowerPoint take tabs of one Chrome at once: printing mostly waits while the export keeps the processor busy.
      if (chromeSteps.length > 0) {
        const stepReports = await runBuildStep(
          nameStepTitle(chromeSteps.map(({ stepTitle }) => stepTitle).join(" · ")),
          () => Promise.all(chromeSteps.map(({ stepWork }) => stepWork())),
          isInteractive,
        );
        for (const stepReport of stepReports) stepReport?.();
      }
      builtPages.push(singleFileFolder);
    }
    const [firstBuiltPage] = builtPages;
    if (processBuiltPage !== undefined && firstBuiltPage !== undefined) await processBuiltPage(firstBuiltPage, nameStepTitle);
  } finally {
    rmSync(temporaryFolder, { recursive: true, force: true });
  }
}

export function namePresentationOutputs(outputFolder: string, projectName: string): OutputPaths {
  return {
    html: path.join(outputFolder, `${projectName}.html`),
    protected: path.join(outputFolder, `${projectName}-protected.html`),
    folder: path.join(outputFolder, projectName),
    zip: path.join(outputFolder, `${projectName}.zip`),
    pdf: path.join(outputFolder, `${projectName}.pdf`),
    "pdf-steps": path.join(outputFolder, `${projectName}-steps.pdf`),
    pptx: path.join(outputFolder, `${projectName}.pptx`),
    hyperframes: path.join(outputFolder, `${projectName}-hyperframes`),
  };
}
