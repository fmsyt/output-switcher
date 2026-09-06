import { Box, CssBaseline, Stack } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import SessionControlProvider from "./contexts/session/SessionControlProvider";
import DraggingProvider from "./effect/dragging/DraggingProvider";
import MasterVolumeControl from "./MasterVolumeControl";
import SessionVolumeControl from "./SessionVolumeControl";
import ThemeProvider from "./ThemeProvider";
import useRegisterContextMenu from "./useRegisterContextMenu";
import useWindowsAudioState from "./useWindowsAudioState";
import { getCurrentWindow, LogicalSize, PhysicalSize } from "@tauri-apps/api/window";

function App() {

  useEffect(() => {
    let unListen: UnlistenFn | undefined = undefined;

    (async () => {
      const unListenQuit = await listen("quit", () => invoke("quit"));

      unListen = () => {
        unListenQuit();
      }

    })();

    return () => {
      unListen?.();
    }

  }, [])

  return (
    <DraggingProvider>
      <ThemeProvider>
        <CssBaseline />
        <Container />
      </ThemeProvider>
    </DraggingProvider>
  );
}

function Container() {

  const { audioDeviceList, defaultDevice } = useWindowsAudioState();

  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wrapperRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {

      if (entries.length === 0) {
        console.warn("ResizeObserver entries is empty");
        return;
      }

      const [entry] = entries;

      const element = entry.target as HTMLElement;
      const wrapperRect = element.getBoundingClientRect();

      const currentWindow = getCurrentWindow();
      const size = new LogicalSize(100, wrapperRect.height + 8);

      currentWindow.setMinSize(size);
    })

    observer.observe(wrapperRef.current);

    return () => {
      observer.disconnect();
    }

  }, [])


  const handleContextMenu = useRegisterContextMenu({ defaultDevice: defaultDevice, deviceList: audioDeviceList });
  useEffect(() => {
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    }
  }, [handleContextMenu])


  return (
    <Stack
      spacing={2}
      sx={{
        height: "100svh",
        overflow: "hidden",
      }}
    >
      <Box
        ref={wrapperRef}
        sx={{
          padding: 2,
          flexShrink: 0,
          paddingRight: 1,
        }}
      >
        <MasterVolumeControl device={defaultDevice} />
      </Box>
      <Box
        sx={{
          paddingInline: 2,
          paddingTop: 0,
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "thin",
          scrollbarGutter: "stable",
          scrollbarColor: "rgba(255, 255, 255, 0.5) transparent",
        }}
      >
        <SessionControlProvider
          deviceId={defaultDevice?.id || null}
        >
          <SessionVolumeControl />
        </SessionControlProvider>
      </Box>
    </Stack>
  )
}

export default App;
