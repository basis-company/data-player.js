import { nativeIsArray, nativeKeys } from 'underscore/modules/_setup.js';

import { applyTo } from 'helpers/apply';
import { array } from 'helpers/array';
import { copyOwn } from 'helpers/copy';
import { ns } from 'helpers/ns';
import { push } from 'helpers/push';
import { transform } from 'helpers/transform';

import { cascade } from './cascade';
import { collection, model } from './data';
import { extra } from './extra';
import { Request } from './request';
import * as Similar from './similar';

export class Loader extends Request {
  init(o) {
    super.init(o);

    this.fields = o.fields || [];
    this.model  = model(o.model).aka;
    this.params = o.params ? copyOwn(o.params) : {};

    applyTo(this, o, 'names', 'range');
  }

  addField(field) {
    if (field) {
      push(this, 'fields', field, 'uniq');
    }
  }

  addParam(field, value) {
    addParam(field, value, this);
  }

  async load(expeditor, data) {
    if (this.promise) {
      expeditor.warn('is already loading');
    }

    this.promise = this.doLoad(expeditor, data);
    data = await this.promise;
    this.promise = null;

    return data;
  }

  async doLoad(expeditor, data) {
    await Promise.all(this.purify());

    if (data) {
      data = this.filter(data, this.params);

      if (this.fields.length > 0) {
        await this.cascade(data, expeditor);
        data = this.filter(data, expeditor.params);
      }
    }
    else {
      // ensure data is loaded
      await this.fetch();
      await this.extra(expeditor);
      // fetch again local data (loaded by similar or collection.loader)
      data = this.local(this.params);

      // load fields before filter data by query
      if (this.fields.length > 0) {
        // ensure params dependencies exists
        await this.cascade(data, expeditor);
        // fetch again local data (if load filters)
        data = this.local(expeditor.params);
      }
    }

    return data;
  }

  purify() {
    var fields = nativeKeys(this.params);
    var m = model(this.model);

    return transform(fields, (promises, field) => {
      var [ f1, f2, f3 ] = m._parse(field).map(step => step.field);
      var info = m._info(f1);

      if (m.fieldsMap[f1] >= 0) {
        if (!f2) {
          return;
        }

        if (info.model && !f3 && !model(info.model)._info(f2).model) {
          var loader = new Loader({
            model: info.model,
            params: { [f2]: this.params[field] },
          });

          var promise = loader.fetch()
            .then(data => {
              data = loader.local(loader.params);
              this.addParam(f1, data.map(row => row.id));
              delete this.params[field];
            });

          promises.push(promise);
          return;
        }
      }

      this.addField(field);
      delete this.params[field];
    });
  }

  async fetch() {
    var partials = {};
    var promise, similar;

    if ((similar = Similar.find(this, partials))) {
      promise = similar.promise;
    }
    else if ((similar = partials.similar)) {
      Similar.add(this);

      await Promise.all([
        promise = this.request(similar.params),
        similar.promise, // wait similar for extra
      ]);
    }
    else {
      Similar.add(this);

      promise = this.request(this.params);
    }

    return promise;
  }

  extra(expeditor) {
    return extra(expeditor);
  }

  cascade(data, expeditor) {
    if (expeditor.isRoot()) {
      expeditor.data = data;
    }

    return cascade(data, this.fields, expeditor);
  }

  local(params) {
    var c = collection(this.model);
    var data = [];

    if (c) {
      params = this.expandRange(params);

      for (var i = 0; i < params.length; i++) {
        c.find(params[i], data);
      }
    }

    return data;
  }

  filter(data, params) {
    var filtered = [];

    for (var i = 0; i < data.length; i++) {
      if (filter(data[i], params)) {
        filtered.push(data[i]);
      }
    }

    return filtered;
  }
}

function filter(row, params) {
  for (var field in params) {
    if (!validate(row, field, params[field])) {
      return false;
    }
  }

  return true;
}

function validate(row, field, value) {
  if (!nativeIsArray(value)) {
    return value == row.get(field);  // eslint-disable-line eqeqeq
  }

  for (var i = 0; i < value.length; i++) {
    if (validate(row, field, value[i])) {
      return true;
    }
  }
}

export function addParam(field, value, dst) {
  var params = ns(dst, 'params');
  var hash = {};

  [ params[field], value ].forEach(a => {
    array(a).forEach(v => {
      if (v || v === 0 && field !== 'id') {
        hash[v] = v;
      }
    });
  });

  var values = Object.values(hash);

  // set [] to prevent dispatch with empty params
  if (values.length > 0 || field === 'id') {
    params[field] = values.length === 1 ? values[0] : values;
  }
}
