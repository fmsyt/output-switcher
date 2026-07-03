import { AudioDeviceInfo } from "../contexts/audio/types";

const eventNames = [
  "DefaultDeviceChanged",
  "DeviceAdded",
  "DeviceRemoved",
  "DeviceStateChanged",
  "PropertyValueChanged",
  "VolumeChanged",
  "SessionVolumeChanged",
  "SessionCreated",
  "SessionTerminated",
] as const;

export type EventName = typeof eventNames[number]; export interface EventPayloadBase {
  type: EventName;
  id: string;
}

export interface DefaultDeviceChanged extends EventPayloadBase { }
export interface DeviceAdded extends EventPayloadBase { }
export interface DeviceRemoved extends EventPayloadBase { }
export interface DeviceStateChanged extends EventPayloadBase {
  state: number;
}

export interface PropertyValueChanged extends EventPayloadBase {
  key: string;
}

export interface VolumeChanged extends EventPayloadBase {
  volume: number;
  muted: boolean;
}

export interface SessionVolumeChanged {
  type: "SessionVolumeChanged";
  process_id: number;
  volume: number;
  muted: boolean;
}

export interface SessionCreated {
  type: "SessionCreated";
  device_id: string;
}

export interface SessionTerminated {
  type: "SessionTerminated";
  device_id: string;
}

export type Notify = DefaultDeviceChanged | DeviceAdded | DeviceRemoved | DeviceStateChanged | PropertyValueChanged | VolumeChanged | SessionVolumeChanged | SessionCreated | SessionTerminated;

/**
 * 初期化するときにWindowsのオーディオデバイスの状態を取得するためのペイロード
 */
/**
 * Generic audio state structure used across platforms (Windows, PipeWire, PulseAudio)
 */
export interface AudioState {
  default: AudioDeviceInfo["id"];
  audioDeviceList: AudioDeviceInfo[];
}

// Backwards compatibility alias for existing Windows payloads
export type WindowsAudioState = AudioState;

export interface AudioStateChangePayload {
  // new, platform-agnostic field (preferred)
  audioState?: AudioState;
  // legacy Windows-specific field (kept for compatibility)
  windowsAudioState?: WindowsAudioState;
  // optional notification about a specific change
  notification?: Notify;
}

