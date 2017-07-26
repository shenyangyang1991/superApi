'use strick';

const path = require('path');
const Koa = require('koa');
const is = require('is-type-of');
const app = new Koa();
const loader = require('./core/loader/base_loader');
app['controller'] = {};
const ctr = new loader({
  caseStyle: 'lower',
  directory: path.join(__dirname, 'app/controller'),
  initializer: (obj, opt) => {
    if (is.function(obj) && !is.promise(obj) && !is.class(obj)) {
      obj = obj(app);
    }
    if (is.class(obj)) {
      obj.prototype.pathName = opt.pathName;
      obj.prototype.fullPath = opt.path;
      return wrapClass(obj);
    }
    if (is.object(obj)) {
      return wrapObject(obj, opt.path);
    }

    return obj;
  },
  target: app['controller'],
  inject: app,
}).load();

function wrapClass(Controller) {
  const proto = Controller.prototype;
  const keys = Object.getOwnPropertyNames(proto);
  const ret = {};
  for (const key of keys) {
    if (key === 'constructor') {
      continue;
    }
    const d = Object.getOwnPropertyDescriptor(proto, key);
    if (is.function(d.value)) {
      ret[key] = methodToMiddleware(Controller, key);
    }
  }
  return ret;
}

function methodToMiddleware(Controller, key) {
  return async function classControllerMiddleware() {
    const controller = new Controller(this);
    const r = controller[key](this);
    if (is.promise(r)) {
      await r;
    }
  }
}
