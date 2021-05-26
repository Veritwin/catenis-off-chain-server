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
import moment from 'moment';
import async from 'async';
import mongodb from 'mongodb';
import ctnOffChainLib from 'catenis-off-chain-lib';

// References code in other (Catenis Name Server) modules
import {CtnOCSvr} from './CtnOffChainSvr.js';
import {CriticalSection} from './CriticalSection.js';
import {formatNumber} from './Util.js';
import {ctnNode} from './CtnNode.js';

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
    
    // Critical section object used to serialize retrieval of off-chain
    //  message data from local Catenis node's IPFS repository
    this.retrieveLocalOCMsgDataCS = new CriticalSection();

    this.promiseInitRootCid = initRootCid.call(this);

    this.savingRootCid = false;
    this.retrievingRootCids = false;
    this.boundRetrieveOffChainMsgData = retrieveOffChainMsgData.bind(this);
    this.futTurnAutomationOff = undefined;
    this.automationOn = false;

    this.boundRetrieveOffChainMsgDataImmediately = retrieveOffChainMsgDataImmediately.bind(this);
    this.futEndImmediateRetrieval  = undefined;
    this.doingImmediateOCMsgDataRetrieval = false;
    this.retrieveOCMsgDataImmediatedlyAgain = false;

    if (CtnOCSvr.app.isTest) {
        // Running tests. Do not turn automation on but give access to internal
        //  methods used by the automation instead
        this.boundSaveRootCid = saveRootCid.bind(this);
        this.boundRetrieveRootCids = retrieveRootCids.bind(this);
        this.boundScanRepoPath = scanRepoPath.bind(this);
    }
}


// Public IpfsRepo object methods
//

IpfsRepo.prototype.finalizeInitialization = async function () {
    try {
        await this.promiseInitRootCid;
    }
    catch (err) {
        CtnOCSvr.logger.ERROR('Error initializing IPFS repository root CID.', err);
        throw new Error('Error initializing IPFS repository root CID');
    }

    if (!CtnOCSvr.app.isTest) {
        this.turnAutomationOn();
    }
};

IpfsRepo.prototype.turnAutomationOn = function () {
    if (!this.automationOn) {
        // Set recurring timer to save IPFS repository root CID onto CNS
        saveRootCid.call(this).catch(() => undefined);
        this.saveRootCidInterval = setInterval(saveRootCid.bind(this), cfgSettings.saveRootCidInterval);

        // Set recurring timer to retrieve updated IPFS repository root CIDs from CNS
        this.retrieveRootCidsWaitTimeout = setTimeout(() => {
            this.retrieveRootCidsWaitTimeout = undefined;
            retrieveRootCids.call(this).catch(() => undefined);
            this.retrieveRootCidsInterval = setInterval(retrieveRootCids.bind(this), cfgSettings.retrieveRootCidsInterval);
        }, cfgSettings.retrieveRootCidsWaitTimeout);

        // Indicate that IPFS repository automation is on
        this.automationOn = true;
        CtnOCSvr.logger.TRACE('IPFS repo automation turned on');
        CtnOCSvr.app.setIpfsRepoAutomationOn();
    }
};

IpfsRepo.prototype.turnAutomationOff = async function () {
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
            await new Promise(resolve => this.futTurnAutomationOff = {resolve});

            this.futTurnAutomationOff = undefined;
        }

        if (this.retrievingRootCids) {
            // Already retrieving root CIDs. Wait for it to finish
            await new Promise(resolve => this.futTurnAutomationOff = {resolve});

            this.futTurnAutomationOff = undefined;
        }

        if (this.doingImmediateOCMsgDataRetrieval) {
            // Doing immediate retrieval of off-chain message data. Wait for it to finish
            await new Promise(resolve => this.futEndImmediateRetrieval = {resolve});

            this.futEndImmediateRetrieval = undefined;
        }

        // Finalize process (automation turn-off) asynchronously
        saveRootCid.call(this)
        .then(() => {
            return retrieveRootCids.call(this);
        }, (err) => {
            CtnOCSvr.logger.ERROR('Error while saving IPFS repository root CID onto CNS (during automation turnoff).', err);
        })
        .then(() => {
            // Indicate that automation is off
            this.automationOn = false;
            CtnOCSvr.logger.TRACE('IPFS repo automation turned off');
            CtnOCSvr.app.setIpfsRepoAutomationOff();
        }, (err) => {
            CtnOCSvr.logger.ERROR('Error while retrieving updated IPFS repository root CIDs (during automation turnoff).', err);
        });
    }
};

