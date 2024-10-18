import { nativeIsArray, nativeKeys } from 'underscore/modules/_setup.js';

import { applyOwnIf } from 'helpers/apply';
import { isObject } from 'helpers/is';
import { log, raise } from 'helpers/log';
import { measure } from 'helpers/measure';

import { collection, model } from './data';
import { Index } from './index';

export function register(name, records) {
  if (!(c = collection(name, !!records))) {
    var m = model(name);
    var c = new Collection(m.aka);

    collection(m.name, c);
    collection(m.aka, c);
  }

  if (records) {
    c.splice(records);
  }

  return c;
}

export class Collection {
  constructor(name) {
    this.init(name);

    if (this.initialize) {
      this.initialize(name);
    }
  }

  init(name) {
    delete this.model;

    this.indexes = {};
    this.index('');

    if (name) {
      this.model = name.model || name;
    }
  }

  index(...keys) {
    var k = keys.length < 2 ? keys[0] || '' : keys.join('-');
    var i = this.indexes[k];
    var m = model(this.model);

    if (!i) {
      keys = k.split('-');
      i = this.indexes[k] = new Index(keys);

      if (k) {
        measure('create index in "' + this.model + '" for keys ' + keys, () => {
          this.find().forEach(i.register, i);
        });
      }

      if (m) {
        var onetime = keys.some(k => {
          var field = m._parse(k).find(step => step.field).field;
          var own   = m.fields.find(f => f.name === field || f.aka === field);

          // one-to-many relation
          return !own;
        });

        if (onetime) {
          log(m, 'one-time', { index: i });
          delete this.indexes[k];
        }
      }
    }

    return i;
  }

  splice() {
    measure('splice "' + this.model + '"', this._splice, this, arguments);
  }

  _splice(records, doRemove) {
    var m = model(this.model);
    var i = this.index(m && m.origin || 'id');

    var record   = records[0];
    var isTuple  = nativeIsArray(record);
    var isRecord = m && record instanceof m.constructor;

    for (var j = 0; j < records.length; j++) {
      record = records[j];

      if (m) {
        if (isTuple || !isRecord) {
          record = records[j] = m.create(record);
        }
      }

      var values = i.records(record);
      var exist  = values && values[0];

      if (exist && !isTuple && !isRecord) {
        applyOwnIf(record, exist);
      }

      if (doRemove) {
        if (exist) {
          records[j] = exist;
        }
        else {
          records.splice(j--, 1);
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

    this.fireEvent('change', records);
  }

  fireEvent() {
    // implementation
  }

  find(params = {}, buffer) {
    if (!isObject(params)) {
      params = { id: params };
    }

    var keys = nativeKeys(params);

    return this
      .index(...keys)
      .select(params, buffer);
  }

  findOne(params) {
    return this.find(params)[0];
  }

  findOrFail(params) {
    var record = this.find(params)[0];

    if (record) {
      return record;
    }

    raise('not found', this.model, 'using', JSON.stringify(params));
  }
}
