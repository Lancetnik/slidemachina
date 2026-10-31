import { createElement, lazy, Suspense, type ComponentType } from "react";
import type { StepEffect } from "./slide-steps/step-attributes.ts";
import type { QRProperties } from "./content-blocks/qr-block/qr-component.tsx";

const QRComponent = lazy(() => import("./content-blocks/qr-block/qr-component.tsx").then((qrModule) => ({ default: qrModule.QR })));

export { Presentation, type PresentationPosition, type PresentationProperties } from "./presentation-core/presentation-component.tsx";
export type { AspectRatio } from "../shared-between-runtimes/canvas-size.js";
export { Section, type SectionProperties } from "./presentation-core/section-component.tsx";
export { Slide, type SlideLogoPlacement, type SlideProperties, type SlideVerticalAlign } from "./presentation-core/slide-component.tsx";
export { Notes, type NotesProperties } from "./presentation-core/slide-notes.tsx";
export { Code, type CodeProperties } from "./content-blocks/code-block/code-component.tsx";
export { Image, type ImageFloat, type ImageProperties } from "./content-blocks/image-component.tsx";
export { Video, type VideoProperties } from "./content-blocks/video-component.tsx";
export type { MediaFit } from "./content-blocks/media-frame.tsx";
export type { QRProperties } from "./content-blocks/qr-block/qr-component.tsx";
export type { QRCorrection } from "./content-blocks/qr-block/qr-module-shapes.ts";
export { Meme, type MemeProperties } from "./content-blocks/meme-block/meme-component.tsx";
export { Diagram, type DiagramProperties } from "./diagram-blocks/diagram-component.tsx";
const pendingContent = createElement("div", { "data-print-pending": "" });
export const QR: ComponentType<QRProperties> = (qrProperties) => createElement(Suspense, { fallback: pendingContent }, createElement(QRComponent, qrProperties));
export {
  Arrow,
  Box,
  Focus,
  Group,
  type ArrowProperties,
  type BoxProperties,
  type FocusProperties,
  type GroupProperties,
} from "./diagram-blocks/diagram-parts.tsx";
export { Actor, Message, Sequence, type ActorProperties, type MessageProperties, type SequenceProperties } from "./diagram-blocks/sequence-component.tsx";
export { Scene, type SceneProperties } from "./scene-blocks/scene-component.tsx";
export {
  Camera,
  Cube,
  Light,
  Move,
  Sphere,
  Text,
  type CameraProperties,
  type CubeProperties,
  type LightProperties,
  type MoveProperties,
  type SceneMaterial,
  type ScenePoint,
  type SphereProperties,
  type TextProperties,
} from "./scene-blocks/scene-parts.tsx";
export type { DiagramDirection } from "./diagram-blocks/diagram-graph.ts";
export { SlidemachinaLogo } from "./presentation-core/slidemachina-logo.tsx";
export { css } from "./visual-theme/embedded-styles.ts";
export { useSlide, type PresentationLogo, type SlideAlign, type SlideState } from "./presentation-core/slide-environment.ts";
export type { SlideTransition } from "./slide-transitions/slide-transition.ts";
export type { TransitionSpeed } from "./slide-transitions/transition-speed.ts";
export type { StepEffect } from "./slide-steps/step-attributes.ts";

// <div morph="database"> pairs two elements on neighbouring slides when the text or source does not match.
declare module "react" {
  interface HTMLAttributes<T> {
    morph?: string;
  }
  // <li data-step={2} data-step-effect="fade"> turns any element into a step.
  // <ul data-steps={3} data-step-effect="fade"> turns every item, table row or column into a step, from step 3 on.
  interface DOMAttributes<T> {
    "data-step"?: boolean | number;
    "data-steps"?: boolean | number;
    "data-step-effect"?: StepEffect;
  }
}
