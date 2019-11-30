/**
 * Created by claudio on 2019-11-21
 */

// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules
import config from 'config';
import Future from 'fibers/future';
import moment from 'moment';
import async from 'async';
import mongodb from 'mongodb';

// References code in other (Catenis Name Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {CriticalSection} from './CriticalSection';
import {formatNumber} from './Util';

// Config entries
const ipfsRepoConfig = config.get('ipfsRepo');

// Configuration settings
const cfgSettings = {
    rootDir: ipfsRepoConfig.get('rootDir'),
    saveRootCidInterval: ipfsRepoConfig.get('saveRootCidInterval'),
    retrieveRootCidsInterval: ipfsRepoConfig.get('retrieveRootCidsInterval'),
    retrieveRootCidsWaitTimeout: ipfsRepoConfig.get('retrieveRootCidsWaitTimeout'),
    cnsTimeDelay: ipfsRepoConfig.get('cnsTimeDelay')
};


// Definition of function classes
//

// IpfsRepo function class
export function IpfsRepo(ipfsClient) {
    this.ipfsClient = ipfsClient;

    // Critical section object used to serialize save data requests
    this.saveCS = new CriticalSection();

    try {
        initRootCid.call(this);
    }
    catch (err) {
        CtnOCSvr.logger.ERROR('Error initializing IPFS repository root CID.', err);
        throw new Error('Error initializing IPFS repository root CID');
    }

    this.savingRootCid = false;
    this.retrievingRootCids = false;
    this.boundRetrieveOffChainMsgData = retrieveOffChainMsgData.bind(this);
    this.futTurnAutomationOff = undefined;
    this.automationOn = false;

    if (!CtnOCSvr.app.isTest) {
        this.turnAutomationOn();
    }
    else {
        // Running tests. Do not turn automation on but give access to internal
        //  methods used by the automation instead
        this.boundSaveRootCid = saveRootCid.bind(this);
        this.boundRetrieveRootCids = retrieveRootCids.bind(this);
        this.boundScanRepoPath = scanRepoPath.bind(this);
    }
}


// Public IpfsRepo object methods
//

IpfsRepo.prototype.turnAutomationOn = function () {
    if (!this.automationOn) {
        // Set recurring timer to save IPFS repository root CID onto CNS
        saveRootCid.call(this);
        this.saveRootCidInterval = setInterval(saveRootCid.bind(this), cfgSettings.saveRootCidInterval);

        // Set recurring timer to retrieve updated IPFS repository root CIDs from CNS
        this.retrieveRootCidsWaitTimeout = setTimeout(() => {
            this.retrieveRootCidsWaitTimeout = undefined;
            retrieveRootCids.call(this);
            this.retrieveRootCidsInterval = setInterval(retrieveRootCids.bind(this), cfgSettings.retrieveRootCidsInterval);
        }, cfgSettings.retrieveRootCidsWaitTimeout);

        // Indicate that IPFS repository automation is on
        this.automationOn = true;
        CtnOCSvr.logger.TRACE('IPFS repo automation turned on');
        CtnOCSvr.app.setIpfsRepoAutomationOn();
    }
};

IpfsRepo.prototype.turnAutomationOff = function () {
    if (this.automationOn) {
        // Stop recurring timers
        clearInterval(this.saveRootCidInterval);
        this.saveRootCidInterval = undefined;

        if (this.retrieveRootCidsInterval) {
            clearInterval(this.retrieveRootCidsInterval);
            this.retrieveRootCidsInterval = undefined;
        }
        else {
            clearTimeout(this.retrieveRootCidsWaitTimeout);
            this.retrieveRootCidsWaitTimeout = undefined;
        }

        // Now give it a chance to finish any pending processing
        if (this.savingRootCid) {
            // Already saving root CID. Wait for it to finish
            this.futTurnAutomationOff = new Future();

            this.futTurnAutomationOff.wait();
            this.futTurnAutomationOff = undefined;
        }

        if (this.retrievingRootCids) {
            // Already retrieving root CIDs. Wait for it to finish
            this.futTurnAutomationOff = new Future();

            this.futTurnAutomationOff.wait();
            this.futTurnAutomationOff = undefined;
        }

        saveRootCid.call(this, (err) => {
            if (err) {
                CtnOCSvr.logger.ERROR('Error while saving IPFS repository root CID onto CNS (during automation turnoff).', err);
            }

            retrieveRootCids.call(this, (err) => {
                if (err) {
                    CtnOCSvr.logger.ERROR('Error while retrieving updated IPFS repository root CIDs (during automation turnoff).', err);
                }

                // Indicate that automation is off
                this.automationOn = false;
                CtnOCSvr.logger.TRACE('IPFS repo automation turned off');
                CtnOCSvr.app.setIpfsRepoAutomationOff();
            });
        });
    }
};

