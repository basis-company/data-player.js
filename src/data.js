import has from 'underscore/modules/_has.js';
import { nativeCreate } from 'underscore/modules/_setup.js';
import noop from 'underscore/modules/noop.js';

import { applyOwn } from 'helpers/apply';

var collections = {};
const models = {};

export const data = {
  collections,
  extras: {},
  indexes,
  models,
  similars: {},
  views: {},
};

export const emptyArr = [];
export const emptyObj = {};
export const fetchRefId = { fetchRefId: true };
export const oneElArr = [ null ];

export const opt = {
  absent: noop,
  akaRe: '',
  backrefs,
  backverse,
  classify: false,
  collect: noop,
  extra: false,
  keySorter: false,  // (a, b) => a <=> b
  propagate: noop,
  purify: noop,
  request: noop,
  spawn: noop,
};

export function init(config) {
  return applyOwn(opt, config);
}

export function fork() {
  collections = data.collections = nativeCreate(collections);
}

export function free() {
  collections = data.collections = Object.getPrototypeOf(collections);
}

/**
 * 'set' = true  - find in fork
 * 'set' = falsy - find in collections
 * 'set' = smth  - save in current storage
 */
export function collection(name, set) {
  if (set === true) {
    if (!has(collections, name)) {
      return;
    }
  }
  else if (set) {
    collections[name] = set;
  }

  return collections[name];
}

export function model(name, set) {
  if (set) {
    models[name] = set;
  }

  return models[name];
}

export function find(name, params, buffer) {
  return collection(name).find(params, buffer);
}

export function findOne(name, params) {
  return collection(name).findOne(params);
}

export function findOrFail(name, params) {
  return collection(name).findOrFail(params);
}

export function index(name, ...keys) {
  return collection(name).index(...keys);
}

function backrefs(m, name) {
  return ((oneElArr[0] = model(name))) ? oneElArr : emptyArr;
}

function backverse(m, suf) {
  return m.aka + suf;
}

function indexes() {
  var hash = {};

  for (var name in collections) {
    hash[name] = collections[name].indexes;
  }

  return hash;
}
