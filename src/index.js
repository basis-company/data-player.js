import { nativeIsArray } from 'underscore/modules/_setup.js';
import { applyOwn } from 'helpers/apply';
import { copyOwn } from 'helpers/copy';
import { push } from 'helpers/push';

const opt = {
  keySorter: false,  // (a, b) => a <=> b
};

export function init(config) {
  applyOwn(opt, config);
}

export class Index {
  constructor(keys) {
    this.data = {};
    this.keys = keys.slice();

    if (opt.keySorter) {
      this.keys.sort(opt.keySorter);
    }

    this.initialize(keys);
  }

  initialize() {}

  select(params, buffer = []) {
    for (var k in params) {
      if (nativeIsArray(a = params[k])) {
        var plain = copyOwn(params);

        for (var j = 0, a; j < a.length; j++) {
          plain[k] = a[j];
          this.select(plain, buffer);
        }

        return buffer;
      }
    }

    if ((records = this.records(params))) {
      for (var i = 0, records; i * max < records.length;) {
        buffer.push(...records.slice(i * max, ++i * max));
      }
    }

    return buffer;
  }

  records(o) {
    var data = this.data;
    var keys = this.keys;
    var len  = keys.length;

    for (var i = 0; data && i < len; i++) {
      var v = kv(o, keys[i]);

      data = data[v];
    }

    return data;
  }

  unregister(o) {
    var records = this.records(o);
    var i;

    if (records && (i = records.indexOf(o)) !== -1) {
      records.splice(i, 1);
    }
  }

  register(o) {
    var data = this.data;
    var keys = this.keys;
    var len  = keys.length - 1;

    for (var i = 0; i < len; i++) {
      var v = kv(o, keys[i]);

      data = data[v] || (data[v] = {});
    }

    v = kv(o, keys[i]);
    push(data, v, o);
  }
}

const fetchRefId = { fetchRefId: true };
const max = 256 * 256;

function kv(o, k) {
  if (k) {
    return o.query && !(o.fieldsMap[k] >= 0) ?
      o.query(k, fetchRefId) :
      o[k];
  }

  return k;
}
