import { Card, CardContent, CircularProgress, CssBaseline, Stack } from "@mui/material";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useContext, useEffect, useMemo, useRef } from "react";
import Meter from "./Meter";
import SessionVolumeControl from "./SessionVolumeControl";
import ThemeProvider from "./ThemeProvider";
import DraggingContext from "./effect/dragging/DraggingContext";
import DraggingProvider from "./effect/dragging/DraggingProvider";
import useWindowsAudioState from "./useWindowsAudioState";

function App() {

  const cardRef = useRef<HTMLDivElement>(null);
  // const { addIgnoreDragTarget, removeIgnoreDragTarget } = useDragging();

  useEffect(() => {

    if (!cardRef.current) {
      return;
    }

    // with padding
    const width = cardRef.current.clientWidth + 32;
    const height = cardRef.current.clientHeight + 32;

    const physicalSize = new LogicalSize(width, height);

    const mainWindow = getCurrentWebviewWindow();
    mainWindow.setSize(physicalSize);

    const minSize = new LogicalSize(64, physicalSize.height);
    const maxSize = new LogicalSize(physicalSize.width, physicalSize.height);

    // mainWindow.setMinSize(minSize);
    // mainWindow.setMaxSize(maxSize);

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
    if (sessionControlRef.current) {
      addIgnoreDragTarget(sessionControlRef.current);
    }

    return () => {
      if (sessionControlRef.current) {
        removeIgnoreDragTarget(sessionControlRef.current);
      }
    };
  }, [addIgnoreDragTarget, removeIgnoreDragTarget]);


  return (
    <Card>
      <CardContent>
        {defaultDevice && (
          <>
            <Meter
              device={defaultDevice}
              defaultVolume={defaultDevice.volume}
              deviceList={audioDeviceList}
            />
            <div ref={sessionControlRef}>
              <SessionVolumeControl deviceId={defaultDevice.id} />
            </div>
          </>
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
