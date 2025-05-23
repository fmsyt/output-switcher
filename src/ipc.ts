import { invoke } from "@tauri-apps/api/core";

export type AudioDict = {
  kind: "AudioDict";
};

export type DefaultAudioChange = {
  kind: "DefaultAudioChange";
  id: string;
};

export type VolumeChange = {
  kind: "VolumeChange";
  id: string;
  volume: number;
};

export type MuteStateChange = {
  kind: "MuteStateChange";
  id: string;
  muted: boolean;
};

export type Channels = {
  kind: "Channels";
};

export type SessionVolumeChange = {
  kind: "SessionVolumeChange";
  id: string; // デバイスID
  processName: string;
  volume: number;
};

export type SessionMuteStateChange = {
  kind: "SessionMuteStateChange";
  id: string; // デバイスID
  processName: string;
  muted: boolean;
};

export type AudioSessionDict = {
  kind: "AudioSessionDict";
  id: string;
};

export type Query =
  | AudioDict
  | DefaultAudioChange
  | VolumeChange
  | MuteStateChange
  | Channels
  | SessionVolumeChange
  | SessionMuteStateChange
  | AudioSessionDict;
  ;

export type QueryKind = Query["kind"];

export async function invokeQuery(query: Query): Promise<void> {
  await invoke("query", { query });
}
