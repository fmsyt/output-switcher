<svelte:head>
  <link rel="stylesheet" href="node_modules/svelte-material-ui/bare.css" />
  <link rel="stylesheet" href="/smui.css" media="(prefers-color-scheme: light)" />
  <link rel="stylesheet" href="/smui-dark.css" media="screen and (prefers-color-scheme: dark)" />

  <link rel="stylesheet" href="style.css">

</svelte:head>

<script lang="ts">
  import LayoutGrid, { Cell } from '@smui/layout-grid';
  import Paper, { Content } from '@smui/paper';
  import Select, { Option } from '@smui/select';
  import Slider from '@smui/slider';

  import { window as tauriWindow } from "@tauri-apps/api";
  import { onMount, onDestroy } from "svelte";
  import Speaker from "svelte-material-icons/Speaker.svelte";

  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { invokeQuery } from './lib/ipc/query';
  import type { AudioDeviceInfo, AudioStateChangePayload, WindowsAudioState } from './lib/types';

  let defaultAudioDeviceId: string;
  let defaultAudioDevice: AudioDeviceInfo | undefined;
  let audioDeviceList: AudioDeviceInfo[] = [];

  let unListen: UnlistenFn | undefined;

  async function mousedownHandler() {
    await tauriWindow.appWindow.startDragging();
  }

  onMount(async () => {
    document.addEventListener("mousedown", mousedownHandler);

    console.log("Listening for windowsAudioState");

    unListen = await listen<AudioStateChangePayload>("audio_state_change", (event) => {
      console.log("windowsAudioState", event.payload);

      defaultAudioDeviceId = event.payload.windowsAudioState.default;
      audioDeviceList = event.payload.windowsAudioState.audioDeviceList;

      defaultAudioDevice = audioDeviceList.find((device) => device.id === defaultAudioDeviceId);
    });

    invokeQuery({ kind: "QAudioDict" });
  });


  onDestroy(() => {
    unListen && unListen();
    document.removeEventListener("mousedown", mousedownHandler);
  });


</script>

<style>

  .container * {
    outline: olivedrab solid 1px;
  }

</style>

<main class="container" data-tauri-drag-region>
  <LayoutGrid>
    <Cell>
      <Paper>
        <Content class="flex-row-start">
          <Select bind:value={defaultAudioDeviceId}>
            {#each audioDeviceList as device}
              <Option value={device.id}>{device.name}</Option>
            {/each}
          </Select>
        </Content>
      </Paper>
    </Cell>
    <Cell>
      <Paper>
        <Content class="flex-row-start">
          <Speaker />
          <span>{defaultAudioDevice?.name}</span>
        </Content>
      </Paper>
    </Cell>
    <Cell>
      <Paper>

        <Content class="flex-row-start">
          <Slider />
          <span>{defaultAudioDevice?.volume}</span>
        </Content>

      </Paper>

    </Cell>
    <!--
    <Cell>
      <Paper>
        <Content class="flex-row-start">
          <pre>{JSON.stringify(audioDeviceList, null, 2)}</pre>
        </Content>
      </Paper>
    </Cell>
    -->
  </LayoutGrid>

</main>

