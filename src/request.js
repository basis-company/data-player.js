import { nativeIsArray } from 'underscore/modules/_setup.js';

import { applyOwnIf, applyTo } from 'helpers/apply';
import { array } from 'helpers/array';
import { copyOwn } from 'helpers/copy';

import { register } from './collection';
import { collection, opt } from './data';

export class Request {
  constructor(o) {
    this.init(o);

    if (this.initialize) {
      this.initialize(o);
    }
  }

  init(o) {
    if (o.range) {
      this.names = o.names;
      this.range = o.range;
    }
  }

  async request(params) {
    if ((params = this.getParams(params))) {
      var data = await opt.request(params);

      return this.register(data, params);
    }
  }

  getParams(params) {
    if (params.id && (c = collection(this.model))) {
      var i = c.index('id');
      var c;

      // skip fetch loaded instances
      var id = array(params.id).filter(id => !i.contains(id));

      // keep prev params in similar
      params = applyOwnIf({ id }, params);
    }

    for (var k in params) {
      var v = params[k];

      // prevent dispatch with empty param
      if (nativeIsArray(v) && v.length === 0) {
        return;
      }
    }

    params = this.expandRange(params);

    if (params.length === 0) {
      return;
    }

    params = params.length === 1 ? params[0] : params;
    params = applyTo({ params }, this, 'model');

    if (this.range && this.names.edge) {
      params.names = this.names.edge;
      params.range = this.range;
    }

    return params;
  }

  expandRange(params) {
    // "names" without range is forbidden
    // avoid mix "id" with "names"
    if (!this.range || !(ymd = this.names.ymd) || params.id) {
      return [ params ];
    }

    var span    = ymd[ymd.length - 1];
    var format  = 'YYYYMMDD'.slice(0, 2 + 2 * ymd.length);
    var array   = [];
    var ymd;

    var minDate = moment(this.range[0], format);
    var maxDate = moment(this.range[1], format).add(1, span);

    do {
      var p = copyOwn(params);

      var v = {
        year:  minDate.year(),
        month: minDate.month() + 1,
        day:   minDate.date(),
      };

      span = ymd.find((f, i, ymd) =>
        (p[f] = v[f]) &&
        ymd
          .slice(i + 1)
          .every(f => v[f] === 1) &&
        moment(minDate)
          .add(1, f)
          .isSameOrBefore(maxDate)
      );

      if (span) {
        array.push(p);
        minDate.add(1, span);
      }
    }
    while (span);

    return array;
  }

  register(data) {
    if (data) {
      register(this.model, data);
    }
  }
}
