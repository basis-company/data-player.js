import { array } from 'helpers/array';
import { indexBy } from 'helpers/arrayBy';
import { log } from 'helpers/log';
import { ns } from 'helpers/ns';

import { collection, data, fetchRefId, model, opt } from './data';

const extras = data.extras;

export async function extra(expeditor) {
  // skip nullable field
  // skip root request
  if (expeditor.nullable || expeditor.isRoot()) {
    return;
  }

  // find absent records
  var ids = plans(expeditor);

  if (!ids || ids.length === 0) {
    return;
  }

  var field = fields(expeditor).join('.');
  var top   = expeditor.bubble();

  var k = [ field, ids ].join('/');
  var n = ns(extras, top.model);

  // fetch extra once
  if (k in n) {
    return n[k];
  }

  log('extra "' + top.model + '"', { [field]: ids }, { expeditor });

  if ((n[k] = opt.extra)) {
    n[k] = opt.extra(top.model, ids, field, expeditor.model);
    await register(await n[k], expeditor);
    n[k] = null;
  }
}

function fields(expeditor) {
  return expeditor
    .bubble((expeditor, buffer) => {
      buffer.unshift(expeditor.field);
    }, [])
    .slice(1);
}

function plans(expeditor) {
  var ids =
    opt.absent(expeditor) ||
    absent(expeditor);

  // skip full data
  if (!ids || ids.length === 0) {
    return;
  }

  log('extra "' + expeditor.model + '"', { absent: ids.slice() });

  var field = fields(expeditor);
  var top   = expeditor.bubble();
  var map   = {};

  if (expeditor.index !== 'id') {
    field = field.slice(0, -1);
  }

  field = field.join('.');

  // reduce source records poined to the same absent target record
  top.data.some(record => {
    var source = field ?
      record.query(field, fetchRefId) :
      [ record.id ];

    source.forEach((id, i) => {
      if ((i = ids.indexOf(id)) !== -1) {
        ids.splice(i, 1);
        map[record.id] = record.id;
      }
    });

    return ids.length === 0;
  });

  return Object.values(map);
}

function absent(expeditor) {
  var c = collection(expeditor.model);

  if (c) {
    var a = expeditor.params[expeditor.index];
    var i = c.index(expeditor.index);

    // find absent records
    return array(a).filter(v =>
      !i.contains(v)
    );
  }
}

function register(data, expeditor) {
  if (!data || data.length === 0) {
    return;
  }

  var target = expeditor.model;
  var m = model(target);

  data = data.map(row =>
    m.create(row)
  );

  if (expeditor.index === 'id') {
    collection(target).splice(data, 'extra');
  }
  else if (opt.classify) {
    return classify(data, target);
  }
}

async function classify(data, target) {
  var ids = [];

  var hash = indexBy(data, (record) =>
    ids.push(record.id) &&
    record.id
  );

  var result  = await opt.classify(target, ids);

  var valid   = result.valid  .map(id => hash[id]);
  var invalid = result.invalid.map(id => hash[id]);

  collection(target).splice(valid);
  collection(target).splice(invalid, 'extra');
}