IpfsRepo.prototype.saveOffChainMsgData = function (data, dataType, refDate) {
    // Execute code in critical section to serialize calls
    this.saveCS.execute(() => {
        const mtRefDate = moment(refDate).utc();

        if (!mtRefDate.isValid()) {
            throw new TypeError('saveOffChainMsgData: invalid `refDate` argument');
        }

        // Build path according to reference date
        const basePath = cfgSettings.rootDir + IpfsRepo.repoSubtype.offChainMsgData.subDir
            + mtRefDate.format(IpfsRepo.repoSubtype.offChainMsgData.pathFormat) + dataType.subDir + '/' + dataType.filenamePrefix
            + formatNumber(millisecondsInMinute(mtRefDate), 5);

        // Make sure that filename does not yet exists
        let microSecs = 0;
        let path;
        let rootStat;

        do {
            path = basePath + formatNumber(microSecs++, 3);
            rootStat = undefined;

            try {
                rootStat = this.ipfsClient.filesStat(path, {hash: true}, false);
            }
            catch (err) {
                if (err._ipfsError instanceof Error) {
                    // IPFS client error
                    if (err._ipfsError.message !== 'file does not exist') {
                        // An error other than one that indicates that path does not exist.
                        //  Log error and rethrow it
                        CtnOCSvr.logger.DEBUG(err.message, err._ipfsError);
                        throw err;
                    }
                }
                else {
                    // Any other error. Just rethrow it
                    throw err;
                }
            }
        }
        while (rootStat && microSecs < 1000);

        if (rootStat && microSecs > 1000) {
            // Maximum number of files with the same timestamp exceeded. Throw error
            throw new Error('Maximum number of files with the same timestamp exceeded');
        }

        // Write to IPFS
        this.ipfsClient.filesWrite(path, data, {
            create: true,
            parents: true
        });

        // Retrieve updated repository root CID
        this.rootCid = this.ipfsClient.filesStat(cfgSettings.rootDir, {hash: true}).hash;
    });
};

IpfsRepo.prototype.listRetrievedOffChainMsgData = function (retrievedAfter, limit, skip) {
    const query = {};
    const options = {
        projection: {
            cid: 1,
            data: 1,
            dataType: 1,
            savedDate: 1,
            retrievedDate: 1
        },
        sort: [
            ['retrievedDate', 1],
            ['savedDate', 1]
        ]
    };

    if (retrievedAfter) {
        query.retrievedDate = {$gt: retrievedAfter};
    }

    if (limit) {
        options.limit = limit + 1;
    }

    if (skip) {
        options.skip = skip;
    }

    const retDocs = CtnOCSvr.db.collection.RetrievedOffChainMsgData.find(query, options);

    if (retDocs.length > 0) {
        const result = {
            dataItems: undefined,
            hasMore: false
        };

        if (limit && retDocs.length > limit) {
            result.hasMore = true;
            retDocs.pop();
        }

        result.dataItems = retDocs.map(doc => {
            return {
                cid: doc.cid,
                data: doc.data.buffer.toString('base64'),
                dataType: doc.dataType,
                savedDate: doc.savedDate,
                retrievedDate: doc.retrievedDate
            };
        });

        return result;
    }
};


// Module functions used to simulate private IpfsRepo object methods
//  NOTE: these functions need to be bound to a IpfsRepo object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

