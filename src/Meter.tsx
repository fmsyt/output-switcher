import { window as tauriWindow } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";

import { Box, Grid, IconButton, Slider, Stack, Typography } from "@mui/material";
import { MeterProps } from "./types";

import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useCallback, useEffect, useRef, useState } from "react";

import { invokeQuery } from "./ipc";

const volumeStep = 0.01;


async function registerListeners() {
  const QDefaultAudioChange = listen('QDefaultAudioChange', (event) => {
    invokeQuery({
      kind: "QDefaultAudioChange",
      id: event.payload as string,
    });
  });

  await Promise.all([
    QDefaultAudioChange,
  ]);
}

registerListeners();

export default function Meter(props: MeterProps) {

  const { device, defaultVolume, deviceList } = props;

  const dragAreaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!dragAreaRef.current) {
      return;
    }

    const handler = async () => {
      await tauriWindow.appWindow.startDragging();
    }

    dragAreaRef.current.addEventListener("mousedown", handler);

    return () => {
      dragAreaRef.current?.removeEventListener("mousedown", handler);
    }

  }, [])

  const handlerIdRef = useRef<number | null>(null);

  const displayVolume = useCallback((v: number) => Math.round(v * 100), []);

  const [volume, setVolume] = useState(device.volume || 0);
  const [muted, setMuted] = useState(device.muted);

  useEffect(() => setVolume(defaultVolume || 0), [defaultVolume]);
  useEffect(() => setMuted(device.muted), [device.muted]);

  const invokeChangeVolume = useCallback(async (volume: number) => {
    if (!device) {
      return;
    }

    if (handlerIdRef.current !== null) {
      clearTimeout(handlerIdRef.current);
    }

    handlerIdRef.current = window.setTimeout(async () => {
      await invokeQuery({
        kind: "QVolumeChange",
        id: device.id,
        volume,
      });
    }, 10);

  }, [device.id]);

  const handleChangeVolume = useCallback((event: Event, volume: number | number[]) => {

    event.stopPropagation();
    event.preventDefault();

    setVolume(volume as number);
    invokeChangeVolume(volume as number);

  }, [invokeChangeVolume])

  const handleWheel = useCallback((event: WheelEvent) => {

    if (!device) {
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


  }, [invokeChangeVolume]);

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
      kind: "QMuteStateChange",
      id: device.id,
      muted: !muted,
    });

  }, [device, muted]);



  const handleContextMenu = useCallback((e: MouseEvent) => {

    if (!deviceList) {
      return;
    }

    e.preventDefault();

    const items = deviceList.map((d) => ({
      label: d.name,
      event: "QDefaultAudioChange",
      payload: d.id,
      checked: d.id === device.id,
    }));

    invoke("plugin:context_menu|show_context_menu", {
      pos: { x: e.clientX, y: e.clientY },
      items,
    });


  }, [device, deviceList]);

  useEffect(() => {
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    }
  }, [handleContextMenu]);



  return (
    <Grid
      container
      display="grid"
      gridTemplateColumns={"max-content 1fr"}
      gridTemplateRows={"repeat(2, auto)"}
      alignItems="center"
    >
      <IconButton onClick={handleToggleMute}>
        {muted ? <VolumeOffIcon /> : volume === 0 ? <VolumeMuteIcon /> : <VolumeUpIcon />}
      </IconButton>

      <Typography
        ref={dragAreaRef}
        variant="h6"
        component="div"
        width="100%"
        noWrap
      >
        {device.name}
      </Typography>

      <div></div>

      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        ref={scrollAreaRef}
      >
        <Slider
          value={volume}
          onChange={handleChangeVolume}
          min={0}
          max={1}
          step={volumeStep}
          disabled={muted}
        />
        <Box textAlign="right" width="2em">
          <Typography variant="h6">
            {displayVolume(volume)}
          </Typography>
        </Box>
      </Stack>

    </Grid>
  )
}
