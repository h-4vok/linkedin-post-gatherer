export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Blob: "readonly",
        BroadcastChannel: "readonly",
        chrome: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        navigator: "readonly",
        MutationObserver: "readonly",
        URL: "readonly",
        window: "readonly",
      },
    },
    rules: {},
  },
];