function initRootCid() {
    this.rootCid = undefined;
    this.lastSavedRootCid = undefined;

    // Retrieve repository root CID last saved to CNS
    const data = CtnOCSvr.cns.getIpfsRepoRootCid();

    if (data) {
        this.lastSavedRootCid = data.cid;
    }

    // Try to retrieve repository root CID from IPFS node
    let rootStat;

    try {
        rootStat = this.ipfsClient.filesStat(cfgSettings.rootDir, {hash: true}, false);
    }
    catch (err) {
        if (err._ipfsError instanceof Error) {
            // IPFS client error
            if (err._ipfsError.message !== 'file does not exist') {
                // An error other than one that indicates that path does not exist.
                //  Log error and rethrow it
                CtnOCSvr.logger.DEBUG(err.message, err._ipfsError);
                throw err;
            }
        }
        else {
            // Any other error. Just rethrow it
            throw err;
        }
    }

    if (rootStat) {
        this.rootCid = rootStat.hash;
    }
    else if (this.lastSavedRootCid) {
        // Repository root CID not found in IPFS node. Set it to last saved value
        this.ipfsClient.filesCp('ipfs/' + this.lastSavedRootCid, cfgSettings.rootDir);
        this.rootCid = this.lastSavedRootCid;
    }
    else {
        // Repository root CID not found in IPFS node, and no value is saved to CNS.
        //  Define new root
        this.ipfsClient.filesMkdir(cfgSettings.rootDir);
        this.rootCid = this.ipfsClient.filesStat(cfgSettings.rootDir, {hash: true}).hash;
    }
}

function saveRootCid(callback) {
    if (!this.savingRootCid) {
        CtnOCSvr.logger.TRACE('Executing procedure to save updated IPFS repository root CID');
        this.savingRootCid = true;

        // Make sure that code runs in its own fiber
        Future.task(() => {
            // Check if root CID needs to be saved
            if (this.rootCid !== this.lastSavedRootCid) {
                CtnOCSvr.logger.TRACE('About to save updated IPFS repository root CID');
                const rootCid = this.rootCid;

                // Pin root CID (and all its subdirectories) before saving it
                if (this.lastSavedRootCid) {
                    this.ipfsClient.pinUpdate(this.lastSavedRootCid, rootCid);
                }
                else {
                    this.ipfsClient.pinAdd(rootCid);
                }

                // Now, save it onto CNS
                CtnOCSvr.cns.setIpfsRepoRootCid(rootCid);
                this.lastSavedRootCid = rootCid;
            }
        }).resolve((err) => {
            this.savingRootCid = false;

            if (typeof callback === 'function') {
                callback(err);
            }
            else {
                if (err) {
                    CtnOCSvr.logger.ERROR('Error while saving IPFS repository root CID onto CNS.', err);
                }

                if (this.futTurnAutomationOff) {
                    this.futTurnAutomationOff.return();
                }
            }
        });
    }
}

function retrieveRootCids(callback) {
    if (!this.retrievingRootCids) {
        CtnOCSvr.logger.TRACE('Executing procedure to retrieve root CID of IPFS repositories');
        this.retrievingRootCids = true;

        // Make sure that code runs in its own fiber
        Future.task(() => {
            const refDate = new Date();

            // Retrieve updated IPFS repository root CIDs
            let updatedSince;

            if (CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate) {
                updatedSince = moment(CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate).subtract(cfgSettings.cnsTimeDelay, 'ms').toDate();
            }

            const ipfsRepoRootCids = CtnOCSvr.cns.getAllIpfsRepoRootCids(updatedSince);

            if (ipfsRepoRootCids) {
                CtnOCSvr.logger.TRACE('About to retrieve off-chain message data from updated IPFS repositories');
                // Add reference date to each returned repo root
                Object.values(ipfsRepoRootCids).forEach(repoRoot => repoRoot.refDate = refDate);

                // Retrieve off-chain message data from IPFS repository of each Catenis node
                const fut = new Future();

                async.eachOf(ipfsRepoRootCids, this.boundRetrieveOffChainMsgData, fut.resolver());

                fut.wait();
            }

            // Update IPFS repository root CIDs retrieval date
            CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate = refDate;
        }).resolve((err) => {
            this.retrievingRootCids = false;

            if (typeof callback === 'function') {
                callback(err);
            }
            else {
                if (err) {
                    CtnOCSvr.logger.ERROR('Error while retrieving updated IPFS repository root CIDs.', err);
                }

                if (this.futTurnAutomationOff) {
                    this.futTurnAutomationOff.return();
                }
            }
        });
    }
}

