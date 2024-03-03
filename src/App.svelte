<svelte:head>
  <link rel="stylesheet" href="node_modules/svelte-material-ui/bare.css" />
</svelte:head>

<script lang="ts">
  import Paper, { Content, Subtitle, Title } from '@smui/paper';
  import { window as tauriWindow } from "@tauri-apps/api";
  import { onMount } from "svelte";

  import Greet from "./lib/Greet.svelte";

  onMount(async () => {
    document.addEventListener("mousedown", async (_) => {
      await tauriWindow.appWindow.startDragging();
    });
  });
</script>

<main class="container" data-tauri-drag-region>
  <h1>Welcome to Tauri!</h1>

  <div class="row">
    <a href="https://vitejs.dev" target="_blank">
      <img src="/vite.svg" class="logo vite" alt="Vite Logo" />
    </a>
    <a href="https://tauri.app" target="_blank">
      <img src="/tauri.svg" class="logo tauri" alt="Tauri Logo" />
    </a>
    <a href="https://svelte.dev" target="_blank">
      <img src="/svelte.svg" class="logo svelte" alt="Svelte Logo" />
    </a>
  </div>

  <p>Click on the Tauri, Vite, and Svelte logos to learn more.</p>

  <div class="row">
    <Greet />

    <Paper class="panel">
      <Title>Resources</Title>
      <Subtitle>Learn more about Tauri, Vite, and Svelte</Subtitle>
      <Content>
        <ul>
          <li>
            <a href="https://tauri.app" target="_blank">Tauri</a>
          </li>
          <li>
            <a href="https://vitejs.dev" target="_blank">Vite</a>
          </li>
          <li>
            <a href="https://svelte.dev" target="_blank">Svelte</a>
          </li>
        </ul>
      </Content>
    </Paper>
  </div>
</main>

