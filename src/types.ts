import { AudioDeviceInfo } from "./contexts/audio/types";


export interface MeterProps {
  device: AudioDeviceInfo;
  defaultVolume?: number;
  deviceList?: AudioDeviceInfo[];
}

export interface AppContextValue {
  addIgnoreDragTarget: (target: HTMLElement) => void;
  removeIgnoreDragTarget: (target: HTMLElement) => void;
}
