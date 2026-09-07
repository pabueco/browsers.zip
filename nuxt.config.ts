// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@nuxtjs/tailwindcss", "@element-plus/nuxt", "@vueuse/nuxt"],

  elementPlus: {
    themes: ["dark"],
    importStyle: "scss",
  },

  ssr: false,

  routeRules: {
    "/api/chromium/versions/**": { isr: 21_600 },
    "/api/chromium/snapshot/**": { isr: 2_592_000 },
  },

  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ["element-plus/global"],
      },
    },
  },

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
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
