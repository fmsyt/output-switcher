import { useCallback, useEffect, useState } from "react";
import ConfigContext from "./ConfigContext";
import type { Bookmark, Config, ConfigProviderProps } from "./types";

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

  return (
    <ConfigContext.Provider
      value={{
        ...config,
        setBookmark,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}
