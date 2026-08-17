import { CssBaseline, Stack } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
// import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
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
      sx={{ padding: 2 }}
    >
      <MasterVolumeControl device={defaultDevice} />
      <SessionControlProvider
        deviceId={defaultDevice?.id || null}
      >
        <SessionVolumeControl />
      </SessionControlProvider>
    </Stack>
  )
}

export default App;
