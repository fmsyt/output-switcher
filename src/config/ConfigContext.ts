import { createContext } from "react";
import type { ConfigContextType } from "./types";

const ConfigContext = createContext<ConfigContextType>({
  bookmark: {
    deviceIdList: [],
  },
  setBookmark: () => {
    throw new Error("setBookmark function is not defined");
  },
  display: {
    showSessionVolumeControl: true,
  },
  setDisplay: () => {
    throw new Error("setDisplay function is not defined");
  },
});

export default ConfigContext;
