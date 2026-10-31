import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closingHeading, closingLead, codeExample, coverNotes, highlightedLanguage, talkSections, talkSubtitle, talkTitle } from "./benchmark-talk.ts";
import type { TalkSlide } from "./benchmark-talk.ts";

export type BenchmarkTool = {
  toolName: string;
  versionPackage: string;
  buildOutputFolder: string;
  developmentPath: string;
  writeProject: (projectFolder: string, picturePath: string) => void;
};

const pictureFileName = "talk-picture.png";
const templateManifestPath = new URL("../packages/create-slidemachina/template/package.json", import.meta.url);

function writeManifest(projectFolder: string, projectName: string, scriptCommands: Record<string, string>, dependencyVersions: Record<string, string>, developmentVersions: Record<string, string> = {}): void {
  const projectManifest = { name: projectName, private: true, type: "module", scripts: scriptCommands, dependencies: dependencyVersions, devDependencies: developmentVersions };
  writeFileSync(path.join(projectFolder, "package.json"), `${JSON.stringify(projectManifest, null, 2)}\n`);
}

function escapeTemplateText(sourceText: string): string {
  return sourceText.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}

function escapeHtmlText(sourceText: string): string {
  return sourceText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function writeSlidemachinaSlide(talkSlide: TalkSlide): string[] {
  const slideBody = talkSlide.showsCode
    ? [`      <Machina.Code lang="${highlightedLanguage}">{\`${escapeTemplateText(codeExample)}\`}</Machina.Code>`]
    : talkSlide.showsPicture
      ? ['      <img src={talkPicture} alt="A picture" />']
      : ["      <ul data-steps>", ...talkSlide.listItems!.map((listItem) => `        <li>${listItem}</li>`), "      </ul>"];
  const slideNotes = talkSlide.speakerNotes === undefined ? [] : [`      <Machina.Notes>${talkSlide.speakerNotes}</Machina.Notes>`];
  return ["    <Machina.Slide>", `      <h2>${talkSlide.slideHeading}</h2>`, ...slideBody, ...slideNotes, "    </Machina.Slide>"];
}

// The project npm create slidemachina makes: its manifest comes from the template, slidemachina is the latest release unless a local package is requested.
function writeSlidemachinaProject(projectFolder: string, picturePath: string): void {
  const templateManifest = JSON.parse(readFileSync(templateManifestPath, "utf8")) as { devDependencies?: Record<string, string> };
  const engineVersion = process.env.SLIDEMACHINA_BENCHMARK_PACKAGE ?? "latest";
  writeManifest(projectFolder, "slidemachina-benchmark", { dev: "slidemachina dev", build: "slidemachina build --folder --out site" }, { slidemachina: engineVersion }, templateManifest.devDependencies);
  mkdirSync(path.join(projectFolder, "images"), { recursive: true });
  copyFileSync(picturePath, path.join(projectFolder, "images", pictureFileName));
  writeFileSync(path.join(projectFolder, "style.css"), '@import "tailwindcss";\n');
  const sectionLines = talkSections.flatMap((talkSection) => [
    `  <Machina.Section title="${talkSection.sectionTitle}">`,
    ...talkSection.sectionSlides.flatMap(writeSlidemachinaSlide),
    "  </Machina.Section>",
  ]);
  writeFileSync(
    path.join(projectFolder, "index.tsx"),
    [
      'import * as Machina from "slidemachina";',
      `import talkPicture from "./images/${pictureFileName}";`,
      "",
      "export default (",
      '  <Machina.Presentation lang="en">',
      "    <Machina.Slide cover>",
      `      <h1>${talkTitle}</h1>`,
      `      <p className="machina-lead">${talkSubtitle}</p>`,
      `      <Machina.Notes>${coverNotes}</Machina.Notes>`,
      "    </Machina.Slide>",
      ...sectionLines,
      "    <Machina.Slide cover>",
      `      <h1>${closingHeading}</h1>`,
      `      <p className="machina-lead">${closingLead}</p>`,
      "    </Machina.Slide>",
      "  </Machina.Presentation>",
      ");",
      "",
    ].join("\n"),
  );
}

function writeRevealSlide(talkSlide: TalkSlide): string[] {
  const slideBody = talkSlide.showsCode
    ? [`  <pre><code class="language-${highlightedLanguage}" data-trim>${escapeHtmlText(codeExample)}</code></pre>`]
    : talkSlide.showsPicture
      ? [`  <img src="/${pictureFileName}" alt="A picture">`]
      : ["  <ul>", ...talkSlide.listItems!.map((listItem) => `    <li class="fragment">${listItem}</li>`), "  </ul>"];
  const slideNotes = talkSlide.speakerNotes === undefined ? [] : [`  <aside class="notes">${talkSlide.speakerNotes}</aside>`];
  return ["<section>", `  <h2>${talkSlide.slideHeading}</h2>`, ...slideBody, ...slideNotes, "</section>"];
}

// reveal.js with its highlight and notes plugins, bundled by Vite as its docs suggest for npm installs.
function writeRevealProject(projectFolder: string, picturePath: string): void {
  writeManifest(projectFolder, "reveal-benchmark", { dev: "vite", build: "vite build" }, { "reveal.js": "latest" }, { vite: "latest" });
  mkdirSync(path.join(projectFolder, "public"), { recursive: true });
  copyFileSync(picturePath, path.join(projectFolder, "public", pictureFileName));
  const sectionLines = talkSections.flatMap((talkSection) => [`<section><h2>${talkSection.sectionTitle}</h2></section>`, ...talkSection.sectionSlides.flatMap(writeRevealSlide)]);
  writeFileSync(
    path.join(projectFolder, "index.html"),
    [
      "<!doctype html>",
      '<html lang="en">',
      `<head><meta charset="utf-8"><title>${talkTitle}</title></head>`,
      '<body><div class="reveal"><div class="slides">',
      `<section><h1>${talkTitle}</h1><p>${talkSubtitle}</p><aside class="notes">${coverNotes}</aside></section>`,
      ...sectionLines,
      `<section><h1>${closingHeading}</h1><p>${closingLead}</p></section>`,
      "</div></div>",
      '<script type="module" src="/presentation-start.js"></script>',
      "</body></html>",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(projectFolder, "presentation-start.js"),
    [
      'import Reveal from "reveal.js";',
      'import Highlight from "reveal.js/plugin/highlight";',
      'import Notes from "reveal.js/plugin/notes";',
      'import "reveal.js/reveal.css";',
      'import "reveal.js/theme/white.css";',
      "",
      "Reveal.initialize({ plugins: [Highlight, Notes] });",
      "",
    ].join("\n"),
  );
}

function writeSlidevSlide(talkSlide: TalkSlide): string {
  const slideBody = talkSlide.showsCode
    ? `\`\`\`${highlightedLanguage}\n${codeExample}\n\`\`\``
    : talkSlide.showsPicture
      ? `![A picture](/${pictureFileName})`
      : `<v-clicks>\n\n${talkSlide.listItems!.map((listItem) => `- ${listItem}`).join("\n")}\n\n</v-clicks>`;
  const slideNotes = talkSlide.speakerNotes === undefined ? "" : `\n\n<!--\n${talkSlide.speakerNotes}\n-->`;
  return `---\n\n## ${talkSlide.slideHeading}\n\n${slideBody}${slideNotes}\n`;
}

// Slidev with its default theme, as npm init slidev sets it up.
function writeSlidevProject(projectFolder: string, picturePath: string): void {
  writeManifest(projectFolder, "slidev-benchmark", { dev: "slidev --open false", build: "slidev build" }, { "@slidev/cli": "latest", "@slidev/theme-default": "latest", vue: "latest" });
  mkdirSync(path.join(projectFolder, "public"), { recursive: true });
  copyFileSync(picturePath, path.join(projectFolder, "public", pictureFileName));
  const sectionParts = talkSections.flatMap((talkSection) => [`---\nlayout: section\n---\n\n# ${talkSection.sectionTitle}\n`, ...talkSection.sectionSlides.map(writeSlidevSlide)]);
  writeFileSync(
    path.join(projectFolder, "slides.md"),
    [`---\ntheme: default\ntitle: ${talkTitle}\n---\n\n# ${talkTitle}\n\n${talkSubtitle}\n\n<!--\n${coverNotes}\n-->\n`, ...sectionParts, `---\nlayout: end\n---\n\n# ${closingHeading}\n\n${closingLead}\n`].join("\n"),
  );
}

function writeOpenSlidePage(pageName: string, talkSlide: TalkSlide): string {
  const pageBody = talkSlide.showsCode
    ? `<pre style={codeStyle}><code>{\`${escapeTemplateText(codeExample)}\`}</code></pre>`
    : talkSlide.showsPicture
      ? '<img src={talkPicture} alt="A picture" style={pictureStyle} />'
      : `<Steps>${talkSlide.listItems!.map((listItem) => `<Step><p style={itemStyle}>• ${listItem}</p></Step>`).join("")}</Steps>`;
  return `const ${pageName}: Page = () => (\n  <div style={canvasStyle}>\n    <h2 style={headingStyle}>${talkSlide.slideHeading}</h2>\n    ${pageBody}\n  </div>\n);`;
}

// open-slide pages are React components on a 1920×1080 canvas with inline styles, as its slide-authoring skill writes them.
function writeOpenSlideProject(projectFolder: string, picturePath: string): void {
  writeManifest(projectFolder, "open-slide-benchmark", { dev: "open-slide dev", build: "open-slide build" }, { "@open-slide/core": "latest", react: "latest", "react-dom": "latest" });
  const deckFolder = path.join(projectFolder, "slides", "benchmark");
  mkdirSync(path.join(deckFolder, "assets"), { recursive: true });
  copyFileSync(picturePath, path.join(deckFolder, "assets", pictureFileName));
  writeFileSync(path.join(projectFolder, "open-slide.config.ts"), "import type { OpenSlideConfig } from '@open-slide/core';\n\nconst openSlideConfig: OpenSlideConfig = {};\n\nexport default openSlideConfig;\n");
  const contentPages = talkSections.flatMap((talkSection, sectionIndex) =>
    talkSection.sectionSlides.map((talkSlide, slideIndex) => ({ pageName: `ContentPage${sectionIndex}x${slideIndex}`, talkSlide })),
  );
  const sectionPages = talkSections.map((talkSection, sectionIndex) => ({ pageName: `SectionPage${sectionIndex}`, sectionTitle: talkSection.sectionTitle }));
  const pageOrder = talkSections.flatMap((talkSection, sectionIndex) => [
    `SectionPage${sectionIndex}`,
    ...talkSection.sectionSlides.map((_talkSlide, slideIndex) => `ContentPage${sectionIndex}x${slideIndex}`),
  ]);
  writeFileSync(
    path.join(deckFolder, "index.tsx"),
    [
      "import { type Page, Step, Steps } from '@open-slide/core';",
      "import type { CSSProperties } from 'react';",
      `import talkPicture from './assets/${pictureFileName}';`,
      "",
      "const canvasStyle: CSSProperties = { width: 1920, height: 1080, padding: 120, boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' };",
      "const titleStyle: CSSProperties = { margin: 0, fontSize: 96, fontWeight: 600 };",
      "const headingStyle: CSSProperties = { margin: '0 0 48px', fontSize: 64, fontWeight: 600 };",
      "const itemStyle: CSSProperties = { margin: '0 0 24px', fontSize: 40 };",
      "const codeStyle: CSSProperties = { fontSize: 28, lineHeight: 1.5, background: '#f6f6f6', padding: 32, borderRadius: 12 };",
      "const pictureStyle: CSSProperties = { maxWidth: '100%', maxHeight: 700 };",
      "",
      `const CoverPage: Page = () => (\n  <div style={canvasStyle}>\n    <h1 style={titleStyle}>${talkTitle}</h1>\n    <p style={itemStyle}>${talkSubtitle}</p>\n  </div>\n);`,
      ...sectionPages.map(({ pageName, sectionTitle }) => `const ${pageName}: Page = () => (\n  <div style={canvasStyle}>\n    <h1 style={titleStyle}>${sectionTitle}</h1>\n  </div>\n);`),
      ...contentPages.map(({ pageName, talkSlide }) => writeOpenSlidePage(pageName, talkSlide)),
      `const ClosingPage: Page = () => (\n  <div style={canvasStyle}>\n    <h1 style={titleStyle}>${closingHeading}</h1>\n    <p style={itemStyle}>${closingLead}</p>\n  </div>\n);`,
      "",
      `export const meta = { title: '${talkTitle}' };`,
      `export default [CoverPage, ${pageOrder.join(", ")}, ClosingPage] satisfies Page[];`,
      "",
    ].join("\n"),
  );
}

export const benchmarkTools: BenchmarkTool[] = [
  { toolName: "slidemachina", versionPackage: "slidemachina", buildOutputFolder: "site/slidemachina", developmentPath: "/", writeProject: writeSlidemachinaProject },
  { toolName: "reveal.js", versionPackage: "reveal.js", buildOutputFolder: "dist", developmentPath: "/", writeProject: writeRevealProject },
  { toolName: "Slidev", versionPackage: "@slidev/cli", buildOutputFolder: "dist", developmentPath: "/", writeProject: writeSlidevProject },
  { toolName: "open-slide", versionPackage: "@open-slide/core", buildOutputFolder: "dist", developmentPath: "/s/benchmark", writeProject: writeOpenSlideProject },
];
