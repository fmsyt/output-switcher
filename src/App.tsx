import { Card, CardContent, CircularProgress, CssBaseline, Stack } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useContext, useEffect, useRef } from "react";
import Meter from "./Meter";
import SessionVolumeControl from "./SessionVolumeControl";
import ThemeProvider from "./ThemeProvider";
import DraggingContext from "./effect/dragging/DraggingContext";
import DraggingProvider from "./effect/dragging/DraggingProvider";
import useRegisterContextMenu from "./useRegisterContextMenu";
import useWindowsAudioState from "./useWindowsAudioState";
import SessionControlProvider from "./contexts/session/SessionControlProvider";

function App() {

  const cardRef = useRef<HTMLDivElement>(null);
  // const { addIgnoreDragTarget, removeIgnoreDragTarget } = useDragging();

  const handleResize = useCallback(() => {
    if (!cardRef.current) {
      return;
    }

    // with padding
    const width = cardRef.current.offsetHeight;
    const height = cardRef.current.offsetHeight;

    const physicalSize = new LogicalSize(width, height);

    const mainWindow = getCurrentWebviewWindow();
    // mainWindow.setSize(physicalSize);

    const minSize = new LogicalSize(64, physicalSize.height);
    const maxSize = new LogicalSize(physicalSize.width, physicalSize.height);

    // mainWindow.setMinSize(minSize);
    mainWindow.setMaxSize(maxSize);
  }, []);

  useEffect(() => {
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    }

  }, [handleResize])

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

        <div ref={cardRef}>
          <Container />
        </div>
      </ThemeProvider>
    </DraggingProvider>
  );
}

function Container() {

  const { addIgnoreDragTarget, removeIgnoreDragTarget } = useContext(DraggingContext)

  const sessionControlRef = useRef<HTMLDivElement>(null);

  const { audioDeviceList, defaultDevice } = useWindowsAudioState();

  useEffect(() => {
    console.log("Default device changed:", defaultDevice);
  }, [defaultDevice])


  useEffect(() => {
    if (sessionControlRef.current) {
      addIgnoreDragTarget(sessionControlRef.current);
    }

    return () => {
      if (sessionControlRef.current) {
        removeIgnoreDragTarget(sessionControlRef.current);
      }
    };
  }, [addIgnoreDragTarget, removeIgnoreDragTarget]);


  const handleContextMenu = useRegisterContextMenu({ defaultDevice: defaultDevice, deviceList: audioDeviceList });
  useEffect(() => {
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    }
  }, [handleContextMenu])


  return (
    <Card>
      <CardContent>
        {defaultDevice && (
          <SessionControlProvider
            deviceId={defaultDevice.id}
          >
            <Meter
              device={defaultDevice}
              defaultVolume={defaultDevice.volume}
              deviceList={audioDeviceList}
            />
            <div ref={sessionControlRef}>
              <SessionVolumeControl deviceId={defaultDevice.id} />
            </div>
          </SessionControlProvider>
        )}

        {!defaultDevice && (
          <Stack spacing={2} alignItems="center">
            <CircularProgress />
          </Stack>
        )}
      </CardContent>
    </Card>
  )

}

export default App;
