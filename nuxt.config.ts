// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@nuxtjs/tailwindcss", "@element-plus/nuxt", "@vueuse/nuxt"],
  elementPlus: {
    themes: ["dark"],
    importStyle: "scss",
  },
  ssr: false,

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/assets/element.scss" as element;`,
        },
      },
    },
  },
});
