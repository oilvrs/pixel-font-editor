import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    port: 3003
  } // relativa sökvägar, så filerna fungerar utan build från valfri mapp
})
