import { invoke } from "@tauri-apps/api/core";
import { CheckMenuItem, Menu, MenuItem } from "@tauri-apps/api/menu";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback } from "react";
import { QueryKind, invokeQuery } from "./ipc";
import { AudioDeviceInfo } from "./types";

type Props = {
  device: AudioDeviceInfo;
  deviceList?: AudioDeviceInfo[];
}

export default function useRegisterContextMenu(props: Props) {

  const { device, deviceList } = props;

  const handlePopup = useCallback(async () => {

    if (!deviceList) {
      return;
    }

    const items = await Promise.all(deviceList.map((d) => {
      return CheckMenuItem.new({
        text: d.name,
        checked: d.id === device.id,
        action: async () => {
          const kind: QueryKind = "DefaultAudioChange";
          await invokeQuery({ kind, id: d.id });
        }
      });
    }));

    const quitItem = await MenuItem.new({
      text: "Quit",
      action: async () => {
        await invoke("quit");
      }
    })

    const menu = await Menu.new({
      items: [
        ...items,
        quitItem
      ]
    });

    await menu.popup();

  }, [device, deviceList]);

  const handleContextMenu = useCallback((e: WindowEventMap["contextmenu"]) => {
    e.preventDefault();

    const mainWindow = getCurrentWebviewWindow();
    if (!mainWindow) {
      return;
    }

    handlePopup();

  }, [handlePopup]);

  return handleContextMenu;
}
