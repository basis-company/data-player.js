import { nativeIsArray } from 'underscore/modules/_setup.js';
import isFunction from 'underscore/modules/isFunction.js';
import isString from 'underscore/modules/isString.js';
import isUndefined from 'underscore/modules/isUndefined.js';
import noop from 'underscore/modules/noop.js';

import { applyOwn } from 'helpers/apply';
import { copyOwn } from 'helpers/copy';
import { create } from 'helpers/create';
import { memoize } from 'helpers/memoize';
import { transform } from 'helpers/transform';

import { model } from './data';
import { doSequence, parse } from './query';

const opt = {
  akaRe: '',
};

export function init(config) {
  applyOwn(opt, config);
}

export function register(proto) {
  proto = copyOwn(proto);

  var name = proto.name;
  var aka  = proto.aka = name.replace(opt.akaRe, '');

  if (!proto.idFields) {
    proto.idFields = proto.idOrigin || [ 'id' ];
  }

  proto.fields.forEach((f, i, a) => {
    if (isString(f)) {
      f = a[i] = { name: f };
    }

    if (proto.patchFields) {
      applyOwn(f, proto.patchFields[f.name]);
    }

    if (f.reference && !f.property) {
      f.property = f.name;
    }
  });

  function Model(o) {
    Basic.call(this, o);
  }

  proto = Model.prototype = create(Basic.prototype, proto, {
    idValues: proto.idFields.slice(),
    fieldsMap: transform(proto.fields, (o, f, i) => o[f.name] = i, {}),
    _info: memoize(info),
    _parse: memoize(parse),
    create(o) {
      return new this.constructor(o);
    },
  });

  proto.constructor = Model;
  Object.defineProperty(Model, 'name', { value: name });

  model(name, proto);
  model(aka, proto);

  return proto;
}

export function Basic(o) {
  apply(this, o, this);
  this.initialize(o);
}

applyOwn(Basic.prototype, {
  initialize: noop,
  get,
  query,
});

function apply(dst, src, m) {
  if (nativeIsArray(src)) {
    for (var i = 0, len = src.length; i < len; i++) {
      dst[m.fields[i].name] = src[i];
    }
  }
  else {
    for (var k in src) {
      if (m.fieldsMap[k] >= 0 || isFunction(m[k])) {
        dst[k] = src[k];
      }
    }
  }

  if (!dst.id) {
    dst.id = id(dst, m.idFields, m.idValues);
  }
}

function id(dst, fields, values) {
  if (fields.length > 1) {
    for (var i = 0; i < fields.length; i++) {
      values[i] = dst[fields[i]];
    }

    return values.join('-');
  }

  return dst[fields[0]];
}

const fetchRefId = { fetchRefId: true };
const fieldRe = /\w/;

function map(k) {
  return fieldRe.test(k[0]) ? this.get(k) : k;
}

function filter(v) {
  return !isUndefined(v) && v !== '';
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

function query(query, options) {
  var sequence = this._parse(query);

  return doSequence([ this ], sequence, options);
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
    // Поле "field" присутствует в исходной модели.
    // Пример query: поиск значения в справочнике
    return {
      field,
      model: model(property.reference).aka,
      index: 'id',
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
