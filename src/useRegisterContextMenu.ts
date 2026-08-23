import { invoke } from "@tauri-apps/api/core";
import { CheckMenuItem, Menu, MenuItem, type MenuOptions, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback } from "react";
import useConfig from "./config/useConfig";
import type { AudioDeviceInfo } from "./contexts/audio/types";
import { invokeQuery, type QueryKind } from "./ipc";

const BOOKMARKS_KEY = 'audio_device_bookmarks';

const getBookmarkedDeviceIds = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
  } catch {
    return [];
  }
};

const setBookmarkedDeviceIds = (ids: string[]) => {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
};

const toggleBookmark = (deviceId: string) => {
  const bookmarks = getBookmarkedDeviceIds();
  const updated = bookmarks.includes(deviceId)
    ? bookmarks.filter(id => id !== deviceId)
    : [...bookmarks, deviceId];
  setBookmarkedDeviceIds(updated);
};

type Props = {
  defaultDevice: AudioDeviceInfo | null;
  deviceList?: AudioDeviceInfo[];
}

export default function useRegisterContextMenu(props: Props) {

  const { defaultDevice: device, deviceList } = props;
  const { display, setDisplay } = useConfig();

  const handlePopup = useCallback(async () => {

    if (!deviceList) {
      return;
    }

    const bookmarks = getBookmarkedDeviceIds();
    const { bookmarkedDevices, others } = deviceList.reduce((acc, d) => {
      if (bookmarks.includes(d.id)) {
        acc.bookmarkedDevices.push(d);
      } else {
        acc.others.push(d);
      }
      return acc;
    }, { bookmarkedDevices: [] as AudioDeviceInfo[], others: [] as AudioDeviceInfo[] });

    const rootItems: MenuOptions["items"] = [];

    const toDeviceMenuItem = async (d: AudioDeviceInfo) => {
      return CheckMenuItem.new({
        text: d.name,
        checked: d.id === device?.id,
        action: async () => {
          const kind: QueryKind = "DefaultAudioChange";
          await invokeQuery({ kind, id: d.id });
        }
      });
    }

    const allDevicesItems = await Promise.all(deviceList.map(toDeviceMenuItem));
    const bookmarkedItems = await Promise.all(bookmarkedDevices.map(toDeviceMenuItem));

    if (bookmarkedDevices.length > 0) {
      rootItems.push(...bookmarkedItems);
      const otherDevicesItems = await Promise.all(others.map(toDeviceMenuItem));
      if (otherDevicesItems.length > 0) {
        rootItems.push(await Submenu.new({
          text: "Other Devices",
          items: otherDevicesItems
        }));
      }

    } else {
      rootItems.push(...allDevicesItems);
    }

    const separatorItem = await PredefinedMenuItem.new({
      item: "Separator"
    });

    rootItems.push(separatorItem);

    const bookmarkItems = await Promise.all(deviceList.map((d) => {
      const isBookmarked = bookmarks.includes(d.id);
      return CheckMenuItem.new({
        text: d.name,
        checked: isBookmarked,
        action: async () => {
          toggleBookmark(d.id);
        }
      });
    }));

    const bookmarkSubmenu = await Submenu.new({
      text: "Bookmark",
      items: bookmarkItems
    });

    rootItems.push(bookmarkSubmenu);

    // SessionVolumeControl表示切り替えメニュー
    const toggleSessionControlItem = await CheckMenuItem.new({
      text: "Show Session Volume Control",
      checked: display.showSessionVolumeControl ?? true,
      action: async () => {
        setDisplay({ showSessionVolumeControl: !(display.showSessionVolumeControl ?? true) });
      }
    });

    rootItems.push(toggleSessionControlItem);

    const quitItem = await MenuItem.new({
      text: "Quit",
      action: async () => {
        await invoke("quit");
      }
    })

    const menu = await Menu.new({
      items: [
        ...rootItems,
        quitItem
      ]
    });

    await menu.popup();

  }, [device, deviceList, display, setDisplay]);

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
