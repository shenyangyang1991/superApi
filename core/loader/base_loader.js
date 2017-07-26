'use strick';

const assert = require('assert');
const is = require('is-type-of');
const debug = require('debug')('BaseLoader');
const path = require('path');
const fs = require('fs');
const globby = require('globby');
const FULLPATH = Symbol('SUPERAPI_LOADER_ITEM_FULLPATH');
const EXPORTS = Symbol('SUPERAPI_LOADER_ITEM_EXPORTS');
/**
 * defaults options
 * @param {String|Array} options.directory - directories to be loaded
 * @param {Object} options.target - attach the target object from loaded files
 * @param {String} options.match - match the files when load, support glob, default to all js files
 * @param {String} options.ignore - ignore the files when load, support glob
 * @param {Function} options.initializer - custom file exports, receive two parameters, first is the inject object(if not js file, will be content buffer), second is an `options` object that contain `path`
 * @param {Boolean} options.call - determine whether invoke when exports is function
 * @param {Boolean} options.override - determine whether override the property when get the same name
 * @param {Object} options.inject - an object that be the argument when invoke the function
 * @param {Function} options.filter - a function that filter the exports which can be loaded
 * @param {String|Function} options.caseStyle - set property's case when converting a filepath to property list.
 */

const defaults = {
  directory: null,
  target: null,
  match: undefined,
  ignore: undefined,
  caseStyle: 'camel',
  initializer: null,
  call: true,
  override: false,
  inject: undefined,
  filter: null,
};

/**
 * Load files from directory to target object.
 * @since 0.1.0
 */
class BaseLoader {
  /**
   * @constructor
   * @param {Object} options options
   */
  constructor(options) {
    assert(options.directory, 'options.directory is required');
    assert(options.target, 'options.target is required');

    this.options = Object.assign({}, defaults, options);
  }

  load() {
    const items = this.parse();
    const target = this.options.target;
    for (const item of items) {
      debug('loading item %j', item);
      item.properties.reduce((target, property, index) => {
        let obj;
        const properties = item.properties.slice(0, index + 1).join('.');
        if (index === item.properties.length - 1) {
          if (property in target) {
            if (!this.options.override)
              throw new Error(`can't overwrite property '${properties}' from ${target[property][FULLPATH]} by ${item.fullpath}`);
          }
          obj = item.exports;
          if (obj && !is.primitive(obj)) {
            obj[FULLPATH] = item.fullpath;
            obj[EXPORTS] = true;
          }
        } else {
          obj = target[property] || {};
        }
        target[property] = obj;
        debug('loaded %s', properties);
        return obj;
      }, target);
    }
    return target;
  }

  parse() {
    let files = this.options.match || ['**/*.js'];
    files = Array.isArray(files) ? files : [files];
    let ignore = this.options.ignore;
    if (ignore) {
      ignore = Array.isArray(ignore) ? ignore : [ignore];
      ignore = ignore.filter(f => !!f).map(f => `!${f}`);
      files = files.concat(ignore);
    }

    let directories = this.options.directory;
    if (!Array.isArray(directories)) {
      directories = [directories];
    }

    const filter = is.function(this.options.filter) ? this.options.filter : null;
    const items = [];
    debug('parsing %j', directories);
    for (const directory of directories) {
      const filepaths = globby.sync(files, {
        cwd: directory
      });
      // debug('filepaths %j', filepaths);
      for (const filepath of filepaths) {
        const fullpath = path.join(directory, filepath);
        // debug('fullpath %j', fullpath);
        if (!fs.statSync(fullpath).isFile()) continue;
        const properties = this.__getProperties(filepath, this.options);
        const pathName = directory.split(/\/|\\/).slice(-1) + '.' + properties.join('.');
        const exports = this.__getExports(fullpath, this.options, pathName);
        if (exports == null || (filter && filter(exports) === false)) continue;

        if (is.class(exports)) {
          exports.prototype.pathName = pathName;
          exports.prototype.fullpath = fullpath;
        }

        items.push({
          fullpath,
          properties,
          exports
        });
        debug('parse %s, properties %j, export %o', fullpath, properties, exports);
      }
    }

    return items;
  }

  __getProperties(filepath, {caseStyle}) {
    if (is.function(caseStyle)) {
      const result = caseStyle(filepath);
      assert(is.array(result), `caseStyle expect an array, but got ${result}`);
      return result;
    }

    return this.__defaultCamelize(filepath, caseStyle);
  }

  __defaultCamelize(filepath, caseStyle) {
    const properties = filepath.substring(0, filepath.lastIndexOf('.')).split('/');
    return properties.map(property => {
      if (!/^[a-z][a-z0-9_-]*$/i.test(property)) {
        throw new Error(`${property} is not match 'a-z0-9_-' in ${filepath}`);
      }
      property = property.replace(/[_-][a-z]/ig, s => s.substring(1).toUpperCase());
      let first = property[0];
      switch (caseStyle) {
        case 'lower':
          first = first.toLowerCase();
          break;
        case 'upper':
          first = first.toUpperCase();
          break;
        case 'camel':
        default:
      }
      return first + property.substring(1);
    });
  }

  loadFile(filepath) {
    try {
      const extname = path.extname(filepath);
      if (!['.js', '.node', '.json', ''].includes(extname)) {
        return fs.readFileSync(filepath);
      }
      const obj = require(filepath);
      if (!obj) return obj;
      if (obj.__esModule) return 'default' in obj ? obj.default : obj;
      return obj;
    } catch (err) {
      err.message = `[superAPI-core] load file: ${filepath}, error: ${err.message}`;
      throw err;
    }
  }

  __getExports(fullpath, {initializer, call, inject}, pathName) {
    let exports = this.loadFile(fullpath);
    if (initializer) {
      exports = initializer(exports, {
        path: fullpath,
        pathName
      });
    }

    if (is.class(exports) || is.promise(exports)) {
      return exports;
    }

    if (call && is.function(exports)) {
      exports = exports(inject);
      if (exports != null) {
        return exports;
      }
    }
    return exports;
  }
}

module.exports = BaseLoader;