IpfsRepo.prototype.saveOffChainMsgData = async function (data, msgDataRepo, retrieveImmediately = false, refDate) {
    let result;

    // Execute code in critical section to serialize calls
    await this.saveCS.execute(async () => {
        const mtRefDate = moment(refDate).utc();

        if (!mtRefDate.isValid()) {
            throw new TypeError('saveOffChainMsgData: invalid `refDate` argument');
        }

        // Build path according to reference date
        const basePath = cfgSettings.rootDir + IpfsRepo.repoSubtype.offChainMsgData.subDir
            + mtRefDate.format(IpfsRepo.repoSubtype.offChainMsgData.pathFormat) + msgDataRepo.subDir + '/' + msgDataRepo.filenamePrefix
            + formatNumber(millisecondsInMinute(mtRefDate), 5);

        // Make sure that filename does not yet exists
        let microSecs = 0;
        let path;
        let rootStat;

        do {
            path = basePath + formatNumber(microSecs++, 3);
            rootStat = undefined;

            try {
                rootStat = await this.ipfsClient.filesStat(path, {hash: true}, false);
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
        await this.ipfsClient.filesWrite(path, data, {
            create: true,
            parents: true
        });

        result = {
            cid: (await this.ipfsClient.filesStat(path, {hash: true})).cid.toString(),
            savedDate: mtRefDate.toISOString()
        };

        // Store saved off-chain message data (asynchronously)
        CtnOCSvr.db.collection.SavedOffChainMsgData.insertOne({
            cid: result.cid,
            data: new mongodb.Binary(data),
            dataType: msgDataRepo === IpfsRepo.offChainMsgDataRepo.msgEnvelope ? ctnOffChainLib.OffChainData.msgDataType.msgEnvelope.name : ctnOffChainLib.OffChainData.msgDataType.msgReceipt.name,
            savedDate: mtRefDate.toDate(),
            savedMicroseconds: microSecs
        })
        .catch(err => {
            CtnOCSvr.logger.ERROR('Error trying to insert saved off-chain message data onto local database.', err);
        });

        // Retrieve updated repository root CID
        this.rootCid = (await this.ipfsClient.filesStat(cfgSettings.rootDir, {hash: true})).cid.toString();

        if (retrieveImmediately) {
            process.nextTick(this.boundRetrieveOffChainMsgDataImmediately)
        }
    });

    return result;
};

IpfsRepo.prototype.getRetriedOffChainMsgDataByCid = async function (cid, includeSavedOnly = false) {
    let retDoc = await CtnOCSvr.db.collection.RetrievedOffChainMsgData.findOne({cid: cid});

    if (!retDoc && includeSavedOnly) {
        // No off-chain message data with the given CID has been retrieved yet. Try
        //  looking for off-chain message data saved by this Catenis node
        retDoc = await CtnOCSvr.db.collection.SavedOffChainMsgData.findOne({cid: cid});
    }

    if (retDoc) {
        return {
            cid: retDoc.cid,
            data: retDoc.data.buffer.toString('base64'),
            dataType: retDoc.dataType,
            savedDate: retDoc.savedDate,
            retrievedDate: retDoc.retrievedDate
        };
    }
};

IpfsRepo.prototype.listRetrievedOffChainMsgData = async function (retrievedAfter, limit, skip) {
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

    const result = {
        dataItems: [],
        hasMore: false
    };
    const retDocs = await CtnOCSvr.db.collection.RetrievedOffChainMsgData.find(query, options);

    if (retDocs.length > 0) {
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
    }

    return result;
};


// Module functions used to simulate private IpfsRepo object methods
//  NOTE: these functions need to be bound to a IpfsRepo object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

async function initRootCid() {
    this.rootCid = undefined;
    this.lastSavedRootCid = undefined;

    // Retrieve repository root CID last saved to CNS
    const data = await CtnOCSvr.cns.getIpfsRepoRootCid();

    if (data) {
        this.lastSavedRootCid = data.cid;
    }

    // Try to retrieve repository root CID from IPFS node
    let rootStat;

    try {
        rootStat = await this.ipfsClient.filesStat(cfgSettings.rootDir, {hash: true}, false);
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
        this.rootCid = rootStat.cid.toString();
    }
    else if (this.lastSavedRootCid) {
        // Repository root CID not found in IPFS node. Set it to last saved value
        CtnOCSvr.logger.WARN('Repository root directory (/root) not found in IPFS node. Setting it to root CID currently saved to CNS.');
        await this.ipfsClient.filesCp('ipfs/' + this.lastSavedRootCid, cfgSettings.rootDir);
        this.rootCid = this.lastSavedRootCid;
    }
    else {
        // Repository root CID not found in IPFS node, and no value is saved to CNS.
        //  Define new root
        CtnOCSvr.logger.WARN('Repository root directory (/root) not found in IPFS node, and no root CID is currently saved to CNS. Creating a new (empty) root directory.');
        await this.ipfsClient.filesMkdir(cfgSettings.rootDir);
        this.rootCid = this.ipfsClient.filesStat(cfgSettings.rootDir, {hash: true}).cid.toString();
    }
}

async function saveRootCid() {
    if (!this.savingRootCid) {
        CtnOCSvr.logger.TRACE('Executing procedure to save updated IPFS repository root CID');
        this.savingRootCid = true;

        try {
            await (async () => {
                // Check if root CID needs to be saved
                if (this.rootCid !== this.lastSavedRootCid) {
                    CtnOCSvr.logger.TRACE('About to save updated IPFS repository root CID');
                    const rootCid = this.rootCid;

                    // Pin root CID (and all its subdirectories) before saving it
                    if (this.lastSavedRootCid) {
                        try {
                            await this.ipfsClient.pinUpdate(this.lastSavedRootCid, rootCid);
                        }
                        catch (err) {
                            if ((err._ipfsError instanceof Error) && err._ipfsError.message === 'pin is not part of the pinset') {
                                // Previous root CID does not seem to have been pinned.
                                //  So just pin new root CID (instead of updating it)
                                await this.ipfsClient.pinAdd(rootCid);
                            }
                            else {
                                throw err;
                            }
                        }
                    }
                    else {
                        await this.ipfsClient.pinAdd(rootCid);
                    }

                    // Now, save it onto CNS
                    await CtnOCSvr.cns.setIpfsRepoRootCid(rootCid);
                    this.lastSavedRootCid = rootCid;
                }
            })();
        }
        catch (err) {
            CtnOCSvr.logger.ERROR('Error while saving IPFS repository root CID onto CNS.', err);
        }

        this.savingRootCid = false;

        if (this.futTurnAutomationOff) {
            this.futTurnAutomationOff.resolve();
        }
    }
}

async function retrieveRootCids() {
    if (!this.retrievingRootCids) {
        CtnOCSvr.logger.TRACE('Executing procedure to retrieve root CID of IPFS repositories');
        this.retrievingRootCids = true;

        try {
            await (async () => {
                const refDate = new Date();

                // Retrieve updated IPFS repository root CIDs
                let updatedSince;
                const lastIpfsRepoRootCidsRetrievalDate = await CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate;

                if (lastIpfsRepoRootCidsRetrievalDate) {
                    updatedSince = moment(lastIpfsRepoRootCidsRetrievalDate).subtract(cfgSettings.cnsTimeDelay, 'ms').toDate();
                }

                const ipfsRepoRootCids = await CtnOCSvr.cns.getAllIpfsRepoRootCids(updatedSince);

                if (ipfsRepoRootCids) {
                    CtnOCSvr.logger.TRACE('About to retrieve off-chain message data from updated IPFS repositories');
                    CtnOCSvr.logger.DEBUG('>>>>>> [retrieveRootCids] IPFS repo root CIDs updated since %s (last retrieval date: %s)', updatedSince, lastIpfsRepoRootCidsRetrievalDate, ipfsRepoRootCids);
                    // Add reference date to each returned repo root
                    Object.values(ipfsRepoRootCids).forEach(repoRoot => repoRoot.refDate = refDate);

                    // Retrieve off-chain message data from IPFS repository of each Catenis node
                    await async.eachOf(ipfsRepoRootCids, this.boundRetrieveOffChainMsgData);
                }

                // Update IPFS repository root CIDs retrieval date
                CtnOCSvr.app.lastIpfsRepoRootCidsRetrievalDate = refDate;
                await CtnOCSvr.app.promiseSetlastIpfsRepoRootCidsRetrievalDate;
            })();
        }
        catch (err) {
            CtnOCSvr.logger.ERROR('Error while retrieving updated IPFS repository root CIDs.', err);
        }

        this.retrievingRootCids = false;

        if (this.futTurnAutomationOff) {
            this.futTurnAutomationOff.resolve();
        }
    }
}

async function retrieveOffChainMsgDataImmediately() {
    if (!this.doingImmediateOCMsgDataRetrieval) {
        CtnOCSvr.logger.TRACE('Executing procedure to retrieve off-chain message data immediately');
        this.doingImmediateOCMsgDataRetrieval = true;

        // Make sure that code runs in its own fiber
        try {
            await retrieveOffChainMsgData.call(this, {cid: this.rootCid, refDate: new Date()}, ctnNode.index);
        }
        catch (err) {
            CtnOCSvr.logger.ERROR('Error while retrieving off-chain message data immediately.', err);
        }

        this.doingImmediateOCMsgDataRetrieval = false;

        if (this.futEndImmediateRetrieval) {
            this.retrieveOCMsgDataImmediatedlyAgain = false;

            this.futEndImmediateRetrieval.resolve();
        }
        else if (this.retrieveOCMsgDataImmediatedlyAgain) {
            this.retrieveOCMsgDataImmediatedlyAgain = false;

            process.nextTick(this.boundRetrieveOffChainMsgDataImmediately);
        }
    }
    else {
        this.retrieveOCMsgDataImmediatedlyAgain = true;
    }
}

async function retrieveOffChainMsgData(repoRoot, ctnNodeIdx) {
    if (typeof ctnNodeIdx !== 'number') {
        ctnNodeIdx = Number.parseInt(ctnNodeIdx);
    }

    const doRetrieval = async () => {
        const docIpfsRepoScan = await CtnOCSvr.db.collection.IpfsRepoScan.findOne({
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
        const scannedPaths = await scanRepoPath.call(this, IpfsRepo.repoSubtype.offChainMsgData, repoRoot.cid, lastScannedPath);
        CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Paths to scan', {
            repoRoot,
            ctnNodeIdx,
            lastScannedPath,
            lastScannedFiles: docIpfsRepoScan ? docIpfsRepoScan.lastScannedFiles : undefined,
            scannedPaths
        });

        if (scannedPaths.length > 0) {
            const subtypeRootPath = repoRoot.cid + IpfsRepo.repoSubtype.offChainMsgData.subDir;
            const lastScannedOffChainMsgEnvelope = docIpfsRepoScan ? docIpfsRepoScan.lastScannedFiles.offChainMsgData.envelope : null;
            const lastScannedOffChainMsgReceipt = docIpfsRepoScan ? docIpfsRepoScan.lastScannedFiles.offChainMsgData.receipt : null;
            let lastMsgEnvelope;
            let lastMsgReceipt;
            const docsRetrievedOffChainMsgDataToInsert = [];

            // noinspection DuplicatedCode
            await async.eachOf(scannedPaths, async (path, idx) => {
                let pathParts = path.substring(subtypeRootPath.length).split('/');
                pathParts.shift();
                pathParts = pathParts.map((part, idx) => {
                    let val = Number.parseInt(part);

                    // Make sure that month index is converted to zero-base
                    return idx === 1 ? val - 1 : val;
                });

                await async.parallel([
                    async () => {
                        // Scan off-chain message envelope files in path
                        lastMsgEnvelope = null;
                        let fileEntries;

                        try {
                            fileEntries = await this.ipfsClient.ls(path + IpfsRepo.offChainMsgDataRepo.msgEnvelope.subDir, false);
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

                        // noinspection DuplicatedCode
                        if (fileEntries) {
                            CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Scanned off-chain message envelope files', {
                                path: path + IpfsRepo.offChainMsgDataRepo.msgEnvelope.subDir,
                                fileEntries
                            });
                            if (idx === 0 && lastScannedOffChainMsgEnvelope) {
                                fileEntries = fileEntries.filter(fileEntry => fileEntry.name > lastScannedOffChainMsgEnvelope);
                                CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Filtered off-chain message envelope files', {
                                    lastScannedOffChainMsgEnvelope,
                                    fileEntries
                                });
                            }

                            const maxFileEntriesIdx = fileEntries.length - 1;

                            await async.eachOf(fileEntries, async (fileEntry, idx) => {
                                if (idx === maxFileEntriesIdx) {
                                    lastMsgEnvelope = fileEntry.name;
                                }

                                // Retrieve off-chain message envelope contents
                                const msgEnvelopeData = await this.ipfsClient.cat(fileEntry.cid);

                                // Save retrieved off-chain message envelope
                                const savedDate = dateFromPath(pathParts, IpfsRepo.offChainMsgDataRepo.msgEnvelope.filenamePrefix, fileEntry.name);

                                docsRetrievedOffChainMsgDataToInsert.push({
                                    ctnNodeIdx: ctnNodeIdx,
                                    cid: fileEntry.cid.toString(),
                                    data: new mongodb.Binary(msgEnvelopeData),
                                    dataType: ctnOffChainLib.OffChainData.msgDataType.msgEnvelope.name,
                                    savedDate: savedDate.date,
                                    savedMicroseconds: savedDate.microseconds,
                                    retrievedDate: repoRoot.refDate
                                });
                                CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Retrieved off-chain message envelope', {
                                    offChainMsgEnvelope: docsRetrievedOffChainMsgDataToInsert[docsRetrievedOffChainMsgDataToInsert.length - 1]
                                });
                            });
                        }
                    },
                    async () => {
                        // Scan off-chain message receipt files in path
                        lastMsgReceipt = null;
                        let fileEntries;

                        try {
                            fileEntries = await this.ipfsClient.ls(path + IpfsRepo.offChainMsgDataRepo.msgReceipt.subDir, false);
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

                        // noinspection DuplicatedCode
                        if (fileEntries) {
                            CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Scanned off-chain message receipt files', {
                                path: path + IpfsRepo.offChainMsgDataRepo.msgReceipt.subDir,
                                fileEntries
                            });
                            if (idx === 0 && lastScannedOffChainMsgReceipt) {
                                fileEntries = fileEntries.filter(fileEntry => fileEntry.name > lastScannedOffChainMsgReceipt);
                                CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Filtered off-chain message receipt files', {
                                    lastScannedOffChainMsgReceipt,
                                    fileEntries
                                });
                            }

                            const maxFileEntriesIdx = fileEntries.length - 1;

                            await async.eachOf(fileEntries, async (fileEntry, idx) => {
                                if (idx === maxFileEntriesIdx) {
                                    lastMsgReceipt = fileEntry.name;
                                }

                                // Retrieve off-chain message receipt contents
                                const msgReceiptData = await this.ipfsClient.cat(fileEntry.cid);

                                // Save retrieved off-chain message receipt
                                const savedDate = dateFromPath(pathParts, IpfsRepo.offChainMsgDataRepo.msgReceipt.filenamePrefix, fileEntry.name);

                                docsRetrievedOffChainMsgDataToInsert.push({
                                    ctnNodeIdx: ctnNodeIdx,
                                    cid: fileEntry.cid.toString(),
                                    data: new mongodb.Binary(msgReceiptData),
                                    dataType: ctnOffChainLib.OffChainData.msgDataType.msgReceipt.name,
                                    savedDate: savedDate.date,
                                    savedMicroseconds: savedDate.microseconds,
                                    retrievedDate: repoRoot.refDate
                                });
                                CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Retrieved off-chain message receipt', {
                                    offChainMsgEnvelope: docsRetrievedOffChainMsgDataToInsert[docsRetrievedOffChainMsgDataToInsert.length - 1]
                                });
                            });
                        }
                    }
                ]);
            });

            await async.parallel([
                async () => {
                    if (docsRetrievedOffChainMsgDataToInsert.length > 0) {
                        let result;
                        let docsInserted = false;

                        try {
                            result = await CtnOCSvr.db.collection.RetrievedOffChainMsgData.insertMany(docsRetrievedOffChainMsgDataToInsert, {ordered: false});
                        }
                        catch (err) {
                            if (err.name !== 'BulkWriteError') {
                                throw err;
                            }
                            else {
                                docsInserted = err.result.nInserted > 0;

                                err.result.getWriteErrors().forEach(writeError => {
                                    if (writeError.code === 11000) {
                                        // Duplicate key error. Log warning condition
                                        CtnOCSvr.logger.WARN('Retrieved off-chain message data already inserted onto local database.', writeError);
                                    }
                                    else {
                                        // Any other error. Log error condition
                                        CtnOCSvr.logger.ERROR('Error trying to insert retrieved off-chain message data onto local database.', writeError);
                                    }
                                });
                            }
                        }

                        if (result) {
                            docsInserted = result.insertedCount > 0;
                        }

                        if (docsInserted) {
                            // Notify clients that new off-chain message data has been retrieved
                            CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] About to send notification of new off-chain message data');
                            CtnOCSvr.clientNotifier.notifyNewOffChainMsgData();
                        }
                    }
                },
                async () => {
                    // Check if IPFS repo scan info needs to be saved/updated
                    if (!lastScannedPath || scannedPaths.length > 1 || lastMsgEnvelope || lastMsgReceipt) {
                        if (!docIpfsRepoScan) {
                            // Insert new IPFS repo scan database doc
                            await CtnOCSvr.db.collection.IpfsRepoScan.insertOne({
                                ctnNodeIdx: ctnNodeIdx,
                                repoSubtype: IpfsRepo.repoSubtype.offChainMsgData.name,
                                lastScannedPath: scannedPaths[scannedPaths.length - 1].substring(subtypeRootPath.length),
                                lastScannedFiles: {
                                    offChainMsgData: {
                                        envelope: lastMsgEnvelope,
                                        receipt: lastMsgReceipt
                                    }
                                }
                            });
                            CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Saved last scanned info', {
                                lastScannedPath: scannedPaths[scannedPaths.length - 1].substring(subtypeRootPath.length),
                                lastScannedFiles: {
                                    offChainMsgData: {
                                        envelope: lastMsgEnvelope,
                                        receipt: lastMsgReceipt
                                    }
                                }
                            });
                        }
                        else {
                            // Update IPFS repo scan database doc
                            const fieldsToUpdate = {};
                            const actualLastScannedPath = scannedPaths[scannedPaths.length - 1].substring(subtypeRootPath.length);

                            if (actualLastScannedPath === lastScannedPath) {
                                // Last scanned path did not change
                                if (scannedPaths.length !== 1) {
                                    CtnOCSvr.logger.WARN('Last scanned path that did not change is NOT the first scanned', {
                                        scannedPaths,
                                        lastScannedPath
                                    });
                                }

                                // Check for data file changes
                                if (lastMsgEnvelope && lastMsgEnvelope !== lastScannedOffChainMsgEnvelope) {
                                    fieldsToUpdate['lastScannedFiles.offChainMsgData.envelope'] = lastMsgEnvelope;
                                }

                                if (lastMsgReceipt && lastMsgReceipt !== lastScannedOffChainMsgReceipt) {
                                    fieldsToUpdate['lastScannedFiles.offChainMsgData.receipt'] = lastMsgReceipt;
                                }
                            }
                            else {
                                // A new last scanned path
                                if (scannedPaths.length === 1) {
                                    CtnOCSvr.logger.WARN('New last scanned path is the FIRST scanned path', {
                                        scannedPaths,
                                        lastScannedPath,
                                        actualLastScannedPath
                                    });
                                }

                                // Update path and data files as well
                                fieldsToUpdate.lastScannedPath = actualLastScannedPath;
                                fieldsToUpdate['lastScannedFiles.offChainMsgData.envelope'] = lastMsgEnvelope;
                                fieldsToUpdate['lastScannedFiles.offChainMsgData.receipt'] = lastMsgReceipt;
                            }

                            if (Object.keys(fieldsToUpdate).length > 0) {
                                await CtnOCSvr.db.collection.IpfsRepoScan.updateOne({
                                    _id: docIpfsRepoScan._id
                                }, {
                                    $set: fieldsToUpdate
                                });
                                CtnOCSvr.logger.DEBUG('>>>>>> [retrieveOffChainMsgData] Updated last scanned info', fieldsToUpdate);
                            }
                            else {
                                CtnOCSvr.logger.WARN('No fields to be updated for last scanned info', {
                                    lastScannedPath,
                                    lastMsgEnvelope,
                                    lastMsgReceipt,
                                    lastScannedOffChainMsgEnvelope,
                                    lastScannedOffChainMsgReceipt
                                });
                            }
                        }
                    }
                }
            ]);
        }
    };

    if (ctnNodeIdx === ctnNode.index) {
        // Local Catenis node. Execute code in critical section to serialize retrieval
        await this.retrieveLocalOCMsgDataCS.execute(async () => {
            await doRetrieval();
        });
    }
    else {
        // Any other Catenis node. Just do retrieval directly
        await doRetrieval();
    }
}

