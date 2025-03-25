import type { ReactNode } from "react";

export type Bookmark = {
  deviceIdList?: string[];
}

export type Config = {
  bookmark: Bookmark;
}

export type ConfigContextType = {
  bookmark: Bookmark;
  setBookmark: (bookmark: Bookmark) => void;
}

export type ConfigProviderProps = {
  children: ReactNode;
}
