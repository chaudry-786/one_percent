/** Tailwind for One Percent. Built by the standalone CLI (see Dockerfile / dev.sh); no Node needed. */
module.exports = {
  content: ["./templates/**/*.html", "./static/js/**/*.js"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
};
