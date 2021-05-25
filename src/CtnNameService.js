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
import _und from 'underscore';

// References code in other (Catenis Name Server) modules
import {CtnOCSvr} from './CtnOffChainSvr.js';
import {CnsClient} from './CnsClient.js';
import {ctnNode} from './CtnNode.js';
import {promDnsResolveTxt} from './Util.js';

// Config entries
const cnsConfig = config.get('ctnNameService');

// Configuration settings
const cfgSettings = {
    dnsRecName: cnsConfig.get('dnsRecName'),
    idPrefix: cnsConfig.get('idPrefix'),
    connDefaults: {
        port: cnsConfig.get('connDefaults.port'),
        secure: cnsConfig.get('connDefaults.secure')
    }
};


// Definition of function classes
//

// CtnNameService function class
export function CtnNameService() {
    this.curCNSIdx = undefined;
    this.initCNSIdx = undefined;
    this.cnsInstances = [];
    this.cnsConnection = undefined;

    Object.defineProperties(this, {
        maxIdx: {
            get: function () {
                // noinspection JSPotentiallyInvalidUsageOfThis
                return Math.max(this.cnsInstances.length - 1, this.initCNSIdx !== undefined ? this.initCNSIdx : 0);
            },
            enumerable: true
        },
        validIndices: {
            get: function () {
                // noinspection JSPotentiallyInvalidUsageOfThis
                return this.cnsInstances.reduce((idxs, value, idx) => {
                    if (value !== undefined) {
                        idxs.push(idx);
                    }

                    return idxs;
                }, []);
            },
            enumerable: true
        }
    });

    this.promiseInitInstanceChange = changeCnsInstance.call(this, true);
}


// Public CtnNameService object methods
//

CtnNameService.prototype.getIpfsRepoRootCid = async function () {
    return await callMethod.call(this, 'getIpfsRepoRootCid', ctnNode.index);
};

CtnNameService.prototype.getAllIpfsRepoRootCids = async function (updatedSince) {
    return await callMethod.call(this, 'getAllIpfsRepoRootCids', updatedSince);
};

CtnNameService.prototype.setIpfsRepoRootCid = async function (cid) {
    return await callMethod.call(this, 'setIpfsRepoRootCid', ctnNode.index, cid);
};


// Module functions used to simulate private CtnNameService object methods
//  NOTE: these functions need to be bound to a CtnNameService object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

async function changeCnsInstance(reset) {
    if (reset) {
        const newCNSInstances = await retrieveCNSInstances();

        if (newCNSInstances.length > 0) {
            this.cnsInstances = newCNSInstances;
        }
        else {
            CtnOCSvr.logger.WARN('Updated list of Catenis Name Server instances could not be retrieved. Using current list.');
        }
    }

    if (this.cnsInstances.length > 0) {
        if (this.curCNSIdx === undefined) {
            // Randomly choose a Catenis Name Server instance
            const validIndices = this.validIndices;
            this.initCNSIdx = this.curCNSIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
            this.cnsConnection = new CnsClient(this.cnsInstances[this.curCNSIdx]);
        }
        else {
            if (reset) {
                this.initCNSIdx = this.curCNSIdx;
            }

            const maxIdx = this.maxIdx;
            const incrIdx = function incrIdx(idx) {
                return (idx + 1) % (maxIdx + 1);
            };
            let found = false;

            for (let idx = incrIdx(this.curCNSIdx); idx !== this.initCNSIdx; idx = incrIdx(idx)) {
                if (this.cnsInstances[idx] !== undefined) {
                    this.curCNSIdx = idx;
                    found = true;
                    break;
                }
            }

            if (found) {
                this.cnsConnection = new CnsClient(this.cnsInstances[this.curCNSIdx]);
            }
            else {
                this.cnsConnection = this.curCNSIdx = undefined;
            }
        }

        return !!this.cnsConnection;
    }
    else {
        CtnOCSvr.logger.ERROR('Cannot get next Catenis Name Server instance info; no Catenis Name Server instances to be used.');
        throw new Error('No Catenis Name Server instances to be used.');
    }
}

async function callMethod(methodName) {
    let result;
    let error;
    let iterations = 0;
    let cnsInstancesReset = false;

    if (!this.cnsConnection) {
        await changeCnsInstance.call(this, true);
        cnsInstancesReset = true;
    }

    do {
        try {
            result = await this.cnsConnection[methodName].apply(this.cnsConnection, Array.prototype.slice.call(arguments, 1));
            error = undefined;
        }
        catch (err) {
            CtnOCSvr.logger.ERROR(util.format('Error trying to call Catenis Name Server (idx: %d) API method \'%s\'', this.curCNSIdx, methodName, err));
            error = err;
        }

        iterations++;
    }
    while (error && await changeCnsInstance.call(this, !cnsInstancesReset && iterations === 1));

    if (error) {
        CtnOCSvr.logger.ERROR(util.format('Failed to call Catenis Name Server API method \'%s\'', methodName));
        throw new Error('Failed to call Catenis Name Server API method');
    }

    return result;
}


// CtnNameService function class (public) methods
//

CtnNameService.initialize = async function () {
    CtnOCSvr.logger.TRACE('CtnNameService initialization');
    CtnOCSvr.cns = new CtnNameService();

    await CtnOCSvr.cns.promiseInitInstanceChange;
};


// CtnNameService function class (public) properties
//

//CtnNameService.prop = {};


// Definition of module (private) functions
//

async function retrieveCNSInstances() {
    const cnsInstances = [];
    let records;

    try {
        records = await promDnsResolveTxt(cfgSettings.dnsRecName + '.' + CtnOCSvr.app.domainRoot);
    }
    catch (err) {
        CtnOCSvr.logger.ERROR('Error retrieving Catenis Name Server instances.', err);
    }

    if (records) {
        records.forEach((chunks) => {
            const record = chunks.reduce((rec, chunk) => {
                return rec + chunk;
            }, '');

            // Try to parse it
            let cnsInstanceInfo;

            try {
                cnsInstanceInfo = JSON.parse(record);
            }
            catch (err2) {
            }

            if (isValidCnsInstanceInfo(cnsInstanceInfo)) {
                cnsInstances[cnsInstanceInfo.idx] = _und.defaults(cnsInstanceInfo, cfgSettings.connDefaults);
            }
        });
    }

    return cnsInstances;
}

function isValidCnsInstanceInfo(info) {
    return typeof info === 'object' && info !== null && Number.isInteger(info.idx) && info.idx >= 1
        && typeof info.pubKey === 'string'
        && (info.port === undefined || typeof info.port === 'number')
        && (info.secure === undefined || typeof info.secure === 'boolean');
}


// Module code
//
