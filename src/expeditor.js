import noop from 'underscore/modules/noop.js';

import { applyOwn, applyTo } from 'helpers/apply';
import { indexBy } from 'helpers/arrayBy';
import { empty } from 'helpers/empty';
import { log, raise } from 'helpers/log';
import { uniq } from 'helpers/uniq';

import { cascade } from './cascade';
import { model } from './data';
import { Loader, addParam } from './loader';

export class Expeditor {
  constructor(o) {
    this.aborted  = o.aborted || noop;
    this.inversed = o.inversed || [ 'id' ];
    this.model    = model(o.model).aka;

    if (o.fields) {
      this.fields = uniq(o.fields);
    }

    for (var field in o.params) {
      addParam(field, o.params[field], this);
    }

    applyTo(this, o, '_parent', 'field', 'index', 'name', 'nullable', 'range');
    this.names();

    if (this.initialize) {
      this.initialize(o);
    }
  }

  names() {
    if (
      !(this.names = this.getNames()) ||
      !this.names.ymd && !this.names.edge
    ) {
      this.names = null;
      delete this.range;
      return;
    }

    // find nearest range
    this.bubble(expeditor => this.range = expeditor.range);

    if (!this.range && empty(this.params)) {
      raise(this, '"' + this.model + '" is timebased',
        'and must be fetched with params or range', { expeditor: this });
    }
  }

  getNames() {
    return names(model(this.model).fieldsMap);
  }

  spawn(o) {
    return new Expeditor(applyOwn({
      _parent:  this,
      aborted:  this.aborted,
      name:     this.name,
      range:    this.expanded,
    }, o));
  }

  bubble(fn, buffer) {
    for (var expeditor = this; expeditor; expeditor = expeditor._parent) {
      if (fn && fn(expeditor, buffer) || !expeditor._parent) {
        return buffer || expeditor;
      }
    }
  }

  isRoot() {
    return !this._parent;
  }

  async sequent(data) {
    if (this.aborted()) {
      return [];
    }

    data = await this.load(data);
    data = this.filter(data);
    data = this.ranger(data);
    this.expand(data);
    await this.cascade(data);

    return data;
  }

  load(data) {
    log(this, 'load "' + this.model + '"', this.params, { expeditor: this });

    return new Loader({
      model:  this.model,
      names:  this.names,
      params: this.params,
      range:  this.range,
    })
      .load(this, data);
  }

  filter(data) {
    // filter extra only in root request
    if (this.isRoot()) {
      data = data.filter(record => !record.extra);
    }

    return data;
  }

  isRanged() {
    return Boolean(this.range && this.names && this.names.edge);
  }

  ranger(data) {
    if (this.isRanged()) {
      data = data.filter(this._ranger, this);
    }

    return data;
  }

  _ranger(record) {
    var min   = this.range[0];
    var max   = this.range[1];

    var begin = record[this.names.edge[0]];
    var end   = record[this.names.edge[1]];

    return (!begin || begin <= max) && (!end || min <= end);
  }

  expand(data) {
    if (this.isRanged() && !this.expanded) {
      this.expanded = [
        this._expand('shift', 0, data),
        this._expand('pop', 1, data),
      ];
    }
  }

  _expand(method, i, data) {
    var k = this.names.edge[i];
    var v = this.range[i];

    var hash = indexBy(data, k, k);

    hash[v] = v;

    var values = Object.values(hash);

    while (values.length > 0) {
      if ((v = values[method]())) {
        return v;
      }
    }

    raise(this, '"' + this.model + '" expand require range value', { expeditor: this });
  }

  cascade(data) {
    if (this.fields && this.isRoot() && !this.aborted()) {
      log(this, 'dependencies', { fields: this.fields }, { expeditor: this });
      return cascade(this.data = data, this.fields, this);
    }
  }
}

const aymd  = [ 'year', 'month', 'day' ];
const aym   = [ 'year', 'month' ];
const ay    = [ 'year' ];
const abe   = [ 'begin', 'end' ];

function names(fieldsMap) {
  return {
    ymd:
      fieldsMap.year >= 0 ?  // eslint-disable-line no-nested-ternary
        fieldsMap.month >= 0 ?  // eslint-disable-line no-nested-ternary
          fieldsMap.day >= 0 ?
            aymd :
            aym :
          ay :
        false,
    edge:
      fieldsMap.begin >= 0 &&
      fieldsMap.end >= 0 ?
        abe :
        false,
  };
}
