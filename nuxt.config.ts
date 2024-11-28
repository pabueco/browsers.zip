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
          api: "modern-compiler",
          additionalData: `@use "@/assets/element.scss" as element;`,
        },
      },
    },
  },

  app: {
    head: {
      link: [
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;800&display=swap",
        },
      ],
    },
  },

  compatibilityDate: "2024-11-28",
});
