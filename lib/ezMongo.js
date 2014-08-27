'use strict';

var mongodb = require('mongodb');
var async = require('async');
var _ = require('underscore');
var shortId = require('shortid');

function EzMongo(options) {

    options = options || {};

    this.username = options.username;
    this.password = options.password;
    this.host = options.host || 'localhost';
    this.port = options.port || 27017;
    this.database = options.database;

    if (!this.database) {
        throw new Error('Missing required database name');
    }

    // ability to specify custom mongodb module to use
    this.mongo = options.mongodb || mongodb;

    this.connectionOptions = options.connectionOptions || {}; //options to pass to the underlying native mongdo driver when connecting

    this.useShortId = typeof options.useShortId !== 'undefined' ? options.useShortId : true; // automatically give inserted documents an _id using shortId if not provided

    this.safe_id = typeof options.safe_id !== 'undefined' ? options.safe_id : true;          // throw error if try to update _id
    this.safeModify = typeof options.safeModify !== 'undefined' ? options.safeModify : true; // throw error for modifications
    this.requireFields = typeof options.requireFields !== 'undefined' ? options.requireFields : false; // throw error if no fields specified for find

    // logging options
    this.logConnection = typeof options.logConnection !== 'undefined' ? options.logConnection : true;
    this.logPending = typeof options.logPending !== 'undefined' ? options.logPending : false;

    // properties for when connecting
    this._pending = [];
    this._state = 'unopened';
    this._connStr = _buildConnStr(this);
    this._db = null; //once connected this becomes the db

    if (this.logConnection) {
        console.log('MongoDB will connect using '+this._connStr);
    }

    // ability to have the database wait to connect until an operation is attempted
    this.lazyConnect = options.lazyConnect || false;

    // ability to start database off as disabled
    this.disabled = options.disabled || false; // ability to disable database; any attempts to use it will throw errors

    if (this.disabled) {
        this.disable();
    } else if (!this.lazyConnect) {
        _openIfNotConnected(this, function(err) {
            if (err) {
                console.log('Failed to immediately open MongoDB connection');
                throw err;
            }
        });
    }

}

/**
 * Returns the underlying native driver database object
 * @param callback function(err, database);
 */
EzMongo.prototype.db = function(callback){
    _openIfNotConnected(this, callback);
};

/**
 * Ensures the database connection is closed
 * @param callback function(err)
 */
EzMongo.prototype.close = function(callback) {
    _close(this, callback);
};

/**
 * Disables database, returning if it was already disabled.
 * @param callback function(err, wasDisabled)
 */
EzMongo.prototype.disable = function(callback) {
    var origDisabled = this.disabled;
    if (!origDisabled && this.logConnection) {
        console.log('Disabling MongoDB Database -- operations will now throw an error');
    }
    this.disabled = true;
    return _callbackOrError(callback, null, origDisabled);
};

/**
 * Disables database, returning if it was already enabled.
 * @param callback function(err, wasEnabled)
 */
EzMongo.prototype.enable = function(callback) {
    var origEnabled = !this.disabled;
    if (!origEnabled && this.logConnection) {
        console.log('Enabling MongoDB Database');
    }
    this.disabled = true;
    return _callbackOrError(callback, null, origEnabled);
};

/**
 * Returns the underline native collection object
 * @param collectionName name of the collection to access
 * @param callback function(err, collection)
 */
EzMongo.prototype.collection = function(collectionName, callback) {

    var self = this;

    async.auto({
        openIfNotConnected: [function(next) {
            _openIfNotConnected(self, next);
        }],
        collection: ['openIfNotConnected', function(next, results) {
            results.openIfNotConnected.collection(collectionName, next);
        }]
    }, function(err, results) {
        callback(err, results && results.collection);
    });

};

/**
 * Inserts one or more documents into a collection, returns _id of inserted document if just one or array of _ids if many.
 * @param collectionName the name of the collection to insert into.
 * @param docs documents to be inserted, or array of objects to be inserted.
 * @param callback function(err, _id | [inserted _ids]) optional; if not provided non-safe insert will be performed.
 */
