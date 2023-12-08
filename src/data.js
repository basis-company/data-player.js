import has from 'underscore/modules/_has.js';
import { nativeCreate } from 'underscore/modules/_setup.js';

var collections = {};
const models = {};

export const data = { collections, indexes, models };

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

export function find(name, params) {
  return collection(name).find(params);
}

export function findOne(name, params) {
  return collection(name).findOne(params);
}

export function findOrFail(name, params) {
  return collection(name).findOrFail(params);
}

export function index(name, keys) {
  return collection(name).index(keys);
}

function indexes() {
  var hash = {};

  for (var name in collections) {
    hash[name] = collections[name].indexes;
  }

  return hash;
}
