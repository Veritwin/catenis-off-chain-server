/**
 * Created by claudio on 2019-11-19
 */

// Module variables
//

// References to external code
//
// Internal node modules
import util from 'util';
// Third-party node modules
import config from 'config';
import mongodb from 'mongodb';
import Future from 'fibers/future';

// References code in other (Catenis Off-Chain Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {wrapAsync} from './Util';

// Config entries
const dbConfig = config.get('database');

// Configuration settings
const cfgSettings = {
    mongo: {
        host: dbConfig.get('mongo.host'),
        port: dbConfig.get('mongo.port'),
        dbName: dbConfig.get('mongo.dbName')
    }
};


// Definition of function classes
//

// Database function class
//
// Constructor arguments:
//  mongoUrl [String] - URL of MongoDB server
//  collDescriptor [Object] - Object with map of collection description per collection name
export function Database(mongoUrl, collDescriptor) {
    this.mongoUrl = mongoUrl;

    try {
        // Try to connect to mongoDB server
        this.mongoClient = wrapAsync(mongodb.MongoClient.connect)(this.mongoUrl, {
            useUnifiedTopology: true
        });
    }
    catch (err) {
        CtnOCSvr.logger.ERROR('Failure to connect to MongoDB server (url: %s).', this.mongoUrl, err);
        throw err;
    }

    this.mongoDb = this.mongoClient.db();

    // Set up database collections
    initCollections.call(this, collDescriptor);
}


// Public Database object methods
//

Database.prototype.close = function () {
    this.mongoClient.close();
};


// Module functions used to simulate private Database object methods
//  NOTE: these functions need to be bound to a Database object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

function initCollections(collDescriptor) {
    const initFuncs = [];
    this.collection = {};

    Object.keys(collDescriptor).forEach((collName) => {
        const collDescription = collDescriptor[collName];
        const mongoCollection = this.mongoDb.collection(collName);

        this.collection[collName] = {
            _mongo: mongoCollection,
            find: function () {
                const cursor = mongoCollection.find.apply(mongoCollection, arguments);
                const futFunc = Future.wrap(cursor.toArray);

                return futFunc.apply(cursor).wait();
            },
            findOne: wrapAsync(mongoCollection.findOne, mongoCollection),
            insertOne: wrapAsync(mongoCollection.insertOne, mongoCollection),
            insertMany: wrapAsync(mongoCollection.insertMany, mongoCollection),
            updateOne: wrapAsync(mongoCollection.updateOne, mongoCollection),
            updateMany: wrapAsync(mongoCollection.updateMany, mongoCollection),
            remove: wrapAsync(mongoCollection.remove, mongoCollection)
        };

        let createIndex;
        let dropIndex;

        // Create indices for the collection
        if ('indices' in collDescription) {
            collDescription.indices.forEach((index) => {
                let args = [index.fields];

                if ('opts' in index) {
                    args.push(index.opts);
                }

                let tryAgain;

                if (!createIndex) {
                    createIndex = wrapAsync(mongoCollection.createIndex, mongoCollection);
                }

                do {
                    tryAgain = false;

                    try {
                        createIndex.apply(mongoCollection, args);
                    }
                    catch (err) {
                        let matchResult;

                        if (err.name === 'MongoError' && (matchResult = err.message.match(/^Index with name: ([^\s].+) already exists with different options$/))) {
                            // Index already exists with a different configuration.
                            //  So delete it and re-create it
                            const indexName = matchResult[1];
                            CtnOCSvr.logger.INFO('Fixing index \'%s\' of %s collection', indexName, collName);

                            if (!dropIndex) {
                                dropIndex = wrapAsync(mongoCollection.dropIndex, mongoCollection);
                            }

                            dropIndex(indexName);
                            tryAgain = true;
                        }
                    }
                }
                while (tryAgain);
            });
        }

        // Save initialization function to be called later
        if ('initFunc' in collDescription) {
            initFuncs.push(collDescription.initFunc);
        }
    });

    // Initialize the collections as needed
    initFuncs.forEach((initFunc) => {
        initFunc.call(this);
    });
}

function initApplicationCollection() {
    // Make sure that Application collection has ONE and only one doc/rec
    const docApps = this.collection.Application.find({}, {projection: {_id: 1}});

    if (docApps.length === 0) {
        // No doc/rec defined yet. Create new doc/rec with default settings
        this.collection.Application.insertOne({
            lastIpfsRepoRootCidsRetrievalDate: null
        });
    }
    else if (docApps.length > 1) {
        // More than one doc/rec found. Delete all docs/recs except the first one
        this.collection.Application.remove({_id: {$ne: docApps[0]._id}});
    }
}


// Database function class (public) methods
//

Database.initialize = function() {
    CtnOCSvr.logger.TRACE('DB initialization');
    const collDescriptor = {
        Application: {
            initFunc: initApplicationCollection
        },
        IpfsRepoScan: {
            indices: [{
                fields: {
                    ctnNodeIdx: 1,
                    repoSubtype: 1
                },
                opts: {
                    unique: true,
                    background: true,
                    w: 1
                }
            }]
        },
        RetrievedOffChainMsgData: {
            indices: [{
                fields: {
                    ctnNodeIdx: 1,
                    dataType: 1,
                    savedDate: 1,
                    savedMicroseconds: 1
                },
                opts: {
                    unique: true,
                    background: true,
                    w: 1
                }
            }, {
                fields: {
                    cid: 1
                },
                opts: {
                    background: true,
                    w: 1
                }
            }, {
                fields: {
                    dataType: 1
                },
                opts: {
                    background: true,
                    w: 1
                }
            }, {
                fields: {
                    savedDate: 1
                },
                opts: {
                    background: true,
                    w: 1
                }
            }, {
                fields: {
                    retrievedDate: 1
                },
                opts: {
                    background: true,
                    w: 1
                }
            }]
        }
    };

    const mongoUrl = process.env.MONGO_URL ? process.env.MONGO_URL : util.format('mongodb://%s%s/%s', cfgSettings.mongo.host, cfgSettings.mongo.port ? ':' + cfgSettings.mongo.port : '', cfgSettings.mongo.dbName);

    CtnOCSvr.db = new Database(mongoUrl, collDescriptor);
};


// Database function class (public) properties
//

/*Database.prop = {};*/


// Definition of module (private) functions
//

/*function module_func() {
}*/


// Module code
//

// Lock function class
Object.freeze(Database);
