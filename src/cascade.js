import has from 'underscore/modules/_has.js';
import isFunction from 'underscore/modules/isFunction.js';

import { applyOwn } from 'helpers/apply';
import { array } from 'helpers/array';
import { log, warn } from 'helpers/log';

import { model, opt } from './data';
import { single } from './model';

applyOwn(cascade, {
  collect, propagate, spawn,
});

export async function cascade(data, fields, expeditor) {
  if (data.length === 0 || fields.length === 0) {
    return;
  }

  if (has(expeditor, 'children')) {
    var previous = expeditor.children;
  }

  var children = expeditor.children = [];

  if (previous) {
    children._previous = previous;
  }

  cascade.collect(data, fields, expeditor);

  var promises = children.map(expeditor =>
    expeditor.sequent()
  );

  var res = await Promise.all(promises);

  promises = children.map((expeditor, i) => {
    if (expeditor.fields) {
      return cascade(res[i], expeditor.fields, expeditor);
    }
  });

  return Promise.all(promises);
}

function collect(data, fields, expeditor) {
  var m = model(expeditor.model);

  fields.forEach(field => {
    var sequence = m._parse(field);
    var step     = sequence.find(step => step.field);
    var index    = sequence.indexOf(step);
    var info;

    var tailField = sequence
      .slice(index + 1)
      .map(step => step.chunk)
      .join('.');

    if (opt.collect(data, step, m, tailField, expeditor)) {
      // custom propagate
    }
    else if ((info = m._info(step.field)).model) {
      cascade.propagate(data, step, info, tailField, expeditor);
    }
    else if (isFunction(m[step.field])) {
      var calculated =
        m[step.field + 'Field'] ||
        m[step.field].field;

      if (calculated) {
        fields = array(calculated);
        fields = single(fields);
        log('expand "' + step.field + '" to', { fields });
        cascade.collect(data, fields, expeditor);
      }
    }
    else if (m.fieldsMap[step.field] >= 0) {
      // field belongs to model
    }
    else {
      warn('model "' + m.aka + '"',
        'has no property "' + step.field + '"',
        'in field "' + field + '"');
    }
  });
}

function propagate(data, step, info, tailField, expeditor) {
  var children = expeditor.children;

  var k = [
    info.model,
    step.field,
    step.filter && step.filter.list.map(filter => filter.expression),
  ];

  var child = children[k];

  if (!child) {
    children[k] = child = cascade.spawn(data, step, info, expeditor);
    children.push(child);
  }

  if (tailField) {
    child.fields.push(tailField);
  }

  opt.propagate(child);
}

function spawn(data, step, info, expeditor) {
  var fields = [];
  var params = {};

  params[info.index] = data.map(record => record[info.field]);

  if (step.filter) {
    step.filter.list.forEach(filter => {
      if (filter.operator === '=' && filter.value.indexOf('..') === -1) {
        params[filter.field] = filter.value.split(',');
      }
      else {
        fields.push(filter.field);
      }
    });
  }

  opt.spawn(params, info);

  return expeditor.spawn({
    field:      step.field,
    nullable:   step.nullable,

    inversed:   [ info.inverse || expeditor.model ].concat(expeditor.inversed),  // copy
    index:      info.index,
    model:      info.model,

    fields,
    params,
  });
}
