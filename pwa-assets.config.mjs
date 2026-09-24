// Regenerate icons: npx @vite-pwa/assets-generator@1
export default {
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']] },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#2458d6' } },
    apple: { sizes: [180], padding: 0, resizeOptions: { background: '#2458d6' } },
  },
  images: ['public/icon.svg'],
}
