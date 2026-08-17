import { BaseDirectory, writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useState } from "react";
import ConfigContext from "./ConfigContext";
import type { Bookmark, Config, ConfigProviderProps } from "./types";

// Future use: load config on startup
// async function loadConfig() {
//   try {
//     const json = await readTextFile("config.json", {
//       baseDir: BaseDirectory.Config,
//     });
//     return JSON.parse(json);
//   } catch (error) {
//     console.error("Failed to load config", error);
//     return null;
//   }
// }

async function saveConfig(config: Config) {
  const json = JSON.stringify(config);
  await writeTextFile("config.json", json, {
    baseDir: BaseDirectory.Config,
    append: false,
  });
}

export default function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<Config>({
    bookmark: {
      deviceIdList: [],
    },
  });

  useEffect(() => {
    saveConfig(config).catch((error) => {
      console.error("Failed to save config", error);
    });
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
        bookmark: config.bookmark,
        setBookmark,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}
