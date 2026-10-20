/*
 * Module Federation build for fat-git.
 * MF name comes from plugin.json so it stays aligned with the host.
 */
const path = require("path");
const { ModuleFederationPlugin } = require("@module-federation/enhanced/webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const manifest = require("./plugin.json");

const MF_NAME =
  process.env.PLUGIN_MF_NAME ||
  manifest.mfName ||
  manifest.container ||
  "plugin_877da771_e35f_49cf_9f9a_468dff6269f5";

module.exports = (_, argv) => {
  const isProd = argv && argv.mode === "production";
  // eslint-disable-next-line no-console
  console.log(`[fat-git] building remoteEntry as MF name: "${MF_NAME}"`);
  return {
    entry: "./src/bootstrap.ts",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].[contenthash:8].js",
      chunkFilename: isProd ? "[name].[contenthash:8].js" : "[name].js",
      publicPath: "auto",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: {
            loader: "ts-loader",
            options: { transpileOnly: true },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.(css|less)$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                modules: {
                  auto: (resourcePath) => resourcePath.endsWith(".less"),
                  namedExport: false,
                  localIdentName: "[local]_[hash:base64:5]",
                },
              },
            },
            "less-loader",
          ],
        },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: MF_NAME,
        filename: "remoteEntry.js",
        library: { type: "global", name: MF_NAME },
        exposes: {
          "./plugin": "./src/index.tsx",
        },
        shared: {
          react: { singleton: true, requiredVersion: "18.2.0", eager: false },
          "react-dom": {
            singleton: true,
            requiredVersion: "18.2.0",
            eager: false,
          },
          "react/jsx-runtime": {
            singleton: true,
            requiredVersion: "18.2.0",
            eager: false,
          },
          "react-redux": {
            singleton: true,
            requiredVersion: "9.1.2",
            eager: false,
          },
          "react-intl": {
            singleton: true,
            requiredVersion: "6.8.4",
            eager: false,
          },
          antd: { singleton: true, requiredVersion: "6.3.1", eager: false },
        },
      }),
      new HtmlWebpackPlugin({ template: "./public/index.html" }),
    ],
    devtool: isProd ? false : "source-map",
    optimization: { minimize: isProd },
  };
};