EzMongo.prototype.insert = function(collectionName, docs, callback) {

    var self = this;
    var multiple = docs instanceof Array;

    if (!multiple) {
        docs = [docs];
    }

    async.auto({
        collection: [function(next) {
            self.collection(collectionName, next);
        }],
        insert: ['collection', function(next, results) {

            if (self.useShortId) {
                // for objects with no _id specified, generate one using shortId.
                docs.forEach(function(doc) {
                    if (typeof doc._id === 'undefined') {
                        doc._id = shortId.generate();
                    }
                });
            }

            results.collection.insert(docs, {safe: !!callback}, next);
        }]
    }, function(err, results) {
        var inserted_ids = results && results.insert && _.map(results.insert, function(insertedDoc) {
            return insertedDoc._id;
        });
        var result = inserted_ids ? multiple ? inserted_ids : inserted_ids[0] : null;
        _callbackOrError(callback, err, result);
    });
};

/**
 * Update a single document, returns 1 if document modified, 0 if not.
 * @param collectionName the collection in which to modify the document.
 * @param _idOrSearch _id of the document to modify or the search object to use to query.
 * @param changes the changes to make.
 * @param callback function(err, numChanges) -- optional; if not provided non-safe write will be used.
 */
EzMongo.prototype.updateOne = function(collectionName, _idOrSearch, changes, callback) {
    _modifyBase(this, collectionName, _idOrSearch, changes, false, callback);
};

/**
 * Alias for modifyOne. For backwards compatibility.
 */
EzMongo.prototype.modifyOne = EzMongo.prototype.updateOne;

/**
 * Updates multiple documents, returns number of documents modified.
 * @param collectionName the collection in which to modify the documents.
 * @param _idsOrSearch array of the _ids of the documents to modify or the search object to use to query.
 * @param changes changes to make
 * @param callback function(err, numChanges) -- optional; if not provided non-safe write will be used.
 */
EzMongo.prototype.updateMultiple = function(collectionName, _idsOrSearch, changes, callback) {
    _modifyBase(this, collectionName, _idsOrSearch, changes, true, callback);
};

/**
 * Alias for updateMultiple. For backwards compatibility.
 */
EzMongo.prototype.modifyMultiple = EzMongo.prototype.updateMultiple;

/**
 * Private helper function to handle all modifications
 * @param self EzMongo instance.
 * @param collectionName the collection in which to modify the documents.
 * @param _idOrSearch _id, array of the _ids, or search object for the document(s) to modify.
 * @param changes changes to make.
 * @param multiple changes to make.
 * @param callback function(err, numChanges) -- optional; if not provided non-safe write will be used.
 * @privates
 */
function _modifyBase(self, collectionName, _idOrSearch, changes, multiple, callback) {

    async.auto({
        collection: [function(next) {

            // some checking
            if (self.safe_id && (changes.$set && changes.$set._id || changes.$unset && changes.$unset._id)) {
                return next(new Error('Attempt to modify _id with safe_id enabled'));
            }

            if (self.safeModify && Object.keys(changes).some(function(change) {
                return change[0] !== '$';
            })) {
                return next(new Error('Attempt to modify whole document with safeModify enabled'));
            }

            self.collection(collectionName, next);
        }],
        modify: ['collection', function(next, results) {

            var collection = results.collection;

            var optionsObj = {w: callback ? 1 : 0,
                              multi: multiple,
                              upsert:  false};

            var searchObj = _searchObj(self, _idOrSearch);

            collection.update(searchObj, changes, optionsObj, next);
        }]
    }, function(err, results) {
        _callbackOrError(callback, err, results && results.modify && results.modify[0] || 0);
    });
}

/**
 * Remove a single document from a collection, returning 1 if removed, 0 if not.
 * @param collectionName collection from which to remove the document.
 * @param _idOrSearch _id, or search object for the document to remove.
 * @param callback function(err, numRemoved)
 */
EzMongo.prototype.removeOne = function(collectionName, _idOrSearch, callback) {
    _removeBase(this, collectionName, _idOrSearch, false, callback);
};

/**
 * Remove multiple documents from a collection, returning how many were removed.
 * @param collectionName collection from which to remove documents.
 * @param _idsOrSearch _id, array of the _ids, or search object for the document(s) to remove.
 * @param callback function(err, numRemoved) -- optional; if not provided non-safe write will be used.
 */
EzMongo.prototype.removeMultiple = function(collectionName, _idsOrSearch, callback) {
    _removeBase(this, collectionName, _idsOrSearch, true, callback);
};