function retrieveOffChainMsgData(repoRoot, ctnNodeIdx, callback) {
    try {
        if (typeof ctnNodeIdx !== 'number') {
            ctnNodeIdx = Number.parseInt(ctnNodeIdx);
        }

        const docIpfsRepoScan = CtnOCSvr.db.collection.IpfsRepoScan.findOne({
            ctnNodeIdx: ctnNodeIdx,
            repoSubtype: IpfsRepo.repoSubtype.offChainMsgData.name
        }, {
            projection: {
                _id: 1,
                lastScannedPath: 1,
                lastScannedFiles: 1
            }
        });

        const lastScannedPath = docIpfsRepoScan ? docIpfsRepoScan.lastScannedPath : undefined;
        const scannedPaths = scanRepoPath.call(this, IpfsRepo.repoSubtype.offChainMsgData, repoRoot.cid, lastScannedPath);

        if (scannedPaths.length > 0) {
            const subtypeRootPath = repoRoot.cid + IpfsRepo.repoSubtype.offChainMsgData.subDir;
            const lastScannedOffChainMsgEnvelope = docIpfsRepoScan ? docIpfsRepoScan.lastScannedFiles.offChainMsgData.envelope : null;
            const lastScannedOffChainMsgReceipt = docIpfsRepoScan ? docIpfsRepoScan.lastScannedFiles.offChainMsgData.receipt : null;
            let lastMsgEnvelope;
            let lastMsgReceipt;
            const docsRetrievedOffChainMsgDataToInsert = [];

            // noinspection DuplicatedCode
            async.eachOf(scannedPaths, (path, idx, cb1) => {
                let pathParts = path.substring(subtypeRootPath.length).split('/');
                pathParts.shift();
                pathParts = pathParts.map((part, idx) => {
                    let val = Number.parseInt(part);

                    // Make sure that month index is converted to zero-base
                    return idx === 1 ? val - 1 : val;
                });

                async.parallel([
                    (cb2) => {
                        // Scan off-chain message envelope files in path
                        lastMsgEnvelope = null;
                        let fileEntries;

                        try {
                            fileEntries = this.ipfsClient.ls(path + IpfsRepo.offChainMsgDataType.msgEnvelope.subDir, false);
                        }
                        catch (err) {
                            if (err._ipfsError instanceof Error) {
                                // IPFS client error
                                if (!/^no link named ".+" under /.test(err._ipfsError.message)) {
                                    // An error other than one that indicates that path does not exist.
                                    //  Log error and rethrow it
                                    CtnOCSvr.logger.DEBUG(err.message, err._ipfsError);
                                    process.nextTick(cb2, err);
                                }
                            }
                            else {
                                // Any other error. Just rethrow it
                                process.nextTick(cb2, err);
                            }
                        }

                        // noinspection DuplicatedCode
                        if (fileEntries) {
                            if (idx === 0 && lastScannedOffChainMsgEnvelope) {
                                fileEntries = fileEntries.filter(fileEntry => fileEntry.name > lastScannedOffChainMsgEnvelope);
                            }

                            const maxFileEntriesIdx = fileEntries.length - 1;

                            async.eachOf(fileEntries, (fileEntry, idx, cb3) => {
                                if (idx === maxFileEntriesIdx) {
                                    lastMsgEnvelope = fileEntry.name;
                                }

                                // Retrieve off-chain message envelope contents
                                this.ipfsClient.cat(fileEntry.hash, (err, msgEnvelopeData) => {
                                    if (err) {
                                        cb3(err);
                                    }
                                    else {
                                        // Save retrieved off-chain message envelope
                                        docsRetrievedOffChainMsgDataToInsert.push({
                                            cid: fileEntry.hash,
                                            data: new mongodb.Binary(msgEnvelopeData),
                                            dataType: IpfsRepo.offChainMsgDataType.msgEnvelope.name,
                                            savedDate: dateFromPath(pathParts, IpfsRepo.offChainMsgDataType.msgEnvelope.filenamePrefix, fileEntry.name),
                                            retrievedDate: repoRoot.refDate
                                        });

                                        cb3();
                                    }
                                });
                            }, cb2);
                        }
                        else {
                            process.nextTick(cb2);
                        }
                    },
                    (cb2) => {
                        // Scan off-chain message receipt files in path
                        lastMsgReceipt = null;
                        let fileEntries;

                        try {
                            fileEntries = this.ipfsClient.ls(path + IpfsRepo.offChainMsgDataType.msgReceipt.subDir, false);
                        }
                        catch (err) {
                            if (err._ipfsError instanceof Error) {
                                // IPFS client error
                                if (!/^no link named ".+" under /.test(err._ipfsError.message)) {
                                    // An error other than one that indicates that path does not exist.
                                    //  Log error and rethrow it
                                    CtnOCSvr.logger.DEBUG(err.message, err._ipfsError);
                                    cb2(err);
                                }
                            }
                            else {
                                // Any other error. Just rethrow it
                                cb2(err);
                            }
                        }

                        // noinspection DuplicatedCode
                        if (fileEntries) {
                            if (idx === 0 && lastScannedOffChainMsgReceipt) {
                                fileEntries = fileEntries.filter(fileEntry => fileEntry.name > lastScannedOffChainMsgReceipt);
                            }

                            const maxFileEntriesIdx = fileEntries.length - 1;

                            async.eachOf(fileEntries, (fileEntry, idx, cb3) => {
                                if (idx === maxFileEntriesIdx) {
                                    lastMsgReceipt = fileEntry.name;
                                }

                                // Retrieve off-chain message receipt contents
                                this.ipfsClient.cat(fileEntry.hash, (err, msgReceiptData) => {
                                    if (err) {
                                        cb3(err);
                                    }
                                    else {
                                        // Save retrieved off-chain message receipt
                                        docsRetrievedOffChainMsgDataToInsert.push({
                                            cid: fileEntry.hash,
                                            data: new mongodb.Binary(msgReceiptData),
                                            dataType: IpfsRepo.offChainMsgDataType.msgReceipt.name,
                                            savedDate: dateFromPath(pathParts, IpfsRepo.offChainMsgDataType.msgReceipt.filenamePrefix, fileEntry.name),
                                            retrievedDate: repoRoot.refDate
                                        });

                                        cb3();
                                    }
                                });
                            }, cb2);
                        }
                        else {
                            process.nextTick(cb2);
                        }
                    }
                ], cb1);
            }, (err) => {
                if (err) {
                    callback(err);
                }
                else {
                    async.parallel([
                        (cb1) => {
                            if (docsRetrievedOffChainMsgDataToInsert.length > 0) {
                                CtnOCSvr.db.collection.RetrievedOffChainMsgData.insertMany(docsRetrievedOffChainMsgDataToInsert, cb1);
                            }
                            else {
                                cb1();
                            }
                        },
                        (cb1) => {
                            // Check if IPFS repo scan info needs to be saved/updated
                            if (!lastScannedPath || scannedPaths.length > 1 || lastMsgEnvelope || lastMsgReceipt) {
                                if (!docIpfsRepoScan) {
                                    // Insert new IPFS repo scan database doc
                                    CtnOCSvr.db.collection.IpfsRepoScan.insertOne({
                                        ctnNodeIdx: ctnNodeIdx,
                                        repoSubtype: IpfsRepo.repoSubtype.offChainMsgData.name,
                                        lastScannedPath: scannedPaths[scannedPaths.length - 1].substring(subtypeRootPath.length),
                                        lastScannedFiles: {
                                            offChainMsgData: {
                                                envelope: lastMsgEnvelope,
                                                receipt: lastMsgReceipt
                                            }
                                        }
                                    }, cb1);
                                }
                                else {
                                    // Update IPFS repo scan database doc
                                    const fieldsToUpdate = {
                                        lastScannedPath: scannedPaths[scannedPaths.length - 1].substring(subtypeRootPath.length)
                                    };

                                    if (lastMsgEnvelope !== lastScannedOffChainMsgEnvelope) {
                                        fieldsToUpdate['lastScannedFiles.offChainMsgData.envelope'] = lastMsgEnvelope;
                                    }

                                    if (lastMsgReceipt !== lastScannedOffChainMsgReceipt) {
                                        fieldsToUpdate['lastScannedFiles.offChainMsgData.receipt'] = lastMsgReceipt;
                                    }

                                    CtnOCSvr.db.collection.IpfsRepoScan.updateOne({
                                        _id: docIpfsRepoScan._id
                                    }, {
                                        $set: fieldsToUpdate
                                    }, cb1);
                                }
                            }
                            else {
                                cb1();
                            }
                        }
                    ], callback);
                }
            });
        }
        else {
            process.nextTick(callback);
        }
    }
    catch (err) {
        process.nextTick(callback, err);
    }
}

