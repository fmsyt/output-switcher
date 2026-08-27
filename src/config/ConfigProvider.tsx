import { useCallback, useEffect, useState } from "react";
import ConfigContext from "./ConfigContext";
import type { Bookmark, Config, ConfigProviderProps, Display } from "./types";

const CONFIG_STORAGE_KEY = "output-switcher-config";

function loadConfigFromLocalStorage(): Config {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load config from localStorage", error);
  }

  return {
    bookmark: {
      deviceIdList: [],
    },
    display: {
      showSessionVolumeControl: true,
    },
  };
}

function saveConfigToLocalStorage(config: Config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("Failed to save config to localStorage", error);
  }
}

export default function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<Config>(loadConfigFromLocalStorage());

  useEffect(() => {
    saveConfigToLocalStorage(config);
  }, [config]);

  const setBookmark = useCallback((bookmark: Bookmark) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      bookmark: { ...prevConfig.bookmark, ...bookmark },
    }));
  }, []);

  const setDisplay = useCallback((display: Display) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      display: { ...prevConfig.display, ...display },
    }));
  }, []);

  return (
    <ConfigContext.Provider
      value={{
        bookmark: config.bookmark,
        setBookmark,
        display: config.display,
        setDisplay,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}
