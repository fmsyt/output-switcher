import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { Grid, IconButton, Stack, Typography } from "@mui/material";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import Slider from './component/Slider';
import { invokeQuery } from "./ipc";
import type { MeterProps } from "./types";

const volumeStep = 0.01;

async function registerListeners() {
  const DefaultAudioChange = listen('DefaultAudioChange', (event) => {
    invokeQuery({
      kind: "DefaultAudioChange",
      id: event.payload as string,
    });
  });

  await Promise.all([
    DefaultAudioChange,
  ]);
}

registerListeners();

export default function MasterVolumeControl(props: MeterProps) {

  const { device } = props;

  const [volume, setVolume] = useState(device?.volume || 0);
  const [muted, setMuted] = useState(device?.muted);

  useEffect(() => setVolume(device?.volume || 0), [device?.volume]);
  useEffect(() => {
    if (device?.muted !== undefined) {
      setMuted(device.muted);
      return;
    }

    // NOTE: 再生デバイスがなければミュート扱いにする
    setMuted(true);
  }, [device?.muted]);

  const handlerIdRef = useRef<number | null>(null);
  const invokeChangeVolume = useCallback(async (volume: number) => {
    if (!device?.id) {
      return;
    }

    if (handlerIdRef.current !== null) {
      clearTimeout(handlerIdRef.current);
    }

    handlerIdRef.current = window.setTimeout(async () => {
      await invokeQuery({
        kind: "VolumeChange",
        id: device.id,
        volume,
      });
    }, 10);

  }, [device?.id]);

  const handleChangeVolume = useCallback((event: Event, volume: number | number[]) => {

    event.stopPropagation();
    event.preventDefault();

    setVolume(volume as number);
    invokeChangeVolume(volume as number);

  }, [invokeChangeVolume])

  const handleWheel = useCallback((event: WheelEvent) => {

    if (muted) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setVolume((volume) => {

      const delta = event.deltaY || event.deltaX;

      const direction = volume + (delta > 0 ? -volumeStep : volumeStep);
      const nextVolume = Math.min(1, Math.max(0, direction));

      invokeChangeVolume(nextVolume);

      return nextVolume;
    })


  }, [invokeChangeVolume, muted]);

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollAreaRef.current) {
      return;
    }

    scrollAreaRef.current.addEventListener("wheel", handleWheel);

    return () => {
      scrollAreaRef.current?.removeEventListener("wheel", handleWheel);
    }
  }, [handleWheel]);


  const handleToggleMute = useCallback(async () => {

    if (!device) {
      return;
    }

    setMuted(!muted);

    await invokeQuery({
      kind: "MuteStateChange",
      id: device.id,
      muted: !muted,
    });

  }, [device, muted]);


  const displayVolume = useCallback((v: number) => Math.round(v * 100), []);

  return (
    <Grid
      container
      display="grid"
      gridTemplateColumns={"max-content 1fr"}
      gridTemplateRows={"repeat(2, auto)"}
      alignItems="center"
      ref={scrollAreaRef}
    >
      <IconButton
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleToggleMute}
        size="small"
      >
        {muted ? <VolumeOffIcon /> : volume === 0 ? <VolumeMuteIcon /> : <VolumeUpIcon />}
      </IconButton>

      <Typography
        variant="body1"
        component="div"
        width="100%"
        noWrap
      >
        {device?.name || "No Device"}
      </Typography>

      <div />

      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
      >
        <Slider
          value={volume}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={handleChangeVolume}
          min={0}
          max={1}
          step={volumeStep}
          disabled={muted}
          size="small"
        />
        <Typography variant="body1" textAlign="center" width="2em">
          {displayVolume(volume)}
        </Typography>
      </Stack>

    </Grid>
  )
}
