import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { rolldownOptions: { output: { codeSplitting: { groups: [
    { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
    { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
    { name: 'web3', test: /node_modules[\\/](viem|wagmi|@wagmi|@tanstack|ox|abitype|@noble|@scure)[\\/]/ },
  ] } } } },
})
