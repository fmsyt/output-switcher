import type { ReactNode } from "react";

export type Bookmark = {
  deviceIdList?: string[];
}

export type Display = {
  showSessionVolumeControl?: boolean;
}

export type Config = {
  bookmark: Bookmark;
  display: Display;
}

export type ConfigContextType = {
  bookmark: Bookmark;
  setBookmark: (bookmark: Bookmark) => void;
  display: Display;
  setDisplay: (display: Display) => void;
}

export type ConfigProviderProps = {
  children: ReactNode;
}
