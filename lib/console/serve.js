'use strict';

const fs = require('fs');
const utilFs = require('../../util/fs');
const pathFn = require('path');
const Promise = require('bluebird');
const format = require('util').format;
const open = require('opn');
const net = require('net');
const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const WebpackDevServer = require('webpack-dev-server');
const chalk = require('chalk');
const ifaces = require('os').networkInterfaces();
const ProgressBarPlugin = require('progress-bar-webpack-plugin');

module.exports = function(args) {
  args = args || {};
  let ip = args.i || args.ip || '0.0.0.0';
  let port = parseInt(args.port || args.p) || 8003;

  process.env.NODE_ENV = 'development';
  process.env.BABEL_ENV = 'development';
  process.env.SERVER_PORT = port;

  let userConfig = require(pathFn.join(this.baseDir, 'userConfig.js'));
  let pageConfig = require(pathFn.join(this.baseDir, userConfig.pageConfig));
  let baseConfig = Object.assign({}, userConfig, pageConfig);

  let self = this;
  let log = this.log;
  let devDir = baseConfig.devDirectory || '_tmp';
  let startup = false;

  return checkPort(ip, port).then(function() {
    return utilFs.copyFileSync(
      pathFn.join(__dirname, '../react/react_dev.js'),
      pathFn.join(self.baseDir, devDir, 'react.js')
    );
  }).then(function() {
    let baseConfigPath = 'webpack/webpack.config.base.js';
    let devServerConfigPath = 'webpack/webpack.config.devServer.js';

    let projBaseConfigPath = pathFn.join(self.baseDir, 'config', baseConfigPath);
    let projDevServerConfigPath = pathFn.join(self.baseDir, 'config', devServerConfigPath);

    let webpackBaseConfig = fs.existsSync(projBaseConfigPath) ?
      require(projBaseConfigPath) : require('../' + baseConfigPath);
    let webpackDevServerConfig = fs.existsSync(projDevServerConfigPath) ?
      require(projDevServerConfigPath) : require('../' + devServerConfigPath);

    let serverConfig = webpackMerge(
      webpackBaseConfig(baseConfig, args), webpackDevServerConfig(baseConfig));

    if (!self.args.silent) {
      serverConfig.plugins.push(
        new ProgressBarPlugin({
          format: 'build [:bar] ' + chalk.green.bold(':percent') +
            ' (:elapsed seconds) ' + chalk.gray(':msg'),
          renderThrottle: 100,
          clear: false,
          summary: false,
          callback: function() {
            log.info(chalk.yellow(
              'Webpack server is running. Press Ctrl+C to stop.'));
            log.info(chalk.yellow('Server listening at:'));

            Object.keys(ifaces).map(key => {
              ifaces[key].map(details => {
                if (details.family === 'IPv4') {
                  log.info(`http://${details.address}:` + chalk.green(`${port}`));
                }
              });
            });
            if ( (args.o | args.open) && !startup ) {
              let addr = formatAddress(ip, port, 'webpack-dev-server');
              open(addr);
            }
            startup = true;
          }
        })
      )
    }

    let compiler = webpack(serverConfig);
    return compiler;
  }).then(function(compiler) {
    let contentBase = self.baseDir.replace(/\\/g, '/');
    let publicPath = pathFn.join(`/${devDir}/`, baseConfig.path, '/').replace(/\\/g, '/');
    return startServer(compiler, contentBase, publicPath, ip, port);
  }).catch(function(err) {
    switch (err.code) {
      case 'EADDRINUSE':
        log.fatal('Port %d has been used. Try another port instead.', port);
        break;
    }
    throw err;
  })
}

function startServer(compiler, contentBase, publicPath, ip, port) {
  return new Promise(function(resolve, reject) {
    let server = new WebpackDevServer(compiler, {
      contentBase: contentBase,
      publicPath: publicPath,
      hot: true,
      noInfo: true,
      stats: {
        colors: true
      },
      headers: { "Access-Control-Allow-Origin": "*" }
    });

    server.listen(port, ip, function(error) {
      if (error) {
        reject(error);
      }
      resolve(server);
    });
  });
}

function checkPort(ip, port) {
  return new Promise(function(resolve, reject) {
    if (port > 65535 || port < 1) {
      return reject(new Error(
        `Invalid port number of ${port}. Try another port number between 1 and 65535.`));
    }

    let server = net.createServer();
    server.listen(port, ip);

    server.once('error', reject);

    server.once('listening', function() {
      server.close();
      resolve();
    });
  });
}

function formatAddress(ip, port, root) {
  if (ip === '0.0.0.0') ip = 'localhost';

  return format('http://%s:%d/%s', ip, port, root);
}
