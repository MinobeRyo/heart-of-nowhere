import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
          'three-effects': [
            'three/addons/postprocessing/EffectComposer.js',
            'three/addons/postprocessing/RenderPass.js',
            'three/addons/postprocessing/UnrealBloomPass.js',
            'three/addons/postprocessing/OutputPass.js',
            'three/addons/objects/Reflector.js',
          ],
        },
      },
    },
  },
});