async function scanRepoPath(repoSubtype, rootCid, lastScannedPath) {
    const subtypeRootPath = rootCid + repoSubtype.subDir;
    let lastPathLevels = [];

    if (lastScannedPath) {
        lastPathLevels = lastScannedPath.split('/');
        lastPathLevels.shift();

        // Add root path to last scanned path
        lastScannedPath = subtypeRootPath + lastScannedPath;
    }

    const scannedPaths = [];

    const scan = async (path, level) => {
        if (level > repoSubtype.pathDepth) {
            scannedPaths.push(path);
        }
        else {
            let dirEntries = await this.ipfsClient.ls(path, false);

            if (lastScannedPath && lastScannedPath.startsWith(path)) {
                // Accept only dirs that are newer than last level dir
                dirEntries = dirEntries.filter(dirEntry => dirEntry.name >= lastPathLevels[level - 1]);
            }

            for (const dirEntry of dirEntries) {
                await scan(path + '/' + dirEntry.name, level + 1);
            }
        }
    };
    
    try {
        await scan(subtypeRootPath, 1);
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

IpfsRepo.initialize = async function () {
    CtnOCSvr.logger.TRACE('IpfsRepo initialization');
    CtnOCSvr.ipfsRepo = new IpfsRepo(CtnOCSvr.ipfsClient);

    await CtnOCSvr.ipfsRepo.finalizeInitialization();
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

IpfsRepo.offChainMsgDataRepo = Object.freeze({
    msgEnvelope: Object.freeze({
        subDir: '/msg',
        filenamePrefix: 'msg-'
    }),
    msgReceipt: Object.freeze({
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
    return {
        date: moment.utc(pathParts).add(Number.parseInt(filename.substring(filePrefix.length, filename.length - 3)), 'ms').toDate(),
        microseconds: Number.parseInt(filename.substring(filename.length - 3))
    };
}


// Module code
//
