/**
 * Created by claudio on 2019-11-20
 */

// Module variables
//

// References to external code
//
// Internal node modules
import util from 'util';
// Third-party node modules
import config from 'config';
import restifyClients from 'restify-clients';
import httpSignature from 'http-signature';
import Future from 'fibers/future';

// References code in other (Catenis Name Server) modules
import {CtnOCSvr} from './CtnOffChainSvr';
import {ctnNode} from './CtnNode';

// Config entries
const cnsClientConfig = config.get('cnsClient');

// Configuration settings
const cfgSettings = {
    connectTimeout: cnsClientConfig.get('connectTimeout'),
    requestTimeout: cnsClientConfig.get('requestTimeout'),
    hostFormat: cnsClientConfig.get('hostFormat'),
    headersToSign: cnsClientConfig.get('headersToSign')
};


// Definition of function classes
//

// CnsClient function class
export function CnsClient(cnsInstanceInfo) {
    this.cnsInstanceInfo = cnsInstanceInfo;
    this.client = new restifyClients.createJSONClient({
        connectTimeout: cfgSettings.connectTimeout,
        requestTimeout: cfgSettings.requestTimeout,
        retry: false,
        signRequest: httpSignRequest,
        url: assembleUrl(cnsInstanceInfo)
    });
    this.futGet = Future.wrap(this.client.get, true);
    this.futPost = Future.wrap(this.client.post, true);
    this.syncMethod = {
        get: (...args) => {
            return this.futGet.apply(this.client, args).wait();
        },
        post: (...args) => {
            return this.futPost.apply(this.client, args).wait();
        }
    }
}


// Public CnsClient object methods
//

CnsClient.prototype.getIpfsRepoRootCid = function (ctnNodeIdx, callback) {
    const endpointUrl = util.format('/ctn-node/%s/ipfs-root', ctnNodeIdx);

    if (typeof callback === 'function') {
        this.client.get(endpointUrl, (err, req, res, retData) => {
            callback(err, retData.data);
        });
    }
    else {
        const res = this.syncMethod.get(endpointUrl);

        return res[2].data;
    }
};

CnsClient.prototype.getAllIpfsRepoRootCids = function (updatedSince, callback) {
    let endpointUrl = '/ctn-node/ipfs-root';

    if (typeof updatedSince === 'function') {
        callback = updatedSince;
    }
    else if (updatedSince instanceof Date) {
        endpointUrl += '?updatedSince=' + updatedSince.toISOString();
    }

    if (typeof callback === 'function') {
        this.client.get(endpointUrl, (err, req, res, retData) => {
            callback(err, retData.data);
        });
    }
    else {
        const res = this.syncMethod.get(endpointUrl);

        return res[2].data;
    }
};

CnsClient.prototype.setIpfsRepoRootCid = function (ctnNodeIdx, cid, lastUpdatedDate, callback) {
    if (typeof lastUpdatedDate === 'function') {
        callback = lastUpdatedDate;
        lastUpdatedDate = undefined;
    }

    const data = {
        cid: cid
    };

    if (lastUpdatedDate) {
        data.lastUpdatedDate = lastUpdatedDate;
    }

    const endpointUrl = util.format('/ctn-node/%s/ipfs-root', ctnNodeIdx);

    if (typeof callback === 'function') {
        this.client.post(endpointUrl, data, (err, req, res, retData) => {
            callback(err);
        });
    }
    else {
        this.syncMethod.post(endpointUrl, data);
    }
};

// Arguments:
//  ctnNodeEntries: {
//    <ctnNodeIdx>: {
//      cid: [String],
//      lastUpdatedDate: [Date]
//    },
//    ...
//  }
CnsClient.prototype.setMultiIpfsRepoRootCid = function (ctnNodeEntries, callback) {
    const endpointUrl = '/ctn-node/ipfs-root';

    if (typeof callback === 'function') {
        this.client.post(endpointUrl, ctnNodeEntries, (err, req, res, retData) => {
            callback(err);
        });
    }
    else {
        this.syncMethod.post(endpointUrl, ctnNodeEntries);
    }
};


// Module functions used to simulate private CnsClient object methods
//  NOTE: these functions need to be bound to a CnsClient object reference (this) before
//      they are called, by means of one of the predefined function methods .call(), .apply()
//      or .bind().
//

/*function priv_func() {
}*/


// CnsClient function class (public) methods
//

/*CnsClient.class_func = function () {
};*/


// CnsClient function class (public) properties
//

//CnsClient.prop = {};


// Definition of module (private) functions
//

function assembleUrl(cnsInstanceInfo) {
    return 'http' + (cnsInstanceInfo.secure ? 's' : '') + '://' + util.format(cfgSettings.hostFormat, cnsInstanceInfo.idx, CtnOCSvr.app.domainRoot) + ':' + cnsInstanceInfo.port;
}

function httpSignRequest(req) {
    httpSignature.sign(req, {
        keyId: ctnNode.id,
        key: ctnNode.privKey,
        headers: cfgSettings.headersToSign
    });
}


// Module code
//
