export default {
  content: ["./index.html", "./src/**/*.ts"],
  theme: {
    extend: {
      colors: {
        acc: "#D4B47C",
        ink: "#0A0A0A",
        paper: "#F5F4F0",
        pass: "#F4F2EC",
        dialog: "#0E0E10",
        panel: "rgba(10, 10, 12, 0.92)",
        mute: { 1: "#C7C7CC", 2: "#A1A1A6", 3: "#8E8E93", 4: "#5A5A5E", 5: "#4A4A4E" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "serif"],
      },
    },
  },
};
