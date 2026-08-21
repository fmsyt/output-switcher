import { Box, CssBaseline, Stack } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
// import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import useConfig from "./config/useConfig";
import SessionControlProvider from "./contexts/session/SessionControlProvider";
import DraggingProvider from "./effect/dragging/DraggingProvider";
import MasterVolumeControl from "./MasterVolumeControl";
import SessionVolumeControl from "./SessionVolumeControl";
import ThemeProvider from "./ThemeProvider";
import useRegisterContextMenu from "./useRegisterContextMenu";
import useWindowsAudioState from "./useWindowsAudioState";

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
  const { display } = useConfig();

  useEffect(() => {
    console.log("Default device changed:", defaultDevice);
  }, [defaultDevice])


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
        padding: 2,
        height: "100svh",
        overflow: "hidden",
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <MasterVolumeControl device={defaultDevice} />
      </Box>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "none",
          ":hover": {
            animation: "scrollbar-fade-in 0.2s ease-in-out forwards",
          }
        }}
      >
        {display.showSessionVolumeControl && (
          <SessionControlProvider
            deviceId={defaultDevice?.id || null}
          >
            <SessionVolumeControl />
          </SessionControlProvider>
        )}
      </Box>
    </Stack>
  )
}

export default App;
