import { nativeIsArray } from 'underscore/modules/_setup.js';
import noop from 'underscore/modules/noop.js';

import { applyOwnIf } from 'helpers/apply';
import { empty } from 'helpers/empty';
import { push } from 'helpers/push';
import { remove as aRemove } from 'helpers/remove';

import { data } from './data';

const similars = data.similars;

export function add(loader) {
  push(similars, loader.model, loader);
}

export function remove(loader) {
  aRemove(similars[loader.model], loader);
}

export function find(loader, o) {
  var list = similars[loader.model];
  var partials, shrunken;

  for (var i = 0; list && i < list.length; i++) {
    var candidate = list[i];

    if (range(candidate, loader)) {
      if ((shrunken = params(candidate, loader)) === true) {
        return candidate;
      }

      if (shrunken) {
        (partials || (partials = [])).push({
          params: shrunken,
          promise: candidate.promise,
          weight: JSON.stringify(shrunken).length,
        });
      }
    }
  }

  if (partials && partials[0]) {
    // if (partials[1]) {
    //   partials.sort((a, b) => a.weight - b.weight);
    // }

    o.similar = partials[0];
  }
}

function range(candidate, loader) {
  // candidate without range contains any request range
  if (!candidate.range) {
    return true;
  }

  // skip less range
  if (!loader.range) {
    return false;
  }

  var [ cmin, cmax ] = candidate.range;
  var [ rmin, rmax ] = loader.range;

  return cmin <= rmin && rmax <= cmax;
}

function params(candidate, loader) {
  var outside, params;

  for (var k in candidate.params) {
    var cv = candidate.params[k];
    var rv = loader.params[k];

    // request wide set
    if (!rv && rv !== 0) {
      return false;
    }

    if (!nativeIsArray(cv)) {
      cv = [ cv ];
    }

    if (!nativeIsArray(rv)) {
      rv = [ rv ];
    }

    var diff = {};

    rv.forEach(rv => diff[rv] = rv);
    cv.forEach(cv => delete diff[cv]);

    var missing = Object.values(diff);

    if (missing.length > 0) {
      (params || (params = {}))[k] = missing;

      // non-crossed outside range
      if (missing.length === rv.length) {
        return false;
      }

      // allow one param be outside range
      if (outside) {
        return false;
      }

      outside = true;
    }
  }

  return empty(params) ||
    applyOwnIf(params, loader.params);
}

function test() {
  var c = {};
  var l = {};

  range$.forEach(o => {
    o.fn(c, l);
    assert[o.res](range(c, l), o.msg);
  });

  param$.forEach(o => {
    o.fn(c, l);

    var p    = {};
    var res  = params(c, l, p);
    var diff = JSON.stringify(p.params || {});

    if (res === o.res && diff === (o.diff || '{}')) {
      return;
    }

    raise(o.msg + ', params = ' + diff);
  });
}

const range$ = [
  {
    res: 'truthy',
    msg: 'range: both empty',
    fn: noop,
  }, {
    res: 'truthy',
    msg: 'range: empty candidate',
    fn(c, l) { l.range = [ 20201101, 20201130 ]; },
  }, {
    res: 'truthy',
    msg: 'range: equals',
    fn(c)    { c.range = [ 20201101, 20201130 ]; },
  }, {
    res: 'truthy',
    msg: 'range: grab range',
    fn(c)    { c.range = [ 20201030, 20201201 ]; },
  }, {
    res: 'truthy',
    msg: 'range: expand left',
    fn(c)    { c.range = [ 20201015, 20201130 ]; },
  }, {
    res: 'truthy',
    msg: 'range: expand right',
    fn(c)    { c.range = [ 20201101, 20201215 ]; },
  }, {
    res: 'falsey',
    msg: 'range: shift left',
    fn(c)    { c.range = [ 20201015, 20201115 ]; },
  }, {
    res: 'falsey',
    msg: 'range: shift right',
    fn(c)    { c.range = [ 20201115, 20201215 ]; },
  }, {
    res: 'falsey',
    msg: 'range: entire left',
    fn(c)    { c.range = [ 20201015, 20201020 ]; },
  }, {
    res: 'falsey',
    msg: 'range: entire right',
    fn(c)    { c.range = [ 20201205, 20201215 ]; },
  },
];

const param$ = [
  {
    res: true,
    msg: 'params: both empty',
    fn(c, l) {
      c.params = {};
      l.params = {};
    },
  }, {
    res: true,
    msg: 'params: empty candidate',
    fn(c, l) {
      c.params = {};
      l.params = { month: 1 };
    },
  }, {
    res: true,
    msg: 'params: equals',
    fn(c, l) {
      c.params = { month: 1, day: [ 1, 2 ] };
      l.params = { month: 1, day: [ 1, 2 ] };
    },
  }, {
    res: true,
    msg: 'params: grab range',
    fn(c, l) {
      c.params = { month: 1, day: [ 1, 2 ] };
      l.params = { month: 1, day: 1, sector: [ 5, 6 ] };
    },
  }, {
    res: false,
    msg: 'params: request wide range',
    diff: '{"day":[2],"month":1}',
    fn(c, l) {
      c.params = { month: 1, day: 1 };
      l.params = { month: 1, day: [ 1, 2 ] };
    },
  }, {
    res: false,
    msg: 'params: request wide param',
    fn(c, l) {
      c.params = { month: 1, day: [ 1, 2 ], sector: 5 };
      l.params = { month: 1, day: 1 };
    },
  }, {
    res: false,
    msg: 'params: non-crossed outside range',
    fn(c, l) {
      c.params = { month: 1, day: [ 1, 2 ] };
      l.params = { month: 1, day: [ 3, 4 ] };
    },
  }, {
    res: false,
    msg: 'params: allow single outside range',
    fn(c, l) {
      c.params = { month: 1, day: [ 1, 2 ], sector: [ 5, 7 ] };
      l.params = { month: 1, day: [ 2, 3 ], sector: [ 5, 6 ] };
    },
  }, {
    res: false,
    msg: 'params: subrange',
    diff: '{"day":[3],"month":1,"sector":[5]}',
    fn(c, l) {
      c.params = { month: 1, day: [ 1, 2 ], sector: [ 5, 7 ] };
      l.params = { month: 1, day: [ 2, 3 ], sector: [ 5 ] };
    },
  },
];