/**
 * Private helper base remove function that removes documents from a collection and returns how many were removed.
 * @param self the EzMongo instance.
 * @param collectionName collection from which to remove documents.
 * @param _idOrSearch _id, array of the _ids, or search object for the document(s) to remove.
 * @param multiple whether or not to allow multiple documents to be removed or just one.
 * @param callback function(err, numRemoved) -- optional; if not provided non-safe write will be used.
 * @private
 */
function _removeBase(self, collectionName, _idOrSearch, multiple, callback) {

    async.auto({
        collection: function(next) {
            self.collection(collectionName, next);
        },
        remove: ['collection', function(next, results) {
            var searchOb = _searchObj(self, _idOrSearch);
            results.collection.remove(searchOb, {safe : !!callback, single: !multiple}, next);
        }]
    }, function(err, results) {
        var removeResult = results && results.remove;
        var removed = removeResult && (removeResult instanceof Array ? removeResult[0] : removeResult) || 0;
        _callbackOrError(callback, err, removed);
    });
}

/**
 * Look up a single document, returning it or null if nothing found matching the search _idOrSearch in the given collection.
 * @param collectionName the collection to look for the document.
 * @param _idOrSearch (optional) the _id of the document to load or the search object to use to query.
 * @param fields (optional) the fields to retrieve.
 * @param sort (optional) how to sort the documents for returning the top 1.
 * @param callback function(err, doc)
 */
EzMongo.prototype.findOne = function(collectionName, _idOrSearch, fields, sort, callback) {

    var self = this;

    if (typeof _idOrSearch === 'function') {
        callback = _idOrSearch;
        _idOrSearch = {};
    } if (typeof fields === 'function') {
        callback = fields;
        fields = null;
    } else if (typeof sort === 'function') {
        callback = sort;
        sort = null;
    }



    async.auto({
        performFind: [function(next) {
            _findBase(self, collectionName, _idOrSearch, fields, sort, 1, null, next);
        }],
        extractResult: ['performFind', function(next, results) {
            var resultArr = results.performFind;
            var result = resultArr && resultArr.length ? resultArr[0] : null;
            next(null, result);
        }]
    }, function(err, results) {
        callback(err, results && results.extractResult);
    });
};

/**
 * Looks up multiple documents returning an array of results. If nothing is found the empty array is returned.
 * @param collectionName collectionName the collection to look for the documents.
 * @param _idOrSearch array of the _ids of the documents to load or the search object to use to query.
 * @param fields (optional) the fields to retrieve.
 * @param sort (optional) how to sort the results
 * @param limit (optional) limit of (possibly sorted) results to return.
 * @param skip how many within the sorted results to skip before loading and applying the limit.
 * @param callback function(err, [doc1,doc2,doc3])
 */
EzMongo.prototype.findMultiple = function(collectionName, _idOrSearch, fields, sort, limit, skip, callback) {

    // for now we require fields (with null meaning all fields)
    if (typeof fields === 'function') {
        callback = fields;
        fields = null;
    } else if (typeof sort === 'function') {
        callback = sort;
        sort = null;
    } else if (typeof limit === 'function') {
        callback = limit;
        limit = null;
    } else if (typeof skip === 'function') {
        callback = skip;
        skip = null;
    }

    _findBase(this, collectionName, _idOrSearch, fields, sort, limit, skip, callback);
};

/**
 * Private base find function that queries for documents
 * @param self the EzMongo instance
 * @param collectionName collectionName the collection to look for the documents.
 * @param _idOrSearch array of the _ids of the documents to load or the search object to use to query.
 * @param fields (optional) the fields to retrieve.
 * @param sort (optional) how to sort the results
 * @param limit (optional) limit of (possibly sorted) results to return.
 * @param skip how many within the sorted results to skip before loading and applying the limit.
 * @param callback function(err, [doc1,doc2,doc3])
 * @private
 */
function _findBase(self, collectionName, _idOrSearch, fields, sort, limit, skip, callback) {

    // sanity check there is a callback
    if (!callback) {
        throw new Error('MongoDB find called with no callback specified');
    }

    if (typeof fields === 'string') {
        fields = [fields];
    }

    if (self.requireFields && (!fields || !fields.length)) {
        return callback(new Error('No fields explicitly specified for MongoDB find operation when required'));
    }

    async.auto({
        collection: [function(next) {
            self.collection(collectionName, next);
        }],
        find: ['collection', function(next, results) {

            var optionsObj = {};

            var searchObj = _searchObj(self, _idOrSearch);

            if (sort) {
                optionsObj.sort = sort;
            }
            if (limit) {
                optionsObj.limit = limit;
            }
            if (skip) {
                optionsObj.skip = skip;
            }

            if (fields) {
                optionsObj.fields = fields;
            }

            if (Object.keys(optionsObj).length === 0) {
                // for some reasons bad things happen when we pass empty options object
                results.collection.find(searchObj).toArray(next);
            } else {
                results.collection.find(searchObj, optionsObj).toArray(next);
            }
        }]
    }, function(err, results) {
        callback(err, results && results.find || []);
    });
}

