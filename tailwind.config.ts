import color from "tailwindcss/colors";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  theme: {
    extend: {
      colors: {
        primary: color.blue,
        gray: color.zinc,
      },

      fontFamily: {
        mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono],
      }
    },
  },
};
