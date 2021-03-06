const should = require('chai').should();
const pathFn = require('path');
const Promise = require('bluebird');
const rewire = require('rewire');
const Context = require('../../lib/context');
const hxFs = require('hexo-fs');
const HashStream = require('../../util/hash').HashStream;

describe('init', function() {
  let assetDir = pathFn.join(__dirname, '../../assets');
  let baseDir = pathFn.join(__dirname, 'init_test');
  let initModule = rewire('../../lib/console/init');
  let reco = new Context(baseDir, { silent: true });
  let init = initModule.bind(reco);
  let assets = [];
  let projectName = 'foobar';
  let userName = 'ben'

  function rmdir(path) {
    return hxFs.rmdir(path).catch(function(err) {
      if (err.cause && err.cause.code === 'ENOENT') return;
      throw err;
    });
  }

  function pipeStream(rs, ws) {
    return new Promise(function(resolve, reject) {
      rs.pipe(ws)
        .on('error', reject)
        .on('finish', resolve);
    });
  }

  function compareFile(a, b) {
    let streamA = new HashStream();
    let streamB = new HashStream();

    return Promise.all([
      pipeStream(hxFs.createReadStream(a), streamA),
      pipeStream(hxFs.createReadStream(b), streamB)
    ]).then(function() {
      return streamA.read().equals(streamB.read());
    });
  }

  function check(path) {
    return Promise.each(assets, function(item) {
      return compareFile(
        pathFn.join(assetDir, item),
        pathFn.join(path, projectName ,item)
      ).should.eventually.be.true;
    });
  }

  before(function() {
    return hxFs.listDir(assetDir).then(function(files) {
      assets = files;
    });
  });

  after(function() {
    return rmdir(baseDir);
  });

  it('new project', function() {
    return init({ _: [projectName], u: userName, install: false }).then(() => {
      return check(baseDir);
    });
  });

  it('folder exists', function() {
    return init({ _: [projectName], install: false });
  });
});
