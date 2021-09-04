'use strict';

var async = require('async');
var NodeunitAsync = require('nodeunit-async');
var EzMongo = require('../index');

var ezMongo = new EzMongo({database: 'ezMongoTestDb'});

var na = new NodeunitAsync({
    globalSetup: _setUp,
    fixtureTeardown:  _tearDown
});

var testFixture = {
    col1: {
        docA: {num: 1, char: 'A'},
        docB: {num: 2, char: 'B'},
        docC: {num: 3, char: 'C'}
    },
    col2: {
        docX: {num: 77, char: 'X'},
        docY: {num: 88, char: 'Y'},
        docZ: {num: 99, char: 'Z'}
    },
    col3: {}
};

function _setUp (callback) {

    // reset col1 and col2 collections to the fixture

    async.auto({
        db: [function(next) {
            ezMongo.db(next);
        }],
        ensureTestFixture: ['db', function(next, results) {
            async.eachSeries(Object.keys(testFixture), function(fixtureCollectionName, eachNext) {
                _ensureTestCollection(results.db, fixtureCollectionName, eachNext);
            }, function(err) {
                next(err);
            });
        }]
    }, function(err) {
        callback(err);
    });
}

async function _ensureTestCollection(db, fixtureCollectionName, callback) {
    let caughtErr = null;
    try {
        const collection = await db.collection(fixtureCollectionName);
        try {
            await collection.drop();
        } catch (err) {
            if (err.message.match(/ns not found/)) {
                /* ignore */
            } else {
                throw err;
            }
        }

        const fixtureDocs = testFixture[fixtureCollectionName];
        for (const [id, props] of Object.entries(fixtureDocs)) {
            props._id = id;
            await collection.insertOne(props);
        }
    } catch (err) {
        caughtErr = err;
    }
    callback(caughtErr);
}

function _tearDown(callback) {
    ezMongo && ezMongo.close(callback);
}

exports.testCollection = function(test) {

    test.expect(1);

    na.runTest(test, {
        col1: [function(next) {
            ezMongo.collection('col1', next);
        }],
        assertResults: ['col1', function(next, results) {
            test.equals('col1', results.col1.collectionName);
            next();
        }]
    });
};

exports.testFindOne = function(test) {

    test.expect(8);

    na.runTest(test, {
        useId: [function(next) {
            ezMongo.findOne('col1', 'docB', ['num','char'], next);
        }],
        noFields: [function(next) {
            ezMongo.findOne('col1', 'docB', next);
        }],
        useObj: [function(next) {
            ezMongo.findOne('col1', {char: 'A'}, ['num'], next);
        }],
        manyChoices: [function(next) {
            ezMongo.findOne('col1', {num: {$gte: 2}}, ['char'], next);
        }],
        assertResults: ['useId','noFields','useObj','manyChoices',function(next, results) {
            test.equals(2, results.useId.num);
            test.equals('B', results.useId.char);
            test.equals(2, results.noFields.num);
            test.equals('B', results.noFields.char);
            test.equals(1, results.useObj.num);
            test.ok(!results.useObj.char);
            test.ok(!results.manyChoices.num);
            test.ok(results.manyChoices.char !== 'A');
            next();
        }]
    });
};

exports.testFindMultiple = function(test) {

    test.expect(9);

    na.runTest(test, {
        useIds: [function(next) {
            ezMongo.findMultiple('col1', ['docA','docB'], ['num','char'], next);
        }],
        useObj: [function(next) {
            ezMongo.findMultiple('col1', {num: {$gte: 2}}, ['num','char'], next);
        }],
        sort: [function(next) {
            ezMongo.findMultiple('col1', ['docA','docB','docC'], ['num'], [['num','asc']], next);
        }],
        limit: [function(next) {
            ezMongo.findMultiple('col1', ['docA','docB','docC'], ['char'], [['num','desc']], 2, next);
        }],
        skip: [function(next) {
            ezMongo.findMultiple('col1', ['docA','docB','docC'], ['char'], [['num','desc']], 2, 1, next);
        }],
        assertResults: ['useIds','useObj','sort','limit','skip',function(next, results) {

            test.equal(2, results.useIds.length);
            test.ok(results.useIds.some(function(el) {
                return el.num === 1 && el.char === 'A';
            }));
            test.ok(results.useIds.some(function(el) {
                return el.num === 2 && el.char === 'B';
            }));

            test.equal(2, results.useObj.length);
            test.ok(results.useObj.some(function(el) {
                return el.num === 2 && el.char === 'B';
            }));
            test.ok(results.useObj.some(function(el) {
                return el.num === 3 && el.char === 'C';
            }));

            test.deepEqual([{_id: 'docA', num: 1}, {_id: 'docB', num: 2}, {_id: 'docC', num: 3}], results.sort);
            test.deepEqual([{_id: 'docC', char: 'C'}, {_id: 'docB', char: 'B'}], results.limit);
            test.deepEqual([{_id: 'docB', char: 'B'}, {_id: 'docA', char: 'A'}], results.skip);

            next();
        }]
    });
};

