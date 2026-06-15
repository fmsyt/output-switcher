import type { ReactNode } from "react";
import type { AudioSessionInfo } from "../audio/types";

export type SessionControlContextValue = {
  sessions: AudioSessionInfo[];
  invokeChangeMute: (sessionId: AudioSessionInfo["session_id"], muted: boolean) => Promise<void>;
  invokeToggleMute: (sessionId: AudioSessionInfo["session_id"]) => Promise<void>;
  invokeChangeVolume: (sessionId: AudioSessionInfo["session_id"], volume: number) => Promise<void>;
}

export type SessionControlProviderProps = {
  children?: ReactNode;
  deviceId: string | null;
  onSessionsChange?: (sessions: AudioSessionInfo[]) => void;
}
