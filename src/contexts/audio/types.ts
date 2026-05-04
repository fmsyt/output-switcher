export interface AudioDeviceInfo {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  sessions: AudioSessionInfo[];
}

export interface AudioSessionInfo {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  icon: string | null;
}
