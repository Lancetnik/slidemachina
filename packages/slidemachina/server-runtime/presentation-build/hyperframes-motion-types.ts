import type { Page } from "playwright-core";
import type { CanvasSize } from "../../shared-between-runtimes/canvas-size.ts";
import type { MotionFrameSlot, NativeMotionOptions } from "./hyperframes-motion-options.ts";

export type PresentationState = { positionAddress: string; slideAddress: string; slideHeading: string };
export type CapturedTransition = { stateIndex: number; frameCount: number; nativeDurationMilliseconds: number; animationNames: string[] };
export type MotionFrame = MotionFrameSlot & { assetName: string; frameKind: "hold" | "transition"; stateIndex: number; slideHeading: string };
export type CapturedMotionFrames = { framePictures: MotionFrame[]; capturedTransitions: CapturedTransition[] };
export type MotionCaptureContext = { capturePage: Page; canvasSize: CanvasSize; assetFolder: string; motionOptions: NativeMotionOptions };
