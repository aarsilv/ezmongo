ezmongo
==============

Easy and light weight interface wrapping the native node.js mongo driver.

Provides the following functions:
    * [findOne](#find-one)
    * [findMultiple](#find-multiple)
    * [modifyOne](#modify-one)
    * [modifyMultiple](#modify-multiple)
    * [removeOne](#remove-one)
    * [removeMultiple(#remove-multiple)
    * [insert](#insert)

As well as access to the native collection and database objects:
    * [collection](#collection)
    * [db](#db)

Ability to enable/disable (good for maintenance mode)
    * [disable](#disable)
    * [enable](#enable)

By default uses [shortId](https://github.com/dylang/shortid) so that new objects have short strings as _ids instead of ObjectIDs.
Also allows by default has protections in place to prevent accidentally clobbering an object on update.
Optional ability to require the fields to retrieve for find() operations to be specified (good for performance!)
And many other features as well!

Installation
============

    npm install ezmongo

API
=============

## Constructor ##

```EzMongo(options)```

Constructs an EzMongo instance. The only required option is *database*, the rest have defaults.

    * *host* - hostname, or array of hostnames if using replica sets (default: localhost)
    * *port* - numerical port, or array of ports if using replica sets (default: 27017)
    * *database* - name of database to connect to (required)
    * *username* - user to connect as (default: none)
    * *password* - password for username (default: none)

    * *connectionOptions* - [options](http://mongodb.github.io/node-mongodb-native/driver-articles/mongoclient.html#mongoclient-connect-options) to pass to the underlying native driver when connecting (default: none)

    * *useShortId* - if true instead of ObjectIDs, use string [shortIds](https://github.com/dylang/shortid) when creating objects (default: true)

    * *lazyConnect* - if true, database will not try to connect until needed (default: false)
    * *disabled* - if true, database begins in a disabled state (default: false)

    * *safe_id* - if true, an error will be thrown if a $set or $unset operation attempts to modify the _id field (default: true)
    * *safeModify* - if true, an error will be thrown if any of the root level keys of the modification don't start with '$' (default: true)
    * *requireFields* - if true, an error will be thrown if a find operation is done without the fields to retrieve being specified (default: false)

    * *logConnection* - output log statements about the connection (default: true)
    * *logPending* - output log statements about the status of pending operations (default: false)

```javascript
var ezMongo = new EzMongo({database: 'ezMongoTestDb'});
```

## findOne ##

```findOne(collectionName, _idOrSearch, fields, sort, callback)```

Looks up a single document from a collection.

    * *collectionName* - name of collection to search (required)
    * *_idOrSearch* - either the _id value, or the search object to be used for the find (default: {})
    * *fields* - array of fields of the object to retrieve, or null if find all fields (default: null)
    * *sort* - array of fields and their sort order, or null if no sort (default: null)
    * *callback* - function called after the find. First argument is any error that was encountered. Second argument is the object if found, otherwise null.

```javascript
ezMongo.findOne('col1', {num: {$gte: 2}}, ['field1','field2.subfield'], [['rank','asc']], function(err, obj) {
     if (err) throw err;
     console.log('Found object with _id ', obj._id, 'field1', field1, 'and subfield', obj.field2.subfield);
});
```

