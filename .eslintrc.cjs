module.exports = {
  root: true,
  parser: "@babel/eslint-parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
    requireConfigFile: false,
    babelOptions: {
      presets: ["@babel/preset-react"],
    },
  },
  env: {
    browser: true,
    es2021: true,
  },
  globals: {
    window: "readonly",
    document: "readonly",
    console: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    setInterval: "readonly",
    clearInterval: "readonly",
    localStorage: "readonly",
    sessionStorage: "readonly",
    fetch: "readonly",
    crypto: "readonly",
  },
  plugins: ["react"],
  extends: ["eslint:recommended", "plugin:react/recommended"],
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-console": "off",
    "react/prop-types": "off", // Disable prop-types validation
    "no-empty": "warn", // Change empty blocks from error to warning
  },
  settings: {
    react: {
      version: "detect",
    },
  },
  ignorePatterns: [
    "dist/**/*", // Ignore built files
    "node_modules/**/*",
  ],
  overrides: [
    // Node.js environment for scripts
    {
      files: ["scripts/**/*.js"],
      env: {
        node: true,
        browser: false,
      },
      globals: {
        process: "readonly",
      },
    },
  ],
};