exports.testUpdateOne = function(test) {

    test.expect(5);

    na.runTest(test, {
        useId: [function(next) {
            ezMongo.updateOne('col1','docB',{$set: {num: 4000}}, next);
        }],
        reloadDocB: ['useId', function(next) {
            ezMongo.findOne('col1','docB', next);
        }],
        useObject: [function(next) {
            ezMongo.modifyOne('col2',{num: 88},{$set: {char: 'A'}}, next);
        }],
        reloadDocY: ['useObject', function(next) {
            ezMongo.findOne('col2','docY', next);
        }],
        nonExistent: [function(next) {
            ezMongo.updateOne('col1','bad_id',{$set: {char: 'A'}}, next);
        }],
        assertResults: ['reloadDocB','reloadDocY','nonExistent',function(next, results) {

            var docB = results.reloadDocB;
            var docY = results.reloadDocY;

            test.equals(1, results.useId);
            test.equals(4000, docB.num);
            test.equals(1, results.useObject);
            test.equals('A', docY.char);
            test.equals(0, results.nonExistent);

            next();
        }]
    });
};

exports.testUpdateMultiple = function(test) {

    test.expect(9);

    na.runTest(test, {
        useIds: [function(next) {
            ezMongo.updateMultiple('col1',['docA','docB'],{$set: {num: 4000}}, next);
        }],
        reloadCol1: ['useIds', function(next) {
            ezMongo.findMultiple('col1',{}, null, [['_id','asc']], next);
        }],
        useObject: [function(next) {
            ezMongo.modifyMultiple('col2',{num: {$gte: 88}},{$set: {char: 'A'}}, next);
        }],
        reloadCol2: ['useObject', function(next) {
            ezMongo.findMultiple('col2', {}, null, [['_id','asc']], next);
        }],
        nonExistent: [function(next) {
            ezMongo.updateMultiple('col2',{badField: 'notHere'},{$set: {char: 'A'}}, next);
        }],
        assertResults: ['reloadCol1', 'reloadCol2', 'nonExistent', function(next, results) {
            var col1 = results.reloadCol1;
            var col2 = results.reloadCol2;

            test.equals(2, results.useIds);
            test.equals(4000, col1[0].num);
            test.equals(4000, col1[1].num);
            test.equals(3, col1[2].num);

            test.equals(2, results.useObject);
            test.equals('X', col2[0].char);
            test.equals('A', col2[1].char);
            test.equals('A', col2[2].char);

            test.equals(0, results.nonExistent);

            next();
        }]
    });
};

