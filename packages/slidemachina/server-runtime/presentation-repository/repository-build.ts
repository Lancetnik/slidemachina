import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { styleText } from "node:util";
import { log } from "@clack/prompts";
import { build } from "vite";
import { commandLineTexts } from "../command-line/command-line-texts.ts";
import { shootCover } from "../presentation-build/cover-shooting.ts";
import { buildPresentation, removeOldOutput, reportBuild, reportBuiltOutput, runBuildStep } from "../presentation-build/presentation-build.ts";
import { readPresentationCards } from "./presentation-list-page.ts";
import { createListBuildConfiguration } from "../development-server/vite-configuration.ts";
import type { BuildVariant } from "../command-line/build-choice.ts";
import type { OutputPaths, BuildContext, StepTitler } from "../presentation-build/presentation-build.ts";
import type { PresentationCard, ListedCard } from "./presentation-list-page.ts";
import type { SiteLayout } from "./presentation-repository.ts";

const pageVariantNames: BuildVariant[] = ["html", "protected", "folder"];
const downloadVariantNames: ("pdf" | "pdf-steps" | "pptx" | "zip")[] = ["pdf", "pdf-steps", "pptx", "zip"];
const coverFileName = "cover.webp";

// <folder>/index.html opens the presentation, downloads and the cover lie next to it: dist/ goes to a server as it is.
function nameRepositoryOutputs(presentationOutput: string, folderName: string): OutputPaths {
  return {
    html: path.join(presentationOutput, "index.html"),
    protected: path.join(presentationOutput, "index.html"),
    folder: presentationOutput,
    zip: path.join(presentationOutput, `${folderName}.zip`),
    pdf: path.join(presentationOutput, `${folderName}.pdf`),
    "pdf-steps": path.join(presentationOutput, `${folderName}-steps.pdf`),
    pptx: path.join(presentationOutput, `${folderName}.pptx`),
    hyperframes: path.join(presentationOutput, `${folderName}-hyperframes`),
  };
}

// Links name index.html: they open from a web server and from disk alike.
function describeBuiltCard(presentationCard: PresentationCard, chosenVariants: BuildVariant[], outputPaths: OutputPaths, hasCover: boolean): ListedCard {
  const toListAddress = (outputPath: string) => `./${encodeURIComponent(presentationCard.folderName)}/${encodeURIComponent(path.basename(outputPath))}`;
  const downloads = downloadVariantNames
    .filter((variantName) => chosenVariants.includes(variantName))
    .map((variantName) => ({ variantName, downloadAddress: toListAddress(outputPaths[variantName]) }));
  const opensPage = chosenVariants.some((variantName) => pageVariantNames.includes(variantName));
  return {
    ...presentationCard,
    pageAddress: opensPage ? toListAddress(outputPaths.html) : downloads[0]?.downloadAddress ?? `${toListAddress(outputPaths.hyperframes)}/index.html`,
    isProtected: chosenVariants.includes("protected"),
    coverKind: hasCover ? "picture" : "none",
    coverAddress: toListAddress(coverFileName),
    downloads,
  };
}

async function buildListPage(siteLayout: SiteLayout, builtCards: ListedCard[], outputFolder: string): Promise<void> {
  const listFolder = mkdtempSync(path.join(os.tmpdir(), "slidemachina-list-"));
  try {
    await build(createListBuildConfiguration(siteLayout, listFolder, builtCards));
    removeOldOutput(path.join(outputFolder, "assets"));
    cpSync(listFolder, outputFolder, { recursive: true });
  } finally {
    rmSync(listFolder, { recursive: true, force: true });
  }
}

// Every presentation gets its own folder in dist/, the list goes to dist/index.html.
export async function buildRepository(
  siteLayout: SiteLayout,
  chosenVariants: BuildVariant[],
  outputFolder: string,
  buildContext: Omit<BuildContext, "buildReport">,
): Promise<void> {
  const { isInteractive, sharedChrome } = buildContext;
  // A cover of a protected presentation would show what the password hides: its card keeps only the title.
  let shootsCovers = chosenVariants.some((variantName) => variantName !== "protected");
  const builtCards: ListedCard[] = [];
  for (const presentationCard of readPresentationCards(siteLayout.rootFolder)) {
    const { folderName } = presentationCard;
    const presentationOutput = path.join(outputFolder, folderName);
    removeOldOutput(presentationOutput);
    mkdirSync(presentationOutput, { recursive: true });
    const outputPaths = nameRepositoryOutputs(presentationOutput, folderName);
    const buildReport = { savedPictureBytes: new Map(), videoSizes: new Map() };
    let hasCover = false;
    const shootPresentationCover = async (builtFolder: string, stepTitle: StepTitler): Promise<void> => {
      if (!shootsCovers) return;
      try {
        const coverPath = path.join(presentationOutput, coverFileName);
        await runBuildStep(stepTitle(commandLineTexts.shootingCover), () => shootCover(sharedChrome, builtFolder, coverPath, presentationCard.canvasSize), isInteractive);
        hasCover = true;
      } catch (coverError) {
        const coverProblem = coverError instanceof Error ? coverError.message : String(coverError);
        const isChromeMissing = coverProblem === commandLineTexts.missingChrome;
        if (isChromeMissing) shootsCovers = false;
        log.warn(isChromeMissing ? commandLineTexts.coversWithoutChrome : commandLineTexts.coverFailed(folderName, coverProblem));
      }
    };
    const presentationFolder = path.join(siteLayout.rootFolder, folderName);
    const presentationLayout = { rootFolder: presentationFolder, isRepository: false, themeStylesheet: siteLayout.themeStylesheet, listAddress: "../index.html" };
    await buildPresentation(presentationLayout, chosenVariants, outputPaths, { ...buildContext, buildReport, stepPrefix: folderName }, shootPresentationCover);
    reportBuild(chosenVariants, outputPaths, buildReport, false);
    builtCards.push(describeBuiltCard(presentationCard, chosenVariants, outputPaths, hasCover));
  }
  await runBuildStep(commandLineTexts.buildingList, () => buildListPage(siteLayout, builtCards, outputFolder), isInteractive);
  const { shownPath } = reportBuiltOutput(path.join(outputFolder, "index.html"));
  log.message(styleText("dim", commandLineTexts.listServingHint(path.dirname(shownPath))));
}
