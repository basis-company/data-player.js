# data-player.js
in memory data layer for fast access to plain normalized data

### install

```shell
npm install basis-company/data-player.js basis-company/helpers.js
```

### contents

Модель ([model](src/model.js)) описывает состав собственных и виртуальных полей сущности.

Коллекция ([collection](src/collection.js)) определённой модели содержит записи с данными,
распределённые по древовидным индексам ([index](src/index.js)).

Вью ([view](src/view.js)) определённой модели
- загружает экпедитором на основе полей основные и зависимые записи,
- генерирует по ним новые записи для представления,
- поддерживает актуальность новых записей при изменении исходных записей.

Экпедитор ([expeditor](src/expeditor.js)) на основе полей производит каскадную выборку ([cascade](src/cascade.js)) из коллекций при помощи загрузчика.

Загрузчик ([loader](src/loader.js))
- получает записи из коллекции, если запрос повторный ([similar](src/similar.js)),
- или загружает записи с сервера ([request](src/request.js)) в пределах зоны доступности данных (*scope*),
- проверяет наличие запрошенных записей и догружает их, если они вне зоны доступности ([extra](src/extra.js)).

### set model structure

```js
import { register as mr } from 'data-player/model';

mr({
  name: 'user',

  // own fields
  fields: [
    'id',  // same as "{ name: 'id' }"
    'firstname',
    'lastname',
    {
      name: 'company',
      reference: 'company',  // link to another model
      property: 'id',        // id-field name of "company"
    },
  ],

  // virtual fields
  roles() {
    return this.query('user_role.role.nick');
  },
});

mr({
  name: 'company',
  fields: [
    'id',
    'name',
  ],
});

mr({
  name: 'role',
  fields: [
    'id',
    'nick',
  ],
});

mr({
  name: 'user_role',
  fields: [
    'id',
    { name: 'user', reference: 'user', property: 'id' },
    { name: 'role', reference: 'role', property: 'id' },
  ],
});
```

### set collection contents

```js
import { register as cr } from 'data-player/collection';

cr('user', [
  [ 1, 'Helen', 'Fletcher', 1 ],
  [ 2, 'Jacob', 'Evans', 2 ],
  [ 3, 'Lloyd', 'Henry', 2 ],
]);

cr('company', [
  [ 1, 'Google' ],
  [ 2, 'Microsoft' ],
]);

cr('role', [
  [ 10, 'admin' ],
  [ 20, 'manager' ],
]);

cr('user_role', [
  [ 1, 1, 10 ],
  [ 2, 1, 20 ],
  [ 3, 2, 20 ],
  [ 4, 3, 20 ],
]);
```

### get from collection

```js
import { find, findOne, findOrFail } from 'data-player/data';

// > get all records
find('user')
// <
[
  { "id": 1, "firstname": "Helen", "lastname": "Fletcher", "company": 1 },
  { "id": 2, "firstname": "Jacob", "lastname": "Evans", "company": 2 },
  { "id": 3, "firstname": "Lloyd", "lastname": "Henry", "company": 2 },
]

// > get by id
find('user', 2)
// <
[
  { "id": 2, "firstname": "Jacob", "lastname": "Evans", "company": 2 },
]

// > get by field
find('user', { company: 2 })
// <
[
  { "id": 2, "firstname": "Jacob", "lastname": "Evans", "company": 2 },
  { "id": 3, "firstname": "Lloyd", "lastname": "Henry", "company": 2 },
]

// > get first match
findOne('user', { company: 2 })
// <
{ "id": 2, "firstname": "Jacob", "lastname": "Evans", "company": 2 }

// > get undefined
find('user', { company: 3 })
// <
[]

// > get undefined
findOrFail('user', { company: 3 })
// <
throw Error
```

### get from record

```js
var user2 = findOne('user', 2)
// user2 = { "id": 2, "firstname": "Jacob", "lastname": "Evans", "company": 2 }

// get field value
user2.get('company')
// 2

// get field record
user2.query('company')
// <
[
  { "id": 2, "name": "Microsoft" },
]

// get several fields
user2.get('firstname lastname')
// < "Jacob Evans"

user2.get('company.name')
// "Microsoft"

user2.query('company.name')
// <
[
  "Microsoft",
]
```

```js
var user1 = findOne('user', 1)
// user1 = { "id": 1, "firstname": "Helen", "lastname": "Fletcher", "company": 1 }

user1.query('user_role.role.nick')
// <
[
  "admin",
  "manager",
]

user1.get('user_role.role.nick')
// < "admin, manager"

user1.get('roles')
// < "admin, manager"
```

### update record

```js
import { collection, findOne } from 'data-player/data';

// origin:
//   { "id": 1, "firstname": "Helen", "lastname": "Fletcher", "company": 1 }

collection('user').splice([
  [ 1, "Dorothy", "Fletcher", 1],
]);

findOne('user', 1)
// <
{ "id": 1, "firstname": "Dorothy", "lastname": "Fletcher", "company": 1 }

//
// tuple must be full
//

collection('user').splice([
  [ 1, "Dorothy" ],
]);

findOne('user', 1)
// <
{ "id": 1, "firstname": "Dorothy" }

//
// object may be partial
//

collection('user').splice([
  { id: 1, lastname: 'Fletcher', company: 2 },
]);

findOne('user', 1)
// <
{ "id": 1, "firstname": "Dorothy", "lastname": "Fletcher", "company": 2 }

//
// remove records from collection
//

collection('user').splice([
  { id: 1 },
],
  true // = remove
);

findOne('user', 1)
// < null
```

### fire changes

```js
import { Collection } from 'data-player/collection';

var proto = Collection.prototype;

// make Collection eventable by external kit
proto.on = observable.addListener;
proto.fireEvent = observable.fireEvent;

// listen to changes
collection('user').on('change', function onChange(records) {
  // ...
});
```

### data view - is a representation of plain data into complex view

```js
import { View } from 'data-player/view';

var proto = View.prototype;

// make View eventable by external kit
// changes in collection will apply to records in view
proto.on = observable.addListener;
proto.mon = observable.addManagedListener;
proto.fireEvent = observable.fireEvent;

var view = new View({
  model: 'user',
  fields: [
    'id',
    'firstname lastname',
    'company.name',
    'roles',
  ],
});

// load all records from 'user' collection
view.load();

// "view was loaded"
view.on('refresh', function(view, data, expeditor) {
  // update 'data' in ui
});

// "some data was changed"
view.on('update', function(view, data, expeditor) {
  // update 'data' in ui
});
```

id | firstname lastname | company.name | roles
---|---|---|---
1 | Helen Fletcher | Google | admin, manager
2 | Jacob Evans | Microsoft | manager
3 | Lloyd Henry | Microsoft | manager
