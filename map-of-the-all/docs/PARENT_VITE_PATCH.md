# Minimal parent Vite change

The existing `Star_System_Planner/vite.config.ts` must include both HTML entrypoints under `defineConfig`:

```ts
import path from 'path'; // already present
// Keep the existing Vite config, plugins and PWA declarations unchanged.
build: {
  rollupOptions: {
    input: {
      app: path.resolve(__dirname, 'index.html'),
      atlas: path.resolve(__dirname, 'map-of-the-all/index.html'),
    },
  },
},
```

**Verify** Vite keeps the main PWA manifest, scripts, original `index.html`, build budget and generated atlas page. Avoid writing docs/index.html in Dossier; its build is a separate published pipeline.
