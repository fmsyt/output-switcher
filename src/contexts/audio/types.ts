export interface AudioDeviceInfo {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  // sessions: AudioSessionInfo[];
}

export interface AudioSessionInfo {
  // id: string;
  // name: string;
  // volume: number;
  // muted: boolean;
  // icon: string | null;

  session_id: string;
  process_id: number;
  process_name: string;
  volume: number;
  muted: boolean;
  display_name: string;
  icon_path: string;
  exe_path: string;
  icon_data: string;
}
