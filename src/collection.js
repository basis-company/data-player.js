import { nativeIsArray, nativeKeys } from 'underscore/modules/_setup.js';
import isObject from 'underscore/modules/isObject.js';

import { applyOwnIf } from 'helpers/apply';
import { array } from 'helpers/array';
import { log, raise } from 'helpers/log';
import { measure } from 'helpers/measure';

import { collection, model } from './data';
import { Index } from './index';

export function register(name, records) {
  if (!(c = collection(name, !!records))) {
    var c = new Collection(name);

    collection(name, c);
    collection(c.model.aka, c);
  }

  if (records) {
    c.splice(records);
  }

  return c;
}

export class Collection {
  constructor(name) {
    this.clear();

    if (name) {
      this.name  = name;
      this.model = model(name);
    }

    this.initialize(name);
  }

  initialize() {}

  clear() {
    this.indexes = {};
    this.index('');
  }

  flush() {
    this.indexes = {
      '': this.indexes[''],
    };
  }

  index(keys) {
    var key   = nativeIsArray(keys) ? keys.join('-') : keys || '';
    var index = this.indexes[key];
    var m     = this.model;

    if (!index) {
      keys  = array(keys);
      index = this.indexes[key] = new Index(keys);

      if (key) {
        measure('create index in "' + this.name + '" for keys ' + keys, () => {
          this.find().forEach(index.register, index);
        });
      }

      if (m) {
        var onetime = keys.some(key => {
          var step = m._parse(key).find(step => step.field);
          var info = m._info(step.field);

          // one-to-many relation
          return info.model && info.index !== 'id';
        });

        if (onetime) {
          log('one-time index in "' + this.name + '"', { index });
          delete this.indexes[key];
        }
      }
    }

    return index;
  }

  splice() {
    measure('splice "' + this.name + '"', this._splice, this, arguments);
  }

  _splice(records, doRemove) {
    var m = this.model;

    var keys     = (keys = m && m.idOrigin) && keys.length > 1 ? keys : 'id';
    var index    = this.index(keys);

    var record   = records[0];
    var isTuple  = nativeIsArray(record);
    var isRecord = m && record instanceof m.constructor;

    for (var i = 0; i < records.length; i++) {
      record = records[i];

      if (m) {
        if (isTuple || !isRecord) {
          record = records[i] = new m.constructor(record);
        }
      }

      var values = index.records(record);
      var exist  = values && values[0];

      if (exist && !isTuple && !isRecord) {
        applyOwnIf(record, exist);
      }

      if (doRemove) {
        if (exist) {
          records[i] = exist;
        }
        else {
          records.splice(i--, 1);
        }
      }

      for (var k in this.indexes) {
        if (exist) {
          this.indexes[k].unregister(exist);
        }

        if (!doRemove) {
          this.indexes[k].register(record);
        }
      }
    }
  }

  find(params = {}) {
    if (isObject(params)) {
      var keys = nativeKeys(params);
    }
    else {
      keys = 'id';
      params = { id: params };
    }

    return this
      .index(keys)
      .select(params);
  }

  findOne(params) {
    return this.find(params)[0];
  }

  findOrFail(params) {
    var record = this.find(params)[0];

    if (record) {
      return record;
    }

    raise('not found', this.name, 'using', JSON.stringify(params));
  }
}
