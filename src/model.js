import { nativeCreate, nativeIsArray } from 'underscore/modules/_setup.js';
import isFunction from 'underscore/modules/isFunction.js';
import isString from 'underscore/modules/isString.js';
import isUndefined from 'underscore/modules/isUndefined.js';

import { append } from 'helpers/append';
import { applyOwn } from 'helpers/apply';
import { copyOwn } from 'helpers/copy';
import { memoize } from 'helpers/memoize';
import { transform } from 'helpers/transform';
import { uniq } from 'helpers/uniq';

import { fetchRefId, model, oneElArr, opt } from './data';
import { doSequence, parse } from './query';

export function register(proto) {
  proto = copyOwn(proto);

  var name = proto.name;
  var aka  = proto.aka = name.replace(opt.akaRe, '');

  var idFields =
    proto.idFields ||
    proto.key ||
    [ 'id' ];

  var fieldsMap = transform(proto.fields, (o, f, i, a) => {
    if (isString(f)) {
      f = a[i] = { name: f };
    }

    if (proto.patchFields) {
      applyOwn(f, proto.patchFields[f.name]);
    }

    if (f.reference && !f.property) {
      f.property = f.name;
    }

    o[f.name] = i;
  }, {});

  if (!(fieldsMap.id >= 0) && idFields.length === 1) {
    fieldsMap.id = fieldsMap[idFields[0]];
  }

  class Model extends Basic {}

  proto = applyOwn(Model.prototype, proto, {
    origin: proto.key ? proto.key.join('-') : 'id',
    idValues: idFields.slice(),
    idFields,
    fieldsMap,
    _info: memoize(info),
    _parse: memoize(parse),
  });

  delete proto.key;
  Object.defineProperty(Model, 'name', { value: name });

  model(name, proto);
  model(aka, proto);

  return proto;
}

export class Basic {
  constructor(o) {
    var m = this;

    if (nativeIsArray(o)) {
      for (var i = 0, len = o.length; i < len; i++) {
        this[m.fields[i].name] = o[i];
      }
    }
    else {
      for (var k in o) {
        if (m.fieldsMap[k] >= 0 || isFunction(m[k])) {
          this[k] = o[k];
        }
      }
    }

    if (!this.id) {
      this.id = id(this, m.idFields, m.idValues);
    }

    if (this.initialize) {
      this.initialize(o);
    }
  }

  create(o) {
    return new this.constructor(o);
  }
}

applyOwn(Basic.prototype, {
  get, produce, query,
});

function id(dst, fields, values) {
  if (fields.length > 1) {
    for (var i = 0; i < fields.length; i++) {
      values[i] = dst[fields[i]];
    }

    return values.join('-');
  }

  return dst[fields[0]];
}

function produce(fields, dst) {
  if (!dst) {
    dst = nativeCreate(this);
  }

  for (var i = 0; i < fields.length; i++) {
    var field =
      fields[i].name ||
      fields[i];

    var v = dst[field] = this.get(field);

    if (isUndefined(v)) {
      dst[field] = null;
    }
  }

  return dst;
}

function get(k) {
  if (k.indexOf(' ') !== -1) {
    return k.split(' ')
      .map(map, this)
      .filter(filter)
      .join(' ');
  }

  // get id of the instance if the last field is reference or collection
  var values = this.query(k, fetchRefId);

  if (!nativeIsArray(values)) {
    // query contains selector
    return values;
  }

  if (values.length > 1) {
    return values
      .filter(filter)
      .join(', ');
  }

  return values[0];
}

const fieldRe = /[a-zA-Z]/;

function map(k) {
  return fieldRe.test(k[0]) ? this.get(k) : k;
}

function filter(v) {
  return !isUndefined(v) && v !== '';
}

function query(query, options) {
  var sequence = this._parse(query);

  oneElArr[0] = this;

  return doSequence(oneElArr, sequence, options);
}

// Интерпретация результата:
//   В исходной модели "this" в поле "field" содержится значение,
//   которое можно найти в целевой модели "model" в ключе "index",
//   а из целевой модели перейти обратно в исходную модель через поле "inverse"
function info(field) {
  var property = this.fields.find(f => f.name === field || f.aka === field);

  if (property) {
    field = property.name;
  }

  if (property && property.reference) {
    m    = model(property.reference);
    ids  = m.idFields;
    name = property.property;

    // Поле "field" присутствует в исходной модели.
    // Пример query: поиск значения в справочнике
    return {
      field,
      // inverse: this.aka + '@' + field,
      model: m.aka,
      index: ids && ids.length === 1 && ids[0] !== name ? name : 'id',
    };
  }

  if (
    (m = model(field)) &&
    (property = m.fields.find(f =>
      model(f.reference) &&
      model(f.reference).aka === this.aka)
    )
  ) {
    var ids  = m.idFields;
    var name = property.name;
    var m;

    // Поле "field" отсутствует в исходной модели, тогда "field" = целевая "model"
    // Пример query: найти задания на объекте
    return {
      field: property.property,
      inverse: name,
      model: field,
      index: ids && ids.length === 1 && ids[0] === name ? 'id' : name,
    };
  }

  return { field };
}

export function single(fields) {
  var single = [];

  fields.forEach(fields => {
    if (fields) {
      fields = fields
        .split(' ')
        .filter(f => fieldRe.test(f[0]));

      append(single, fields);
    }
  });

  return uniq(single);
}
