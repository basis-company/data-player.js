import { nativeIsArray } from 'underscore/modules/_setup.js';

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
