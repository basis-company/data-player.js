import has from 'underscore/modules/_has.js';
import { nativeIsArray } from 'underscore/modules/_setup.js';
import isFunction from 'underscore/modules/isFunction.js';
import isUndefined from 'underscore/modules/isUndefined.js';

import { append } from 'helpers/append';
import { applyOwn } from 'helpers/apply';
import { array } from 'helpers/array';
import { raise, warn } from 'helpers/log';
import { uniq } from 'helpers/uniq';

import { collection, opt } from './data';

applyOwn(doSequence, {
  doField, doFilter, doSelector,
});

export function doSequence(records, sequence, options) {
  for (var i = 0; i < sequence.length; i++) {
    var step = sequence[i];

    if (step.field) {
      records = doSequence.doField(records, step, sequence, options);
    }

    if (step.filter) {
      records = doSequence.doFilter(records, step);
    }

    if (
      step.last &&
      options.fetchRefId &&
      records[0] && has(records[0], 'id')
    ) {
      // get id of the instance if the last field is reference or collection
      // all records are models or no ones
      for (var j = 0; j < records.length; j++) {
        records[j] = records[j].id;
      }
    }

    if (step.selector) {
      records = doSequence.doSelector(records, step);
      records = array(records);
    }
  }

  return records;
}

function doField(records, step, sequence, options) {
  var next = records.length > 0 ? [] : records;
  var c, i;

  for (var j = 0; j < records.length; j++) {
    var record = records[j];
    var result = record[step.field];
    var info   = null;

    if (isFunction(result)) {
      result = result.apply(record, step.args);
    }
    else if (record._info && (info = record._info(step.field)).model) {
      result = record[info.field];

      if (
        step.last &&
        options.fetchRefId &&
        info.field === step.field &&
        !step.filter
      ) {
        // get id of the instance if last field is reference
      }
      else if (result === 0 || result === null) {
        continue;
      }
      else if (
        (c = collection(info.model)) &&
        (i = c.index(info.index))
      ) {
        result = i.keys[1] ?
          i.records(info) :  // dual index
          i.data[result];
      }
      else {
        warn(  // todo raise ??
          '"' + record.aka + '"', 'has no loaded',
          '"' + info.model + '"', 'for query',
          '"' + sequence.query + '"'
        );
      }
    }
    else if (info && info.type === 'auto') {
      // lookup field in object
      if (result === null) {
        continue;
      }
    }
    else if (!step.last && record.aka) {
      warn(  // todo raise ??
        '"' + record.aka + '"', 'has no reference',
        '"' + step.field + '"', 'in query',
        '"' + sequence.query + '"'
      );
    }

    if (isUndefined(result)) {
      // continue;
    }
    else if (nativeIsArray(result)) {
      append(next, result);
    }
    else {
      next.push(result);
    }
  }

  return next;
}

function doFilter(records, step) {
  return records.filter(step.filter.fn);
}

function doSelector(records, step) {
  return step.selector.fn(records);
}

const nonBracesRe   = /[^()[\]{}]+/g;
const pairBracesRe  = /\(\)|\[\]|\{\}/g;

const fieldRe       = /^\w+(?:@\w+)?/;
const argsRe        = /^\(([\w,.-]+)\)/;
const selectorRe    = /\{(\w+)}$/;

