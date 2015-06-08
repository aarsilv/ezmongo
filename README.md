ezmongo
==============

Easy and light weight interface wrapping the native node.js MongoDB driver, the [mongodb](https://github.com/mongodb/node-mongodb-native) module.

Simple wrapper to use basic insert/find/modify/delete functions. Ability to access native collection and database objects for more advanced operations.

By default uses [shortId](https://github.com/dylang/shortid) so that new objects have short strings as _ids instead of ObjectIDs.
Also by default has protections in place to prevent accidentally clobbering an object on update.
Optional ability to require the fields to retrieve for find() operations to be specified (good for performance!) and many other features as well!

Provides the following functions:

* [findOne](#findOne)
* [findMultiple](#findMultiple)
* [updateOne](#updateOne)
* [updateMultiple](#updateMultiple)
* [removeOne](#removeOne)
* [removeMultiple](#removeMultiple)
* [insert](#insert)

As well as access to the native collection and database objects:

* [collection](#collection)
* [db](#db)

Ability to enable/disable (good for maintenance mode)

* [disable](#disable)
* [enable](#enable)


Installation
============

    npm install ezmongo

API
=============

<a name="constructor" />
## Constructor

Constructs an EzMongo instance. The only required option is database, the rest have defaults.

```javascript
EzMongo(options)
```

Connection options:

* **host** - hostname, or array of hostnames if using replica sets *(default: localhost)*
* **port** - numerical port, or array of ports if using replica sets *(default: 27017)*
* **database** - name of database to connect to *(required)*
* **username** - user to connect as *(default: none)*
* **password** - password for username *(default: none)*
* **connectionOptions** - [options](http://mongodb.github.io/node-mongodb-native/driver-articles/mongoclient.html#mongoclient-connect-options) to pass to the underlying native driver when connecting *(default: none)*

Feature options:

* **useShortId** - if true instead of ObjectIDs, use string [shortIds](https://github.com/dylang/shortid) when creating objects *(default: true)*
* **lazyConnect** - if true, database will not try to connect until needed *(default: false)*
* **disabled** - if true, database begins in a disabled state *(default: false)*
* **safe_id** - if true, an error will be thrown if a $set or $unset operation attempts to modify the _id field *(default: true)*
* **safeModify** - if true, an error will be thrown if any of the root level keys of the modification don't start with '$' *(default: true)*
* **requireFields** - if true, an error will be thrown if a find operation is done without the fields to retrieve being specified *(default: false)*
* **mongodb** - optionally pass the mongodb module to wrap. *(default: latest 1.x module)*

Logging options:

* **logConnection** - output log statements about the connection *(default: true)*
* **logPending** - output log statements about the status of pending operations *(default: false)*

```javascript
    var ezMongo = new EzMongo({database: 'ezMongoTestDb'});

    // below will query as soon as DB is connected
    ezMongo.findOne('myCollection', function(err, doc)) {
        console.log('look what I found!',doc);
    });
```

<a name="findOne" />
## findOne

Looks up a single document from a collection. Callback with the document if found, or null if not.
If multiple documents match the search and no sort is provided, the document returned is non-deterministic and up to the database.

```javascript
findOne(collectionName, _idOrSearch, fields, sort, callback)
```

* *collectionName* - name of collection to search (required)
* *_idOrSearch* - either the _id value, or the search object to be used for the find (default: {})
* *fields* - array of fields of the document to retrieve, or null if find all fields (default: null)
* *sort* - array of fields and their sort order, or null if no sort (default: null)
* *callback* - function called after the find. First argument is any error that was encountered. Second argument is the document if found, otherwise null.

```javascript
    ezMongo.findOne('myCollection', {num: {$gte: 2}}, ['field1','field2.subfield'], [['rank','asc']], function(err, doc) {
         console.log('Found document with _id ', doc._id, 'field1', doc.field1, 'and subfield', doc.field2.subfield);
    });
```

<a name="findMultiple" />
## findMultiple

Looks up multiple documents from a collection. Callback with the array of found documents. If no documents are found the array will be empty.

```javascript
findMultiple(collectionName, _idsOrSearch, fields, sort, limit, skip, callback)
```

* **collectionName** - name of collection to search *(required)*
* **_idsOrSearch** - either array of _ids, or the search object to be used for the find *(default: {})*
* **fields** - array of fields of the documents to retrieve, or null if find all fields *(default: null)*
* **sort** - array of fields and their sort order, or null if no sort *(default: null)*
* **limit** - limit to the number of documents to return, or null if no limit *(default: null)*
* **skip** - how many documents to skip *(default: 0)*
* **callback** - function called after the find. First argument is any error that was encountered. Second argument is the array of zero or more found documents. *(required)*

```javascript
    ezMongo.findMultiple('myCollection', {num: {$gte: 2}, ['field1'], [['rank','asc']], 10, 20, function(err, docs) {
        if (docs.length) {
            console.log('Found documents ranked 11 through', 10+docs.length); //most will be 11 through 30
            docs.forEach(function(doc) {
                console.log('Found doc',doc);
            });
        } else {
            console.log('no more documents found');
        }
    });
```

<a name="updateOne" />
## updateOne

Updates a single document. Callback with number of documents modified: 1 if a document modified, 0 if not.
If multiple documents match the search, the one that will be modified is non-deterministic and up to the database.

```javascript
updateOne(collectionName, _idOrSearch, changes, callback)
```

* **collectionName** - name of collection to search for a document to modify *(required)*
* **_idOrSearch** - either the _id value, or the search object to be used for the find *(required)*
* **changes** - the changes to make *(required)*
* **callback** - if specified, function called after the modification. First argument is any error encountered. Second argument is how many documents were modified. If not provided, modification will be done non-safe. *(default: none)*

```javascript
    ezMongo.updateOne('myCollection','_id1', {$set: {lastModified: new Date()}, $inc: {views: 1}}, function(err, success) {
        if (success) {
            console.log('document modified');
        } else {
            console.log('failed to find document with _id of _id1 to modify');
        }
    });
```

<a name="updateMultiple" />
## updateMultiple

Updates multiple documents. Callback with number of documents modified.

```javascript
updateMultiple(collectionName, _idsOrSearch, changes, callback)
```

* **collectionName** - name of collection to search for the documents to modify *(required)*
* **_idsOrSearch** - either an array of _ids, or the search object to be used for the find *(required)*
* **changes** - the changes to make *(required)*
* **callback** - if specified, function called after the modification. First argument is any error encountered. Second argument is how many documents were modified. If not provided, modification will be done non-safe. *(default: none)*

```javascript
    ezMongo.updateMultiple('myCollection','{powerLevel: {$gt: 9000}}', {$set: {state: 'awesome'}}, function(err, numModified) {
        console.log('Marked',numModified,'documents as awesome');
    });
```

<a name="removeOne" />
## removeOne

Removes a single document. Callback with number of documents removed: 1 if removed, 0 if not.
If multiple documents match the search, the one that will be removed is non-deterministic and up to the database.

```javascript
removeOne(collectionName, _idOrSearch, callback)
```

* **collectionName** - name of collection to search for the document to remove *(required)*
* **_idOrSearch** - either the _id of the document, or the search object to be used for the find *(required)*
* **callback** - if specified, function called after the modification. First argument is any error encountered. Second argument is how many documents were removed. If not provided, remove will be done non-safe. *(default: none)*

```javascript
    ezMongo.removeOne('myCollection', {powerLevel: {$lte: 9000}}, function(err, success) {
        if (success) {
            console.log('a document has been removed');
        } else {
            console.log('no documents with power levels 9000 or less to remove');
        }
    });
```

<a name="removeMultiple" />
## removeMultiple

Removes multiple documents. Callback with number of documents removed.

```javascript
removeMultiple(collectionName, _idsOrSearch, callback)
```

* **collectionName** - name of collection to search for the documents to remove *(required)*
* **_idsOrSearch** - either an array of _ids of the documents, or the search object to be used for the find *(required)*
* **callback** - if specified, function called after the modification. First argument is any error encountered. Second argument is how many documents were removed. If not provided, remove will be done non-safe. *(default: none)*

```javascript
    ezMongo.removeMultiple('myCollection', ['_id1','_id2','_id3'], function(err, numRemoved) {
        if (numRemoved === 3) {
            console.log('target documents removed');
        } else {
            console.log('Removed',numRemoved, 'documents;', 3 - numRemoved, 'documents not in collection');
        }
    });
```

<a name="insert" />
## insert

Inserts documents into the database.
If documents don't have an _id, one will be automatically generated either by using [shortId](https://github.com/dylang/shortid),
or if useShortId constructor option was false by the database.
Callback with the _id, or array of _ids of the newly inserted documents.

```javascript
insert(collectionName, docs, callback)
```

* **collectionName** - name of collection to insert the documents into *(required)*
* **docs** - either a single object or array of objects to insert as documents into the collection *(required)*
* **callback** - if specified, function called after the insert. First argument is any error encountered. Second argument is the _id of the newly inserted doc, or if an array of docs was inserted an array of their new _ids. If not provided, remove will be done non-safe. *(default: none)*

```javascript
    ezMongo.insert('myCollection', {num: 3, powerLevel: 9001}, function(err, _id) {
        console.log('Inserted new document has _id', _id);
    });
```

<a name="collection" />
## collection

Provides access to the native collection object for a collection.
Callback with the native collection.

```javascript
collection(collectionName, callback)
```

* **collectionName** name of the collection to access *(required)*
* **callback** function called after collection is retrieved. First argument is any error encountered. Second argument is the native driver collection instance. *(required)*

```javascript
    ezMongo.collection('myCollection', function(err, collection) {
        collection.count(function(err, count) {
            console.log(count,'documents in myCollection');
        }):
    });
```

<a name="db" />
## db

Provides access to the native database object. Will attempt to connect.
Callback with the native database.

```javascript
db(callback)
```

* **callback** called after the database is connected. First argument is any error encountered. Second argument is the native driver database object. *(required)*

```javascript
    ezMongo.db(function(err, db) {
        db.collectionNames(function(err, names)) {
            console.log('Collections on this database: ');
            names.forEach(function(name) {
                console.log(name);
            });
        };
    });
```

<a name="disable" />
## disable

Effectively disables the database as any subsequent EzMongo commands (other than enable/disable) will result in an error.
Callback with whether or not the database was already disabled.

```javascript
disable(callback)
```

* **callback** if provided, called after database is disabled. First argument is any error encountered. Second argument is whether or not the database was already disabled. *(default: none)*

```javascript
    ezMongo.disable();

    ezMongo.findOne('myCollection','_id1', function(err, doc) {
        // err will be non-null; doc will be null
        if (err) {
            console.log('Error doing find');
        } else {
            // won't get here
        }
    }):
```

<a name="enable" />
## enable

Effectively enables the database, with EzMongo commands executing as intended.
Callback with whether or not the database was already enabled.

```javascript
enable(callback)
```

* **callback** if provided, called after database is enabled. First argument is any error encountered. Second argument is whether or not the database was already enabled. *(default: none)*

```javascript
    ezMongo.enable(function(err, alreadyEnabled) {
        if (!allreadyEnabled) {
            console.log('Database commands will now work again');
        } else {
            console.log('Database was already enabled');
        }
    });
```

Further Development
============
The features are not yet inclusive. The [collection](#collection) and [db](#db) commands allow getting around this, however going forward additional features (e.g. count()) may be added as the needs arise.

Testing
============
Testing uses nodeunit, which you can install globally

     npm install -g nodeunit

To run the tests, execute:

     nodeunit test/

This module is not yet fully covered by tests. Particularly the various constructor options. While uses in production also help tease out errors, expanded test coverage is a goal.

Version 0.0.6 has been tested and works with node version 0.12.4 and MongoDB 3.0.3. If you use older versions you may need an older version of ezmongo.

Projects using EzMongo
============
EzMongo was originally created for Node Knockout 2011 winner for Most Fun, [Doodle Or Die](http://doodleordie.com) and is still used today. Millions of hilarious doodles have been saved and accessed using EzMongo.
EzMongo is also used for projects by the [Video Blocks](http://videoblocks.com) team. Unlimited downloads stock video, after effects templates, and more for one flat price.