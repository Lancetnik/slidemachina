#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { commandLineTexts } from "./command-line-texts.ts";
import { describeSite } from "../presentation-repository/presentation-repository.ts";
import { createViteConfiguration } from "../development-server/vite-configuration.ts";
import { nameEntryModuleId } from "../development-server/entry-modules.ts";

const largestPortNumber = 65536;

function stopWithProblem(problemText: string): never {
  console.error(`${problemText}\n\n${commandLineTexts.usage}`);
  process.exit(1);
}

function readCommandLine() {
  try {
    return parseArgs({
      allowPositionals: true,
      // --no-hidden drops the hidden slides that PDF and PowerPoint keep by default.
      allowNegative: true,
      options: {
        port: { type: "string" },
        html: { type: "boolean" },
        protected: { type: "boolean" },
        folder: { type: "boolean" },
        zip: { type: "boolean" },
        pdf: { type: "boolean" },
        steps: { type: "boolean" },
        hidden: { type: "boolean" },
        pptx: { type: "boolean" },
        hyperframes: { type: "boolean" },
        out: { type: "string" },
        template: { type: "string" },
        gif: { type: "string" },
        url: { type: "string" },
        animated: { type: "boolean" },
        local: { type: "boolean" },
        json: { type: "boolean" },
      },
    });
  } catch (parseError) {
    // Node quotes the flag: "Unknown option '--pfd'", "Option '--out <value>' argument missing".
    const parseProblem = parseError as NodeJS.ErrnoException;
    const [, quotedFlag = ""] = /'(--?[\w-]+)/.exec(parseProblem.message) ?? [];
    return stopWithProblem(parseProblem.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? commandLineTexts.unknownFlag(quotedFlag) : commandLineTexts.wrongFlag(quotedFlag));
  }
}

const parsedCommandLine = readCommandLine();
const [commandName] = parsedCommandLine.positionals;
// slidemachina shot 12 my-talk: the slide comes before the folder.
const [slidePosition, projectFolderArgument = "."] = commandName === "shot" ? parsedCommandLine.positionals.slice(1) : [undefined, parsedCommandLine.positionals[1]];
// "12", "12.2" after two steps, "12+1" for the first hidden slide after 12, as in the address of the slide.
const slidePositionPattern = /^\d+(\+\d+)?(\.\d+)?$/;

if (commandName === "meme") {
  // The meme command needs no Vite: it searches, downloads and prints markup.
  const { runMemeCommand } = await import("./meme-command.ts");
  await runMemeCommand(parsedCommandLine.positionals.slice(1), parsedCommandLine.values);
  process.exit(0);
}

if (commandName !== "dev" && commandName !== "build" && commandName !== "check" && commandName !== "shot") {
  console.log(commandLineTexts.usage);
  process.exit(commandName === undefined ? 0 : 1);
}

if (commandName === "shot" && !slidePositionPattern.test(slidePosition ?? "")) stopWithProblem(commandLineTexts.wrongSlidePosition(slidePosition ?? ""));

const portText = parsedCommandLine.values.port;
const portNumber = portText === undefined ? undefined : Number(portText);
if (portNumber !== undefined && !(Number.isInteger(portNumber) && portNumber > 0 && portNumber < largestPortNumber)) {
  stopWithProblem(commandLineTexts.wrongPort(String(portText)));
}

// Vite reports real file paths: with a link in the path (macOS /tmp) a resolved folder would never match them.
const requestedFolder = path.resolve(projectFolderArgument);
const siteLayout = existsSync(requestedFolder) ? describeSite(realpathSync(requestedFolder)) : undefined;
if (siteLayout === undefined) {
  console.error(commandLineTexts.missingPresentationFile(requestedFolder));
  process.exit(1);
}

if (commandName === "check") {
  const { runCheckCommand } = await import("./check-command.ts");
  process.exit(runCheckCommand(siteLayout, parsedCommandLine.values));
}

if (commandName === "shot") {
  if (siteLayout.isRepository) stopWithProblem(commandLineTexts.shotNeedsPresentation);
  const { shootSlide } = await import("../presentation-build/slide-shooting.ts");
  const picturePath = path.resolve(parsedCommandLine.values.out ?? `slide-${slidePosition!.replace(/[+.]/g, "-")}.png`);
  try {
    await shootSlide(siteLayout, slidePosition!, picturePath);
  } catch (shotError) {
    console.error(shotError instanceof Error ? shotError.message : String(shotError));
    process.exit(1);
  }
  console.log(commandLineTexts.shotSaved(path.relative(process.cwd(), picturePath)));
  process.exit(0);
}

if (commandName === "build") {
  // The build pulls in sharp, staticrypt and Playwright only when it runs.
  const { runBuildCommand } = await import("./build-command.ts");
  try {
    await runBuildCommand(siteLayout, parsedCommandLine.values);
  } catch (buildError) {
    const { log } = await import("@clack/prompts");
    log.error(buildError instanceof Error ? buildError.message : String(buildError));
    process.exit(1);
  }
} else {
  const developmentServer = await createServer(createViteConfiguration(siteLayout, { port: portNumber, open: process.stdout.isTTY }));
  await developmentServer.listen();
  developmentServer.printUrls();
  // The page and its modules compile while the browser opens; a repository does not know which presentation comes first.
  if (!siteLayout.isRepository) void developmentServer.warmupRequest(nameEntryModuleId(siteLayout, siteLayout.rootFolder));
}
