import type { AudioDeviceInfo } from "./contexts/audio/types";


export type MeterProps = {
  device: AudioDeviceInfo | null;
}

export type AppContextValue = {
  addIgnoreDragTarget: (target: HTMLElement) => void;
  removeIgnoreDragTarget: (target: HTMLElement) => void;
}