exports.testUpsertOne = function(test) {

    test.expect(16);

    na.runTest(test, {
        insertById: [next => {
            ezMongo.upsertOne('col3','docQ',{$set: {num: 1234}}, next);
        }],
        loadDocQ: ['insertById', next => {
            ezMongo.findOne('col3','docQ', next);
        }],
        upsertById: ['loadDocQ', next => {
            ezMongo.upsertOne('col3','docQ',{$set: {num: 5678}}, next);
        }],
        reloadDocQ: ['upsertById', next => {
            ezMongo.findOne('col3','docQ', next);
        }],
        insertByObject: [next => {
            ezMongo.upsertOne('col3',{num: 8888},{$set: {char: 'R'}}, next);
        }],
        loadDoc8888: ['insertByObject', next => {
            ezMongo.findOne('col3',{num: 8888}, next);
        }],
        upsertByObject: ['loadDoc8888', next => {
            ezMongo.upsertOne('col3',{num: 8888},{$set: {char: 'S'}}, next);
        }],
        reloadDoc8888: ['upsertByObject', next => {
            ezMongo.findOne('col3',{num: 8888}, next);
        }],
        assertResults: ['reloadDocQ','reloadDoc8888', function(next, results) {

            const insertedQ = results.loadDocQ;
            const upsertedQ = results.reloadDocQ;

            test.equals(1, results.insertById);
            test.ok(insertedQ._id);
            test.equals('docQ', insertedQ._id);
            test.equals(1234, insertedQ.num);
            test.equals(1, results.upsertById);
            test.ok(upsertedQ._id);
            test.equals('docQ', upsertedQ._id);
            test.equals(5678, upsertedQ.num);

            const inserted8888 = results.loadDoc8888;
            const upserted8888 = results.reloadDoc8888;

            test.equals(1, results.insertByObject);
            test.ok(inserted8888._id);
            test.equals(8888, inserted8888.num);
            test.equals('R', inserted8888.char);
            test.equals(1, results.upsertByObject);
            test.ok(upserted8888._id);
            test.equals(8888, upserted8888.num);
            test.equals('S', upserted8888.char);

            next();
        }]
    });
};

exports.testUpsertMultiple = function(test) {

    test.expect(20);

    na.runTest(test, {
        insertByObjectD: [next => {
            ezMongo.upsertMultiple('col3',{num: 7777},{$set: {char: 'D'}}, next);
        }],
        loadFirstDoc: ['insertByObjectD', next => {
            ezMongo.findOne('col3',{num: 7777}, next);
        }],
        insertByObjectE: ['loadFirstDoc', next => {
            ezMongo.upsertMultiple('col3',{char: 'E'},{$set: {num: 7777}}, next);
        }],
        loadBothDocs: ['insertByObjectE', next => {
            ezMongo.findMultiple('col3',{num: 7777}, next);
        }],
        upsertByObject: ['loadBothDocs', next => {
            ezMongo.upsertMultiple('col3',{num: 7777},{$set: {char: 'F'}}, next);
        }],
        reloadBothDocs: ['upsertByObject', next => {
            ezMongo.findMultiple('col3',{num: 7777}, next);
        }],
        assertResults: ['reloadBothDocs', function(next, results) {

            const insertedD = results.loadFirstDoc;

            test.equals(1, results.insertByObjectD);
            test.ok(insertedD._id);
            test.equals(7777, insertedD.num);
            test.equals('D', insertedD.char);

            const bothInserted = results.loadBothDocs;
            bothInserted.sort((a,b) => a.char < b.char ? -1 : 1);
            const leftAloneD = bothInserted[0];
            const insertedE = bothInserted[1];

            test.equals(1, results.insertByObjectE);
            test.ok(leftAloneD._id);
            test.equals(7777, leftAloneD.num);
            test.equals('D', leftAloneD.char);
            test.ok(insertedE._id);
            test.equals(7777, insertedE.num);
            test.equals('E', insertedE.char);
            test.ok(leftAloneD._id !== insertedE._id);

            const bothUpserted = results.loadBothDocs;
            bothUpserted.sort((a,b) => a.char < b.char ? -1 : 1);
            const uspertedD = bothInserted[0];
            const uspertedE = bothInserted[1];

            test.equals(2, results.upsertByObject);
            test.ok(uspertedD._id);
            test.equals(7777, uspertedD.num);
            test.equals('D', uspertedD.char);
            test.ok(uspertedE._id);
            test.equals(7777, uspertedE.num);
            test.equals('E', uspertedE.char);
            test.ok(uspertedD._id !== insertedE._id);

            next();
        }]
    });
};


