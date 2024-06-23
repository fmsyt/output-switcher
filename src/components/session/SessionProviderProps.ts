import { AudioSessionInfo } from "../../types";

export default interface SessionProviderProps {
  children: React.ReactNode;
  session: AudioSessionInfo;
  volumeStep: number;
}
