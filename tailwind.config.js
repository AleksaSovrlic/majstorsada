/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{vue,js,ts}',
    './nuxt.config.{js,ts}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#05243a',
          blue: {
            DEFAULT: '#1186dc',
            dark: '#0f78c3'
          }
        }
      }
    }
  },
  plugins: []
}