exports.testInsert = function(test) {

    test.expect(6);

    var soloData = {_id: 'docF', num: 6, char: 'F'};
    var multiData =  [{_id: 'docH', num: -1, char: 'H'},
                      {_id: 'docI', num: -2, char: 'I'}];

    na.runTest(test, {
        insertOne: [function(next) {
            ezMongo.insert('col1', soloData, next);
        }],
        reloadCol1: ['insertOne', function(next) {
            ezMongo.findMultiple('col1',{}, null, [['_id','asc']], next);
        }],
        insertMultiple: [function(next) {
            ezMongo.insert('col2', multiData, next);
        }],
        reloadCol2: ['insertMultiple', function(next) {
            ezMongo.findMultiple('col2', {}, null, [['_id','asc']], next);
        }],
        assertResults: ['reloadCol1','reloadCol2',function(next, results) {
            var col1 = results.reloadCol1;
            var col2 = results.reloadCol2;

            test.equal(soloData._id, results.insertOne);
            test.deepEqual(soloData, col1[3]);

            test.deepEqual(['docH', 'docI'], results.insertMultiple);
            test.equal(5, col2.length);
            test.deepEqual(multiData[0], col2[0]);
            test.deepEqual(multiData[1], col2[1]);

            next();
        }]
    });
};

exports.testRemoveOne = function(test) {

    test.expect(7);

    na.runTest(test, {
        useId: [function(next) {
            ezMongo.removeOne('col2', 'docX', next);
        }],
        useObj: [function(next) {
            ezMongo.removeOne('col2', {char: 'Z'}, next);
        }],
        reloadCol2: ['useId', 'useObj', function(next) {
            ezMongo.findMultiple('col2', {}, null, [['_id','asc']], next);
        }],
        manyChoices: ['reloadCol2', function(next) {
            ezMongo.removeOne('col1', {num: {$gte: 2}}, next);
        }],
        reloadCol1: ['manyChoices', function(next) {
            ezMongo.findMultiple('col1', {}, null, [['_id','asc']], next);
        }],
        assertResults: ['reloadCol2','reloadCol1',function(next, results) {

            var col1 = results.reloadCol1;
            var col2 = results.reloadCol2;

            test.equals(1, results.useId);
            test.equals(1, results.useObj);
            test.equals(1, results.manyChoices);

            test.equals(1, col2.length);
            test.equals('docY', col2[0] && col2[0]._id);

            test.equals(2, col1.length);
            test.ok(col1.some(function(doc) {
                return doc._id === 'docA';
            }));

            next();
        }]
    });
};

exports.testRemoveMultiple = function(test) {

    test.expect(6);

    na.runTest(test, {
        useIds: [function(next) {
            ezMongo.removeMultiple('col1', ['docA','docC'], next);
        }],
        reloadCol1: ['useIds', function(next) {
            ezMongo.findMultiple('col1', {}, null, [['_id','asc']], next);
        }],
        useObj: [function(next) {
            ezMongo.removeMultiple('col2', {num: {$lte: 90}}, next);
        }],
        reloadCol2: ['useObj', function(next) {
            ezMongo.findMultiple('col2', {}, null, [['_id','asc']], next);
        }],
        assertResults: ['reloadCol1','reloadCol2',function(next, results) {

            var col1 = results.reloadCol1;
            var col2 = results.reloadCol2;

            test.equals(2, results.useIds);
            test.equals(2, results.useObj);

            test.equals(1, col1.length);
            test.equals('docB', col1[0] && col1[0]._id);

            test.equals(1, col2.length);
            test.equals('docZ', col2[0] && col2[0]._id);

            next();
        }]
    });
};

exports.testCount = function(test) {

    test.expect(4);

    na.runTest(test, {
        noFilter: [next => {
            ezMongo.count('col1', next);
        }],
        singleId: [next => {
            ezMongo.count('col1', 'docA', next);
        }],
        manyIds: [function(next) {
            ezMongo.count('col1', ['docA','docB'], next);
        }],
        obj: [function(next) {
            ezMongo.count('col1', {num: {$gte: 2}}, next);
        }],
        assertResults: ['noFilter','singleId','manyIds','obj',function(next, results) {

            test.equal(3, results.noFilter);
            test.equal(1, results.singleId);
            test.equal(2, results.manyIds);
            test.equal(2, results.obj);

            next();
        }]
    });
};