function scanRepoPath(repoSubtype, rootCid, lastScannedPath) {
    const subtypeRootPath = rootCid + repoSubtype.subDir;
    let lastPathLevels = [];

    if (lastScannedPath) {
        lastPathLevels = lastScannedPath.split('/');
        lastPathLevels.shift();

        // Add root path to last scanned path
        lastScannedPath = subtypeRootPath + lastScannedPath;
    }

    const scannedPaths = [];

    const scan = (path, level) => {
        if (level > repoSubtype.pathDepth) {
            scannedPaths.push(path);
        }
        else {
            let dirEntries = this.ipfsClient.ls(path, false);

            if (lastScannedPath && lastScannedPath.startsWith(path)) {
                // Accept only dirs that are newer than last level dir
                dirEntries = dirEntries.filter(dirEntry => dirEntry.name >= lastPathLevels[level - 1]);
            }

            dirEntries.forEach(dirEntry => scan(path + '/' + dirEntry.name, level + 1));
        }
    };
    
    try {
        scan(subtypeRootPath, 1);
    }
    catch (err) {
        if (err._ipfsError instanceof Error) {
            // IPFS client error
            if (!/^no link named ".+" under /.test(err._ipfsError.message)) {
                // An error other than one that indicates that path does not exist.
                //  Log error and rethrow it
                CtnOCSvr.logger.DEBUG(err.message, err._ipfsError);
                throw err;
            }
        }
        else {
            // Any other error. Just rethrow it
            throw err;
        }
    }
    
    return scannedPaths;
}


