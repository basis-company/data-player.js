import has from 'underscore/modules/_has.js';
import { nativeCreate, nativeIsArray } from 'underscore/modules/_setup.js';
import isFunction from 'underscore/modules/isFunction.js';
import isString from 'underscore/modules/isString.js';

import { applyTo } from 'helpers/apply';
import { array } from 'helpers/array';
import { indexBy } from 'helpers/arrayBy';
import { buffer } from 'helpers/buffer';
import { debug, log, warn } from 'helpers/log';
import { portion } from 'helpers/portion';
import { push } from 'helpers/push';
import { remove } from 'helpers/remove';

import { collection, data, model } from './data';
import { Expeditor } from './expeditor';
import { single } from './model';

var autoId = 0;
const views = data.views;

export class View {
  constructor(o) {
    this.model = model(o.model).aka;
    this.id    = [ 'view', this.model, ++autoId ].join('-');

    this.generation   = 0;
    this.dependencies = {};

    views[this.id] = this;

    this.fields  = [ 'id' ];
    this.annexes = [];

    this.addFields(o.fields);
    this.addAnnexes(o.annexes);

    applyTo(this, o, 'name');

    if (this.initialize) {
      this.initialize(o);
    }
  }

  destroy() {
    views[this.id] = null;
    log(this, 'destroyed', this.destroyed = true);
  }

  async load(params = {}) {
    if (this.loading) {
      warn(this, 'is already loading');
    }

    delete this.rawData;
    delete this.data;
    delete this.map;

    var expeditor = this.getExpeditor(params);
    var data;

    try {
      this.loading = true;

      data = this.rawData =  // debug
      await this.sequent(expeditor);

      data = this.data = // debug
      await this.produce(expeditor, data);
    }
    finally {
      this.loading = false;
    }

    if (!expeditor.aborted()) {
      this.complete(expeditor, data);
    }
  }

  getExpeditor(params, range) {
    if (params.minYmd || params.maxYmd) {
      range = range || [
        params.minYmd || params.maxYmd,
        params.maxYmd || params.minYmd,
      ];

      delete params.minYmd;
      delete params.maxYmd;
    }

    var fields = single(this.fields);

    // skip annexes
    this.annexes.forEach(annex => {
      // field is calculated
      remove(fields, annex.annex, 'all');
      // todo: add annex.path to fields
    });

    return new Expeditor({
      aborted:  this.getAbortedFn(),
      name:     this.name,
      model:    this.model,
      fields,
      params,
      range,
    });
  }

  getAbortedFn() {
    var generation = ++this.generation;

    return (message) => {
      if (this.generation !== generation) {
        var s = 'aborted';
      }
      else if (this.destroyed) {
        s = 'destroyed';
      }
      else {
        return;
      }

      if (isString(message)) {
        warn(this, message);
      }

      return s;
    };
  }

  sequent(expeditor, data) {
    return expeditor.sequent(data);
  }

  async produce(expeditor, data) {
    var total = data.length;
    var rows  = new Array(total);

    await portion.call(this, 'apply rows', total, expeditor.aborted, (i) => {
      rows[i] = this.applyRow(data[i]);
    });

    return rows;
  }

  addFields(fields) {
    array(fields).forEach(field => {
      if (field) {
        push(this, 'fields', field, 'uniq');
      }
    });
  }

  addAnnexes(annexes) {
    array(annexes).forEach(func => {
      this.annexes.push(
        isFunction(func) ? { func, scope: this } : func
      );
    });
  }

  applyRow(src, dst) {
    dst = src.produce(this.fields, dst);

    this.annexes.forEach(annex => {
      annex.func.call(annex.scope, dst, annex);
    });

    return dst;
  }

  complete(expeditor, data) {
    this.expeditor = expeditor;
    this.map = indexBy(data, 'id');

    this.finalize(expeditor, data, 'refresh');
  }

  finalize(expeditor, data, event) {
    log(this, 'finalize', event, { data, expeditor });

    this.addDependency(expeditor);
    this.monCollections();
  }

  addDependency(expeditor) {
    var deps  = this.dependencies;

    if (!isString(deps[expeditor.model])) {
      push(deps, expeditor.model, expeditor.inversed);
    }

    if (expeditor.children) {
      expeditor.children.forEach(this.addDependency, this);
    }
  }

  monCollections() {
    var deps  = this.dependencies;
    var v, c;

    for (var aka in deps) {
      if (nativeIsArray(v = deps[aka])) {
        if ((c = collection(aka))) {
          var counter  = v.map(inversed => inversed.length);
          var shortest = Math.min.apply(Math, counter);

          shortest = counter.indexOf(shortest);
          deps[aka] = v[shortest].join('.');
          this.monCollection(c);
        }
        else {
          warn(this, 'monitor skip non-loaded collection', aka);
        }
      }
    }

    log(this, 'monitor reverse fields', { dependencies: deps });
  }

  monCollection() {
    // this.mon(c, 'change', this.applyChanges, this);
  }

  applyChanges(record) {
    if (nativeIsArray(record)) {
      record.forEach(this.applyChanges, this);
    }
    else {
      this.monBuffer(record);
    }
  }

  monBuffer(record) {
    if (this.expeditor.aborted('buffer record in denied state')) {
      return;
    }

    var aka   = record.aka;
    var field = this.dependencies[aka];

    if (!field) {
      warn(this, 'buffer field is not found in dependencies', aka);
      return;
    }

    if (nativeIsArray(field)) {
      warn(this, 'buffer field expected to be a string, array given for', aka);
      return;
    }

    debug(this, 'update', aka, record.id);

    record.query(field).forEach(id => {
      buffer(this.id, id, this.processBuffer, this);
    });
  }

  async processBuffer(ids) {
    var expeditor = nativeCreate(this.expeditor);

    if (expeditor.aborted('process buffer in denied state')) {
      return;
    }

    var data = collection(this.model).find(ids);

    data = await this.sequent(expeditor, data);
    data = await this.produce(expeditor, data);

    if (expeditor.aborted('update in denied state')) {
      return;
    }

    var filtered = indexBy(data, 'id');
    var rows = [];

    ids.forEach(id => {
      var src = filtered[id];
      var dst = this.map[id];
      var changed;

      if (src) {
        if (dst) {
          // compare field values to make the decision "row is updated"
          for (var f in dst) {
            if (!(changed = has(dst, f))) {
              break;
            }

            if (dst[f] !== src[f]) {
              break;
            }
          }

          debug(this, 'update row', id, changed ? 'changed' : 'skipped');

          if (!changed) {
            return;
          }
        }
        else {
          debug(this, 'add row', id);
        }

        dst = this.map[id] = src;
      }

      if (dst) {
        rows.push(dst);

        if (!src) {
          debug(this, 'remove row', id);
          delete this.map[id];
        }
      }
    });

    this.finalize(expeditor, rows, 'update');
  }
}
