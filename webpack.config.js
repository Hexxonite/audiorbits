const path = require('path');

const OfflinePlugin = require('./src/we_utils/src/offline/OfflinePlugin');
const WascBuilderPlugin = require('./src/we_utils/src/wasc-worker/WascBuilderPlugin');

module.exports = {
  mode: 'production',
  entry: {
    audiorbits: './dist/babel/AudiOrbits.js'
  },
  output: {
    chunkFilename: '[id].bundle.js',
    path: path.resolve(__dirname, 'dist', 'pack')
  },
  devServer: {
    contentBase: path.resolve(__dirname, 'dist', 'pack'),
    port: 9000,
    headers: {
      "Access-Control-Allow-Origin": "*",
      https: true
    },
    // dont use any live features...
    // otherwise, it will recompile
    hot: false,
    inline: false,
    liveReload: false
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      // use a specific loader for workers...
      {
        test: /\.worker\.(c|m)?js$/i,
        loader: 'worker-loader',
        options: {
          esModule: true,
          chunkFilename: '[id].[chunkhash].worker.js',
        },
      },
      // exclude .asc from the bundle
      {
        test: /.*\.asc$/i,
        loader: 'null-loader'
      },
      // exclude live reloading from the bundle -_- no other way?
      {
        test: path.resolve(__dirname, 'node_modules/webpack-dev-server/client'),
        loader: 'null-loader'
      }
    ]
  },
  plugins: [
    // manual wasm module build
    // just so you don't have to modify the process everytime...
    // this will compile all modules in 'rootpath' (recursive)
    // where the 'include' (regex) matches a filename.
    new WascBuilderPlugin({
      production: true, // TODO for release
      relpath: '../../../',
      extension: 'asc',
      cleanup: true
    }),
    // offline worker helper
    // will create a list of all app-files.
    // this list is used to cache the app offline in browser.
    new OfflinePlugin({
      staticdir: "dist/pack/",
      outfile: 'offlinefiles.json',
      extrafiles: ["/"],
      pretty: false // TODO for release
    })
  ]
};