// IpfsRepo function class (public) methods
//

IpfsRepo.initialize = function () {
    CtnOCSvr.logger.TRACE('IpfsRepo initialization');
    CtnOCSvr.ipfsRepo = new IpfsRepo(CtnOCSvr.ipfsClient);
};


// IpfsRepo function class (public) properties
//

IpfsRepo.repoSubtype = Object.freeze({
    offChainMsgData: Object.freeze({
        name: 'off-chain-msg-data',
        description: 'Portion of the IPFS repository used to store data related to Catenis off-chain messages',
        subDir: '/msgs',
        pathDepth: 5,
        pathFormat: '/YYYY/MM/DD/HH/mm'
    })
});

IpfsRepo.offChainMsgDataType = Object.freeze({
    msgEnvelope: Object.freeze({
        name: 'msg-envelope',
        description: 'Off-Chain message envelope',
        subDir: '/msg',
        filenamePrefix: 'msg-'
    }),
    msgReceipt: Object.freeze({
        name: 'msg-receipt',
        description: 'Off-Chain message receipt',
        subDir: '/rcpt',
        filenamePrefix: 'rcpt-'
    })
});


// Definition of module (private) functions
//

function millisecondsInMinute(mt) {
    return mt.second() * 1000 + mt.millisecond();
}

function dateFromPath(pathParts, filePrefix, filename) {
    return moment.utc(pathParts).add(Number.parseInt(filename.substring(filePrefix.length, filename.length - 3)), 'ms').toDate();
}


// Module code
//
