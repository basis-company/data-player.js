import { nativeIsArray } from 'underscore/modules/_setup.js';

import { copyOwn } from 'helpers/copy';
import { push } from 'helpers/push';
import { remove } from 'helpers/remove';

import { fetchRefId, opt } from './data';

export class Index {
  constructor(keys) {
    this.data = {};
    this.keys = keys.slice();

    if (opt.keySorter) {
      this.keys.sort(opt.keySorter);
    }

    if (this.initialize) {
      this.initialize(keys);
    }
  }

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

  contains(v) {
    var data = this.data[v];

    return data && data.length > 0;
  }

  unregister(o) {
    var records = this.records(o);

    if (records) {
      remove(records, o);
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

const max = 256 * 256;

function kv(o, k) {
  if (k) {
    return o.query && !(o.fieldsMap[k] >= 0) ?
      o.query(k, fetchRefId) :
      o[k];
  }

  return k;
}