export function parse(query) {
  // remove all non-parentheses
  var braces = query.replace(nonBracesRe, '');

  // remove empty pairs
  // eslint-disable-next-line curly
  while (braces.length !== (braces = braces.replace(pairBracesRe, '')).length);

  if (braces.length !== 0) {
    raise('parentheses is not balanced in query: "' + query + '"');
  }

  var sequence = [ query ];

  sequence.query = query;

  // split query by dot
  for (var i = 0, depth = 0, prev = 0; i < query.length; i++) {
    switch (query[i]) {
      case '(':
      case '[':
      case '{':
        depth++;
        break;

      case ')':
      case ']':
      case '}':
        depth--;
        break;

      case '.':
        if (depth === 0) {
          j = sequence.length;

          sequence[j - 1] = query.slice(prev, i);
          sequence[j]     = query.slice(i + 1);

          prev = i + 1;
        }
    }
  }

  // split chunk to field, (args), [filter], {selector}, "?" as nullable
  for (var j = 0; j < sequence.length; j++) {
    var chunk = sequence[j];
    var step  = sequence[j] = { chunk };
    var field, args, selector;

    // field
    if ((field = chunk.match(fieldRe))) {
      step.field = field[0];
      chunk = chunk.slice(field[0].length); // remove field
    }

    // (arguments)
    if ((args = chunk.match(argsRe))) {
      step.args = args[1].split(',');
      chunk = chunk.slice(args[0].length); // remove arguments
    }

    // nullable?
    if (chunk[chunk.length - 1] === '?') {
      step.nullable = true;
      chunk = chunk.slice(0, -1); // remove flag
    }

    // {selector}
    if ((selector = chunk.match(selectorRe))) {
      step.selector = parseSelector(selector[1]);
      chunk = chunk.slice(0, -selector[0].length); // remove selector
    }

    // [filter][filter]...
    if (chunk) {
      step.filter = chunk.slice(1, -1).split('][');
      step.filter = parseFilters(step.filter);
    }
  }

  // mark field is last in the query
  for (var k = sequence.length - 1; k >= 0; k--) {
    step = sequence[k];

    if (step.field) {
      step.last = true;
      break;
    }
  }

  return sequence;
}

function parseFilters(expressions) {
  var list = expressions.map(parseFilter);
  var len  = list.length;
  var fn   = list[0].fn;

  if (len > 1) {
    fn = function fn(record) {
      for (var i = 0; i < len; i++) {
        if (!list[i].fn(record)) {
          return false;
        }
      }

      return true;
    };
  }

  return { fn, list };
}

const filterRe = /([!=<>]+)([\w$.,]+)$/;

function parseFilter(expression) {
  // tail =
  //   (operator) = <= >= != < >
  //   (value | min..max | value1,value2,...)
  var tail = expression.match(filterRe);

  if (!tail || tail.length !== 3) {
    raise('operator and value is required in filter: "' + expression + '"');
  }

  var field = expression.slice(0, tail.index);
  var [ , operator, value ] = tail;

  var fn = makeFilter(field, operator, value);

  if (fn) {
    return { fn, expression, field, operator, value };
  }

  raise('operator "' + operator + '" is not recognized in filter: "' + expression + '"');
}

function makeFilter(field, operator, value) {
  var negative = false;
  var between, list, len;

  switch (operator) {
    case '!=':
      negative = true;
      // falls through

    case '=':
      if ((between = value.split('..')).length > 1) {
        return (record) => {
          var v = record.get(field);
          var r = between[0] <= v && v <= between[1];

          return negative ^ r;
        };
      }

      list = value.split(',');
      len  = list.length;

      return (record) => {
        var v = record.get(field);
        var r = false;

        for (var i = 0; !r && i < len; i++) {
          r = list[i] == v; // eslint-disable-line eqeqeq
        }

        return negative ^ r;
      };

    case '>=':
      return (record) => record.get(field) >= value;

    case '<=':
      return (record) => record.get(field) <= value;

    case '>':
      return (record) => record.get(field) > value;

    case '<':
      return (record) => record.get(field) < value;
  }
}

function parseSelector(selector) {
  var fn = selectors[selector];

  if (fn) {
    return { fn, selector };
  }
}

const selectors = applyOwn(opt.selectors, {
  first:  (values) => values[0],
  last:   (values) => values[values.length - 1],
  max:    (values) => values.length > 0 ? Math.max.apply(Math, values) : null,
  min:    (values) => values.length > 0 ? Math.min.apply(Math, values) : null,
  sum,
  avg:    (values) => values.length > 0 ? sum(values) / values.length : null,
  count:  (values) => values.length || null,
  unique: uniq,  // deprecated
  uniq,
});

function sum(values) {
  var sum = null;

  for (var i = 0; i < values.length; i++) {
    sum += values[i];
  }

  return sum;
}