/**
 * Builds a connection string for an EzMongo instance to connect
 * @param self the EzMongo instance
 * @returns the connection string
 * @private
 */
function _buildConnStr(self) {

    var c = 'mongodb://';

    if (self.username && self.password) {
        c += self.username+':'+self.password+'@';
    }
    if (self.host instanceof Array) {
        for (var i = 0; i < self.host.length; i += 1) {
            c += (i > 0 ? ',' : '')+self.host[i]+':'+self.port[i];
        }
    } else {
        c += self.host+':'+self.port;
    }

    c += '/'+self.database;

    return c;
}

/**
 * Opens the database if not connected, returning the connected database. If not open callbacks will be queued until
 * databas eis ready.
 * @param self EzMongo instance
 * @param callback function(err, db)
 * @private
 */
function _openIfNotConnected(self, callback) {

    if (self.disabled) {
        return callback(new Error('Attempt to open MongoDB when disabled'));
    }

    if (self._state === 'opening' || self._state === 'unopened') {

        // While opening our MongoDB connection, append any callbacks to a list of pending things to do once database is open
        self._pending.push(callback);

        if (self.logPending) {
            console.log('MongoDB not ready yet, queueing operation #'+self._pending.length);
        }

        if (self._state === 'opening') {
            return;
        }

    } else {
        // database connection attempt done
        if (self._state === 'error') {
            // error opening database
            return callback(new Error('Could not open MongoDB connection'));
        } else {
            // database connection is good
            return callback(null, self._db);
        }
    }

    self._state = 'opening';

    if (self.logConnection) {
        console.log('Connecting to MongoDB database '+self.database);
    }

    self.mongo.MongoClient.connect(self._connStr, self.connectionOptions, function(err, connectedDb) {
        if (err) {
            self._state = 'error';
            if (self.logConnection) {
                console.log('Failed to connect to MongoDB database '+self.database);
            }
        } else {
            self._state = 'opened';
            self._db = connectedDb;
            if (self.logConnection) {
                console.log('Connected to MongoDB database '+self.database);
            }
        }

        if (self.logPending) {
            console.log('MongoDB open, flushing '+self._pending.length+' operations');
        }

        self._pending.forEach(function(operation) {
            operation(err, self._db);
        });

        // truncate pending operations
        self._pending.length = 0;
    });
}

/**
 * Closes the database
 * @param self instance of EzMongo
 * @param callback function(err)
 */
function _close(self, callback) {
    if (self._state !== 'unopened' && self._db) {
        self._pending.length = 0;
        self._state = 'unopened';
        self._db.close(callback);
    } else {
        // database already closed
        if (callback) {
            callback();
        }
    }
}

/**
 * Takes an argument and determines how to use it query MongoDB documents. If its an array its assumed its an array of IDs,
 * if an object(other than an ObjectId) it assumes it is a search object, otherwise it assumes it is the id itself.
 * @param self the EzMongo instance.
 * @param _idOrSearchTerm the _id, array of _ids or search object to use to query documents.
 * @returns the search object to use to query the database.
 * @private
 */
function _searchObj(self, _idOrSearchTerm) {
    _idOrSearchTerm = _idOrSearchTerm || {};

    return _idOrSearchTerm instanceof self.mongo.ObjectID || typeof _idOrSearchTerm !== 'object' ? {_id: _idOrSearchTerm} // we have the _id
         : _idOrSearchTerm instanceof Array ? {_id: {$in: _idOrSearchTerm}} // we have an array of _ids
         : _idOrSearchTerm; // we have the actual search object
}

/**
 * If callback is defined it will be called with the error and result. If not, and there was an error, the error will be thrown.
 * @param callback any defined calback
 * @param err any error encountered
 * @param result the result to call back with
 * @private
 */
function _callbackOrError(callback, err, result) {
    if (callback) {
        callback(err, result);
    } else if (err) {
        throw err;
    }
    return result;
}

module.exports = EzMongo;